# CLAUDE.md

Context for this repo lives in `.agents/`, not here. Read these three files at session start:

1. [`AGENTS.md`](../AGENTS.md) — session workflow, scratch-pad rules, default startup context
2. [`current_scratch_pad.md`](../current_scratch_pad.md) — current session scope, written by user and agent
3. [`.agents/agents.md`](../.agents/agents.md) — router: maps task type to the right doc

## Critical Docs (load only when the router points you there)

- [`.agents/project.md`](../.agents/project.md) — durable product facts, visual constraints, writing style, technical direction
- [`.agents/holistic_planning/holistic_planning.md`](../.agents/holistic_planning/holistic_planning.md) — north star, confirmed decisions, current roadmap
- [`.agents/todo.md`](../.agents/todo.md) — the single live task list: open work, bugs, review queue, backlog

## Do Not Read By Default

- `.agents/holistic_planning/archive/` — resolved history
- `.agents/holistic_planning/holistic_research.md` — references, not active state
- `.agents/PLAN.md`, `.agents/active_todo.md`, `.agents/general_issues_and_tasks.md`,
  `.agents/holistic_planning/holistic_tasks.md`, `.agents/holistic_planning/holistic_backlog.md` —
  folded into `.agents/todo.md` on 2026-07-28, history only
- `.agents/handoffs/` — dense proof, only when task is in that area
- `.agents/skills/` — only when invoking a specific skill
