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
- Preview server: `http://127.0.0.1:4174` (`npm run preview`), and 4174 is the documented port
  everywhere now. 4173 belongs to `aide-board`.
- The user works the tracker live while agents run. Expect concurrent writes to
  `.agents/todo.md` and treat mid-session file changes as normal, not corruption.
- Previous session's full map:
  [`.agents/handoffs/handoff_2026-07-30_cosmoboard_sprint.md`](./.agents/handoffs/handoff_2026-07-30_cosmoboard_sprint.md).

### Start Of Session

- Date: 2026-08-01
- Working on: clearing the whole open board, fanned out across agents. The user's instruction is
  to execute all To do and Backlog items, carefully reviewed and folded into the code.
- Wave 1, seven agents, all claimed on the board: pin drag by edges and corners (`opus5-9`),
  toolbar folding with the lock at bottom centre plus the markdown gradient (`opus5-10`), eraser
  and pen revamp (`opus5-11`), base64 markdown assets (`opus5-12`), canvas tool and safe rename
  (`opus5-13`), tracker scroll and card ids (`opus5-14`), recreatable perf benchmark (`opus5-15`).
- Shape: nobody writes `JavaScript/braindump.js` or `CSS/braindump.css`. Agents prove their fix in
  a running page and hand back anchor-based hunks; `opus5-0` is the single writer and applies them.
  Own port each (4181 to 4187), own test file each, no builds while others work. Every patch goes
  through an adversarial reviewer that re-verifies each anchor occurs exactly once before apply.
- Known constraints: the user edits `todo.md` live, so re-read before every edit and never rewrite
  the whole file. The preview server on 4174 went down once already this session and was restarted
  detached. Three new cards filed as critical: nothing is pushed, the PDFs are still in git
  history, and the 47-card Review queue is now the bottleneck.
- Not started, deliberately: the mobile fast-zoom crash (blocked on the user's phone by their own
  decision), `defaultViewport` (decided: leave alone), and the frozen roadmap phases 3, 4, 6, 7
  and 8 plus the desktop shell, which are multi-week programmes the objective freeze covers and
  which need an explicit unfreeze rather than an agent starting them quietly.

### End Of Session, 2026-08-01

- **17 cards built across three waves, 26 agents, whole suite green: 64 of 64.** Site rebuilt,
  landing page in sync. Nothing committed, nothing pushed.
- Waves 1 and 3 landed about 2,400 lines into `JavaScript/braindump.js` through 84 + 44 anchored
  hunks. `braindump.js` and `braindump.css` were never edited by an agent: they hand back hunks
  and `opus5-0` applies them. That discipline held across 26 concurrent agents with nothing lost.
- **The applier had a real bug and a reviewer found it by running it.** It wrote each file as
  that file's hunks resolved, so a patch spanning the client and the server could write a patched
  client and then throw on the server. It is all-or-nothing across files now, verified by making
  a patch fail deliberately and confirming nothing was written.
- **Eleven reviewer-proven defects were fixed before or just after apply.** The ones worth
  remembering are the ones a green suite could not see: an arrow-pan suite that passed with the
  speed cap deleted and again with the "nothing selected" gate deleted; a toolbar suite asserting
  a centring that CSS guarantees while the real affordance sat 303px off; a download suite that
  proved the button on the card but never the same button in the fullscreen viewer, which was the
  one path that was broken.
- **Two findings became `!p1` cards rather than fixes, because they are the user's call.**
  Ctrl+S does not save the board (it opens a Save-As dialog or downloads a file) and both suites
  guarding that are structurally incapable of failing. And `scripts/preview-server.mjs` binds
  beyond loopback and checks no `Origin`, so any site in an open tab can post to its write APIs.
  That second one is also what stopped the terminal node being built, since a WebSocket upgrade
  is not covered by CORS.
