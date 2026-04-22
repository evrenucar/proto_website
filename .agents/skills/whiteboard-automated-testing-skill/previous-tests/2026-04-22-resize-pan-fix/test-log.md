# Resize / Pan Regression Fix

Date: `2026-04-22`

Server:

- `http://127.0.0.1:3000/braindump.html`

Viewport / device profile:

- Desktop Playwright page at `1440x900`
- Synthetic touch events for the resize-handle mobile path

Likely cause:

- The resize handle could still receive interactions outside `select` mode.
- At the same time, the board-level pan handlers could also start on that same press path.
- That overlap meant resize and camera movement were both eligible, especially when an item stayed selected and the active tool had changed.
- Relevant event paths:
  - [JavaScript/braindump.js](C:/Users/evren/Documents/GitHub/proto_website/JavaScript/braindump.js:1527)
  - [JavaScript/braindump.js](C:/Users/evren/Documents/GitHub/proto_website/JavaScript/braindump.js:1552)
  - [JavaScript/braindump.js](C:/Users/evren/Documents/GitHub/proto_website/JavaScript/braindump.js:2283)
  - [JavaScript/braindump.js](C:/Users/evren/Documents/GitHub/proto_website/JavaScript/braindump.js:2327)
  - [CSS/braindump.css](C:/Users/evren/Documents/GitHub/proto_website/CSS/braindump.css:138)

Fix applied:

- Resize handles only display in `select` mode.
- Resize start now bails unless `activeTool === "select"`.
- Resize start explicitly cancels board pan state and pending touch selection state.
- Viewport and global pan handlers now ignore resize-handle targets.

Checks:

- `pass` Select-mode mouse resize
  - before: camera `0,0,1`, node `250x150`
  - after: camera `0,0,1`, node `310x190`
- `pass` Pan-mode handle collision
  - before: camera `0,0,1`, handle display `none`
  - after: camera `0,0,1`, node unchanged at `250x150`
- `pass` Touch resize
  - before: camera `0,0,1`, node `250x150`
  - after: camera `0,0,1`, node `310x190`
- `pass` Syntax check
  - `node --check JavaScript/braindump.js`

Artifacts:

- [select-resize-state.png](select-resize-state.png)
- [pan-mode-no-resize-handle.png](pan-mode-no-resize-handle.png)

Notes:

- This run used synthetic mouse and touch events against the live local board to isolate event routing.
- The fix is aimed at the actual overlap, not just the visual symptom.
