import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractCanvasAssets } from "../scripts/extract-assets.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const testRoot = path.join(rootDir, ".tmp", "extract-assets-test");
const canvasPath = path.join(testRoot, "sample.canvas.json");
const assetsDir = path.join(testRoot, "content", "assets", "images");

await rm(testRoot, { recursive: true, force: true });
await mkdir(testRoot, { recursive: true });

await writeFile(
  canvasPath,
  JSON.stringify(
    {
      nodes: [
        {
          id: "node-1",
          type: "file",
          file: `data:image/png;base64,${Buffer.from("fake-png").toString("base64")}`
        },
        {
          id: "node-2",
          type: "link",
          image: `data:image/jpeg;base64,${Buffer.from("fake-jpg").toString("base64")}`
        },
        {
          id: "node-3",
          type: "file",
          file: "content/assets/images/existing.png"
        }
      ],
      edges: [],
      viewport: { x: 0, y: 0, z: 1 }
    },
    null,
    2
  ),
  "utf8"
);

const result = await extractCanvasAssets({
  canvasPath,
  assetsDir,
  assetPathPrefix: "content/assets/images"
});

assert.equal(result.extracted, 2);
assert.deepEqual(result.assets.map((asset) => asset.path).sort(), [
  "content/assets/images/sample-node-1-file.png",
  "content/assets/images/sample-node-2-image.jpg"
]);

const updatedCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
assert.equal(updatedCanvas.nodes[0].file, "content/assets/images/sample-node-1-file.png");
assert.equal(updatedCanvas.nodes[1].image, "content/assets/images/sample-node-2-image.jpg");
assert.equal(updatedCanvas.nodes[2].file, "content/assets/images/existing.png");

assert.equal(await readFile(path.join(assetsDir, "sample-node-1-file.png"), "utf8"), "fake-png");
assert.equal(await readFile(path.join(assetsDir, "sample-node-2-image.jpg"), "utf8"), "fake-jpg");

console.log("extract assets check passed");
