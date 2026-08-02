// Two user bug reports against the drawing work that shipped on 2026-08-01.
//
//   "still as you draw thin line shows. But when you let go it goes to the set
//    thickness. Needs to draw as the set thickness."
//   "The press and hold eraser or pen and move up and down is a bit broken
//    currently. Doesn't work well. Also needs to work on first click and hold
//    shouldn't need to click tool first then click hold drag."
//
// Everything here is measured in SCREEN PIXELS, because that is the unit the
// complaint is in: the line under the cursor looked thinner than the line that
// was left behind. Thickness is read with isPointInStroke, which asks the
// renderer how far the painted stroke actually reaches from the centreline, and
// converted to screen pixels through the element's own getScreenCTM. Both of
// those see the *used* value, so a stylesheet rule that overrides the
// stroke-width attribute is visible to this test and an attribute read is not:
// that override is the bug the first card is about.
//
// getBoundingClientRect is not used on purpose: on an SVG path it reports the
// geometry box, which is 0 tall for a flat line.
//
// Phase C asserts the press-and-hold gesture on a tool that is NOT the active
// one, and it asserts it twice over: the size circle must show the size of the
// tool being pressed, and the tap that follows the gesture must erase, which it
// can only do if the gesture left the eraser selected.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4321;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

// Seeded through the documented brush key so the run does not depend on the
// shipped default. If that ever stops working the phase A assertion on the
// absolute width (24 screen px at zoom 1) fails instead of quietly measuring a
// 4px brush against itself and passing.
const BRUSH = 24;

const STROKE_ID = "long-stroke";
const STROKE_Y = 300;
const STROKE_X0 = 300;
const STROKE_X1 = 900;
const STROKE_PAD = 5;
const ERASER_DEFAULT = 24;
const DRAG_PIXELS = 80;
const UNITS_PER_PIXEL = 0.25;
const ERASER_AFTER_DRAG = ERASER_DEFAULT + DRAG_PIXELS * UNITS_PER_PIXEL; // 44

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

