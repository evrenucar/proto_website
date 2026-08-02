// Presentation mode: named viewpoints, stepping through them, and getting out.
//
// From the board: "Could have a canvas system where canvasses can be presented
// or exported later." Exporting already exists three ways. Presenting is the
// missing half, and the smallest honest version of it is an ordered list of
// cameras plus next / previous / leave.
//
// What this suite refuses to be satisfied by, since every one of these is a way
// for a presentation feature to be green and useless:
//
//   1. "The camera moved." A camera that moves to the WRONG place is a broken
//      presentation, so every step asserts the transform matrix in real pixels
//      against the numbers that were on screen when the viewpoint was saved,
//      to a tenth of a pixel. Before each step it also asserts the camera was
//      NOT already there, so a board that never moves cannot pass by standing
//      still on the right answer.
//   2. "It survived a reload." A reload that reads the same localStorage draft
//      proves nothing about the board file. Phase F takes the bytes the board
//      would be SAVED as, serves those bytes as the .canvas, wipes the draft,
//      reloads, and steps through again. So what is asserted is that the file
//      carries the presentation.
//   3. "Escape closed it." Phase E reads the camera the presenter was working
//      at before they started, moves it three times, and asserts Escape puts
//      that exact camera back. Not "a camera", that one.
//   4. "No state leaked." Phase A runs first, on a board where the feature has
//      not been touched, and asserts the saved envelope and the local draft are
//      free of the key. Phase G then saves while a presentation is RUNNING and
//      asserts the authored half is in the file and the session half (which
//      slide, the camera to return to) is not, anywhere in the bytes.
//
// The whole point of splitting A from G: it is not enough that presentation
// state is absent from a board nobody presented. It has to be absent from a
// board somebody IS presenting, because that is where the temptation to write
// it down lives.
//
// Running this against a candidate build: set BD_PATCHED_JS to a patched copy
// of JavaScript/braindump.js and it is served in place of the repo's. Unset,
// which is how CI runs it, it tests the file on disk.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4402;
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

// Four text nodes spread far enough apart that framing one of them is a
// genuinely different camera from framing another. Nothing here needs the real
// board's content.
const NODES = [
  { id: "pv-a", x: 400, y: 300 },
  { id: "pv-b", x: 2200, y: 400 },
  { id: "pv-c", x: 700, y: 2100 },
  { id: "pv-d", x: 2600, y: 2400 }
];
const node = (n) => ({ id: n.id, type: "text", x: n.x, y: n.y, width: 240, height: 140, text: n.id });

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  // Deliberately does NOT contain any word phase A greps for.
  canvasId: "pv-probe-board",
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: NODES.map(node),
  edges: []
};
// Whatever the sandbox board happens to carry, this probe starts from a board
// with no presentation on it. Otherwise phase A would be asserting the absence
// of something that was never there for a different reason.
delete probeCanvas.viewpoints;

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
  return !!condition;
};
let phaseMark = 0;
const beginPhase = () => { phaseMark = failures.length; };
const endPhase = (label) => {
  const added = failures.length - phaseMark;
  console.log(added === 0 ? `${label}: ok` : `${label}: FAILED, ${added} problem(s)`);
};

// What the viewer actually sees: the transform written onto the canvas layer.
// Read off the DOM rather than out of the `camera` object, so a runtime that
// updated its bookkeeping and forgot to move the board fails here.
const CAMERA_FROM_DOM = () => {
  const el = document.querySelector(".braindump-canvas");
  const raw = el ? el.style.transform : "";
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/.exec(raw);
  return m ? { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) } : null;
};

const near = (a, b, tol = 0.1) =>
  !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;
const apart = (a, b) =>
  !a || !b ? Infinity : Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z) * 1000);
const show = (c) => (c ? `x=${c.x} y=${c.y} z=${c.z}` : "null");