- **A research note corrected one of our own.** Tauri and Electron webviews both enforce
  X-Frame-Options, contrary to `vnc_and_iframe_embedding_2026-07-30.md`. Electron can strip
  headers and keep embeds as real iframes that pan and zoom with the canvas; Tauri cannot. That
  flips the shell recommendation to Electron and wants an explicit decision before anyone
  scaffolds one.
- Still open and unchanged: nothing is pushed (six commits, CI has never run on this branch), the
  four PDFs remain recoverable from `origin/main` history, and the Review queue is now 67 cards.
- Next: the Review queue is the bottleneck. The mechanical re-verification pass proposed on its
  card is the highest-value next move.

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
- **A second session ran on `main` in parallel with this branch** and is merged in here. It
  fixed the recommendation panel overflowing the viewport near 1024px, made 4174 the documented
  port across `README.md`, `scripts/README.md`, `scripts/AGENTS.md` and the whiteboard skill's
  desktop doc, and confirmed the orphan markdown node was already gone. Its test,
  `tests/features/toolbar-panel-viewport-fit-e2e.test.mjs`, is now part of this tree.

### End Of Session

- Date: 2026-07-31 (the session that ran on `main`, merged into this branch)
- Preview server: `http://127.0.0.1:4174`, running.
- What changed:
  - Fixed the panel overflow. It was worse than filed: the shell is centred, so an open panel wider
    than the window hangs off *both* edges, not just the right. `CSS/braindump.css` now clamps the
    shell to the window and wraps the panel onto its own row above the toolbar. `width: max-content`
    and a 560px cap on the panel are both load-bearing — without them the panel wraps at every width
    or balloons to 730px. Wide widths measure identical to before.
  - New test `tests/features/toolbar-panel-viewport-fit-e2e.test.mjs`: 30 panel measurements across
    ten widths, 1440 down to 390, on all three issue panels. Failed at 1061px and 1024px before the
    fix, green after.
  - The orphan node card was already done by commit `cf4cb58`. Verified rather than assumed: 23
    nodes, no `hgr0v5cjqam`, every referenced sidecar present, and no stray `note-*.md` appeared
    despite a dozen board loads.
  - 4174 is now the documented port in `README.md`, `scripts/README.md`, `scripts/AGENTS.md`, the
    whiteboard skill's `desktop-testing.md`, and this repo's Chrome cache note. Nothing was needed in
    `package.json` or root `AGENTS.md`.
  - `npm run build`, since the CSS is cache-busted by content hash and the fix would not otherwise
    reach any page. Churn is all date stamps and hashes; several project pages were still on a
    hand-edited `site.js?v=5`.
  - Re-synced `cosmoboard-landing.html`, which was two hashes stale and would have shipped without
    the fix.
- What still needs work:
  - Two questions are on the board: whether the landing page should be the indexed front door, and
    what happens to the public PDFs. Both are yours, neither blocks anything. The PDF one is
    carried into `todo.md` as an open `!p1` card so the merge cannot bury it.
  - `tests/export/export-bundling-e2e.test.mjs` was failing on a 30s `waitForFunction` there. It
    passes on this branch, so the merge resolves it.

### End Of Session, this branch

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

**Next agent: start with
[`.agents/handoffs/handoff_2026-08-01_continue_here.md`](./.agents/handoffs/handoff_2026-08-01_continue_here.md).**
It says what to pick up and in what order, the traps that cost real time, and the decisions already
taken so they are not re-litigated. The sprint's own map, if you want the detail behind it, is
[`handoff_2026-07-31_todo_lane_cleared.md`](./.agents/handoffs/handoff_2026-07-31_todo_lane_cleared.md).

Since that map was written: `origin/main` was merged in (the toolbar panel viewport fix), and two
board questions were answered and built. The landing page now leads the sitemap with both pages
indexed, and all four public PDFs are down, boards and repo. The user also added four new cards
mid-session, and two of them are feedback on work that just shipped. They are the first thing to
pick up.

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
