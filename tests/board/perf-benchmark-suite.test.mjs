// Outcome tests for the content-heavy performance benchmark.
//
// Spawns a preview server and drives a real Chromium (via tests/perf/run-benchmark.mjs),
// so it needs playwright and takes about a minute. It does NOT need a preview
// server already running; the driver starts its own on a free port.
//
// What this file asserts, and why it asserts these things and not others:
//
//   1. RE-CREATABLE. The board is byte-identical for a given seed. This is the
//      requirement the user actually stated. A benchmark whose fixture drifts
//      measures a different thing every time and its history is worthless.
//   2. THE METRICS EXIST AND MEAN SOMETHING. Every phase reports fps, frame
//      loss, spikes and worst frame, and the run proves the gestures had an
//      effect: the camera moved during zoom, the node moved during drag, the
//      images decoded, the embeds mounted. This repo has been bitten three
//      times by tests that asserted a mechanism fired while the feature was
//      broken, so a phase that measured a frozen camera is a failure here,
//      not a pass.
//   3. THE TREE STAYS CLEAN, INCLUDING AFTER A KILL. A killed perf run once
//      left 114 nodes in the sandbox board and broke two unrelated suites from
//      board data. This file hard-kills a run mid-flight (whole process tree,
//      no cleanup handler gets to run) and asserts content/ is byte-identical.
//   4. TWO RUNS CAN BE DIFFED. A benchmark you cannot compare is a number
//      nobody acts on, so the comparison tool has to spot a planted regression
//      and has to refuse to compare runs that measured different things.
//
// Frame budgets are deliberately NOT asserted here. tests/board/perf-budget.test.mjs
// is the CI gate with hard p95 budgets; this suite tests the instrument. The
// one frame assertion is a catastrophe floor (fps above PERF_BENCH_MIN_FPS,
// default 5), because headless Chromium rasters in software and a real budget
// would be noise. The driver takes --assert-budgets when you do want budgets.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { compareRuns } from "../perf/compare-benchmark-runs.mjs";
import { generateBenchmarkBoard } from "../perf/generate-benchmark-board.mjs";
import { METRIC_KEYS } from "../perf/bench-metrics.mjs";
import { ARTIFACT_SCHEMA, PHASES, runBenchmark } from "../perf/run-benchmark.mjs";

const MIN_FPS = Number(process.env.PERF_BENCH_MIN_FPS || 5);
const DISPATCH_BUDGET_US = Number(process.env.PERF_BENCH_DISPATCH_US || 25);
const RUNS_DIR = path.join(".tmp", "perf-bench", "runs");

// A small board keeps the suite near a minute while still carrying all four
// content kinds. The default board (61 nodes) is what you run by hand.
const SUITE_SPEC = { videos: 4, images: 4, notes: 4, texts: 8 };

// --- helpers -----------------------------------------------------------------

async function fingerprintTree(dir) {
  const entries = [];
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const s = await stat(full);
        entries.push(`${path.relative(dir, full).replace(/\\/g, "/")}\t${s.size}\t${s.mtimeMs}`);
      }
    }
  };
  await walk(dir);
  return entries.sort().join("\n");
}

/**
 * Assert the benchmark left content/ alone, and attribute anything that did
 * move so a neighbour's write is not reported as ours.
 *
 * This repo is worked by several agents at once, and during development of
 * this suite another agent created and then deleted two files under
 * content/boards/test-board while a run was in flight. A plain "the tree is
 * identical" assertion turns red for their reason, which is the same disease
 * as a green suite that lies, pointing the other way. So: every path that
 * differs is checked against the window the benchmark actually ran in. A file
 * whose mtime falls inside the window is attributable to us and fails the
 * test. One whose mtime falls outside it could not have been written by this
 * run; it is printed and allowed.
 */
function assertTreeUntouched(before, after, windowStart, windowEnd, label) {
  const parse = (fp) => new Map(fp.split("\n").filter(Boolean).map((line) => {
    const [p, size, mtime] = line.split("\t");
    return [p, { size: Number(size), mtime: Number(mtime) }];
  }));
  const a = parse(before);
  const b = parse(after);

  const ours = [];
  const theirs = [];
  const slack = 1000; // filesystem timestamp granularity plus process startup
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(path);
    const y = b.get(path);
    if (x && y && x.size === y.size && x.mtime === y.mtime) continue;
    const stamps = [x?.mtime, y?.mtime].filter((n) => typeof n === "number");
    const during = stamps.some((m) => m >= windowStart - slack && m <= windowEnd + slack);
    const what = !x ? "created" : !y ? "deleted" : "modified";
    (during ? ours : theirs).push(`${what} ${path}`);
  }

  if (theirs.length) {
    console.log(
      `note: ${theirs.length} file(s) under content/ changed while the ${label} ran, ` +
        `with timestamps outside the run window, so another process wrote them:\n  ${theirs.join("\n  ")}`
    );
  }
  assert.deepEqual(
    ours,
    [],
    `the ${label} must not touch a single file under content/, and these changed inside its window`
  );
}

