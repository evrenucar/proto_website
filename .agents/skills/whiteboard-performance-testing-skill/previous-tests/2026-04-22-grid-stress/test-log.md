# Whiteboard Grid Stress Test

Date: `2026-04-22`

Server:

- `http://127.0.0.1:3000/braindump.html`

Viewport:

- Desktop Playwright page at `1440x900`

Stress board:

- `324` total nodes
- `108` text nodes
- `108` link nodes
- `108` drawing nodes
- layout profile: `18 x 18` synthetic board

Grid implementation:

- Confirmed `svg` pattern layer
- Source is not a bitmap image
- High-zoom softness should now be treated as transform antialiasing risk, not image upscaling risk

Performance result:

- `zoomSweep`
  - `frames: 240`
  - `avgFps: 60.0`
  - `minFps: 58.1`
  - `maxFps: 61.7`
  - `p95FrameMs: 16.9`
  - `droppedFramesOver20ms: 0`
- `panSweep`
  - `frames: 240`
  - `avgFps: 60.0`
  - `minFps: 59.2`
  - `maxFps: 61.0`
  - `p95FrameMs: 16.8`
  - `droppedFramesOver20ms: 0`

High-zoom capture:

- [grid-max-zoom.png](grid-max-zoom.png)
- camera transform at capture: `translate(-1800px, -1200px) scale(4.8)`

Smoke re-checks after the text and mobile-toolbar fixes:

- Desktop text tool:
  - background click created one text node
  - editor entered `contenteditable="true"` immediately
  - focused element was `.bd-text-editor`
  - typing succeeded in the new note
- Mobile emulation:
  - media query matched `pointer: coarse` and `hover: none`
  - toolbar shell insets measured `12px` left, `12px` right, `12px` bottom
  - touch tap created a text node and focused `.bd-text-editor`

Notes:

- The original `mousedown` placement path caused the new text editor to blur before typing began. Placement now occurs on the completed desktop click path, so focus persists.
- The performance harness filters invalid warm-up frame deltas before calculating FPS so the archived numbers stay stable.
