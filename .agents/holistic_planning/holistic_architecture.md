# Holistic Architecture

## Purpose
Capability matrix, source-of-truth rules, file organization, and detailed architecture for the Cosmoboard product.

## Read when
Working on architecture, designing new artifact types, checking capability coverage, or planning file organization changes.

## Skip when
Looking for active task state, product strategy, or technology candidates.

## Canonical for
Capability matrix, experience model, architecture layers, file organization, source-of-truth rules, embed strategy, dual export workflow.

---

## Capability Matrix

| Artifact type | Native object? | Embeddable in board? | Embeddable in markdown? | Import/export target | Suggested source of truth |
| --- | --- | --- | --- | --- | --- |
| Cosmoboard | Yes | Yes | Yes | `.canvas`, portable bundle | Board file |
| Markdown note | Yes | Yes | Yes | `.md`, bundle | Markdown file |
| Base / database view | Yes | Yes | Yes | `.base`, JSON, bundle | Base definition plus file metadata |
| Local file | Yes | Yes | Yes via embed/view block | Original file, bundle | File itself plus metadata |
| Local folder | Yes | Yes | Partial, via folder block or linked view | Folder import, bundle manifest | Folder handle plus indexed metadata |
| Website embed | Yes | Yes | Yes | URL plus metadata snapshot | URL plus embed metadata |
| App embed | Yes, later | Yes | Yes, later | App manifest plus session state | App session record |
| Shared entity | Yes, later | Yes | Yes | JSON, bundle | Entity store |
| Image / video / pdf | Yes | Yes | Yes | Original asset, bundle | Asset file plus metadata |

## Experience Model

| Surface | Primary use | Default mode | Expansion path |
| --- | --- | --- | --- |
| Full cosmoboard | Spatial thinking, curation, research, project mapping | Full interactive editor | Stays full editor |
| Embedded cosmoboard | Preview of a project/topic board | Read-only or lightweight interactive | Open dedicated full board route |
| Markdown page | Writing, specification, narrative, project logs | Document editor / viewer | Open linked board, files, database views |
| Base / database view | Structured browsing, sorting, filtering, cross-reference | Query and inspect | Open markdown pages, board nodes, file viewers |
| Focused file viewer | PDF, image, text, JSON, archive, CAD | Viewer-first | Optional editing for safe file types later |
| App container | Tool inside the workspace | Sandboxed preview | Open isolated app session |

## Architecture Overview

| Layer | Responsibility | Notes |
| --- | --- | --- |
| Host shell | Routing, layout, nav, mobile/desktop adaptation | Current website grows into product shell |
| Cosmoboard engine | Pan, zoom, selection, drawing, node layout, board import/export | Existing Braindump evolves into shared engine |
| Markdown engine | Durable writing, embeds, references, metadata | Must stay portable and file-backed |
| Base / database layer | Query, sort, filter, cards, relations, derived views | Bridge between notes, boards, and files |
| Viewer layer | PDF, text, image, video, archive, CAD viewers | On demand, not hot path |
| Entity layer | Shared reusable content across boards and markdown | Later phase |
| Persistence layer | Local draft, canonical files, bundle export, optional hosted save | Static-site-compatible first |
| Collaboration layer | GitHub recommendation, PRs, later CRDT sync and presence | Layered, not required for core editing |

## Canonical File Organization

### Recommended V1 file tree

```text
content/
  boards/
    index.json
    braindump/
      current.canvas
    projects/
      <project-slug>/
        current.canvas
    topics/
      <topic-slug>/
        current.canvas
  markdown/
    projects/
      <project-slug>.md
    notes/
      <note-slug>.md
  bases/
    projects.base
    notes.base
    media.base
  assets/
    images/
    video/
    pdf/
    files/
  embeds/
    websites/
      <embed-id>.json
    apps/
      <app-id>.json
```

### Recommended V2 linked-content tree

```text
content/
  boards/
    index.json
    braindump/current.canvas
    projects/<project-slug>/current.canvas
  markdown/
    projects/<project-slug>.md
    notes/<note-slug>.md
  bases/
    projects.base
    notes.base
    media.base
  entities/
    note-001.json
    markdown-002.json
    media-003.json
    embed-004.json
    app-005.json
  assets/
    ...
  bundles/
    exported/
      <slug>-YYYY-MM-DD-HH-mm-ss.cosmoboard.json
```

## Interchange And Portability

| Format / package | Import priority | Export priority | Why it matters |
| --- | --- | --- | --- |
| Markdown `.md` | High | High | Core durable writing format |
| JSON Canvas `.canvas` | High | High | Board portability and Obsidian-friendly interoperability |
| Base definition `.base` | Medium-high | High | Structured views over local files and metadata |
| Plain JSON | High | High | Entity records, manifests, session state |
| PDF / images / video | High | High | Common research and project assets |
| Portable bundle `.zip` | Medium | High | Full project handoff, archiving, includes all raw assets |
| Git-friendly patch `.canvas.json` | Medium | High | GitHub PR / issue payload, embeds new unsaved images as Base64 for clean diffs |

