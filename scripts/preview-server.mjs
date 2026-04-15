import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
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

function resolveRequestPath(urlPath) {
  const cleanPath = urlPath.split("?")[0];
  const target = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  return path.join(rootDir, target);
}

const server = http.createServer((request, response) => {
  const filePath = resolveRequestPath(request.url || "/");
  const safePath = path.normalize(filePath);

  if (!safePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const finalPath =
    existsSync(safePath) && statSync(safePath).isDirectory()
      ? path.join(safePath, "index.html")
      : safePath;

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

server.listen(port, () => {
  console.log(`Preview server running at http://127.0.0.1:${port}`);
});
