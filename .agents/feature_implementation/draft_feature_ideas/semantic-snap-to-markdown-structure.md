# Semantic Snap to Markdown Structure

## Problem / Why
Most canvas tools snap to pixel grids or geometric guides. In Cosmoboard, the underlying content is markdown, so a card's heading level, list depth, or sibling order in the source file is more meaningful than its pixel position. Snap should respect that structure so visual layout stays in sync with markdown semantics.

## Sketch
- When dragging a card near another card whose markdown has a related heading or list parent, show a teal guide labeled with the relationship, like "child of ## Roadmap" or "sibling of - Idea 2".
- Snap thresholds derive vertical rhythm from heading levels. H1 cards align to a wider column, H3 cards indent inward, mirroring the markdown outline.
- Holding Shift while dragging snaps strictly to geometry. Default drag prefers semantic snap, then geometry as a fallback.
- A small toggle in the canvas chrome lets the user switch the active "snap lens" between Structure, Grid, and Free.
- When two cards snap into a parent and child relationship, the `.canvas` file records the link so the markdown export can reorder sections to match.

## Notes
- Touches `.canvas` parser and any board renderer that handles drag end. Likely a new `snap/semantic.js` module.
- Precedent: Obsidian Canvas links are manual. Figma auto layout is geometric. This is a hybrid that treats markdown headings as the layout grammar.
- Open question: how to visualize a semantic snap that disagrees with what the user clearly wants geometrically. Maybe a one-tap "ignore structure here" badge.
