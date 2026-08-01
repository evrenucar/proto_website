# Handoff 2026-08-01: continue here

Written for whoever picks this up next. The previous handoff,
[`handoff_2026-07-31_todo_lane_cleared.md`](./handoff_2026-07-31_todo_lane_cleared.md), covers how
the last sprint was run and is still worth reading for its gotchas. This file is about **what to do
now**.

## Read first, in this order

1. [`current_scratch_pad.md`](../../current_scratch_pad.md) — session state.
2. [`review-feedback.json`](../review-feedback.json) — the user's verdicts, newest first. **Read this
   before starting anything**, an `issue` verdict outranks everything on the board.
3. [`todo.md`](../todo.md) — the board. Every `[A]` card carries a "How to check" line.
4. [`agents.md`](../agents.md) — routing, board rules, and the concurrency rules.

## Where things stand

- Branch `fix-markdown-sidecar-405-error`, **4 ahead of its own remote, 3 ahead of `origin/main`,
  0 behind**. Nothing is pushed. Working tree clean.
- Commits this session: `8084737` the sprint, `a3e061c` the merge of main's toolbar panel fix,
  `6b7ca46` the landing page and PDF answers.
- Board: **48 in Review, 10 in To do, 0 in progress, 14 in Backlog.** No open questions.
- Whole suite green at handoff: board, build, features, export, preview.
- Preview server on **4174**. Start it detached, see the traps below.

## Start here

**1. The user left four new cards while the last session ran.** They are the freshest signal on the
board and two of them are feedback on work that just shipped. In priority order:

- **"I don't like how the pinning just snaps to my face."** Direct feedback on the pin feature from
  this session. They want the pinned item movable within the pinned layer, dragged by its edges and
  corners like an OS window. This is not a rewrite: it is the snapping follow-up that was already
  scoped and deliberately not shipped. The design is written up on the Backlog card
  *"Pin follow-up: Windows-style snapping"*, including zones and thresholds, and the core is
  already shaped for it (the pin box carries its own width and height, and `renderNode` already
  refuses to overwrite them). Read agent 8's reasoning on the pin card before touching it.
  **Note the grab problem:** a live embed can only be grabbed by its header, because
  `.bd-embed-shield` swallows mousedown over the iframe. Edge and corner handles on the pinned
  frame avoid that entirely, which is probably why the user asked for edges rather than the body.
- **Tracker loses scroll position** when cards are clicked or dragged, and they want visible ID
  numbers on cards, top left. This is friction in the tool the user lives in all day, so it is
  worth more than its size suggests. It is `.tracker/tracker.html` only, no runtime involved.
- **Arrow keys should pan the board** when nothing is selected, accelerating while held, with a
  speed cap. Careful: arrows are already bound when a YouTube node is selected, and the board
  forwards them at 5s seeks. The "nothing selected" condition is the whole safety of this.
- **Base64 assets in markdown**, with a prompt on download and a setting for the three modes. The
  user even specified the format they want, reference style with the data URI at the bottom of the
  file. Read the card, it is unusually precise about the output.

**2. Then the standing To do lane**, which is five roadmap cards added deliberately, priorities
already argued on each card: a CLI over the same board data (`!p2`), touch parity for the new
gestures (`!p2`), a shortcuts reference (`!p2`), a terminal node (`!p3`), and an audit for tests
that assert mechanisms rather than outcomes (`!p3`).

**3. Blocked, do not start:** the mobile fast-zoom crash needs the user's phone on USB. The full
setup is written on the card. They already declined shipping the grid cap blind.

## How to run a sprint here

This worked well and is worth repeating. `JavaScript/braindump.js` is one ~10,000-line file, so
**agents never write it**. Each proves its fix in a running page (route-intercept a patched copy, or
mirror the tree into its own scratch dir) and hands back **anchor-based hunks**; one orchestrator is
the single writer and applies them. Own port each, own test file each, no builds while others work.
Four agents ran concurrently and nothing was lost.

Two things that make it work:

- **A strict find-or-throw applier.** Every drift announced itself instead of corrupting a file.
- **Apply order.** The theme sweep touches 250 colour occurrences and anchors on the settings
  region that the toolbar/lock patch also rewrites, so it went last and re-derived itself. When
  anchors collide, fold the other patch's inserted lines into **both halves** of the hunk rather
  than dropping either feature.

