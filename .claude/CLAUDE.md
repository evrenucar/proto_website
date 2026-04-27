# CLAUDE.md

Context for this repo lives in `.agents/`, not here. Read these three files at session start:

1. [`AGENTS.md`](../AGENTS.md) — session workflow, scratch-pad rules, default startup context
2. [`current_scratch_pad.md`](../current_scratch_pad.md) — current session scope, written by user and agent
3. [`.agents/agents.md`](../.agents/agents.md) — router: maps task type to the right doc

## Critical Docs (load only when the router points you there)

- [`.agents/project.md`](../.agents/project.md) — durable product facts, visual constraints, writing style, technical direction
- [`.agents/holistic_planning/holistic_planning.md`](../.agents/holistic_planning/holistic_planning.md) — north star, confirmed decisions, current roadmap
- [`.agents/holistic_planning/holistic_tasks.md`](../.agents/holistic_planning/holistic_tasks.md) — active work, review queue, next up
- [`.agents/general_issues_and_tasks.md`](../.agents/general_issues_and_tasks.md) — cross-domain inbox

## Do Not Read By Default

- `.agents/holistic_planning/archive/` — resolved history
- `.agents/holistic_planning/holistic_backlog.md` — medium/later work
- `.agents/holistic_planning/holistic_research.md` — references, not active state
- `.agents/handoffs/` — dense proof, only when task is in that area
- `.agents/skills/` — only when invoking a specific skill
