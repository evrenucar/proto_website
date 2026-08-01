// Drawing smoothness, and the developer-mode harness that lets the pen be tuned
// by feel instead of by argument.
//
// The card: "Current drawing draws in segments as you drag along. Performance is
// good but smoothness and feel leaves a lot to desire. Can we improve this
// without breaking other drawing features and retaining performance and how much
// space and memory the drawings take up. Maybe we can for now in developer mode
// have some options for the drawing for me to test with sliders and I can let you
// know what feels best."
//
// So the primary deliverable is the sliders, and the assertions below are about
// what a stroke IS after they move, never about which listener fired:
//
//   A  moving the thinning slider, with no reload, makes the very next stroke
//      through the identical pointer path store measurably fewer points, and the
//      overlay's own point readout agrees with the stroke on the board.
//   B  fidelity: every pointer position the hand passed through is within a few
//      pixels of the stored polyline. This is the assertion that catches the
//      failure mode the brief names: emitting Q or C control points would leave
//      parseDrawingPathPoints reading control points as vertices, and the stored
//      path would visibly leave the hand's path.
//   C  the eraser still cuts a smoothed, curve-fitted stroke into TWO nodes with
//      a real gap and both ends surviving.
//   D  shift-snap still bakes a dead-straight segment on the end of a freehand
//      stroke, measured on the stored stroke.
//   E  storage: no stored coordinate carries more than two decimals, and the
//      arrow keys that drive a focused slider do not also pan the board.
//
// What this file deliberately does NOT prove: that getCoalescedEvents() is used.
// Playwright's synthetic mouse dispatches one real sample per move, so
// getCoalescedEvents() returns a one-element list and the batch branch is never
// taken. Asserting the toggle exists would be a mechanism assertion, so the
// toggle is only checked for persistence. See notes.md.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

// 4249 was taken by tests/board/toolbar-arrangement.test.mjs while this file was
// being written. Two suites on one port is either EADDRINUSE or, worse, a suite
// talking to another suite's server.
const port = 4253;
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

// An empty board pinned at z=1, so every stroke on it is one this file drew.
const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [],
  edges: []
};

