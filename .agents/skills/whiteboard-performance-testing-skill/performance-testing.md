# Whiteboard Performance Testing

## Goal

Measure whether the whiteboard still feels smooth when the grid and node layer are stressed together, and document whether grid softness is caused by an image source or by transform rendering.

## Standard Stress Profile

Use a deterministic synthetic board:

- 18 columns by 18 rows
- 324 total nodes
- 108 text nodes
- 108 link nodes
- 108 drawing nodes

This mix is intentionally broad enough to exercise:

- DOM layout for cards
- SVG drawing rendering
- shared camera transforms
- background grid alignment under zoom and pan

## FPS Logging Method

Use `requestAnimationFrame` and collect frame deltas with `performance.now()`.

For each sweep, report:

- `frames`
- `avgFps`
- `minFps`
- `maxFps`
- `p95FrameMs`
- `droppedFramesOver20ms`

Interpretation:

- `~60 FPS` average with low dropped-frame count is healthy for this board size.
- A few slow frames during zoom are acceptable.
- Repeated large frame spikes usually point to repaint or layout churn.

## Rendering Notes

- The current grid is defined in [braindump.html](C:/Users/evren/Documents/GitHub/proto_website/braindump.html:98) as an inline SVG pattern, not a bitmap image.
- That means the grid source itself should not blur from image upscaling.
- If softness still appears at very high zoom, the likely cause is browser antialiasing while the shared board canvas is being CSS-transformed.

## Harness

- Reusable Playwright harness: [scripts/grid-stress.js](scripts/grid-stress.js)
- Use it as the source for the `browser_run_code` `code` field.
- Default screenshot target from that harness:
  - `.agents/skills/whiteboard-performance-testing-skill/previous-tests/latest-grid-stress.png`

After each meaningful run:

1. Copy or rename the latest screenshot into the dated archive folder.
2. Save the returned metrics into `test-log.md`.
3. Note any grid sharpness or alignment issues that were visible during the run.
