# Review batch B: multi-board nav, collaboration / GitHub, performance / local-first

Reviewer: agent B. Reviewed against repo state on 2026-04-29.

## Summary

This batch is uneven. The strongest cluster is multi-board nav: breadcrumb spine, frontmatter+stable IDs, and focus mode are all well-aligned with confirmed product direction (filesystem-first hierarchy, multiple boards per page, preview-first embeds). The collaboration/GitHub cluster is mostly premature for current phase 2/3 work and several ideas (timeline scrubber, PR diff view, fork-and-remix) presuppose a public hosted product surface that does not yet exist. The performance cluster is split: dirty-flag-and-save-state-bar reinvents existing infrastructure already in `JavaScript/braindump.js` (`hasPendingRepositorySave`, `isPersistingRepositoryState`, `markBoardDirty`, autosave loop), while lazy hydration and viewport virtualization address real performance pain that will hurt as nesting deepens. Cross-cutting theme: several ideas in the nav cluster are tightly coupled and should be sequenced, not bundled.

## Per-idea verdicts

### breadcrumb-spine-with-open-modes.md

- **Verdict**: keep
- **Relevance**: strong fit. `holistic_planning.md` "Resolved Direction From User Interview" line 105 confirms "Multiple boards per page are expected, including deep nesting" and line 106 confirms "Filesystem hierarchy should stay primary". A breadcrumb that mirrors both is on direction. The dark sidebar, teal-highlight visual constraints (`project.md` lines 40-46) are compatible with the sketch's chevron and slash glyphs.
- **Feasibility**: realistic but non-trivial. Touches `scripts/build-site.mjs:310` `renderSidebar` (currently a flat list of nav links, not a hierarchical tree) plus `JavaScript/site.js:1-220` (sidebar pure-chrome, no path resolution). No existing routing layer for board paths. The "open in this view" mode does not yet exist because boards are currently full-page navigations (`cosmoboard.html`, `braindump.html`). Drag-to-reparent on disk needs a `/api/move-board` endpoint that does not exist in `scripts/preview-server.mjs:505-573`.
- **Duplication risk**: heavy overlap with `nested-board-zoom-into-place.md` (both grow a "spine" on zoom-in), with `nested-board-zoom-portal.md` (also has a breadcrumb stack), with `focus-mode-for-nested-boards.md` (breadcrumb survives focus mode), and with `sidebar-tree-board-cards-with-drag-nest.md` (drag-to-reparent on the sidebar). These should be merged or sequenced, not advanced in parallel.
- **Notes**: missing a clear data model. Section says the spine "combines folder ancestors and canvas ancestors" but a board can be embedded in multiple parents. Open question on cycles is acknowledged but not resolved. This idea logically depends on `board-frontmatter-and-stable-ids.md` to handle the "same board at two points" case cleanly.

### sidebar-tree-board-cards-with-drag-nest.md

