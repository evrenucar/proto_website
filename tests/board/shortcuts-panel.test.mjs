// The shortcuts panel behind `?`.
//
// From the board: "Nothing tells you the shortcuts exist. The board now has
// alt-drag copy, shift-axis lock, Ctrl+click pin, space and arrows on a
// selected video, Escape, and more, and every one of them is invisible. A
// first-time visitor is the whole objective, so undiscoverable features are
// close to unbuilt features."
//
// What this suite is for, and it is not "a panel appeared". A reference panel
// has exactly one way to fail badly: it can lie. So phase E reads the rows out
// of the rendered panel, and then, for five of them, performs the gesture the
// panel advertises and asserts the board did the thing the row claims. If
// someone deletes the pin chord, or renames the pen key, this suite goes red on
// the row that is now false, not on a missing listener.
//
// The other three phases cover the failure modes this repo has already paid
// for: a keystroke that opens a panel while you are typing into a note (the
// board eats keystrokes when focus is on BODY, and a note is exactly where a
// literal "?" has to survive), an overlay that does not fit a 390px screen, and
// an Escape that fights the existing Escape.
//
// Running this against a candidate build: set BD_PATCHED_JS to a patched copy
// of JavaScript/braindump.js and it is served in place of the repo's. Unset,
// which is how CI runs it, it tests the file on disk.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4271;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const patchedScript = process.env.BD_PATCHED_JS
  ? await readFile(path.resolve(process.env.BD_PATCHED_JS), "utf8")
  : null;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview server did not start")), 15000);
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

