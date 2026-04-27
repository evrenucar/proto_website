import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4184;
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

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
  await page.locator("#cosmo-title").waitFor();

  const layout = await page.evaluate(() => {
    function rectFor(selector) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    }

    return {
      nav: rectFor(".sidenav"),
      title: rectFor("#cosmo-title"),
      origin: rectFor("#cosmo-origin"),
      braindump: rectFor("#cosmo-braindump"),
      github: rectFor("#cosmo-github"),
      base: rectFor("#cosmo-projects-base"),
      embed: rectFor("#cosmo-embed-test-1")
    };
  });

  const visibleLeft = layout.nav.right + 24;
  assert.ok(layout.title.left >= visibleLeft, `title starts at ${layout.title.left}, expected at least ${visibleLeft}`);
  assert.ok(layout.origin.left >= visibleLeft, `first card starts at ${layout.origin.left}, expected at least ${visibleLeft}`);
  assert.ok(layout.braindump.left >= visibleLeft, `board preview starts at ${layout.braindump.left}, expected at least ${visibleLeft}`);
  assert.equal(overlaps(layout.base, layout.braindump), false, "base demo does not overlap the starter board preview");
  assert.equal(overlaps(layout.embed, layout.github), false, "embed demo does not overlap the GitHub starter card");
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
}

console.log("cosmoboard initial desktop layout check passed");
