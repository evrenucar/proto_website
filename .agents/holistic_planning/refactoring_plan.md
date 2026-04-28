# Refactoring Plan

## Purpose
Make the codebase easier to read, easier to work in, and easier for agents to route through — without changing product behavior.

## Read when
Starting any structural cleanup, file rename, dead-file removal, or per-directory doc work.

## Skip when
Doing product/feature work. This plan is housekeeping, not new behavior.

## Canonical for
Refactor scope, stage order, per-directory doc convention, test gates between stages.

---

## Goals

- Remove visible decay (`*_old.css`, `*_broken.js`, `Copy.js`, etc.) so future agents and readers do not have to triage what is live.
- Make top-level naming consistent (lowercase) so the layout reads at a glance.
- Group `tests/` so the 22 flat `.test.mjs` files (plus a handful of scratch `*.mjs` helpers) become navigable by domain.
- Add per-directory `AGENTS.md` (router for agents) and `README.md` (human context, only where useful), so a reader landing in any directory can orient in one file.
- Rewrite the root `README.md` so a first-touch reader sees the repo structure, architecture, and quickstart commands at a glance (tables + Mermaid diagrams).
- Maintain markdown cross-references end-to-end — moves and renames update inbound links in the same commit, verified by an automated link check.
- Lock the extension contract (entity schema, `.canvas` format, extension seams) while it is small, so future plugins target a stable surface.
- Keep each stage small enough to revert cleanly if a test gate fails.

## Out of scope (Heavy items, deferred)

- `content/` vs `src/` boundary changes.
- Root HTML discipline (artifact vs source separation).
- Renaming URL-bearing dirs like `random_photos/`, `things_i_do/`, `cool-bookmarks/` (would break live URLs).
- Build-script rewrites.

---

## Per-Directory Doc Convention

Every meaningful directory gets an `AGENTS.md`. Add `README.md` only where humans benefit beyond what the code shows.

**AGENTS.md template (under ~30 lines):**

```markdown
# <dir-name>

## Purpose
<one sentence: what lives here>

## Read when
<what task type makes this dir relevant>

## Skip when
<what task types do not need this>

## Canonical for
<what facts/decisions live here and nowhere else>

## Key files
- `file.ext` — one-line role
- `other.ext` — one-line role

## Conventions
<2-4 bullets: naming, where new files go, what NOT to do>

## See also
- ../AGENTS.md
- relevant cross-links
```

**README.md** — only where a human browsing GitHub needs context the code does not give. Examples worth a README: `tests/` (how to run, naming), `scripts/` (what each script does at a glance). Skip for asset dirs (`image/`, `icon/`, `favicon/`, `notion_assets/`, `random_photos/`).

**Directories that get AGENTS.md:**
`scripts/`, `src/`, `src/apps/`, `src/entities/`, `tests/`, `content/`, `content/boards/`, `content/entities/`, `content/projects/`, `JavaScript/` (renamed `javascript/`), `CSS/` (renamed `css/`).

**Directories that also get README.md:**
`scripts/`, `tests/`, `src/`, `content/`.

---

## Cross-Reference Integrity

Markdown docs in this repo link to each other freely (root `AGENTS.md` → `.agents/agents.md` → per-domain plans → per-dir `AGENTS.md`). Any move, rename, or archival in the stages below can silently break these links. The rule is the same at every stage:

**When a file moves, references to it move in the same commit.**

Per-stage application:
- Before moving a file, `grep -rn "<old-path>" --include="*.md"` (and `--include="*.html"`, `--include="*.mjs"` for code refs) to find all inbound references.
- Update every reference in the same commit as the move. Never leave a stale link "for the next pass."
- After Stage 1, 2, and 3, run a repo-wide markdown link check (script: `scripts/check-md-links.mjs` — to be added in Stage 4 alongside the per-dir docs, or use a one-off `node --eval` walker until then). Any broken link is a stage-gate failure.

**When a new `AGENTS.md` or `README.md` is added** (Stage 4 / Stage 6), it must include a `## See also` section with relative links to:
- its parent dir's `AGENTS.md` (or root `AGENTS.md` if it's a top-level dir)
- the relevant `.agents/` planning doc, if one exists for the domain
- any sibling dir whose contents it directly depends on

The AGENTS.md template above already includes `## See also` — Stage 4 enforces that the section is non-empty for every new file.

