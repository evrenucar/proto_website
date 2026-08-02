// Wheeling over a markdown note must still zoom the board.
//
// Reported from the tracker: "I still cant zoom in and out if im ontop of a
// markdown file (even if its not selected)."
//
// The rule was already written down and already had a suite: a note decides for
// itself whether a wheel scrolls its text or zooms the canvas, and an unselected
// note is supposed to zoom. What broke it was the settings-panel scroll fix,
// which routes a wheel to "the first element on the way up that can actually
// scroll". That walk checked for `.bd-item` inside the loop, so it only ever
// excluded nodes with nothing scrollable in them. A note long enough to overflow
// matched on its own body first and never reached its `.bd-item`, so the board
// stopped zooming over exactly the notes worth reading.
//
// markdown-wheel-routing did not catch it because it asserts on a synthetic
// event reaching the viewport, which it still did. This asserts the thing the
// user actually sees: whether the camera moves.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4237;
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();
  // The sandbox note is a real sidecar on disk; refuse both write paths.
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".bd-markdown-shell", { timeout: 20000 });

  const camera = () => page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
  const noteState = () => page.evaluate(() => {
    const shell = document.querySelector(".bd-markdown-shell");
    const item = shell.closest(".bd-item");
    const body = shell.querySelector(".bd-markdown-body") || shell;
    const r = body.getBoundingClientRect();
    return {
      id: item.id,
      selected: item.classList.contains("selected"),
      scrollTop: body.scrollTop,
      overflows: body.scrollHeight > body.clientHeight,
      centre: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    };
  });

  const start = await noteState();
  // Without overflow the note has nothing to scroll, the buggy branch is never
  // taken, and this suite would pass while proving nothing.
  assert.equal(start.overflows, true,
    "the sandbox note must overflow its box, or this suite cannot exercise the bug");
  assert.equal(start.selected, false, "the note must start unselected");

  // --- A: an unselected note lets the wheel zoom the board ---
  // This is the reported failure, and it is the whole point of the card.
  const beforeZoom = await camera();
  await page.mouse.move(start.centre.x, start.centre.y);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  assert.notEqual(await camera(), beforeZoom,
    "A: a wheel over an unselected markdown note must zoom the board");

  // --- B: it zooms both ways, not just in ---
  const beforeOut = await camera();
  const midway = await noteState();
  await page.mouse.move(midway.centre.x, midway.centre.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  assert.notEqual(await camera(), beforeOut,
    "B: wheeling the other way over an unselected note must zoom out");

  // --- C: a selected note keeps its own wheel, and actually scrolls ---
  // The note owning the wheel once you are working in it is the deliberate half
  // of the rule; the fix must not have flattened it into "nodes never scroll".
  const beforeClick = await noteState();
  await page.mouse.click(beforeClick.centre.x, beforeClick.centre.y);
  await page.waitForTimeout(400);
  const selected = await noteState();
  assert.equal(selected.selected, true, "C: clicking the note must select it");

  const cameraBeforeScroll = await camera();
  await page.mouse.move(selected.centre.x, selected.centre.y);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400);
  const scrolled = await noteState();
  assert.equal(await camera(), cameraBeforeScroll,
    "C: the board must not zoom while scrolling inside a selected note");
  assert.ok(scrolled.scrollTop > selected.scrollTop,
    `C: a selected note must scroll its own text, got ${scrolled.scrollTop} from ${selected.scrollTop}`);

  console.log("markdown wheel zoom: all 3 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
