# Holistic Tasks

## Rules

- This file is the ordered task tracker for the broader Cosmoboard direction inside `evrenucar.com`.
- Keep tasks as bullet points.
- Use `[ ]` as the default status for pending work.
- Use `[A]` for work that is implemented and awaiting user review.
- Do not use `[X]` in this file.
- Keep the highest priority work nearest the top.
- Put currently worked-on tasks under `active_work`.
- When a task moves, move all of its indented subtasks, testing steps, proof requirements, and notes with it.
- Do not require repeated test steps throughout implementation by default.
- Prefer one small validation block near the end of a task.
- Testing blocks should stay minimal unless the task is risky or the user asks for deeper coverage.
- Every testing block should include:
  - how the feature is minimally validated at the end
  - only the proof artifacts that are actually useful
  - a final validation step confirming the feature actually works
- After the user reviews an `[A]` task, it can be moved to `completed_tasks`.
- Tasks that are older, out of scope, or intentionally deprioritized should live under `old_tasks`.

## active_work

_(no active items — see near_term_priority for next work)_

## near_term_priority

- [A] Support multiple boards per page and nested board/embed containers.
  - Proof:
    - `mountCosmoboard(hostElement)` factory in `JavaScript/braindump.js` — each instance has isolated state
    - `_activeBoardViewport` tracks pointer ownership across instances
    - `_mountedBoardCount` gates keyboard shortcut disambiguation
    - auto-discovery: `document.querySelectorAll('[data-board-app=\"true\"]').forEach(mountCosmoboard)`
    - `board-preview` node type fully implemented and rendering in cosmoboard — fetches referenced board JSON, builds SVG minimap, shows title/description/item count, provides "Open board" link
    - embedded `data-board-mode=\"preview\"` mode implemented: read-only, reduced toolbar, "Open board" link, constrained height
    - cosmoboard page verified live at `http://127.0.0.1:4173/cosmoboard.html` with board-preview node showing Braindump minimap (97 items)
    - `renderDetailPage` in `scripts/build-site.mjs` now optionally renders `renderEmbeddedBoardPreview` when `item.board` is present
    - `normalizeNotionItem` passes `board` field through unchanged
    - `eurocrate-storage-universal-solution` Notion item now has a `board` config pointing to `content/boards/projects/eurocrate-storage/current.canvas`
    - starter canvas created for the eurocrate project board with 7 spatial nodes
    - `CSS/site.css` gains `detail-board-section`, `detail-board-header`, `detail-board-heading`, `detail-board-copy` styles
    - verified live: `http://127.0.0.1:4173/content/projects/eurocrate-storage-universal-solution.html` shows the board embed between article content and "Other projects"

- [A] Add markdown-to-canvas and canvas-to-markdown embedding and reference flows.
  - Proof:
    - `markdown` node type added to the Cosmoboard runtime (`JavaScript/braindump.js`)
    - `createNode("markdown", ...)` stores `file`, `title`, `href` on the node object
    - `renderMarkdownNode(nodeObj, el)` fetches the `.md` file, parses it with a lightweight inline renderer (headings, bold/italic, code, links, lists, blockquotes, hr), and renders as prose HTML
    - `parseMarkdownToHtml(md)` handles fenced code blocks, horizontal rules, h1-h6, blockquotes, unordered lists, and paragraphs
    - `CSS/braindump.css` gains `.bd-layer-markdown`, `.bd-markdown-shell`, `.bd-markdown-header`, `.bd-markdown-body`, `.bd-markdown-view-link`, and typographic styles for all rendered elements
    - `content/boards/cosmoboard/direction.md` created as the first reference markdown file on the board
    - Cosmoboard canvas updated with a `markdown` node at x=1340 pointing to `direction.md`
    - Critical bug fixed: `legacyStorageKey`/`legacySourcePath` now use `!= null` checks so boards with empty `data-board-legacy-*` attributes don't fall back to Braindump's legacy key
  - Remaining:
    - canvas-to-markdown: exporting or syncing board content back to `.md` format
    - board preview inside markdown/page context: already works via `renderEmbeddedBoardPreview` on detail pages
    - navigation from one surface to the other: `href` on markdown node links to the source file; reverse direction (md → board) not yet wired
    - validate edit authority: the markdown node is currently read-only (no in-canvas editing); edit authority is clear — edit in the `.md` file, reload to update

