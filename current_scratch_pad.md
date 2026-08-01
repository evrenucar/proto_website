# Current Scratch Pad

This file is the shared short-term work log for the current session.



## SCRATCH PAD (FAST NOTES BUGS AND TODOS)

Jot anything here mid-session. Anything that outlives the session moves to
[`.agents/todo.md`](./.agents/todo.md), which is now the single live task list.

The bugs, feature requests, and ideas that used to sit here were moved there on 2026-07-28. Nothing
was dropped.



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

- Preview server: `http://127.0.0.1:4174` (`npm run preview`). Question 4 is answered: 4174 is the
  port now, and the docs are being updated to match.

### Start Of Session

- Date: 2026-07-31
- Working on, in order:
  1. The recommendation panel escaping the viewport at desktop widths near 1024px. Top open bug and
     it sits on the objective's criterion 4, the route a stranger uses to send a suggestion.
  2. Delete orphan markdown node `hgr0v5cjqam` from the cosmoboard canvas. Answered A on the board.
  3. Make 4174 the documented preview port everywhere. Answered A on the board.
- Why now: 1 is the highest open card that is neither frozen nor waiting on a decision. 2 and 3 are
  already decided by the user and are one-liners, so they clear with it.
- Known constraints: underscore emphasis and the shared-entity node are frozen in `agents.md`, so
  the other two answered questions stay parked regardless of having answers.

### End Of Session

- Date: 2026-07-31
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
    what happens to the four public PDFs. Both are yours, neither blocks anything.
  - `tests/export/export-bundling-e2e.test.mjs` still fails on its 30s `waitForFunction`. Untouched
    and unrelated; not re-run this session.
  - Nothing is committed. The whole session sits in the working tree.
- Next step:
  - Answer the two board questions, or point me at the next card.

### End Of Session (previous, 2026-07-29)

- Date: 2026-07-29
- What changed:
  - Wrote `tests/board/markdown-caret-offset-mapping.test.mjs`. It parks a markdown note in screen
    space, sets a line's raw text, lets the editor render it, clicks a specific rendered character,
    and reads back the raw offset the caret landed on. 13 of 66 probes failed on the code as it
    stood.
  - Rewrote `buildVisibleToRawMap` in `JavaScript/braindump.js`. It was a second markdown parser
    hand-written to mirror `renderMarkdownLineToHtml`, and it drifted. It now replays the renderer's
    own rules in the renderer's own order, carrying a raw offset per surviving character, so the two
    cannot disagree. Fixed `_em_` being stripped when the renderer keeps it, nested markers, the
    offset-0 case on lines starting with a marker, and empty list items. 72/72 probes pass.
  - Rebuilt for the cache-bust hashes and re-synced `cosmoboard-landing.html`. This also picked up
    `content/boards/eurocrate-storage.html`, which was still on the hand-edited `?v=59` / `?v=30`
    and therefore serving a stale runtime.
  - Un-parked `tests/features/markdown-authoring-e2e.test.mjs`. What had blocked it was the
    two-click entry into a note: one click only selects the node, so focus stayed on BODY and every
    keystroke was eaten as a board shortcut. The test now asserts focus reached the editor before
    typing, blurs with Escape to commit and trigger the sidecar save, and edits a second time to
    prove the file round-trips. Three consecutive runs, clean tree after each.
  - That test also explains the orphan node found earlier: it used to run with board autosave on, so
    the new note was written into `current.canvas` while its `.md` was deleted on teardown. Autosave
    is off in the test now, so it stops producing them.
  - Built out the eurocrate project board, which had zero nodes while being linked as a working
    board. 15 nodes drawn from the project's own Notion content: crate sizes with their emtrade
    links, `design-notes.md` and `open-questions.md` as real markdown sidecars, the two reference
    images, a link to the project page, and a board-preview back to Cosmoboard. Both notes added to
    `src/registry.json`. Checked in a browser: everything renders, no failed requests, no console
    errors.
  - Measured the panel overflow report across phone, tablet and desktop widths before the user
    closed it. It did not reproduce at any touch width. One separate thing did turn up and is filed:
    the recommendation panel escapes the viewport near 1024px with a mouse, because the column
    layout only starts below 1000px or at 1200px with a coarse pointer.
  - Built the review flow into the tracker, which answers "what do I do after a review". Every card
    now carries a **works** button, an **issue** button and a feedback field, and cards drag between
    columns. A verdict is also a move: works sends the card to Done, issue sends it back to To do,
    text on its own just records a comment. All of it writes into `.agents/todo.md` and appends to
    `.agents/review-feedback.json`, which `agents.md` now tells agents to read at session start.
  - One endpoint behind both gestures, `POST /api/todo-update` in `scripts/preview-server.mjs`. It
    addresses a card by line number and refuses the write if the card text at that line no longer
    matches, so a stale board cannot stamp the wrong card. Covered by
    `tests/preview/preview-todo-update-endpoint.test.mjs`, including the stale guard and the
    rejection of unknown statuses and verdicts.
  - Ran every suite one file at a time. Board 33/33, build 4/4, preview 4/4, features 3/3.
- What still needs work:
  - `tests/export/export-bundling-e2e.test.mjs` fails on a 30s `waitForFunction` timeout. Confirmed
    pre-existing against unmodified `HEAD`. The `export/` directory was never in the suite count.
  - Two new findings filed in `todo.md`: `_underscore_` does not render as emphasis at all, and the
    cosmoboard canvas has an orphan markdown node pointing at a note file that earlier commits
    deleted as test litter.
  - The remaining parked tests, `shared-entity-*.pending.mjs`, are blocked on a decision rather than
    on mechanics: the `entity` node was never added to the cosmoboard canvas. Deciding to add it
    would un-park both.
  - Nothing is committed. The branch has the full session's work in the working tree.
- Next step:
  - Decide on the shared-entity node, which is the last thing keeping tests parked.
