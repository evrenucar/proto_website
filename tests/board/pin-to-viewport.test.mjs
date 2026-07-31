// Pin an item to your viewport: it holds still on screen while the board moves
// under it, and its place on the board is marked instead of emptied.
//
// From the tracker: "Would be nice to have the ability to pin some items to
// your viewport so when you move around it stays... The initial size and
// location of that item is never changed. When it's attached to your viewport
// you can edit it, but in its old place it just shows a 20% cyan solid colour
// on top of it and a text saying 'pinned' at the element's centre."
//
// Two things this suite exists to hold down.
//
// One: the node is never re-parented. It stays inside the camera-transformed
// canvas layer and gets the inverse of the camera. Moving an <iframe> in the
// DOM tears down its browsing context and reloads it, so re-parenting would
// restart a video and lose a PDF's page. Case L pins a live embed and checks
// the same iframe element, still holding a value stamped on its contentWindow,
// comes through a pin, a pan, a zoom and an unpin.
//
// Two: pinning never writes the node's stored geometry. The model is the size
// authority and unpinning has to restore it exactly, so the pin box lives
// beside the board, not on it. Cases G, H and K check the stored position and
// size, and that no pin state reaches the serialized board at all.
//
// The chord is Ctrl+click, Cmd+click on macOS, not the Ctrl+Tab the request
// asked for. A real Ctrl+Tab never reaches a page: the browser consumes it to
// switch tabs, and a page cannot suppress that.
//
// Hermetic: the embed points at a page this same preview server serves, the
// board's nodes are injected by intercepting the canvas request, autosave is
// off before any page script runs and the save endpoint is refused, so nothing
// on disk is touched either way.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4244;
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

