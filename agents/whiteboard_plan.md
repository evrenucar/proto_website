# Braindump Whiteboard Plan

## Goal

Create a new page called `braindump` that behaves like an infinite whiteboard.

The page should let the user add, place, and organize:

- text notes
- freehand drawings
- bookmark cards with image preview and link
- page cards with preview for internal site pages

## Constraints

- Keep the website lightweight and close to the current visual system.
- Fit the existing static build setup instead of introducing a large framework.
- Make the whiteboard useful on desktop first, while still working on mobile.
- Treat persistence as local-first unless a server-backed save flow is added later.

## Implementation Direction

### 1. Add a dedicated generated page

- Add a `braindump` page entry in `scripts/build-site.mjs`.
- Add page metadata and navigation data in `src/site-data.mjs`.
- Load a page-specific stylesheet and script so the whiteboard logic stays isolated from the rest of the site.

### 2. Build the whiteboard stage

- Create a large pan-and-zoom workspace instead of a normal document flow layout.
- Use a board viewport with a transform-based canvas layer for smooth panning and zooming.
- Add a subtle grid or dot background so placement feels intentional without looking heavy.
- Keep the whiteboard visually lighter than the rest of the site, but still compatible with the existing design language.

### 3. Define the board item model

- Use a shared item shape with `id`, `type`, `x`, `y`, `width`, `height`, `zIndex`, and `data`.
- Support four initial item types: `text`, `drawing`, `bookmark`, and `page`.
- Store board state as JSON in `localStorage` for the first version, but add a local dev server script (`scripts/dev-server.mjs`) to allow a "Save" button to overwrite `braindump-state.json` on disk. This enables committing the board state to the official website repo.
- Seed the board with a small starter dataset so the page does not open empty.

### 4. Add creation tools

- Add a compact floating toolbar for `Add text`, `Draw`, `Add bookmark`, and `Add page card`.
- Let the user paste images directly from the clipboard.
- Open a small editor panel or modal for item-specific fields instead of trying to inline-edit everything immediately.
- Let the user create bookmark cards by entering `title`, `url`, `description`, and `image`.
- Let the user create page cards by picking an internal page and optionally overriding preview text.

### 5. Support drawing

- Implement freehand drawing with pointer events and SVG paths or canvas strokes.
- Keep drawings as editable board items so they can be moved and layered like cards.
- Separate `pan` mode from `draw` mode to avoid gesture conflicts.

### 6. Support organizing

- Make all item types draggable.
- Add basic selection states, bring-to-front, send-back, and delete actions.
- Start with single-item selection.
- Only add resize handles if they are needed after the first working version.

### 7. Handle previews pragmatically

- For bookmark cards, use user-provided image URLs in the first version.
- Do not try to scrape remote metadata in the static front end.
- For internal page cards, generate preview data locally from `src/site-data.mjs` or a small derived JSON export during build.

### 8. Verification

- Verify desktop behavior first: pan, zoom, drag, draw, edit, reload persistence.
- Check mobile fallback behavior and ensure touch interactions do not break page navigation.
- Use Playwright for interaction checks once the whiteboard page exists.

## Suggested Build Order

1. Add the `braindump` page shell with whiteboard-specific assets.
2. Implement pan, zoom, and local persistence.
3. Add text notes.
4. Add drawing mode.
5. Add bookmark cards.
6. Add internal page cards.
7. Add organize actions and polish.

## Main Risks

- A truly infinite-feeling board can get slow if item rendering is not kept simple.
- Drawing and panning can conflict on touch devices.
- Automatic bookmark previews are not reliable without a backend or a build-time fetch step.

## Good MVP Boundary

The first usable version should include:

- pan and zoom
- persistent board state
- text notes
- freehand drawing
- bookmark cards with manual image input
- page cards backed by internal site data
- drag and simple layering

Anything beyond that, such as collaboration, scraping remote previews, or syncing across devices, should be treated as a later phase.