/**
 * Kill a child and everything it spawned, with no chance for any cleanup
 * handler to run. This is the "your process will be killed halfway" case, and
 * it is the case the benchmark's safety story has to survive.
 */
function hardKillTree(child) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function listRunArtifacts() {
  try {
    return (await readdir(RUNS_DIR)).sort();
  } catch {
    return [];
  }
}

// --- one real run, shared by the assertions below ----------------------------

const contentBefore = await fingerprintTree("content");
const artifactsBefore = await listRunArtifacts();
const runStart = Date.now();

const run = await runBenchmark({
  ...SUITE_SPEC,
  label: "suite",
  idleMs: 900,
  zoomFrames: 40,
  dragSteps: 60,
  panSteps: 25,
  settleMs: 1000,
  quiet: true,
  // A fixed name so repeated suite runs overwrite instead of piling up.
  out: path.join(RUNS_DIR, "suite-latest.json"),
});

const runEnd = Date.now();
const contentAfter = await fingerprintTree("content");

// --- 1. re-creatable ---------------------------------------------------------

test("the same seed produces a byte-identical board", () => {
  const a = generateBenchmarkBoard({ seed: 20260801 });
  const b = generateBenchmarkBoard({ seed: 20260801 });
  assert.equal(a.json, b.json, "two generations with the same seed must be byte-identical");
  assert.equal(a.sha256, b.sha256);
  // No wall-clock anywhere: the fixture must not know what day it is.
  assert.doesNotMatch(
    a.json.replace(/2026-08-01T00:00:00\.000Z/g, ""),
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    "the generated board must carry no timestamp other than its frozen one"
  );
});

test("a different seed produces a different board with the same shape", () => {
  const a = generateBenchmarkBoard({ seed: 20260801 });
  const b = generateBenchmarkBoard({ seed: 7 });
  assert.notEqual(a.sha256, b.sha256, "changing the seed must change the content");
  assert.deepEqual(a.counts, b.counts, "changing the seed must not change the node mix");
});

test("the node mix is exactly what was asked for, and every id is unique", () => {
  const board = generateBenchmarkBoard({ videos: 5, images: 6, notes: 7, texts: 9 });
  const byType = {};
  for (const node of board.canvas.nodes) byType[node.type] = (byType[node.type] || 0) + 1;
  assert.equal(byType.link, 5, "5 video nodes");
  assert.equal(byType.file, 6, "6 image nodes");
  assert.equal(byType.markdown, 7, "7 markdown nodes");
  assert.equal(byType.text, 10, "9 text nodes plus the drag target");
  const ids = new Set(board.canvas.nodes.map((n) => n.id));
  assert.equal(ids.size, board.canvas.nodes.length, "node ids must be unique");
  const videoUrls = new Set(board.canvas.nodes.filter((n) => n.type === "link").map((n) => n.url));
  assert.equal(videoUrls.size, 5, "each video node must be a distinct video, not the same one five times");
});

test("the generator CLI refuses to write the benchmark board into content/", async () => {
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["tests/perf/generate-benchmark-board.mjs", "--out", "content/boards/test-board/current.canvas"],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += String(c)));
    child.on("exit", (code) => resolve({ code, stderr }));
  });
  assert.equal(result.code, 2, "writing under content/ must be refused, not merely discouraged");
  assert.match(result.stderr, /refusing to write/i);
});

// --- 2. the driver produces every named metric, and the gestures did something

test("the artifact reports fps, frame loss, delay spikes and worst frame for every phase", () => {
  assert.equal(run.schema, ARTIFACT_SCHEMA);
  for (const phase of PHASES) {
    const m = run.phases[phase];
    assert.ok(m, `phase "${phase}" must be present in the artifact`);
    for (const key of METRIC_KEYS) {
      assert.equal(typeof m[key], "number", `${phase}.${key} must be a number, got ${typeof m[key]}`);
      assert.ok(Number.isFinite(m[key]), `${phase}.${key} must be finite`);
    }
    assert.ok(m.frames > 10, `${phase} sampled only ${m.frames} frames; that is too thin to mean anything`);
    assert.ok(m.fps > MIN_FPS, `${phase} ran at ${m.fps} fps, under the ${MIN_FPS} fps catastrophe floor`);
    assert.ok(m.worstMs >= m.p95Ms, `${phase} worst frame must be at least the p95`);
    assert.ok(m.p95Ms >= m.p50Ms, `${phase} p95 must be at least the p50`);
    assert.ok(m.frameLossPct >= 0 && m.frameLossPct <= 100, `${phase} frame loss must be a percentage`);
    assert.ok(m.severeSpikeCount <= m.spikeCount, `${phase} a severe spike is also a spike`);
    assert.equal(m.longestStallMs, m.worstMs);
    assert.ok(Array.isArray(m.histogramMs) && m.histogramMs.length > 0, `${phase} must carry a frame histogram`);
    assert.equal(
      m.histogramMs.reduce((n, b) => n + b.count, 0),
      m.frames,
      `${phase} histogram must account for every sampled frame`
    );
  }
});

