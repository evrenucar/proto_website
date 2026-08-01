# Todo

The single live task list for this repo. Everything else is history.

## Purpose
Open work, known issues, and the review queue, in one place.

## Read when
Picking up work, or checking what is outstanding.

## Skip when
You want session state (`current_scratch_pad.md`) or finished-work detail (the archived files listed at the bottom).

## Canonical for
Open tasks, known issues, review queue, backlog.

---

## The review queue does not gate shipping

Decided 2026-07-29. `[A]` means *claimed, unverified*, nothing stronger. One proof block in there was
already false: it stated the cosmoboard canvas contained an `entity` node, which it never has in any
commit. So the queue has near-zero evidential value and must not block a merge or a deploy.

Only two properties gate shipping, and both are covered by tests:

1. The build does not delete `content/`.
2. The runtime does not lose markdown.

A wrong claim about a button costs nothing and shipping is how it gets tested. A destructive build
costs 54 files, which is what it cost once already.

## Status legend

These five markers are the kanban columns on `/.tracker/tracker.html`. Changing a marker here moves the
card there within seconds.

- `[.]` Backlog, parked without a timeline
- `[ ]` To do
- `[~]` In progress, someone is on it right now
- `[A]` Review, implemented and waiting on user verification
- `[x]` Done, user has verified it

## Rules

- Highest priority nearest the top of its section.
- **Claim a card before you start:** set it to `[~]` and add `@your-name` anywhere in the line.
  The tracker colours the card border per agent, so it is visible who holds what. Release it by
  moving it to `[A]` and dropping the tag.
- **Push a status line when you start, finish, or get stuck.** Prepend an entry to
  `.tracker/tracker-feed.json`: `{ "at": "<ISO time>", "agent": "<name>", "text": "..." }`.
  Newest first. That feed is the strip across the top of the tracker.
- When a task moves, its subtasks and notes move with it.
- One small validation block near the end of a task, not repeated test steps throughout.
- Once you verify an `[A]` item, mark it `[x]` and delete it on the next pass. The user does this
  from the board now: **works** on a card sends it to Done, **issue** sends it back to To do, and
  either one can carry a note. Dragging a card between columns rewrites its marker here. All of it
  lands in [`review-feedback.json`](./review-feedback.json), which agents read at session start.
- Anything that outlives a session belongs here, not in `current_scratch_pad.md`.

---

## Now

- [ ] In the task management tracker board when I click items move things drag items the scroll position of items disappear and it becomes hard to find them fix this. Also maybe best to add ID numbers to thm that are visible and easy to manage.top left # ()

- [ ] Lets have a option to embed the images and other assets that are small enough into markdow via embedding them in BASE 64. Maybe for now can ask after you click the download icon. ANd also would be nice to have a setting for it in settings. Currently the default behavior should be asking the user. In settings alternatives can be: base64 embded markdown, download makrdown with content as zip, download markdown with assests without assets. Also when embedding base-64 it would be ideal if in markdown its formatted as a reference: Where the image is: ![Growth Chart][chart-1] (at the bototm of the file: [chart-1]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAA.

- [x] Tracker: agents are declared, not guessed. !p2
  [`.tracker/agents.json`](../.tracker/agents.json) holds one entry per agent: id, number, the
  model behind it, the goal it is on, and a colour. The board reads it, so the strip says
  "opus 5 · 2, alt-drag copy undo, working" instead of a bare "claude", the card border and the
  owner chip carry that agent's colour, and agent 1 stays blue. An agent missing from the registry
  still renders on the old hashed colour, so nothing has to register to work.
  **The status feed is now several files, on purpose.** Each agent appends to its own
  `.tracker/feed/<id>.jsonl`; the tracker merges them with `tracker-feed.json` and sorts by time,
  so it reads as one strip. Appending to your own file cannot lose another agent's write, which a
  read-modify-write of one shared feed can and did. Five agents posted through it concurrently
  this session with nothing lost. A half-written last line loses only itself.
  The rules for running several agents at once are written down in [`agents.md`](./agents.md):
  one writer per file, own port each, never build while others work, never write to content/.
  **How to check:** open the tracker. The strip across the top names each agent by model and
  number with its goal; claimed cards match their owner's colour. Kill the registry file and the
  board still works, on the old colours.

- [A] [runtime] VNC support is built and demonstrated, the v2 the research note described. !p2
  noVNC 1.7.0 is vendored at `JavaScript/vendor/novnc/` and a real `vnc` node type is in the
  runtime: a header with a live status dot, a connection form, and the session itself. The client
  is 50-odd ES modules, so it loads through a dynamic import on the first connect; a board with no
  VNC node never fetches a byte of it.
  **Credentials and resume, the part you asked for:** the target address is board data and lives
  in the canvas, the password is not and never goes there. It sits in this browser's localStorage
  under the board and node id, the same deal as the GitHub sync token, so a board can be committed
  and shared without carrying a credential. Tick remember, and on the next load the node connects
  by itself with no form and no typing. A blank password with remember ticked is stored too, which
  is how a passwordless server resumes as well.
  Keys typed into a live session belong to the remote machine, including Delete, which would
  otherwise have deleted the node the session runs in. Closing or deleting the node closes the
  socket.
  **The demonstration:** the test board has a VNC node, and the dev board's old placeholder (a
  link node pointing at a fake KasmVNC host) is a real one now. Point either at anything speaking
  RFB over WebSocket: KasmVNC, x11vnc built with websockets, or websockify in front of a plain
  VNC server.
  **Proof:** `tests/board/vnc-node.test.mjs`, seven cases against `tests/helpers/mock-rfb-server.mjs`,
  a real RFB 3.8 server in 200 lines: version handshake, VNC authentication by DES
  challenge/response, ServerInit, framebuffer updates in the pixel format the client asks for. It
  proves the wrong password is refused and says so, the right one connects, the pixel drawn on the
  canvas is the pixel the server sent, the credential is in localStorage and provably not in the
  board state, a reload opens a second session with no typing, and deleting the node closes it.
  Found and fixed along the way: `normalizeAssetUrl` strips the host off same-origin and localhost
  URLs to keep assets portable, which turned `ws://127.0.0.1:6080` into `/`. VNC nodes are exempt
  now; a websockify on the same machine is the ordinary case, so this would have bitten
  immediately.
  **How to check:** run a VNC server that speaks WebSocket (`kasmvnc`, or
  `websockify 6080 localhost:5901` in front of one you already have), open the test board, put its
  address in the VNC node, type the password, tick remember, connect. Then reload the page: it
  should come back on its own, straight into the desktop.

- [A] [sync] Stale-tab clobber guard shipped, the interim fix for the worst main-feature bug !p1
  observed this session (three silent overwrites by stale tabs). Every save now carries the
  on-disk updatedAt the tab loaded against; the server refuses a save whose base is older than
  the file and answers stale, and the tab shows "board changed elsewhere, reload" while keeping
  the work in the browser instead of destroying newer state. Draft-restored tabs probe the disk
  baseline at load. Covered by new cases in the save-endpoint test; save-reload e2e and the
  stage gate pass (the gate even caught and removed a stray test clone, proving itself).
  **How to check:** open a board in two tabs, save in one, edit and save in the other: the
  second gets the reload message instead of silently clobbering the first.

- [A] [export] Markdown download bundles referenced images now. A note referencing repo-local
  images downloads as a zip: the .md (frontmatter intact, image refs rewritten to bundled
  images/ paths) plus every image; plain notes still download as a bare file. Verified end to
  end: pasted a screenshot into the sandbox note, downloaded, inspected the zip: both entries
  present, refs rewritten.
  **How to check:** paste an image into any note, press the download arrow; you get a zip whose
  markdown renders the image from its own images folder.
- [A] [runtime] Embed overflow fixed. Two causes: .bd-embed-iframe combined flex:1 with
  height:100 percent, so live link embeds poked out below by exactly the header height, and the
  board-preview shell was an unclipped grid. The iframe now sizes by flex alone, and both the
  live-link shell and the board-preview shell clip to the node box. Stage gate and the YouTube
  embed suite pass.
  **How to check:** reload any board with live embeds or board previews; nothing crosses its
  node border, including the big tracker embed on the dev board.
- [x] [runtime] Alt-drag copy, now a live modifier per your refinement. Alt works before, !p2
  during, or after grabbing: press it mid-drag and clones appear at the drag origin; release it
  mid-drag and they vanish; the state at mouse-release wins. Visuals as specified: the
  stay-behind copy keeps the selected-style outline, the moving set carries a 20 percent teal
  glow across its face, and on release the moved item is selected, the copy is not, all glow
  gone. Undo removes the copy. Verified in a browser through every phase: late Alt engaged,
  Alt-release disengaged, re-engage finalized with correct selection and zero leftover classes.
  **How to check:** drag any node, tap Alt mid-drag and watch the copy appear with both glows;
  release Alt, it vanishes; hold Alt and let go of the mouse, the copy stays behind.
- [A] [runtime] Standardized placement shipped: every centered spawn and click placement runs !p2
  through findFreeCanvasPosition, a spiral probe against existing node rects with 16px padding,
  so new items land beside neighbors instead of on top of them (deliberate placements only nudge
  when they would overlap). Stage gate passes.
  **How to check:** create several notes in a row without moving the view; they tile instead of
  stacking.
- [A] [dev-board] The dev board is findable and full. The tracker footer links it (and the test !p2
  board). Eleven showcase nodes added: text, link preview, live YouTube (lazy), image, a
  drawing, a VNC demo slot (run KasmVNC anywhere, paste its URL, flip to live), a board preview
  of the test board, plus base, app and entity nodes copied from proven cosmoboard shapes.
  **How to check:** tracker footer, dev board; pan down to the Showcase row.
