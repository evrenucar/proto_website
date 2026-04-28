# tests

## Purpose
Node built-in test suite (`node:test`) covering build correctness, preview-server routes, export bundling, board behavior, and end-to-end Playwright flows.

## Read when
- Adding, moving, or debugging a test file.
- Diagnosing a CI failure or a failing test gate in any refactoring stage.
- Deciding which subdir a new test belongs in.

## Skip when
- Working on product features that have no test coverage yet.
- Reading planning docs or editing CSS/HTML — no tests live outside this directory.

## Canonical for
- Test naming convention (`<domain>-<scenario>[-e2e|-runtime|-build].test.mjs`).
- Subdir grouping (board / preview / export / build / features).
- Which tests require a running preview server (Playwright / `spawn` tests).

## Layout (Stage 3 landed 2026-04-28)

| Subdir | Holds | Path-resolution helper |
| --- | --- | --- |
| `board/` | Whiteboard runtime: state, save/load, drag, paste, ESC, wheel, resize, markdown editor (9 files) | `process.cwd()`-relative |
| `preview/` | Preview server endpoints + smoke (4 files) | `process.cwd()`-relative |
| `export/` | Export bundling pipeline (3 files) | `export-bundling-runtime` uses `path.resolve(__dirname, "..", "..")`; others are cwd-relative |
| `build/` | `build-site.mjs` / `extract-assets.mjs` correctness (3 files) | `path.resolve(__dirname, "..", "..")` for `rootDir`; `../../scripts/...` for imports |
| `features/` | Cross-cutting feature E2Es: shared entities, markdown authoring, recommendation, YouTube (5 files) | `shared-entity-*` use `path.resolve(__dirname, "..", "..")` and `../../scripts/...` |

Diagnostic helpers (`_diag-*`, `screenshot-markdown-indent.mjs`, legacy `A_test_description.md`) live under `.archive/diag/` after Stage 3.

## Conventions
- Name new tests `<domain>-<scenario>[-e2e|-runtime|-build].test.mjs` (kebab-case throughout).
- Place new tests in the subdir matching their domain. Use `features/` for cross-cutting work.
- Tests that spawn a preview server or use Playwright must be clearly commented at the top of the file.
- `_diag-*` and one-off screenshot helpers belong in `.archive/diag/`, not in `tests/`.
- When adding a test under a subdir, decide upfront whether it uses `__dirname`-based or `process.cwd()`-based path resolution. Mixing them silently is the most common cause of "test passes locally, fails in CI" issues.

## See also
- [README.md](README.md) — running tests, layout details, server-spawning test list
- [../AGENTS.md](../AGENTS.md) — root session workflow
- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 3 (test reorg, **landed**) and Stage 4 (per-dir docs) detail
- [../.agents/holistic_planning/holistic_reviews/refactor_achievements.md](../.agents/holistic_planning/holistic_reviews/refactor_achievements.md) — Round 5 documents the Stage 3 landing
- [../scripts/AGENTS.md](../scripts/AGENTS.md) — build and preview scripts that tests exercise
- [../.archive/AGENTS.md](../.archive/AGENTS.md) — `_diag-*` archive location
