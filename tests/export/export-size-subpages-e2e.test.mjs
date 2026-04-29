import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4196;
const baseUrl = `http://127.0.0.1:${port}`;

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

function parseEstimateBytes(value) {
  const match = String(value || "").match(/~([\d.]+)\s*(KB|MB)/);
  if (!match) return 0;
  const amount = Number(match[1]);
  return match[2] === "MB" ? amount * 1024 * 1024 : amount * 1024;
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
  });

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-board-ui="toolbar-more"]', { timeout: 15000 });
  await page.locator('[data-board-ui="toolbar-more"]').click();
  await page.locator('[data-tool="export"]').click();

  const estimate = page.locator("#braindump-export-size-estimate");
  await expectEstimateReady(page);
  const withSubpages = parseEstimateBytes(await estimate.textContent());

  await page.locator("#braindump-export-subpages").uncheck();
  await expectEstimateReady(page);
  const withoutSubpages = parseEstimateBytes(await estimate.textContent());

  assert.equal(withSubpages > withoutSubpages, true, "including linked boards and markdown should increase the estimated export size");
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

async function expectEstimateReady(page) {
  await page.waitForFunction(() => {
    const text = document.querySelector("#braindump-export-size-estimate")?.textContent || "";
    return /^~[\d.]+\s*(KB|MB)$/.test(text);
  });
}

console.log("export size subpages check passed");
