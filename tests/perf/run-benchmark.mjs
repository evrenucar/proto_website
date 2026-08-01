// Cosmoboard UI responsiveness benchmark: driver.
//
//   node tests/perf/run-benchmark.mjs
//   node tests/perf/run-benchmark.mjs --label before --videos 24 --images 24
//   node tests/perf/run-benchmark.mjs --embeds live --headed
//   node tests/perf/compare-benchmark-runs.mjs .tmp/perf-bench/runs/a.json .tmp/perf-bench/runs/b.json
//
// This is the content-heavy benchmark: a deterministic board of videos,
// images, markdown notes and text, driven through scripted zoom, drag and pan
// while sampling requestAnimationFrame, and written out as a machine-readable
// artifact plus a human summary.
//
// It is NOT the CI gate. tests/board/perf-budget.test.mjs is the gate: 120
// text nodes, four phases, hard p95 budgets, fast. This one is the richer
// instrument you reach for when you want to know *why*, and it records rather
// than fails. Budgets here are advisory and only enforced when you ask for it
// with --assert-budgets, because headless Chromium rasters in software: on
// this machine a phase that runs 60fps in a real browser reads 6-15fps here.
// Absolute numbers are only comparable between runs in the same environment,
// which is exactly what compare-benchmark-runs.mjs is for.
//
// Safety, learned the hard way after a killed perf run left 114 nodes in the
// sandbox board and broke two unrelated suites from board *data*:
//   - the benchmark board is never written to disk; it is served into the
//     page by intercepting the canvas fetch,
//   - every write API is aborted at the network layer,
//   - autosave is switched off in localStorage before page scripts run,
//   - nothing outside .tmp/perf-bench/ is ever created.
// Kill this process at any moment and the repository is untouched.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import { benchmarkEmbedHtml, benchmarkPng } from "./bench-assets.mjs";
import { formatPhaseLine, summariseFrames } from "./bench-metrics.mjs";
import { generateBenchmarkBoard } from "./generate-benchmark-board.mjs";

export const ARTIFACT_SCHEMA = "cosmoboard-perf-benchmark/1";
export const PHASES = Object.freeze(["idle", "drag", "pan", "zoomOut", "zoomIn"]);
const RUNS_DIR = path.join(".tmp", "perf-bench", "runs");

// Advisory budgets, p95 frame time in ms, measured headless on the reference
// machine 2026-08-01 and rounded up with headroom. Env-tunable in the same
// spirit as perf-budget.test.mjs, because a slower CI box is not a regression.
const DEFAULT_BUDGETS = {
  idle: Number(process.env.PERF_BENCH_IDLE_P95_MS || 40),
  zoomOut: Number(process.env.PERF_BENCH_ZOOM_P95_MS || 400),
  zoomIn: Number(process.env.PERF_BENCH_ZOOM_P95_MS || 400),
  drag: Number(process.env.PERF_BENCH_DRAG_P95_MS || 250),
  pan: Number(process.env.PERF_BENCH_PAN_P95_MS || 250),
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview server did not start in time")), timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`preview server exited early with code ${code}`));
    });
  });
}

// --- in-page sampler ---------------------------------------------------------
// Raw requestAnimationFrame deltas, summarised in Node so the driver and the
// comparison tool share one definition of every metric.

