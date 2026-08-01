// Arrow keys pan the board when nothing is selected, accelerating while held
// up to a speed cap, and stay out of the way of everything that already owns
// the arrow keys: a selected YouTube embed (5s seeks, see
// tests/features/youtube-player-controls.test.mjs), and a caret inside a
// markdown note.
//
// Card: "When nothing is selected the arrow keys should serve to browser
// around the board. The longer you hold it the faster it should go but there
// should be a speed cap."
//
// Deliberately not asserted: that a keydown listener fired, or that some
// internal flag flipped. Every assertion here reads the actual camera
// (canvas.style.transform, the same thing the renderer uses to place every
// node on screen) or the actual DOM selection/focus, because a suite that
// asserts a mechanism has already gone green in this repo while the visible
// behaviour stayed broken.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4270;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview server did not start")), 15000);
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
  // Both probes sit right of x=232: the site's left sidebar nav (.sidenav)
  // floats above the board canvas for its whole 232px width and the full
  // viewport height, so anything placed under it is unclickable.
  nodes: [
    {
      id: "yt-pan-probe",
      type: "link",
      x: 900,
      y: 80,
      width: 480,
      height: 270,
      url: "https://www.youtube.com/watch?v=1CLEPpCOnoI",
      embedMode: "live",
      title: "arrow-pan YouTube probe",
    },
    {
      id: "md-pan-probe",
      type: "markdown",
      x: 320,
      y: 80,
      width: 420,
      height: 300,
      file: "/content/boards/test-board/arrow-pan-probe.md",
      href: "/content/boards/test-board/arrow-pan-probe.md",
      title: "arrow-pan markdown probe",
      _rawMarkdown: "first line of the note",
      markdownId: "cosmo-arrow-pan-probe",
      markdownUpdatedAt: "2026-08-01T00:00:00.000Z",
    },
    // A PLAIN node, and it is the load-bearing one for the selection gate.
    // The two probes above both make the keydown handler return before it ever
    // reaches the pan branch: the YouTube node is claimed by the seek handler,
    // and a note being typed into is caught by the text-field bail-out at the
    // top. So a suite that only used those two would assert the gate while
    // never executing it, which is exactly what happened: deleting the gate
    // outright left this suite green while a selected node no longer stopped
    // the pan. A text node is selected by a single click without entering edit
    // mode, so phase 2b below reaches the gate for real.
    {
      id: "plain-pan-probe",
      type: "text",
      x: 320,
      y: 430,
      width: 260,
      height: 120,
      text: "plain node for the selection gate",
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript(() => {
    // addInitScript runs in every same-origin frame, including the YouTube
    // iframe once it navigates same-origin during redirects. Only the top
    // document owns this board's storage.
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
  // Belt and braces against every write path a markdown edit or an autosave
  // could reach: the canvas save endpoint and the markdown sidecar save.
  await page.route("**/api/save-*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#yt-pan-probe", { timeout: 15000 });
  await page.waitForSelector("#md-pan-probe .bd-md-line", { timeout: 15000 });
  await page.waitForTimeout(150);

  // Camera read straight off the transform the renderer actually applies,
  // paired with the page's own clock so elapsed-time math isn't skewed by
  // CDP round-trip latency between Node and the browser.
  const camera = async () => page.evaluate(() => {
    const canvas = document.querySelector("#braindump-canvas");
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(canvas.style.transform);
    return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), t: performance.now() };
  });

  const selectedCount = () => page.evaluate(() => document.querySelectorAll(".bd-item.selected").length);

  const deselectAll = () => page.evaluate(() => {
    document.querySelectorAll(".bd-item.selected").forEach((el) => el.classList.remove("selected"));
    document.querySelectorAll(".bd-md-line--active").forEach((el) => el.classList.remove("bd-md-line--active"));
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur?.();
    window.getSelection()?.removeAllRanges();
  });

  const start = await camera();
  assert.equal(start.z, 1, "probe canvas pins the camera at z=1");
  assert.equal(await selectedCount(), 0, "fixture must start with nothing selected");

  // Phases 1 and 2 below run before the long panning hold in phase 3, while
  // the camera is still sitting at the fixture's exact starting position:
  // phase 3 deliberately drags the camera thousands of pixels away (that is
  // the feature), which would carry the YouTube and markdown probes off
  // screen for any click-based phase that ran after it.

  // ================================================================ phase 1
  // A selected YouTube embed still owns Left/Right for seeking; the camera
  // must not move at all.
  const ytHeaderBox = await page.locator("#yt-pan-probe .bd-embed-domain").boundingBox();
  assert.ok(ytHeaderBox, "expected the YouTube probe's embed header to be visible");
  await page.mouse.click(ytHeaderBox.x + ytHeaderBox.width / 2, ytHeaderBox.y + ytHeaderBox.height / 2);
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => document.querySelector("#yt-pan-probe")?.classList.contains("selected")),
    true,
    "clicking the embed header should select the YouTube node"
  );

  const beforeYt = await camera();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(120);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(120);
  const afterYt = await camera();
  assert.equal(afterYt.x, beforeYt.x, "camera x must not move while a YouTube node is selected");
  assert.equal(afterYt.y, beforeYt.y, "camera y must not move while a YouTube node is selected");

  // ================================================================ phase 2
  // Typing inside a markdown note: ArrowRight must move the caret, not pan
  // the board.
  await deselectAll();
  const lineBox = await page.locator("#md-pan-probe .bd-md-line").first().boundingBox();
  assert.ok(lineBox, "expected the markdown probe's first line to be visible");
  // Click near the very start of the line so the caret lands at (or close
  // to) offset 0, giving ArrowRight somewhere unambiguous to move it from.
  await page.mouse.click(lineBox.x + 2, lineBox.y + lineBox.height / 2);
  await page.waitForTimeout(120);

  const editingState = await page.evaluate(() => {
    const active = document.querySelector("#md-pan-probe .bd-md-line--active");
    const sel = window.getSelection();
    return {
      hasActiveLine: !!active,
      isEditableTarget: !!document.activeElement?.isContentEditable,
      caretOffset: sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : -1,
    };
  });
  assert.equal(editingState.hasActiveLine, true, "clicking the markdown line should activate it for editing");
  assert.equal(editingState.isEditableTarget, true, "the focused element should be the contentEditable body");

  const beforeType = await camera();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(120);
  const afterType = await camera();
  const caretAfter = await page.evaluate(() => {
    const sel = window.getSelection();
    return sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : -1;
  });

  assert.equal(afterType.x, beforeType.x, "camera x must not move while typing inside a note");
  assert.equal(afterType.y, beforeType.y, "camera y must not move while typing inside a note");
  assert.ok(caretAfter > editingState.caretOffset,
    `ArrowRight inside the note should move the caret forward, was ${editingState.caretOffset} now ${caretAfter}`);

  await deselectAll();

  // =============================================================== phase 2b
  // The card's headline condition, executed for real: "When nothing is
  // selected the arrow keys should serve to browser around the board". With a
  // PLAIN node selected the arrows must not pan.
  //
  // Phases 1 and 2 cannot prove this. Both return earlier in the keydown
  // handler than the pan branch, so with the gate deleted the suite still went
  // green while the camera moved 798px with a node selected. This phase uses a
  // text node, which a single click selects without entering edit mode, so the
  // handler actually reaches the gate.
  const plainBox = await page.locator("#plain-pan-probe").boundingBox();
  assert.ok(plainBox, "expected the plain text probe to be visible");
  await page.mouse.click(plainBox.x + plainBox.width / 2, plainBox.y + plainBox.height / 2);
  await page.waitForTimeout(150);
  assert.equal(await selectedCount(), 1, "2b: clicking the plain node must select exactly it");
  assert.equal(
    await page.evaluate(() => !!document.activeElement?.closest?.(".bd-item") && document.activeElement.isContentEditable),
    false,
    "2b: a single click must select the text node without entering edit mode, or this phase tests the wrong branch"
  );

  const beforePlain = await camera();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(80);
  const afterPlain = await camera();
  assert.equal(
    afterPlain.x, beforePlain.x,
    `2b: the camera must not move while a plain node is selected, moved ${(afterPlain.x - beforePlain.x).toFixed(1)}px`
  );
  assert.equal(afterPlain.y, beforePlain.y, "2b: nor vertically");

  await deselectAll();
  assert.equal(await selectedCount(), 0, "fixture should end with nothing selected before the pan phase");

  // ================================================================ phase 3
  // Hold ArrowRight through the whole ramp: nothing selected, so this should
  // move the camera, accelerate while held, and stop increasing once it
  // hits the cap. Runs last: it deliberately drags the camera thousands of
  // pixels away from the probes used above.
  const samples = [await camera()];
  await page.keyboard.down("ArrowRight");
  // Deltas between samples, not absolute times: 150ms in (early, still
  // ramping), then through to 900ms (the documented end of the ramp), then
  // two 400ms windows back to back well past it, to check the plateau.
  for (const wait of [150, 750, 400, 400]) {
    await page.waitForTimeout(wait);
    samples.push(await camera());
  }
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(50);
  const afterReleaseSettle = await camera();

  // --- the camera actually moves, and it moves the documented direction ---
  const panStart = samples[0];
  const last = samples[samples.length - 1];
  assert.ok(last.x < panStart.x - 20,
    `holding ArrowRight should move the camera, start.x=${panStart.x}, ended at ${last.x}`);
  assert.equal(last.y, panStart.y, "ArrowRight alone must not move the camera vertically");

  // --- acceleration: build (dx, dt) between consecutive samples and check ---
  // that speed measured late in the hold is well above speed measured at the
  // very start of the hold.
  const speeds = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    const dx = Math.abs(samples[i].x - samples[i - 1].x);
    speeds.push({ pxPerMs: dt > 0 ? dx / dt : 0, atMs: samples[i].t - panStart.t });
  }
  const earlySpeed = speeds[0].pxPerMs; // first ~150ms of the hold
  const lateSpeeds = speeds.filter((s) => s.atMs > 1000).map((s) => s.pxPerMs);
  assert.ok(lateSpeeds.length >= 2, "expected multiple samples once the hold has run past a second");
  const midHoldSpeed = Math.max(...lateSpeeds);
  assert.ok(midHoldSpeed > earlySpeed * 1.5,
    `speed late in a hold (${midHoldSpeed.toFixed(3)} px/ms) should clearly exceed the opening speed ` +
    `(${earlySpeed.toFixed(3)} px/ms): the longer the hold, the faster it should go`);

  // --- speed cap, asserted against the documented ceiling in absolute terms ---
  // This used to compare two adjacent 400ms windows and require a ratio under
  // 1.5. That cannot see an absent cap: unbounded linear acceleration across
  // two windows only 400ms apart is a ratio of about 1.31, so deleting the cap
  // entirely left this green while the board ran away at 7613 px/s. Measured,
  // not theorised.
  //
  // ARROW_PAN_MAX_SPEED is 2200 px/s = 2.2 px/ms. The 1.25 allowance covers
  // sampling error at window edges, not a second cap: an uncapped ramp is past
  // 3.8 px/ms by the end of this hold and past 7 px/ms shortly after, so the
  // margin is nowhere near wide enough to hide a missing cap.
  const CAP_PX_PER_MS = 2.2;
  const fastestWindow = Math.max(...speeds.map((s) => s.pxPerMs));
  assert.ok(
    fastestWindow <= CAP_PX_PER_MS * 1.25,
    `speed must never exceed the ${CAP_PX_PER_MS} px/ms cap, fastest window measured ${fastestWindow.toFixed(3)} px/ms ` +
    `across ${speeds.length} windows. A value far above this means the cap is gone, not that the ramp is steep.`
  );

  // And it must genuinely plateau rather than merely stay under the ceiling.
  const plateau = lateSpeeds.slice(-2);
  const plateauRatio = Math.max(plateau[0], plateau[1]) / Math.max(Math.min(plateau[0], plateau[1]), 0.001);
  assert.ok(plateauRatio < 1.5,
    `speed should plateau at a cap once the ramp is over, got windows ${plateau.map((v) => v.toFixed(3))} px/ms ` +
    `(ratio ${plateauRatio.toFixed(2)})`);

  // --- keyup stops the motion cleanly ---
  await page.waitForTimeout(300);
  const afterReleaseWait = await camera();
  assert.ok(Math.abs(afterReleaseWait.x - afterReleaseSettle.x) < 2,
    `camera must stop moving once ArrowRight is released, drifted from ${afterReleaseSettle.x} to ${afterReleaseWait.x}`);

  console.log("arrow-key-pan check passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
