# Command Palette Spatial Jump

## Problem / Why
On a large board with many nested children, finding a specific card by panning is slow. Cosmoboard already has filesystem hierarchy and markdown text, so a keyboard driven palette can jump the camera straight to any card or board across the whole repo without leaving the canvas.

## Sketch
- Cmd K opens a palette that searches three indexes at once. Card titles, body markdown, and filesystem paths.
- Selecting a result animates a pan and zoom to that card, even if it lives inside a nested board several levels deep. The portal transition reuses the nested zoom animation.
- The palette also accepts spatial commands. "align selected left", "group", "send to back", "snap to structure", each mapped to the same keybinding it would have inline.
- Recent jumps form a back stack. Cmd `[` and Cmd `]` walk through the camera history like browser navigation.
- Static host friendly. Index is built at load from the `.canvas` and `.md` files in scope, no server needed.

## Notes
- Index size matters for local first. Lazy load child board indexes on first traversal, cache in memory.
- Precedent: VS Code command palette, Linear search, Obsidian quick switcher. None of those move a camera through nested canvases.
- Touches a new `palette/` module and the camera controller.
