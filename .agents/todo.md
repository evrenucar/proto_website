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

- `[ ]` pending
- `[A]` implemented, waiting on user review
- `[x]` user has verified it

## Rules

- Highest priority nearest the top of its section.
- When a task moves, its subtasks and notes move with it.
- One small validation block near the end of a task, not repeated test steps throughout.
- Once you verify an `[A]` item, mark it `[x]` and delete it on the next pass.
- Anything that outlives a session belongs here, not in `current_scratch_pad.md`.

---

## Now

- [ ] Decide whether Cosmoboard gets its own repo. Extraction plan and recommendation:
  [`cosmoboard_extraction_plan.md`](./cosmoboard_extraction_plan.md). Current call is no,
  do the directory boundary first.
- [ ] Caret offset mapping for lines with inline markdown. Code landed but the browser session
  closed before verification, so it needs a real check. Helpers `computeVisibleOffsetInLine`,
  `buildVisibleToRawMap`, `visibleToRawOffset` map a visible offset to a raw offset through
  markers (`**`, `*`, `_`, backtick, links, leading `#`/`-`/`>`/`1.`). Without it, clicking a line
  containing `**bold**` lands on the wrong character.

## Bugs

- [ ] Select-all and delete inside an empty markdown window kills the active edit bar. Everything
  falls back to preview, and a save then refresh loses the changes although normal editing returns.
  This is the bug that emptied `content/boards/cosmoboard/direction.md`, so it has already cost
  real content once.
- [ ] Text overflows in the feature request, bug report, and recommendation panels.
- [ ] Save fails with HTTP 405 on GitHub Pages. Static hosting has no backend, so
  `POST /api/save-board` 405s. `saveBoard` degrades gracefully to localStorage, but once 405 fires
  `autosaveRepositorySupported = false` and only manual save retries, and there is still no path to
  persist back to the repo. Architectural answer is the recommendation/PR flow in
  [`whiteboard/online_save_plan.md`](./whiteboard/online_save_plan.md), then the OAuth path in
  [`whiteboard/online_save_backend_plan.md`](./whiteboard/online_save_backend_plan.md). The
  localStorage fallback is a bridge, not a destination.

## Test failures

Status verified 2026-07-28. Each was reproduced on unmodified `HEAD`, so none is a regression.
Run build tests in parallel again if you like, the race that made that dangerous is fixed.

- [ ] `tests/features/` all 5 fail. Not yet triaged.
- [ ] `tests/preview/preview-markdown-endpoint.test.mjs` fails: the endpoint writes the sidecar to
  the board root, the test expects it under `.../markdown/`. Sits in the markdown sidecar area.
- [ ] `tests/board/board-save-export-runtime.test.mjs` fails: asserts on `exportModalCanvasBtn`,
  an identifier that no longer exists in `braindump.js`.
- [ ] `tests/board/board-url-paste-preview-e2e.test.mjs` fails: 30s `waitForSelector` timeout.
- [x] `tests/board/cosmoboard-initial-layout.test.mjs` now passes. Previously listed as failing.

## Features and ideas

- [ ] Inline image pasting inside markdown files.
- [ ] Markdown download button, left of the fullscreen button, moving left when the markdown file
  goes fullscreen. If the file references external images or canvases, export accordingly.
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

- [A] Shared-entity model for content reused across boards, markdown, and structured views.
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