- [A] [perf] Perf budget test shipped and wired into CI, item 5 of the performance plan. !p2
  `tests/board/perf-budget.test.mjs` seeds the sandbox with 120 nodes and measures four storm
  phases (idle, wheel-zoom, real-input node drag, middle-button pan), each against its own p95
  frame budget, plus the tight assertion: pointer-move dispatch cost through the interaction
  relay, 2.8 to 5us per event measured, 25us budget, so the 71us listener-per-node class of
  regression turns red with margin. Frame budgets are env-tunable because headless Chromium
  rasters in software; the new workflow `.github/workflows/board-tests.yml` runs the stage gate
  then this on every PR with CI-sized budgets. Found along the way: the sandbox had drifted
  (stray nodes, a dead image ref, the markdown node's canonical id replaced), which had the
  stage gate red. Both tests now seed canonical state from `tests/fixtures/test-board-seed.canvas`
  before running and restore whatever was there after, so sandbox play can never break the gates
  again. The on-disk sandbox is reset to canonical too.
  **How to check:** `node tests/board/perf-budget.test.mjs` prints the five measurements;
  `node tests/board/test-board-basics.test.mjs` is green again.
- [A] [runtime] Fallback cards for iframe-refusing sites shipped, per the research note's !p3
  recommendation. Two detectors feed one card: a short list of hosts known to refuse (github,
  google, x, notion and friends; works on static hosts too) and a real header probe through the
  new `GET /api/frame-check` endpoint when the preview server is present, which reads
  X-Frame-Options and CSP frame-ancestors, following redirects, with frame-ancestors correctly
  overriding XFO. Results cache per origin. A refused live embed (link and app nodes both) shows
  a card naming the site with "open in a new tab or switch back to Preview" instead of the grey
  error box; framable sites are untouched, YouTube and local blob urls skip the check. Verified
  in a browser three ways: github.com (list path, no iframe ever mounts), developer.mozilla.org
  (probe path, card swaps in when the server answers), example.com (stays a live iframe).
  Endpoint test `tests/preview/preview-frame-check-endpoint.test.mjs` covers six header shapes
  plus bad urls and unreachable targets. Stage gate, YouTube embed and preview routes all green.
  Server on 4174 restarted with the endpoint.
  **How to check:** flip any live embed to a refusing site (paste a github link, switch to
  live); you get the named card instead of a grey box. `node
  tests/preview/preview-frame-check-endpoint.test.mjs` for the endpoint.
- [A] [data] Benchmark backfill done: machine-readability is 47/47 (100 percent). The 13 legacy !p3
  markdown nodes got stable ids (`cosmo-note-<nodeId>`, the registry naming style), and the four
  litter nodes are deleted: the "two untitled links" turned out to have no url either, and the
  two empty text nodes held nothing; no edges referenced any of them. Canvas updatedAt bumped on
  all three boards so the stale-tab guard refuses saves from tabs opened before this; site
  rebuilt; stage gate green. **Reload any open braindump, cosmoboard or onboarding tabs.**
  **How to check:** `node tests/benchmarks/machine-readability.mjs` prints 47/47 (100%).

## Backlog sweep, 2026-07-30

Folded in from the phased roadmap, the migration stages, and the standing analyses, tagged by
work area. Parked without timelines; pull cards out as direction firms up.

- [.] [bases] Phase 3, structured local views: the base and database layer over notes, boards,
  and assets, beyond today's single base node.
- [.] [runtime] Phase 4 remainder: generic file nodes, focused viewers, folder import.
- [.] [sync] Stage D collaboration: GitHub OAuth plus a stable PR per board per user, the
  moderated async model. The token-based sync now in review is its stepping stone.
- [.] [sync] Operation-level canvas writes, stage 1 of the realtime note: node-level ops with an
  expect guard. The interim whole-save base guard shipped 2026-07-30 already stops silent
  clobbers; ops additionally make concurrent edits merge instead of one side reloading.
- [.] [sync] Presence and reflected refresh, stage 2 of the realtime note: heartbeat file plus
  the tracker's proven poll pattern on boards.
- [.] [sync] Phase 6, live co-editing: server-serialized ops over SSE or sockets first, CRDT
  only if offline merge becomes a requirement.
- [.] [apps] Phase 7, app surface: sandboxed app embeds with a manifest and session state.
- [.] [export] Phase 8, ecosystem portability: richer Obsidian round-trip, plugin or local API.
- [.] [perf] Incremental saves: dirty-node tracking so serialization is O(change), shared
  design with operation-level writes.
- [.] [perf] Staged mount: viewport-first node rendering, the rest in idle callbacks.
- [x] [runtime] A `vnc` node type with the noVNC client vendored, per the VNC research v2. Built
  2026-07-30; see the card in Now.
- [.] [shell] Desktop shell (Tauri or Electron), migration stage 3: embeds anything, terminals,
  real file access; the decided answer to iframe walls when its time comes.
- [.] [direction] Migration stages 4 and 5 horizon: collaboration model, then the operating
  environment; adopt via the proposed roadmap at the end of holistic_planning.md.

### Added 2026-07-31, from re-reading the roadmap against what now exists

Priorities are my call, as asked. Reasoning is on each card so you can overrule it.

- [ ] [cli] A CLI over the same board data, the peer interface the migration plan names and !p2
  nothing has started. `COSMOBOARD_MIGRATION.md` stage 2 is explicit that canvas, markdown and
  CLI should be three views over one store, not three stores, and two of the three exist. This
  is the highest-value **gap** on the roadmap rather than the highest-value feature: boards are
  plain `.canvas` JSON plus markdown sidecars on disk, so a CLI is reading and writing files we
  already own, with no new data model and no server. It is also the cheapest way to give an
  agent control of a board, which the vision names as a first-class use.
  Smallest useful version: list boards, list and grep nodes, add a note, export a board. p2 and
  not p1 because nothing today is blocked on it.
- [ ] [runtime] A terminal node, the other half of migration stage 3. VNC landed and proved !p3
  the pattern (vendored client, credentials in localStorage and never in the board file, lazy
  import so a board without one costs nothing). A terminal is the same shape over a PTY, but
  unlike VNC it has **no host that already speaks the protocol**: it needs something local to
  serve the PTY, which is a real dependency and the reason this is p3 rather than p2. Revisit
  when the desktop shell card thaws, since that shell is the natural host.
- [ ] [runtime] Touch parity for the gestures added this session. Pin is Ctrl+click and !p2
  shift-drag needs a Shift key, so **neither exists on a phone or tablet**, and mobile is not a
  side case here: the open crash report and the pinch fixes are all mobile. Wants a long-press
  or a node action for pinning and a visible axis-lock affordance while dragging. p2 because
  every new interaction this session is desktop-only, which quietly makes the board two
  different products.
- [ ] [ux] Nothing tells you the shortcuts exist. The board now has alt-drag copy, shift-axis !p2
  lock, Ctrl+click pin, space and arrows on a selected video, Escape, and more, and every one of
  them is invisible. A first-time visitor is the whole objective, so undiscoverable features are
  close to unbuilt features. Smallest useful version: one shortcuts panel behind `?` and a line
  in the settings help, listing what exists. Deliberately not a command palette yet.
- [ ] [test] Tests should assert outcomes, not mechanisms. `markdown-wheel-routing` asserted !p3
  that a synthetic wheel *reached the viewport* and passed happily while the board had stopped
  zooming for real, which is how the markdown zoom regression got in. Worth one pass over the
  suites for the same shape: anywhere we assert a listener fired, a class was toggled, or an
  event propagated, check whether the user-visible result is asserted anywhere. Not urgent, but
  it is the difference between a green suite and a working board.

- [A] Lazy embeds shipped, item 1 of the performance plan. Live iframes (YouTube, Wikipedia, !p1
  apps) render a light placeholder until their node comes within 600px of the viewport, activate
  on approach, and unload again after two minutes fully offscreen, unless a YouTube embed is
  playing. Load, memory and the long-frame stalls now scale with what is visible, not with the
  board. Verified live on the cosmoboard: the offscreen YouTube node loaded as a placeholder and
  activated the moment it scrolled into view; youtube-live-embed and the stage gate pass.
  **How to check:** open `/braindump.html` cold with the network tab open; only nearby embeds
  load. Pan to a far embed: it says "loads when nearby", then boots as it approaches.
- [A] Selection as state shipped, item 2 of the performance plan. A Set of selected node ids is !p2
  kept true by a mutation observer on the canvas, so none of the many class-toggle sites had to
  change and the Set cannot drift; deleted nodes fall out via childList records, and the central
  getter drains pending records so same-task reads stay exact. Every hot read (keyboard paths,
  YouTube key forwarding, Escape, dev overlay) goes through the one getter, O(selection) instead
  of O(board). esc-deselect 5/5, drag, youtube and the stage gate all pass.
  **How to check:** behavior is identical by design; the dev overlay's selected row still tracks
  clicks exactly, and Escape still clears any selection.
- [x] Text no longer stays pixelated after zooming. The permanent `will-change: transform` from !p1
  the zoom-spike fix kept the board layer rasterized at a stale scale; the layer is now promoted
  only while a zoom gesture is running (wheel and pinch both set it) and the hint drops 200ms
  after the last zoom event, forcing a crisp re-raster at rest. Zooming keeps the no-stall
  behavior; standing still gets sharp text.
  **How to check:** zoom in on any text-heavy board, stop moving; text sharpens within a beat
  instead of staying blurry. The dev overlay's spike counter should stay as calm as before.
- [A] GitHub repo sync is built. Board settings has a **GitHub sync** section: repository !p1
  (owner/repo), branch, token, and an enable toggle, persisted per board in this browser only.
  Every save (manual, autosave, and saves on static hosts, where it is exactly the missing
  persist path) commits the canvas to the repo via the Contents API: sha read, then a PUT commit
  named `cosmoboard: update <path>`. Autosync is rate limited to one commit per 30 seconds;
  manual saves always push and toast the result; failures toast the GitHub error verbatim.
  Verified end to end in a browser with a deliberate bad token: correct API call, correct file
  path, clean "could not read (401)" toast. Sidecar files ride inside the canvas via
  `_rawMarkdown`, so no content is lost; committing them as separate files is a follow-up.
  **How to check:** make a private repo, create a fine-grained token with contents read and
  write on it, paste both in the gear panel on any board, hit save. The commit appears in the
  repo within seconds; edits from anywhere with the token keep flowing on every save.
- [x] Tracker: **more** responds instantly now, measured 4.4ms. The click re-renders from the !p2
  cached cards instead of forcing a network poll first, which was the whole delay.
  **How to check:** click more/less on any long card; the expansion is immediate.
- [A] Tracker: compact mode shipped. The **Compact** button top right collapses every card to its !p2
  heading and priority chips; notes, feedback rows and timestamps hide. Persists across reloads.
  Your "cant see compact" note: the tab was running the old page. The tracker polls data live but
  its own HTML only changes on reload, so **reload the tracker tab once**. Fixed for good along
  the way: the page now watches its own Last-Modified and shows a "New version, reload" button
  whenever the file changes underneath an open tab.
  **How to check:** reload the tab, Compact appears top right; the board becomes a heading list.
- [A] Tracker: card headings wrap instead of overflowing. Long unbroken tokens (paths, code !p2
  spans) now break anywhere within the card for titles and notes both. Your "hasn't taken
  effect" note has the same answer as compact mode: reload the tracker tab once; the new
  version-watch button covers this from now on.
  **How to check:** after the reload, cards with long `file/paths/like/this` stay inside the
  border.
- [A] Tracker: Backlog column added on the far left, and Done is collapsed by default. Backlog is !p2
  a real marker, `[.]`, documented in the legend; drag any card there and its todo line updates.
  Done renders as a header stub with its count and a show/hide toggle, so a long Done list stops
  eating vertical space. Server, parser and endpoint test all know the new marker.
  **How to check:** drag a card to Backlog, watch its line in `todo.md` become `- [.]`. Click
  show on Done; the cards appear; hide collapses them again.
- [A] VNC research done, written to !p3
  [`research/vnc_and_iframe_embedding_2026-07-30.md`](./research/vnc_and_iframe_embedding_2026-07-30.md).
  Short version: browsers need RFB over WebSocket, so the bridge-free path is a VNC server that
  speaks WebSockets natively; KasmVNC is the cleanest (web-native, serves its own client) and
  works inside a live-embed link node today with zero runtime changes. Proper v2 is vendoring
  noVNC's client behind a `vnc` node type when a real workflow exists.
  **How to check:** read the note; if you have any machine handy, run KasmVNC on it and paste its
  URL into a live embed node.
- [A] Iframe-refusing sites, answered in the same note: ship fallback preview cards now (no !p3
  policy problems, works static), an optional header-relaxing extension for your own browser,
  never a rewriting proxy, and the real long-term answer is a desktop shell (Tauri/Electron
  webviews ignore X-Frame-Options), which is exactly Stage 3 of `COSMOBOARD_MIGRATION.md`. No
  full browser needed for this; that stays Stage 5.
  **How to check:** read the recommendation section; the fallback-card work can be a future card.
- [A] Performance analysis and action plan written to !p3
  [`whiteboard/performance_analysis_2026-07-30.md`](./whiteboard/performance_analysis_2026-07-30.md),
  grounded in this week's measurements. Ranked: lazy embeds first (they dominate load and were
  the fake "zoom jank"), selection-as-state, incremental saves (shared design with the sync
  plan), staged mount, then a perf budget test in CI. First two are afternoon-sized.
  **How to check:** read the plan; it is also linked on the development board.
