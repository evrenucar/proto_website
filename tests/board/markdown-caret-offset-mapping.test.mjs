// Spawns a preview server and drives Playwright.
//
// Verifies caret placement when clicking an *inactive* markdown line.
//
// A rendered line hides its markdown markers: `**bold**` shows as "bold", a list
// bullet is a synthetic span with no counterpart in the source. So a click has to
// be translated from a visible offset back into a raw offset before the line
// swaps into raw mode. This drives that whole path for real — set a line's raw
// text, let the editor render it, click on a specific rendered character, then
// read back where the caret actually landed in the raw string.
//
// The invariant: clicking just before visible character k must put the caret
// just before that same character in the raw text.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4203;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview server did not start")), 10000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`preview server exited early with code ${code}`));
    });
  });
}

const SAMPLES = [
  "plain text no markers",
  "a **bold** tail",
  "a *emphasis* tail",
  "a _emphasis_ tail",
  "call my_var_name now",
  "use `code` here",
  "see [docs](https://example.com) now",
  "## Heading with **bold** in",
  "- item with **bold** in",
  "> quoted with **bold** in",
  "**bold with `code` in**",
  // An empty list item renders as plain text, because the renderer's bullet rule
  // requires content after the marker. Real content on the braindump board.
  "    - ",
];

// Up to 6 caret positions per line, always including the first and last.
const MAX_PROBES = 6;

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  // This test rewrites a real line of a real note to drive the renderer, so it
  // must not be able to reach the disk. Disabling autosave is NOT enough on its
  // own: that setting gates the canvas save, while a committed line also
  // schedules a markdown sidecar save on its own path. Block both at the
  // network, which is the only guard that holds regardless of runtime changes.
  await context.route("**/api/save-*", (route) => route.abort());
  await context.addInitScript(() => {
    try {
      localStorage.setItem("board:braindump:settings", JSON.stringify({ autosaveEnabled: false }));
    } catch {}
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/braindump.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".bd-markdown-editor", { timeout: 15000 });

  // Park a markdown note in clear screen space, below the site nav, so real
  // clicks land on it. Two lines are needed: one under test, one to click away to.
  const ready = await page.evaluate(() => {
    const editors = Array.from(document.querySelectorAll(".bd-markdown-editor"));
    const ed = editors.find((e) => e.querySelectorAll(".bd-md-line").length >= 2);
    if (!ed) return { ok: false, reason: "no markdown editor with 2+ lines" };
    const item = ed.closest(".bd-item");
    const canvas = item.parentElement;
    const before = item.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(canvas).transform);
    canvas.style.transform =
      `translate(${m.e + (240 - before.x)}px, ${m.f + (260 - before.y)}px) scale(${m.a})`;
    window.__ed = ed;
    window.__item = item;
    return { ok: true, lineCount: ed.querySelectorAll(".bd-md-line").length };
  });
  assert.ok(ready.ok, `test fixture unavailable: ${ready.reason}`);

  const clickLine = async (idx) => {
    const pt = await page.evaluate((i) => {
      const l = window.__ed.querySelectorAll(".bd-md-line")[i];
      const r = l.getBoundingClientRect();
      return { x: r.x + 4, y: r.y + r.height / 2 };
    }, idx);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(120);
  };

  // Select the note once so subsequent clicks land inside the editor rather than
  // just selecting the node (entering a note takes two clicks).
  const itemPt = await page.evaluate(() => {
    const r = window.__item.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 8 };
  });
  await page.mouse.click(itemPt.x, itemPt.y);
  await page.waitForTimeout(120);

  const failures = [];
  const checked = [];

  for (const raw of SAMPLES) {
    // Put the sample on line 0, activate it, then click away so the editor's own
    // renderer draws it. Line 1 is scratch space we click to deactivate.
    await page.evaluate((raw) => {
      const lines = window.__ed.querySelectorAll(".bd-md-line");
      lines[0].dataset.raw = raw;
      lines[1].dataset.raw = "scratch";
    }, raw);
    await clickLine(0);
    await clickLine(1);

    const info = await page.evaluate(
      ({ raw, maxProbes }) => {
        const lineEl = window.__ed.querySelectorAll(".bd-md-line")[0];
        // Visible characters, skipping synthetic bullet/marker spans.
        const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) =>
            n.parentNode?.classList?.contains("bd-md-line-bullet")
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        });
        let visible = "";
        let node;
        while ((node = walker.nextNode())) visible += node.textContent;

        const n = visible.length;
        const probes = [];
        if (n > 0) {
          const count = Math.min(maxProbes, n);
          for (let i = 0; i < count; i++) {
            probes.push(count === 1 ? 0 : Math.round((i * (n - 1)) / (count - 1)));
          }
        }
        return {
          rendered: lineEl.className.includes("--active") === false,
          cls: lineEl.className,
          visible,
          probes: [...new Set(probes)],
        };
      },
      { raw, maxProbes: MAX_PROBES }
    );

    assert.ok(
      info.rendered,
      `line did not return to rendered state for ${JSON.stringify(raw)} (class ${info.cls})`
    );

    for (const k of info.probes) {
      const pt = await page.evaluate((k) => {
        const lineEl = window.__ed.querySelectorAll(".bd-md-line")[0];
        const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) =>
            n.parentNode?.classList?.contains("bd-md-line-bullet")
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        });
        let seen = 0;
        let node;
        while ((node = walker.nextNode())) {
          const len = node.textContent.length;
          if (k < seen + len) {
            const off = k - seen;
            const r = document.createRange();
            r.setStart(node, off);
            r.setEnd(node, off + 1);
            const rect = r.getBoundingClientRect();
            // Left fifth of the glyph, so the caret belongs before it.
            return { x: rect.x + rect.width * 0.2, y: rect.y + rect.height / 2 };
          }
          seen += len;
        }
        return null;
      }, k);

      if (!pt) continue;
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(120);

      const landed = await page.evaluate(() => {
        const lineEl = window.__ed.querySelectorAll(".bd-md-line")[0];
        const sel = window.getSelection();
        return {
          active: lineEl.className.includes("--active"),
          inLine: sel?.anchorNode ? lineEl.contains(sel.anchorNode) : false,
          offset: sel?.anchorOffset ?? -1,
          lineText: lineEl.textContent,
        };
      });

      const expectedChar = info.visible[k];
      const actualChar = landed.lineText[landed.offset];
      const record = {
        raw,
        visible: info.visible,
        k,
        expectedChar,
        offset: landed.offset,
        actualChar,
        active: landed.active,
        inLine: landed.inLine,
      };
      checked.push(record);
      if (!landed.active || !landed.inLine || actualChar !== expectedChar) failures.push(record);

      await clickLine(1);
    }
  }

  for (const f of failures) {
    console.error(
      `caret landed wrong\n  raw:     ${JSON.stringify(f.raw)}\n` +
        `  visible: ${JSON.stringify(f.visible)}\n` +
        `  clicked before visible[${f.k}] = ${JSON.stringify(f.expectedChar)}\n` +
        `  caret at raw offset ${f.offset} = ${JSON.stringify(f.actualChar)}` +
        `${f.active ? "" : "  (line never became active)"}` +
        `${f.inLine ? "" : "  (selection escaped the line)"}`
    );
  }

  assert.equal(
    failures.length,
    0,
    `${failures.length} of ${checked.length} caret probes landed on the wrong character`
  );

  console.log(`caret offset mapping: ${checked.length}/${checked.length} probes landed correctly`);
} finally {
  if (browser) await browser.close();
  child.kill();
}
