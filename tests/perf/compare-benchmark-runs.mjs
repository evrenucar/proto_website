// Compare two benchmark artifacts.
//
//   node tests/perf/compare-benchmark-runs.mjs before.json after.json
//   node tests/perf/compare-benchmark-runs.mjs before.json after.json --fail-on-regression
//   node tests/perf/compare-benchmark-runs.mjs before.json after.json --json
//
// A benchmark you cannot diff is a number nobody acts on. This prints the
// phases side by side, marks anything that moved by more than the tolerance,
// and can exit non-zero so a script can gate on it.
//
// It refuses to compare runs that are not comparable: a different board,
// different gesture counts, headed against headless. Those differences change
// the numbers by more than any regression would, and comparing them anyway is
// how a benchmark starts lying.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { LOWER_IS_BETTER } from "./bench-metrics.mjs";

// The metrics worth putting in front of a human. The artifact carries more.
const HEADLINE = ["fps", "avgMs", "p95Ms", "worstMs", "framesLost", "spikeCount", "severeSpikeCount", "jankMs"];

const SCALARS = [
  ["mountMs", true],
  ["pointerDispatchUs", true],
  ["jsHeapMb", true],
];

// Per-metric tolerance, in percent, measured rather than guessed. Three
// consecutive default runs on the same commit, headless, 2026-08-01, spread
// between best and worst run:
//
//   p95Ms 0.3-0.6%    avgMs ~2%      fps 0-27%       mountMs 3.3%
//   worstMs up to 50%     framesLost up to 257%      spikeCount up to 400%
//   jankMs up to 254%     pointerDispatchUs 69%      jsHeapMb 0%
//
// So p95 is the sharp instrument and the spike counters are blunt: a single
// scheduling hiccup moves a count by a factor of four. They stay in the table
// because they say *what kind* of bad a phase is, but gating on them at 10%
// would fire on every run and the tool would stop being read. Each number
// below is the measured spread with headroom. Override the lot with
// --tolerance N.
const DEFAULT_TOLERANCE = Object.freeze({
  fps: 35,
  avgMs: 35,
  p95Ms: 20,
  worstMs: 70,
  framesLost: 300,
  spikeCount: 400,
  severeSpikeCount: 400,
  jankMs: 300,
  mountMs: 25,
  pointerDispatchUs: 120,
  jsHeapMb: 30,
});

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i += 1;
    }
  }
  return { flags, positional };
}

function pct(before, after) {
  if (before === 0) return after === 0 ? 0 : Infinity;
  return ((after - before) / Math.abs(before)) * 100;
}