const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [
    { id: "pin-text", type: "text", x: 200, y: 160, width: 320, height: 180, text: "Pin me" },
    { id: "pin-other", type: "text", x: 200, y: 420, width: 320, height: 180, text: "Stay put" },
    {
      id: "pin-embed",
      type: "link",
      x: 620,
      y: 160,
      width: 520,
      height: 360,
      url: "/404.html",
      embedMode: "live",
      title: "Embedded site probe",
    },
  ],
  edges: [],
  viewport: { x: 40, y: 100, z: 0.9 },
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => {
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const page = await context.newPage();

  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url || "";
    if (!url || url.startsWith(baseUrl)) pageErrors.push(msg.text());
  });

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#pin-text").waitFor({ timeout: 15000 });
  await page.locator("#pin-embed iframe.bd-embed-iframe").waitFor({ timeout: 20000 });

  // A node's box relative to the board viewport, which is the space a pin box
  // lives in. Rounded, because a counter-transform lands on sub-pixel values.
  const screenRect = (id) => page.evaluate((nodeId) => {
    const vp = document.querySelector(".braindump-viewport").getBoundingClientRect();
    const r = document.getElementById(nodeId).getBoundingClientRect();
    return {
      left: Math.round(r.left - vp.left),
      top: Math.round(r.top - vp.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }, id);

  // Where the camera says an unpinned node should be drawn. Anything pinned has
  // to differ from this, and anything unpinned has to match it.
  const cameraRect = (id, w, h) => page.evaluate(({ nodeId, width, height }) => {
    const t = document.querySelector(".braindump-canvas").style.transform;
    const [, tx, ty, z] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t).map(Number);
    const el = document.getElementById(nodeId);
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);
    return {
      left: Math.round(tx + x * z),
      top: Math.round(ty + y * z),
      width: Math.round(width * z),
      height: Math.round(height * z),
    };
  }, { nodeId: id, width: w, height: h });

  // The inline left/top are written straight from the model's x and y and are
  // never touched by a pin, so they are the honest read of stored position.
  const placement = (id) => page.evaluate((nodeId) => {
    const el = document.getElementById(nodeId);
    return { left: el.style.left, top: el.style.top };
  }, id);

  const ghostOf = (id) => page.evaluate((nodeId) => {
    const g = document.querySelector(`.bd-pin-ghost[data-pin-ghost-for="${nodeId}"]`);
    if (!g) return null;
    const cs = getComputedStyle(g);
    return {
      left: g.style.left, top: g.style.top, width: g.style.width, height: g.style.height,
      text: g.textContent, background: cs.backgroundColor, parent: g.parentElement.className,
    };
  }, id);

  const transform = () => page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);

  // A pinned item floats over the board, so the obvious point on a node
  // underneath it can belong to something else. Find a point that really hits
  // the node before pressing the mouse on it.
  async function grabPoint(id) {
    const box = await page.locator(`#${id}`).boundingBox();
    const candidates = [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.5, 0.06]];
    for (const [fx, fy] of candidates) {
      const pt = { x: box.x + box.width * fx, y: box.y + box.height * fy };
      const hit = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest?.(".bd-item")?.id || "none";
      }, pt);
      if (hit === id) return pt;
    }
    throw new Error(`no reachable point found on #${id}`);
  }

  async function pinChordClick(id) {
    const pt = await grabPoint(id);
    await page.keyboard.down("Control");
    await page.mouse.click(pt.x, pt.y);
    await page.keyboard.up("Control");
    await page.waitForTimeout(150);
  }

  // ============ A: Ctrl+click pins, at 1:1 screen pixels ============
  const beforePlacement = await placement("pin-text");
  const beforeCamRect = await cameraRect("pin-text", 320, 180);
  assert.deepEqual(await screenRect("pin-text"), beforeCamRect, "A: before pinning the item follows the camera");

  await pinChordClick("pin-text");

  assert.equal(
    await page.evaluate(() => document.getElementById("pin-text").classList.contains("is-pinned")),
    true,
    "A: Ctrl+click must pin the item"
  );
  const pinnedRect = await screenRect("pin-text");
  assert.deepEqual(
    { width: pinnedRect.width, height: pinnedRect.height },
    { width: 320, height: 180 },
    "A: a pinned item is drawn at its stored size, 1:1 in screen pixels"
  );

  // ============ B: the ghost marks the old place ============
  const ghost = await ghostOf("pin-text");
  assert.ok(ghost, "B: pinning must leave a ghost behind");
  assert.deepEqual(
    { left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height },
    { left: "200px", top: "160px", width: "320px", height: "180px" },
    "B: the ghost must cover the exact stored footprint"
  );
  assert.equal(ghost.text, "pinned", "B: the ghost must say pinned");
  assert.equal(ghost.background, "rgba(63, 218, 202, 0.2)", "B: the ghost is 20% of the accent cyan");
  assert.match(ghost.parent, /braindump-canvas/, "B: the ghost lives on the board, so it moves with it");

  // ============ C: several items can be pinned at once ============
  await pinChordClick("pin-other");
  assert.equal(
    await page.evaluate(() => document.querySelectorAll(".bd-item.is-pinned").length), 2,
    "C: more than one item can be pinned at a time"
  );
  assert.equal(
    await page.evaluate(() => document.querySelectorAll(".bd-pin-ghost").length), 2,
    "C: each pinned item leaves its own ghost"
  );
  await pinChordClick("pin-other");
  assert.equal(
    await page.evaluate(() => document.querySelectorAll(".bd-item.is-pinned").length), 1,
    "C: unpinning one leaves the other pinned"
  );

  // ============ D: it holds still while the board pans ============
  const beforePan = await transform();
  await page.mouse.move(1150, 800);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(1000, 660, { steps: 10 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(200);
  assert.notEqual(await transform(), beforePan, "D: the pan must have moved the camera");
  assert.deepEqual(await screenRect("pin-text"), pinnedRect, "D: a pinned item must not move when the board pans");
  assert.deepEqual(await screenRect("pin-other"), await cameraRect("pin-other", 320, 180),
    "D: an unpinned item must move with the board");

  // ============ E: it holds still while the board zooms ============
  const beforeZoom = await transform();
  await page.mouse.move(1150, 800);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(250);
  assert.notEqual(await transform(), beforeZoom, "E: the wheel must have zoomed the camera");
  assert.deepEqual(await screenRect("pin-text"), pinnedRect,
    "E: a pinned item must not move or resize when the board zooms in");

  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(250);
  assert.deepEqual(await screenRect("pin-text"), pinnedRect, "E: nor when it zooms out");

  // ============ F: shrinking the window keeps the pin on screen ============
  // A pin box is measured against the viewport, so a smaller window would leave
  // it hanging off the edge with no way to reach it.
  await page.setViewportSize({ width: 720, height: 560 });
  await page.waitForTimeout(300);
  const cramped = await screenRect("pin-text");
  const vp = await page.evaluate(() => {
    const r = document.querySelector(".braindump-viewport").getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  });
  assert.ok(
    cramped.left >= 0 && cramped.top >= 0 &&
    cramped.left + cramped.width <= vp.width + 1 &&
    cramped.top + cramped.height <= vp.height + 1,
    `F: a pinned item must stay inside a shrunken window (${JSON.stringify(cramped)} in ${JSON.stringify(vp)})`
  );
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(300);
  const pinnedRectAfterResize = await screenRect("pin-text");

  // ============ G: the stored geometry was never written ============
  assert.deepEqual(await placement("pin-text"), beforePlacement,
    "G: pinning, panning, zooming and resizing must not move the item on the board");

  // ============ H: the saved board carries no trace of the pin ============
  // Panning marked the board dirty, which queues the local snapshot. That
  // snapshot is serializeState, the same shape written to the .canvas file.
  await page.waitForTimeout(600);
  const savedNode = await page.evaluate(() => {
    const raw = localStorage.getItem("board:test-board");
    if (!raw) return "no snapshot";
    const state = JSON.parse(raw);
    return state.nodes.find((n) => n.id === "pin-text");
  });
  assert.deepEqual(
    { x: savedNode.x, y: savedNode.y, width: savedNode.width, height: savedNode.height },
    { x: 200, y: 160, width: 320, height: 180 },
    "H: the serialized node keeps its original geometry while pinned"
  );
  assert.deepEqual(
    Object.keys(savedNode).filter((k) => /pin/i.test(k)),
    [],
    "H: no pin state may reach the saved board, it is one person's view of it"
  );

  // ============ I: dragging a pinned item does not move it ============
  async function dragFrom(pt) {
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(pt.x + i * 12, pt.y + i * 9);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  await dragFrom(await grabPoint("pin-text"));
  assert.deepEqual(await placement("pin-text"), beforePlacement,
    "I: dragging a pinned item must not move it on the board");
  assert.deepEqual(await screenRect("pin-text"), pinnedRectAfterResize, "I: nor on screen");

  const otherBefore = await placement("pin-other");
  await dragFrom(await grabPoint("pin-other"));
  assert.notEqual((await placement("pin-other")).left, otherBefore.left, "I: an unpinned item must still drag");

  // ============ J: a pinned item is still editable ============
  const editBox = await page.locator("#pin-text").boundingBox();
  await page.mouse.dblclick(editBox.x + editBox.width / 2, editBox.y + editBox.height / 2);
  await page.waitForFunction(() => {
    const ta = document.querySelector("#pin-text .bd-text-editor");
    return ta && ta.contentEditable === "true" && document.activeElement === ta;
  }, { timeout: 5000 });
  await page.keyboard.type(" edited");
  await page.keyboard.press("Escape");
  assert.match(
    await page.evaluate(() => document.querySelector("#pin-text .bd-text-editor").textContent),
    /edited/,
    "J: a pinned item must still be editable"
  );

  // ============ K: the same chord unpins and puts it back ============
  await pinChordClick("pin-text");
  assert.equal(
    await page.evaluate(() => document.getElementById("pin-text").classList.contains("is-pinned")),
    false,
    "K: the same chord must unpin"
  );
  assert.equal(
    await page.evaluate(() => document.getElementById("pin-text").style.transform), "",
    "K: unpinning must clear the counter-transform"
  );
  assert.equal(await ghostOf("pin-text"), null, "K: unpinning must remove the ghost");
  assert.deepEqual(await placement("pin-text"), beforePlacement,
    "K: unpinning must leave the stored position untouched");
  assert.deepEqual(
    await page.evaluate(() => {
      const el = document.getElementById("pin-text");
      return { width: el.style.width, height: el.style.height };
    }),
    { width: "320px", height: "180px" },
    "K: and the stored size"
  );
  assert.deepEqual(await screenRect("pin-text"), await cameraRect("pin-text", 320, 180),
    "K: the unpinned item follows the camera again");

  // ============ L: a live embed survives pin, pan, zoom and unpin ============
  const stamped = await page.evaluate(() => {
    const ifr = document.querySelector("#pin-embed iframe.bd-embed-iframe");
    window.__pinIframeRef = ifr;
    try {
      ifr.contentWindow.__pinProbe = "alive";
      return ifr.contentWindow.__pinProbe === "alive";
    } catch (err) {
      return `cross-origin: ${err.message}`;
    }
  });
  assert.equal(stamped, true, "L: the probe must be able to stamp the embed's window");

  await pinChordClick("pin-embed");
  assert.equal(
    await page.evaluate(() => document.getElementById("pin-embed").classList.contains("is-pinned")),
    true,
    "L: Ctrl+click must reach a live embed through its shield"
  );

  const embedPinnedRect = await screenRect("pin-embed");
  await page.mouse.move(200, 800);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(420, 660, { steps: 10 });
  await page.mouse.up({ button: "middle" });
  await page.mouse.move(200, 800);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  assert.deepEqual(await screenRect("pin-embed"), embedPinnedRect,
    "L: a pinned embed holds still through a pan and a zoom");

  assert.deepEqual(
    await page.evaluate(() => {
      const ifr = document.querySelector("#pin-embed iframe.bd-embed-iframe");
      return {
        sameElement: ifr === window.__pinIframeRef,
        marker: (() => { try { return ifr.contentWindow.__pinProbe; } catch { return "unreadable"; } })(),
        insideShell: !!ifr.closest(".bd-link-shell"),
      };
    }),
    { sameElement: true, marker: "alive", insideShell: true },
    "L: the embed's iframe must survive pinning without reloading"
  );

  await pinChordClick("pin-embed");
  await page.waitForTimeout(200);
  assert.deepEqual(
    await page.evaluate(() => {
      const ifr = document.querySelector("#pin-embed iframe.bd-embed-iframe");
      return {
        sameElement: ifr === window.__pinIframeRef,
        marker: (() => { try { return ifr.contentWindow.__pinProbe; } catch { return "unreadable"; } })(),
      };
    }),
    { sameElement: true, marker: "alive" },
    "L: and unpinning must not reload it either"
  );

  assert.deepEqual(pageErrors, [], "no page errors");
  console.log("pin to viewport: all 12 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
