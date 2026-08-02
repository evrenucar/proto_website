# Performance analysis: where the remaining milliseconds live

Written 2026-07-30 against measured state, not guesses. Baseline from this week's profiling:
steady wheel zoom at 145 nodes runs 60 FPS (avg frame 16.77 ms, p95 16.8 ms), pointer-move
dispatch costs 2.1 microseconds per event since the interaction relay landed (was 71.2), and the
zoom re-raster stalls are gone with the gesture-scoped `will-change`. The dev overlay (FPS, worst
frame, spike counter) is the standing instrument.

## Where delay still lives, largest first

1. **Embeds dominate load and memory.** Every YouTube, Wikipedia, or app iframe boots at page
   load, on screen or not. That is network, CPU, and memory spent before first interaction, and
   it was the source of the "long frames" that looked like zoom jank in profiling. The board
   itself is fast; the guests are heavy.
2. **Whole-board serialization on every dirty mark.** `serializeState` walks all nodes and
   stringifies the full canvas on a 400 ms debounce while editing. At 145 nodes it is a few
   milliseconds per tick on the main thread; it grows linearly with board size.
3. **Synchronous full mount.** All nodes build DOM at load, visible or not. Time-to-interactive
   scales with board size rather than viewport content.
4. **Selection queries.** `querySelectorAll(".bd-item.selected")` runs in keydown and overlay
   paths. Cheap at 145 nodes, O(board) forever.
5. **One 8.5k-line script.** The runtime parses in one gulp on every board page. Fine on desktop,
   measurable on weak phones. Not worth touching until a bundler exists for other reasons
   (extraction plan trigger 4).
6. **Tracker full re-render.** The kanban rebuilds its innerHTML per change. At current card
   counts this is invisible; it is the first thing to revisit if the board grows tenfold.

## Action plan, in order

1. **Lazy embeds** (biggest win, UX and memory): iframes activate on viewport proximity via
   IntersectionObserver, showing the existing preview card until then; offscreen embeds unload
   after long invisibility. Also fixes "board with many videos eats a laptop".
2. **Selection as state**: keep a `Set` of selected ids alongside the CSS class, kill the
   O(board) queries in hot paths.
3. **Incremental saves**: dirty-node tracking, serialize only changed nodes into the state
   snapshot. Shares design with operation-level writes from
   [`realtime_collaboration_note.md`](./realtime_collaboration_note.md), so one design serves
   both performance and sync.
4. **Staged mount**: render viewport-intersecting nodes first, the rest in idle callbacks.
5. **A perf budget in CI**: a stage-gate style storm asserting p95 frame time and worst frame on
   the test board, so regressions surface as red tests instead of user reports.

Items 1 and 2 are afternoon-sized. 3 and 4 are real projects; do them when a board slow enough
to prove them exists. 5 lands with the next test pass.
