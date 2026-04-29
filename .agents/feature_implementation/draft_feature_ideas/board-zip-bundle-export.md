# Board ZIP Bundle Export

## Problem / Why
A board is rarely just one `.canvas` file. It pulls in markdown nodes, images, nested boards, and sometimes fonts. To send a board to a collaborator or archive it, the user needs one self-contained file that opens cleanly somewhere else. A ZIP with a predictable layout solves this without any server round-trip.

## Sketch
- "Export board as bundle" produces a ZIP with `board.canvas` at the root, a `notes/` folder for referenced markdown, an `assets/` folder for hashed media, and a `manifest.json` describing nested boards and the spec versions used.
- Walk the board's reference graph from the root canvas, only include files actually used, and rewrite paths to be bundle-relative.
- Include a small `README.md` inside the ZIP that explains the layout and links to the JSONCanvas spec, so a recipient who never opens Cosmoboard can still read everything.
- Round-trip: dropping the ZIP back onto Cosmoboard reconstructs the same folder layout into a chosen target directory.
- Use a streaming ZIP writer so very large bundles do not blow the tab's memory.

## Notes
- A natural building block for the "public read-only link" feature and for any future PDF or static export.
- Touch points: canvas reference walker, asset store, ZIP writer (look at `client-zip` or `fflate`).
- Open question: how to represent transcluded canvas nodes from outside the bundle. Two options, fail the export with a warning, or inline a frozen snapshot.
