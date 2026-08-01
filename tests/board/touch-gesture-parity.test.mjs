// Touch parity for the gestures this session added.
//
// Every one of them hangs off a key a touchscreen does not have. Ctrl+click
// pins. Shift-drag locks a drag to an axis. Alt-drag copies. Alt+wheel resizes
// the brush. The pin handle ring listened for `mousedown` and nothing else. On a
// phone that is not a degraded board, it is a different and smaller product,
// which is the complaint this suite exists to close.
//
// The rule for every case below: assert what the USER gets, never that a
// listener fired or a class appeared. "Pinned" means the item holds still while
// the board pans underneath it, measured in screen coordinates. "Axis locked"
// means a diagonal finger drag moved the node on one axis and not the other,
// measured in board coordinates. "The brush changed" means the stored size
// changed. This repo has shipped green suites over broken features five times by
// asserting the mechanism instead, and twice in one day.
//
// Modelled on tests/board/mobile-pinch-zoom.test.mjs: Pixel 5 emulation with
// real CDP touch, so the whole touch pipeline runs rather than a synthetic
// dispatch that skips half of it.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, devices } from "playwright";

const port = 4196;
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
// A fixed camera, because the board opens wherever the last session left it and
// every coordinate below is measured against the screen.
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [
    { id: "touch-a", type: "text", x: 40, y: 120, width: 220, height: 120, text: "Node A" },
    { id: "touch-b", type: "text", x: 40, y: 320, width: 220, height: 120, text: "Node B" },
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

  // Nothing this suite does may reach content/. Autosave is off before any page
  // script runs and the write APIs are refused outright.
  const seed = (context) =>
    context.addInitScript(() => {
      if (window.top !== window) return;
      localStorage.setItem(
        "board:test-board:settings",
        JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
      );
      localStorage.removeItem("board:test-board");
      localStorage.removeItem("board:test-board:meta");
      localStorage.removeItem("board:test-board:brush");
    });

  const wire = async (page, canvas = probeCanvas) => {
    await page.route("**/content/boards/test-board/current.canvas*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(canvas) }));
    await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
    await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  };

  const context = await browser.newContext({ ...devices["Pixel 5"] });
  await seed(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await wire(page);

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#touch-a", { timeout: 15000 });
  await page.waitForTimeout(600);

  const cdp = await context.newCDPSession(page);
  const finger = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 12, radiusY: 12, force: 1 });

  // A one-finger drag through CDP. Deliberately fast and unpaused by default:
  // holding still for 280ms turns a board drag into a long-press select and a
  // node drag into hold-to-drag, so a slow synthetic drag would test the wrong
  // gesture. `holdMs` opts into the hold where a case needs it.
  async function touchDrag(fromX, fromY, toX, toY, options = {}) {
    const { steps = 10, holdMs = 0, beforeRelease = null } = options;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger(fromX, fromY)] });
    if (holdMs) await page.waitForTimeout(holdMs);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [finger(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t)],
      });
    }
    if (beforeRelease) await beforeRelease();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
  }

  async function touchTap(x, y) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger(x, y)] });
    await page.waitForTimeout(60);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(180);
  }

  const rectOf = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }, selector);

  const boardPos = (id) =>
    page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
    }, id);

  const freshBoard = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#touch-a", { timeout: 15000 });
    await page.waitForTimeout(500);
  };

  const centreOf = async (selector) => {
    const r = await rectOf(selector);
    assert.ok(r && r.width > 0, `${selector} must exist and be laid out`);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // ---------------------------------------------------------------
  // A: the touch affordance for pinning actually pins.
  //
  // Not "the button exists" and not "pinnedNodes has an entry". Pinned means the
  // item is docked to the screen: pan the board and it does not move, while an
  // ordinary node does.
  // ---------------------------------------------------------------
  await freshBoard();
  const aStart = await rectOf("#touch-a");
  const bStart = await rectOf("#touch-b");

  await touchTap(aStart.left + aStart.width / 2, aStart.top + aStart.height / 2);
  assert.equal(
    await page.evaluate(() => document.getElementById("touch-a").classList.contains("selected")),
    true,
    "A: a tap must select the node, or the pin action has nothing to act on"
  );

  const pinButton = '[data-board-ui="touch-gestures"] [data-touch-gesture="pin"]';
  await page.waitForSelector(pinButton, { timeout: 5000 });
  const pinCentre = await centreOf(pinButton);
  await touchTap(pinCentre.x, pinCentre.y);

  // Pan the board with one finger, well clear of both nodes and of the bar.
  await touchDrag(200, 600, 140, 480);

  const aAfterPan = await rectOf("#touch-a");
  const bAfterPan = await rectOf("#touch-b");
  const bMoved = Math.hypot(bAfterPan.left - bStart.left, bAfterPan.top - bStart.top);
  assert.ok(
    bMoved > 100,
    `A: the pan must actually move the board, an unpinned node shifted only ${bMoved.toFixed(1)}px`
  );
  assert.ok(
    Math.abs(aAfterPan.left - aStart.left) <= 2 && Math.abs(aAfterPan.top - aStart.top) <= 2,
    `A: the pinned item must hold still while the board pans, it moved to ` +
      `${aAfterPan.left.toFixed(1)},${aAfterPan.top.toFixed(1)} from ${aStart.left.toFixed(1)},${aStart.top.toFixed(1)}`
  );

  // And the same tap sends it back, or a phone can pin and never unpin.
  await touchTap(aStart.left + aStart.width / 2, aStart.top + aStart.height / 2);
  await touchTap(pinCentre.x, pinCentre.y);
  await touchDrag(200, 600, 140, 480);
  const aAfterUnpin = await rectOf("#touch-a");
  assert.ok(
    Math.hypot(aAfterUnpin.left - aAfterPan.left, aAfterUnpin.top - aAfterPan.top) > 100,
    "A: tapping pin again must unpin, so the item travels with the board once more"
  );

  // ---------------------------------------------------------------
  // B: the axis-lock affordance actually constrains a touch drag.
  //
  // Measured in board coordinates. The drag is 120 right and 40 down; locked,
  // that is the horizontal axis and the node's y must not change at all.
  // ---------------------------------------------------------------
  await freshBoard();
  const axisButton = '[data-board-ui="touch-gestures"] [data-touch-gesture="axis-lock"]';
  await page.waitForSelector(axisButton, { timeout: 5000 });
  const axisCentre = await centreOf(axisButton);

  const bBefore = await boardPos("touch-b");
  const bRect = await rectOf("#touch-b");
  const grabX = bRect.left + bRect.width / 2;
  const grabY = bRect.top + bRect.height / 2;

  // Unlocked first, so the case proves a difference rather than a coincidence.
  await touchTap(grabX, grabY);
  await touchDrag(grabX, grabY, grabX + 120, grabY + 40);
  const bFree = await boardPos("touch-b");
  assert.ok(
    Math.abs(bFree.top - bBefore.top) > 20,
    `B: without the lock a diagonal drag must move the node vertically too, it moved ${(bFree.top - bBefore.top).toFixed(1)}px`
  );

  await freshBoard();
  await touchTap(axisCentre.x, axisCentre.y);
  assert.equal(
    await page.getAttribute(axisButton, "aria-pressed"),
    "true",
    "B: the axis affordance must show that it is engaged"
  );

  const bLockedBefore = await boardPos("touch-b");
  await touchTap(grabX, grabY);
  let guideDuringDrag = null;
  await touchDrag(grabX, grabY, grabX + 120, grabY + 40, {
    beforeRelease: async () => {
      guideDuringDrag = await page.evaluate(() => {
        const el = document.querySelector('[data-board-ui="axis-lock-guide"]');
        if (!el) return null;
        const style = getComputedStyle(el);
        return { display: style.display, transform: el.style.transform };
      });
    },
  });
  const bLocked = await boardPos("touch-b");
  assert.ok(
    Math.abs(bLocked.top - bLockedBefore.top) < 1,
    `B: a locked drag must not move the node off its axis, y moved ${(bLocked.top - bLockedBefore.top).toFixed(2)}px`
  );
  assert.ok(
    bLocked.left - bLockedBefore.left > 100,
    `B: a locked drag must still move along the axis, x moved ${(bLocked.left - bLockedBefore.left).toFixed(1)}px`
  );

  // "Visible" is the word in the request, so the guide is asserted as visible
  // rather than as present in the DOM.
  assert.ok(guideDuringDrag, "B: a locked drag must draw an axis guide");
  assert.notEqual(guideDuringDrag.display, "none", "B: the axis guide must be visible during the drag");
  assert.match(
    guideDuringDrag.transform,
    /rotate\(-?0(\.0+)?deg\)/,
    `B: the guide must lie along the axis the drag snapped to, got "${guideDuringDrag.transform}"`
  );

  // The latch is a latch: turning it off returns the board to free movement.
  await freshBoard();
  await touchTap(axisCentre.x, axisCentre.y);
  await touchTap(axisCentre.x, axisCentre.y);
  const bRelaxBefore = await boardPos("touch-b");
  await touchTap(grabX, grabY);
  await touchDrag(grabX, grabY, grabX + 120, grabY + 40);
  const bRelax = await boardPos("touch-b");
  assert.ok(
    Math.abs(bRelax.top - bRelaxBefore.top) > 20,
    "B: turning the latch off must restore free dragging"
  );

  // ---------------------------------------------------------------
  // C: brush size actually changes from a touch gesture.
  //
  // This one is a guard, not a repair. The pen icon's press-and-drag was built
  // on pointer events, so it already answers touch; the card said to check
  // rather than assume, and this is the check. Alt+wheel, its sibling, has no
  // touch path at all and never can: a touchscreen has neither Alt nor a wheel.
  // ---------------------------------------------------------------
  await freshBoard();
  const penCentre = await centreOf('.braindump-toolbar [data-tool="draw"]');
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("board:test-board:brush") || "null"));
  await touchDrag(penCentre.x, penCentre.y, penCentre.x, penCentre.y - 96, { holdMs: 450, steps: 12 });
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("board:test-board:brush") || "null"));
  assert.ok(after, "C: a touch press-and-drag on the pen must store a brush size");
  assert.ok(
    after.draw > (before?.draw ?? 4) + 4,
    `C: dragging up from the pen icon must grow the brush, ${before?.draw ?? 4} -> ${after.draw}`
  );

  // ---------------------------------------------------------------
  // D: every touch target added here is at least 44x44 CSS pixels.
  //
  // The pin handle ring shipped this morning at 12px bands and 24px corners,
  // which is under every touch guideline in circulation and roughly a third of a
  // fingertip.
  // ---------------------------------------------------------------
  await freshBoard();
  const barTargets = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[data-board-ui="touch-gestures"] button').forEach((el) => {
      const r = el.getBoundingClientRect();
      out.push({ name: el.dataset.touchGesture, w: r.width, h: r.height });
    });
    return out;
  });
  assert.ok(barTargets.length >= 2, "D: the touch bar must expose the pin and axis controls");
  for (const target of barTargets) {
    assert.ok(
      target.w >= 44 && target.h >= 44,
      `D: touch target "${target.name}" is ${target.w}x${target.h}, under the 44x44 floor`
    );
  }

  const aCentre = await centreOf("#touch-a");
  await touchTap(aCentre.x, aCentre.y);
  await touchTap(pinCentre.x, pinCentre.y);
  const handles = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".bd-pin-handle").forEach((el) => {
      const r = el.getBoundingClientRect();
      out.push({ spot: el.dataset.pinHandle, w: r.width, h: r.height });
    });
    return out;
  });
  assert.equal(handles.length, 8, "D: a pinned item must carry its eight grab handles");
  for (const handle of handles) {
    assert.ok(
      handle.w >= 44 && handle.h >= 44,
      `D: pin handle "${handle.spot}" is ${handle.w}x${handle.h} on a touchscreen, under the 44x44 floor`
    );
  }

  // ---------------------------------------------------------------
  // E: a pinned box can be moved by touch.
  //
  // The ring listened for mousedown only, so on a phone a pin could be created
  // and then never moved or snapped for the rest of the session.
  // ---------------------------------------------------------------
  const pinnedBefore = await rectOf("#touch-a");
  const eastHandle = await centreOf('.bd-pin-handle[data-pin-handle="e"]');
  await touchDrag(eastHandle.x, eastHandle.y, eastHandle.x + 40, eastHandle.y + 150);
  const pinnedAfter = await rectOf("#touch-a");
  assert.ok(
    Math.abs(pinnedAfter.top - pinnedBefore.top - 150) < 12 &&
      Math.abs(pinnedAfter.left - pinnedBefore.left - 40) < 12,
    `E: dragging a pin handle with a finger must move the pinned box, it went from ` +
      `${pinnedBefore.left.toFixed(0)},${pinnedBefore.top.toFixed(0)} to ` +
      `${pinnedAfter.left.toFixed(0)},${pinnedAfter.top.toFixed(0)}`
  );

  assert.deepEqual(pageErrors, [], "the touch run must produce no page errors");

  // ---------------------------------------------------------------
  // F: none of this reaches a mouse-only desktop.
  //
  // The bar is built from the same navigator.maxTouchPoints predicate every
  // other touch path here uses, so a board with no touch point must not grow a
  // control, and an ordinary drag must stay free.
  // ---------------------------------------------------------------
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await seed(desktopContext);
  const desktopPage = await desktopContext.newPage();
  const desktopErrors = [];
  desktopPage.on("pageerror", (err) => desktopErrors.push(String(err)));
  // Its own fixture, pushed well to the right. Above 1200px the site's left nav
  // is painted over the board and takes the pointer, so a node at x=40 cannot be
  // grabbed at all on a desktop and the case would fail for a reason that has
  // nothing to do with dragging.
  await wire(desktopPage, {
    ...probeCanvas,
    nodes: probeCanvas.nodes.map((n) => ({ ...n, x: n.x + 560 })),
  });
  await desktopPage.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await desktopPage.waitForSelector("#touch-b", { timeout: 15000 });
  await desktopPage.waitForTimeout(400);

  assert.equal(
    await desktopPage.locator('[data-board-ui="touch-gestures"]').count(),
    0,
    "F: a board with no touch point must not render the touch bar"
  );

  const dBefore = await desktopPage.evaluate(() => {
    const el = document.getElementById("touch-b");
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  const dRect = await desktopPage.evaluate(() => {
    const r = document.getElementById("touch-b").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await desktopPage.mouse.move(dRect.x, dRect.y);
  await desktopPage.mouse.down();
  await desktopPage.mouse.move(dRect.x + 60, dRect.y + 30, { steps: 6 });
  await desktopPage.mouse.move(dRect.x + 120, dRect.y + 40, { steps: 6 });
  await desktopPage.mouse.up();
  const dAfter = await desktopPage.evaluate(() => {
    const el = document.getElementById("touch-b");
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  assert.ok(
    dAfter.top - dBefore.top > 20 && dAfter.left - dBefore.left > 80,
    `F: a plain mouse drag must stay unconstrained, it moved ` +
      `${(dAfter.left - dBefore.left).toFixed(1)},${(dAfter.top - dBefore.top).toFixed(1)}`
  );
  assert.deepEqual(desktopErrors, [], "F: the desktop run must produce no page errors");
  await desktopContext.close();

  console.log("touch gesture parity: all 6 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
