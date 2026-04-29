# Research Areas

Active and proposed research directions. Add a bullet here before opening a new artifact. Link the artifact once it exists. Move the link when the artifact archives to `completed_research/`.

## Canvas and Board Engines

- [101] tldraw SDK vs custom Braindump runtime, embed and ownership tradeoffs
- [104] Excalidraw embed for sketch-style canvases, integration shape and constraints
- [107] Infinite canvas viewport culling and quadtree spatial indexing
- [112] Vector vs raster stroke storage for portable .canvas files
- [118] Pointer and gesture architecture, pan vs draw vs select arbitration
- [125] Nested board-in-board rendering, lazy hydration and depth budgets
- [131] Undo and redo stack design across nested boards and shared entities
- [138] JSON Canvas extension strategy for non-Obsidian node types
- [144] Board snapshot diff format for GitHub PR review and recommendations
- [152] Layer, group, and z-order semantics across boards and embeds
- [167] Pen latency and stroke smoothing on touch and stylus devices
- [183] Camera transform precision and zoom range for deep nesting

## Markdown and Editor Frameworks

- [201] BlockNote vs ProseMirror vs Tiptap tradeoffs for Cosmoboard's markdown layer
- [202] Lossless block-doc to plain markdown round-trip strategies
- [203] Slash command and embed insertion UX patterns for boards and database views
- [204] Markdown schema extensions for embedded canvas and board references
- [205] Frontmatter conventions for page-database integration and Obsidian portability
- [206] Code-block plugin architecture for executable, fenced, and language-aware blocks
- [207] Math rendering options (KaTeX, MathJax, Typst) inside markdown and canvas text nodes
- [208] Transclusion model for cross-file embeds and partial section references
- [209] Wiki-link, backlink, and graph index conventions across markdown plus canvas
- [210] Editor virtualization and large-document performance for nested boards
- [211] Mobile and tablet markdown editing ergonomics for a canvas-first product
- [212] Realtime collaboration adapters for ProseMirror and BlockNote (Yjs binding tradeoffs)

## Local-First Storage and File Access

- [301] File System Access API browser support and gotchas, especially Safari and Firefox gaps
- [302] Origin Private File System for high-throughput board snapshots and op logs
- [303] OPFS vs FSA tradeoffs for Cosmoboard's file-as-truth wedge
- [304] SQLite WASM with OPFS-SAH backend for `.cosmoboard/index/` and base queries
- [305] IndexedDB schema design for Yjs op store and lazy history fetch
- [306] Asset bundling, content-addressed blob store, and relative path rewriting
- [307] File watching, mtime drift, and external editor conflict detection
- [308] Mobile filesystem limitations on iOS and Android browsers and PWAs
- [309] Encrypted-at-rest storage for ops, blobs, and `.cosmobundle.age` exports
- [310] Filesystem permission lifetime, persistence, and re-prompt UX
- [311] Streaming large files and chunked write performance for blob queue
- [312] `.cosmobundle` zip format and partial-fetch portable archive design

## Realtime and Sync

- [401] Yjs vs Automerge for nested boards plus markdown, runtime cost and ergonomics comparison
- [402] CRDT garbage collection on long lived boards, tombstone growth and snapshot strategy
- [403] Awareness and cursor presence design across multiple boards on one page
- [404] Offline merge semantics for canvas geometry vs markdown text in same session
- [405] Conflict free schema migrations for `.canvas` and entity shape changes over time
- [406] Server architecture options, dumb relay vs full backend vs serverless, for static-site fit
- [407] End to end encryption layered over a CRDT relay, key wrapping and op envelope cost
- [408] Liveblocks vs self hosted y-websocket vs y-sweet cost and lock-in model
- [409] Sync adapter boundary so boards, markdown, and bases can phase in separately
- [410] GitHub as long term storage layer behind a realtime session, commit on idle pattern
- [411] Multi tab single user sync via BroadcastChannel and IndexedDB before any network sync
- [412] Mobile and tablet sync UX, background tab freeze, battery, and intermittent connectivity

## File Formats and Portability

- [501] JSON Canvas spec gaps for Cosmoboard node types, audit which Cosmoboard concepts have no clean JSON Canvas mapping
- [502] Obsidian Canvas extension fields, document the unofficial fields Obsidian writes beyond the public spec
- [503] AFFiNE BlockSuite document format, evaluate the YDoc-backed snapshot/import format for interop
- [504] Anytype object model and local API export, map their object/relation/type schema to Cosmoboard entities
- [505] Notion API and export limits, catalog roundtrip lossiness for HTML, markdown, and CSV exports
- [506] Lossless versus lossy roundtrip taxonomy, define a fidelity model for each target format pairing
- [507] Asset reference resolution across formats, study relative paths, vault roots, and attachment folder conventions
- [508] Embedded media survival in single-file bundles, evaluate base64, zip, and sidecar approaches
- [509] Markdown frontmatter dialects and metadata fidelity, compare YAML, TOML, MDX, and Obsidian properties
- [510] Version pinning and schema migration strategy, plan how Cosmoboard files declare and migrate versions
- [511] tldraw .tldr and Excalidraw .excalidraw schema diffs, evaluate import paths from sketch tools
- [512] Figma and FigJam REST and plugin export pathways, scope what is realistically importable
- [513] Portable single-file bundle format design, compare zip, tar, and JSON-with-base64 packaging
- [514] Markdown wikilink and embed syntax compatibility, study `[[link]]`, `![[embed]]`, block refs, and CommonMark gaps

## Onboarding and UX

- [601] first-board onboarding flow that teaches spatial canvas without a tour overlay
- [602] empty-state design for a brand-new Cosmoboard workspace folder
- [603] command palette grouping and ranking for nested-board navigation
- [604] right-click contextual menu taxonomy across node, board, and markdown surfaces
- [605] mobile gesture conventions for pan, zoom, draw, and select on touch
- [606] power-user shortcut system and learnability ladder
- [607] error and conflict messaging tone for save, encryption, and GitHub flows
- [608] accessibility audit needs for dark teal theme and canvas interaction
- [609] preview-first to live-embed escalation affordance for embedded boards and apps
- [610] saved web app session resume UX inside markdown and canvas
- [611] cross-board breadcrumb and back-stack design for deep nesting
- [612] onboarding for the GitHub recommendation and PR collaboration bridge

## AI Agents in the Loop

- [701] MCP server contract for Cosmoboard board CRUD primitives
- [702] Agent identity, scope grant, and audit-record protocol design
- [703] Prompt-as-canvas-node primitive and execution semantics
- [704] Agent memory rooted in filesystem and markdown frontmatter
- [705] Batched subagent topology, 5x Sonnet plus 3x Opus orchestration
- [706] Cost vs latency tradeoff matrix across model tiers for board edits
- [707] Evaluation harness for agent-authored canvas and markdown changes
- [708] Safety review and diff-gating patterns for agent-authored canvas writes
- [709] Embedded vs sidecar vs MCP-only agent deployment shapes
- [710] Local model fallback and routing for sensitive scopes
- [711] Multi-agent coordination through workspace artifacts as message bus
- [712] Continuous agent budgets, kill-switch, and drift detection

## Other

- [801] Performance budget definition and enforcement for mixed canvas + markdown + embed boards
- [802] Telemetry boundaries and opt-in analytics for a local-first product with a privacy promise
- [803] Accessibility commitments for spatial canvas plus markdown plus embed surfaces
- [804] Plugin and addon SDK shape that protects the AGPL engine boundary
- [805] Security threat model for local-first plus GitHub bridge plus optional encryption
- [806] Tauri vs Electron vs PWA-only packaging path for the desktop and offline story
- [807] Testing strategy across canvas, markdown, sync, and import-export surfaces
- [808] Documentation site generation that lives next to the static portfolio without bloat
- [809] Monetization models for a portfolio site that doubles as a product entry point
- [810] Legal posture around user content, attribution, and copyright on uploaded files
- [811] Internationalization and right-to-left readiness across canvas labels and markdown bodies
- [812] Crash recovery, autosave cadence, and corruption handling for browser-based local stores

## Detailed Notes

Longer notes per idea, keyed by the same ID used in the bullet lists above. Each idea's note lives under the subsection that matches its bullet's heading.

### Canvas and Board Engines

#### [101] tldraw SDK vs custom Braindump runtime, embed and ownership tradeoffs

Compare the existing Braindump custom runtime against adopting tldraw SDK as either a full replacement or a parallel renderer for advanced cases. Key questions are bundle size impact on the static site, whether tldraw's record store can read and write our `.canvas` JSON without a translation layer that loses fidelity, license terms for product use, and whether tldraw's editor component pattern can host our entity, markdown-ref, and bookmark nodes as custom shapes. Sources include https://tldraw.dev/faq, the tldraw shape util docs, and a side-by-side runtime perf trace using `scripts/performance-audit.mjs`. The verdict needs to clearly answer whether to stay custom, embed tldraw selectively, or migrate.

