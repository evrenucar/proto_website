# content/boards

## Purpose

Persisted board data for Cosmoboard and Braindump. Contains `.canvas` files (the spatial board format), one subdirectory per board surface, and `eurocrate-storage.html` (a static embed file).

## Read when

- Working on board save/load logic or the `.canvas` serialization format.
- Debugging missing or corrupted board state.
- Adding a new named board surface.

## Skip when

- Changing UI layout, styling, or JavaScript behavior — those live in `CSS/`, `JavaScript/`, and `src/`.
- Working on entity definitions — see `src/entities/`.

## Canonical for

- The live state of every board (source of truth for what a user sees on the canvas).
- The list of existing named board surfaces: `braindump/`, `cosmoboard/`, `projects/`.

## Key files

- `cosmoboard/current.canvas` — primary Cosmoboard board, loaded by the runtime.
- `braindump/current.canvas` — Braindump board state.
- `eurocrate-storage.html` — static embed for the Eurocrate storage project.

## Conventions

- Boards are **data, not code**. Never add JavaScript, CSS, or build logic here.
- One subdirectory per named board surface. New boards get their own subdirectory.
- `.canvas` files are JSON — do not hand-edit them; use the board UI to avoid schema corruption.

## See also

- [`../AGENTS.md`](../AGENTS.md) — `content/` directory overview.
- [`.agents/whiteboard/cosmoboard_implementation_plan.md`](../../.agents/whiteboard/cosmoboard_implementation_plan.md) — Cosmoboard engine roadmap and design decisions.
- [`CANVAS_FORMAT.md`](./CANVAS_FORMAT.md) — full `.canvas` schema reference (added by a parallel Stage 6 batch unit; will exist after merge).
