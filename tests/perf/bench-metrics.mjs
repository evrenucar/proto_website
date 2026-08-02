// Frame statistics for the performance benchmark. Kept in one place so the
// driver and the comparison tool agree on what every number means.
//
// Vocabulary, because "fps" alone hides everything that matters:
//   fps            frames actually presented per second of the phase
//   avgMs/p50/p95/p99/worstMs   requestAnimationFrame delta distribution
//   framesLost     frames the display had time to show and did not, summed
//                  over the phase: sum(round(delta / budget) - 1)
//   frameLossPct   framesLost / (framesLost + frames)
//   spikes         deltas over 2x budget; severe is over 4x. A spike is what
//                  a user perceives as a hitch, and the count matters more
//                  than the average, which averages hitches away
//   jankMs         total time spent over budget, the honest "how much lag"
//   longestStallMs the single worst frame

export const DEFAULT_FRAME_BUDGET_MS = 1000 / 60;

export const METRIC_KEYS = Object.freeze([
  "frames",
  "elapsedMs",
  "fps",
  "avgMs",
  "p50Ms",
  "p95Ms",
  "p99Ms",
  "worstMs",
  "framesLost",
  "frameLossPct",
  "spikeCount",
  "severeSpikeCount",
  "jankMs",
  "longestStallMs",
]);

// Metrics where a bigger number is worse. The comparison tool needs this to
// call a change a regression rather than just a difference.
export const LOWER_IS_BETTER = Object.freeze({
  frames: null,
  elapsedMs: null,
  fps: false,
  avgMs: true,
  p50Ms: true,
  p95Ms: true,
  p99Ms: true,
  worstMs: true,
  framesLost: true,
  frameLossPct: true,
  spikeCount: true,
  severeSpikeCount: true,
  jankMs: true,
  longestStallMs: true,
});

function round(value, places = 2) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx];
}

/**
 * @param {number[]} deltas requestAnimationFrame deltas in ms
 * @param {{ frameBudgetMs?: number, spikeFactor?: number, severeFactor?: number }} opts
 */
export function summariseFrames(deltas, opts = {}) {
  const budget = opts.frameBudgetMs || DEFAULT_FRAME_BUDGET_MS;
  const spikeMs = budget * (opts.spikeFactor ?? 2);
  const severeMs = budget * (opts.severeFactor ?? 4);

  if (!Array.isArray(deltas) || deltas.length === 0) {
    return {
      frames: 0, elapsedMs: 0, fps: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0,
      worstMs: 0, framesLost: 0, frameLossPct: 0, spikeCount: 0,
      severeSpikeCount: 0, jankMs: 0, longestStallMs: 0,
      thresholds: { frameBudgetMs: round(budget, 3), spikeMs: round(spikeMs, 2), severeSpikeMs: round(severeMs, 2) },
      histogramMs: [],
    };
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const elapsed = deltas.reduce((a, b) => a + b, 0);

  let framesLost = 0;
  let spikeCount = 0;
  let severeSpikeCount = 0;
  let jank = 0;
  for (const d of deltas) {
    framesLost += Math.max(0, Math.round(d / budget) - 1);
    if (d > spikeMs) spikeCount += 1;
    if (d > severeMs) severeSpikeCount += 1;
    if (d > budget) jank += d - budget;
  }

  // Coarse histogram, in multiples of the frame budget, so an artifact carries
  // the shape of the distribution without carrying thousands of raw samples.
  const buckets = [1, 1.5, 2, 3, 4, 8, Infinity];
  const histogram = buckets.map((mult, i) => ({
    upToMs: mult === Infinity ? null : round(budget * mult, 2),
    count: deltas.filter((d) => {
      const lo = i === 0 ? -Infinity : budget * buckets[i - 1];
      return d > lo && d <= budget * mult;
    }).length,
  }));

  return {
    frames: deltas.length,
    elapsedMs: round(elapsed),
    fps: round((deltas.length / elapsed) * 1000),
    avgMs: round(elapsed / deltas.length),
    p50Ms: round(quantile(sorted, 0.5)),
    p95Ms: round(quantile(sorted, 0.95)),
    p99Ms: round(quantile(sorted, 0.99)),
    worstMs: round(sorted[sorted.length - 1]),
    framesLost,
    frameLossPct: round((framesLost / (framesLost + deltas.length)) * 100, 2),
    spikeCount,
    severeSpikeCount,
    jankMs: round(jank),
    longestStallMs: round(sorted[sorted.length - 1]),
    thresholds: {
      frameBudgetMs: round(budget, 3),
      spikeMs: round(spikeMs, 2),
      severeSpikeMs: round(severeMs, 2),
    },
    histogramMs: histogram,
  };
}

/** One line a human can read at a glance. */
export function formatPhaseLine(name, m) {
  return (
    `${String(name).padEnd(9)} ${String(m.frames).padStart(4)} frames  ` +
    `${String(m.fps.toFixed(1)).padStart(5)} fps  ` +
    `avg ${String(m.avgMs.toFixed(1)).padStart(6)}ms  ` +
    `p95 ${String(m.p95Ms.toFixed(1)).padStart(6)}ms  ` +
    `worst ${String(m.worstMs.toFixed(1)).padStart(7)}ms  ` +
    `lost ${String(m.framesLost).padStart(4)} (${m.frameLossPct.toFixed(1)}%)  ` +
    `spikes ${String(m.spikeCount).padStart(3)}/${m.severeSpikeCount}`
  );
}
