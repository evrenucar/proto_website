# Desktop Braindump Testing

## Scope

Use this checklist for the final desktop smoke pass when Braindump changes affect pointer, keyboard, layout, persistence, or browser-specific behavior on desktop and laptop environments.

## Default Minimal Final Pass

Run only the smallest subset that proves the implemented change works:

- load the page and confirm the board mounts
- check the changed interaction or visual behavior directly
- scan for obvious console or layout regressions
- take one screenshot only if the result is user-visible or disputed

Only expand into the full checklist when the change is broad, risky, or explicitly requests deeper regression coverage.

## Environment

- Server
  - Prefer `http://127.0.0.1:4173/braindump.html` from `scripts/preview-server.mjs` for read-only checks.
  - Use `http://127.0.0.1:3000/braindump.html` from `scripts/dev-server.mjs` only when `Save` must be verified.
- Viewports
  - Primary: `1440x960`
  - Secondary: `1280x800`
  - Optional narrow desktop regression pass: `1024x768`
- Browser MCP
  - `mcp__playwright__.browser_run_code`
  - `mcp__playwright__.browser_resize`
  - `mcp__playwright__.browser_console_messages`
  - `mcp__playwright__.browser_network_requests`
- Reset state before the run
  - Replace both Braindump localStorage keys with a known empty board or small fixture.

## Screenshot Guidance

- No screenshot is required for every run.
- Prefer a single screenshot of the changed flow when it helps prove the result.
- Add more screenshots only for visible failures, layout issues, or multi-step regressions.

## Interaction Checklist

Use only the sections touched by the change. The rest are reference coverage, not default required steps.

### 1. Load, shell, and layout

- Confirm the board fills the viewport edge to edge.
- Confirm the old right-side gray scrollbar strip does not reappear on Braindump.
- Confirm the bottom toolbar is fully visible and centered.
- Confirm the left navigation and whiteboard canvas do not overlap in a broken way.
- Confirm the dot-grid background still tracks pan and zoom.

### 2. Tool selection and keyboard shortcuts

- Click each toolbar button and confirm active state styling changes correctly.
- Verify:
  - `V` selects `select`
  - `P` selects `draw`
  - `T` selects `text`
  - `L` selects `bookmark`
  - `Space` temporarily switches to `pan`
- Verify `Space` returns to the previous tool after keyup.
- Verify the cursor restores correctly after temporary panning, especially when returning to `draw`.

### 3. Pan and zoom

- In `pan` mode, drag on empty space and confirm the board pans.
- In `pan` mode, drag over an item and confirm the item does not move.
- Middle-click drag and right-click drag should pan as well.
- Right-click should not open the native context menu over the whiteboard.
- Mouse wheel zoom should stay anchored near the pointer location.
- If a Windows precision touchpad is available manually, verify pinch zoom speed still feels much faster than browser-default pinch behavior.

### 4. Selection, drag, and resize

- Single-click a text node and confirm the selection outline appears.
- Drag-select multiple items and confirm all collided items become selected.
- Select a drawing node and confirm the drawing bounding box is visible and not oversized.
- Drag selected text, image, and bookmark nodes and confirm the node moves rather than nested content misbehaving.
- Select an item and confirm the resize handle appears.
- Resize:
  - text nodes freely
  - image nodes while preserving aspect ratio

### 5. Text node behavior

- With the `text` tool active, click empty space and confirm an empty text box is created immediately.
- Double-click an existing text node and confirm edit mode starts.
- Blur the editor and confirm text persists.
- Click once inside a non-editing text node and confirm selection and drag still work.

### 6. Drawing behavior

- In `draw` mode, drag to create a stroke and confirm the live stroke stays visible while drawing.
- Confirm the finished drawing becomes a selectable drawing node.
- Confirm the drawing remains above other content while it is being created.
- Confirm the draw cursor scales with zoom closely enough to match stroke thickness.

### 7. Bookmark, link, and preview behavior

- Paste a normal URL and confirm a bookmark card is created.
- Paste a YouTube URL and confirm title or thumbnail fallback behavior still works.
- Confirm bookmark drag moves the card itself rather than starting native link or image drag behavior.
- Confirm preview failures degrade gracefully without broken layout.

### 8. Clipboard and file flows

- Paste plain text and confirm a text node is created.
- Copy and paste selected whiteboard nodes and confirm duplicates appear with new IDs.
- Paste an image from the clipboard and confirm an image node is created.
- Export `.canvas` and confirm Chrome still downloads the file correctly.
- Import `.canvas`, `.canvas.json`, and `.json` and confirm the board loads.

### 9. Persistence, save, and recommendation flow

- Reload after creating local test nodes and confirm localStorage restores the board.
- On preview server, clicking `Save` should fall back to the local-only toast.
- On dev server, only verify `Save` if it is safe to write test data to `content/boards/braindump/current.canvas`.
- Open the recommendation panel and verify:
  - summary field opens and focuses
  - summary is trimmed and capped at 50 characters
  - the modal opens with the GitHub instructions if the flow is submitted

### 10. Visual fidelity and stress checks

- Zoom in and out around text and images and confirm they do not become unexpectedly blurry at ordinary working zoom levels.
- Try a deeper zoom stress pass and log any cursor, text, or transform distortions.
- Create several strokes quickly and confirm the page does not hitch immediately.

### 11. Console and network review

- Confirm there are no unexpected console errors after the run.
- If bookmark previews are involved, review network failures separately so Microlink or YouTube issues are not confused with layout bugs.

## Issue-Log Regression Focus

Re-run these whenever related code changes:

- `whiteboard scrollbar gap`
- `pan mode dragging items`
- `drawing selection bounding boxes`
- `right click pans without context menu`
- `Windows pinch zoom speed`
- `draw cursor restoration after panning`
- `drawing layer jumps after pointerup`
- `Chrome export`
- `text tool creates empty note`
- `zoom blur on text and images`
- `image drag hijacking node drag`
- `pen pointer scaling`
