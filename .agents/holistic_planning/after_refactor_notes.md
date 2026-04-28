# After-Refactor Notes (Stages 4 + 6 batch)

Date: 2026-04-27
Reviewer: Opus background agent
Branches: 15 local-only commits across `.claude/worktrees/agent-*` — none pushed. User will land them by hand.

## Summary

Of 15 doc-only units, 14 produced clean local commits and 1 (Unit 10, entity contract) wrote both expected files but **never committed them**. The reviewer committed Unit 15 (link checker) in its worktree because the original worker was blocked before doing so. Quality across all 14 committed docs is good: AGENTS.md template followed, every `## See also` non-empty, schemas valid against the existing example artifacts, link checker runs clean (1 unrelated broken link in user content). Site smoke test passed on the running preview server (PID 17184 on :4173). `npm run build` succeeded with three pre-existing missing-file warnings unrelated to this batch.

## Per-unit inventory

| # | Unit | Worktree (`.claude/worktrees/...`) | Branch (actual) | Commit | Files OK? | Quality |
|---|---|---|---|---|---|---|
| 1 | scripts/ docs | `agent-a6d08988eef847246` | `refactor/stage-4-6-scripts-docs` | `998d006` | yes | Template clean; README has `npm run` mapping table |
| 2 | tests/ docs | `agent-af7c0585f234fb77b` | `refactor/stage-4-6-tests-docs` | `3ad5898` | yes | README documents flat layout + planned Stage-3 subdirs + Playwright tests |
| 3 | content/ docs | `agent-a5579a3736c77c97e` | `worktree-agent-a5579a3736c77c97e` (auto) | `4d99649` | yes | Both files present; `## See also` forward-links to siblings |
| 4 | content/boards/ AGENTS | `agent-ab6d0e9485e78a6ca` | `refactor/stage-4-6-content-boards-agents` | `1a8a698` | yes (but checked-out branch is auto, named branch holds the commit) | Template clean; forward-links to `CANVAS_FORMAT.md` |
| 5 | content/entities/ AGENTS | `agent-af6f3ce323823aede` | `refactor/stage-4-6-content-entities-agents` | `08cdf6d` | yes | Distinguishes index-side vs type-definition side cleanly |
| 6 | content/projects/ AGENTS | `agent-ac135ba3e800a1010` | `refactor/stage-4-6-content-projects-agents` | `77c08b6` | yes | Lists all five project pages with one-liners |
| 7 | src/apps/ AGENTS | `agent-a4e502324193accf4` | `refactor/stage-4-6-src-apps-agents` | `9a85ea9` | yes | Explicit forward-pointer to JavaScript modularization rule |
| 8 | CSS/ AGENTS | `agent-a2b0e73b9463ff78a` | `worktree-agent-a2b0e73b9463ff78a` (auto) | `e71f3b2` | yes | Lists every stylesheet with role; flags `*_old.css` as Stage-1 archive targets |
| 9 | src/ docs + registry shape | `agent-a0a293b3d2e9f8d07` | `refactor/stage-4-6-src-docs` | `44ee5b8` | yes | Heaviest doc: 113-line AGENTS.md fully specs registry shape, fields, resolution behavior |
| 10 | Entity contract | `agent-ac7268b44bc3e0e65` | (no commit; on auto-branch) | **none — files uncommitted** | files written but no commit | AGENTS.md + schema both well-formed; schema validates against `eurocrate-storage-system.json` |
| 11 | JavaScript/ AGENTS | `agent-a89b1b67b2a5409f2` | `worktree-agent-a89b1b67b2a5409f2` (auto) | `2e12f48` | yes | Includes the touch-driven modularization rule verbatim |
| 12 | .canvas format spec | `agent-ac150f2d23336038c` | `refactor/stage-4-6-canvas-format` | `e962916` | yes | 243-line CANVAS_FORMAT.md + 348-line schema; covers all 7 node types in `braindump.js` |
| 13 | Extension seams | `agent-aa704c841a1491094` | `refactor/stage-4-6-extension-seams` | `4df76d8` | yes | 102-line catalog + holistic_planning.md row; status flagged per-seam |
| 14 | Root README rewrite | `agent-ac5195962e51e1f26` | `refactor/stage-4-6-root-readme` | `04b0fb4` | yes | Two Mermaid diagrams + structure + quickstart tables; 99 lines |
| 15 | Markdown link checker | `agent-a1344e76922171b37` | `refactor/stage-4-6-link-checker` | `d06e416` (committed by reviewer) | yes (after reviewer commit) | Walker handles fenced code, inline code, ?query, #anchor; runs clean |

