// The embed header shows the real address, and a video remembers where you got to.
//
// Two reports from the board, in the user's own words:
//
//   1. "On top of a youtube video there is a youtube.com link displayed. That
//      should be the actual link of the video and it should be selectable. By
//      double clicking the link it should automatically copy it to your
//      clipboard."
//   2. "For youtube videos. It should remember where I left off on the video and
//      start it there."
//
// The header used to render only the hostname, so every video on a board read
// "www.youtube.com" and none of them said which video. Playback position was
// tracked on the live iframe (`__ytState`) and never written to the node, so it
// died with every re-render, reload and lazy unload.
//
// Hermetic, including the playhead being written on pause. youtube.com is
// blocked outright: most assertions here are about markup this board produces
// (the header text, the embed src it builds), and the one part that needs a
// player to answer is driven by a stub page instead. The runtime matches player
// messages by contentWindow, so a local iframe posting the same IFrame Player
// API payloads is indistinguishable from the real thing at the point that
// matters, and the suite stays offline and fast.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4232;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

const WATCH_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

// A stand-in for the YouTube player. It speaks the two IFrame Player API
// messages the runtime actually reads, so the playhead path can be driven
// without the network. The board matches messages by contentWindow, not by
// origin, so this reaches exactly the same handler the real player does.
const STUB_PLAYER = `<!doctype html><meta charset="utf-8"><title>stub player</title>
<body style="margin:0;background:#181818;color:#888;font:12px sans-serif">stub player
<script>
  var post = function (payload) { parent.postMessage(JSON.stringify(payload), "*"); };
  window.report = function (currentTime, duration) {
    post({ event: "infoDelivery", info: { currentTime: currentTime, duration: duration, playerState: 1 } });
  };
  window.pause = function () { post({ event: "onStateChange", info: 2 }); };
  post({ event: "readyToListen" });
</script>`;

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

