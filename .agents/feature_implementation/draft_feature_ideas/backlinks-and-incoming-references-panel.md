# Backlinks And Incoming References Panel

## Problem / Why
Markdown links and canvas embeds point outward, but there is no way to see what points at the current file or node. A backlinks panel turns one way links into a navigable graph without giving up the filesystem first model.

## Sketch
- At build time, parse every markdown file and `.canvas` file for outgoing references: `[text](path)`, wiki style `[[path]]` if supported, canvas `file` nodes, and canvas edges that target other files.
- Invert the map and write a `backlinks.json` keyed by target path (and optional node id).
- Add a collapsible "References" panel under the current view. It lists incoming links grouped by source file, with the surrounding sentence or card title as context.
- Clicking an entry navigates to the source. Hovering previews the source snippet.
- Panel is empty and silent when nothing links in, so unreferenced pages stay clean.

## Notes
- Precedent: Obsidian backlinks pane, Roam linked references. Keep it lighter, no unlinked mentions in v1.
- Canvas edges can carry semantic labels in the JSON. Surface those as the reason for the link when present.
- Keeps filesystem as the hierarchy. Backlinks are a read only view, never a reorganization.
