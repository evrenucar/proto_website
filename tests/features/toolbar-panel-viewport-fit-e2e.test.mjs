// Spawns a preview server and drives Chromium via Playwright.
//
// Guards the bottom toolbar and its three issue panels (recommend, feature request, bug report)
// against escaping the viewport. The shell is centred with `left: 50%` + `translateX(-50%)`, so
// once toolbar + open panel are wider than the window it hangs off BOTH edges at once. That is
// what happened between 1000px and ~1061px with a mouse: the mobile column layout only starts
// below 1000px (or at 1200px with a coarse pointer), so those widths fell between the two rules.
//
// The recommend panel is the one that matters: it carries the download / upload / commit route a
// visitor uses to send a suggestion back.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4208;
const baseUrl = `http://127.0.0.1:${port}`;

// A gutter is required, not just non-overflow: a panel flush against the window edge reads as cut off.
const MIN_GUTTER = 8;

const WIDTHS = [1440, 1280, 1200, 1100, 1061, 1024, 1000, 960, 768, 390];

const PANELS = [
  { id: "braindump-recommend-panel", tool: "recommend" },
  { id: "braindump-feature-panel", tool: "feature-request" },
  { id: "braindump-bug-panel", tool: "bug-report" }
];

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

let browser;
const failures = [];
let checks = 0;

try {
  await waitForServer(child);
  browser = await chromium.launch();

  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/cosmoboard.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".braindump-toolbar-shell", { timeout: 15000 });

    for (const panel of PANELS) {
      // Save and Recommend sit in the toolbar on desktop; everything else lives behind "more".
      const direct = page.locator(`.braindump-toolbar-action-desktop-only[data-tool='${panel.tool}']`);
      if ((await direct.count()) > 0 && (await direct.isVisible())) {
        await direct.click();
      } else {
        await page.locator("#braindump-toolbar-more").click();
        await page.locator(`.braindump-toolbar-actions [data-tool='${panel.tool}']`).click();
      }

      const measured = await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el || el.hidden) return null;
        const rect = el.getBoundingClientRect();
        const shell = document.querySelector(".braindump-toolbar-shell").getBoundingClientRect();
        const round = (n) => Math.round(n * 10) / 10;
        return {
          panelLeft: round(rect.left),
          panelRight: round(rect.right),
          panelWidth: round(rect.width),
          shellLeft: round(shell.left),
          shellRight: round(shell.right)
        };
      }, panel.id);

      assert.ok(measured, `${panel.tool} panel did not open at ${width}px`);

      checks += 1;
      const edges = [
        ["panel left", measured.panelLeft],
        ["shell left", measured.shellLeft]
      ];
      for (const [label, value] of edges) {
        if (value < MIN_GUTTER) {
          failures.push(`${width}px ${panel.tool}: ${label} at ${value}, under the ${MIN_GUTTER}px gutter`);
        }
      }
      const rightEdges = [
        ["panel right", measured.panelRight],
        ["shell right", measured.shellRight]
      ];
      for (const [label, value] of rightEdges) {
        if (value > width - MIN_GUTTER) {
          failures.push(
            `${width}px ${panel.tool}: ${label} at ${value}, past the ${width - MIN_GUTTER} limit`
          );
        }
      }

      // The panel must also stay usable, not merely inside the window.
      if (measured.panelWidth < 240) {
        failures.push(`${width}px ${panel.tool}: panel squeezed to ${measured.panelWidth}px`);
      }
    }

    // Nothing may create a horizontal scrollbar on the board page either.
    const scrollOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (scrollOverflow > 0) {
      failures.push(`${width}px: document scrolls horizontally by ${scrollOverflow}px`);
    }

    await context.close();
  }
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

assert.deepEqual(failures, [], `toolbar panels escaped the viewport:\n${failures.join("\n")}`);

console.log(`toolbar panel viewport fit: ${checks} panel measurements across ${WIDTHS.length} widths, all inside`);
