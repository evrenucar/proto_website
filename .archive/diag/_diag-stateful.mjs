import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4204;
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
  await new Promise(r => setTimeout(r, 800));

  const findEmpty = async () => page.evaluate(() => {
    for (let y = 200; y < 800; y += 50) {
      for (let x = 200; x < 1300; x += 50) {
        const el = document.elementFromPoint(x, y);
        if (el?.classList?.contains("braindump-viewport")) return { x, y };
      }
    }
    return null;
  });

  const transformOf = async () => page.evaluate(() => {
    const c = document.querySelector(".braindump-canvas");
    const m = c?.style?.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)\s*scale\(([^)]+)\)/);
    return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
  });

  const measureZoom = async (sx, sy) => {
    const before = await transformOf();
    await page.mouse.move(sx, sy);
    await page.mouse.wheel(0, -120);
    await new Promise(r => setTimeout(r, 80));
    const after = await transformOf();
    if (!before || !after) return { error: "no transform" };
    const cx = (sx - before.tx) / before.z;
    const cy = (sy - before.ty) / before.z;
    const sxAfter = after.tx + cx * after.z;
    const syAfter = after.ty + cy * after.z;
    return { z0: before.z, z1: after.z, dx: Math.round((sxAfter - sx) * 10) / 10, dy: Math.round((syAfter - sy) * 10) / 10 };
  };

  const measureDrag = async () => {
    const empty = await findEmpty();
    if (!empty) return { skip: "no empty point" };
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + 200, empty.y + 200, { steps: 5 });
    const ssVisible = await page.evaluate(() => {
      const canvas = document.querySelector(".braindump-canvas");
      const ssBox = Array.from(canvas.children).find(el =>
        el.style?.border?.includes("3fdaca") || el.style?.backgroundColor?.includes("63, 218, 202"));
      return ssBox ? { display: ssBox.style.display, w: ssBox.style.width, h: ssBox.style.height } : null;
    });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 80));
    return { empty, ssVisible };
  };

  console.log("--- baseline (just loaded, no interaction yet) ---");
  console.log("zoom:", JSON.stringify(await measureZoom(700, 500)));
  console.log("drag:", JSON.stringify(await measureDrag()));

  console.log("\n--- after clicking into markdown body and back out ---");
  // Find the markdown body and click into a line
  const mdLine = await page.evaluate(() => {
    const editor = document.querySelector(".bd-markdown-editor");
    if (!editor) return null;
    const line = editor.querySelector(".bd-md-line");
    if (!line) return null;
    line.scrollIntoView({ block: "center" });
    return null;
  });
  await new Promise(r => setTimeout(r, 200));
  // Click into a markdown line
  const mdLineBox = await page.evaluate(() => {
    const line = document.querySelector(".bd-markdown-editor .bd-md-line");
    if (!line) return null;
    const r = line.getBoundingClientRect();
    return { x: Math.round(r.x + 30), y: Math.round(r.y + r.height / 2) };
  });
  if (mdLineBox) {
    await page.mouse.move(mdLineBox.x, mdLineBox.y);
    await page.mouse.click(mdLineBox.x, mdLineBox.y);
    await new Promise(r => setTimeout(r, 200));
    // Press Escape
    await page.keyboard.press("Escape");
    await new Promise(r => setTimeout(r, 200));
  }
  console.log("zoom:", JSON.stringify(await measureZoom(700, 500)));
  console.log("drag:", JSON.stringify(await measureDrag()));

  console.log("\n--- after open + close fullscreen ---");
  const fsBtn = await page.$(".bd-markdown-fullscreen-btn");
  if (fsBtn) {
    await fsBtn.click();
    await new Promise(r => setTimeout(r, 400));
    await page.keyboard.press("Escape");
    await new Promise(r => setTimeout(r, 300));
  }
  console.log("zoom:", JSON.stringify(await measureZoom(700, 500)));
  console.log("drag:", JSON.stringify(await measureDrag()));

} finally {
  if (browser) await browser.close();
  child.kill();
}
