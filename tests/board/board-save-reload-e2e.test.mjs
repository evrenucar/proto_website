import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

import { chromium } from "playwright";

const port = 4194;
const baseUrl = `http://127.0.0.1:${port}`;
const boardPath = "content/boards/cosmoboard/current.canvas";
const original = await readFile(boardPath, "utf8");
const cosmoboardHtml = await readFile("cosmoboard.html", "utf8");
const sourceVersion = cosmoboardHtml.match(/data-board-source-version="([^"]+)"/)?.[1] || "";

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

const savedState = {
  nodes: [
    {
      id: "reload-save-marker",
      type: "text",
      x: 140,
      y: 120,
      width: 300,
      height: 160,
      text: "Saved through Ctrl+S and survived reload"
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, z: 1 }
};

const savedMeta = {
  slug: "cosmoboard",
  sourcePath: "content/boards/cosmoboard/current.canvas",
  sourceVersion,
  savedAt: "2026-04-24T00:00:00.000Z"
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  let downloadTriggered = false;
  page.on("download", () => {
    downloadTriggered = true;
  });

  await page.addInitScript(({ state, meta }) => {
    localStorage.setItem("board:cosmoboard", JSON.stringify(state));
    localStorage.setItem("board:cosmoboard:meta", JSON.stringify(meta));
    // Autosave OFF, or this suite proves nothing. It waits for a save POST
    // after Ctrl+S, and the 20 second autosave timer fires comfortably inside
    // waitForResponse's 30 second default. Measured with the whole Ctrl+S
    // branch deleted: zero POSTs within 1.5s of the keypress, then one at
    // 19.4s from the timer, and the suite went green. It stayed green through
    // the entire period when Ctrl+S opened a Save-As dialog and saved nothing.
    localStorage.setItem(
      "board:cosmoboard:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
  }, { state: savedState, meta: savedMeta });

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reload-save-marker");

  // Bounded to 4s on purpose. Ctrl+S is a synchronous user action, so its save
  // arrives immediately; anything slower than this is a background timer doing
  // the work and taking the credit, which is exactly how this suite went blind.
  const saveResponse = page.waitForResponse((response) =>
    response.url().includes("/api/save-board") && response.request().method() === "POST",
    { timeout: 4000 }
  );
  await page.keyboard.press("Control+S");
  const response = await saveResponse;
  assert.equal(response.status(), 200);
  assert.equal(downloadTriggered, false, "Ctrl+S should not download a .canvas file");

  const written = JSON.parse(await readFile(boardPath, "utf8"));
  assert.equal(written.nodes?.[0]?.text, "Saved through Ctrl+S and survived reload");

  await page.evaluate(() => {
    localStorage.removeItem("board:cosmoboard");
    localStorage.removeItem("board:cosmoboard:meta");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#reload-save-marker");
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
  await writeFile(boardPath, original, "utf8");
}

console.log("board save reload check passed");
