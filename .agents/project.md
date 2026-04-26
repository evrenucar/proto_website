# Project Facts

## Purpose
Durable product facts, visual constraints, writing style, and technical direction.

## Read when
Starting any task that touches the product surface, design, or technical architecture.

## Skip when
Looking for active task state, backlog, or implementation history.

## Canonical for
Visual constraints, content direction, writing style, technical direction, repo structure.

---

## Product

`proto_website` is currently both:

- the personal portfolio website for Evren Ucar
- the active prototype host for the Cosmoboard product direction

All product exploration happens inside `evrenucar.com` for now. A separate standalone product site can come later.

## Core Product Direction

- Markdown and `.canvas` are the core formats.
- Markdown and canvases should work together in both directions.
- Multiple boards per page are expected, including deep nesting.
- The filesystem should remain the primary hierarchy and source of organization.
- Preview-first embeds by default, live embeds also possible.
- Structured data stays portable toward Obsidian-like workflows, with cleaner UX allowed.
- Saved web app sessions inside markdown or canvas matter more than opening tools in new tabs.
- GitHub is the main collaboration bridge for now.
- Realtime collaboration is a later phase, targeting broad support if practical.

## Visual Constraints

The site should remain close to the original version:

- dark overall look
- left sidebar navigation
- simple typography
- teal highlights
- photography page keeps a dense image-grid style

Avoid turning it into a completely different brand or layout while work still lives inside the current portfolio site.

## Writing Style

- keep it simple and honest
- write like normal direct communication
- use proper punctuation
- avoid em dashes

## Content Direction

The text should reflect:

- Evren Ucar is a TU Delft graduate
- Evren Ucar works as a freelance industrial design engineer
- the work sits between an idea and a physical thing that can be tested
- the practice includes mechanics, electronics, prototyping, and practical problem-solving
- outside work there is a strong making practice including analog photography, lino printing, metalworking, and related hands-on processes
- OMA Collective work currently includes a darkroom build and a small metal casting kiln

## Technical Direction

- Keep the site lightweight.
- Prefer simple static generation over heavy frameworks where practical.
- Ensure the site remains compatible with static hosting.
- Keep local-first behavior central.
- Treat portability as a core requirement.
- Support import and export paths for key artifacts.
- Keep desktop, tablet, and mobile behavior in scope.

## Repo Structure

The repo includes:

- shared site data in `src/site-data.mjs`
- a lightweight build script in `scripts/build-site.mjs`
- shared styling in `CSS/site.css`
- shared front-end behavior in `JavaScript/site.js`
- Braindump-specific runtime and styling
- SEO support such as `robots.txt` and `sitemap.xml`
- documentation for page database, whiteboard, save-flow, and holistic planning work under `.agents/`
