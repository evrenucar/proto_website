// YouTube player controls inside a board node.
//
// Two user-reported failures are pinned here:
//
//   1. "I can't skip around by clicking on the timeline." The wheel shield that
//      keeps canvas zoom and pan working over a video used to sit in front of
//      the player forever, turning every click into play/pause. The player never
//      saw a mouse at all, so it never even showed its control bar. The shield
//      now hands the pointer over on the first click and takes it back when the
//      cursor returns to the canvas.
//   2. "Arrow key skipping doesn't work." Seeking is relative to the playhead,
//      which the board learns from the IFrame Player API. The subscribe handshake
//      was sent once on iframe load, before the player was ready, and dropped, so
//      currentTime stayed 0 and every arrow key seeked from the start of the
//      video. The handshake now repeats until the player answers.
//
// Real network, real player: the assertions are about a live YouTube embed
// answering, so this suite needs internet access.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4212;
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

// The board is served from disk, so the probe node is injected by intercepting
// the canvas request. Nothing on disk is touched, in either direction.
const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [{
    id: "yt-controls-probe",
    type: "link",
    x: 300,
    y: 260,
    width: 900,
    height: 538,
    url: "https://www.youtube.com/watch?v=1CLEPpCOnoI",
    embedMode: "live",
    title: "YouTube controls probe",
  }],
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
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  // Autosave off before any page script runs. The probe node exists only in the
  // browser; an autosave would write it over the real sandbox canvas.
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

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "networkidle" });
  await page.locator("#yt-controls-probe iframe.bd-embed-iframe").waitFor({ timeout: 20000 });

  const playerState = () => page.evaluate(() =>
    ({ ...document.querySelector("#yt-controls-probe .bd-embed-iframe").__ytState }));
  const isPassthrough = () => page.evaluate(() =>
    document.querySelector("#yt-controls-probe .bd-embed-shield").classList.contains("is-passthrough"));

  const shieldBox = await page.locator("#yt-controls-probe .bd-embed-shield").boundingBox();
  const centre = { x: shieldBox.x + shieldBox.width / 2, y: shieldBox.y + shieldBox.height / 2 };

  // --- The embed URL asks for the API the rest of this file depends on. ---
  const src = new URL(await page.evaluate(() =>
    document.querySelector("#yt-controls-probe .bd-embed-iframe").src));
  assert.equal(src.searchParams.get("enablejsapi"), "1");
  assert.equal(src.searchParams.get("widgetid"), "1");

  // --- 1. The first click plays, selects the node, and hands over the pointer. ---
  await page.mouse.click(centre.x, centre.y);
  // Wait for a few seconds of real playback, so the pause below leaves a
  // playhead the arrow-key assertions can seek away from and back to.
  await page.waitForFunction(() => {
    const st = document.querySelector("#yt-controls-probe .bd-embed-iframe").__ytState;
    return st && st.duration > 0 && st.currentTime > 4;
  }, null, { timeout: 30000 });

  assert.equal(await isPassthrough(), true, "first click should hand the pointer to the player");
  assert.equal(
    await page.evaluate(() => document.querySelector("#yt-controls-probe").classList.contains("selected")),
    true,
    "clicking the video should select its node, so the keyboard shortcuts address this player"
  );

  // The handshake landing is the whole fix for arrow-key seeking: without a real
  // duration and currentTime, a seek has nothing to be relative to.
  const playing = await playerState();
  assert.equal(playing.duration > 200, true, `player should report its duration, got ${playing.duration}`);
  assert.equal(playing.playing, true, "the activating click should start playback");

  // The shield must actually be out of the way, not merely marked.
  const hitAtCentre = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.className : "none";
  }, centre);
  assert.match(hitAtCentre, /bd-embed-iframe/,
    `the player should be what the mouse hits, got "${hitAtCentre}"`);

  // --- 2. A second click is handled by the player itself. ---
  // Nothing in the board sends a pause here, so a pause is proof that a real
  // mouse click reached YouTube's own controls. That is the difference between
  // a scrubbable timeline and a dead one.
  await page.mouse.click(centre.x, centre.y);
  await page.waitForFunction(() =>
    document.querySelector("#yt-controls-probe .bd-embed-iframe").__ytState.playing === false,
    null, { timeout: 10000 });

  // --- 3. The shield comes back when the cursor returns to the canvas, ---
  // so wheel-zoom and drag-to-pan over a video keep working.
  await page.mouse.move(120, 940);
  await page.waitForTimeout(300);
  assert.equal(await isPassthrough(), false, "the shield should re-arm once the cursor leaves the video");
  const hitAfterRelease = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.className : "none";
  }, centre);
  assert.match(hitAfterRelease, /bd-embed-shield/,
    `the shield should own the pointer again, got "${hitAfterRelease}"`);

  // --- 4. Arrow keys seek relative to the playhead. ---
  // Two keyboards are in play and both are correct. Click into the video and it
  // holds focus, so YouTube's own shortcuts apply. Select the node without
  // clicking into the player (here by its embed header, as a rubber-band
  // selection would too) and the board forwards Space and the arrows, which is
  // the path this fix is about: it seeks relative to the playhead the player
  // reports, and used to seek from zero because the player never reported one.
  await page.mouse.click(shieldBox.x + shieldBox.width / 2, shieldBox.y - 16);
  await page.waitForTimeout(200);
  const focused = await page.evaluate(() => document.activeElement?.tagName || "");
  assert.notEqual(focused, "IFRAME", "selecting by the header should hand the keyboard back to the board");

  // The video is paused, so nothing drifts while we measure.
  const before = (await playerState()).currentTime;
  assert.equal(before > 1, true, `expected a real playhead before seeking, got ${before}`);

  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((t) =>
    document.querySelector("#yt-controls-probe .bd-embed-iframe").__ytState.currentTime > t + 3,
    before, { timeout: 10000 });
  const forward = (await playerState()).currentTime;
  assert.equal(Math.abs(forward - (before + 5)) < 1.5, true,
    `ArrowRight should seek 5s forward from ${before.toFixed(2)}s, landed at ${forward.toFixed(2)}s`);

  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction((t) =>
    document.querySelector("#yt-controls-probe .bd-embed-iframe").__ytState.currentTime < t - 3,
    forward, { timeout: 10000 });
  const back = (await playerState()).currentTime;
  assert.equal(Math.abs(back - (forward - 5)) < 1.5, true,
    `ArrowLeft should seek 5s back from ${forward.toFixed(2)}s, landed at ${back.toFixed(2)}s`);

  // --- 5. Space still toggles playback from the board. ---
  await page.keyboard.press("Space");
  await page.waitForFunction(() =>
    document.querySelector("#yt-controls-probe .bd-embed-iframe").__ytState.playing === true,
    null, { timeout: 10000 });

  console.log("youtube player controls check passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