function longStrokeNode() {
  const points = [];
  for (let x = STROKE_X0; x <= STROKE_X1; x += 20) points.push(`${x} ${STROKE_Y}`);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p}`).join(" ");
  const w = Math.max(STROKE_X1 - STROKE_X0, 10);
  const h = 10; // a perfectly flat stroke gets buildDrawingSpec's 10 floor
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
  await context.addInitScript((brush) => {
    // addInitScript runs in every same-origin frame; only the top document owns
    // this board's storage.
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    localStorage.setItem("board:test-board:brush", JSON.stringify({ draw: brush, erase: 24 }));
  }, BRUSH);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  let fixtureNodes = [];
  let fixtureZoom = 1;
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...baseCanvas,
        defaultViewport: { x: 0, y: 0, z: fixtureZoom },
        nodes: fixtureNodes,
        edges: []
      })
    }));

  const load = async (nodes, zoom) => {
    fixtureNodes = nodes;
    fixtureZoom = zoom;
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tool="draw"]', { timeout: 15000 });
    await page.waitForTimeout(200);
  };

  const camera = async () => page.evaluate(() => {
    const viewport = document.querySelector("#braindump-viewport");
    const canvas = document.querySelector("#braindump-canvas");
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(canvas.style.transform);
    const rect = viewport.getBoundingClientRect();
    return { left: rect.left, top: rect.top, x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
  });

  // The painted width of a stroke, in screen pixels. Binary search on
  // isPointInStroke gives the half-width in the element's own user units;
  // getScreenCTM converts that to the screen, so the camera's zoom and the
  // node box's viewBox stretch are both accounted for without assuming either.
  const inkThickness = (selector) => page.evaluate((sel) => {
    const p = document.querySelector(sel);
    if (!p) return null;
    const svg = p.ownerSVGElement;
    const bbox = p.getBBox();
    const point = svg.createSVGPoint();
    point.x = bbox.x + bbox.width / 2;
    const centreY = bbox.y + bbox.height / 2;
    let inside = 0;
    let outside = 1000;
    for (let i = 0; i < 40; i++) {
      const mid = (inside + outside) / 2;
      point.y = centreY + mid;
      if (p.isPointInStroke(point)) inside = mid;
      else outside = mid;
    }
    const ctm = p.getScreenCTM();
    return inside * 2 * Math.hypot(ctm.a, ctm.b);
  }, selector);

  const bubble = async () => page.evaluate(() => {
    const el = document.querySelector('[data-board-ui="brush-size-bubble"]');
    if (!el) return null;
    const style = getComputedStyle(el);
    return { display: style.display, width: parseFloat(style.width) };
  });

  const drawingNodes = async () => page.evaluate(() =>
    Array.from(document.querySelectorAll(".bd-item"))
      .filter((el) => el.querySelector("svg.bd-drawing"))
      .map((el) => ({
        id: el.id,
        d: el.querySelector("svg.bd-drawing path")?.getAttribute("d") || null,
        isDot: !!el.querySelector("svg.bd-drawing circle")
      })));

  // Draw a horizontal stroke and measure the live preview halfway through,
  // while the button is still down, then the finished node after release.
  const drawAndMeasure = async (screenY) => {
    await page.click('[data-tool="draw"]');
    await page.waitForTimeout(80);
    // Screen coordinates on purpose: the site's left nav is 232px wide, fixed
    // and painted over the board, so nothing below x=232 is reachable.
    await page.mouse.move(400, screenY);
    await page.mouse.down();
    await page.mouse.move(700, screenY, { steps: 10 });
    await page.mouse.move(1000, screenY, { steps: 10 });
    await page.waitForTimeout(60);

    const live = await inkThickness("#braindump-svg-layer path");
    assert.ok(live !== null, "a stroke in progress must be visible on the board");

    await page.mouse.up();
    await page.waitForTimeout(250);

    const finished = await inkThickness(".bd-item svg.bd-drawing path");
    assert.ok(finished !== null, "letting go must leave a finished stroke on the board");
    return { live, finished };
  };

  // ================================================================ phase A
  // Zoom 1. The line under the cursor must already be the line you get.
  await load([], 1);
  const camA = await camera();
  assert.equal(camA.z, 1, "A: the fixture pins the camera at z=1");

  const a = await drawAndMeasure(400);
  assert.ok(
    Math.abs(a.live - a.finished) <= 1,
    `A: at zoom 1 the live stroke must be drawn at the finished thickness: live ${a.live.toFixed(2)}px, finished ${a.finished.toFixed(2)}px on screen`
  );
  assert.ok(
    Math.abs(a.live - BRUSH) <= 1,
    `A: at zoom 1 a brush of ${BRUSH} must draw ${BRUSH} screen px while you draw, got ${a.live.toFixed(2)}px`
  );
  assert.ok(
    Math.abs(a.finished - BRUSH) <= 1,
    `A: at zoom 1 a brush of ${BRUSH} must leave ${BRUSH} screen px behind, got ${a.finished.toFixed(2)}px`
  );

  // ================================================================ phase B
  // Zoom 0.5. Both halve together, so a fix that hard-codes a width fails here.
  await load([], 0.5);
  const camB = await camera();
  assert.equal(camB.z, 0.5, "B: the fixture pins the camera at z=0.5");

  const b = await drawAndMeasure(400);
  assert.ok(
    Math.abs(b.live - b.finished) <= 1,
    `B: at zoom 0.5 the live stroke must be drawn at the finished thickness: live ${b.live.toFixed(2)}px, finished ${b.finished.toFixed(2)}px on screen`
  );
  assert.ok(
    Math.abs(b.live - BRUSH * 0.5) <= 1,
    `B: at zoom 0.5 a brush of ${BRUSH} must draw ${BRUSH * 0.5} screen px while you draw, got ${b.live.toFixed(2)}px`
  );
  assert.ok(
    Math.abs(b.live - a.live) > 1,
    `B: the live stroke must follow the zoom, not a fixed width: ${a.live.toFixed(2)}px at z=1 vs ${b.live.toFixed(2)}px at z=0.5`
  );

  // ================================================================ phase C
  // Press and hold a tool that is NOT the active one, drag up, let go.
  await load([longStrokeNode()], 1);
  await page.waitForSelector(`#${STROKE_ID}`, { timeout: 15000 });
  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(80);

  const camC = await camera();
  const sx = (x) => camC.left + camC.x + x * camC.z;
  const sy = (y) => camC.top + camC.y + y * camC.z;

  const eraserBox = await page.locator('[data-tool="erase"]').boundingBox();
  const ex = eraserBox.x + eraserBox.width / 2;
  const ey = eraserBox.y + eraserBox.height / 2;

  await page.mouse.move(ex, ey);
  await page.mouse.down();
  await page.waitForTimeout(450);
  for (let i = 1; i <= DRAG_PIXELS / 10; i++) {
    await page.mouse.move(ex, ey - i * 10);
    await page.waitForTimeout(12);
  }

  const held = await bubble();
  assert.ok(held && held.display !== "none", "C: the size circle must be visible during the press and hold");
  assert.ok(
    Math.abs(held.width - ERASER_AFTER_DRAG * camC.z) <= 2,
    `C: the size circle must show the size of the tool being pressed (${ERASER_AFTER_DRAG}px eraser at z=${camC.z}), got ${held.width}px`
  );

  await page.mouse.up();
  await page.waitForTimeout(200);

  // The gesture was performed on the eraser, so the eraser is what you are
  // holding when you let go. Proved by tapping the board: an eraser cuts the
  // stroke, a pen would leave a dot on top of it.
  await page.mouse.move(sx(600), sy(STROKE_Y));
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);

  const after = await drawingNodes();
  // A boolean, not the ElementHandle: assert.equal on a handle builds a diff of
  // the whole object and dies with "Array buffer allocation failed" instead of
  // printing the message.
  const originalSurvived = await page.evaluate((id) => !!document.getElementById(id), STROKE_ID);
  assert.equal(
    originalSurvived,
    false,
    `C: the tap after the press and hold must erase, so the original stroke cannot survive intact (drawings on the board: ${JSON.stringify(after)})`
  );
  assert.ok(
    after.every((n) => !n.isDot),
    `C: the tap must not have drawn anything, got ${JSON.stringify(after)}`
  );
  assert.equal(after.length, 2, `C: one tap through the middle of a stroke must leave two pieces, got ${after.length}`);

  const spans = after
    .map((n) => {
      const pts = pointsFrom(n.d);
      return { min: Math.min(...pts.map((p) => p.x)), max: Math.max(...pts.map((p) => p.x)) };
    })
    .sort((x, y) => x.min - y.min);
  const gap = spans[1].min - spans[0].max;
  assert.ok(
    gap > ERASER_DEFAULT + 6,
    `C: the eraser must cut at the size the press and hold set (${ERASER_AFTER_DRAG}, not the default ${ERASER_DEFAULT}), got a ${gap.toFixed(1)} unit gap`
  );

  assert.deepEqual(pageErrors, [], "no page errors during the run");
  console.log(
    `stroke thickness and resize: A live ${a.live.toFixed(2)}px / finished ${a.finished.toFixed(2)}px, ` +
    `B live ${b.live.toFixed(2)}px / finished ${b.finished.toFixed(2)}px, ` +
    `C bubble ${held.width}px, gap ${gap.toFixed(1)} units`
  );
} finally {
  if (browser) await browser.close();
  child.kill();
}
