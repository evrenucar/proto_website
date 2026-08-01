# Agent Router

`proto_website` is Evren Ucar's personal portfolio site and the active prototype host for Cosmoboard, a local-first spatial workspace for canvases, markdown, databases, files, and embeds.

## Current Objective

Set 2026-07-29. **Everything not serving this is frozen.**

> A stranger opens `evrenucar.com`, sees real boards, understands what Cosmoboard is without being
> told, and can send a suggestion through the download / upload / commit route.
> **Done when one real person has actually done it.**

Priority order, decided by the user: people using it and collaborating first, the portfolio last.
The ladder is: seeing the boards, then running it themselves, then editing on the site, then live
co-editing. We are on the first rung.

**Frozen.** Roadmap phases 3, 4, 6, 7 and 8. The shared-entity model. Realtime collaboration. App
embeds. The repo split. Further tracker features. Underscore emphasis rendering. Decisions already
taken on the frozen items are recorded in [`todo.md`](./todo.md) so nothing is re-litigated when
they thaw.

**If a task does not serve the objective, it goes to `todo.md` and waits.** With eight open roadmap
phases any work is defensible, which is how two months passed with nothing shipped. That is the
failure this section exists to prevent.

## Routing Rules

| Task type | Read these docs |
| --- | --- |
| Whiteboard / Braindump / board bugfix | `project.md`, `.agents/whiteboard/` |
| Board export, bundling, save flow | `project.md`, `.agents/handoffs/handoff_export_bundling.md` |
| Product strategy or roadmap question | `project.md`, `holistic_planning/holistic_planning.md` |
| Architecture or capability matrix | `project.md`, `holistic_planning/holistic_architecture.md` |
| Technology research or references | `holistic_planning/holistic_research.md` |
| Deep research artifact or candidate comparison | `.agents/research/` |
| Any open task, bug, backlog item, or review queue | `todo.md`, or the board at `/.tracker/tracker.html` |
| What the user thought of work you handed back | `review-feedback.json` - read it every session |
| Active implementation follow-up | `current_scratch_pad.md`, `todo.md` |
| Page database or structured content | `.agents/page_database/` |
| Splitting Cosmoboard into its own repo | `cosmoboard_extraction_plan.md` |

## Key Stable Docs

- [todo.md](./todo.md) - the single live task list: open work, bugs, review queue, backlog
- [project.md](./project.md) - durable product facts, visual constraints, writing style, technical direction
- [holistic_planning/holistic_planning.md](./holistic_planning/holistic_planning.md) - north star, confirmed decisions, roadmap

## What Not To Read By Default

- `holistic_planning/archive/` - resolved history only
- `holistic_planning/holistic_research.md` - references and candidates, not active task state
- `PLAN.md`, `active_todo.md`, `general_issues_and_tasks.md`, `holistic_planning/holistic_tasks.md`,
  `holistic_planning/holistic_backlog.md` - all folded into `todo.md` on 2026-07-28. History only.
- `.agents/handoffs/` - dense proof and handoff detail, read only when the task is in that area
- `.agents/skills/` - skill instructions, read only when using a specific skill

## Testing Rule

- Default to one minimal verification pass near the end of implementation.
- For Braindump browser verification, use `.agents/skills/whiteboard-automated-testing-skill/skill.md`.
- Only expand into broader Playwright coverage when the user asks or the change is high-risk.

## Board Rule

- The kanban at `http://127.0.0.1:4174/.tracker/tracker.html` is a live view of `todo.md`. It polls, so any
  edit shows up within seconds. No build step, nothing to publish.
- Before starting a task, claim its card: change `[ ]` to `[~]` and add `@your-id` to the line.
  The board colours the card border per agent, so it is visible who holds what.
