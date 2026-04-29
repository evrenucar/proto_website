# Obsidian Vault Import

## Problem / Why
Most early Cosmoboard users will already keep notes in an Obsidian vault. Letting them drop a vault folder onto the app and immediately see their markdown tree, canvases, and wikilinks working is the single strongest "this is for me" signal we can give. Filesystem hierarchy is already our source of organization, so the import is mostly a faithful copy plus a few link rewrites.

## Sketch
- Accept a folder via the File System Access API in Chromium, and a zipped vault as a fallback for other browsers and static hosts.
- Walk the tree, map `.md` to markdown nodes and `.canvas` to JSONCanvas boards, copy assets into the content-hashed asset store.
- Resolve `[[wikilinks]]` and `![[embeds]]` to filesystem paths using Obsidian's "shortest path that is unique" rule, keep the original token visible in source.
- Translate vault config we can honor (attachments folder, daily notes folder) into Cosmoboard equivalents, and log the rest into an "import report" markdown file at the root.
- Run the import without ever uploading to a server. Everything stays in the local-first store.

## Notes
- Reference: Obsidian help for vault structure and link resolution rules.
- Pairs naturally with the existing `content-hashed-asset-store` draft so embedded images dedupe on import.
- Open question: how to handle Obsidian-only plugin syntax like Dataview blocks. Render as fenced code on first pass, revisit later.
