# .archive

## Purpose

Files removed from active code paths but kept in git history under their new location. Tracked, but not referenced by build, server, or tests.

## Read when

- Recovering a fragment from a deprecated file before a clean rewrite.
- Confirming a file *was* deprecated (and where it lived) rather than guessing.

## Skip when

- Doing any new development. Nothing here is live.

## Canonical for

- Where dead-but-not-yet-deletable code lives.

## Layout

| Subdir | Holds |
| --- | --- |
| `CSS/` | Superseded stylesheets (`general_style_old.css`, `index_style_old.css`) |
| `JavaScript/` | Deprecated front-end (`braindump_broken.js`, `Copy.js`) |
| `scratch/` | One-off scripts and notes (`classes.txt`, `patch-js-proxy.py`) |
| `screenshots/` | Debug screenshots that were committed by accident |
| `testCode/` | Pre-existing scratch HTML predating the `tests/` suite |

## Conventions

- **Do not edit files here.** If something here should be revived, copy it back into the active tree under its new name. Editing in-place defeats the purpose.
- **Build & preview servers ignore this directory** by virtue of reading source files by explicit name (not by directory walk). No code change is needed when adding files here.
- **Adding to `.archive/`:** use `git mv <file> .archive/<subdir>/<file>` so history follows. Then update the originating directory's `AGENTS.md` to remove the file from its key-files list.

## See also

- [../.agents/holistic_planning/refactoring_plan.md](../.agents/holistic_planning/refactoring_plan.md) — Stage 1 dead-file inventory and rationale
- [../.agents/holistic_planning/holistic_reviews/structural_codebase_review.md](../.agents/holistic_planning/holistic_reviews/structural_codebase_review.md) — review that prompted this archival
