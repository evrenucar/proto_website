# Canvas Pinch Zoom and Two Finger Pan

## Problem / Why
On phones and tablets the canvas currently only responds to mouse style input, so users cannot navigate large boards naturally. Pinch to zoom and two finger pan are the baseline gestures every user already knows from maps and photos, and a canvas without them feels broken on touch.

## Sketch
- Use Pointer Events with `touch-action: none` on the canvas container so the browser does not steal gestures, while leaving page scroll intact outside the canvas.
- Track active pointers in a small map. With one pointer down, behave as today. With two pointers, compute the midpoint and the distance, then map deltas to pan and scale around the midpoint.
- Keep zoom math in a single transform applied to the canvas layer so pinch, wheel zoom, and programmatic zoom share one code path and stay consistent.
- Clamp zoom to a sensible range, snap near 1.0 so a pinch gesture lands cleanly back at 100 percent, and inertially decay pan after the fingers lift.
- Respect `prefers-reduced-motion` for the inertia tail, and expose a small floating zoom indicator that fades after a beat.

## Notes
- Precedents: tldraw, Excalidraw, Figma mobile, Apple Maps gesture feel.
- Code areas to touch: whatever module owns canvas viewport transform and pointer handling. Avoid layering a gesture library, this is small enough to keep dependency free.
- Open question: should single finger drag pan when the user is not on a node, or only with two fingers. Two finger only is safer for accidental scrolling but less discoverable.
