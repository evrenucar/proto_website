# feature_implementation/

Per-feature implementation specs. One markdown file per feature. The same file is the source of truth from initial design through MVP, testing, and final acceptance.

## Read when

- You are about to implement a new feature.
- You are continuing or reviewing work on an in-flight feature.
- You need to know how a shipped feature was scoped, tested, and accepted (look in `archived/`).

## Skip when

- Doing a quick bug fix that does not warrant a new spec.
- Working on cross-cutting refactors. Use `holistic_planning/` instead.

---

## Folder layout

```
feature_implementation/
  README.md                  this file
  <feature_name>.md          one file per feature, lives here while in flight
  <feature_name>-plan.md     optional close-out plan for that feature (see below)
  archived/                  completed and accepted features moved here
```

The optional `<feature_name>-plan.md` file is for capturing a focused close-out plan when the feature is mid-flight — what's left, what's deferred, what blocks user verification. Use it when the feature spec has grown large and the "what to do next" lives in the agent's head instead of on disk. Skip it for small features where the todo list in the spec is enough. The plan file moves to `archived/` alongside the spec on ship.

Tests and reports live outside this folder, but are referenced from each feature file:

- New tests go in `tests/<domain>/` (see `tests/README.md` for the naming convention and subdir map). Each feature spec links to the test files it adds.
- Test run reports go in `test-results/` with a dated filename. Each feature spec links to its latest report.

---

## Workflow for a new feature

Each feature file must contain these sections, in this order, all under the same markdown file. Do not skip any section. If a section does not yet apply, leave it with a `TBD` placeholder so the gap is visible.

### 1. Feature Detail

Full description of the feature: purpose, behavior, required state, edge cases, performance and safety constraints, and acceptance criteria. This is the design surface. Write it before any code.

This section answers the question: "If a different agent picked this up cold, would it know what to build and what not to build?"

**Prioritize diagrams.** Prose alone is not enough for any feature with state transitions, branching logic, or multi-step flow. Before writing prose, ask: "is there a diagram that would make this obvious?" If yes, draw it first and let the prose annotate it.

Required diagram types, in priority order:

1. **State diagram** — for any feature with named states or a "wasShiftHeld"-style mode flag. Show every state, every transition, and the trigger for each transition.
2. **Flow diagram** — for any feature with branching control flow (e.g. "if Shift held and tool is pen and stroke active, then..."). Make the early-return paths explicit.
3. **Sequence diagram** — for any feature where multiple actors or events interact across time (pointer events, keyboard events, render passes, network calls).
4. **Data-shape diagram** — for any feature that mutates a structured object (e.g. how `currentStroke` is composed from `preservedStroke + lineStartPoint + endPoint`). A short ASCII or boxed sketch is fine.

Use Mermaid fenced code blocks (` ```mermaid `) where possible — they render in GitHub and most markdown previewers. Fall back to ASCII art for layouts Mermaid does not handle well. Keep diagrams close to the prose they describe; do not collect them all at the bottom.

A feature spec without at least one diagram is the exception, not the default. If you choose to skip diagrams, justify it in one line ("trivial pure function, no state, no branching").

### 2. MVP Scope

The smallest slice of the feature that can be implemented and validated independently. The MVP must:

- Cover the core behavior, not optional improvements.
- Be testable without the user manually trying it.
- Be reachable in a single implementation pass.

List explicitly what is in scope and what is deferred. Deferred items should not be deleted, they should move to an `Optional / Follow-ups` section so they are not lost.

### 3. Todos

Granular, ordered, trackable. Use the project status legend:

- `[ ]` pending
- `[A]` agent-confirmed-done (implementation finished, tests pass)
- `[x]` user-verified-done (user has confirmed the feature works as intended)

Todos should map roughly one-to-one onto commits or focused edits. If a todo is too large to verify in one pass, split it.

### 4. Tests

Tests must validate the feature independently of the user. No "manually click around and see if it looks right" steps in this section. Acceptance is mechanical.

For each test:

- Name the test file (path relative to repo root, e.g. `tests/board/board-shift-snap.test.mjs`).
- Describe what behavior it asserts.
- Note whether it spawns a preview server, uses Playwright, or runs as a pure unit test.

Follow the test naming convention from `tests/README.md`: `<domain>-<scenario>[-e2e|-runtime|-build].test.mjs`.

When a test file is created, link to it from this section so the spec and the test stay coupled.

### 5. Test Reports

After a test run, write the report to `test-results/<feature_slug>_<YYYY-MM-DDTHH-MM-SSZ>.md` and link it here. Keep the most recent report at the top. Do not paste the full report into the feature file — link only.

Each linked report should record:

- Date and commit hash of the run.
- Pass/fail status per test.
- Failures and the diagnosis, if any.
- Whether the MVP acceptance criteria from section 2 were met.

### 6. Optional / Follow-ups

Anything explicitly deferred from the MVP. Each item should be small enough that it could become its own future feature file or a `holistic_backlog.md` entry.

---

## Lifecycle

1. Create `<feature_name>.md` in this folder. Fill in section 1 (Feature Detail) and section 2 (MVP Scope) before writing any code.
2. Add todos in section 3 and start implementation.
3. Add tests in section 4 alongside the implementation. Tests for a todo should land in the same change as the todo.
4. After tests pass, write a report under `test-results/` and link it in section 5.
5. When the user has verified the feature works as intended (todos all `[x]`), move the feature file to `archived/`. Test files and reports stay in their respective folders.

---

## Conventions

- One feature per file. Do not bundle features. If two features share state, they can cross-reference each other but each gets its own spec.
- File names are kebab-case or snake_case, lowercase, no dates: `straight-line-shift-snap.md`, not `2026-04-29-shift-snap.md`.
- Keep prose tight. Bullet lists and short sections beat long paragraphs.
- Do not duplicate `project.md` or `holistic_planning/` content. Link to it.
- When archiving, do not edit the feature file beyond adding a final "Shipped" line at the top with the date and the commit or PR reference.

---

## See also

- [`../agents.md`](../agents.md) — top-level agent router
- [`../project.md`](../project.md) — durable product facts and constraints
- [`../../tests/README.md`](../../tests/README.md) — test runner, naming, layout
- [`../../tests/AGENTS.md`](../../tests/AGENTS.md) — when to read the tests directory
