# Realtime collaboration: feasibility against the current architecture

Written 2026-07-30 for the "Realtime collaboration across boards, markdown, and structured data,
if the architecture supports it cleanly" card. Assessment, not a commitment.

## The honest verdict

The architecture does not support it cleanly today. The blocker is not networking, it is the
write model: every save is a whole-state overwrite. `POST /api/save-board` writes the full
canvas, `todo.md` updates rewrite the whole file, and two writers doing read-modify-write on the
same file lose whichever landed first. This session already produced a live example: user and
agent priorities crossing on the tracker within seconds of each other.

## What exists that helps

- The `todo-update` endpoint pattern: line-addressed writes with an `expect` guard that refuses a
  write when the target drifted. This is an operation-level write with optimistic concurrency, in
  miniature, already proven on the tracker.
- The tracker's poll-and-render loop with focus-safe re-render: a working "see someone else's
  change within seconds" surface, no sockets needed.
- File-first state with stable identity: `canvasId`, `markdownId`, node ids. Operations can
  address entities without inventing an identity layer.

## The staged path, cheapest first

1. **Operation-level canvas writes.** Generalize the todo-update pattern to the board: node-level
   ops (add, move, resize, edit, delete) with a base-version guard, applied server-side to the
   canvas file. Kills last-write-wins clobbers even for a single user with two tabs, which is a
   standing bug class today. Valuable standalone; prerequisite for everything below.
2. **Presence and refresh.** A heartbeat file per board (who, when, viewport) plus the tracker's
   poll pattern on the canvas: other sessions' changes appear within seconds, other people appear
   as cursors or name chips. No CRDT, no sockets; the preview server serializes writes naturally
   because it is one process.
3. **Live co-editing.** Only after 1 and 2 prove out. Two credible designs: (a) server-serialized
   ops fanned out over SSE/WebSocket, files stay canonical, offline means read-only; or (b) CRDT
   (Yjs or similar) with the `.canvas` as snapshot, buying offline merge at the cost of a second
   source of truth and a deep runtime dependency. Recommendation when the time comes: (a) first;
   it fits the file-first model and the ladder in `agents.md`, where live co-editing is the last
   rung, after seeing, running, and editing on the site.

## What not to do

Do not bolt a sync library onto the current whole-state save; every concurrent edit becomes a
coin flip. Do not start with markdown co-editing; per-line ops inside contenteditable are the
hardest variant of the problem, and the board ops in stage 1 deliver most of the value.
