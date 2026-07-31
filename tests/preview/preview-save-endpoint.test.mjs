import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const port = 4193;
const baseUrl = `http://127.0.0.1:${port}`;
const boardPath = "content/boards/cosmoboard/current.canvas";
const original = await readFile(boardPath, "utf8");

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

  const savedState = {
    nodes: [{ id: "persist-test", type: "text", x: 1, y: 2, width: 240, height: 120, text: "saved through preview server" }],
    edges: [],
    viewport: { x: 0, y: 0, z: 1 }
  };

  const response = await fetch(`${baseUrl}/api/save-board?slug=cosmoboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(savedState, null, 2)
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.path, boardPath);

  const written = JSON.parse(await readFile(boardPath, "utf8"));
  assert.equal(written.nodes?.[0]?.text, "saved through preview server");

  // --- stale-tab guard: a save whose base predates the file is refused ---
  const staleResponse = await fetch(
    `${baseUrl}/api/save-board?slug=cosmoboard&base=${encodeURIComponent("2000-01-01T00:00:00.000Z")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedState, nodes: [{ ...savedState.nodes[0], text: "stale overwrite attempt" }] })
    }
  );
  assert.equal(staleResponse.status, 409, "a stale base must be refused");
  const staleBody = await staleResponse.json();
  assert.equal(staleBody.stale, true, "the refusal must be marked stale so the client can react");
  const afterStale = JSON.parse(await readFile(boardPath, "utf8"));
  assert.equal(afterStale.nodes?.[0]?.text, "saved through preview server", "the stale save must not touch the file");

  // --- a matching base saves normally ---
  const freshResponse = await fetch(
    `${baseUrl}/api/save-board?slug=cosmoboard&base=${encodeURIComponent(afterStale.updatedAt)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedState, nodes: [{ ...savedState.nodes[0], text: "fresh save with base" }] })
    }
  );
  assert.equal(freshResponse.status, 200, "a current base must save");
  const afterFresh = JSON.parse(await readFile(boardPath, "utf8"));
  assert.equal(afterFresh.nodes?.[0]?.text, "fresh save with base");
} finally {
  child.kill();
  await writeFile(boardPath, original, "utf8");
}

console.log("preview save endpoint check passed");
