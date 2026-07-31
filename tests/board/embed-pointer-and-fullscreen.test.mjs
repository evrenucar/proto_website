// A live embed must not steal the board's navigation, and must open fullscreen.
//
// Two reports from the tracker, both about PDFs and both true of every embedded
// site:
//
//   1. "when I'm navigating around, if my cursor lands on pdf I can't zoom in or
//      out of it anymore or navigate with right-middle mouse click. It defaults
//      to scrolling the pdf which we don't want. Make sure that PDF can be
//      zoomed in out and navigated clicking on it only if its been clicked and
//      active (same also for websites that are embedded)."
//   2. "PDF's should have a fullscreen button on top right just like on the
//      markdown files."
//
// An iframe swallows the wheel and the pointer, so a cursor resting on one used
// to kill canvas zoom and middle-drag pan. The shield that already solved this
// for YouTube was gated behind an isYouTube check; it now covers every live
// embed, and hands the pointer over on the first click.
//
// Hermetic: the embed points at a page this same preview server serves, so the
// suite needs no internet and no PDF plugin.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4231;
const baseUrl = `http://127.0.0.1:${port}`;
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

// The board is served from disk, so the probe nodes are injected by
// intercepting the canvas request. Nothing on disk is touched, either way.
const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [
    {
      id: "embed-probe",
      type: "link",
      x: 220,
      y: 200,
      width: 760,
      height: 460,
      url: "/404.html",
      embedMode: "live",
      title: "Embedded site probe",
    },
    {
      // Far outside the viewport, so it stays a lazy placeholder and never
      // mounts an iframe. Its shield must stay out of the way.
      id: "embed-probe-far",
      type: "link",
      x: 26000,
      y: 26000,
      width: 600,
      height: 400,
      url: "/404.html",
      embedMode: "live",
      title: "Offscreen probe",
    },
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  // Autosave off before any page script runs. The probe nodes exist only in the
  // browser; an autosave would write them over the real sandbox canvas.
  await context.addInitScript(() => {
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  // Belt and braces: refuse the save endpoint outright.
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#embed-probe iframe.bd-embed-iframe").waitFor({ timeout: 20000 });

  const transform = () => page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
  const hitAt = (pt) => page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? String(el.className) : "none";
  }, pt);

  // The shield used to be built only for YouTube, so state that plainly before
  // measuring it: without this the suite dies on a null box instead of saying
  // what is wrong.
  assert.equal(await page.locator("#embed-probe .bd-embed-shield").count(), 1,
    "A: an embedded site must carry a shield, not just a video");

  const shieldBox = await page.locator("#embed-probe .bd-embed-shield").boundingBox();
  const centre = { x: shieldBox.x + shieldBox.width / 2, y: shieldBox.y + shieldBox.height / 2 };

  // --- A: the shield owns the pointer over a plain embedded site ---
  // Before this change the shield was only built for YouTube, so the mouse over
  // any other embed hit the iframe and the board lost the gesture.
  assert.match(await hitAt(centre), /bd-embed-shield/,
    "A: the shield must own the pointer over an embedded site before it is activated");

  // --- B: the first click hands the pointer to the embed and selects the node ---
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(250);
  assert.match(await hitAt(centre), /bd-embed-iframe/,
    "B: after the activating click the embed itself must be what the mouse hits");
  assert.equal(
    await page.evaluate(() => document.querySelector("#embed-probe").classList.contains("selected")),
    true,
    "B: clicking an embed must select its node"
  );

  // --- C: the shield re-arms once the cursor goes back to the canvas ---
  await page.mouse.move(80, 820);
  await page.waitForTimeout(300);
  assert.match(await hitAt(centre), /bd-embed-shield/,
    "C: the shield must take the pointer back when the cursor returns to the canvas");

  // --- D: no iframe, no shield ---
  // While a far-off embed is still the lazy "loads when nearby" placeholder,
  // a shield over it would block nothing but that card itself.
  assert.equal(
    await page.evaluate(() => {
      const far = document.querySelector("#embed-probe-far .bd-embed-shield");
      return far ? getComputedStyle(far).display : "missing";
    }),
    "none",
    "D: the shield must stay out of the way until a real iframe is mounted"
  );

  // --- E: the header is still directly clickable through the shield ---
  // The shield covers the shell, so the header only stays usable because it
  // stacks above it. If that breaks, every embed loses Preview, Open and
  // fullscreen at once.
  await page.click("#embed-probe .bd-embed-toggle-btn");
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(() => !!document.querySelector("#embed-probe .bd-bookmark-title")),
    true,
    "E: the header's Preview button must still switch the node back to a preview card"
  );

  // Back to live for the fullscreen case.
  await page.click("#embed-probe .bd-bookmark-live-btn");
  await page.locator("#embed-probe iframe.bd-embed-iframe").waitFor({ timeout: 20000 });

  // --- F: the fullscreen button opens the embed fullscreen, the second report ---
  assert.equal(
    await page.evaluate(() => !!document.querySelector("#embed-probe .bd-embed-fullscreen-btn")),
    true,
    "F: a live embed must carry a fullscreen button in its header"
  );
  await page.click("#embed-probe .bd-embed-fullscreen-btn");
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() =>
      !!document.fullscreenElement &&
      document.fullscreenElement === document.querySelector("#embed-probe .bd-link-shell")),
    true,
    "F: the fullscreen button must put the embed's own shell in fullscreen"
  );
  // The iframe must survive it. Re-parenting into an overlay would have torn
  // down its browsing context and reloaded it, losing a PDF's page position.
  assert.equal(
    await page.evaluate(() =>
      !!document.querySelector("#embed-probe .bd-link-shell .bd-embed-iframe")),
    true,
    "F: the embed must still be mounted inside the shell after going fullscreen"
  );
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false,
    "F: leaving fullscreen must put the embed back on the board");

  // --- G and H run last: they move the camera, which would carry the node out
  // of reach of every click above. ---

  // --- G: a wheel over the embed zooms the board, the first report ---
  const stillThere = await page.locator("#embed-probe .bd-embed-shield").boundingBox();
  const over = { x: stillThere.x + stillThere.width / 2, y: stillThere.y + stillThere.height / 2 };
  const beforeZoom = await transform();
  await page.mouse.move(over.x, over.y);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(250);
  assert.notEqual(await transform(), beforeZoom,
    "G: a wheel with the cursor over an embed must zoom the board, not scroll the embed");

  // --- H: middle-drag over the embed pans the board, the other half ---
  const beforePan = await transform();
  await page.mouse.move(over.x, over.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(over.x - 140, over.y - 90, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(250);
  assert.notEqual(await transform(), beforePan,
    "H: a middle-button drag starting over an embed must pan the board");

  console.log("embed pointer and fullscreen: all 8 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
