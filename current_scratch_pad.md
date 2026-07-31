# Current Scratch Pad

This file is the shared short-term work log for the current session.



## SCRATCH PAD (FAST NOTES BUGS AND TODOS)

Jot anything here mid-session. Anything that outlives the session moves to
[`.agents/todo.md`](./.agents/todo.md), which is now the single live task list.



## How To Use It

- Read this at the start of a work session to understand the current scope.
- Update it at the start of a work session with what is being worked on now.
- Update it again at the end of a work session with what changed, what is blocked, and what is next.
- Keep it focused on current work only. Move long-term or stable guidance into other docs.
- The user can write here too.

## Session Update Template

### Start Of Session

- Date:
- Working on:
- Why now:
- Known constraints:

### End Of Session

- Date:
- What changed:
- What still needs work:
- Next step:

## Current Scope

- Goal for the ongoing sessions, refined by the user 2026-07-30: make Cosmoboard a high
  performance interface with polished UX and UI, with tests confirming basic functionality at
  each stage. Long term it grows toward an operating environment; today it is a local-first,
  folder-based, lightweight canvas, and stays that.
- The tracker board is checked for new user updates every work cycle, and updated every cycle.
- Sandbox for stage checks: `/content/boards/test-board.html`, noindex, out of the sitemap,
  saves confined to `content/boards/test-board/`.
- Preview server: `npm run preview` on port 4174, running. 4173 belongs to `aide-board`.
- The user works the tracker live while agents run. Expect concurrent writes to
  `.agents/todo.md` and treat mid-session file changes as normal, not corruption.
- Previous session's full map:
  [`.agents/handoffs/handoff_2026-07-30_cosmoboard_sprint.md`](./.agents/handoffs/handoff_2026-07-30_cosmoboard_sprint.md).
  Everything from it is uncommitted in the working tree on `fix-markdown-sidecar-405-error`.

### Start Of Session

- Date: 2026-07-31
- Working on: the two `!p1` cards from Features and ideas, both PDF and both the same area:
  the fullscreen button, and embeds swallowing wheel-zoom and middle-drag pan.
- Why now: Review is full and waiting on user verdicts, nothing was claimed, and no new
  feedback had landed since the Firefox-alt issue, which is already fixed. That leaves the
  To do lane, where these two carry the highest priority marker and serve the polished-UX goal.
- Known constraints: preview server was down on arrival, restarted on 4174. The cosmoboard
  canvas holds ~292 lines of uncommitted user work, so every browser probe ran with autosave
  off and `/api/save-board` blocked.

### End Of Session

- Date: 2026-07-31
- What changed:
  - Both `!p1` PDF cards built, verified and in Review. The pointer fix was a gate, not new
    code: the YouTube shield's logic was already general, so ungating it covers PDFs,
    embedded websites and app nodes at once. Fullscreen uses the native API deliberately, so
    the iframe is never re-parented and a PDF keeps its page.
  - New suite `tests/board/embed-pointer-and-fullscreen.test.mjs`, 8 cases, hermetic. Proved
    it fails without the fix. Regression suites green: stage gate 9/9, overlay-wheel-scroll,
    markdown-wheel-routing, node-size-and-overflow, youtube-live-embed, youtube-player-controls.
  - Two bug cards corrected. `cosmoboard-initial-layout` is **not** red, it passes, and the
    camera the card blamed was never in the file. The real fault is autosaved cameras deciding
    where a board opens; cosmoboard and braindump are the two boards without a `defaultViewport`
    guard. One decision is on that card for the user.
  - Grid read for the mobile crash: 240000px square, purely decorative, zero JS references, so
    capping it to the viewport is safe. Noted the missing viewport-rect helper and that
    `mobile-pinch-zoom.test.mjs` is untracked.
- Two decisions taken by the user this session: **leave the board opening cameras alone** (no
  `defaultViewport`, card parked to Backlog with the mechanism recorded), and **no blind grid
  cap** for the mobile crash. That card is now blocked on one session with the phone on USB,
  and the full setup is written on it.

### Second half of 2026-07-31: clearing the To do lane

Goal set by the user mid-session: implement every open todo item, well documented and with
tests, fanning out agents wherever they will not interfere.

- **Fan-out shape.** `JavaScript/braindump.js` is one 9,900-line file, so agents never write it.
  Each proves its fix in the running page (route-intercepting a patched copy, or a mirror of
  the tree under its own scratch dir) and hands back anchor-based hunks; opus5-0 is the sole
  writer and applies them. Own port each, own test file each, no builds while others work.
- **Landed this half:** both YouTube cards (real address in the header with double-click copy;
  videos remember where you left off), shift-constrained drag from agent 5, and a regression the
  user filed live on the tracker: wheeling over a markdown note had stopped zooming the board.
- **That regression is worth remembering.** Last session's settings-panel scroll fix routes a
  wheel to "the first scrollable element on the way up", and checked for a board node *inside*
  that walk. Any node containing something scrollable matched first, so long notes silently ate
  the wheel. `markdown-wheel-routing` missed it because it asserts a synthetic event reaches the
  viewport, not that the camera moves. New suite asserts the camera.
- **Ordering constraint for the remaining patches:** agent 7's theme sweep touches 242 CSS
  occurrences and anchors on the settings region, which agent 6 is also editing. It re-derives
  from the files at apply time, so it goes **last**, after 6 and 8.
