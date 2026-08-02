// Shared board-data layer.
//
// Canvas, markdown and CLI are meant to be three views over one store, not three
// stores (COSMOBOARD_MIGRATION.md, stage 2). This module holds the rules that any
// writer of board data has to obey, so there is exactly one copy of each:
//
//   - where a board's .canvas lives (registry lookup, with the historical fallback)
//   - how a markdown sidecar filename is sanitized
//   - the stale-base guard that stops an old reader clobbering a newer file
//
// scripts/preview-server.mjs owned all three inline. It now imports them from
// here. The CLI imports the same functions rather than copying them: the
// sanitizer has already drifted once between the browser copy and the server
// copy, and that drift renamed files on disk out from under the board.
//
// Every function takes an explicit `root` so tests can point the whole store at
// a scratch copy of the repo instead of at content/.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class StaleBaseError extends Error {
  constructor(message, { onDisk, base }) {
    super(message);
    this.name = "StaleBaseError";
    this.stale = true;
    this.onDisk = onDisk;
    this.base = base;
  }
}

export async function readRegistry(root = repoRoot) {
  try {
    return JSON.parse(await readFile(path.join(root, "src", "registry.json"), "utf8"));
  } catch {
    return { boards: [], notes: [] };
  }
}

export async function listBoards(root = repoRoot) {
  const registry = await readRegistry(root);
  return Array.isArray(registry.boards) ? registry.boards : [];
}

export async function resolveBoardSavePath(slugValue, root = repoRoot) {
  const slug = String(slugValue || "braindump").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "braindump";
  try {
    const registry = JSON.parse(await readFile(path.join(root, "src", "registry.json"), "utf8"));
    const board = Array.isArray(registry.boards)
      ? registry.boards.find((entry) => entry.slug === slug)
      : null;
    if (board?.sourcePath) {
      return {
        slug,
        relativePath: board.sourcePath.replaceAll("\\", "/"),
        filePath: path.join(root, board.sourcePath)
      };
    }
  } catch (error) {
    // Fall back to the historical board path when the registry cannot load.
  }

  const relativePath = `content/boards/${slug}/current.canvas`;
  return {
    slug,
    relativePath,
    filePath: path.join(root, relativePath)
  };
}

export function sanitizeMarkdownFilename(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/").split("/").pop() || "note";
  const withoutExtension = raw.replace(/\.md$/i, "");
  // Same character set as the client-side sanitizer in braindump.js, so the
  // filename on disk matches the node title on the board. Underscores used to
  // be flattened here (and only here), which made `note-..._19-27-04` on the
  // board turn into `note-...-19-27-04.md` on disk.
  const safeBase = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "note";

  return `${safeBase}.md`;
}

export async function resolveMarkdownSavePath(slugValue, pathValue, filenameValue, root = repoRoot) {
  const boardTarget = await resolveBoardSavePath(slugValue, root);
  const boardDir = path.normalize(path.dirname(boardTarget.filePath));
  const requestedPath = String(pathValue || "").trim();

  if (requestedPath) {
    const normalizedRequestPath = requestedPath
      .split(/[?#]/, 1)[0]
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");

    if (normalizedRequestPath) {
      const requestedFilePath = path.normalize(path.join(root, normalizedRequestPath));
      if (
        requestedFilePath.startsWith(boardDir) &&
        path.extname(requestedFilePath).toLowerCase() === ".md"
      ) {
        const relativePath = path.relative(root, requestedFilePath).replaceAll("\\", "/");
        return {
          slug: boardTarget.slug,
          relativePath,
          filePath: requestedFilePath
        };
      }
    }
  }

  const safeFilename = sanitizeMarkdownFilename(filenameValue);
  const filePath = path.join(boardDir, safeFilename);
  return {
    slug: boardTarget.slug,
    relativePath: path.relative(root, filePath).replaceAll("\\", "/"),
    filePath
  };
}

// The stale-tab guard, in one place.
//
// Every writer carries the on-disk updatedAt it loaded against. If the file has
// moved past that timestamp, someone else saved in between and this write would
// silently drop their work. Returns a message when the write must be refused,
// null when it may proceed. A writer that supplies no base keeps the old
// behaviour, because pre-guard runtimes and scripts never sent one. Callers
// append their own advice, since a tab and a shell recover differently.
export function staleBaseConflict(onDiskUpdatedAt, base, subject = "Board") {
  if (!base) return null;
  if (typeof onDiskUpdatedAt !== "string" || !onDiskUpdatedAt) return null;
  if (onDiskUpdatedAt === base) return null;
  if (new Date(onDiskUpdatedAt).getTime() <= new Date(base).getTime()) return null;
  return `${subject} changed on disk (${onDiskUpdatedAt}) after this reader loaded it (${base}).`;
}

export async function readBoard(slugValue, root = repoRoot) {
  const target = await resolveBoardSavePath(slugValue, root);
  let board;
  try {
    board = JSON.parse(await readFile(target.filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      const err = new Error(`No board file at ${target.relativePath}`);
      err.code = "ENOENT";
      throw err;
    }
    throw new Error(`${target.relativePath} is not valid JSON: ${error.message}`);
  }
  if (!board || typeof board !== "object" || !Array.isArray(board.nodes)) {
    throw new Error(`${target.relativePath} has no nodes array`);
  }
  return { ...target, board };
}

// Writes a board back, refusing the write when the file moved past `base`.
// Mirrors what /api/save-board does with ?base=, including preserving identity
// fields and putting them first in the serialized JSON.
export async function writeBoard(slugValue, board, { root = repoRoot, base = null } = {}) {
  const target = await resolveBoardSavePath(slugValue, root);
  const safePath = path.normalize(target.filePath);
  if (!safePath.startsWith(path.normalize(root))) {
    throw new Error(`Forbidden save path: ${safePath}`);
  }

  let existing = null;
  try {
    existing = JSON.parse(await readFile(safePath, "utf8"));
  } catch {
    // No existing file, or unreadable. Nothing to conflict with.
  }

  const conflict = staleBaseConflict(existing?.updatedAt, base);
  if (conflict) {
    throw new StaleBaseError(
      `${conflict} Re-read the board and retry with the newer updatedAt.`,
      { onDisk: existing?.updatedAt || null, base }
    );
  }

  const next = { ...board };
  if (existing && typeof existing === "object") {
    if (!next.canvasId && typeof existing.canvasId === "string") next.canvasId = existing.canvasId;
    if (!next.createdAt && typeof existing.createdAt === "string") next.createdAt = existing.createdAt;
  }
  next.updatedAt = new Date().toISOString();

  const { canvasId, createdAt, updatedAt, ...rest } = next;
  const payload = { canvasId, createdAt, updatedAt, ...rest };

  await mkdir(path.dirname(safePath), { recursive: true });
  await writeFile(safePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { ...target, updatedAt };
}
