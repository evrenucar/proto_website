// The settings panel, measured rather than eyeballed.
//
// From the tracker: "The settings menu doesn't look clean." Six things were
// measurably wrong on the panel this suite was written against, at 1200x900 on
// content/boards/test-board.html:
//
//   1. A field label computed to 16px/600 while a group heading computed to
//      15px/700, so "Developer mode" rendered larger than "Theme".
//   2. The vertical gaps down the first group were 12, 12, 0, 0px. Two toggles
//      sat flush against the row above them.
//   3. Right-aligned controls landed on five different x positions: 881.5 for
//      checkboxes (a user-agent margin), 884.5 for the colour swatches and the
//      grid select, 888.2 for the markdown select, plus two rows left-aligned.
//   4. The markdown-download select overhung the panel's content box by 3.7px.
//   5. The repository, branch and token fields were all 88px wide. The token
//      placeholder "github_pat_..." rendered clipped to "github_pa".
//   6. 1630px of content scrolled inside a 558px box while the panel title and
//      its Reset button scrolled out of reach after 40px.
//
// Every assertion below is on what a person sees: where things sit, whether
// text is cut off, whether the spacing is even, whether it is readable. None
// of them assert a class name or that a rule exists, because that is how this
// repo has shipped broken UI behind a green suite before.
//
// Two things this suite deliberately re-guards, because the panel is easy to
// break in these directions:
//   - The panel must scroll under the wheel and the board must not move while
//     it does. tests/board/overlay-wheel-scroll.test.mjs owns the routing rule;
//     this checks the outcome survives a layout change.
//   - Nothing may sit outside the panel, and the panel may not leave the
//     viewport, at 1440, 1024 and 390px.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4273;
const baseUrl = `http://127.0.0.1:${port}`;

// The same gutter tests/features/toolbar-panel-viewport-fit-e2e.test.mjs uses:
// a panel flush against the window edge reads as cut off.
const MIN_GUTTER = 8;
const WIDTHS = [1440, 1024, 390];

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

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

// Runs in the page. Contrast of two composited colours, WCAG 2.x relative
// luminance.
const CONTRAST_HELPERS = () => {
  window.__parse = (css) => (css.match(/[\d.]+/g) || []).map(Number);
  window.__over = (fg, bg) => {
    const a = fg.length > 3 ? fg[3] : 1;
    return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  };
  window.__ratio = (fg, bg) => {
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = (c) => 0.2126 * lin(c[0] / 255) + 0.7152 * lin(c[1] / 255) + 0.0722 * lin(c[2] / 255);
    const a = lum(fg);
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
};

let browser;
const failures = [];

async function openPanel(width, theme) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  // Autosave off before any page script runs, and the save endpoint blocked, so
  // a probe can never write to content/.
  await context.addInitScript((mode) => {
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({
        autosaveEnabled: false,
        autosaveSeconds: 20,
        devMode: false,
        theme: mode ? { mode } : undefined
      })
    );
  }, theme);
  const page = await context.newPage();
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".braindump-toolbar-shell", { timeout: 15000 });
  // Toolbar buttons carry a 200ms colour transition; a computed read lands
  // mid-tween otherwise.
  await page.addStyleTag({
    content: "*,*::before,*::after{transition:none!important;animation:none!important}"
  });
  if (!(await page.locator('[data-tool="settings"]').isVisible())) {
    await page.click('[data-board-ui="toolbar-more"]');
  }
  await page.click('[data-tool="settings"]');
  await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
  await page.waitForTimeout(250);
  return { context, page };
}

