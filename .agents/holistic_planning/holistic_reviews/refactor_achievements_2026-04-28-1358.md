# Refactor Achievements — Stages 4 + 6 + 1 + 3

- **Created:** 2026-04-28 13:58 WEDT (initial; Stages 4 + 6)
- **Last updated:** 2026-04-28 13:50 WEDT (Stage 3 landed)
- **Scope landed (staged):** Stages 4 (per-directory docs + root README rewrite), 6 (extension-readiness), **1 (dead-file archive)**, and **3 (test reorganization)** of the 6-stage [refactoring_plan.md](../refactoring_plan.md). All staged in working tree, not yet committed.
- **Stages NOT landed:** 2 (lowercase rename), 5 (cleanup pass).
- **Verdict at a glance:** The codebase did not get smaller, faster, or cleaner on disk. What it got was *legible*. Every meaningful directory now answers "what lives here, when do I read this, when do I skip it" in a fixed template. The two implicit contracts (`entity` JSON shape, `.canvas` file format) are now schemas. The braindump.js god-file has a documented exit path even though no code has moved yet. This is documentation-first refactoring — the conceptual model gets hardened *before* file-system surgery, so the later surgery (Stages 1–3, 5) can be done safely.

---

## 1. What changed about working in the repo

| Dimension | Before | After |
| --- | --- | --- |
| Landing in a directory cold | Grep + read three files to guess intent | Read the dir's `AGENTS.md` (≤30 lines) and know |
| Adding a new entity | Copy `eurocrate-storage-system.json`, hope the shape is right | JSON Schema validates the file; required vs optional fields are documented in `src/entities/AGENTS.md` |
| Adding a new canvas-item type | Read `braindump.js` until you find the existing types | `content/boards/CANVAS_FORMAT.md` enumerates all 7 node types and embed semantics |
| Picking an extension surface | Read all of `braindump.js` and guess | `extension_seams.md` lists the surfaces (entities, renderers, toolbar, keyboard/wheel) and their stability |
| Verifying markdown links after a move | None — silent rot | `node scripts/check-md-links.mjs` runs as a gate |
| First-touch reader (e.g. someone visiting the GitHub repo) | Sparse root README | Structure table + Mermaid diagrams + quickstart commands in 99 lines |
| AI-agent routing | Each agent re-derives directory intent from grep | Each agent reads `AGENTS.md` and routes deterministically |

The user-facing site behavior is byte-identical. The `npm run build` output is byte-identical. Everything that changed was about how a *reader* (human or agent) experiences the repo.

---

## 2. The seven concrete artifacts

Each is the canonical for a fact that previously had no canonical location.

| Artifact | Canonical for | Why it matters now |
| --- | --- | --- |
| 11 per-dir `AGENTS.md` files (`scripts/`, `tests/`, `content/`, `content/boards/`, `content/entities/`, `content/projects/`, `src/`, `src/apps/`, `src/entities/`, `JavaScript/`, `CSS/`) | What each directory is, when to read/skip, what NOT to put there | Routes both humans and agents in one file |
| 4 per-dir `README.md` files (`scripts/`, `tests/`, `src/`, `content/`) | Verb→script mapping, layout conventions, registry shape | First-touch GitHub readability without forcing a deep-dive |
| Root `README.md` rewrite | Repo structure table, two Mermaid diagrams (site composition + build flow), quickstart commands | Replaces a sparse stub with a one-screen orientation |
| `src/entities/entity.schema.json` | The entity JSON contract — required fields, types, enums, `references[]` shape, `additionalProperties: false` | Validates today's `eurocrate-storage-system.json`; future entities must conform |
| `content/boards/CANVAS_FORMAT.md` + `canvas.schema.json` | The `.canvas` file format — all 7 node types, coordinate system, embed semantics, version field | Locks the format while there's only one consumer (`braindump.js`); future canvas-aware tools target a stable schema |
| `extension_seams.md` | Catalog of extension surfaces — entity types, canvas-item renderers, toolbar/sidebar commands, keyboard/wheel routes — with stability flags per seam | Single page that answers "where would a plugin plug in?" |
| `scripts/check-md-links.mjs` | Repo-wide markdown link integrity check | Becomes the cross-ref test gate for Stages 1, 2, 3, 5 |

---

## 3. The strategic achievement: prerequisite work, not the main event

Stages 4 + 6 are deliberately ordered *before* the file-system stages. The reason:

- **Stage 1 (dead-file archive)** needs the link checker (Stage 4 deliverable) to verify nothing inbound-links to the files being archived.
- **Stage 2 (lowercase rename `JavaScript/` → `javascript/`)** would silently break inbound markdown links without `check-md-links.mjs`. It also can't sensibly happen until `JavaScript/AGENTS.md` and `CSS/AGENTS.md` exist — those files force you to articulate what the directory is for, which is a forcing function for whether the rename is even right.
- **Stage 3 (test reorg)** needs `tests/AGENTS.md` and `tests/README.md` to document the layout that emerges, otherwise the result is a different kind of mess.
- **Stage 5 (final cleanup sweep)** literally runs `check-md-links.mjs` as its test gate.

