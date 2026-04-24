# Mobile Braindump Testing

## Scope

Use this checklist for the final mobile smoke pass when Braindump changes affect touch input, wrapped toolbar layout, viewport-height behavior, or soft-keyboard interaction.

## Default Minimal Final Pass

Run only the smallest subset that proves the implemented mobile-facing change works:

- load the page in a real mobile context
- check the changed touch or layout behavior directly
- confirm the board remains controllable after the interaction
- take one screenshot only if the result is visibly important or contested

Only expand into the full checklist when the change clearly affects multiple mobile behaviors or the user asks for broader coverage.

## Environment

- Primary execution path
  - Use `mcp__playwright__.browser_run_code` to open a dedicated context with:
    - `viewport: { width: 390, height: 844 }`
    - `isMobile: true`
    - `hasTouch: true`
- Secondary viewport
  - Re-run layout-sensitive checks at `375x812` or `412x915`
- Server
  - Prefer the preview server for read-only checks
  - Use the dev server only if a save-path regression must be inspected
- Reset state
  - Overwrite the Braindump localStorage keys before each mobile run

## MCP Configuration Notes

- `browser_resize` alone is not enough for real mobile interaction coverage.
- Use `browser_run_code` when you need:
  - a mobile browser context
  - touch-enabled taps
  - synthetic touch paths for draw, pan, or pinch tests
  - screenshots written to an absolute repo path
- Use `browser_console_messages` after the run for obvious script regressions.

## Screenshot Guidance

- No screenshot is required for every run.
- Prefer a single screenshot of the changed mobile behavior when useful.
- Add more screenshots only for visible failures, viewport issues, or touch regressions that are hard to describe.

## Interaction Checklist

Use only the sections touched by the change. The rest are reference coverage, not default required steps.

### 1. Initial mobile layout

- Confirm the toolbar wraps cleanly and remains fully reachable.
- Confirm the mobile menu button is visible and does not block the whiteboard toolbar.
- Confirm no accidental page scrollbars or clipped controls appear on first load.
- Confirm the bottom toolbar does not disappear behind browser chrome.

### 2. One-finger pan behavior

- In `select` mode on empty canvas, drag and confirm the board can still move when intended.
- In `pan` mode, drag and confirm the board pans without creating or moving nodes.
- Confirm touching toolbar controls does not start a pan gesture.

### 3. Two-finger pinch zoom

- Perform a pinch gesture and confirm zoom changes smoothly.
- Confirm the zoom jump is not wildly too slow or too fast.
- Confirm the board remains controllable after pinch ends.
- If pinch anchoring is visibly wrong, capture a screenshot and log it separately.

### 4. Draw mode

- Tap the `draw` tool and drag one finger on empty canvas.
- Confirm the page itself does not scroll during drawing.
- Confirm a finished stroke becomes a movable drawing node after touchend.
- Confirm the toolbar remains reachable after the gesture ends.

### 5. Text creation and soft keyboard

- Tap the `text` tool and tap empty canvas.
- Confirm a new text note appears.
- Focus the editor and type enough text to prove the keyboard path works.
- Confirm the keyboard does not shove the board into a broken offset state.
- Confirm leaving edit mode preserves the note.

### 6. Touch selection and node manipulation

- Tap an item and confirm visible selection state appears.
- Drag a selected item by touch and confirm it moves.
- Drag a drawing node by touch and confirm it moves.
- Try the resize handle if resize-on-touch is expected.
- If any node does not move on touch, record before and after coordinates in the log.

### 7. Links, images, and bookmarks

- Confirm touch dragging a card does not trigger native image dragging.
- Confirm intentional link activation still works when tapped directly.
- Confirm bookmark previews do not break the mobile layout width.

### 8. Toolbar actions and overlays

- Confirm `export`, `import`, `save`, and `recommend` remain reachable in the wrapped toolbar.
- Open the recommendation panel and confirm the input field fits the viewport.
- Open the recommendation modal and confirm both buttons remain visible without horizontal overflow.
- Confirm toast messages do not cover the full canvas permanently.

### 9. Mobile-specific open issues to keep watching

- Dynamic address-bar height shifting `100vh`
- Soft-keyboard overlap and board offset drift
- Deep zoom cursor or content distortion
- Touch interaction gaps caused by mouse-only handlers

## Baseline History

- Historical failure: `previous-tests/2026-04-21-baseline-smoke/`
  - a mobile-created text note stayed at the same `left` and `top` values before and after a touch drag attempt
- Follow-up verification: `previous-tests/2026-04-21-mobile-drag-fix/`
  - the same mobile drag scenario moved the text note from `160px,230px` to `280px,330px`
- Keep both runs so regressions can be compared instead of silently overwritten.