test("the run measured a board that really held videos, images, notes and text", () => {
  assert.equal(run.board.mountedNodeCount, run.board.counts.total, "every generated node must have mounted");
  assert.equal(run.content.imagesRendered, SUITE_SPEC.images, "every image node must have rendered an <img>");
  assert.equal(run.content.markdownBodies, SUITE_SPEC.notes, "every markdown node must have rendered a body");
  assert.ok(
    run.content.liveEmbedIframes >= 1,
    "at least one video must have booted a live iframe, otherwise this benchmark is not measuring embeds at all"
  );
  assert.ok(
    run.content.liveEmbedIframes <= SUITE_SPEC.videos,
    "more live iframes than video nodes means something mounted twice"
  );
  assert.ok(run.mountMs > 0, "mount time must be measured");
});

test("the gestures moved what they were supposed to move", () => {
  // The whole point. A zoom phase that timed a camera which never moved is
  // the exact failure that hid the markdown zoom regression behind a green
  // suite for weeks.
  assert.equal(run.outcomes.cameraMovedDuringZoom, true, "the zoom phase must actually have moved the camera");
  assert.equal(run.outcomes.nodeMovedDuringDrag, true, "the drag phase must actually have moved a node");
});

test("pointer-move dispatch cost is measured and within budget", () => {
  // The metric that caught the listener-per-node bug at 71.2us/event, and the
  // one number here that is stable across rendering environments.
  assert.ok(run.pointerDispatchUs > 0, "dispatch cost must be measured");
  assert.ok(
    run.pointerDispatchUs <= DISPATCH_BUDGET_US,
    `pointer-move dispatch cost ${run.pointerDispatchUs}us/event exceeds the ${DISPATCH_BUDGET_US}us budget ` +
      "(listener-per-node measured 71.2us; the interaction relay measures 2 to 6us)"
  );
});

test("the run produced no page errors", () => {
  assert.deepEqual(run.pageErrors, [], "a benchmark that throws is measuring an error path");
});

// --- 3. the tree stays clean -------------------------------------------------

test("a completed run leaves content/ byte-identical", () => {
  assertTreeUntouched(contentBefore, contentAfter, runStart, runEnd, "completed benchmark run");
});

test("the run wrote its artifact under .tmp and nowhere else", () => {
  const rel = path.relative(process.cwd(), run.artifactPath).replace(/\\/g, "/");
  assert.ok(rel.startsWith(".tmp/"), `artifact must live under .tmp/, got ${rel}`);
});

