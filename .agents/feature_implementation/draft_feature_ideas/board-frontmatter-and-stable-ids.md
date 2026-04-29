# Board Frontmatter and Stable IDs

## Problem / Why
Right now a board is identified by its file path, so renames and moves break embeds and outbound links. Boards also have no place to declare metadata like a display title, a parent override, a default open mode, or a canonical alias. A small frontmatter block in `.canvas` files, plus a stable ID, lets navigation features stay correct as the filesystem reshuffles.

## Sketch
- Add an optional `meta` object at the top of every `.canvas` file. Fields include `id` (a short ULID written once), `title` (display name, falls back to filename), `parent` (path or id of a logical parent if different from the folder), `defaultOpen` ("inside" or "tab"), and `aliases` (extra slugs that resolve to this board).
- Cross-board embeds and links prefer `id` over path. The resolver maintains an index from id to current path, rebuilt on file system change. Path-based links still work as a fallback for hand-written content.
- The sidebar reads `title` for display while keeping the filename underneath in a muted style, so the user always sees the disk truth and the friendly name together.
- A small "Board info" panel exposes these fields as plain inputs. Editing them rewrites the frontmatter in place, no schema migrations.
- `parent` overrides let a board claim a parent that lives in a different folder, which powers cross-folder breadcrumb spines without inventing a database.

## Notes
- Touches the `.canvas` parser, the link and embed resolvers, and the sidebar row renderer.
- Precedent: Obsidian frontmatter and the unique-note-id plugin, Hugo's resource frontmatter, Logseq's block ids. The local-first part is that the id lives in the file, so any clone or copy carries it.
- Open question: do we also assign ids to markdown files for symmetric linking. Probably yes, but as a separate follow-up so the canvas case can ship first.
