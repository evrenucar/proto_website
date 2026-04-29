# Append-Only Edit Journal for Crash Recovery

## Problem / Why
A browser tab crash or a power loss between autosaves can lose a few minutes of edits, and right now there is no way to recover anything that did not make it to the saved file. We want crash recovery without giving up the static-host story or moving to a database.

## Sketch
- For each open document, append every coalesced edit op to a small journal in IndexedDB keyed by file path and a session UUID. Keep the journal capped (for example 2 MB rolling window).
- On document open, check for a journal whose tail is newer than the file's `mtime`. If found, show a quiet teal banner: "Unsaved edits from a previous session. Restore or discard."
- On a clean save, truncate the journal for that file. On clean tab close, mark the session as ended so the banner does not fire next time.
- Journal entries are op-based, not full snapshots, so the cost per keystroke is bytes, not kilobytes.
- This stays local-first and static-host friendly because nothing leaves the browser. The journal is purely client-side recovery state.

## Notes
- Linear and Things use a similar local op log. tldraw's `store` already does session persistence to IndexedDB and is a good reference.
- Watch out for two tabs editing the same file. Tag entries with session UUID and warn on conflict rather than silently merging.
- Touches: editor change pipeline, save handler, a new `journal.ts` module, and a small recovery banner component.
