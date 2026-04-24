import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import { chromium } from "playwright";

const port = 4186;
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
const watchUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s";

const state = {
  nodes: [
    {
      id: "youtube-live-regression",
      type: "link",
      x: 300,
      y: 120,
      width: 380,
      height: 180,
      url: watchUrl,
      embedMode: "preview",
      title: "YouTube test",
      description: "Video recommendation",
      image: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, z: 1 }
};

const meta = {
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
  }, { state, meta });

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle" });
  await page.locator("#youtube-live-regression .bd-bookmark-live-btn").click();
  await page.locator("#youtube-live-regression iframe.bd-embed-iframe").waitFor();

  const result = await page.evaluate(() => {
    const node = document.querySelector("#youtube-live-regression");
    const iframe = node.querySelector("iframe.bd-embed-iframe");
    const openLink = node.querySelector(".bd-embed-open-btn");

    return {
      iframeSrc: iframe?.getAttribute("src") || "",
      openHref: openLink?.getAttribute("href") || "",
      allow: iframe?.getAttribute("allow") || "",
      allowFullscreen: iframe?.hasAttribute("allowfullscreen") || false
    };
  });

  assert.equal(result.iframeSrc, "https://www.youtube.com/embed/dQw4w9WgXcQ?start=43");
  assert.equal(result.openHref, watchUrl);
  assert.match(result.allow, /accelerometer/);
  assert.match(result.allow, /autoplay/);
  assert.match(result.allow, /encrypted-media/);
  assert.match(result.allow, /picture-in-picture/);
  assert.equal(result.allowFullscreen, true);
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

console.log("youtube live embed check passed");
