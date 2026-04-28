import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4186;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(process.cwd(), ".tmp", "youtube-live-embed");

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
const watchUrl = "https://www.youtube.com/watch?v=1CLEPpCOnoI&t=43s";
const liveUrl = "https://www.youtube.com/live/1CLEPpCOnoI?si=canvas-live-test&t=43s";

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
      image: "https://i.ytimg.com/vi/1CLEPpCOnoI/hqdefault.jpg"
    },
    {
      id: "youtube-live-url-regression",
      type: "link",
      x: 940,
      y: 120,
      width: 380,
      height: 180,
      url: liveUrl,
      embedMode: "preview",
      title: "YouTube live URL test",
      description: "Video recommendation",
      image: "https://i.ytimg.com/vi/1CLEPpCOnoI/hqdefault.jpg"
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
  await mkdir(outDir, { recursive: true });
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
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outDir, "canvas-youtube-live.png"), fullPage: true });

  const result = await page.evaluate(() => {
    const node = document.querySelector("#youtube-live-regression");
    const iframe = node.querySelector("iframe.bd-embed-iframe");
    const openLink = node.querySelector(".bd-embed-open-btn");
    const rect = iframe?.getBoundingClientRect();

    return {
      iframeSrc: iframe?.getAttribute("src") || "",
      openHref: openLink?.getAttribute("href") || "",
      allow: iframe?.getAttribute("allow") || "",
      allowFullscreen: iframe?.hasAttribute("allowfullscreen") || false,
      referrerPolicy: iframe?.getAttribute("referrerpolicy") || "",
      width: rect?.width || 0,
      height: rect?.height || 0
    };
  });

  assert.equal(result.iframeSrc, "https://www.youtube-nocookie.com/embed/1CLEPpCOnoI?start=43");
  assert.equal(result.openHref, watchUrl);
  assert.match(result.allow, /accelerometer/);
  assert.match(result.allow, /autoplay/);
  assert.match(result.allow, /encrypted-media/);
  assert.match(result.allow, /picture-in-picture/);
  assert.equal(result.allowFullscreen, true);
  assert.equal(result.referrerPolicy, "strict-origin-when-cross-origin");
  assert.equal(result.width > 300, true);
  assert.equal(result.height > 120, true);

  await page.locator("#youtube-live-url-regression .bd-bookmark-live-btn").click();
  await page.locator("#youtube-live-url-regression iframe.bd-embed-iframe").waitFor();
  const liveResult = await page.evaluate(() => {
    const iframe = document.querySelector("#youtube-live-url-regression iframe.bd-embed-iframe");
    return iframe?.getAttribute("src") || "";
  });

  assert.equal(liveResult, "https://www.youtube-nocookie.com/embed/1CLEPpCOnoI?start=43");
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

console.log("youtube live embed check passed");
