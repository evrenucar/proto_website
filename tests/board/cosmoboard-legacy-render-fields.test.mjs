import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import { chromium } from "playwright";

const port = 4185;
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

const cosmoboardHtml = await readFile("cosmoboard.html", "utf8");
const sourceVersion = cosmoboardHtml.match(/data-board-source-version="([^"]+)"/)?.[1] || "";

const legacyState = {
  nodes: [
    {
      id: "legacy-board-preview",
      type: "board-preview",
      x: 120,
      y: 80,
      width: 320,
      height: 304,
      boardSlug: "braindump",
      file: "content/boards/braindump/current.canvas",
      boardHref: "braindump.html",
      title: "Braindump"
    },
    {
      id: "legacy-markdown",
      type: "markdown",
      x: 480,
      y: 80,
      width: 380,
      height: 420,
      source: "content/boards/cosmoboard/direction.md",
      title: "Cosmoboard direction",
      href: "content/boards/cosmoboard/direction.md"
    }
  ],
  edges: [],
  viewport: { x: 170, y: 0, z: 0.74 }
};

const legacyMeta = {
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  const page = await context.newPage();

  await page.addInitScript(({ state, meta }) => {
    localStorage.setItem("board:cosmoboard", JSON.stringify(state));
    localStorage.setItem("board:cosmoboard:meta", JSON.stringify(meta));
  }, { state: legacyState, meta: legacyMeta });

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const markdown = document.querySelector("#legacy-markdown");
    const boardPreview = document.querySelector("#legacy-board-preview");

    return {
      markdownText: markdown?.textContent || "",
      markdownBodyText: markdown?.querySelector(".bd-markdown-body")?.textContent || "",
      boardPreviewText: boardPreview?.textContent || "",
      boardPreviewSvgExists: Boolean(boardPreview?.querySelector(".bd-board-preview-stage svg")),
      boardPreviewStatus: boardPreview?.querySelector(".bd-board-preview-status")?.textContent || ""
    };
  });

  assert.match(result.markdownBodyText, /Core principles/);
  assert.equal(result.markdownText.includes("No file path set."), false);
  assert.equal(result.boardPreviewSvgExists, true);
  assert.equal(result.boardPreviewStatus, "");
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

console.log("cosmoboard legacy render fields check passed");
