# Handoff 2026-08-02: waves 4 to 7

The previous handoff,
[`handoff_2026-08-01_four_wave_sprint.md`](./handoff_2026-08-01_four_wave_sprint.md), was written
while wave 4 was still in flight. Wave 4 landed, and three more waves ran after it. This file
covers what happened since, and it does not repeat what that one already says. Read it for waves 1
to 3, the applier bug, and the `X-Frame-Options` research correction.

## Read first

1. [`current_scratch_pad.md`](../../current_scratch_pad.md) for session state.
2. [`todo.md`](../todo.md) for the board.
3. [`whiteboard/review_queue_verification_2026-08-01.md`](../whiteboard/review_queue_verification_2026-08-01.md)
   before treating any `[A]` as done. Its headline tally is **not a partition**, and its own card
   in `todo.md` says so.
4. [`whiteboard/test_audit_2026-08-01.md`](../whiteboard/test_audit_2026-08-01.md) for how to read
   a green suite in this repo.

## Where things stand, measured today

- Branch `fix-markdown-sidecar-405-error` at `e0de4d5`, **pushed and byte-identical to its own
  remote**, 12 ahead of `origin/main`. Six of those twelve are this sprint:

  ```
  e0de4d5 Land the four held wave-6 patches: rotation, shapes, palette, incremental saves
  b64f705 Wave 6: tracker delete and re-lane, embed hint, canvas file lifecycle
  2591491 Remove 13 empty orphan canvases and a 1-byte note from the cosmoboard; file the cause
  667dff6 Wave 5: four bugs, three of them one-line causes with long shadows
  f5b5e37 Remove an orphan canvas sidecar a probe wrote into content/, and record the rule gap
  85abc26 Wave 4: drawing tuning sliders, toolbar arrangement, canvas shortcut, queue audit
  ```

- **Wave 7 is not committed.** Uncommitted on disk: an 8-line copy hunk in `JavaScript/braindump.js`
  rewriting the Terminal panel's text, `.agents/research/browser_terminal_2026-08-02.md`, five
  agent feed files, two new test files, and the build output.
- Board by marker in `todo.md`: **1 To do, 0 in progress, 73 Review, 14 Backlog, 86 Done.**
- **Suites: 77 of 79 pass.** Every `*.test.mjs` under `tests/` run one at a time with `node`. The
  two reds are `tests/board/inertia-browsing.test.mjs` and `tests/board/presentation-mode.test.mjs`,
  and both are red for the same reason: they are untracked suites written against patches that were
  never applied. See the open section. `tests/features/youtube-player-controls.test.mjs`, the
  network-dependent one, **passed** on this run.
- `npm run build` is clean and the stage gate is 9 of 9 after it. The build touched seven HTML files
  with hash and date churn only.

## What shipped across waves 4 to 7

A map, not a changelog. The `[A]` cards carry the detail and the measurements.

**Wave 4.** Drawing tuning sliders in Settings > Developer mode: smoothing, thinning, curve, a
coalesced-events toggle and a live points-and-bytes readout, so the storage cost of a feel setting
is visible while you tune. No default was silently picked as the answer. Toolbar arrangement as a
mode reached from Settings > Workspace, which is what lets auto-hide be suspended while you drag.
`C` creates a canvas. The Review-queue audit.

**Wave 5, four bugs with long shadows.** Stroke thickness now matches the brush while you draw.
Press-and-hold brush resize reads the tool under the finger, and long-pressing a tool now also
selects it. The lock indicator is a small yellow badge when the page is locked and the bar is
hidden. Import and export icons swapped in all seven copies of the toolbar markup, checked against
the handler each button calls rather than against the icon. The mobile page-scroll fix, which was
two independent faults multiplying: the board page has always been scrollable because
`html { overflow-x: clip }` stops body overflow propagating, and `100vh` is 56px taller than the
visible height while Chrome Android shows its URL bar.

**Wave 6, three applied and four held.** Tracker cards can be deleted, with an inline confirm, 25
seconds of undo and an append-only trash log, and moved between lanes. The embed address stops
staying highlighted after a double-click copy and carries a hover hint. Canvas files no longer
outlive their node, and the uniquifier's race is closed with an `wx` open.

**The four held patches then landed in `e0de4d5`**, each with the defect that held it fixed rather
than waived: rotation on `R`, the shape tool on `S` and `O`, the command palette on `Ctrl+K`, and
incremental saves plus staged mount. Draft writes are now proportional to what changed, 1.90ms after
a drag against 0.50ms after one keystroke on a 901-node board.

**Wave 7** produced one applied text hunk, one research note, and two held patches. See the open
section.

Earlier in the sprint and already covered by the previous handoff: `Ctrl+S` saving the board,
the preview server refusing cross-site writes, and base64 markdown. The base64 spacing follow-up
shipped here: 15 blank lines before the reference block, and the `<details>` wrapper was built,
measured and thrown away because link reference definitions render no visible output at all, so
the disclosure expanded to show nothing.

## The engineering lessons