- **Take an identity from [`.tracker/agents.json`](../.tracker/agents.json), or add one.** Each
  entry carries an id, a number, the model behind it, the goal it is on, and a colour, so the
  board says "opus 5 · 2, alt-drag copy undo" rather than a bare "claude". An agent missing from
  the registry still renders, with a colour hashed from its name.
- Push a status line by **appending** to your own `.tracker/feed/<your-id>.jsonl`, one JSON object
  per line, oldest first: `{ "at": "<ISO time>", "text": "..." }`. One file per agent is the whole
  design: appending to your own file cannot lose someone else's write, which a read-modify-write
  of a single shared feed can and did. The tracker merges these with `tracker-feed.json` and sorts
  by time, so it reads as one feed. Post on start, at each real finding, and roughly every five
  minutes. `tracker-feed.json` stays for whoever is orchestrating.

## Running Several Agents At Once

Concurrency here is cheap; losing work to it is not. When more than one agent is live:

- **One writer per file.** `JavaScript/braindump.js` is one 9,500-line file, so at most one agent
  edits it at a time. Others diagnose and hand back patches, and prove their fix by overriding the
  function in the running page (`page.addInitScript`, `page.evaluate`, `page.addStyleTag`) instead
  of editing on disk.
- **The orchestrator owns `.agents/todo.md` and `.tracker/tracker-feed.json`.** Everyone else
  reports; one hand writes.
- **Own port each.** `PORT=<yours> node scripts/preview-server.mjs`. 4174 belongs to the user.
- **Never `npm run build` while others are working.** It rewrites generated pages under them.
- **Never write to `content/`.** In every browser probe, disable autosave through the settings key
  before page scripts run and block `/api/save-board` outright, then inject board fixtures by
  intercepting the canvas fetch. A probe with autosave left on has already silently overwritten
  the sandbox board once.
- Scratch files go in `.tmp/scratch/<your-id>/`, inside the repo so `playwright` resolves.
- Move the card to `[A]` when done and drop the `@` tag. Only the user sets `[x]`.
- Open questions for the user go in `.tracker/tracker-questions.json` under `questions`. An empty array
  hides that panel.

## Review Feedback Rule

**Read [`review-feedback.json`](./review-feedback.json) at the start of every session.** It is the
user's verdict on work you handed back, written straight from the board, newest first.

- Each card on the tracker has a **works** button, an **issue** button, and a feedback field.
  A verdict is also a move: works sends the card to Done, issue sends it back to To do. Text on its
  own records a comment and leaves the card where it is.
- Dragging a card between columns rewrites its `[ ]`/`[~]`/`[A]`/`[x]` marker in `todo.md`.
- Entries carry `{ at, lane, title, verdict, note, statusFrom, statusTo }`. `title` is the key the
  board matches on, so a card keeps its feedback after the file shifts around it.
- An `issue` entry is a bug report against work you reported as done. Treat it as the highest
  priority thing in that area, and check what the note says before re-doing the task.
- Both gestures go through `/api/todo-update` in `scripts/preview-server.mjs`, so they need
  `npm run preview` running.

## Local Server Rule

- Always start a local server before reporting progress on site work.
- Share the active local preview address at session start and end.
- Use `npm run preview` (port 4174, `scripts/preview-server.mjs`). **Not 4173:** the `aide-board`
  project owns that port on this machine, and 4174 is the permanent answer as of 2026-07-31. It owns the write APIs: `/api/save-board`, `/api/save-markdown`, `/api/save-asset`, `/api/list-markdown`, `/api/get-video-meta`.
- `scripts/dev-server.mjs` (port 3000) is a legacy mini-server that only handles `/api/save-board`. Treat it as deprecated. Do not use it for board sessions, markdown, or drag-drop uploads. Anything that drops a PDF, image, or `.md` against it returns 404.
- If an API route returns 404 in the browser but the route exists in `scripts/preview-server.mjs` on disk, the running Node process is stale. Stop it (Ctrl+C) and run `npm run preview` again. Pulling commits does not reload an already-running server.
