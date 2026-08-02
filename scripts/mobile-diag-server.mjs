/* Mobile diagnostics host.
 *
 * A read-only twin of the preview server, plus one collector route. Point a
 * phone at it over the LAN, open a board with ?diag=1, and tools/mobile-diag.js
 * is injected into the page. The probe beacons what it measures back to POST
 * /diag, which appends it to .tmp/diag/<session>.jsonl on this machine, so the
 * record lands on disk while the phone is still running and survives the phone
 * crashing.
 *
 * Two deliberate differences from scripts/preview-server.mjs:
 *   - No save endpoints and no X-Cosmoboard-Server header, so a board opened
 *     through here cannot write to content/ even if autosave is on.
 *   - Only GET, HEAD and POST /diag are answered. Everything else is 405.
 *
 * Run:  PORT=4190 node scripts/mobile-diag-server.mjs
 * Then on the phone, on the same wifi, open the printed http://<lan-ip>:4190/go
 */

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 4190;
const outDir = path.join(rootDir, ".tmp", "diag");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".canvas": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type"
};

function lanUrls() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
}

function sendText(response, status, body, extra = {}) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...extra });
  response.end(body);
}

// Sessions are one file each, appended to, never rewritten. A crash mid-write
// costs the last line and nothing else.
function writeRecords(payload) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "not json" };
  }
  const sid = String(parsed.sid || "unknown").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "unknown";
  const records = Array.isArray(parsed.records) ? parsed.records : [parsed];
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${sid}.jsonl`);
  const at = new Date().toISOString();
  const lines = records.map((record) => JSON.stringify({ at, sid, ...record })).join("\n");
  appendFileSync(file, lines + "\n", "utf8");
  return { ok: true, file, count: records.length, kind: records[0] && records[0].kind };
}

function collect(request, response) {
  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    const result = writeRecords(Buffer.concat(chunks).toString("utf8"));
    if (result.ok) {
      const first = result.kind ? ` (${result.kind} first)` : "";
      console.log(`diag: +${result.count} record(s)${first} -> ${path.relative(rootDir, result.file)}`);
    } else {
      console.log(`diag: rejected a payload (${result.reason})`);
    }
    response.writeHead(result.ok ? 204 : 400, corsHeaders);
    response.end();
  });
}

// Typing a long path on a phone keyboard is the real friction, so /go is a
// one-tap index of every board with the probe already switched on.
function landing() {
  const boardsDir = path.join(rootDir, "content", "boards");
  const boards = existsSync(boardsDir)
    ? readdirSync(boardsDir).filter((name) => name.endsWith(".html")).sort()
    : [];
  const items = boards
    .map((name) => `<li><a href="/content/boards/${name}?diag=1">${name.replace(/\.html$/, "")}</a></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Cosmoboard mobile diagnostics</title>
<style>
 body{background:#111;color:#e8f6f2;font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;padding:20px 18px 40px}
 h1{font-size:19px;margin:0 0 4px} p{color:#9fb5b0;margin:0 0 16px;font-size:14px}
 ul{list-style:none;padding:0;margin:0 0 22px} li{margin:0 0 10px}
 a{display:block;padding:13px 14px;background:#17272a;border:1px solid #245049;border-radius:9px;color:#7fe9d2;text-decoration:none}
 code{background:#17272a;padding:2px 5px;border-radius:4px;color:#7fe9d2;font-size:13px}
 ol{color:#c8dcd7;font-size:14px;padding-left:20px} li.step{margin:0 0 8px}
</style></head><body>
<h1>Cosmoboard mobile diagnostics</h1>
<p>Tap a board. It opens with the probe running, top left of the screen.</p>
<ul>
${items || "<li>no boards found</li>"}
</ul>
<h1>How to use it</h1>
<ol>
<li class="step">Tap the small <code>diag</code> box to open the panel.</li>
<li class="step">Follow the step it names, then press <b>next step</b>.</li>
<li class="step">If the page dies and reloads, the box says <b>CRASHED LAST RUN</b>. That is the result. Do not clear it.</li>
<li class="step">Everything is already saved on the computer under <code>.tmp/diag/</code>.</li>
</ol>
</body></html>`;
}

function resolveStatic(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(rootDir, relative);
  if (candidate !== rootDir && !candidate.startsWith(rootDir + path.sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const index = path.join(candidate, "index.html");
    return existsSync(index) ? index : null;
  }
  if (existsSync(candidate)) return candidate;
  if (!path.extname(candidate) && existsSync(`${candidate}.html`)) return `${candidate}.html`;
  return null;
}

const INJECT = '<script src="/tools/mobile-diag.js"></script>';

const server = http.createServer((request, response) => {
  const parsed = new URL(request.url || "/", `http://127.0.0.1:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === "POST" && parsed.pathname === "/diag") {
    collect(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "This server is read-only. Only GET and POST /diag are answered.");
    return;
  }

  if (parsed.pathname === "/go" || parsed.pathname === "/diag") {
    const body = landing();
    response.writeHead(200, { "Content-Type": mimeTypes[".html"], "Content-Length": Buffer.byteLength(body) });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  const filePath = resolveStatic(parsed.pathname);
  if (!filePath) {
    sendText(response, 404, "Not found. Try /go");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const wantsDiag = parsed.searchParams.get("diag") === "1";

  // The injection is a plain script tag in the head, so the probe installs its
  // error handlers before the board's own scripts run.
  if (wantsDiag && extension === ".html") {
    let html = readFileSync(filePath, "utf8");
    html = html.includes("</head>")
      ? html.replace("</head>", `  ${INJECT}\n  </head>`)
      : `${INJECT}\n${html}`;
    response.writeHead(200, { "Content-Type": mimeTypes[".html"], "Content-Length": Buffer.byteLength(html) });
    response.end(request.method === "HEAD" ? undefined : html);
    return;
  }

  const stats = statSync(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Content-Length": stats.size
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  mkdirSync(outDir, { recursive: true });
  console.log(`Mobile diagnostics server on port ${port}`);
  console.log(`Local Access: http://127.0.0.1:${port}/go`);
  console.log(`Writing sessions to: ${path.relative(rootDir, outDir)}`);
  const urls = lanUrls();
  if (!urls.length) {
    console.log("No LAN address found. The phone will not be able to reach this machine.");
  }
  for (const url of urls) {
    console.log(`On the phone, open: ${url}/go`);
  }
});
