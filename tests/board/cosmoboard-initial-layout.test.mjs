// The cosmoboard opens with its title clear of the side nav and its demo cards
// not overlapping each other.
//
// This asserts the LAYOUT, so it serves the board's real content with a fixed
// camera rather than whatever camera is on disk. Merely panning a board marks it
// dirty, so an open tab autosaves its live camera into current.canvas, and a
// board without a defaultViewport then opens wherever that session was standing.
// Leaving that behaviour alone is a product decision, taken 2026-07-31 and
// recorded in .agents/todo.md; what it must not do is make this suite red at
// random, which it did. Pinning the camera here is the same trick the stage gate
// uses when it seeds the sandbox from a fixture: test the code, not the drift.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4184;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "cosmoboard", "current.canvas");
// The camera the board was committed with, which frames the title.
const FIXED_VIEWPORT = { x: 438.5862987850285, y: -714.4976659255917, z: 0.7820227919797041 };

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

  // Real nodes, fixed camera. Also refuse the save endpoint: this suite must
  // never be the thing that writes a camera back into the board.
  const boardOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
  const boardWithFixedCamera = { ...boardOnDisk, viewport: FIXED_VIEWPORT };
  await page.route("**/content/boards/cosmoboard/current.canvas*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(boardWithFixedCamera)
    })
  );
  await page.route("**/api/save-board*", (route) =>
    route.fulfill({ status: 503, body: "blocked by test" })
  );
  // A camera this visitor saved locally would win over the file, which is the
  // whole point of that precedence, but it would also defeat the fixed camera.
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.removeItem("board:cosmoboard");
    localStorage.removeItem("board:cosmoboard:meta");
  });

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
