# src/

App and data-source layer for the portfolio site and Cosmoboard. Everything here is code or data that the build pipeline reads to produce the site — not content that lives on the site itself.

## Files at a glance

| File / Dir | Role |
| --- | --- |
| `registry.json` | Filesystem-first index mapping boards, notes, entities, apps, and embeds into named collections consumed by the build and preview server. |
| `site-data.mjs` | Site-wide constants: domain, navigation links, all page-level metadata (home, photography, open-quests, board pages, etc.). Imported directly by `scripts/build-site.mjs`. |
| `page-database.mjs` | Exports `pageDatabaseCollections`, `pageDatabaseItems`, and `featuredProjectIds` — the structured content driving the projects and things-I-do pages. |
| `notion-items.json` | Live Notion page items pulled from the Notion API; consumed by the build. Not committed with real data in public forks — see the `.example.json` counterpart. |
| `notion-items.example.json` | Sanitized example showing the shape of `notion-items.json`. Safe to commit. |
| `notion-projects.example.json` | Sanitized example for Notion project overrides (no live counterpart committed). |
| `notion-public-pages.json` | Live Notion public-page listing. |
| `notion-public-pages.example.json` | Sanitized example for `notion-public-pages.json`. |
| `apps/` | Per-app metadata JSON files (e.g. `excalidraw-proto.json`). One file per external app integration registered in `registry.json`. |
| `entities/` | Entity JSON files (e.g. `eurocrate-storage-system.json`). One file per entity registered in `registry.json`; the entity contract is documented in `entities/AGENTS.md`. |

## Boundary with `content/`

`src/` contains **code and data the site is built from** — configuration, schemas, and lightweight indexes.

`content/` contains **data the site reads at runtime or build time as content** — `.canvas` board files, project markdown, and entity output indexes.

A practical rule: if a file is imported as an ES module or parsed as an index by `build-site.mjs`, it belongs in `src/`. If a file is read as user-authored content (a board, a note, a project), it belongs in `content/`.

## Registry

`registry.json` is the central index. Add an entry there whenever you add a new board, entity, app, or note. The file is documented in detail in [AGENTS.md](AGENTS.md) under **Registry shape**.

## See also

- [Root README](../README.md) — repo overview, quickstart commands, architecture diagram
- [AGENTS.md](AGENTS.md) — agent routing, registry shape reference
- [entities/AGENTS.md](entities/AGENTS.md) — entity JSON contract
- [apps/AGENTS.md](apps/AGENTS.md) — app metadata conventions