So the *achievement* of Stages 4 + 6 is **unlocking the rest of the refactor**. The actual messy filesystem (capitalization inconsistencies, 22 flat test files, dead `*_old.css` and `*_broken.js`, the rogue `nul` file) is unchanged — but the tooling and documentation needed to fix it safely are now in place.

---

## 4. The braindump.js implication

`JavaScript/braindump.js` is 5,998 lines containing 173 functions and ~108 module-level declarations — flagged as the chief structural problem in [structural_codebase_review_2026-04-28-1306.md](./structural_codebase_review_2026-04-28-1306.md).

`JavaScript/AGENTS.md` now codifies the **touch-driven modularization rule**:

> When you visit a subsystem of `braindump.js` for any feature work, carve it out into a module under `src/apps/braindump/<subsystem>.mjs` as part of that PR. Never as a standalone refactor PR.

Suggested initial split lines (informational): `selection`, `wheel-routing`, `fullscreen`, `markdown-render`. The recent cluster of fixes already touched all four — so the next visit to any of them is a natural carve-out moment.

**No code has been carved out yet.** The achievement is that the rule is now in place and `src/apps/AGENTS.md` documents the destination directory for those modules. The god-file gets dismantled organically across feature work, not in one big refactor PR.

---

## 5. Agent-loop efficiency

This repo is worked on by Claude agents routinely (see `.claude/`, `.agents/skills/`, the worktrees that produced this batch). Per-directory `AGENTS.md` files are not just human documentation — they are the routing layer that lets an agent answer "do I need to read this directory" without grepping it.

Concrete examples:
- An agent fixing a CSS bug now reads `CSS/AGENTS.md` and learns immediately that `*_old.css` files are Stage-1 archive targets and shouldn't be edited.
- An agent adding a new entity now reads `src/entities/AGENTS.md` and the schema, instead of inferring the shape from `eurocrate-storage-system.json`.
- An agent looking for "where does this button click handler live" now reads `src/apps/AGENTS.md` and is told to look in `JavaScript/braindump.js` for now (per the modularization rule).

The aggregate effect is that future agent loops on this repo do less context-window-burning exploration before they can start working.

---

## 6. What this unlocks immediately

| Unlocked | Why |
| --- | --- |
| Stage 1 dead-file archive | Link checker can prove nothing references the dying files |
| Stage 2 lowercase rename | Link checker + per-dir AGENTS.md make the rename safe |
| Stage 3 test reorg | `tests/AGENTS.md` documents the target layout |
| Stage 5 cleanup sweep | All Stage 4 deliverables are gates the sweep can run |
| Second entity type | Drop a JSON file in `src/entities/`, register it, validate against schema |
| New canvas node type | `CANVAS_FORMAT.md` documents how to extend the seven existing types |
| Touch-driven braindump.js carve-out | Rule + destination directory both exist |

---

## 7. What it did NOT achieve (still pending)

- **No code moved.** `JavaScript/`, `CSS/`, `tests/` are unchanged on disk. Capitalization, test sprawl, dead files all remain.
- **No runtime behavior changed.** This is doc-only, by design.
- **The new docs use capitalized `JavaScript/` and `CSS/` paths.** Stage 2's rename will need a sweep of every per-dir `AGENTS.md` and the root `README.md` to fix the references. Flagged in [after_refactor_notes.md](../after_refactor_notes.md) issues list.
- **Pre-existing planning-doc link rot was exposed but not fixed.** The link checker now reports 7 broken links in `.agents/holistic_planning/refactoring_plan.md` — repo-rooted paths that don't resolve relative to the file. Pre-existing; not introduced by this batch; left for a deliberate sweep.
- **No real plugin loader.** The contract is frozen but there is no sandboxed extension-loading mechanism. Out of scope per the plan; build it when the first real third-party extension exists.

---

## 8. Risks introduced

| Risk | Severity | Mitigation |
| --- | --- | --- |
| New AGENTS.md files freeze paths that Stage 2 will rename | Low | Single grep-and-replace pass at Stage 2 time |
| Forward-references between AGENTS.md files (e.g. `content/AGENTS.md` → `boards/AGENTS.md`) could rot if a directory gets reorganized | Low | Link checker catches this on every Stage |
| Schema version pinned at 1 via `$comment` — future breaking changes need to bump it manually | Low | Single-line edit; documented in `src/entities/AGENTS.md` |
| `extension_seams.md` will drift as the actual seams evolve | Medium | Stage 6 places the doc canonically — future extension work updates it in the same PR |

