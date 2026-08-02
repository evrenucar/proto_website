// The eraser, and the pen's variable brush size.
//
// Two cards from the tracker:
//   "Add an eraser tool. Make sure it can erase in segments and not the whole
//    line. [...] The eraser brush size should also be adjustable the same way
//    as the brush tool"
//   "rewamp the pen tool: alt scroll should resize the brush size. [...] I can
//    also be adjusted by long pressing the pen tool icon in the menu and then
//    dragging up and down. (brush size circle should be visible while doing so"
//
// Every stroke of a drawing is its own node: stopDrawing calls createNode once
// per pointer-up. So "erase a segment" cannot mean "delete the node under the
// eraser": it means clip that node's polyline against the eraser disc and
// write the surviving pieces back. This suite asserts that outcome and nothing
// about the mechanism: it checks that a cut through the middle of a line leaves
// TWO stroke nodes with a real gap at the erased coordinates and both ends
// still present, that one Ctrl+Z brings back the one original stroke with
// byte-identical serialized points, that Alt+scroll makes the next stroke
// measurably thicker on screen while the camera does not move a pixel, and that
// long-pressing the pen icon and dragging shows a live size circle and changes
// the size.
//
// Deliberately not asserted: that any particular listener fired. Three
// regressions in this repo hid behind suites that asserted a mechanism while
// the feature was broken.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4262;
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

// One long horizontal stroke, built exactly the way stopDrawing builds one:
// points in canvas units, viewBox padded by 5, node box equal to the viewBox.
const STROKE_ID = "long-stroke";
const STROKE_Y = 300;
const STROKE_X0 = 200;
const STROKE_X1 = 800;
const STROKE_PAD = 5;

function longStrokeNode() {
  const points = [];
  for (let x = STROKE_X0; x <= STROKE_X1; x += 20) points.push(`${x} ${STROKE_Y}`);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p}`).join(" ");
  const w = Math.max(STROKE_X1 - STROKE_X0, 10);
  const h = 10; // Math.max(0, 10), a perfectly flat stroke gets the 10 floor
  const viewBox = `${STROKE_X0 - STROKE_PAD} ${STROKE_Y - STROKE_PAD} ${w + STROKE_PAD * 2} ${h + STROKE_PAD * 2}`;
  return {
    id: STROKE_ID,
    type: "text",
    x: STROKE_X0 - STROKE_PAD,
    y: STROKE_Y - STROKE_PAD,
    width: w + STROKE_PAD * 2,
    height: h + STROKE_PAD * 2,
    text: `<svg class="bd-drawing" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block;"><path d="${d}" fill="none" stroke="#3fdaca" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
  };
}

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [longStrokeNode()],
  edges: []
};

