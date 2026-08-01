# scripts

## Purpose
Node ESM scripts that drive the build pipeline, local development servers, and content utilities.

## Read when
Changing how the site is built, modifying server behaviour, debugging build output, or adding a new script.

## Skip when
Editing product UI (HTML/CSS/JS), updating content, or doing test work unrelated to the build.

## Canonical for
What each script does, how to invoke it, and which `npm run` alias maps to which file.

## Key files
- `build-site.mjs` — reads `src/site-data.mjs` + `content/` and emits the static site
- `cosmo.mjs` — CLI over board data: list boards, list and grep nodes, add a note, export a board
- `lib/board-store.mjs` — the one implementation of board path resolution, the markdown
  filename sanitizer, and the stale-base write guard. `preview-server.mjs` and `cosmo.mjs`
  both import it. Do not copy these rules into a third place; the sanitizer has drifted once
  already and renamed files on disk out from under the board.
- `dev-server.mjs` — lightweight dev server (port 3000) with board-save write API
- `extract-assets.mjs` — extracts base64 images embedded in `.canvas` files to the filesystem
- `preview-server.mjs` — production-like server for the built output (port 4174 by default)
- `sync-notion.mjs` — fetches Notion pages and writes `src/notion-items.json`

## Conventions
- All scripts are ESM (`import`/`export`), no CommonJS.
- New utility scripts go here; one-off diagnostics go in `.archive/diag/` instead.
- Do not import from `scripts/` within `src/`; the dependency flows one way: scripts -> src.
- Mirror any new script with an `npm run` alias in the root `package.json`.

## See also
- [../AGENTS.md](../AGENTS.md)
- [../src/AGENTS.md](../src/AGENTS.md) — `src/site-data.mjs` and `src/page-database.mjs` are the primary inputs to `build-site.mjs`
- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 4 per-directory doc convention
