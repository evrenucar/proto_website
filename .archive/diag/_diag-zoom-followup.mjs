import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4202;
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

    // === Zoom-follows-pointer test ===
    // Take a known canvas point. Wheel at that point. The same canvas point should
    // remain fixed in screen coords (within rounding).
    const zoomResult = await page.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const vp = document.querySelector(".braindump-viewport");
      const canvas = vp.querySelector(".braindump-canvas");
      // Pick screen point (700, 500) — likely empty area on most boards
      const sx = 700, sy = 500;
      // Compute the canvas-space point under that screen point BEFORE the zoom
      const m1 = canvas.style.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)\s*scale\(([^)]+)\)/);
      if (!m1) return { error: "no initial transform" };
      const tx0 = parseFloat(m1[1]), ty0 = parseFloat(m1[2]), z0 = parseFloat(m1[3]);
      const cx = (sx - tx0) / z0;
      const cy = (sy - ty0) / z0;
      // Dispatch wheel at screen (sx, sy), zooming in
      vp.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120, clientX: sx, clientY: sy }));
      await wait(80);
      const m2 = canvas.style.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)\s*scale\(([^)]+)\)/);
      if (!m2) return { error: "no after transform" };
      const tx1 = parseFloat(m2[1]), ty1 = parseFloat(m2[2]), z1 = parseFloat(m2[3]);
      // Where is canvas point (cx, cy) on screen now?
      const sxAfter = tx1 + cx * z1;
      const syAfter = ty1 + cy * z1;
      return {
        z0, z1,
        zoomed: z0 !== z1,
        screenBefore: { x: sx, y: sy },
        screenAfter: { x: Math.round(sxAfter * 10) / 10, y: Math.round(syAfter * 10) / 10 },
        delta: { dx: Math.round((sxAfter - sx) * 10) / 10, dy: Math.round((syAfter - sy) * 10) / 10 },
      };
    });

    // === Drag-select test ===
    const dragResult = await page.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const vp = document.querySelector(".braindump-viewport");
      const canvas = vp.querySelector(".braindump-canvas");
      // Find a screen point that's truly empty (not over any bd-item)
      let emptyX = -1, emptyY = -1;
      for (let y = 200; y < 800 && emptyY === -1; y += 50) {
        for (let x = 200; x < 1300; x += 50) {
          const el = document.elementFromPoint(x, y);
          if (el?.classList?.contains("braindump-viewport")) {
            emptyX = x; emptyY = y; break;
          }
        }
      }
      if (emptyX === -1) return { skip: "no empty point on viewport" };

      // Count selected items before
      const selectedBefore = document.querySelectorAll(".bd-item.selected").length;

      // Dispatch mousedown → mousemove → mouseup directly on viewport
      vp.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: emptyX, clientY: emptyY, button: 0 }));
      await wait(40);
      // After mousedown, look for any newly-appended absolute-positioned div on canvas (the selection box)
      const ssBefore = canvas.children.length;
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX: emptyX + 200, clientY: emptyY + 200 }));
      await wait(40);
      const ssAfter = canvas.children.length;
      // The selection box has inline border style with color #3fdaca
      const ssBox = Array.from(canvas.children).find(el => el.style?.border?.includes("3fdaca") || el.style?.backgroundColor?.includes("63, 218, 202"));
      const ssBoxStyle = ssBox ? { display: ssBox.style.display, w: ssBox.style.width, h: ssBox.style.height } : null;
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: emptyX + 200, clientY: emptyY + 200 }));
      await wait(40);
      const selectedAfter = document.querySelectorAll(".bd-item.selected").length;

      return { emptyX, emptyY, selectedBefore, selectedAfter, ssBefore, ssAfter, ssBoxStyle };
    });

    console.log(`=== ${url} ===`);
    console.log("zoom:", JSON.stringify(zoomResult));
    console.log("drag:", JSON.stringify(dragResult));
  }
} finally {
  if (browser) await browser.close();
  child.kill();
}
