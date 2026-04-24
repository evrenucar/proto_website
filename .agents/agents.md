# Agent Notes

This repo is still the personal website for Evren Ucar, but it is also now the active prototype host for the broader Cosmoboard product direction inside `evrenucar.com`.

## Primary planning files

- `.agents/holistic_planning/holistic_planning.md`
  - strategic product summary and architecture direction
- `.agents/holistic_planning/holistic_tasks.md`
  - ordered task tracker, priority list, review state, testing expectations, and old task parking area

## Current mission

- Keep the portfolio website working and visually close to the existing site.
- Continue using Braindump as the current working whiteboard and canvas prototype.
- Build the broader tool inside this website first instead of spinning up a separate product site now.
- Next major product surface should be a new `cosmoboard` page that acts as an onboarding board and feature map.

## Critical product direction

- `Cosmoboard` as the product/system name is acceptable for now.
- Markdown and `.canvas` should stay at the core of the system.
- Markdown and canvases should be interchangeable and easy to embed into each other.
- Multiple boards per page and multiple embeds per page are expected.
- Nesting can go deep:
  - markdown in markdown
  - canvas in canvas
  - markdown in canvas
  - canvas in markdown
- The filesystem hierarchy should remain the primary source of organization.
- Embed behavior should default to preview-first, but live iframe-style embeds must also be possible.
- Local files and folders should aim for read and write behavior where browser and device capabilities allow it.
- Saved embedded web app sessions are a higher priority than forcing users into new tabs.
- GitHub should be the main collaboration and versioning bridge for now, alongside local-first behavior.
- Realtime collaboration is a later phase, but the intent is broad coverage across boards, markdown, and structured data if feasible.
- Obsidian portability is an important goal.
- Obsidian-like file portability is preferred, but some near-term structured UX can borrow cleaner ideas from Notion-like databases.

## Current implementation scope

- Keep all near-term product work inside the current site.
- Do not make a standalone Cosmoboard website yet.
- Braindump remains the active prototype and testing surface.
- After Braindump, the next serious pilot should be a `cosmoboard` onboarding page on the current site.
- That onboarding page should contain boards, markdown files, and database/base-like views inside one board experience.
- Users should eventually be able to create new notes, pages, and related content from within that system.

## Important visual constraint

Do not redesign the website into a new visual system yet.

Keep the site close to the original look and feel:

- dark background
- left sidebar navigation
- simple sans-serif feel
- teal accent color
- photography page should stay close to the older denser gallery layout

The user explicitly did not want a full visual rebrand for the current site.

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

## Technical constraints

- Keep the site lightweight.
- Prefer simple static generation over heavy frameworks where practical.
- Ensure the site can remain statically hosted.
- Local-first behavior is a product requirement, not just a fallback.
- Portability and import/export matter from the start.
- Keep mobile, tablet, and desktop behavior in scope.

## Working doc map

- Use `.agents/holistic_planning/holistic_planning.md` for the broader product architecture.
- Use `.agents/holistic_planning/holistic_tasks.md` for the ordered task list and task state.
- Use `.agents/general_issues_and_tasks.md` for short shared notes and pointers when needed, not as the primary task tracker.
- Use `.agents/page_database/page_database_tasks.md` for page database and structured content work.
- Use `.agents/whiteboard/` docs for Braindump and Cosmoboard engine planning.
- Project-specific skills live under `.agents/skills/`.

## Testing rule

- Default to one minimal verification pass near the end of implementation, not repeated browser testing during normal in-progress work.
- For Braindump browser verification, use `.agents/skills/whiteboard-automated-testing-skill/skill.md` and `.agents/whiteboard/whiteboard_automated_testing_skill.md`.
- Keep the default check narrow:
  - confirm the changed flow works
  - confirm there are no obvious console or layout regressions
  - collect proof only when it materially helps
- Only expand into broader Playwright coverage when:
  - the user explicitly asks for it
  - the change is high-risk or cross-device
  - persistence, save, import/export, or touch interaction behavior changed

## Local server rule

- Always start a local server before reporting progress on site work when the repo can be previewed locally.
- Before the final response for site work, run the build command and make sure a local preview server is running.
- Share the active local preview address with the user at the start of a session, whenever the preview address changes, and when you pause work or terminate the session.
- Prefer including both the localhost address and the most useful LAN IP when available at those moments; do not repeat the LAN IP in routine progress updates.
