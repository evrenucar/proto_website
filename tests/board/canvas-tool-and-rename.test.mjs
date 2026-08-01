// Canvas tool, nesting, and rename.
//
// Every assertion here is about something a person can see or a file you can
// open: a .canvas that exists on disk with an id in it, a child board's real
// nodes drawn inside the parent, a note whose .md carries the embed, and a
// referring board that still renders its child after the child's file has been
// renamed underneath it. Nothing asserts that a handler fired.
//
// Sandbox: content/boards/test-board only. current.canvas is restored from the
// seed fixture, notes.md is restored from its snapshot, and every .canvas this
// test creates is deleted, all in the finally block.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4265;
const baseUrl = `http://127.0.0.1:${port}`;
const root = process.cwd();
const boardDir = path.join(root, "content", "boards", "test-board");
const seedPath = path.join(root, "tests", "fixtures", "test-board-seed.canvas");
const boardPath = path.join(boardDir, "current.canvas");
const notesPath = path.join(boardDir, "notes.md");

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("preview server did not start")), 10000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) { clearTimeout(t); resolve(); }
    });
    child.on("exit", (code) => { clearTimeout(t); reject(new Error(`server exited code ${code}`)); });
  });
}

const sidecars = async () =>
  (await readdir(boardDir)).filter((f) => f.endsWith(".canvas") && f !== "current.canvas");

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

