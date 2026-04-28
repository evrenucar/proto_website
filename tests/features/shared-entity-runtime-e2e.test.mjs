import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4187;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(process.cwd(), ".tmp", "shared-entity-e2e");

const { build } = await import(new URL(`../../scripts/build-site.mjs?test=${Date.now()}`, import.meta.url));
await build();
await mkdir(outDir, { recursive: true });

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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("board:cosmoboard");
    localStorage.removeItem("board:cosmoboard:meta");
  });
  await page.reload({ waitUntil: "networkidle" });

  await page.locator("#cosmo-entity-eurocrate .bd-entity-title").waitFor();
  await page.locator("#cosmo-projects-base .bd-base-table").waitFor();
  await page.screenshot({ path: path.join(outDir, "cosmoboard-shared-entity.png"), fullPage: true });

  const result = await page.evaluate(() => {
    const entity = document.querySelector("#cosmo-entity-eurocrate");
    const base = document.querySelector("#cosmo-projects-base");

    return {
      entityTitle: entity?.querySelector(".bd-entity-title")?.textContent?.trim() || "",
      entitySummary: entity?.querySelector(".bd-entity-summary")?.textContent?.trim() || "",
      entityBadge: entity?.querySelector(".bd-entity-badge")?.textContent?.trim() || "",
      entityRefs: Array.from(entity?.querySelectorAll(".bd-entity-ref") || []).map((ref) => ref.textContent.trim()),
      baseText: base?.textContent || ""
    };
  });

  assert.equal(result.entityTitle, "Eurocrate storage system");
  assert.match(result.entitySummary, /Reusable project entity/);
  assert.equal(result.entityBadge, "project");
  assert.equal(result.entityRefs.some((text) => /Project/.test(text)), true);
  assert.equal(result.entityRefs.some((text) => /Board/.test(text)), true);
  assert.match(result.baseText, /Eurocrate storage system/);
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

console.log("shared entity runtime check passed");
