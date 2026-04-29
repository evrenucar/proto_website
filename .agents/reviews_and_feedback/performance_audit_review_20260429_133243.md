# Performance Audit Review 20260429 133243

Date: 2026-04-29
Repository: `proto_website`
Scope: `.agents/performance_testing/` hub (README + plan), `scripts/performance-audit.mjs`, `tests/build/performance-audit-build.test.mjs`, latest result folder `.agents/performance_testing/test_results/2026-04-29T11-09-10-119Z/`.

## Summary

The Cosmoboard performance audit harness **runs cleanly end-to-end**: it spawns the preview server on a free port, opens a fresh Chromium context, clears board storage, disables HTTP cache via CDP, and writes `results.json` + `summary.csv` + `report.md` per timestamped folder. The metric surface is rich (navigation timing, board-ready, pan FPS, LoAF, resource sizes, import/export ms, largest resources). The build-wiring test (`tests/build/performance-audit-build.test.mjs`) protects the contract: required script path, runner internals, doc strings, and exported helpers.

What it is **not** yet, despite the docs framing it as "comparison-ready", is a benchmark with signal. The latest captured run is a single iteration; there is no aggregate across iterations, no diff against any prior run, and the workload is too light to surface real bottlenecks in the engine. The runner is a strong foundation; it needs three follow-up passes to turn snapshots into something you can trust as a regression detector.

## Is it clear how to run?

Yes, with two small gotchas.

- README leads with a single command: `npm run perf:audit -- --iterations=1 --trace=false`. Wired through `package.json` → `scripts/performance-audit.mjs`.
- The `--` flag separator is npm-specific. New runners hit it. Not documented.
- The README example uses `--iterations=1`, but the runner default is 3 (`scripts/performance-audit.mjs:38`). The example is what gets copied — copying it gives single-run noisy data.

## Are the results actually useful?

Mixed. The raw JSON is genuinely rich — navigation timing, `boardReadyMs`, FPS sample, LoAF count/blocking, resource counts and sizes, top-10 largest resources, import upload/write timing, export artifact size. As a *snapshot* of one machine on one commit it is useful.

As a *benchmark* the gaps are:

- **Single iteration = no statistical signal.** Latest run: `iterations: 1` (`results.json` env block). Every metric is one sample. No mean / p50 / p95 / stdev. A 10% real regression and CPU jitter look identical.
- **No comparison to any baseline or prior run.** Each result folder is an island. The plan claims comparison-ready (`README.md:34`), but the runner never reads a previous `results.json`. You have to eyeball two folders side by side.
- **Workload is too light to expose engine cliffs.** Latest run: 19 resources, ~500 KB total transfer, 58.4 average FPS during pan, 4 LoAF entries with 27 ms total blocking. Numbers look healthy partly because the current `cosmoboard` board is small. Run the harness against a 1000-node fixture and the picture changes.
- **The "large" import isn't large.** `prepareBenchmarkAssets` (`scripts/performance-audit.mjs:177`) copies the existing participant PDF and generates a 4096×4096 SVG with ~16k `<rect>` primitives. That is a lot of nodes for parse but light on decode/raster.
- **Pan FPS pattern is narrow.** `measurePanningFps` (`scripts/performance-audit.mjs:374`) drives a small circular pointer drag — exercises transform updates only. Doesn't cover stroke drawing, multi-select drag, zoom, undo/redo bursts.
- **Combined xychart is misleading.** In the latest report: `bar [149.2, 141.1, 145.6, 138.9]` then `bar [0.0, 635.2, 646.5, 0.0]` then `bar [0.0, 0.0, 0.0, 382.7]` — load/import/export bunched into one chart with structural zeros. Visually implies a comparison the data doesn't support.
- **Pie chart has a forced floor.** `buildReportMarkdown` computes `value > 0 ? value : 1` for transfer-KB pie slices (`scripts/performance-audit.mjs:683`). Empty buckets get a fake 1 KB slice.

