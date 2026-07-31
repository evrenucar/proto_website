// Stage-gate suite on the sandbox board (/content/boards/test-board.html).
//
// One fast pass over the basics: load, camera, zoom, drag, undo, resize, text
// editing, markdown rendering, and the developer-mode overlay. Deep coverage
// of each area lives in its own suite; this file exists so any stage of work
// can be gated on "the basics still hold" in under a minute.
//
// Uses real mouse and keyboard events, not synthetic dispatch, so the whole
// input pipeline is exercised, including the board's interaction relay.
// Autosave is disabled before any page script runs, and the sandbox files are
// backed up and restored, so a run leaves the tree clean.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4210;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const notesPath = path.join(process.cwd(), "content", "boards", "test-board", "notes.md");

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

const canvasBackup = await readFile(canvasPath, "utf8");
const notesBackup = await readFile(notesPath, "utf8");

// Seed the canonical sandbox state before the run. The sandbox invites free
// play, so the on-disk files drift; the gate must not depend on what a user
// left behind. The finally block puts their state back untouched.
const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
await writeFile(canvasPath, await readFile(path.join(fixturesDir, "test-board-seed.canvas"), "utf8"), "utf8");
await writeFile(notesPath, await readFile(path.join(fixturesDir, "test-board-seed-notes.md"), "utf8"), "utf8");

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
  await context.addInitScript(() => {
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url || "";
    // Only errors from our own origin count; embeds bring their own noise.
    if (!url || url.startsWith(baseUrl)) pageErrors.push(msg.text());
  });

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-note-md", { timeout: 15000 });

  // --- A: load renders every node ---
  const ids = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".bd-item")).map((el) => el.id).sort()
  );
  assert.deepEqual(
    ids,
    ["test-instructions", "test-link", "test-note-md", "test-text", "test-title", "test-vnc"],
    "A: all six nodes must render"
  );

  // --- B: the default viewport is applied to the canvas transform ---
  const transform = await page.evaluate(
    () => document.querySelector(".braindump-canvas").style.transform
  );
  assert.equal(transform, "translate(40px, 100px) scale(0.9)", "B: default viewport must be applied");

  // --- C: wheel zoom changes the camera and the transform ---
  const zoom = await page.evaluate(() => {
    const viewport = document.querySelector(".braindump-viewport");
    const before = document.querySelector(".braindump-canvas").style.transform;
    viewport.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -240, clientX: 700, clientY: 480, bubbles: true, cancelable: true })
    );
    const after = document.querySelector(".braindump-canvas").style.transform;
    return { before, after };
  });
  assert.notEqual(zoom.after, zoom.before, "C: wheel must change the transform");
  const scaleOf = (t) => Number(/scale\(([\d.]+)\)/.exec(t)?.[1]);
  assert.ok(
    scaleOf(zoom.after) > scaleOf(zoom.before),
    `C: zooming in must raise the scale (${scaleOf(zoom.before)} -> ${scaleOf(zoom.after)})`
  );

  // --- D: drag moves a node, undo puts it back ---
  const textBox = await page.locator("#test-text").boundingBox();
  const posBefore = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  await page.mouse.move(textBox.x + 30, textBox.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(textBox.x + 30 + i * 15, textBox.y + 10 + i * 10);
  }
  await page.mouse.up();
  const posAfterDrag = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top, selected: el.classList.contains("selected") };
  });
  assert.notEqual(posAfterDrag.left, posBefore.left, "D: drag must move the node");
  assert.equal(posAfterDrag.selected, true, "D: dragging must select the node");

  await page.keyboard.press("Control+z");
  const posAfterUndo = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  assert.deepEqual(posAfterUndo, posBefore, "D: undo must restore the exact position");

  // --- E: corner-handle resize grows the node, undo restores it ---
  const widthBefore = await page.evaluate(() => document.getElementById("test-text").style.width);
  const box = await page.locator("#test-text").boundingBox();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(box.x + box.width - 8 + i * 12, box.y + box.height - 8 + i * 8);
  }
  await page.mouse.up();
  const widthAfter = await page.evaluate(() => document.getElementById("test-text").style.width);
  assert.notEqual(widthAfter, widthBefore, "E: resize must change the width");

  await page.keyboard.press("Control+z");
  const widthUndone = await page.evaluate(() => document.getElementById("test-text").style.width);
  assert.equal(widthUndone, widthBefore, "E: undo must restore the width");

  // --- F: double click edits a text node ---
  const textBox2 = await page.locator("#test-text").boundingBox();
  await page.mouse.dblclick(textBox2.x + textBox2.width / 2, textBox2.y + textBox2.height / 2);
  await page.waitForFunction(() => {
    const ta = document.querySelector("#test-text .bd-text-editor");
    return ta && ta.contentEditable === "true" && document.activeElement === ta;
  }, { timeout: 5000 });
  await page.keyboard.type(" typed123");
  await page.keyboard.press("Escape");
  const textContent = await page.evaluate(
    () => document.querySelector("#test-text .bd-text-editor").textContent
  );
  assert.ok(textContent.includes("typed123"), "F: typed text must land in the node");

  // --- G: the markdown note renders its file content as lines ---
  const md = await page.evaluate(() => {
    const note = document.getElementById("test-note-md");
    return {
      hasEditor: !!note.querySelector(".bd-markdown-editor"),
      text: note.textContent || "",
    };
  });
  assert.equal(md.hasEditor, true, "G: markdown note must mount its editor");
  assert.ok(md.text.includes("Caret check line"), "G: markdown content must render");

  // --- H: developer mode overlay appears, reads an FPS, and tears down ---
  // The gear lives behind the "more" disclosure, so open that first, like a user would.
  const gearVisible = await page.locator('[data-tool="settings"]').isVisible();
  if (!gearVisible) await page.click('[data-board-ui="toolbar-more"]');
  await page.click('[data-tool="settings"]');
  await page.waitForSelector("#braindump-setting-dev-mode", { timeout: 5000 });
  await page.check("#braindump-setting-dev-mode");
  await page.waitForFunction(() => {
    const fps = document.querySelector('.bd-dev-overlay [data-dev="fps"]');
    return fps && Number(fps.textContent) > 0;
  }, { timeout: 5000 });
  const overlayReads = await page.evaluate(() => {
    const read = (key) =>
      document.querySelector(`.bd-dev-overlay [data-dev="${key}"]`)?.textContent || "";
    return { camera: read("camera"), zoom: read("zoom"), items: read("items") };
  });
  assert.match(overlayReads.zoom, /^\d+%$/, "H: overlay must read a zoom percentage");
  assert.ok(overlayReads.items.includes("6 nodes"), "H: overlay must count the six nodes");
  await page.uncheck("#braindump-setting-dev-mode");
  const overlayGone = await page.evaluate(() => !document.querySelector(".bd-dev-overlay"));
  assert.equal(overlayGone, true, "H: unticking must remove the overlay");

  // --- I: no page errors from our own code across the whole run ---
  assert.deepEqual(pageErrors, [], "I: the run must produce no page errors");

  console.log("test-board basics: all 9 stage-gate cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
  await writeFile(canvasPath, canvasBackup, "utf8");
  await writeFile(notesPath, notesBackup, "utf8");
}