- [A] Machine-readability is defined, benchmarked, and scored. Definition in !p3
  [`research/machine_readability_benchmark.md`](./research/machine_readability_benchmark.md):
  parseable, identifiable, addressable, textual, indexed. Runnable scorer at
  `tests/benchmarks/machine-readability.mjs`, current score 42/47 (89%), and it found real gaps:
  13 legacy markdown nodes without `markdownId`, two empty text nodes, two untitled links.
  Linked on the development board, which now exists at `/content/boards/dev.html`: tracker,
  sandbox, benchmarks, analyses and the migration plan in one place, noindex like the sandbox.
  **How to check:** `node tests/benchmarks/machine-readability.mjs`, and open the dev board.
- [x] Stage-gate suite: `tests/board/test-board-basics.test.mjs`, nine fast cases on the sandbox
  board covering the basics in one pass: load renders all nodes, default viewport applies, wheel
  zoom, drag plus undo restoring the exact position, corner resize plus undo, double-click text
  editing, markdown rendering, developer-mode overlay up and torn down, and zero page errors from
  our own code. Real mouse and keyboard events, autosave disabled before page scripts run, sandbox
  files backed up and restored, so a run leaves the tree clean. This is the "tests confirm basic
  functionality at each stage" gate: run it after any board change.
  **How to check:** `node tests/board/test-board-basics.test.mjs`, then `git status` stays clean.
- [A] Direction: prepared to the approval point. A dated **Proposed roadmap update** now sits at !p2
  the end of holistic_planning.md: north star, five gated stages mapped from
  COSMOBOARD_MIGRATION.md and your goal statements, a drafted replacement objective line for
  agents.md, and the runtime recommendation folded in. Nothing is adopted until you approve or
  edit it; the shipped objective stands meanwhile.
  **How to check:** read the section at the bottom of holistic_planning.md; works to adopt as
  written, issue with a note to redirect.
- [x] Test board is live at `/content/boards/test-board.html`: a sandbox for checking basic
  functionality without touching real boards. Five nodes, one of each basic kind: title, an
  instructions list of things to try, an editable text node, a link node, and a real markdown
  sidecar (`content/boards/test-board/notes.md`) with the caret check line baked in. Generated
  through the registry and build like every other board, but `noindex,nofollow` and excluded from
  the sitemap, so it never shows up in search or site listings even when deployed. Saves and
  autosaves write only into `content/boards/test-board/`, which is the point: break it freely.
  **How to check:** open the page, run through the instructions node. `git checkout -- content/boards/test-board/` resets the sandbox.
- [x] Board runtime: node drag and resize no longer add ten window listeners per node. A 145-node
  board carried about 1450 permanent window listeners; every mouse move ran all of them, every
  touch frame waited on 290 non-passive touchmove callbacks, and a deleted node stayed pinned in
  memory by its listeners forever. One interaction relay per board now serves all nodes, since
  only one drag or resize is ever active. Measured on the braindump board: idle pointer-move
  dispatch fell from 71.2 to 2.1 microseconds per event. Handler bodies are unchanged, so the
  behavior is identical. Also measured while in there: steady-state wheel zoom at 145 nodes was
  already 60 FPS, so no speculative CSS containment was shipped; the hitches earlier in profiling
  turned out to be embed warmup.
  **How to check:** open `/braindump.html`, drag a node, resize one by its corner handle, and on
  a phone try the hold-to-drag and pinch. Everything should feel the same or smoother. The suites
  covering these paths all pass: esc-deselect 5/5, markdown-drag-and-title, shift-snap 12/12,
  resize-handle-clipping, save-reload, markdown-authoring e2e.
- [x] Tracker: priority 1 to 5 on every card, colored, click the active label again to clear it,
  stored in the todo line as `!p<n>` and sorted within each column. Verified from the board.
- [x] Cosmoboard: developer mode toggle in the board settings panel, with a live overlay showing !p1
  FPS (green, amber, red by rate), camera position and zoom, pointer position in canvas
  coordinates, node and edge counts, the active tool, and the selected node's id, type, position
  and size. Costs nothing while off: the frame loop and pointer listener are torn down, not muted.
  **How to check:** open `/cosmoboard.html`, gear icon, tick Developer mode. The readout appears
  bottom left and FPS should sit near 60. Click a node and the selected row fills in. Untick and
  it vanishes. The setting persists per board in localStorage.
- [x] Tracker: card text is editable in place. The pencil on a card turns the title into an input;
  Enter or clicking away saves, Escape cancels. The rewrite keeps the status marker, the @owner
  tag and the priority token, and refuses empty text. Feedback drafts also survive reloads now,
  and the board never re-renders while you are typing in a card, so drafts stop getting eaten.
  Built from your board note on the priority card.
  **How to check:** click the pencil on any card, change a word, press Enter. Card and
  `.agents/todo.md` should both show the new text, with the priority chips intact.
- [x] Cosmoboard stays in this repo, and the `cosmoboard/` directory boundary is on hold too.
  Reasoning kept in [`cosmoboard_extraction_plan.md`](./cosmoboard_extraction_plan.md).
- [x] Caret offset mapping for lines with inline markdown, now verified in a browser and wrong in
  four separate ways. `buildVisibleToRawMap` was a second, hand-written markdown parser that
  disagreed with the renderer it was supposed to mirror, so it now replays the renderer's own rules
  in the renderer's own order and carries a raw offset per surviving character. What was broken:
  - `_em_` was stripped by the map but the renderer has no underscore rule, so every caret after an
    underscore landed short. This hit ordinary prose and any `snake_case` word.
  - Nested markers were not recursed into, so ``**bold with `code` in**`` drifted by two.
  - `visibleToRawOffset(raw, 0)` returned the block prefix length, putting the caret before the
    opening `**` on any line that starts with a marker.
  - An empty list item (`    - `) renders as plain text, because the renderer's bullet rule needs
    content after the marker, but the map stripped the prefix anyway. That shape is real content on
    the braindump board.
  Proof: `tests/board/markdown-caret-offset-mapping.test.mjs`, a new e2e that clicks real rendered
  characters and reads back where the caret landed. 13 of 66 probes failed before, 72/72 pass now.
  **How to check:** open `/braindump.html`, click into a note, type a line with `**bold**`, an
  `_underscore_` word and a `snake_case` word. Click away so it renders, then click in the middle of
  a word after the underscore. The caret should land exactly where you clicked, not a character or
  two early.

- [x] Review happens on the board now, instead of in chat. Every card carries a **works** button, an
  **issue** button and a feedback field, and cards drag between columns. A verdict is also a move:
  works sends the card to Done, issue sends it back to To do. Text on its own records a comment and
  leaves the card alone. Everything appends to [`review-feedback.json`](./review-feedback.json),
  which `agents.md` now tells agents to read at session start, so what you say here reaches the next
  session. One endpoint behind both gestures, `POST /api/todo-update`, which refuses a write if the
  card text at that line no longer matches, so a stale tab cannot stamp the wrong card.
  **How to check:** on this board, type into a card's feedback field and press **send**; the card
  should keep its place and show a "you said" quote. Press **works** on something in Review; it
  should jump to Done with a green badge. Drag a card between two columns and confirm it stays there
  after the next poll. Then check `.agents/todo.md` matches what the board shows.

- [A] `cosmoboard-landing.html` re-synced, which the CSS fix forced and which was overdue anyway.
  The page is hand-maintained but carries generated values, so it drifts silently. It was serving
  `braindump.css?v=0df001bbb596` while every built page had moved on, meaning the best page to send
  someone would not have picked up the panel fix at all. Its `data-board-source-version` was also
  stale, `0f3a9bbd08bd` against the generated `b0b6af1061a5`, left behind by commit `ac8e69e` when
  the onboarding canvas last changed. Both updated by hand; nothing else in the file was touched,
  since `data-board-index="[]"` and the absent recommendation attributes are deliberate for a
  preview-mode embed. This is the third time this chore has come up. Generating the page would end
  it.

### Decided 2026-07-29, not yet built

Answered on the board. Held until the direction review says they are worth doing.

- [A] `_underscore_` renders as emphasis now, at word boundaries only, exactly as decided: !p5
  lookbehind and lookahead keep the boundary characters out of the match, so `snake_case` and
  `file_name_here` stay literal, `__double__` stays literal, and the identical regex landed in
  both `renderMarkdownLineToHtml` and `buildVisibleToRawMap`, dodging the documented caret trap.
  All 72 caret probes pass.
  **How to check:** type `an _emphasised_ word beside snake_case` in any note, click away; the
  word italicises, the identifier does not, and clicking mid-word after it lands the caret
  exactly where clicked.
- [x] Shared entity is fully built now, not half. The runtime never had an entity renderer, so !p1
  adding the node alone would have shown nothing: `renderEntityNode` is new in `braindump.js`,
  a card that fills itself from `content/entities/index.json` (badge, title, summary, and links to
  every surface the entity appears on). The projects base also names the entity under a backed
  row's title, which makes the linkage visible wherever the base is embedded. The
  `cosmo-entity-eurocrate` node is on the cosmoboard canvas, and both parked tests are renamed
  back and green: `shared-entity-build.test.mjs` and `shared-entity-runtime-e2e.test.mjs`.
  Nothing in the repo is parked anymore.
  **How to check:** reload `/cosmoboard.html` (important: a tab opened before this change will
  overwrite the new node on its next autosave), find the entity card right of the projects base.
  Its links should open the project page and both boards.
- [x] Orphan markdown node `hgr0v5cjqam` is gone. Your own live session's save had already !p1
  dropped it from the canvas; verified zero references to the node or its deleted file remain,
  and no stray sidecar exists on disk.
- [x] Preview port 4174 is permanent, and every live doc says so. `aide-board/serve.mjs` owns !p1
  4173. Most of it was already true: `scripts/preview-server.mjs` defaults to 4174, so
  `package.json` needs no port at all, and `tests/README.md`, root `AGENTS.md` and
  `.agents/agents.md` never said otherwise. The stale ones were `README.md`, `scripts/README.md`,
  `scripts/AGENTS.md`, the whiteboard skill's `desktop-testing.md`, and the Chrome cache note in
  this file. Left alone on purpose: archives, handoffs, previous test logs, the security audit,
  and board content that records a 4173 URL as history rather than instruction.

### Objective status, checked live 2026-07-29

Four of the five criteria are met on `evrenucar.com`. The fifth is yours.

| # | Criterion | State |
| --- | --- | --- |
| 1 | `onboarding.html` reachable | met, 200 |
| 2 | live boards serve real nodes | met, 51 nodes |
| 3 | a stranger can say what it is | met, intro panel plus the landing page |
| 4 | download / upload / commit route works from the live site | met, walked end to end |
| 5 | one real person has done it | **not yet, this is the part only you can do** |

