import http from "node:http";
import https from "node:https";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".canvas": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
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

async function resolveBoardSavePath(slugValue) {
  const slug = String(slugValue || "braindump").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "braindump";
  try {
    const registry = JSON.parse(await readFile(path.join(rootDir, "src", "registry.json"), "utf8"));
    const board = Array.isArray(registry.boards)
      ? registry.boards.find((entry) => entry.slug === slug)
      : null;
    if (board?.sourcePath) {
      return {
        slug,
        relativePath: board.sourcePath.replaceAll("\\", "/"),
        filePath: path.join(rootDir, board.sourcePath)
      };
    }
  } catch (error) {
    // Fall back to the historical board path when the registry cannot load.
  }

  const relativePath = `content/boards/${slug}/current.canvas`;
  return {
    slug,
    relativePath,
    filePath: path.join(rootDir, relativePath)
  };
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

      const target = await resolveBoardSavePath(parsedUrl.searchParams.get("slug"));
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

      await mkdir(path.dirname(safePath), { recursive: true });
      await writeFile(safePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

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
        sidecarsWritten
      });
    } catch (error) {
      sendJson(response, 500, { success: false, error: error.message || "Save failed." });
    }
  });
}

function sanitizeMarkdownFilename(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/").split("/").pop() || "note";
  const withoutExtension = raw.replace(/\.md$/i, "");
  const safeBase = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "note";

  return `${safeBase}.md`;
}

async function resolveMarkdownSavePath(slugValue, pathValue, filenameValue) {
  const boardTarget = await resolveBoardSavePath(slugValue);
  const boardDir = path.normalize(path.dirname(boardTarget.filePath));
  const requestedPath = String(pathValue || "").trim();

  if (requestedPath) {
    const normalizedRequestPath = requestedPath
      .split(/[?#]/, 1)[0]
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");

    if (normalizedRequestPath) {
      const requestedFilePath = path.normalize(path.join(rootDir, normalizedRequestPath));
      if (
        requestedFilePath.startsWith(boardDir) &&
        path.extname(requestedFilePath).toLowerCase() === ".md"
      ) {
        const relativePath = path.relative(rootDir, requestedFilePath).replaceAll("\\", "/");
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
    relativePath: path.relative(rootDir, filePath).replaceAll("\\", "/"),
    filePath
  };
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

const server = http.createServer((request, response) => {
  const parsedUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);

  if (request.method === "POST" && parsedUrl.pathname === "/api/save-board") {
    handleSaveBoard(request, response, parsedUrl);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/save-markdown") {
    handleSaveMarkdown(request, response, parsedUrl);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/list-markdown") {
    handleListMarkdown(request, response, parsedUrl);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/get-video-meta") {
    handleGetVideoMeta(request, response, parsedUrl);
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
  const size = statSync(finalPath).size;
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Content-Length": size
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

  for (const url of getNetworkAccessUrls()) {
    console.log(`Network Access: ${url}`);
  }
});
