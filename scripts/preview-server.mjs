import http from "node:http";
import https from "node:https";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Board path resolution, the markdown filename sanitizer and the stale-base
// guard live in one module, shared with scripts/cosmo.mjs. The sanitizer had
// already drifted once between the browser and this file; a third copy in the
// CLI would drift again.
import {
  resolveBoardSavePath,
  resolveMarkdownSavePath,
  staleBaseConflict
} from "./lib/board-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
// 4174, not 4173: the aide-board project owns 4173 on this machine.
const port = Number(process.env.PORT || 4174);

// Same character set as sanitizeCanvasFilename in JavaScript/braindump.js. The
// markdown pair drifted once, when underscores were flattened here and only
// here, which turned a note the board called `note-..._19-27-04` into
// `note-...-19-27-04.md` on disk. These two must stay identical.
function sanitizeCanvasFilename(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/").split("/").pop() || "canvas";
  const safeBase = raw
    .replace(/\.canvas$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "canvas";

  return `${safeBase}.canvas`;
}

// A sub-canvas is a sidecar .canvas file beside a board's own current.canvas,
// the same arrangement markdown notes already use. Resolves the write target
// for one, or null when the request is not addressing a legitimate sidecar.
// The board's own file is deliberately not reachable this way: /api/save-board
// with neither parameter is the only route to it.
function resolveCanvasSidecarTarget(boardTarget, pathValue, filenameValue) {
  const boardDir = path.normalize(path.dirname(boardTarget.filePath));
  const requestedPath = String(pathValue || "").trim();
  let filePath = "";

  if (requestedPath) {
    const normalized = requestedPath
      .split(/[?#]/, 1)[0]
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");
    if (normalized) filePath = path.normalize(path.join(rootDir, normalized));
  } else if (filenameValue) {
    // ?filename= means "make me a new one", so it must never land on a file that
    // already exists. The client names these from a second-resolution timestamp,
    // so two canvases created in the same second collided and the second silently
    // overwrote the first, leaving the first node pointing at a canvasId that was
    // no longer in the file. ?path= above is the opposite case, addressing a
    // sidecar that already exists, and must not be uniquified.
    const safeName = sanitizeCanvasFilename(filenameValue);
    const base = safeName.replace(/\.canvas$/i, "");
    let candidate = path.normalize(path.join(boardDir, safeName));
    for (let n = 2; existsSync(candidate) && n < 1000; n++) {
      candidate = path.normalize(path.join(boardDir, `${base}-${n}.canvas`));
    }
    filePath = candidate;
  }

  if (!filePath) return null;
  if (!filePath.startsWith(boardDir + path.sep)) return null;
  if (path.extname(filePath).toLowerCase() !== ".canvas") return null;
  if (filePath === path.normalize(boardTarget.filePath)) return null;

  return {
    slug: boardTarget.slug,
    relativePath: path.relative(rootDir, filePath).replaceAll("\\", "/"),
    filePath
  };
}

const mimeTypes = {
  ".canvas": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const localRouteAliases = {
  project: "projects.html"
};

function sendText(response, status, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(text);
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": mimeTypes[".json"] });
  response.end(JSON.stringify(data));
}

async function handleSaveBoard(request, response, parsedUrl) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", async () => {
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes)) {
        sendJson(response, 400, { success: false, error: "Invalid canvas payload." });
        return;
      }

      const boardTarget = await resolveBoardSavePath(parsedUrl.searchParams.get("slug"));
      // ?path= (an existing sidecar) or ?filename= (a new one) retargets the
      // write at a sub-canvas beside the board file instead of the board file
      // itself. Routed through this handler on purpose: a nested canvas then
      // inherits every guard below â€” the empty-save refusal, the stale-tab
      // refusal, canvasId and createdAt preservation â€” instead of getting a
      // second, weaker write path that would have to grow all three again.
      const canvasPathParam = parsedUrl.searchParams.get("path") || "";
      const canvasFileParam = parsedUrl.searchParams.get("filename") || "";
      let target = boardTarget;
      if (canvasPathParam || canvasFileParam) {
        target = resolveCanvasSidecarTarget(boardTarget, canvasPathParam, canvasFileParam);
        if (!target) {
          sendJson(response, 403, { success: false, error: "Forbidden canvas sidecar path." });
          return;
        }
      }
      const safePath = path.normalize(target.filePath);
      if (!safePath.startsWith(rootDir)) {
        sendJson(response, 403, { success: false, error: "Forbidden save path." });
        return;
      }

      // Refuse writes that would drop a non-empty board to zero nodes.
      // The editor's mount path can serialize an empty in-memory state and
      // POST it before the canvas finishes loading; that race wipes data.
      // Override with ?confirm-empty=1 for legitimate "clear board" actions.
      const confirmEmpty = parsedUrl.searchParams.get("confirm-empty") === "1";
      if (parsed.nodes.length === 0 && !confirmEmpty) {
        try {
          const existing = JSON.parse(await readFile(safePath, "utf8"));
          if (Array.isArray(existing.nodes) && existing.nodes.length > 0) {
            sendJson(response, 409, {
              success: false,
              error: `Refused empty save (${existing.nodes.length} existing nodes). Pass ?confirm-empty=1 to override.`
            });
            return;
          }
        } catch {
          // No existing file or unreadable — fine to proceed.
        }
      }

      // Preserve canvasId/createdAt from existing file if the client omitted
      // them. Protects against pre-migration clients and load-vs-autosave races
      // that would otherwise wipe board identity.
      let existingMeta = null;
      try {
        existingMeta = JSON.parse(await readFile(safePath, "utf8"));
      } catch { /* no existing file */ }

      // Stale-tab guard: a client that loaded the board earlier and missed a
      // newer on-disk save must not silently overwrite it. Clients send the
      // updatedAt they loaded against as ?base=; when the file has moved past
      // it, the save is refused and the client tells the user to reload.
      // Clients that send no base (old runtimes, scripts) keep old behavior.
      const baseParam = parsedUrl.searchParams.get("base");
      const staleConflict = staleBaseConflict(existingMeta?.updatedAt, baseParam);
      if (staleConflict) {
        sendJson(response, 409, {
          success: false,
          stale: true,
          error: `${staleConflict} Reload the page to pick up the newer state.`
        });
        return;
      }
      if (existingMeta && typeof existingMeta === "object") {
        if (!parsed.canvasId && typeof existingMeta.canvasId === "string") {
          parsed.canvasId = existingMeta.canvasId;
        }
        if (!parsed.createdAt && typeof existingMeta.createdAt === "string") {
          parsed.createdAt = existingMeta.createdAt;
        }
      }
      if (!parsed.updatedAt) parsed.updatedAt = new Date().toISOString();

      // Reorder so identity fields lead the serialized JSON.
      const { canvasId, createdAt, updatedAt, ...rest } = parsed;
      const payload = { canvasId, createdAt, updatedAt, ...rest };

      await mkdir(path.dirname(safePath), { recursive: true });
      await writeFile(safePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

      // Extract each markdown node's _rawMarkdown to its sidecar file path so
      // disk copies stay current with inline content. Best-effort — failures
      // here don't fail the canvas save (canvas already on disk above).
      const canvasDir = path.dirname(safePath);
      const sidecarsWritten = [];
      for (const node of parsed.nodes) {
        if (!node || node.type !== "markdown") continue;
        if (typeof node.file !== "string" || typeof node._rawMarkdown !== "string") continue;
        // Skip transient or external references.
        if (/^(?:blob:|data:|https?:|file:)/i.test(node.file)) continue;

        let sidecarPath;
        if (node.file.startsWith("/")) {
          sidecarPath = path.normalize(path.join(rootDir, node.file.replace(/^\/+/, "")));
        } else {
          sidecarPath = path.normalize(path.join(canvasDir, node.file));
        }
        if (!sidecarPath.startsWith(rootDir)) continue;
        if (path.extname(sidecarPath).toLowerCase() !== ".md") continue;

        try {
          await mkdir(path.dirname(sidecarPath), { recursive: true });
          const content = node._rawMarkdown.replace(/\r\n?/g, "\n");
          await writeFile(sidecarPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
          sidecarsWritten.push(path.relative(rootDir, sidecarPath).replaceAll("\\", "/"));
        } catch {
          // Sidecar write failure is informational — canvas save already succeeded.
        }
      }

      sendJson(response, 200, {
        success: true,
        slug: target.slug,
        path: target.relativePath,
        url: `/${target.relativePath}`,
        sidecarsWritten
      });
    } catch (error) {
      sendJson(response, 500, { success: false, error: error.message || "Save failed." });
    }
  });
}