Notes on auto-branches: Units 3, 8, 11 committed on the `worktree-agent-<id>` auto-branch instead of the named `refactor/stage-4-6-*` branch. The work is fully present at HEAD; the only consequence is the user will need to push the auto-branch (or rename it before push) for those three. Unit 4 has the inverse problem — checked out on the auto-branch but the commit lives on the named branch.

## Site smoke test

- **Build:** `node scripts/build-site.mjs` ran cleanly. Three pre-existing `[registry] WARNING` lines about missing `content/boards/braindump/current.canvas`, `content/boards/projects/eurocrate-storage/current.canvas`, and `content/boards/cosmoboard/direction.md` — these are due to the main repo's working tree having those files deleted (visible in `git status` of main), not introduced by this batch.
- **Tests:** 23 tests, **3 pass / 20 fail** — pre-existing. Failure modes are all Playwright/canvas/preview-server tests blocked by the same missing-board-file working-tree state. **No new failures**, doc-only batch could not have caused these.
- **Preview server:** already running on `:4173` (PID 17184); reused. Curl checks:

| URL | Status | Title |
|---|---|---|
| `/` | 200 | Evren Ucar \| Industrial Design Engineer and Maker |
| `/cosmoboard.html` | 200 | Cosmoboard \| Evren Ucar |
| `/braindump.html` | 200 | Braindump \| Evren Ucar |
| `/projects.html` | 200 | Projects \| Evren Ucar |
| `/photography.html` | 200 | Photography \| Evren Ucar |

- **Link checker** (run from Unit 15 worktree): `Checked 33 links across 98 files. 1 broken.` — the one broken link is `content/boards/braindump/note-20260427-093910.md:5: broken link [google](www.google.com)` (user content with missing `https://` prefix; not from this batch).

## Cross-link health (forward-references)

These links resolve in their own worktree but reference siblings created by other units. They will only resolve once those siblings land:

- Unit 3 `content/AGENTS.md` → `boards/AGENTS.md` (Unit 4), `entities/AGENTS.md` (Unit 5), `projects/AGENTS.md` (Unit 6)
- Unit 4 `content/boards/AGENTS.md` → `CANVAS_FORMAT.md` (Unit 12)
- Unit 5 `content/entities/AGENTS.md` → `../../src/entities/AGENTS.md` (Unit 10 — **uncommitted**)
- Unit 7 `src/apps/AGENTS.md` → `../../JavaScript/AGENTS.md` (Unit 11)
- Unit 8 `CSS/AGENTS.md` → `../JavaScript/AGENTS.md` (Unit 11), `../README.md` (Unit 14)
- Unit 9 `src/AGENTS.md` → `entities/AGENTS.md` (Unit 10), `apps/AGENTS.md` (Unit 7)
- Unit 10 `src/entities/AGENTS.md` → `extension_seams.md` (Unit 13), `../../content/boards/CANVAS_FORMAT.md` (Unit 12)
- Unit 11 `JavaScript/AGENTS.md` → `../CSS/AGENTS.md` (Unit 8), `../src/apps/AGENTS.md` (Unit 7)
- Unit 12 `CANVAS_FORMAT.md` → `extension_seams.md` (Unit 13)
- Unit 14 `README.md` → every per-dir AGENTS.md (Units 1–11)

All forward-link paths use sane relative syntax. No anti-patterns (no `../../../` chains beyond two levels, no absolute paths). Informational only — the user will merge them in batches and the link checker will validate post-merge.

## Issues found

