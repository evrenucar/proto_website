// /api/frame-check reads a target site's X-Frame-Options and CSP
// frame-ancestors headers and reports whether an iframe embed can work.
// A local mock upstream plays the target so no external network is involved.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const port = 4213;
const upstreamPort = 4214;
const baseUrl = `http://127.0.0.1:${port}`;
const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("preview server did not start"));
    }, 10000);

    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`preview server exited early with code ${code}`));
    });
  });
}

// Mock upstream: each path answers with a different framing policy.
const upstream = http.createServer((request, response) => {
  const headers = { "Content-Type": "text/html" };
  if (request.url === "/deny") headers["X-Frame-Options"] = "DENY";
  if (request.url === "/sameorigin") headers["X-Frame-Options"] = "SAMEORIGIN";
  if (request.url === "/csp-self") headers["Content-Security-Policy"] = "frame-ancestors 'self'";
  if (request.url === "/csp-star") headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors *";
  if (request.url === "/csp-overrides-xfo") {
    // frame-ancestors wins over X-Frame-Options when both are present.
    headers["X-Frame-Options"] = "DENY";
    headers["Content-Security-Policy"] = "frame-ancestors *";
  }
  response.writeHead(200, headers);
  response.end("<html><body>mock</body></html>");
});
await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

async function check(targetPath) {
  const response = await fetch(`${baseUrl}/api/frame-check?url=${encodeURIComponent(`${upstreamUrl}${targetPath}`)}`);
  assert.equal(response.status, 200, `${targetPath} check returns 200`);
  return response.json();
}

try {
  await waitForServer(child);

  const cases = [
    ["/open", true, "no framing headers means framable"],
    ["/deny", false, "x-frame-options deny refuses"],
    ["/sameorigin", false, "x-frame-options sameorigin refuses a foreign origin"],
    ["/csp-self", false, "frame-ancestors 'self' refuses a foreign origin"],
    ["/csp-star", true, "frame-ancestors * allows"],
    ["/csp-overrides-xfo", true, "frame-ancestors * overrides x-frame-options deny"]
  ];
  for (const [targetPath, expected, why] of cases) {
    const result = await check(targetPath);
    assert.equal(result.framable, expected, `${targetPath}: ${why} (reason: ${result.reason || "none"})`);
  }

  const bad = await fetch(`${baseUrl}/api/frame-check?url=not-a-url`);
  assert.equal(bad.status, 400, "an unparsable url is a 400");
  const scheme = await fetch(`${baseUrl}/api/frame-check?url=${encodeURIComponent("file:///etc/passwd")}`);
  assert.equal(scheme.status, 400, "non-http schemes are refused");

  // An unreachable target must not read as a refusal.
  const dead = await fetch(`${baseUrl}/api/frame-check?url=${encodeURIComponent("http://127.0.0.1:4599/nothing")}`);
  assert.equal(dead.status, 200, "unreachable target still answers");
  assert.equal((await dead.json()).framable, true, "unreachable target defaults to framable");

  console.log("frame-check endpoint: all cases passed");
} finally {
  child.kill();
  upstream.close();
}