// Sections of .agents/todo.md the tracker is allowed to file a new card into.
// A fixed list rather than free text: this writes to a real file, and the board
// only renders these headings anyway.
const TODO_SECTIONS = ["Now", "Bugs", "Test failures", "Features and ideas", "Later"];

// Append a card to .agents/todo.md so the board can file work without an editor.
// Only that one file, only those sections, always as [ ] to do.
async function handleAddTodo(request, response) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", async () => {
    try {
      const parsed = JSON.parse(body);
      const text = String(parsed?.text || "").trim().replace(/\s+/g, " ");
      const section = String(parsed?.section || "").trim();

      if (!text) {
        sendJson(response, 400, { success: false, error: "Write what needs doing first." });
        return;
      }
      if (!TODO_SECTIONS.includes(section)) {
        sendJson(response, 400, { success: false, error: `Unknown section "${section}".` });
        return;
      }

      const todoPath = path.join(rootDir, ".agents", "todo.md");
      const original = await readFile(todoPath, "utf8");
      const heading = `## ${section}`;
      const at = original.indexOf(`\n${heading}\n`);
      if (at === -1) {
        sendJson(response, 404, { success: false, error: `Section "${section}" is not in todo.md.` });
        return;
      }

      // Insert directly under the heading, so new cards land at the top of their
      // section where the priority ordering expects them.
      const insertAt = at + 1 + heading.length + 1;
      const card = `\n- [ ] ${text}\n`;
      const next = original.slice(0, insertAt) + card + original.slice(insertAt);
      await writeFile(todoPath, next, "utf8");
      await updateCardMeta({ title: text, by: String(parsed?.by || "board"), created: true });

      sendJson(response, 200, { success: true, section, text });
    } catch (error) {
      sendJson(response, 500, { success: false, error: String(error?.message || error) });
    }
  });
}