// The vocabulary a presentation would leak if it leaked, and the surrounding
// bytes when it does, so a failure here names what it found instead of only
// saying that it found something.
const LEAK_WORDS = /presentation|returncamera|viewpoint|presenting/i;
const leakContext = (text) => {
  const at = String(text).search(LEAK_WORDS);
  return at < 0 ? "" : JSON.stringify(String(text).slice(Math.max(0, at - 60), at + 90));
};

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Autosave off before any page script runs, and the local draft cleared on
  // every load, so every reload in this file is a load straight from the board
  // file rather than from this tab's leftovers. Guarded against nested frames,
  // because addInitScript runs in all of them.
  await context.addInitScript(() => {
    if (window.top !== window) return;
    const key = "board:test-board:settings";
    let existing = {};
    try { existing = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (error) { existing = {}; }
    localStorage.setItem(key, JSON.stringify({ ...existing, autosaveEnabled: false, autosaveSeconds: 20 }));
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  // Belt and braces on top of the settings key: this probe may not write to
  // content/. Orphan files from probes have had to be cleaned up by hand twice.
  //
  // The save route is intercepted rather than merely blocked, for two reasons at
  // once. Nothing reaches the server, so content/ is untouchable from here; and
  // the request body is the board a user actually saves, which is the artefact
  // phases A, B and G are about. Nothing in this file is read out of the
  // runtime's own internals, because everything in the runtime is closed inside
  // mountCosmoboard and, more to the point, the bytes are the thing.
  let lastSavePost = null;
  await page.route("**/api/save-board*", (route) => {
    if (route.request().method() === "POST") lastSavePost = route.request().postData();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "intercepted-by-test" })
    });
  });
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-asset*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  // The board file the page loads, swappable: phase F serves back the exact
  // bytes the board said it would save.
  let servedCanvas = JSON.stringify(probeCanvas);
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: servedCanvas }));
  if (patchedScript) {
    await page.route("**/braindump.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: patchedScript }));
  }

  const openBoard = async () => {
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`#${NODES[0].id}`, { timeout: 15000 });
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none !important;animation:none !important;}" });
    await page.waitForTimeout(200);
  };
  await openBoard();

  const HUD = '[data-board-ui="presentation-hud"]';
  const readCamera = () => page.evaluate(CAMERA_FROM_DOM);
  const draftJson = () => page.evaluate(() => localStorage.getItem("board:test-board"));

  // Ctrl+S, then the bytes that went up the wire. Ctrl+S is the board's own save
  // and it carries a modifier, so it still works while a presentation is running.
  const savedJson = async () => {
    lastSavePost = null;
    await page.keyboard.down("Control");
    await page.keyboard.press("s");
    await page.keyboard.up("Control");
    const deadline = Date.now() + 6000;
    while (!lastSavePost && Date.now() < deadline) await page.waitForTimeout(50);
    if (!lastSavePost) throw new Error("Ctrl+S produced no POST to /api/save-board within 6s");
    return lastSavePost;
  };

  // The site nav is 232px wide and fixed, so every gesture below starts well
  // clear of it. Middle-drag pans from anywhere on the board.
  const panBy = async (dx, dy) => {
    await page.mouse.move(760, 460);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(760 + dx, 460 + dy, { steps: 8 });
    await page.mouse.up({ button: "middle" });
    await page.waitForTimeout(120);
  };
  const zoomBy = async (ticks) => {
    await page.mouse.move(820, 500);
    await page.mouse.wheel(0, ticks);
    await page.waitForTimeout(140);
  };
  const withShift = async (key) => {
    // page.mouse.click's `modifiers` are silently ignored in this repo's
    // experience; keyboard.down / up is the shape that is trusted here.
    await page.keyboard.down("Shift");
    await page.keyboard.press(key);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(200);
  };
  const step = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(160);
  };
  const chromeVisible = () => page.evaluate(() => ({
    toolbar: !!document.querySelector(".braindump-toolbar-shell")?.getClientRects().length,
    nav: !!document.querySelector(".sidenav")?.getClientRects().length
  }));

  // ================================================================= phase A
  // A board whose author has never touched this. Pan and zoom it, which is what
  // any visitor does, and the saved envelope and the local draft must not have
  // gained a presentation key.
  {
    beginPhase();
    await panBy(-180, -120);
    await zoomBy(-240);
    await page.waitForTimeout(700); // the local draft is written on a 400ms debounce

    // The draft first, because it is written by the incremental serializer and a
    // Ctrl+S would overwrite it with the other one's output.
    const draft = await draftJson();
    check(typeof draft === "string" && draft.length > 0,
      "A: setup, panning should have written a local draft (otherwise the next check is vacuous)");
    check(!LEAK_WORDS.test(String(draft)),
      `A: no presentation state may appear in the local draft. Found near: ${leakContext(draft)}`);

    const bytes = await savedJson();
    const parsed = JSON.parse(bytes);
    check(!("viewpoints" in parsed),
      `A: a board nobody has presented must not gain a "viewpoints" key. Keys: ${JSON.stringify(Object.keys(parsed))}`);
    check(!LEAK_WORDS.test(bytes),
      `A: no presentation vocabulary of any kind may appear in the board a user saves. Found near: ${leakContext(bytes)}`);
    endPhase("A (a board nobody presented stays clean)");
  }

  // ================================================================= phase B
  // Three viewpoints, saved from three genuinely different cameras. The named
  // list has to come back out of the command palette, because a viewpoint you
  // cannot find by name is not a named viewpoint.
  const saved = [];
  {
    beginPhase();
    const frames = [
      async () => { await panBy(300, 220); await zoomBy(-120); },
      async () => { await panBy(-620, -180); await zoomBy(240); },
      async () => { await panBy(180, -520); await zoomBy(-360); }
    ];
    for (const frame of frames) {
      await frame();
      const before = await readCamera();
      await withShift("a");
      saved.push(before);
    }

    check(saved.every(Boolean), `B: setup, every camera should be readable, got ${JSON.stringify(saved)}`);
    check(apart(saved[0], saved[1]) > 40 && apart(saved[1], saved[2]) > 40 && apart(saved[0], saved[2]) > 40,
      `B: setup, the three viewpoints must be genuinely different cameras: ${saved.map(show).join(" | ")}`);

    // The local draft goes through a different serializer (the incremental one)
    // than a Ctrl+S does, so it is asserted first and separately. A drift
    // between the two is how a feature ends up in the save and missing from the
    // draft, or the other way round.
    await page.waitForTimeout(700);
    let draftViewpoints = null;
    try { draftViewpoints = JSON.parse(String(await draftJson())).viewpoints; } catch (error) { draftViewpoints = null; }
    check(Array.isArray(draftViewpoints) && draftViewpoints.length === 3,
      `B: the incremental local draft must carry the same three viewpoints, got ${JSON.stringify(draftViewpoints)}`);

    const stored = JSON.parse(await savedJson()).viewpoints;
    check(Array.isArray(stored) && stored.length === 3,
      `B: Shift+A three times must leave three viewpoints on the board, got ${JSON.stringify(stored)}`);
    if (Array.isArray(stored) && stored.length === 3) {
      for (let i = 0; i < 3; i += 1) {
        check(near(stored[i], saved[i]),
          `B: viewpoint ${i + 1} must store the camera that was on screen. stored ${show(stored[i])}, was ${show(saved[i])}`);
        check(typeof stored[i].name === "string" && stored[i].name.trim().length > 0,
          `B: viewpoint ${i + 1} must carry a name, got ${JSON.stringify(stored[i].name)}`);
      }
    }

    // Findable by name, from the palette, without going through a menu.
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-board-ui="command-palette"] .bd-palette-row .bd-palette-name'))
        .map((el) => el.textContent.trim()));
    const names = (Array.isArray(stored) ? stored : []).map((v) => v.name);
    check(names.length === 3, "B: setup, three names to look for in the palette");
    for (const name of names) {
      check(titles.some((t) => t.includes(name)),
        `B: the palette must list viewpoint "${name}" by name. Got: ${JSON.stringify(titles.filter((t) => /view/i.test(t)))}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    endPhase("B (Shift+A saves a named viewpoint, and the board carries it)");
  }

  // ================================================================= phase C
  // Entering the presentation. The camera it lands on is viewpoint one, in real
  // numbers, and the working camera it left is far enough away that landing
  // there by accident is impossible.
  let workingCamera = null;
  {
    beginPhase();
    await panBy(-420, 340);
    await zoomBy(300);
    workingCamera = await readCamera();
    check(apart(workingCamera, saved[0]) > 50,
      `C: setup, the working camera must not already be viewpoint 1: ${show(workingCamera)} vs ${show(saved[0])}`);

    const chromeBefore = await chromeVisible();
    check(chromeBefore.toolbar && chromeBefore.nav, "C: setup, the toolbar and the site nav should be on screen first");

    await withShift("p");
    const landed = await readCamera();
    check(near(landed, saved[0]),
      `C: presenting must move the camera to viewpoint 1. Landed ${show(landed)}, viewpoint 1 is ${show(saved[0])}`);

    const chromeAfter = await chromeVisible();
    check(!chromeAfter.toolbar, "C: presenting must take the toolbar off the screen");
    check(!chromeAfter.nav, "C: presenting must take the site nav off the screen");
    const hud = await page.textContent(HUD).catch(() => null);
    check(typeof hud === "string" && /1\s*\/\s*3/.test(hud),
      `C: the presenter needs to know where they are, expected "1 / 3", got ${JSON.stringify(hud)}`);
    endPhase("C (Shift+P goes to viewpoint 1 and clears the chrome)");
  }

  // ================================================================= phase D
  // Stepping. Every hop asserts it was somewhere else first, so a camera that
  // is stuck cannot pass by being coincidentally correct.
  {
    beginPhase();
    const hop = async (key, target, label) => {
      const before = await readCamera();
      check(apart(before, target) > 40,
        `D: setup for ${label}, the camera must not already be at the target: ${show(before)} vs ${show(target)}`);
      await step(key);
      const after = await readCamera();
      check(near(after, target), `D: ${label} must land on ${show(target)}, landed ${show(after)}`);
    };

    await hop("ArrowRight", saved[1], "the next viewpoint");
    await hop("ArrowRight", saved[2], "the one after that");

    // Off the end. A talk that wraps back to slide one in front of a room is
    // the behaviour nobody wants, so the last viewpoint holds.
    await step("ArrowRight");
    const held = await readCamera();
    check(near(held, saved[2]),
      `D: stepping past the last viewpoint must hold there, not wrap. Expected ${show(saved[2])}, got ${show(held)}`);

    await hop("ArrowLeft", saved[1], "back one");
    await hop("ArrowLeft", saved[0], "back to the start");

    // And off the front.
    await step("ArrowLeft");
    const front = await readCamera();
    check(near(front, saved[0]),
      `D: stepping back off the front must hold on viewpoint 1, got ${show(front)}`);
    endPhase("D (the arrows step to the stored cameras, and clamp at both ends)");
  }

  // ================================================================= phase G
  // Saved WHILE a presentation is running. This is the case the per-screen rule
  // exists for: the list is authored and must be in the file, and which slide is
  // up plus the camera to go back to are this person's screen and must not be.
  {
    beginPhase();
    await step("ArrowRight");
    const bytes = await savedJson();
    const parsed = JSON.parse(bytes);
    check(Array.isArray(parsed.viewpoints) && parsed.viewpoints.length === 3,
      "G: the authored half, the viewpoint list, must be in a board saved mid-presentation");
    for (const key of ["presentation", "returnCamera", "presenting", "isPresenting", "slideIndex"]) {
      check(!new RegExp(`"${key}"`).test(bytes),
        `G: "${key}" is session state and must never reach the board file. Bytes contained it.`);
    }
    const shapes = (parsed.viewpoints || []).map((v) => Object.keys(v).sort().join(","));
    check(shapes.every((s) => s === "id,name,x,y,z"),
      `G: a viewpoint is a named camera and nothing else, got shapes ${JSON.stringify(shapes)}`);
    endPhase("G (a board saved mid-talk carries the list, not the talk)");
  }

  // ================================================================= phase E
  // Getting out. The camera the presenter was working at before they started,
  // not the last slide and not the board's default.
  {
    beginPhase();
    const beforeEscape = await readCamera();
    check(apart(beforeEscape, workingCamera) > 50,
      `E: setup, the presentation must have moved away from the working camera: ${show(beforeEscape)} vs ${show(workingCamera)}`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const restored = await readCamera();
    check(near(restored, workingCamera),
      `E: leaving must restore the camera you were on before you entered. Expected ${show(workingCamera)}, got ${show(restored)}`);

    const chrome = await chromeVisible();
    check(chrome.toolbar && chrome.nav, "E: leaving must give the toolbar and the site nav back");
    check((await page.locator(HUD).count()) === 0, "E: the presenter's counter must go away with the presentation");
    endPhase("E (Escape restores the camera you were on, and the chrome)");
  }

  // ================================================================= phase F
  // The order survives a reload, through the FILE. The bytes the board says it
  // would save are served back as the .canvas, and the local draft is wiped by
  // the init script on every load, so nothing here can be answered out of this
  // tab's leftovers.
  {
    beginPhase();
    servedCanvas = await savedJson();
    check(/"viewpoints"/.test(servedCanvas), "F: setup, the bytes about to be served must contain the viewpoints");

    await openBoard();
    const draftAfterLoad = await draftJson();
    check(!draftAfterLoad, "F: setup, the local draft must be empty on load, or this phase proves nothing");

    const reloaded = JSON.parse(await savedJson()).viewpoints;
    check(Array.isArray(reloaded) && reloaded.length === 3,
      `F: three viewpoints must come back off the file, got ${JSON.stringify(reloaded)}`);

    // Not just "three rows came back". Present, and walk them: the order and the
    // numbers have to be the ones that were authored before the reload.
    await withShift("p");
    const first = await readCamera();
    check(near(first, saved[0]), `F: after a reload, viewpoint 1 must still be ${show(saved[0])}, got ${show(first)}`);
    await step("ArrowRight");
    const second = await readCamera();
    check(near(second, saved[1]), `F: and viewpoint 2 still ${show(saved[1])}, got ${show(second)}`);
    await step("ArrowRight");
    const third = await readCamera();
    check(near(third, saved[2]), `F: and viewpoint 3 still ${show(saved[2])}, got ${show(third)}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    endPhase("F (the order and the cameras survive a reload from the board file)");
  }

  check(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
} finally {
  if (browser) await browser.close();
  child.kill();
}

assert.deepEqual(failures, [], `presentation mode is not doing its job:\n  ${failures.join("\n  ")}`);
console.log("presentation-mode: all phases green");
