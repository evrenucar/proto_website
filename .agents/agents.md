# Agent Notes

This repo is the personal website for Evren Ucar.

## What the user asked for

- Clean up the website and the project file structure.
- Keep things lightweight so the pages are easier to manage.
- Update the text and descriptions.
- Improve SEO.
- Prepare the project so Notion pages can later be linked to projects, with a GitHub Action pulling the latest state.
- Use Playwright for visual cleanup and checking.

## Important correction from the user

Do not redesign the website into a new visual system.

Keep the site close to the original look and feel:

- dark background
- left sidebar navigation
- simple sans-serif feel
- teal accent color
- photography page should stay close to the older denser gallery layout

The user explicitly did not want a full visual rebrand.

## Writing style

When updating text:

- keep it simple and honest
- write like normal direct communication
- use proper punctuation
- avoid em dashes

## Content direction

Use the user's updated background where relevant:

- TU Delft graduate
- freelance industrial design engineer
- works in the space between an idea and a thing you can hold, test, break, and improve
- works through mechanics, electronics, prototyping, and practical problem-solving
- also works with analog photography, lino printing, metalworking, and other hands-on processes
- currently helping build a darkroom and a small metal casting kiln at OMA Collective

## Current implementation direction

- Keep the site visually close to the original.
- It is fine to improve structure behind the scenes.
- Lightweight static generation is acceptable.
- Future Notion sync support is acceptable as long as it does not change the visible design too much.
- For general items, use `agents/general_issues_and_tasks.md`.
- For page database and Notion-backed content system work, use `agents/page_database/page_database_tasks.md`.
- Project-specific agent skills live under `.agents/skills/`.
- For Braindump browser verification, use `.agents/skills/whiteboard-automated-testing-skill/skill.md` and `agents/whiteboard/whiteboard_automated_testing_skill.md`.
- Always verify visual changes with Playwright before closing work.
- CRITICAL RULE: Everytime you add a new feature, you MUST TEST it in the browser (using browser subagent if applicable) before proceeding!
