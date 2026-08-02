// R rotates the selection, about its centre, from the corner handle.
//
// The card, from the user: "R should act as rotation tool. If a shape is
// selected and R is clicked it goes into rotation mode and center origin is
// rotation center. with shift can snap to increments of 45 deg. TO rotate you
// hold on from the corner white scaling point when in rotation mode. Or you can
// hold down R roate from the corner then let go or let go of R. It will snap
// back to your previous tool like it does with space for moving tool."
//
// Why this suite is written the way it is
// ---------------------------------------
// A node has no rotation field on disk, so the obvious test — "the angle got
// stored" — would pass against a runtime that stores the number and never draws
// it, and against one that draws it about the wrong origin. Both are exactly
// the failure the card warns about: "a rotated node whose handles are in the
// wrong place is worse than no rotation."
//
// So nothing here reads the angle off the model as its primary evidence. Every
// case asserts one of two things the user can see:
//
//   1. getBoundingClientRect of a rotated element is its axis-aligned BOUNDING
//      box. For a w x h box turned by A that box is
//        w' = w|cosA| + h|sinA|,  h' = w|sinA| + h|cosA|
//      and — this is the part the card is about — its CENTRE does not move. A
//      runtime that rotated about the top left instead would move the centre by
//      most of the node's size, and would still store the right number.
//   2. document.elementFromPoint at a corner predicted by trigonometry. That is
//      the browser's own hit testing, which is what a click actually uses, so a
//      node drawn turned but still clickable in its old square is caught here.
//
// Both directions are asserted every time: the points that must now hit the
// node, AND the points that used to hit it and now must not. A one-sided bound
// is how a knob becomes a no-op without anyone noticing.
//
// ROTATE_PATCH_DIR
// ----------------
// JavaScript/braindump.js and CSS/braindump.css have one writer at a time while
// several agents are live, so the change this suite covers is handed back as
// anchor hunks rather than applied. Point ROTATE_PATCH_DIR at a directory
// holding a patched braindump.js and braindump.css and they are served in place
// of the repo's. That is how this file was proved red before the change and
// green after; both runs are quoted in .tmp/scratch/opus5-38/notes.md. Unset,
// it tests the repo as it stands, and it is inert once the hunks are applied.
//
// Hermetic: nodes are injected by intercepting the canvas request, autosave is
// turned off before any page script runs, and /api/save-board is refused, so
// nothing under content/ is read for state or written to. Case E needs a real
// save, and gets it by capturing the POST body at the route and serving that
// same JSON back as the board on reload — a full serialize / file / load
// round-trip with no disk write.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

// Well clear of 4181-4275, where 57 suites hardcode their ports and a leftover
// server makes an unrelated one fail with "preview server exited early", and
// clear of 4301-4334, which today's wave of agents is using.
const port = 4372;
const baseUrl = `http://127.0.0.1:${port}`;
const patchDir = process.env.ROTATE_PATCH_DIR || "";

const VW = 1400;
const VH = 900;

// The board is loaded at zoom 1 and camera 0,0 on purpose, so every number
// below is both a board coordinate and a screen coordinate and a wrong camera
// cannot quietly rescue a wrong angle.
const DRAW_W = 300;
const DRAW_H = 200;

const drawingSvg =
  '<svg class="bd-drawing" viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block;">' +
  '<path d="M10 10 L290 190" stroke="#3fdaca" stroke-width="8" fill="none" stroke-linecap="round"/>' +
  "</svg>";

// An inline image, so the image case needs no asset on disk and no network.
const imageDataUrl =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#2b4b52"/><circle cx="60" cy="40" r="24" fill="#3fdaca"/></svg>'
  ).toString("base64");