**Forward-link maintenance:** when `.agents/` planning docs reference code paths (e.g. `JavaScript/braindump.js`), those references also need updating during Stage 2's lowercase rename. Add `.agents/**/*.md` to the same grep that catches HTML/JS path references.

---

## Stages

Each stage is a single PR/commit. Test gate must pass before moving to the next stage.

| Stage | Status | Landed | Evidence |
| --- | --- | --- | --- |
| 1 — Dead-file archive | **landed (staged)** | 2026-04-28 | [refactor_achievements_2026-04-28-1358.md → Stage 1 round](holistic_reviews/refactor_achievements_2026-04-28-1358.md) |
| 2 — Lowercase rename | pending | — | scheduled verification agent fires Mon 2026-05-04 |
| 3 — Test reorganization | **landed (staged)** | 2026-04-28 | [refactor_achievements_2026-04-28-1358.md → Stage 3 round](holistic_reviews/refactor_achievements_2026-04-28-1358.md) |
| 4 — Per-dir AGENTS.md + READMEs | **landed** | 2026-04-27 | [refactor_achievements_2026-04-28-1358.md sections 1–9](holistic_reviews/refactor_achievements_2026-04-28-1358.md) |
| 5 — Cleanup pass | pending | — | runs after Stage 2 |
| 6 — Extension-readiness | **landed** | 2026-04-27 | [refactor_achievements_2026-04-28-1358.md sections 1–9](holistic_reviews/refactor_achievements_2026-04-28-1358.md) |

### Stage 1 — Dead-file archive ✅ landed 2026-04-28

**Changes:**
- Create `.archive/` at repo root (tracked in git, excluded from build via `scripts/build-site.mjs` ignore list).
- Move into `.archive/`: `CSS/general_style_old.css`, `CSS/index_style_old.css`, `JavaScript/braindump_broken.js`, `JavaScript/Copy.js`, `testCode/`, `classes.txt`, `patch-js-proxy.py`, `screenshot.png`.
- Archive or delete `nul` (0-byte Windows null-device stray at repo root, untracked).
- Add `.tmp_preview_server*` to `.gitignore` (currently absent as of 2026-04-27).
- Once `testCode/` lands in `.archive/`, remove the `testCode/` line from `.gitignore` (currently line 19) so the archived copy is tracked.
- Search repo for references to each before moving — abort the move if anything live references it.
- **Cross-ref integrity:** for each archived file, `grep -rn "<filename>" --include="*.md"` across the repo (especially `.agents/`, root `AGENTS.md`, root `README.md`). Update every inbound markdown link in the same commit as the move. After the stage, run the repo-wide markdown link check.

**Test gate:** Full test suite once (`node --test tests/`) + `npm run build` + markdown link check (no broken links). Reference risk is non-zero, so run everything one time.

**Risk:** Low if reference search is clean. Reversible via git.

### Stage 2 — Lowercase top-level dirs ⏳ pending (verify agent: 2026-05-04)

**Changes:**
- `git mv JavaScript/ javascript-tmp/ && git mv javascript-tmp/ javascript/` (two-step to dodge Windows case-insensitivity).
- Same for `CSS/` → `css/`.
- Update every HTML, build script, and test that references the old paths.
- **Cross-ref integrity:** also grep `.agents/**/*.md`, root `AGENTS.md`, root `README.md`, and any per-dir docs for `JavaScript/` and `CSS/`. Update them in the same commit. The grep `grep -rn "JavaScript/\|CSS/" --include="*.md" --include="*.html" --include="*.mjs" --include="*.js"` catches everything in one pass.

**Test gate:** `npm run build` + `node --test tests/preview/preview-server-routes.test.mjs tests/build/cosmoboard-build.test.mjs tests/build/extract-assets.test.mjs` (covers HTML/CSS/JS path resolution) + markdown link check.

**Risk:** Medium. Many HTMLs reference these paths. A `grep -r "JavaScript/\|CSS/"` before the rename catches stragglers.

### Stage 3 — Test reorganization ✅ landed 2026-04-28