Criterion 4 was walked on the live site without submitting anything: the recommend panel opens, the
summary posts, the modal reports the downloaded `onboarding_<stamp>.canvas.diff`, and the flow
builds a prefilled GitHub issue URL carrying the board slug, repo path and source version. The only
wart is a `405` console error from `POST /api/save-board`, which is the known static-host limit. It
degrades without losing anything and is not visible to a visitor.

### Shipped 2026-07-29

Merged to `main` and live. First deploy since 2026-06-22.

- [x] The onboarding board opens with an intro panel: what Cosmoboard is in two sentences, how to
  interact with a node, and that nothing leaves the visitor's browser. It links to
  `cosmoboard-landing.html`, the written explanation, and to the full working board. The panel slot
  and its CSS already existed in the generator and had never been used by any page.
- [x] `cosmoboard-landing.html` is promoted to the public Cosmoboard page. Decided yes on all
  three: it is `index,follow` now, listed in the sitemap (new extras list in the generator for
  hand-maintained public pages), and the site nav's **Cosmoboard** entry opens it instead of
  `onboarding.html`. The page also gained its own nav row in its own visual language, linking
  home, Projects, the onboarding tour, and the working board. Onboarding stays live and is the
  first link the landing offers.
  **How to check:** any page's nav, Cosmoboard, lands on the landing page; its top row links back
  out; `sitemap.xml` lists it; `robots` meta reads index,follow.

- [A] Landing page positioning settled: index both, lead with the landing page. You answered !p2
  C on 2026-08-01. Most of it was already true on this branch and the question was written
  against the older state on `main`: both `cosmoboard-landing.html` and `onboarding.html` are
  `index,follow`, both are in the sitemap, and the nav's **Cosmoboard** entry already opens the
  landing page. So "index both" needed nothing.
  What "lead with" needed was the sitemap, and one detail is worth knowing: **a sitemap has no
  inherent order**, so putting a URL first is presentation only. `<priority>` is the part a
  crawler actually reads. The landing page is now first in the file *and* carries
  `<priority>1.0</priority>`; every other page is left without a priority, which means the 0.5
  default. That declares one page above the rest rather than ranking the whole site, which would
  say nothing.
  Onboarding keeps its indexing and its place, and stays the first link the landing page offers,
  so the tour is still one click from the explanation.
  **How to check:** `head -12 sitemap.xml` shows `cosmoboard-landing.html` first with priority
  1.0. Both pages still read `index,follow`.

- [x] `onboarding.html` is live at `evrenucar.com/onboarding.html`, having 404'd since it was
  written. The nav's **Cosmoboard** entry opens it, and **Braindump** is unlisted: it stays built
  and reachable at its URL, but a first-time visitor no longer lands in the scratch pad.
- [x] The live runtime moved from `?v=58` to the current content hash, so the public site finally
  has the select-all fix, the preview-embed write guard, and the non-destructive build.
- [x] `npm run sync:notion` is diagnosed and unblocked. Root cause found by probing the API: !p4
  Notion answers role "none" for the Project Box page, meaning **its public share was turned
  off**; nothing changed on our side. Only you can re-share it (Notion, Share, publish to web).
  Hardened regardless: one unreadable page no longer kills the sync; it reuses the cached copy
  with a loud warning (or skips if uncached) and the rest refresh. Verified locally: sync now
  completes, "Reused 4, refreshed 3", so CI's build step will run again and content flows for
  the first time since June.
  **How to check:** `npm run sync:notion` finishes with the warning naming the page. Re-share
  the Project Box page in Notion and the warning disappears on the next run.
- [x] The Maker Faire exhibitor PDFs are deleted, both copies under `content/boards/braindump/`, !p1
  on your "LETS DELETE it" note from the board. The braindump canvas node that linked one of them
  is removed too, and no reference remains anywhere in the repo. They are still in git history;
  scrubbing history is a separate decision if you want it.
- [x] `.playwright-mcp/` is untracked and gitignored now. All 31 test-dump files are removed from
  the index (they stay on disk for local tooling), so the next merge takes them off the public
  site. Like the Maker PDFs, they remain in git history unless you decide to scrub it.
  **How to check:** `git ls-files .playwright-mcp` returns nothing; `.gitignore` covers the
  directory; the staged deletions are part of this working tree.

- [A] **All four public PDFs are down, boards and repo.** You answered A on 2026-08-01. !p1
  The two Maker Faire exhibitor lists under `content/boards/braindump/` were already gone. The
  two on the cosmoboard are now too: `participant-information.pdf` (116 KB) and
  `funda-hoca-sunum-26-4-28.pdf` (8.3 MB). Both files are deleted and both nodes are off the
  canvas (`nfw8czu22uq` and `fjam96so57`); no edge referenced either, 54 nodes down to 52. The
  canvas `updatedAt` is bumped, so a board tab left open from before this is refused by the
  stale-tab guard instead of putting them back. Nothing under `content/` or in any built page
  refers to them any more, and the site is rebuilt.
  **One dependency had to be adjusted, and it is an improvement.** `scripts/performance-audit.mjs`
  used the participant PDF as its upload fixture, and a build test asserted that filename. The
  audit never needed that document, only a PDF big enough for the upload path to be worth
  measuring, so it generates one now at the same size (~118 KB, valid PDF 1.4, verified). The
  audit no longer depends on board content that can be edited or deleted underneath it, which is
  what made this break in the first place.
  **What this does not do:** the files remain in git history. Scrubbing history is a separate,
  destructive decision and is yours to make. Until then anyone with the repo can recover them,
  though nothing on the live site links to them.
  Left in place deliberately: `content/boards/dev/bayblend-fr3010-pc-abs.pdf`, a manufacturer
  materials datasheet on the noindex dev board. It was not one of the four and holds no personal
  data, but say the word and it goes too.
  **How to check:** `find content -name "*.pdf"` returns only the datasheet. Reload
  `/cosmoboard.html`; the two PDF nodes are gone.