const SAMPLER_START = () => {
  window.__benchDeltas = [];
  window.__benchOn = true;
  let last = 0;
  const loop = (now) => {
    if (!window.__benchOn) return;
    if (last > 0) window.__benchDeltas.push(now - last);
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

const SAMPLER_STOP = () => {
  window.__benchOn = false;
  // Drop the first two deltas: the first is the gap since the previous frame
  // and the second still carries the sampler's own warm-up.
  return (window.__benchDeltas || []).slice(2);
};

/**
 * Run the benchmark. Returns the artifact object.
 * @param {object} options
 */
export async function runBenchmark(options = {}) {
  const opts = {
    seed: Number(options.seed ?? process.env.PERF_BENCH_SEED ?? 20260801),
    videos: Number(options.videos ?? process.env.PERF_BENCH_VIDEOS ?? 12),
    images: Number(options.images ?? process.env.PERF_BENCH_IMAGES ?? 12),
    notes: Number(options.notes ?? process.env.PERF_BENCH_NOTES ?? 12),
    texts: Number(options.texts ?? process.env.PERF_BENCH_TEXTS ?? 24),
    cols: Number(options.cols ?? process.env.PERF_BENCH_COLS ?? 8),
    idleMs: Number(options.idleMs ?? process.env.PERF_BENCH_IDLE_MS ?? 2000),
    zoomFrames: Number(options.zoomFrames ?? process.env.PERF_BENCH_ZOOM_FRAMES ?? 90),
    dragSteps: Number(options.dragSteps ?? process.env.PERF_BENCH_DRAG_STEPS ?? 160),
    panSteps: Number(options.panSteps ?? process.env.PERF_BENCH_PAN_STEPS ?? 60),
    settleMs: Number(options.settleMs ?? process.env.PERF_BENCH_SETTLE_MS ?? 1500),
    embeds: String(options.embeds ?? process.env.PERF_BENCH_EMBEDS ?? "stub"),
    label: String(options.label ?? process.env.PERF_BENCH_LABEL ?? "run"),
    headed: Boolean(options.headed ?? process.env.PERF_BENCH_HEADED),
    port: Number(options.port ?? process.env.PERF_BENCH_PORT ?? 0) || 0,
    width: Number(options.width ?? 1440),
    height: Number(options.height ?? 960),
    frameBudgetMs: Number(options.frameBudgetMs ?? process.env.PERF_BENCH_FRAME_BUDGET_MS ?? 1000 / 60),
    spikeFactor: Number(options.spikeFactor ?? process.env.PERF_BENCH_SPIKE_FACTOR ?? 2),
    severeFactor: Number(options.severeFactor ?? process.env.PERF_BENCH_SEVERE_FACTOR ?? 4),
    out: options.out ?? process.env.PERF_BENCH_OUT ?? null,
    // Serve a different JavaScript/braindump.js into the page instead of the
    // one on disk. This is how you benchmark a candidate fix in a repo where
    // agents are forbidden from writing the shared runtime: patch a scratch
    // copy, point --runtime at it, diff the two artifacts.
    runtime: options.runtime ?? process.env.PERF_BENCH_RUNTIME ?? null,
    quiet: Boolean(options.quiet),
    assertBudgets: Boolean(options.assertBudgets ?? process.env.PERF_BENCH_ASSERT_BUDGETS),
    budgets: { ...DEFAULT_BUDGETS, ...(options.budgets || {}) },
  };
  if (!["stub", "live", "preview"].includes(opts.embeds)) {
    throw new Error(`--embeds must be stub, live or preview, got "${opts.embeds}"`);
  }

  const board = generateBenchmarkBoard({
    seed: opts.seed,
    videos: opts.videos,
    images: opts.images,
    notes: opts.notes,
    texts: opts.texts,
    cols: opts.cols,
  });
  // "preview" keeps the same board but never lets an iframe mount, which
  // isolates board cost from embed cost. Say which you measured; they are
  // different questions.
  const boardJson =
    opts.embeds === "preview"
      ? JSON.stringify(
          {
            ...board.canvas,
            nodes: board.canvas.nodes.map((n) => (n.type === "link" ? { ...n, embedMode: "preview" } : n)),
          },
          null,
          2
        ) + "\n"
      : board.json;

  const port = opts.port || (await freePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const boardUrl = `${baseUrl}/content/boards/test-board.html`;

  const log = opts.quiet ? () => {} : (...args) => console.log(...args);

  let server = null;
  let browser = null;
  const cleanup = async () => {
    try {
      if (browser) await browser.close();
    } catch {}
    browser = null;
    try {
      if (server) server.kill();
    } catch {}
    server = null;
  };
  const onSignal = () => {
    // A killed run must not leave a browser or a preview server behind. It
    // cannot leave repository state behind: it never wrote any.
    cleanup().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const pageErrors = [];
  const blockedWrites = [];

  try {
    server = spawn(process.execPath, ["scripts/preview-server.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForServer(server);

    browser = await chromium.launch({ headless: !opts.headed });
    const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height } });

    // Autosave off before any page script runs, and no stale cached board in
    // localStorage, so the injected fixture is what mounts.
    await context.addInitScript(() => {
      if (window.top !== window) return; // never touch a guest frame's storage
      try {
        localStorage.setItem(
          "board:test-board:settings",
          JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
        );
        localStorage.removeItem("board:test-board");
        localStorage.removeItem("board:test-board:meta");
      } catch {}
    });

    // One dispatching router, four mutually exclusive predicates, so no glob
    // or ordering surprise decides whether a write reaches disk.
    const isLocal = (u) => u.origin === baseUrl;
    await context.route(
      (u) => isLocal(new URL(u)) && new URL(u).pathname === "/content/boards/test-board/current.canvas",
      (route) => route.fulfill({ status: 200, contentType: "application/json", body: boardJson })
    );
    await context.route(
      (u) => isLocal(new URL(u)) && new URL(u).pathname.startsWith("/perf-bench-assets/"),
      (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop() || "";
        const imageMatch = name.match(/^img-(\d+)\.png$/);
        if (imageMatch) {
          return route.fulfill({
            status: 200,
            contentType: "image/png",
            body: benchmarkPng(opts.seed, Number(imageMatch[1])),
          });
        }
        const noteMatch = name.match(/^note-(\d+)\.md$/);
        if (noteMatch) {
          const node = board.canvas.nodes.find((n) => n.id === `perf-note-${noteMatch[1]}`);
          return route.fulfill({ status: 200, contentType: "text/markdown", body: node?._rawMarkdown || "" });
        }
        return route.fulfill({ status: 404, body: "not a benchmark asset" });
      }
    );
    if (opts.runtime) {
      const { readFile } = await import("node:fs/promises");
      const runtimeSource = await readFile(path.resolve(opts.runtime), "utf8");
      await context.route(
        (u) => isLocal(new URL(u)) && new URL(u).pathname === "/JavaScript/braindump.js",
        (route) =>
          route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: runtimeSource })
      );
    }
    await context.route(
      (u) => isLocal(new URL(u)) && new URL(u).pathname.startsWith("/api/"),
      (route) => {
        // Everything that could write, and the outbound probes, stop here.
        blockedWrites.push(new URL(route.request().url()).pathname);
        return route.abort();
      }
    );
    await context.route(
      (u) => !isLocal(new URL(u)),
      (route) => {
        const url = new URL(route.request().url());
        const isYouTube = /(^|\.)youtube\.com$/.test(url.hostname);
        if (opts.embeds === "live" && isYouTube) return route.continue();
        if (isYouTube && url.pathname.startsWith("/embed/")) {
          return route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: benchmarkEmbedHtml(url.pathname.split("/")[2] || "unknown"),
          });
        }
        if (isYouTube && url.pathname === "/oembed") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ title: "Benchmark video", author_name: "bench", thumbnail_url: "" }),
          });
        }
        // Nothing else may leave the machine: a benchmark that depends on the
        // network is not reproducible.
        return route.abort();
      }
    );

    const page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const url = msg.location()?.url || "";
      if (!url || url.startsWith(baseUrl)) pageErrors.push(msg.text());
    });

    // --- mount ---------------------------------------------------------------
    const expectedNodes = board.counts.total;
    const mountStart = Date.now();
    await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (n) => document.querySelectorAll(".bd-item").length >= n,
      expectedNodes,
      { timeout: 30000 }
    );
    const mountMs = Date.now() - mountStart;

    const mountedNodeCount = await page.evaluate(() => document.querySelectorAll(".bd-item").length);
    assert.equal(
      mountedNodeCount,
      expectedNodes,
      `benchmark board must mount all ${expectedNodes} nodes, saw ${mountedNodeCount}`
    );

    await page.waitForTimeout(opts.settleMs);

    const embeds = await page.evaluate(() => ({
      liveIframes: document.querySelectorAll(".bd-embed-iframe").length,
      images: document.querySelectorAll(".bd-file-cropbox img").length,
      markdownBodies: document.querySelectorAll(".bd-markdown-body:not(.bd-markdown-fullscreen-body)").length,
    }));

    const phases = {};
    const runPhase = async (name, body) => {
      await page.evaluate(SAMPLER_START);
      await body();
      const deltas = await page.evaluate(SAMPLER_STOP);
      phases[name] = summariseFrames(deltas, {
        frameBudgetMs: opts.frameBudgetMs,
        spikeFactor: opts.spikeFactor,
        severeFactor: opts.severeFactor,
      });
      log(formatPhaseLine(name, phases[name]));
    };

    // --- idle: nothing moves. Any cost here is our own frame loop, embed
    // timers, and whatever the guests are doing when left alone.
    await runPhase("idle", () => page.waitForTimeout(opts.idleMs));

    // --- pointer dispatch: the metric that caught the listener-per-node bug
    // at 71.2us/event. Pure main-thread CPU, so it stays meaningful across
    // rendering environments where the frame numbers do not.
    const pointerDispatchUs = await page.evaluate(() => {
      const count = 2000;
      // Warm-up pass so JIT compilation does not land inside the measurement.
      for (let i = 0; i < 200; i++) {
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 300, bubbles: true }));
      }
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        window.dispatchEvent(
          new MouseEvent("mousemove", { clientX: 300 + (i % 50), clientY: 300 + (i % 30), bubbles: true })
        );
      }
      return Number((((performance.now() - start) * 1000) / count).toFixed(3));
    });

    // Phase order matters and is not arbitrary. Drag runs first, at the
    // fixture camera, so the node it grabs is at a known screen position on
    // every run. Pan is symmetric (out and back the same distance) so it hands
    // the camera back where it found it. Zoom runs last because a wheel storm
    // does NOT return the camera to where it started, and a drag after it
    // would be grabbing whatever happened to be under the cursor.

    // --- drag a node in circles through real input, the interaction relay
    // under load.
    const dragBox = await page.locator("#perf-drag-handle").boundingBox();
    if (!dragBox) throw new Error("drag target #perf-drag-handle is not in the layout");
    const dragCx = dragBox.x + dragBox.width / 2;
    const dragCy = dragBox.y + dragBox.height / 2;
    if (dragCx < 0 || dragCy < 0 || dragCx > opts.width || dragCy > opts.height) {
      throw new Error(
        `drag target is offscreen at (${Math.round(dragCx)}, ${Math.round(dragCy)}); ` +
          "the fixture camera and the layout have drifted apart"
      );
    }
    const dragStart = await page.evaluate(() => {
      const el = document.getElementById("perf-drag-handle");
      return { left: el.style.left, top: el.style.top };
    });
    await page.mouse.move(dragCx, dragCy);
    await page.mouse.down();
    await runPhase("drag", async () => {
      for (let i = 0; i < opts.dragSteps; i++) {
        const angle = (i / 40) * Math.PI * 2;
        await page.mouse.move(dragCx + Math.cos(angle) * 140, dragCy + Math.sin(angle) * 100);
      }
    });
    await page.mouse.up();
    const dragEnd = await page.evaluate(() => {
      const el = document.getElementById("perf-drag-handle");
      return { left: el.style.left, top: el.style.top };
    });
    const nodeMoved = dragStart.left !== dragEnd.left || dragStart.top !== dragEnd.top;
    await page.keyboard.press("Control+z");

    // --- middle-button pan sweep out and back.
    const panCx = Math.round(opts.width / 2);
    const panCy = Math.round(opts.height / 2);
    await page.mouse.move(panCx, panCy);
    await page.mouse.down({ button: "middle" });
    await runPhase("pan", async () => {
      for (let i = 0; i < opts.panSteps; i++) await page.mouse.move(panCx - i * 9, panCy - i * 5);
      for (let i = opts.panSteps; i >= 0; i--) await page.mouse.move(panCx - i * 9, panCy - i * 5);
    });
    await page.mouse.up({ button: "middle" });

    // --- zoom out then zoom in, one wheel event per frame so the camera
    // really travels and new content really enters the viewport.
    const wheelStorm = (direction, frames) =>
      page.evaluate(
        async ({ direction, frames }) => {
          const viewport = document.querySelector(".braindump-viewport");
          const rect = viewport.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          await new Promise((resolve) => {
            let i = 0;
            const step = () => {
              viewport.dispatchEvent(
                new WheelEvent("wheel", {
                  deltaY: direction * 120,
                  clientX: cx,
                  clientY: cy,
                  bubbles: true,
                  cancelable: true,
                })
              );
              i += 1;
              if (i < frames) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          });
        },
        { direction, frames }
      );

    const cameraBefore = await page.evaluate(() => {
      const canvas = document.querySelector("#braindump-canvas");
      return canvas ? canvas.style.transform : "";
    });
    await runPhase("zoomOut", () => wheelStorm(1, opts.zoomFrames));
    const cameraAfterOut = await page.evaluate(() => {
      const canvas = document.querySelector("#braindump-canvas");
      return canvas ? canvas.style.transform : "";
    });
    await runPhase("zoomIn", () => wheelStorm(-1, opts.zoomFrames));

    // A zoom phase that measured a camera which never moved would be a lie.
    // This is the mechanism-versus-outcome trap that hid the markdown zoom
    // regression behind a green suite, so the driver refuses to report a
    // zoom number it cannot show moved the camera.
    const cameraMoved = cameraBefore !== cameraAfterOut;

    // Lazy embeds only mount within 600px of the viewport, so a zoom-out pulls
    // more of the board into range and boots more iframes. The difference
    // between these two numbers IS the lazy-embed machinery, and it is worth
    // reading next to the zoom frame times, which it partly causes.
    const embedsAfterZoom = await page.evaluate(
      () => document.querySelectorAll(".bd-embed-iframe").length
    );

    const heap = await page.evaluate(() =>
      performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
    );

    const artifact = {
      schema: ARTIFACT_SCHEMA,
      label: opts.label,
      runAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: `${process.platform} ${os.release()}`,
        cpu: os.cpus()[0]?.model || "unknown",
        cpuCount: os.cpus().length,
        totalMemMb: Math.round(os.totalmem() / 1048576),
        chromium: browser.version(),
        headless: !opts.headed,
        viewport: { width: opts.width, height: opts.height },
        // Headless Chromium rasters in software. Frame numbers from a headless
        // run and a headed run are not comparable; only compare like with like.
        note: opts.headed ? "headed, GPU raster path" : "headless, software raster (SwiftShader)",
      },
      config: {
        embeds: opts.embeds,
        seed: opts.seed,
        idleMs: opts.idleMs,
        zoomFrames: opts.zoomFrames,
        dragSteps: opts.dragSteps,
        panSteps: opts.panSteps,
        settleMs: opts.settleMs,
        frameBudgetMs: opts.frameBudgetMs,
        spikeFactor: opts.spikeFactor,
        severeFactor: opts.severeFactor,
        runtime: opts.runtime ? path.relative(process.cwd(), path.resolve(opts.runtime)).replace(/\\/g, "/") : null,
      },
      board: {
        sha256: board.sha256,
        bytes: Buffer.byteLength(boardJson, "utf8"),
        counts: board.counts,
        mountedNodeCount,
      },
      content: {
        liveEmbedIframes: embeds.liveIframes,
        liveEmbedIframesAfterZoom: embedsAfterZoom,
        imagesRendered: embeds.images,
        markdownBodies: embeds.markdownBodies,
      },
      outcomes: {
        cameraMovedDuringZoom: cameraMoved,
        nodeMovedDuringDrag: nodeMoved,
      },
      mountMs,
      pointerDispatchUs,
      jsHeapMb: heap,
      phases,
      budgets: opts.budgets,
      pageErrors,
      blockedWriteAttempts: blockedWrites,
    };

    log("");
    log(
      `mount ${mountMs}ms  |  ${mountedNodeCount} nodes  |  ` +
        `${embeds.liveIframes} live embed iframes at rest (${embedsAfterZoom} after the zoom storm), ` +
        `${embeds.images} images, ${embeds.markdownBodies} notes`
    );
    log(`pointer dispatch ${pointerDispatchUs}us/event  |  js heap ${heap ?? "n/a"}MB  |  embeds=${opts.embeds}`);
    if (!cameraMoved) log("WARNING: the zoom phase did not move the camera. The zoom numbers are meaningless.");
    if (!nodeMoved) log("WARNING: the drag phase did not move the node. The drag numbers are meaningless.");
    if (pageErrors.length) log(`page errors: ${pageErrors.length}`);

    const outPath = path.resolve(
      opts.out ||
        path.join(RUNS_DIR, `${opts.label.replace(/[^\w.-]+/g, "-")}-${artifact.runAt.replace(/[:.]/g, "-")}.json`)
    );
    // The same guard generate-benchmark-board.mjs carries. Without it,
    // --out content/boards/braindump/current.canvas silently overwrites a real
    // board with a benchmark artifact. "The build does not delete content/" is
    // one of only two properties this repo treats as gating a release, so an
    // unguarded writer pointed at an arbitrary absolute path is the wrong
    // asymmetry to leave lying around, deliberate misuse or not.
    const contentDir = path.resolve("content");
    if (outPath === contentDir || outPath.startsWith(contentDir + path.sep)) {
      console.error("refusing to write a benchmark artifact under content/. Use .tmp/ or tests/perf/runs/.");
      process.exit(2);
    }
    await mkdir(path.dirname(outPath), { recursive: true });
    // Write through a temporary name and rename, so a run killed mid-write
    // cannot leave a half-parsed artifact that a later compare would trust.
    const tmpPath = `${outPath}.part`;
    await writeFile(tmpPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await rename(tmpPath, outPath);
    artifact.artifactPath = outPath;
    log(`\nartifact: ${outPath}`);

    if (opts.assertBudgets) {
      for (const phase of PHASES) {
        const budget = opts.budgets[phase];
        assert.ok(
          phases[phase].p95Ms <= budget,
          `${phase} p95 ${phases[phase].p95Ms}ms exceeds the advisory ${budget}ms budget`
        );
      }
    }

    return artifact;
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await cleanup();
  }
}