// Two plain text nodes at a 1:1 camera, so screen deltas equal world deltas and
// every expected offset below is an exact number rather than a transform.
const NODE_A = { id: "sc-a", x: 500, y: 320 };
const NODE_B = { id: "sc-b", x: 1000, y: 320 };
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    // addInitScript runs in every same-origin frame; only the top document owns
    // this board's storage.
    if (window.top !== window) return;
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
  if (patchedScript) {
    await page.route("**/braindump.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: patchedScript }));
  }

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`#${NODE_A.id}`, { timeout: 15000 });
  // Colour transitions on the toolbar make computed reads race. Nothing here
  // asserts a colour, but killing animation also stops a panel being measured
  // mid-fade.
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none !important;animation:none !important;}" });
  await page.waitForTimeout(120);

  const panel = page.locator('[data-board-ui="shortcuts-panel"]');

  const panelVisible = () => page.evaluate(() => {
    const el = document.querySelector('[data-board-ui="shortcuts-panel"]');
    if (!el || el.hidden) return false;
    const card = el.querySelector(".bd-shortcuts-card");
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 40 && rect.height > 40;
  });

  const posOf = (id) => page.evaluate((elId) => {
    const el = document.getElementById(elId);
    return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  }, id);

  const centerOf = async (id) => {
    const box = await page.locator(`#${id}`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const nodeCount = () => page.evaluate(() => document.querySelectorAll(".bd-item").length);
  const drawingCount = () => page.evaluate(() =>
    document.querySelectorAll(".bd-item svg.bd-drawing").length);
  const cameraZoom = () => page.evaluate(() => {
    const canvasEl = document.querySelector("#braindump-canvas");
    const m = /scale\(([\d.]+)\)/.exec(canvasEl.style.transform);
    return m ? Number(m[1]) : null;
  });
  const screenRectOf = async (id) => {
    const box = await page.locator(`#${id}`).boundingBox();
    return { x: box.x, y: box.y };
  };

  const EPS = 0.75;

  // ============================================================== phase A
  // `?` opens a panel a human can read.
  {
    assert.equal(await panelVisible(), false, "A: nothing should be open before `?`");
    await page.keyboard.press("?");
    await page.waitForTimeout(80);
    assert.equal(await panelVisible(), true, "A: pressing ? must open a visible shortcuts panel");
    const rowCount = await panel.locator("li").count();
    assert.ok(rowCount >= 20, `A: the panel should list the real shortcut set, found ${rowCount} rows`);
    console.log(`A (? opens a visible panel, ${rowCount} rows): ok`);
  }

  // ============================================================== phase B
  // It fits. Same rule every other overlay here follows: inside the viewport on
  // all four edges, and no horizontal document scroll.
  const measureFit = async (label) => {
    const fit = await page.evaluate(() => {
      const card = document.querySelector('[data-board-ui="shortcuts-panel"] .bd-shortcuts-card');
      const rect = card.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.bottom,
        width: rect.width,
        height: rect.height,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrolls: card.scrollHeight > card.clientHeight + 1,
      };
    });
    assert.ok(fit.left >= -0.5, `${label}: left edge cut off by ${-fit.left}px`);
    assert.ok(fit.top >= -0.5, `${label}: top edge cut off by ${-fit.top}px`);
    assert.ok(fit.right >= -0.5, `${label}: right edge cut off by ${-fit.right}px`);
    assert.ok(fit.bottom >= -0.5, `${label}: bottom edge cut off by ${-fit.bottom}px`);
    assert.ok(fit.width >= 200, `${label}: panel collapsed to ${fit.width}px wide`);
    assert.ok(fit.docOverflow <= 0, `${label}: opened a ${fit.docOverflow}px horizontal document scroll`);
    return fit;
  };

  {
    const wide = await measureFit("B(1440)");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    assert.equal(await panelVisible(), true, "B: the panel must survive a resize to 390px");
    const narrow = await measureFit("B(390)");
    // A 390px screen cannot show this list without scrolling, so the panel has
    // to scroll rather than spill. Asserting that it scrolls is asserting the
    // content is reachable, not that a property exists.
    assert.ok(narrow.scrolls, "B: at 390px the panel must scroll its own content, not overflow the screen");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(120);
    console.log(`B (fits 1440 -> ${Math.round(wide.width)}px, fits 390 -> ${Math.round(narrow.width)}px and scrolls): ok`);
  }

  // ============================================================== phase C
  // Escape closes it, and closes only it: the selection underneath survives,
  // and a second Escape clears the selection the way it always did.
  {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    assert.equal(await panelVisible(), false, "C: Escape must close the panel");

    await page.mouse.click(...Object.values(await centerOf(NODE_A.id)));
    await page.waitForTimeout(60);
    const selectedBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".bd-item.selected")).map((el) => el.id));
    assert.deepEqual(selectedBefore, [NODE_A.id], "C: setup, one node should be selected");

    await page.keyboard.press("?");
    await page.waitForTimeout(80);
    assert.equal(await panelVisible(), true, "C: ? should reopen the panel");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    assert.equal(await panelVisible(), false, "C: Escape must close the panel");
    const selectedAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".bd-item.selected")).map((el) => el.id));
    assert.deepEqual(selectedAfter, [NODE_A.id], "C: that Escape belonged to the panel, the selection must survive it");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    const selectedFinally = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".bd-item.selected")).map((el) => el.id));
    assert.deepEqual(selectedFinally, [], "C: with the panel closed, Escape must still clear the selection");
    console.log("C (Escape closes the panel first, then clears the selection): ok");
  }

  // ============================================================== phase D
  // `?` while typing into a note types a question mark. This is the one the
  // repo has already been burned by: focus on a text node, and the board
  // swallowing the keystroke as a shortcut.
  {
    await page.dblclick(`#${NODE_A.id}`);
    await page.waitForTimeout(120);
    const editing = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const ta = el.querySelector(".bd-text-editor");
      return !!ta && document.activeElement === ta;
    }, NODE_A.id);
    assert.ok(editing, "D: setup, double-click should put the caret in the note");

    await page.keyboard.type("why?");
    await page.waitForTimeout(120);
    const typed = await page.evaluate((id) =>
      document.getElementById(id).querySelector(".bd-text-editor").innerText, NODE_A.id);
    assert.ok(typed.includes("why?"), `D: the note should contain the literal text, got ${JSON.stringify(typed)}`);
    assert.equal(await panelVisible(), false, "D: ? must not open the panel while you are typing in a note");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    // Put the note's text back so later phases start from the fixture.
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      const ta = el.querySelector(".bd-text-editor");
      if (ta) ta.innerText = id;
    }, NODE_A.id);
    console.log("D (typing ? into a note types ? and opens nothing): ok");
  }

  // ============================================================== phase E
  // The honest part. Read the rows the panel advertises, then perform them.
  {
    await page.keyboard.press("?");
    await page.waitForTimeout(80);
    assert.equal(await panelVisible(), true, "E: setup, the panel should be open");

    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-board-ui="shortcuts-panel"] .bd-shortcuts-group')).flatMap((group) => {
        const title = group.querySelector("h3")?.textContent.trim() || "";
        return Array.from(group.querySelectorAll("li")).map((li) => ({
          group: title,
          keys: Array.from(li.querySelectorAll("kbd")).map((k) => k.textContent.trim()).join("+"),
          what: (li.querySelector(".bd-shortcuts-what")?.textContent || "").trim(),
        }));
      }));

    const claim = (keys, wordFragment, groupFragment) => {
      const found = rows.find((row) =>
        row.keys.toLowerCase() === keys.toLowerCase() &&
        row.what.toLowerCase().includes(wordFragment.toLowerCase()) &&
        (!groupFragment || row.group.toLowerCase().includes(groupFragment.toLowerCase())));
      assert.ok(found, `E: the panel must advertise "${keys}" as "${wordFragment}". Rows: ${JSON.stringify(rows)}`);
      return found;
    };

    // The five claims this suite then goes and performs.
    claim("P", "pen", "tools");
    claim("Alt+drag", "copy", "moving things");
    claim("Shift+drag", "lock", "moving things");
    claim("Ctrl+click", "pin", "moving things");
    claim("Wheel", "zoom", "moving around");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);

    // --- E1: "P — Pen". Press P, drag on empty board, get a stroke.
    {
      const before = await drawingCount();
      await page.keyboard.press("p");
      await page.waitForTimeout(60);
      await page.mouse.move(300, 700);
      await page.mouse.down();
      await page.mouse.move(460, 760, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const after = await drawingCount();
      assert.equal(after, before + 1, "E1: P should select the pen, so a drag draws a stroke");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(150);
      assert.equal(await drawingCount(), before, "E1: cleanup, the probe stroke should undo away");
      await page.keyboard.press("v");
      await page.waitForTimeout(60);
      console.log("E1 (P selects the pen and a drag draws): ok");
    }

    // --- E2: "Alt+drag — Leave a copy behind".
    {
      const before = await nodeCount();
      const c = await centerOf(NODE_B.id);
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.keyboard.down("Alt");
      await page.mouse.move(c.x + 220, c.y + 60, { steps: 12 });
      await page.mouse.up();
      await page.keyboard.up("Alt");
      await page.waitForTimeout(150);
      assert.equal(await nodeCount(), before + 1, "E2: Alt+drag should leave a copy behind");
      // "Leave a copy behind" means two nodes afterwards: one still at the spot
      // you started from, one under the cursor. Which of the two keeps the
      // original id is an implementation detail and is not asserted.
      const boxes = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".bd-item"))
          .map((el) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })));
      const atOrigin = boxes.filter((b) => Math.abs(b.x - NODE_B.x) < EPS && Math.abs(b.y - NODE_B.y) < EPS);
      const atDrop = boxes.filter((b) => Math.abs(b.x - (NODE_B.x + 220)) < 2 && Math.abs(b.y - (NODE_B.y + 60)) < 2);
      assert.equal(atOrigin.length, 1, `E2: one copy must stay where the drag began, boxes ${JSON.stringify(boxes)}`);
      assert.equal(atDrop.length, 1, `E2: one copy must land under the cursor, boxes ${JSON.stringify(boxes)}`);
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(200);
      assert.equal(await nodeCount(), before, "E2: cleanup, undo should remove the copy");
      await page.keyboard.press("Escape");
      console.log("E2 (Alt+drag leaves a copy behind): ok");
    }

    // --- E3: "Shift+drag — Lock the move to horizontal, vertical or 45°".
    // The cursor path is deliberately off-axis, so a coincidentally straight
    // input cannot pass this.
    {
      const start = await posOf(NODE_A.id);
      const c = await centerOf(NODE_A.id);
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.keyboard.down("Shift");
      await page.mouse.move(c.x + 260, c.y + 44, { steps: 12 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await page.waitForTimeout(120);
      const after = await posOf(NODE_A.id);
      assert.ok(
        Math.abs(after.y - start.y) < EPS,
        `E3: a horizontal lock must pin y despite a 44px off-axis drag, moved ${after.y - start.y}px`
      );
      assert.ok(after.x - start.x > 200, `E3: it must still move along the locked axis, moved ${after.x - start.x}px`);
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(200);
      await page.keyboard.press("Escape");
      console.log("E3 (Shift+drag locks the axis): ok");
    }

    // --- E4: "Wheel — Zoom, centred on the pointer".
    {
      const before = await cameraZoom();
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(150);
      const after = await cameraZoom();
      assert.ok(after > before + 0.01, `E4: the wheel must zoom in, ${before} -> ${after}`);
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(150);
      console.log("E4 (wheel zooms the board): ok");
    }

    // --- E5: "Ctrl+click — Pin an item to the screen. Again to unpin".
    // The outcome that word means: the board moves underneath it and the pinned
    // item does not move on screen, while an unpinned one does.
    {
      const c = await centerOf(NODE_A.id);
      await page.keyboard.down("Control");
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.keyboard.up("Control");
      await page.waitForTimeout(250);
      // Read the rects after the pin has landed: pinning moves the item into
      // the screen layer, so its own position changes once, by design. What is
      // being asserted is that it stops moving with the board afterwards.
      const pinnedBefore = await screenRectOf(NODE_A.id);
      const looseBefore = await screenRectOf(NODE_B.id);

      // Pan the board with a middle-drag, itself an advertised gesture.
      await page.mouse.move(1100, 700);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(940, 620, { steps: 10 });
      await page.mouse.up({ button: "middle" });
      await page.waitForTimeout(150);

      const pinnedAfter = await screenRectOf(NODE_A.id);
      const looseAfter = await screenRectOf(NODE_B.id);
      const pinnedMoved = Math.hypot(pinnedAfter.x - pinnedBefore.x, pinnedAfter.y - pinnedBefore.y);
      const looseMoved = Math.hypot(looseAfter.x - looseBefore.x, looseAfter.y - looseBefore.y);
      assert.ok(looseMoved > 100, `E5: setup, the board must actually have panned, unpinned node moved ${looseMoved}px`);
      assert.ok(pinnedMoved < 2, `E5: a pinned item must hold its place on screen, it moved ${pinnedMoved}px`);

      // "Again to unpin".
      const c2 = await centerOf(NODE_A.id);
      await page.keyboard.down("Control");
      await page.mouse.move(c2.x, c2.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.keyboard.up("Control");
      await page.waitForTimeout(150);
      const unpinnedBefore = await screenRectOf(NODE_A.id);
      await page.mouse.move(1100, 700);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(1000, 640, { steps: 8 });
      await page.mouse.up({ button: "middle" });
      await page.waitForTimeout(150);
      const unpinnedAfter = await screenRectOf(NODE_A.id);
      const unpinnedMoved = Math.hypot(unpinnedAfter.x - unpinnedBefore.x, unpinnedAfter.y - unpinnedBefore.y);
      assert.ok(unpinnedMoved > 50, `E5: a second Ctrl+click must unpin, but it stayed stuck (${unpinnedMoved}px)`);
      console.log("E5 (Ctrl+click pins to the screen, again unpins): ok");
    }
  }

  // ============================================================== phase F
  // The line in the settings help, and that it is not decoration: the button
  // opens the same panel for anyone who never finds the key.
  {
    await page.evaluate(() => {
      document.querySelector('[data-board-ui="settings-panel"]').hidden = false;
    });
    const line = page.locator('.braindump-help-list li', { hasText: "shortcuts" }).first();
    assert.ok(await line.count() > 0, "F: the settings help must carry a line about the shortcuts panel");
    const text = (await line.innerText()).toLowerCase();
    assert.ok(text.includes("?"), `F: that line must name the key, got ${JSON.stringify(text)}`);
    await line.locator("[data-shortcuts-open]").click();
    await page.waitForTimeout(120);
    assert.equal(await panelVisible(), true, "F: the settings help line must open the panel");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    console.log("F (settings help line names ? and opens the panel): ok");
  }

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log("\nshortcuts-panel: all phases passed");
} finally {
  await browser?.close();
  child.kill();
}
