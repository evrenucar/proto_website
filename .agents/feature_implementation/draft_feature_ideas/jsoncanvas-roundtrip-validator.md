# JSONCanvas Round-Trip Validator

## Problem / Why
Cosmoboard claims `.canvas` parity with the JSONCanvas spec, but right now there is no automated proof. A small validator that opens any conformant JSONCanvas file, renders it, re-serializes it, and confirms a byte-stable round-trip is the cheapest way to keep Obsidian compatibility honest as the editor evolves.

## Sketch
- Pull the JSONCanvas spec node and edge schemas into a single typed module that both the loader and the saver consume.
- Add a "Validate canvas" action in the dev sidebar that runs schema check, then load, then re-save, and diffs the JSON.
- Surface unknown fields as a passthrough bag on each node so foreign tools' extra keys survive the round-trip instead of getting dropped.
- Ship a small fixture set of real JSONCanvas files (Obsidian export, hand-written, edge cases) and run the round-trip in a test on every commit.
- Show a green or red badge inline in the board header when a file deviates from spec, with a one-click "Show diff" panel.

## Notes
- Reference: https://jsoncanvas.org and the Obsidian Canvas docs.
- Touch points: canvas loader, canvas serializer, any node-type registry.
- Open question: do we hash the original bytes and warn on save if a foreign field would be lost, or always preserve via passthrough.
