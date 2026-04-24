# Project Summary

## Project

`proto_website` is currently both:

- the personal portfolio website for Evren Ucar
- the active prototype host for the broader Cosmoboard product direction

For now, all product exploration should happen inside `evrenucar.com`. A separate standalone product site can come later.

## Current goals

- Keep the website easy to maintain.
- Preserve the current site feel while improving structure behind the scenes.
- Continue improving copy, SEO, and content systems where useful.
- Use Braindump as the current prototype canvas.
- Add a future `cosmoboard` page that acts as an onboarding board and feature map for the larger tool direction.

## Core product direction

- Markdown and `.canvas` should stay at the core.
- Markdown and canvases should work together in both directions.
- Multiple boards per page are expected.
- Multiple nested embeds are expected:
  - markdown in markdown
  - canvas in canvas
  - markdown in canvas
  - canvas in markdown
- The filesystem should remain the primary hierarchy and source of organization.
- Preview-first embeds should be the default, but live embeds should also be possible.
- Structured data should stay portable toward Obsidian-like workflows, while near-term UX can borrow practical ideas from Notion-like databases.
- Saved web app sessions inside markdown or canvas matter more than simply opening tools in new tabs.
- GitHub should be used as the main collaboration and versioning bridge for now.
- Realtime collaboration is a later phase, but the target is broad support across boards, markdown, and structured data if practical.

## Immediate product scope

- Keep Braindump working well inside the current site.
- Treat Braindump as the active prototype and experimentation surface.
- The next serious pilot after Braindump should be a dedicated `cosmoboard` page.
- That page should function like an onboarding board where users can see:
  - other boards
  - markdown files
  - database/base-like views
  - linked content inside the same interface
- Users should eventually be able to create new notes, pages, and related content from within that experience.

## Visual constraints

The site should remain close to the original version.

That means:

- dark overall look
- left sidebar navigation
- simple typography
- teal highlights
- photography page should keep a dense image-grid style

Avoid turning it into a completely different brand or layout while this work still lives inside the current portfolio site.

## Content constraints

The text should reflect:

- Evren Ucar is a TU Delft graduate
- Evren Ucar works as a freelance industrial design engineer
- the work sits between an idea and a physical thing that can be tested
- the practice includes mechanics, electronics, prototyping, and practical problem-solving
- outside work there is a strong making practice including analog photography, lino printing, metalworking, and related hands-on processes
- OMA Collective work currently includes a darkroom build and a small metal casting kiln

## Technical direction

- Keep the site lightweight.
- Prefer simple static generation over heavy frameworks where practical.
- Ensure the site remains compatible with static hosting.
- Keep local-first behavior central.
- Treat portability as a core requirement.
- Support import and export paths for key artifacts.
- Keep desktop, tablet, and mobile behavior in scope.
- Use Playwright when checking layout and interaction changes.

## Existing repo direction

The repo already includes:

- shared site data in `src/site-data.mjs`
- a lightweight build script in `scripts/build-site.mjs`
- shared styling in `CSS/site.css`
- shared front-end behavior in `JavaScript/site.js`
- Braindump-specific runtime and styling
- SEO support such as `robots.txt` and `sitemap.xml`
- documentation for page database, whiteboard, save-flow, and holistic planning work under `.agents/`

## Key planning docs

- `.agents/holistic_planning/holistic_planning.md`
- `.agents/whiteboard/cosmoboard_portability.md`
- `.agents/whiteboard/cosmoboard_implementation_plan.md`
- `.agents/whiteboard/online_save_plan.md`
- `.agents/page_database/page_database_plan.md`

Any future work should preserve the original site feel while moving the repo toward a file-first, local-first, portable Cosmoboard system.
