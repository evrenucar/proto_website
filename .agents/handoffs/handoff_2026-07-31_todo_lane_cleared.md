# Handoff 2026-07-31: the To do lane cleared

One long session, run as a fan-out. Nine features and one regression landed, the To do lane is
empty apart from work that is blocked on the user, and the roadmap was re-read against what now
exists to produce five new cards.

## Read first, in order

1. [`current_scratch_pad.md`](../../current_scratch_pad.md) — session scope and the end state.
2. [`todo.md`](../todo.md) — the board. 49 cards in Review carry "How to check" lines.
3. [`review-feedback.json`](../review-feedback.json) — the user's verdicts, newest first.
4. [`agents.md`](../agents.md) — routing, the board rules, and the concurrency rules that made
   this session work.

## How this session was run, and why it is worth repeating

`JavaScript/braindump.js` is one ~10,000-line file. Four agents worked it concurrently and none of
them wrote to it. Each proved its fix in a running page (route-intercepting a patched copy, or a
mirror of the tree in its own scratch dir) and handed back **anchor-based hunks**; the orchestrator
was the single writer and applied them. Own port each, own test file each, no builds while others
worked. Nothing was lost to a collision.

**Apply order matters and cost real time to get right.** The theme patch sweeps 242 colour
occurrences and anchors on the settings region, which the toolbar/lock patch also rewrites. Applied
last, and because its sweep re-derives from the files at apply time, it picked up the lock feature's
new CSS too (250 occurrences instead of 242). Three of its four JS anchors had drifted; the fix was
to fold the lock's inserted lines into **both halves** of each hunk, so the anchor matches and
neither feature is dropped. Anchor-based hunks plus a strict find-or-throw applier is the pattern to
keep: every drift announced itself instead of corrupting a file.

## What landed

All in Review. Every card carries a "How to check" line and states any place the user's spec was
changed.

| Area | What |
| --- | --- |
| runtime | Embed shield generalised from YouTube-only to every live embed. Fixes wheel-zoom and middle-drag pan being eaten by PDFs, websites and app nodes |
| runtime | Fullscreen button on live embed headers, native API on the shell |
| runtime | Embed header shows the real URL; double-click selects and copies it |
| runtime | YouTube remembers where you left off, persisted to the node |
| runtime | Shift constrains a drag to axis or diagonal, live modifier, anchored on the drag origin |
| runtime | Pin an item to the viewport, counter-transform, ghost left behind |
| ui | Toolbar auto-hide plus a page lock, designed together |
| ui | Light mode and a theme group: background, dot colour, grid style, accent |
| bug | Wheeling over a markdown note stopped zooming the board. A regression, see below |

### Three decisions where the user's spec was changed

Each is stated at the top of its own card, so the user can overrule it.

1. **Ctrl+Tab is impossible.** Measured with a real OS keystroke into a focused Chrome window: a
   plain key reaches the page, Ctrl+Tab produces zero keydowns. The browser consumes it and
   `preventDefault` cannot stop a tab switch. Pin is **Ctrl+click** (Cmd+click on macOS).
2. **The embed address is not sweep-selectable.** Making it so means the address swallowing
   mousedown, and for a live embed the header is the only drag handle, because the shield owns the
   iframe. Measured at a 7px grab gap on a 480px node. Dragging won; the double-click selects (via
   a Range) and copies.
3. **Pin snapping to halves and quarters is not built**, filed as a scoped follow-up rather than
   shipped half-working. The core is shaped for it: the pin box already carries its own width and
   height and `renderNode` already refuses to overwrite them.

## Gotchas that bit this session (do not relearn these)

- **Do not edit repo files through Python's text mode on Windows.** `io.open(p, "w")` rewrites every
  line ending to CRLF. It flipped `todo.md` wholesale, and the tracker finds a lane with
  `indexOf("\n## " + section + "\n")`, so adding a card failed with `Section "Test failures" is not
  in todo.md` while the heading sat right there. Use the Edit tool, or `newline=""`. Check with
  `file <path>`, repair with `sed -i 's/\r$//'`.
- **Start the preview server detached.** `npm run preview` as a backgrounded shell job was killed
  three times, silently, taking every local URL down with it. Use PowerShell
  `Start-Process -FilePath node -ArgumentList "scripts/preview-server.mjs" -WindowStyle Hidden`
  and re-check the port before handing anyone a link.