#### [104] Excalidraw embed for sketch-style canvases, integration shape and constraints

Investigate whether Excalidraw can be embedded as a focused sketch surface inside Cosmoboard for diagram-style nodes, while keeping the parent board as the spatial host. Open questions include how Excalidraw scenes serialize next to JSON Canvas, whether scenes survive round trips through Obsidian, how the Excalidraw library handles being mounted inside a transformed board viewport, and whether an embed-only mode can avoid pulling the full editor chrome. Sources include https://docs.excalidraw.com/, the `@excalidraw/excalidraw` npm package, and the Obsidian Excalidraw plugin's `.excalidraw.md` hybrid format. The output should recommend an embed shape, full editor route or read-only preview node, and a save format.

#### [107] Infinite canvas viewport culling and quadtree spatial indexing

Research efficient viewport culling strategies for boards with hundreds to thousands of nodes plus stroke geometry, since the current Braindump runtime renders many nodes that are off-screen during pan and zoom. Open questions include whether a quadtree, an R-tree, or a simpler tile-based bin index fits our update patterns best, how to keep the index correct under live drag, and how to integrate with `requestAnimationFrame` batching. References include the rbush JavaScript library, Figma's quadtree write-up, the tldraw `Geometry2d` and culling code, and our own `tests/board/board-shift-snap-runtime.test.mjs` for baseline timing. Output should recommend a concrete data structure and a measured threshold where it starts to pay off.

#### [112] Vector vs raster stroke storage for portable .canvas files

Decide how freehand strokes should be stored inside `.canvas` files so they remain portable to Obsidian Canvas, AFFiNE, and Anytype while keeping reasonable file size. Key questions are whether to store raw input points plus a smoothing recipe, store baked SVG path data, store a compressed point list with pressure, or fall back to PNG raster for very long strokes. References include the perfect-freehand library, the SVG path spec, JSON Canvas at https://jsoncanvas.org/, and Obsidian's drawing plugin output. The result should specify the canonical stroke node shape and a fallback strategy when an importer does not understand it.

#### [118] Pointer and gesture architecture, pan vs draw vs select arbitration

Research a unified pointer event pipeline that arbitrates pan, draw, select, lasso, pinch zoom, and right-click context across mouse, trackpad, touch, and pen, since the current code mixes mode flags and ad hoc handlers. Questions include whether to use Pointer Events with explicit gesture state machines, how to support Apple Pencil hover and pressure, how to detect palm rejection on touch, and how shift-and-drag snap interacts with selection. References include the Pointer Events Level 3 spec, Excalidraw's `pointer.ts`, tldraw's `StateNode` machine, and our existing `tests/board/board-shift-snap-stroke-e2e.test.mjs`. Output should propose a single state-machine model and identify which current handlers it replaces.

#### [125] Nested board-in-board rendering, lazy hydration and depth budgets

Investigate how to render a board that embeds other boards inside its nodes without spawning a runaway render tree, given the confirmed direction of multiple boards per page including deep nesting. Open questions include depth-1 live versus depth-2-plus thumbnail snapshots, how minimaps are generated and cached, whether each nested board gets its own viewport transform or inherits the parent, and how interaction focus moves between levels. References include AFFiNE edgeless mode at https://docs.affine.pro/, the existing `data-board-index` paste preview path noted in `holistic_architecture.md`, and the `cosmoboard_portability.md` doc. Output should specify a depth budget, snapshot cache strategy, and an interaction-focus model.

#### [131] Undo and redo stack design across nested boards and shared entities

Research how undo and redo should behave when edits cross nested boards, embedded markdown, and shared entities, since a global stack can rewind unrelated boards while a per-board stack loses cross-context edits. Questions include whether to use scoped undo groups keyed by edit origin, whether shared-entity edits create coordinated multi-board undo records, and how this maps to a future Yjs or Automerge layer. References include the Yjs UndoManager docs at https://docs.yjs.dev/, ProseMirror's transform history, and tldraw's history manager. Output should pick scope rules and define the record shape so it can be persisted to file.

#### [138] JSON Canvas extension strategy for non-Obsidian node types

Decide how to extend JSON Canvas with Cosmoboard-specific node types like entity, markdown-ref, bookmark, app embed, and live web embed without breaking Obsidian compatibility. Questions include whether to use a namespaced `cosmoboard:` prefix on `type`, whether to attach all custom data inside an `extensions` field, how Obsidian behaves when it encounters unknown types, and what the round-trip rules should be when an Obsidian user opens and resaves a file. References include the JSON Canvas spec at https://jsoncanvas.org/, the Obsidian Canvas TypeScript types in `obsidian-api/canvas.d.ts`, and AFFiNE's edgeless JSON shape. Output should write a small extension contract that can be linked from the architecture doc.

#### [144] Board snapshot diff format for GitHub PR review and recommendations

Research how to generate a reviewable diff between two `.canvas` snapshots so GitHub PRs and the recommendation flow show meaningful change summaries instead of huge raw JSON noise. Questions include whether to diff at the node level with stable IDs, render a side-by-side image diff for spatial changes, embed a Mermaid or HTML summary in the PR body, and how to handle Base64 image churn cleanly given the dual export strategy. References include the existing `cosmoboard_portability.md` and `online_save_backend_plan.md`, GitHub PR check runs API, and tldraw's snapshot format. Output should propose a diff schema and a render-to-markdown adapter for PR comments.

#### [152] Layer, group, and z-order semantics across boards and embeds

Research how layer, group, and z-order should be modeled across boards, embeds, and shared entities, since current Braindump has bring-to-front and send-back but no explicit groups or named layers. Questions include whether to keep a flat ordered array per board, add explicit groups with their own transforms, support named layers like Figma frames, and how groups interact with selection and undo. References include the Figma layers and frames model, the Excalidraw groups implementation, and our `extension_seams.md` catalog. Output should pick a model that scales to nesting without breaking JSON Canvas portability.

#### [167] Pen latency and stroke smoothing on touch and stylus devices

Research how to minimize visible pen latency and produce smooth strokes on Apple Pencil, Wacom, and finger touch input, since the canvas is meant to be a daily drawing surface on tablet too. Open questions include whether to use Pointer Events coalescedEvents and predictedEvents, whether to render strokes on an OffscreenCanvas while committing to SVG only on stroke end, and how perfect-freehand smoothing parameters interact with our existing stroke storage choice. References include the Pointer Events Level 3 spec, the Apple Pencil hover behavior docs, the perfect-freehand README, and Chrome's predicted-events explainer. Output should produce a measured latency target and a recommended pipeline.

#### [183] Camera transform precision and zoom range for deep nesting

Research camera transform precision, since nested boards with deep zoom can hit 32-bit float jitter and CSS transform precision limits. Questions include whether to maintain camera state in 64-bit JS numbers and only project to CSS transform near render time, what minimum and maximum zoom levels should be exposed, how to relocate the world origin when the user pans far, and how nested-board camera state composes with parent camera state. References include the Figma engineering blog post on infinite canvas precision, the tldraw camera and zoom code, and the Web CSS Transforms spec. Output should pick numeric representations, zoom limits, and an origin-rebasing strategy.

### Markdown and Editor Frameworks

#### [201] BlockNote vs ProseMirror vs Tiptap tradeoffs for Cosmoboard's markdown layer

Compare the three editor stacks against Cosmoboard's needs: portable markdown as the durable source, embedded canvas references, local-first persistence, and graceful Obsidian round-tripping. Key open questions are which stack imposes the least lock-in on document shape, which has the cleanest extension API for custom node types like `board-ref` and `markdown-ref`, and which keeps bundle size compatible with the lightweight static-site direction in `project.md`. References include the BlockNote docs, the ProseMirror guide, and Tiptap's extension catalog, plus existing community write-ups on serializing BlockNote to GFM. The output should be a comparison matrix covering schema flexibility, markdown fidelity, mobile behavior, and realtime story.

#### [202] Lossless block-doc to plain markdown round-trip strategies

Block-based editors typically lose information when serializing to and from plain markdown, which conflicts with Cosmoboard's "markdown stays the durable source of truth" stance. Research how BlockNote, Tiptap, Outline, and AFFiNE solve round-trip fidelity, what extensions GFM and CommonMark support, and where directives or HTML fallbacks become necessary. Open questions include whether Cosmoboard should target CommonMark plus GFM plus Obsidian extensions, whether to rely on `remark-directive` for custom blocks, and how to keep diffs small for GitHub workflow. Sources include CommonMark spec, GFM spec, the `remark` ecosystem, and Obsidian's published markdown extensions list.

