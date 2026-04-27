# JavaScript

## Purpose
Front-end JavaScript for the portfolio site and the Cosmoboard editor.

## Read when
Working on any browser-side behavior: navigation, lightbox, mobile menu, or any Cosmoboard editor feature.

## Skip when
Working on build scripts, server-side logic, CSS, or content data files.

## Canonical for
Entry points for all front-end JS. The source of truth for which scripts are live vs. deprecated.

## Key files
- `braindump.js` — Cosmoboard editor (large monolith; see Modularization rule below)
- `site.js` — shared site behavior: nav toggle, desktop nav, copy-email, lightbox, history-back
- `image_lightbox.js` — standalone lightbox helper (used on photography pages)
- `MobileMenu.js` — mobile nav behavior
- `braindump_broken.js` — **deprecated**; slated for Stage 1 archive, do not edit
- `Copy.js` — **deprecated**; slated for Stage 1 archive, do not edit
- `vendor/` — third-party scripts, do not modify

## Conventions
- New site-wide utilities go into `site.js` or a new focused file; do not grow `braindump.js` with non-editor code.
- New Cosmoboard subsystem code goes into `src/apps/braindump/<subsystem>.mjs` (see Modularization rule).
- Do not lowercase this directory name here — that rename is Stage 2 of the refactoring plan.
- Deprecated files (`braindump_broken.js`, `Copy.js`) must not be imported or extended; archive them in Stage 1.

## Modularization rule

When you visit a subsystem of `braindump.js` for any feature work, carve it out into a module under `src/apps/braindump/<subsystem>.mjs` as part of that same PR. Never do it as a standalone refactor PR. The split is visit-driven and incremental — one subsystem per feature touch — not a big-bang rewrite. Suggested initial split targets (informational, not prescriptive): `selection`, `wheel-routing`, `fullscreen`, `markdown-render`. The recent cluster of fixes already touched all four; the next visit to any of them is the natural moment to extract it.

## See also
- [../AGENTS.md](../AGENTS.md) — root session workflow and startup context
- [../CSS/AGENTS.md](../CSS/AGENTS.md) — sibling: stylesheet layer
- [../src/apps/AGENTS.md](../src/apps/AGENTS.md) — sibling: Cosmoboard app modules (target for extracted subsystems)
- [../.agents/whiteboard/cosmoboard_implementation_plan.md](../.agents/whiteboard/cosmoboard_implementation_plan.md) — Cosmoboard feature roadmap
- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — stage plan that governs this directory's evolution
