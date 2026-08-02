# scripts/

Node scripts that power the site build, local servers, and content utilities.

## Scripts

| Script | npm alias | What it does |
| --- | --- | --- |
| `build-site.mjs` | `npm run build` | Reads `src/site-data.mjs` and `content/`, emits the full static site |
| `cosmo.mjs` | `npm run cosmo` | CLI over the same board data the canvas uses: list boards, list and grep nodes, add a note, export a board. No server needed |
| `lib/board-store.mjs` | _(library)_ | Board path resolution, markdown filename sanitizer, stale-base write guard. Shared by `preview-server.mjs` and `cosmo.mjs` |
| `dev-server.mjs` | _(none; run directly)_ | Lightweight HTTP server on port 3000 with a board-save write API (`/api/save-board`) |
| `extract-assets.mjs` | `npm run extract-assets` | Walks `.canvas` files, extracts base64-encoded images, and writes them to the filesystem |
| `preview-server.mjs` | `npm run preview` | Production-like server for the built output; port defaults to 4174 (override with `PORT=`) |
| `sync-notion.mjs` | `npm run sync:notion` | Fetches Notion pages and writes `src/notion-items.json` |

## Quick reference

```sh
npm run build            # build static site
npm run preview          # preview built output at http://localhost:4174
npm run cosmo -- boards            # every board, with its node count
npm run cosmo -- nodes dev --json  # the dev board's nodes, machine-readable
npm run cosmo -- grep "toolbar"    # find nodes across every board
npm run extract-assets   # extract embedded images from canvas files
npm run sync:notion      # pull latest Notion content
```

## See also

- [Root README](../README.md) — quickstart and repo structure overview
- [scripts/AGENTS.md](./AGENTS.md) — agent routing and conventions for this directory
- [src/AGENTS.md](../src/AGENTS.md) — `src/site-data.mjs` and `src/page-database.mjs` are the main inputs to `build-site.mjs`
- [.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 4 doc convention
