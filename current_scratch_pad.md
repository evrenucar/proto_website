# Current Scratch Pad

This file is the shared short-term work log for the current session.



## SCRATCH PAD (FAST NOTES BUGS AND TODOS)

- [BUG] When you CTRL+A inside a markdown window when there is no text and delete. THe active edit bar with the blue opacity disappears. All edits default to preview version. ANd even if you save it then refresh all changes disappear but the regular markdown editing is back after refresh
- [BUG] When you are sending feature request, bug reporting or rending recommendation the text can overflow. Fix this! (example: ![alt text](image.png))
- [FEATURE_REQUEST] Inline image pasting inside markdown files.
- [FEATURE_REQUEST] Markdown file download button. Just saves the markdown. On the left of the fullscreen button. Switches to the left when markdown files are made fullscreen. If markdown file contains external links like images and canvasses it will export as a 
- [IDEA] Should .md and .canvas files have an ID? So even if name is updated the file can just be restored or updated with a new file being imported. That is unique to creation and who it is created by etc. It can be stamped per user and browser as well. Not sure if this is okay from a privacy side.
- [BUG] `npm run build` is not safe to run twice at once. It does `rm -rf content/` and restores from one shared `.build-preserve` dir, so two overlapping runs delete board content. `node --test tests/build/*.test.mjs` triggers this because Node runs the files in parallel and several call `build()`. It deleted 54 tracked files under `content/` during the 2026-07-28 review. Run build tests one file at a time until this is fixed.
- [BUG] `tests/preview/preview-markdown-endpoint.test.mjs` fails: the endpoint writes the sidecar to the board root, the test expects it under `.../markdown/`. Pre-existing on `main`, but it is in this branch's own problem area.
- [BUG] All 5 `tests/features/` tests fail on `HEAD`, as do 2 in `tests/board/`. Not regressions, but the suite is red enough that it will not catch a real one.
- [ISSUE] Build output is not reproducible: rendered timestamps follow the local timezone and DST, so rebuilding churns the project and open-quest pages with two-hour shifts that mean nothing.
- [ISSUE] `cosmoboard-landing.html` is hand-maintained but embeds `data-board-source-version`, which the generator computes as a content hash. It has to be re-copied from the generated `onboarding.html` whenever the onboarding canvas changes. Worth generating this page too.

## Archieved_scratch_pad_items(completed or discarded)
- [completed] [FEATURE_REQUEST] Importing files and images via drag and drop doesnt't work only works for markdown files for now



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

- Reviewing branch `fix-markdown-sidecar-405-error` against `main` and fixing what the review found.
- Full write-up: `.agents/reviews_and_feedback/code_review_20260728_154536.md`.

### Start Of Session

- Date: 2026-07-28
- Working on: review of the onboarding board / `defaultViewport` branch, then applying the fixes.
- Why now: User asked for a review, then asked for the findings to be fixed.
- Known constraints: local preview at `http://127.0.0.1:4173` (`npm run preview`).

### End Of Session

- Date: 2026-07-28
- What changed:
  - Preview embeds can no longer write to the repository. Guarded `markBoardDirty`,
    `startAutosaveLoop` and `saveBoard` in `JavaScript/braindump.js`. Zooming the landing preview
    was rewriting `content/boards/onboarding/current.canvas`; reproduced live, then confirmed fixed.
  - `scripts/build-site.mjs` now emits `?v=59`, so the next build stops reverting the cache bust.
  - `onboarding.html` is generated: added `onboardingPage` to `src/site-data.mjs` `boardPages`.
    It is now in the sitemap and in every board's `data-board-index`.
  - Restored `content/boards/cosmoboard/direction.md` from `main` and refilled the `ob-direction-md`
    node. It had been emptied to one blank line.
  - `defaultViewport` now applies on a first load of the full board, not only in preview. Also fixed
    diff-apply silently dropping it.
  - Repaired two `board-preview` nodes that pointed at export-bundle paths and 404'd.
  - Smaller: shared `checkStoredStateMeta` helper, live `:landing-preview` key match, registry
    description, `cosmoboard-landing.html` source version synced.
- What still needs work:
  - The build concurrency bug and the red test suites, both logged in the scratch pad list above.
  - Nothing here is committed yet.
- Next step:
  - Review the diff, then commit. Fix the `build()` race before anyone runs the full test suite.
