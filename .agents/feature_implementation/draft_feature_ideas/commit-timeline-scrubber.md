# Commit Timeline Scrubber

## Problem / Why
A board's history in git is rich, but invisible. A scrubber that walks commit-by-commit through a board turns the repo log into a built-in time machine, which is useful for reviewing how a design landed, recovering deleted nodes, and giving talks or demos.

## Sketch
- Add a bottom-edge timeline strip with one tick per commit that touched the current canvas file. Hover a tick to see the commit message and author. Drag the playhead to render the board at that revision in place.
- Play and pause controls animate forward through commits, interpolating node positions where the same node id is present across two commits. Adds, deletes, and edits flash with a brief teal highlight as they appear.
- A "compare to playhead" toggle pins the current head state at low opacity behind the scrubbed state, so the user always knows how far from latest they are.
- Right click any tick for "open as scratch board" which materializes that historical state into a new branch-scoped scratch board so the user can resume from any past point without doing manual git acrobatics.
- Works on a static host by reading the file at each revision through the GitHub API. For local-first use, read directly from the working repo via the existing file loader.

## Notes
- Precedent: Figma version history, Are.na block edits, Tldraw history slider, Git Time Machine extensions.
- Performance: cache parsed canvases per commit in memory, lazy load on demand. For very long histories, group commits into eras and let the user expand an era to see ticks.
- Pairs with branch scratch boards and the PR diff view to form one coherent "history, branch, review" surface.
- Open question: how to represent merges visually on the strip. First pass uses a small fork glyph at the merge tick and lets the user choose which parent to scrub through.
