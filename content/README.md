# content/

Data the site reads at build time. Nothing here is runnable code. The build script (`scripts/build-site.mjs`) reads these files and emits static HTML and asset bundles.

## Subdirectories

| Directory | What lives there |
| --- | --- |
| `apps/` | App prototype assets (e.g. Excalidraw JSON) |
| `base-data/` | Core item registry (`items.json`) — primary input for the build |
| `boards/` | `.canvas` board files and associated markdown notes, one subdir per board |
| `cool-bookmarks/` | Rendered HTML for the bookmarks section |
| `entities/` | Entity index JSON tying boards, projects, and the source registry together |
| `open-quests/` | Rendered HTML for the open quests section |
| `projects/` | Rendered HTML for the projects section |

## braindump-state.json

Persisted whiteboard state. Written by the running Braindump app, not by hand. Checked into the repo so board state survives restarts.

## content/ vs src/

`content/` is canonical for the data the site renders. `src/` holds the code that reads it (entity definitions, registry, app source). If a fact about site content belongs anywhere, it belongs here, not in `src/`.

## See also

- [Root README](../README.md) — repo overview, quickstart, architecture diagram
- [AGENTS.md](AGENTS.md) — agent routing doc for this directory
- [../scripts/README.md](../scripts/README.md) — build and preview scripts that consume this data