const REVIEW_VERDICTS = ["works", "issue", "partly"];
const TODO_STATUSES = [".", " ", "~", "A", "x"];

// Card timestamps live beside the tracker, keyed by the card title (first 60
// chars, like the feedback log), so they survive the todo file shifting. Only
// writes that flow through these endpoints stamp; direct file edits do not.
const CARD_META_KEY_LENGTH = 60;

function cardMetaKey(title) {
  return String(title || "").slice(0, CARD_META_KEY_LENGTH);
}

async function updateCardMeta({ title, newTitle = null, by = "board", created = false }) {
  const metaPath = path.join(rootDir, ".tracker", "card-meta.json");
  let meta = {};
  if (existsSync(metaPath)) {
    try {
      const parsed = JSON.parse(await readFile(metaPath, "utf8"));
      if (parsed && typeof parsed === "object") meta = parsed;
    } catch {
      meta = {};
    }
  }

  const now = new Date().toISOString();
  const oldKey = cardMetaKey(title);
  const key = newTitle ? cardMetaKey(newTitle) : oldKey;
  const entry = meta[oldKey] || {};
  if (newTitle && oldKey !== key) delete meta[oldKey];

  meta[key] = {
    createdAt: created ? now : entry.createdAt || null,
    updatedAt: now,
    updatedBy: by
  };
  if (created && !entry.createdAt) meta[key].createdAt = now;

  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

// Moves a card between columns and records the user's verdict on it.
//
// The board addresses a card by its line number in todo.md, which is only valid
// for as long as the file has not shifted underneath it. `expect` is the start of
// the line the board believed it was acting on; if that no longer matches, the
// write is refused rather than applied to whatever moved into that slot.
async function handleTodoUpdate(request, response) {
  try {
    const parsed = await readJsonBody(request);
    const line = Number(parsed?.line);
    const expect = String(parsed?.expect || "");
    const status = parsed?.status == null ? null : String(parsed.status);
    const verdict = parsed?.verdict == null ? null : String(parsed.verdict);
    const note = String(parsed?.note || "").trim();
    const priority = parsed?.priority == null ? null : Number(parsed.priority);
    const text = parsed?.text == null ? null : String(parsed.text).replace(/\s+/g, " ").trim();

    if (!Number.isInteger(line) || line < 0) {
      sendJson(response, 400, { success: false, error: "Missing line number." });
      return;
    }
    if (text !== null && !text) {
      sendJson(response, 400, { success: false, error: "Card text cannot be empty." });
      return;
    }
    if (status !== null && !TODO_STATUSES.includes(status)) {
      sendJson(response, 400, { success: false, error: `Unknown status "${status}".` });
      return;
    }
    if (verdict !== null && !REVIEW_VERDICTS.includes(verdict)) {
      sendJson(response, 400, { success: false, error: `Unknown verdict "${verdict}".` });
      return;
    }
    if (priority !== null && (!Number.isInteger(priority) || priority < 0 || priority > 5)) {
      sendJson(response, 400, { success: false, error: `Priority must be 0 to 5, got "${parsed.priority}".` });
      return;
    }
    if (status === null && verdict === null && priority === null && text === null && !note) {
      sendJson(response, 400, { success: false, error: "Nothing to record." });
      return;
    }

    const todoPath = path.join(rootDir, ".agents", "todo.md");
    const original = await readFile(todoPath, "utf8");
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);

    if (line >= lines.length) {
      sendJson(response, 409, { success: false, error: "todo.md changed, reload the board." });
      return;
    }

    const current = lines[line];
    const marker = /^-\s+\[([ xA~.])\]\s+/.exec(current);
    if (!marker) {
      sendJson(response, 409, { success: false, error: "That line is not a card any more, reload the board." });
      return;
    }
    // Compare the card's text, not the whole line. The marker is the thing being
    // rewritten, so including it here would make the guard fire on the board's
    // own successful writes.
    const currentText = current.replace(/^-\s+\[[ xA~.]\]\s+/, "");
    if (expect && !currentText.startsWith(expect)) {
      sendJson(response, 409, { success: false, error: "todo.md changed, reload the board." });
      return;
    }

    const statusFrom = marker[1];
    let statusTo = statusFrom;
    let updatedLine = current;

    if (status !== null && status !== statusFrom) {
      statusTo = status;
      updatedLine = updatedLine.replace(/^(-\s+)\[[ xA~.]\]/, `$1[${status}]`);
    }

    // A text edit replaces the title while keeping the marker, the @owner tag,
    // and the priority token, since the board never shows those in the title.
    if (text !== null) {
      const parts = /^(-\s+\[[ xA~.]\]\s+)(.*)$/.exec(updatedLine);
      const rest = parts[2];
      const ownerTag = /(^|\s)@[a-z0-9][a-z0-9._-]*/i.exec(rest);
      const prioTag = /(^|\s)!p[1-5]\b/i.exec(rest);
      updatedLine = `${parts[1]}${text}`;
      if (ownerTag) updatedLine += ` ${ownerTag[0].trim()}`;
      if (prioTag) updatedLine += ` ${prioTag[0].trim()}`;
    }

    // Priority rides in the line itself as a trailing `!p<n>` token, so it
    // survives every tool that reads todo.md as plain markdown. 0 clears it.
    if (priority !== null) {
      updatedLine = updatedLine.replace(/\s*!p[1-5]\b/i, "");
      if (priority >= 1) updatedLine = `${updatedLine.replace(/\s+$/, "")} !p${priority}`;
    }

    if (updatedLine !== current) {
      lines[line] = updatedLine;
      await writeFile(todoPath, lines.join(eol), "utf8");

      // Stamp the card's timestamps. Title keys exclude the owner tag and
      // priority token, matching how the board and the feedback log key cards.
      const stripLine = (value) => value
        .replace(/^-\s+\[[ xA~.]\]\s+/, "")
        .replace(/(^|\s)@[a-z0-9][a-z0-9._-]*/i, "")
        .replace(/\s*!p[1-5]\b/i, "")
        .trim();
      await updateCardMeta({
        title: stripLine(current),
        newTitle: text !== null ? stripLine(updatedLine) : null,
        by: String(parsed?.by || "board")
      });
    }

    if (verdict !== null || note) {
      // Title without the status marker, the @owner tag, or the priority token,
      // so it matches how the board keys a card and survives the line moving later.
      const title = current
        .replace(/^-\s+\[[ xA~.]\]\s+/, "")
        .replace(/(^|\s)@[a-z0-9][a-z0-9._-]*/i, "")
        .replace(/\s*!p[1-5]\b/i, "")
        .trim();

      const feedbackPath = path.join(rootDir, ".agents", "review-feedback.json");
      let entries = [];
      if (existsSync(feedbackPath)) {
        try {
          const existing = JSON.parse(await readFile(feedbackPath, "utf8"));
          if (Array.isArray(existing)) entries = existing;
        } catch {
          // A corrupt log should not block the user from recording a verdict.
          entries = [];
        }
      }

      entries.unshift({
        at: new Date().toISOString(),
        lane: String(parsed?.lane || ""),
        title: title.slice(0, 200),
        verdict,
        note,
        statusFrom,
        statusTo
      });

      await writeFile(feedbackPath, `${JSON.stringify(entries.slice(0, 300), null, 2)}\n`, "utf8");
    }

    sendJson(response, 200, { success: true, statusFrom, statusTo });
  } catch (error) {
    sendJson(response, 500, { success: false, error: String(error?.message || error) });
  }
}

