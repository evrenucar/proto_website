import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4183;
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
    acceptDownloads: true,
    viewport: { width: 1440, height: 960 }
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__openedRecommendationUrls = [];
    window.open = (url) => {
      window.__openedRecommendationUrls.push(String(url));
      return null;
    };
  });

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("braindump:cosmoboard:recommendation-modal-dismissed");
  });

  await page.locator(".braindump-toolbar-action-desktop-only[data-tool='recommend']").click();
  await page.locator("#braindump-recommend-summary").fill("Add source metadata");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#braindump-recommend-submit").click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();

  assert.match(filename, /^cosmoboard_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.canvas\.json$/);

  await page.locator("#braindump-modal:not([hidden])").waitFor();
  await page.locator("#braindump-modal-confirm").click();
  await page.waitForFunction(() => window.__openedRecommendationUrls.length === 1);

  const openedUrl = await page.evaluate(() => window.__openedRecommendationUrls[0]);
  const issueUrl = new URL(openedUrl);
  const body = issueUrl.searchParams.get("body") || "";

  assert.equal(issueUrl.hostname, "github.com");
  assert.equal(issueUrl.pathname, "/evrenucar/proto_website/issues/new");
  assert.equal(issueUrl.searchParams.get("template"), "whiteboard-recommendation.md");
  assert.equal(issueUrl.searchParams.get("labels"), "recommendation,cosmoboard");
  assert.equal(issueUrl.searchParams.get("title"), "Recommendation: Cosmoboard (Add source metadata)");
  assert.match(body, /## Board slug\ncosmoboard/);
  assert.match(body, /## Board repo path\ncontent\/boards\/cosmoboard\/current\.canvas/);
  assert.match(body, new RegExp(`## Board file\\n${filename.replaceAll(".", "\\.")}`));
  assert.match(body, /## Short summary\nAdd source metadata/);
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

console.log("recommendation flow GitHub handoff check passed");
