# tests/

Test suite for `proto_website`, using Node's built-in `node:test` runner. No test framework install required beyond `npm install` (which brings in Playwright as a dev dependency for end-to-end tests).

---

## Running tests

| Task | Command |
| --- | --- |
| Run all tests in a domain | `node --test tests/board/*.test.mjs` (or `tests/preview/*.test.mjs`, `tests/export/*.test.mjs`, `tests/build/*.test.mjs`, `tests/features/*.test.mjs`) |
| Run one test | `node --test tests/<subdir>/<file>.test.mjs` |
| Run everything | `node --test tests/**/*.test.mjs` (shell glob expansion) |

> Node's `--test` does not recursively discover files when passed a directory — pass an explicit glob or a file list.

> **Note:** Some tests spawn a local preview server internally. Others use Playwright and require Chromium, which is installed via `npx playwright install chromium` (run once after `npm install`).

---

## Layout (Stage 3 landed 2026-04-28)

| Subdir | Purpose | Files |
| --- | --- | --- |
| `tests/board/` | Whiteboard / Cosmoboard runtime: state, save/load, drag/drop, paste, ESC, wheel routing, resize, markdown editor | 9 |
| `tests/preview/` | Preview server endpoints + smoke test | 4 |
| `tests/export/` | Export bundling pipeline | 3 |
| `tests/build/` | `scripts/build-site.mjs` / `scripts/extract-assets.mjs` correctness | 3 |
| `tests/features/` | Cross-cutting feature E2Es: shared entities, markdown authoring, recommendation flow, YouTube embed | 5 |

24 tests total. Diagnostic helpers (`_diag-*`, `screenshot-markdown-indent.mjs`) and the legacy `A_test_description.md` were archived to `.archive/diag/` in the same change.

---

## Tests that need a running preview server

These tests spawn their own server process via `node:child_process` — no manual startup needed:

- `tests/preview/preview-server-routes.test.mjs`
- `tests/preview/preview-markdown-endpoint.test.mjs`
- `tests/preview/preview-save-endpoint.test.mjs`
- `tests/preview/preview-mode-smoke.mjs` (Playwright smoke; needs preview server already on `:4173`)
- `tests/board/board-save-reload-e2e.test.mjs`
- `tests/board/board-url-paste-preview-e2e.test.mjs`
- `tests/board/board-save-export-runtime.test.mjs`
- `tests/export/export-bundling-e2e.test.mjs`
- `tests/export/export-bundling-runtime.test.mjs`
- `tests/export/export-size-subpages-e2e.test.mjs`
- `tests/features/shared-entity-runtime-e2e.test.mjs`
- `tests/features/markdown-authoring-e2e.test.mjs`
- `tests/features/recommendation-flow-e2e.test.mjs`
- `tests/features/youtube-live-embed.test.mjs`

Playwright tests in this group import from `playwright` (a dev dependency). If Chromium is not installed, run `npx playwright install chromium` once.

---

## Path resolution conventions

Tests that need to resolve repo paths via `__dirname` use **two-level traversal** because of the subdir layout:

```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const { build } = await import(new URL(`../../scripts/build-site.mjs?test=${Date.now()}`, import.meta.url));
```

Tests that use `process.cwd()`-relative paths (e.g. `readFile("JavaScript/braindump.js")` or `spawn(node, ["scripts/preview-server.mjs"])`) work unchanged — they assume the runner is invoked from the repo root.

---

## Naming convention for new tests

```
<domain>-<scenario>[-e2e|-runtime|-build].test.mjs
```

- `e2e` — requires Playwright and a preview server.
- `runtime` — runs in-process but exercises live server endpoints.
- `build` — exercises `scripts/build-site.mjs` or asset pipeline; no server needed.
- No suffix — pure unit test or static assertion.

Place the file in the subdir matching its domain. If a test cuts across domains (e.g. shared entity E2E), put it in `tests/features/`.

---

## See also

- [AGENTS.md](AGENTS.md) — agent routing for this directory
- [../AGENTS.md](../AGENTS.md) — root session workflow
- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 3 (test reorg, **landed**) and Stage 4 (per-dir docs) detail
- [../.agents/holistic_planning/holistic_reviews/refactor_achievements.md](../.agents/holistic_planning/holistic_reviews/refactor_achievements.md) — Round 5 documents the Stage 3 landing
- [../.archive/AGENTS.md](../.archive/AGENTS.md) — `_diag-*` and one-off helpers were moved to `.archive/diag/`
- [../scripts/README.md](../scripts/README.md) — scripts exercised by these tests
