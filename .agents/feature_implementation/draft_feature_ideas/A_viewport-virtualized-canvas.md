# Viewport-Virtualized Big Canvas

## Problem / Why
A canvas with a few hundred nodes already drops frames during pan and zoom because every node is in the DOM and every connector recomputes on each transform. We want big boards to feel as light as small ones without rewriting the renderer.

## Sketch
- Compute each node's axis-aligned bounding box once on load and store it in a flat array. On every pan or zoom, run a quick AABB-vs-viewport test with a small overscan margin.
- Only mount nodes that pass the test. Unmount the rest, but keep their data in memory so re-mount on scroll-back is instant.
- For connectors, draw them on a single `<canvas>` layer that redraws on transform end, not on every frame. During the pan itself, apply a CSS transform to the whole layer for cheap motion.
- Add a small dev overlay that shows "rendered N of M nodes" so we can verify the win on real boards.
- Keep the data model untouched. This is a pure render-layer optimization, so the `.canvas` file format and round-trip stay identical.

## Notes
- tldraw and Excalidraw both virtualize this way. Their source is a good reference for the connector batching trick.
- Open question: text nodes with measured intrinsic size need their height before they can be culled. Cache the measured size on first mount and reuse it.
- Touches: canvas renderer, connector layer, and any selection or hit-test code that assumed every node is in the DOM.