#### [203] Slash command and embed insertion UX patterns for boards and database views

Cosmoboard needs a way to insert canvases, board references, database views, and file embeds inline, comparable to Notion and AFFiNE slash menus but markdown-portable. Investigate slash menu architectures in BlockNote, Notion, AFFiNE, and Tiptap, including grouping, filtering, fuzzy search, and provider extensibility for custom embed types. Open questions are how the menu surfaces preview-first vs live embed choices, how it handles board nesting depth limits, and whether keyboard-only flow is consistent with the existing canvas toolbar patterns described in `extension_seams.md`. Candidate references include BlockNote's slash menu API, Notion's product docs, and AFFiNE's blocksuite editor source.

#### [204] Markdown schema extensions for embedded canvas and board references

Define a stable markdown extension that survives Obsidian round-trips while encoding `board-ref`, `canvas-ref`, and possibly `db-view-ref` nodes. Compare candidate approaches, namely Obsidian-style `![[wikilinks]]` with parameters, `remark-directive` syntax (`::board[id]{...}`), HTML comments with JSON, and standard fenced blocks with a language token. Open questions include how to keep references portable when files move, how to embed render-mode hints (preview vs live), and how to express deep nesting without breaking Obsidian's parser. References include Obsidian embeds docs, JSON Canvas schema, `remark-directive`, and AFFiNE's link block model.

#### [205] Frontmatter conventions for page-database integration and Obsidian portability

The page database plan in `page_database_plan.md` already proposes a JSON item registry, but markdown files need a parallel YAML or TOML frontmatter convention that drives both the site build and Obsidian Bases queries. Research what fields Obsidian Bases reads, how Notion-to-Obsidian importers shape frontmatter, and which schemas (Schema.org, Dataview YAML conventions) are stable enough to standardize on. Open questions include whether to use YAML or TOML, whether to mirror or replace the JSON registry, and how to handle Notion-backed items that have no local markdown body. Sources include Obsidian Bases docs, the Dataview plugin spec, and the existing `src/site-data.mjs` structure.

#### [206] Code-block plugin architecture for executable, fenced, and language-aware blocks

Cosmoboard will likely want code blocks that are syntax-highlighted, optionally executable for things like Mermaid and small JS, and round-trippable as fenced markdown. Investigate how Markdown-it, MDX, AFFiNE, and Notion handle pluggable code-block renderers, how Mermaid and other diagram-as-code blocks integrate, and what the security boundary looks like for execution. Open questions include whether to use `remark` plugins, server-side prerender plus client hydrate, or full client-side renderers, and how to keep the static-site build cheap. References include Mermaid live editor, Shiki, Prism, MDX, and AFFiNE's code block.

#### [207] Math rendering options (KaTeX, MathJax, Typst) inside markdown and canvas text nodes

Math notation matters for technical notes, and the renderer must work in both markdown body text and inside canvas-anchored text nodes without bloating the bundle. Compare KaTeX, MathJax v3, Temml, and emerging Typst-in-browser options for performance, accessibility, font handling, and offline behavior. Open questions are which delimiters to support (`$...$`, `$$...$$`, fenced `math`), how to keep math parseable by Obsidian and Pandoc, and whether to lazy-load the renderer per page. References include KaTeX docs, MathJax v3 docs, Temml, the Obsidian math support page, and Pandoc's math output options.

#### [208] Transclusion model for cross-file embeds and partial section references

Cosmoboard's "boards in markdown, markdown in boards" promise needs a transclusion design that handles whole files, headings, blocks, and ranges, while staying portable. Research Obsidian's `![[file#heading]]` and `^block-id` syntax, AFFiNE's link cards, Logseq's block embeds, and Roam-style block references, then map each to a markdown-stable encoding. Open questions include cycle detection across nested boards, how to render previews vs live embeds at scale, and how to keep stable identifiers across renames. Candidate references include Obsidian embeds docs, Logseq's block reference docs, and the existing `markdown-ref` direction in `holistic_planning.md`.

#### [209] Wiki-link, backlink, and graph index conventions across markdown plus canvas

For Cosmoboard to feel like a knowledge tool, links must work uniformly across markdown files, canvas nodes, and database items, with computed backlinks. Research how Obsidian, Foam, Logseq, and AFFiNE index links, where they store the index (filesystem, SQLite, in-memory), and how they reconcile renames. Open questions include whether to build the index at static-build time, in the browser at load, or via a SQLite WASM store as flagged in `holistic_research.md`, and whether canvas nodes need their own stable IDs that participate in the link graph. References include Obsidian's link resolution docs, Foam's graph indexer, and Dataview's source.

#### [210] Editor virtualization and large-document performance for nested boards

Pages with deep nested boards plus long markdown bodies risk the "performance collapse" risk listed in `holistic_planning.md`. Research virtualization strategies in ProseMirror (decoration-based windowing), BlockNote, AFFiNE's blocksuite, and Lexical, and benchmark how each handles 5k-block documents on tablet hardware. Open questions are how virtualization interacts with embedded canvases that have their own scroll surfaces, how to keep find-in-page working, and how preview-first embeds change the cost model. Candidate references include the ProseMirror performance guide, Lexical docs, and BlockSuite's virtualization commits.

#### [211] Mobile and tablet markdown editing ergonomics for a canvas-first product

`project.md` keeps desktop, tablet, and mobile in scope at every phase, yet most block editors handle mobile poorly with touch selection, slash menus, and keyboard avoidance. Investigate how iA Writer, Obsidian Mobile, AFFiNE Mobile, Bear, and BlockNote handle on-screen keyboards, contextual toolbars, drag handles, and selection. Open questions are whether to build a custom mobile toolbar over the chosen editor, how to integrate with the existing canvas pan/zoom on touch, and how slash menus behave when the keyboard occupies half the screen. References include Obsidian Mobile release notes, BlockNote mobile demo, and Apple's text input guidelines.

#### [212] Realtime collaboration adapters for ProseMirror and BlockNote (Yjs binding tradeoffs)

Although realtime collaboration is a later phase, the editor choice today commits Cosmoboard to a particular CRDT path. Compare `y-prosemirror`, BlockNote's built-in Yjs collaboration, Tiptap's collaboration extension, and Lexical's collaboration plugin for fidelity, awareness support, undo behavior, and offline merge quality. Open questions include whether one Yjs document covers a markdown page plus its embedded boards, how to bridge with the canvas runtime's own state, and how to keep CRDT op envelopes encryptable per the security plan. References include Yjs docs, the `y-prosemirror` repo, BlockNote's collaboration guide, and Liveblocks' editor integrations.

### Local-First Storage and File Access

#### [301] File System Access API browser support and gotchas, especially Safari and Firefox gaps

Cosmoboard wants the user's actual folder as the primary hierarchy, so FSA is the load-bearing capability on desktop Chromium. Research should map exact support: `showDirectoryPicker`, `FileSystemHandle` persistence across reloads, IndexedDB-stored handles, permission re-prompt thresholds, and what Firefox and Safari actually expose today versus the OPFS-only path. Open questions: how to detect partial support cleanly, what fallback flow looks like on Firefox (download/upload only?), and whether handles survive browser updates. Sources: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access, https://wicg.github.io/file-system-access/, https://caniuse.com/native-filesystem-api, MDN compatibility table.

#### [302] Origin Private File System for high-throughput board snapshots and op logs

OPFS is broadly supported (Chromium, Safari 16.4+, Firefox 111+) and has a sync access handle with much higher write throughput than IndexedDB. For Cosmoboard's Yjs op log and rolling L2 snapshots, OPFS could be the default storage even before the user grants real-folder access. Research should benchmark write throughput for typical op envelope sizes, measure cold-start read of a 50MB op log, and check eviction behavior under storage pressure. References: https://web.dev/articles/origin-private-file-system, https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system, WebKit and Firefox release notes for OPFS.

#### [303] OPFS vs FSA tradeoffs for Cosmoboard's file-as-truth wedge

The two APIs solve different problems. FSA gives the user portability (their folder, their files, openable in Obsidian), while OPFS gives speed and reliability without prompts. Research should articulate when Cosmoboard reads/writes through FSA versus OPFS, how to mirror or sync between the two, and how the L3 op log relates to L2 file projections per `version_control_and_backups.md`'s "files at rest, ops in motion" rule. Open question: do we always project to FSA on save, or only on user-initiated checkpoint? Reference: https://web.dev/articles/file-system-access plus comparison posts on web.dev.

#### [304] SQLite WASM with OPFS-SAH backend for `.cosmoboard/index/` and base queries