## Traps that cost real time. Do not relearn these

- **Never `sed` a file list you built by grepping for `\r`.** Binary files contain carriage returns,
  and this destroyed six PNGs and a PDF in one command. The PDF was the sneaky one: `file` still
  called it valid because only the header was intact while 68 bytes had been cut from the middle,
  which breaks every xref offset. Filter to text first (`git grep -Il ''`, or skip anything with a
  NUL in its first 8KB). If it happens anyway, anything staged before the damage is recoverable from
  `git fsck --unreachable`, matched by applying the same mangling and comparing bytes.
- **Do not edit repo files through Python's text mode on Windows.** `io.open(p, "w")` rewrites every
  line ending to CRLF. It flipped `todo.md` wholesale and broke the tracker, which finds a lane with
  `indexOf("\n## " + section + "\n")`. Use the Edit tool, or pass `newline=""`.
- **Start the preview server detached.** A backgrounded shell job was killed three times, silently,
  taking every local URL down with it:
  `Start-Process -FilePath node -ArgumentList "scripts/preview-server.mjs" -WindowStyle Hidden`.
  Check the port before handing anyone a link.
- **A test suite that dies mid-run does not clean up.** A killed `perf-budget` left 114 `storm-*`
  nodes in the sandbox, breaking two suites from board *data*. Reset with
  `cp tests/fixtures/test-board-seed.canvas content/boards/test-board/current.canvas`.
- **`page.mouse.click(x, y, { modifiers })` silently ignores the modifiers.** That option belongs to
  `page.click(selector, ...)`. Hold the key with `keyboard.down`/`up`, or a chord test passes while
  never firing the chord.
- **`context.addInitScript` runs in every same-origin frame.** A test serving a stub page into an
  iframe had its own board state wiped by its own init script. Guard with
  `if (window.top !== window) return;`.
- **Never assert a colour without disabling transitions.** Toolbar buttons carry a 200ms colour
  transition and the select tool goes active during init, so a computed read lands mid-tween about
  one run in three. A fixed wait cannot fix a race.
- **The user edits the tracker while you work.** Cards appear mid-session. Re-read `todo.md` before
  editing it, and never rewrite the whole file.

## The lesson worth carrying

**Tests should assert outcomes, not mechanisms.** The markdown zoom regression, where wheeling over
a note stopped zooming the board, sat behind a green suite the whole time, because that suite
asserted a synthetic wheel *reached the viewport*, which it still did. Nothing asserted the camera
moved.

The same shape bit twice more the same day. `board-shift-snap-runtime` turned red from the pin patch
without any behaviour changing, because it scrapes source for the *first* `viewport` mousedown
handler and the pin chord registers one above it. And `cosmoboard-initial-layout` went red on camera
drift rather than on code. There is a `!p3` card to sweep the suites for this pattern, and it is
worth more than its priority suggests.

## Decisions already taken. Do not re-litigate

- **Board opening cameras: leave alone.** No `defaultViewport` for cosmoboard or braindump; they
  open wherever the last session stood. `cosmoboard-initial-layout` therefore pins a fixed camera in
  the *test* so it exercises layout rather than drift.
- **No blind grid cap** for the mobile crash. Phone on USB first.
- **Ctrl+click, not Ctrl+Tab, for pinning.** Measured: the browser eats Ctrl+Tab before the page
  sees it and `preventDefault` cannot stop a tab switch.
- **The embed address is not sweep-selectable.** It would cost the only drag handle a live embed
  has. Double-click selects and copies instead.
- **Landing page leads, both indexed.** `<priority>1.0</priority>` on `cosmoboard-landing.html`,
  everything else at the default.
- **All four public PDFs are down.** They remain in git history; scrubbing that is a separate
  destructive decision and is the user's. The Bayblend datasheet on the noindex dev board was
  deliberately left.

## Two things the user still owns

- **48 cards in Review.** That queue is the bottleneck now, not the building. Do not treat `[A]` as
  done: it means claimed and unverified, and the queue has been wrong before.
- **Pushing.** Nothing has been pushed. Three commits sit ahead of `origin/main`.
