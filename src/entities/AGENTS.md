# src/entities — Agent Guide

## Purpose

`src/entities/` holds entity JSON files — the shared, surface-agnostic descriptors for things
(projects, experiments, tools, topics) that appear across multiple rendering surfaces: project
pages, boards, Cosmoboard, and any future surface. A single entity file is the single source of
truth; each surface reads it instead of duplicating the metadata.

## Entity contract

Every entity file is a JSON object validated by `entity.schema.json` (JSON Schema draft 2020-12).
See that file for the machine-readable contract; this section is the human-readable companion.

### Required fields

| Field | Type | Notes |
|---|---|---|
| `slug` | `string` | Kebab-case, unique across all entities. Must match the filename (e.g. `eurocrate-storage-system.json` → `"slug": "eurocrate-storage-system"`). |
| `type` | `string` enum | Current values: `project`, `experiment`, `tool`, `topic`. |
| `title` | `string` | Display name used in card labels, board nodes, and headings. |
| `summary` | `string` | One-sentence description ≤ 160 chars. Shown in tooltips and hover states. |
| `status` | `string` enum | `active` · `paused` · `archived` · `planned`. Surfaces may gate visibility on this. |
| `references` | `array` | At least one entry. Each entry has `surface` (enum), `slug`, and `path` (repo-relative). |

### Optional fields

| Field | Type | Notes |
|---|---|---|
| `tags` | `string[]` | Free-form labels for filtering/grouping. Recommend reusing existing tags before coining new ones. |
| `projectSlug` | `string` | When `type` is `project`, the slug of `content/projects/<projectSlug>.html`. |

### References array

Each entry in `references` describes one surface that renders or links to the entity:

```json
{
  "surface": "board",          // "project" | "board" | "page" | "embed"
  "slug": "cosmoboard",        // identifier within that surface type
  "path": "content/boards/cosmoboard/current.canvas"  // repo-relative source file
}
```

The `path` field is used by the build pipeline and tooling; it is not currently resolved at
runtime (the loader uses `src/registry.json` for discovery).

### Lifecycle

1. **Create** — add `src/entities/<slug>.json` and a matching entry in `src/registry.json`
   (`entities` array). Run the build; the entity becomes available to all surfaces.
2. **Update** — edit the JSON file directly. The registry entry (`slug`, `type`, `sourcePath`)
   should remain stable; update `description` / `tags` there if the display changes.
3. **Archive** — set `"status": "archived"`. Surfaces that respect status will suppress display.
   Do not delete the file; cross-references in boards may still point to it.
4. **Remove** — only safe after confirming no `.canvas` file or HTML page references the slug.
   Remove the registry entry at the same time.

### Rendering hooks

Currently no runtime code reads entity files directly at page-load. The loader in
`src/apps/braindump/` (and equivalent) resolves entities through `src/registry.json`.
When a canvas item embeds an entity reference (via slug), the board renderer looks it up in the
registry and uses `title` / `summary` for display. Future rendering hooks (thumbnails,
status badges, deep-link overlays) should be added here as they land.

## Worked example

`eurocrate-storage-system.json` — the only current entity — illustrates every required field
and both optional fields (`tags`, `projectSlug`). Validate any new entity file against it as a
sanity check, and confirm the schema passes:

```
node -e "
const s = JSON.parse(require('fs').readFileSync('src/entities/entity.schema.json','utf8'));
const e = JSON.parse(require('fs').readFileSync('src/entities/eurocrate-storage-system.json','utf8'));
const req = s.required;
const missing = req.filter(f => !(f in e));
if (missing.length) { console.error('FAIL missing:', missing); process.exit(1); }
console.log('OK');
"
```

## Schema reference

`entity.schema.json` — JSON Schema draft 2020-12. `$id`: `https://evrenucar.com/schemas/entity.schema.json`.
Schema version: `1` (tracked via `$comment`; not yet final — breaking changes will increment the version number in that comment).

## Adding a new entity

1. Create `src/entities/<slug>.json` following the contract above.
2. Add an entry to the `entities` array in `src/registry.json`.
3. Run `npm run build` and `node --test tests/` to confirm no regressions.
4. Add `references` entries for every surface that will display it.

## See also

- [`../AGENTS.md`](../AGENTS.md) — sibling worker guide for the `src/` directory
- [`.agents/holistic_planning/extension_seams.md`](../../.agents/holistic_planning/extension_seams.md) — enumeration of extension surfaces, including new entity types
- [`../../content/boards/CANVAS_FORMAT.md`](../../content/boards/CANVAS_FORMAT.md) — board file format; the other side of the entity ↔ board relationship
- [`.agents/whiteboard/cosmoboard_implementation_plan.md`](../../.agents/whiteboard/cosmoboard_implementation_plan.md) — Cosmoboard implementation plan; describes how entities appear on the board
