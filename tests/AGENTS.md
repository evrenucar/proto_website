# tests

## Purpose
Node built-in test suite (`node:test`) covering build correctness, preview-server routes, export bundling, board behavior, and end-to-end Playwright flows.

## Read when
- Adding, moving, or debugging a test file.
- Diagnosing a CI failure or a failing test gate in any refactoring stage.
- Deciding where a new test should live (current flat layout vs. planned subdirs).

## Skip when
- Working on product features that have no test coverage yet.
- Reading planning docs or editing CSS/HTML — no tests live outside this directory.

## Canonical for
- Test naming convention (`<domain>-<scenario>[-e2e|-runtime|-build].test.mjs`).
- Which tests require a running preview server (Playwright / `spawn` tests).
- Planned subdir grouping (board / preview / export / build) — Stage 3 is pending.

## Key files
- `*.test.mjs` — all files picked up by `node --test tests/`; 23 files as of 2026-04-27.
- `_diag-*.mjs` — scratch diagnostic helpers; NOT run by `node --test`; may be archived in Stage 3.
- `preview-mode-smoke.mjs` — standalone Playwright smoke test; not a `node:test` file; requires a running preview server.
- `screenshot-markdown-indent.mjs` — one-off screenshot helper; not a `node:test` file.
- `A_test_description.md` — informal notes on test intent; not authoritative.

## Conventions
- Name new tests `<domain>-<scenario>[-e2e|-runtime|-build].test.mjs` (kebab-case throughout).
- Tests that spawn a preview server or use Playwright must be clearly commented at the top of the file.
- `_diag-` prefix means "scratch, not run by default" — do not rename existing diag files without checking Stage 3 plans.
- Stage 3 (pending) will create `tests/board/`, `tests/preview/`, `tests/export/`, `tests/build/` subdirs and move files there — do not pre-create those dirs now.

## See also
- [../AGENTS.md](../AGENTS.md) — root session workflow
- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 3 (test reorg) and Stage 4 (per-dir docs) detail
- [../scripts/AGENTS.md](../scripts/AGENTS.md) — build and preview scripts that tests exercise