Bases need fast filter, sort, group across thousands of rows; pure JS scans of frontmatter will not scale. SQLite WASM with the OPFS Sync Access Handle VFS is the most credible candidate for the derived index. Research should benchmark query latency on 10k row tables, measure WASM cold-start cost on mobile Safari, evaluate `wa-sqlite` versus the official `sqlite-wasm` build, and confirm safe concurrency with the main thread. References: https://www.sqlite.org/wasm/doc/trunk/persistence.md, https://github.com/rhashimoto/wa-sqlite, https://sqlite.org/wasm/doc/trunk/api-oo1.md.

#### [305] IndexedDB schema design for Yjs op store and lazy history fetch

Even with OPFS, IndexedDB remains the fallback and the place `y-indexeddb` writes by default. The lazy-history-fetch decision means new devices need a snapshot-first, ops-on-demand layout. Research should compare `y-indexeddb` defaults against a custom schema that splits ops into time-bucketed object stores plus a snapshot store, measure cursor pagination cost, and check storage quota interactions. Open questions: how to evict old ops without breaking time-scrubber, and whether to store binary Yjs updates as `Uint8Array` rows or chunked blobs. References: https://github.com/yjs/y-indexeddb, https://docs.yjs.dev/api/document-updates, MDN IndexedDB best-practices.

#### [306] Asset bundling, content-addressed blob store, and relative path rewriting

`version_control_and_backups.md` locks Option 1 hash-addressed blobs now with a queue abstraction. Boards reference images and PDFs; markdown references images; both need to keep working when the workspace is exported, copied, or opened in Obsidian. Research should define the on-disk layout (e.g. `.cosmoboard/blobs/sha256/ab/cd...`), how `.canvas` and `.md` rewrite paths between portable form and content-addressed form, and how dedupe interacts with user-renamed assets. References: existing Cosmoboard `content/boards/` layout, Git LFS hash-folder pattern, Obsidian attachment folder behavior, IPFS CID conventions.

#### [307] File watching, mtime drift, and external editor conflict detection

Hard question B in `database_brainstorming.md` is open: what happens when Obsidian or VS Code edits a file while Cosmoboard has it open. FSA does not yet expose true file-system-watch, only polled re-reads on focus. Research should compare polling strategies (mtime check on focus, explicit refresh button, periodic background poll), measure wake-up cost on mobile, and prototype CRDT integration of external edits as a fresh op stream. References: https://github.com/whatwg/fs/issues/72 (FSA observer proposal), Obsidian's external-modification handling docs, VS Code file watcher behavior.

#### [308] Mobile filesystem limitations on iOS and Android browsers and PWAs

Cosmoboard targets desktop, tablet, and mobile equally. iOS Safari has no FSA `showDirectoryPicker`, only OPFS plus Files app integration through `<input type="file" webkitdirectory>` and Web Share. Android Chrome has FSA but PWA install affects handle persistence. Research should map exactly what works on iPad Safari, iPhone Safari, Android Chrome, Samsung Internet, and installed PWAs, including write-back to user-visible folders via the Files app or SAF intents. References: WebKit FSA tracking bug, https://developer.apple.com/documentation/safari-release-notes, Android Storage Access Framework, PWA capability matrices on web.dev.

#### [309] Encrypted-at-rest storage for ops, blobs, and `.cosmobundle.age` exports

`security_and_access.md` calls for envelope-encrypted ops and per-blob encryption later. Research should evaluate WebCrypto `AES-GCM` and `XChaCha20-Poly1305` libraries (e.g. libsodium.js, age-encryption.js) for streaming encryption of large blobs, measure overhead on mobile, and check key-storage options (IndexedDB-wrapped keys, WebAuthn-derived keys, passkey-bound keys). Open question: can OPFS sync access handles encrypt in-place chunked, or must we encrypt on the way out only. References: https://github.com/FiloSottile/age, https://doc.libsodium.org/, https://www.w3.org/TR/webcrypto/.

#### [310] Filesystem permission lifetime, persistence, and re-prompt UX

FSA permissions in Chromium are session-scoped by default but can be persisted via the "Persistent Permissions" path on installed PWAs. Research should define the prompt UX for first folder grant, re-prompt cadence, and how to surface "we lost access, click to re-grant" without spooking users. Should also cover `queryPermission`/`requestPermission` semantics and how revoking site data wipes handles. References: https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api, https://wicg.github.io/file-system-access/#permissions, Chromium issue tracker for permission scope.

#### [311] Streaming large files and chunked write performance for blob queue

Users will drop in 50MB+ PDFs, photo dumps, and video. Research should compare `FileSystemWritableFileStream` chunked writes against OPFS sync handles and IndexedDB blob storage for a 200MB file, including memory peak, time to first byte readable, and resumability after crash. Should also cover `Blob` + `Response` streaming for hash-while-write to avoid double-pass for content addressing. References: https://web.dev/articles/file-system-access#write_to_a_file, Streams API spec, `crypto.subtle.digest` streaming patterns.

#### [312] `.cosmobundle` zip format and partial-fetch portable archive design

L4 backups and exports use a single-file `.cosmobundle` (zip with manifest, ops dump, blob set). Research should evaluate zip libraries that support partial fetch (e.g. range-request reading of a remote zip) so a website can lazy-load blobs from a published bundle, compare `fflate`, `zip.js`, and a custom store-mode zip writer, and confirm browser-side decompression performance for typical workspace sizes. Open question: do we want a custom binary format or stay with zip for tooling familiarity. References: https://github.com/101arrowz/fflate, https://gildas-lormeau.github.io/zip.js/, HTTP Range RFC 7233, Frictionless Data Package as a layout precedent.

### Realtime and Sync

#### [401] Yjs vs Automerge for nested boards plus markdown

Cosmoboard needs one sync model that handles deeply nested boards plus markdown text within the same document graph. Research should compare Yjs (Y.Doc, Y.Array, Y.Map, Y.Text, sub-documents) against Automerge 2.x (Automerge.Repo, rich text, columnar encoding) on memory per nested doc, op size, load time on a cold board, and ergonomics of binding to existing Braindump runtime. Key open question is whether sub-documents in Yjs map cleanly to one board per nested node, or whether Automerge's repo-of-documents model is a better fit for filesystem-primary hierarchy. References: https://docs.yjs.dev/, https://automerge.org/docs/hello/, jlongster Automerge writeups, Kevin Jahns Yjs benchmarks.

#### [402] CRDT garbage collection on long lived boards

A Cosmoboard that lives for years will accumulate tombstones from deleted strokes, nodes, and markdown edits. Research should measure tombstone growth on realistic editing patterns, compare Yjs gc options and Y.Doc snapshotting against Automerge's history compaction, and document when a board needs to be rebased into a fresh doc with frozen history elsewhere. Key open questions: can we keep full undo history while still compacting, and what is the size cliff where load time on mobile becomes unacceptable. References: Yjs gc flag docs, Automerge history compaction discussions, ink and switch Peritext paper for rich text cost notes.

#### [403] Awareness and cursor presence design across multiple boards on one page

Multiple boards per page is a confirmed direction, so awareness is not one cursor stream but N. Research should design a presence channel scheme that keeps per-board cursor, selection, and viewport state cheap when several boards render in one tab, compare Yjs awareness protocol against Liveblocks rooms and Automerge ephemeral messages, and quantify wire cost at typical activity. Open questions: do nested board embeds get their own room, or share a parent room with namespaced topics, and how does focus loss collapse presence to keep idle cost near zero. References: Yjs awareness protocol docs, Liveblocks presence docs, Figma multiplayer engineering blog.

#### [404] Offline merge semantics for canvas geometry vs markdown text in same session

A user editing offline can move nodes, redraw strokes, and rewrite markdown inside the same board, then reconnect. Research should define expected merge semantics for each shape, position, stroke point list, markdown paragraph, list ordering, and embed parameters, and check which Yjs or Automerge primitives match each one without surprising users. Open questions include whether stroke segments should be append-only logs to avoid merge artifacts, and whether markdown should ride a Y.Text style CRDT or a structural one like Peritext. References: Peritext paper at inkandswitch.com, Yjs Y.XmlFragment docs, Tiptap CRDT integration notes.

#### [405] Conflict free schema migrations for `.canvas` and entity shape changes

Cosmoboard's portability commitment means `.canvas` and entity shapes will change shape over time, but a CRDT carries history that does not migrate cleanly. Research should catalog migration strategies, lazy upgrade on read, dual-write versions, snapshot then re-import, and check how Automerge schema and Yjs typed wrappers handle adding, renaming, or removing fields without breaking older replicas. Open question: can JSON Canvas evolve while peers run mixed versions, or do we force a quiesce point for migrations. References: Automerge schema discussions, Cambria lenses paper from ink and switch, JSON Canvas spec at jsoncanvas.org.