function fmt(value) {
  if (value === null || value === undefined) return "n/a";
  if (typeof value !== "number") return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function fmtDelta(before, after, lowerIsBetter, tolerance) {
  if (typeof before !== "number" || typeof after !== "number") return "";
  const change = pct(before, after);
  if (!Number.isFinite(change)) return "new";
  const sign = change > 0 ? "+" : "";
  let mark = "  ";
  if (lowerIsBetter !== null && Math.abs(change) >= 0.005) {
    const worse = lowerIsBetter ? change > 0 : change < 0;
    // "!!" is past tolerance and worth acting on. "~" moved the wrong way but
    // is inside the noise floor. Marking every wrong-way wiggle "!!" trains
    // you to ignore the marker, which is how a diff tool stops being used.
    if (!worse) mark = "ok";
    else mark = Math.abs(change) > tolerance ? "!!" : " ~";
  }
  return `${sign}${change.toFixed(1)}% ${mark}`;
}

/**
 * @returns {{ comparable: boolean, mismatches: string[], rows: object[], regressions: object[] }}
 */
export function compareRuns(before, after, { tolerance = null } = {}) {
  // One number overrides the measured table, for whoever wants a single knob.
  const tol = (metric) => (tolerance === null ? DEFAULT_TOLERANCE[metric] ?? 30 : tolerance);
  const mismatches = [];
  const check = (label, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(`${label}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  };
  check("board sha256", before.board?.sha256, after.board?.sha256);
  check("embeds mode", before.config?.embeds, after.config?.embeds);
  check("gesture counts",
    [before.config?.idleMs, before.config?.zoomFrames, before.config?.dragSteps, before.config?.panSteps],
    [after.config?.idleMs, after.config?.zoomFrames, after.config?.dragSteps, after.config?.panSteps]);
  check("headless", before.environment?.headless, after.environment?.headless);
  check("viewport", before.environment?.viewport, after.environment?.viewport);

  const rows = [];
  const regressions = [];
  const phases = Object.keys(before.phases || {});
  for (const phase of phases) {
    const a = before.phases[phase];
    const b = after.phases?.[phase];
    if (!b) {
      rows.push({ scope: phase, metric: "*", before: "present", after: "missing", changePct: null, regression: true });
      continue;
    }
    for (const metric of HEADLINE) {
      const av = a[metric];
      const bv = b[metric];
      const change = pct(av, bv);
      const lowerIsBetter = LOWER_IS_BETTER[metric];
      const limit = tol(metric);
      const regression =
        lowerIsBetter !== null && Number.isFinite(change) &&
        (lowerIsBetter ? change > limit : change < -limit);
      const row = { scope: phase, metric, before: av, after: bv, changePct: change, tolerance: limit, regression };
      rows.push(row);
      if (regression) regressions.push(row);
    }
  }
  for (const [key, lowerIsBetter] of SCALARS) {
    const av = before[key];
    const bv = after[key];
    if (typeof av !== "number" || typeof bv !== "number") continue;
    const change = pct(av, bv);
    const limit = tol(key);
    const regression = lowerIsBetter ? change > limit : change < -limit;
    const row = { scope: "run", metric: key, before: av, after: bv, changePct: change, tolerance: limit, regression };
    rows.push(row);
    if (regression) regressions.push(row);
  }

  return { comparable: mismatches.length === 0, mismatches, rows, regressions };
}

export function formatComparison(before, after, result) {
  const lines = [];
  lines.push(`before  ${before.label}  ${before.runAt}  (${before.environment?.chromium || "?"})`);
  lines.push(`after   ${after.label}  ${after.runAt}  (${after.environment?.chromium || "?"})`);
  lines.push(`board   ${before.board?.counts?.total} nodes, sha256 ${String(before.board?.sha256).slice(0, 16)}, embeds=${before.config?.embeds}`);
  lines.push("");
  if (!result.comparable) {
    lines.push("NOT COMPARABLE. These runs do not measure the same thing:");
    for (const m of result.mismatches) lines.push(`  - ${m}`);
    lines.push("");
  }
  lines.push(`${"phase".padEnd(9)} ${"metric".padEnd(17)} ${"before".padStart(10)} ${"after".padStart(10)}   change`);
  lines.push("-".repeat(66));
  let lastScope = null;
  for (const row of result.rows) {
    if (lastScope !== null && row.scope !== lastScope) lines.push("");
    lastScope = row.scope;
    lines.push(
      `${row.scope.padEnd(9)} ${row.metric.padEnd(17)} ${fmt(row.before).padStart(10)} ${fmt(row.after).padStart(10)}   ` +
        fmtDelta(row.before, row.after, LOWER_IS_BETTER[row.metric] ?? true, row.tolerance ?? 30)
    );
  }
  lines.push("");
  lines.push("tolerance per metric, from the measured noise floor: !! past it, ~ inside it, ok improved");
  if (result.regressions.length === 0) {
    lines.push("no metric regressed past its tolerance");
  } else {
    lines.push(`${result.regressions.length} metric(s) regressed past tolerance:`);
    for (const r of result.regressions) {
      lines.push(
        `  ${r.scope}.${r.metric}: ${fmt(r.before)} -> ${fmt(r.after)} ` +
          `(${r.changePct.toFixed(1)}%, tolerance ${r.tolerance}%)`
      );
    }
  }
  return lines.join("\n");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (positional.length !== 2) {
    console.error(
      "usage: node tests/perf/compare-benchmark-runs.mjs <before.json> <after.json> " +
        "[--tolerance <percent, overrides the per-metric table>] [--fail-on-regression] [--json]"
    );
    process.exit(2);
  }
  const tolerance = flags.tolerance === undefined ? null : Number(flags.tolerance);
  const before = JSON.parse(await readFile(positional[0], "utf8"));
  const after = JSON.parse(await readFile(positional[1], "utf8"));
  const result = compareRuns(before, after, { tolerance });

  if (flags.json) {
    console.log(JSON.stringify({ tolerance: tolerance ?? DEFAULT_TOLERANCE, ...result }, null, 2));
  } else {
    console.log(formatComparison(before, after, result));
  }

  if (flags["fail-on-regression"] && (result.regressions.length > 0 || !result.comparable)) {
    process.exitCode = 1;
  }
}
