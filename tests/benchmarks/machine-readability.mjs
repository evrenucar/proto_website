// Machine-readability benchmark. Scores the repo's boards, canvases, and
// markdown against the five properties defined in
// .agents/research/machine_readability_benchmark.md. Informational: prints a
// table and a total, always exits 0. Run: node tests/benchmarks/machine-readability.mjs

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const registry = JSON.parse(await readFile(path.join(rootDir, "src", "registry.json"), "utf8"));

const results = [];
let pass = 0;
let total = 0;

function check(board, name, ok, detail = "") {
  results.push({ board, name, ok, detail });
  total += 1;
  if (ok) pass += 1;
}

function refTargets(node) {
  const refs = [];
  for (const key of ["file", "href", "boardSource"]) {
    const value = node?.[key];
    if (typeof value !== "string" || !value) continue;
    // Browser-local and external references are out of scope for disk checks.
    if (/^(?:https?:|blob:|data:|idb:|mailto:)/i.test(value)) continue;
    refs.push(value.replace(/^\/+/, ""));
  }
  return refs;
}

for (const board of registry.boards || []) {
  const slug = board.slug;
  const canvasPath = path.join(rootDir, board.sourcePath);

  // 1. Parseable
  let canvas = null;
  try {
    canvas = JSON.parse(await readFile(canvasPath, "utf8"));
    check(slug, "parseable", Array.isArray(canvas?.nodes), "nodes array");
  } catch (error) {
    check(slug, "parseable", false, String(error.message).slice(0, 60));
    continue;
  }

  // 2. Identifiable
  const nodes = canvas.nodes || [];
  const ids = nodes.map((n) => n?.id).filter(Boolean);
  check(slug, "canvasId", typeof canvas.canvasId === "string" && canvas.canvasId.length > 0);
  check(slug, "node ids unique", ids.length === nodes.length && new Set(ids).size === ids.length);
  const mdNodes = nodes.filter((n) => n?.type === "markdown");
  check(
    slug,
    "markdownId on md nodes",
    mdNodes.every((n) => typeof n.markdownId === "string" && n.markdownId),
    `${mdNodes.filter((n) => !n.markdownId).length} missing`
  );

  // 3. Addressable
  const dangling = [];
  for (const node of nodes) {
    for (const ref of refTargets(node)) {
      if (!existsSync(path.join(rootDir, ref))) dangling.push(`${node.id}:${ref}`);
    }
  }
  check(slug, "references resolve", dangling.length === 0, dangling.slice(0, 3).join(", "));

  // 4. Textual
  const textNodes = nodes.filter((n) => n?.type === "text" && !String(n.text || "").includes("<svg"));
  check(
    slug,
    "text nodes have text",
    textNodes.every((n) => String(n.text || "").trim().length > 0),
    `${textNodes.filter((n) => !String(n.text || "").trim()).length} empty`
  );
  const linkNodes = nodes.filter((n) => n?.type === "link");
  check(
    slug,
    "link nodes have titles",
    linkNodes.every((n) => String(n.title || "").trim().length > 0),
    `${linkNodes.filter((n) => !String(n.title || "").trim()).length} untitled`
  );
}

// 4b. Markdown sidecars start with a heading
for (const note of registry.notes || []) {
  try {
    const text = await readFile(path.join(rootDir, note.file), "utf8");
    const firstLine = text.split(/\r?\n/).find((l) => l.trim());
    check("notes", `heading: ${note.slug}`, /^#{1,6}\s+\S/.test(firstLine || ""), (firstLine || "").slice(0, 40));
  } catch (error) {
    check("notes", `readable: ${note.slug}`, false, String(error.message).slice(0, 60));
  }
}

// 5. Indexed: everything the registry lists exists (checked above), and every
// board directory on disk is known to the registry.
const boardsDir = path.join(rootDir, "content", "boards");
const knownCanvases = new Set((registry.boards || []).map((b) => path.normalize(path.join(rootDir, b.sourcePath))));
const orphanCanvases = [];
async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    if ((await stat(full)).isDirectory()) await walk(full);
    else if (entry === "current.canvas" && !knownCanvases.has(path.normalize(full))) {
      orphanCanvases.push(path.relative(rootDir, full));
    }
  }
}
await walk(boardsDir);
check("registry", "no unregistered canvases", orphanCanvases.length === 0, orphanCanvases.join(", "));

// ---- report ----
const width = Math.max(...results.map((r) => r.name.length)) + 2;
let currentBoard = "";
for (const r of results) {
  if (r.board !== currentBoard) {
    currentBoard = r.board;
    console.log(`\n[${currentBoard}]`);
  }
  console.log(`  ${r.ok ? "pass" : "FAIL"}  ${r.name.padEnd(width)}${r.ok ? "" : r.detail}`);
}
console.log(`\nmachine-readability score: ${pass}/${total} (${Math.round((pass / total) * 100)}%)`);
