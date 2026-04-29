import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

assert.equal(
  packageJson.scripts?.["perf:audit"],
  "node scripts/performance-audit.mjs",
  "performance audit runner is opt-in through npm run perf:audit"
);

await access("scripts/performance-audit.mjs");
await access(".agents/performance_testing/README.md");
await access(".agents/performance_testing/performance_audit_benchmark_plan.md");
await access(".agents/performance_testing/test_results/README.md");
await access(".agents/performance_testing/test_results/.gitkeep");
await access(".agents/performance_testing/test_results/.gitignore");

const runnerSource = await readFile("scripts/performance-audit.mjs", "utf8");
assert.match(runnerSource, /scripts\/preview-server\.mjs/, "runner starts the existing preview server");
assert.match(runnerSource, /board:cosmoboard/, "runner clears the Cosmoboard localStorage draft");
assert.match(runnerSource, /board:cosmoboard:meta/, "runner clears the Cosmoboard localStorage metadata");
assert.match(runnerSource, /Network\.setCacheDisabled/, "runner disables HTTP cache through CDP");
assert.match(runnerSource, /Emulation\.setCPUThrottlingRate/, "runner applies CDP CPU throttling");
assert.match(runnerSource, /api\/save-asset/, "runner covers save-asset import routes");
assert.match(runnerSource, /participant-information\.pdf/, "runner uses the existing participant PDF");
assert.match(runnerSource, /performance-assets/, "runner generates temporary large image assets");
assert.match(runnerSource, /results\.json/, "runner writes JSON results");
assert.match(runnerSource, /summary\.csv/, "runner writes CSV results");
assert.match(runnerSource, /report\.md/, "runner writes a Markdown report");
assert.match(runnerSource, /lighthouse/, "runner has a Lighthouse pass");
assert.match(runnerSource, /heavy-board-load-pan/, "runner registers the heavy-board scenario");
assert.match(runnerSource, /jankyFrameCount/, "runner counts janky frames");
assert.match(runnerSource, /largest-contentful-paint/, "runner observes Web Vitals");

const docs = [
  await readFile(".agents/performance_testing/README.md", "utf8"),
  await readFile(".agents/performance_testing/performance_audit_benchmark_plan.md", "utf8")
].join("\n");

for (const required of [
  "Mermaid",
  "flowchart",
  "sequenceDiagram",
  "pie",
  "xychart",
  "dense metric tables",
  "report-only",
  "current `/cosmoboard`",
  "UI-only",
  "full upload/write"
]) {
  assert.match(docs, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}

const audit = await import("../../scripts/performance-audit.mjs?test=1");

assert.deepEqual(
  audit.parseBenchmarkArgs(["--iterations=2", "--trace=false"]).iterations,
  2,
  "parseBenchmarkArgs reads iteration counts"
);
assert.equal(
  audit.parseBenchmarkArgs(["--trace"]).trace,
  true,
  "parseBenchmarkArgs supports boolean trace flag"
);
assert.equal(
  audit.parseBenchmarkArgs(["--cpu-throttle=0"]).cpuThrottle,
  0,
  "parseBenchmarkArgs supports disabling CPU throttling"
);
assert.equal(
  audit.parseBenchmarkArgs(["--regression-threshold=15"]).regressionThreshold,
  15,
  "parseBenchmarkArgs reads regression threshold"
);
assert.equal(
  audit.parseBenchmarkArgs(["--skip-heavy"]).skipHeavy,
  true,
  "parseBenchmarkArgs supports skipping heavy scenario"
);

const stats = audit.computeStats([10, 20, 30, 40, 50]);
assert.equal(stats.count, 5, "computeStats counts inputs");
assert.equal(stats.min, 10, "computeStats finds min");
assert.equal(stats.max, 50, "computeStats finds max");
assert.equal(stats.p50, 30, "computeStats computes p50");
assert.equal(audit.computeStats([]), null, "computeStats handles empty input");

const sampleAggregates = audit.buildRunAggregates({
  scenarios: [
    {
      name: "board-load-pan",
      iterations: [
        { metrics: { load: { boardReadyMs: 100 } } },
        { metrics: { load: { boardReadyMs: 200 } } }
      ]
    }
  ]
});
assert.ok(
  sampleAggregates.byScenario["board-load-pan"]["load.boardReadyMs"],
  "buildRunAggregates surfaces stats per scenario"
);

const diffRows = audit.diffAggregates(
  { byScenario: { s: { "load.boardReadyMs": { p50: 100 } } } },
  { byScenario: { s: { "load.boardReadyMs": { p50: 130 } } } },
  10
);
assert.equal(diffRows.length, 1, "diffAggregates returns one row per metric pair");
assert.equal(diffRows[0].regressed, true, "diffAggregates flags >threshold regressions");

const report = audit.buildReportMarkdown({
  runId: "perf-audit-test",
  timestamp: "2026-04-29T00:00:00.000Z",
  gitSha: "test-sha",
  environment: { node: "v0.0.0", platform: "test", viewport: "1440x960" },
  scenarios: [
    {
      name: "board-load",
      iterations: [
        {
          metrics: {
            load: { navigationMs: 1, boardReadyMs: 2 },
            panFps: { averageFps: 60 },
            import: { durationMs: 3 },
            export: { durationMs: 4 },
            resources: { count: 5, transferSizeBytes: 6 },
            longAnimationFrames: { count: 0, totalBlockingDurationMs: 0 }
          }
        }
      ]
    }
  ]
});

assert.match(report, /```mermaid\s+flowchart/i, "report includes a Mermaid flowchart");
assert.match(report, /sequenceDiagram/i, "report includes a Mermaid sequence diagram");
assert.match(report, /pie title/i, "report includes a Mermaid pie chart");
assert.match(report, /xychart-beta/i, "report includes a Mermaid xychart");
assert.match(report, /\| Scenario \| Iteration \|/, "report includes a dense metric table");

console.log("performance audit build wiring check passed");