This is the part worth carrying into the next sprint.

**Agents never write `JavaScript/braindump.js` or `CSS/braindump.css`.** Each proves its fix in a
running page, usually by route-intercepting a patched copy, and hands back anchor-based hunks.
`opus5-0` is the single writer and applies them. Own port each, own test file each, no builds while
others work. **46 numbered agents across seven waves and nothing was lost.**

**`.tmp/scratch/opus5-0/verify-anchors.mjs` does two checks, and the second one is the reason the
discipline holds.** It confirms each anchor resolves to exactly one occurrence, and it cross-checks
whether two agents anchored on overlapping text. That second check caught the rotation and shape
patches sharing three identical anchors, the tool-guard lists both needed to append to, so a naive
apply would have had one silently drop the other's entry. It flagged them independently of the
reviewers. **No single agent can run that check for itself**, because it is about the other agents.

**`.tmp/scratch/opus5-0/apply-patch.mjs` is strict find-or-throw and all-or-nothing across every
file in a patch.** It was not, until a reviewer proved by running it that a patch spanning
`braindump.js` and `preview-server.mjs` could write a fully patched client and then throw on the
server, leaving a patched client talking to an unpatched server.

**Reviewers keep catching what the suites cannot.** The list from this sprint and the last, all
proved by mutation rather than argued: an arrow-pan suite that stayed green with the speed cap
deleted (the board ran away at 7613 px/s against 2247 capped) and again with the nothing-selected
gate deleted (798px of camera movement with a node selected); a toolbar suite asserting a centring
that `left: 50%` guarantees while the affordance sat 303px off; `board-save-export-runtime`
asserting an unbounded `[\s\S]*` between the `Ctrl+S` condition and `saveBoard()`, matching a call
roughly 800 lines away; a drawing-fidelity bound that passed when the smoothing and curve knobs were
turned into no-ops. **Every new suite this sprint was proved to fail without its patch**, and the
mutation is recorded on the card.

**Two source-scraping suites were removed rather than worked around.**
`tests/board/board-shift-snap-runtime.test.mjs` was 132 lines of regexes over the text of
`braindump.js`, one of which pinned the literal `if (dist < 4 / camera.z) return;` that the thinning
slider replaces. It was deleted after `board-shift-snap-stroke-e2e` and
`board-shift-snap-no-history-spam` were verified green, and the audit had reached the same verdict
independently. It cost one uncovered case, `touchmove` forwarding Shift on hybrid laptops, which is
recorded rather than hidden. The deep-clone regex in `board-save-export-runtime` was replaced, not
deleted: it pinned the exact spelling of an expression that incremental saves moved with the
guarantee intact, and it would equally have passed a rewrite that broke the property while keeping
the spelling. Its replacement serializes the board three times and asserts the geometry does not
move.

## Traps, on top of the previous handoff's list

- **Ports 4181 to 4420 are claimed by test files. 70 of them declare a `PORT` constant, all inside
  that range, across 67 distinct ports.** Handing an agent a port in it makes unrelated suites fail
  with "preview server exited early", which reads like a code regression and is not one. Check the
  number is free before assigning it, and kill agent servers when a wave ends.
- **A probe that does not block `/api/save-board` writes orphan files into real boards.** One wave-4
  reviewer left one sidecar on the cosmoboard. A later probe left thirteen empty canvases and a
  1-byte note, all removed by hand in `2591491`. **There is a sixteenth on disk right now**,
  `content/boards/cosmoboard/canvas-2026-08-02_09-43-03.canvas`, empty and referenced by nothing.
  Give reviewers the same autosave-off and save-blocked rules as the agents they review.
- **A mirror built with a directory junction serves the real repo.** Node resolves module realpaths,
  so the server an agent starts inside a junctioned mirror is running the tree the junction points
  at. The rotation agent reported an entire regression matrix that had been run against the
  **unpatched** runtime for exactly this reason, and all of it had to be re-run. If an agent's
  greens look too clean, check how its mirror was made.
- **PowerShell 5.1 `Set-Content -Encoding utf8` writes a BOM**, which makes `JSON.parse` fail on a
  file that looks fine in an editor. Use `[System.IO.File]::WriteAllText` with a
  `UTF8Encoding($false)`.
- **A stylesheet declaration outranks an SVG presentation attribute.** That was a `!p1` bug:
  `#braindump-svg-layer path` carried `stroke-width: 4px` and beat the width `startDrawing` writes
  from the brush size, so the live preview was pinned at 4 units at every brush size while the
  finished node rendered at its own attribute. Measured at brush 24: live 4.00px against a finished
  23.999px on screen, and the ratio held at every zoom. It hid for months because the default brush
  is also 4. The same rule carried `stroke: var(--bd-accent)`, the identical bug, invisible only
  because the pen colour currently is the accent. Both are gone.

## What is open, and what actually blocks each