- [x] Two more PDFs were public on the cosmoboard. Superseded by the card above, answered A. !p1
  Raised on `main` while this branch was being worked, and still open after the merge, so it is
  carried over verbatim rather than lost. The Maker Faire exhibitor lists were deleted, but these
  are different documents, not copies: `content/boards/cosmoboard/participant-information.pdf`
  (118 KB, different hash from the maker list's 229 KB) and the 8.7 MB
  `funda-hoca-sunum-26-4-28.pdf`. Both sit on the cosmoboard, which is the board a stranger is
  most likely to open, and both are served publicly. Neither was opened or moved; this is only a
  report that they are reachable. Given the maker list named 119 people with their assignments,
  a file called "participant information" is worth the same look.
  Note these are the two PDFs the embed pointer fix was tested against, so they are easy to find:
  open `/cosmoboard.html` and pan down-left.

## Bugs

- [x] Zooming works over a markdown note again. You were right, and it was a regression. !p1
  The rule was already correct on paper: a note decides for itself whether a wheel scrolls its
  text or zooms the board, and an **unselected** note is supposed to zoom. What broke it was
  the settings-panel scroll fix from the last session, which routes a wheel to "the first
  element on the way up that can actually scroll". That walk asked whether it had reached a
  board node *inside* the loop, so it only ever excluded nodes with nothing scrollable in them.
  A note long enough to overflow matched on its own body first and never reached the node at
  all, so the board silently stopped zooming over exactly the notes worth reading. The node
  check now happens before the walk instead of during it.
  **Why no test caught it:** `markdown-wheel-routing` asserts that a synthetic wheel *reaches
  the viewport*, which it still did. Nothing asserted the camera actually moved. Measured on
  the sandbox before and after: camera unchanged before, changed after, same gesture.
  Covered now by `tests/board/markdown-wheel-zoom.test.mjs`, 3 cases against the real camera
  with real wheel events: an unselected note zooms in, zooms out, and a selected note still
  keeps the wheel and scrolls its own text. It asserts up front that the note actually
  overflows, since with nothing to scroll the broken branch is never taken and the suite would
  pass while proving nothing.
  The settings panel still scrolls (overlay-wheel-scroll 3/3), markdown routing 6/6 plus
  fullscreen, stage gate 9/9.
  **How to check:** hover any long note without clicking it and wheel. The board zooms. Click
  into the note and wheel: the note scrolls instead, which is the deliberate half of the rule.

- [.] Where a board opens is decided by whoever last panned it. **Decided 2026-07-31: leave it
  alone.** No `defaultViewport` is being added to cosmoboard or braindump; those boards keep
  opening wherever the last session stood, and `cosmoboard-initial-layout` keeps passing or
  failing on where the camera happens to be. Parked rather than deleted so the mechanism below
  is on record, and so nobody re-raises it as a bug. The findings still hold if it ever thaws.
  Re-checked 2026-07-31 and the card that preceded this one was wrong in two ways, so here is
  what is actually true. `tests/board/cosmoboard-initial-layout.test.mjs` **passes right now**,
  and the camera it was said to fail on (`x -3118, y -1587, z 1.15`) is not in the file; the
  working copy sits at `x 436, y -15, z 0.23`. It passes by luck of where the camera happens to
  have been left, not because anything was fixed.
  The mechanism underneath is real and worth closing. Merely panning a board marks it dirty, so
  the next autosave writes the live camera into `viewport` in `current.canvas`, and nothing
  downstream strips it. A fresh visitor with no localStorage gets that camera. `defaultViewport`
  is the guard, and it works because it is inert: no editing session can move it, only `viewport`
  drifts. The test board, dev, onboarding and eurocrate all have one. **Cosmoboard and braindump
  do not**, so those two open wherever the last session was standing. Braindump's has drifted to
  `x -1304, y -5982`, which is the same fault with no test watching it.
  This matters to the objective directly: a stranger opening a board should land on the board,
  not on wherever it was left.
  **The decision:** what should cosmoboard and braindump open on? Adding `defaultViewport` is a
  two-field edit per canvas and reversible. I did not pick values because that is a judgement
  about what a first-time visitor should see, not a bug fix. The committed cosmoboard camera
  (`x 438, y -714, z 0.78`) predates 29 new nodes, so it may no longer frame the right thing.

- [A] Alt-drag copy is one undo now, however many strokes the drawing has.
  You had this exactly right. Every stroke of a drawing is its own node: `stopDrawing` calls
  `createNode` once per pointer-up, so a three-stroke sketch is three nodes. The drag's end
  handler pushed one move action, and then `finalizeAltCopy` pushed a separate create action per
  clone, so one gesture left four entries on the undo stack. Undo took them newest first, which is
  why the copy lost a line per press and only the last press moved the drawing home.
  The gesture is now one entry: the clone creates and the drag's move fold into a single `batch`
  action, a type the history already understood and simply was not using here. Undo reverses the
  move and removes every clone in one press; redo puts the whole thing back in one.
  Covered by `tests/board/alt-drag-copy-undo.test.mjs`, five cases: the copy lands where the
  originals were, one undo restores everything including the serialized model, one redo restores
  the copy, a plain drag with no Alt still undoes in one, and Alt released before the mouse leaves
  no copy behind. Checked the test can fail: without the fix it stops at "one undo must remove all
  three clones, not one".
  **How to check:** draw something with several strokes, select it, alt-drag it, press Ctrl+Z
  once. The copy goes and the drawing is back where it started, in that one press.

- [A] Settings scrolls instead of zooming the board. The toolbar and its panels live inside the
  viewport, and the viewport's wheel handler called preventDefault on every wheel that reached it,
  so the panel could never scroll even though it is taller than its own max-height and had
  `overflow: auto` all along. The rule now: walking up from whatever the wheel landed on, the
  first element that can actually scroll gets the wheel. That fixes the settings panel and every
  other overlay at once, present and future, rather than naming panels one at a time.
  Board nodes are deliberately excluded from the rule, so a note still decides for itself whether
  a wheel scrolls its text or zooms the canvas. markdown-wheel-routing is green, 6 cases plus
  fullscreen, and so is the stage gate.
  Covered by `tests/board/overlay-wheel-scroll.test.mjs`: the panel scrolls, the camera does not
  move while it does, and the empty canvas still zooms.
  **How to check:** open the gear panel on any board and scroll inside it. It scrolls, the board
  stays put. Scroll just outside it and the board zooms as before.

- [A] Previews resize both ways, and stop painting outside their box. Two separate faults under
  one report.
  **"Only resizes up and down":** `.bd-auto-size-content` clamped preview cards to a 250 to 400px
  band. A sideways drag changed the stored width and never the drawn box, so the first 150px of
  every outward drag did nothing and a wide live embed snapped back to 400 when toggled to
  preview. The clamp is gone; the node model is the size authority now, and the drawn box equals
  the stored width at every size measured.
  **The overflow:** `.bd-link-shell` kept its intrinsic content height however short the node was
  dragged, so a card painted straight through the bottom edge, by 279px at the size floor. The
  shell now fills the node and clips, and the hero image shrinks first so a short card keeps its
  title and URL instead of pushing the text out.
  Covered by `tests/board/node-size-and-overflow.test.mjs`, which asserts two invariants across
  three node types at five sizes each: the drawn box equals the model, and no descendant paints
  outside the node once every clipping ancestor is accounted for. Plus the degrade order, the mode
  toggle keeping its width through a real resize drag, and the resize handle staying clickable at
  the floor so a node dragged tiny can be dragged back out. It fails without the fix at
  "drawn width 250.0 must equal the model width 50".
  **Caught by review before it shipped:** removing the clamp would have made app nodes worse, not
  better, since they carry the same class but their shell was never clipped. Measured at 2.6x the
  original spill. `.bd-app-shell` clips too now, and app nodes are in the test.
  **One thing to judge:** you wrote "resize the complete block so its large or smaller". This
  makes the block honour its size and keeps content inside, and the hero image does scale, but the
  text clips rather than scaling with the box. If you meant the whole card should scale like an
  image, say so and that is a different, larger change.
  **How to check:** drag a link preview narrow and wide; the box follows your drag both ways. Drag
  it very small; nothing spills past the border. Toggle a wide live embed back to preview; it
  keeps its width.

- [ ] Crashing on mobile if you zoom out and in too fast. **Still open, and here is what we !p2
  know.** I could not reproduce a crash. On Pixel 5 emulation: 60 sustained fast pinch cycles,
  heap flat at 3.7MB, DOM node count constant, zero page errors, and 80 rounds of randomised one
  to three finger fuzzing with a health check after each, all passed. So it is not a JS leak and
  the gesture state machine does not wedge.
  A real bug was found underneath it and is fixed separately, see the card below, but do not
  assume it was your crash: it is speed-independent, so it does not explain "too fast".
  **The leading hypothesis, untested:** the grid layer is a 240000 by 240000 SVG, and the board
  layer gets `will-change: transform` while a zoom gesture runs. On a phone GPU that is a
  compositor-memory risk that scales with zoom range and gesture speed, which matches "zoom out
  and in too fast" far better than anything else found. It was ruled out on desktop Chromium
  showing no separate layer, and desktop GPU memory is not phone GPU memory, so that null result
  does not carry.
  **Decided 2026-07-31: your phone on USB first, no blind fix.** The grid cap is confirmed safe
  and stays available, but it is not being shipped on a guess. This card is blocked on one
  session with you present, and here is the whole setup so it takes minutes:
  1. On the phone: Settings, About, tap Build number seven times, then Developer options, turn
     on USB debugging. Plug it into this machine and accept the "Allow USB debugging" prompt.
  2. On the phone, open Chrome and load the board from this machine's preview server (same
     wifi): `http://<this machine's LAN ip>:4174/braindump.html`.
  3. On the desktop, Chrome, `chrome://inspect#devices`. The phone's tab appears; press inspect.
  4. Reproduce the crash by pinching out and in fast. What we read while you do it: the layer
     tree and GPU memory (Rendering, Layer borders, plus the Layers panel), which is what
     decides whether the 240000px grid layer is the cause.
  Tell me when it is plugged in and I will drive the rest.
  **What would settle it otherwise:** capping the grid to the visible area blind and seeing if
  the crash stops.
  **Read the grid properly on 2026-07-31, and the blind fix is cheaper than it looked.** The grid
  is an inline SVG with a tiled dot pattern, fixed at 240000 by 240000 in two places that must
  agree: the `viewBox`/`rect` in the board markup (emitted twice by `scripts/build-site.mjs`) and
  the `width`/`height`/`top`/`left` in `CSS/braindump.css`. It is **purely decorative**: no
  JavaScript references it at all, nothing measures or hit-tests against it, and no coordinate
  math, camera clamp or node placement is derived from its size, so capping it cannot break
  behaviour. It is a plain child of the board layer, so it never re-tiles; the compositor just
  scales the whole thing, which is why its full backing store rides along in the layer that gets
  `will-change: transform` during a pinch. That promotion is already correctly gesture-scoped and
  debounced, so it bounds the duration but not the footprint.
  The catch: there is no existing visible-canvas-rect helper to reuse. Lazy embeds delegate to
  `IntersectionObserver`, which answers in/out and not a rect. A capped grid would build its own
  from `screenToCanvas` on the viewport corners, and must not resize per touchmove or it trades a
  memory problem for a frame-time one. Note also `tests/board/mobile-pinch-zoom.test.mjs` is
  untracked by git, and the heap/DOM measurements quoted above were never committed as a script,
  so none of that evidence is reproducible today.

- [A] Pinch zoom no longer dies when a finger lands on a note. Found while chasing the crash
  above, and real on its own. Node bodies call `stopPropagation` on touchstart so a tap inside
  them does not drag the board, and that swallow was unconditional. The touchstart that carries
  the second finger is the one the viewport needs in order to begin a pinch, so if that finger
  landed on a note, or on a note being edited, the gesture never started at all. On a phone you
  cannot see where your fingers are relative to the nodes, so it reads as the board randomly
  refusing to zoom. The rule now: one finger inside a node body still belongs to the node, a
  second finger always belongs to the board.
  Two more things fixed in the same pass: the viewport refused a two-finger start whose target was
  a resize handle, and a pinch baseline of exactly zero was read as "no pinch in progress", which
  killed the gesture for its whole duration and made the repair meant to catch it unreachable.
  Covered by `tests/board/mobile-pinch-zoom.test.mjs` on Pixel 5 emulation with real CDP touch,
  five cases. It fails without the fix at "a pinch with one finger on a note must still zoom, got
  scale 1.000".
  **Caught by review before it shipped:** the first patch set missed the text-node-being-edited
  case, which is the state a phone is most often in. It is covered now.
  **How to check:** on a phone, open a board, put one finger on a note and pinch with the other.
  It zooms. Tap into a note to edit it, then pinch; it still zooms. One finger dragged inside a
  note still does not move the board.

- [x] Wheel zoom ceiling raised from 3x to 5x so it matches touch pinch. At the ceiling the
  view stopped responding entirely, which read as broken zoom.

- [x] Select-all then delete no longer corrupts a markdown note. A selection spanning several lines
  fell through to contenteditable, which merged or dropped the line divs the editor depends on. The
  editor then found no active line, dropped to preview, and the next autosave wrote the damage to
  disk. Multi-line deletes are handled explicitly now, and a normalizer repairs the structure on any
  input as a backstop for paste, cut and drag-drop.
- [x] Text overflows in the feature request, bug report, and recommendation panels. Closed by the
  user on 2026-07-29, no longer an issue. Measured across phone, tablet and desktop widths first:
  at every touch width the panels go to a single 312px column and nothing escapes, so the reported
  symptom did not reproduce. One unrelated thing did show up and is filed separately below.
- [A] The recommendation panel no longer escapes the viewport at desktop widths near 1024px. It
  overflowed **both** edges, not just the right: the toolbar shell is centred with `left: 50%` plus
  `translateX(-50%)`, so once toolbar + open panel came to 1061px it hung 18.7px off each side at
  1024px. The mobile column layout only starts below 1000px, or at 1200px with a coarse pointer, so
  every mouse width from 1000px to ~1061px fell between the two rules.
  The shell now clamps to the window and wraps the panel onto its own row above the toolbar, the
  same shape the mobile layout already used. Two details were load-bearing:
  - `width: max-content` on the shell. `left: 50%` leaves only half the window as available space,
    so a wrapping shell shrinks to that and wraps at *every* width, including 1440px.
  - `max-width: min(100%, 560px)` on the panel. Under `max-content` the recommend panel's checkbox
    label stopped wrapping and the panel grew to 730px, which moved the wrap threshold to 1257px.
  Proof: `tests/features/toolbar-panel-viewport-fit-e2e.test.mjs`, 30 panel measurements across ten
  widths from 1440 down to 390, asserting an 8px gutter on all four edges, a usable panel width, and
  no horizontal document scroll. It failed at 1061px and 1024px before the fix. Wide widths are
  measurably unchanged: the panel sits at 692..1252 of 1440 before and after.
  **How to check:** open `/onboarding.html`, size the window to about 1024px wide with a mouse, and
  press the recommend button in the toolbar. The panel should sit centred above the toolbar with
  nothing cut off at either edge. Then widen to 1440px: it should go back to sitting beside the
  toolbar exactly as it does today.
  *Supersedes an earlier, vaguer fix for the same symptom that had been marked done on this
  branch. This is the one that is actually in the stylesheet, and it is the one with the test.*
- [A] Duplicate of the built underscore card: `_underscore_` renders as emphasis at word
  boundaries since 2026-07-30, snake_case stays literal, caret probes 72/72. See the card in the
  decided section above.
- [x] The cosmoboard canvas has an orphan markdown node. Node `hgr0v5cjqam` points at
  `content/boards/cosmoboard/note-2026-07-28-15-37-36.md`, which commits `1534be1` and `c189cf2`
  deleted on purpose as test litter. The node was left behind, so loading the board recreates the
  file as an empty sidecar and it reappears as untracked. Its `_rawMarkdown` is empty, so nothing
  was lost. Delete the node or commit a real file for it.
- [x] The 405 on GitHub Pages is gone at the source: the runtime no longer fires doomed requests
  at static hosts. The preview server marks every response with `X-Cosmoboard-Server`, and the
  board probes for it once with a silent HEAD of its own page (200 everywhere, so nothing is
  logged). No header means static host: autosave and sidecar saves switch off before the first
  attempt, manual save keeps the local copy and points at the Recommend flow in a toast, and the
  console stays clean. On the preview server everything works as before, verified in a browser
  both ways. What this card does not change: there is still no path to persist back to the repo
  from the live site beyond the Recommend flow; the OAuth backend in
  [`whiteboard/online_save_backend_plan.md`](./whiteboard/online_save_backend_plan.md) stays a
  separate decision.
  **How to check:** after the next deploy, open the live board with the console open and save;
  no 405 appears, and the toast points at Recommend. Locally everything saves as before.

## Test failures