- **A test suite that dies mid-run does not clean up.** A killed `perf-budget` left 114 `storm-*`
  nodes in the sandbox board, which then broke `markdown-wheel-zoom` and `vnc-node` from board
  *data*, not code. Reset with `cp tests/fixtures/test-board-seed.canvas
  content/boards/test-board/current.canvas`. A run that completes restores itself.
- **`page.mouse.click(x, y, { modifiers })` silently ignores the modifiers.** That option belongs to
  `page.click(selector, ...)`. Hold the key explicitly with `keyboard.down`/`keyboard.up`, or a
  chord test passes while never firing the chord.
- **`context.addInitScript` runs in every same-origin frame, not just the top one.** A test serving
  a stub page into an iframe had its board state wiped by its own init script. Guard with
  `if (window.top !== window) return;`.
- **Do not assert a colour without disabling transitions.** Toolbar buttons carry a 200ms colour
  transition and the select tool goes active during init, so a computed-colour read lands mid-tween
  roughly one run in three. A fixed wait cannot fix a race.

## The lesson worth carrying: tests that assert mechanisms

The markdown zoom regression is the important find of this session, and it is a *class* of problem.

Last session's settings-panel scroll fix routes a wheel to "the first element on the way up that can
actually scroll", and it checked for a board node **inside** that walk. Any node containing
something scrollable matched first, so a note long enough to overflow silently ate the wheel and the
board stopped zooming over exactly the notes worth reading.

`markdown-wheel-routing` passed the whole time, because it asserts that a synthetic wheel *reaches
the viewport*, which it still did. Nothing asserted the camera moved. `tests/board/markdown-wheel-zoom.test.mjs`
now asserts the camera, and it asserts up front that the note actually overflows, since with nothing
to scroll the broken branch is never taken and the suite would pass while proving nothing.

The same shape bit again immediately: the pin patch turned `board-shift-snap-runtime` red without
changing any behaviour, because that suite scrapes source for the **first**
`viewport.addEventListener("mousedown")` block and the pin chord registers one above the
tool-routing handler. It now selects the block by what it contains. There is a `!p3` backlog card to
sweep the suites for this pattern.

## Open work

- **To do, 6.** Five are new roadmap cards, below. The sixth is the **mobile fast-zoom crash**,
  which is blocked on one session with the user's phone on USB; the full setup is written on the
  card, and the user decided against shipping the grid cap blind.
- **In progress, 0. Review, 49.**
- **Backlog, 14**, including the pin-snapping follow-up.

### New cards, added from re-reading the roadmap. Priorities are the agent's call

- `!p2` **A CLI over the same board data.** `COSMOBOARD_MIGRATION.md` stage 2 names canvas,
  markdown and CLI as three views over one store, and two of three exist. Boards are plain JSON plus
  markdown sidecars on disk, so this needs no new data model and no server, and it is the cheapest
  way to give an agent control of a board.
- `!p2` **Touch parity.** Pin needs Ctrl and shift-drag needs Shift, so neither exists on a phone.
  Every interaction added this session is desktop-only, which quietly makes this two products.
- `!p2` **Nothing tells you the shortcuts exist.** Alt-drag copy, shift-lock, Ctrl+click pin, video
  keys: all invisible. A first-time visitor is the whole objective.
- `!p3` **A terminal node**, the other half of migration stage 3. Unlike VNC there is no host that
  already speaks the protocol, so it waits for the desktop shell.
- `!p3` **Audit the suites for mechanism-asserting tests**, per the section above.

### Decisions taken by the user this session, so they are not re-litigated

- **Board opening cameras: leave alone.** No `defaultViewport` for cosmoboard or braindump. They
  keep opening wherever the last session stood. The card is parked in Backlog with the mechanism
  recorded. Consequence: `cosmoboard-initial-layout` was going red on camera drift, so **the test**
  now serves the real board with a pinned camera, exercising the layout code rather than the drift.
- **No blind grid cap** for the mobile crash. Phone on USB first.

## State of the tree

- Branch `fix-markdown-sidecar-405-error`. This session's work is committed; earlier sessions' work
  is in the same commit, since it had been sitting uncommitted.
- Whole suite green at handoff: board, build, features, export, preview.
- Performance after everything: idle 16.8ms p95, drag 83.4, pan 99.9, zoom 166.6 against a 220
  budget (headless software raster), pointer dispatch **4.85us** against a 25us budget. The pin hook
  in `updateTransform` early-returns on an empty Map, so it costs nothing when nothing is pinned.
- Site rebuilt. Preview server on **4174**; 4173 belongs to `aide-board`.
- Sandbox board reset to its seed fixture.
