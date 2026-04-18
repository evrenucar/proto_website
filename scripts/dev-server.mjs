import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const PORT = 3000;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  // Save API endpoint
  if (req.method === "POST" && req.url === "/api/save-braindump") {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", async () => {
      try {
        const filePath = path.join(rootDir, "content", "braindump-state.json");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, body, "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("Save error:", err);
        res.writeHead(500);
        res.end("Error saving state");
      }
    });
    return;
  }

  // Static file serving
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(rootDir, parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || "application/octet-stream";

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404);
      res.end("404 Not Found");
    } else {
      res.writeHead(500);
      res.end("500 Server Error: " + error.code);
    }
  }
});

server.listen(PORT, () => {
  console.log(`Development server running at http://localhost:${PORT}/`);
  console.log(`You can now save braindump boards directly to the repository.`);
});
