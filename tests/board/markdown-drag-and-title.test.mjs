import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4207;
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

  // /braindump.html spawns a small markdown sample on a clean canvas.
  await page.goto(`${baseUrl}/braindump.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".bd-layer-markdown", { timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));

  // --- Title CSS fix: span hugs its content (flex: 0 1 auto), not flex: 1 1 0 ---
  const titleStyle = await page.evaluate(() => {
    const t = document.querySelector(".bd-layer-markdown .bd-markdown-title");
    if (!t) return null;
    const cs = getComputedStyle(t);
    return { flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, flexBasis: cs.flexBasis };
  });
  assert.ok(titleStyle, "found a .bd-markdown-title");
  assert.equal(titleStyle.flexGrow, "0", "title must not flex-grow (so empty header space stays draggable)");
  assert.equal(titleStyle.flexShrink, "1", "title must shrink for ellipsis");
  assert.equal(titleStyle.flexBasis, "auto", "title basis must be content size");

  // Helper: simulate a click sequence by dispatching native MouseEvents at a
  // given target's center. Avoids reliance on elementFromPoint (bd-items can
  // sit outside the viewport at default camera position). The events bubble
  // through the same listeners (body.mousedown, bd-item.mousedown, window
  // mousemove/mouseup) that real input would hit.
  const simulate = ({ down, move, up, dblclick }, itemId, targetSel) => {
    return page.evaluate(({ down, move, up, dblclick, itemId, targetSel }) => {
      const item = document.getElementById(itemId);
      const target = item.querySelector(targetSel);
      const r = target.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const fire = (type, el, dx = 0, dy = 0) => {
        const ev = new MouseEvent(type, {
          bubbles: true, cancelable: true, button: 0, buttons: type === "mouseup" ? 0 : 1,
          clientX: cx + dx, clientY: cy + dy,
          view: window,
        });
        el.dispatchEvent(ev);
      };
      if (down) fire("mousedown", target);
      if (move) fire("mousemove", window, move.dx, move.dy);
      if (up) {
        const upTarget = move ? document.elementFromPoint(cx + (move?.dx ?? 0), cy + (move?.dy ?? 0)) || document.body : target;
        fire("mouseup", upTarget, move?.dx ?? 0, move?.dy ?? 0);
      }
      if (dblclick) fire("dblclick", target);
    }, { down, move, up, dblclick, itemId, targetSel });
  };

  const reset = (itemId) => page.evaluate((itemId) => {
    document.querySelectorAll(".bd-item.selected").forEach(n => n.classList.remove("selected"));
    document.querySelectorAll(".bd-md-line--active").forEach(n => n.classList.remove("bd-md-line--active"));
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    const item = document.getElementById(itemId);
    // Re-render any input back to span by blurring (commits via blur handler).
    const renameInput = item?.querySelector("input.bd-markdown-title");
    renameInput?.blur();
  }, itemId);

  const itemId = await page.evaluate(() => document.querySelector(".bd-item.bd-layer-markdown")?.id);
  assert.ok(itemId, "found a markdown bd-item");

  // 1) Click body of unselected markdown — should select item but NOT activate any line
  await reset(itemId);
  await simulate({ down: true, up: true }, itemId, ".bd-markdown-body");
  await new Promise(r => setTimeout(r, 60));

  const afterClick = await page.evaluate((id) => {
    const item = document.getElementById(id);
    return {
      selected: item?.classList.contains("selected"),
      activeLines: item?.querySelectorAll(".bd-md-line--active").length ?? -1,
    };
  }, itemId);
  assert.equal(afterClick.selected, true, "click on unselected markdown body should select the item");
  assert.equal(afterClick.activeLines, 0, "click on unselected markdown body must NOT activate a line (drag must take precedence)");

  // 2) Drag from body — item should move
  await reset(itemId);
  const before = await page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: r.x, y: r.y };
  }, itemId);

  await simulate({ down: true, move: { dx: 120, dy: 75 }, up: true }, itemId, ".bd-markdown-body");
  await new Promise(r => setTimeout(r, 80));

  const after = await page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: r.x, y: r.y };
  }, itemId);
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  assert.ok(Math.abs(dx) > 60 && Math.abs(dy) > 30,
    `click+drag from inside body should drag the item. dx=${dx} dy=${dy}`);

  // 3) Single-click on title does NOT swap to input
  await reset(itemId);
  await simulate({ down: true, up: true }, itemId, ".bd-markdown-title");
  await new Promise(r => setTimeout(r, 60));

  const afterTitleClick = await page.evaluate((id) => {
    return { hasInput: !!document.getElementById(id).querySelector("input.bd-markdown-title") };
  }, itemId);
  assert.equal(afterTitleClick.hasInput, false, "single-click on title must NOT swap to input");

  // 4) Double-click on title DOES swap to input
  await simulate({ dblclick: true }, itemId, ".bd-markdown-title");
  await new Promise(r => setTimeout(r, 60));

  const afterTitleDbl = await page.evaluate((id) => {
    return { hasInput: !!document.getElementById(id).querySelector("input.bd-markdown-title") };
  }, itemId);
  assert.equal(afterTitleDbl.hasInput, true, "double-click on title must swap to input for editing");

  console.log("markdown-drag-and-title: passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
