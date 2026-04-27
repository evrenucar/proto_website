import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4199;
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
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/braindump.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".bd-markdown-editor", { timeout: 15000 });

  // Install a temporary listener on the canvas viewport to detect whether the
  // wheel event propagated up that far (= would have triggered canvas zoom).
  await page.evaluate(() => {
    const vp = document.querySelector(".braindump-viewport");
    window.__wheelReachedViewport = false;
    window.__viewportWheelProbe = (e) => {
      // bubble-phase listener — if body called stopPropagation we won't see it
      window.__wheelReachedViewport = true;
    };
    vp.addEventListener("wheel", window.__viewportWheelProbe);
  });

  // Helper: dispatch a wheel event on the editor body, return how the event was handled
  // and whether the canvas viewport (parent) actually received it.
  const dispatchWheel = async ({ ctrlKey, deltaY, selectBlock, activateLine }) => {
    return await page.evaluate(({ ctrlKey, deltaY, selectBlock, activateLine }) => {
      const editor = document.querySelector(".bd-markdown-editor");
      const item = editor.closest(".bd-item");
      // Reset selection / focus / active state
      document.querySelectorAll(".bd-item.selected").forEach((n) => n.classList.remove("selected"));
      const prev = editor.querySelector(".bd-md-line--active");
      if (prev) prev.classList.remove("bd-md-line--active");
      if (document.activeElement && editor.contains(document.activeElement)) document.activeElement.blur();
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();

      if (selectBlock) item.classList.add("selected");
      if (activateLine) {
        const line = editor.querySelector(".bd-md-line");
        if (line) line.classList.add("bd-md-line--active");
        editor.focus({ preventScroll: true });
      }

      window.__wheelReachedViewport = false;

      const r = editor.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      // Dispatch on the editor itself (always exists). elementFromPoint can
      // miss when the editor is offscreen or covered.
      const ev = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY,
        clientX: x,
        clientY: y,
        ctrlKey,
      });
      editor.dispatchEvent(ev);

      return {
        defaultPrevented: ev.defaultPrevented,
        reachedViewport: window.__wheelReachedViewport,
      };
    }, { ctrlKey, deltaY, selectBlock, activateLine });
  };

  // 1. Pinch (ctrl+wheel) over a SELECTED block → canvas zoom (NOT page zoom)
  let r1 = await dispatchWheel({ ctrlKey: true, deltaY: 50, selectBlock: true, activateLine: false });
  assert.equal(r1.defaultPrevented, true, "pinch on selected block must preventDefault (otherwise browser page-zooms)");
  assert.equal(r1.reachedViewport, true, "pinch on selected block must reach viewport (canvas zoom)");

  // 2. Pinch over an UNSELECTED block → canvas zoom
  let r2 = await dispatchWheel({ ctrlKey: true, deltaY: 50, selectBlock: false, activateLine: false });
  assert.equal(r2.defaultPrevented, true, "pinch on unselected block must preventDefault");
  assert.equal(r2.reachedViewport, true, "pinch on unselected block must reach viewport");

  // 3. Plain wheel over a SELECTED block → body scrolls natively, NOT canvas zoom
  let r3 = await dispatchWheel({ ctrlKey: false, deltaY: 100, selectBlock: true, activateLine: false });
  assert.equal(r3.reachedViewport, false, "plain wheel on selected block must NOT reach viewport (body scrolls instead)");

  // 4. Plain wheel over an UNSELECTED block → canvas zoom
  let r4 = await dispatchWheel({ ctrlKey: false, deltaY: 100, selectBlock: false, activateLine: false });
  assert.equal(r4.defaultPrevented, true, "plain wheel on unselected block must preventDefault");
  assert.equal(r4.reachedViewport, true, "plain wheel on unselected block must reach viewport (canvas zoom)");

  // 5. Plain wheel over an EDITING block (active line + focused) → body scrolls, NOT canvas zoom
  let r5 = await dispatchWheel({ ctrlKey: false, deltaY: 100, selectBlock: false, activateLine: true });
  assert.equal(r5.reachedViewport, false, "plain wheel while editing must NOT reach viewport");

  // 6. Pinch while editing → still routes to canvas zoom (ctrlKey trumps editing state)
  let r6 = await dispatchWheel({ ctrlKey: true, deltaY: 50, selectBlock: false, activateLine: true });
  assert.equal(r6.defaultPrevented, true, "pinch while editing must preventDefault");
  assert.equal(r6.reachedViewport, true, "pinch while editing must reach viewport");

  // === Fullscreen view wheel routing ===
  // Open the fullscreen editor and verify it scrolls + suppresses page-zoom on pinch.
  const fsResults = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const fsBtn = document.querySelector(".bd-markdown-fullscreen-btn");
    fsBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await wait(500); // allow fetch + render + attachMarkdownEditor

    const fsBody = document.querySelector(".bd-markdown-fullscreen-body");
    if (!fsBody) return { error: "fullscreen body did not appear" };

    const dispatch = (ctrlKey, deltaY) => {
      const r = fsBody.getBoundingClientRect();
      const ev = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY,
        clientX: r.x + r.width / 2,
        clientY: r.y + r.height / 2,
        ctrlKey,
      });
      fsBody.dispatchEvent(ev);
      return { defaultPrevented: ev.defaultPrevented };
    };

    const focused = document.activeElement === fsBody;
    const editable = fsBody.contentEditable === "true";
    const overflowY = getComputedStyle(fsBody).overflowY;
    const canScroll = fsBody.scrollHeight > fsBody.clientHeight;

    // Plain wheel: should NOT preventDefault (so native scroll works) — we stopPropagation only
    const plain = dispatch(false, 100);
    // Pinch: should preventDefault (suppress page-zoom)
    const pinch = dispatch(true, 50);

    return { focused, editable, overflowY, canScroll, plain, pinch };
  });

  assert.equal(fsResults.editable, true, "fullscreen body must be editable");
  assert.equal(fsResults.overflowY, "auto", "fullscreen body must have overflow-y: auto");
  assert.equal(fsResults.canScroll, true, "fullscreen content must overflow (so scroll is meaningful)");
  assert.equal(fsResults.focused, true, "fullscreen body must auto-focus on open (no extra click needed to scroll/type)");
  assert.equal(fsResults.plain.defaultPrevented, false, "plain wheel in fullscreen must allow native scroll (no preventDefault)");
  assert.equal(fsResults.pinch.defaultPrevented, true, "pinch in fullscreen must preventDefault (suppress browser page-zoom)");

  console.log("markdown-wheel-routing: all 6 cases + fullscreen passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