#### [406] Server architecture options, dumb relay vs full backend vs serverless

Static-site-first is a non-negotiable, so the realtime server has to stay optional and small. Research should compare a dumb websocket relay (y-websocket, y-sweet, partykit), a full backend with auth and persistence (Hocuspocus, Liveblocks), and serverless edge approaches (Cloudflare Durable Objects, Supabase realtime) on cost, ops burden, and how cleanly they layer behind a local-first default. Key open question is whether we ship two profiles, fully offline with no relay, and a thin relay for shared sessions, with the same client code path. References: y-sweet by Drifting in Space, partykit.io, Hocuspocus docs, Cloudflare Durable Objects guide.

#### [407] End to end encryption layered over a CRDT relay

Phase E in `security_and_access.md` already names this as the hardest combination, encryption plus realtime plus untrusted relay. Research should quantify the cost of encrypting Yjs update messages and Automerge change blobs op by op, evaluate group key rotation when collaborators are added or removed, and check whether existing libraries (matrix-crdt, y-protocols extensions, MLS based group keys) cover the pattern. Open questions: do we accept that the relay sees op size and timing metadata, and how does a new joiner catch up without leaking the full plaintext history. References: matrix-crdt repo, MLS RFC 9420, ink and switch Keyhive notes, age-encryption.org for envelope format.

#### [408] Liveblocks vs self hosted y-websocket vs y-sweet cost model

If we take a hosted route, pricing and lock-in shape what we can promise users for free local use. Research should map Liveblocks per-MAU pricing against y-sweet self-hosted and partykit usage based pricing, project monthly cost at 100, 1k, and 10k active boards, and check exit paths (export Yjs updates, swap relay) so the product never gets cornered. Open question: does any hosted vendor allow shipping a free local mode without forcing accounts upstream. References: liveblocks.io/pricing, y-sweet pricing docs, partykit.io pricing, Hocuspocus self-host guide.

#### [409] Sync adapter boundary so boards, markdown, and bases can phase in separately

Open question 5 in `holistic_research.md` asks whether boards, markdown, and structured data share one sync model. Research should design an adapter interface that lets each entity type pick its own sync engine (Yjs for board, Y.Text or Tiptap CRDT for markdown, SQLite-based change feed for bases) while presenting one document tree to the UI. Key open questions are how cross-entity links survive a partial sync, and how undo crosses the adapter boundary without losing intent. References: Tiptap collaboration docs, electricsql.com for SQL-side change feeds, Automerge.Repo for multi-doc patterns.

#### [410] GitHub as long term storage layer behind a realtime session

GitHub stays the main collaboration bridge for now, so realtime should not break the file-and-PR story. Research should design a commit-on-idle pattern where a CRDT session writes a periodic flat `.canvas` and `.md` snapshot to a working branch, with op-log preserved separately for replay, and compare this against pure CRDT-as-storage approaches. Open questions: who owns the snapshot cadence (client, relay, action), and how does a maintainer review changes when the realtime history is opaque. References: GitHub Actions docs, Anytype-on-Git experiments, Pijul for a CRDT-friendly version control viewpoint.

#### [411] Multi tab single user sync via BroadcastChannel and IndexedDB

Realtime collaboration is a later phase, but a single user with two tabs of the same board needs sync today. Research should evaluate y-indexeddb plus BroadcastChannel for instant cross-tab updates, compare against a Service Worker mediated approach, and measure write amplification on IndexedDB for a heavy drawing session. Open question: does the same code path scale up to network sync later, so single-user multi-tab is a free demo of the future realtime mode. References: y-indexeddb readme, BroadcastChannel API on MDN, Automerge IndexedDB adapter.

#### [412] Mobile and tablet sync UX, background tab freeze, battery, and intermittent

Mobile and tablet stay in scope at every phase, and realtime sync on these devices fails in different ways than desktop. Research should test what happens to a Yjs or Automerge session when the tab goes background, the radio sleeps, or the network flips Wi-Fi to cellular, and document reconnect, resume, and battery cost patterns. Open question: do we need an explicit pause-and-resume protocol on top of the CRDT for long offline gaps, and how do we avoid silent split brain when the user thinks they are connected. References: Page Visibility API on MDN, Service Worker background sync notes, Replicache offline writeups for prior art.

### File Formats and Portability

#### [501] JSON Canvas spec gaps for Cosmoboard node types

The JSON Canvas spec at jsoncanvas.org defines only `text`, `file`, `link`, and `group` nodes plus simple edges, while Cosmoboard plans `drawing`, `bookmark`, `page`, `entity-ref`, `markdown-ref`, video, and interactive button nodes. This research should enumerate every Cosmoboard node and edge concept, mark which can map cleanly, which need a fallback, and which require custom extension fields the engine should preserve. Key open questions: where does extension data live without breaking Obsidian, should Cosmoboard publish a versioned superset, and how should consumers detect unknown extensions. Sources: jsoncanvas.org, the JSON Canvas GitHub repo, Obsidian Canvas help docs, and the existing portability table in cosmoboard_portability.md.

#### [502] Obsidian Canvas extension fields

Obsidian writes fields not formally part of the JSON Canvas spec, for example custom colors, group hidden state, edge label styling, and embedded markdown fragments. Cosmoboard needs a documented list of these de facto fields so import preserves them and export does not silently drop them. Open questions: which fields are stable across Obsidian versions, which fields appear only in newer canvas versions, and how does the desktop versus mobile Obsidian client diverge. Sources: Obsidian forum threads, the obsidian-help repository, sample `.canvas` files exported from real vaults, and the Obsidian Canvas plugin source where available.

#### [503] AFFiNE BlockSuite document format

AFFiNE stores edgeless and page documents using BlockSuite, which is a YDoc-backed block tree with binary snapshots and a JSON snapshot exporter. Cosmoboard interop with AFFiNE requires understanding the snapshot schema, how attachments are referenced, and how the dual page/edgeless model maps to markdown plus canvas. Open questions: is there a stable JSON snapshot format suitable for non-Yjs consumers, how are nested frames and connectors encoded, and what does the workspace export bundle contain. Sources: docs.affine.pro, the toeverything/blocksuite GitHub repo, and AFFiNE workspace export samples.

#### [504] Anytype object model and local API export

Anytype models content as typed objects with relations rather than files, and exposes a local gRPC API plus a recently announced public API. Cosmoboard should know whether Anytype object exports can be ingested as markdown plus structured metadata, and whether linked entities in Cosmoboard can mirror Anytype's relation graph. Open questions: what does the Any-Sync export produce on disk, how are media and embeds preserved, and is there a documented JSON format usable without running the Anytype daemon. Sources: doc.anytype.io, the anyproto GitHub organization, and the Anytype community forum's export discussions.

#### [505] Notion API and export limits

Notion's official export produces HTML, markdown plus CSV, or PDF, each with different fidelity for databases, toggles, synced blocks, and embeds. Cosmoboard needs a clear table of what survives each export path and which API endpoints are needed for higher-fidelity import. Open questions: how do database relations and rollups serialize, how are page covers and icons preserved, and what is the practical rate limit for a self-serve importer. Sources: developers.notion.com API reference, Notion's help center export article, and existing community importers like notion-to-md and obsidian-importer.

#### [506] Lossless versus lossy roundtrip taxonomy

Cosmoboard targets many formats and needs a precise definition of fidelity per pairing rather than a single "compatible" label. This research should produce a matrix that scores each format pairing on structure preservation, metadata preservation, asset preservation, and reversibility, then defines tiers like exact roundtrip, recoverable roundtrip with sidecar, lossy roundtrip with warning, and one-way export. Key questions: where should lost-fidelity warnings surface in the UI, and should sidecar files carry the recovered metadata. References: Pandoc's fidelity discussions, the Obsidian importer plugin notes, and the cosmoboard_portability.md compatibility tables.

#### [507] Asset reference resolution across formats

Each ecosystem resolves asset paths differently, with Obsidian using vault-relative or attachment-folder paths, Notion using signed S3 URLs that expire, AFFiNE using internal blob ids, and JSON Canvas using simple relative file references. Cosmoboard needs a consistent rewrite strategy when importing or exporting, and a way to keep originals intact when paths cannot be preserved. Open questions: how should Cosmoboard handle expiring URLs from Notion exports, should it auto-download and rewrite, and how does it pick a stable vault root for Obsidian exports. Sources: Obsidian help on attachments, Notion export article, and existing cross-format converters.

#### [508] Embedded media survival in single-file bundles