- [A] "Section 'Test failures' is not in todo.md" when adding a card, and the preview server.
  Both mine, both fixed. The board finds a lane by matching a newline before its heading, and my
  bulk edits to this file had been going through a script that rewrites every line ending to
  Windows style, so nothing matched even though the heading was sitting right there. Converted
  back to plain newlines; all five lanes resolve and every card survived. The card you were
  trying to add is why this one exists, so the endpoint clearly works again.
  The preview server was up the whole time on 4174, but it had been started as a background job
  that later got killed, so it went down again mid-session. Running again now.
  **How to check:** add a card from the board to any lane. It lands at the top of that lane.

- [A] "Some websites refuse to be embedded. How do we get around this? Our own browser? An app?
  A Linux distribution?" Answered, and the first two rungs are already built.
  Short version: you do not need a browser, and you certainly do not need a distribution.
  A site refuses by sending `X-Frame-Options` or a CSP `frame-ancestors`, the visitor's browser
  enforces it, and no amount of page JavaScript can override that. So there are only four real
  options, in increasing cost:
  1. **Show a good fallback instead of a grey box.** Built. A known-refuser list plus a real
     header probe (`GET /api/frame-check`) means a refusing site shows a named card offering to
     open in a new tab, rather than failing silently.
  2. **A browser extension that strips the headers**, for your own machine only. Cheap, but it
     is per-machine and cannot ship to visitors.
  3. **A desktop shell (Tauri or Electron).** Its webviews ignore `X-Frame-Options` outright,
     so everything embeds. This is the real answer, and it is already Stage 3 of
     `COSMOBOARD_MIGRATION.md`, sitting in Backlog.
  4. A rewriting proxy: **no**. It breaks logins, violates most terms of service, and makes us
     responsible for other people's traffic.
  The note is [`research/vnc_and_iframe_embedding_2026-07-30.md`](./research/vnc_and_iframe_embedding_2026-07-30.md).
  Note your specific example, `https://www.youtube.com/`, is the home page rather than a video;
  individual videos embed fine through the player URL, which is what the board already does.
  **How to check:** paste a github or notion link and switch it to live. You get the named card,
  not a grey box. Then read the note if you want the reasoning behind ruling out the proxy.

Triaged 2026-07-28. Each was reproduced on unmodified `HEAD` first, so none is a regression from
the review fixes.

Current state, run one file at a time: `tests/build/` 4/4, `tests/preview/` 4/4,
`tests/features/` 3/3, `tests/board/` 33/33. `tests/export/` is 2/3 and was never in this count.

- [x] **`tests/export/export-bundling-e2e.test.mjs` passes for the first time in its history**,
  and diagnosing it surfaced a real runtime bug. The test was a fossil asserting two old
  contracts: blob-only markdown refs (the import now persists sidecars to disk when the endpoint
  is up) and replace-always semantics (a bundle now reconciles-and-replaces only on a matching
  canvasId, foreign bundles embed as sub-pages). Rewritten to the current contract, driving the
  real reconcile prompt. **The real bug found:** the import file picker routed every file through
  the content importer, which has no canvas branch, so importing a `.zip` or `.canvas` from the
  picker silently did nothing; drag-drop was the only path that worked. The picker now splits
  board files through `openCanvasFlow` exactly like a drop. Also hardened: the test blocks
  `/api/save-board` and restores the canvas, so its reconcile-apply can never overwrite the real
  cosmoboard file, and it cleans up its persisted sidecar. Export suite is 3/3.
  **How to check:** `node tests/export/export-bundling-e2e.test.mjs`, and try importing a `.zip`
  bundle through Ctrl+I on any board; it now actually imports.

- [x] **Shared entity model is complete** as of 2026-07-30; this card was the older duplicate of
  the one in Now. Runtime renderer, canvas node, base-row entity tag, and both tests renamed back
  and green: `shared-entity-build.test.mjs`, `shared-entity-runtime-e2e.test.mjs`. Details on the
  Now card.
- [A] **Markdown authoring e2e is un-parked and green**, back to
  `tests/features/markdown-authoring-e2e.test.mjs`. The blocker was the two-click entry: the first
  click selects the node, only the second puts the caret in the editor, so the old single click left
  focus on BODY and every keystroke was eaten as a board shortcut. The test now asserts focus
  actually reached the editor before it types, so that failure mode reports itself instead of
  surfacing later as an empty file. Escape blurs, which commits the line and fires the sidecar save.
  It also edits the note a second time, to prove the file round-trips rather than only capturing the
  first write. Three consecutive runs, clean tree after each.
  **How to check:** `node --test tests/features/markdown-authoring-e2e.test.mjs`. Then
  `git status` should show no stray `note-*.md` and no change to any `current.canvas`.
- [x] Fixed `tests/board/board-save-export-runtime.test.mjs`, and it was flagging three real gaps:
  the "Export .canvas" button had no listener at all, export size estimates silently counted zero
  whenever a server omitted content-length on HEAD, and `serializeState` handed out live node
  references because `stripTransientNodeFields` returns the original when it has nothing to strip.
- [x] Fixed `tests/board/board-url-paste-preview-e2e.test.mjs`. Pasting a link to one of this
  site's board pages now creates a live board-preview instead of a plain bookmark. The runtime never
  read `data-board-index`, which the build has been emitting all along, so the feature was specced
  and plumbed but never written.
- [A] Suites no longer flake in parallel. Cause was concurrent site builds racing each other and
  the tests reading generated pages. Every build-invoking test now takes a cross-process build
  lock (tests/helpers/build-lock.mjs, a mkdir mutex held for the test process lifetime, with a
  stale-lock breaker), so build-dependent tests serialize while everything else stays parallel.
  Proven: the whole build suite plus shared-entity ran concurrently, all green. Also fixed three
  fossil assertions the run exposed (board list, entity source slash, nav aria-current).
  **How to check:** run several build-suite files simultaneously; all pass.
- [x] Node title and filename agree on separator now. The flattening was in the preview server's
  copy of `sanitizeMarkdownFilename`, which stripped underscores that the client-side sanitizer
  keeps. The server now uses the same character set, with dot and dash trimming at the edges so
  dotfiles and traversal shapes stay impossible. `preview-markdown-endpoint` test passes.
  **How to check:** create a markdown note on `/braindump.html`; the file that appears beside the
  canvas carries the same `note-<date>_<time>` name the board shows.
- [x] `tests/features/youtube-live-embed.test.mjs` fixed, and it caught a real bug:
  `getYouTubeVideoId` did not recognise `youtube.com/live/<id>`.
- [x] `tests/preview/preview-markdown-endpoint.test.mjs` fixed. It asserted a `markdown/`
  subdirectory that `resolveMarkdownSavePath` has never used by default, since its first commit.
  Sidecars live beside the canvas. The `markdown/` folders in the repo are export-bundle output.
- [x] `tests/features/recommendation-flow-e2e.test.mjs` fixed. The issue body was missing the board
  source version and the review framing.
- [x] `tests/board/cosmoboard-initial-layout.test.mjs` now passes. Previously listed as failing.

## Dead code

- [x] The markdown naming dialog is deleted, 98 lines of JS and 61 of CSS. Nothing called
  `ensureMarkdownPanel`, so its DOM never existed and the save and close handlers behind it were
  unreachable. The one-click timestamped note is untouched.

- [x] Shift plus arrow keys extend a selection across markdown lines now. The editor's ArrowUp and
  ArrowDown handlers step aside when Shift is held, so the browser extends the selection natively,
  and the existing multi-line Backspace/Delete path already knows how to collapse what that
  produces.
  **How to check:** click into a multi-line note, hold Shift, press Down twice, then Backspace.
  The selected lines collapse cleanly and the file saves without structural damage.
- [A] One-click entry into markdown notes is built, deciding the open product call in favor of
  fewer clicks. A stationary click on an unselected note selects it AND drops the caret exactly
  where you clicked; click-and-drag still moves the window (activation happens on a movement-free
  mouseup, threshold 3px), and editing-mode drag protection is unchanged.
  markdown-drag-and-title now pins the new contract, and the authoring e2e, caret 72/72,
  esc-deselect and the stage gate all pass.
  **How to check:** click once into any note on /braindump.html; the caret lands where you
  clicked. Click and drag from a note body; it still moves the node.

- [x] The eurocrate project board is built out, 15 nodes, from the project's own Notion content
  rather than filler. Four link nodes for the crate sizes with their emtrade sources, two markdown
  notes (`design-notes.md` for the frame, sliding surfaces and ballast, `open-questions.md` for the
  anti-tip interlock, sourcing and weight budget), the two reference images, a text block on second
  hand sourcing, a link to the project page, and a board-preview back to Cosmoboard. Both notes are
  registered in `src/registry.json`, so the registry now reports 3 notes.
  Verified in a browser: all 15 nodes render, both images load, no failed requests, no console
  errors. `defaultViewport` starts the board clear of the site nav, which otherwise covered the
  first column.
  **How to check:** open `/content/boards/eurocrate-storage.html`. It should land on the title with
  nothing hidden behind the nav. Judge whether the content is actually right for the project, that
  is the part I could not verify: I wrote the two notes from your Notion page, so correct anything
  that misreads your intent.

## Features and ideas

- [ ] When nothing is selected the arrow keys should serve to browser around the board . The longer you hold it the faster it should go but there should be a speed cap

- [ ] I don't like how the pinning just snaps to my face currently. It should be able to be moved around on the pinned area. by dragging from its edges and corners afterwards like a window on a operating system

- [A] Light mode, and a theme group in settings: background, dot colour, grid style, accent. !p2
  All four of the things you asked for. Grid style covers the scale elements you named: dots,
  tri-dots, grid lines, none, switched live by rewriting the grid pattern in place, so no
  rebuild is involved.
  **The accent is now one value instead of 107.** The cyan was hard-coded in 107 places across
  the stylesheet in three different notations, and every one is a custom property with the
  original literal as its fallback. That fallback is the trick that makes this safe: a board
  with no theme stored never sets the property, so every colour resolves to exactly what it was
  before. Verified by screenshot comparison, byte-identical, and a plain load still writes no
  theme key, so no existing board opts in by accident.
  **Light mode is a preset, not an inversion**, and it reseeds the three swatches rather than
  sitting beside them, so the panel always shows what is actually on screen. Contrast measured
  rather than eyeballed: body text is 15.73:1 on the light canvas, and the worst pair in either
  mode is 5.20:1, all clear of WCAG AA. The brand cyan is 1.66:1 on paper and would have failed
  outright, so light keeps the hue and drops the lightness to `#0d7a70`.
  **Two things interpreted, correct me if I read them wrong.** "Tri-dots" is your word and is
  defined nowhere, so it is a triangular lattice: every dot a vertex of an equilateral triangle.
  And picking a mode overwrites your custom colours, chosen over letting them stick because a
  stored cyan accent surviving into light mode is exactly the unreadable combination above.
  Deliberately left dark: the crop bar, which floats over a photograph, and the VNC node, which
  frames a live remote desktop. The site's left nav also stays dark, because its icons are
  white-only image assets that cannot be recoloured from the board stylesheet.
  Covered by `tests/board/theme-and-light-mode.test.mjs`, 7 cases, proved to fail without the
  patch. **How to check:** gear icon, Theme. Switch to Light, then try each grid style. Turn it
  back to Dark and confirm the board looks exactly as it always did.

