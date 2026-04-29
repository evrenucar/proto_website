# Review batch C: mobile / touch, search / discovery, portability, visual polish / a11y

Reviewer: agent C. Reviewed against repo state on 2026-04-29.

## Summary

This batch is mixed but useful. The strongest cluster is search / discovery, where four of five drafts are realistic, distinct, and clearly aligned with the filesystem-first product direction. The mobile / touch cluster is the weakest because it overlaps with substantial existing implementation (pinch-zoom is already in `JavaScript/braindump.js:2280-2496`) or assumes infrastructure that does not yet exist (no PWA manifest, no service worker). Portability ideas are on direction but several already overlap with the in-flight bundle export handoff (`.agents/handoffs/handoff_export_bundling.md`). Visual polish is the most fragile group: theming, light mode, and chrome rework all push close to the "do not turn it into a different brand" line in `project.md:48`. The two safe visual picks are reduced-motion and print stylesheets, both small and surface-respecting.

## Per-idea verdicts

### canvas-pinch-zoom-and-two-finger-pan.md

- **Verdict**: drop (or merge as a follow-up polish issue against the existing implementation).
- **Relevance**: aligns with "Keep desktop, tablet, and mobile behavior in scope" (`project.md:76`). But the feature is already shipped.
- **Feasibility**: not feasible as a new feature because pinch-zoom and the two-finger gesture flow already exist. See `JavaScript/braindump.js:2280-2496`: `beginPinchZoom`, `pinchStartCamera`, `pinchStartMidpoint`, anchor math at lines 2387-2394, clamp at line 2394, plus the trackpad `ctrlKey + wheel` path in `applyWheelZoom` at line 2253. The `viewport` element handles both `touchstart`/`touchmove`/`touchend` and the wheel path.
- **Duplication risk**: high. Duplicates shipped behavior. The "single finger drag pan" open question is also already answered: `JavaScript/braindump.js:2336-2360` shows touch-pan is gated on the active tool and on whether the touch landed on a node.
- **Notes**: the only items in this draft that are not already implemented are: zoom-snap-to-1.0, inertial decay, the floating zoom indicator, and `prefers-reduced-motion` for inertia. Those are small polish items, not a new feature spec. Convert to a one-line entry in `general_issues_and_tasks.md` if the user actually wants them.

### long-press-radial-menu.md

- **Verdict**: revise.
- **Relevance**: fits the mobile scope and the "Keep mobile UX" risk in `holistic_planning.md:124`. There is no contextmenu pattern in `JavaScript/braindump.js` today (Grep over `contextmenu|right.click|long.press` returns zero hits in the runtime), so the underlying problem is real.
- **Feasibility**: doable. The `pointerdown` plumbing on `viewport` already distinguishes touched items from background (`braindump.js:2331`), so the timer-and-cancel pattern can hang off the existing branch. The radial UI is the part that needs design work, not the input.
- **Duplication risk**: low against in-flight features. Some overlap with `command-palette-spatial-jump.md` and `quick-open-palette-with-canvas-nodes.md` (this batch) only at the "list of node actions" level, not at the gesture level.
- **Notes**: the draft punts on the most important question, which actions belong on the menu. Before a spec, the user needs to decide which contextual actions exist for each node type. Without that decision the radial UI is a shell. The `navigator.vibrate(10)` is a nice touch but iOS Safari ignores it (already noted). Recommend revise to start as a "long-press opens the same plain context menu we render for desktop right-click", radial as a follow-up.

### mobile-sidebar-as-bottom-sheet.md

- **Verdict**: drop (for the portfolio site) or scope to "Cosmoboard pages only" if pushed.
- **Relevance**: tension with `project.md:38-48`, especially line 40 ("dark overall look, left sidebar navigation") and line 48 ("Avoid turning it into a completely different brand or layout"). The existing mobile pattern is already a slide-in side-panel triggered by a hamburger (see `CSS/site.css:1782-1805` and the `nav-pos-left` / `nav-open` toggles). Replacing it with a bottom sheet is a layout-level change.
- **Feasibility**: technically straightforward but the cost / benefit is bad. The current panel pattern works, the user has not flagged it as broken, and a bottom sheet introduces a new gesture vocabulary that competes with the canvas's own touch handling.
- **Duplication risk**: overlaps with `sidebar-collapse-and-focus-mode-chrome.md` in this batch (both want a different sidebar shape). Pick one direction, do not run both.
- **Notes**: if the user genuinely wants a bottom-sheet pattern, scope it to Cosmoboard editing pages where the sidebar competes for canvas space, not to portfolio routes. Otherwise drop.

