// Perf budget on the sandbox board (/content/boards/test-board.html).
//
// Seeds the canonical sandbox plus generated text nodes (120 total, the scale
// of the real braindump board), then measures requestAnimationFrame deltas
// through four phases: idle, a wheel-zoom storm, a real-input node drag, and
// a middle-button pan. Each phase gets its own p95 budget, so a performance
// regression turns a test red instead of waiting for a user report.
//
// Why per-phase: headless Chromium rasters in software, which makes every
// repainting phase raster-bound (measured 2026-07-30 at 120 nodes: idle a
// flat 16.7ms, but zoom p95 133ms, drag and pan p95 83ms, all dominated by
// SwiftShader raster, not our code). So the frame budgets are coarse and
// catch only gross regressions. The tight, environment-stable assertion is
// pointer-move dispatch cost, measured in microseconds per event on the main
// thread: the listener-per-node bug cost 71.2us/event, the interaction relay
// took it to 2.1us, and that class of regression is exactly what this test
// exists to catch.
//
// Budgets are env-tunable for slower CI machines:
//   PERF_IDLE_P95_MS (default 25)   PERF_DRAG_P95_MS (default 120)
//   PERF_PAN_P95_MS  (default 120)  PERF_ZOOM_P95_MS (default 220)
//   PERF_DISPATCH_US (default 25)

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4211;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const notesPath = path.join(process.cwd(), "content", "boards", "test-board", "notes.md");
const fixturesDir = path.join(process.cwd(), "tests", "fixtures");

const TOTAL_NODES = 120;
const budgets = {
  idle: Number(process.env.PERF_IDLE_P95_MS || 25),
  drag: Number(process.env.PERF_DRAG_P95_MS || 120),
  pan: Number(process.env.PERF_PAN_P95_MS || 120),
  zoom: Number(process.env.PERF_ZOOM_P95_MS || 220),
};
const dispatchBudgetUs = Number(process.env.PERF_DISPATCH_US || 25);

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

const canvasBackup = await readFile(canvasPath, "utf8");
const notesBackup = await readFile(notesPath, "utf8");

// Storm canvas: the canonical seed plus generated text nodes in a grid that
// straddles the default viewport, so zooming and panning move real content in
// and out of view. Grid spacing exceeds the node box, so storm nodes never
// stack on each other.
const seed = JSON.parse(await readFile(path.join(fixturesDir, "test-board-seed.canvas"), "utf8"));
const stormCount = TOTAL_NODES - seed.nodes.length;
const cols = 10;
for (let i = 0; i < stormCount; i++) {
  seed.nodes.push({
    id: `storm-${i + 1}`,
    x: -800 + (i % cols) * 380,
    y: -600 + Math.floor(i / cols) * 230,
    width: 340,
    height: 170,
    type: "text",
    text: `Storm node ${i + 1}. Filler for the perf budget run.`,
  });
}
seed.updatedAt = new Date().toISOString();
await writeFile(canvasPath, JSON.stringify(seed, null, 2), "utf8");
await writeFile(notesPath, await readFile(path.join(fixturesDir, "test-board-seed-notes.md"), "utf8"), "utf8");

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

