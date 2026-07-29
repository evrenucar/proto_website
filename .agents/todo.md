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

These four markers are the kanban columns on `/.tracker/tracker.html`. Changing a marker here moves the
card there within seconds.

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

- [x] Cosmoboard stays in this repo, and the `cosmoboard/` directory boundary is on hold too.
  Reasoning kept in [`cosmoboard_extraction_plan.md`](./cosmoboard_extraction_plan.md).
- [A] Caret offset mapping for lines with inline markdown, now verified in a browser and wrong in
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

- [A] Review happens on the board now, instead of in chat. Every card carries a **works** button, an
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

### Decided 2026-07-29, not yet built

Answered on the board. Held until the direction review says they are worth doing.

- [ ] Render `_underscore_` as emphasis, **at word boundaries only**, so `file_name_here` and
  `snake_case` stay literal. Note the trap: `buildVisibleToRawMap` deliberately mirrors
  `renderMarkdownLineToHtml` rule for rule, so the same rule has to land in both or the caret goes
  wrong again. `tests/board/markdown-caret-offset-mapping.test.mjs` will catch it if it does not.
- [ ] Add the `entity` node to `content/boards/cosmoboard/current.canvas`, then rename
  `tests/features/shared-entity-build.pending.mjs` and `shared-entity-runtime-e2e.pending.mjs` back
  to `*.test.mjs`. This is the last thing keeping any test parked.
- [ ] Delete orphan markdown node `hgr0v5cjqam` from `content/boards/cosmoboard/current.canvas`.
  Its `_rawMarkdown` is empty and the file it points at was deleted on purpose, so nothing is lost.
- [ ] Move the preview server to port 4174 permanently and update every doc that says 4173:
  `AGENTS.md`, `.agents/agents.md`, `tests/README.md`, and the `preview` script in `package.json`.
  `aide-board/serve.mjs` owns 4173.

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

- [A] The onboarding board opens with an intro panel: what Cosmoboard is in two sentences, how to
  interact with a node, and that nothing leaves the visitor's browser. It links to
  `cosmoboard-landing.html`, the written explanation, and to the full working board. The panel slot
  and its CSS already existed in the generator and had never been used by any page.
- [ ] `cosmoboard-landing.html` is `noindex,nofollow`, absent from the sitemap, and has no site nav.
  It is the best page to send someone, so decide whether it should be indexed, listed, and given the
  nav rather than `onboarding.html`.

- [A] `onboarding.html` is live at `evrenucar.com/onboarding.html`, having 404'd since it was
  written. The nav's **Cosmoboard** entry opens it, and **Braindump** is unlisted: it stays built
  and reachable at its URL, but a first-time visitor no longer lands in the scratch pad.
- [A] The live runtime moved from `?v=58` to the current content hash, so the public site finally
  has the select-all fix, the preview-embed write guard, and the non-destructive build.
- [ ] **`npm run sync:notion` has been failing on CI for days**, and it fails at the first step so
  `npm run build` never runs. `Error: Could not load the Notion page metadata for
  "https://evrenucar.notion.site/Project-Box-system-293312b0d17d8098827ce1ee98ceeb3e"`. This is why
  `main` stopped receiving content updates after 2026-06-22. Pages still deploys, because that is a
  separate workflow, so the site is current. Pre-existing, not caused by the merge. Either the page
  moved, was unshared, or Notion changed its metadata shape.
- [ ] The Maker Faire exhibitor PDF is still public under `content/boards/braindump/`, in two
  copies. It was removed from the onboarding board but that is not where it originated. It names
  119 people with their zone and set-up assignments. Decide whether it should be there at all.
- [ ] `.playwright-mcp/` is 31 tracked test-dump files served publicly. Pre-existing, and
  `.gitignore` does not cover it.

## Bugs

- [x] Wheel zoom ceiling raised from 3x to 5x so it matches touch pinch. At the ceiling the
  view stopped responding entirely, which read as broken zoom.

