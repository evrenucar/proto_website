# Machine-readability benchmark for boards, canvases, and markdown

Written 2026-07-30. "Machine readable" gets a concrete meaning here, and a score that can be
watched over time. The benchmark is runnable: `node tests/benchmarks/machine-readability.mjs`
prints a per-board table and a total score. It never fails a build; it measures.

## What machine-readable means here, five properties

1. **Parseable**: every `.canvas` in the registry is valid JSON with a `nodes` array; every
   registered `.md` reads as UTF-8 text.
2. **Identifiable**: canvases carry a `canvasId`; every node has a unique `id` and a known
   `type`; markdown nodes carry `markdownId`.
3. **Addressable**: every file a node references (`file`, `href`, `boardSource`) resolves to a
   real file in the repo, no dangling pointers.
4. **Textual**: markdown sidecars start with a heading; text nodes carry non-empty text; link
   nodes carry a `title`, so an agent reading the data sees words, not blanks.
5. **Indexed**: the registry knows every board and note that exists on disk, and everything the
   registry lists exists. An agent starting from `src/registry.json` can reach all content.

## Why these five

An agent (or any tool) working a board needs to load it (1), refer to things in it stably (2),
follow references without 404s (3), read meaning without rendering pixels (4), and discover
content without crawling HTML (5). Together they make the file tree the API. This is also the
groundwork the GitHub-sync and operation-level-write plans build on: ops address node ids, sync
addresses files, both need 2 and 3 to hold.

## Current known gaps the benchmark will show

- Draw strokes are SVG blobs inside text nodes: renderable, not meaningful. Acceptable; scored
  but not weighted heavily.
- Some legacy nodes lack titles. Cheap to fix opportunistically.
- Asset nodes referencing `idb:` or `blob:` refs are browser-local by design; the benchmark
  counts them separately rather than as broken.

## How to move the score

Fix dangling references first (property 3 failures are real bugs), then backfill titles and
markdown headings. New features should keep 2 and 3 at 100 by construction: ids on creation,
files written before references to them.
