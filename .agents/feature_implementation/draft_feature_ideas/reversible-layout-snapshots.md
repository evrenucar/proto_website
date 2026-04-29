# Reversible Layout Snapshots

## Problem / Why
Rearranging a dense board is risky. Users hesitate to try a new layout because undo history is lossy across sessions and a single misclick can scramble hours of careful placement. A first class snapshot primitive makes layout exploration cheap and reversible, which is critical for a thinking tool.

## Sketch
- A keybind like Cmd Shift S captures the current positions, sizes, z order, and groupings of every card on the active board into a named snapshot. Stored as a small JSON sidecar next to the `.canvas` file.
- The snapshot panel shows thumbnails. Hovering a snapshot ghost previews that layout on the live board. Clicking restores it with a smooth tween so the user can see what moved.
- Snapshots are diff friendly. The sidecar only stores deltas from the base `.canvas`, so git history stays clean and merges are tractable.
- A "branch from here" action duplicates the current board into a new file with the snapshot applied, useful for trying a redesign without touching the original.
- Auto snapshot on big destructive actions like delete many, paste many, or auto layout, with a quiet toast that says "snapshot taken, undo with Z".

## Notes
- Files written go into the same folder as the board, keeping filesystem as the hierarchy.
- Precedent: Figma version history is server side. tldraw has page level history. Neither is git friendly or local first.
- Open question: snapshot retention policy. Cap by count, by age, or let the user pin favorites and prune the rest.
