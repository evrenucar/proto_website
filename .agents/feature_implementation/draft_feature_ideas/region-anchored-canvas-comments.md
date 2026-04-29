# Region Anchored Canvas Comments

## Problem / Why
Reviewing a board today means dropping vague "see the top right cluster" notes into a PR comment. Comments need to stick to a specific node, edge, or rectangular region of the canvas so the conversation lands exactly where the work is.

## Sketch
- Store comment threads in a sibling file, for example `board.canvas.comments.json`, keyed by node id, edge id, or a normalized rect in canvas coordinates. Plain JSON so git diffs and merges stay sane.
- A comment pin renders as a small teal dot on the canvas. Hover expands to a thread bubble. Clicking opens the right rail thread with markdown body, author, timestamp, and resolved state.
- Selecting any region of empty canvas and hitting `c` creates a rect-anchored comment. Selecting a node and hitting `c` anchors to that node id and survives moves and resizes.
- Threads round-trip through GitHub via either a sidecar file in the same commit or a mapping into PR review comments where the position is encoded in a code block. Either path keeps it local-first and works on a static host.
- Filter and search across all open threads in a folder, with counts shown in the sidebar next to each board.

## Notes
- Precedent: Figma comments, Google Docs anchored comments, GitHub PR review comments at file ranges.
- Anchoring strategy: prefer stable node id, fall back to relative rect plus nearest-neighbor node hash so a comment can be re-snapped if a node was lightly edited.
- Rendering must stay readable at zoom-out. Cluster nearby pins into a single badge with a count when zoomed below a threshold.
- Resolved threads stay in the file but render at very low opacity, with a toggle to hide entirely.
