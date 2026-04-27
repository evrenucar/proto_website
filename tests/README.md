# tests/

Test suite for `proto_website`, using Node's built-in `node:test` runner. No test framework install required beyond `npm install` (which brings in Playwright as a dev dependency for end-to-end tests).

---

## Running tests

| Task | Command |
| --- | --- |
| Run all tests | `node --test tests/` |
| Run one test | `node --test tests/<file>.test.mjs` |
| Run a group (future) | `node --test tests/<subdir>/` |

> **Note:** Some tests spawn a local preview server internally. Others use Playwright and require Chromium, which is installed via `npx playwright install chromium` (run once after `npm install`).

---

## Current layout (flat, as of 2026-04-27)

All 23 `*.test.mjs` files live directly in `tests/`. Stage 3 of the refactoring plan (pending — separate PR) will reorganize them into domain subdirectories.

### Planned subdir grouping (Stage 3, not yet landed)

| Subdir | Test files that will move there |
| --- | --- |
| `tests/board/` | `board-save-*`, `board-url-*`, `cosmoboard-*`, `esc-deselect`, `markdown-wheel-routing`, `resize-handle-clipping`, `markdown-drag-and-title` |
| `tests/preview/` | `preview-*` |
| `tests/export/` | `export-*` |
| `tests/build/` | `*-build.test.mjs`, `extract-assets` |
| `tests/` (root) | `markdown-authoring-e2e`, `recommendation-flow-e2e`, `shared-entity-*`, `youtube-live-embed` (or a `features/` subdir if 4+ accumulate) |

Until Stage 3 lands, all tests remain at the flat root. **Do not pre-create these subdirs.**

---

## Tests that need a running preview server

These tests spawn their own server process via `node:child_process` — no manual startup needed:

- `preview-server-routes.test.mjs`
- `preview-markdown-endpoint.test.mjs`
- `preview-save-endpoint.test.mjs`
- `board-save-reload-e2e.test.mjs`
- `board-url-paste-preview-e2e.test.mjs`
- `board-save-export-runtime.test.mjs`
- `export-bundling-e2e.test.mjs`
- `export-bundling-runtime.test.mjs`
- `export-size-subpages-e2e.test.mjs`
- `shared-entity-runtime-e2e.test.mjs`
- `markdown-authoring-e2e.test.mjs`
- `recommendation-flow-e2e.test.mjs`
- `youtube-live-embed.test.mjs`

Playwright tests in this group import from `playwright` (a dev dependency). If Chromium is not installed, run `npx playwright install chromium` once.

---

## `_diag-*` files and other non-test helpers

| File | What it is |
| --- | --- |
| `_diag-cosmoboard-canvas.mjs` | Scratch diagnostic — dumps canvas state via Playwright |
| `_diag-real-mouse.mjs` | Scratch diagnostic — records real mouse events |
| `_diag-stateful.mjs` | Scratch diagnostic — inspects stateful board behavior |
| `_diag-zoom-followup.mjs` | Scratch diagnostic — zoom edge-case investigation |
| `preview-mode-smoke.mjs` | Standalone Playwright smoke test; not a `node:test` file; requires a running preview server at `localhost:4173` |
| `screenshot-markdown-indent.mjs` | One-off screenshot helper for markdown indent regression |
| `A_test_description.md` | Informal notes — not authoritative documentation |

`_diag-*` files are **not** picked up by `node --test tests/` (the leading underscore is intentional). They are scratch helpers used during debugging sessions. Stage 3 will decide whether to archive them or move them to `tests/_diag/`.

---

## Naming convention for new tests

```
<domain>-<scenario>[-e2e|-runtime|-build].test.mjs
```

- `e2e` — requires Playwright and a preview server.
- `runtime` — runs in-process but exercises live server endpoints.
- `build` — exercises `scripts/build-site.mjs` or asset pipeline; no server needed.
- No suffix — pure unit test or static assertion.

---

## See also

- [AGENTS.md](AGENTS.md) — agent routing for this directory
- [../AGENTS.md](../AGENTS.md) — root session workflow
- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 3 (test reorg) and Stage 4 (per-dir docs) detail
- [../scripts/README.md](../scripts/README.md) — scripts exercised by these tests
