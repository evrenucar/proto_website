# Holistic Planning

## Purpose
North star, confirmed decisions, and current roadmap snapshot for the Cosmoboard product direction.

## Read when
Answering product-strategy questions, checking the current roadmap, or understanding confirmed product decisions.

## Skip when
Looking for active task state, architecture details, technology research, or implementation history.

## Canonical for
Product north star, product pillars, phased roadmap, skeleton decisions, confirmed user direction.

---

## Planning Stack

| Topic | Doc |
| --- | --- |
| This file | North star, confirmed decisions, roadmap |
| [holistic_architecture.md](./holistic_architecture.md) | Capability matrix, source-of-truth rules, file organization, architecture |
| [holistic_research.md](./holistic_research.md) | References, technology candidates, feature ideas, open questions |
| [holistic_tasks.md](./holistic_tasks.md) | Active work, review queue, next up |
| [holistic_backlog.md](./holistic_backlog.md) | Medium/later live work |
| [archive/](./archive/) | Resolved history and legacy notes |
| [whiteboard_plan.md](../whiteboard/whiteboard_plan.md) | Original Braindump whiteboard MVP direction |
| [cosmoboard_portability.md](../whiteboard/cosmoboard_portability.md) | Portability, embed, markdown, file, and compatibility strategy |
| [cosmoboard_implementation_plan.md](../whiteboard/cosmoboard_implementation_plan.md) | Refactor and implementation roadmap for turning Braindump into a reusable engine |
| [online_save_plan.md](../whiteboard/online_save_plan.md) | Static-site-friendly recommendation and export flow |
| [online_save_backend_plan.md](../whiteboard/online_save_backend_plan.md) | Later GitHub OAuth and PR-based collaboration path |
| [page_database_plan.md](../page_database/page_database_plan.md) | Collection, page, and database-like content model for the rest of the site |
| [extension_seams.md](./extension_seams.md) | Catalog of extension surfaces: entity types, canvas-item renderers, toolbar commands, keyboard/wheel routes |

## Product North Star

| Item | Direction |
| --- | --- |
| Product intent | One interface where canvases, markdown, databases, files, websites, and later apps can coexist and reference each other |
| Core metaphor | `Cosmoboard` is the spatial layer, markdown is the durable writing layer, bases/databases are the structured query layer |
| Primary quality bar | High performance on desktop, tablet, and mobile |
| Core deployment model | Local-first and static-site-compatible first |
| Portability goal | Every important artifact should be importable, exportable, downloadable, and recoverable |
| Interoperability goal | Stay close to open formats where possible, especially markdown and JSON Canvas |
| Collaboration goal | Start async and Git-friendly, then add realtime collaboration later |
| Anti-goal | Do not become a cloud-only locked workspace that requires backend sync for basic use |

## Product Pillars

| Pillar | What it means in practice |
| --- | --- |
| Local-first | Local drafts, local files, offline-friendly editing, browser-first persistence |
| Portable | Markdown, `.canvas`, exported bundles, downloadable assets, import/export everywhere |
| Embeddable | Markdown in boards, boards in markdown, websites in boards, documents in focused viewers, apps in bounded containers |
| Structured | Databases and bases can query, filter, and cross-reference notes, boards, and files |
| Performant | Pan, zoom, drawing, file previews, and embeds do not block interaction |
| Gradual collaboration | Single-user first, GitHub workflow second, realtime CRDT collaboration later |
| Safe by default | Sandboxed embeds, explicit local file permissions, no silent filesystem crawling |

## Phased Product Roadmap

| Phase | Outcome | Main deliverables |
| --- | --- | --- |
| 0 | Demo becomes explicit platform prototype | Align naming around Cosmoboard, create umbrella plan, keep Braindump stable |
| 1 | Reusable board engine | Registry, generic host renderer, shared runtime, shared CSS, canonical board paths |
| 2 | Board plus markdown workflow | `markdown-ref` nodes, markdown embeds, import/export for `.md` and `.canvas` |
| 3 | Structured local views | Base / database layer over notes, boards, and assets |
| 4 | File and embed workspace | Generic file nodes, focused viewers, website embeds, folder import |
| 5 | Async collaboration and versioning | GitHub recommendation flow, stable board branches, PR-aware review workflow |
| 6 | Realtime collaboration | CRDT sync, presence, comments, awareness, conflict handling |
| 7 | App surface | Sandboxed app embeds, session state, selective streamed/local apps |
| 8 | Full ecosystem portability | Portable bundles, richer Obsidian round-trip, plugin or local API layer |