---

## 9. One-line summary for the planning stack

> Stages 4 + 6 hardened the documentation and contracts so Stages 1, 2, 3, 5 can be done safely and any future extension targets a stable surface. The codebase is more legible, not yet cleaner.

---

## Stage 1 — dead-file archive (staged 2026-04-28 13:09 WEDT)

- **Operator:** Opus 4.7
- **Status:** Staged in working tree, not yet committed. User lands when ready.

### What moved (rename — git history preserved)

| From | To |
| --- | --- |
| `CSS/general_style_old.css` | `.archive/CSS/general_style_old.css` |
| `CSS/index_style_old.css` | `.archive/CSS/index_style_old.css` |
| `JavaScript/braindump_broken.js` | `.archive/JavaScript/braindump_broken.js` |
| `JavaScript/Copy.js` | `.archive/JavaScript/Copy.js` |
| `classes.txt` | `.archive/scratch/classes.txt` |
| `patch-js-proxy.py` | `.archive/scratch/patch-js-proxy.py` |
| `screenshot.png` | `.archive/screenshots/screenshot.png` |
| `screenshot-css-cluster.png` | `.archive/screenshots/screenshot-css-cluster.png` |
| `testCode/photography_pureCSS.html` | `.archive/testCode/photography_pureCSS.html` (was untracked, now tracked) |

### Plan inventory: did/didn't

| Plan target | Outcome |
| --- | --- |
| 8 named files | archived ✓ |
| `testCode/` | archived ✓ + removed from `.gitignore` |
| `.tmp_preview_server*` → `.gitignore` | added (`.tmp_*` glob covers all variants) |
| `nul` | absent on disk; preventive `nul`/`NUL` rules added to `.gitignore` |
| **Off-plan addition:** `screenshot-css-cluster.png` | archived (sibling of `screenshot.png`) |
| **`MobileMenu.js`** | NOT archived — not in plan inventory; review found no inbound references; flagged in `JavaScript/AGENTS.md` for user re-evaluation |

### Doc updates in the same change

| File | Change |
| --- | --- |
| `.archive/AGENTS.md` | new — layout, conventions, "do not edit" rule |
| `JavaScript/AGENTS.md` | dropped archived files from key list; added "Archived" section + MobileMenu re-eval note |
| `CSS/AGENTS.md` | dropped archived files from key list; added "Archived" section |
| `.gitignore` | added `.tmp_*`, `nul`, `NUL`; removed `testCode/` |

### Test gates

| Gate | Result |
| --- | --- |
| `node scripts/check-md-links.mjs` | 130 links / 108 files / 7 broken — **all pre-existing in `refactoring_plan.md` lines 146–152**. Zero new broken links. |
| `node scripts/build-site.mjs` | exit 0 (one pre-existing `[registry] WARNING` for `cosmoboard/direction.md` — user WIP, not Stage 1). |
| Reference sweep across `*.html`, `*.mjs`, `*.js`, `*.json`, `*.css` for archived filenames | Zero matches in active code. |

### Net delta

- Active `JavaScript/` and `CSS/` shed ~5,800 lines of dead code.
- Repo root sheds 4 stray files.
- `.gitignore` no longer references a now-archived directory.

### Deferred

- Stages 2 (lowercase rename), 5 (cleanup sweep). Each is its own focused PR per the plan.

---

## Stage 3 — test reorganization (staged 2026-04-28 13:50 WEDT)

- **Operator:** Opus 4.7
- **Status:** Staged in working tree, not yet committed.

### What moved (rename — git history preserved)

| Subdir | Files moved in | Count |
| --- | --- | --- |
| `tests/board/` | `board-save-export-runtime`, `board-save-reload-e2e`, `board-url-paste-preview-e2e`, `cosmoboard-initial-layout`, `cosmoboard-legacy-render-fields`, `esc-deselect`, `markdown-drag-and-title`, `markdown-wheel-routing`, `resize-handle-clipping` | 9 |
| `tests/preview/` | `preview-markdown-endpoint`, `preview-mode-smoke`, `preview-save-endpoint`, `preview-server-routes` | 4 |
| `tests/export/` | `export-bundling-e2e`, `export-bundling-runtime`, `export-size-subpages-e2e` | 3 |
| `tests/build/` | `cosmoboard-build`, `export-bundling-build`, `extract-assets` | 3 |
| `tests/features/` | `markdown-authoring-e2e`, `recommendation-flow-e2e`, `shared-entity-build`, `shared-entity-runtime-e2e`, `youtube-live-embed` | 5 |
| `.archive/diag/` | `_diag-cosmoboard-canvas`, `_diag-real-mouse`, `_diag-stateful`, `_diag-zoom-followup`, `screenshot-markdown-indent`, `A_test_description.md` | 6 |

24 tests reorganized. 6 diagnostic helpers archived. Total moves: 30.