**Changes:**
- Create `tests/board/`, `tests/preview/`, `tests/export/`, `tests/build/`.
- Move tests:
  - `board/` → `board-save-*`, `board-url-*`, `cosmoboard-*`, plus the post-plan additions: `esc-deselect.test.mjs` (cross-layer ESC behavior), `markdown-wheel-routing.test.mjs` (markdown wheel/pinch routing, fullscreen), `resize-handle-clipping.test.mjs` (markdown + base node resize handle).
  - `preview/` → `preview-*`
  - `export/` → `export-*`
  - `build/` → `*-build.test.mjs`, `extract-assets.test.mjs`
  - Leave at root: `markdown-authoring-e2e`, `recommendation-flow-e2e`, `shared-entity-*`, `youtube-live-embed` (or group into `features/` if there are 4+).
- Scratch / diagnostic scripts (not run by `node --test`):
  - `_diag-cosmoboard-canvas.mjs`, `_diag-real-mouse.mjs`, `_diag-stateful.mjs`, `_diag-zoom-followup.mjs`, `screenshot-markdown-indent.mjs` — one-off debugging helpers. Move to `.archive/diag/` (preferred) or `tests/_diag/` if there's a chance they'll be reused.
  - `preview-mode-smoke.mjs`, `A_test_description.md` — read each before deciding: live smoke test → keep under `tests/preview/`; scratch → archive.
- Markdown-cluster note: three of the new board tests touch the markdown editor. If markdown-touching tests reach 4+, promote `tests/board/markdown/` as a sub-subdir. Out of scope for this stage — flagged in Stage 5 cleanup.
- Verify each test still resolves its imports (use `path.resolve(__dirname, '..', '..', ...)` if needed).
- **Cross-ref integrity:** for each moved test file, grep `.agents/**/*.md` (especially `active_todo.md`, `holistic_tasks.md`, `agents.md`) for the old test path and update to the new subdir path. Test filenames appear in active todos and routing docs more often than expected.

**Test gate:** Full suite. This stage IS the test reorg — must verify everything still runs from new locations.

**Risk:** Medium. Path resolution inside test files is the main failure mode.

### Stage 4 — Per-directory AGENTS.md + README.md + root README rewrite ✅ landed 2026-04-27

**Changes:**
- Add `AGENTS.md` to each directory listed under "Per-Directory Doc Convention" using the template above. Every new file MUST have a non-empty `## See also` section (see Cross-Reference Integrity).
- Add `README.md` to `scripts/`, `tests/`, `src/`, `content/`.
- Update root `AGENTS.md` if any new top-level routing rules emerged.
- Update `.agents/agents.md` router to reference per-dir AGENTS.md where relevant.
- Add `scripts/check-md-links.mjs` — a small Node walker that resolves every relative markdown link against the filesystem and prints broken ones. Used as the cross-ref test gate in Stages 1, 2, 3, 5, 6.

**Root README rewrite (sub-stage 4b):**

The current root `README.md` is sparse. Rewrite it for human readability with three core elements:

1. **Repo structure table** — top-level dirs, one-line role, link to that dir's `AGENTS.md`. Example shape:

   | Directory | Role | Docs |
   | --- | --- | --- |
   | `src/` | Cosmoboard app source (apps, entities, registry) | [src/AGENTS.md](src/AGENTS.md) |
   | `javascript/` | Front-end behavior (incl. `braindump.js`) | [javascript/AGENTS.md](javascript/AGENTS.md) |
   | `css/` | Styling (site, braindump, page-database) | [css/AGENTS.md](css/AGENTS.md) |
   | `content/` | Boards, entities, projects (data, not code) | [content/AGENTS.md](content/AGENTS.md) |
   | `tests/` | Node-test suite, organized by domain | [tests/README.md](tests/README.md) |
   | `scripts/` | Build, preview, extraction utilities | [scripts/README.md](scripts/README.md) |
   | `.agents/` | Planning, routing, skill docs | [.agents/agents.md](.agents/agents.md) |

2. **Architecture diagram (Mermaid)** — high-level flow, two graphs:

   - *Site composition*: portfolio pages + Cosmoboard app share `JavaScript/site.js` + `CSS/site.css`; Cosmoboard adds `braindump.js`/`braindump.css` and reads `content/boards/*.canvas` + `src/entities/*.json` via `src/registry.json`.
   - *Build flow*: `scripts/build-site.mjs` → reads `src/site-data.mjs` + `content/` → emits static HTML + asset bundles.

   Use Mermaid `flowchart LR` syntax (renders natively on GitHub). Keep each diagram ≤ 12 nodes — beyond that, readability collapses.

