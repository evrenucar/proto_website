# src/apps

## Purpose
Home for Cosmoboard app code — distinct from entity types (`src/entities/`) and the page-database app (`src/page-database.mjs`).

## Read when
Adding or splitting out a subsystem of `JavaScript/braindump.js`; working on app-level logic that belongs to Cosmoboard but is not an entity type.

## Skip when
Working on entity schemas, the page database, CSS, or site-wide data (`src/site-data.mjs`).

## Canonical for
- The expected location for future `src/apps/braindump/<subsystem>.mjs` modules carved from `JavaScript/braindump.js`.

## Key files
- `excalidraw-proto.json` — legacy Excalidraw prototype data (not active app code).

## Conventions
- New Cosmoboard subsystem modules land here as `src/apps/braindump/<subsystem>.mjs` — not in `JavaScript/`.
- Carve out a subsystem only when you visit it for feature work (see the modularization rule in `JavaScript/AGENTS.md`); never as a standalone refactor.
- This directory is mostly a placeholder today; no subsystems have been carved out yet.
- Do not put entity type definitions here — those belong in `src/entities/`.

## See also
- [../AGENTS.md](../AGENTS.md)
- [JavaScript/AGENTS.md](../../JavaScript/AGENTS.md)
- [.agents/whiteboard/cosmoboard_implementation_plan.md](../../.agents/whiteboard/cosmoboard_implementation_plan.md)