async function handleSaveMarkdown(request, response, parsedUrl) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", async () => {
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || typeof parsed.content !== "string") {
        sendJson(response, 400, { success: false, error: "Invalid markdown payload." });
        return;
      }

      const target = await resolveMarkdownSavePath(
        parsedUrl.searchParams.get("slug"),
        parsed.path,
        parsed.filename
      );
      const safePath = path.normalize(target.filePath);
      if (!safePath.startsWith(rootDir) || path.extname(safePath).toLowerCase() !== ".md") {
        sendJson(response, 403, { success: false, error: "Forbidden markdown path." });
        return;
      }

      const normalizedContent = parsed.content.replace(/\r\n?/g, "\n");
      await mkdir(path.dirname(safePath), { recursive: true });
      await writeFile(
        safePath,
        normalizedContent.endsWith("\n") ? normalizedContent : `${normalizedContent}\n`,
        "utf8"
      );

      sendJson(response, 200, {
        success: true,
        slug: target.slug,
        path: target.relativePath,
        url: `/${target.relativePath}`
      });
    } catch (error) {
      sendJson(response, 500, { success: false, error: error.message || "Markdown save failed." });
    }
  });
}

// Generic file imports are allowed for all extensions; filename sanitization
// keeps writes inside the board directory and the size cap below limits abuse.
// A small denylist blocks scripts/executables that would be dangerous to serve
// back from the local dev server.
const BLOCKED_ASSET_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".dll",
  ".ps1", ".vbs", ".sh", ".jar", ".scr"
]);