// The note is the one fixture we mutate that has no seed of its own.
const notesBefore = await readFile(notesPath, "utf8");
await copyFile(seedPath, boardPath);
for (const stale of await sidecars()) await unlink(path.join(boardDir, stale));

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
let created = [];
try {
  await waitForServer(child);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message)));

  const openBoard = async (target = page) => {
    await target.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await target.waitForSelector("#braindump-viewport", { timeout: 15000 });
    await target.waitForTimeout(900);
  };

  const clickCanvasTool = async (target = page) => {
    await target.click('[data-board-ui="toolbar-more"]');
    await target.waitForTimeout(150);
    await target.click('[data-tool="new-canvas"]');
    await target.waitForTimeout(1000);
  };

  await openBoard();

  // ---------------------------------------------------------------------
  // 1. The tool exists, and using it puts a real .canvas file on disk.
  // ---------------------------------------------------------------------
  const toolLabel = await page.evaluate(() => {
    const button = document.querySelector('[data-tool="new-canvas"]');
    return button ? button.textContent.trim() : null;
  });
  assert.equal(toolLabel, "Canvas", "the toolbar carries a canvas tool next to the markdown one");

  assert.deepEqual(await sidecars(), [], "no sub-canvases before the tool is used");
  await clickCanvasTool();

  const afterCreate = await sidecars();
  assert.equal(afterCreate.length, 1, "one click on the canvas tool writes exactly one .canvas file");
  const canvasFile = afterCreate[0];
  created.push(canvasFile);
  assert.match(canvasFile, /^canvas-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.canvas$/,
    `the file is timestamped like a new note is, got ${canvasFile}`);

  const createdState = await readJson(path.join(boardDir, canvasFile));
  assert.ok(createdState.canvasId, "the new canvas file carries a canvasId");
  assert.deepEqual(createdState.nodes, [], "and starts empty");

  const nodeOnBoard = await page.evaluate(() => {
    const el = document.querySelector(".bd-item.bd-layer-board-preview");
    return el && {
      title: el.querySelector(".bd-board-preview-title")?.textContent,
      action: el.querySelector(".bd-board-preview-actions")?.textContent?.trim(),
      meta: el.querySelector(".bd-board-preview-meta")?.textContent?.trim()
    };
  });
  assert.ok(nodeOnBoard, "the new canvas appears on the board as a node");
  assert.equal(nodeOnBoard.title, canvasFile.replace(/\.canvas$/, ""),
    "the node is named after the file it just created");
  assert.equal(nodeOnBoard.action, "Open canvas");

  // ---------------------------------------------------------------------
  // 2. A canvas inside a canvas: open it, put something in it, and the
  //    parent draws the child's actual nodes afterwards.
  // ---------------------------------------------------------------------
  await page.click(".bd-board-preview-open-canvas");
  await page.waitForTimeout(800);

  const nested = await page.evaluate(() => {
    const host = document.querySelector(".bd-canvas-fullscreen .bd-subcanvas-viewport");
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height), items: host.querySelectorAll(".bd-item").length };
  });
  assert.ok(nested, "opening the node shows a nested board");
  assert.ok(nested.width > 600 && nested.height > 400, `the nested board fills the overlay, got ${JSON.stringify(nested)}`);
  assert.equal(nested.items, 0, "the fresh canvas opens empty");

  await page.click('.bd-subcanvas-viewport [data-tool="text"]');
  const stage = await page.locator(".bd-subcanvas-viewport").boundingBox();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.waitForTimeout(250);
  await page.keyboard.type("written inside the nested canvas");
  await page.waitForTimeout(150);
  await page.click('.bd-subcanvas-viewport [data-tool="save"]');
  await page.waitForTimeout(900);

  const editedState = await readJson(path.join(boardDir, canvasFile));
  assert.equal(editedState.nodes.length, 1, "editing the nested board writes into its own .canvas file");
  assert.equal(editedState.nodes[0].text, "written inside the nested canvas");
  assert.equal(editedState.canvasId, createdState.canvasId, "and keeps the id it was created with");

  const parentBoardStillIntact = await readJson(boardPath);
  assert.ok(
    !parentBoardStillIntact.nodes.some((n) => n.text === "written inside the nested canvas"),
    "the nested edit went to the sidecar, not into the parent board file"
  );

  await page.click(".bd-markdown-fullscreen-close");
  await page.waitForTimeout(900);

  const parentPreview = await page.evaluate(() => {
    const el = document.querySelector(".bd-item.bd-layer-board-preview");
    return {
      meta: el?.querySelector(".bd-board-preview-meta")?.textContent?.trim(),
      shapes: el?.querySelectorAll(".bd-board-preview-map rect, .bd-board-preview-map circle, .bd-board-preview-map line").length
    };
  });
  assert.match(parentPreview.meta, /1 item/, "the parent node reports the child's real node count");
  assert.equal(parentPreview.shapes, 1, "and draws one shape for the child's one node");

  // ---------------------------------------------------------------------
  // 3. A canvas inside a markdown block. Selecting a note retargets the
  //    tool, and the embed lands in the note's .md on disk.
  // ---------------------------------------------------------------------
  await page.evaluate(() => {
    const item = document.querySelector(".bd-item.bd-layer-markdown");
    const header = item.querySelector(".bd-markdown-header");
    const rect = header.getBoundingClientRect();
    for (const type of ["mousedown", "mouseup"]) {
      header.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0,
        clientX: rect.x + 8, clientY: rect.y + rect.height / 2, view: window
      }));
    }
  });
  await page.waitForTimeout(200);

  const boardNodesBefore = await page.evaluate(() =>
    document.querySelectorAll(".bd-item.bd-layer-board-preview").length);
  await clickCanvasTool();
  await page.waitForTimeout(700);

  const afterEmbed = await sidecars();
  assert.equal(afterEmbed.length, 2, "the tool created a second canvas file");
  const embeddedFile = afterEmbed.find((f) => f !== canvasFile);
  created.push(embeddedFile);

  assert.equal(
    await page.evaluate(() => document.querySelectorAll(".bd-item.bd-layer-board-preview").length),
    boardNodesBefore,
    "with a note selected the canvas went into the note, not onto the board"
  );

  const embedInNote = await page.evaluate(() => {
    const holder = document.querySelector(".bd-layer-markdown [data-canvas-embed]");
    return holder && {
      raw: holder.closest(".bd-md-line")?.dataset.raw,
      src: holder.dataset.canvasEmbed,
      stage: holder.querySelector(".bd-md-line-canvas-stage")?.textContent?.trim()
    };
  });
  assert.ok(embedInNote, "the note now shows a canvas block");
  assert.equal(embedInNote.raw, `![[${embeddedFile}]]`);
  assert.equal(embedInNote.src, `/content/boards/test-board/${embeddedFile}`,
    "the bare filename resolves against the board's own directory");
  assert.equal(embedInNote.stage, "Empty canvas", "an empty canvas says so rather than failing quietly");

  const notesAfter = await readFile(notesPath, "utf8");
  assert.ok(notesAfter.includes(`![[${embeddedFile}]]`),
    "the embed is written into the note's .md file, so it survives this browser");

  // Put content in the embedded canvas the way any other writer would, then
  // reload: the block in the note must draw that canvas's real nodes.
  const embeddedState = await readJson(path.join(boardDir, embeddedFile));
  embeddedState.nodes = [
    { id: "embed-a", type: "text", x: 0, y: 0, width: 200, height: 120, text: "one" },
    { id: "embed-b", type: "text", x: 320, y: 40, width: 200, height: 120, text: "two" },
    { id: "embed-c", type: "text", x: 640, y: 80, width: 200, height: 120, text: "three" }
  ];
  await writeFile(path.join(boardDir, embeddedFile), `${JSON.stringify(embeddedState, null, 2)}\n`, "utf8");

  // Save the board so the reload below reads real file state, and clear the
  // local draft so nothing is served from this browser's memory.
  await page.click('[data-board-ui="toolbar-more"]');
  await page.waitForTimeout(150);
  await page.click('.braindump-toolbar-action[data-tool="save"]');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.clear(); } catch (error) {} });
  await openBoard();

  const hydrated = await page.evaluate(() => {
    const holder = document.querySelector(".bd-layer-markdown [data-canvas-embed]");
    return holder && holder.querySelectorAll("rect, circle, line").length;
  });
  assert.equal(hydrated, 3, "the block in the note draws one shape per node in the canvas it points at");

  // ---------------------------------------------------------------------
  // 4. Rename the title. Nothing on disk moves, so nothing can break.
  // ---------------------------------------------------------------------
  const filesBeforeRename = (await sidecars()).slice().sort();
  await page.dblclick(".bd-board-preview-title");
  await page.waitForTimeout(200);
  await page.fill("input.bd-markdown-title", "Sprint plan");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);

  const renamedTitle = await page.evaluate(() => {
    const el = document.querySelector(".bd-item.bd-layer-board-preview .bd-board-preview-title");
    return el && { tag: el.tagName, text: el.textContent };
  });
  assert.equal(renamedTitle.text, "Sprint plan", "the node shows the new name");
  assert.equal(renamedTitle.tag, "H3", "and is still the heading it was, not a swapped-in span");
  assert.deepEqual((await sidecars()).slice().sort(), filesBeforeRename,
    "renaming the title renames no file, which is the whole reason it cannot break a link");

  await page.click('[data-board-ui="toolbar-more"]');
  await page.waitForTimeout(150);
  await page.click('.braindump-toolbar-action[data-tool="save"]');
  await page.waitForTimeout(1200);

  const savedBoard = await readJson(boardPath);
  const savedNode = savedBoard.nodes.find((n) => n.type === "board-preview" && n.canvasRef);
  assert.ok(savedNode, "the canvas node is saved into the board file");
  assert.equal(savedNode.title, "Sprint plan");
  assert.equal(savedNode.canvasRef, createdState.canvasId, "the node stores the child's id, not just its path");

  // ---------------------------------------------------------------------
  // 5. Rename the file. Every referrer must still resolve, which means the
  //    referring board still draws the child, not that a string was
  //    rewritten somewhere.
  // ---------------------------------------------------------------------
  await page.close();
  const renamedFile = "sprint-plan.canvas";
  await rename(path.join(boardDir, canvasFile), path.join(boardDir, renamedFile));
  created = created.filter((f) => f !== canvasFile).concat(renamedFile);

  const page2 = await ctx.newPage();
  page2.on("pageerror", (error) => pageErrors.push(String(error.message)));
  await page2.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.clear(); } catch (error) {}
  });
  await openBoard(page2);
  await page2.waitForTimeout(1800);

  const afterFileRename = await page2.evaluate(() => {
    const el = document.querySelector(".bd-item.bd-layer-board-preview");
    return {
      title: el?.querySelector(".bd-board-preview-title")?.textContent,
      meta: el?.querySelector(".bd-board-preview-meta")?.textContent?.trim(),
      shapes: el?.querySelectorAll(".bd-board-preview-map rect, .bd-board-preview-map circle, .bd-board-preview-map line").length,
      status: el?.querySelector(".bd-board-preview-status")?.textContent?.trim() || ""
    };
  });
  assert.equal(afterFileRename.status, "", `the child must still render after its file was renamed, got "${afterFileRename.status}"`);
  assert.equal(afterFileRename.shapes, 1, "the referring board still draws the child board's actual node");
  assert.match(afterFileRename.meta, /1 item/);
  assert.equal(afterFileRename.title, "Sprint plan", "and the display name the user chose is untouched");

  const healedSource = await page2.evaluate(() => {
    const el = document.querySelector(".bd-item.bd-layer-board-preview");
    return el?.querySelector(".bd-board-preview-open-canvas") ? "openable" : "not openable";
  });
  assert.equal(healedSource, "openable", "and it is still openable, not a dead card");

  assert.deepEqual(pageErrors, [], "no uncaught page errors anywhere in this run");

  console.log("canvas-tool-and-rename: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
  // Leave the sandbox exactly as it was found.
  try {
    for (const file of await sidecars()) await unlink(path.join(boardDir, file));
    await copyFile(seedPath, boardPath);
    await writeFile(notesPath, notesBefore, "utf8");
  } catch (error) {
    console.error("cleanup failed:", error.message);
  }
}