try {
  await waitForServer(child);
  browser = await chromium.launch();

  // --- A: nothing sits outside the panel, and the panel stays in the window --
  for (const width of WIDTHS) {
    const { context, page } = await openPanel(width, null);
    const measured = await page.evaluate(() => {
      const panel = document.getElementById("braindump-settings-panel");
      const cs = getComputedStyle(panel);
      const box = panel.getBoundingClientRect();
      const round = (n) => Math.round(n * 10) / 10;
      // The scrollable content box: inside the border, the scrollbar and the padding.
      const left = box.left + panel.clientLeft + parseFloat(cs.paddingLeft);
      const right = box.left + panel.clientLeft + panel.clientWidth - parseFloat(cs.paddingRight);
      const escaped = [];
      for (const el of panel.querySelectorAll("input, select, button, h2, h3, p, ul, .braindump-settings-label")) {
        const r = el.getBoundingClientRect();
        // Skip anything the user cannot see: the theme mode radios are
        // opacity:0 stand-ins behind their chips.
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).opacity === "0") continue;
        if (r.left < left - 0.5 || r.right > right + 0.5) {
          escaped.push({
            what: el.id || el.className || el.tagName,
            left: round(r.left),
            right: round(r.right)
          });
        }
      }
      return {
        panel: { left: round(box.left), right: round(box.right), top: round(box.top), bottom: round(box.bottom) },
        content: { left: round(left), right: round(right) },
        escaped,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });

    for (const item of measured.escaped) {
      failures.push(
        `A/${width}px: "${item.what}" sits outside the panel's content box ` +
          `[${measured.content.left}, ${measured.content.right}] at [${item.left}, ${item.right}]`
      );
    }
    if (measured.panel.left < MIN_GUTTER) {
      failures.push(`A/${width}px: the panel's left edge is at ${measured.panel.left}, inside the ${MIN_GUTTER}px gutter`);
    }
    if (measured.panel.right > width - MIN_GUTTER) {
      failures.push(`A/${width}px: the panel's right edge is at ${measured.panel.right}, past ${width - MIN_GUTTER}`);
    }
    if (measured.panel.top < 0 || measured.panel.bottom > 900) {
      failures.push(`A/${width}px: the panel spans ${measured.panel.top} to ${measured.panel.bottom} in a 900px window`);
    }
    if (measured.documentOverflow > 0) {
      failures.push(`A/${width}px: the open panel makes the page scroll horizontally by ${measured.documentOverflow}px`);
    }
    await context.close();
  }

  // --- B: the panel scrolls, the board stays put, and the header stays put ---
  {
    const { context, page } = await openPanel(1200, null);
    const camera = () => page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
    const scrollTop = () => page.evaluate(() => document.getElementById("braindump-settings-panel").scrollTop);

    const overflows = await page.evaluate(() => {
      const p = document.getElementById("braindump-settings-panel");
      return p.scrollHeight > p.clientHeight + 40;
    });
    if (!overflows) {
      failures.push("B: the panel is not taller than its box, so the scroll case proves nothing");
    }

    const before = await camera();
    const box = await page.locator("#braindump-settings-panel").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);

    if (!((await scrollTop()) > 0)) {
      failures.push("B: a wheel over the panel did not scroll it");
    }
    if ((await camera()) !== before) {
      failures.push("B: the board moved while the settings panel was being scrolled");
    }

    // The panel's own title and its Reset button are the only way back to a
    // known state. They used to scroll away 40px into a 1630px scroll.
    await page.evaluate(() => {
      document.getElementById("braindump-settings-panel").scrollTop = 99999;
    });
    await page.waitForTimeout(200);
    const headerAtBottom = await page.evaluate(() => {
      const panel = document.getElementById("braindump-settings-panel");
      const reset = document.getElementById("braindump-settings-reset");
      const title = panel.querySelector(".braindump-settings-title");
      const pr = panel.getBoundingClientRect();
      const inView = (el) => {
        const r = el.getBoundingClientRect();
        return r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5 && r.height > 0;
      };
      return { reset: inView(reset), title: inView(title) };
    });
    if (!headerAtBottom.title || !headerAtBottom.reset) {
      failures.push(
        `B: scrolled to the bottom, the panel title is ${headerAtBottom.title ? "visible" : "gone"} ` +
          `and Reset is ${headerAtBottom.reset ? "visible" : "gone"}. Both must stay reachable.`
      );
    }
    await context.close();
  }

  // --- C: alignment and rhythm are consistent, measured in real pixels -------
  {
    const { context, page } = await openPanel(1200, null);
    const layout = await page.evaluate(() => {
      const panel = document.getElementById("braindump-settings-panel");
      const cs = getComputedStyle(panel);
      const box = panel.getBoundingClientRect();
      const round = (n) => Math.round(n * 10) / 10;
      const contentLeft = box.left + panel.clientLeft + parseFloat(cs.paddingLeft);
      const contentRight = box.left + panel.clientLeft + panel.clientWidth - parseFloat(cs.paddingRight);

      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).opacity !== "0";
      };

      const labelLefts = [];
      for (const el of panel.querySelectorAll(".braindump-settings-label")) {
        if (visible(el)) labelLefts.push(round(el.getBoundingClientRect().left));
      }

      // Controls that sit at the end of their row, which is every checkbox,
      // colour swatch and select in the panel.
      const controlRights = [];
      for (const el of panel.querySelectorAll('input[type="checkbox"], input[type="color"], select')) {
        if (visible(el)) {
          controlRights.push({ what: el.id || el.type, right: round(el.getBoundingClientRect().right) });
        }
      }

      // Row-to-row gaps inside each group.
      const groups = [];
      for (const section of panel.querySelectorAll(".braindump-settings-section")) {
        const rows = Array.from(section.children).filter(visible);
        const gaps = [];
        for (let i = 1; i < rows.length; i += 1) {
          gaps.push(
            round(rows[i].getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().bottom)
          );
        }
        const heading = section.querySelector("h2, h3");
        groups.push({ name: heading ? heading.textContent.trim() : "(unnamed)", gaps });
      }

      // Every control a pointer or finger has to hit.
      const targets = [];
      for (const el of panel.querySelectorAll("input, select, button")) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        targets.push({ what: el.id || el.type || el.tagName, w: round(r.width), h: round(r.height) });
      }

      // Does each text field show its own placeholder without clipping? The
      // placeholder is the shortest realistic content the field was designed
      // for, so a field narrower than it is a field that cuts off real input.
      const clipped = [];
      for (const el of panel.querySelectorAll('input[type="text"], input[type="password"]')) {
        if (!visible(el) || !el.placeholder) continue;
        const original = el.value;
        el.value = el.placeholder;
        if (el.scrollWidth > el.clientWidth + 1) {
          clipped.push({ what: el.id, needs: el.scrollWidth, has: el.clientWidth });
        }
        el.value = original;
      }

      return {
        contentLeft: round(contentLeft),
        contentRight: round(contentRight),
        labelLefts: [...new Set(labelLefts)],
        controlRights,
        groups,
        targets,
        clipped
      };
    });

    if (layout.labelLefts.length !== 1) {
      failures.push(
        `C: field labels start at ${layout.labelLefts.length} different x positions ` +
          `(${layout.labelLefts.join(", ")}). They must share one left edge.`
      );
    } else if (Math.abs(layout.labelLefts[0] - layout.contentLeft) > 0.5) {
      failures.push(
        `C: labels start at ${layout.labelLefts[0]} but the panel's content box starts at ${layout.contentLeft}`
      );
    }

    const offRight = layout.controlRights.filter((c) => Math.abs(c.right - layout.contentRight) > 0.5);
    if (offRight.length > 0) {
      failures.push(
        `C: ${offRight.length} of ${layout.controlRights.length} row-end controls do not finish on the ` +
          `panel's content edge (${layout.contentRight}): ` +
          offRight.map((c) => `${c.what}@${c.right}`).join(", ")
      );
    }

    for (const group of layout.groups) {
      const distinct = [...new Set(group.gaps)];
      if (distinct.length > 1) {
        failures.push(
          `C: the "${group.name}" group uses ${distinct.length} different row gaps (${group.gaps.join(", ")}px). ` +
            "Spacing inside a group must be one value."
        );
      }
    }

    // WCAG 2.2 asks for 24px; the label around each toggle is already a much
    // larger hit area, so the floor here is only that a control is not a
    // 13px speck next to 34px neighbours.
    const tiny = layout.targets.filter((t) => t.w < 16 || t.h < 16);
    if (tiny.length > 0) {
      failures.push(
        "C: controls smaller than 16px: " + tiny.map((t) => `${t.what} ${t.w}x${t.h}`).join(", ")
      );
    }

    for (const field of layout.clipped) {
      failures.push(
        `C: "${field.what}" is ${field.has}px wide but needs ${field.needs}px to show its own placeholder`
      );
    }

    await context.close();
  }

  // --- D: every piece of text in the panel clears WCAG AA, in both modes -----
  for (const mode of ["dark", "light"]) {
    const { context, page } = await openPanel(1200, mode === "light" ? "light" : null);
    await page.evaluate(CONTRAST_HELPERS);
    const readings = await page.evaluate(() => {
      const panel = document.getElementById("braindump-settings-panel");
      // The panel's own background may be translucent, so compose it over the
      // board underneath before measuring anything against it.
      const board = window.__parse(getComputedStyle(document.querySelector(".braindump-viewport")).backgroundColor);
      const surface = window.__over(window.__parse(getComputedStyle(panel).backgroundColor), board);

      const seen = new Map();
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 1) {
            const el = child.parentElement;
            const cs = getComputedStyle(el);
            if (cs.opacity === "0" || cs.visibility === "hidden") continue;
            const key = cs.color;
            if (!seen.has(key)) {
              seen.set(key, {
                color: cs.color,
                size: parseFloat(cs.fontSize),
                weight: cs.fontWeight,
                sample: child.textContent.trim().slice(0, 34),
                ratio: Math.round(window.__ratio(window.__over(window.__parse(cs.color), surface), surface) * 100) / 100
              });
            }
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            walk(child);
          }
        }
      };
      walk(panel);
      return [...seen.values()];
    });

    if (readings.length === 0) {
      failures.push(`D/${mode}: found no text in the panel to measure`);
    }
    for (const reading of readings) {
      // 4.5:1 for body text. Nothing in this panel is large-scale text
      // (18.66px bold or 24px), so the relaxed 3:1 floor never applies.
      if (reading.ratio < 4.5) {
        failures.push(
          `D/${mode}: "${reading.sample}" at ${reading.size}px/${reading.weight} in ${reading.color} ` +
            `is ${reading.ratio}:1 against the panel, under the 4.5:1 AA floor`
        );
      }
    }
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  child.kill();
}

assert.deepEqual(failures, [], `the settings panel is not clean:\n  ${failures.join("\n  ")}`);

console.log(
  "settings panel layout: containment at 1440/1024/390, scrolling without moving the board, " +
    "a header that survives the scroll, one label edge and one control edge, even row gaps, " +
    "no clipped fields, and AA contrast in both modes"
);
