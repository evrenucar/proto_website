---
name: whiteboard-performance-testing-skill
description: Stress test the Braindump whiteboard with repeatable FPS measurements, zoom and pan sweeps, grid sharpness checks, and archived run logs. Use when grid rendering, transform smoothness, large board behavior, or zoom performance must be measured and documented.
---

# Whiteboard Performance Testing Skill

## Overview

Use this skill to answer performance questions with measurements instead of guesswork.

- Build a synthetic high-density board so test results are reproducible.
- Log FPS from `requestAnimationFrame` deltas during zoom and pan sweeps.
- Save a screenshot at high zoom when grid sharpness or transform alignment is under review.
- Archive each meaningful run under `previous-tests/<date>-<label>/`.

## Load First

- `agents/whiteboard/portability_of_whiteboard.md`
- `braindump.html`
- `JavaScript/braindump.js`
- `CSS/braindump.css`
- [performance-testing.md](performance-testing.md)

## Environment Workflow

### 1. Start a read-only preview

- Use `node scripts/preview-server.mjs`
- Default target URL: `http://127.0.0.1:3000/braindump.html`

### 2. Create an archive folder

- Create `previous-tests/<YYYY-MM-DD>-<short-label>/`
- Save:
  - `test-log.md`
  - at least one screenshot if the result is visual
  - optional console notes when they explain a slowdown or rendering defect

### 3. Run the stress harness

- Primary MCP: `mcp__playwright__`
- Preferred entry point:
  - open [scripts/grid-stress.js](scripts/grid-stress.js)
  - pass its function body to `browser_run_code`
- The harness should:
  - clear local board state
  - load a deterministic synthetic board
  - measure FPS during zoom and pan sweeps
  - report dropped frames and percentile frame time
  - confirm whether the grid is SVG or bitmap-backed

### 4. Record the answer to the rendering question

- If the grid is an SVG pattern, say that explicitly.
- If blur still appears at high zoom, distinguish between:
  - source asset blur
  - transform resampling or antialiasing during CSS scaling

### 5. Archive the findings

- Copy the result payload into `test-log.md`
- Include the exact board size used
- Include the exact browser viewport or device profile used

## Output Requirements

- State the exact server URL used.
- State the exact board composition used for the stress run.
- Report:
  - `avgFps`
  - `minFps`
  - `maxFps`
  - `p95FrameMs`
  - `droppedFramesOver20ms`
- State whether the grid is a bitmap image or SVG pattern.
- State whether any visible blur is likely from raster assets or transform antialiasing.

## Current Baseline Archive

- [previous-tests/2026-04-22-grid-stress/test-log.md](previous-tests/2026-04-22-grid-stress/test-log.md)
  - 324-node synthetic board
  - grid confirmed as SVG pattern
  - zoom sweep averaged `58.5 FPS`
  - pan sweep averaged `59.7 FPS`
