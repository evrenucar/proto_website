import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";

import { chromium } from "playwright";

const port = 4198;
const baseUrl = `http://127.0.0.1:${port}`;
const markdownPath = "content/boards/cosmoboard/markdown/markdown-authoring-e2e.md";

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
  await page.waitForSelector('[data-tool="more"]', { timeout: 15000 });

  await page.locator('[data-tool="more"]').click();
  await page.locator('[data-tool="new-markdown"]').click();

  await page.locator("#braindump-markdown-title").fill("Markdown authoring e2e");
  await page.locator("#braindump-markdown-filename").fill("markdown-authoring-e2e.md");
  await page.locator("#braindump-markdown-body").fill("# Markdown authoring e2e\n\nFirst pass.");

  const createResponse = page.waitForResponse((response) =>
    response.url().includes("/api/save-markdown") && response.request().method() === "POST"
  );
  await page.locator("#braindump-markdown-save").click();
  assert.equal((await createResponse).status(), 200);

  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".bd-markdown-title")).some((el) =>
      String(el.textContent || "").includes("Markdown authoring e2e")
    ) &&
    document.body.innerText.includes("First pass.")
  );

  assert.equal(
    await readFile(markdownPath, "utf8"),
    "# Markdown authoring e2e\n\nFirst pass.\n"
  );

  const createdMarkdown = page.locator(".bd-layer-markdown").filter({ hasText: "Markdown authoring e2e" }).first();
  await createdMarkdown.locator(".bd-markdown-edit-btn").click();

  await page.locator("#braindump-markdown-body").fill("# Markdown authoring e2e\n\nSecond pass.");

  const editResponse = page.waitForResponse((response) =>
    response.url().includes("/api/save-markdown") && response.request().method() === "POST"
  );
  await page.locator("#braindump-markdown-save").click();
  assert.equal((await editResponse).status(), 200);

  await page.waitForFunction(() => document.body.innerText.includes("Second pass."));
  assert.equal(
    await readFile(markdownPath, "utf8"),
    "# Markdown authoring e2e\n\nSecond pass.\n"
  );
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
  if (originalMarkdown == null) {
    await rm(markdownPath, { force: true });
  } else {
    await writeFile(markdownPath, originalMarkdown, "utf8");
  }
}

console.log("markdown authoring browser flow check passed");
