# Per-agent status feed

One file per agent, `<agent-id>.jsonl`, one JSON object per line, oldest first:

```
{"at":"2026-07-30T18:12:00Z","text":"Reproduced it: undo pops the strokes, not the copy."}
```

Append only. That is the whole point: several agents post status at the same time, and appending
a line to your own file cannot lose another agent's write the way a read-modify-write of one
shared `tracker-feed.json` can. The tracker merges these with `tracker-feed.json` and sorts by
time, so the strip across the top reads as one feed.

`agent` is implied by the filename, so it does not go in the line. Anything else in the object is
ignored.

Cadence while working: roughly every five minutes, plus one when you start, one when you find the
cause, and one when you finish. Say what you found, not that you are still going.

Identities, colours and goals live in [`../agents.json`](../agents.json).