function sanitizeAssetFilename(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/").split("/").pop() || "asset";
  const extMatch = raw.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : "";
  const base = (extMatch ? raw.slice(0, -extMatch[0].length) : raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  return `${base}${ext}`;
}

async function uniqueAssetPath(dir, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let counter = 1;
  while (existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
    if (counter > 9999) break;
  }
  return candidate;
}

async function handleSaveAsset(request, response, parsedUrl) {
  const MAX_BYTES = 200 * 1024 * 1024;
  try {
    const filenameParam = parsedUrl.searchParams.get("filename");
    if (!filenameParam) {
      sendJson(response, 400, { success: false, error: "Missing filename query parameter." });
      request.resume();
      return;
    }

    const safeFilename = sanitizeAssetFilename(filenameParam);
    const ext = path.extname(safeFilename).toLowerCase();
    if (BLOCKED_ASSET_EXTENSIONS.has(ext)) {
      sendJson(response, 400, { success: false, error: `Blocked file type: ${ext}` });
      request.resume();
      return;
    }

    const boardTarget = await resolveBoardSavePath(parsedUrl.searchParams.get("slug"));
    const boardDir = path.normalize(path.dirname(boardTarget.filePath));
    const targetPath = await uniqueAssetPath(boardDir, safeFilename);
    const safePath = path.normalize(targetPath);
    if (!safePath.startsWith(rootDir)) {
      sendJson(response, 403, { success: false, error: "Forbidden asset path." });
      request.resume();
      return;
    }

    await mkdir(path.dirname(safePath), { recursive: true });

    let total = 0;
    let aborted = false;
    const writeStream = createWriteStream(safePath);

    const cleanup = async () => {
      try { await unlink(safePath); } catch { /* ignore */ }
    };

    request.on("data", (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_BYTES) {
        aborted = true;
        writeStream.destroy();
        cleanup().finally(() => {
          if (!response.headersSent) sendJson(response, 413, { success: false, error: "Asset exceeds 200MB cap." });
          request.destroy();
        });
        return;
      }
      writeStream.write(chunk);
    });

    request.on("end", () => {
      if (aborted) return;
      writeStream.end(() => {
        const relativePath = path.relative(rootDir, safePath).replaceAll("\\", "/");
        sendJson(response, 200, {
          success: true,
          slug: boardTarget.slug,
          path: relativePath,
          url: `/${relativePath}`
        });
      });
    });

    request.on("error", async () => {
      writeStream.destroy();
      await cleanup();
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Upload stream failed." });
    });

    writeStream.on("error", async (err) => {
      aborted = true;
      await cleanup();
      if (!response.headersSent) sendJson(response, 500, { success: false, error: err.message || "Disk write failed." });
    });
  } catch (error) {
    if (!response.headersSent) sendJson(response, 500, { success: false, error: error.message || "Asset save failed." });
    request.resume();
  }
}

