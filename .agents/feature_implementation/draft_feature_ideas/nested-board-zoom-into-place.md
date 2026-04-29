# Nested Board Zoom Into Place

## Problem / Why
A board embedded inside another board is currently a static preview. Clicking it should not feel like a hard page navigation, since the user has spatial context in the parent. A smooth zoom-into-place transition that promotes the child to fill the viewport, while keeping the parent shell available, lets nested exploration stay continuous and reversible.

## Sketch
- Click on an embedded board. The viewport animates a transform that scales and pans so the child board's bounds match the viewport, then swaps the preview render for a live editable render at the end of the animation.
- During the zoom, the parent stays visible at the edges as a faded frame, and the breadcrumb spine grows a new segment for the child. Pressing Escape or clicking the faded frame zooms back out, restoring scroll and selection state in the parent.
- Zoom can chain. Zooming into a grandchild stacks two faded frames at the edges, like a recursion stack. A small numeric badge in the corner shows how many levels deep the user is.
- Holding Cmd or Ctrl on the click skips the zoom and opens the child in a new tab instead, matching the open-modes convention used elsewhere.
- The animation respects "reduce motion" by fading instead of zooming, and preview-first embeds keep their static render until the user actually zooms in.

## Notes
- Precedent: Prezi zoom, Apple iOS launcher folder open, tldraw frame focus. None of them are tied to filesystem-backed boards, which is the new piece here.
- Code areas: the canvas renderer transform, the embed component, and the same routing that supports the breadcrumb spine.
- Open question: how deep is too deep. Probably a soft cap at five levels with a "the rest are linked, not zoomed" message.
