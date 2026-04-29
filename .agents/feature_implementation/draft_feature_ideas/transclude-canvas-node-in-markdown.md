# Transclude a Canvas Node Inside Markdown

## Problem / Why
Right now an entire `.canvas` can be embedded into a markdown page, but a single node cannot. Authors who want to quote one diagram, one sticky note, or one image from a larger board have to screenshot it or duplicate the content. That breaks the local-first promise that the source of truth lives in one place.

## Sketch
- Introduce `![[board.canvas#node-<id>]]` syntax for transclusion. The renderer fetches the node by id from the referenced board file and inlines just that node, bounded to its own width and height.
- Cache the resolved node payload in the markdown's render output, so the static-host build remains a flat artifact. On rebuild, transclusions refresh.
- Live edits propagate. Editing the source node in its home board updates every markdown page that transcludes it on next save. No copying, no drift.
- Support transcluding a group node, which inlines all of its children laid out in their relative positions, scaled to fit the markdown column.
- Add an unobtrusive "view in source board" link under each transclusion so the reader can jump to the node's home for context.

## Notes
- Precedent: Obsidian's `![[note#^block]]` for blocks, Roam's block embeds. The twist is transcluding spatial 2D nodes into a linear column.
- Code areas to touch: markdown image-embed parser (the `![[...]]` branch), canvas node lookup helper, a new render path for "single node as static block."
- Open question: how do we render a node that depends on canvas-only chrome (edges to other nodes)? Either drop the dangling edges or stub them as faint arrows pointing off-frame to keep the visual hint without leaking unrelated content.
- Bidirectionality: editing a transcluded node from inside the markdown view should be possible later, but MVP can be read-only with a clear "edit in source" handoff.
