// A wheel inside a scrollable overlay belongs to that overlay.
//
// Reported from the tracker: "When in settings if I try to scroll it zooms in
// and out on the board. I should be able to scroll inside settings." The
// toolbar and its panels live inside the viewport, and the viewport's wheel
// handler called preventDefault on everything that reached it, so the settings
// panel could never scroll even though it is taller than its own max-height.
//
// The rule now: on the way up from the wheel's target, the first element that
// can actually scroll gets the wheel. Board nodes are excluded on purpose, since
// a note decides for itself whether a wheel scrolls its text or zooms the
// canvas, and that is pinned by markdown-wheel-routing.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4218;
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

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript(() => {
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-title", { timeout: 15000 });

  const transform = () => page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
  const panelScrollTop = () => page.evaluate(() =>
    document.querySelector("#braindump-settings-panel").scrollTop);

  // The gear hides behind the "more" disclosure at this width, as it does for a user.
  if (!(await page.locator('[data-tool="settings"]').isVisible())) {
    await page.click('[data-board-ui="toolbar-more"]');
  }
  await page.click('[data-tool="settings"]');
  await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });

  const panel = page.locator("#braindump-settings-panel");
  const box = await panel.boundingBox();
  const overflows = await page.evaluate(() => {
    const p = document.querySelector("#braindump-settings-panel");
    return p.scrollHeight > p.clientHeight;
  });
  assert.equal(overflows, true, "the settings panel must be taller than its box, or this proves nothing");

  // --- A: a wheel over the panel scrolls the panel and leaves the camera alone ---
  const cameraBefore = await transform();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);

  assert.ok(await panelScrollTop() > 0, "A: the wheel must scroll the settings panel");
  assert.equal(await transform(), cameraBefore, "A: the board must not zoom while scrolling the panel");

  // --- B: scrolling back up works too, and still never reaches the camera ---
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  assert.equal(await panelScrollTop(), 0, "B: the panel must scroll back to the top");
  assert.equal(await transform(), cameraBefore, "B: the board must still not have zoomed");

  // --- C: the canvas itself still zooms ---
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.mouse.move(300, 250);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(300);
  assert.notEqual(await transform(), cameraBefore, "C: a wheel over the empty canvas must still zoom");

  console.log("overlay wheel scroll: all 3 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
