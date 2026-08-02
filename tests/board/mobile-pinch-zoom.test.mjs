// A two-finger pinch works wherever your fingers land.
//
// Chased down from the tracker card "Crashing on mobile if you zoom out and in
// too fast". No crash was reproduced, and this suite does not claim to fix one.
// What it does pin is a real bug found underneath that report: node bodies call
// stopPropagation on touchstart so a tap inside them does not drag the board,
// and that swallow was unconditional. A pinch whose second finger happened to
// land on a note, or on a note being edited, never reached the viewport
// listener that begins a pinch, so the gesture did nothing at all. On a phone
// you cannot see where your fingers are relative to the nodes, so this reads as
// the board randomly refusing to zoom.
//
// The rule now: one finger inside a node body still belongs to the node, a
// second finger always belongs to the board. Every swallow site is covered
// below, including the text-node-being-edited one, which is the state a phone
// is most often in.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, devices } from "playwright";

const port = 4228;
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

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [
    { id: "pinch-note", type: "markdown", x: 20, y: 60, width: 320, height: 260,
      file: "content/boards/test-board/notes.md", title: "notes",
      _rawMarkdown: "# A note\n\nSome body text to put under a finger.\n\nAnd a second paragraph so the body is tall enough to land on.\n" },
    { id: "pinch-text", type: "text", x: 20, y: 360, width: 320, height: 200,
      text: "A plain text node. Tapping into this to type is the state a phone is usually in." },
    { id: "pinch-bg-marker", type: "text", x: 900, y: 900, width: 100, height: 60, text: "far away" },
  ],
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
  const context = await browser.newContext({ ...devices["Pixel 5"] });
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
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pinch-note", { timeout: 15000 });
  await page.waitForTimeout(600);

  const cdp = await context.newCDPSession(page);
  const zoom = () => page.evaluate(() => {
    const t = document.querySelector(".braindump-canvas").style.transform || "";
    const m = /scale\(([\d.]+)\)/.exec(t);
    return m ? Number(m[1]) : 1;
  });

  // A real two-finger pinch through CDP, so the whole touch pipeline runs:
  // the viewport's touchstart, the touchmove that scales, and the preventDefault
  // that keeps the browser's own page zoom out of it.
  // The two fingers land as two separate touchstart events, and the second one
  // is the event that carries touches.length === 2, which is the one the
  // viewport listener needs in order to begin a pinch. So (bx, by) is the finger
  // that decides whether the gesture survives: that is the one to put on a node.
  async function pinch(ax, ay, bx, by, spread) {
    const touch = (x, y, id) => ({ x, y, id, radiusX: 12, radiusY: 12, force: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(ax, ay, 1)] });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touch(ax, ay, 1), touch(bx, by, 2)],
    });
    let prevented = 0;
    const total = 12;
    for (let i = 1; i <= total; i++) {
      const t = i / total;
      const ox = (bx - ax) * (spread - 1) * t * 0.5;
      const oy = (by - ay) * (spread - 1) * t * 0.5;
      const res = await page.evaluate(() => {
        window.__prevented = window.__prevented || 0;
        return window.__prevented;
      });
      prevented = res;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touch(ax - ox, ay - oy, 1), touch(bx + ox, by + oy, 2)],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
    return prevented;
  }

  // Reload rather than resetting the transform. The camera is module state, and
  // writing canvas.style.transform leaves it untouched, so the next thing that
  // calls updateTransform would paint the stale scale back and a case could
  // pass without a pinch having done anything. This mistake is why the first
  // version of this suite could not fail.
  const freshBoard = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pinch-note", { timeout: 15000 });
    await page.waitForTimeout(500);
    const z = await zoom();
    assert.ok(Math.abs(z - 1) < 0.001, `the board must start at scale 1, got ${z}`);
  };

  // Where the nodes actually are on this small screen.
  const rects = await page.evaluate(() => {
    const box = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, top: r.top,
               right: r.right, bottom: r.bottom };
    };
    return { note: box("pinch-note"), text: box("pinch-text") };
  });

  // --- A: control, both fingers on empty board ---
  await freshBoard();
  await pinch(160, 620, 240, 660, 2.4);
  const bg = await zoom();
  assert.ok(bg > 1.2, `A: a pinch on the background must zoom the board, got scale ${bg.toFixed(3)}`);

  // --- B: a finger on a markdown note body ---
  await freshBoard();
  await pinch(250, 620, Math.round(rects.note.cx), Math.round(rects.note.cy) + 30, 2.4);
  const onNote = await zoom();
  assert.ok(onNote > 1.2,
    `B: a pinch with one finger on a note must still zoom, got scale ${onNote.toFixed(3)}`);

  // --- C: a finger on a text node that is being edited ---
  // The site the first patch set missed. Tapping into a note to read or type is
  // the normal state on a phone, so this is the case that matters most.
  await freshBoard();
  await page.locator("#pinch-text").dblclick();
  await page.waitForTimeout(300);
  const editing = await page.evaluate(() =>
    document.querySelector("#pinch-text .bd-text-editor")?.getAttribute("contenteditable"));
  assert.equal(editing, "true", "C: the text node must actually be in edit mode for this case to mean anything");

  await pinch(250, 640, Math.round(rects.text.cx), Math.round(rects.text.cy), 2.4);
  const onEditing = await zoom();
  assert.ok(onEditing > 1.2,
    `C: a pinch with one finger on a note being edited must still zoom, got scale ${onEditing.toFixed(3)}`);

  // --- D: one finger inside a node still belongs to the node ---
  // The swallow is what stops a single-finger touch in a note from dragging the
  // board, so it must survive for one finger.
  await freshBoard();
  const beforeSingle = await page.evaluate(() =>
    document.querySelector(".braindump-canvas").style.transform);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: Math.round(rects.note.cx), y: Math.round(rects.note.cy) + 30, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: Math.round(rects.note.cx) + i * 8, y: Math.round(rects.note.cy) + 30, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => document.querySelector(".braindump-canvas").style.transform),
    beforeSingle,
    "D: a single finger dragged inside a note must not pan the board"
  );

  // --- E: two fingers landing on the same point do not wedge the gesture ---
  // The pinch baseline is 0 there. The old truthiness test read that as "no
  // pinch in progress" and killed the gesture for its whole duration, and the
  // repair meant to catch it was unreachable.
  await freshBoard();
  await pinch(200, 620, 200, 620, 3.0);
  const camera = await page.evaluate(() => {
    const t = document.querySelector(".braindump-canvas").style.transform || "";
    return { transform: t, sane: !/NaN|Infinity/.test(t) };
  });
  assert.equal(camera.sane, true, `E: the camera must stay a real number, got "${camera.transform}"`);

  // And the board must still zoom afterwards, rather than being wedged.
  await pinch(160, 620, 240, 660, 2.4);
  const afterDegenerate = await zoom();
  assert.ok(afterDegenerate > 1.2,
    `E: a normal pinch must still work after a degenerate one, got ${afterDegenerate.toFixed(3)}`);

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log("mobile pinch zoom: all 5 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
