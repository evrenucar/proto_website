# Review batch A: canvas, markdown integration, embeds

Reviewer: agent A. Reviewed against repo state on 2026-04-29.

## Summary

This batch is uneven. The markdown-to-canvas integration cluster is the strongest direction match for the product (markdown plus canvas as core formats, filesystem as truth, GitHub as the bridge), and three of those five ideas would feed neatly into the existing `[A] markdown-to-canvas` review-queue task. The canvas-interaction cluster is a mix of one solid idea (semantic snap, well-aligned with the markdown-as-grammar thesis), one already-claimed idea (nested zoom is in the same conceptual slot as `nested-board-zoom-into-place.md` plus the in-flight `[A] multiple boards per page` work), and three that are mostly orthogonal sketches. The embeds cluster is the most coherent group, since trust-and-budget, frozen unfurls, and saved sessions form a stack that maps cleanly to the existing bookmark/iframe code path in `JavaScript/braindump.js` and the project's preview-first default. Two embed ideas (live value pins, embed trust) are scope-heavy and need to be sequenced after a smaller embed primitive lands.

## Per-idea verdicts

### semantic-snap-to-markdown-structure.md

- **Verdict**: keep
- **Relevance**: Strong fit. Treats markdown as the layout grammar, which directly supports the `holistic_planning.md` line "Markdown and canvases should work together in both directions" and `project.md` "Markdown and `.canvas` are the core formats." Matches the registered direction that markdown is the durable writing layer and Cosmoboard is the spatial layer.
- **Feasibility**: Realistic but non-trivial. There is no group/parent concept in `JavaScript/braindump.js` today (grep for `group|groupNode` returns nothing), so the "snap to parent group" half assumes infrastructure that does not exist. The "snap to heading rhythm" half can be attempted earlier on top of the markdown node type (`renderMarkdownNode` at `JavaScript/braindump.js:5067`, `parseMarkdownToHtml` at line 4104). Drag handler hooks exist around the selection box logic at `braindump.js:1419` and `1710`.
- **Duplication risk**: Conceptually overlaps with `heading-to-group-roundtrip.md` (this batch) which also wants to bind markdown headings to canvas groups. Different angle (snap-time guides vs. file-level reconciler), but both presume a group concept the runtime does not yet have.
- **Notes**: The strongest part is the "snap lens" toggle, which keeps the user in control. The bit about recording parent-child links into `.canvas` for export reordering is hand-wavy and would need a dedicated section on the on-disk shape. Worth promoting to a spec, but trim to the heading-rhythm slice for the MVP.

### nested-board-zoom-portal.md

- **Verdict**: merge-with-`nested-board-zoom-into-place.md`
- **Relevance**: Fits. Nesting is explicitly called out in `holistic_planning.md` ("Multiple boards per page are expected, including deep nesting") and is already partly delivered by the `[A] Support multiple boards per page` review-queue item.
- **Feasibility**: The `board-preview` node type already exists (`JavaScript/braindump.js:48, 229, 3633`) and has `embedMode = "preview" | "live"` toggling at line 3768. A continuous-zoom portal is a much bigger ask than the current "click to open" interaction. Most of the heavy lifting (camera, breadcrumb stack, zoom thresholds, focus state across nested instances via `_activeBoardViewport`) would touch the new `mountCosmoboard` factory.
- **Duplication risk**: There is a separate `nested-board-zoom-into-place.md` draft in this folder doing the same thing, and `focus-mode-for-nested-boards.md` is adjacent. Also overlaps with the in-flight multiple-boards work in `holistic_tasks.md`. Pick one. Probably consolidate into a single "nested board navigation" spec.
- **Notes**: Breadcrumb-from-filesystem-path is the right shape given filesystem-as-hierarchy. The Prezi-style continuous-zoom framing is over-promised for a static-site-friendly v1, recommend trimming to discrete jumps with eased camera transitions.

### lasso-to-markdown-list.md

- **Verdict**: revise
- **Relevance**: Mid. Markdown-as-output direction fits, but the "named selections in the sidebar" piece introduces a new persistence layer that competes with the registry/entity work already shipped in `[A] shared-entity model`.
- **Feasibility**: Multi-select rectangle drag exists today (`selectionBox` at `braindump.js:1419`, drag logic at `1710`) but a freehand lasso and a clipboard-as-markdown path do not. Spatial reading order from a clockwise loop is interesting, harder than it looks. "Re-highlights those exact cards even after the canvas has been edited" requires stable node ids (these exist via `node.id` and `nodeId` references at line 1499 onward), so reachable.
- **Duplication risk**: The "save selection as durable artifact" overlaps in spirit with `reversible-layout-snapshots.md` (this batch) which also captures selection-like state into a sidecar file. Different scope but they should coordinate on sidecar conventions.
- **Notes**: Trim. MVP is just "lasso then copy as markdown list." Defer named selections, deletion handling, and nested-board-as-sublist to follow-ups. The struck-through-deleted-entry behavior is over-designed for a brainstorm tool.

