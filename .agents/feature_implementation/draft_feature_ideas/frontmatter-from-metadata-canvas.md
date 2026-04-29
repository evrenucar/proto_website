# Frontmatter Pulled From a Metadata Canvas

## Problem / Why
YAML frontmatter is the usual place for structured page data, tags, dates, status, related links. Editing it by hand is dry and error-prone. Meanwhile a small `.canvas` is a great visual surface for picking tags, dragging related notes, or laying out a status board. We can let a tiny canvas region act as the source of truth for a page's frontmatter, then serialize it back into YAML on save.

## Sketch
- Designate any canvas (or a region inside one) as a "metadata canvas" via a flag in the canvas's own metadata. Its nodes follow a small convention: node label is the key, node body is the value, child nodes become array items, group nodes become nested objects.
- A markdown file can declare `frontmatter-source: meta.canvas` (in its own existing frontmatter or in a `.meta.json` sidecar). On save, the build reads the metadata canvas, serializes it to YAML, and rewrites the markdown's frontmatter.
- Edit-in-place still works on the markdown side. If the user edits the YAML directly, the next save reconciles and updates the canvas nodes accordingly. Conflicts use last-writer-wins per key with a small surfaced diff.
- Provide a small palette of starter metadata canvases, one for "post" (title, date, tags, hero), one for "project" (status, links, collaborators), one for "person" (name, role, contact). Each is just a `.canvas` template, no special code.
- Visual: the metadata canvas keeps the standard dark theme and teal accents. Keys render with a faint label chip so the user can scan structure.

## Notes
- Precedent: Notion databases, Obsidian Dataview, but those are query-time. Here the canvas literally writes the YAML.
- Code areas to touch: markdown save pipeline (intercept frontmatter), a small `metadata-canvas/serialize.mjs` and `metadata-canvas/parse.mjs`, frontmatter merge helper.
- Open question: what about types? Strings work easily, dates and numbers need a node-level type hint. Start with a `type:` prefix in the node body, like `type: date 2026-04-29`, and infer when obvious.
- Why this matters for portability: the YAML stays canonical. The metadata canvas is a friendlier editing surface, but tools that only read markdown still see proper frontmatter.