**The mobile fast-zoom crash.** Blocked on the user's phone on USB, by their own decision, and it
has been the one open `[ ]` card for three sessions. `scripts/mobile-diag-server.mjs`,
`tools/mobile-diag.js` and
[`whiteboard/mobile_testing_guide.md`](../whiteboard/mobile_testing_guide.md) exist to make that
session short. The Android route, which is the strong one, is four steps: run `npm run mobile:diag`
on the computer, which serves the site read-only with no save routes at all; enable USB debugging on
the phone and run `adb reverse tcp:4190 tcp:4190` so the phone reaches the computer through the
cable rather than wifi; open `http://localhost:4190/go` in Chrome on the phone and attach real
DevTools from `chrome://inspect#devices`; then reproduce the crash while watching the Layers panel,
because whether the 240000px grid layer is holding the compositor memory is the whole question.

**Inertia browsing, canvas presentation mode, and PDF export.** These cards are back in Backlog as
`[.]` with no note on them, and **that is misleading, because the work is not gone.** It is parked
unapplied in `.tmp/scratch/`:

- `opus5-42`: `patch.json`, 11 hunks over `braindump.js` and `braindump.css`, plus
  `tests/board/inertia-browsing.test.mjs` **already on disk and untracked**. Its feed records the
  suite measured red on an unpatched mirror and green on a patched one, with a 528px glide and
  30Hz against 60Hz within 1.04x.
- `opus5-43`: `patch.json`, 10 hunks, plus `tests/board/presentation-mode.test.mjs`, also on disk
  and untracked. Design was viewpoints as authored board content.
- `opus5-44`: no patch, but a `print.css`, a proposed `tests/export/pdf-export.test.mjs` and real
  measurements. Printing a fullscreen note today gives 1 A4 page and 827 characters with the note
  truncated at the overlay height. With the print stylesheet: 3 pages, 3590 characters, last line
  present, 61KB against 230KB. It also found that `Ctrl+P` silently switches the board to the pen
  tool.

**Those two untracked suites are the only two reds in the tree.** They are red because their
features are not in the runtime, not because anything regressed. Either apply the patches and let
the suites go green, or move both files out of `tests/` so the tree reads honestly. Leaving them
where they are makes every future full run look broken.

**Obsidian-style image resizing in markdown.** The user's own card says they will detail the
behaviour and work on it later. It needs their spec before anyone touches it.

**Eleven items are frozen by `agents.md` under the current objective**: roadmap phases 3, 4, 6, 7
and 8, the shared-entity model, realtime collaboration, app embeds, the repo split, further tracker
features, and underscore emphasis rendering. They need an explicit unfreeze. Do not start any of
them quietly.

**CI has still never run on this branch.** Verified today, not carried over: `board-tests.yml`
triggers on `pull_request` and `workflow_dispatch`; `git ls-tree origin/main` shows only
`build-site.yml` on the default branch; and `gh workflow list` returns "Build site" and
"pages-build-deployment" and nothing else, so there is no board-tests workflow to dispatch. Opening
a PR against `main` is the one-step fix. Every green number in this file is one machine and one
Chromium.

## Decisions taken this sprint. Do not re-litigate.

- **`R` is rotation.** Centre origin, Shift snapping to 45 degrees, rotate from the corner handle,
  hold-and-release falling back to the previous tool the way Space does.
- **`S` and `O` are the shape tool**, rectangle and ellipse, because `R` belongs to rotation. Shift
  constrains to a square or circle, Alt centres on the drag origin.
- **`Ctrl+K` opens the command palette**, so `C` stays on the canvas tool and nobody relearns a
  shortcut that shipped the day before. It reaches 29 commands, all boolean or toolbar-derived, and
  the card says plainly that every non-boolean action is still menu-only.
- **`Ctrl+S` saves the board**, `Ctrl+Shift+S` is Save-As, `Ctrl+Alt+S` writes back to the file
  opened with `Ctrl+O`.
- **The eraser skips rotated drawings, deliberately.** It gated on the unrotated rect and clipped
  against untransformed points, then rebuilt the surviving pieces through a path that does not carry
  the angle, so one stroke both moved the ink and silently un-rotated the drawing. Doing it properly
  means mapping the disc into local space and deciding what angle each piece should carry, which is
  not simply the original, because the pieces have new bounding boxes. This is a known gap with the
  reason written above the guard, not a finished corner. Shapes are not eraseable either, because
  the eraser scrapes coordinates out of a path's `d` attribute and a `<rect>` has none.
- **PDF git history is left alone.** The user chose not to scrub. It is a decision, not a gap.
- **The preview server keeps its `0.0.0.0` bind.** Loopback-only is the tidier line but breaks
  testing a board on a real phone, which is the one thing the open mobile card needs. The Origin
  check on writes is the fix that does not cost that. Note that it does **not** extend to a
  WebSocket upgrade, which is why a hosted terminal stays refused.

## If you are the next agent

Decide what happens to the two held patches before anything else. They are the only thing standing
between this tree and 79 of 79, and they are the only work in the repo that is invisible from the
board.

Then open the PR. It is one step and it is the only thing that turns every number above into a
claim more than one machine has checked.
