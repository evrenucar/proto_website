// Moving a pinned item, and Windows-style snapping.
//
// From the tracker: "I don't like how the pinning just snaps to my face
// currently. It should be able to be moved around on the pinned area. by
// dragging from its edges and corners afterwards like a window on a operating
// system", folded in with the backlog card that scoped the zones.
//
// Everything here asserts pixels on screen, never a listener or an event. The
// suite that shipped with the pin core is the mechanism test; this one is the
// outcome test, and each case reads the item's real getBoundingClientRect.
//
// Three things it exists to hold down.
//
// One: dragging a pinned box moves the BOX. Case M re-reads the stored x, y,
// width and height out of the serialized board at the end and demands they are
// byte-identical to the fixture, after a dozen drags and five snaps.
//
// Two: the handles have to work on a live embed. .bd-embed-shield swallows
// every mousedown over an iframe, which is why a live embed can only be grabbed
// by its header, and why the request asked for edges rather than the body. Case
// I drags a pinned live embed by a handle and then checks the iframe is the
// same element still holding a value stamped on its contentWindow.
//
// Three: pinning should not throw the item across the screen. Case A pins at a
// zoom of 0.6 and demands the pinned box sits on the same on-screen centre the
// item already had.
//
// Hermetic: nodes are injected by intercepting the canvas request, autosave is
// off before any page script runs and the save endpoint is refused, so nothing
// under content/ is touched either way.
//
// PIN_PATCH_DIR: set it to a directory holding a patched braindump.js and
// braindump.css and they are served in place of the repo's, which is how this
// was proved red before the patch and green after. It is inert when unset and
// can be deleted once the patch is applied.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4247;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const patchDir = process.env.PIN_PATCH_DIR || "";

const VW = 1280;
const VH = 860;
const HALF_W = 640;
const HALF_H = 430;

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

// Laid out so no two pinned boxes overlap at their starting positions, and so
// nothing sits under the toolbar, which is centred 32px off the bottom.
const fixtureNodes = [
  { id: "pin-text", type: "text", x: 200, y: 160, width: 320, height: 180, text: "Pin me" },
  { id: "pin-second", type: "text", x: 200, y: 880, width: 300, height: 160, text: "Me too" },
  {
    id: "pin-embed",
    type: "link",
    x: 1200,
    y: 200,
    width: 420,
    height: 300,
    url: "/404.html",
    embedMode: "live",
    title: "Embedded site probe",
  },
];