### command-palette-spatial-jump.md

- **Verdict**: drop (for now)
- **Relevance**: Loose fit. A palette is useful, but it does not advance the markdown-canvas-coexistence pillar in a meaningful way and competes with the lower-hanging "sidebar fuzzy filter" / "find in canvas overlay" / "full text search across md and canvas" items already in this folder.
- **Feasibility**: There is no search index in the codebase today (grep shows only URL `searchParams`, nothing for content search). Building a cross-file index, lazy-loading nested board indexes, and hooking a camera animation to a result would be a multi-week effort.
- **Duplication risk**: Heavy. Overlaps with `quick-open-palette-with-canvas-nodes.md`, `find-in-canvas-overlay.md`, `full-text-search-across-md-and-canvas.md`, `sidebar-fuzzy-filter.md`. Picking this one over those would be a coin flip.
- **Notes**: The "spatial commands in the palette" twist (align left, group, snap to structure) is nice but also assumes features the runtime does not have yet (no group, no snap-to-structure). Wait until at least one of those lands, then revisit.

### reversible-layout-snapshots.md

- **Verdict**: revise
- **Relevance**: Good fit on local-first and git-friendly axes. Sidecar files next to `.canvas` match the filesystem-as-hierarchy direction.
- **Feasibility**: Undo is per-action, in-memory (`undoHistory`, `historyIndex`, `MAX_HISTORY` at `braindump.js:1459, 1920`). No cross-session history exists. Snapshot-as-deltas-against-base requires writing a diff format, which is real work but tractable. The save endpoint exists (`/api/save-board` at `preview-server.mjs:505`); a sibling `/api/save-snapshot` is a small extension.
- **Duplication risk**: Overlaps with `commit-timeline-scrubber.md` and `append-only-edit-journal.md` outside this batch. Both touch "history beyond undo." Also conceptually overlaps with the GitHub PR/recommendation flow already shipped in `[A] dual portable import and export` and `[A] GitHub recommendation`. Layout snapshots could end up being a lighter local cousin of those.
- **Notes**: The "branch from here" action is the strongest part; it gives a concrete user value beyond just "extra undo." Drop the auto-snapshot-on-destructive-action suggestion, that competes with undo's job and adds noise. Snapshot retention should be cap-by-count for v1, the open question is overthought.

### heading-to-group-roundtrip.md

- **Verdict**: drop (premature)
- **Relevance**: On-direction in spirit (markdown plus canvas working both ways) but too ambitious for current state.
- **Feasibility**: The runtime has no group concept (grep for `group|groupNode` returns nothing in `braindump.js`). A heading-to-group reconciler with stable ids, reorder, delete-prompt, and conflict policy presupposes group infrastructure that does not exist. Markdown-side parser is currently the inline `parseMarkdownToHtml(md)` at `braindump.js:4104` with no AST or stable-id support.
- **Duplication risk**: Overlaps with `semantic-snap-to-markdown-structure.md` (also wants markdown headings to drive canvas spatial layout) and indirectly with `board-frontmatter-and-stable-ids.md`. Both are prerequisites for this idea.
- **Notes**: Right idea, wrong order. Land stable ids and a group node type first, then revisit. Until then, this spec would be all infrastructure and no shipping value.

### anchor-links-open-canvas-node.md

- **Verdict**: keep
- **Relevance**: High. Directly serves "Markdown and canvases should work together in both directions" and the GitHub-bridge story (linkable nodes are shareable in PR descriptions and issue bodies).
- **Feasibility**: Reachable. Node ids already exist (`nodeObj.id` everywhere). The board mount entry point is `mountCosmoboard(hostElement)` per `holistic_tasks.md` review queue, so accepting a hash fragment and centering+pulse-highlighting is small. Markdown link grammar is already inline-parsed in `parseMarkdownToHtml`. Backlinks index can piggyback on the existing build step in `scripts/build-site.mjs`.
- **Duplication risk**: Overlaps with `transclude-board-region-by-anchor.md` and `A_transclude-canvas-node-in-markdown.md` in this batch on the "stable anchor for a node or region" foundation. Anchor-links is the lowest-risk MVP of that foundation; transclusion can build on top.
- **Notes**: Drop the "persist last-used view per anchor visit" piece for v1, that adds a per-visitor state store the project does not yet have. Group-as-anchor depends on the missing group concept, so MVP should restrict to single-node anchors.

### transclude-canvas-node-in-markdown.md (filename `A_transclude-canvas-node-in-markdown.md`)

