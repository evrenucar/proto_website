# Extension seams

## Purpose

A one-page catalog of the surfaces where new functionality can be plugged into Cosmoboard. Covers the seams that exist today, their stability, and where in the codebase each one lives.

## Read when

Planning a new entity type, new canvas-item renderer, new toolbar command, or new keyboard / wheel route. Also read when deciding whether to add a new seam versus reusing an existing one.

## Skip when

Working on a specific bug, styling, or content task that does not add a new extensible surface.

## Canonical for

The definitive list of extension surfaces, their current status, and their code locations.

---

## Seams

### 1. New entity types — via `src/entities/`

**Status: in-flux**

An entity is a cross-surface, file-backed JSON object that can appear in a board, a project page, and structured views simultaneously. The entity JSON must declare `slug`, `type`, `title`, `summary`, `status`, `references`, and `tags`. Adding a new entity means dropping a `.json` file into `src/entities/` and adding a matching entry to `src/registry.json` under the `entities` array.

Today there is exactly one entity (`eurocrate-storage-system.json`). The contract is small and easy to freeze, but it has not been formally pinned — hence *in-flux*. Stage 6 of the refactoring plan calls for writing `src/entities/AGENTS.md` (required / optional fields, rendering hooks, lifecycle) and `src/entities/entity.schema.json` (JSON Schema draft 2020-12) to lock the contract.

Code pointers:
- `src/entities/eurocrate-storage-system.json` — the only current entity; use as the worked example
- `src/registry.json` (`entities` array) — the index the build pipeline and runtime consume
- `src/AGENTS.md` (to be written in Stage 6) — will document registry resolution rules

---

### 2. New canvas-item renderers — in `JavaScript/braindump.js`

**Status: in-flux**

Canvas items are rendered by `renderNode()` (line 5371 of `JavaScript/braindump.js`). The function branches on `nodeObj.type`. Current recognized types are `text`, `link`, `file`, `board-preview`, `markdown`, `base`, `app`, and `draw` (draw items are stored as `text` nodes whose content is an SVG string). Each type maps to a different DOM construction path and interaction setup inside `renderNode`.

Adding a new canvas-item type requires:
1. Registering the type string in `createNode()` (around line 3346) so it can be created at runtime.
2. Adding a render branch in `renderNode()`.
3. Optionally adding a preview branch in `getBoardPreviewVisualType()` (line 21) for the board-preview thumbnail renderer.

This seam is *in-flux* because `braindump.js` is a monolith. Stage 6 of the refactoring plan establishes a touch-driven modularization rule: whenever a subsystem is visited for any feature work, carve it into `src/apps/braindump/<subsystem>.mjs`. The renderer seam will stabilize once the node-rendering subsystem is carved out.

Code pointers:
- `JavaScript/braindump.js` `renderNode()` at line 5371 — main renderer entry point
- `JavaScript/braindump.js` `createNode()` around line 3346 — type registration
- `JavaScript/braindump.js` `getBoardPreviewVisualType()` at line 21 — thumbnail type dispatch
- `JavaScript/braindump.js` `getBoardPreviewNodeDimensions()` at line 33 — default size per type

---

### 3. New toolbar / sidebar commands

**Status: in-flux**

The toolbar is assembled from `[data-board-ui="toolbar"]` and `[data-board-ui="toolbar-actions"]` elements in the host HTML file (e.g. `braindump.html`, `cosmoboard.html`). Buttons carry a `data-tool` attribute that `setActiveTool()` reads. The overflow ("more") drawer lives in `[data-board-ui="toolbar-actions"]` and is toggled via `toolbarMoreButton`.

Adding a new toolbar command today means:
1. Adding a `<button data-tool="<name>">` element in the host HTML.
2. Handling the tool activation in `setActiveTool()` or in the click listener that dispatches to modal panels (recommendation, settings, export, etc.).
3. Optionally wiring a keyboard shortcut (see seam 4).

There is no programmatic toolbar registration API — the toolbar DOM is static and hand-authored per board host. This is *in-flux* because the modularization roadmap anticipates a dynamic toolbar registration surface once `braindump.js` is split into modules.

Code pointers:
- `JavaScript/braindump.js` `setActiveTool()` around line 2500 — tool activation dispatch
- `JavaScript/braindump.js` toolbar query at lines 285–303 — how the toolbar DOM is found at runtime
- `braindump.html`, `cosmoboard.html` — static toolbar HTML that must be extended manually today

---

### 4. New keyboard / wheel routes

**Status: stable (within the monolith)**

Keyboard routes are registered in two `window.addEventListener("keydown", …)` blocks. The first block (line 2450) handles global canvas shortcuts: Ctrl+S (save), Ctrl+Z/Shift+Z (undo/redo), Delete/Backspace (delete), and single-key tool switches (`p` draw, `t` text, `v` select, `l` bookmark, `x` markdown panel, Space pan). The second block (line 2873) handles the toolbar overflow drawer (Escape to close).

The wheel route is a single `viewport.addEventListener("wheel", …)` listener (line 2107) that calls `applyWheelZoom()`. YouTube embed shields re-use `applyWheelZoom()` directly to route iframe wheel events back to canvas zoom.

Adding a new keyboard route means inserting an `if (e.key === …)` branch in the existing keydown handler. Adding a new wheel route means either forking a second `wheel` listener or calling `applyWheelZoom()` from a custom overlay. There is no dispatch table or registry — routes are inline conditionals. The seam is *stable* in the sense that the pattern is consistent and well-understood, but it is not extensible via data or config: changes require editing `braindump.js` directly.

Code pointers:
- `JavaScript/braindump.js` global keydown handler at line 2450
- `JavaScript/braindump.js` toolbar-actions keydown handler at line 2873
- `JavaScript/braindump.js` `applyWheelZoom()` at line 2085 — shared zoom primitive
- `JavaScript/braindump.js` `viewport.addEventListener("wheel", …)` at line 2107

---

## See also

- [refactoring_plan.md](./refactoring_plan.md) — Stage 6 (lines 218–256) specifies the doc-first work of which this file is part
- `src/entities/AGENTS.md` — entity contract doc (to be written in Stage 6; will live at `src/entities/AGENTS.md`)
- `content/boards/CANVAS_FORMAT.md` — `.canvas` JSON format reference (to be written in Stage 6)
- [cosmoboard_implementation_plan.md](../whiteboard/cosmoboard_implementation_plan.md) — broader implementation roadmap for turning Braindump into a reusable engine
