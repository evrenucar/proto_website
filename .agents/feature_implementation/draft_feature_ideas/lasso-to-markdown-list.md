# Lasso to Markdown List

## Problem / Why
Multi select on a canvas usually ends with a transient selection that disappears on click. Users often want to capture "these six cards I just picked" as durable markdown so it can be linked, shared, or revisited. Lasso should produce a real artifact, not just an ephemeral state.

## Sketch
- Free draw lasso with the L key or middle mouse drag. Selected cards highlight in teal.
- After lasso, a small floating chip appears with three actions. Copy as markdown list, save as a new `.md` next to the board, or pin as a named selection in the sidebar.
- Markdown output respects the spatial reading order of the lasso path, so a clockwise loop produces a list that matches how the eye scanned the cards.
- Saved selections are first class. They show up in the left sidebar under the board, and reopening one re highlights those exact cards even after the canvas has been edited.
- If a card was deleted since the selection was saved, it appears as a struck through entry in the markdown with the original text preserved.

## Notes
- Builds on existing braindump multi card behavior in `JavaScript/braindump.js`.
- Precedent: Figma has named selections via plugins. tldraw has shape sets. Neither writes markdown.
- Open question: how to handle nested boards inside the lasso. Treat the whole child as one item, or recurse and produce a sublist.
