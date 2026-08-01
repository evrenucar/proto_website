# Handoff 2026-08-01: the four-wave sprint

What happened, what it cost, and what is still moving. The previous handoff,
[`handoff_2026-08-01_continue_here.md`](./handoff_2026-08-01_continue_here.md), described the state
this session started from and is now history: everything it said to start with is done.

## Read first

1. [`current_scratch_pad.md`](../../current_scratch_pad.md) — session state.
2. [`review-feedback.json`](../review-feedback.json) — the user's verdicts, newest first.
3. [`todo.md`](../todo.md) — the board.
4. [`whiteboard/test_audit_2026-08-01.md`](../whiteboard/test_audit_2026-08-01.md) — **read this
   one properly.** It is the most useful artifact this session produced and it changes how you
   should read every green suite in this repo.

## Where things stand right now

- Branch `fix-markdown-sidecar-405-error`, **pushed**, in sync with its own remote, 5 ahead of
  `origin/main`. Commit `41df9af` carries the sprint: 75 files, +14,148 lines.
- **Wave 4 was still running when this was written.** Four agents (`opus5-27` drawing smoothness,
  `opus5-28` toolbar arrangement, `opus5-29` canvas shortcut, `opus5-30` Review-queue
  verification) are mid-flight, cards claimed `[~]`. Their patches land in
  `.tmp/scratch/<id>/patch.json`. **If you are picking this up cold, check those feeds and scratch
  dirs before assuming the cards are unstarted.**
- Board: 5 To do, 4 in progress, 70 in Review, 17 Backlog.
- Whole suite green at last full run: **64 of 64**. Site rebuilt, landing page in sync.
- Preview server on **4174**, restarted twice this session. Start it detached.

## What shipped

Seventeen cards across three waves, plus six follow-up bugs the user found by testing them.

Runtime: pin drag by edge and corner handles with Windows-style snap zones; an eraser that clips a
stroke against a disc so a cut leaves two nodes with a real gap, in one undo entry; pen brush
sizing by alt+scroll and long-press, taking a pointer lock so the range does not run out at the
screen edge; pen colour, cursor ring and size bubble all following the theme accent; a canvas tool
with nested canvases and rename-safe identity; base64 markdown download in three modes; the
toolbar folding with the lock at bottom centre; arrow-key panning; a shortcuts panel behind `?`;
touch parity; a computer-window node with a protocol switch; a rebuilt settings panel.

Tooling: the `cosmo` CLI, a recreatable performance benchmark, and the test audit.

Two security- and correctness-relevant changes: **Ctrl+S now saves the board** (it used to open a
Save-As dialog and post nothing), and **the preview server refuses cross-site writes**.

## How the sprint was run, and why it did not lose anything

`JavaScript/braindump.js` is ~12,000 lines and every runtime card touches it. **Agents never write
it.** Each proves its fix in a running page (route-intercepting a patched copy) and hands back
anchor-based hunks; `opus5-0` is the single writer and applies them. Own port each, own test file
each, no builds while others work. **26 agents ran across three waves and nothing was lost.**

Two tools made it work, both in `.tmp/scratch/opus5-0/`:

- **`verify-anchors.mjs`** checks every hunk's anchor resolves to exactly one occurrence, and
  cross-checks whether two agents anchored on overlapping text. That second check is the one an
  individual agent cannot do for itself, and it is what catches "applying A silently invalidates
  B" before it happens.
- **`apply-patch.mjs`** is strict find-or-throw and **all-or-nothing across every file in a
  patch**. See the trap below for why that matters.

## Traps this session, on top of the ones in the previous handoff

- **The applier was not atomic, and a reviewer proved it by running it.** It wrote each file as
  that file's hunks resolved, so a patch spanning `braindump.js` and `preview-server.mjs` wrote a
  fully patched client and then threw on the server, leaving a patched client talking to an
  unpatched server. Fixed: everything resolves in memory first, nothing is written unless every
  hunk in every file resolves.
- **Anchors go stale mid-session.** `opus5-16` refactored `preview-server.mjs` into
  `scripts/lib/board-store.mjs` while `opus5-13` held a patch against the old shape. Two of its
  hunks went to zero occurrences. Re-verify anchors against disk immediately before applying, not
  against what the agent reported earlier.
- **Restarting the preview server early and patching it later is the same stale-process trap the
  router warns about, and I still fell into it.** The canvas tool shipped, the user pressed the
  button, and got "no endpoint on host" because the running process predated the routes. If you
  touch `scripts/preview-server.mjs`, restart 4174 before telling anyone it works.
- **`tests/export/export-bundling-e2e.test.mjs` hardcodes port 4182**, and `pen-and-eraser-tools`
  uses 4262. A leftover agent server on one of those makes a suite fail for reasons that have
  nothing to do with code. Kill agent ports when a wave ends.
