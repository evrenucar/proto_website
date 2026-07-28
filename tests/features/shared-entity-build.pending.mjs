// PENDING: not part of the suite (.pending.mjs is outside the *.test.mjs glob).
//
// This asserts on an `entity` node in content/boards/cosmoboard/current.canvas.
// That node has never existed, in any commit. The shared-entity model was marked
// done with a proof block claiming otherwise, but only the build-side half landed:
// src/entities/, content/entities/index.json and the base-data entityRef all exist,
// the canvas node does not.
//
// Tracked as open work in .agents/todo.md. Rename back to *.test.mjs once the node
// is actually on the board.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

const { build } = await import(new URL(`../../scripts/build-site.mjs?test=${Date.now()}`, import.meta.url));

await build();

const registry = JSON.parse(await readFile(path.join(rootDir, "src", "registry.json"), "utf8"));
const entityRegistryEntry = registry.entities?.find((entry) => entry.slug === "eurocrate-storage-system");
assert.equal(entityRegistryEntry?.sourcePath, "src/entities/eurocrate-storage-system.json");
assert.equal(entityRegistryEntry?.projectSlug, "eurocrate-storage-universal-solution");

const entityIndex = JSON.parse(await readFile(path.join(rootDir, "content", "entities", "index.json"), "utf8"));
const entityRecord = entityIndex.entities?.find((entry) => entry.slug === "eurocrate-storage-system");
assert.equal(entityRecord?.title, "Eurocrate storage system");
assert.equal(entityRecord?.type, "project");
assert.equal(
  entityRecord?.references?.some((reference) => reference.surface === "board" && reference.slug === "eurocrate-storage"),
  true
);

const baseItems = JSON.parse(await readFile(path.join(rootDir, "content", "base-data", "items.json"), "utf8"));
const eurocrateItem = baseItems.find((item) => item.slug === "eurocrate-storage-universal-solution");
assert.equal(eurocrateItem?.entityRef, "eurocrate-storage-system");
assert.equal(eurocrateItem?.entityTitle, "Eurocrate storage system");

const cosmoboard = JSON.parse(await readFile(path.join(rootDir, "content", "boards", "cosmoboard", "current.canvas"), "utf8"));
const entityNode = cosmoboard.nodes?.find((node) => node.type === "entity" && node.entityRef === "eurocrate-storage-system");
assert.equal(entityNode?.source, "content/entities/index.json");
assert.equal(entityNode?.title, "Eurocrate storage system");

console.log("shared entity build check passed");
