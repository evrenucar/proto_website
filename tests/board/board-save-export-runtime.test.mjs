import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("JavaScript/braindump.js", "utf8");
const html = await readFile("cosmoboard.html", "utf8");

assert.match(
  source,
  /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "s" && !e\.shiftKey\)[\s\S]*saveBoard\(\)/,
  "Ctrl/Cmd+S should use the same board save path as the toolbar save button"
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
