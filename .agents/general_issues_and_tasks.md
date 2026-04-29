# Cross-Domain Inbox

## Purpose
Short shared notes and pointers that do not belong in a single domain doc.

## Read when
Looking for unresolved cross-cutting notes or quick pointers between domains.

## Skip when
Working on a specific domain (use the domain task file instead).

## Canonical for
Cross-domain notes, unresolved quick items, temporary pointers.

---

- Chrome can keep stale local board state or a cached board runtime. If Cosmoboard looks broken only in Chrome, clear site data for `127.0.0.1:4173` or hard reload.
- Do not remove legacy field tolerance for `markdown.source` and `board-preview.file` yet. Imported bundles and old localStorage states may still contain them.
- Generated pages are build outputs. After changing build scripts, board data, or route behavior, run `npm run build`.
- **Save fails with HTTP 405 on GitHub Pages.** When the site is hosted statically (GitHub Pages), `POST /api/save-board` returns 405 because there is no backend. Current code at `JavaScript/braindump.js:5934` (`saveBoard`) handles this gracefully — falls back to localStorage and toasts `"Saved locally. Start dev-server to persist to the repository."` But: (1) once 405 fires, `autosaveRepositorySupported = false` and autosave stops firing — only manual save retries, (2) there is no path for the user to actually persist changes back to the repo. Architectural answer is the recommendation/PR flow in [`whiteboard/online_save_plan.md`](whiteboard/online_save_plan.md) (download `.canvas` + open a PR) and the later OAuth path in [`whiteboard/online_save_backend_plan.md`](whiteboard/online_save_backend_plan.md). The current localStorage-only fallback is a bridge, not a destination.

### Pre-existing board test failures (surfaced 2026-04-29 during shift-snap rollout)

Surfaced when running `node --test tests/board/*.test.mjs` after the Shift-snap feature landed. None are caused by the Shift-snap change — they fail on the same tree without those edits. Tracked here so they don't get lost.

- `tests/board/board-save-export-runtime.test.mjs` — fails. Already documented in the earlier core-board review (`gpt_review_20260429_032501.md`) as a P0 item.
- `tests/board/cosmoboard-initial-layout.test.mjs` — fails. Layout assertion at narrow desktop width; not related to drawing.
- `tests/board/board-url-paste-preview-e2e.test.mjs` — fails. Not previously documented; flagged for triage. Likely related to URL paste/preview pipeline rather than drawing.
