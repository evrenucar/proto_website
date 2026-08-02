// The shape tool: drag-draw rectangles and ellipses, Shift to constrain, Alt to
// draw out from the centre.
//
// Card, from the user:
//   "Add a new shape tool. Should be able to drag draw rectangles circles
//    ellipses. holding shift makes rectangle a square holding shift makes
//    ellipse tool draw a circle. When holding alt it should take draw origin as
//    center of shape. regularly it takes it as corner."
//
// Everything below is measured in real screen pixels off the RENDERED ink, not
// off the markup that produced it. A shape's geometry is read as
//   path.getBBox()  ->  path.getScreenCTM()
// which is the browser's own answer to "where is this drawn", so the suite
// cannot be satisfied by an attribute that was written and never painted, and
// it does not care whether the shape is stored as a polyline, a <rect> or an
// <ellipse>. "Is this a rectangle and not an ellipse" is asked the same way,
// with isPointInStroke at three points whose answers differ between the two.
//
// Every assertion is two-sided. A rectangle's ink box must EQUAL the drag box
// on all four edges, not merely be inside it; Shift's square must equal the
// LONGER side, not just have equal sides; Alt's shape must be centred on the
// origin AND twice the drag in each direction, so a bug that centred it and
// halved it would still fail. That is deliberate: this repo has shipped
// one-sided bounds that stayed green after the knob they guarded became a
// no-op.
//
// Never writes to content/. Autosave is off before any page script runs and
// /api/save-board is refused outright.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4363;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

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

