# Anchor Links That Open a Canvas Node

## Problem / Why
Markdown footnotes and anchor links are the standard way to point at a precise spot in a document, but a `.canvas` has no equivalent. Today you can link to a board, but not to a specific node, edge, or region inside it. Authors end up writing instructions like "scroll to the box on the right with the red arrow," which is fragile and unfriendly to readers.

## Sketch
- Extend the existing markdown link grammar so `[label](board.canvas#node-<id>)` and `[label](board.canvas#region-<id>)` are recognized. Clicking the link opens the canvas with that node centered, briefly highlighted with a teal pulse, and selected.
- Add a "copy link to this node" action to the canvas node context menu. It writes `boardname.canvas#node-<id>` to clipboard, in the format that resolves correctly given the current file's relative path.
- Support reverse jumps. Each canvas node can carry an optional `backlinks` array, populated automatically when a markdown file links to it. Hovering the node shows a small list of inbound markdown locations.
- Footnote variant: `[^foo]` in markdown can resolve to a canvas node when the footnote body is a single canvas link. The footnote popup then renders a small preview of the target node, not just text.
- Persist last-used view (zoom, pan) per anchor visit so revisiting a footnote returns the reader to the same framing they left.

## Notes
- Precedent: Obsidian's block references `[[note#^block-id]]` and Logseq's block-level addressing. The novelty here is anchor targets pointing at spatial nodes.
- Code areas to touch: markdown link rewriter, canvas viewer's `loadBoard` entry path (accept hash fragment, scroll/zoom on first paint), context menu wiring on nodes.
- Open question: do region anchors require the user to draw a rectangle, or can we infer them from groups? Start with groups and individual nodes only, freehand regions can come later.
- Backlinks should be an index built at save time, not stored per node, so renames stay cheap.
