import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

import { chromium } from "playwright";

const port = 4195;
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

let browser;

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.removeItem("board:cosmoboard");
    localStorage.removeItem("board:cosmoboard:meta");
    localStorage.setItem("board:cosmoboard:settings", JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20 }));
  });

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("#cosmo-braindump .bd-board-preview-stage svg");

  await page.evaluate((url) => {
    const data = new DataTransfer();
    data.setData("text/plain", url);
    document.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));
  }, `${baseUrl}/content/boards/eurocrate-storage.html`);

  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("board:cosmoboard") || "{}");
    return state.nodes?.some((node) =>
      node.type === "board-preview" &&
      node.boardSlug === "eurocrate-storage" &&
      node.boardSource === "content/boards/projects/eurocrate-storage/current.canvas"
    );
  });

  const pastedPreview = page.locator(".bd-layer-board-preview", { hasText: "Eurocrate storage" }).last();
  await pastedPreview.locator(".bd-board-preview-stage svg").waitFor({ timeout: 5000 });

  const statusText = await pastedPreview.locator(".bd-board-preview-status").textContent().catch(() => "");
  assert.equal(statusText, "");
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
  await writeFile(boardPath, original, "utf8");
}

console.log("board URL paste preview check passed");
