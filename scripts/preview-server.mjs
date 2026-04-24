import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
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
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const localRouteAliases = {
  project: "projects.html"
};

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
  const filePath = resolveRequestPath(request.url || "/");
  const resolvedPath = resolveExistingFilePath(filePath);

  if (resolvedPath.forbidden) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const finalPath = resolvedPath.filePath;

  if (!existsSync(finalPath)) {
    response.writeHead(404, { "Content-Type": mimeTypes[".html"] });
    createReadStream(path.join(rootDir, "404.html")).pipe(response);
    return;
  }

  const extension = path.extname(finalPath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream"
  });
  createReadStream(finalPath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Preview server running at http://0.0.0.0:${port}`);
  console.log(`Local Access: http://127.0.0.1:${port}`);

  for (const url of getNetworkAccessUrls()) {
    console.log(`Network Access: ${url}`);
  }
});