- **All of it landed.** Applied in dependency order: pin to viewport, then toolbar auto-hide plus
  page lock, then the theme sweep last so it re-derived over the other two (250 colour
  occurrences instead of the 242 it was written against). Three of the theme patch's four JS
  anchors had drifted onto the settings region the lock patch rewrote; re-anchored by folding the
  lock's lines into both halves of each hunk rather than dropping either feature.
- **The To do lane is empty.** Everything open at the start of the session is in Review, except
  the mobile crash, which is blocked on the user's phone by their own decision. What remains open
  is five new roadmap cards added deliberately.

### Three problems the verification pass found, all fixed

Worth remembering, because two of them were invisible to a green suite.

1. **A killed perf-budget run left 114 `storm-*` nodes in the sandbox board**, which was breaking
   `markdown-wheel-zoom` and `vnc-node` from board data rather than code. Restored from the seed
   fixture. A run that completes does restore itself; one that dies mid-flight does not.
2. **The pin patch broke `board-shift-snap-runtime` without changing any behaviour.** That suite
   scrapes the source for the *first* `viewport.addEventListener("mousedown")` block, and the pin
   chord registers one above the tool-routing handler. It now picks the block by what it contains.
   This is the exact failure mode of the "assert outcomes, not mechanisms" card in the backlog.
3. **`cosmoboard-initial-layout` was red from camera drift**, not code: an open tab autosaves its
   live camera into the canvas. Leaving that behaviour alone is the user's decision, so the test
   was changed instead: it serves the real board with a pinned camera, the same trick the stage
   gate uses when it seeds the sandbox.

Also fixed a flake in the new theme suite: it read a toolbar colour mid-transition, so roughly one
run in three saw the button's resting grey instead of the accent. A fixed wait could not fix a
race, so transitions are disabled for that suite; it measures resolved colour, never animation.

### End state

Whole suite green: board, build, features, export, preview. Performance holds after everything:
idle 16.8ms p95, drag 83.4, pan 99.9, zoom 166.6 against a 220 budget, pointer dispatch 4.85us
against 25us, so the pin hook and the shift-drag recompute cost nothing measurable. Site rebuilt.

Full map of this session, including the gotchas worth not relearning:
[`.agents/handoffs/handoff_2026-07-31_todo_lane_cleared.md`](./.agents/handoffs/handoff_2026-07-31_todo_lane_cleared.md).

### Start Of Previous Session

- Date: 2026-07-30 (afternoon, fresh session after /clear)
- Working on: the next ranked Backlog items, per the performance action plan. In order: the perf
  budget test on the sandbox board (asserting p95 frame time), the machine-readability benchmark
  backfill to 100 percent (13 legacy markdown nodes without ids, two empty text nodes, two
  untitled links), and fallback preview cards for sites that refuse iframe embedding. Board
  maintained every cycle: verdicts read, feed updated, cards claimed and released.
- Why now: the board has zero open To do and In progress; Review awaits user verdicts, so the
  agent lane is the non-frozen Backlog cards that serve the performance-and-polish goal. The
  perf plan explicitly defers incremental saves and staged mount until a big-enough board
  exists, and says the budget test "lands with the next test pass", so that is first.
- Known constraints: stale open tabs autosave over disk changes (guard now refuses, but reload
  tabs after canvas edits); rebuild after runtime changes; restart the server only after
  `scripts/preview-server.mjs` changes; run suites with the build lock in place.

### End Of Session

- Date: 2026-07-30, first cycle of the fresh session
- What changed:
  - All three Backlog pulls built, verified, and in Review on the board:
    1. Perf budget test (`tests/board/perf-budget.test.mjs`): seeds 120 nodes on the sandbox,
       measures idle, zoom, drag, pan frame times plus pointer-dispatch cost (2.8 to 5us
       measured; the old listener bug was 71.2us). Runs in CI via the new
       `.github/workflows/board-tests.yml` (stage gate + budget on every PR).
    2. Benchmark backfill: machine-readability 47/47 (100 percent). 13 legacy markdown nodes
       got `cosmo-note-<nodeId>` ids; four content-free litter nodes deleted; updatedAt bumped
       so stale tabs hit the guard. Site rebuilt.
    3. Fallback cards for iframe-refusing sites: known-refuser list plus a real header probe
       (`GET /api/frame-check`, reads XFO and frame-ancestors). Refused live embeds show a named
       card instead of the grey box. Endpoint test added; browser-verified on github, MDN,
       example.com.
  - Found on arrival: the sandbox had drifted (user play renamed the markdown node, left litter,
    a dead image ref) and the stage gate was silently red. Both gates now seed canonical state
    from `tests/fixtures/test-board-seed.canvas` before running, so drift can never break them
    again; the on-disk sandbox is reset to canonical.
  - Server on 4174 restarted with the frame-check endpoint. Suites green: stage gate 9/9, perf
    budget, frame-check endpoint, YouTube embed, preview routes.
- What still needs work: nothing claimed; remaining Backlog is frozen phases plus incremental
  saves and staged mount, which the perf plan defers until a board big enough to prove them
  exists. Nothing committed, per the review-on-board workflow.
- Next step: user verdicts on the Review column and the proposed roadmap at the end of
  holistic_planning.md. Reload any open board tabs (canvases changed on disk).