3. **Quickstart command table**:

   | Task | Command |
   | --- | --- |
   | Install | `npm install` |
   | Run preview server | `npm run preview` |
   | Build static site | `npm run build` |
   | Run all tests | `node --test tests/` |
   | Run one test | `node --test tests/<subdir>/<file>.test.mjs` |
   | Check markdown links | `node scripts/check-md-links.mjs` |

Keep the rewrite under ~150 lines. The README is for first-touch orientation; deep context lives in `AGENTS.md` files and `.agents/`. Cross-link both ways: README → per-dir `AGENTS.md`, and each per-dir `AGENTS.md` `## See also` → root `README.md` where appropriate.

**Test gate:** `npm run build` + `node scripts/check-md-links.mjs` (no broken links). Mermaid renders client-side on GitHub — manual visual check on the rendered README before merging.

**Risk:** Very low. Doc-only.

### Stage 5 — Cleanup pass ⏳ pending (runs after Stage 2)

**Changes:**
- Final repo grep for remaining `JavaScript/`, `CSS/`, archived filenames.
- Confirm `.archive/` is excluded from build output.
- Update `.agents/PLAN.md` and any other planning doc that referenced old paths.
- Decide whether `tests/board/markdown/` is warranted yet (count markdown-touching tests post-Stage-3; promote if 4+).
- Verify `.gitignore` no longer references `testCode/` (now in `.archive/`) and now references `.tmp_preview_server*`.
- **Cross-ref integrity (final sweep):** run `node scripts/check-md-links.mjs` on the entire repo. Also run a broader grep for the most-moved tokens (`JavaScript/`, `CSS/`, archived filenames, old test paths) across `**/*.md`, `**/*.html`, `**/*.mjs`, `**/*.js`. Zero broken links and zero stale path references is the bar.
- Add a note in `.agents/general_issues_and_tasks.md` listing deferred Heavy-scope items so they are not lost.

**Test gate:** Full test suite + `node scripts/check-md-links.mjs` + visual check of `npm run preview` (open index, cosmoboard, braindump, projects, photography).

**Risk:** Very low.

### Stage 6 — Extension-readiness (additive, doc-first) ✅ landed 2026-04-27

**Why:** Cosmoboard's natural extension surface already exists — `src/registry.json` + `src/entities/*.json` define what an entity is, and `.canvas` is the board format. Today there is one entity (`eurocrate-storage-system.json`). Locking the contract while it is small is the cheapest moment to do it. This stage is doc-only and can ship anytime; placed after Stage 5 because Stage 4's per-dir AGENTS.md convention is a prerequisite for `src/entities/AGENTS.md`.

**Changes:**

1. **Freeze the entity contract:**
   - Write `src/entities/AGENTS.md` documenting required fields, optional fields, rendering hooks, and lifecycle expectations for an entity JSON.
   - Add `src/entities/entity.schema.json` (JSON Schema, draft 2020-12). Reference it from the AGENTS.md.
   - Document `src/registry.json` shape in `src/AGENTS.md`: how entries are resolved, what loader code reads it, what happens on missing/duplicate IDs.

2. **Document the `.canvas` format:**
   - Add `content/boards/CANVAS_FORMAT.md` describing the JSON schema of a `.canvas` file: top-level keys, item types, coordinate system, embed semantics, version field. Use the existing `content/boards/cosmoboard/current.canvas` as the worked example.
   - Add a JSON schema (`content/boards/canvas.schema.json`) if the format is stable enough — otherwise note that a schema is deferred until version stabilizes.

3. **Enumerate the extension seams:**
   - Add `.agents/holistic_planning/extension_seams.md` (one page) listing the surfaces an extension could plug into:
     - new entity types (via `src/entities/`)
     - new canvas-item renderers (where in `braindump.js` or its eventual modules)
     - new toolbar / sidebar commands
     - new keyboard / wheel routes
   - For each seam, mark its current status: stable, in-flux, not-yet-extensible.
   - Cross-link from `.agents/holistic_planning/holistic_planning.md` and from this refactoring plan.

