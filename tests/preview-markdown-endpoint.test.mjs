import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";

const port = 4197;
const baseUrl = `http://127.0.0.1:${port}`;
const markdownPath = "content/boards/cosmoboard/markdown/preview-endpoint-test.md";

let originalMarkdown = null;
try {
  originalMarkdown = await readFile(markdownPath, "utf8");
} catch (error) {
  originalMarkdown = null;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview server did not start")), 10000);
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

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const payload = {
    filename: "preview-endpoint-test.md",
    content: "# Preview endpoint test\n\nSaved through preview server."
  };

  const response = await fetch(`${baseUrl}/api/save-markdown?slug=cosmoboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.path, markdownPath);
  assert.equal(result.url, `/${markdownPath}`);

  const written = await readFile(markdownPath, "utf8");
  assert.equal(written, "# Preview endpoint test\n\nSaved through preview server.\n");
} finally {
  child.kill();
  if (originalMarkdown == null) {
    await rm(markdownPath, { force: true });
  } else {
    await writeFile(markdownPath, originalMarkdown, "utf8");
  }
}

console.log("preview markdown endpoint check passed");