## Suggested Source-Of-Truth Rules

| Content type | Recommended source of truth |
| --- | --- |
| Quick scratch note that lives only on one board | Board file |
| Durable project note | Markdown file |
| Shared note reused in multiple boards and pages | Entity record referencing markdown or canonical entity content |
| Structured project metadata | Base / database file and file properties |
| Attached asset | Asset file plus metadata record |
| Website embed | Embed record with URL and snapshot metadata |
| App session | App session record plus app manifest |
| Spatial arrangement | Board file |

## App And Embed Strategy

| Object | V1 shape | Later shape | Important constraint |
| --- | --- | --- | --- |
| Website embed | Sandboxed iframe or metadata card | Richer live embed with provider adapters | Many sites will block or limit iframe embedding |
| PDF / document | Focused viewer | Inline snippets plus annotations | Keep heavy rendering off the camera hot path |
| Markdown embed | Read-only reference or excerpt | Editable linked entity | Clear source-of-truth rules needed |
| Cosmoboard embed | Read-only preview | Shared filtered view | Prefer dedicated full editor route |
| Database embed | Cards or table preview | Fully interactive embedded base | Avoid loading too much data by default |
| App embed | App card plus session manifest | Streamed or local app container | Strong sandboxing and saved state boundaries |
| Browser-like surface | URL card plus open action | Embedded browser pane or clipped snapshot flow | Cross-origin restrictions are real |

## Implemented V1 Shared Entity Slice

| Item | Current implementation |
| --- | --- |
| Entity registry | `src/registry.json` has an `entities` collection alongside boards, notes, assets, apps, and embeds |
| Entity source file | `src/entities/eurocrate-storage-system.json` is the first file-backed shared entity record |
| Generated runtime index | `scripts/build-site.mjs` writes `content/entities/index.json` from the registry and source files |
| Board rendering | `entity` nodes in `.canvas` files load `content/entities/index.json` and render explicit shared entity cards |
| Structured view bridge | `content/base-data/items.json` rows can expose `entityRef` and `entityTitle` when an entity shares a `projectSlug` |
| First reused entity | `eurocrate-storage-system` is referenced by the Cosmoboard entity node and the Projects base table |
| Proof | `tests/shared-entity-build.test.mjs`, `tests/shared-entity-runtime-e2e.test.mjs`, screenshot `.tmp/shared-entity-e2e/cosmoboard-shared-entity.png` |

## Implemented Board Save And Export Hardening

| Item | Current implementation |
| --- | --- |
| Local preview save | `scripts/preview-server.mjs` implements `POST /api/save-board` and writes to the registered board source file |
| Save shortcut | `Ctrl/Cmd+S` now uses the same board save path as toolbar Save; `Ctrl/Cmd+Shift+S` remains Save As |
| Single canvas export | Export modal includes `Export .canvas` for a plain board file without bundling |
| Bundle export safety | Serialized state is cloned before bundle path rewriting, so export cannot mutate live board nodes |
| Linked sub-page estimates | Export size estimation fetches linked board/markdown byte sizes when `HEAD` has no `content-length` |
| Board URL paste | Generated board pages include `data-board-index`; pasted board URLs become preview cards with SVG/minimap previews |
| Proof | `tests/board-save-export-runtime.test.mjs`, `tests/preview-save-endpoint.test.mjs`, `tests/board-save-reload-e2e.test.mjs`, `tests/board-url-paste-preview-e2e.test.mjs`, `tests/export-size-subpages-e2e.test.mjs` |

## Dual Export & Base64 Extraction Workflow

The system utilizes a dual export strategy for .canvas files:
1. **Git-Friendly Recommendations (.canvas.json)**: Uses the native JSON format. Any newly pasted unsaved images are embedded as Base64 strings. This allows the recommendation to be completely self-contained text, perfect for Git diffs during GitHub PRs or issue attachments.
2. **Portable Project Bundles (.zip)**: For full project handoffs, uses fflate to generate a ZIP bundle. Converts bloated Base64 strings and local URL references into actual .png files stored within an assets/ folder inside the ZIP.

### Server-Side Base64 Extraction Script
As part of the recommendation workflow, a Node.js script (e.g. npm run extract-assets) should be created in the future. This script will:
- Read a .canvas.json file after a recommendation is accepted.
- Iterate over all nodes and identify data:image/... Base64 strings.
- Decode these strings and save them as actual binary files (e.g., .png, .jpg) into the content/assets/ folder, ensuring unique filenames.
- Replace the Base64 string in the .canvas.json node with the new local file URL (e.g., content/assets/new-image.png).
- Overwrite the .canvas file with these updated paths, resulting in a clean, asset-separated file ready for a clean Git commit.