function pointsFrom(d) {
  const numbers = (String(d || "").match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return points;
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
    // addInitScript runs in every same-origin frame, including any iframe the
    // page serves itself. Only the top document owns this board's storage.
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    // Brush sizes persist across reloads by design; clear them so every phase
    // below starts from the documented defaults (pen 4, eraser 24).
    localStorage.removeItem("board:test-board:brush");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  const load = async () => {
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`#${STROKE_ID}`, { timeout: 15000 });
    await page.waitForTimeout(120);
  };

  // Canvas units -> screen pixels, read straight off the camera the board is
  // actually using rather than assumed, so a changed default cannot silently
  // move every coordinate in this file.
  const camera = async () => page.evaluate(() => {
    const viewport = document.querySelector("#braindump-viewport");
    const canvas = document.querySelector("#braindump-canvas");
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(canvas.style.transform);
    const rect = viewport.getBoundingClientRect();
    return { left: rect.left, top: rect.top, x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
  });

  // Every drawing on the board. Thickness is measured with isPointInStroke,
  // which asks the renderer how far the painted stroke actually reaches from
  // the centreline, then converted to screen pixels through the SVG's own
  // viewBox scale. That is the ink as drawn, not a number read back out of the
  // attribute that was written: getBoundingClientRect on an SVG path reports
  // the geometry box and returns height 0 for a flat line.
  const strokes = async () => page.evaluate(() =>
    Array.from(document.querySelectorAll(".bd-item"))
      .filter((el) => el.querySelector("svg.bd-drawing"))
      .map((el) => {
        const svg = el.querySelector("svg.bd-drawing");
        const p = svg.querySelector("path");
        let inkThickness = null;
        if (p && typeof p.isPointInStroke === "function") {
          const bbox = p.getBBox();
          const point = svg.createSVGPoint();
          point.x = bbox.x + bbox.width / 2;
          const centreY = bbox.y + bbox.height / 2;
          let inside = 0;
          let outside = 400;
          for (let i = 0; i < 32; i++) {
            const mid = (inside + outside) / 2;
            point.y = centreY + mid;
            if (p.isPointInStroke(point)) inside = mid;
            else outside = mid;
          }
          const rect = svg.getBoundingClientRect();
          const view = svg.viewBox.baseVal;
          const scaleY = view.height ? rect.height / view.height : 1;
          inkThickness = inside * 2 * scaleY;
        }
        return {
          id: el.id,
          x: parseFloat(el.style.left),
          y: parseFloat(el.style.top),
          width: parseFloat(el.style.width),
          height: parseFloat(el.style.height),
          d: p ? p.getAttribute("d") : null,
          inkThickness
        };
      }));

  const storedNodes = async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("board:test-board") || "{}");
    return state.nodes || [];
  });

  const bubble = async () => page.evaluate(() => {
    const el = document.querySelector('[data-board-ui="brush-size-bubble"]');
    if (!el) return null;
    const style = getComputedStyle(el);
    return { display: style.display, width: parseFloat(style.width), height: parseFloat(style.height) };
  });

  // ================================================================ phase 1
  // Erase through the middle of a stroke.
  await load();

  const eraserButton = await page.$('[data-tool="erase"]');
  assert.ok(eraserButton, "1: the toolbar must offer an eraser tool");

  const before = await storedNodes();
  assert.equal(before.length, 1, "1: the fixture is a single stroke node");
  const originalStroke = JSON.parse(JSON.stringify(before[0]));

  const cam = await camera();
  assert.equal(cam.z, 1, "1: the probe canvas pins the camera at z=1");
  const sx = (x) => cam.left + cam.x + x * cam.z;
  const sy = (y) => cam.top + cam.y + y * cam.z;

  await page.click('[data-tool="erase"]');
  await page.waitForTimeout(80);

  // Default eraser is 24 canvas units across, so a sweep from x=480 to x=520
  // clears roughly 468..532 of a stroke that runs 200..800.
  const SWEEP_FROM = 480;
  const SWEEP_TO = 520;
  const ERASER_RADIUS = 12;
  await page.mouse.move(sx(SWEEP_FROM), sy(STROKE_Y));
  await page.mouse.down();
  await page.mouse.move(sx(SWEEP_TO), sy(STROKE_Y), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterErase = await strokes();
  assert.equal(
    afterErase.length,
    2,
    `1: erasing the middle of one stroke must leave two stroke nodes, got ${afterErase.length}`
  );

  const spans = afterErase
    .map((s) => {
      const pts = pointsFrom(s.d);
      return { id: s.id, min: Math.min(...pts.map((p) => p.x)), max: Math.max(...pts.map((p) => p.x)) };
    })
    .sort((a, b) => a.min - b.min);

  assert.ok(
    Math.abs(spans[0].min - STROKE_X0) < 1,
    `1: the left end must survive at x=${STROKE_X0}, got ${spans[0].min}`
  );
  assert.ok(
    Math.abs(spans[1].max - STROKE_X1) < 1,
    `1: the right end must survive at x=${STROKE_X1}, got ${spans[1].max}`
  );

  const gap = spans[1].min - spans[0].max;
  assert.ok(
    gap > 2 * ERASER_RADIUS,
    `1: there must be a real gap where the eraser passed, got ${gap.toFixed(1)} canvas units`
  );

  // Nothing at all may remain inside the erased band.
  for (const s of afterErase) {
    for (const p of pointsFrom(s.d)) {
      assert.ok(
        p.x <= SWEEP_FROM - ERASER_RADIUS + 0.5 || p.x >= SWEEP_TO + ERASER_RADIUS - 0.5,
        `1: ${s.id} still has ink at x=${p.x}, inside the erased band`
      );
    }
  }

  // ================================================================ phase 2
  // One Ctrl+Z puts the one original stroke back, exactly.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);

  const afterUndo = await strokes();
  assert.equal(afterUndo.length, 1, "2: one undo must restore exactly one stroke node");

  const restored = await storedNodes();
  assert.equal(restored.length, 1, "2: the serialized model must hold one node too");
  assert.equal(restored[0].id, originalStroke.id, "2: the restored node keeps its identity");
  assert.equal(
    restored[0].text,
    originalStroke.text,
    "2: the restored stroke's serialized points must be identical to the original"
  );
  assert.deepEqual(
    [restored[0].x, restored[0].y, restored[0].width, restored[0].height],
    [originalStroke.x, originalStroke.y, originalStroke.width, originalStroke.height],
    "2: the restored stroke keeps its box"
  );

  // ...and one redo takes the hole back out, in one press.
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(250);
  assert.equal((await strokes()).length, 2, "2: one redo must re-cut the stroke in one press");

  // ================================================================ phase 3
  // Alt+scroll thickens the pen without moving the camera.
  await load();
  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(80);

  const drawStroke = async (fromX, y, toX) => {
    const known = new Set((await strokes()).map((s) => s.id));
    const c = await camera();
    const px = (x) => c.left + c.x + x * c.z;
    const py = (v) => c.top + c.y + v * c.z;
    await page.mouse.move(px(fromX), py(y));
    await page.mouse.down();
    await page.mouse.move(px(toX), py(y), { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const now = await strokes();
    const fresh = now.filter((s) => !known.has(s.id));
    assert.equal(fresh.length, 1, "a pointer-up with the pen must create exactly one stroke node");
    return fresh[0];
  };

  const thin = await drawStroke(300, 520, 700);

  const cameraBefore = await camera();
  await page.mouse.move(sx(500), sy(600));
  await page.keyboard.down("Alt");
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(20);
  }
  await page.keyboard.up("Alt");
  await page.waitForTimeout(120);

  const cameraAfter = await camera();
  assert.deepEqual(
    [cameraAfter.x, cameraAfter.y, cameraAfter.z],
    [cameraBefore.x, cameraBefore.y, cameraBefore.z],
    "3: Alt+scroll must resize the brush without moving or zooming the camera"
  );

  const fat = await drawStroke(300, 660, 700);
  assert.ok(
    fat.inkThickness > thin.inkThickness * 1.5,
    `3: the stroke drawn after Alt+scroll must be visibly thicker on screen: ${thin.inkThickness} -> ${fat.inkThickness}`
  );
  assert.ok(
    fat.height > thin.height,
    `3: the thicker stroke's node box must grow to contain its ink: ${thin.height} -> ${fat.height}`
  );

  // Plain scroll must still zoom, or "don't zoom on Alt" was bought by breaking
  // the wheel outright.
  const zoomBefore = (await camera()).z;
  await page.mouse.move(sx(500), sy(400));
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(150);
  const zoomAfter = (await camera()).z;
  assert.ok(zoomAfter > zoomBefore, `3: a plain wheel must still zoom the board: ${zoomBefore} -> ${zoomAfter}`);

  // ================================================================ phase 4
  // Long-press the pen icon, drag up: the size circle appears and the size grows.
  await load();
  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(80);

  const baseline = await drawStroke(300, 520, 700);
  assert.equal(await bubble(), null, "4: no size circle before the gesture");

  const penBox = await page.locator('[data-tool="draw"]').boundingBox();
  const penX = penBox.x + penBox.width / 2;
  const penY = penBox.y + penBox.height / 2;
  await page.mouse.move(penX, penY);
  await page.mouse.down();
  await page.waitForTimeout(450);

  const bubbleOnPress = await bubble();
  assert.ok(bubbleOnPress, "4: long-pressing the pen icon must show the brush size circle");
  assert.notEqual(bubbleOnPress.display, "none", "4: the size circle must be visible while long-pressing");
  const startDiameter = bubbleOnPress.width;

  await page.mouse.move(penX, penY - 120, { steps: 12 });
  await page.waitForTimeout(120);

  const bubbleOnDrag = await bubble();
  assert.notEqual(bubbleOnDrag.display, "none", "4: the size circle must stay visible while dragging");
  assert.ok(
    bubbleOnDrag.width > startDiameter,
    `4: dragging up must grow the size circle: ${startDiameter} -> ${bubbleOnDrag.width}`
  );

  await page.mouse.up();
  await page.waitForTimeout(120);

  const afterLongPress = await drawStroke(300, 660, 700);
  assert.ok(
    afterLongPress.inkThickness > baseline.inkThickness * 1.5,
    `4: the stroke drawn after the long-press drag must be thicker: ${baseline.inkThickness} -> ${afterLongPress.inkThickness}`
  );
  // The circle promised the size the pen would draw at, at the current zoom.
  assert.ok(
    Math.abs(bubbleOnDrag.width - afterLongPress.inkThickness) <= 2,
    `4: the size circle must show the true brush size at the current zoom: circle ${bubbleOnDrag.width}, ink ${afterLongPress.inkThickness}`
  );

  // ================================================================ phase 5
  // The eraser's size is adjustable the same way, and a bigger eraser cuts a
  // bigger hole.
  await load();
  await page.click('[data-tool="erase"]');
  await page.waitForTimeout(80);

  const cam5 = await camera();
  const px5 = (x) => cam5.left + cam5.x + x * cam5.z;
  const py5 = (y) => cam5.top + cam5.y + y * cam5.z;

  await page.mouse.move(px5(500), py5(600));
  await page.keyboard.down("Alt");
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(20);
  }
  await page.keyboard.up("Alt");
  await page.waitForTimeout(120);

  await page.mouse.move(px5(500), py5(STROKE_Y));
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterBigErase = await strokes();
  assert.equal(afterBigErase.length, 2, "5: a single eraser tap through a line must still split it in two");
  const bigSpans = afterBigErase
    .map((s) => {
      const pts = pointsFrom(s.d);
      return { min: Math.min(...pts.map((p) => p.x)), max: Math.max(...pts.map((p) => p.x)) };
    })
    .sort((a, b) => a.min - b.min);
  const bigGap = bigSpans[1].min - bigSpans[0].max;
  assert.ok(
    bigGap > 24,
    `5: after Alt+scrolling the eraser up, one tap must cut wider than the default 24: got ${bigGap.toFixed(1)}`
  );

  assert.deepEqual(pageErrors, [], "no page errors during the run");
  console.log("pen and eraser tools: all 5 phases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
