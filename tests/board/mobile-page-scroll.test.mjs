// The page under a board must not scroll on a phone.
//
// From the user's card: "On mobile the board can randomly become scrollable up
// and down. which should be scroll shouldn't show up if I'm browsing around a
// canvas."
//
// What "randomly" turned out to be. Two things have to be true at once:
//
//   1. The document is taller than the visible viewport. `.page-board
//      .main-shell` and `.page-board .page-content` are `height: 100vh`, and on
//      a phone `100vh` is the LARGE viewport: the height you get once the URL
//      bar has scrolled away, not the height you can see while it is showing.
//      On Chrome for Android that gap is the 56 CSS px of the top bar, so a
//      board page is 56px taller than the screen for as long as the bar is up.
//   2. Something takes a finger drag and hands it to the document. The board's
//      own `.braindump-viewport` is `touch-action: none`, so panning the canvas
//      is safe, and the shortcuts card sets `overscroll-behavior: contain`, so
//      it is safe too. `.bd-markdown-body` and `.braindump-settings-panel` set
//      neither: flick past the end of a note, or past the end of the settings
//      panel, and the gesture chains straight into the document.
//
// `.page-board { overflow: hidden !important }` (CSS/braindump.css:4) was meant
// to stop this and never could. It sits on `body`, and body's overflow is only
// propagated to the viewport when the root element's own overflow is `visible`
// in BOTH axes. `CSS/site.css:7` sets `html { overflow-x: clip }`, so it is not,
// so the declaration has no effect on anything. The fix moves it to the root,
// scoped to board pages.
//
// The stand-in, and why. Playwright device emulation has no browser controls,
// so `100vh`, `100dvh` and `innerHeight` all resolve to the same number and
// condition 1 cannot arise on its own. The suite therefore sets that one
// number by hand, on the real `.main-shell`, to `innerHeight + 56` — the height
// its own `height: 100vh` produces on a phone with the bar showing — and
// changes nothing else. Every gesture below is a real CDP touch against the
// real runtime.
//
// Every case asserts window.scrollY, which is what the user sees move. Cases F
// and G exist so the suite cannot be satisfied by freezing the board or by
// locking the whole site: the camera has to still move, and evrenucar.com's
// other pages have to still scroll.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, devices } from "playwright";

