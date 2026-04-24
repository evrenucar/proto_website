import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const { build } = await import(new URL(`../scripts/build-site.mjs?test=${Date.now()}`, import.meta.url));
const { boardPages } = await import(new URL(`../src/site-data.mjs?test=${Date.now()}`, import.meta.url));

assert.ok(Array.isArray(boardPages));
assert.equal(boardPages.length >= 2, true);
assert.deepEqual(
  boardPages.map((page) => page.file),
  ["braindump.html", "cosmoboard.html", "content/boards/eurocrate-storage.html"]
);
assert.deepEqual(
  boardPages.map((page) => page.board.slug),
  ["braindump", "cosmoboard", "eurocrate-storage"]
);
assert.equal(boardPages.every((page) => !("pagePath" in page.board)), true);

await build();

const cosmoboardPath = path.join(rootDir, "cosmoboard.html");
await access(cosmoboardPath);
const homePath = path.join(rootDir, "index.html");
await access(homePath);

const html = await readFile(cosmoboardPath, "utf8");
const homeHtml = await readFile(homePath, "utf8");
assert.match(html, /aria-current="page">Cosmoboard<\/a>/);
assert.match(html, /class="sidenav"/);
assert.match(html, /data-board-app="true"/);
assert.match(html, /data-board-slug="cosmoboard"/);
assert.match(html, /data-board-role="canvas"/);
assert.match(html, /content\/boards\/cosmoboard\/current\.canvas/);
assert.match(html, /data-board-source-version="[a-f0-9]{12}"/);
assert.doesNotMatch(html, /board-page-panel/);

const cosmoboardCanvasPath = path.join(rootDir, "content", "boards", "cosmoboard", "current.canvas");
const cosmoboardCanvas = JSON.parse(await readFile(cosmoboardCanvasPath, "utf8"));
const textContent = cosmoboardCanvas.nodes
  .filter((node) => node.type === "text")
  .map((node) => node.text || "")
  .join("\n");
const linkTargets = cosmoboardCanvas.nodes
  .filter((node) => node.type === "link")
  .map((node) => node.url || "");
const boardPreviewNodes = cosmoboardCanvas.nodes.filter((node) => node.type === "board-preview");

assert.match(textContent, /A first onboarding board inside the current site/i);
assert.match(textContent, /Boards stay spatial, markdown stays durable/i);
assert.match(textContent, /Preview-first embeds, multiple boards per page/i);
assert.equal(boardPreviewNodes.length >= 1, true);
assert.equal(boardPreviewNodes.some((node) => node.boardSlug === "braindump"), true);
assert.equal(boardPreviewNodes.some((node) => node.boardSource === "content/boards/braindump/current.canvas"), true);
assert.equal(boardPreviewNodes.some((node) => node.boardHref === "braindump.html"), true);
assert.equal(linkTargets.includes("content/boards/cosmoboard/current.canvas"), true);
assert.equal(linkTargets.includes("https://github.com/evrenucar/proto_website"), true);
assert.equal(homeHtml.match(/data-board-mode="preview"/g)?.length, 2);
assert.equal(homeHtml.match(/CSS\/braindump\.css\?v=26/g)?.length, 1);
assert.equal(homeHtml.match(/JavaScript\/braindump\.js\?v=48/g)?.length, 1);
assert.equal(homeHtml.match(/data-board-source-version="[a-f0-9]{12}"/g)?.length >= 2, true);
assert.match(homeHtml, /data-board-slug="braindump"/);
assert.match(homeHtml, /data-board-full-href="braindump\.html"/);
assert.match(homeHtml, /Open the full Braindump/i);
assert.match(homeHtml, /data-board-slug="cosmoboard"/);
assert.match(homeHtml, /data-board-full-href="cosmoboard\.html"/);
assert.match(homeHtml, /Open the full Cosmoboard/i);

const braindumpHtml = await readFile(path.join(rootDir, "braindump.html"), "utf8");
const eurocrateHtml = await readFile(path.join(rootDir, "content", "boards", "eurocrate-storage.html"), "utf8");
assert.match(braindumpHtml, /data-board-app="true"/);
assert.match(braindumpHtml, /data-board-role="canvas"/);
assert.match(html, /data-board-ui="toolbar-shell"/);
assert.match(html, /data-board-ui="toolbar"/);
assert.match(braindumpHtml, /data-board-ui="toolbar-shell"/);
assert.match(braindumpHtml, /data-board-ui="toolbar"/);
assert.match(eurocrateHtml, /data-board-slug="eurocrate-storage"/);
assert.match(eurocrateHtml, /data-board-ui="toolbar-shell"/);
assert.match(eurocrateHtml, /id="braindump-export-modal"/);

const runtimeSource = await readFile(path.join(rootDir, "JavaScript", "braindump.js"), "utf8");
assert.match(runtimeSource, /data-board-ui="toolbar-shell"/);
assert.match(runtimeSource, /data-board-ui="toolbar"/);
assert.match(runtimeSource, /type === "board-preview"/);
assert.match(runtimeSource, /Board not available/);
assert.match(runtimeSource, /Older local draft was archived/);

const sitemap = await readFile(path.join(rootDir, "sitemap.xml"), "utf8");
assert.match(sitemap, /https:\/\/evrenucar\.com\/cosmoboard\.html/);

console.log("cosmoboard build check passed");
