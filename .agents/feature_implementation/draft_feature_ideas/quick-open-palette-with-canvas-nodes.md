# Quick Open Palette With Canvas Nodes

## Problem / Why
Right now, jumping to a file means walking the sidebar tree, and jumping to a specific card inside a `.canvas` is not possible at all. A single fuzzy palette that opens both files and individual canvas nodes would make the filesystem feel one keystroke deep.

## Sketch
- Bind Ctrl+P (and Cmd+P) to a palette that lists every markdown file, every `.canvas` file, and every node inside those canvases as flat entries.
- Each entry shows path plus a small badge: `md`, `canvas`, or `node`. Node entries show the parent canvas name.
- Use a small fuzzy matcher (subsequence with bonus for word starts) so typing `intr cos` finds `intro/cosmoboard.md`.
- Selecting a node entry opens the parent canvas and scrolls/zooms to that node, then briefly highlights it.
- Index is built once on load from the same data the sidebar already uses, kept in memory only. No service worker, no DB.

## Notes
- Precedent: Obsidian quick switcher, VSCode Ctrl+P, Sublime goto-anywhere. Difference here is canvas nodes are first class, not just files.
- Node id is needed in the URL hash so deep links survive reloads (e.g. `#node=abc123`).
- Touches the canvas renderer (scroll-to-node) and whatever currently builds the sidebar tree.