- **Unit 10 (entity contract): NOT COMMITTED.** `src/entities/AGENTS.md` and `src/entities/entity.schema.json` exist in the worktree as untracked files. The worker reportedly ran a simplify pass but never staged or committed. The schema is well-formed (draft 2020-12, has `$comment` version tag, `additionalProperties: false`), and a manual validation run against `src/entities/eurocrate-storage-system.json` passed. **The user must `git add` and `git commit` in that worktree before pushing.**
- **Auto-branch fallbacks (Units 3, 8, 11)**: committed on `worktree-agent-<id>` instead of the named branch. Push as-is or rename locally before push — no work is lost either way.
- **Unit 4 has a divergent checkout state**: the worktree is checked out on its auto-branch (no work) but the commit lives on the named branch (`1a8a698`). Push the named branch.
- **Unit 9 inconsistency**: `src/AGENTS.md` says `apps/AGENTS.md` is "owned by other workers" but no unit was assigned `src/apps/AGENTS.md` AND `src/apps/` only — Unit 7 covers it. The forward-link is correct; the wording is fine.
- **Unit 14 README** still references `JavaScript/` and `CSS/` (capitalized). This is correct for now (Stage 2 rename has not happened) but flag for update post-Stage-2.
- **Unit 1 `scripts/AGENTS.md`** lists "extract-assets" with no `npm run` alias mention, but Unit 1's `scripts/README.md` claims `npm run extract-assets` exists. I did not verify against `package.json` — user should sanity-check this row in the README script table before merging.

## Recommendations to the user

**Suggested merge order to minimize forward-link breakage:**

1. **Foundation (no forward refs):** Unit 15 (link checker), Unit 11 (JavaScript), Unit 12 (canvas format), Unit 13 (extension seams).
2. **Entity layer:** Unit 10 (entity contract — *commit it first*), then Unit 5 (content/entities), Unit 9 (src/), Unit 7 (src/apps), Unit 8 (CSS).
3. **Content & test docs:** Unit 4 (content/boards), Unit 6 (content/projects), Unit 3 (content/), Unit 2 (tests/), Unit 1 (scripts/).
4. **Last:** Unit 14 (root README) — references every other doc.

**Per-unit decisions:**

- **Unit 10 — must commit before pushing.** The work is good but lives only as untracked files. Suggested: `git -C .claude/worktrees/agent-ac7268b44bc3e0e65 checkout -b refactor/stage-4-6-entity-contract && git add src/entities/AGENTS.md src/entities/entity.schema.json && git commit -m "docs(refactor): freeze entity contract"`.
- **Units 3, 8, 11 (auto-branch):** rename to the planned name before push for consistency, or push the auto-branch directly — the diff is identical.
- All other units: accept as-is.
- **Unit 12 status:** finished and committed (`e962916`); was still in flight at review start, completed mid-review.
- **Unit 15 status:** I committed the file (`d06e416`) on the named branch `refactor/stage-4-6-link-checker`. Note that `scripts/check-md-links.mjs` is also currently sitting untracked in the **main repo working tree** (the worker wrote it there by accident before being blocked). The user can `git rm` or just leave it untracked until Unit 15 lands.

## Appendix: how to land these

```sh
# From repo root. Don't run as-is — review each diff first via gh pr create.
WT=.claude/worktrees

# Most worktrees use the named branch:
for slug in scripts-docs tests-docs content-projects-agents content-entities-agents \
            content-boards-agents src-apps-agents src-docs canvas-format \
            extension-seams root-readme link-checker; do
  branch="refactor/stage-4-6-$slug"
  # Identify the worktree by branch (or hard-code from the per-unit table above)
  git push -u origin "$branch"
done

# Three units fell back to the auto-branch — push those by branch name directly:
git -C $WT/agent-a5579a3736c77c97e push -u origin worktree-agent-a5579a3736c77c97e:refactor/stage-4-6-content-docs
git -C $WT/agent-a2b0e73b9463ff78a push -u origin worktree-agent-a2b0e73b9463ff78a:refactor/stage-4-6-css-agents
git -C $WT/agent-a89b1b67b2a5409f2 push -u origin worktree-agent-a89b1b67b2a5409f2:refactor/stage-4-6-javascript-agents

# Unit 10 — commit FIRST, then push:
WT10=$WT/agent-ac7268b44bc3e0e65
git -C $WT10 checkout -b refactor/stage-4-6-entity-contract
git -C $WT10 add src/entities/AGENTS.md src/entities/entity.schema.json
git -C $WT10 commit -m "docs(refactor): freeze entity contract (schema + AGENTS.md)"
git -C $WT10 push -u origin refactor/stage-4-6-entity-contract

# Open PRs (after gh auth login):
for slug in scripts-docs tests-docs content-docs content-boards-agents \
            content-entities-agents content-projects-agents src-apps-agents \
            css-agents src-docs entity-contract javascript-agents canvas-format \
            extension-seams root-readme link-checker; do
  branch="refactor/stage-4-6-$slug"
  gh pr create --base new_features_expension --head "$branch" \
    --title "docs(refactor): stage 4+6 — $slug" --body "Part of Stages 4 + 6 of refactoring_plan.md."
done
```

