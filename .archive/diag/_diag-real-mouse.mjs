import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4203;
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

  for (const url of ["braindump.html", "cosmoboard.html"]) {
    await page.goto(`${baseUrl}/${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".braindump-viewport", { timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));

    // Find empty viewport background point
    const empty = await page.evaluate(() => {
      for (let y = 200; y < 800; y += 50) {
        for (let x = 200; x < 1300; x += 50) {
          const el = document.elementFromPoint(x, y);
          if (el?.classList?.contains("braindump-viewport")) return { x, y };
        }
      }
      return null;
    });

    // === REAL wheel zoom test ===
    const tx0 = await page.evaluate(() => {
      const c = document.querySelector(".braindump-canvas");
      const m = c?.style?.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)\s*scale\(([^)]+)\)/);
      return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
    });
    // Move pointer to (700, 500), then wheel zoom in
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, -120);
    await new Promise(r => setTimeout(r, 80));
    const tx1 = await page.evaluate(() => {
      const c = document.querySelector(".braindump-canvas");
      const m = c?.style?.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)\s*scale\(([^)]+)\)/);
      return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
    });
    // Where is canvas point under (700,500) before, after?
    const cx = (700 - tx0.tx) / tx0.z;
    const cy = (500 - tx0.ty) / tx0.z;
    const sxAfter = tx1.tx + cx * tx1.z;
    const syAfter = tx1.ty + cy * tx1.z;
    const zoomDeltaPx = { dx: Math.round((sxAfter - 700) * 10) / 10, dy: Math.round((syAfter - 500) * 10) / 10 };

    // === REAL drag-select test ===
    let dragResult;
    if (!empty) {
      dragResult = { skip: "no empty point" };
    } else {
      const before = await page.evaluate(() => document.querySelectorAll(".bd-item.selected").length);
      // Drag from empty point to empty+250,250
      await page.mouse.move(empty.x, empty.y);
      await page.mouse.down();
      await page.mouse.move(empty.x + 300, empty.y + 300, { steps: 5 });
      // Check if a selection box appeared
      const ssVisible = await page.evaluate(() => {
        const canvas = document.querySelector(".braindump-canvas");
        const ssBox = Array.from(canvas.children).find(el =>
          el.style?.border?.includes("3fdaca") || el.style?.backgroundColor?.includes("63, 218, 202"));
        if (!ssBox) return null;
        return { display: ssBox.style.display, w: ssBox.style.width, h: ssBox.style.height };
      });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 80));
      const after = await page.evaluate(() => document.querySelectorAll(".bd-item.selected").length);
      dragResult = { empty, before, after, ssVisible };
    }

    console.log(`=== ${url} ===`);
    console.log("zoom z:", tx0.z, "→", tx1.z, "| cursor-stayed-fixed delta:", JSON.stringify(zoomDeltaPx));
    console.log("drag:", JSON.stringify(dragResult));
  }
} finally {
  if (browser) await browser.close();
  child.kill();
}