const probeCanvas = {
  ...canvasOnDisk,
  nodes: fixtureNodes,
  edges: [],
  // Zoom 0.6 on purpose: at zoom 1 the old top-left anchoring and the new
  // centre anchoring are the same thing, so case A would pass either way.
  // Both keys, because defaultViewport outranks viewport on load and the board
  // on disk carries one.
  viewport: { x: 40, y: 100, z: 0.6 },
  defaultViewport: { x: 40, y: 100, z: 0.6 },
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
  const context = await browser.newContext({ viewport: { width: VW, height: VH } });
  await context.addInitScript(() => {
    // Guard: this runs in every same-origin frame, including the embed's.
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

  // The site's left nav is 232px of opaque chrome painted over the board, so a
  // pin lives in the window minus that strip and every number below would carry
  // it. Hidden for cases A to M so the arithmetic is the window's, then put
  // back for case N, which is the one that proves the nav is accounted for.
  const navStyle = await page.addStyleTag({ content: ".sidenav { display: none !important; }" });

  // What the user actually sees: the item's box in board-viewport pixels.
  // Rounded, because a counter-transform lands on sub-pixel values.
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

  const centreOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // The inline left/top are written straight from the model's x and y and are
  // never touched by a pin, so they are the honest read of stored position.
  const placement = (id) => page.evaluate((nodeId) => {
    const el = document.getElementById(nodeId);
    return { left: el.style.left, top: el.style.top };
  }, id);

  const snapPreview = () => page.evaluate(() => {
    const el = document.querySelector(".bd-pin-snap-preview");
    if (!el) return null;
    const vp = document.querySelector(".braindump-viewport").getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      zone: el.dataset.pinSnapZone,
      left: Math.round(r.left - vp.left),
      top: Math.round(r.top - vp.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      background: cs.backgroundColor,
    };
  });

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

  // Grab a handle at its centre. A handle straddling the viewport border is
  // half clipped away, which is exactly the case a maximised pin puts you in,
  // so clamp the press point back inside the window.
  async function pressHandle(id, spot) {
    const sel = `.bd-pin-frame[data-pin-frame-for="${id}"] .bd-pin-handle-${spot}`;
    // page.$ rather than a locator: a locator would sit in its auto-wait for
    // thirty seconds when the ring is missing, instead of saying so.
    const el = await page.$(sel);
    assert.ok(el, `no ${spot} handle on #${id}: a pinned item must carry a grab ring`);
    const b = await el.boundingBox();
    const pt = {
      x: Math.min(Math.max(1, b.x + b.width / 2), VW - 1),
      y: Math.min(Math.max(1, b.y + b.height / 2), VH - 1),
    };
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    return pt;
  }

  async function dragTo(x, y) {
    await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.move(x, y);
    await page.waitForTimeout(60);
  }

  async function release() {
    await page.mouse.up();
    await page.waitForTimeout(120);
  }

  const startPlacement = {
    "pin-text": await placement("pin-text"),
    "pin-second": await placement("pin-second"),
    "pin-embed": await placement("pin-embed"),
  };

  // ============ A: pinning lands on the spot you clicked ============
  // The complaint. At zoom 0.6 an item is drawn smaller than its stored size
  // and pinning inflates it to 1:1. Anchored at the top left that threw it down
  // and to the right, away from what you were looking at. Anchored at the
  // centre it grows where it stands.
  const preCentre = centreOf(await screenRect("pin-text"));
  await pinChordClick("pin-text");
  const pinned = await screenRect("pin-text");
  assert.deepEqual(
    { width: pinned.width, height: pinned.height }, { width: 320, height: 180 },
    "A: a pinned item is still drawn at its stored size, 1:1 in screen pixels"
  );
  const pinnedCentre = centreOf(pinned);
  assert.ok(
    Math.abs(pinnedCentre.x - preCentre.x) <= 1 && Math.abs(pinnedCentre.y - preCentre.y) <= 1,
    `A: pinning must not throw the item across the screen; centre went from ` +
    `${JSON.stringify(preCentre)} to ${JSON.stringify(pinnedCentre)}`
  );

  // ============ B: the grab ring is drawn on the item's own edges ============
  // Not a mechanism check: this is the affordance. The handles drag correctly
  // wherever they happen to be, so a suite that only asserted the drag delta
  // stayed green while the whole ring sat collapsed in the top-left corner.
  const ringRects = await page.evaluate(() => {
    const vp = document.querySelector(".braindump-viewport").getBoundingClientRect();
    const frame = document.querySelector('.bd-pin-frame[data-pin-frame-for="pin-text"]');
    const read = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - vp.left, top: r.top - vp.top, width: r.width, height: r.height };
    };
    const out = {};
    for (const spot of ["w", "e", "n", "s", "nw", "se"]) {
      out[spot] = read(frame.querySelector(`.bd-pin-handle-${spot}`));
    }
    return out;
  });
  const centreX = (r) => r.left + r.width / 2;
  const centreY = (r) => r.top + r.height / 2;
  assert.ok(Math.abs(centreX(ringRects.w) - pinned.left) <= 1, `B: the west handle sits on the item's left edge, got ${JSON.stringify(ringRects.w)} against ${JSON.stringify(pinned)}`);
  assert.ok(Math.abs(centreX(ringRects.e) - (pinned.left + pinned.width)) <= 1, "B: the east handle sits on the right edge");
  assert.ok(Math.abs(centreY(ringRects.n) - pinned.top) <= 1, "B: the north handle sits on the top edge");
  assert.ok(Math.abs(centreY(ringRects.s) - (pinned.top + pinned.height)) <= 1, "B: the south handle sits on the bottom edge");
  assert.ok(ringRects.w.height >= pinned.height, "B: the side handles run the full height of the item");
  assert.ok(Math.abs(centreX(ringRects.nw) - pinned.left) <= 6 && Math.abs(centreY(ringRects.nw) - pinned.top) <= 6,
    "B: the north-west handle sits on the top-left corner");
  assert.ok(
    Math.abs(centreX(ringRects.se) - (pinned.left + pinned.width)) <= 6 &&
    Math.abs(centreY(ringRects.se) - (pinned.top + pinned.height)) <= 6,
    "B: the south-east handle sits on the bottom-right corner"
  );

  // ============ C: dragging an edge moves the box by the amount dragged ======
  const beforeDrag = await screenRect("pin-text");
  const grabbed = await pressHandle("pin-text", "w");
  await dragTo(grabbed.x + 140, grabbed.y + 90);
  await release();
  const afterDrag = await screenRect("pin-text");
  assert.deepEqual(
    afterDrag,
    { left: beforeDrag.left + 140, top: beforeDrag.top + 90, width: 320, height: 180 },
    "C: dragging the left edge must move the pinned box by exactly the amount dragged, and not resize it"
  );
  assert.deepEqual(await placement("pin-text"), startPlacement["pin-text"],
    "C: and must not move the item on the board");

  // ============ D: the left edge takes the left half ============
  await pressHandle("pin-text", "w");
  await dragTo(6, 430);
  const preview = await snapPreview();
  assert.ok(preview, "D: a snap zone must be previewed before you let go");
  assert.deepEqual(
    { zone: preview.zone, left: preview.left, top: preview.top, width: preview.width, height: preview.height },
    { zone: "left", left: 0, top: 0, width: HALF_W, height: VH },
    "D: the preview must cover the left half of the viewport"
  );
  assert.equal(preview.background, "rgba(63, 218, 202, 0.2)", "D: the preview is 20% of the accent cyan");
  await release();
  assert.equal(await snapPreview(), null, "D: the preview must go away when you let go");
  assert.deepEqual(await screenRect("pin-text"), { left: 0, top: 0, width: HALF_W, height: VH },
    "D: dropping on the left edge must give the item the left half, in real pixels");

  // ============ E: the top edge maximises, and dragging off restores ============
  // Windows gives a snapped window its old size back the moment you drag it
  // off. Without that a snapped pin could never be small again.
  await pressHandle("pin-text", "e");
  await dragTo(640, 300);
  assert.deepEqual(
    await page.evaluate(() => {
      const r = document.getElementById("pin-text").getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    }),
    { width: 320, height: 180 },
    "E: dragging a snapped pin off its zone must give it back the size it had before it snapped"
  );
  await dragTo(640, 6);
  assert.equal((await snapPreview())?.zone, "maximised", "E: the top edge previews a maximise");
  await release();
  assert.deepEqual(await screenRect("pin-text"), { left: 0, top: 0, width: VW, height: VH },
    "E: dropping on the top edge must fill the viewport");

  // ============ F: a corner beats the edge it sits on ============
  // (6, 6) satisfies the left-edge band as well as the top-left corner square.
  // The corner has to win, or the corners are unreachable.
  await pressHandle("pin-text", "w");
  await dragTo(6, 6);
  assert.equal((await snapPreview())?.zone, "top-left", "F: a corner must beat the edge it sits on");
  await release();
  assert.deepEqual(await screenRect("pin-text"), { left: 0, top: 0, width: HALF_W, height: HALF_H },
    "F: dropping in the top-left corner must give the item that quarter, not the left half");

  // ============ G: the bottom edge is dead, as on Windows ============
  await pressHandle("pin-text", "e");
  await dragTo(640, VH - 4);
  assert.equal(await snapPreview(), null, "G: the bottom edge must claim nothing");
  await release();
  const afterBottom = await screenRect("pin-text");
  assert.deepEqual(
    { width: afterBottom.width, height: afterBottom.height }, { width: 320, height: 180 },
    "G: a drop on the bottom edge must leave the box the size it was, not snap it"
  );
  assert.ok(
    afterBottom.top + afterBottom.height <= VH,
    `G: and it must stay inside the viewport (${JSON.stringify(afterBottom)})`
  );

  // ============ H: unpinning still puts it back exactly ============
  await pinChordClick("pin-text");
  assert.equal(
    await page.evaluate(() => document.querySelector('.bd-pin-frame[data-pin-frame-for="pin-text"]')),
    null,
    "H: unpinning must take the grab ring with it"
  );
  assert.deepEqual(await screenRect("pin-text"), { left: 160, top: 196, width: 192, height: 108 },
    "H: an unpinned item goes back to where the camera says it lives, at the camera's scale");
  assert.deepEqual(await placement("pin-text"), startPlacement["pin-text"],
    "H: after five snaps and four drags the stored position is untouched");

  // ============ I: a live embed drags by its handles, and survives ============
  // The whole reason the request said edges and corners: .bd-embed-shield eats
  // every mousedown over the iframe, so the body of a live embed cannot be
  // grabbed at all.
  await pinChordClick("pin-second");
  await pinChordClick("pin-embed");
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
  assert.equal(stamped, true, "I: the probe must be able to stamp the embed's window");

  const embedBefore = await screenRect("pin-embed");
  await pressHandle("pin-embed", "se");
  await dragTo(900, 600);
  await release();
  const embedAfter = await screenRect("pin-embed");
  assert.notDeepEqual(embedAfter, embedBefore,
    "I: a pinned live embed must be draggable by a corner handle, over its own shield");
  assert.deepEqual(
    { width: embedAfter.width, height: embedAfter.height },
    { width: embedBefore.width, height: embedBefore.height },
    "I: and the drag moves it rather than resizing it"
  );

  // ============ J: last drop wins a contested zone ============
  await pressHandle("pin-second", "e");
  await dragTo(VW - 6, 430);
  await release();
  assert.deepEqual(await screenRect("pin-second"), { left: HALF_W, top: 0, width: HALF_W, height: VH },
    "J: the first pin takes the right half");

  await pressHandle("pin-embed", "n");
  await dragTo(VW - 6, 430);
  await release();
  assert.deepEqual(await screenRect("pin-embed"), { left: HALF_W, top: 0, width: HALF_W, height: VH },
    "J: the second pin dropped on the same zone takes it");
  const secondAfter = await screenRect("pin-second");
  assert.deepEqual(
    { width: secondAfter.width, height: secondAfter.height }, { width: 300, height: 160 },
    "J: the pin that held the zone falls back to the box it had before it claimed it"
  );
  assert.notDeepEqual(secondAfter, { left: HALF_W, top: 0, width: HALF_W, height: VH },
    "J: two pins must never sit in the same half");

  // ============ K: the embed never reloaded through any of that ============
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
    "K: a drag-and-snap cycle must not re-parent or reload the embed's iframe"
  );

  // ============ L: a snapped pin is still a true half after a resize ========
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(300);
  assert.deepEqual(await screenRect("pin-embed"), { left: 500, top: 0, width: 500, height: 700 },
    "L: a pin snapped to the right half must still be a half in a resized window");
  await page.setViewportSize({ width: VW, height: VH });
  await page.waitForTimeout(300);

  // ============ M: none of it reached the board ============
  // A pan marks the board dirty, which queues the local snapshot. That snapshot
  // is serializeState, the same shape written to the .canvas file.
  await page.mouse.move(300, 700);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(340, 670, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(700);

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("board:test-board");
    if (!raw) return "no snapshot";
    return JSON.parse(raw).nodes.map((n) => ({
      id: n.id, x: n.x, y: n.y, width: n.width, height: n.height,
      pinKeys: Object.keys(n).filter((k) => /pin|snap/i.test(k)),
    }));
  });
  assert.deepEqual(
    saved,
    fixtureNodes.map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, pinKeys: [] })),
    "M: dragging and snapping pinned boxes must leave every stored x, y, width and height byte-identical, and write no pin state"
  );
  for (const id of Object.keys(startPlacement)) {
    assert.deepEqual(await placement(id), startPlacement[id], `M: ${id} never moved on the board`);
  }

  // ============ N: a half is a half of the board you can see ============
  // The site's left nav is opaque and painted over the board from outside it,
  // so a left half measured against the raw window puts 232px of the item
  // behind chrome, where it can be neither read nor clicked.
  await navStyle.evaluate((el) => el.remove());
  await page.waitForTimeout(120);
  const navRight = await page.evaluate(() => {
    const n = document.querySelector(".sidenav");
    return n ? Math.round(n.getBoundingClientRect().right) : 0;
  });
  assert.ok(navRight > 100, `N: the nav must actually be covering the board for this case (right edge ${navRight})`);

  await pressHandle("pin-embed", "w");
  // The pointer travels over the nav, which is fine: a drag is driven by the
  // window, not by what is under the cursor.
  await dragTo(navRight + 4, 430);
  await release();
  const usable = VW - navRight;
  assert.deepEqual(
    await screenRect("pin-embed"),
    { left: navRight, top: 0, width: Math.round(usable / 2), height: VH },
    "N: the left half must start at the nav's right edge, not at the window's"
  );

  assert.deepEqual(pageErrors, [], "no page errors");
  console.log("pin move and snap: all 14 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