## Collaboration Maturity Model

| Stage | Collaboration model | Best fit |
| --- | --- | --- |
| Stage A | Single-user local-first | Core product must work here |
| Stage B | Export and import handoff | Fast portability without backend |
| Stage C | GitHub issue / recommendation upload | Static-site-safe public contribution |
| Stage D | GitHub OAuth plus stable PR per board per user | Moderated async collaboration |
| Stage E | Realtime CRDT sync plus presence | Active co-editing sessions |
| Stage F | Shared entities plus comments, mentions, review flows | Team knowledge workspace |

## Skeleton Decisions

| Decision area | Current recommended default | Why |
| --- | --- | --- |
| Main system name | `Cosmoboard` | Already consistent with portability and implementation docs |
| Default board scope | One board per project, page, or topic | Keeps boards smaller, faster, and easier to version |
| Main writing source | Markdown files | Best portability and interoperability |
| Main board source | JSON Canvas compatible `.canvas` | Best current interoperability target |
| Main structured layer | File-backed bases / database views | Matches local-first direction |
| Embed expansion model | Preview first, open full editor route | Better performance and less UI clutter |
| Async collaboration v1 | GitHub issue / PR recommendation flow | Fits repo and static-site constraints |
| Realtime collaboration | CRDT-based and optional | Should not block core product launch |
| App embeds | Later phase with manifest plus sandbox | Needs clear security and state rules |

## Resolved Direction From User Interview

| Decision area | User direction | Planning effect |
| --- | --- | --- |
| Product naming | `Cosmoboard` is acceptable for now | Do not block work on broader naming decisions |
| Written content model | Markdown and canvas should stay core and work together easily | Do not make block-doc tooling replace markdown as the only durable writing model |
| Board count and nesting | Multiple boards per page are expected, including deep nesting | Registry, host rendering, and embed model must not assume one board per page |
| Hierarchy model | Filesystem hierarchy should stay primary | Keep file-backed organization ahead of opaque workspace-only structures |
| Embed default | Preview-first by default, live embeds also possible | Use cheap default embeds but preserve richer live modes |
| Structured layer | Obsidian portability matters, but cleaner and more intuitive UX is allowed; Notion-like ergonomics can help near term | Build portable structured views without copying either product blindly |
| Local file behavior | Read and write support is desired where possible on browsers/devices | Design for capability detection and graceful fallback, not read-only as the only target |
| App embed priority | Saved web app sessions are the first priority | App/session manifests matter earlier than streamed remote apps |
| GitHub role | GitHub should be the main collaboration surface for now, alongside local-first workflows | Keep recommendation, issue, and PR flows central in early collaboration phases |
| Realtime scope | Broad coverage is preferred if practical | Do not over-silo the collaboration plan to boards only unless forced by complexity |
| First serious pilot | Stay inside `evrenucar.com`; after Braindump, add a `cosmoboard` onboarding page with boards, markdown files, and database views inside it | Near-term roadmap should target a central onboarding board rather than a separate standalone product site |

## Main Product Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Performance collapse | Boards with drawings, media, embeds, and apps can become unusable fast | Culling, LOD, async media, viewer-first design, cheap embeds |
| Over-complex data model too early | Too many object types can stall shipping | Start with board, markdown, files, bases, then add entities/apps |
| Cloud dependency creep | Portability and offline use would regress | Keep local drafts, file export, and static-site behavior as non-negotiables |
| Cross-origin embed limits | Many websites cannot be embedded freely | Use metadata cards, open actions, snapshots, and provider adapters |
| Collaboration conflict complexity | Realtime and GitHub flows solve different problems | Ship async versioning first, realtime later |
| Mobile UX degradation | Desktop-first canvas tools often fail on touch devices | Keep mobile and tablet in scope at every phase |