// Probe nodes are injected by intercepting the canvas request, so nothing on
// disk is touched in either direction.
const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [
    { id: "yt-plain", type: "link", x: 120, y: 120, width: 480, height: 300, url: WATCH_URL, embedMode: "live" },
    // Where this viewer stopped watching.
    { id: "yt-resume", type: "link", x: 640, y: 120, width: 480, height: 300, url: WATCH_URL, embedMode: "live", youtubeResumeSeconds: 137 },
    // A link pasted with the author's own timestamp and nothing remembered.
    { id: "yt-linktime", type: "link", x: 120, y: 460, width: 480, height: 300, url: `${WATCH_URL}&t=90`, embedMode: "live" },
    // Both: what this viewer did beats what the link suggested.
    { id: "yt-both", type: "link", x: 640, y: 460, width: 480, height: 300, url: `${WATCH_URL}&t=90`, embedMode: "live", youtubeResumeSeconds: 137 },
    // Drives the playhead path through a player that answers.
    { id: "yt-stub", type: "link", x: 120, y: 800, width: 480, height: 300, url: "/stub-player.html", embedMode: "live" },
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
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  await context.addInitScript(() => {
    // Top frame only. The stub player is served from this same origin, so it
    // shares localStorage, and an init script that runs in it too would wipe the
    // board's local save the moment the embed mounted.
    if (window.top !== window) return;
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
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  // No real player needed, and no reason to hit the network for one.
  await page.route("**://*.youtube.com/**", (route) => route.abort());
  await page.route("**/stub-player.html*", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: STUB_PLAYER }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#yt-plain .bd-embed-domain").waitFor({ timeout: 20000 });

  const srcOf = (id) => page.evaluate((n) =>
    document.querySelector(`#${n} .bd-embed-iframe`)?.getAttribute("src") || "", id);
  const startOf = async (id) => new URL(await srcOf(id)).searchParams.get("start");

  // --- A: the header carries the real address, not just the host ---
  const shown = await page.textContent("#yt-plain .bd-embed-domain");
  assert.equal(shown.trim(), WATCH_URL,
    `A: the header must show the video's own address, got "${shown.trim()}"`);
  assert.notEqual(shown.trim(), "www.youtube.com", "A: the bare hostname is the old behaviour");

  // --- B: it is selectable text, and says so ---
  const style = await page.evaluate(() => {
    const el = document.querySelector("#yt-plain .bd-embed-domain");
    const cs = getComputedStyle(el);
    return { pointerEvents: cs.pointerEvents, userSelect: cs.userSelect || cs.webkitUserSelect, cursor: cs.cursor };
  });
  assert.equal(style.pointerEvents, "auto", "B: the address must receive the pointer to be selectable");
  assert.equal(style.userSelect, "text", "B: the address must be selectable text");
  assert.equal(style.cursor, "text", "B: the cursor must say the address is text");

  // --- C: double-clicking selects it and copies it ---
  await page.dblclick("#yt-plain .bd-embed-domain");
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, WATCH_URL, `C: double-click must put the address on the clipboard, got "${clip}"`);
  // "It should be selectable" has to be visibly true, not just true of the
  // clipboard. The node drag handler suppresses the browser's own selection on
  // mousedown, so the double-click makes the selection itself.
  const selected = await page.evaluate(() => window.getSelection().toString());
  assert.equal(selected, WATCH_URL,
    `C: double-click must leave the address visibly selected, got "${selected}"`);

  // --- D: dragging the node by the address still moves it ---
  // For a live embed the header is the ONLY drag handle, because the shield
  // below it swallows mousedown. Making the address swallow mousedown too (so
  // it could be swept with the mouse) left a 7px grab gap on a 480px node and
  // effectively stranded it. Dragging wins; the double-click above is what
  // selects and copies. This asserts the trade stayed made.
  const before = await page.evaluate(() => {
    const el = document.querySelector("#yt-plain");
    return { left: el.style.left, top: el.style.top };
  });
  const addrBox = await page.locator("#yt-plain .bd-embed-domain").boundingBox();
  const from = { x: addrBox.x + addrBox.width / 2, y: addrBox.y + addrBox.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const el = document.querySelector("#yt-plain");
    return { left: el.style.left, top: el.style.top };
  });
  assert.notDeepEqual(after, before,
    "D: dragging a live embed by its address must still move the node, or it has no drag handle left");

  // --- E: a remembered playhead reaches the player ---
  assert.equal(await startOf("yt-plain"), null, "E: a video with nothing remembered must start at the beginning");
  assert.equal(await startOf("yt-resume"), "137", "E: a remembered playhead must become the embed's start");

  // --- F: the link's own timestamp still works, and loses to what you watched ---
  assert.equal(await startOf("yt-linktime"), "90",
    "F: a link pasted with ?t=90 must still open at 90 when nothing is remembered");
  assert.equal(await startOf("yt-both"), "137",
    "F: where you stopped must beat the timestamp the link was pasted with");

  // --- G: pausing writes the playhead onto the node, where a save can see it ---
  // This is the whole feature. __ytState on the live iframe is thrown away by
  // every re-render, reload and lazy unload, so "remember where I left off" only
  // means anything once the number reaches the node model.
  await page.locator("#yt-stub iframe.bd-embed-iframe").scrollIntoViewIfNeeded().catch(() => {});
  await page.locator("#yt-stub iframe.bd-embed-iframe").waitFor({ timeout: 20000 });
  // The local save is the honest witness: it is serializeState's own output, so
  // reading it proves the number both reached the node model and survived
  // serialization, rather than only living on the DOM iframe.
  const savedResume = (id) => page.evaluate((n) => {
    const raw = localStorage.getItem("board:test-board");
    if (!raw) return "unsaved";
    const node = (JSON.parse(raw).nodes || []).find((x) => x.id === n);
    return node ? (node.youtubeResumeSeconds ?? null) : "no-node";
  }, id);

  const beforeWatching = await savedResume("yt-stub");
  assert.notEqual(typeof beforeWatching, "number",
    `G: nothing may be remembered before anything is watched, got ${JSON.stringify(beforeWatching)}`);

  await page.evaluate(() => {
    document.querySelector("#yt-stub iframe.bd-embed-iframe").contentWindow.report(42.7, 300);
  });
  await page.waitForTimeout(250);
  // Localise a failure: if the report never reaches __ytState the problem is the
  // message path, not the remembering.
  assert.equal(
    await page.evaluate(() => document.querySelector("#yt-stub iframe.bd-embed-iframe").__ytState?.currentTime ?? "no-state"),
    42.7,
    "G: the player's report must reach the live state first"
  );
  await page.evaluate(() => {
    document.querySelector("#yt-stub iframe.bd-embed-iframe").contentWindow.pause();
  });
  // The local save is debounced by 400ms.
  await page.waitForTimeout(800);
  assert.equal(await savedResume("yt-stub"), 42,
    "G: pausing must leave the playhead on the node, in whole seconds");

  // --- H: a video watched to the end forgets where it was ---
  // Resuming two seconds from the end drops you on the credits with no way back
  // but a manual seek, which is worse than starting over.
  await page.evaluate(() => {
    const w = document.querySelector("#yt-stub iframe.bd-embed-iframe").contentWindow;
    w.report(299.5, 300);
    w.pause();
  });
  await page.waitForTimeout(800);
  assert.equal(await savedResume("yt-stub"), 0,
    "H: finishing a video must clear the remembered playhead, not pin it to the credits");

  console.log("youtube url and resume: all 8 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
