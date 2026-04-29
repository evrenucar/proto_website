# Heading-to-Group Round Trip

## Problem / Why
A markdown file's outline and a canvas's groups carry the same intent, the document's structure, but today they drift independently. Authors rewrite headings on one side and forget to reshuffle group boxes on the other. If a canvas group and a markdown H2 with the same title were treated as one logical entity, restructuring on either side would fan out automatically.

## Sketch
- Treat each H1/H2/H3 in a markdown file as a candidate group. Treat each canvas group node as a candidate heading. A stable id (slug plus short hash) lives in both, in markdown as `## Title {#id}` and on the canvas group as `linkedHeadingId`.
- On save of either side, run a small reconciler. Renaming a group renames its heading, reordering headings reorders groups along the canvas's primary axis (configurable, vertical by default), deleting either side prompts before deleting the other.
- Show a small "linked" chip on group nodes that have a markdown counterpart, click it to jump to the heading. Headings with a canvas counterpart get a teal margin marker in the markdown view, click to pan-zoom the group into view.
- New top-level groups created on the canvas append a heading at the end of the linked markdown file with empty body. New headings created in markdown spawn an empty group at the next free slot on the canvas.
- Conflict policy is last-writer-wins per side at file granularity, with a one-click "expand both versions side by side" affordance instead of a merge dialog.

## Notes
- Precedent: Logseq blocks have ids, Notion's database-of-pages flattens this concept, but neither preserves both a freeform spatial layout and a linear document. Cosmoboard can.
- Code areas to touch: canvas serializer, markdown front parser, a new `link/reconcile.mjs` that runs on save in both directions.
- Open question: do we sync heading body content into the group's child nodes, or only the heading title? Start with title only, body sync can be a later milestone.
- Stable id format should survive a heading retitle. A short random slug (six chars) generated once is safer than slugifying the title.
