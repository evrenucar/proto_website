# Structural Codebase Review — proto_website

- **Created:** 2026-04-28 13:06 WEDT
- **Reviewer:** Opus 4.7 (single-pass, agent-assisted exploration)
- **Scope:** Repo structure, code organization, readability, expandability. Not feature correctness, not security.
- **Companion docs:** [refactor_achievements.md](./refactor_achievements.md) — what Stages 4 + 6 of [`refactoring_plan.md`](../refactoring_plan.md) already shipped (doc-first hardening). Read that first. This review is a *fresh structural snapshot* taken AFTER those docs landed; some risks below (god-file, HTML duplication, dead files) are already mapped to plan stages.
- **Verdict at a glance:** Folders and docs read well (Stages 4 + 6 already paid for that). Code does not. The whiteboard is a 6 kLOC god-file with no module boundaries, HTML pages duplicate ~840 lines of nav/meta boilerplate, and several legacy files (`braindump_broken.js`, `Copy.js`, `MobileMenu.js`, `*_old.css`, `nul`, `screenshot*.png`, `.tmp_*`) sit committed in the tree — all queued for Stage 1 of the refactor plan but not yet executed.

---

## 1. Top-level layout

**What works:**
- Conventional folders for a hybrid static site: `JavaScript/`, `CSS/`, `content/`, `scripts/`, `tests/`, `image/`, `favicon/`, `.github/`, `docs/`.
- `.agents/` directory cleanly partitions long-lived planning docs from session state.
- CI is real: `.github/workflows/build-site.yml` runs hourly + on push.

**Cruft committed to the repo (delete candidates):**
- `nul` (Windows null-device artifact, 0 bytes — `git status` already lists this)
- `screenshot.png`, `screenshot-css-cluster.png` — debugging screenshots
- `.DS_Store` (macOS)
- `.tmp_preview_server.err`, `.tmp_preview_server.log`, `.tmp_preview_server_pid`, `.tmp_preview_server.err.log`, `.tmp_preview_server.out.log`, `.tmp_preview_server_stderr.log`, `.tmp_preview_server_stdout.log` — runtime logs from the preview script. `.gitignore` covers `.tmp/` but not `.tmp_*`.
- `classes.txt`, `patch-js-proxy.py` — orphaned working files at root

`.gitignore` should grow `.tmp_*`, `*.png` at root (or move screenshots under `image/`), `nul`, `.DS_Store`.

---

## 2. JavaScript organization

| File | Lines | Status |
| --- | --- | --- |
| `JavaScript/braindump.js` | 5,998 | Active — god-file |
| `JavaScript/braindump_broken.js` | 5,644 | **Dead** — orphaned snapshot |
| `JavaScript/site.js` | 717 | Active — nav + theme + email copy |
| `JavaScript/Copy.js` | 19 | **Dead** — superseded by `site.js` |
| `JavaScript/image_lightbox.js` | 21 | Active |
| `JavaScript/MobileMenu.js` | 8 | **Dead** — superseded by `site.js` |
| `JavaScript/vendor/fflate.min.js` | minified | Active (bundling lib) |

**~12.4 kLOC of JS, 60% in one file.** No ES modules, no IIFE, no namespacing — everything is global scope inside one large `mountCosmoboard(hostElement)` closure starting at `JavaScript/braindump.js:257`.

`braindump.js` contains **173 functions** and ~108 module-level `let`/`const` declarations. Concerns are interleaved end-to-end:

- Camera + pan + draw state declared near the top
- Paste handler at `:5697`
- Wheel/zoom at `:2083`
- `placeToolNodeAt` at `:2017`
- `createNode` at `:3310`
- `attachMarkdownEditor` (~600 lines)
- `renderNode` (~390 lines), `renderLinkNode` (~150 lines)
- Markdown DB rendering, fullscreen viewer, undo/redo, save/load, export bundling — all in the same file

There is no factory or registry for node types. Adding one (say "video card") requires touching `createNode`, `renderNode`, paste, drag, draw, save/load serialization, and likely CSS. That's the single biggest expandability tax in the repo.

---

## 3. CSS organization

| File | Lines |
| --- | --- |
| `CSS/braindump.css` | 2,385 |
| `CSS/site.css` | 2,088 |
| `CSS/general_style.css` | 108 |
| `CSS/general_style_old.css` | 78 (**dead**) |
| `CSS/index_style.css` | 39 |
| `CSS/index_style_old.css` | 30 (**dead**) |
| 6 page-specific files | ~420 |
| **Total** | ~5,150 |

CSS is split per-page. Two of the files are explicitly named `_old`. There's no component scoping (no CSS Modules, no BEM systematically applied — though many `.bd-*` classes follow a prefix convention). `braindump.css` carries every visual concern of the whiteboard in one document.

---

## 4. HTML page duplication

**12 root HTML files** (`index`, `braindump`, `cosmoboard`, `projects`, `photography`, `things_i_do`, `cool-bookmarks`, `open-quests`, `travels`, `coming_soon`, `random`, `404`).

