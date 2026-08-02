# 2026-07-30 priority chips and developer overlay

Server: `http://127.0.0.1:4174` (`npm run preview`). Viewport: Playwright default desktop.

## Tracker priority chips (`/.tracker/tracker.html`)

- set priority: pass. Click on chip 2 sent exactly `{line, expect, priority: 2}` (verified with an
  instrumented fetch wrapper), `!p2` appended to the card line in `.agents/todo.md`, chip lit,
  card sorted to the top of its column, token hidden from the title.
- clear priority: pass. Clicking the lit chip removed the token from the file.
- endpoint: pass. `tests/preview/preview-todo-update-endpoint.test.mjs` covers set, replace,
  clear, junk rejection (7, "high", 2.5), text edit preserving marker and token, empty-text 400.
- note: mid-test the file was changing under us because the user was clicking chips live in
  another tab. Their tokens were left as set.

## Inline card editing (`/.tracker/tracker.html`)

- pass. Pencil opened the editor, Enter committed, the todo line kept `[~]` and `!p1` while the
  title changed, continuation lines untouched. Reverted by the wrap-up card rewrite.

## Developer mode overlay (`/cosmoboard.html`)

- toggle on: pass. Settings > Developer mode. Overlay appeared bottom left.
- readouts: pass. FPS 60 (green), camera `439, -714`, zoom `78%`, `23 nodes, 0 edges`,
  tool `select`. Pointer at screen 640,360 read `258, 1374`, which matches the inverse camera
  transform. Selecting `cosmo-title` filled the selected row with type, id, position and size.
- persistence: pass. `board:cosmoboard:settings` carries `devMode`, on and off.
- toggle off: pass. Overlay removed, rAF loop and pointer listener torn down.
- console: no errors from board code. Only a Wikipedia-embed warning from inside its iframe.

Screenshot: `dev-overlay-on.png` (settings panel with the new toggle, overlay reading 60 FPS).

## Performance pass (`/braindump.html`, 145 nodes)

- Wheel-zoom storm, 180 events at 60 Hz, after a 3 s warmup: avg frame 16.77 ms, p95 16.8 ms,
  one frame over 33 ms in 3 s. Baseline is already at 60 FPS; the long frames in the first
  unwarmed run were embed loading, not steady-state jank. A/B of
  `will-change`/`contain`/`content-visibility` CSS on the same warmed page showed no measurable
  win, so none of it shipped.
- Structural find instead: drag and resize added ten window listeners per node (never removed).
  Replaced with one interaction relay per board. Idle mousemove dispatch measured before/after by
  re-adding 290 equivalent no-op listeners: 71.2 us per event with them, 2.1 us with the relay,
  34x less. Non-passive touchmove listeners went from 290 to 1 per board, and deleted nodes are
  no longer pinned by their window listeners.
- Functional through the relay: drag moves and restores exactly, corner resize works, and
  esc-deselect (5/5), markdown-drag-and-title, board-shift-snap-runtime (12/12),
  resize-handle-clipping, board-save-reload-e2e, markdown-authoring-e2e all pass.
- Hygiene: the first storm ran with autosave on and wrote a z=5 viewport into
  `content/boards/braindump/current.canvas`; reverted by hand. Later runs disabled autosave via
  `board:braindump:settings` and cleared draft keys afterwards.
