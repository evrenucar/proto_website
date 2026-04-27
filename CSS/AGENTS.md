# CSS

## Purpose

All stylesheets for the portfolio site and Cosmoboard app live here.

## Read when

Modifying layout, colors, typography, responsive breakpoints, or any visual behavior across the site.

## Skip when

Working exclusively on JavaScript behavior, build scripts, or content with no visual changes.

## Canonical for

Which stylesheet owns which page or feature; the role of `site.css` as the shared baseline; naming conventions for new stylesheets.

## Key files

- `site.css` — shared stylesheet included on every page; sets global resets, layout custom properties, body/html defaults, and box-sizing
- `braindump.css` — Cosmoboard whiteboard (braindump) app styles; loaded only on the board page
- `general_style.css` — common structural styles shared across portfolio pages (nav, layout, sidebar)
- `general_style_old.css` — **deprecated**; superseded by `general_style.css`; slated for Stage 1 archive
- `grid_style.css` — shared CSS grid helpers used by multi-column page layouts
- `hamburger_button.css` — mobile nav hamburger button animation and state styles
- `index_style.css` — homepage-specific styles
- `index_style_old.css` — **deprecated**; superseded by `index_style.css`; slated for Stage 1 archive
- `loader.css` — full-screen loading overlay shown while the board initializes
- `photography.css` — photography page layout and lightbox styles
- `projects_grid_style.css` — projects page grid and card styles
- `things_i_do_grid_style.css` — "things I do" page grid layout styles

## Conventions

- `site.css` is the shared baseline; every page links it. Do not put page-specific rules there.
- New stylesheets use kebab-case filenames (e.g., `new-feature.css`).
- Page-specific stylesheets live at the top level of `CSS/`; there are no subdirectories.
- Stage 2 of the refactor will rename this directory from `CSS/` to `css/`; do not lowercase it manually before then.

## See also

- [../AGENTS.md](../AGENTS.md) — session workflow and project routing
- [../README.md](../README.md) — repo overview and quickstart
- [../JavaScript/AGENTS.md](../JavaScript/AGENTS.md) — sibling front-end worker directory
