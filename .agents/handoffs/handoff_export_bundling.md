# Handoff: Cosmoboard Export, Bundling, and Collaboration State

Last updated: 2026-04-24

## Objective

Cosmoboard now has a dual export strategy:

- Git-friendly `.canvas.json` recommendations for issues, reviews, and text diffs.
- Portable `.zip` project bundles for full board handoffs with linked files, markdown, assets, and board previews.

This handoff is the current state summary for the next agent. The broader roadmap still lives in the holistic planning docs.

## Current Status

### Implemented and awaiting review

- Dual export flow is implemented in `JavaScript/braindump.js`.
  - `.canvas.json` keeps embedded Base64 assets for Git-friendly recommendation payloads.
  - Export modal also offers a direct single-file `.canvas` export without bundling.
  - `.zip` bundle export uses `JavaScript/vendor/fflate.min.js`.
  - Bundle import rewrites bundled file, markdown, and board-preview references to temporary Blob URLs.
  - Generated board pages include the export modal, `.zip` import support, and the "Include linked sub-pages" option.
  - Export serialization clones live board state before rewriting bundle paths, so exporting no longer mutates open board nodes or causes linked markdown/board-preview paths to disappear.
  - Size estimates now fall back to fetching resource bytes when `HEAD` does not expose `content-length`, so toggling linked sub-pages changes the estimate.
- Board save/reload reliability is implemented for local preview.
  - `scripts/preview-server.mjs` now implements `POST /api/save-board` and writes to the registered board `sourcePath`.
  - `Ctrl/Cmd+S` uses the same save path as the toolbar Save button instead of opening a `.canvas` download/save-as flow.
  - Real browser regression: `tests/board-save-reload-e2e.test.mjs`.
- Board URL paste-to-preview is implemented.
  - Generated board pages include `data-board-index` metadata for known board pages and sources.
  - Pasting another board page URL creates a `board-preview` node with the SVG/minimap preview instead of a generic bookmark.
  - Regression: `tests/board-url-paste-preview-e2e.test.mjs`.
- Server-side extraction exists in `scripts/extract-assets.mjs`.
  - Command: `npm run extract-assets -- <path-to-canvas-or-canvas-json>`
  - It extracts `data:image/...;base64,...` values into `content/assets/images/`.
  - It rewrites the canvas JSON to point at the extracted asset paths.
- GitHub recommendation handoff is review-first and awaiting user review.
  - Prefilled GitHub issues include board slug and board repo path.
  - Prefilled GitHub issues now include the board source version for comparison/versioning.
  - The issue body includes a review/versioning section that says the handoff is not a direct publish or overwrite action.
  - The modal now explains that the downloaded `.canvas.json` must be attached, recommendations are reviewed before appearing live, and existing board recommendation issues should be updated instead of duplicated.
  - Recommendation export still downloads a `.canvas.json` file for manual attachment.
  - Regression coverage exists in `tests/recommendation-flow-e2e.test.mjs`.
- Chrome stale-state compatibility is covered.
  - Runtime now tolerates legacy `markdown.source` and `board-preview.file` fields from old localStorage/import states.
  - `braindump.js` cache key is currently `v=52`.
  - `braindump.css` cache key is currently `v=27`.
  - Regression: `tests/cosmoboard-legacy-render-fields.test.mjs`.
- YouTube live embed behavior is fixed.
  - Preview/open links keep the original YouTube watch URL.
  - Live iframe uses `youtube-nocookie.com/embed/...` and preserves start time as `?start=...`.
  - Canvas live iframes match project-page YouTube embeds with `referrerpolicy="strict-origin-when-cross-origin"` so videos render instead of showing a blank or unavailable player.
  - `/live/` YouTube URLs are supported in addition to watch, short, youtu.be, and embed URLs.
  - YouTube iframe permissions include autoplay, encrypted media, picture-in-picture, web-share, and fullscreen.
  - Regression: `tests/youtube-live-embed.test.mjs`, with screenshot proof at `.tmp/youtube-live-embed/canvas-youtube-live.png`.
- Local preview server route cleanup is implemented.
  - Extensionless routes like `/project`, `/projects`, `/braindump`, `/cosmoboard`, and project detail paths resolve to the correct HTML.
  - Regression: `tests/preview-server-routes.test.mjs`.
