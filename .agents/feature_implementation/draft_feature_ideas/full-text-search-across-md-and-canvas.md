# Full Text Search Across Markdown And Canvas

## Problem / Why
There is no way to grep across the site. If a phrase lives inside a canvas card or a deeply nested note, it is effectively lost. A static-host friendly full text search would make every word in the vault findable.

## Sketch
- At build time, walk the content tree and emit a single `search-index.json` containing `{path, kind, nodeId?, title, body}` records. Markdown files contribute one record. Canvas files contribute one record per text node plus one for the file title.
- Ship a tiny client search using MiniSearch or a hand rolled inverted index (tens of KB). Load it lazily the first time the search UI opens.
- Results panel groups by file and shows a snippet with the matched term highlighted. Clicking jumps to the file, and for canvas hits, scrolls to that node.
- Support quoted phrases and `kind:canvas` or `path:notes/` style filters. Keep the parser deliberately small.
- Index regenerates whenever content changes during dev and is committed alongside the static build.

## Notes
- Stays local-first and static-host compatible. No server.
- Canvas embeds and frozen unfurls should be skipped or marked so we do not double count text from a referenced board.
- Index size is the main risk. Cap snippet length and drop stopwords if it grows past a few hundred KB.