The portability plan calls for a single-file `.cosmoboard.json` or similar bundle that travels with media. This research should compare base64-inlined JSON, zip-based containers like `.cosmoboard.zip`, and tar-based containers, against criteria of size, browser write support, deduplication, partial reads, and ease of inspection. Open questions: should the bundle be opaque or include a manifest, what is the size cap before browser memory becomes a concern, and can a static site reliably read either format. References: the EPUB and Anytype `.any-block` packaging models, the Excalidraw `.excalidrawlib` format, and the JSZip and fflate libraries.

#### [509] Markdown frontmatter dialects and metadata fidelity

Markdown metadata is fragmented across YAML frontmatter, Obsidian properties (a YAML subset with typed UI), MDX exports with JS-style imports, and TOML frontmatter used by some static site generators. Cosmoboard needs to pick a canonical dialect and define how it converts on import and export so that node ids, board references, and entity links survive. Key questions: should Cosmoboard write Obsidian-typed properties or plain YAML, how does it preserve unknown frontmatter keys, and how does it handle list-typed properties. Sources: Obsidian properties documentation, the CommonMark and GFM specs, and the gray-matter parser.

#### [510] Version pinning and schema migration strategy

Cosmoboard files will evolve, and consumers including future Obsidian importers need a clear way to know which schema version a file targets. Research should compare strategies including a top-level `cosmoboardVersion` field, semver-style tagging, content-addressed schema hashes, and the JSON Canvas spec's currently-implicit versioning. Open questions: how should older clients fail or degrade gracefully, when is a breaking change acceptable, and how does migration work for files committed to git. References: how Obsidian Canvas, Excalidraw, tldraw, and AFFiNE handle schema bumps in their changelogs.

#### [511] tldraw .tldr and Excalidraw .excalidraw schema diffs

Both tools publish documented file schemas with active community converters, and both could become realistic import sources for sketches and diagrams brought into Cosmoboard. Research should map their core node types, drawing primitives, and arrow models against Cosmoboard's drawing layer, then judge how much fidelity is reachable through a converter. Open questions: how do their stroke representations compare to Cosmoboard's simplified path model, and can connectors be preserved as JSON Canvas edges. Sources: tldraw.dev format docs, the Excalidraw JSON schema documentation, and the obsidian-excalidraw-plugin which already round-trips between Excalidraw and Obsidian.

#### [512] Figma and FigJam REST and plugin export pathways

Figma's REST API returns a node-tree JSON for files including FigJam boards, and plugin export can produce SVG, PNG, or PDF per node. Cosmoboard interop with these tools is realistically one-way at first, so this research should scope a minimum useful import that captures FigJam sticky notes, sections, connectors, and frames. Open questions: which scopes does the API require, how are bitmap fills referenced, and is there a free path that works without paid Figma plans. Sources: Figma REST API docs, the figma-export community tools, and existing FigJam-to-markdown converters.

#### [513] Portable single-file bundle format design

Beyond comparing container types in 508, this research designs the actual Cosmoboard bundle layout: top-level manifest, board JSON, markdown folder, media folder, entities folder, and version pin. It should evaluate borrowing from EPUB's mimetype-first zip layout, the Anytype `.any-block` structure, and the Foam or Obsidian export layouts, then pick a layout that is both static-site-friendly and Obsidian-convertible. Open questions: should the bundle be self-describing enough that a reader can render it without Cosmoboard, and how should it sign or checksum entries. Sources: EPUB OCF spec, the AFFiNE workspace export, and the cosmoboard_portability.md packaging modes table.

#### [514] Markdown wikilink and embed syntax compatibility

Cosmoboard's markdown to canvas linkage depends on a syntax that round-trips with Obsidian wikilinks `[[note]]`, embed syntax `![[note]]`, block refs `[[note#^block]]`, and Notion-style mention tokens, while still being valid CommonMark or GFM where possible. Research should define which subset Cosmoboard adopts as canonical and how it converts on import and export to and from each ecosystem. Open questions: should Cosmoboard prefer pure markdown links with id-bearing slugs over wikilinks for portability, and how should it represent board embeds inside markdown without breaking GitHub rendering. Sources: Obsidian help on internal links, the markdown-it and remark wikilink plugins, and the GFM spec.

### Onboarding and UX

#### [601] first-board onboarding flow that teaches spatial canvas without a tour overlay

Research how spatial-first apps teach pan, zoom, and drawing without a coachmark tour, and decide whether Cosmoboard's first board should ship as a pre-populated demo canvas, a guided empty board, or a hybrid. Key questions: does the first canvas teach modes through a single seeded sticky note that says "drag me, then press T," or through a labelled scaffold of nodes that mirror the V/T/P/L tools. Candidate references include tldraw's onboarding canvas, Figma's first-file walkthrough, Heptabase's starter card, and Excalidraw's empty greeting. The visual constraint of dark sidebar and teal highlights means any onboarding cue must read on the dark canvas without a bright modal.

#### [602] empty-state design for a brand-new Cosmoboard workspace folder

Investigate what a freshly created workspace folder should show before any markdown file or canvas exists, since the filesystem is the primary hierarchy. Open questions: do we render a single "create your first board" affordance, or a 3-tile starter grid covering board, markdown, and database. References worth pulling from: Obsidian's vault-creation flow, Notion's blank-page state, AFFiNE's edgeless-vs-page chooser. The empty state also has to teach that the user is editing real files in a real folder, which differs from cloud-app empty states.

#### [603] command palette grouping and ranking for nested-board navigation

Research how a Cmd-K palette should group results when boards can nest deeply, since the standard flat result list breaks down at depth four or more. Open questions: should nested boards collapse under their parent breadcrumb, should there be a separate "boards within this board" scope chip, and how should recents weight against depth. Candidate references include Linear's project switcher, Slack's channel switcher tree, JetBrains Search Everywhere tabs, and the existing Cosmoboard searchbar_tools.md scope rings. This research should produce a result-row anatomy specifically tuned for nested boards.

#### [604] right-click contextual menu taxonomy across node, board, and markdown surfaces

Study how to keep contextual menus consistent when the same right-click can land on a canvas node, a board background, a markdown paragraph, or a file in the sidebar. Key questions: do we share verbs across surfaces by capability (cut, copy, link, embed) or fork them by surface, and how do we keep the menu under the seven-item readable cap. References include macOS Finder, Obsidian canvas/file menus, Figma's per-object menu, and VS Code's editor context menu. Output should be a taxonomy table mapping each surface to its allowed verb groups.

#### [605] mobile gesture conventions for pan, zoom, draw, and select on touch

Research the conventions other spatial apps use for two-finger pan, pinch zoom, single-finger draw, and long-press select, and decide which set Cosmoboard adopts so users do not relearn between products. Open questions: does a single finger pan or draw by default, and how do we surface the mode without a permanent toolbar overlay on small screens. References include Procreate, Concepts, tldraw mobile, Apple Freeform, and Miro mobile. The output should be a gesture map plus a short rationale per choice grounded in the existing toolbar collapse behavior in `JavaScript/braindump.js`.

#### [606] power-user shortcut system and learnability ladder

Research how to grow Cosmoboard's existing keyboard layer (V/T/P/L/X, Ctrl+S, Ctrl+O, Ctrl+I) into a coherent system that scales to dozens of verbs without becoming Vim. Key questions: do we adopt chord shortcuts (Ctrl+K then C) like VS Code, modal sequences, or stay strictly single-keystroke. Reference systems: VS Code keybindings, Obsidian hotkeys, Linear's shortcut help overlay (?), Notion's slash menu, GitHub's `gh-?` cheat sheet. Deliverable should include a learnability ladder mapping from first-time user to power user along with a Cmd-/ cheat sheet design.

#### [607] error and conflict messaging tone for save, encryption, and GitHub flows

Research how to write error and conflict messages that match the project's plain, honest writing style and avoid both jargon and false reassurance. Open questions include how to phrase save conflicts when local and remote diverge, how to phrase a failed encryption unlock, and how to phrase a stale GitHub PR. References include Linear's error copy, GitHub's merge-conflict messages, Stripe API errors, and Apple Human Interface Guidelines on error tone. Output should be a tone guide plus rewrite of every existing toast string in `JavaScript/braindump.js`.

#### [608] accessibility audit needs for dark teal theme and canvas interaction

Research accessibility gaps that the dark theme plus teal highlight palette creates, and what canvas-specific accessibility patterns Cosmoboard must support given that screen readers do not read spatial content well. Open questions: does the teal accent meet WCAG AA contrast against the dark background, can keyboard users tab between canvas nodes, and how do we expose node text to assistive tech. References include tldraw's a11y plan, Figma's keyboard nav, ARIA spec for graphics-document, and the WebAIM contrast checker. Deliverable is a prioritized audit plus a baseline set of canvas a11y patterns.

#### [609] preview-first to live-embed escalation affordance for embedded boards and apps

