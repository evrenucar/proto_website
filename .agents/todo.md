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

## Status legend

These four markers are the kanban columns on `/tracker.html`. Changing a marker here moves the
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
  `tracker-feed.json` at the repo root: `{ "at": "<ISO time>", "agent": "<name>", "text": "..." }`.
  Newest first. That feed is the strip across the top of the tracker.
- When a task moves, its subtasks and notes move with it.
- One small validation block near the end of a task, not repeated test steps throughout.
- Once you verify an `[A]` item, mark it `[x]` and delete it on the next pass.
- Anything that outlives a session belongs here, not in `current_scratch_pad.md`.

---

## Now

- [x] Cosmoboard stays in this repo, and the `cosmoboard/` directory boundary is on hold too.
  Reasoning kept in [`cosmoboard_extraction_plan.md`](./cosmoboard_extraction_plan.md).
- [ ] Caret offset mapping for lines with inline markdown. Code landed but the browser session
  closed before verification, so it needs a real check. Helpers `computeVisibleOffsetInLine`,
  `buildVisibleToRawMap`, `visibleToRawOffset` map a visible offset to a raw offset through
  markers (`**`, `*`, `_`, backtick, links, leading `#`/`-`/`>`/`1.`). Without it, clicking a line
  containing `**bold**` lands on the wrong character.

## Bugs

- [x] Wheel zoom ceiling raised from 3x to 5x so it matches touch pinch. At the ceiling the
  view stopped responding entirely, which read as broken zoom.

- [~] @claude Select-all and delete inside an empty markdown window kills the active edit bar.
  Everything falls back to preview, and a save then refresh loses the changes although normal
  editing returns. This is the bug that emptied `content/boards/cosmoboard/direction.md`, so it has
  already cost real content once.
- [ ] Text overflows in the feature request, bug report, and recommendation panels.
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

Current state, run one file at a time: `tests/build/` 4/4, `tests/preview/` 3/3,
`tests/features/` 2/2, `tests/board/` 30/32.

- [ ] **Shared entity model is half built.** `src/entities/`, `content/entities/index.json` and the
  base-data `entityRef` all exist, but the `entity` node was never added to
  `content/boards/cosmoboard/current.canvas`, in any commit, despite the review-queue proof block
  claiming otherwise. The two tests are parked as
  `tests/features/shared-entity-*.pending.mjs`. Rename them back to `*.test.mjs` when the node lands.
- [ ] **Markdown authoring e2e needs the inline editor interaction solved.** Parked as
  `tests/features/markdown-authoring-e2e.pending.mjs`, rewritten for the quick path and passing up
  to the point where it has to type into the note. Its header lists everything already ruled out,
  read that before retrying. It no longer litters note files.
- [ ] Fix `tests/board/board-save-export-runtime.test.mjs`. It fails: asserts on `exportModalCanvasBtn`,
  an identifier that no longer exists in `braindump.js`.
- [ ] Fix `tests/board/board-url-paste-preview-e2e.test.mjs`. It fails: 30s `waitForSelector` timeout.
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
