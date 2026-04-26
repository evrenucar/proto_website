# Agent Router

`proto_website` is Evren Ucar's personal portfolio site and the active prototype host for Cosmoboard, a local-first spatial workspace for canvases, markdown, databases, files, and embeds.

## Routing Rules

| Task type | Read these docs |
| --- | --- |
| Whiteboard / Braindump / board bugfix | `project.md`, `.agents/whiteboard/` |
| Board export, bundling, save flow | `project.md`, `.agents/handoffs/handoff_export_bundling.md` |
| Product strategy or roadmap question | `project.md`, `holistic_planning/holistic_planning.md` |
| Architecture or capability matrix | `project.md`, `holistic_planning/holistic_architecture.md` |
| Technology research or references | `holistic_planning/holistic_research.md` |
| Active implementation follow-up | `current_scratch_pad.md`, `holistic_planning/holistic_tasks.md` |
| Page database or structured content | `.agents/page_database/` |
| Cross-domain inbox or quick notes | `general_issues_and_tasks.md` |
| Backlog or medium-term work | `holistic_planning/holistic_backlog.md` |

## Key Stable Docs

- [project.md](./project.md) — durable product facts, visual constraints, writing style, technical direction
- [holistic_planning/holistic_planning.md](./holistic_planning/holistic_planning.md) — north star, confirmed decisions, roadmap
- [holistic_planning/holistic_tasks.md](./holistic_planning/holistic_tasks.md) — active work, review queue, next up

## What Not To Read By Default

- `holistic_planning/archive/` — resolved history only
- `holistic_planning/holistic_backlog.md` — medium/later work, not active
- `holistic_planning/holistic_research.md` — references and candidates, not active task state
- `.agents/handoffs/` — dense proof and handoff detail, read only when the task is in that area
- `.agents/skills/` — skill instructions, read only when using a specific skill

## Testing Rule

- Default to one minimal verification pass near the end of implementation.
- For Braindump browser verification, use `.agents/skills/whiteboard-automated-testing-skill/skill.md`.
- Only expand into broader Playwright coverage when the user asks or the change is high-risk.

## Local Server Rule

- Always start a local server before reporting progress on site work.
- Share the active local preview address at session start and end.