async function handleListMarkdown(request, response, parsedUrl) {
  try {
    const slug = parsedUrl.searchParams.get("slug");
    const boardTarget = await resolveBoardSavePath(slug);
    const boardDir = path.normalize(path.dirname(boardTarget.filePath));

    if (!existsSync(boardDir)) {
       sendJson(response, 200, { success: true, files: [] });
       return;
    }

    const items = await readdir(boardDir);
    const mdFiles = [];

    for (const item of items) {
      if (item.toLowerCase().endsWith(".md")) {
        const filePath = path.join(boardDir, item);
        const stats = statSync(filePath);
        mdFiles.push({
          filename: item,
          title: item.replace(/\.md$/i, ""),
          path: path.relative(rootDir, filePath).replaceAll("\\", "/"),
          url: `/${path.relative(rootDir, filePath).replaceAll("\\", "/")}`,
          mtime: stats.mtime
        });
      }
    }

    mdFiles.sort((a, b) => b.mtime - a.mtime);
    sendJson(response, 200, { success: true, files: mdFiles });
  } catch (error) {
    sendJson(response, 500, { success: false, error: error.message || "Could not list markdown files." });
  }
}

// Lists the sub-canvas sidecars in a board's directory with their canvasId.
// That id is the point: a node stores a path, and when the file behind the
// path is renamed or moved the board asks here which file carries the id now,
// then repairs itself. Without this, "renaming shouldn't break links" is a
// promise the runtime has no way to keep.
async function handleListCanvas(request, response, parsedUrl) {
  try {
    const boardTarget = await resolveBoardSavePath(parsedUrl.searchParams.get("slug"));
    const boardDir = path.normalize(path.dirname(boardTarget.filePath));
    const boardFile = path.normalize(boardTarget.filePath);

    if (!existsSync(boardDir)) {
      sendJson(response, 200, { success: true, files: [] });
      return;
    }

    const items = await readdir(boardDir);
    const files = [];

    for (const item of items) {
      if (!item.toLowerCase().endsWith(".canvas")) continue;
      const filePath = path.join(boardDir, item);
      if (path.normalize(filePath) === boardFile) continue;

      let parsed = null;
      try {
        parsed = JSON.parse(await readFile(filePath, "utf8"));
      } catch {
        // Unreadable or not JSON: still listed, just without an identity.
      }

      const relative = path.relative(rootDir, filePath).replaceAll("\\", "/");
      files.push({
        filename: item,
        title:
          typeof parsed?.title === "string" && parsed.title
            ? parsed.title
            : item.replace(/\.canvas$/i, ""),
        canvasId: typeof parsed?.canvasId === "string" ? parsed.canvasId : "",
        nodeCount: Array.isArray(parsed?.nodes) ? parsed.nodes.length : 0,
        path: relative,
        url: `/${relative}`,
        mtime: statSync(filePath).mtime
      });
    }

    files.sort((a, b) => b.mtime - a.mtime);
    sendJson(response, 200, { success: true, files });
  } catch (error) {
    sendJson(response, 500, { success: false, error: error.message || "Could not list canvas files." });
  }
}