// One ordinary note, so the board has something on it and so the Alt phases run
// on a board where Alt already means "leave a copy behind" for a node drag.
const NOTE = {
  id: "shape-probe-note",
  type: "text",
  text: "note",
  x: 1200,
  y: 120,
  width: 200,
  height: 120
};

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [NOTE],
  edges: []
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    // addInitScript runs in every same-origin frame. Only the top document owns
    // this board's storage, and only the top document may switch autosave off.
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    // Only on the FIRST navigation. addInitScript runs before every load,
    // including the reloads phases G and H perform, and clearing the draft
    // there would delete the very thing phase G is asking about: a suite that
    // wipes the board on reload and then checks the board survived the reload
    // can only ever be red, or, worse, green for the wrong reason.
    if (sessionStorage.getItem("bd-shape-probe-seeded")) return;
    sessionStorage.setItem("bd-shape-probe-seeded", "1");
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    localStorage.removeItem("board:test-board:brush");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  let saveAttempts = 0;
  await page.route("**/api/save-board*", (route) => {
    saveAttempts++;
    return route.fulfill({ status: 503, body: "blocked by test" });
  });

  const load = async () => {
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#braindump-viewport", { timeout: 15000 });
    await page.waitForTimeout(250);
  };

  // Every drawing on the board, measured as the browser paints it.
  //   box       the ink's bounding box in SCREEN pixels, via getBBox+getScreenCTM
  //   onCorner  is the top-left corner of that box actually on the stroke
  //   onTopMid  is the middle of the top edge on the stroke
  //   onTopQuarter  is the quarter point of the top edge on the stroke
  // A rectangle answers true/true/true. An ellipse inscribed in the same box
  // answers false/true/false: it touches the top edge only at its midpoint.
  const shapes = async () => page.evaluate(() =>
    Array.from(document.querySelectorAll(".bd-item"))
      .filter((el) => el.querySelector("svg.bd-drawing"))
      .map((el) => {
        const svg = el.querySelector("svg.bd-drawing");
        const geom = svg.querySelector("path, rect, ellipse, circle, polygon, polyline");
        if (!geom || typeof geom.getBBox !== "function") return { id: el.id, box: null };
        const b = geom.getBBox();
        const ctm = geom.getScreenCTM();
        const toScreen = (x, y) => {
          const pt = svg.createSVGPoint();
          pt.x = x;
          pt.y = y;
          const t = pt.matrixTransform(ctm);
          return { x: t.x, y: t.y };
        };
        const tl = toScreen(b.x, b.y);
        const br = toScreen(b.x + b.width, b.y + b.height);
        const onStroke = (x, y) => {
          if (typeof geom.isPointInStroke !== "function") return null;
          const pt = svg.createSVGPoint();
          pt.x = x;
          pt.y = y;
          return geom.isPointInStroke(pt);
        };
        return {
          id: el.id,
          tag: geom.tagName.toLowerCase(),
          box: {
            left: Math.min(tl.x, br.x),
            top: Math.min(tl.y, br.y),
            right: Math.max(tl.x, br.x),
            bottom: Math.max(tl.y, br.y),
            width: Math.abs(br.x - tl.x),
            height: Math.abs(br.y - tl.y),
            cx: (tl.x + br.x) / 2,
            cy: (tl.y + br.y) / 2
          },
          onCorner: onStroke(b.x, b.y),
          onTopMid: onStroke(b.x + b.width / 2, b.y),
          onTopQuarter: onStroke(b.x + b.width * 0.25, b.y)
        };
      }));

  const nodeCount = async () => page.evaluate(() => document.querySelectorAll(".bd-item").length);

  // Drag with real modifier keys. page.mouse.click(x, y, { modifiers }) silently
  // ignores them, so the keys go down and up around the drag by hand, and the
  // move is stepped so the runtime sees the modifier on live pointermoves.
  const dragShape = async (from, to, { shift = false, alt = false } = {}) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + (to.x - from.x) * 0.3, from.y + (to.y - from.y) * 0.3, { steps: 4 });
    if (shift) await page.keyboard.down("Shift");
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.waitForTimeout(60);
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
    if (shift) await page.keyboard.up("Shift");
    await page.waitForTimeout(160);
  };

  const near = (actual, expected, tolerance, label) =>
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${label}: expected ${expected.toFixed(2)}, got ${actual.toFixed(2)} (off by ${Math.abs(actual - expected).toFixed(2)}px)`
    );

  await load();

  // ================================================================= phase A
  // The tool exists, is reachable, and a plain drag makes a rectangle whose
  // drawn bounds ARE the drag box.
  {
    const button = await page.$('[data-tool="shape"]');
    assert.ok(button, "A: the toolbar must carry a shape tool button");

    const before = await nodeCount();
    await page.keyboard.press("s");
    await page.waitForTimeout(80);

    const from = { x: 400, y: 300 };
    const to = { x: 700, y: 480 };
    await dragShape(from, to);

    assert.equal(await nodeCount(), before + 1, "A: one drag must leave exactly one new item on the board");
    const drawn = await shapes();
    assert.equal(drawn.length, 1, `A: exactly one shape should exist, got ${drawn.length}`);
    const { box, onCorner, onTopMid, onTopQuarter } = drawn[0];
    assert.ok(box, "A: the shape must render geometry the browser can measure");

    near(box.left, from.x, 1.5, "A: left edge");
    near(box.top, from.y, 1.5, "A: top edge");
    near(box.right, to.x, 1.5, "A: right edge");
    near(box.bottom, to.y, 1.5, "A: bottom edge");
    near(box.width, to.x - from.x, 1.5, "A: width");
    near(box.height, to.y - from.y, 1.5, "A: height");

    assert.equal(onCorner, true, "A: a RECTANGLE has ink at the corner of its box");
    assert.equal(onTopMid, true, "A: a rectangle has ink at the middle of its top edge");
    assert.equal(onTopQuarter, true, "A: a rectangle has ink a quarter of the way along its top edge");

    console.log(`A (plain drag draws a rectangle on the drag box, ${box.width.toFixed(1)}x${box.height.toFixed(1)}px): ok`);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    assert.equal((await shapes()).length, 0, "A: cleanup, undo should clear the probe rectangle");
  }

  // ================================================================= phase B
  // O draws an ellipse in the same box: same bounds, different ink.
  {
    await page.keyboard.press("o");
    await page.waitForTimeout(80);

    const from = { x: 400, y: 300 };
    const to = { x: 700, y: 480 };
    await dragShape(from, to);

    const drawn = await shapes();
    assert.equal(drawn.length, 1, `B: one drag, one ellipse, got ${drawn.length}`);
    const { box, onCorner, onTopMid, onTopQuarter } = drawn[0];

    near(box.left, from.x, 1.5, "B: left edge");
    near(box.top, from.y, 1.5, "B: top edge");
    near(box.right, to.x, 1.5, "B: right edge");
    near(box.bottom, to.y, 1.5, "B: bottom edge");

    assert.equal(onTopMid, true, "B: an ellipse touches the top edge at its midpoint");
    assert.equal(onCorner, false, "B: an ELLIPSE has no ink at the corner of its box. This is what makes it not a rectangle");
    assert.equal(onTopQuarter, false, "B: an ellipse has no ink a quarter of the way along the top edge");

    console.log(`B (O draws an ellipse inscribed in the drag box, ${box.width.toFixed(1)}x${box.height.toFixed(1)}px): ok`);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    assert.equal((await shapes()).length, 0, "B: cleanup, undo should clear the probe ellipse");
  }

  // ================================================================= phase C
  // Shift squares a rectangle, off the LONGER side, and leaves the origin as a
  // corner. A 320x140 drag must give a 320x320 square anchored at the origin:
  // squaring off the shorter side (140) or centring it would both fail here.
  {
    await page.keyboard.press("s");
    await page.waitForTimeout(80);

    const from = { x: 380, y: 260 };
    const to = { x: 700, y: 400 };
    await dragShape(from, to, { shift: true });

    const drawn = await shapes();
    assert.equal(drawn.length, 1, `C: one Shift drag, one shape, got ${drawn.length}`);
    const { box } = drawn[0];

    near(box.width, box.height, 1.0, "C: Shift must make width equal height");
    near(box.width, 320, 1.5, "C: the square takes the longer side of the 320x140 drag");
    near(box.left, from.x, 1.5, "C: without Alt the origin is still a corner, left edge");
    near(box.top, from.y, 1.5, "C: without Alt the origin is still a corner, top edge");

    console.log(`C (Shift squares a 320x140 drag to ${box.width.toFixed(1)}x${box.height.toFixed(1)}px at the origin): ok`);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    assert.equal((await shapes()).length, 0, "C: cleanup");
  }

  // Same again for the ellipse: Shift gives a circle.
  {
    await page.keyboard.press("o");
    await page.waitForTimeout(80);

    const from = { x: 380, y: 260 };
    const to = { x: 640, y: 380 };
    await dragShape(from, to, { shift: true });

    const drawn = await shapes();
    assert.equal(drawn.length, 1, "C2: one Shift drag with the ellipse, one shape");
    const { box, onCorner, onTopMid } = drawn[0];

    near(box.width, box.height, 1.0, "C2: Shift must make the ellipse a circle");
    near(box.width, 260, 1.5, "C2: the circle takes the longer side of the 260x120 drag");
    assert.equal(onTopMid, true, "C2: still an ellipse, ink at the top-edge midpoint");
    assert.equal(onCorner, false, "C2: still an ellipse, no ink at the corner");

    console.log(`C2 (Shift turns a 260x120 ellipse drag into a ${box.width.toFixed(1)}px circle): ok`);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    assert.equal((await shapes()).length, 0, "C2: cleanup");
  }

  // ================================================================= phase D
  // Alt makes the drag origin the CENTRE. The origin must sit at the middle of
  // the shape and the shape must extend the same distance on both sides, so a
  // 210x150 drag becomes a 420x300 box centred on where the drag started.
  {
    await page.keyboard.press("s");
    await page.waitForTimeout(80);

    const from = { x: 700, y: 450 };
    const to = { x: 910, y: 600 };
    await dragShape(from, to, { alt: true });

    const drawn = await shapes();
    assert.equal(drawn.length, 1, `D: one Alt drag, one shape, got ${drawn.length}`);
    const { box } = drawn[0];

    near(box.cx, from.x, 1.5, "D: the drag origin must be the shape's horizontal centre");
    near(box.cy, from.y, 1.5, "D: the drag origin must be the shape's vertical centre");
    near(box.width, 2 * (to.x - from.x), 1.5, "D: the shape must reach the same distance either side, width");
    near(box.height, 2 * (to.y - from.y), 1.5, "D: the shape must reach the same distance either side, height");
    near(from.x - box.left, box.right - from.x, 1.0, "D: equal reach left and right of the origin");
    near(from.y - box.top, box.bottom - from.y, 1.0, "D: equal reach above and below the origin");

    console.log(`D (Alt centres a 210x150 drag into a ${box.width.toFixed(1)}x${box.height.toFixed(1)}px box on the origin): ok`);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    assert.equal((await shapes()).length, 0, "D: cleanup");
  }

  // ================================================================= phase E
  // Shift and Alt together: a circle centred on the origin, its radius the
  // longer of the two drag legs.
  {
    await page.keyboard.press("o");
    await page.waitForTimeout(80);

    const from = { x: 700, y: 450 };
    const to = { x: 880, y: 530 }; // dx 180, dy 80 -> radius 180, box 360
    await dragShape(from, to, { shift: true, alt: true });

    const drawn = await shapes();
    assert.equal(drawn.length, 1, "E: one Shift+Alt drag, one shape");
    const { box, onCorner, onTopMid } = drawn[0];

    near(box.cx, from.x, 1.5, "E: centred on the origin, x");
    near(box.cy, from.y, 1.5, "E: centred on the origin, y");
    near(box.width, box.height, 1.0, "E: Shift still squares the box");
    near(box.width, 360, 1.5, "E: radius 180 from the longer leg, so a 360px box");
    assert.equal(onTopMid, true, "E: still a circle, ink at the top-edge midpoint");
    assert.equal(onCorner, false, "E: still a circle, no ink at the corner of its box");

    console.log(`E (Shift+Alt gives a ${box.width.toFixed(1)}px circle centred on the drag origin): ok`);
  }

  // ================================================================= phase F
  // One Ctrl+Z removes the shape. One, not several: a shape is a single item of
  // history however many points its outline holds.
  {
    const before = await nodeCount();
    assert.equal((await shapes()).length, 1, "F: setup, the phase E circle is still on the board");

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);

    assert.equal((await shapes()).length, 0, "F: ONE Ctrl+Z must remove the shape");
    assert.equal(await nodeCount(), before - 1, "F: and it must remove exactly one item, not the note beside it");

    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(200);
    assert.equal((await shapes()).length, 1, "F: redo must bring the same shape back");
  }

  // ================================================================= phase G
  // It survives a reload. Measured as the same geometry, not merely as "a node
  // with some text in it".
  {
    const beforeReload = (await shapes())[0];
    assert.ok(beforeReload?.box, "G: setup, a shape must be on the board before the reload");

    await load();

    const afterReload = await shapes();
    assert.equal(afterReload.length, 1, `G: the shape must still be there after a reload, found ${afterReload.length}`);
    const after = afterReload[0];

    near(after.box.left, beforeReload.box.left, 1.0, "G: left edge after reload");
    near(after.box.top, beforeReload.box.top, 1.0, "G: top edge after reload");
    near(after.box.width, beforeReload.box.width, 1.0, "G: width after reload");
    near(after.box.height, beforeReload.box.height, 1.0, "G: height after reload");
    assert.equal(after.onCorner, false, "G: it is still an ellipse after the reload, not a rectangle");
    assert.equal(after.onTopMid, true, "G: it still has ink at the top-edge midpoint after the reload");

    console.log(`G (the shape survives a reload at ${after.box.width.toFixed(1)}x${after.box.height.toFixed(1)}px): ok`);
  }

  // ================================================================= phase H
  // The eraser must be able to cut a shape. A shape looks like ink, so an
  // eraser that walked past it would be the one thing on the board it silently
  // refused to touch. Sweep across the top edge of a rectangle and assert the
  // ink is gone from the band the eraser passed through.
  {
    // Clear the board the way a person would, which also proves a shape is an
    // ordinary selectable item: click it with Select, press Delete. (The
    // reload in phase G threw away the undo history, so Ctrl+Z has nothing to
    // undo, and clearing the draft in storage races the runtime's own save.)
    await page.keyboard.press("v");
    await page.waitForTimeout(80);
    await page.mouse.click(700, 450);
    await page.waitForTimeout(120);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(150);
    assert.equal((await shapes()).length, 0, "H: setup, clicking a shape and pressing Delete must remove it");

    await page.keyboard.press("s");
    await page.waitForTimeout(80);

    const from = { x: 420, y: 300 };
    const to = { x: 780, y: 520 };
    await dragShape(from, to);
    assert.ok((await shapes()).length >= 1, "H: setup, a rectangle must be on the board");

    const beforeErase = await shapes();

    await page.click('[data-tool="erase"]');
    await page.waitForTimeout(80);

    // Straight down through the middle of the rectangle's top edge.
    const midX = (from.x + to.x) / 2;
    await page.mouse.move(midX, from.y - 30);
    await page.mouse.down();
    await page.mouse.move(midX, from.y + 30, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const afterErase = await shapes();
    assert.notDeepEqual(
      afterErase.map((s) => s.id).sort(),
      beforeErase.map((s) => s.id).sort(),
      "H: the eraser must actually change the shape it is dragged through, not walk past it"
    );

    // The default eraser is 24 canvas units across, so a sweep centred on midX
    // must leave the top edge empty for at least 20px either side of it.
    const inkOnTopEdge = await page.evaluate(({ midX, topY }) => {
      const hits = [];
      for (const el of document.querySelectorAll(".bd-item")) {
        const svg = el.querySelector("svg.bd-drawing");
        if (!svg) continue;
        const geom = svg.querySelector("path, rect, ellipse, circle, polygon, polyline");
        if (!geom || typeof geom.isPointInStroke !== "function") continue;
        const ctm = geom.getScreenCTM().inverse();
        for (let dx = -8; dx <= 8; dx += 2) {
          const pt = svg.createSVGPoint();
          pt.x = midX + dx;
          pt.y = topY;
          const local = pt.matrixTransform(ctm);
          if (geom.isPointInStroke(local)) hits.push(midX + dx);
        }
      }
      return hits;
    }, { midX, topY: from.y });

    assert.deepEqual(
      inkOnTopEdge,
      [],
      `H: the eraser passed over the top edge at x=${midX}, so no ink may remain within 8px of it. Found ink at ${JSON.stringify(inkOnTopEdge)}`
    );

    console.log(`H (the eraser cuts a shape, ${beforeErase.length} node -> ${afterErase.length}, and clears the band it swept): ok`);
  }

  // ================================================================= phase I
  // Discoverability. Every gesture proved above is invisible unless the board
  // says it exists, so the shortcuts panel must carry R, O, and what Shift and
  // Alt do, and the toolbar button's hover text must name the shape it will
  // draw and its key. Read as the strings a user actually sees.
  {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    await page.keyboard.press("?");
    await page.waitForTimeout(150);

    const rows = await page.evaluate(() => {
      const panel = document.querySelector('[data-board-ui="shortcuts-panel"]');
      if (!panel || panel.hidden) return null;
      return Array.from(panel.querySelectorAll("li")).map((li) => ({
        keys: Array.from(li.querySelectorAll("kbd")).map((k) => k.textContent.trim()),
        what: li.querySelector(".bd-shortcuts-what")?.textContent.trim() || ""
      }));
    });
    assert.ok(rows, "I: setup, ? must open the shortcuts panel");

    const rowFor = (keys, pattern) =>
      rows.find((row) => row.keys.join("+").toLowerCase() === keys.toLowerCase() && pattern.test(row.what));

    assert.ok(rowFor("S", /rectangle/i), `I: the panel must advertise S as the rectangle. Rows: ${JSON.stringify(rows)}`);
    assert.ok(rowFor("O", /ellipse/i), `I: the panel must advertise O as the ellipse. Rows: ${JSON.stringify(rows)}`);
    assert.ok(
      rows.some((row) => row.keys.includes("Shift") && /shape/i.test(row.what) && /(square|circle)/i.test(row.what)),
      `I: the panel must say what Shift does to a shape. Rows: ${JSON.stringify(rows)}`
    );
    assert.ok(
      rows.some((row) => row.keys.includes("Alt") && /shape/i.test(row.what) && /cent(re|er)/i.test(row.what)),
      `I: the panel must say what Alt does to a shape. Rows: ${JSON.stringify(rows)}`
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // The toolbar button, in the same shape as every other shortcut-bearing
    // button here: the tool's name and its key, in the hover text.
    await page.keyboard.press("s");
    await page.waitForTimeout(80);
    const rectTitle = await page.getAttribute('[data-tool="shape"]', "title");
    assert.match(rectTitle || "", /rectangle.*\(r\)/i, `I: with R chosen the button must read as the rectangle and its key, got ${JSON.stringify(rectTitle)}`);

    await page.keyboard.press("o");
    await page.waitForTimeout(80);
    const ellipseTitle = await page.getAttribute('[data-tool="shape"]', "title");
    assert.match(ellipseTitle || "", /ellipse.*\(o\)/i, `I: with O chosen the button must read as the ellipse and its key, got ${JSON.stringify(ellipseTitle)}`);

    console.log(`I (the panel and the button both advertise the shapes: ${JSON.stringify(rectTitle)} / ${JSON.stringify(ellipseTitle)}): ok`);
  }

  assert.equal(saveAttempts, 0, `no probe may POST to /api/save-board, saw ${saveAttempts}`);
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log("shape-tool: all phases ok");
} finally {
  if (browser) await browser.close();
  child.kill();
}