- **Verdict**: keep
- **Relevance**: Very high. Maps to `holistic_tasks.md` review-queue item `[A] markdown-to-canvas and canvas-to-markdown embedding and reference flows`, which explicitly notes "canvas-to-markdown export" and "md-to-board navigation" as remaining. Transcluding a single canvas node into markdown closes the gap from the other direction.
- **Feasibility**: The `markdown` node type already renders embedded markdown (`renderMarkdownNode` at `braindump.js:5067`). The reverse flow, taking one canvas node and emitting it into markdown rendering, is mostly new but uses the same fetch-and-render pipeline. Static-host-friendly via build-time resolution in `scripts/build-site.mjs`.
- **Duplication risk**: Overlaps with `transclude-board-region-by-anchor.md` (this batch) in scope. They are different cuts of the same idea (single node vs. labeled region). Should merge into one spec with two granularities, or pick the node-only slice for the MVP and defer regions.
- **Notes**: The `A_` filename prefix suggests this was already promoted; check before re-promoting. The "render group node with relative children" stretch goal hits the same missing-group-concept blocker as several other ideas in this batch. MVP should be: one node, no edges, no group expansion.

### code-block-as-canvas-widget.md

- **Verdict**: drop
- **Relevance**: Drifts off-direction. The `holistic_planning.md` Stage F (App surface) is phase 7. The product pillar is "no silent code execution." Even with the "no eval, no remote fetch" caveat, this introduces a widget runtime ahead of the boards-and-markdown core.
- **Feasibility**: Real work. Needs a widget registry, fence-info-string handler in markdown, sandboxing, sidecar `.canvas-state` files, and the "live values across blocks" reactive model. None of this scaffolding exists.
- **Duplication risk**: Lighter overlap with `live-value-pins-from-pages.md` (this batch) and `saved-session-embeds-for-web-tools.md` (this batch). All three are "embed something live in the canvas." Saved-session-embeds is the higher-priority one per `holistic_planning.md` "Saved web app sessions are the first priority."
- **Notes**: Mermaid is the one widget that almost trivially fits ("recognize ` ```mermaid` and render"), but that does not need this whole framework. Suggest a one-liner draft for "render Mermaid in markdown nodes" instead and drop this idea.

### frontmatter-from-metadata-canvas.md

- **Verdict**: revise
- **Relevance**: Fits the structured-portability direction (`Pillar: Structured`, "structured data stays portable toward Obsidian-like workflows"). Gives a friendly visual surface for YAML which the user has called out as desirable.
- **Feasibility**: There is no frontmatter handling in `scripts/build-site.mjs` today (grep returns no `frontmatter|YAML` matches). All page metadata flows from `src/site-data.mjs` and the `notion-items.json` import. So this would introduce frontmatter parsing as a new subsystem in addition to the canvas-as-source mapping. Two new pieces, two failure modes.
- **Duplication risk**: Overlaps in spirit with `board-frontmatter-and-stable-ids.md` (out of batch). The shared-entity work (`src/entities/eurocrate-storage-system.json` per the active task) is closer to the "structured data via files" goal and is already shipping.
- **Notes**: Land plain YAML frontmatter parsing first as its own small spec, then layer the metadata-canvas surface on top. Otherwise this idea bundles two features. The "type:" prefix in node bodies is a smell, types belong in a sidecar schema, not in the visible label.

### frozen-unfurl-with-staleness-meter.md

- **Verdict**: keep
- **Relevance**: Strong fit on local-first and static-site-friendly direction. Solves a real problem with the current bookmark code, which fetches fresh from `microlink.io` and YouTube oEmbed every render (`fetchBookmarkPreview` at `braindump.js:930`) and never caches to disk.
- **Feasibility**: Reachable. Bookmark nodes already store `title`, `description`, `image` on the node (`braindump.js:3889`). Adding a sidecar `.unfurls/` folder, a hash, a timestamp, and a staleness color is a focused change. The save endpoint at `preview-server.mjs:515` (`/api/save-asset`) can persist the og:image to disk.
- **Duplication risk**: Conceptually adjacent to `embed-trust-and-network-budget.md` (this batch) and `saved-session-embeds-for-web-tools.md` (this batch). All three rework the embed pipeline. This one is the smallest slice and a good v1 to land first.
- **Notes**: The "click to refetch and diff" interaction is great. Drop the "right-click to convert to live iframe" line for v1, since the runtime already has an `embedMode` toggle on link/board nodes (`braindump.js:3661, 3768`); reuse the existing affordance instead of inventing a new context-menu path.

### saved-session-embeds-for-web-tools.md