Research the right UX for the preview-to-live transition given that Cosmoboard defaults to preview-first embeds but must allow opening the live editor in place. Open questions: is the trigger a click, a hover-with-modifier, a corner button, or a double-click, and how do we make the cost legible (memory, CPU, network) before the user escalates. References include Figma's frame-as-prototype play button, Notion's synced block expansion, Obsidian's hover-preview, and Bear's link cards. Output should be a state diagram for the preview-live transition with bounded loading and revert behavior.

#### [610] saved web app session resume UX inside markdown and canvas

Research how a saved web app session should appear when a user reopens a markdown or canvas file, since holistic_planning.md prioritizes saved sessions over opening tools in new tabs. Key questions: do we show the last screenshot with a resume button, the live app in a sandbox iframe, or a chooser between the two, and how do we communicate that the session is local-first. References include CodeSandbox session state, Replit save indicators, JupyterLite kernel resume, and StackBlitz WebContainers state. The deliverable is an interaction spec for the session-resume row, including failure modes when the runtime cannot restart.

#### [611] cross-board breadcrumb and back-stack design for deep nesting

Research breadcrumb and back-stack patterns for products where users can drill from board to embedded board to markdown file and back, since deep nesting is an explicit Cosmoboard expectation. Open questions: do we use a single breadcrumb bar, a stacked-sheet model like iOS, or a tab-strip, and how does Esc behave when the stack is three deep with one active text edit. References include Finder column view, Notion breadcrumb header, Apple Files stacked sheets, and Heptabase whiteboard zoom-out. Output should reconcile the breadcrumb with the existing left sidebar so the two do not duplicate.

#### [612] onboarding for the GitHub recommendation and PR collaboration bridge

Research how to onboard a casual visitor into the GitHub recommendation flow that holistic_planning.md picks as the v1 collaboration model, given that most visitors will not have a GitHub account or know what a PR is. Key questions: should the first contribution be a no-account upload to a public bucket that opens an issue, or should we drive account creation up front, and how do we explain that their suggestion becomes a public PR. References include the Obsidian Help repo's edit links, MDN's Edit on GitHub flow, Hugo themes' PR onboarding, and the GitHub web editor's contribution dialog. Deliverable is a flow diagram from "I want to suggest a change" to "PR opened" with friction notes at each step.

### AI Agents in the Loop

#### [701] MCP server contract for Cosmoboard board CRUD primitives

Research what a minimal Model Context Protocol server should expose for Cosmoboard, covering board read, board write, page list, file fetch, and embed-resolution tools. The interesting question is which primitives map cleanly to JSON Canvas and markdown without leaking implementation details, and how to expose multi-board nesting without combinatorial blowup. Candidate references include the official MCP spec at modelcontextprotocol.io, Anthropic's MCP server examples for filesystem and Git, and Obsidian's local REST API plugin as a prior-art surface. Open questions are whether tools return raw JSON Canvas, a normalized view model, or both, and how to scope a tool call to a sub-tree of the workspace.

#### [702] Agent identity, scope grant, and audit-record protocol design

Investigate concrete schemas for agent public-key identities, scope-grant artifacts, and audit-record markdown files as sketched in `ai_agents_in_the_loop.md`. Cosmoboard needs grants that are short-lived, revocable, and visible alongside boards, plus audit records that round-trip through Obsidian and Git without losing meaning. Candidate references include age and minisign for keypair conventions, Sigstore's transparency model, and Anytype's local data-ownership writeup at doc.anytype.io. Open questions are how grants survive merge conflicts in GitHub PR flows and whether audit hashes should chain per agent or per workspace.

#### [703] Prompt-as-canvas-node primitive and execution semantics

Research what it means to drop a prompt as a first-class canvas node, with inputs wired to other nodes, outputs written back into the canvas or a sibling markdown file. Key design questions are how the node represents pending versus completed runs, how re-runs handle stale upstream inputs, and how the result is portable when the file opens in Obsidian Canvas without the runtime. Candidate references include tldraw's `make-real` example, Excalidraw's plus AI flow, and Langflow or Flowise node graphs as prior art. The hardest open question is whether the prompt node belongs to JSON Canvas as a metadata extension or to a Cosmoboard-only sidecar layer.

#### [704] Agent memory rooted in filesystem and markdown frontmatter

Investigate memory patterns where agent state lives as plain markdown files with frontmatter, separate vector stores, or a hybrid that keeps source-of-truth on disk and indexes in a derived cache. Cosmoboard's local-first stance and Obsidian round-trip goal rule out hidden binary stores, so the question is how to keep retrieval fast while keeping memory portable. Candidate references include MemGPT, Letta, the OpenAI Memory pattern writeups, and Obsidian's Smart Connections plugin for vector indexes over markdown. Key open questions are whether to ship sqlite-vec inside SQLite WASM for browser use and how memory entries get pruned without losing audit history.

#### [705] Batched subagent topology, 5x Sonnet plus 3x Opus orchestration

Research orchestration patterns for fanning a single user task across many subagents at mixed model tiers, modeled on the just-tested 5x Sonnet plus 3x Opus pattern. The interesting questions are which task shapes parallelize cleanly (independent research, candidate generation, review) versus which require a serial planner, and how the orchestrator merges divergent outputs without losing detail. Candidate references include Anthropic's multi-agent research blog post, the Claude Agent SDK subagent docs, AutoGen, and CrewAI role patterns. Open questions are how Cosmoboard surfaces the fan-out structure to the user as visible nodes and whether each subagent gets its own audit record file.

#### [706] Cost vs latency tradeoff matrix across model tiers for board edits

Research empirical cost and latency profiles for Haiku, Sonnet, and Opus on canvas-relevant tasks like summarizing a board, extracting a table from a sketch, and drafting a markdown note, then build a routing matrix that maps task class to default tier. The interesting tension is that Cosmoboard wants snappy in-canvas feedback but also serious reasoning for planning agents, which suggests per-tool defaults rather than a single global model. Candidate references include Anthropic's pricing and latency docs, OpenRouter's leaderboards, Artificial Analysis benchmarks, and the OpenAI Evals cost tables. Open questions are how to expose the chosen tier in the audit record and whether to let users override per invocation.

#### [707] Evaluation harness for agent-authored canvas and markdown changes

Research how to build a regression harness for agent edits, where each test case is a starting board plus a prompt plus expected invariants on the resulting canvas or markdown. The hard part is that canvas outputs are partly free-form, so evaluators need a mix of structural checks (node counts, link integrity, markdown round-trip), semantic checks via judge models, and pixel diffs for layout-sensitive cases. Candidate references include Anthropic's Inspect framework, OpenAI Evals, Ragas for retrieval, and Promptfoo for prompt regression. Open questions are how harness fixtures live alongside `tests/board/` and whether judge-model calls themselves need to be cached for stable CI.

#### [708] Safety review and diff-gating patterns for agent-authored canvas writes

Investigate review workflows where every agent-authored change to a board lands as a proposed diff that the user approves before it merges into the canonical file. Key questions are how to render JSON Canvas diffs visually without overwhelming the user, how to batch many small node edits into one reviewable change, and how to pair this with the existing GitHub PR recommendation flow. Candidate references include GitHub's suggested-change UI, Cursor and Zed agent diff modes, and the Obsidian sync conflict UI. Open questions are whether the review surface lives inside the canvas as a ghost layer, in a side panel, or as a synthesized markdown summary.

#### [709] Embedded vs sidecar vs MCP-only agent deployment shapes

Research the three plausible deployment shapes for Cosmoboard agents, namely an embedded agent loop running in the browser tab, a sidecar local process the static site talks to over a port, and an MCP-only model where Claude Desktop or Claude Code drives the workspace from outside. Each has different implications for offline use, latency, and the static-site-compatible-first pillar. Candidate references include Claude Desktop's MCP integration docs, Ollama and LM Studio sidecar patterns, and the WebLLM project for in-tab inference. Open questions are which shape ships first, how the same MCP tool definitions can serve all three, and how grants translate when the driver is an external app.

#### [710] Local model fallback and routing for sensitive scopes

Research a routing layer that picks a local model when the scope contains content labeled `ai:no-share` or sits inside an encrypted vault, and a hosted model otherwise. The interesting design questions are how to detect sensitivity ahead of the call, how to communicate capability differences to the user without nagging, and how to handle partial scopes where some files are sensitive and some are not. Candidate references include WebLLM, Ollama's OpenAI-compatible API, MLC LLM, and the Hugging Face transformers.js project for in-browser inference. Open questions are which small models are actually useful for board summarization and whether routing decisions land in the audit record.

#### [711] Multi-agent coordination through workspace artifacts as message bus