Every page repeats the same ~70–80 lines of `<head>` (meta, OG, Twitter, favicon manifest, theme-toggle inline script) and the same nav sidebar. Conservatively **~840 duplicated lines**. Changing the nav requires editing 12 files. There is no template engine in use at runtime, and `scripts/build-site.mjs` (2,486 lines) does not appear to drive these root pages — they're hand-maintained.

This is the single highest-leverage win for "site-wide" changes (theme, nav restructure, meta tags, analytics).

---

## 5. `.agents/` documentation system

The recent restructure (per `current_scratch_pad.md` end-of-session 2026-04-26) is in good shape:

- `.agents/agents.md` is a 43-line router (task type → which doc to read).
- `holistic_planning/` is split: `planning`, `architecture`, `backlog`, `tasks`, `research`, `archive`, plus auxiliary `extension_seams.md`, `refactoring_plan.md`, `after_refactor_notes.md`. Note: `holistic_reviews/` is being added by this report.
- Domain folders: `whiteboard/` (7 files), `page_database/` (2), `handoffs/` (1), `skills/` (17 subdirs).
- Root `AGENTS.md` correctly limits agent startup reading to the three core files.

Routing is documented but **not enforced** — it's a convention, not code. That's fine and intentional, but the system relies on agents actually following the router instead of grep-loading files. Worth a periodic spot-check.

The split appears complete and coherent. No action item here other than: keep `holistic_planning/holistic_tasks.md` lean as designed.

---

## 6. `scripts/` and `content/`

`scripts/` (~4.7 kLOC):
- `build-site.mjs` (2,486) — page generation
- `sync-notion.mjs` (1,430) — Notion → JSON/MD pipeline
- `preview-server.mjs` (396) — dev server with board save endpoint
- `extract-assets.mjs`, `dev-server.mjs`, `check-md-links.mjs` — utilities

`content/` is data-shaped: `boards/`, `apps/`, `entities/`, `projects/`, `cool-bookmarks/`, `open-quests/`, `base-data/`. Good separation of code vs. data. The build pipeline shape (Notion sync → JSON → static HTML, hourly cron via GitHub Actions) is sensible for a personal site.

Worth noting: `dev-server.mjs` (73 lines) appears to overlap with `preview-server.mjs` (396 lines). Confirm one is dead and remove.

---

## 7. Tests

**27 test files + 4 diagnostics, ~3.7 kLOC.** Naming is consistent (`*.test.mjs` for tests, `_diag-*.mjs` for diagnostics). Coverage is heavy on E2E user flows (board save/reload, export bundling, markdown authoring, ESC behavior, wheel routing).

**Gap:** no unit tests for canvas math, state transforms (undo/redo, paste reshape), or the markdown editor's pure helpers (e.g. the visible↔raw offset mapping in `attachMarkdownEditor`). Those are exactly the areas most prone to regression and most cheaply unit-tested. Today the pattern is "browse to fail, then add an E2E test."

---

## 8. Naming and conventions

| Domain | Status |
| --- | --- |
| HTML | Consistent: kebab-case, lowercase |
| CSS classes | Mostly consistent: `bd-*` prefix in braindump |
| CSS filenames | Mixed: `braindump.css`, `index_style.css`, `projects_grid_style.css`, `hamburger_button.css` |
| JS filenames | **Inconsistent**: `braindump.js`, `site.js`, `image_lightbox.js` (snake) vs. `MobileMenu.js`, `Copy.js` (Pascal) |
| JS functions | Consistent camelCase |
| JS module globals | Underscore-prefix for "private" (`_activeBoardViewport`, `_mountedBoardCount`) — clear and consistent |

Two of the three Pascal-cased files (`MobileMenu.js`, `Copy.js`) are dead. Once removed, casing becomes consistent by accident.

---

## 9. Coupling hot spots in `braindump.js`

Concrete examples:

- **Module-level mutable state** (camera, isPanning, isDrawing, activeTool, lastMousePos, autosave timers, undo history) is read and written from dozens of handlers across 6 kLOC. There's no state container — anything can mutate anything.
- **`renderNode` is the dispatch hub** for every node type. Each new type adds a branch. No registry pattern.
- **`attachMarkdownEditor` (~600 lines)** owns: parsing, rendering, save flow, paste, drop, fullscreen, keyboard shortcuts, link previews. This single function is one of the densest readability hazards in the codebase.
- **Paste, drag, draw, and tool-click placement** all share `lastMousePos` (`:2387`), but each touches the global differently. The recent fix to `lastMousePos` (`:2389-2394`) shows how subtle the coupling is.
- **`mountCosmoboard(hostElement)` does not actually create nested scopes** for sub-systems. Indentation suggests one large IIFE, but readability-wise the file behaves as if everything is global.

**Risk:** every new feature adds another ~50–200 lines somewhere in the middle of this file, making future merges and refactors progressively harder.

---

## 10. Dead code, TODOs, FIXMEs