const fixtureNodes = [
  // A pen drawing is a text node holding an <svg class="bd-drawing">, which is
  // what the pen itself writes (braindump.js builds exactly this head).
  { id: "rot-draw", type: "text", x: 420, y: 240, width: DRAW_W, height: DRAW_H, text: drawingSvg },
  { id: "rot-note", type: "text", x: 900, y: 560, width: 260, height: 160, text: "plain note" },
  { id: "rot-image", type: "file", x: 420, y: 560, width: 240, height: 160, file: imageDataUrl },
  // Not rotatable, and case I is the statement of that scope in the suite.
  { id: "rot-embed", type: "link", x: 900, y: 200, width: 320, height: 200, url: "/404.html", embedMode: "preview", title: "A link node" },
];

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

const canvasOnDisk = JSON.parse(
  await readFile(path.join(process.cwd(), "content", "boards", "test-board", "current.canvas"), "utf8")
);

let boardJson = JSON.stringify({
  ...canvasOnDisk,
  nodes: fixtureNodes,
  edges: [],
  viewport: { x: 0, y: 0, z: 1 },
  defaultViewport: { x: 0, y: 0, z: 1 },
});

// ---- the trigonometry the assertions are measured against ----

// Where a point at (dx, dy) from the centre in the node's OWN axes lands on
// screen once the node is turned by `deg`. CSS rotate is clockwise in a y-down
// coordinate system, so this is the plain rotation matrix.
function localToScreen(deg, dx, dy) {
  const a = (deg * Math.PI) / 180;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

// The axis-aligned box a w x h rectangle turned by `deg` occupies.
function boundsOf(deg, w, h) {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { w: w * c + h * s, h: w * s + h * c };
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
  const context = await browser.newContext({ viewport: { width: VW, height: VH } });
  await context.addInitScript(() => {
    // Guard: an init script runs in every same-origin frame, and a link node's
    // preview is one of them.
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();

  if (patchDir) {
    const js = await readFile(path.join(patchDir, "braindump.js"), "utf8");
    const css = await readFile(path.join(patchDir, "braindump.css"), "utf8");
    await page.route("**/braindump.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: js }));
    await page.route("**/braindump.css*", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: css }));
  }
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: boardJson }));

  // Refused, not swallowed: the board must never write to content/ from here,
  // and the body is kept because case E reloads from it.
  const savePosts = [];
  await page.route("**/api/save-board*", (route) => {
    savePosts.push(route.request().postData() || "");
    route.fulfill({ status: 503, body: "blocked by test" });
  });

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url || "";
    // The 503 on /api/save-board is this test refusing to let the board write
    // to content/. The message text is the browser's generic "failed to load
    // resource", so it has to be recognised by the URL it came from.
    if (url.includes("/api/save-board")) return;
    if (!url || url.startsWith(baseUrl)) pageErrors.push(msg.text());
  });

  async function openBoard() {
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#rot-draw").waitFor({ timeout: 15000 });
    // The site's left nav is 232px of opaque chrome painted over the board.
    // Every fixture node sits well clear of it; hiding it keeps a stray hit
    // test from meeting the nav instead of the canvas.
    await page.addStyleTag({ content: ".sidenav { display: none !important; }" });
    await page.waitForTimeout(250);
  }

  await openBoard();

  // ---- readers ----

  // The drawn box, in client pixels, exactly as the browser reports it to
  // anything doing layout or hit testing.
  const boxOf = (id) => page.evaluate((nid) => {
    const r = document.getElementById(nid).getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  }, id);

  const modeOf = () => page.evaluate(() => document.querySelector(".braindump-viewport").dataset.mode);

  // What a click at this point would actually land on.
  const hitAt = (x, y) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return (el && el.closest && el.closest(".bd-item")?.id) || "none";
  }, [x, y]);

  const visibleHandle = (id) => page.evaluate((nid) => {
    const h = document.getElementById(nid)?.querySelector(".resize-handle");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { display: getComputedStyle(h).display, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);

  const countDrawings = () => page.evaluate(() =>
    document.querySelectorAll(".bd-item.bd-layer-draw").length);

  // Click a point that really belongs to this node. A link node's body is full
  // of its own clickable furniture, which the runtime deliberately does not
  // treat as a grab, so the centre is not always a reachable spot.
  async function selectNode(id) {
    const b = await page.locator(`#${id}`).boundingBox();
    const candidates = [[0.5, 0.5], [0.5, 0.06], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88]];
    for (const [fx, fy] of candidates) {
      const pt = { x: b.x + b.width * fx, y: b.y + b.height * fy };
      if ((await hitAt(pt.x, pt.y)) !== id) continue;
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(120);
      if (await page.evaluate((nid) => document.getElementById(nid).classList.contains("selected"), id)) return;
    }
    assert.fail(`could not select #${id}`);
  }

  async function handlePoint(id) {
    const h = await visibleHandle(id);
    assert.ok(h, `no .resize-handle inside #${id}: there is nothing to grab`);
    assert.notEqual(h.display, "none", `the corner handle on #${id} must be visible to be grabbed`);
    return h;
  }

  // Press the corner handle, swing the pointer to an absolute bearing about the
  // node's centre, release. The angle the node ends on is the bearing minus the
  // bearing the handle was pressed at, which is what the assertions predict
  // from, so the drag never has to guess where the handle sits.
  async function turnBy(id, degrees, { steps = 20, shift = false, release = true } = {}) {
    const before = await boxOf(id);
    const h = await handlePoint(id);
    const grabBearing = Math.atan2(h.y - before.cy, h.x - before.cx);
    const radius = Math.hypot(h.x - before.cx, h.y - before.cy);
    const to = grabBearing + (degrees * Math.PI) / 180;
    const dest = { x: before.cx + radius * Math.cos(to), y: before.cy + radius * Math.sin(to) };

    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(dest.x, dest.y, { steps });
    await page.mouse.move(dest.x, dest.y);
    await page.waitForTimeout(60);
    if (release) {
      if (shift) await page.keyboard.up("Shift");
      await page.mouse.up();
      await page.waitForTimeout(120);
    }
    return { centre: { x: before.cx, y: before.cy }, radius, grabBearing };
  }

  // Swing to a bearing without pressing or releasing, for the Shift sweep.
  async function swingTo(centre, radius, grabBearing, degrees) {
    const to = grabBearing + (degrees * Math.PI) / 180;
    await page.mouse.move(centre.x + radius * Math.cos(to), centre.y + radius * Math.sin(to), { steps: 8 });
    await page.waitForTimeout(60);
  }

  // The whole geometric claim in one call: the box the node draws, and the four
  // corners it presents to a click, must both match `deg` about a centre that
  // has not moved.
  async function assertTurnedTo(id, deg, w, h, centre, label, tol = 1.5) {
    const box = await boxOf(id);
    const want = boundsOf(deg, w, h);
    assert.ok(
      Math.abs(box.cx - centre.x) <= tol && Math.abs(box.cy - centre.y) <= tol,
      `${label}: rotation must be about the item's CENTRE — it was at (${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}), it is now at (${box.cx.toFixed(1)}, ${box.cy.toFixed(1)})`
    );
    assert.ok(
      Math.abs(box.w - want.w) <= tol && Math.abs(box.h - want.h) <= tol,
      `${label}: a ${w}x${h} box turned ${deg}° covers ${want.w.toFixed(1)}x${want.h.toFixed(1)}, this one covers ${box.w.toFixed(1)}x${box.h.toFixed(1)}`
    );

    // 92% of the way to each corner: inside the turned node, and — for every
    // angle used in this suite — outside the square it used to be.
    const inset = 0.92;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const dx = (sx * w * inset) / 2;
      const dy = (sy * h * inset) / 2;
      const now = localToScreen(deg, dx, dy);
      const hit = await hitAt(centre.x + now.x, centre.y + now.y);
      assert.equal(
        hit, id,
        `${label}: the corner at local (${dx.toFixed(0)}, ${dy.toFixed(0)}) should be clickable at (${(centre.x + now.x).toFixed(0)}, ${(centre.y + now.y).toFixed(0)}) once the node is turned ${deg}°, but a click there lands on "${hit}"`
      );
      const stale = await hitAt(centre.x + dx, centre.y + dy);
      assert.notEqual(
        stale, id,
        `${label}: (${(centre.x + dx).toFixed(0)}, ${(centre.y + dy).toFixed(0)}) is where that corner was BEFORE the ${deg}° turn — the node must not still be clickable in its old square`
      );
    }
  }

  // ============ A: R is the way in, and only with something rotatable ============
  assert.equal(await modeOf(), "select", "A: setup, the board opens on the select tool");
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  assert.equal(
    await modeOf(), "select",
    "A: R with nothing selected must do nothing at all — there is no shape to turn"
  );
  // and the select tool is still really the select tool
  await page.mouse.move(300, 700);
  await page.mouse.down();
  await page.mouse.move(1250, 820, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => document.getElementById("rot-note").classList.contains("selected")),
    true,
    "A: after a no-op R the select tool must still sweep-select"
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);

  await selectNode("rot-draw");
  await page.keyboard.press("r");
  await page.waitForTimeout(150);
  assert.equal(await modeOf(), "rotate", "A: R with a shape selected must enter rotation mode");
  const armed = await visibleHandle("rot-draw");
  assert.ok(armed, "A: rotation mode must give the shape a corner handle to grab");
  assert.notEqual(armed.display, "none", "A: the corner handle must be visible in rotation mode");
  console.log("A (R enters rotation mode, and only with a shape selected): ok");

  // ============ B: a move first, so case D has something behind it ============
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  assert.equal(await modeOf(), "select", "B: setup, a second R leaves rotation mode");
  const homeBox = await boxOf("rot-draw");
  const dragFrom = { x: homeBox.cx, y: homeBox.cy };
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragFrom.x + 120, dragFrom.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const movedBox = await boxOf("rot-draw");
  assert.ok(
    Math.abs(movedBox.cx - (homeBox.cx + 120)) <= 2,
    `B: setup, the drawing should have moved 120px right, centre went ${homeBox.cx.toFixed(1)} -> ${movedBox.cx.toFixed(1)}`
  );
  console.log("B (a plain move before the turn, so the undo case has a floor): ok");

  // ============ C: turning 90° about the centre ============
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  assert.equal(await modeOf(), "rotate", "C: setup, R re-enters rotation mode");
  const turned = await turnBy("rot-draw", 90, { steps: 24 });
  await assertTurnedTo("rot-draw", 90, DRAW_W, DRAW_H, turned.centre, "C");
  console.log("C (a 90° turn about the centre: box 300x200 -> 200x300, centre fixed, all four corners moved): ok");

  // ============ D: one gesture, one undo entry ============
  // The turn above was 24 pointer moves. If each one had gone into history,
  // one Ctrl+Z would step back a few degrees instead of undoing the turn.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const afterOneUndo = await boxOf("rot-draw");
  assert.ok(
    Math.abs(afterOneUndo.w - DRAW_W) <= 1 && Math.abs(afterOneUndo.h - DRAW_H) <= 1,
    `D: ONE Ctrl+Z must undo the whole turn — expected the box back at ${DRAW_W}x${DRAW_H}, got ${afterOneUndo.w.toFixed(1)}x${afterOneUndo.h.toFixed(1)}`
  );
  assert.ok(
    Math.abs(afterOneUndo.cx - movedBox.cx) <= 2,
    `D: that Ctrl+Z must undo the turn and NOT the move before it — centre should still be ${movedBox.cx.toFixed(1)}, got ${afterOneUndo.cx.toFixed(1)}`
  );
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const afterTwoUndos = await boxOf("rot-draw");
  assert.ok(
    Math.abs(afterTwoUndos.cx - homeBox.cx) <= 2,
    `D: the second Ctrl+Z must undo the move — centre should be back at ${homeBox.cx.toFixed(1)}, got ${afterTwoUndos.cx.toFixed(1)}`
  );
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(250);
  await assertTurnedTo("rot-draw", 90, DRAW_W, DRAW_H, turned.centre, "D (redo)");
  console.log("D (one turn is one undo entry, the move underneath survives it, and redo puts it back): ok");

  // ============ E: the angle survives a save and a reload ============
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(600);
  assert.ok(savePosts.length > 0, "E: Ctrl+S must POST the board to /api/save-board");
  const savedState = JSON.parse(savePosts[savePosts.length - 1]);
  const savedDrawing = savedState.nodes.find((n) => n.id === "rot-draw");
  assert.ok(savedDrawing, "E: the saved board must still carry the drawing");
  assert.ok(
    Number.isFinite(Number(savedDrawing.angle)) && Math.abs(Number(savedDrawing.angle) - 90) < 1,
    `E: the saved node must carry the turn, got angle=${JSON.stringify(savedDrawing.angle)}`
  );
  // Nothing else about the node may have been rewritten to fake the picture:
  // rotation is not allowed to become "and also move and resize it".
  assert.equal(savedDrawing.width, DRAW_W, "E: rotating must not have changed the stored width");
  assert.equal(savedDrawing.height, DRAW_H, "E: rotating must not have changed the stored height");

  // Serve exactly what was saved and open it fresh. This is the real path a
  // committed board takes, minus the disk write.
  boardJson = JSON.stringify(savedState);
  await openBoard();
  const reloaded = await boxOf("rot-draw");
  await assertTurnedTo(
    "rot-draw", 90, DRAW_W, DRAW_H, { x: reloaded.cx, y: reloaded.cy }, "E (after reload)"
  );
  console.log("E (the turn survives serialize -> file -> load, and the stored size is untouched): ok");

  // ============ F: Shift snaps to exact 45° steps ============
  await selectNode("rot-draw");
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  assert.equal(await modeOf(), "rotate", "F: setup, back in rotation mode");
  const base = await boxOf("rot-draw");
  const fCentre = { x: base.cx, y: base.cy };
  // Grab, hold Shift, and sweep through bearings that are deliberately NOT
  // multiples of 45 away from 90. Free rotation would follow them exactly; the
  // snap must quantise every one of them.
  const swing = await turnBy("rot-draw", 0, { steps: 2, shift: true, release: false });
  // The node starts this gesture at 90°, so a pointer moved `raw` degrees round
  // asks for 90 + raw. None of these are multiples of 45, and the first is a
  // deliberate check on the boundary: 20° rounds DOWN to 0, not up to 45.
  const sweep = [
    { raw: -70, asked: 20, snapped: 0 },
    { raw: -40, asked: 50, snapped: 45 },
    { raw: -2, asked: 88, snapped: 90 },
    { raw: 40, asked: 130, snapped: 135 },
  ];
  for (const step of sweep) {
    await swingTo(fCentre, swing.radius, swing.grabBearing, step.raw);
    const got = await boxOf("rot-draw");
    const want = boundsOf(step.snapped, DRAW_W, DRAW_H);
    assert.ok(
      Math.abs(got.w - want.w) <= 1.5 && Math.abs(got.h - want.h) <= 1.5,
      `F: with Shift held, a pointer asking for ${step.asked}° must snap to ${step.snapped}° — that covers ${want.w.toFixed(1)}x${want.h.toFixed(1)}, the node covers ${got.w.toFixed(1)}x${got.h.toFixed(1)}`
    );
    assert.ok(
      Math.abs(got.cx - fCentre.x) <= 1.5 && Math.abs(got.cy - fCentre.y) <= 1.5,
      "F: a snapped turn is still about the centre"
    );
  }
  await page.keyboard.up("Shift");
  await page.mouse.up();
  await page.waitForTimeout(150);
  // 45 and 135 cover the same bounding box, so the box alone cannot tell them
  // apart. The long axis can: at 135° the node's own +x points left and down.
  const alongAxis = localToScreen(135, (DRAW_W * 0.92) / 2, 0);
  assert.equal(
    await hitAt(fCentre.x + alongAxis.x, fCentre.y + alongAxis.y), "rot-draw",
    "F: snapped to 135°, the node's long axis must run down and to the LEFT of its centre"
  );
  assert.notEqual(
    await hitAt(fCentre.x - alongAxis.x, fCentre.y + alongAxis.y), "rot-draw",
    "F: snapped to 135° it must NOT also reach down and to the right — that would be 45°"
  );
  await assertTurnedTo("rot-draw", 135, DRAW_W, DRAW_H, fCentre, "F");
  console.log("F (Shift quantises to exact 45° steps, 20° rounds down to 0, and 135 is 135 and not 45): ok");

  // ============ G: hold R, turn, release, land back on the tool you had ============
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  await page.keyboard.press("v");
  await selectNode("rot-note");
  await page.keyboard.press("p");
  await page.waitForTimeout(120);
  assert.equal(await modeOf(), "draw", "G: setup, P must select the pen");
  await page.keyboard.down("r");
  await page.waitForTimeout(150);
  assert.equal(await modeOf(), "rotate", "G: holding R must enter rotation mode from any tool");
  const noteBefore = await boxOf("rot-note");
  await turnBy("rot-note", 90, { steps: 12 });
  await page.keyboard.up("r");
  await page.waitForTimeout(200);
  assert.equal(
    await modeOf(), "draw",
    "G: releasing R after a turn must snap back to the previous tool, the way releasing Space does"
  );
  // And the tool it went back to is really the pen: draw a stroke.
  const drawingsBefore = await countDrawings();
  await page.mouse.move(320, 700);
  await page.mouse.down();
  await page.mouse.move(480, 760, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(
    await countDrawings(), drawingsBefore + 1,
    "G: after R is released the pen must draw again — a mode that does not hand the tool back is stuck"
  );
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  // The geometry is checked back in select mode on purpose: the pen sets
  // pointer-events:none on every item, so elementFromPoint answers "the canvas"
  // for the whole board while it is up, and a corner probe run there would pass
  // for the wrong reason.
  await page.keyboard.press("v");
  await page.waitForTimeout(120);
  await assertTurnedTo("rot-note", 90, 260, 160, { x: noteBefore.cx, y: noteBefore.cy }, "G");
  console.log("G (hold R, turn, release: the previous tool comes back and still works, and the turn stuck): ok");

  // ============ H: tapping R sticks, and the handle still resizes outside it ============
  await page.keyboard.press("v");
  await selectNode("rot-note");
  await page.keyboard.press("r");
  await page.waitForTimeout(150);
  assert.equal(
    await modeOf(), "rotate",
    "H: a TAP of R — pressed and released with nothing turned in between — must leave rotation mode on, not blink through it the way a tap of Space does"
  );
  await page.keyboard.press("r");
  await page.waitForTimeout(150);
  assert.equal(await modeOf(), "select", "H: a second tap of R must leave the mode again");
  // Outside rotation mode the same corner is the resize handle again. The note
  // is still turned 90° from case G, so a drag straight DOWN the screen runs
  // along the node's own +x axis and must make it WIDER, not taller. Before the
  // delta was rotated into the node's frame, this made it shorter.
  const preResize = await boxOf("rot-note");
  const rh = await handlePoint("rot-note");
  await page.mouse.move(rh.x, rh.y);
  await page.mouse.down();
  await page.mouse.move(rh.x, rh.y + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const postResize = await boxOf("rot-note");
  assert.ok(
    postResize.h - preResize.h > 60,
    `H: dragging the handle 80px down a node turned 90° must lengthen it along that axis — its box went ${preResize.h.toFixed(1)} -> ${postResize.h.toFixed(1)} tall`
  );
  assert.ok(
    Math.abs(postResize.w - preResize.w) < 12,
    `H: and must not have changed the other axis — box width went ${preResize.w.toFixed(1)} -> ${postResize.w.toFixed(1)}`
  );
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  console.log("H (R toggles when tapped, and the corner is a resize handle again outside the mode, in the node's own axes): ok");

  // ============ I: what is deliberately NOT rotatable ============
  // An iframe is not re-parented by a transform, but .bd-embed-shield is placed
  // by axis-aligned getBoundingClientRect arithmetic and fullscreen takes the
  // element out of the transform chain altogether, so embeds are out of scope
  // and this is the suite saying so out loud rather than leaving it to be
  // discovered.
  await page.keyboard.press("v");
  await selectNode("rot-embed");
  await page.keyboard.press("r");
  await page.waitForTimeout(150);
  assert.equal(
    await modeOf(), "select",
    "I: R with only an embed selected must not enter rotation mode — embeds are out of scope, and a mode that does nothing is worse than no mode"
  );
  const embedBefore = await boxOf("rot-embed");
  const eh = await handlePoint("rot-embed");
  await page.mouse.move(eh.x, eh.y);
  await page.mouse.down();
  await page.mouse.move(eh.x + 60, eh.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const embedAfter = await boxOf("rot-embed");
  assert.ok(
    embedAfter.w - embedBefore.w > 40 && embedAfter.h - embedBefore.h > 25,
    `I: an embed's corner handle must still be a plain resize handle, ${embedBefore.w.toFixed(0)}x${embedBefore.h.toFixed(0)} -> ${embedAfter.w.toFixed(0)}x${embedAfter.h.toFixed(0)}`
  );
  console.log("I (embeds do not rotate, and their corner handle still resizes): ok");

  // ============ J: an image, and what a pin does to a turned node ============
  // Pinning rewrites el.style.transform to counter the camera, and unpinning
  // used to clear it. Both are the transform the rotation lives in, so a turned
  // node had two ways to silently spring back to square. At zoom 1 the pin's
  // own transform is a no-op, which makes this the sharpest possible probe:
  // anything the pin writes that does not carry the rotation shows up as the
  // box going back to 240x160.
  await selectNode("rot-image");
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  assert.equal(await modeOf(), "rotate", "J: setup, an image is rotatable");
  const imgTurn = await turnBy("rot-image", 90, { steps: 16 });
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  await assertTurnedTo("rot-image", 90, 240, 160, imgTurn.centre, "J");

  await page.keyboard.down("Control");
  await page.mouse.click(imgTurn.centre.x, imgTurn.centre.y);
  await page.keyboard.up("Control");
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => document.getElementById("rot-image").classList.contains("is-pinned")),
    true,
    "J: setup, Ctrl+click must pin the image to the screen"
  );
  const pinnedBox = await boxOf("rot-image");
  assert.ok(
    Math.abs(pinnedBox.w - 160) <= 1.5 && Math.abs(pinnedBox.h - 240) <= 1.5,
    `J: a turned item must stay turned while pinned — expected a 160x240 box, got ${pinnedBox.w.toFixed(1)}x${pinnedBox.h.toFixed(1)}`
  );

  await page.keyboard.down("Control");
  await page.mouse.click(pinnedBox.cx, pinnedBox.cy);
  await page.keyboard.up("Control");
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => document.getElementById("rot-image").classList.contains("is-pinned")),
    false,
    "J: setup, a second Ctrl+click must unpin it"
  );
  await assertTurnedTo("rot-image", 90, 240, 160, imgTurn.centre, "J (after unpin)");

  // And the pin left the stored geometry alone, which is the invariant the pin
  // suite holds down and rotation must not break.
  const postsBefore = savePosts.length;
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(600);
  assert.ok(savePosts.length > postsBefore, "J: Ctrl+S must POST the board");
  const finalImage = JSON.parse(savePosts[savePosts.length - 1]).nodes.find((n) => n.id === "rot-image");
  assert.deepEqual(
    { x: finalImage.x, y: finalImage.y, width: finalImage.width, height: finalImage.height },
    { x: 420, y: 560, width: 240, height: 160 },
    "J: turning and pinning an image must not have moved or resized it"
  );
  assert.ok(
    Math.abs(Number(finalImage.angle) - 90) < 1,
    `J: and the turn must be what was stored, got ${JSON.stringify(finalImage.angle)}`
  );
  console.log("J (an image turns, stays turned through a pin and an unpin, and its stored box is untouched): ok");

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log("rotation-tool: passed");
} finally {
  await browser?.close();
  child.kill();
}