## What doesn't work

- No iteration aggregation (p50/p95/stdev) anywhere in `buildSummaryCsv` / `buildReportMarkdown`.
- No diff-vs-previous-run rendering. No threshold flagging.
- No CPU throttling — cross-machine numbers aren't comparable.
- No Web Vitals (LCP / INP / CLS) and no CDP `Performance.metrics` (CPU time, JS heap). Only nav timing + custom `boardReadyMs`.
- One fixed board only; no heavy-fixture variant.
- Average FPS during pan hides spikes — you want a janky-frame counter, not just a mean.
- README example uses `--iterations=1`, contradicting the default.
- `npm run` `--` flag forwarding gotcha not documented.
- Broader test-suite redness flagged in `current_scratch_pad.md` is unrelated/pre-existing, but worth flagging here for completeness.

## What can be improved

- **Aggregate across iterations.** Default 3 iterations, surface p50 / p95 / min / max per scenario at the top of `report.md`. Per-iteration table stays below.
- **Diff vs previous run.** Read most-recent prior `results.json`, render Δ% per aggregated metric, flag regressions >10%. First run cleanly says "no previous run".
- **Heavy-board scenario.** Generate a ~750-node canvas (mix of strokes / markdown / images), swap in for that scenario only, restore the original in a `finally`. Reuse `measurePanningFps` so the comparison vs the light scenario is apples-to-apples.
- **CDP CPU throttling.** `Emulation.setCPUThrottlingRate: 4` per page after cache disable, configurable via `--cpu-throttle=N`. Makes numbers reproducible across machines.
- **Web Vitals + CDP performance metrics.** Register a `PerformanceObserver` for LCP / CLS / INP estimation in `configureContext`. Snapshot CDP `Performance.metrics` at end of each scenario (CPU time, JS heap, layout count, recalc-style count). Stash under `metrics.runtime`.
- **Lighthouse pass.** One scenario calls the chrome-devtools MCP `lighthouse_audit` against `${baseUrl}/cosmoboard`. Store `lighthouse.json` alongside other artifacts. Skip cleanly if MCP isn't reachable.
- **Janky-frame counter.** Add `jankyFrameCount` (frames > 50 ms) and `jankyFrameRatio` to `panFps`. This is what you actually want to see when stroke rendering jitters.
- **Split the combined xychart.** One chart per family (load / pan FPS / import / export). Each chart only includes scenarios where the metric exists.
- **README polish.** Document the `--` gotcha, align the example with the iteration default, mention the diff-vs-previous behavior so users know first-run shows no diff.

## Recommended next steps (top 3)

In this order, biggest leverage first:

1. **Aggregate across iterations.** Without this every metric is one sample and you can't tell jitter from regressions. Cheap to add — extend `flattenScenarioIterations` and `averageScenarioMetric` (`scripts/performance-audit.mjs:596`).
2. **Diff vs previous run.** Without this each result folder is an island. The plan calls itself comparison-ready; this makes the claim true. Auto-flag metrics worse by >10%.
3. **Heavy-board scenario.** Without this the harness measures an almost-empty board. The drawing engine, hit-testing, and undo stack don't show their costs. Generate the fixture; don't check in a large file.

## Optional follow-ups

- CDP CPU throttling.
- Web Vitals (LCP / CLS / INP estimate) + CDP `Performance.metrics`.
- Lighthouse via chrome-devtools MCP.
- Janky-frame counter.
- Split combined xychart into per-family charts.
- README + plan doc polish (gotchas, new flags, baseline diff behavior).

## References

- Runner: `scripts/performance-audit.mjs`
- Hub: `.agents/performance_testing/README.md`, `.agents/performance_testing/performance_audit_benchmark_plan.md`
- Wiring guard: `tests/build/performance-audit-build.test.mjs`
- Latest local run: `.agents/performance_testing/test_results/2026-04-29T11-09-10-119Z/`