function handleGetVideoMeta(request, response, parsedUrl) {
  const videoUrl = parsedUrl.searchParams.get("url");
  if (!videoUrl) return sendText(response, 400, "Missing url parameter");

  https.get(videoUrl, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return handleGetVideoMeta(request, response, new URL(res.headers.location, videoUrl));
    }

    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
      if (data.length > 50000) res.destroy(); // Limit data for safety
    });

    res.on("end", () => {
      const widthMatch = data.match(/<meta property="og:video:width" content="(\d+)">/);
      const heightMatch = data.match(/<meta property="og:video:height" content="(\d+)">/);
      if (widthMatch && heightMatch) {
        sendJson(response, 200, {
          width: parseInt(widthMatch[1], 10),
          height: parseInt(heightMatch[1], 10)
        });
      } else {
        sendJson(response, 404, { error: "No video metadata found" });
      }
    });
  }).on("error", (err) => {
    sendJson(response, 500, { error: err.message });
  });
}

// GET /api/frame-check?url=… — reports whether a site's response headers let
// it render inside an iframe here. Browsers enforce X-Frame-Options and CSP
// frame-ancestors but hide the refusal from page JS, so a doomed live embed
// only ever shows a grey error box. The server can read the headers; the
// board asks it before trusting an iframe, and falls back to a preview card.
async function handleFrameCheck(request, response, parsedUrl) {
  const target = parsedUrl.searchParams.get("url") || "";
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return sendJson(response, 400, { error: "Invalid url parameter" });
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return sendJson(response, 400, { error: "Only http and https urls can be checked" });
  }

  const probe = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      return await fetch(targetUrl, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (cosmoboard frame-check)" }
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = null;
    try {
      res = await probe("HEAD");
    } catch {
      res = null;
    }
    if (!res || res.status >= 400) res = await probe("GET");
    try {
      res.body?.cancel?.();
    } catch {}

    const xfo = String(res.headers.get("x-frame-options") || "").toLowerCase();
    const csp = String(res.headers.get("content-security-policy") || "").toLowerCase();
    const ancestors = /frame-ancestors\s+([^;]+)/.exec(csp)?.[1]?.trim() || "";

    let framable = true;
    let reason = "";
    if (xfo.includes("deny") || xfo.includes("sameorigin")) {
      framable = false;
      reason = `x-frame-options: ${xfo}`;
    }
    if (ancestors) {
      // frame-ancestors overrides X-Frame-Options when both are present. Only
      // a wildcard or bare scheme source can match an arbitrary local origin.
      const tokens = ancestors.split(/\s+/);
      framable = tokens.some((t) => t === "*" || t === "http:" || t === "https:");
      reason = framable ? "" : `frame-ancestors ${ancestors}`;
    }
    sendJson(response, 200, { framable, status: res.status, reason });
  } catch (error) {
    // An unreachable or slow site is not evidence of refusal; let the browser
    // show whatever the embed produces rather than falsely downgrading it.
    sendJson(response, 200, { framable: true, reason: `probe failed: ${String((error && error.message) || error)}` });
  }
}

function resolveRequestPath(urlPath) {
  const cleanPath = urlPath.split("?")[0];
  const target = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  return path.join(rootDir, localRouteAliases[target] || target);
}