- [A] Select-all then delete no longer corrupts a markdown note. A selection spanning several lines
  fell through to contenteditable, which merged or dropped the line divs the editor depends on. The
  editor then found no active line, dropped to preview, and the next autosave wrote the damage to
  disk. Multi-line deletes are handled explicitly now, and a normalizer repairs the structure on any
  input as a backstop for paste, cut and drag-drop.
- [x] Text overflows in the feature request, bug report, and recommendation panels. Closed by the
  user on 2026-07-29, no longer an issue. Measured across phone, tablet and desktop widths first:
  at every touch width the panels go to a single 312px column and nothing escapes, so the reported
  symptom did not reproduce. One unrelated thing did show up and is filed separately below.
- [ ] The recommendation panel escapes the viewport at desktop widths near 1024px. Found while
  measuring the overflow report above, and it is a different bug: at 1024px with a mouse the panel
  is 558px wide in row layout and its right edge sits 18.7px past the viewport. The mobile column
  layout only kicks in below 1000px, or at 1200px with a coarse pointer, so a 1000-1200px mouse
  window falls between the two. Low priority, nobody has hit it.
- [ ] `_underscore_` does not render as emphasis. `renderMarkdownLineToHtml` has rules for
  `**bold**`, `*em*`, `` `code` `` and links, but none for underscores, so `_word_` shows its
  underscores verbatim. Found while fixing the caret mapping, which had assumed the opposite. The
  caret is correct either way now, so this is a rendering decision, not a correctness bug: add the
  rule to match standard markdown, or leave it and keep `snake_case` safe from accidental italics.
- [ ] The cosmoboard canvas has an orphan markdown node. Node `hgr0v5cjqam` points at
  `content/boards/cosmoboard/note-2026-07-28-15-37-36.md`, which commits `1534be1` and `c189cf2`
  deleted on purpose as test litter. The node was left behind, so loading the board recreates the
  file as an empty sidecar and it reappears as untracked. Its `_rawMarkdown` is empty, so nothing
  was lost. Delete the node or commit a real file for it.
- [ ] Save fails with HTTP 405 on GitHub Pages. Static hosting has no backend, so
  `POST /api/save-board` 405s. `saveBoard` degrades gracefully to localStorage, but once 405 fires
  `autosaveRepositorySupported = false` and only manual save retries, and there is still no path to
  persist back to the repo. Architectural answer is the recommendation/PR flow in
  [`whiteboard/online_save_plan.md`](./whiteboard/online_save_plan.md), then the OAuth path in
  [`whiteboard/online_save_backend_plan.md`](./whiteboard/online_save_backend_plan.md). The
  localStorage fallback is a bridge, not a destination.

## Test failures

Triaged 2026-07-28. Each was reproduced on unmodified `HEAD` first, so none is a regression from
the review fixes.

Current state, run one file at a time: `tests/build/` 4/4, `tests/preview/` 4/4,
`tests/features/` 3/3, `tests/board/` 33/33. `tests/export/` is 2/3 and was never in this count.

- [ ] **`tests/export/export-bundling-e2e.test.mjs` fails**, and always did. Its
  `page.waitForFunction` at line 218 times out after 30s. Confirmed pre-existing by stashing the
  caret fix and re-running against unmodified `HEAD`, so it is not a regression. The `export/`
  directory was simply never included when the suites were counted; the other two files in it pass.

- [ ] **Shared entity model is half built.** `src/entities/`, `content/entities/index.json` and the
  base-data `entityRef` all exist, but the `entity` node was never added to
  `content/boards/cosmoboard/current.canvas`, in any commit, despite the review-queue proof block
  claiming otherwise. The two tests are parked as
  `tests/features/shared-entity-*.pending.mjs`. Rename them back to `*.test.mjs` when the node lands.
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
- [A] Fixed `tests/board/board-save-export-runtime.test.mjs`, and it was flagging three real gaps:
  the "Export .canvas" button had no listener at all, export size estimates silently counted zero
  whenever a server omitted content-length on HEAD, and `serializeState` handed out live node
  references because `stripTransientNodeFields` returns the original when it has nothing to strip.