Investigate the workspace-as-bus pattern from `ai_agents_in_the_loop.md`, where agents leave markdown notes for each other inside the boards rather than using hidden side channels. Research questions include which folder conventions scale, how requests get marked done without losing history, and whether canvas nodes representing agent inboxes are clearer than folder-based queues. Candidate references include Smallweb-style agent inboxes, the Letta agent-to-agent protocol, and how Anthropic's Computer Use demos coordinate steps via shared scratch files. Open questions are whether coordination artifacts should be JSON Canvas nodes, markdown files, or both, and how to prevent infinite agent ping-pong loops.

#### [712] Continuous agent budgets, kill-switch, and drift detection

Research how to design continuous agents that watch a folder or run on a schedule without surprising the user with cost or behavior drift. Key questions are where the budget cap lives (per agent, per workspace, per day), how the kill-switch surfaces in the workspace UI, and how to detect drift such as a watching agent suddenly producing 10x more output than normal. Candidate references include cron-style schedulers in Anytype and Obsidian Tasks, GitHub Actions budget patterns, and OpenAI's usage-cap dashboards. Open questions are whether continuous agents must sign each run with a budget receipt that lands in the audit folder and how to handle partial-failure resumption without double-charging.

### Other

#### [801] Performance budget definition and enforcement for mixed canvas + markdown + embed boards

Cosmoboard already has a stated target of N=200 mixed nodes at 60fps on a 2020 laptop, but no test harness or CI guard enforces it. Research how other web canvas products define and police budgets, including tldraw's perf benchmarks, Figma's frame-time histograms, and Chrome's INP / Long Animation Frame API. Open questions, do we measure paint-only or full interaction loops, do we run on synthetic boards or fixture boards, and where does a regression block merge. Candidate sources, Chrome DevTools performance MCP traces, web.dev INP guidance, and the existing `scripts/performance-audit.mjs` plus `tests/build/performance-audit-build.test.mjs` already in this repo.

#### [802] Telemetry boundaries and opt-in analytics for a local-first product with a privacy promise

The wedge sentence is "your data, on disk, openable anywhere," so any telemetry that leaks contents or filenames undermines positioning. Research opt-in models from Obsidian (none by default), Tauri's anonymous metrics, Plausible / Umami self-hosted patterns, and Apple's differential privacy framing. Key questions, what minimum signals (crash count, feature usage frequency, performance histogram) are worth collecting to validate the 5-weekly-users target without breaking trust, and how do we expose a one-click off switch plus a visible event log. References, Plausible docs, the GDPR ePrivacy guidance, and Mozilla's data preferences design pattern.

#### [803] Accessibility commitments for spatial canvas plus markdown plus embed surfaces

Spatial canvases are notoriously hard for screen readers, keyboard navigation, and reduced-motion users, and an honest local-first product should not ship a canvas that excludes these users. Research how tldraw, Excalidraw, and Miro handle ARIA, focus order, keyboard pan/zoom, and live-region announcements for canvas mutations. Open questions, what is the minimum viable a11y commitment for v1 (likely keyboard navigation and a markdown-only fallback view), and how do we test it in CI. Candidate sources, WAI-ARIA Authoring Practices for graphics, axe-core canvas rules, and the Excalidraw issue thread on screen reader support.

#### [804] Plugin and addon SDK shape that protects the AGPL engine boundary

Licensing direction calls for Apache-2.0 SDK plus AGPL engine, which means the SDK contract has to be a real boundary, not a leaky import surface. Research extension models from Obsidian (CommonJS API plus manifest), VS Code (activation events, contribution points), Figma (sandboxed iframe plus message bus), and Excalidraw's plugin pattern. Open questions, do we ship a typed message-passing API or in-process calls, how do plugin permissions map to scope grants from `ai_agents_in_the_loop.md`, and what is the minimum viable hello-world plugin. Sources, VS Code Extension API docs, Obsidian Developer Docs, and Figma Plugin API.

#### [805] Security threat model for local-first plus GitHub bridge plus optional encryption

The product spans capability URLs, opt-in encryption with optional escrow, GitHub PR collaboration, and eventual P2P relay nodes, each with different attackers and trust assumptions. Research a STRIDE or LINDDUN-style threat model that covers a capability link leak, an attacker with read access to the GitHub repo, a malicious plugin, and a compromised relay. Key questions, what are the explicit non-goals (we likely do not defend against a compromised local OS), and where do recovery escrow keys live. Sources, OWASP Threat Modeling, Matrix.org's threat model writeups, and `security_and_access.md` in this repo.

#### [806] Tauri vs Electron vs PWA-only packaging path for the desktop and offline story

`vison_planning.md` already names Tauri as the preferred wrapper, but the research artifact behind that recommendation does not yet exist. Investigate bundle size, File System Access parity, auto-update story, code signing on macOS and Windows, and AGPL Section 13 source-link UI compliance for each option. Open questions, can a PWA alone clear the threshold for "feel safe putting real notes there" given Safari and Firefox lacking File System Access, and what is the smallest Tauri shell that adds value. Sources, Tauri docs, Electron Forge docs, web.dev PWA install guidance, and Capacitor's hybrid story.

#### [807] Testing strategy across canvas, markdown, sync, and import-export surfaces

The repo already mixes Node-based unit tests, Playwright runtime tests, and a build performance test, but there is no documented strategy for how the surfaces interact. Research test pyramids for editor products including Obsidian's plugin test guidance, ProseMirror's test-builders, and Yjs's deterministic property-based sync tests. Open questions, where do we use property-based testing for `.canvas` round-trips, where do we accept screenshot diffs for the canvas, and how do we keep the suite under a few minutes locally. Sources, fast-check for property tests, Playwright trace viewer, and the existing `tests/board/` folder as the seed.

#### [808] Documentation site generation that lives next to the static portfolio without bloat

A startup-intent product needs developer docs (SDK), user docs (workspace), and contributor docs (CLA, AGPL Section 13), and these should not pull in a heavy framework that conflicts with the lightweight static-host constraint in `project.md`. Research static-doc generators including Astro Starlight, Docusaurus, mdBook, and the dogfood option of generating docs from Cosmoboard's own markdown plus canvas. Open questions, do we host docs on a `/docs` subpath of `evrenucar.com`, a separate `cosmoboard.dev` once the repo splits, or inside the app itself. Sources, Starlight docs, Docusaurus docs, and Astro's content collections guide.

#### [809] Monetization models for a portfolio site that doubles as a product entry point

The licensing direction names Sentry, Grafana, and Mattermost as templates, but the question of what the actual paid product is for Cosmoboard is unresolved. Research hosted-relay-as-SaaS pricing, prosumer one-time license, sponsorware (GitHub Sponsors plus early-access builds), and team-tier collaboration features as the upsell. Open questions, what is free forever to keep the local-first promise honest, and what is the smallest feature that crosses the paid line without feeling extortive. Sources, Sentry pricing page, Obsidian Sync pricing, Tana paid tier, and Mattermost commercial license docs.

#### [810] Legal posture around user content, attribution, and copyright on uploaded files

Once a user drags PDFs, photos, and pasted clippings into a Cosmoboard, the tool needs a defensible position on what it can do with that content, especially once AI agents and OCR pipelines touch it. Research Notion's terms, Obsidian's stance (none, since data is local), Figma's content terms, and the DMCA safe-harbor implications of hosting user content via the GitHub bridge. Open questions, do we ever transmit user content to a hosted AI without an explicit per-action grant, and how do we phrase that in onboarding. Sources, Notion ToS, GitHub Acceptable Use Policies, and EFF's guides on user-content terms.

#### [811] Internationalization and right-to-left readiness across canvas labels and markdown bodies

Cosmoboard's first audience may include Turkish-speaking users tied to OMA Collective, and any future broader rollout will hit RTL languages, complex script shaping, and locale-specific date and number formats. Research i18n approaches for editor products including ProseMirror's input rule i18n, FormatJS / ICU MessageFormat, and CSS logical properties for the sidebar layout. Open questions, do we lock the UI to English for v1 with content in any language, or do we translate the shell from day one. Sources, MDN's CSS logical properties, Unicode CLDR, and Notion's localization writeups.

#### [812] Crash recovery, autosave cadence, and corruption handling for browser-based local stores

Local-first storage in a browser carries real risks, IndexedDB quotas, partial writes during a tab crash, OPFS not yet ubiquitous, and the user clearing site data through dev tools. Research patterns from VS Code Web's editor recovery, Obsidian's hot-reload-of-vault behavior, and Automerge's snapshot plus log model. Open questions, what is the autosave cadence that does not break perceived performance under the 60fps target, and how do we surface "this board was recovered from a crashed session" without panicking the user. Sources, web.dev OPFS guide, IndexedDB quota docs on MDN, and the existing Braindump save flow planning under `whiteboard/online_save_flow.md`.
