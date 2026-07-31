// Shift-constrained node dragging.
//
// Reported from the board, in the user's own words: "While dragging items if
// you hold down shift it should restrict it to horizontal or vertical or
// diagonal movement only. It should be possible to move first then click
// shift as well."
//
// Node dragging had zero shiftKey handling before this: moveSelectedNodes and
// moveSelectedNodesByDelta applied dx/dy unconditionally, and the drag-move
// handler read e.altKey for alt-copy but never e.shiftKey. Shift is now a live
// modifier for the whole drag, following the same shape as alt-drag copy:
// beginShiftDragTracking snapshots the drag's origin at mousedown, live
// mousemove and window keydown/keyup both call updateShiftDrag so the lock can
// engage or disengage without further pointer movement, and the axis anchor is
// always the drag's ORIGIN — never the point where Shift happened to go down —
// so a late press snaps onto a clean line instead of wherever the free path
// already wandered.
//
// The snap picks the nearest of the 8 compass directions (0/45/90/.../315)
// unconditionally while engaged, unlike the draw tool's tolerance-gated
// snapStraightLine: "restrict to horizontal/vertical/diagonal" reads as an
// unconditional lock, not a snap window that lets the object drift off-axis a
// few degrees before catching.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4241;
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

// Two plain nodes, far enough apart that dragging one never overlaps the
// other. A fixed 1:1 camera makes screen-pixel deltas equal world-unit deltas,
// so expected offsets can be asserted exactly instead of through the camera
// transform.
const NODE_A = { id: "drag-a", x: 500, y: 300 };
const NODE_B = { id: "drag-b", x: 1000, y: 300 };
const node = (n) => ({ id: n.id, type: "text", x: n.x, y: n.y, width: 200, height: 120, text: n.id });

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [node(NODE_A), node(NODE_B)],
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
  // Autosave off before any page script runs, and the save endpoint refused
  // outright — nothing here may reach the real sandbox canvas on disk.
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
  await page.waitForSelector("#drag-a", { timeout: 15000 });

  const posOf = (id) => page.evaluate((elId) => {
    const el = document.getElementById(elId);
    return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  }, id);

  const selectedIds = () => page.evaluate(() =>
    Array.from(document.querySelectorAll(".bd-item.selected")).map((el) => el.id).sort());

  const centerOf = async (id) => {
    const box = await page.locator(`#${id}`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const EPS = 0.75; // float slack across many small per-tick deltas

  // --- reset helper: undo back to the two-node baseline between cases ---
  // Also clears selection (Escape): a plain click-drag on a node that is
  // already part of a multi-selection does not collapse it, so case G's
  // multi-select would otherwise leak into every later single-node case.
  async function resetToBaseline() {
    for (let i = 0; i < 6; i++) {
      const a = await posOf("drag-a");
      const b = await posOf("drag-b");
      const count = await page.evaluate(() => document.querySelectorAll(".bd-item").length);
      if (
        Math.abs(a.x - NODE_A.x) < EPS && Math.abs(a.y - NODE_A.y) < EPS &&
        Math.abs(b.x - NODE_B.x) < EPS && Math.abs(b.y - NODE_B.y) < EPS &&
        count === 2
      ) {
        await page.keyboard.press("Escape");
        return;
      }
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(120);
    }
    throw new Error("could not reset board to baseline between cases");
  }

  // --- A: Shift held before the drag starts locks to horizontal ---
  // The raw cursor path is NOT perfectly horizontal (+50 y drift) — the lock,
  // not a coincidentally-straight input, has to be what pins y.
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 300, c.y + 50, { steps: 12 });
    const mid = await posOf("drag-a");
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const expectedX = NODE_A.x + Math.hypot(300, 50);
    assert.ok(Math.abs(mid.x - expectedX) < 1.5, `A: x should track the snapped magnitude. got ${mid.x}, expected ~${expectedX}`);
    assert.ok(Math.abs(mid.y - NODE_A.y) < EPS, `A: y must stay pinned under a horizontal lock despite off-axis input. got ${mid.y}`);
    console.log("A (horizontal lock from Shift-down start): ok");
  }
  await resetToBaseline();

  // --- B: Shift held before the drag starts locks to vertical ---
  // Same off-axis-input guard as A, on the other side of the pair.
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 40, c.y + 220, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const after = await posOf("drag-a");
    const expectedY = NODE_A.y + Math.hypot(40, 220);
    assert.ok(Math.abs(after.x - NODE_A.x) < EPS, `B: x must stay pinned under a vertical lock despite off-axis input. got ${after.x}`);
    assert.ok(Math.abs(after.y - expectedY) < 1.5, `B: y should track the snapped magnitude. got ${after.y}, expected ~${expectedY}`);
    console.log("B (vertical lock): ok");
  }
  await resetToBaseline();

  // --- C: Shift held before the drag starts locks to the 45° diagonal ---
  // dx (200) and dy (150) are deliberately unequal — 36.87° off horizontal,
  // closer to the 45° bucket than to 0° — so only an active lock forces
  // dx === dy on the result.
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 200, c.y + 150, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const after = await posOf("drag-a");
    const dx = after.x - NODE_A.x;
    const dy = after.y - NODE_A.y;
    assert.ok(Math.abs(dx - dy) < 1.5, `C: locked to 45° must give dx === dy. dx=${dx}, dy=${dy}`);
    assert.ok(dx > 150, `C: the 45° leg must still be a substantial move, not clamped to zero. dx=${dx}`);
    console.log("C (45-degree diagonal lock): ok");
  }
  await resetToBaseline();

  // --- D: the axis anchor is the drag's ORIGIN, not the point Shift went down ---
  // Phase 1 (free): drag diagonally to origin+(100,100), Shift still up.
  // Phase 2 (locked): continue to origin+(300,10) with Shift held.
  // From the ORIGIN, (300,10) is ~1.9° off horizontal -> snaps to y = origin.y.
  // Anchored at the Shift-down point instead, the remaining leg is
  // (200,-90) -> ~-24.2°, which is nearest -45° -> a visibly different spot.
  // Asserting the horizontal result proves which anchor the code actually used.
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 100, c.y + 100, { steps: 8 }); // free
    const free = await posOf("drag-a");
    assert.ok(Math.abs(free.x - (NODE_A.x + 100)) < EPS && Math.abs(free.y - (NODE_A.y + 100)) < EPS,
      `D: the free leg must move 1:1 with the cursor. got ${JSON.stringify(free)}`);

    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 300, c.y + 10, { steps: 8 }); // locked, anchored on origin
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const after = await posOf("drag-a");
    const expectedX = NODE_A.x + Math.hypot(300, 10); // magnitude from ORIGIN, snapped to 0°
    assert.ok(Math.abs(after.x - expectedX) < 1.5, `D: x must snap relative to the origin. got ${after.x}, expected ~${expectedX}`);
    assert.ok(Math.abs(after.y - NODE_A.y) < 1.5, `D: y must return to the origin's horizontal line. got ${after.y}`);
    console.log("D (axis anchored on drag origin, not the Shift-down point): ok");
  }
  await resetToBaseline();

  // --- E: releasing Shift mid-drag hands control back to the free cursor ---
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 200, c.y + 4, { steps: 8 }); // near-horizontal, locks to y=origin
    const locked = await posOf("drag-a");
    assert.ok(Math.abs(locked.y - NODE_A.y) < EPS, `E: must be locked before release. got ${locked.y}`);

    await page.keyboard.up("Shift");
    await page.mouse.move(c.x + 200, c.y + 90, { steps: 8 }); // off-axis, Shift now up
    await page.mouse.up();
    const after = await posOf("drag-a");
    assert.ok(Math.abs(after.x - (NODE_A.x + 200)) < EPS, `E: x must follow the free cursor after release. got ${after.x}`);
    assert.ok(Math.abs(after.y - (NODE_A.y + 90)) < EPS, `E: y must follow the free cursor after release, not stay locked. got ${after.y}`);
    console.log("E (releasing Shift mid-drag re-enables free movement): ok");
  }
  await resetToBaseline();

  // --- F: pressing Shift with the pointer stationary snaps immediately ---
  // No mousemove follows the keydown — proves the window keydown listener
  // recomputes the position on its own, the same way Alt's does for copies.
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 150, c.y + 60, { steps: 8 }); // free, off-axis
    const free = await posOf("drag-a");
    assert.ok(Math.abs(free.y - (NODE_A.y + 60)) < EPS, `F: precondition — the free leg must track the raw off-axis cursor. got ${free.y}`);

    await page.keyboard.down("Shift"); // no mouse movement after this
    await page.waitForTimeout(80);
    const snapped = await posOf("drag-a");
    await page.mouse.up();
    await page.keyboard.up("Shift");

    const expectedMag = Math.hypot(150, 60);
    const angle = Math.round(Math.atan2(60, 150) / (Math.PI / 4)) * (Math.PI / 4);
    const expectedX = NODE_A.x + expectedMag * Math.cos(angle);
    const expectedY = NODE_A.y + expectedMag * Math.sin(angle);
    assert.ok(Math.abs(snapped.x - expectedX) < 1.5, `F: x must snap on keydown with no mouse move. got ${snapped.x}, expected ~${expectedX}`);
    assert.ok(Math.abs(snapped.y - expectedY) < 1.5, `F: y must snap on keydown with no mouse move. got ${snapped.y}, expected ~${expectedY}`);
    console.log("F (Shift keydown alone snaps without further pointer movement): ok");
  }
  await resetToBaseline();

  // --- G: Shift still preserves a multi-selection, and the whole group locks ---
  {
    await page.click("#drag-a");
    await page.click("#drag-b", { modifiers: ["Shift"] });
    assert.deepEqual(await selectedIds(), ["drag-a", "drag-b"], "G: both nodes must be selected first");

    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 240, c.y + 6, { steps: 10 }); // near-horizontal
    await page.mouse.up();
    await page.keyboard.up("Shift");

    assert.deepEqual(await selectedIds(), ["drag-a", "drag-b"], "G: Shift-drag must not collapse the multi-selection");
    const a = await posOf("drag-a");
    const b = await posOf("drag-b");
    assert.ok(Math.abs(a.y - NODE_A.y) < EPS, `G: drag-a must be axis-locked. got ${a.y}`);
    assert.ok(Math.abs(b.y - NODE_B.y) < EPS, `G: drag-b must move with the same lock. got ${b.y}`);
    assert.ok(Math.abs((b.x - NODE_B.x) - (a.x - NODE_A.x)) < EPS, "G: both nodes must move by the same delta");
    console.log("G (Shift both preserves multi-select and locks the whole group): ok");
  }
  await resetToBaseline();

  // --- H: one Ctrl+Z reverses an entire Shift-locked drag ---
  {
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x + 260, c.y + 3, { steps: 15 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const moved = await posOf("drag-a");
    assert.notEqual(moved.x, NODE_A.x, "H: precondition — the drag must have moved the node");

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    const undone = await posOf("drag-a");
    assert.ok(Math.abs(undone.x - NODE_A.x) < EPS && Math.abs(undone.y - NODE_A.y) < EPS,
      `H: one undo must fully restore the pre-drag position. got ${JSON.stringify(undone)}`);
    console.log("H (one undo reverses a Shift-locked drag): ok");
  }
  await resetToBaseline();

  // --- I: Shift+Alt compose — an axis-locked drag that also leaves a copy ---
  {
    const baseline = await page.evaluate(() => document.querySelectorAll(".bd-item").length);
    const c = await centerOf("drag-a");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.keyboard.down("Alt");
    await page.mouse.move(c.x + 220, c.y + 5, { steps: 10 }); // near-horizontal
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(150);

    assert.equal(await page.evaluate(() => document.querySelectorAll(".bd-item").length), baseline + 1,
      "I: Alt must still leave exactly one clone behind");
    const moved = await posOf("drag-a");
    assert.ok(Math.abs(moved.y - NODE_A.y) < EPS, `I: the dragged original must still be axis-locked. got ${moved.y}`);

    // One undo must remove the clone AND put the original back — the
    // alt-drag-copy-undo bug was exactly this taking multiple presses.
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.querySelectorAll(".bd-item").length), baseline,
      "I: one undo must remove the clone");
    const restored = await posOf("drag-a");
    assert.ok(Math.abs(restored.x - NODE_A.x) < EPS && Math.abs(restored.y - NODE_A.y) < EPS,
      `I: the same undo must restore the original's position. got ${JSON.stringify(restored)}`);
    console.log("I (Shift+Alt compose: locked drag, one copy, one undo): ok");
  }

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log("shift-constrained-drag: all 9 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
