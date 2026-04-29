# content

## Purpose
Data the site reads at build time: boards, entities, projects, bookmarks, and app prototypes. No runnable code lives here.

## Read when
Working on site content, board data, entity definitions, project pages, or tracing what `scripts/build-site.mjs` consumes.

## Skip when
Fixing runtime behaviour, editing styles, or working on build infrastructure — go to `src/`, `JavaScript/`, `CSS/`, or `scripts/` instead.

## Canonical for
All data the site renders. If a fact appears in `content/` and nowhere else, `content/` is the truth.

## Key files
- `braindump-state.json` — persisted whiteboard state loaded by the Braindump runtime
- `base-data/items.json` — primary item registry read by the build to generate site pages
- `entities/index.json` — generated index of resolved entity references (boards → projects → registry)

## Conventions
- Subdirs map 1-to-1 with site sections; do not add flat files at `content/` root without a clear section reason.
- `boards/`, `entities/`, and `projects/` each have their own `AGENTS.md` (owned by other workers).
- Do not put source code or build scripts here; those belong in `src/` or `scripts/`.
- `braindump-state.json` is written by the running app, not by hand — do not edit it manually.

## Subdirectories
- `apps/` — app prototype assets (e.g. Excalidraw JSON)
- `base-data/` — core item registry (`items.json`) consumed by the build script
- `boards/` — `.canvas` board files and associated markdown notes, one subdir per board
- `cool-bookmarks/` — rendered HTML for the bookmarks section
- `entities/` — entity index JSON (generated; ties boards, projects, and registry together)
- `open-quests/` — rendered HTML for the open quests section
- `projects/` — rendered HTML for the projects section

## See also
- [../AGENTS.md](../AGENTS.md) — session workflow and root routing
- [../src/AGENTS.md](../src/AGENTS.md) — where code that reads this data lives
- [../scripts/README.md](../scripts/README.md) — build script that consumes `content/`
- [../.agents/project.md](../.agents/project.md) — canonical product facts and repo structure
- [boards/AGENTS.md](boards/AGENTS.md) — board-specific conventions (owned separately)
- [entities/AGENTS.md](entities/AGENTS.md) — entity conventions (owned separately)
- [projects/AGENTS.md](projects/AGENTS.md) — project conventions (owned separately)