const port = 4334;
const baseUrl = `http://127.0.0.1:${port}`;
// Chrome for Android's top bar, in CSS px. This is the whole of the bug: it is
// the difference between `100vh` and what you can see.
const URL_BAR_PX = 56;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

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

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [
    // Tall enough that its body scrolls internally on a phone, which is the
    // precondition for the overscroll chain in case C.
    {
      id: "scroll-note", type: "markdown", x: 20, y: 80, width: 320, height: 260,
      file: "content/boards/test-board/notes.md", title: "notes",
      _rawMarkdown: "# A long note\n\n"
        + Array.from({ length: 40 }, (_, i) => `Paragraph ${i}, with enough words in it to make this note run past its own box.`).join("\n\n"),
    },
    { id: "scroll-marker", type: "text", x: 900, y: 900, width: 120, height: 60, text: "far away" },
  ],
  edges: [],
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  await context.addInitScript(() => {
    // addInitScript runs in every same-origin frame; only the top one has the board.
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#scroll-note", { timeout: 15000 });
  await page.waitForTimeout(700);

  const cdp = await context.newCDPSession(page);

  // A one-finger drag, dispatched through CDP so the whole touch pipeline runs:
  // touch-action, the runtime's own listeners, and the browser's scroll
  // chaining. Returns window.scrollY at the end of the gesture, then puts the
  // document back so the next case starts clean.
  async function flick(x, y, dy) {
    const touch = (at) => ({ x, y: at, id: 1, radiusX: 14, radiusY: 14, force: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(y)] });
    for (let i = 1; i <= 14; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touch(y + (dy * i) / 14)],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(320);
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollTo(0, 0));
    return scrollY;
  }

  const geometry = () => page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollY: window.scrollY,
  }));
  const cameraTransform = () =>
    page.evaluate(() => document.querySelector(".braindump-canvas").style.transform || "");
  const cameraScale = () => page.evaluate(() => {
    const m = /scale\(([\d.]+)\)/.exec(document.querySelector(".braindump-canvas").style.transform || "");
    return m ? Number(m[1]) : 1;
  });

  // --- A: at rest, nothing on a board page reaches past the fold ---
  // The card's other half: if a new overlay ever adds document height, this is
  // the case that goes red, whatever the root's overflow says.
  const atRest = await geometry();
  assert.ok(
    atRest.scrollHeight <= atRest.innerHeight + 1,
    `A: a board page must not be taller than the screen, got scrollHeight ${atRest.scrollHeight} against innerHeight ${atRest.innerHeight}`
  );
  assert.equal(atRest.scrollY, 0, "A: a board page must load unscrolled");

  // From here on the document carries the height a phone gives it. See the
  // header: this is `.main-shell`'s own `height: 100vh`, evaluated the way
  // Chrome for Android evaluates it while the URL bar is up.
  await page.evaluate((bar) => {
    document.querySelector(".main-shell").style.height = `${window.innerHeight + bar}px`;
  }, URL_BAR_PX);
  await page.waitForTimeout(200);
  const stretched = await geometry();
  assert.equal(
    stretched.scrollHeight, stretched.innerHeight + URL_BAR_PX,
    `A: the phone-shaped document must be ${URL_BAR_PX}px taller than the screen for the rest of this suite, got ${stretched.scrollHeight} against ${stretched.innerHeight}`
  );

  // --- B: panning the board must move the board, not the page ---
  const beforePan = await cameraTransform();
  const scrollAfterPan = await flick(200, 600, -220);
  assert.equal(scrollAfterPan, 0,
    `B: panning the board with a finger must not scroll the page, got scrollY ${scrollAfterPan}`);
  assert.notEqual(await cameraTransform(), beforePan,
    "B: the pan must actually have moved the camera, or this case proves nothing");

  // --- C: flicking past the end of a note ---
  // The state the user hits by reading a note on a phone: the body scrolls, you
  // reach the bottom, you keep flicking, and the gesture chains to the document.
  const note = await page.evaluate(() => {
    const body = document.querySelector("#scroll-note .bd-markdown-body");
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    body.scrollTop = body.scrollHeight;
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      scrollable: body.scrollHeight > body.clientHeight + 1,
      parkedAtEnd: Math.round(body.scrollTop) > 0,
    };
  });
  assert.ok(note && note.scrollable && note.parkedAtEnd,
    `C: the note must scroll internally and be parked at its end, got ${JSON.stringify(note)}`);
  const scrollAfterNote = await flick(note.x, note.y, -260);
  assert.equal(scrollAfterNote, 0,
    `C: flicking past the end of a note must not scroll the page, got scrollY ${scrollAfterNote}`);

  // ...and the note must still scroll its own text, so the fix is not "nothing
  // moves any more".
  await page.evaluate(() => { document.querySelector("#scroll-note .bd-markdown-body").scrollTop = 0; });
  await flick(note.x, note.y, -150);
  const noteScrollTop = await page.evaluate(() =>
    Math.round(document.querySelector("#scroll-note .bd-markdown-body").scrollTop));
  assert.ok(noteScrollTop > 40,
    `C: the note must still scroll its own text, got scrollTop ${noteScrollTop}`);

  // --- D: flicking past the end of the settings panel ---
  await page.locator('[aria-label="More board actions"]').first().click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('[aria-label="Board settings"]').first().click({ force: true });
  await page.waitForTimeout(800);
  const settings = await page.evaluate(() => {
    const panel = document.querySelector(".braindump-settings-panel");
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    panel.scrollTop = panel.scrollHeight;
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      scrollable: panel.scrollHeight > panel.clientHeight + 1,
      parkedAtEnd: Math.round(panel.scrollTop) > 0,
    };
  });
  assert.ok(settings && settings.scrollable && settings.parkedAtEnd,
    `D: the settings panel must be open, scrollable and parked at its end, got ${JSON.stringify(settings)}`);
  const scrollAfterSettings = await flick(settings.x, settings.y, -240);
  assert.equal(scrollAfterSettings, 0,
    `D: flicking past the end of the settings panel must not scroll the page, got scrollY ${scrollAfterSettings}`);

  await page.evaluate(() => { document.querySelector(".braindump-settings-panel").scrollTop = 0; });
  await flick(settings.x, settings.y, -150);
  const settingsScrollTop = await page.evaluate(() =>
    Math.round(document.querySelector(".braindump-settings-panel").scrollTop));
  assert.ok(settingsScrollTop > 40,
    `D: the settings panel must still scroll its own content, got scrollTop ${settingsScrollTop}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // --- E: the shortcuts panel ---
  // Already immune, because it sets overscroll-behavior: contain. Here so it
  // stays that way, and so the suite covers the third overlay a phone can open.
  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(600);
  const shortcuts = await page.evaluate(() => {
    const card = document.querySelector(".bd-shortcuts-card");
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    card.scrollTop = card.scrollHeight;
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      parkedAtEnd: Math.round(card.scrollTop) > 0,
    };
  });
  assert.ok(shortcuts && shortcuts.parkedAtEnd,
    `E: the shortcuts panel must be open and parked at its end, got ${JSON.stringify(shortcuts)}`);
  const scrollAfterShortcuts = await flick(shortcuts.x, shortcuts.y, -240);
  assert.equal(scrollAfterShortcuts, 0,
    `E: flicking past the end of the shortcuts panel must not scroll the page, got scrollY ${scrollAfterShortcuts}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // --- F: the board still pinch-zooms ---
  // The freeze-detector. Anything that kills touch on the board wholesale
  // passes B through E and fails here.
  const zoomBefore = await cameraScale();
  const finger = (x, y, id) => ({ x, y, id, radiusX: 12, radiusY: 12, force: 1 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger(160, 600, 1)] });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger(160, 600, 1), finger(240, 640, 2)],
  });
  for (let i = 1; i <= 12; i++) {
    const spread = i * 6;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [finger(160 - spread, 600 - spread / 2, 1), finger(240 + spread, 640 + spread / 2, 2)],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(250);
  const zoomAfter = await cameraScale();
  assert.ok(zoomAfter > zoomBefore * 1.2,
    `F: the board must still pinch-zoom, went from ${zoomBefore.toFixed(3)} to ${zoomAfter.toFixed(3)}`);
  const scrollAfterPinch = await page.evaluate(() => window.scrollY);
  assert.equal(scrollAfterPinch, 0,
    `F: a pinch must not scroll the page either, got scrollY ${scrollAfterPinch}`);

  // --- G: the rest of the site still scrolls ---
  // The scoping guard. A board page must not be fixed by locking evrenucar.com.
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const site = await page.evaluate(() => ({
    isBoardPage: document.body.classList.contains("page-board"),
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  assert.equal(site.isBoardPage, false, "G: the landing page must not be a board page");
  assert.ok(site.scrollHeight > site.innerHeight + 100,
    `G: the landing page must have something to scroll, got ${site.scrollHeight} against ${site.innerHeight}`);
  const touch = (at) => ({ x: 200, y: at, id: 1, radiusX: 14, radiusY: 14, force: 1 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(600)] });
  for (let i = 1; i <= 14; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(600 - i * 20)] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
  const siteScrollY = await page.evaluate(() => window.scrollY);
  assert.ok(siteScrollY > 50,
    `G: the landing page must still scroll with a finger, got scrollY ${siteScrollY}`);

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log("mobile page scroll: all 7 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
