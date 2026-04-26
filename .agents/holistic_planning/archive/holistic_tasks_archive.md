# Holistic Tasks Archive

This file contains completed, superseded, and deprioritized tasks from `holistic_tasks.md`.

---

## completed_tasks

- [A] Initialize the holistic task tracker and wire it into the shared agent docs.
  - `.agents/holistic_planning/holistic_tasks.md` created
  - references added to `.agents/agents.md` and `.agents/general_issues_and_tasks.md`
  - prior image-focus bug migrated to `old_tasks`

- [A] Define and implement the first `cosmoboard` onboarding page.
  - `cosmoboard.html` generated from `cosmoboardPage` config in `src/site-data.mjs`
  - canonical board at `content/boards/cosmoboard/current.canvas`
  - board renders with text nodes, link nodes, and working board-preview node

- [A] Create a Node.js server-side extraction script for recommendation parsing.
  - `scripts/extract-assets.mjs` parses `.canvas` / `.canvas.json` files.
  - It extracts `data:image/...;base64,...` strings from node fields.
  - It saves extracted images as binary files, defaulting to `content/assets/images/`.
  - It rewrites the canvas JSON to point at the extracted asset paths.
  - It is exposed through `npm run extract-assets -- <canvas-file>`.
  - Verified by `tests/extract-assets.test.mjs`.

- [A] Generalize Braindump into a reusable Cosmoboard engine.
  - `mountCosmoboard(hostElement)` factory replaces single-page globals
  - `data-board-app`, `data-board-role`, `data-board-ui` data attributes replace hardcoded IDs
  - `boardPages` registry in `src/site-data.mjs` drives generic `renderBoardPage()` in build script
  - Braindump and Cosmoboard both generated from the same build path

- [x] Prototype the first base/database layer inside the current site.
  - Proof:
    - Added `base` node type to the Cosmoboard canvas.
    - Build script exports content items to `content/base-data/items.json`.
    - Implemented `renderBaseNode` in `JavaScript/braindump.js`.
    - Supports dynamic columns and filtering.
    - Full CSS implementation with nice UI.

- [x] Add preview-first embeds with optional live website/embed mode.
  - Proof:
    - Updated `link` nodes to support `embedMode` property.
    - Default state remains the small bookmark preview card.
    - Added "View Live" overlay button and `.bd-embed-header` on live iframes.
    - Verified with Wikipedia (works) and GitHub (fallback header works).

- [x] Add saved embedded web app sessions as a first-class object type.
  - Proof:
    - App/session manifest shape defined at `content/apps/excalidraw-proto.json`.
    - New `app` node type in `JavaScript/braindump.js`.
    - Preview state with "Launch App" CTA and live embedded state with minimize header.

- [x] Add local file and folder read/write support with capability detection and graceful fallback.
  - Proof:
    - Native "Open", "Save", and "Save As" actions in toolbar.
    - File System Access API with permission checks.
    - Safe fallbacks for unsupported browsers.