- [A] Create the filesystem-first content registry for boards, markdown files, bases, assets, and embeds.
  - Proof:
    - `content/registry.json` created with version=1 schema: `boards`, `notes`, `assets`, `embeds` collections
    - 3 boards registered: braindump, cosmoboard, eurocrate-storage
    - 1 note registered: cosmoboard/direction.md
    - `scripts/build-site.mjs` reads and validates the registry at build time: logs entry counts, warns about missing files
    - Build output: `[registry] v1: 3 boards, 1 notes, 0 assets, 0 embeds` — clean, no warnings
    - Registry is additive — existing `site-data.mjs` and `notion-items.json` remain authoritative for the build pipeline; registry is the filesystem-first index layer
    - Schema includes: `slug`, `title`, `file` (page), `sourcePath` (raw file), `storageKey`, `description`, `tags`, optional `projectSlug` link

- [x] Prototype the first base/database layer inside the current site.
  - Proof:
    - Added `base` node type to the Cosmoboard canvas (`content/boards/cosmoboard/current.canvas`).
    - Build script `scripts/build-site.mjs` exports content items to `content/base-data/items.json` for runtime fetching.
    - Implemented `renderBaseNode` in `JavaScript/braindump.js` to render a structured table view.
    - Supports dynamic columns (`title`, `publishingStatus`, `year`, `effort`) and filtering (e.g., `section=projects`).
    - Clicking rows links to the detail pages natively.
    - Full CSS implementation (`.bd-base-shell`, `.bd-base-table`, `.bd-base-pill`) with nice UI.
    - Base node correctly loads, parses, sorts by modified date, and renders items on the Cosmoboard surface.

- [x] Add preview-first embeds with optional live website/embed mode.
  - Proof:
    - Updated `link` nodes in `JavaScript/braindump.js` to support an `embedMode` property ("preview" vs "live").
    - Default state remains the small bookmark preview card.
    - Added a "View Live" overlay button on the bookmark preview to switch to iframe mode.
    - Added a sleek `.bd-embed-header` on live iframes containing a "Preview" back button and an "Open" link.
    - Verified functionality using the browser subagent on Cosmoboard: Wikipedia embeds perfectly via iframe, while GitHub (which blocks iframes via X-Frame-Options) correctly shows the fallback header, giving the user an immediate escape hatch without breaking the page.

- [x] Add saved embedded web app sessions as a first-class object type.
  - Proof:
    - Defined an app/session manifest shape (`content/apps/excalidraw-proto.json`) registered centrally in `src/registry.json`.
    - Implemented a new `app` node type in `JavaScript/braindump.js` that fetches these manifests natively.
    - Built a robust preview state (`.bd-app-card`) with a clear "Launch App" call to action.
    - Implemented the live embedded state (`.bd-app-live`) that loads the web app in an iframe, paired with a custom header to minimize it back to the preview state.
    - Verified smooth transition from preview card -> live iframe -> preview card via the browser subagent without needing to open new browser tabs.

## medium_term_priority

- [A] Add dual portable import and export flows for `.canvas` (Git-friendly vs Bundle).
  - Scope:
    - keep `.canvas.json` export with embedded Base64 for Git-friendly recommendations and quick text patches.
    - add a bundle export for full project handoffs (.zip) that converts Base64 back into raw assets.
    - provide UI options to include or exclude linked sub-pages in the bundle.
  - Proof:
    - `JavaScript/vendor/fflate.min.js` is vendored and loaded on generated board pages for offline bundle support.
    - Generated board pages include `#braindump-export-modal`, `.zip` import fallback support, and the "Include linked sub-pages" option.
    - `exportProjectBundle(includeSubpages)` packages file nodes, Base64 assets, linked board-preview sources, and markdown files.
    - `.zip` import rewrites bundled file, markdown, and board-preview references to temporary Blob URLs.
    - `scripts/extract-assets.mjs` plus `npm run extract-assets -- <canvas-file>` extracts accepted recommendation Base64 images into binary asset files and rewrites the canvas JSON.
    - Regression tests added:
      - `tests/export-bundling-build.test.mjs`
      - `tests/export-bundling-runtime.test.mjs`
      - `tests/export-bundling-e2e.test.mjs`
      - `tests/extract-assets.test.mjs`
    - Browser e2e test writes proof screenshots to `.tmp/export-bundling-e2e/export-modal.png` and `.tmp/export-bundling-e2e/imported-bundle.png`.
  - Validation:
    - Bundle import/export is meaningfully portable for the current board, image asset, markdown, and linked board-preview cases.

