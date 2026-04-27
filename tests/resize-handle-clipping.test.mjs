import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4205;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("preview server did not start")), 10000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) { clearTimeout(t); resolve(); }
    });
    child.on("exit", (code) => { clearTimeout(t); reject(new Error(`server exited code ${code}`)); });
  });
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
try {
  await waitForServer(child);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();

  await page.goto(`${baseUrl}/cosmoboard.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".braindump-viewport", { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));

  const result = await page.evaluate(() => {
    const probe = (item) => {
      if (!item) return null;
      const handle = item.querySelector(".resize-handle");
      if (!handle) return { error: "no resize handle" };
      // Force the handle to display so we can measure
      item.classList.add("selected");
      // Set viewport mode so the handle shows
      const vp = document.querySelector(".braindump-viewport");
      vp.dataset.mode = "select";
      // Read computed styles
      const itemCs = getComputedStyle(item);
      const innerShell = item.querySelector(".bd-markdown-shell, .bd-base-shell");
      const shellCs = innerShell ? getComputedStyle(innerShell) : null;
      const handleCs = getComputedStyle(handle);
      const dotCs = getComputedStyle(handle, "::after");
      const itemRect = item.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      // The dot is positioned via ::after — its rect can be inferred from
      // handle position + ::after offsets.
      return {
        kind: item.className.match(/bd-layer-(\w+)/)?.[1],
        item: { overflow: itemCs.overflow, w: Math.round(itemRect.width), h: Math.round(itemRect.height) },
        innerShell: shellCs ? { overflow: shellCs.overflow, br: shellCs.borderRadius } : null,
        handle: { display: handleCs.display, w: handleRect.width, h: handleRect.height, zIndex: handleCs.zIndex },
        // Verify handle extends OUTSIDE the bd-item bottom-right corner
        handleStraddlesCorner: handleRect.right > itemRect.right - 1 && handleRect.bottom > itemRect.bottom - 1,
        handleHalfOutside: (handleRect.right - itemRect.right) > 0 && (handleRect.bottom - itemRect.bottom) > 0,
      };
    };

    const md = document.querySelector(".bd-item.bd-layer-markdown");
    const base = document.querySelector(".bd-item.bd-layer-base");
    return { markdown: probe(md), base: probe(base) };
  });

  console.log(JSON.stringify(result, null, 2));

  // Markdown node: outer must NOT clip overflow; inner shell must clip + have rounded corners
  if (result.markdown && !result.markdown.error) {
    assert.equal(result.markdown.item.overflow, "visible", "markdown bd-item must have overflow:visible (so handle isn't clipped)");
    assert.equal(result.markdown.innerShell.overflow, "hidden", "markdown inner shell must clip content");
    assert.notEqual(result.markdown.innerShell.br, "0px", "markdown inner shell must inherit border-radius");
    assert.equal(result.markdown.handle.display, "block", "selected markdown must show resize handle");
    assert.equal(result.markdown.handleHalfOutside, true, "resize handle must extend past bd-item corner (so it's grabbable)");
  }

  // Base node: same checks (only if a base node exists on the canvas)
  if (result.base && !result.base.error) {
    assert.equal(result.base.item.overflow, "visible", "base bd-item must have overflow:visible");
    assert.equal(result.base.innerShell.overflow, "hidden", "base inner shell must clip content");
    assert.notEqual(result.base.innerShell.br, "0px", "base inner shell must inherit border-radius");
    assert.equal(result.base.handle.display, "block", "selected base must show resize handle");
    assert.equal(result.base.handleHalfOutside, true, "resize handle must extend past bd-item corner");
  }

  console.log("resize-handle-clipping: passed (markdown" + (result.base ? " + base" : "") + ")");
} finally {
  if (browser) await browser.close();
  child.kill();
}