- [A] Fixed `tests/board/board-url-paste-preview-e2e.test.mjs`. Pasting a link to one of this
  site's board pages now creates a live board-preview instead of a plain bookmark. The runtime never
  read `data-board-index`, which the build has been emitting all along, so the feature was specced
  and plumbed but never written.
- [ ] Suites still flake when a whole directory runs in parallel, because concurrent builds write
  the same generated files while other tests read them. Cosmetic only: the destructive part is
  fixed, nothing gets deleted. Run one file at a time for a reliable result.
- [ ] Node title and filename disagree on separator. The board shows
  `note-2026-07-28_19-27-04`, the file on disk is `note-2026-07-28-19-27-04.md`, because
  `sanitizeMarkdownFilename` flattens the underscore. Cosmetic, but it breaks the
  board-matches-filesystem correspondence.
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

- [ ] Shift plus arrow keys cannot extend a selection across markdown lines. The editor's own
  ArrowUp and ArrowDown handlers move the caret and preventDefault without checking `shiftKey`.
  Found while testing the select-all fix.
- [ ] Entering a markdown note takes two clicks: the first selects the node, the second focuses the
  editor. Now documented and pinned by `tests/features/markdown-authoring-e2e.test.mjs`, so this is
  purely a product decision: leave it, or make one click enter directly. If it changes, that test's
  `focusFirstLine` helper is the thing to update.

- [A] The eurocrate project board is built out, 15 nodes, from the project's own Notion content
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

- [ ] Inline image pasting inside markdown files.
- [ ] Markdown download button. **Partly built already:** markdown nodes carry a
  `.bd-markdown-download-btn` ("Download markdown") next to `.bd-markdown-fullscreen-btn`. Check
  what it currently does before rebuilding it. What may still be missing is the fullscreen
  repositioning and exporting alongside referenced images and canvases.
- [ ] IDs for `.md` and `.canvas` files so a rename does not break restore or reimport. Stamped per
  user and browser is possible but check the privacy side first.

## Known constraints

Not bugs, just things that bite if you forget them.

- Generated pages are build outputs. After changing build scripts, board data, or route behavior,
  run `npm run build`.
- The build is not reproducible across timezones. Rendered timestamps follow local time and DST, so
  a rebuild churns the project and open-quest pages with meaningless two-hour shifts. Rendering in a
  fixed timezone would fix it.
- `cosmoboard-landing.html` is hand-maintained but embeds `data-board-source-version`, which the
  generator computes as a content hash. Re-copy it from the generated `onboarding.html` whenever the
  onboarding canvas changes. Generating this page too would remove the chore.
- Chrome can hold stale local board state or a cached runtime. If Cosmoboard looks broken only in
  Chrome, clear site data for `127.0.0.1:4173` or hard reload.
- Do not remove legacy field tolerance for `markdown.source` and `board-preview.file` yet. Imported
  bundles and old localStorage states still contain them.

## Waiting on your review

Implemented, proof recorded in the archived task file. Mark `[x]` and drop once checked.

Treat those proof blocks with suspicion. The shared-entity entry was listed here as done, with a
proof line stating the cosmoboard canvas contains an `entity` node. It does not, and never did. It
has been moved to open work above. Spot-check the others before marking them `[x]`.

- [A] Multiple boards per page, including nested board and embed containers.
- [A] Markdown-to-canvas and canvas-to-markdown embedding and reference flows.
  Still open inside it: canvas-to-markdown export, md-to-board navigation, markdown node is
  read-only.
- [A] Filesystem-first content registry for boards, markdown, bases, assets, and embeds.
- [A] Dual portable import and export for `.canvas`, Git-friendly and bundle.
- [A] GitHub recommendation and versioning flows.

## Later

- [ ] Realtime collaboration across boards, markdown, and structured data, if the architecture
  supports it cleanly.
- [ ] Decide whether the custom Cosmoboard runtime stays primary or a framework-backed editor path
  is worth adopting.
- [ ] Fix the image focus-view dismissal hit area on the existing site.

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