### soft-keyboard-aware-editor.md

- **Verdict**: keep.
- **Relevance**: directly supports "Keep desktop, tablet, and mobile behavior in scope" (`project.md:76`) and "Saved web app sessions inside markdown or canvas matter more" (`project.md:34`). If markdown editing on mobile is broken by the keyboard, the local-first writing-everywhere claim does not hold.
- **Feasibility**: realistic. `VisualViewport` is well supported. Touch points are the markdown-node editor in `JavaScript/braindump.js` (the `markdown` node type added in the in-flight markdown work, see `holistic_tasks.md:71-82`) and the existing inline editing surfaces. No backend or build change needed.
- **Duplication risk**: low. Pairs with `mobile-sidebar-as-bottom-sheet.md` thematically but does not overlap. No in-flight feature touches this.
- **Notes**: the IME / Turkish input mention is appropriate. Default to scroll, not zoom (the draft's open question), to match the "do not disorient" principle. Cheap and self-contained, good MVP candidate.

### camera-and-share-target-capture.md

- **Verdict**: revise (split).
- **Relevance**: capture-via-camera fits the local-first direction. Share target requires a PWA manifest, which the repo does not have today (Grep for `manifest.webmanifest|share_target|service.worker` returns zero hits in runtime code).
- **Feasibility**: the camera input half is one HTML attribute and a wire to the existing image-drop path in `braindump.js`. The share target half is a separate, larger project: needs `manifest.webmanifest`, an installable PWA shell, a service worker for the share-target route, and probably HTTPS-only operation. That is not "lightweight" work in the sense of `project.md:70`.
- **Duplication risk**: pairs naturally with `photo-cropping.md` (already shipped), as the draft notes. No conflict.
- **Notes**: split into two specs. Camera input is a 30-minute change; ship it. Share target is a multi-day project with its own ergonomics (where do shared links land, how is the active board picked) and needs its own spec.

### quick-open-palette-with-canvas-nodes.md

- **Verdict**: keep.
- **Relevance**: directly supports "filesystem hierarchy should stay primary" (`project.md:31`) and "multiple boards per page are expected, including deep nesting" (`holistic_planning.md:106`). With deep nesting, walking the sidebar is impractical, so a flat fuzzy jump is needed.
- **Feasibility**: doable. There is no existing search index (Grep `search-index|searchIndex|miniSearch` returns zero hits in runtime). The build script already walks the content tree (see `scripts/build-site.mjs:80+` and the boards/markdown handling), so an in-memory index built at page load from existing data is realistic. Ctrl+P is unbound today.
- **Duplication risk**: meaningful overlap with `command-palette-spatial-jump.md` (not in this batch but in the same draft folder) and `full-text-search-across-md-and-canvas.md` (this batch). Need to decide if Ctrl+P opens a quick-open (filename/title only) or a full-text search. Recommend: Ctrl+P = quick-open, Ctrl+Shift+F = full-text search, sidebar input = filter-in-place. Three distinct surfaces, three distinct keys.
- **Notes**: the URL hash for deep-linking nodes (`#node=abc123`) is a good call and pairs with the in-flight stable-id work referenced by `board-frontmatter-and-stable-ids.md`.

### full-text-search-across-md-and-canvas.md

- **Verdict**: keep.
- **Relevance**: portability and discoverability, both in scope. Static-host friendly approach (`search-index.json` written at build) matches `project.md:71-72`.
- **Feasibility**: realistic. `scripts/build-site.mjs` already walks markdown and canvas files (it validates `entities` and generates `content/entities/index.json`, see `holistic_tasks.md:46`), so adding a search-index emitter is incremental. MiniSearch (~30KB) is reasonable; a hand-rolled inverted index for portfolio scale is also fine.
- **Duplication risk**: paired with `quick-open-palette-with-canvas-nodes.md` and `sidebar-fuzzy-filter.md` (both this batch). Three different surfaces, only one of them needs the index. Build the index once, share across surfaces.
- **Notes**: the index-size cap is the right concern. Start with title + first paragraph only, add full body if size stays small. The "skip frozen unfurls" rule is also right.

### sidebar-fuzzy-filter.md

- **Verdict**: keep.
- **Relevance**: smallest, most aligned with the filesystem-first direction. Preserves spatial context.
- **Feasibility**: pure DOM filter on the existing tree. The sidebar today (`CSS/site.css:1782+`, `JavaScript/site.js`) does not have a filter input. Adding one is a small, contained change.
- **Duplication risk**: distinct from `quick-open-palette-with-canvas-nodes.md` (the draft itself calls this out correctly: filter preserves tree, palette flattens). No overlap with in-flight work.
- **Notes**: shareable matcher utility with the palette is a sensible refactor target. The Esc-restores-prior-state rule is the kind of detail people miss; good catch in the draft.

### backlinks-and-incoming-references-panel.md

- **Verdict**: revise.
- **Relevance**: fits the Obsidian-portability goal in `project.md:33`. Backlinks are the canonical Obsidian feature.
- **Feasibility**: feasible at build time. Parsing `[text](path)` is trivial, parsing `[[wikilink]]` requires deciding whether the site supports wikilinks at all (Grep on `\[\[.*\]\]` shows zero matches in runtime code), parsing canvas edges with `fromNode` / `toNode` is straightforward against the JSON Canvas shape documented in `content/boards/CANVAS_FORMAT.md`.
- **Duplication risk**: somewhat overlaps with `transclude-canvas-node-in-markdown.md` (in the draft folder, not this batch) at the link-resolution level. Both need a reference graph. Build that graph once.
- **Notes**: the draft is fine but glosses over the two real questions. First, is the site supposed to support `[[wikilink]]` at all? If not, drop that branch from the parser. Second, what does "current view" mean on a portfolio site, the page or the canvas node? Decide before implementing.

### find-in-canvas-overlay.md

- **Verdict**: keep.
- **Relevance**: scoped to the canvas surface, not site-wide. Matches the user's existing in-canvas mental model.
- **Feasibility**: doable. Canvas state lives in memory in `braindump.js`, so iterating nodes for text matches is cheap. Pan-to-match needs the existing camera transform helpers (see `applyWheelZoom` at `braindump.js:2253` for the math pattern). Ctrl+F currently goes to the browser's find; the overlay needs to `preventDefault` on Ctrl+F when a canvas is focused, which is a known gotcha but solvable.
- **Duplication risk**: distinct from full-text-search (different scope, different UI). The draft says this explicitly and it is correct.
- **Notes**: "Match count from canvas JSON, not the rendered DOM" is the right call given any future virtualization (see also `A_viewport-virtualized-canvas.md` in the draft folder).

### jsoncanvas-roundtrip-validator.md

- **Verdict**: keep (as a tool / test, not a user-facing feature).
- **Relevance**: directly supports "Stay close to open formats where possible" (`holistic_planning.md:44`). The repo already documents JSONCanvas-likeness in `content/boards/CANVAS_FORMAT.md:5` and acknowledges interchange profiles (`native`, `obsidian-compatible`, `portable-bundle`) at line 176, so a validator is the natural way to keep the claim honest.
- **Feasibility**: feasible. The loader and serializer paths exist (the bundle export handoff `.agents/handoffs/handoff_export_bundling.md` covers this). Adding a fixture set under `tests/` and running round-trip diffs is incremental.
- **Duplication risk**: low. Touches the same loader/serializer that the in-flight bundle export already touches, but as verification, not a competing implementation.
- **Notes**: prefer to ship this as a `tests/canvas/jsoncanvas-roundtrip.test.mjs` rather than as a sidebar UI button. Validating in CI is more useful than a "Validate canvas" dev sidebar action that nobody runs. The "passthrough bag for unknown fields" recommendation is correct and should be a hard rule, not optional.

### obsidian-vault-import.md

- **Verdict**: revise (descope).
- **Relevance**: very on-direction. Obsidian portability is called out in `holistic_planning.md:108` and `project.md:33`. This is the kind of feature that justifies the whole portability effort.
- **Feasibility**: ambitious but possible. File System Access API is Chromium-only; the zip fallback path already has a hook (the in-flight bundle import uses fflate, see `JavaScript/braindump.js:3041-3074`). The hard part is wikilink resolution ("shortest path that is unique" rule), embed handling, and Dataview-block handling (the draft punts to fenced code on first pass, which is fine).
- **Duplication risk**: leans on `content-hashed-asset-store.md` (draft folder, not this batch). That dependency has to land first or the import dedupes nothing.
- **Notes**: too big as a single feature. Slice it: (1) walk a vault folder and list everything, with a dry-run report; (2) import markdown only, no link rewriting; (3) import canvases; (4) wikilink resolution; (5) embeds and assets. Each slice is shippable on its own. Without the slicing this becomes a multi-week project that stalls.

### board-zip-bundle-export.md

- **Verdict**: drop (already implemented in flight).
- **Relevance**: on-direction.
- **Feasibility**: already shipped. See `holistic_tasks.md:90-94` ("Add dual portable import and export flows for `.canvas` (Git-friendly vs Bundle)") which links to `.agents/handoffs/handoff_export_bundling.md`. The fflate-based unzip path at `JavaScript/braindump.js:3041` is the reload half, the matching export half is in the same handoff scope.
- **Duplication risk**: very high. Duplicates the in-flight bundle export task. No new spec needed.
- **Notes**: anything in this draft that is genuinely missing from the in-flight work (the `README.md` inside the bundle, the streaming ZIP writer for very large bundles) should be added as bullets to the handoff doc, not as a new feature spec.

### public-read-only-share-bundle.md

- **Verdict**: keep (after bundle export ships).
- **Relevance**: aligns with `project.md:71-72` (static-host first) and the "Stage B / Stage C" collaboration model in `holistic_planning.md:78-83`. A read-only published bundle is the natural Stage B output.
- **Feasibility**: realistic but depends on (a) the bundle export landing first, (b) a viewer-only build target, (c) router that omits edit routes. The third is the main work because the current `JavaScript/braindump.js` is one runtime that does both view and edit; a viewer-only mode requires a real split.
- **Duplication risk**: builds on `board-zip-bundle-export.md` (already in flight). Not in conflict, in sequence.
- **Notes**: the "Publish to GitHub Pages" helper is feature creep. Drop it for v1. Producing the static folder is the core; how the user puts it online is their problem. The "view in Cosmoboard" button is a nice round-trip and worth keeping.

### excalidraw-import-to-jsoncanvas.md

- **Verdict**: drop (for now).
- **Relevance**: tangential. The repo already treats Excalidraw as an embedded app prototype (`content/apps/excalidraw-proto.json`, `src/apps/excalidraw-proto.json`), not as a native canvas format. The user direction in `holistic_planning.md:108` is "Obsidian portability matters", not Excalidraw portability.
- **Feasibility**: doable but high effort for low payoff. The Excalidraw element schema is large and the freedraw-to-PNG fallback is a real piece of work. None of the value compounds with anything else in the roadmap.
- **Duplication risk**: low.
- **Notes**: park in `holistic_backlog.md`. Revisit only if a real user shows up with an Excalidraw vault they want to bring in.

### canvas-keyboard-nav-and-aria.md

- **Verdict**: keep (slim MVP).
- **Relevance**: a11y is not explicitly called out in `project.md` but the site is a public portfolio and the "high performance on desktop, tablet, and mobile" pillar (`holistic_planning.md:41`) implies usable on whatever input the user has. Grep for `role=.application|role=.group|aria-label` shows 355 hits across `.js/.css/.html/.mjs` so the site already takes some a11y care, but `JavaScript/braindump.js` itself has minimal canvas-side ARIA.
- **Feasibility**: realistic for the slim version (focus ring + tab order + arrow-key spatial nav). The full ARIA model with edges and live regions is a much larger job and the open question in the draft (how to announce edges) is unresolved.
- **Duplication risk**: low. No in-flight feature touches this. Pairs with `find-in-canvas-overlay.md` thematically, both add keyboard-driven canvas navigation.
- **Notes**: ship the focusable-nodes + arrow-key nav slice first. Defer the live-region edge announcements until a screen-reader user actually tries the canvas. Use the existing teal accent for the focus ring (`project.md:46`).

### reduced-motion-and-animation-budget.md

- **Verdict**: keep.
- **Relevance**: small, surface-respecting, and aligned with portability and inclusivity. There is exactly one `prefers-reduced-motion: reduce` block today (`CSS/site.css:2084`) and it covers only the bottom-ticker. Everything else is unguarded.
- **Feasibility**: small. Add CSS custom properties for durations in `CSS/site.css` and `CSS/braindump.css`, audit existing transitions, gate the canvas wipe (which the current branch `fix/canvas-wipe-and-markdown-render` is about) on the media query.
- **Duplication risk**: pairs with `sidebar-collapse-and-focus-mode-chrome.md` (this batch) which also wants motion tokens. Land this first so the chrome work inherits the tokens.
- **Notes**: the user-toggle in the sidebar footer is feature creep. The OS preference is enough for v1. Keep the budget rule (page transitions under 200ms etc) as written, document it once.

### optional-light-mode-with-paired-tokens.md

- **Verdict**: drop.
- **Relevance**: tension with `project.md:38-48`. Specifically: "dark overall look" (line 41) and "Avoid turning it into a completely different brand or layout while work still lives inside the current portfolio site" (line 48). Light mode is the textbook example of the second clause.
- **Feasibility**: technically big. Today the site hardcodes colors throughout. `CSS/site.css:1-25` shows `background-color: #222222` and `color: #fafafa` directly on `html` and `body`. There are no `--bg`, `--fg`, `--accent` tokens (only `--mobile-nav-width`, `--desktop-nav-width`, and a couple of per-component accents). Introducing a token layer is a multi-day refactor that forces every component to pass through review.
- **Duplication risk**: low.
- **Notes**: the side benefit ("forces the codebase to clean up hardcoded colors") is real, but is not worth the brand drift risk. If the user explicitly wants a light mode later, add it then. Until then, drop.

### print-stylesheet-for-markdown-pages.md

- **Verdict**: keep.
- **Relevance**: low risk and matches "the work sits between an idea and a physical thing" practice (`project.md:62`). Printing a markdown page as a PDF leave-behind is exactly the kind of small polish the portfolio benefits from.
- **Feasibility**: small. Add a `@media print` block to the markdown article CSS. No JS changes. Grep confirms no print stylesheet exists today (only the one `prefers-reduced-motion` block at `CSS/site.css:2084`).
- **Duplication risk**: none.
- **Notes**: the `a[href^="http"]::after` URL-after-link trick is a good touch. Drop the canvas-embed-as-thumbnail bullet from v1, it adds complexity that nobody has asked for. Just print the markdown article cleanly.

### sidebar-collapse-and-focus-mode-chrome.md

- **Verdict**: revise.
- **Relevance**: partially aligned. The sidebar is core (`project.md:42`, "left sidebar navigation"). A rail / hidden mode does not abandon the sidebar metaphor, so this is on-direction. But the "tone down header to a thin strip, hide footer" focus mode change drifts from the portfolio look.
- **Feasibility**: the layout shell is currently driven by `CSS/site.css` with `--desktop-nav-width: 232px` and a binary mobile-open toggle. Three states is straightforward; the grid columns approach is correct.
- **Duplication risk**: overlaps with `mobile-sidebar-as-bottom-sheet.md` (this batch). Pick one. The collapse / rail / hidden model fits the existing site better than the bottom-sheet model.
- **Notes**: ship the three-state collapse without the focus-mode chrome rework. Header thinning is a brand change that needs explicit user sign-off, per `project.md:48`. The shortcut `Cmd+\` is fine.

## Recommended next picks

These are the ideas worth advancing to a feature spec, in order:

- **sidebar-fuzzy-filter.md**: smallest, lowest-risk, immediately useful given the filesystem-first navigation model. Good warm-up for the larger search work.
- **soft-keyboard-aware-editor.md**: closes a real mobile editing gap and is self-contained. Pairs with the in-flight markdown-node work in `holistic_tasks.md:71-82`.
- **full-text-search-across-md-and-canvas.md** plus **quick-open-palette-with-canvas-nodes.md**: spec these together because they share a build-time index. Quick-open is the cheaper UI surface; full-text is the higher-value capability.
- **reduced-motion-and-animation-budget.md**: small, low-risk, useful before any further animation work lands. Should land before `sidebar-collapse-and-focus-mode-chrome.md` if the latter is picked up.
- **print-stylesheet-for-markdown-pages.md**: tiny, isolated polish that improves the portfolio's leave-behind value. Drop the canvas-embed-print branch from v1.
