# Breadcrumb Spine with Open Modes

## Problem / Why
Nested boards inside boards inside folders get disorienting fast. Users lose track of where they are in the filesystem versus where they are inside a parent canvas. A persistent breadcrumb that mirrors both the folder path and the in-canvas nesting, with clear semantics for "open inside this view" versus "open in a new tab", makes deep navigation feel grounded.

## Sketch
- Top of every board view, render a single breadcrumb spine that combines folder ancestors and canvas ancestors. Folder segments use a slash glyph, in-canvas embed segments use a chevron, so the user can read the path type at a glance.
- Each segment is a button. Plain click pushes that ancestor into the current view, replacing the right pane. Cmd or Ctrl click opens the segment in a new tab. Middle click matches.
- Hovering a segment previews its first viewport in a small floating thumbnail, so the user can decide before committing.
- A trailing "..." appears when the spine overflows. Clicking it expands a vertical list of every ancestor with the same open-mode hotkeys.
- The spine is also the drop target for "move this file to a different parent". Dragging the current board onto an ancestor segment triggers a move-on-disk confirm dialog.

## Notes
- Precedent: VS Code breadcrumb, Obsidian path-in-titlebar, Bear's nested tag bar. None of them combine filesystem and canvas embed depth in one trail.
- Code areas: routing layer that resolves a board URL, the sidebar's selected-path state, and whatever component renders the board chrome.
- Open question: how to show when the same board appears at two different points in the spine because of cross embeds. Possibly badge the segment with a small loop icon.
