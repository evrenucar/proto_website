# Content-Hashed Asset Store with Orphan GC

## Problem / Why
Pasting the same screenshot into three boards currently writes three copies to disk, which bloats the repo and makes static hosts slow to sync. We also have no clean way to know when an image is truly unused, so old drafts leave dead files behind.

## Sketch
- On asset import, hash the bytes (SHA-256, first 16 hex chars) and store at `assets/<hash>.<ext>`. Replace any inline blob references with that path.
- Maintain a tiny `assets/index.json` that maps hash to a list of referrer files (markdown and `.canvas`). Update it on save.
- Add a `cosmoboard gc` script (or a sidebar action in dev) that scans all referrers, diffs against the index, and offers to move unreferenced assets to `assets/_trash/` with a date stamp, never hard-deleting on first pass.
- Show a small "deduped, saved N KB" toast on paste when the hash already exists. This is the kind of feedback that builds trust in the dedupe.
- Keep it filesystem-first: the index is a cache, rebuildable by rescanning, so a manual file copy still works.

## Notes
- Obsidian has the orphan attachment problem too and solves it with a community plugin. We can ship it native and lighter.
- Touch points: paste handlers in the editor, canvas image node serializer, save pipeline, plus a new `scripts/gc-assets.mjs`.
- Open question: do we hash before or after image-cropping transforms apply? Probably after, so cropped variants dedupe correctly.