4. **Touch-driven modularization rule for `JavaScript/braindump.js`:**
   - Add a one-paragraph rule to `JavaScript/AGENTS.md` (or `javascript/AGENTS.md` post-Stage-2): "When you visit a subsystem of `braindump.js` for any feature work, carve it out into a module under `src/apps/braindump/<subsystem>.mjs` as part of that PR. Never as a standalone refactor PR." Suggested initial split lines (informational, not prescriptive): `selection`, `wheel-routing`, `fullscreen`, `markdown-render`. The recent cluster fixes already touched all four — the next visit to any of them is a natural moment.
   - **Do NOT** big-bang this stage. The carve-up happens organically across many later PRs. This stage just publishes the rule.

5. **Cross-ref integrity:**
   - Every new doc above gets a `## See also` linking to its parent `AGENTS.md`, the relevant `.agents/` planning doc, and any reciprocal docs (e.g. `extension_seams.md` ↔ `entity.schema.json` ↔ `CANVAS_FORMAT.md`).
   - Run `node scripts/check-md-links.mjs` after the stage.

**Test gate:** `npm run build` + `node scripts/check-md-links.mjs`. JSON schemas validated against the existing example files (`eurocrate-storage-system.json`, `current.canvas`) — if validation fails, the schema is wrong, not the example.

**Risk:** Very low. No code changes; no runtime behavior touched. The only failure mode is documenting the contract incorrectly, which a self-validation pass against existing artifacts catches.

**Out of scope (deferred to a later phase):**
- A real extension *loader* (sandboxing, manifest format, dynamic import). The contract docs above tell you what it would have to support; build it when the first real third-party extension exists.
- Public API for runtime hooks (event bus, lifecycle callbacks). Out of scope until the modularization rule has carved out at least 2 subsystems of `braindump.js`.

---

## Naming Convention (going forward)

- Directories: kebab-case (`page-database/`, not `page_database/`).
- Files: kebab-case for source, snake_case allowed inside `.agents/` to match existing planning docs.
- Existing snake_case dirs (`random_photos/`, `things_i_do/`, `page_database/`) left alone — URL impact and not worth the churn.
- New code follows the convention; existing code does not get renamed unless touched for another reason.

## Dead-file inventory (Stage 1 targets)

| File | Verdict | Reason |
| --- | --- | --- |
| `CSS/general_style_old.css` | archive | superseded by `general_style.css` |
| `CSS/index_style_old.css` | archive | superseded by `index_style.css` |
| `JavaScript/braindump_broken.js` | archive | name says it all |
| `JavaScript/Copy.js` | archive | duplicate, no inbound refs expected |
| `testCode/` | archive | predates `tests/`, unused |
| `classes.txt` | archive | scratch dump |
| `patch-js-proxy.py` | archive | one-off util |
| `screenshot.png` | archive | not referenced by site |
| `.tmp_preview_server*` | gitignore | runtime artifacts, should not be tracked |
| `nul` | archive/delete | 0-byte Windows null-device stray at repo root, untracked |

Confirm each by running `grep -r "<filename>" --exclude-dir=.archive --exclude-dir=node_modules` before the move.

## Risks

- **Windows case-insensitivity** in Stage 2 — the two-step `git mv` covers it but verify on a clean clone after.
- **Hidden references** to dead files — reference search before each move.
- **Test path resolution** in Stage 3 — most tests use `__dirname` already, but verify before declaring the stage done.
- **Stale planning docs** — `.agents/PLAN.md`, `.agents/agents.md`, and the new `refactoring_plan.md` itself need updating after Stage 5.
- **Broken markdown cross-links** — the largest silent risk. Mitigated by the same-commit-update rule, the per-stage grep, and `scripts/check-md-links.mjs` gate. Without these, every move leaves dangling links that compound across stages.
- **Premature schema lock-in (Stage 6)** — freezing the entity / canvas contract while the format is still in flux risks documenting something that needs to change. Mitigation: include a `version` field in both schemas and treat the docs as v1, not as final. Note this explicitly in the schema files.

## Open follow-ups (not in this plan)

- Decide whether root HTMLs are sources or build artifacts (Heavy item).
- `content/` vs `src/` boundary rule (Heavy item).
- Whether `JavaScript/vendor/` should move under `src/` (touch when revisiting build).
- Stray `nul`-style artifacts at repo root — add a `.gitignore` rule (`nul`, `NUL`) once Stage 1 lands, since Windows shells can recreate them.
