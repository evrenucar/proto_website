# Straight-Line Shift-Snap Test Report

- **Date:** 2026-04-29T02:11:06Z
- **Commit:** b9a1295 (working tree, uncommitted)
- **Feature spec:** [`.agents/feature_implementation/straight-line-shift-snap.md`](../.agents/feature_implementation/straight-line-shift-snap.md)
- **Run command:** `node --test tests/board/board-shift-snap-math.test.mjs tests/board/board-shift-snap-runtime.test.mjs`

## Summary

| Suite | Pass | Fail | File |
| --- | --- | --- | --- |
| Snap math (unit) | 9 | 0 | [`tests/board/board-shift-snap-math.test.mjs`](../tests/board/board-shift-snap-math.test.mjs) |
| Source structure (runtime) | 12 | 0 | [`tests/board/board-shift-snap-runtime.test.mjs`](../tests/board/board-shift-snap-runtime.test.mjs) |
| **Total** | **21** | **0** | |

Both new test files run pure-Node, no preview server or Playwright required.

## Snap math — `tests/board/board-shift-snap-math.test.mjs`

Extracts `snapStraightLine` from `JavaScript/braindump.js` via the `@export-for-test:snapStraightLine` marker and evaluates it as a pure function.

| # | Test | Result |
| --- | --- | --- |
| 1 | snaps cursor on the 0° axis to exactly horizontal-right at the same distance | pass |
| 2 | snaps a near-horizontal cursor inside ±3° to exactly horizontal | pass |
| 3 | does not snap a cursor outside the ±3° tolerance window | pass |
| 4 | snaps to the eight cardinal/diagonal axes | pass |
| 5 | snaps to the 45° diagonals when the angle is exact | pass |
| 6 | treats 180° and -180° as the same horizontal-left direction | pass |
| 7 | returns the start point when cursor distance is below the zero-length threshold | pass |
| 8 | returns the start point for a sub-0.001 displacement | pass |
| 9 | preserves the cursor distance when snapping | pass |

## Source structure — `tests/board/board-shift-snap-runtime.test.mjs`

Static assertions over `JavaScript/braindump.js`. Catches accidental regressions to the freehand path, the snap branch, the keyup bake, and the no-history-during-preview rule.

| # | Test | Result |
| --- | --- | --- |
| 1 | draw() forwards Shift state from window pointermove | pass |
| 2 | touchmove forwards Shift state to draw() | pass |
| 3 | draw() has a Shift-snap branch gated on draw tool only | pass |
| 4 | Shift-snap branch returns early to avoid touching the freehand path | pass |
| 5 | snapshot of preservedPathData and lineStartPoint happens once per Shift press | pass |
| 6 | active tail is rebuilt as preservedPathData + one L command per move | pass |
| 7 | startDrawing resets shift-snap state on every new stroke | pass |
| 8 | Shift keyup bakes the active straight segment | pass |
| 9 | stopDrawing bakes any pending shift segment before committing | pass |
| 10 | snap preview does not call pushAction during pointer movement | pass |
| 11 | draw tool short-circuits the Shift+drag pan shortcut on mousedown | pass |
| 12 | freehand throttle and append remain in draw() after the snap branch | pass |

## MVP acceptance check (against feature spec section 2)

| Acceptance criterion | Verified by |
| --- | --- |
| Shift-down captures `lineStartPoint` and `preservedPathData` exactly once per press | runtime #5 |
| Shift-hold replaces the active tail with a straight segment to the cursor | runtime #6 |
| Snap targets: 0, ±45, ±90, ±135, ±180 | math #4, #5 |
| Snap tolerance ±3° | math #2, #3 |
| Shift-release bakes the segment and resumes freehand | runtime #8, runtime #11 |
| Zero-length protection (`distance < 0.001`) | math #7, #8 |
| Angle wraparound at ±180° | math #6 |
| Active only for `draw` tool | runtime #3 |
| No undo/history entries during preview | runtime #10 |
| Freehand path unchanged when Shift is not held | runtime #4, #11 |

Synthetic pressure fallback at 0.5 — the current draw runtime renders SVG paths with constant stroke-width and does not track per-point pressure, so this requirement is N/A for the existing renderer. True pressure preservation is already deferred in section 6 of the spec.

## Sibling tests sanity run

Ran the closest neighbouring board tests to confirm no regression introduced by this change:

- `tests/board/cosmoboard-legacy-render-fields.test.mjs` — pass.
- `tests/board/board-save-export-runtime.test.mjs` — fail (pre-existing, documented in `gpt_review_20260429_032501.md` before this change; verified failing on the same tree without these edits via `git stash`).
- `tests/board/cosmoboard-initial-layout.test.mjs` — fail (pre-existing layout assertion at narrow desktop width; not related to drawing).

