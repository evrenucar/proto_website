import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const runtimeSource = await readFile(path.join(rootDir, "JavaScript", "braindump.js"), "utf8");

assert.match(
  runtimeSource,
  /node\.type === "board-preview" && node\.boardSource/,
  "bundle export estimates and includes board-preview nodes by their boardSource field"
);
assert.match(
  runtimeSource,
  /node\.type === "markdown" && node\.file/,
  "bundle export estimates and includes markdown nodes by their file field"
);
assert.match(
  runtimeSource,
  /node\.type === "board-preview" && node\.boardSource && blobUrlMap\[node\.boardSource\]/,
  "bundle import rewrites bundled board-preview sources to blob URLs"
);
assert.match(
  runtimeSource,
  /node\.type === "markdown" && node\.file && blobUrlMap\[node\.file\]/,
  "bundle import rewrites bundled markdown files to blob URLs"
);

console.log("export bundling runtime check passed");