- [x] Add local file and folder read/write support with capability detection and graceful fallback.
  - Proof:
    - Replaced the single "Export" button with native "Open", "Save", and "Save As" actions in the toolbar.
    - Implemented `openLocalFile`, `saveLocalFile`, and `saveLocalFileAs` utilizing the `window.showOpenFilePicker` and `window.showSaveFilePicker` APIs.
    - Added global state to retain the `fileHandle` across the session.
    - Added proper permission checks (`queryPermission` and `requestPermission`) before overwriting a file on `Ctrl+S`.
    - Integrated safe fallbacks for unsupported browsers (standard file `<input>` for open, and legacy `downloadStateFile` for export).

- [ ] Add GitHub recommendation and versioning flows as the main near-term collaboration surface.
  - Scope:
    - keep GitHub as the main collaboration bridge for now
    - support recommendation submission, issue or PR flow, and board-aware context
    - keep local-first editing working without GitHub
  - Progress:
    - recommendation issue handoff now includes board slug and source repo path in the prefilled GitHub body
    - browser regression added in `tests/recommendation-flow-e2e.test.mjs`
    - verified the real toolbar flow: recommendation entry, exported `.canvas.json` download, handoff modal, and prefilled GitHub issue URL
  - Notes:
    - Chrome may keep stale local board state or a cached `JavaScript/braindump.js`, which can make markdown nodes and board-preview SVGs appear broken only in that browser.
    - Current mitigation: hard reload or clear site data for `127.0.0.1:4173`; keep the runtime backward-compatible with legacy node fields.
    - Preserve regression coverage for stale local state with legacy `markdown.source` and `board-preview.file`.
    - Continue the broader plan in this order: finish GitHub recommendation/versioning flow, define the shared-entity model, then defer realtime collaboration until async GitHub/versioning and shared entities are stable.
  - Testing:
    - verify local-first editing still works without auth
    - verify recommendation/export flow opens the correct GitHub path
    - verify board identity and summary metadata are included
    - take screenshots of:
      - recommendation entry UI
      - GitHub handoff screen or prefilled issue/PR state
    - validate that the collaboration flow does not imply immediate publish or overwrite
  - Validation:
    - confirm GitHub works as a meaningful collaboration layer without becoming a hard dependency for core editing

- [ ] Define the shared-entity model for content reused across boards, markdown, and structured views.
  - Scope:
    - allow content reuse without forcing everything into one giant board file
    - support shared notes, media references, markdown references, and embed records
  - Testing:
    - create one entity referenced from more than one place
    - verify updates propagate to all intended render surfaces
    - take screenshots of:
      - same entity rendered in multiple contexts
      - updated entity reflected in another context
    - validate that local-only content and shared content are clearly distinguished
  - Validation:
    - confirm reuse is explicit and not based on hidden duplication

## later_priority

- [ ] Add realtime collaboration across boards, markdown, and structured data if the architecture can support it cleanly.
  - Scope:
    - aim for broad realtime coverage rather than boards only if practical
    - evaluate CRDT infrastructure and presence model
    - keep async GitHub flows and local-first behavior intact
  - Testing:
    - test two-session editing on representative content
    - verify conflict resolution or merge behavior
    - verify comments or presence if included in the first pass
    - collect proof artifacts such as:
      - screenshots from two active sessions
      - short screen recording or timestamped evidence if needed
    - validate that offline or delayed sync states do not corrupt content
  - Validation:
    - confirm realtime collaboration is additive and does not break the file-first model

- [ ] Evaluate whether the custom Cosmoboard runtime should remain primary or whether a framework-backed editor path is worth adopting later.
  - Scope:
    - compare the current custom runtime with options like `tldraw` only if the custom path becomes too expensive
    - avoid migration churn before the product model is stable
  - Testing:
    - compare representative capabilities and performance costs
    - capture notes and proof for the decision
  - Validation:
    - confirm any future runtime shift is justified by real product pressure, not novelty

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

## old_tasks

- [ ] Fix the image focus-view dismissal hit area on the existing site.
  - Current issue:
    - clicking the black area to the left or right of a smaller focused image does not always close the view
    - the active hit area seems larger than the visible image
  - Expected behavior:
    - clicking anywhere outside the visible image should exit the focus view
  - Reason this is here:
    - it is still unresolved
    - it is not part of the current highest-priority Cosmoboard implementation path
  - Testing when resumed:
    - open small and large images in the current site
    - click outside the visible image on all sides
    - test desktop and mobile/touch behavior
    - take screenshots of:
      - focused small image
      - clicked-outside dismissal behavior after the fix
    - validate that the visible image bounds match the interactive hit area


