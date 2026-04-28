import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4201;
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
    await new Promise(r => setTimeout(r, 800)); // allow nodes to render

    const result = await page.evaluate(() => {
      const vp = document.querySelector(".braindump-viewport");
      const vpRect = vp.getBoundingClientRect();
      // Sample several points across the viewport and see what elementFromPoint returns
      const samples = [];
      const xs = [100, 500, 900, 1300];
      const ys = [200, 400, 600, 800];
      for (const x of xs) for (const y of ys) {
        const el = document.elementFromPoint(x, y);
        const inItem = el?.closest?.(".bd-item");
        samples.push({ x, y, tag: el?.tagName, cls: (el?.className||"").toString().slice(0,40), insideBdItem: !!inItem, itemId: inItem?.dataset?.id });
      }
      // How many items, at what bounding extent?
      const items = Array.from(document.querySelectorAll(".bd-item"));
      const itemBounds = items.map(it => {
        const r = it.getBoundingClientRect();
        return { id: it.dataset?.id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), type: it.dataset?.type || (it.className.match(/bd-layer-(\w+)/)||[])[1] };
      });
      // Are there any items covering the full viewport?
      const huge = itemBounds.filter(b => b.w > 800 && b.h > 600);
      return {
        vpRect: { x: vpRect.x, y: vpRect.y, w: vpRect.width, h: vpRect.height },
        backgroundClickPoints: samples.filter(s => !s.insideBdItem).length,
        bdItemClickPoints: samples.filter(s => s.insideBdItem).length,
        sample: samples.slice(0, 6),
        totalItems: items.length,
        hugeItems: huge.slice(0, 5),
      };
    });
    console.log(`=== ${url} ===`);
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  if (browser) await browser.close();
  child.kill();
}
