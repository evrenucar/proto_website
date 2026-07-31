// One alt-drag copy is one undo.
//
// Reported from the tracker: "When I alt drag multiple items then ctrl z it
// should reverse the alt drag copy action. But currently if it is a drawing
// with multiple lines. It starts deleting the lines of the original one by one.
// After there are no lines left one final ctrl z reverses the location of the
// drawing back to the original state."
//
// Every stroke of a drawing is its own node: stopDrawing calls createNode once
// per pointer-up, so a three-stroke sketch is three text nodes holding SVG. The
// drag's end handler pushed one move action and then finalizeAltCopy pushed a
// separate create action per clone, so a single gesture left four entries on the
// undo stack. Undo took them newest first, erasing the left-behind copy a stroke
// at a time before it ever put the dragged set back. The fixture below is three
// separate SVG nodes for exactly that reason.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4224;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

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

const stroke = (id, x, y) => ({
  id,
  type: "text",
  x,
  y,
  width: 160,
  height: 100,
  text: `<svg class="bd-drawing" viewBox="0 0 160 100" width="160" height="100"><path d="M10 ${y % 60 + 10} L150 ${y % 40 + 50}" stroke="#3fdaca" stroke-width="3" fill="none"></path></svg>`,
});

const START = [
  { id: "stroke-a", x: 520, y: 200 },
  { id: "stroke-b", x: 520, y: 340 },
  { id: "stroke-c", x: 520, y: 480 },
];

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: START.map((s) => stroke(s.id, s.x, s.y)),
  edges: [],
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
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
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#stroke-a", { timeout: 15000 });

  const positions = () => page.evaluate(() =>
    Object.fromEntries(Array.from(document.querySelectorAll(".bd-item")).map((el) =>
      [el.id, { x: Math.round(parseFloat(el.style.left)), y: Math.round(parseFloat(el.style.top)) }])));
  const count = () => page.evaluate(() => document.querySelectorAll(".bd-item").length);

  // Select all three: click the first, shift-click the rest, as a user would.
  await page.click("#stroke-a");
  await page.click("#stroke-b", { modifiers: ["Shift"] });
  await page.click("#stroke-c", { modifiers: ["Shift"] });
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => document.querySelectorAll(".bd-item.selected").length),
    3,
    "all three strokes must be selected before the drag"
  );

  const DX = 400;
  const DY = 20;
  const box = await page.locator("#stroke-a").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + DX, box.y + box.height / 2 + DY, { steps: 10 });
  await page.keyboard.down("Alt");
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.waitForTimeout(250);

  // --- A: the gesture leaves a copy behind and moves the originals ---
  assert.equal(await count(), 6, "A: three clones should stay at the origin points");
  const afterDrag = await positions();
  for (const s of START) {
    assert.equal(afterDrag[s.id].x, s.x + DX, `A: ${s.id} should have moved`);
    assert.equal(afterDrag[s.id].y, s.y + DY, `A: ${s.id} should have moved`);
  }
  const clones = Object.keys(afterDrag).filter((id) => !START.some((s) => s.id === id));
  assert.equal(clones.length, 3, "A: exactly three clones");
  const cloneSpots = clones.map((id) => `${afterDrag[id].x},${afterDrag[id].y}`).sort();
  assert.deepEqual(
    cloneSpots,
    START.map((s) => `${s.x},${s.y}`).sort(),
    "A: the clones sit exactly where the originals were"
  );

  // --- B: one undo reverses the whole gesture ---
  // This is the bug. Before the fix it took four presses, and the first three
  // deleted the copy a stroke at a time.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);

  assert.equal(await count(), 3, "B: one undo must remove all three clones, not one");
  const afterUndo = await positions();
  for (const s of START) {
    assert.equal(afterUndo[s.id].x, s.x, `B: ${s.id} must be back at its starting x in the same press`);
    assert.equal(afterUndo[s.id].y, s.y, `B: ${s.id} must be back at its starting y in the same press`);
  }

  // The serialized model has to agree, or a later change could fix the DOM and
  // leave orphans in the nodes array that the next save would write out.
  const stored = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("board:test-board") || "{}");
    return (state.nodes || []).map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) }));
  });
  assert.equal(stored.length, 3, "B: the model must hold three nodes too");
  for (const s of START) {
    const node = stored.find((n) => n.id === s.id);
    assert.ok(node, `B: ${s.id} must survive in the model`);
    assert.equal(node.x, s.x, `B: model x for ${s.id}`);
    assert.equal(node.y, s.y, `B: model y for ${s.id}`);
  }

  // --- C: one redo puts the whole gesture back ---
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(300);
  assert.equal(await count(), 6, "C: one redo must restore all three clones");
  const afterRedo = await positions();
  for (const s of START) {
    assert.equal(afterRedo[s.id].x, s.x + DX, `C: ${s.id} should be moved again`);
  }

  // --- D: a plain drag, no Alt, still undoes in one press ---
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  await page.click("#stroke-a");
  await page.waitForTimeout(100);
  const plainBox = await page.locator("#stroke-a").boundingBox();
  await page.mouse.move(plainBox.x + plainBox.width / 2, plainBox.y + plainBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(plainBox.x + plainBox.width / 2 + 120, plainBox.y + plainBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal((await positions())["stroke-a"].x, START[0].x + 120, "D: the plain drag moved it");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  assert.equal(await count(), 3, "D: a plain drag must not have created anything");
  assert.equal((await positions())["stroke-a"].x, START[0].x, "D: one undo restores a plain drag");

  // --- E: Alt released before the mouse leaves no copy, and undoes in one ---
  await page.mouse.move(plainBox.x + plainBox.width / 2, plainBox.y + plainBox.height / 2);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  await page.mouse.move(plainBox.x + plainBox.width / 2 + 90, plainBox.y + plainBox.height / 2, { steps: 6 });
  await page.waitForTimeout(120);
  await page.keyboard.up("Alt");
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(250);
  assert.equal(await count(), 3, "E: releasing Alt before the mouse must leave no copy");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  assert.equal((await positions())["stroke-a"].x, START[0].x, "E: one undo restores it");
  assert.equal(await count(), 3, "E: still three nodes");

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log("alt-drag copy undo: all 5 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