- Shared-entity V1 is implemented and awaiting review.
  - `src/entities/eurocrate-storage-system.json` is the first file-backed entity record.
  - `src/registry.json` has an `entities` collection.
  - `scripts/build-site.mjs` generates `content/entities/index.json` and links entity metadata into base rows via `entityRef` and `entityTitle`.
  - Cosmoboard includes an `entity` node referencing `eurocrate-storage-system`.
  - `JavaScript/braindump.js` and `CSS/braindump.css` render shared entity cards on the board.
  - Regression coverage:
    - `tests/shared-entity-build.test.mjs`
    - `tests/shared-entity-runtime-e2e.test.mjs`
  - Screenshot proof: `.tmp/shared-entity-e2e/cosmoboard-shared-entity.png`.

### Current proof commands

Run these sequentially when touching this area. Several commands run `build()` and preserve/restore `content/boards`, so do not run the build-based tests in parallel in the same workspace.

```powershell
npm run build
node tests\export-bundling-runtime.test.mjs
node tests\export-bundling-build.test.mjs
node tests\board-save-export-runtime.test.mjs
node tests\preview-save-endpoint.test.mjs
node tests\board-save-reload-e2e.test.mjs
node tests\board-url-paste-preview-e2e.test.mjs
node tests\export-size-subpages-e2e.test.mjs
node tests\export-bundling-e2e.test.mjs
node tests\extract-assets.test.mjs
node tests\recommendation-flow-e2e.test.mjs
node tests\cosmoboard-legacy-render-fields.test.mjs
node tests\youtube-live-embed.test.mjs
node tests\preview-server-routes.test.mjs
node tests\cosmoboard-build.test.mjs
node tests\shared-entity-build.test.mjs
node tests\shared-entity-runtime-e2e.test.mjs
```

Browser bundle screenshots are written by `tests/export-bundling-e2e.test.mjs` to:

- `.tmp/export-bundling-e2e/export-modal.png`
- `.tmp/export-bundling-e2e/imported-bundle.png`

Recommendation flow screenshots are written by `tests/recommendation-flow-e2e.test.mjs` to:

- `.tmp/recommendation-flow-e2e/recommendation-entry.png`
- `.tmp/recommendation-flow-e2e/github-handoff-modal.png`

## Known Operational Notes

- Chrome can keep stale local board state or a cached board runtime.
  - If Cosmoboard looks broken only in Chrome, clear site data for `127.0.0.1:4173` or hard reload.
  - Keep cache keys bumped when `JavaScript/braindump.js` behavior changes.
- Do not remove legacy field tolerance yet.
  - Imported bundles and old localStorage states may still contain `markdown.source` or `board-preview.file`.
- Generated pages are build outputs.
  - After changing `scripts/build-site.mjs`, `JavaScript/braindump.js`, board data, or route behavior, run `npm run build`.
- Before final handoff for site work, make sure the local preview server is running.
  - Current expected local URL: `http://127.0.0.1:4173`

## Next Items

1. Defer realtime collaboration.
   - Realtime should come after async GitHub/versioning and shared entities are stable.
2. Consider a small in-app reset action.
   - A "Reset local board state" action would make Chrome/localStorage cleanup safer than manual browser clearing.
3. Recursive bundle depth is optional later work.
   - Current bundle export includes linked sub-pages as individual files.
   - Deep recursive graph bundling should wait until board/project complexity justifies it.

## Relevant Documentation

- `.agents/holistic_planning/holistic_planning.md` - umbrella product plan for boards, markdown, bases, embeds, portability, and collaboration.
- `.agents/holistic_planning/holistic_tasks.md` - ordered implementation tracker and current next-work sequence.
- `.agents/whiteboard/cosmoboard_portability.md` - portability, embed, markdown, file, and compatibility strategy.
- `.agents/whiteboard/cosmoboard_implementation_plan.md` - reusable Cosmoboard engine roadmap.
- `.agents/whiteboard/online_save_plan.md` - static-site-friendly recommendation and export flow.
- `.agents/whiteboard/online_save_backend_plan.md` - later GitHub OAuth and PR-based collaboration path.
- `.agents/page_database/page_database_plan.md` - collection/page/database model that will connect to shared entities.
