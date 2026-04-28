# Holistic Reviews

- **Created:** 2026-04-28 13:42 WEDT
- **Last updated:** 2026-04-28 14:55 WEDT (filled HH:MM TZ on refactor_achievements + index rows)

## Purpose

Point-in-time snapshots of the codebase along a single dimension (structure, performance, accessibility, etc.). Each file is a *photograph*, not a *plan*. Plans live in `../holistic_planning.md` and `../refactoring_plan.md`.

## Read when

- Starting a new audit pass and need prior baselines to compare against.
- Planning a refactor and need evidence of where the rot is.
- Onboarding to the repo and want a curated tour of what's broken vs. healthy.

## Skip when

- Doing day-to-day feature work. These are reference docs, not active state.

## Canonical for

- Past assessments + their top-N improvement lists.
- Cross-references to the refactor plan stages each finding maps to.

---

## Writing Conventions (binding for every new review)

| Rule | Why |
| --- | --- |
| **Always include `Created: YYYY-MM-DD HH:MM TZ` at the top.** | Reviews go stale fast. The reader needs to know *when* the photo was taken. |
| **Maximize tables and Mermaid graphs. Minimize prose.** | A scan-friendly table beats a paragraph for this format. Reviews are read in 30 seconds, then revisited. |
| **Cite specifics: `file.ext:line` everywhere.** | Generic claims rot. Citations stay falsifiable. |
| **End with a ranked top-N improvements table.** Columns: action, effort (S/M/L), plan alignment, payoff. | The whole point of the review is to surface *what to do next*. |
| **Cross-link the relevant `refactoring_plan.md` stage** so the reader sees what's already planned vs. what's net-new. | Avoids duplicate planning. |
| **Don't re-derive what existing AGENTS.md already says.** Link to it. | Each per-dir AGENTS.md is the canonical for that dir. |
| **One concern per file.** Don't bundle "structure + perf + a11y" into one review — split. | Keeps each review scannable and lets dimensions evolve at their own pace. |

## Filename convention

`<dimension>_<scope>_review.md` — e.g. `structural_codebase_review.md`, `perf_braindump_review.md`, `a11y_site_review.md`.

## Index

| File | Created | Dimension | Scope |
| --- | --- | --- | --- |
| [structural_codebase_review.md](./structural_codebase_review.md) | 2026-04-28 13:06 WEDT | Structure / readability / expandability | Whole repo |
| [refactor_achievements.md](./refactor_achievements.md) | 2026-04-28 13:58 WEDT | Refactor outcomes (Stages 4 + 6) | Doc-first hardening |

Add a row here when you create a new review.

## See also

- [`../refactoring_plan.md`](../refactoring_plan.md) — the active refactor stages
- [`../after_refactor_notes.md`](../after_refactor_notes.md) — landed-work log per stage
- [`../holistic_planning.md`](../holistic_planning.md) — north star, decisions, roadmap
- [`../../agents.md`](../../agents.md) — agent router