function resolveExistingFilePath(filePath) {
  const safePath = path.normalize(filePath);

  if (!safePath.startsWith(rootDir)) {
    return { forbidden: true, filePath: safePath };
  }

  if (existsSync(safePath) && statSync(safePath).isDirectory()) {
    const indexPath = path.join(safePath, "index.html");
    if (existsSync(indexPath)) {
      return { filePath: indexPath };
    }

    const htmlPath = `${safePath}.html`;
    if (existsSync(htmlPath)) {
      return { filePath: htmlPath };
    }

    return { filePath: indexPath };
  }

  if (existsSync(safePath)) {
    return { filePath: safePath };
  }

  if (!path.extname(safePath)) {
    const htmlPath = `${safePath}.html`;
    if (existsSync(htmlPath)) {
      return { filePath: htmlPath };
    }
  }

  return { filePath: safePath };
}

function getNetworkAccessUrls() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
}

// Every host this server can legitimately be reached on: loopback, plus this
// machine's own LAN addresses, because testing a board on a real phone means
// loading it over wifi and that page's Origin is the LAN address.
function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.address && entry.address.toLowerCase() === host) return true;
    }
  }
  return false;
}

// A write request from a page this server did not serve is a cross-site request,
// and the browser will have labelled it with that site's Origin. Refusing those
// is the whole defence: without it, any website open in a tab could POST to this
// server while it runs and rewrite the user's boards, because a form or fetch
// POST is not blocked by the same-origin policy, only its response is.
//
// A MISSING Origin is allowed on purpose. Browsers always send it on POST, so a
// real attack cannot hide by omitting it, while curl, the test suites and any
// non-browser tool send nothing and would otherwise be locked out of their own
// development server for no security gain.
function isAllowedWriteOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (error) {
    return false; // An unparseable Origin is not one we put there.
  }
  return isLocalHostname(parsed.hostname);
}

const server = http.createServer((request, response) => {
  const parsedUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);

  const isWrite = request.method === "POST" || request.method === "PUT" || request.method === "DELETE";
  if (isWrite && !isAllowedWriteOrigin(request)) {
    sendJson(response, 403, {
      success: false,
      error: "Cross-site write refused. This server only accepts writes from pages it served."
    });
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/save-board") {
    handleSaveBoard(request, response, parsedUrl);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/save-markdown") {
    handleSaveMarkdown(request, response, parsedUrl);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/add-todo") {
    handleAddTodo(request, response);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/todo-update") {
    handleTodoUpdate(request, response);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/save-asset") {
    handleSaveAsset(request, response, parsedUrl);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/list-markdown") {
    handleListMarkdown(request, response, parsedUrl);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/list-canvas") {
    handleListCanvas(request, response, parsedUrl);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/get-video-meta") {
    handleGetVideoMeta(request, response, parsedUrl);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/frame-check") {
    handleFrameCheck(request, response, parsedUrl);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method Not Allowed");
    return;
  }

  const filePath = resolveRequestPath(request.url || "/");
  const resolvedPath = resolveExistingFilePath(filePath);

  if (resolvedPath.forbidden) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const finalPath = resolvedPath.filePath;

  if (!existsSync(finalPath)) {
    response.writeHead(404, { "Content-Type": mimeTypes[".html"] });
    if (request.method === "HEAD") {
      response.end();
    } else {
      createReadStream(path.join(rootDir, "404.html")).pipe(response);
    }
    return;
  }

  const extension = path.extname(finalPath).toLowerCase();
  const stats = statSync(finalPath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Content-Length": stats.size,
    // Lets long-lived pages (the tracker) notice their own file changed on
    // disk and offer a reload instead of running stale code silently.
    "Last-Modified": stats.mtime.toUTCString(),
    // Lets the board runtime detect a write-capable host with a silent HEAD
    // probe, instead of discovering it via a 405 on the first save attempt.
    "X-Cosmoboard-Server": "1"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(finalPath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Preview server running at http://0.0.0.0:${port}`);
  console.log(`Local Access: http://127.0.0.1:${port}`);
  console.log(`Board save endpoint: http://127.0.0.1:${port}/api/save-board`);
  console.log(`Markdown save endpoint: http://127.0.0.1:${port}/api/save-markdown`);
  console.log(`Asset save endpoint: http://127.0.0.1:${port}/api/save-asset`);

  for (const url of getNetworkAccessUrls()) {
    console.log(`Network Access: ${url}`);
  }
});
