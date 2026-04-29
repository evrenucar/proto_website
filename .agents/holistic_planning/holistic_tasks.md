# Holistic Tasks

## Purpose
Active work, review queue, and next-up items for the Cosmoboard implementation.

## Read when
Following up on current implementation, checking what is in review, or picking up next work.

## Skip when
Looking for product strategy, architecture, backlog, or completed task history.

## Canonical for
Active work state, review queue, next-up items, blockers.

---

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
- After the user reviews an `[A]` task, it can be moved to `archive/holistic_tasks_archive.md`.

## active_work

- [A] Define the shared-entity model for content reused across boards, markdown, and structured views.
  - Scope:
    - allow content reuse without forcing everything into one giant board file
    - support shared notes, media references, markdown references, and embed records
    - first slice: file-backed entity records, generated entity index, entity board node, and base-data reference
  - Proof:
    - `src/entities/eurocrate-storage-system.json` defines the first file-backed shared entity record.
    - `src/registry.json` now has an `entities` collection entry for `eurocrate-storage-system`.
    - `scripts/build-site.mjs` validates `entities`, generates `content/entities/index.json`, and links matching `projectSlug` rows into `content/base-data/items.json` with `entityRef` and `entityTitle`.
    - `content/boards/cosmoboard/current.canvas` includes an `entity` node pointing to `content/entities/index.json` and `entityRef=eurocrate-storage-system`.
    - `JavaScript/braindump.js` supports `entity` nodes with a rendered card, explicit reference chips, tags, loading, empty, not-found, and error states.
    - `CSS/braindump.css` includes the `.bd-layer-entity` / `.bd-entity-*` styles.
    - `tests/features/shared-entity-build.test.mjs` verifies registry, generated entity index, base-data references, and the Cosmoboard entity node.
    - `tests/features/shared-entity-runtime-e2e.test.mjs` verifies the same entity rendered in the board card and projects base table.
    - Screenshot proof: `.tmp/shared-entity-e2e/cosmoboard-shared-entity.png`.
  - Validation:
    - confirm reuse is explicit and not based on hidden duplication
    - run build-based checks sequentially because they share the generated `content/boards` workspace during preserve/restore

## review_queue

- [A] Support multiple boards per page and nested board/embed containers.
  - Proof:
    - `mountCosmoboard(hostElement)` factory in `JavaScript/braindump.js` — each instance has isolated state
    - `_activeBoardViewport` tracks pointer ownership across instances
    - `_mountedBoardCount` gates keyboard shortcut disambiguation
    - auto-discovery: `document.querySelectorAll('[data-board-app=\"true\"]').forEach(mountCosmoboard)`
    - `board-preview` node type fully implemented and rendering in cosmoboard
    - embedded `data-board-mode=\"preview\"` mode implemented
    - `renderDetailPage` in `scripts/build-site.mjs` now optionally renders `renderEmbeddedBoardPreview`
    - starter canvas created for the eurocrate project board with 7 spatial nodes
    - verified live at `http://127.0.0.1:4173/cosmoboard.html` and project detail pages

- [A] Add markdown-to-canvas and canvas-to-markdown embedding and reference flows.
  - Proof:
    - `markdown` node type added to the Cosmoboard runtime
    - `renderMarkdownNode` fetches `.md` file, parses with inline renderer, renders as HTML
    - `parseMarkdownToHtml(md)` handles fenced code blocks, hr, headings, blockquotes, lists, paragraphs
    - Cosmoboard canvas updated with a `markdown` node pointing to `direction.md`
    - Critical bug fixed: `legacyStorageKey`/`legacySourcePath` checks
  - Remaining:
    - canvas-to-markdown export
    - md-to-board navigation not yet wired
    - markdown node is currently read-only

- [A] Create the filesystem-first content registry for boards, markdown files, bases, assets, and embeds.
  - Proof:
    - `content/registry.json` with version=1 schema
    - 3 boards, 1 note registered
    - `scripts/build-site.mjs` reads and validates at build time
    - Registry is additive alongside existing `site-data.mjs` and `notion-items.json`

- [A] Add dual portable import and export flows for `.canvas` (Git-friendly vs Bundle).
  - See `.agents/handoffs/handoff_export_bundling.md` for full proof and implementation details.

- [A] Add GitHub recommendation and versioning flows as the main near-term collaboration surface.
  - See `.agents/handoffs/handoff_export_bundling.md` for full proof and implementation details.

## next_up

(No items currently — pick from `holistic_backlog.md` when active work clears.)
