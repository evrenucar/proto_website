# `.agents` Context-Minimization Restructure

## Summary

- Adopt a `core plus index` startup model: fresh agents should read only `AGENTS.md`, `current_scratch_pad.md`, and a tiny `.agents/agents.md`.
- Preserve existing main filenames where practical.
- Reduce context by fixing routing and duplication, not by blindly moving every file. The biggest current issues are:
  - `.agents/agents.md` duplicates `.agents/project.md`
  - `holistic_planning.md` mixes summary, architecture, research, and history
  - `holistic_tasks.md` mixes active work, backlog, completed work, and parking-lot items
- Leave `.agents/skills/` largely alone unless active docs are force-pointing agents into those files. Their mere presence is not the main token cost.

## Doc Interfaces

- `.agents/agents.md`: becomes the only default `.agents` entry file. It should be a router only: project one-liner, task-to-doc map, and “what not to read by default.”
- `.agents/project.md`: becomes the canonical stable project-facts file only. Keep visual constraints, writing style, durable product direction, and technical constraints here. No task state, no historical notes.
- `.agents/general_issues_and_tasks.md`: becomes a cross-domain inbox only. Max 5-10 live bullets. No duplicate roadmap or task lists.
- `.agents/holistic_planning/holistic_planning.md`: becomes an executive summary only.
- `.agents/holistic_planning/holistic_tasks.md`: becomes active-only task state only.
- Every active planning doc gets the same top header:
  - `Purpose`
  - `Read when`
  - `Skip when`
  - `Canonical for`

## Implementation Changes

- Update root `AGENTS.md` so new agents are pointed to `.agents/agents.md`. Without this, the `.agents` cleanup will not actually change default startup context.
- Rewrite `.agents/agents.md` to stay under roughly 60 lines and contain only:
  - one-sentence repo/product summary
  - routing rules by task type
  - explicit rule to avoid archive files unless the task needs history
  - links to `project.md`, domain docs, and active task docs only
- Trim `.agents/project.md` so it holds only durable facts that are still worth sharing with many task types. Remove anything duplicated in `.agents/agents.md`.
- Repurpose `.agents/general_issues_and_tasks.md` into a true inbox:
  - only cross-cutting, unresolved, current notes
  - move domain-specific items into domain task files
  - move stale/resolved items into `.agents/archive/general_issues_and_tasks_archive.md`
- Split `.agents/holistic_planning/holistic_planning.md` into:
  - `holistic_planning.md`: north star, confirmed decisions, current roadmap snapshot
  - `holistic_architecture.md`: capability matrix, source-of-truth rules, file organization, detailed architecture
  - `holistic_research.md`: references, technology candidates, feature ideas, non-immediate open questions
  - `archive/holistic_planning_archive.md`: resolved history and legacy planning notes
- Split `.agents/holistic_planning/holistic_tasks.md` into:
  - `holistic_tasks.md`: `active_work`, `review_queue`, `next_up`, blockers
  - `holistic_backlog.md`: medium/later live work that still matters
  - `archive/holistic_tasks_archive.md`: completed, superseded, deprioritized, and old tasks
- Move dense proof and handoff detail out of active task files. Keep active tasks short and link to `.agents/handoffs/*.md` when deep evidence is needed.
- Create `.agents/handoffs/` and move files like `handoff_export_bundling.md` there.
- Apply the same pattern gradually to domain folders:
  - stable plan doc
  - active task doc
  - optional backlog doc
  - archive doc
- Do not force a large whiteboard or page-database consolidation if those areas are already reasonably segmented.

## Test Plan

- Validate fresh-agent startup:
  - a new agent should be able to start with `AGENTS.md`, `current_scratch_pad.md`, and `.agents/agents.md` only
- Validate routing with three dry-run scenarios:
  - whiteboard bugfix opens router + project + whiteboard docs, not holistic archives
  - product-strategy question opens router + project + holistic summary, then architecture only if needed
  - current implementation follow-up opens router + scratch pad + relevant active task doc, not completed history
- Search repo after restructuring and confirm:
  - root `AGENTS.md` and `.agents/agents.md` do not point to archive docs by default
  - active task state is not duplicated across `general_issues_and_tasks.md`, `holistic_tasks.md`, and domain task files
  - completed proof/history lives only in `handoffs/` or `archive/` files
- Check size discipline:
  - `.agents/agents.md` stays small
  - `current_scratch_pad.md` stays current-session only
  - active task docs stay materially shorter than today

## Assumptions

- Preserve existing main filenames unless there is a strong reason not to.
- A small root `AGENTS.md` change is in scope because it is required for the new loading model.
- Archive files can stay in the repo; they only become a context problem if active docs route agents into them.
- The first cleanup target is the top-level and holistic docs, because that is where the current context waste is concentrated.
