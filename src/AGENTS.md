# src/

## Purpose
App and data-source layer: site-wide configuration (`site-data.mjs`, `page-database.mjs`), the content registry (`registry.json`), Notion integration data, entity definitions, and app metadata.

## Read when
- Modifying or adding site configuration, navigation, or page data.
- Adding a new board, entity, app, note, or embed to the registry.
- Diagnosing build warnings about missing or unresolvable registry entries.
- Understanding what data the build pipeline consumes.

## Skip when
Doing pure front-end work in `JavaScript/`, `CSS/`, or HTML; working in `content/` boards or projects with no registry change needed.

## Canonical for
- Registry shape and entry fields (`registry.json`).
- Site-wide constants: domain, navigation, page metadata (`site-data.mjs`).
- Page-database collections and item data (`page-database.mjs`).

## Key files
- `registry.json` — filesystem-first content registry; maps files into named collections consumed by the build and preview server.
- `site-data.mjs` — exports site constants, navigation, page-level data, board page configs.
- `page-database.mjs` — exports `pageDatabaseCollections`, `pageDatabaseItems`, `featuredProjectIds`.
- `notion-items.json` / `notion-items.example.json` — Notion page items (real data + sanitized example).
- `notion-projects.example.json` — Notion project overrides example.
- `notion-public-pages.json` / `notion-public-pages.example.json` — Notion public page listing.
- `apps/` — per-app metadata files (e.g. `excalidraw-proto.json`); sibling worker owns `apps/AGENTS.md`.
- `entities/` — entity JSON files (e.g. `eurocrate-storage-system.json`); sibling worker owns `entities/AGENTS.md`.

## Registry shape

`registry.json` is a flat JSON object with a `version` integer and six typed arrays. The build reads it via `scripts/build-site.mjs`; the preview server reads it at request time via `scripts/preview-server.mjs`; `tests/shared-entity-build.test.mjs` validates entries post-build. The file is never imported as a module — always read with `JSON.parse(readFile(...))`.

### Top-level fields

| Field | Type | Description |
| --- | --- | --- |
| `version` | integer | Schema version; currently `1`. Increment when the shape changes. |
| `comment` | string | Human-readable doc string; ignored by code. |
| `boards` | array | Canvas-based board entries. |
| `notes` | array | Standalone markdown notes. |
| `assets` | array | Binary or static asset entries (currently empty). |
| `entities` | array | Shared project/content entity entries. |
| `apps` | array | External app integration entries. |
| `embeds` | array | Embed descriptors (currently empty). |

### Entry fields by collection

**boards** — fields consumed by `preview-server.mjs` (`resolveBoardSavePath`) and `build-site.mjs`:

| Field | Required | Description |
| --- | --- | --- |
| `slug` | yes | URL-safe identifier; matched by slug in preview-server board save routing. |
| `title` | yes | Display name. |
| `file` | yes | Output HTML path (relative to repo root). |
| `sourcePath` | yes | `.canvas` source file path (relative to repo root); used by build and save API. |
| `storageKey` | yes | LocalStorage key for the board state. |
| `legacySourcePath` | no | Previous `.canvas` path; preserved during migration. |
| `legacyStorageKey` | no | Previous LocalStorage key; preserved during migration. |
| `description` | no | Human-readable summary. |
| `tags` | no | String array; e.g. `["primary", "onboarding"]`. |
| `projectSlug` | no | Links board to a project entry; used by entity cross-referencing. |

**notes**:

| Field | Required | Description |
| --- | --- | --- |
| `slug` | yes | URL-safe identifier. |
| `title` | yes | Display name. |
| `file` | yes | Path to the markdown file (relative to repo root). |
| `description` | no | Human-readable summary. |
| `tags` | no | String array. |

**entities**:

| Field | Required | Description |
| --- | --- | --- |
| `slug` | yes | Unique identifier; matched in `buildEntityIndex` and test assertions. |
| `title` | yes | Display name; copied verbatim into `content/entities/index.json`. |
| `type` | yes | Entity kind, e.g. `"project"`. |
| `sourcePath` | yes | Path to the entity JSON file (`src/entities/<slug>.json`). |
| `projectSlug` | no | Links entity to a project; enables cross-referencing in the entity index. |
| `description` | no | Human-readable summary. |
| `tags` | no | String array. |

**apps**:

| Field | Required | Description |
| --- | --- | --- |
| `slug` | yes | Unique identifier. |
| `appName` | yes | Display name of the external app. |
| `file` | yes | Path to the app JSON config file. |
| `description` | no | Human-readable summary. |
| `tags` | no | String array. |

### Resolution and error behavior

- **Build** (`build-site.mjs`): reads registry once at build start; logs entry counts per type; warns (`console.warn`) for each entry whose `sourcePath` or `file` does not exist on disk — build continues, does not throw. If the registry file itself cannot be parsed, falls back to `{ version: 0 }` with a warning and the build continues.
- **Preview server** (`preview-server.mjs`): reads registry fresh on each board-save request (`resolveBoardSavePath`); if the registry cannot load (parse error or missing file), falls back to a conventional `content/boards/<slug>/current.canvas` path.
- **Missing IDs**: no runtime deduplication; duplicate slugs are resolved to the first match by `Array.find`. There is no hard error — the second entry is silently ignored at find-time.
- **Unknown collection keys** are ignored; only the six known keys are consumed.

## Conventions
- `slug` values must be URL-safe (lowercase, hyphens only) and unique within their collection.
- Paths in `sourcePath` and `file` are relative to the repo root (not to `src/`).
- Do not add new top-level keys to `registry.json` without bumping `version`.
- `entities/` and `apps/` files are the source of truth for entity/app content; the registry entry is the lightweight index pointing at them.

## See also
- [../AGENTS.md](../AGENTS.md) — root session workflow and routing
- [apps/AGENTS.md](apps/AGENTS.md) — app metadata conventions (sibling worker)
- [entities/AGENTS.md](entities/AGENTS.md) — entity contract, required fields, schema (sibling worker)
- [../.agents/whiteboard/cosmoboard_implementation_plan.md](../.agents/whiteboard/cosmoboard_implementation_plan.md) — Cosmoboard direction and board architecture