- **PowerShell 5.1 `Set-Content -Encoding utf8` writes a BOM**, which makes `JSON.parse` fail on a
  file that looks fine. Use `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`.
- **`gh workflow run` needs the workflow on the DEFAULT branch.** `board-tests.yml` only exists on
  this branch, so dispatch 404s and pushing alone runs no CI. See the open card.

## The lesson, sharpened

**Tests here lie in a specific, repeatable way, and the reviewers caught more of it than the
suites did.** Eleven reviewer-proven defects were fixed this session. The ones worth carrying:

- An arrow-pan suite passed with the **speed cap deleted**, and passed again with the **"nothing
  selected" gate deleted**. Both halves of the card were untested while green.
- A toolbar suite asserted the shell's centre equals the window's centre, which `left: 50%`
  guarantees, so it passed while the affordance the user was complaining about sat 303px off.
- `board-save-export-runtime` asserted a regex with an unbounded `[\s\S]*` between the Ctrl+S
  condition and `saveBoard()`, matching a call 800 lines away. It could not fail.
- `board-save-reload-e2e` waited 30s for a save POST that the 20s autosave timer supplied, so it
  passed with the whole Ctrl+S branch deleted.

The pattern: **a test that cannot fail is worse than no test**, because it converts "unverified"
into "verified" on the board. When you write one, delete the feature and watch it go red. Every
new suite this session did that, and it is recorded on each card.

## Decisions taken this session. Do not re-litigate.

- **Ctrl+S saves the board.** `Ctrl+Shift+S` is Save-As, `Ctrl+Alt+S` writes back to the file
  opened with Ctrl+O. The user chose this explicitly over keeping local-file save.
- **PDF git history is left alone.** The user decided not to scrub. It is a decision, not a gap.
- **The preview server keeps its `0.0.0.0` bind.** Loopback-only is the tidier security line but
  breaks testing a board on a real phone, which the user asked for. The Origin check is the fix
  that does not cost that.
- **Pin edges and corners MOVE the box, they do not resize it.** Resizing comes from the snap
  zones. A live embed has no other grab point, since the shield eats mousedown over the iframe.
  Flagged to the user as the most likely "not what I meant" in the sprint.
- **Changing the accent restyles only NEW strokes.** Existing strokes bake their colour into their
  node; repainting them would rewrite board data.
- **Electron over Tauri, if a desktop shell is ever built.** This reverses the earlier note and the
  reasoning is in the research below.

## Two things a research note corrected, both worth knowing

`.agents/research/embedding_options_firefox_app_distro_2026-08-01.md` found that
`vnc_and_iframe_embedding_2026-07-30.md` is **factually wrong** where it says Tauri and Electron
webviews ignore X-Frame-Options. Both enforce it. Electron can strip headers in
`session.webRequest.onHeadersReceived`, keeping embeds as real DOM iframes that pan and zoom with
the canvas; Tauri has no header interception and its only path is native child webviews that
cannot clip to a spatial canvas. **The old note is the one linked from the roadmap and still says
the wrong thing.** Correcting it is a small, worthwhile chore.

`.agents/research/filesystem_integration_2026-08-01.md` found the File System Access API sits at
~28% global support with Firefox holding a formal "harmful" position and Safari absent, so
`showDirectoryPicker` cannot be the answer for a site whose owner uses Firefox. The cross-browser
answer is `webkitGetAsEntry` for reads plus the existing preview server for writes.

## What is open, and what is actually blocking each

- **CI has never run on this branch.** `board-tests.yml` triggers on `pull_request` and
  `workflow_dispatch`, and dispatch is unavailable because the file is not on `main`. Opening a PR
  fixes it immediately. Every "green" claim on this board is still one machine, one Chromium.
- **Ctrl+S card is done but the Review queue is now 70 cards.** `opus5-30` is mid-flight producing
  the mechanical re-verification; its report lands at
  `.agents/whiteboard/review_queue_verification_2026-08-01.md`. **Read that before treating any
  `[A]` as done.**
- **The mobile fast-zoom crash** is still blocked on the user's phone on USB, by their own
  decision. The full setup is on the card, and `scripts/mobile-diag-server.mjs` plus
  `.agents/whiteboard/mobile_testing_guide.md` now exist to make that session short.
- **Frozen roadmap phases 3, 4, 6, 7, 8 and the desktop shell** were deliberately not started.
  They are multi-week programmes the objective freeze covers, and they need an explicit unfreeze
  rather than an agent quietly beginning a CRDT layer.

## If you are the next agent

Start by checking whether wave 4 landed. If its patches are sitting unapplied in
`.tmp/scratch/opus5-2{7,8,9}/patch.json`, verify anchors first (`verify-anchors.mjs`), then apply
with `apply-patch.mjs`, then run the suites those cards name. `opus5-30` produces a report, not a
patch.

Then read `opus5-30`'s Review-queue report. Seventy cards claiming to be done, verified by
machine, is worth more than anything you could build next.