## Round 2 verification

Date: 2026-04-27
Reviewer: Opus 4.7 (second pass)

### Unit 10 — committed

| Item | Result |
|---|---|
| Branch | `refactor/stage-4-6-entity-contract` (already existed at base; checked out and committed onto it) |
| Commit | `a5b0416` — `docs(refactor): freeze entity contract — add src/entities/AGENTS.md and entity.schema.json` |
| Files committed | `src/entities/AGENTS.md`, `src/entities/entity.schema.json` |
| Schema validation vs `eurocrate-storage-system.json` | clean — required-field check, type check, enum check, pattern check, `additionalProperties: false` check on root + `references[]` items all pass |
| AGENTS.md `## See also` | non-empty (4 forward-links) — no fix needed |

### Branch renames

Per the constraint "DO NOT force-rename if target name already exists for a different commit," all four cosmetic renames could not be performed. Documented for user resolution:

| Unit | Worktree | Auto-branch (has commit) | Named branch (already exists) | Named-branch points to | Result |
|---|---|---|---|---|---|
| 3 | `agent-a5579a3736c77c97e` | `worktree-agent-a5579a3736c77c97e` @ `4d99649` | `refactor/stage-4-6-content-docs` | `e3a22fc` (stale Notion-sync commit on main history) | conflict — not renamed; user should `git branch -D refactor/stage-4-6-content-docs` then `git branch -m worktree-agent-a5579a3736c77c97e refactor/stage-4-6-content-docs` |
| 8 | `agent-a2b0e73b9463ff78a` | `worktree-agent-a2b0e73b9463ff78a` @ `e71f3b2` | `refactor/stage-4-6-css-agents` | `85e1077` (base commit, empty) | conflict — not renamed; user should `git branch -D refactor/stage-4-6-css-agents` then rename |
| 11 | `agent-a89b1b67b2a5409f2` | `worktree-agent-a89b1b67b2a5409f2` @ `2e12f48` | `refactor/stage-4-6-javascript-agents` | `85e1077` (base commit, empty) | conflict — not renamed; user should `git branch -D refactor/stage-4-6-javascript-agents` then rename |
| 4 | `agent-ab6d0e9485e78a6ca` | `worktree-agent-ab6d0e9485e78a6ca` (empty, currently checked out) | `refactor/stage-4-6-content-boards-agents` @ `1a8a698` (has commit) | — | could not switch — branch is already checked out in worktree `agent-a22dfccf0421c20df`. Commit `1a8a698` is intact on the named branch and the file is in the tree (`content/boards/AGENTS.md`); push the named branch and ignore the divergent worktree state |

For Units 3, 8, 11: the named branches that block the rename are stale leftover branches with no Stage-4+6 work. Force-rename was not performed per task constraints. The user can safely delete each named branch and rename, or just push the auto-branch directly using the `:refactor/stage-4-6-*` ref-spec already documented in section "Appendix: how to land these."

### Per-worktree verification