function startSampler(page) {
  return page.evaluate(() => {
    window.__frameDeltas = [];
    window.__samplerOn = true;
    let last = 0;
    const loop = (now) => {
      if (!window.__samplerOn) return;
      if (last > 0) window.__frameDeltas.push(now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

function stopSampler(page) {
  return page.evaluate(() => {
    window.__samplerOn = false;
    const deltas = window.__frameDeltas.slice(2);
    const sorted = [...deltas].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    return {
      frames: deltas.length,
      avg: Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2)),
      p95: Number(at(0.95).toFixed(2)),
      worst: Number(sorted[sorted.length - 1].toFixed(2)),
    };
  });
}

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
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
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url || "";
    if (!url || url.startsWith(baseUrl)) pageErrors.push(msg.text());
  });

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`#storm-${stormCount}`, { timeout: 15000 });

  const nodeCount = await page.evaluate(() => document.querySelectorAll(".bd-item").length);
  assert.equal(nodeCount, TOTAL_NODES, `storm board must mount all ${TOTAL_NODES} nodes`);

  // Let mount work, font loads and the first raster settle before measuring.
  await page.waitForTimeout(800);

  const results = {};

  // --- Phase: idle. Nothing moves; any cost here is our own frame loop.
  await startSampler(page);
  await page.waitForTimeout(2000);
  results.idle = await stopSampler(page);

  // --- Pointer dispatch cost: 2000 synthetic mousemoves through the window
  // relay with no drag active. Main-thread CPU only, so it is stable across
  // rendering environments and directly catches listener-explosion bugs.
  const dispatch = await page.evaluate(() => {
    const count = 2000;
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 300 + (i % 50), clientY: 300 + (i % 30), bubbles: true })
      );
    }
    return Number((((performance.now() - start) * 1000) / count).toFixed(2));
  });

  // --- Phase: zoom storm. One wheel event per frame, 12 frames per
  // direction so the camera really travels. Raster-bound by design.
  await startSampler(page);
  await page.evaluate(async () => {
    const viewport = document.querySelector(".braindump-viewport");
    const rect = viewport.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    await new Promise((resolve) => {
      let i = 0;
      const step = () => {
        const dir = Math.floor(i / 12) % 2 === 0 ? -1 : 1;
        viewport.dispatchEvent(
          new WheelEvent("wheel", { deltaY: dir * 120, clientX: cx, clientY: cy, bubbles: true, cancelable: true })
        );
        i += 1;
        if (i < 180) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  });
  results.zoom = await stopSampler(page);

  // --- Phase: drag a node in circles through real input events, exercising
  // the interaction relay under load.
  const dragBox = await page.locator("#test-text").boundingBox();
  const dragCx = dragBox.x + dragBox.width / 2;
  const dragCy = dragBox.y + dragBox.height / 2;
  await page.mouse.move(dragCx, dragCy);
  await page.mouse.down();
  await startSampler(page);
  for (let i = 0; i < 160; i++) {
    const angle = (i / 40) * Math.PI * 2;
    await page.mouse.move(dragCx + Math.cos(angle) * 120, dragCy + Math.sin(angle) * 90);
  }
  results.drag = await stopSampler(page);
  await page.mouse.up();
  await page.keyboard.press("Control+z");

  // --- Phase: middle-button pan sweep across the board and back.
  await page.mouse.move(720, 480);
  await page.mouse.down({ button: "middle" });
  await startSampler(page);
  for (let i = 0; i < 60; i++) await page.mouse.move(720 - i * 9, 480 - i * 5);
  for (let i = 60; i >= 0; i--) await page.mouse.move(720 - i * 9, 480 - i * 5);
  results.pan = await stopSampler(page);
  await page.mouse.up({ button: "middle" });

  for (const [phase, stats] of Object.entries(results)) {
    console.log(
      `perf-budget ${phase.padEnd(4)} | ${String(stats.frames).padStart(3)} frames | ` +
        `avg ${stats.avg}ms, p95 ${stats.p95}ms, worst ${stats.worst}ms | budget p95 <= ${budgets[phase]}ms`
    );
  }
  console.log(`perf-budget dispatch | ${dispatch}us per pointer-move event | budget <= ${dispatchBudgetUs}us`);

  assert.ok(results.idle.frames >= 90, `idle sampler too thin (${results.idle.frames} frames)`);
  assert.ok(results.zoom.frames >= 100, `zoom sampler too thin (${results.zoom.frames} frames)`);
  assert.ok(results.drag.frames >= 20, `drag sampler too thin (${results.drag.frames} frames)`);
  assert.ok(results.pan.frames >= 20, `pan sampler too thin (${results.pan.frames} frames)`);

  for (const [phase, stats] of Object.entries(results)) {
    assert.ok(
      stats.p95 <= budgets[phase],
      `${phase} p95 frame time ${stats.p95}ms exceeds the ${budgets[phase]}ms budget`
    );
  }
  assert.ok(
    dispatch <= dispatchBudgetUs,
    `pointer-move dispatch cost ${dispatch}us/event exceeds the ${dispatchBudgetUs}us budget ` +
      "(the listener-per-node bug measured 71.2us; the interaction relay measures ~2us)"
  );
  assert.deepEqual(pageErrors, [], "the storm must produce no page errors");

  console.log(`perf-budget: all four phases within budget at ${TOTAL_NODES} nodes`);
} finally {
  if (browser) await browser.close();
  child.kill();
  await writeFile(canvasPath, canvasBackup, "utf8");
  await writeFile(notesPath, notesBackup, "utf8");
}