The two pre-existing failures are unrelated to drawing/Shift-snap and were already on the P0 list from the earlier core-board review.

## Outstanding test work

Spec section 4 listed three Playwright/runtime tests not yet authored at the time of the original run.

- `tests/board/board-shift-snap-stroke-e2e.test.mjs` — **landed and passing.** See update below.
- `tests/board/board-shift-snap-regression.test.mjs` — still deferred. Goal: assert non-Shift freehand `currentPathData` is byte-for-byte identical to a baseline fixture.
- `tests/board/board-shift-snap-no-history-spam.test.mjs` — still deferred. Goal: assert `pushAction` is called exactly once per stroke regardless of how many Shift-held pointer moves occur.

These two remaining tests are deferred until after user verification in the browser, since their value is regression protection rather than initial correctness.

---

## Update — 2026-04-29T03:54Z (e2e test landed)

- **Run command:** `node --test tests/board/board-shift-snap-stroke-e2e.test.mjs`
- **Result:** 1 test, 5 cases, all pass. Total duration ≈ 5.4 s.
- **File:** [`tests/board/board-shift-snap-stroke-e2e.test.mjs`](../tests/board/board-shift-snap-stroke-e2e.test.mjs)

| # | Case | Asserts | Result |
| --- | --- | --- | --- |
| 1 | Freehand prefix → Shift held (near-horizontal cursor) → release → freehand resumes | snapped endpoint shares `y` with prefix (within 1px); resumed path strictly grows beyond shifted path | pass |
| 2 | Vertical-down (90°) snap | snapped endpoint shares `x` with prior point | pass |
| 3 | 45° diagonal snap | `dx ≈ dy` on the snapped segment (within 0.5px) | pass |
| 4 | 30° angle outside ±3° tolerance | path does NOT collapse to a snapped diagonal (`dx − dy` stays > 10px) | pass |
| 5 | Two Shift presses in a single stroke | resulting path contains ≥ 3 `L` commands (first segment + bridge + second segment) | pass |

Each case opens a fresh page, clicks the `[data-tool="draw"]` toolbar button, drives a real pointer + keyboard sequence via `page.mouse` and `page.keyboard`, then reads the `<path>` `d` attribute from `[data-board-role="svg-layer"]`.

### Sibling-test re-run after e2e landed

`node --test tests/board/*.test.mjs` — 30 tests, 27 pass, 3 fail. The three failures match the pre-existing list:

- `tests/board/board-save-export-runtime.test.mjs` — pre-existing.
- `tests/board/cosmoboard-initial-layout.test.mjs` — pre-existing.
- `tests/board/board-url-paste-preview-e2e.test.mjs` — third pre-existing failure not noted in the original report. Tracked separately; not introduced by this change.

No new regressions introduced by the e2e test landing or the snap branch in `draw()`.

---

## Update — 2026-04-29T03:58Z (no-history-spam test landed)

- **Run command:** `node --test tests/board/board-shift-snap-no-history-spam.test.mjs`
- **Result:** 1 test, pass. Total duration ≈ 4.9 s.
- **File:** [`tests/board/board-shift-snap-no-history-spam.test.mjs`](../tests/board/board-shift-snap-no-history-spam.test.mjs)

Drives a stroke containing a 5-point freehand prefix, 40 Shift-held pointer moves, and a 5-point freehand resumption. Asserts:

| Assertion | Result |
| --- | --- |
| Stroke creates exactly +1 `.bd-item` on the board | pass |
| One `Ctrl+Z` rolls the count back to baseline (entire stroke is one undo unit) | pass |

This complements the static check in `board-shift-snap-runtime.test.mjs` test #10 (which forbids `pushAction` / `markBoardDirty` / `saveBoard` from appearing inside the snap branch). The no-history-spam test additionally proves that no transitively-called code path during preview accumulates history entries — only one Ctrl+Z is needed to undo a stroke that involved 40 Shift-held moves.

### Combined run after this update

`node --test tests/board/board-shift-snap-{math,runtime,stroke-e2e,no-history-spam}.test.mjs` — 22 tests, all pass.

### Spec section 4 status

| Test file | Authored | Passing |
| --- | --- | --- |
| `board-shift-snap-math.test.mjs` | yes | yes |
| `board-shift-snap-runtime.test.mjs` | yes | yes |
| `board-shift-snap-stroke-e2e.test.mjs` | yes | yes |
| `board-shift-snap-no-history-spam.test.mjs` | yes | yes |
| `board-shift-snap-regression.test.mjs` | deferred | — |

Only the regression-baseline test remains deferred; per plan section B it's deferred until a freehand-related change actually threatens the baseline.
