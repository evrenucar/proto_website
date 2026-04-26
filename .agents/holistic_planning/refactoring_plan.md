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
- Group `tests/` so the 21 flat files become navigable by domain.
- Add per-directory `AGENTS.md` (router for agents) and `README.md` (human context, only where useful), so a reader landing in any directory can orient in one file.
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

## Stages

Each stage is a single PR/commit. Test gate must pass before moving to the next stage.

### Stage 1 — Dead-file archive

**Changes:**
- Create `.archive/` at repo root (tracked in git, excluded from build via `scripts/build-site.mjs` ignore list).
- Move into `.archive/`: `CSS/general_style_old.css`, `CSS/index_style_old.css`, `JavaScript/braindump_broken.js`, `JavaScript/Copy.js`, `testCode/`, `classes.txt`, `patch-js-proxy.py`, `screenshot.png`.
- Move root tmp clutter: `.tmp_preview_server*` files (or add to `.gitignore` if not already).
- Search repo for references to each before moving — abort the move if anything live references it.

**Test gate:** Full test suite once (`node --test tests/`) + `npm run build`. Reference risk is non-zero, so run everything one time.

**Risk:** Low if reference search is clean. Reversible via git.

### Stage 2 — Lowercase top-level dirs

**Changes:**
- `git mv JavaScript/ javascript-tmp/ && git mv javascript-tmp/ javascript/` (two-step to dodge Windows case-insensitivity).
- Same for `CSS/` → `css/`.
- Update every HTML, build script, and test that references the old paths.

**Test gate:** `npm run build` + `node --test tests/preview-server-routes.test.mjs tests/cosmoboard-build.test.mjs tests/extract-assets.test.mjs` (covers HTML/CSS/JS path resolution).

**Risk:** Medium. Many HTMLs reference these paths. A `grep -r "JavaScript/\|CSS/"` before the rename catches stragglers.

### Stage 3 — Test reorganization

**Changes:**
- Create `tests/board/`, `tests/preview/`, `tests/export/`, `tests/build/`.
- Move tests:
  - `board/` → `board-save-*`, `board-url-*`, `cosmoboard-*`
  - `preview/` → `preview-*`
  - `export/` → `export-*`
  - `build/` → `*-build.test.mjs`, `extract-assets.test.mjs`
  - Leave at root: `markdown-authoring-e2e`, `recommendation-flow-e2e`, `shared-entity-*`, `youtube-live-embed` (or group into `features/` if there are 4+).
- Verify each test still resolves its imports (use `path.resolve(__dirname, '..', '..', ...)` if needed).

**Test gate:** Full suite. This stage IS the test reorg — must verify everything still runs from new locations.

**Risk:** Medium. Path resolution inside test files is the main failure mode.

### Stage 4 — Per-directory AGENTS.md + README.md

**Changes:**
- Add `AGENTS.md` to each directory listed under "Per-Directory Doc Convention" using the template above.
- Add `README.md` to `scripts/`, `tests/`, `src/`, `content/`.
- Update root `AGENTS.md` if any new top-level routing rules emerged.
- Update `.agents/agents.md` router to reference per-dir AGENTS.md where relevant.

**Test gate:** `npm run build` only (docs do not affect runtime).

**Risk:** Very low.

### Stage 5 — Cleanup pass

**Changes:**
- Final repo grep for remaining `JavaScript/`, `CSS/`, archived filenames.
- Confirm `.archive/` is excluded from build output.
- Update `.agents/PLAN.md` and any other planning doc that referenced old paths.
- Add a note in `.agents/general_issues_and_tasks.md` listing deferred Heavy-scope items so they are not lost.

**Test gate:** Full test suite + visual check of `npm run preview` (open index, cosmoboard, braindump, projects, photography).

**Risk:** Very low.

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

Confirm each by running `grep -r "<filename>" --exclude-dir=.archive --exclude-dir=node_modules` before the move.

## Risks

- **Windows case-insensitivity** in Stage 2 — the two-step `git mv` covers it but verify on a clean clone after.
- **Hidden references** to dead files — reference search before each move.
- **Test path resolution** in Stage 3 — most tests use `__dirname` already, but verify before declaring the stage done.
- **Stale planning docs** — `.agents/PLAN.md`, `.agents/agents.md`, and the new `refactoring_plan.md` itself need updating after Stage 5.

## Open follow-ups (not in this plan)

- Decide whether root HTMLs are sources or build artifacts (Heavy item).
- `content/` vs `src/` boundary rule (Heavy item).
- Whether `JavaScript/vendor/` should move under `src/` (touch when revisiting build).