- [A] The toolbar can auto-hide, and the board can be locked. Two cards, built together !p2
  because the lock icon has to survive the collapsed state.
  **Auto-hide** is a setting. On, the toolbar collapses to a small rounded tab after about a
  second; bring the pointer to it, tap it, or tab to it and the toolbar comes back. On a
  touchscreen the tab is 44x16px to look at but 76x48px to hit, so the deliberately small visual
  does not cost you accuracy. The collapsed toolbar is also removed from the tab order rather
  than merely hidden, so keyboard focus never lands on buttons nobody can see.
  **Lock** is a button that lives in its own dock beside the toolbar rather than inside it,
  which is why it stays visible when everything else collapses. Locked blocks what changes the
  board: dragging, resizing, deleting, creating, pasting, importing, drawing, and text and
  markdown editing. It deliberately leaves alone everything that does not: panning, zooming,
  **selecting**, copying, saving and exporting, and all embed interaction including fullscreen,
  since watching a video or scrolling a PDF is reading, not editing. Locking also drops any
  creation tool back to select and ends an edit in progress, so there is no gap where the
  toolbar claims one thing and the next click does another. It persists per board.
  It is an accident guard and not a security control, and the code says so: anyone with the page
  can press the same button again.
  Covered by `tests/board/toolbar-autohide-and-lock.test.mjs`, 10 cases, proved to fail without
  the patch, including a locked-board pass that checks a drag leaves the node's position
  untouched **while still selecting it**, and that panning still works.
  **How to check:** gear icon, Auto-hide toolbar. Move the mouse away and the toolbar folds to a
  tab; go back to it and it returns. Then press the lock: try to drag a node (it selects but
  does not move), delete it, or type in a note. Pan and zoom still work throughout.

- [A] The embed header shows the real address now, and a double-click copies it.
  Every video on a board used to read "www.youtube.com", because the header rendered the
  hostname alone and nothing else. It shows the video's own address now, on every live embed
  and not just YouTube, and double-clicking it selects the text and puts it on the clipboard
  with a "Link copied" toast. A local file has no address worth copying, so it keeps the old
  inert label.
  **One judgement call you should know about.** You asked for it to be selectable. Sweeping
  across it with the mouse would mean the address swallowing mousedown, and for a live embed
  the header is the only drag handle, because the shield below it takes the pointer over the
  iframe. Measured: that left a 7px grab gap on a 480px node, effectively stranding it. So
  dragging wins, and the double-click does the selecting for you (visibly, via a Range) as well
  as the copying, which is the gesture you actually asked for. Say the word if you would rather
  have the sweep and lose the drag.

- [A] Shift constrains a drag to horizontal, vertical or diagonal, and it is a live modifier.
  Press Shift before, during or after grabbing: the moving set locks onto the nearest of the
  eight compass directions through the drag's **origin**, not through wherever your pointer was
  when you pressed it, so a late press snaps onto a clean axis instead of inheriting the wobble
  you already walked. Release mid-drag and free movement resumes from where the pointer is.
  The lock has no tolerance window, deliberately. The pen tool's existing straight-line snap
  only engages when you are already close to an axis, which is right for sketching; you asked
  for movement restricted to those axes, so a drag lock holds at every angle.
  Built on the same live-modifier shape as alt-drag copy, and it composes with it: Shift+Alt
  gives a locked drag, one copy, and one undo press. Undo is untouched, still one entry per
  gesture. Touch is provably unaffected, since touch never carries a Shift key.
  Covered by `tests/board/shift-constrained-drag.test.mjs`, 9 cases including the one that
  matters most: an origin-anchored lock is asserted with numbers that come out visibly wrong if
  the anchor is taken at the Shift-down point instead. Proved it fails without the patch.
  The pen tool's own Shift snap is untouched: `board-shift-snap-runtime` still 12/12. Stage gate
  9/9, alt-drag copy undo 5/5, embed and YouTube suites green.
  **How to check:** drag a node, then press Shift mid-drag: it snaps onto a clean line through
  where the drag began. Let Shift go and it follows the mouse again. Try it diagonally, and try
  Shift+Alt for a constrained copy.

- [x] PDFs have a fullscreen button on the top right, and so does every other live embed. !p1
  It uses the browser's own fullscreen rather than a copy of the markdown overlay, on purpose:
  moving an iframe in the DOM tears down its browsing context and reloads it, so an overlay
  would have thrown away a PDF's page and scroll position and restarted a video. The shell
  stays exactly where it is and the browser lifts it to the top layer, so the canvas transform
  above it stops applying. Proved the iframe survives the trip.
  Entering fullscreen hands the content the pointer straight away, so the first click in there
  is not a throwaway, and leaving fullscreen gives the board its gestures back.
  **How to check:** open any PDF or embedded site, press the fullscreen arrows on the right of
  its header. Escape comes back. A PDF should return on the same page you left it on.

- [x] Embeds no longer eat the board's navigation, and it was never only PDFs. !p1
  Your report: cursor lands on a PDF and zoom and middle-drag pan stop working, because the
  embed scrolls instead. The fix already existed and was wired to exactly one thing. A
  transparent shield over YouTube kept wheel and pan working over a video and handed the
  pointer to the player on the first click; its logic was general but it sat behind an
  `isYouTube` check, so PDFs, embedded websites and app nodes got nothing. It now covers every
  live embed, which is your "same also for websites that are embedded" in one change rather
  than three.
  So an embed is inert until you click into it and fully interactive once you have. Passthrough
  is exactly right for a PDF: after the activating click the wheel scrolls its pages, and
  moving the cursor back to the canvas takes the board's gestures back with no dismissal.
  Two things found while building it. The shield used to start 32px down to clear the header,
  a guessed number that could not be shared with app nodes whose header is a different height;
  headers now stack above the shield instead, so no offset is guessed. And leaving fullscreen
  left the embed still holding the pointer, so the first wheel afterwards still scrolled it,
  which the new test caught.
  Covered by `tests/board/embed-pointer-and-fullscreen.test.mjs`, 8 cases, hermetic (the probe
  embed is a page this same server serves, so no internet and no PDF plugin needed). Proved it
  fails without the fix: re-gating the shield to YouTube stops it at "an embedded site must
  carry a shield, not just a video". Verified separately against a **real PDF node** on the
  cosmoboard in a headed browser: shield owns the pointer, one click hands it to the PDF, the
  cursor leaving re-arms it, wheel zooms the board, middle-drag pans, fullscreen fills the
  screen with the iframe intact. Stage gate 9/9, overlay-wheel-scroll, markdown-wheel-routing,
  node-size-and-overflow, youtube-live-embed and youtube-player-controls all green.
  **How to check:** open a board with a PDF or a website embed. Without clicking it, wheel over
  it: the board zooms. Middle-drag over it: the board pans. Click it once, then wheel: the PDF
  scrolls. Move the cursor off and wheel again: the board zooms.

- [x] Videos remember where you left off. !p3
  The playhead was tracked only on the live iframe, so it died on every re-render, reload and
  lazy unload. It is written to the node now and rides along in the board file, so it survives
  a reload and travels with the board. Where you stopped beats the `?t=` a link was pasted
  with: that timestamp is where the author said to start, this one is where you actually got
  to. Finishing a video clears it, so you are not dropped on the credits next time.
  Written on stop, not on every tick: the player reports several times a second and marking the
  board dirty each time would have queued a save for the whole length of a video. A tab closed
  mid-video never sees a pause, so the last known position is flushed on pagehide and on the
  page going hidden, which covers switching tabs on a phone.
  **Two real bugs found by the tests while building it**, both mine, both fixed: the pause path
  returned early whenever the value was unchanged and so never actually saved, and keying the
  save off `onStateChange` alone missed pauses, because the player reports them through
  `infoDelivery` just as readily. It keys off the play-to-stop transition now, whichever
  message carries it.
  **How to check:** play a video on a board, pause partway, reload the page. It comes back
  where you were. Verified end to end against the real player: played to 8s, the node
  remembered 8, and after a reload the embed asked for `start=8`.

- [A] Page lock: built. Folded into the combined toolbar card above, since the lock button and
  the auto-hide collapse had to be designed together for the icon to survive the collapsed
  state. The scope of what locking blocks, and what it deliberately leaves working, is listed
  there.

- [A] Toolbar auto-hide: built, with the larger touch target you asked for (44x16px to look at,
  76x48px to hit). Folded into the combined toolbar card above.

- [A] Pin an item to your viewport: it holds still on screen while the board moves under it. !p2
  **Two things I had to change, and you should overrule me if you disagree.**
  1. **Ctrl+Tab is impossible**, and this was measured rather than assumed: with a real
     OS keystroke into a focused Chrome window, a plain key reaches the page and Ctrl+Tab
     produces zero keydowns, because the browser eats it as a tab switch before the page sees
     it. Even where it leaks through, `preventDefault` cannot stop the tab switch. It is
     **Ctrl+click** now (Cmd+click on a Mac), which keeps the shape you asked for: hold a
     modifier, click the item, click it again to send it back.
  2. **Snapping to halves and quarters is not built.** The core is, and it is solid; the
     Windows-style snap is scoped as a follow-up card below rather than shipped half-working.
  Everything else is as you wrote it. The stored position and size are **never** touched: the
  pin box lives in a Map keyed by node id, not on the node, so no clone, export, undo entry or
  save can carry it. That makes the promise structural rather than a rule someone has to
  remember. The old place shows a 20 percent cyan rectangle with "pinned" centred. You can
  still select and edit a pinned item; drag and resize are off while pinned, because both
  would write the geometry a pin promises not to touch.
  **The part that matters technically:** the item is not re-parented out of the board layer.
  It stays exactly where it is in the DOM and gets the inverse of the camera, because moving an
  iframe in the DOM tears down its browsing context and reloads it. Proven: a live embed keeps
  the same element and the same JavaScript context across pin, pan, zoom and unpin. That is the
  same reason the fullscreen button uses the native API.
  Pinning is view state, so it is per-session and deliberately not written to the board file: a
  pin belongs to one person's screen, measured in that screen's pixels, and syncing it would
  dock the item on someone else's display for reasons they cannot see. It is also kept out of
  undo, so it never dirties a clean board.
  Covered by `tests/board/pin-to-viewport.test.mjs`, 12 cases, 36 assertions, proved to fail
  without the patch. Includes the embed-survival check and an assertion that the serialized
  board still carries the original geometry and no pin key.
  **How to check:** Ctrl+click any item. It sticks to the screen; pan and zoom and it stays put
  at a readable size while its old spot shows the cyan "pinned" marker. Ctrl+click it again and
  it goes home, same place, same size.

- [.] Pin follow-up: Windows-style snapping to edges, halves and quarters. !p3
  Deliberately not shipped with the pin core rather than shipped half-built. Scoped: make the
  pin box draggable (moving the box, never the model), zones measured against the viewport
  (within 12px of the left or right edge takes that half, the top edge maximises, a 48x48px
  corner takes that quarter, corner beating edge, bottom edge dead as on Windows), a preview
  overlay in 20 percent cyan before you release, and last-drop-wins when two pins claim one
  zone. The core is already shaped for it: the pin box carries its own width and height and
  `renderNode` already refuses to overwrite them.
  Note a live embed can only be grabbed by its header, since the shield owns the iframe.

