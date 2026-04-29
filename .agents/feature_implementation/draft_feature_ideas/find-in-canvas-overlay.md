# Find In Canvas Overlay

## Problem / Why
A large canvas can have dozens of cards spread across a wide viewport. Browser Ctrl+F finds the DOM text but does not help you see where it is on the board, and it misses cards that are virtualized or off screen. A canvas aware find overlay would behave like find in a code editor, but spatial.

## Sketch
- Inside a canvas view, Ctrl+F opens a small find bar in the top right. Typing matches text on every card in that canvas, including off screen ones.
- Matched cards get a teal outline. The first match is centered in the viewport with a soft pan, not a hard jump.
- Enter and Shift+Enter cycle through matches. A counter shows `3 / 17`.
- Match count is computed from the canvas JSON, not the rendered DOM, so virtualization does not break it.
- Esc closes the overlay and clears outlines. State does not leak between canvases.

## Notes
- Scoped to the current canvas on purpose. Cross canvas search is the job of the full text search feature.
- Pan animation should be short (under 200ms) and skipped if the match is already on screen.
- Touches the canvas renderer and the camera/pan controller.
