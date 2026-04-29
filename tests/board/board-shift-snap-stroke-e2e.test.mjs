// E2E test for the Shift-snap straight-line drawing feature.
// Spec: .agents/feature_implementation/straight-line-shift-snap.md
//
// Drives a real pointer + keyboard sequence in Chromium against the preview
// server, then asserts the resulting SVG path attribute on the active stroke.
//
// Cases covered:
//   1. Freehand → Shift held (horizontal motion → snap to 0°) → release → freehand → end
//   2. Snap to 90° (vertical down)
//   3. Snap to 45° (diagonal down-right)
//   4. Out-of-tolerance angle stays unsnapped (no flicker)
//   5. Two Shift presses in one stroke produce two straight segments

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4201;
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

// Parse an SVG path "M x0 y0 L x1 y1 L x2 y2 ..." into an array of {cmd, x, y}.
function parsePath(d) {
  const tokens = d.trim().split(/\s+/);
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const x = Number(tokens[i++]);
    const y = Number(tokens[i++]);
    out.push({ cmd, x, y });
  }
  return out;
}

// Read the active stroke's path data from the live SVG layer.
async function activePath(page) {
  return await page.evaluate(() => {
    const layer = document.querySelector('[data-board-role="svg-layer"], #braindump-svg-layer');
    const path = layer ? layer.querySelector("path") : null;
    return path ? path.getAttribute("d") : null;
  });
}

