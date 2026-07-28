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
| Deep research artifact or candidate comparison | `.agents/research/` |
| Any open task, bug, backlog item, or review queue | `todo.md`, or the board at `/tracker.html` |
| Active implementation follow-up | `current_scratch_pad.md`, `todo.md` |
| Page database or structured content | `.agents/page_database/` |
| Splitting Cosmoboard into its own repo | `cosmoboard_extraction_plan.md` |

## Key Stable Docs

- [todo.md](./todo.md) — the single live task list: open work, bugs, review queue, backlog
- [project.md](./project.md) — durable product facts, visual constraints, writing style, technical direction
- [holistic_planning/holistic_planning.md](./holistic_planning/holistic_planning.md) — north star, confirmed decisions, roadmap

## What Not To Read By Default

- `holistic_planning/archive/` — resolved history only
- `holistic_planning/holistic_research.md` — references and candidates, not active task state
- `PLAN.md`, `active_todo.md`, `general_issues_and_tasks.md`, `holistic_planning/holistic_tasks.md`,
  `holistic_planning/holistic_backlog.md` — all folded into `todo.md` on 2026-07-28. History only.
- `.agents/handoffs/` — dense proof and handoff detail, read only when the task is in that area
- `.agents/skills/` — skill instructions, read only when using a specific skill

## Testing Rule

- Default to one minimal verification pass near the end of implementation.
- For Braindump browser verification, use `.agents/skills/whiteboard-automated-testing-skill/skill.md`.
- Only expand into broader Playwright coverage when the user asks or the change is high-risk.

## Board Rule

- The kanban at `http://127.0.0.1:4173/tracker.html` is a live view of `todo.md`. It polls, so any
  edit shows up within seconds. No build step, nothing to publish.
- Before starting a task, claim its card: change `[ ]` to `[~]` and add `@your-name` to the line.
  The board colours the card border per agent, so it is visible who holds what.
- Push a status line when you start, finish, or get stuck. Prepend to `tracker-feed.json`:
  `{ "at": "<ISO time>", "agent": "<name>", "text": "..." }`, newest first.
- Move the card to `[A]` when done and drop the `@` tag. Only the user sets `[x]`.
- Open questions for the user go in `tracker-questions.json` under `questions`. An empty array
  hides that panel.

## Local Server Rule

- Always start a local server before reporting progress on site work.
- Share the active local preview address at session start and end.
- Use `npm run preview` (port 4173, `scripts/preview-server.mjs`). It owns the write APIs: `/api/save-board`, `/api/save-markdown`, `/api/save-asset`, `/api/list-markdown`, `/api/get-video-meta`.
- `scripts/dev-server.mjs` (port 3000) is a legacy mini-server that only handles `/api/save-board`. Treat it as deprecated. Do not use it for board sessions, markdown, or drag-drop uploads. Anything that drops a PDF, image, or `.md` against it returns 404.
- If an API route returns 404 in the browser but the route exists in `scripts/preview-server.mjs` on disk, the running Node process is stale. Stop it (Ctrl+C) and run `npm run preview` again. Pulling commits does not reload an already-running server.
