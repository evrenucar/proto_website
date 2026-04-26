# Cross-Domain Inbox

## Purpose
Short shared notes and pointers that do not belong in a single domain doc.

## Read when
Looking for unresolved cross-cutting notes or quick pointers between domains.

## Skip when
Working on a specific domain (use the domain task file instead).

## Canonical for
Cross-domain notes, unresolved quick items, temporary pointers.

---

- Chrome can keep stale local board state or a cached board runtime. If Cosmoboard looks broken only in Chrome, clear site data for `127.0.0.1:4173` or hard reload.
- Do not remove legacy field tolerance for `markdown.source` and `board-preview.file` yet. Imported bundles and old localStorage states may still contain them.
- Generated pages are build outputs. After changing build scripts, board data, or route behavior, run `npm run build`.
