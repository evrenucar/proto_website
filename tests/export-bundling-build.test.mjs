import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const { build } = await import(new URL(`../scripts/build-site.mjs?test=${Date.now()}`, import.meta.url));

await build();

const fullBoardFiles = [
  "braindump.html",
  "cosmoboard.html",
  path.join("content", "boards", "eurocrate-storage.html")
];

for (const relativeFile of fullBoardFiles) {
  const html = await readFile(path.join(rootDir, relativeFile), "utf8");

  assert.match(html, /id="braindump-export-modal"/, `${relativeFile} renders the bundle export modal`);
  assert.match(html, /Export Project Bundle/, `${relativeFile} labels the modal as a project bundle export`);
  assert.match(html, /JavaScript\/vendor\/fflate\.min\.js/, `${relativeFile} loads the local fflate bundler`);
  assert.match(
    html,
    /accept="\.canvas,\.canvas\.json,\.json,\.zip"/,
    `${relativeFile} allows zip imports through the file input fallback`
  );
}

console.log("export bundling build check passed");