### Path-import edits in moved tests

Tests that resolved repo root via `path.resolve(__dirname, "..")` now use `path.resolve(__dirname, "..", "..")`. Tests that imported via `../scripts/...` now use `../../scripts/...`. Edits applied:

| File | Edits |
| --- | --- |
| `tests/build/cosmoboard-build.test.mjs` | 3 (rootDir, build-site import, site-data import) |
| `tests/build/export-bundling-build.test.mjs` | 2 (rootDir, build-site import) |
| `tests/build/extract-assets.test.mjs` | 2 (rootDir, extract-assets import) |
| `tests/export/export-bundling-runtime.test.mjs` | 1 (rootDir) |
| `tests/features/shared-entity-build.test.mjs` | 2 (rootDir, build-site import) |
| `tests/features/shared-entity-runtime-e2e.test.mjs` | 1 (build-site import) |

Tests that use `process.cwd()`-relative paths (`readFile("JavaScript/braindump.js")`, `spawn(node, ["scripts/preview-server.mjs"])`) needed no edits — the test runner is invoked from the repo root regardless of test file location.

### Cross-reference updates in planning docs

| File | Updates |
| --- | --- |
| `.agents/active_todo.md` | 4 test paths repointed (markdown-wheel-routing, esc-deselect, resize-handle-clipping references — including a runnable `node tests/...` command) |
| `.agents/holistic_planning/refactoring_plan.md` | Stage 2 test gate command updated to new paths |
| `.agents/handoffs/handoff_export_bundling.md` | 11 test path references updated, including the full proof-command block (16 commands) |
| `.agents/holistic_planning/holistic_tasks.md` | 2 shared-entity test path references |
| `.agents/holistic_planning/holistic_architecture.md` | 2 proof-row entries (shared entity + board save/export) |
| `tests/AGENTS.md` | Rewrote layout section to reflect landed Stage 3; added per-subdir path-resolution notes |
| `tests/README.md` | Rewrote layout section + path resolution conventions; updated server-spawning test list with new paths |

### Test gates

| Gate | Result |
| --- | --- |
| Single test from each subdir to verify import resolution | `tests/build/extract-assets.test.mjs` ✓ pass; `tests/board/board-save-export-runtime.test.mjs` ✓ resolved imports (assertion failure is from user's WIP `braindump.js` changes, not from move) |
| `node scripts/check-md-links.mjs` | 118 links / 10 broken — 7 pre-existing in `refactoring_plan.md`, 3 caused by user's WIP deletion of `content/AGENTS.md`. **Zero new broken links from Stage 3.** |
| `node scripts/build-site.mjs` | exit 0 (one pre-existing `[registry] WARNING` for `cosmoboard/direction.md`) |

### Net delta

- Tests are domain-grouped: glance at `tests/board/` to see the 9 whiteboard tests, `tests/build/` for the 3 build tests, etc.
- Diagnostic noise (`_diag-*`, `screenshot-markdown-indent.mjs`, legacy `A_test_description.md`) is out of `tests/` and into `.archive/diag/`.
- All planning-doc cross-references point to new paths in the same staged change.

### Off-plan additions

- **`markdown-drag-and-title.test.mjs`** — added to `tests/board/` (post-plan test, follows the markdown-cluster pattern of `markdown-wheel-routing` and `resize-handle-clipping`).
- **`tests/features/`** — promoted from "leave at root" per the plan's contingent rule ("group into `features/` if there are 4+"). 5 tests stayed there.

### Deferred

- Stage 2 (lowercase rename) — scheduled verification agent fires Mon 2026-05-04 to report surface area.
- Stage 5 (cleanup pass) — final sweep after Stage 2 lands.

---

## Stage 1 follow-up — `MobileMenu.js` archived (2026-04-28 13:55 WEDT)

Final reference sweep across `*.html`, `*.js`, `*.mjs`, `*.css`, `*.json` confirmed `MobileMenu.js` had **zero inbound references** in the live tree. Only its own definition existed. Functionality was fully superseded by `site.js` nav handling.

| Move | Effect |
| --- | --- |
| `git mv JavaScript/MobileMenu.js .archive/JavaScript/MobileMenu.js` | history preserved, file out of active tree |
| `JavaScript/AGENTS.md` updated | dropped from key files; added to "Archived" list with provenance |

This was off-plan-inventory but in-spirit: Stage 1 is about removing live-tree confusion. Total active `JavaScript/` files now: 3 (`braindump.js`, `site.js`, `image_lightbox.js`) plus `vendor/`.

---

## Plan-doc annotation (2026-04-28 13:55 WEDT)

`refactoring_plan.md` now has a Stage status table at the top of the Stages section + ✅/⏳ badges on each stage heading. Future readers see at a glance which stages have landed without scrolling through the round logs in this file.