- **Verdict**: keep (but later)
- **Relevance**: Direct match for the user-confirmed direction "Saved web app sessions are the first priority" in `holistic_planning.md`. This is the named app-embed feature for that line.
- **Feasibility**: Hard. Needs: an adapter contract, per-tool implementations, a session-blob store, a screenshot capture pipeline, postMessage routing, and a permission model. The existing iframe is generic and unsandboxed-ish (`sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"` at `braindump.js:3796`). Roadmap places App Surface at Phase 7.
- **Duplication risk**: Overlaps with `embed-trust-and-network-budget.md` (this batch) on the trust list and sandbox model. They should share that infrastructure.
- **Notes**: Worth a spec, but only after `frozen-unfurl-with-staleness-meter.md` and `embed-trust-and-network-budget.md` ship. Until then, the foundation is missing. The "user-extensible adapters via plain JS file in the vault" suggestion needs a more conservative path; arbitrary user JS in the static-host build is a security and packaging headache.

### transclude-board-region-by-anchor.md

- **Verdict**: merge-with-`A_transclude-canvas-node-in-markdown.md`
- **Relevance**: Same spot as the canvas-node transclusion idea. Region-level is a strict superset.
- **Feasibility**: Region anchors require labeled selections or groups, which do not exist yet (no `group` in `braindump.js`). Stable anchor ids are easier (just hash the bounding box plus label). Live propagation on file change wants a watcher; static-host build re-renders accomplish the same on rebuild.
- **Duplication risk**: Direct overlap with `A_transclude-canvas-node-in-markdown.md` (this batch). Pick the node version for v1, add region anchors as a follow-up section on the merged spec.
- **Notes**: The "soft-broken state with replacement picker" is a thoughtful detail and should be carried over to the merged spec. Configurable max recursion depth is correct, hardcode it at 3 for v1.

### live-value-pins-from-pages.md

- **Verdict**: drop
- **Relevance**: Mixed. The local-first framing is OK, but scraping arbitrary web pages from a static-site-friendly product is a category jump. Adds a network worker, a selector picker, a per-domain trust list, and a refresh policy, all for a niche use case.
- **Feasibility**: The repo has no service worker, no node-side scraper helper, no XPath/CSS selector resolver, no live-iframe selector picker. Each of these is its own subsystem. CORS will block most pages from being fetched directly in the browser, so the browser path is a non-starter without a proxy, and the proxy violates the static-host constraint.
- **Duplication risk**: Trust list overlaps with `embed-trust-and-network-budget.md` (this batch). The "live data refresh" overlaps with `frozen-unfurl-with-staleness-meter.md`. If anything, this is staleness-meter plus a selector, but the selector half is the expensive half.
- **Notes**: Drop until there is a real story for cross-origin fetches in a static-host context. Login-walled pages being out of scope is correct, but most non-login pages also block scrape-style fetches.

### embed-trust-and-network-budget.md

- **Verdict**: keep
- **Relevance**: Strong fit on the safety-by-default pillar ("Sandboxed embeds, explicit local file permissions, no silent filesystem crawling") and on performance ("Pan, zoom, drawing, file previews, and embeds do not block interaction").
- **Feasibility**: The current iframe sandbox at `braindump.js:3796` already uses a coarse allowlist; tightening that and gating it on a per-domain trust list is reachable. The fetch coordinator and budget meter are new but small. The audit-this-board view is a nice-to-have that can be a later cut.
- **Duplication risk**: Direct overlap with `frozen-unfurl-with-staleness-meter.md` (this batch) on the embed-mode taxonomy (`frozen` vs `preview` vs `live`). They should share definitions. Also overlaps with `saved-session-embeds-for-web-tools.md` (this batch) on the sandbox model.
- **Notes**: Promote, but specify it as the umbrella spec that frozen-unfurl and saved-session both consume. The "trust list as plain text file" suggestion is the right answer, do not hide it behind a settings-only UI.

## Recommended next picks

- `anchor-links-open-canvas-node.md`: smallest, highest-value spec to advance. Uses existing node ids, existing markdown parser, existing mount path. Closes the named gap "md-to-board navigation not yet wired" in the review-queue task.
- `A_transclude-canvas-node-in-markdown.md` (merged with `transclude-board-region-by-anchor.md`): direct continuation of the in-flight markdown/canvas integration work. Restrict v1 to single-node transclusion; add region anchors as follow-up once a group concept exists.
- `frozen-unfurl-with-staleness-meter.md`: clean, self-contained replacement for the live-fetch bookmark code path (`fetchBookmarkPreview` at `braindump.js:930`). Lands the offline and static-export story for unfurls.
- `embed-trust-and-network-budget.md`: umbrella spec that frozen-unfurl and (later) saved-session-embeds plug into. Encodes the preview-first default and sandbox model in one place.
- `semantic-snap-to-markdown-structure.md`: the most differentiated canvas-interaction idea in the batch and a clear expression of the markdown-as-grammar product thesis. Trim MVP to heading-rhythm snapping only, defer the parent-group half until a group node type exists.
