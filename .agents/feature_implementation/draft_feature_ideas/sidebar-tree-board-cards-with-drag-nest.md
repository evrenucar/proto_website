# Sidebar Tree with Board Cards and Drag to Nest

## Problem / Why
A flat file tree treats `.canvas` files as just another row, but boards are the primary unit of work in Cosmoboard. The sidebar should let the user manipulate the filesystem hierarchy and the parent-child relationships between boards through the same direct-manipulation gesture, instead of context menus and modal dialogs.

## Sketch
- Each `.canvas` row in the sidebar expands inline into a small card preview when hovered, showing the first few nodes at low resolution. The user can recognize a board without clicking into it.
- Drag a board row onto another board row. If dropped on the row itself, the dragged board becomes an embedded child inside the target board, written into the target's `.canvas` as a board-embed node. If dropped on the row's folder chevron, it moves on disk into that folder instead.
- Drag a board row onto a folder to move the file. Drag onto a markdown row to insert a board-embed link into that markdown file at the cursor position last used in that file.
- Renaming in the sidebar triggers a real rename on disk and rewrites every link and embed pointer that references the old path. A small undo snackbar appears for thirty seconds.
- A keyboard mode lets the user select a row and press a single key to nest it under the current selection, mirroring how Bear lets you re-parent tags.

## Notes
- Touches the sidebar component, the `.canvas` writer, and whatever scans for cross-file links.
- Precedent: Finder column view drag, Obsidian file explorer with the "drag link" gesture, Notion sidebar nest by drop. Notion is the closest, but Notion has no filesystem under it. Here the disk move and the embed link are two clearly separated drop zones.
- Open question: do we always rewrite link targets on rename, or do we prefer a stable identifier in frontmatter and let paths change freely. Probably the latter for the long term.
