# Focus Mode for Nested Boards

## Problem / Why
When the user zooms or navigates into a child board, the surrounding parent context is sometimes useful and sometimes a distraction. There needs to be a deliberate "focus" mode that strips the parent away cleanly, so the nested board feels like a first-class working surface, while the path back stays one keystroke away.

## Sketch
- A focus toggle, default keybind F, hides the parent frame, the sibling embeds, and any decorative chrome, leaving only the active nested board, the breadcrumb spine, and the sidebar. Press F again to restore.
- In focus mode, the sidebar collapses to a thin teal strip with just the ancestor folders highlighted. Hovering it reveals the full tree. This keeps the filesystem-as-truth idea visible without taking pixels.
- Focus state is per-tab and persisted in URL query, so a focused link can be shared and reopens already focused. This makes nested boards linkable as standalone views.
- Focus does not change the file. The board is still rendered the same way. Only the surrounding view chrome is suppressed, so leaving focus puts everything back where it was.
- Optional sub-mode "deep focus" hides the breadcrumb too and shows only a small back arrow. This is for presentation or screenshot use.

## Notes
- Touches the layout shell, the sidebar component, and URL query parsing.
- Precedent: Obsidian Zen mode, iA Writer focus mode, Notion's full width toggle. The new piece is that focus here applies to a specific nested board, not the whole window, and it travels with the URL.
- Open question: should focus mode also hide markdown linked-mentions panels, or is that a separate setting. Probably separate, but worth user testing.
