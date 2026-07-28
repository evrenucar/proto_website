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
  - Fixed the `build()` race that deleted 54 tracked files under `content/`. The build no longer
    wipes `content/`, it clears only the directories it owns, and the preserve/restore helpers and
    their shared temp dir are gone. `tests/build/*.test.mjs` now passes 4/4 in parallel and
    destroys nothing.
  - Task tracking pruned from six markdown files to one: `.agents/todo.md`. The old files keep a
    supersede banner so existing links still resolve.
  - Wrote `.agents/cosmoboard_extraction_plan.md`. Recommendation is not to split the repo yet.
- What still needs work:
  - Red test suites, all tracked in `.agents/todo.md`. None are regressions.
  - Branch has diverged from `origin/fix-markdown-sidecar-405-error` (1 local vs 4 remote commits),
    so it needs a pull or a rebase before pushing.
- Next step:
  - Decide the Cosmoboard directory boundary, then triage the 5 failing feature tests.