test("no write API was ever allowed to reach the server", () => {
  // The board runtime may attempt a save; the driver aborts it at the network
  // layer. Recording the attempts is how we know the block is doing work
  // rather than being decorative.
  for (const attempt of run.blockedWriteAttempts) {
    assert.match(attempt, /^\/api\//, `blocked request ${attempt} should be an API route`);
  }
  assert.ok(Array.isArray(run.blockedWriteAttempts));
});

test("a run hard-killed mid-flight still leaves content/ byte-identical", async () => {
  const before = await fingerprintTree("content");
  const artifactsAtStart = await listRunArtifacts();
  const killStart = Date.now();

  const child = spawn(
    process.execPath,
    [
      "tests/perf/run-benchmark.mjs",
      "--label", "killed-on-purpose",
      "--videos", "4", "--images", "4", "--notes", "4", "--texts", "8",
      "--idle-ms", "4000", "--zoom-frames", "40", "--drag-steps", "60",
      "--pan-steps", "25", "--settle-ms", "1000",
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" }
  );

  // Wait until the run is genuinely under way (the first phase has reported),
  // then pull the plug on the whole tree. No signal handler, no finally block,
  // no atomic rename gets to run.
  const started = await new Promise((resolve) => {
    let out = "";
    const timer = setTimeout(() => resolve(false), 90000);
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
      if (/^idle\s/m.test(out)) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    child.on("exit", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  assert.ok(started, "the interrupted run must have reached its first phase before being killed");

  hardKillTree(child);
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.on("exit", resolve);
  });
  // Give the OS a moment to reap the killed tree before reading the tree back.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const afterKill = await fingerprintTree("content");
  assertTreeUntouched(before, afterKill, killStart, Date.now(), "hard-killed benchmark run");

  const artifactsNow = await listRunArtifacts();
  const added = artifactsNow.filter((n) => !artifactsAtStart.includes(n));
  assert.deepEqual(
    added.filter((n) => n.endsWith(".part")),
    [],
    "a killed run must not leave a half-written artifact a later comparison would trust"
  );
  assert.deepEqual(
    added.filter((n) => n.startsWith("killed-on-purpose")),
    [],
    "a killed run must not publish an artifact for a run that never finished"
  );
});

// --- 4. two runs can be diffed ----------------------------------------------

test("comparing a run with itself reports no regression", () => {
  const result = compareRuns(run, run);
  assert.equal(result.comparable, true, `runs should be comparable, mismatches: ${result.mismatches.join("; ")}`);
  assert.deepEqual(result.regressions, [], "a run cannot have regressed against itself");
  assert.ok(result.rows.length >= PHASES.length * 8, "every phase must contribute rows to the comparison");
});

test("a planted regression is caught, and the CLI exits non-zero on it", async () => {
  const worse = structuredClone(run);
  worse.label = "planted-regression";
  worse.phases.zoomOut.p95Ms = run.phases.zoomOut.p95Ms * 3;
  worse.phases.zoomOut.fps = run.phases.zoomOut.fps / 3;
  worse.pointerDispatchUs = run.pointerDispatchUs * 20; // the listener-per-node shape

  const result = compareRuns(run, worse);
  assert.equal(result.comparable, true);
  const hit = (scope, metric) => result.regressions.some((r) => r.scope === scope && r.metric === metric);
  assert.ok(hit("zoomOut", "p95Ms"), "a 3x worse p95 must be reported as a regression");
  assert.ok(hit("zoomOut", "fps"), "a third of the frame rate must be reported as a regression");
  assert.ok(hit("run", "pointerDispatchUs"), "a 20x pointer dispatch cost must be reported as a regression");

  // And through the CLI, because that is how a script would gate on it.
  const { writeFile, mkdir, rm } = await import("node:fs/promises");
  const dir = path.join(".tmp", "perf-bench", "compare-check");
  await mkdir(dir, { recursive: true });
  const beforePath = path.join(dir, "before.json");
  const afterPath = path.join(dir, "after.json");
  await writeFile(beforePath, JSON.stringify(run, null, 2), "utf8");
  await writeFile(afterPath, JSON.stringify(worse, null, 2), "utf8");
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["tests/perf/compare-benchmark-runs.mjs", beforePath, afterPath, "--fail-on-regression"],
      { cwd: process.cwd(), stdio: "ignore" }
    );
    child.on("exit", resolve);
  });
  assert.equal(code, 1, "--fail-on-regression must exit non-zero when a metric regressed");
  await rm(dir, { recursive: true, force: true });
});

test("runs that measured different things refuse to be compared", () => {
  const other = structuredClone(run);
  other.board.sha256 = "0".repeat(64);
  other.config.embeds = "preview";
  const result = compareRuns(run, other);
  assert.equal(result.comparable, false, "a different board and a different embed mode are not a regression, they are a different experiment");
  assert.ok(result.mismatches.some((m) => m.includes("board sha256")));
  assert.ok(result.mismatches.some((m) => m.includes("embeds mode")));
});

// --- a human-readable trace of what was measured -----------------------------

test("summary", () => {
  const lines = [
    `benchmark suite: ${run.board.counts.total} nodes ` +
      `(${run.board.counts.video} video, ${run.board.counts.image} image, ` +
      `${run.board.counts.markdown} markdown, ${run.board.counts.text} text), embeds=${run.config.embeds}`,
    `mount ${run.mountMs}ms, dispatch ${run.pointerDispatchUs}us/event, ` +
      `${run.content.liveEmbedIframes} live iframes at rest / ${run.content.liveEmbedIframesAfterZoom} after zoom`,
  ];
  for (const phase of PHASES) {
    const m = run.phases[phase];
    lines.push(
      `  ${phase.padEnd(8)} ${m.fps.toFixed(1).padStart(5)} fps, p95 ${m.p95Ms}ms, worst ${m.worstMs}ms, ` +
        `${m.framesLost} frames lost (${m.frameLossPct}%), ${m.spikeCount} spikes / ${m.severeSpikeCount} severe`
    );
  }
  console.log(lines.join("\n"));
  assert.ok(true);
});
