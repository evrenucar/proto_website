# Nested Board Zoom Portal

## Problem / Why
Cosmoboard supports deep nesting of boards inside boards. Today, opening a child board feels like a navigation jump, which breaks the spatial mental model. Users lose context about where the child sits inside the parent, and back navigation is a step rather than a continuous motion.

## Sketch
- Treat every embedded child board as a live portal. Continuous zoom past a threshold smoothly enlarges the embed until it fills the viewport and becomes the active board.
- Zooming back out flies the user up to the parent with the same easing, landing with the child preview framed in view.
- A breadcrumb stack in the top left mirrors the filesystem path of the active board, and each crumb is clickable for an instant zoom to that level.
- Pinch, Ctrl scroll, and a keyboard chord like `Cmd =` and `Cmd -` all drive the same zoom transition so input modality does not matter.
- Preview-first stays the default. The portal only goes live and starts running scripts once the user crosses the engagement threshold, keeping idle pages cheap.

## Notes
- Inspired by Prezi style infinite zoom, but constrained to discrete board boundaries so the model stays comprehensible.
- Code touches a future canvas runtime plus the embed loader. Filesystem path resolution needs to follow the `.canvas` parent chain.
- Open question: how to preserve scroll position and selection state when zooming between levels.