- [A] YouTube: the timeline is scrubbable and arrow keys seek properly. Two separate causes.
  **The timeline:** the transparent shield that keeps canvas zoom and pan working over a video sat
  in front of the player permanently and turned every click into play/pause. The player never saw
  a mouse at all, so it never even drew its control bar, which is why there was no timeline to
  click. The first click now starts playback and hands the pointer to the player; the shield takes
  over again the moment the cursor returns to the canvas, so wheel-zoom and middle-drag pan over a
  video are unchanged. Measured: a click 60 percent along the bar jumped a 253s video from 5.4s to
  153.2s.
  **The arrow keys:** seeking is relative to the playhead, which the board learns from the IFrame
  Player API. The subscribe handshake was sent once when the iframe fired load, which is before the
  player is ready, so it was dropped and nothing ever answered: currentTime stayed 0 and every
  arrow key seeked from the start of the video. The handshake now repeats until the player answers
  (and `widgetid` makes it announce itself), so the board holds a real playhead and duration.
  Note there are two keyboards now, both correct: click into a video and YouTube's own shortcuts
  apply (its arrows jump 10s, j/l/f/m work); select the node without clicking in and the board
  forwards Space and the arrows at 5s.
  Covered by `tests/features/youtube-player-controls.test.mjs`, which proves pointer delivery the
  hard way: a second click pauses the video with no command sent from our side.
  **How to check:** open a board with a YouTube embed, click it once to play, then move the mouse
  down over the player. The control bar appears; click anywhere on the timeline and it seeks.
  Move the cursor off the video and wheel-zoom still works over it.

- [A] Firefox's menu bar no longer opens when you press Alt on a board. A bare Alt press is
  claimed by the board now, in both directions, since Firefox arms the menu bar on the press and
  opens it on the release. Alt keeps working as the drag-copy modifier, and the cases that are not
  ours are left alone: Alt+letter still reaches the browser's access keys, Alt inside a text field
  belongs to the field, and AltGr is guarded by both of its shapes (`key` of `AltGraph`, and the
  Ctrl+Alt that Windows reports), so a Turkish or German layout keeps its @ and friends. F10 still
  opens the menu bar if you want it.
  Covered by `tests/board/alt-key-menu-suppression.test.mjs`, five cases including a real alt-drag
  to prove the modifier still works.
  **How to check:** in Firefox, open any board and tap Alt a few times. The menu bar stays shut.
  Then drag a node and tap Alt mid-drag: the copy still appears.

- [A] Cards an agent actively holds sort to the top of their column now, before priority order,
  so claimed work is always visible first. From your board note.
  **How to check:** claim any card with an @name; it jumps above unclaimed cards in its column.
  Original note: the ones claude is working on actively should be brought to the top

- [x] Done is a separate full-width bar below the four working columns now, collapsed to its
  header by default, exactly as you suggested; the live columns take all the horizontal space.
  Verified in a browser: four wide columns, Done spanning beneath.
  **How to check:** reload the tracker; Done sits under the board as a bar, show/hide toggles it.
  Original note: done column as a separate bar below the other 4 columns

- [x] 240hz and zoom spikes, answered in three parts. **Tracking:** the developer overlay has a !p1
  new `frame` row: worst frame in the last quarter second plus a running spike counter, so a zoom
  hitch shows as `48ms worst, 3 spikes` even when averaged FPS looks fine. **Zoom spikes:** the
  board layer now carries `will-change: transform`, which keeps it on its own compositor layer;
  zooming re-rasters asynchronously (a brief blur that sharpens) instead of stalling frames, which
  is exactly what read as 10-15 FPS dips. Try the same zoom and watch the spike counter.
  **The 60 cap:** nothing in Cosmoboard caps frame rate; the loop is plain requestAnimationFrame,
  which the browser ties to the display. If the overlay says 60 on a 240hz panel, the cap is
  outside the page: check Windows Settings > Display > Advanced (each monitor has its own rate,
  240 must be selected, not just supported), and note Chrome often follows the primary monitor's
  rate in mixed-refresh multi-monitor setups; battery saver and `chrome://gpu` vsync issues do it
  too. With the overlay open you can verify in seconds: an empty area of the board on a correctly
  set 240hz screen should read fps around 240.
  **How to check:** gear icon, Developer mode, zoom hard on `/braindump.html`. FPS should match
  your panel, and the spike counter should barely move compared to before.

- [x] Timestamps on tracker cards: small text under a card shows created and last-updated times !p2
  and who made the last change. Stamped by the server for everything flowing through the board
  (add, drag, verdicts, priorities, text edits record "by you"), stored in
  `.tracker/card-meta.json` keyed by title so it survives the file shifting. Cards touched only
  by direct file edits show nothing until their first board interaction; the endpoint test now
  restores the meta file so runs stay clean.
  **How to check:** click any chip or send feedback on a card; within a poll the card grows a
  line like "updated Jul 30 05:30 by you". New cards from the add bar carry created too.

- [x] Inline image pasting inside markdown files works. Paste a screenshot into a note: it !p1
  uploads through `/api/save-asset`, lands beside the canvas as `pasted-<timestamp>.png`, and a
  `![name](url)` line appears under the caret, rendered as the actual image. The renderer, the
  line class, and the caret map share one predicate for what counts as an image line, so the
  caret lockstep trap documented on the underscore card cannot bite; all 72 caret probes still
  pass. Unsafe URL schemes render as literal text. On a static host the paste is refused with an
  explanatory toast instead of console noise. Verified live on the test board, whose instructions
  node now mentions it.
  **How to check:** open the test board, click into the markdown note, paste any screenshot. The
  image renders inline and the file appears in `content/boards/test-board/`.
- [A] `cosmoboard-landing.html` is generated by the build now. Its hand-crafted design moved to !p3
  `src/templates/cosmoboard-landing.template.html` unchanged; the build injects the two runtime
  asset hashes and the onboarding canvas source version, which used to be re-copied by hand after
  every rebuild and drifted whenever the copy was forgotten. Verified: the output's `?v=` values
  and `data-board-source-version` are byte-identical to `onboarding.html`'s after a build. The
  page keeps its own standalone design rather than the site shell, which is a choice, not a
  limitation; it has its own nav row.
  **How to check:** edit the template, `npm run build`, the page updates. `grep braindump.js
  cosmoboard-landing.html onboarding.html` shows matching hashes. Edits to the output file get
  overwritten by the next build, as with every generated page.
- [x] Markdown download button: verified complete, nothing to rebuild. The node header button
  downloads the note with YAML frontmatter (id, updatedAt, title) for identity round-trips, the
  fullscreen viewer has its own download button already wired, and exporting alongside referenced
  images and canvases is what the board-level export bundle does (proven by the export e2e).
  **How to check:** download from a note header and from fullscreen; both produce the file with
  frontmatter. For a note plus its assets, use Export on the toolbar.
- [x] IDs for `.md` and `.canvas` files: verified already built, and the privacy question has a !p1
  clean answer. `.canvas` files carry a `canvasId` and the import flow reconciles on it (proven
  today by the rewritten export e2e, which drives that exact prompt). Markdown notes carry a
  `markdownId` on the node, and downloads stamp minimal YAML frontmatter (`id`, `updatedAt`,
  `title`); reimport parses it and matches back to the originating node with a conflict prompt.
  Sidecars on disk deliberately stay frontmatter-free; their identity lives in the canvas node,
  and inline `_rawMarkdown` means a renamed sidecar loses linkage, not content. **Privacy:** ids
  are random uuids plus timestamps; nothing identifies a user or a browser, so the concern in
  this card does not materialize.
  **How to check:** download a markdown note (arrow button on its header), open the file: the
  frontmatter block is there. Reimport it: the board offers replace or keep-both by id.

## Known constraints

Not bugs, just things that bite if you forget them.

- Generated pages are build outputs. After changing build scripts, board data, or route behavior,
  run `npm run build`.
- The build is not reproducible across timezones. Rendered timestamps follow local time and DST, so
  a rebuild churns the project and open-quest pages with meaningless two-hour shifts. Rendering in a
  fixed timezone would fix it.
- `cosmoboard-landing.html` is a build output since 2026-07-30, generated from
  `src/templates/cosmoboard-landing.template.html`. Edit the template, not the output; hashes and
  the board source version are injected by `npm run build`.
- Chrome can hold stale local board state or a cached runtime. If Cosmoboard looks broken only in
  Chrome, clear site data for `127.0.0.1:4174` or hard reload.
- Do not remove legacy field tolerance for `markdown.source` and `board-preview.file` yet. Imported
  bundles and old localStorage states still contain them.

## Waiting on your review

Implemented, proof recorded in the archived task file. Mark `[x]` and drop once checked.

Treat those proof blocks with suspicion. The shared-entity entry was listed here as done, with a
proof line stating the cosmoboard canvas contains an `entity` node. It does not, and never did. It
has been moved to open work above. Spot-check the others before marking them `[x]`.

- [x] Multiple boards per page, including nested board and embed containers.
- [x] Markdown-to-canvas and canvas-to-markdown embedding and reference flows.
  Still open inside it: canvas-to-markdown export, md-to-board navigation, markdown node is
  read-only.
- [x] Filesystem-first content registry for boards, markdown, bases, assets, and embeds.
- [x] Dual portable import and export for `.canvas`, Git-friendly and bundle.
- [x] GitHub recommendation and versioning flows.

## Later

- [A] Realtime collaboration: assessed, and now superseded by your GitHub-sync direction. The !p3
  assessment stands in
  [`whiteboard/realtime_collaboration_note.md`](./whiteboard/realtime_collaboration_note.md)
  (whole-state saves clobber concurrent writers; op-level writes are the prerequisite), and your
  token-plus-private-repo idea is filed as the p1 architecture card in Now. It is the right first
  rung: reflected rather than realtime, and it works from the static site via the GitHub Contents
  API with the token never leaving your browser. Nothing further on this card.
  **How to check:** read the note, then judge the p1 GitHub-sync card's framing.
- [A] Runtime vs framework: recommendation written into the proposed roadmap section of
  holistic_planning.md. Keep the custom runtime primary: 60 FPS at 145 nodes, one dependency-free
  file, every feature this week landed without friction. Revisit only when a stage needs rich-text
  or CRDT primitives, via the extraction plan triggers, never as a rewrite in place.
- [x] Image focus-view dismissal hit area fixed. Clicking the unzoomed photo itself now closes the
  view, so the whole screen is the exit rather than just the backdrop margins, and the cursor
  shows zoom-out over the photo to say so. Zoomed clicks still pan, and touch taps still belong to
  double-tap zoom, so neither behavior lost anything.
  **How to check:** open any photo on `/photography.html`, click the middle of the image; it
  closes. Wheel-zoom in first, click; it stays.

---

## Superseded files

Folded into this one on 2026-07-28. Left in place so existing links keep resolving, but they are
history now, not live state.

| File | Was |
| --- | --- |
| [`PLAN.md`](./PLAN.md) | early plan, nothing open |
| [`active_todo.md`](./active_todo.md) | 30 of 31 items done, untouched since 2026-04-28 |
| [`general_issues_and_tasks.md`](./general_issues_and_tasks.md) | cross-domain inbox |
| [`holistic_planning/holistic_tasks.md`](./holistic_planning/holistic_tasks.md) | active work and review queue, keeps the proof detail |
| [`holistic_planning/holistic_backlog.md`](./holistic_planning/holistic_backlog.md) | medium and later work |

GitHub Issues stays the tracker for anything a user reports. The board files those itself through
the recommendation, feature request, and bug report panels.