- **Verdict**: revise
- **Relevance**: partially on direction. Filesystem-first is right (project.md technical direction), but the existing sidebar (`scripts/build-site.mjs:310-342`, `JavaScript/site.js:1-220`) is a static, chrome-only nav with hardcoded links. Turning it into a live filesystem tree with hover previews and drag-to-nest is a large scope expansion that conflicts with the visual constraint "remain close to the original version" (`project.md` line 40).
- **Feasibility**: hard. No filesystem-walking endpoint exists in preview-server. Hover-card board previews need cheap thumbnail rendering, which currently does not exist; `board-preview` nodes in `braindump.js` already render full mini-canvases (`braindump.js:4010-4052`) but are not gallery-cheap. Rename-rewrites-link-targets is risky without stable IDs first.
- **Duplication risk**: overlaps with `breadcrumb-spine-with-open-modes.md` (drop targets), with `board-frontmatter-and-stable-ids.md` (the "stable identifier in frontmatter" the sketch's open question recommends), and possibly with `sidebar-fuzzy-filter.md` and `sidebar-collapse-and-focus-mode-chrome.md` in the same draft folder.
- **Notes**: the open question at the end ("stable id in frontmatter") is the right answer and is essentially a dependency on `board-frontmatter-and-stable-ids.md`. Revise to either narrow (just hover preview cards) or split into multiple specs. As written it is too many features in one file.

### nested-board-zoom-into-place.md

- **Verdict**: merge-with-nested-board-zoom-portal.md
- **Relevance**: on direction. Preview-first embeds with a path to live (`project.md` "Preview-first embeds by default, live embeds also possible") matches the sketch's swap-to-live-on-zoom. The reduce-motion fallback is good local-first hygiene.
- **Feasibility**: medium. The renderer already supports `board-preview` nodes with full embedded canvas (`braindump.js:4010+`, `data-board-mode="preview"` in `build-site.mjs:1578`). The zoom transition is achievable via the existing `updateTransform()` call but the "promote child to live editable" handoff needs new state. The faded-frame parent during chained zoom is novel and would need new render passes.
- **Duplication risk**: nearly identical to `nested-board-zoom-portal.md` in this folder (the portal version also has continuous zoom past threshold, breadcrumb stack, preview-to-live promotion). These two files should be merged into one spec. Also touches the same surface as `breadcrumb-spine-with-open-modes.md` (the breadcrumb segment growth).
- **Notes**: the "soft cap at five levels" answer to depth is reasonable but should be enforced consistent with whatever `lazy-board-hydration.md` decides about hydration depth.

### focus-mode-for-nested-boards.md

- **Verdict**: keep
- **Relevance**: solid fit. Aligns with `project.md` "Saved web app sessions inside markdown or canvas matter more than opening tools in new tabs" and the dark sidebar / teal accent constraint. URL-query-driven shareable focus state matches local-first portability.
- **Feasibility**: realistic. The "thin teal strip" sidebar treatment is achievable in `JavaScript/site.js:144-164` (already has `nav-desktop-collapsed` toggle). The per-tab focus state in URL query is straightforward.
- **Duplication risk**: overlaps with `sidebar-collapse-and-focus-mode-chrome.md` in the same draft folder (the file name itself signals overlap). Also tangential overlap with `breadcrumb-spine-with-open-modes.md` (focus preserves the spine). Should at least cross-reference, possibly merge.
- **Notes**: well-scoped sketch. The "deep focus" sub-mode is a nice optional and stays optional. Sound proposal.

### board-frontmatter-and-stable-ids.md

- **Verdict**: keep (high priority)
- **Relevance**: directly on direction. `holistic_planning.md` line 44 "Stay close to open formats where possible, especially markdown and JSON Canvas" makes adding a `meta` block at the top of `.canvas` files compatible with the existing format (`content/boards/canvas.schema.json`, `CANVAS_FORMAT.md`). Stable IDs are foundational for portability and for cross-file links surviving moves.
- **Feasibility**: medium. The `.canvas` parser lives wherever `serializeState()`/`loadState` operate in `braindump.js`. Adding an optional `meta` field is backward-compatible (the photo-cropping spec already added optional `crop` fields the same way). The id-to-path resolver is the load-bearing new piece. `scripts/build-site.mjs` already validates `entities` and `boards` (see `holistic_tasks.md` line 46) so adding meta validation fits the existing pattern.
- **Duplication risk**: this idea is a precondition for `breadcrumb-spine-with-open-modes.md` (cross-folder breadcrumbs need parent overrides), `sidebar-tree-board-cards-with-drag-nest.md` (the open question literally answers "stable id in frontmatter"), `region-anchored-canvas-comments.md` (anchoring by node id needs stable ids), and `canvas-pull-request-diff-view.md` (diff-by-id needs stable ids). It does not duplicate anything; it unblocks several.
- **Notes**: strong sketch. Should be sequenced first in the nav cluster.

### canvas-pull-request-diff-view.md

- **Verdict**: drop (revisit later)
- **Relevance**: misaligned with current phase. `holistic_planning.md` Phase 5 is "Async collaboration and versioning" with PR-aware review workflow, and there are existing GitHub recommendation/PR flows already in review queue (`holistic_tasks.md` line 93 `[A]` recommendation flows). But a full visual canvas diff renderer is a large self-contained product that competes with all in-flight phase-2/3 work.
- **Feasibility**: hard. Needs a diff utility for canvas trees, two-ref loading (which means GitHub API calls or local git working-tree access), node-rename detection by id (which requires stable ids that do not yet exist). Must run on a static host. Performance budget is unclear given that current single-board rendering is already a frame-drop concern (per `viewport-virtualized-canvas.md` problem statement).
- **Duplication risk**: depends on `board-frontmatter-and-stable-ids.md` for node-id-based diff. Overlaps with `commit-timeline-scrubber.md` (also wants two-ref board rendering). Indirectly with `region-anchored-canvas-comments.md` (PR comments are similar payload).
- **Notes**: the side-by-side plus onion-skin slider design is reasonable but premature. Park until basic boards-per-page nesting is stable.

### region-anchored-canvas-comments.md

- **Verdict**: drop (revisit in Phase 5/6)
- **Relevance**: misaligned with phase. `holistic_planning.md` Collaboration Maturity Model puts comments at Stage F. Current target is Stage A-C (single user / GitHub recommendation flow). The recommendation flow already in `[A]` review (see `braindump.js:307+`) is the current async surface; jumping to anchored comments is two stages ahead.
- **Feasibility**: medium-hard. Needs stable node ids (`board-frontmatter-and-stable-ids.md`). Sidecar `.comments.json` is reasonable but the round-trip-through-GitHub idea (encoding rect into a code block in PR review comments) is brittle.
- **Duplication risk**: depends on stable-ids spec. Overlaps with `canvas-pull-request-diff-view.md` (both target the PR review surface). Indirect overlap with `branch-scoped-scratch-boards.md` (both presume git workflow).
- **Notes**: skipping a maturity stage. The recommendation flow is the right Stage C surface. Anchored comments belong in Stage F.

### branch-scoped-scratch-boards.md

- **Verdict**: drop
- **Relevance**: misaligned. Project direction (`project.md` lines 31-34) says markdown and `.canvas` are core, filesystem is the primary hierarchy, multiple boards per page expected. Adding `<board>.scratch/<branch-slug>.canvas` is a clever filesystem convention but presumes the user routinely works on branches per board, which is a niche developer workflow that does not match how the user actually works on this site (single `main` branch dominantly per recent commits).
- **Feasibility**: medium. Detecting current git branch from a static-served preview server is messy. The "branch is deleted, prompt to archive" UX presumes a daemon or hook.
- **Duplication risk**: overlaps with `commit-timeline-scrubber.md` and `canvas-pull-request-diff-view.md` (all in the git-workflow cluster).
- **Notes**: solving a problem that has not been observed. Drop unless a real user pain emerges.

### fork-and-remix-public-boards.md

- **Verdict**: drop (revisit in later phase)
- **Relevance**: ambiguous. `project.md` line 19-25 explicitly states this repo is "the personal portfolio website for Evren Ucar" and "the active prototype host for the Cosmoboard product direction. All product exploration happens inside `evrenucar.com` for now". A "Remix this board" button on a public-facing portfolio page conflates the portfolio and the future product. Phase 5 in `holistic_planning.md` mentions "Stable board branches, PR-aware review workflow" but not user-facing fork/remix.
- **Feasibility**: hard. Needs GitHub OAuth (Phase 5 prereq, see `online_save_backend_plan.md` reference). Needs a `lineage.json` convention. Needs the entire cosmoboard onboarding page (see `holistic_planning.md` line 113: "after Braindump, add a `cosmoboard` onboarding page") which is itself not yet built.
- **Duplication risk**: overlaps with `commit-timeline-scrubber.md` open-as-scratch action. Overlaps with `branch-scoped-scratch-boards.md`.
- **Notes**: the "personal portfolio doubles as gallery of remixable boards" framing in the Notes section is a product pivot, not an MVP. Drop here, raise as a strategy question if reopened.

### commit-timeline-scrubber.md

- **Verdict**: drop
- **Relevance**: weak fit. Not on the roadmap. The phases in `holistic_planning.md` do not call for visual git history scrubbing.
- **Feasibility**: hard. Needs per-commit canvas parsing (cache concerns acknowledged in the sketch but not solved). Static-host path requires GitHub API rate-limit handling. Performance is a concern given how recent the photo-cropping work was about avoiding render thrash.
- **Duplication risk**: heavy overlap with `canvas-pull-request-diff-view.md` (same two-ref rendering primitive) and `branch-scoped-scratch-boards.md` ("open as scratch board" action).
- **Notes**: cool demo, wrong phase. Pairs with two other low-priority git-workflow ideas in the same batch, which suggests this whole sub-cluster is premature and should be parked together.

### content-hashed-asset-store.md

- **Verdict**: keep (modest priority)
- **Relevance**: solid fit. Local-first, filesystem-first, portable (`project.md` technical direction). Currently `scripts/preview-server.mjs:515` `/api/save-asset` collision-renames (per `photo-cropping.md` notes), so dedup-by-hash would replace that policy with something more disciplined. The orphan GC ties to `photo-cropping.md` follow-up "Orphan cleanup for baked files" (line 266 of that spec).
- **Feasibility**: medium. The asset save endpoint is the natural insertion point. SHA-256 hashing of buffers in Node is trivial. The index file is rebuildable. The interaction with photo-cropping's bake step needs care: bake produces a new file derived from another asset, and the open question "hash before or after crop" should answer "after".
- **Duplication risk**: overlaps with the photo-cropping orphan-cleanup follow-up. Mild overlap with `lazy-board-hydration.md` only in shared concern over disk bloat.
- **Notes**: well-scoped, real win. The "deduped, saved N KB" toast trust signal is good. Should be coordinated with the in-flight bundle export work (`handoff_export_bundling.md`) since bundle export is the consumer.

### append-only-edit-journal.md

- **Verdict**: revise
- **Relevance**: on direction (local-first crash recovery). But complementary to existing infrastructure rather than additive. `JavaScript/braindump.js:1321-1325` already saves serialized state to `localStorage` on every dirty change, and the autosave loop at `braindump.js:516-521` flushes to disk every 20 seconds. A separate IndexedDB op-journal layered on top is meaningful only if the existing localStorage snapshot is insufficient.
- **Feasibility**: medium. IndexedDB journal is fine but the "op-based, not full snapshots" requires defining an op vocabulary. Currently the codebase tracks actions via `pushAction`/`applyReverse`/`applyForward` (`braindump.js:1919, 1943, 2026`) which is op-shaped, but those are in-memory only.
- **Duplication risk**: large overlap with the existing localStorage save flow at `braindump.js:1321-1325` and with `dirty-flag-and-save-state-bar.md` (recovery banner is part of save UX).
- **Notes**: revise to clarify what op-journal adds beyond the existing localStorage snapshot. The current snapshot is whole-state on every dirty event, so it does in fact survive crash. The op-journal pitch is finer granularity for ops between snapshots. Worth pursuing only if user reports actual data loss.

### lazy-board-hydration.md

- **Verdict**: keep (high priority)
- **Relevance**: directly on direction. `holistic_planning.md` line 119 lists "Performance collapse" as the top product risk and recommends "Culling, LOD, async media, viewer-first design, cheap embeds". This idea is exactly that for the nested-boards case which is now in `[A]` review (`holistic_tasks.md` line 59).
- **Feasibility**: medium. `IntersectionObserver` integration into the build-time-emitted `data-board-mode="preview"` containers (`build-site.mjs:1578`) is feasible. The placeholder dimensions need to be known at build time, which fits the existing `renderEmbeddedBoardPreview` function.
- **Duplication risk**: tangential overlap with `viewport-virtualized-canvas.md` (both about culling, but different scopes: one is per-board, one is per-node). Should sequence: virtualization within a board, hydration across nested boards. They are complementary, not duplicates.
- **Notes**: open question about un-hydrated search is real but deferrable. The `?eager=1` flag for crawlers/printing is a thoughtful touch.

### dirty-flag-and-save-state-bar.md

- **Verdict**: revise (or drop in favor of UI-only enhancement)
- **Relevance**: on direction in spirit but largely reinvents existing code. The state-machine (clean/dirty/saving/error) and the per-document tracking already exist in `JavaScript/braindump.js`: `hasPendingRepositorySave` (line 397), `isPersistingRepositoryState` (line 398), `autosaveRepositorySupported` (line 396), `markBoardDirty` (line 501), debounced autosave loop (line 516-521), Cmd+S manual save tied to `saveBoard()` (line 7437). What does NOT exist is the user-visible footer pill UI; today users only see toolbar toasts (`braindump.js:582 showToolbarToast`).
- **Feasibility**: easy if reframed as "expose existing save state in a footer pill". Hard if it claims to introduce the underlying state machine.
- **Duplication risk**: significant duplication with existing autosave / dirty-flag infrastructure listed above. Mild overlap with `append-only-edit-journal.md` (which the sketch explicitly pairs with for `error` recovery).
- **Notes**: revise the spec to acknowledge the existing state machine. Scope down to: a `SaveStatusPill` UI component, hooks into the existing `markBoardDirty` / `saveBoard` flow, sessionStorage persistence of the pill state across reload, Cmd+S already exists (see `braindump.js:2799` "tool === save" handler). The 800ms debounce is already 20s by default (boardConfig.autosaveSeconds at `braindump.js:356`), and the user-tunable autosave-seconds setting is already in the settings panel (`braindump.js:319-320, 3264-3278`); 800ms is a UX claim that contradicts the existing tunable.

### viewport-virtualized-canvas.md

- **Verdict**: keep (medium priority)
- **Relevance**: directly on direction. Matches `holistic_planning.md` line 119 "Culling, LOD" mitigation for the top-listed product risk.
- **Feasibility**: medium-hard. The current renderer in `JavaScript/braindump.js` does not virtualize: every node is in the DOM (no `IntersectionObserver`, no AABB tests, grep confirms zero matches for `virtualized` / `virtualization` / `cullNode` in braindump.js). Connectors are SVG paths in `svgLayer` (`braindump.js:282`). Moving connectors to a single `<canvas>` redraw layer is a non-trivial render-pipeline change but well-scoped.
- **Duplication risk**: complementary to `lazy-board-hydration.md` (board-level vs node-level culling). No real duplicate. Indirectly affected by `photo-cropping.md` since cropped images already use a render hot path that must not be broken.
- **Notes**: the dev-overlay "rendered N of M" is good. The "text nodes need measured size before culling" caveat is correct and load-bearing. Sequence after the in-review nested-board work is fully accepted.

## Recommended next picks

- **`board-frontmatter-and-stable-ids.md`**: foundational for the nav cluster and for any future PR-diff or comments work. Unblocks several other ideas. No competing in-flight feature.
- **`focus-mode-for-nested-boards.md`**: small, well-scoped, on direction, and the sidebar hooks already exist in `JavaScript/site.js`. Quick win.
- **`lazy-board-hydration.md`**: addresses the top product risk (performance collapse with nesting) and fits cleanly onto the just-shipped `board-preview` infrastructure.
- **`breadcrumb-spine-with-open-modes.md`**: only after `board-frontmatter-and-stable-ids.md` lands. Solves real disorientation for the multi-board case the user explicitly called out in the user interview (`holistic_planning.md` line 105).
- **`content-hashed-asset-store.md`**: smaller scope, real disk-bloat win, pairs naturally with the in-flight bundle export work and the photo-cropping orphan-cleanup follow-up.

Bottom three to drop or defer: `commit-timeline-scrubber.md` (wrong phase, hard to host), `branch-scoped-scratch-boards.md` (niche workflow not observed in the user's actual usage), `fork-and-remix-public-boards.md` (conflates portfolio site with future product surface, requires Phase 5 OAuth that has not landed). The diff-view and anchored-comments ideas are interesting but should wait for stable IDs and for Phase 5 collaboration to actually start.
