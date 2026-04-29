# Dirty Flag and Save State Bar

## Problem / Why
Right now there is no clear signal for whether the current edits are saved, queued, or failed. Users in a local-first tool need to trust the save loop the same way they trust Cmd+S in a desktop editor, and a silent autosave is not enough.

## Sketch
- Track three states per open document: `clean`, `dirty`, and `saving`. Surface them as a small footer pill, teal when clean, dim when dirty, pulsing when saving.
- Debounce autosave at 800 ms of idle, but also flush on tab blur, on route change, and on `beforeunload`. If a save fails, move to a fourth state `error` with a one-click retry.
- Expose a Cmd+S shortcut that forces an immediate save and gives a tiny success flash, so power users get the manual feel even though autosave is on.
- Persist the dirty state itself to sessionStorage so a fast reload does not clear the indicator and lose the "you still have pending writes" signal.
- Keep it framework-light: the state lives in a single store, not spread across every editor component.

## Notes
- Linear's "Synced" pill and Figma's "Saved" indicator are the precedents. We just want the local-first flavor of the same idea.
- Pairs naturally with the append-only edit journal idea, since the journal is exactly how `error` state recovers without data loss.
- Touches: save pipeline, a new `SaveStatus` component, and global keybinding registration.
