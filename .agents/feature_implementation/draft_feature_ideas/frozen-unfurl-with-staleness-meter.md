# Frozen Unfurl With Staleness Meter

## Problem / Why
Link unfurls in tools like Notion silently rot. The page changes, the unfurl stays cached, and you cannot tell from a glance whether what you remember is what is still there. Cosmoboard is local-first and static-host friendly, so unfurls have to be a captured artifact, not a live API call, which makes staleness even more invisible.

## Sketch
- On paste, capture an unfurl bundle to disk: title, description, og:image as a local file, source HTML hash, fetch timestamp. Store under a sibling `.unfurls/` folder so the markdown stays portable.
- Render the unfurl card with a small staleness meter in the corner. Green when under a user-set threshold, amber after that, red after a longer one. Threshold lives in frontmatter or per-vault config.
- Click the meter to refetch on demand. If the new hash differs, show a tiny "changed" badge and let the user diff old vs new title and description before accepting.
- When offline, cards still render fully from the cached bundle. The meter shows an offline glyph instead of green or red.
- Right-click a card to convert it into a click-to-activate live iframe for the cases where you actually want the page itself.

## Notes
- Precedents: oEmbed shape for the metadata, Are.na blocks for the captured-artifact mental model, Obsidian community plugins like "Auto Link Title" for the fetch-on-paste trigger.
- Touches markdown render pipeline and whatever paste handler exists today. The bundle format should be plain JSON plus images so it survives a static export.
- Open question: do we let users pin a card to "never refetch" for archival reasons, or is the staleness signal always live?
