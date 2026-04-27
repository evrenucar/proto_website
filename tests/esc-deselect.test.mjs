import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4200;
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

  // Case A: ESC while editing markdown → exits editing AND deselects bd-item
  const caseA = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const editor = document.querySelector(".bd-markdown-editor");
    const item = editor.closest(".bd-item");
    const line = editor.querySelector(".bd-md-line");
    const r = line.getBoundingClientRect();
    line.dispatchEvent(new MouseEvent("mousedown", { bubbles:true, cancelable:true, clientX:r.x+10, clientY:r.y+r.height/2, button:0, detail:1 }));
    line.dispatchEvent(new MouseEvent("mouseup",   { bubbles:true, cancelable:true, clientX:r.x+10, clientY:r.y+r.height/2, button:0 }));
    await wait(120);
    const before = {
      hasActiveLine: !!editor.querySelector(".bd-md-line--active"),
      itemSelected: item.classList.contains("selected"),
    };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await wait(120);
    return {
      before,
      after: {
        hasActiveLine: !!editor.querySelector(".bd-md-line--active"),
        itemSelected: item.classList.contains("selected"),
      },
    };
  });
  assert.equal(caseA.before.hasActiveLine, true, "A: precondition active line");
  assert.equal(caseA.before.itemSelected, true, "A: precondition bd-item selected");
  assert.equal(caseA.after.hasActiveLine, false, "A: ESC must clear active line");
  assert.equal(caseA.after.itemSelected, false, "A: ESC must deselect bd-item");

  // Case B: ESC with markdown bd-item only selected (no editing) → deselects
  const caseB = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const editor = document.querySelector(".bd-markdown-editor");
    const item = editor.closest(".bd-item");
    document.querySelectorAll(".bd-item.selected").forEach(n => n.classList.remove("selected"));
    item.classList.add("selected");
    const before = { itemSelected: item.classList.contains("selected") };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await wait(60);
    return { before, after: { itemSelected: item.classList.contains("selected") } };
  });
  assert.equal(caseB.before.itemSelected, true, "B: precondition selected");
  assert.equal(caseB.after.itemSelected, false, "B: ESC must deselect bd-item with no editing");

  // Case C: ESC with multiple bd-items selected (any types) → deselects all
  const caseC = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const items = Array.from(document.querySelectorAll(".bd-item")).slice(0, 3);
    document.querySelectorAll(".bd-item.selected").forEach(n => n.classList.remove("selected"));
    items.forEach(it => it.classList.add("selected"));
    const before = document.querySelectorAll(".bd-item.selected").length;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await wait(60);
    return { before, after: document.querySelectorAll(".bd-item.selected").length };
  });
  assert.equal(caseC.before, 3, "C: precondition 3 selected");
  assert.equal(caseC.after, 0, "C: ESC must clear all selection");

  // Case D: ESC blurs a focused bd-text-editor (if any text bd-items exist)
  const caseD = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const textEditor = document.querySelector(".bd-text-editor");
    if (!textEditor) return { skipped: true };
    const item = textEditor.closest(".bd-item");
    item?.classList.add("selected");
    textEditor.contentEditable = "true";
    textEditor.focus();
    const before = {
      focused: document.activeElement === textEditor,
      itemSelected: item?.classList.contains("selected") ?? false,
    };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await wait(60);
    return {
      skipped: false,
      before,
      after: {
        focused: document.activeElement === textEditor,
        itemSelected: item?.classList.contains("selected") ?? false,
      },
    };
  });
  if (!caseD.skipped) {
    assert.equal(caseD.before.focused, true, "D: precondition focused");
    assert.equal(caseD.after.focused, false, "D: ESC must blur bd-text-editor");
    assert.equal(caseD.after.itemSelected, false, "D: ESC must deselect text bd-item too");
  }

  // Case E: ESC with no selection / no editing → no-op (no errors)
  const caseE = await page.evaluate(async () => {
    document.querySelectorAll(".bd-item.selected").forEach(n => n.classList.remove("selected"));
    if (document.activeElement?.blur) document.activeElement.blur();
    let threw = false;
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    } catch (e) {
      threw = true;
    }
    return { threw, selected: document.querySelectorAll(".bd-item.selected").length };
  });
  assert.equal(caseE.threw, false, "E: ESC with nothing selected must not throw");
  assert.equal(caseE.selected, 0, "E: still nothing selected");

  console.log("esc-deselect: all 5 cases passed (D was " + (caseD?.skipped ? "skipped" : "run") + ")");
} finally {
  if (browser) await browser.close();
  child.kill();
}