// --- CLI ---------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  // Check the destination before running anything. There is a second guard at
  // the write itself, but a benchmark takes minutes, and refusing only at the
  // end means the user watches a full run before being told the path was never
  // allowed. Fail on the argument, not on the artifact.
  if (args.out) {
    const target = path.resolve(String(args.out));
    const contentDir = path.resolve("content");
    if (target === contentDir || target.startsWith(contentDir + path.sep)) {
      console.error("refusing to write a benchmark artifact under content/. Use .tmp/ or tests/perf/runs/.");
      process.exit(2);
    }
  }

  const options = {};
  const numeric = [
    "seed", "videos", "images", "notes", "texts", "cols", "idleMs", "zoomFrames",
    "dragSteps", "panSteps", "settleMs", "port", "width", "height",
  ];
  const alias = {
    "idle-ms": "idleMs", "zoom-frames": "zoomFrames", "drag-steps": "dragSteps",
    "pan-steps": "panSteps", "settle-ms": "settleMs",
  };
  for (const [key, value] of Object.entries(args)) {
    const name = alias[key] || key;
    if (name === "assert-budgets") options.assertBudgets = true;
    else if (numeric.includes(name)) options[name] = Number(value);
    else options[name] = value;
  }
  try {
    await runBenchmark(options);
  } catch (error) {
    console.error(`\nbenchmark failed: ${error.message}`);
    process.exitCode = 1;
  }
}