function pointsFrom(d) {
  const numbers = (String(d || "").match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return points;
}

// Distance from p to the segment ab, so "how far did the ink stray from where
// the hand went" is measured against the drawn line and not against a vertex.
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function distanceToPolyline(p, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(p, points[i], points[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

// A wobbly path in canvas units: a long sweep with a real curve in it, so a
// polyline through raw samples and a fitted curve are distinguishable.
function wobblePath(y0) {
  const path = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96;
    path.push({ x: 380 + t * 620, y: y0 + Math.sin(t * Math.PI * 2.2) * 55 });
  }
  return path;
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    // addInitScript runs in every same-origin frame. Only the top document owns
    // this board's storage.
    if (window.top !== window) return;
    // It also runs again on every navigation, including phase G's reload. Seed
    // once and then leave storage alone, or the reload check would be testing
    // this line and not the board: rewriting the settings key on the way back in
    // wipes exactly the tuning the reload is supposed to restore.
    if (localStorage.getItem("board:test-board:settings")) return;
    localStorage.setItem(
      "board:test-board:settings",
      // No drawTuning key on purpose: the board must fall back to its shipped
      // defaults, which is what the user will meet.
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: true })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    localStorage.removeItem("board:test-board:brush");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tool="draw"]', { timeout: 15000 });
  await page.waitForTimeout(200);

  const camera = async () => page.evaluate(() => {
    const viewport = document.querySelector("#braindump-viewport");
    const canvas = document.querySelector("#braindump-canvas");
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(canvas.style.transform);
    const rect = viewport.getBoundingClientRect();
    return { left: rect.left, top: rect.top, x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
  });

  const cam = await camera();
  assert.equal(cam.z, 1, "setup: the probe canvas must pin the camera at z=1");
  const sx = (x) => cam.left + cam.x + x * cam.z;
  const sy = (y) => cam.top + cam.y + y * cam.z;

  const strokes = async () => page.evaluate(() =>
    Array.from(document.querySelectorAll(".bd-item"))
      .filter((el) => el.querySelector("svg.bd-drawing"))
      .map((el) => ({ id: el.id, d: el.querySelector("path")?.getAttribute("d") || null })));

  // The local save is debounced by 400ms, so this polls instead of guessing a
  // timeout. Reading the serialized model and not the DOM is the point: it is
  // the stored bytes the card's "how much space do drawings take" is about.
  const storedStrokeText = async (id) => {
    const read = () => page.evaluate((nodeId) => {
      const state = JSON.parse(localStorage.getItem("board:test-board") || "{}");
      return (state.nodes || []).find((node) => node.id === nodeId)?.text || "";
    }, id);
    for (let i = 0; i < 25; i++) {
      const text = await read();
      if (text) return text;
      await page.waitForTimeout(120);
    }
    return read();
  };

  // Drives the real pointer through a canvas-unit path and returns the one new
  // stroke node it produced.
  const drawPath = async (canvasPoints) => {
    const known = new Set((await strokes()).map((s) => s.id));
    await page.mouse.move(sx(canvasPoints[0].x), sy(canvasPoints[0].y));
    await page.mouse.down();
    for (const point of canvasPoints.slice(1)) {
      await page.mouse.move(sx(point.x), sy(point.y));
    }
    await page.mouse.up();
    await page.waitForTimeout(160);
    const fresh = (await strokes()).filter((s) => !known.has(s.id));
    assert.equal(fresh.length, 1, "one pointer-up with the pen must create exactly one stroke node");
    return fresh[0];
  };

  // The dev overlay's own readout of what the last stroke cost.
  const strokeReadout = async () => page.evaluate(() =>
    document.querySelector('.bd-dev-overlay [data-dev="stroke"]')?.textContent || "");

  // Moves a slider the way a user fine-tunes one: focus it, then arrow to the
  // value. Nothing is written to storage by hand and the page is never reloaded.
  const tune = async (key, target) => {
    const input = page.locator(`[data-draw-tune="${key}"]`);
    assert.equal(
      await input.count(),
      1,
      `developer mode must offer a "${key}" control for the drawing: the card asks for sliders to tune the pen with`
    );
    await input.focus();
    for (let i = 0; i < 80; i++) {
      const current = Number(await input.inputValue());
      if (Math.abs(current - target) < 1e-3) break;
      await page.keyboard.press(current < target ? "ArrowRight" : "ArrowLeft");
    }
    const settled = Number(await input.inputValue());
    assert.ok(
      Math.abs(settled - target) < 1e-3,
      `the "${key}" slider must reach ${target}, it stopped at ${settled}`
    );
  };

  await page.waitForSelector(".bd-dev-overlay", { timeout: 5000 });
  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(80);

  // ================================================================= phase F
  // The controls have to be reachable by a real pointer, which is not a given:
  // the site's sidenav is position:fixed at z-index 50 over the left 232px of
  // the board viewport, and the dev overlay lives at left:14px. It never
  // mattered while the overlay was a pointer-transparent readout.
  const buried = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-draw-tune], [data-draw-tune-reset]"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el.contains(top) || el === top
          ? null
          : `${el.dataset.drawTune || "reset"} is covered by <${top ? top.tagName.toLowerCase() : "nothing"} class="${top?.className || ""}">`;
      })
      .filter(Boolean));
  assert.deepEqual(buried, [], "F: every drawing control must take the pointer that lands on it");

  // ================================================================= phase A
  // The sliders change the next stroke, in the same page, with no reload.
  const cameraBeforeTuning = await camera();
  await tune("smoothing", 0);
  await tune("curve", 0);
  await tune("thinning", 2);

  const cameraAfterTuning = await camera();
  assert.deepEqual(
    [cameraAfterTuning.x, cameraAfterTuning.y, cameraAfterTuning.z],
    [cameraBeforeTuning.x, cameraBeforeTuning.y, cameraBeforeTuning.z],
    "A: arrowing a focused slider must tune the pen, not pan the board"
  );

  // Every stroke this file draws has to miss the harness itself: .bd-dev-tuning
  // is the one part of the overlay that takes pointer events, so ink laid over
  // it never reaches the canvas. Asserted rather than assumed, so a future
  // layout change says so instead of failing as "0 strokes created".
  const harnessRect = await page.evaluate(() => {
    const r = document.querySelector(".bd-dev-tuning").getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const assertClearOfHarness = (canvasPoints, label) => {
    const hit = canvasPoints.find((p) => {
      const x = sx(p.x);
      const y = sy(p.y);
      return x >= harnessRect.left && x <= harnessRect.right && y >= harnessRect.top && y <= harnessRect.bottom;
    });
    assert.equal(
      hit,
      undefined,
      `setup: ${label} crosses the tuning panel at ${JSON.stringify(hit)}; move the stroke, the panel eats the pointer`
    );
  };

  const pathA = wobblePath(190);
  assertClearOfHarness(pathA, "pathA");
  const fineStroke = await drawPath(pathA);
  const finePoints = pointsFrom(fineStroke.d);

  const fineReadout = await strokeReadout();
  const fineReadoutPoints = Number(/(\d+)\s*pts/.exec(fineReadout)?.[1]);
  assert.equal(
    fineReadoutPoints,
    finePoints.length,
    `A: the overlay must report the point count the stroke actually stores, so the size cost of a setting is visible. readout="${fineReadout}", stored=${finePoints.length}`
  );

  await tune("thinning", 20);
  const pathCoarse = wobblePath(300);
  assertClearOfHarness(pathCoarse, "pathCoarse");
  const coarseStroke = await drawPath(pathCoarse);
  const coarsePoints = pointsFrom(coarseStroke.d);

  assert.ok(
    coarsePoints.length * 2 < finePoints.length,
    `A: the identical pointer path must store far fewer points at thinning 20 than at thinning 2: ${finePoints.length} -> ${coarsePoints.length}`
  );
  assert.ok(
    coarsePoints.length >= 8,
    `A: thinning must thin the stroke, not destroy it: ${coarsePoints.length} points left`
  );

  // ================================================================= phase B
  // Fidelity. Smoothing is off here on purpose: smoothing is a deliberate
  // departure from the samples, so measuring fidelity with it on would be
  // measuring the wrong thing. Curve fitting is on, at the widest sample
  // spacing the slider allows, which is where a wrong curve shows up worst.
  await tune("smoothing", 0);
  await tune("thinning", 12);
  await tune("curve", 6);

  const pathB = wobblePath(410);
  assertClearOfHarness(pathB, "pathB");
  const curvedStroke = await drawPath(pathB);
  const curvedPoints = pointsFrom(curvedStroke.d);
  assert.ok(curvedPoints.length > 8, "B: the curved stroke must have a path to measure");

  let worstStray = 0;
  for (const wanted of pathB) {
    worstStray = Math.max(worstStray, distanceToPolyline(wanted, curvedPoints));
  }
  assert.ok(
    worstStray <= 4,
    `B: the stored stroke must stay within 4px of the path the hand took, worst stray ${worstStray.toFixed(2)}px over ${pathB.length} sampled positions`
  );

  // ================================================================ phase B2
  // Each knob must actually DO something, which phase B alone cannot tell you.
  // B's bound is one-sided: it only asserts the ink does not WANDER, and
  // turning curve or smoothing off makes the stroke hug the raw samples, so the
  // stray falls and B passes. Proved by a reviewer, who replaced the curve value
  // with a constant 0 and then disabled the smoothing branch outright, and got
  // "all phases passed" both times. A control that persists and round-trips
  // while doing nothing is exactly the failure the 2026-08-01 audit is about.

  // Curve subdivides between accepted samples, so at a fixed thinning a higher
  // curve setting must store materially more vertices than curve 0.
  await tune("smoothing", 0);
  await tune("thinning", 12);
  await tune("curve", 0);
  const pathFlat = wobblePath(470);
  assertClearOfHarness(pathFlat, "pathFlat");
  const flatPoints = pointsFrom((await drawPath(pathFlat)).d);

  await tune("curve", 6);
  const pathCurved = wobblePath(530);
  assertClearOfHarness(pathCurved, "pathCurved");
  const richPoints = pointsFrom((await drawPath(pathCurved)).d);

  assert.ok(
    richPoints.length > flatPoints.length * 1.5,
    `B2: curve 6 must store materially more vertices than curve 0 on the same path shape: ${flatPoints.length} -> ${richPoints.length}. If these are equal the curve slider is a no-op.`
  );

  // Smoothing is a deliberate departure from the samples, so at full strength
  // the ink must sit measurably further from the hand path than with smoothing
  // off. This is the assertion that fails if the smoothing branch is skipped.
  await tune("curve", 0);
  await tune("smoothing", 0);
  const pathSharp = wobblePath(590);
  assertClearOfHarness(pathSharp, "pathSharp");
  const sharpPoints = pointsFrom((await drawPath(pathSharp)).d);
  let sharpStray = 0;
  for (const wanted of pathSharp) sharpStray = Math.max(sharpStray, distanceToPolyline(wanted, sharpPoints));

  await tune("smoothing", 0.9);
  const pathSoft = wobblePath(650);
  assertClearOfHarness(pathSoft, "pathSoft");
  const softPoints = pointsFrom((await drawPath(pathSoft)).d);
  let softStray = 0;
  for (const wanted of pathSoft) softStray = Math.max(softStray, distanceToPolyline(wanted, softPoints));

  assert.ok(
    softStray > sharpStray * 2,
    `B2: smoothing 0.9 must pull the ink measurably off the raw samples compared with smoothing 0: ${sharpStray.toFixed(2)}px -> ${softStray.toFixed(2)}px. If these are equal the smoothing slider is a no-op.`
  );

  // And with the shipped defaults, which do smooth. A looser bound, because
  // smoothing is allowed to cut corners; it is not allowed to wander off.
  await page.click(".bd-dev-tuning-reset");
  await page.waitForTimeout(60);
  assert.equal(
    Number(await page.locator('[data-draw-tune="thinning"]').inputValue()),
    8,
    "B: reset must put the drawing settings back to the shipped defaults"
  );

  const pathDefault = wobblePath(520);
  assertClearOfHarness(pathDefault, "pathDefault");
  const defaultStroke = await drawPath(pathDefault);
  const defaultPoints = pointsFrom(defaultStroke.d);
  let defaultStray = 0;
  for (const wanted of pathDefault) {
    defaultStray = Math.max(defaultStray, distanceToPolyline(wanted, defaultPoints));
  }
  assert.ok(
    defaultStray <= 14,
    `B: at the shipped defaults the ink must still follow the hand, worst stray ${defaultStray.toFixed(2)}px`
  );

  // ================================================================= phase E
  // Storage: coordinates are stored at the precision a board needs and no more.
  const defaultMarkup = await storedStrokeText(defaultStroke.id);
  assert.ok(defaultMarkup.includes('class="bd-drawing"'), "E: the stroke must reach the serialized model");
  const overPrecise = (defaultMarkup.match(/\d+\.\d{3,}/g) || []).slice(0, 4);
  assert.equal(
    overPrecise.length,
    0,
    `E: stored stroke coordinates must not carry sub-pixel noise, found ${JSON.stringify(overPrecise)}`
  );

  // ================================================================= phase C
  // The eraser still cuts a smoothed, curve-fitted stroke in two. Drawn at the
  // shipped defaults, so this is the stroke a real user will be erasing.
  const ERASE_Y = 300;
  const ERASE_X0 = 420;
  const ERASE_X1 = 1000;
  const erasePath = [];
  for (let i = 0; i <= 40; i++) {
    erasePath.push({ x: ERASE_X0 + ((ERASE_X1 - ERASE_X0) * i) / 40, y: ERASE_Y });
  }

  // Clear the board first so the count below is unambiguous. Focus is left
  // exactly where the last gesture put it, inside the harness, on purpose: a
  // panel that swallows keydown would leave the board with no Ctrl+A, no
  // Ctrl+Z and no Delete for the rest of the session, and the only symptom
  // would be shortcuts quietly not working after you touch a slider.
  await page.locator(".bd-dev-tuning-reset").focus();
  const focusInHarness = await page.evaluate(() =>
    Boolean(document.activeElement?.closest?.(".bd-dev-tuning")));
  assert.equal(focusInHarness, true, "C: setup expects focus to be in the tuning panel");

  const beforeUndo = (await strokes()).length;
  assert.ok(beforeUndo > 0, "C: setup expects the strokes drawn above to still be on the board");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(140);
  assert.equal(
    (await strokes()).length,
    beforeUndo - 1,
    "C: Ctrl+Z must still undo with focus in the tuning panel. A panel that swallows keydown leaves the board with no undo for the rest of the session, and the only symptom is shortcuts quietly not working after you touch a slider"
  );
  for (let i = 0; i < 12 && (await strokes()).length > 0; i++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(110);
  }
  assert.equal((await strokes()).length, 0, "C: the board must be clear before the eraser case");

  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(60);
  const victim = await drawPath(erasePath);
  const victimPoints = pointsFrom(victim.d);
  assert.ok(victimPoints.length > 20, `C: the stroke to erase must be a real polyline, got ${victimPoints.length} points`);

  await page.click('[data-tool="erase"]');
  await page.waitForTimeout(80);
  const SWEEP_FROM = 690;
  const SWEEP_TO = 730;
  const ERASER_RADIUS = 12;
  await page.mouse.move(sx(SWEEP_FROM), sy(ERASE_Y));
  await page.mouse.down();
  await page.mouse.move(sx(SWEEP_TO), sy(ERASE_Y), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const afterErase = await strokes();
  assert.equal(
    afterErase.length,
    2,
    `C: erasing the middle of a smoothed stroke must leave two stroke nodes, got ${afterErase.length}`
  );

  const spans = afterErase
    .map((s) => {
      const pts = pointsFrom(s.d);
      return { id: s.id, min: Math.min(...pts.map((p) => p.x)), max: Math.max(...pts.map((p) => p.x)) };
    })
    .sort((a, b) => a.min - b.min);
  const gap = spans[1].min - spans[0].max;
  assert.ok(
    gap > 2 * ERASER_RADIUS - 2,
    `C: there must be a real gap where the eraser passed, got ${gap.toFixed(1)} canvas units`
  );
  assert.ok(
    spans[0].min < ERASE_X0 + 30,
    `C: the left end of the stroke must survive, its piece starts at ${spans[0].min.toFixed(1)}`
  );
  assert.ok(
    spans[1].max > ERASE_X1 - 40,
    `C: the right end of the stroke must survive, its piece ends at ${spans[1].max.toFixed(1)}`
  );
  for (const s of afterErase) {
    for (const p of pointsFrom(s.d)) {
      assert.ok(
        p.x <= SWEEP_FROM - ERASER_RADIUS + 1 || p.x >= SWEEP_TO + ERASER_RADIUS - 1,
        `C: ${s.id} still has ink at x=${p.x.toFixed(1)}, inside the erased band`
      );
    }
  }

  // ================================================================= phase D
  // Shift-snap still bakes a dead-straight segment on the end of a stroke that
  // was smoothed and curve-fitted up to that point.
  for (let i = 0; i < 12 && (await strokes()).length > 0; i++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(110);
  }
  assert.equal((await strokes()).length, 0, "D: the board must be clear before the shift-snap case");
  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(60);

  const known = new Set((await strokes()).map((s) => s.id));
  const anchor = { x: 420, y: 300 };
  await page.mouse.move(sx(anchor.x), sy(anchor.y));
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(sx(anchor.x + i * 9), sy(anchor.y + Math.sin(i / 2) * 14));
  }
  // modifiers passed to page.mouse.* are silently ignored, so the key is really
  // held down.
  await page.keyboard.down("Shift");
  // 260 across, 6 down: 1.3 degrees, inside the +/-3 degree snap window.
  await page.mouse.move(sx(anchor.x + 380), sy(anchor.y + 6), { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(200);

  const snapped = (await strokes()).filter((s) => !known.has(s.id));
  assert.equal(snapped.length, 1, "D: the shift stroke must land as one node");
  const snapPoints = pointsFrom(snapped[0].d);
  assert.ok(snapPoints.length >= 4, `D: the stroke must keep its freehand prefix, got ${snapPoints.length} points`);

  const end = snapPoints[snapPoints.length - 1];
  const beforeEnd = snapPoints[snapPoints.length - 2];
  assert.ok(
    Math.abs(end.y - beforeEnd.y) < 0.5,
    `D: the shift segment must be dead straight, it drops ${(end.y - beforeEnd.y).toFixed(2)} units`
  );
  assert.ok(
    end.x - beforeEnd.x > 200,
    `D: the shift segment must be the long straight run, it is ${(end.x - beforeEnd.x).toFixed(1)} units long`
  );
  // The prefix must still wobble, or "straight" was bought by flattening the
  // whole stroke.
  const prefixSpread = Math.max(...snapPoints.slice(0, -1).map((p) => p.y)) -
    Math.min(...snapPoints.slice(0, -1).map((p) => p.y));
  assert.ok(
    prefixSpread > 8,
    `D: the freehand prefix must still be freehand, its y spread is ${prefixSpread.toFixed(1)}`
  );

  // The coalesced toggle is a persisted setting, not a live-provable one under
  // a synthetic pointer. Check only that it round-trips.
  const box = page.locator('[data-draw-tune="coalesced"]');
  assert.equal(await box.count(), 1, "the harness must offer the coalesced-events toggle");
  assert.equal(await box.isChecked(), true, "coalesced events are on by default");
  await box.uncheck();
  await page.waitForTimeout(60);
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("board:test-board:settings") || "{}").drawTuning);
  assert.equal(persisted?.coalesced, false, "the harness must persist its settings like every other board setting");

  // ================================================================= phase G
  // And they survive the reload, which is the outcome "persist them like other
  // board settings" actually means: a tuning session picked up tomorrow starts
  // where it left off, not back at the defaults.
  await tune("thinning", 17);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".bd-dev-tuning", { timeout: 15000 });
  assert.equal(
    Number(await page.locator('[data-draw-tune="thinning"]').inputValue()),
    17,
    "G: a tuned slider must come back tuned after a reload"
  );
  assert.equal(
    await page.locator('[data-draw-tune="coalesced"]').isChecked(),
    false,
    "G: the coalesced toggle must come back off after a reload"
  );

  assert.deepEqual(pageErrors, [], "no page errors during the run");
  console.log(
    `drawing smoothness: all phases passed (thinning 2 -> ${finePoints.length} pts, thinning 20 -> ${coarsePoints.length} pts, worst stray ${worstStray.toFixed(2)}px / default ${defaultStray.toFixed(2)}px)`
  );
} finally {
  if (browser) await browser.close();
  child.kill();
}