// Reset state by reloading the page. Cheap and total.
async function freshPage(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/braindump.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tool="draw"]', { timeout: 15000 });
  // Activate the draw tool. The toolbar button click runs setActiveTool internally.
  await page.click('[data-tool="draw"]');
  return page;
}

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  // ---- Case 1: horizontal Shift snap (0°) and freehand resumption ----
  {
    const page = await freshPage(context);

    // Anchor in the middle of the viewport, away from toolbar.
    const ax = 700;
    const ay = 500;

    // Freehand prefix.
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(ax + 20, ay + 5, { steps: 4 });
    await page.mouse.move(ax + 40, ay + 8, { steps: 4 });

    // Shift held: drag noticeably off-axis but within tolerance for 0° snap.
    // Tolerance is ±3°, atan2(2, 200) ≈ 0.57° → snaps to 0°.
    await page.keyboard.down("Shift");
    await page.mouse.move(ax + 240, ay + 10, { steps: 8 });
    const dShifted = await activePath(page);

    // Release shift, draw a bit more freehand.
    await page.keyboard.up("Shift");
    await page.mouse.move(ax + 260, ay + 30, { steps: 4 });
    const dResumed = await activePath(page);

    await page.mouse.up();

    const shiftedSegs = parsePath(dShifted);
    const last = shiftedSegs[shiftedSegs.length - 1];
    assert.equal(last.cmd, "L", "1: shifted path ends with an L command");
    // Snapped endpoint should be at exact y of the anchor (after the prefix's last y).
    // Anchor y was 508 (last freehand point's y on canvas). Allow 1px slack for camera/dpr.
    const prefixLastY = shiftedSegs[shiftedSegs.length - 2].y;
    assert.ok(
      Math.abs(last.y - prefixLastY) < 1,
      `1: snap-to-horizontal must hold y constant. last.y=${last.y}, prefix.y=${prefixLastY}`
    );

    // After resume, the path must have grown beyond the snapped endpoint.
    const resumedSegs = parsePath(dResumed);
    assert.ok(
      resumedSegs.length > shiftedSegs.length,
      `1: freehand should resume after Shift release. shifted=${shiftedSegs.length} resumed=${resumedSegs.length}`
    );

    await page.close();
    console.log("case 1 (horizontal snap + resume): ok");
  }

  // ---- Case 2: vertical-down snap (90°) ----
  {
    const page = await freshPage(context);
    const ax = 700;
    const ay = 400;

    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(ax + 5, ay + 10, { steps: 3 });

    await page.keyboard.down("Shift");
    // Mostly vertical with tiny x drift.
    await page.mouse.move(ax + 7, ay + 200, { steps: 8 });
    const d = await activePath(page);
    await page.keyboard.up("Shift");
    await page.mouse.up();

    const segs = parsePath(d);
    const last = segs[segs.length - 1];
    const prevX = segs[segs.length - 2].x;
    assert.ok(
      Math.abs(last.x - prevX) < 1,
      `2: snap-to-vertical must hold x constant. last.x=${last.x}, prev.x=${prevX}`
    );

    await page.close();
    console.log("case 2 (vertical snap): ok");
  }

  // ---- Case 3: 45° diagonal snap ----
  {
    const page = await freshPage(context);
    const ax = 700;
    const ay = 400;

    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(ax + 8, ay + 6, { steps: 3 });

    await page.keyboard.down("Shift");
    // dx ≈ 200, dy ≈ 198 → ≈ 44.7° → snaps to 45°
    await page.mouse.move(ax + 200, ay + 198, { steps: 8 });
    const d = await activePath(page);
    await page.keyboard.up("Shift");
    await page.mouse.up();

    const segs = parsePath(d);
    const last = segs[segs.length - 1];
    const prev = segs[segs.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    // After snap to 45°, dx should equal dy (within float slack).
    assert.ok(
      Math.abs(dx - dy) < 0.5,
      `3: snap-to-45 must produce dx === dy. dx=${dx}, dy=${dy}`
    );

    await page.close();
    console.log("case 3 (45° diagonal snap): ok");
  }

  // ---- Case 4: out-of-tolerance angle stays unsnapped ----
  {
    const page = await freshPage(context);
    const ax = 700;
    const ay = 400;

    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(ax + 8, ay + 6, { steps: 3 });

    await page.keyboard.down("Shift");
    // 30° is well outside any snap window (closest snap = 45°, diff = 15° > 3°).
    // dx = 200, dy = 200 * tan(30°) ≈ 115.5
    await page.mouse.move(ax + 200, ay + 116, { steps: 8 });
    const d = await activePath(page);
    await page.keyboard.up("Shift");
    await page.mouse.up();

    const segs = parsePath(d);
    const last = segs[segs.length - 1];
    // Endpoint should match raw cursor (200, 116) offset from the anchor (the
    // last freehand point), not a snapped angle. We assert the path did NOT
    // snap to 45° (which would force last.x − prev.x ≈ last.y − prev.y).
    const prev = segs[segs.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    assert.ok(
      Math.abs(dx - dy) > 10,
      `4: out-of-tolerance must NOT snap to 45°. dx=${dx}, dy=${dy}`
    );

    await page.close();
    console.log("case 4 (out-of-tolerance unsnapped): ok");
  }

  // ---- Case 5: two Shift segments in one stroke ----
  {
    const page = await freshPage(context);
    const ax = 700;
    const ay = 400;

    await page.mouse.move(ax, ay);
    await page.mouse.down();

    // First segment: snap horizontal.
    await page.keyboard.down("Shift");
    await page.mouse.move(ax + 200, ay + 2, { steps: 6 });
    await page.keyboard.up("Shift");

    // Freehand bridge.
    await page.mouse.move(ax + 220, ay + 30, { steps: 3 });

    // Second segment: snap vertical.
    await page.keyboard.down("Shift");
    await page.mouse.move(ax + 222, ay + 220, { steps: 6 });
    const d = await activePath(page);
    await page.keyboard.up("Shift");
    await page.mouse.up();

    const segs = parsePath(d);
    // The path must have at least: M start + first snap end + bridge points +
    // second snap end. So count of L commands ≥ 3.
    const lCount = segs.filter((s) => s.cmd === "L").length;
    assert.ok(lCount >= 3, `5: expected ≥3 L commands, got ${lCount}. d=${d}`);

    await page.close();
    console.log("case 5 (two segments per stroke): ok");
  }

  console.log("board-shift-snap-stroke-e2e: all 5 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
