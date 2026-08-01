# Cosmoboard UI responsiveness benchmark

A content-heavy board, driven through scripted gestures, measured frame by frame.
Re-creatable: the board is generated from a seed and is byte-identical every run.

Not to be confused with [`tests/board/perf-budget.test.mjs`](../board/perf-budget.test.mjs),
which is the fast CI gate: 120 text nodes, hard p95 budgets, runs on every PR. This is the
richer instrument, and it **records rather than fails**.

## Run it

```sh
node tests/perf/run-benchmark.mjs                  # default board, 61 nodes
node tests/perf/run-benchmark.mjs --label before   # name a run so you can diff it later
node tests/perf/run-benchmark.mjs --videos 40 --images 40 --notes 20 --texts 60
```

Artifacts land in `.tmp/perf-bench/runs/`. Then:

```sh
node tests/perf/compare-benchmark-runs.mjs .tmp/perf-bench/runs/before-*.json \
                                           .tmp/perf-bench/runs/after-*.json
```

To benchmark a change to the runtime without writing `JavaScript/braindump.js`:

```sh
cp JavaScript/braindump.js .tmp/candidate.js      # then patch the copy
node tests/perf/run-benchmark.mjs --label after --runtime .tmp/candidate.js
```

## What it measures

Per phase (`idle`, `drag`, `pan`, `zoomOut`, `zoomIn`), from `requestAnimationFrame` deltas:

| metric | meaning |
| --- | --- |
| `fps` | frames actually presented per second of the phase |
| `avgMs` `p50Ms` `p95Ms` `p99Ms` `worstMs` | the frame-time distribution |
| `framesLost` | frames the display had time to show and did not |
| `frameLossPct` | `framesLost` as a share of the frames that should have appeared |
| `spikeCount` / `severeSpikeCount` | deltas over 2x / 4x the frame budget, what a user feels as a hitch |
| `jankMs` | total time spent over budget |
| `longestStallMs` | the single worst frame |
| `histogramMs` | the shape of the distribution, in frame-budget multiples |

Per run: `mountMs`, `pointerDispatchUs` (microseconds of main-thread CPU per pointer-move
event, the metric that caught the listener-per-node bug at 71.2us), `jsHeapMb`, how many
lazy embeds were live at rest and after the zoom storm, and whether the gestures actually
moved anything.

## Reading the numbers honestly

**Headless Chromium rasters in software.** Absolute frame times here are not the frame times
a real browser gives you; a phase that runs at 60fps in Chrome reads 30-40fps here. Only
compare runs from the same environment, which is what `compare-benchmark-runs.mjs` enforces
(it refuses to diff headed against headless, or two different boards).

**Noise floor, measured over three identical runs on the same commit** (headless, 2026-08-01):
`p95Ms` 0.6%, `mountMs` 3.3%, `fps` up to 27%, `worstMs` up to 50%, `pointerDispatchUs` 69%,
and the spike/loss counters up to 400%. So `p95Ms` is the sharp instrument and the counters
are blunt. The comparison tool carries a per-metric tolerance table derived from those numbers;
override it wholesale with `--tolerance N`.

**Embeds.** Lazy embeds mean a live iframe only mounts within 600px of the viewport and unloads
after two minutes offscreen. A board full of videos therefore measures the lazy-embed machinery
as much as the videos, which is legitimate but has to be said out loud. Three modes:

- `--embeds stub` (default): iframes are real cross-origin iframes served locally. Deterministic,
  offline, measures our machinery and real iframe compositing without YouTube's player.
- `--embeds preview`: no iframe ever mounts. Isolates board cost from embed cost.
- `--embeds live`: the real YouTube. Realistic, not reproducible, needs the network.

## It cannot touch your boards

The generated board is never written to disk. It is served into the page by intercepting the
canvas fetch; `/api/*` is aborted at the network layer; autosave is switched off in
localStorage before page scripts run; images are synthesised in memory. Kill the process at any
moment and the repository is untouched, which
[`tests/board/perf-benchmark-suite.test.mjs`](../board/perf-benchmark-suite.test.mjs) proves by
hard-killing a run mid-flight and comparing every file under `content/`.

## Files

| file | what |
| --- | --- |
| `generate-benchmark-board.mjs` | deterministic board generator, also a CLI |
| `bench-assets.mjs` | seeded PNG bytes and the local embed stub |
| `bench-metrics.mjs` | one definition of every metric, shared by driver and diff |
| `run-benchmark.mjs` | the driver |
| `compare-benchmark-runs.mjs` | the diff |
