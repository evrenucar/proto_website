# scripts/

Node scripts that power the site build, local servers, and content utilities.

## Scripts

| Script | npm alias | What it does |
| --- | --- | --- |
| `build-site.mjs` | `npm run build` | Reads `src/site-data.mjs` and `content/`, emits the full static site |
| `dev-server.mjs` | _(none; run directly)_ | Lightweight HTTP server on port 3000 with a board-save write API (`/api/save-board`) |
| `extract-assets.mjs` | `npm run extract-assets` | Walks `.canvas` files, extracts base64-encoded images, and writes them to the filesystem |
| `preview-server.mjs` | `npm run preview` | Production-like server for the built output; port defaults to 4173 (override with `PORT=`) |
| `sync-notion.mjs` | `npm run sync:notion` | Fetches Notion pages and writes `src/notion-items.json` |

## Quick reference

```sh
npm run build            # build static site
npm run preview          # preview built output at http://localhost:4173
npm run extract-assets   # extract embedded images from canvas files
npm run sync:notion      # pull latest Notion content
```

## See also

- [Root README](../README.md) — quickstart and repo structure overview
- [scripts/AGENTS.md](./AGENTS.md) — agent routing and conventions for this directory
- [src/AGENTS.md](../src/AGENTS.md) — `src/site-data.mjs` and `src/page-database.mjs` are the main inputs to `build-site.mjs`
- [.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 4 doc convention
