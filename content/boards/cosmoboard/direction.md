# Cosmoboard direction

The Cosmoboard system takes the Braindump whiteboard engine and generalizes it into a reusable runtime where any page can host a board.

## Core principles

- **File-first** — every board is a `.canvas` JSON file on disk
- **Local-first** — changes save to localStorage before attempting a server sync
- **Spatial by nature** — content lives on a 2D canvas, not in a document stream

## Node types

| Type | Purpose |
|------|---------|
| `text` | Free-form note or label |
| `link` | Bookmark with live preview |
| `image` / `file` | Embedded asset |
| `board-preview` | Minimap reference to another board |
| `markdown` | Rendered `.md` file inline on the canvas |

## Status

The engine is generalized. Multiple boards can mount on the same page via `mountCosmoboard(hostElement)`. Preview mode embeds boards read-only inside project detail pages.

Next steps: markdown-to-canvas sync, filesystem content registry, base/database layer.