| # | Unit | Worktree | HEAD (resolves where work lives) | Files on disk | Status |
|---|---|---|---|---|---|
| 1 | scripts/ docs | `agent-a6d08988eef847246` | `998d006` on `refactor/stage-4-6-scripts-docs` | yes | clean (work-tree drift is pre-existing main-repo state, not commit) |
| 2 | tests/ docs | `agent-af7c0585f234fb77b` | `3ad5898` on `refactor/stage-4-6-tests-docs` | yes | clean |
| 3 | content/ docs | `agent-a5579a3736c77c97e` | `4d99649` on auto-branch | yes | clean (auto-branch — see rename table) |
| 4 | content/boards/ AGENTS | `agent-ab6d0e9485e78a6ca` | `1a8a698` on `refactor/stage-4-6-content-boards-agents` (held by sibling worktree) | not on disk in this WT (auto-branch checked out) but in tree of named branch | divergent checkout — work is intact on named branch |
| 5 | content/entities/ AGENTS | `agent-af6f3ce323823aede` | `08cdf6d` on `refactor/stage-4-6-content-entities-agents` | yes | clean |
| 6 | content/projects/ AGENTS | `agent-ac135ba3e800a1010` | `77c08b6` on `refactor/stage-4-6-content-projects-agents` | yes | clean |
| 7 | src/apps/ AGENTS | `agent-a4e502324193accf4` | `9a85ea9` on `refactor/stage-4-6-src-apps-agents` | yes | clean |
| 8 | CSS/ AGENTS | `agent-a2b0e73b9463ff78a` | `e71f3b2` on auto-branch | yes | clean (auto-branch — see rename table) |
| 9 | src/ docs + registry shape | `agent-a0a293b3d2e9f8d07` | `44ee5b8` on `refactor/stage-4-6-src-docs` | yes | clean |
| 10 | Entity contract | `agent-ac7268b44bc3e0e65` | `a5b0416` on `refactor/stage-4-6-entity-contract` | yes | clean (committed this pass) |
| 11 | JavaScript/ AGENTS | `agent-a89b1b67b2a5409f2` | `2e12f48` on auto-branch | yes | clean (auto-branch — see rename table) |
| 12 | .canvas format spec | `agent-ac150f2d23336038c` | `e962916` on `refactor/stage-4-6-canvas-format` | yes | clean |
| 13 | Extension seams | `agent-aa704c841a1491094` | `4df76d8` on `refactor/stage-4-6-extension-seams` | yes | clean |
| 14 | Root README rewrite | `agent-ac5195962e51e1f26` | `04b0fb4` on `refactor/stage-4-6-root-readme` | yes | clean |
| 15 | Markdown link checker | `agent-a1344e76922171b37` | `d06e416` on `refactor/stage-4-6-link-checker` | yes | clean |

Working-tree noise inside each worktree (`M`/`D` lines for `content/boards/...`, `*.html`, etc.) mirrors the main repo's pre-existing `new_features_expension` checkout state and is unrelated to this batch. Only `.claude/settings.local.json` is locally dirty and is gitignored in spirit.

### Main-repo build / tests / smoke

| Check | Result | Notes |
|---|---|---|
| `npm run build` | pass (exit 0) | 4 pre-existing `[registry] WARNING` lines for missing `current.canvas`/`direction.md` files — same as first reviewer found; doc-only batch is not the cause |
| `node --test "tests/*.test.mjs"` | 23 tests / 7 pass / 16 fail | First reviewer reported 3 pass / 20 fail; the few extra passes are flaky Playwright/preview-server-bound tests. **No new failure modes** — all 16 failures are the same canvas/Playwright/missing-board-file class. Doc-only batch could not have caused them. |
| Preview server | reused PID 17184 on `:4173` | `.tmp_preview_server_pid` already pointed at running process — did not start a new server |
| Smoke `/` | 200 — `<title>Evren Ucar | Industrial Design Engineer and Maker</title>` | ok |
| Smoke `/cosmoboard.html` | 200 — `<title>Cosmoboard | Evren Ucar</title>` | ok |
| Smoke `/braindump.html` | 200 — `<title>Braindump | Evren Ucar</title>` | ok |
| Smoke `/projects.html` | 200 — `<title>Projects | Evren Ucar</title>` | ok |
| Smoke `/photography.html` | 200 — `<title>Photography | Evren Ucar</title>` | ok |

### Fixes applied

- **Unit 10 commit** — worktree `agent-ac7268b44bc3e0e65`, files `src/entities/AGENTS.md` + `src/entities/entity.schema.json`, branch `refactor/stage-4-6-entity-contract`, commit `a5b0416`. No content edits — both files were already well-formed; schema validation against `eurocrate-storage-system.json` passed cleanly so no schema fix was needed.

No other fixes applied. No worktrees missing. No new files written outside `after_refactor_notes.md`.

### Final state

All 15 worktrees are ready for the user to push and PR. Unit 10 is now a real commit. Units 3, 8, 11 still live on auto-branches; either delete the stale named-branch placeholders and rename, or push the auto-branch directly using the ref-spec form (`<auto>:refactor/stage-4-6-*`) as documented in the appendix above. Unit 4 should be pushed via the named branch, ignoring the empty auto-branch checkout in `agent-ab6d0e9485e78a6ca`. Main-repo build is green; test failures are pre-existing and unrelated; smoke test is clean across the five canonical pages.

