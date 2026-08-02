#!/usr/bin/env node
// cosmo — a CLI over the same board data the canvas and the markdown sidecars use.
//
// Boards are plain .canvas JSON plus markdown files on disk, so this reads and
// writes files the repo already owns. There is no new data model and no server:
// `npm run preview` does not have to be running for any command here.
//
// Everything that could drift from the browser or the preview server is imported
// from scripts/lib/board-store.mjs instead of reimplemented. That includes the
// markdown filename sanitizer and the stale-base guard.
//
// Usage:
//   node scripts/cosmo.mjs boards [--json]
//   node scripts/cosmo.mjs nodes <board|file.canvas> [--type markdown] [--json]
//   node scripts/cosmo.mjs grep <pattern> [--board slug|file.canvas] [--json]
//   node scripts/cosmo.mjs add-note <board> [--title t] [--content c] [--content-file f]
//                                          [--x n] [--y n] [--base <iso>] [--json]
//   node scripts/cosmo.mjs export <board> [--out file.canvas] [--force] [--json]
//
// Global: --root <dir> runs every command against another checkout or a copy.
//
// Exit codes: 0 ok, 1 usage or unexpected error, 2 not found, 3 stale-base refusal.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

import {
  StaleBaseError,
  listBoards,
  readBoard,
  repoRoot,
  resolveBoardSavePath,
  resolveMarkdownSavePath,
  writeBoard
} from "./lib/board-store.mjs";

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_NOT_FOUND = 2;
const EXIT_STALE = 3;

const USAGE = `cosmo — read and write Cosmoboard boards from the shell

  boards                                  list every board in src/registry.json
  nodes <board|file.canvas>               list the nodes on a board
  grep <pattern> [--board <b>]            find nodes whose text matches a regex
  add-note <board>                        add a markdown note and its sidecar
  export <board>                          write a self-contained .canvas copy

Flags
  --json              machine-readable output (every read command)
  --root <dir>        run against another checkout or a copy of it
  --type <t>          nodes: filter by node type
  --board <b>         grep: one board instead of all of them
  --title <t>         add-note: note title, default note-<timestamp>
  --content <text>    add-note: note body
  --content-file <f>  add-note: read the body from a file
  --x <n> --y <n>     add-note: canvas position, default right of the last node
  --base <iso>        add-note: the updatedAt you read; refuses if disk moved past it
  --out <file>        export: destination, default <slug>_<timestamp>.canvas
  --force             overwrite an existing file`;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const eq = name.indexOf("=");
    if (eq !== -1) {
      flags[name.slice(0, eq)] = name.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i += 1;
    }
  }
  return { flags, positional };
}

function fail(message, code = EXIT_USAGE) {
  process.stderr.write(`cosmo: ${message}\n`);
  process.exit(code);
}

function out(text) {
  process.stdout.write(`${text}\n`);
}

