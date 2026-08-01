import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("JavaScript/braindump.js", "utf8");
const html = await readFile("cosmoboard.html", "utf8");

// This assertion used to read `...!e\.shiftKey\)[\s\S]*saveBoard\(\)`. The
// `[\s\S]*` is greedy and unbounded, so it matched a `saveBoard()` roughly 800
// lines further down the file and passed no matter what Ctrl+S actually did.
// It sat green through the entire period when Ctrl+S opened a Save-As dialog
// and saved nothing. Bounded to the remainder of that one statement now, so it
// can only match a saveBoard() call inside the Ctrl+S branch itself.
assert.match(
  source,
  /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "s" && !e\.shiftKey && !e\.altKey\) \{[^}]*saveBoard\(\)/,
  "Ctrl/Cmd+S should use the same board save path as the toolbar save button"
);

// The other two arms of the same chord, so a future edit cannot quietly drop
// either. Ctrl+Alt+S is the only remaining caller of saveLocalFile().
assert.match(
  source,
  /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "s" && e\.altKey && !e\.shiftKey\) \{[^}]*saveLocalFile\(\)/,
  "Ctrl+Alt+S should write back to the file opened with Ctrl+O"
);
assert.match(
  source,
  /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "s" && e\.shiftKey\) \{[^}]*saveLocalFileAs\(\)/,
  "Ctrl+Shift+S should open the Save-As picker"
);

assert.match(
  html,
  /id="braindump-export-canvas"/,
  "export modal should offer a single .canvas export action"
);

assert.match(
  source,
  /exportModalCanvasBtn[\s\S]*exportCanvas\(\)/,
  "single canvas export action should call exportCanvas() instead of the bundle exporter"
);

assert.match(
  source,
  /resolveBoardReferenceFromUrl/,
  "pasted board page URLs should be resolved into board-preview nodes"
);

assert.match(
  source,
  /fetchResourceSizeBytes/,
  "export size estimates should fetch linked resources when HEAD does not expose content-length"
);

// Strip the transient fields AND deep clone. Stripping alone returns the live
// node when there is nothing to remove, which is how a "copy" could still write
// through to board state.
assert.match(
  source,
  /nodes:\s*nodes\.map\(\(node\) => JSON\.parse\(JSON\.stringify\(stripTransientNodeFields\(node\)\)\)\)/,
  "serializing/exporting should deep clone node data so bundle export cannot rewrite the live board state"
);

console.log("board save/export runtime check passed");