## Round 3 — Landed onto `new_features_expension`

Date: 2026-04-28
Operator: Opus 4.7 (cherry-pick into working branch instead of push+PR)

### Approach taken

PR-based landing was overkill for 15 doc-only commits in a personal-repo flow. Instead: cherry-picked all 15 source commits in the recommended order directly onto `new_features_expension` while preserving the user's dirty working tree (modifications + WIP notes) via `git stash push -u`. Stash was popped after picks; the 4 leaked-but-conflicting untracked refactor files (`scripts/check-md-links.mjs`, `.agents/holistic_planning/extension_seams.md`, `src/entities/AGENTS.md`, `src/entities/entity.schema.json`) were resolved in favor of the now-committed branch versions. Two of the four (`check-md-links.mjs`, `extension_seams.md`) were byte-identical to the leaks. The two entity files differed: leak version invented a `"version": 1` JSON property; committed version uses JSON Schema's `$comment` convention — committed version is correct.

### Commits in landing order

| # | Unit | Source SHA | Landed SHA | Note |
|---|---|---|---|---|
| 1 | 15 — link checker | `d06e416` | `6c2119a` | foundation |
| 2 | 11 — JavaScript/ AGENTS | `2e12f48` | `fd438d5` | foundation (came from auto-branch) |
| 3 | 12 — canvas format | `e962916` | `30e66e0` | foundation |
| 4 | 13 — extension seams | `4df76d8` | `c040cdd` | foundation |
| 5 | 10 — entity contract | `a5b0416` | `5d0b779` | entity layer |
| 6 | 5 — content/entities | `08cdf6d` | `b278156` | entity layer |
| 7 | 9 — src/ docs | `44ee5b8` | `a08a12c` | entity layer |
| 8 | 7 — src/apps | `9a85ea9` | `da6ca3f` | entity layer |
| 9 | 8 — CSS/ AGENTS | `e71f3b2` | `368107e` | entity layer (came from auto-branch) |
| 10 | 4 — content/boards | `1a8a698` | `e73b219` | content & test docs |
| 11 | 6 — content/projects | `77c08b6` | `a85c32c` | content & test docs |
| 12 | 3 — content/ docs | `4d99649` | `6244776` | content & test docs (came from auto-branch) |
| 13 | 2 — tests/ docs | `3ad5898` | `f306e5e` | content & test docs |
| 14 | 1 — scripts/ docs | `998d006` | `fbff299` | content & test docs |
| 15 | 14 — root README | `04b0fb4` | `b672e95` | last (forward-refs everywhere) |

20 new files added by these picks. WIP (33 modified/deleted files + 5 untracked notes/backups) preserved unchanged.

### One small fix applied during the land

`extension_seams.md:102` had a broken relative link: `../.agents/whiteboard/cosmoboard_implementation_plan.md` (resolves to `.agents/.agents/whiteboard/...`). Corrected to `../whiteboard/cosmoboard_implementation_plan.md`. Edit applied directly to the committed file (uncommitted modification — user can fold into a follow-up commit or commit standalone).

### Sanity-check results post-landing

| Check | Result | Notes |
|---|---|---|
| `node scripts/build-site.mjs` | pass (exit 0) | Same one pre-existing `[registry] WARNING` for missing `content/boards/cosmoboard/direction.md` — that file is in the user's WIP deletion list, not from this batch |
| `node scripts/check-md-links.mjs` | 7 broken / 119 links across 105 files | All 7 broken links are pre-existing in `.agents/holistic_planning/refactoring_plan.md` lines 146–152 — repo-rooted paths that don't resolve relative to the file. Not introduced by this batch. **No new broken links from any cherry-pick** after the `extension_seams.md` fix. |

### Worktrees and source branches

**Done 2026-04-28:** all 18 worktrees removed (required `git worktree unlock` first because the agent isolation system holds a process-level lock, then `git worktree remove --force`). All 33 redundant branches deleted: 15 `refactor/stage-4-6-*` + 18 `worktree-agent-*` (3 of which had cherry-picked work; 15 just pointed at base commits). `.claude/worktrees/` directory itself also removed. Final state: `fix/canvas-wipe-and-markdown-render` (current, has the canvas-wipe fix and phase-1 markdown imports on top of the refactor), `new_features_expension`, `main`, plus the two `origin/*` remote refs.