function json(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

// Same shape as braindump.js's uuid(), so ids written here look like ids written
// by the board rather than announcing which tool made them.
function uuid() {
  return Math.random().toString(36).substring(2, 18);
}

// Matches formatTimestamp() in braindump.js: local time, 2026-08-01_09-15-30.
// It cannot be imported — braindump.js is a browser script, not a module — so
// this is the one duplicated helper, and it only decides a default title.
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function looksLikeFile(value) {
  return /\.(canvas|json)$/i.test(String(value || ""));
}

// A board argument is either a registry slug or a path to a .canvas file, so an
// exported board can be inspected with the same commands as a live one.
async function loadTarget(value, root) {
  if (looksLikeFile(value)) {
    const filePath = path.resolve(value);
    let board;
    try {
      board = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") fail(`no such file: ${value}`, EXIT_NOT_FOUND);
      fail(`${value} is not valid JSON: ${error.message}`);
    }
    if (!Array.isArray(board?.nodes)) fail(`${value} has no nodes array`);
    return { slug: null, filePath, relativePath: value, board };
  }
  try {
    return await readBoard(value, root);
  } catch (error) {
    if (error.code === "ENOENT") fail(error.message, EXIT_NOT_FOUND);
    fail(error.message);
  }
}

// The fields worth searching and worth showing. Node types differ a lot, so a
// single "text" column would be empty for links, files and markdown notes.
const TEXT_FIELDS = ["title", "text", "url", "file", "source", "description", "_rawMarkdown"];

function nodeLabel(node) {
  for (const field of ["title", "text", "url", "file", "source"]) {
    const value = node[field];
    if (typeof value === "string" && value.trim()) {
      return value.replace(/\s+/g, " ").slice(0, 70);
    }
  }
  return "";
}

async function cmdBoards(flags, root) {
  const boards = await listBoards(root);
  const rows = [];
  for (const board of boards) {
    const target = await resolveBoardSavePath(board.slug, root);
    let nodes = null;
    let updatedAt = null;
    try {
      const parsed = JSON.parse(await readFile(target.filePath, "utf8"));
      nodes = Array.isArray(parsed.nodes) ? parsed.nodes.length : null;
      updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    } catch {
      // A registry entry whose file is missing still deserves a row.
    }
    rows.push({
      slug: board.slug,
      title: board.title || board.slug,
      path: target.relativePath,
      nodes,
      updatedAt,
      tags: board.tags || []
    });
  }

  if (flags.json) return json({ boards: rows });
  if (!rows.length) return out("No boards in src/registry.json.");
  const width = Math.max(...rows.map((r) => r.slug.length));
  for (const row of rows) {
    const count = row.nodes === null ? "missing" : `${row.nodes} nodes`;
    out(`${row.slug.padEnd(width)}  ${String(count).padStart(10)}  ${row.title}`);
  }
}

async function cmdNodes(flags, positional, root) {
  const which = positional[0];
  if (!which) fail("nodes needs a board slug or a .canvas file");
  const target = await loadTarget(which, root);
  const type = typeof flags.type === "string" ? flags.type : null;
  const nodes = target.board.nodes.filter((node) => !type || node.type === type);

  if (flags.json) {
    return json({
      board: target.slug,
      path: target.relativePath,
      canvasId: target.board.canvasId || null,
      updatedAt: target.board.updatedAt || null,
      count: nodes.length,
      nodes
    });
  }
  if (!nodes.length) return out("No nodes.");
  const idWidth = Math.max(...nodes.map((n) => String(n.id).length));
  const typeWidth = Math.max(...nodes.map((n) => String(n.type || "?").length));
  for (const node of nodes) {
    out(`${String(node.id).padEnd(idWidth)}  ${String(node.type || "?").padEnd(typeWidth)}  ${nodeLabel(node)}`);
  }
}

async function cmdGrep(flags, positional, root) {
  const pattern = positional[0];
  if (!pattern) fail("grep needs a pattern");
  let regex;
  try {
    regex = new RegExp(pattern, flags["case-sensitive"] ? "" : "i");
  } catch (error) {
    fail(`bad pattern: ${error.message}`);
  }

  const targets = [];
  if (typeof flags.board === "string") {
    targets.push(await loadTarget(flags.board, root));
  } else {
    for (const board of await listBoards(root)) {
      try {
        targets.push(await readBoard(board.slug, root));
      } catch {
        // Skip boards whose file is missing rather than failing the whole search.
      }
    }
  }

  const matches = [];
  for (const target of targets) {
    for (const node of target.board.nodes) {
      for (const field of TEXT_FIELDS) {
        const value = node[field];
        if (typeof value !== "string" || !regex.test(value)) continue;
        const at = value.search(regex);
        matches.push({
          board: target.slug,
          path: target.relativePath,
          id: node.id,
          type: node.type,
          field,
          match: value.slice(Math.max(0, at - 30), at + 90).replace(/\s+/g, " ").trim()
        });
        break;
      }
    }
  }

  if (flags.json) return json({ pattern, count: matches.length, matches });
  if (!matches.length) {
    out("No matches.");
    return;
  }
  for (const hit of matches) {
    out(`${hit.board || hit.path}  ${hit.id}  ${hit.type}  ${hit.field}: ${hit.match}`);
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cmdAddNote(flags, positional, root) {
  const slug = positional[0];
  if (!slug) fail("add-note needs a board slug");

  let loaded;
  try {
    loaded = await readBoard(slug, root);
  } catch (error) {
    if (error.code === "ENOENT") fail(error.message, EXIT_NOT_FOUND);
    fail(error.message);
  }
  const { board } = loaded;

  // Default to the updatedAt just read, so a plain add-note is still guarded
  // against another writer landing between this read and this write. An agent
  // that read the board earlier passes the timestamp it saw with --base.
  const base = typeof flags.base === "string" ? flags.base : board.updatedAt || null;

  const title = typeof flags.title === "string" && flags.title.trim()
    ? flags.title.trim()
    : `note-${formatTimestamp()}`;

  let content = typeof flags.content === "string" ? flags.content : "";
  if (typeof flags["content-file"] === "string") {
    try {
      content = await readFile(path.resolve(flags["content-file"]), "utf8");
    } catch (error) {
      fail(`cannot read --content-file: ${error.message}`, EXIT_NOT_FOUND);
    }
  }
  content = content.replace(/\r\n?/g, "\n");

  // The filename comes from the shared sanitizer, which is the same code the
  // preview server runs on /api/save-markdown. That is the whole point: a note
  // added here and a note added in the browser land on the same path.
  const sidecar = await resolveMarkdownSavePath(slug, "", `${title}.md`, root);
  if (await exists(sidecar.filePath) && !flags.force) {
    fail(`${sidecar.relativePath} already exists. Pass --force to overwrite.`);
  }

  // Right of the rightmost node, aligned with the topmost one, so a new note
  // never lands on top of existing work.
  const right = board.nodes.reduce((max, n) => Math.max(max, (Number(n.x) || 0) + (Number(n.width) || 0)), 0);
  const top = board.nodes.length
    ? Math.min(...board.nodes.map((n) => Number(n.y) || 0))
    : 0;
  const x = flags.x !== undefined ? Number(flags.x) : right + 80;
  const y = flags.y !== undefined ? Number(flags.y) : top;
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail("--x and --y must be numbers");

  // Field-for-field what createNewMarkdownNote builds in braindump.js: the
  // sidecar path in both file and href, the body inlined in _rawMarkdown, and a
  // markdown identity so a downloaded copy can find its way back to this node.
  const node = {
    id: uuid(),
    x,
    y,
    width: 380,
    height: 420,
    type: "markdown",
    file: `/${sidecar.relativePath}`,
    href: `/${sidecar.relativePath}`,
    title,
    _rawMarkdown: content,
    markdownId: `cosmo-note-${uuid()}`,
    markdownUpdatedAt: new Date().toISOString()
  };

  board.nodes.push(node);

  let saved;
  try {
    saved = await writeBoard(slug, board, { root, base });
  } catch (error) {
    if (error instanceof StaleBaseError) fail(error.message, EXIT_STALE);
    fail(error.message);
  }

  // Sidecar after the canvas, matching the server's order, and only once the
  // canvas write survived the stale check. A refused write leaves no orphan file.
  await mkdir(path.dirname(sidecar.filePath), { recursive: true });
  await writeFile(
    sidecar.filePath,
    content.endsWith("\n") || content === "" ? content : `${content}\n`,
    "utf8"
  );

  const result = {
    board: slug,
    nodeId: node.id,
    title,
    canvas: saved.relativePath,
    markdown: sidecar.relativePath,
    updatedAt: saved.updatedAt,
    nodes: board.nodes.length
  };
  if (flags.json) return json(result);
  out(`Added ${title} to ${slug}`);
  out(`  node     ${node.id}`);
  out(`  canvas   ${saved.relativePath} (${board.nodes.length} nodes)`);
  out(`  markdown ${sidecar.relativePath}`);
}

async function cmdExport(flags, positional, root) {
  const slug = positional[0];
  if (!slug) fail("export needs a board slug");

  let loaded;
  try {
    loaded = await readBoard(slug, root);
  } catch (error) {
    if (error.code === "ENOENT") fail(error.message, EXIT_NOT_FOUND);
    fail(error.message);
  }
  const { board } = loaded;

  // Inline every local markdown sidecar so the exported file stands on its own.
  // The board already treats _rawMarkdown as the canonical portable store, so an
  // export that carries it re-imports with its notes intact and no missing files.
  const boardDir = path.dirname(loaded.filePath);
  let inlined = 0;
  for (const node of board.nodes) {
    if (node?.type !== "markdown" || typeof node.file !== "string") continue;
    if (/^(?:blob:|data:|https?:|file:)/i.test(node.file)) continue;
    const filePath = node.file.startsWith("/")
      ? path.join(root, node.file.replace(/^\/+/, ""))
      : path.join(boardDir, node.file);
    try {
      node._rawMarkdown = (await readFile(filePath, "utf8")).replace(/\r\n?/g, "\n");
      inlined += 1;
    } catch {
      // Keep whatever _rawMarkdown the canvas already holds. A missing sidecar
      // is not a reason to refuse the export.
    }
  }

  const outPath = path.resolve(
    typeof flags.out === "string" ? flags.out : `${slug}_${formatTimestamp()}.canvas`
  );
  if (await exists(outPath) && !flags.force) {
    fail(`${outPath} already exists. Pass --force to overwrite.`);
  }

  const { canvasId, createdAt, updatedAt, ...rest } = board;
  const payload = { canvasId, createdAt, updatedAt, ...rest };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const result = {
    board: slug,
    out: outPath,
    nodes: board.nodes.length,
    markdownInlined: inlined,
    bytes: Buffer.byteLength(JSON.stringify(payload, null, 2)) + 1
  };
  if (flags.json) return json(result);
  out(`Exported ${slug} to ${outPath}`);
  out(`  ${board.nodes.length} nodes, ${inlined} markdown sidecars inlined`);
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional.shift();
  const root = typeof flags.root === "string" ? path.resolve(flags.root) : repoRoot;

  const wantsHelp = flags.help || command === "help";
  if (!command || wantsHelp) {
    // Asking for help is a success. Being given nothing is a usage error, so a
    // script that calls cosmo with an empty argument still fails loudly.
    if (wantsHelp) {
      out(USAGE);
      process.exit(EXIT_OK);
    }
    process.stderr.write(`${USAGE}\n`);
    process.exit(EXIT_USAGE);
  }

  switch (command) {
    case "boards": return cmdBoards(flags, root);
    case "nodes": return cmdNodes(flags, positional, root);
    case "grep": return cmdGrep(flags, positional, root);
    case "add-note": return cmdAddNote(flags, positional, root);
    case "export": return cmdExport(flags, positional, root);
    default: fail(`unknown command "${command}". Run cosmo --help.`);
  }
}

main().catch((error) => {
  process.stderr.write(`cosmo: ${error?.stack || error}\n`);
  process.exit(EXIT_USAGE);
});
