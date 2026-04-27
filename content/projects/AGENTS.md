# content/projects

## Purpose
Holds self-contained project-detail HTML pages, one file per project, rendered into the static site at build time.

## Read when
Adding a new project page, editing an existing project page, or tracing how project content flows into the built site.

## Skip when
Working on the Cosmoboard app, board data, entity schemas, JavaScript behavior, or CSS.

## Canonical for
The set of live project pages and their slug-to-filename mapping.

## Key files
- `cyberdeck-small-modular-pc.html` — Cyberdeck modular PC project page
- `diy-flightcases.html` — DIY flight cases project page
- `eurocrate-storage-universal-solution.html` — Eurocrate storage system project page
- `micro-lego-kits-for-people.html` — Micro Lego kits project page
- `project-box-system.html` — Project box system project page

## Conventions
- Each `.html` is a standalone page: full `<head>` with canonical URL, OG tags, and favicons inline.
- New projects go here as `<slug>.html` where `<slug>` matches the URL path used in `projects.html`.
- Do not place shared scripts, stylesheets, or build utilities here — those live in `JavaScript/`, `CSS/`, or `scripts/`.
- The index page (`projects.html` at repo root) lists all projects; update it when adding a new page here.

## See also
- [../AGENTS.md](../AGENTS.md) — content/ directory conventions
- [../../AGENTS.md](../../AGENTS.md) — root session workflow
- [../../projects.html](../../projects.html) — the projects index page that links to these pages
- [../../.agents/holistic_planning/refactoring_plan.md](../../.agents/holistic_planning/refactoring_plan.md) — Stage 4 per-directory doc convention