- **Production code:** zero `TODO`/`FIXME`/`XXX` comments. (Good — they live in `.agents/active_todo.md` instead.)
- **Dead files:** `braindump_broken.js` (5,644 lines), `Copy.js` (19), `MobileMenu.js` (8), `general_style_old.css` (78), `index_style_old.css` (30). Total **~5,800 lines of confirmed dead code** in active folders.
- **Probable dead:** `dev-server.mjs` (73 lines) overlapping with `preview-server.mjs`; `patch-js-proxy.py` at root.

---

## 11. Build & deploy

- `package.json` declares `build`, `preview`, `sync:notion`, `extract-assets`. Dev dep: `playwright` only.
- GitHub Actions (`.github/workflows/build-site.yml`) runs on push to `main`, on PRs, manually, and hourly. Auto-commits Notion-synced content with `[skip ci]`.
- Deploy: GitHub Pages, custom domain via `CNAME` (`evrenucar.com`).

This is healthy. The auto-commit-on-cron pattern is worth reviewing for failure modes (e.g., what happens if Notion sync produces partial/empty content — does it commit and silently break the site?).

---

## 12. Concrete expandability risks

**Adding a new whiteboard node type (highest-impact extension scenario):**
1. Add a branch in `createNode` (`:3310`).
2. Add a branch in `renderNode` (~390 lines).
3. Add paste handling at `:5697` if relevant.
4. Add drag/drop intake in `attachMarkdownDropHandler` (`:5100`).
5. Add export bundling support (handoff doc explains it's a separate path).
6. Add CSS for the new shell in `braindump.css`.
7. Add load/save serialization in `loadState` (`:5768`).

That's 7 places in 2 files for one feature. A registry pattern could collapse this to 1 file per node type.

**Adding a new top-level page:**
1. Create new `.html` with the duplicated 70-line head + nav.
2. Add nav links in **all 12 existing HTML files**.
3. Create a per-page CSS file and link it.
4. If data-driven, plumb through `scripts/build-site.mjs`.

A shared header template (build-time include) would collapse #1 and #2.

---

## Top 5 highest-leverage improvements

| # | Action | Effort | Plan alignment | Why it pays off |
| --- | --- | --- | --- | --- |
| 1 | **Archive dead code:** `braindump_broken.js`, `Copy.js`, `MobileMenu.js`, `*_old.css`, `nul`, root `screenshot*.png`, `.tmp_*`. Update `.gitignore`. | **S** | = `refactoring_plan.md` Stage 1 | -5,800 lines of confusion in active dirs. One PR, near-zero risk. Makes code review and grep results meaningful again. |
| 2 | **Extract HTML head + nav into a build-time template** in `scripts/build-site.mjs` (or a tiny preprocessor for the 12 root pages). | **M** | Currently *out of scope* per `refactoring_plan.md` (Heavy item, deferred). Worth promoting. | Eliminate ~840 lines of duplication; nav/meta/analytics changes become 1-file edits. Unblocks new pages without 12-file diffs. |
| 3 | **Split `braindump.js` into ES modules** along natural seams: `state.mjs`, `camera.mjs`, `nodes/render.mjs`, `nodes/markdown.mjs`, `nodes/link.mjs`, `events.mjs`, `io/save.mjs`, `io/export.mjs`, `undo.mjs`. Keep public API on a single mounted instance. | **L** | The plan's **touch-driven modularization rule** (`JavaScript/AGENTS.md`) covers the *how*: carve out per visit, never as standalone PR. Destination dir: `src/apps/braindump/`. | Drops the per-file size 4–6×. Enables real unit tests. Makes the next big feature land in a focused file rather than line 4,200 of a 6,000-line monolith. |
| 4 | **Introduce a node-type registry** so each whiteboard node type lives in one file and registers `{ type, render, paste, serialize, dropAccept }`. Refactor `createNode`/`renderNode` to dispatch through it. | **M** | Documented as a seam in `extension_seams.md` but not yet implemented. Pairs with #3. | Adding a node type goes from 7 places to 1 file. Pairs naturally with #3 — do as the same refactor or the next step after. |
| 5 | **Add unit tests for pure helpers** in the markdown editor (`computeVisibleOffsetInLine`, `buildVisibleToRawMap`, `visibleToRawOffset`) and canvas math (`screenToCanvas`, zoom-anchor math). Existing E2E tests stay; this fills the unit-test gap cheaply. | **S–M** | Could land before Stage 3 (test reorg) or as part of it. Independent of dead-file work. | Cheap regression insurance for the most caret-sensitive logic. The `active_todo.md` notes show these helpers were the root cause of a recent cluster bug. |

---

## Summary

- **Repo structure & docs:** good. The `.agents/` system is genuinely useful and the build/CI pipeline is solid.
- **HTML/CSS:** shows duplication strain (12× nav, two `_old` CSS files) but no immediate bugs.
- **JavaScript:** the central readability and expandability risk. `braindump.js` is doing the work of ~8 modules. Until it's split, every feature pays an interest tax against the monolith.
- **Easiest wins this week:** delete the dead files (#1) and template the HTML head (#2). Both are low-risk, high-clarity moves.
- **Strategic move:** the module split + node-type registry (#3 + #4) is the unlock for the next phase of Cosmoboard features.
