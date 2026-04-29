# Transclude Board Region By Anchor

## Problem / Why
Boards inside boards is already on the roadmap, but most of the time you do not want to embed an entire `.canvas` file, you want one labeled cluster from it. Roam and LogSeq nailed block-level transclusion for text. Canvases need the same idea so a single source region can appear on many pages without copy-paste drift.

## Sketch
- Let the user mark any group, frame, or named selection in a `.canvas` as a transclusion anchor with a stable id stored in the file. Anchors show up in the sidebar of that board.
- Embed syntax in markdown like `![[design-notes.canvas#cluster-auth-flow]]` and a canvas node type that points at the same anchor. Both render a live preview-first view of just that region, cropped to its bounding box.
- Edits to the anchor source propagate everywhere on next render. Edits attempted inside the embed open the source file at that anchor with a clear "you are editing the source" banner.
- Anchors travel with the file. If a user renames or deletes an anchor, every embed shows a soft-broken state with a "pick a replacement" picker rather than disappearing.
- Nesting works. Embedding a region that itself contains an embed renders both, with a configurable max depth to keep things sane.

## Notes
- Precedents: Roam block refs, LogSeq embeds, Obsidian `![[note#heading]]`, Are.na "connect to channel". The new piece is a 2D bounding-box anchor, not a linear block.
- Touches: `.canvas` schema (anchor list), canvas renderer (region clip), markdown link resolver, and the file-watcher that triggers re-render on source change.
- Open question: should the embed re-flow when the source region grows, or stay clipped to original bounds with an overflow indicator.
