// The canvas tool had no keyboard shortcut, and toolbar buttons were
// inconsistent about showing their key on hover: some titles said "Pen (P)",
// the canvas button just said "New canvas".
//
// This suite proves, against real rendered/interactive state rather than
// source text:
//
//   1. The new key actually creates a canvas node on the board (not just that
//      a handler exists for it).
//   2. The same key, pressed while a note is being edited, types the literal
//      letter into the note instead of firing the tool — reusing the guard
//      the rest of the keydown handler already has, not a second one.
//   3. Every toolbar button that has a keyboard shortcut shows it in the
//      exact string a hovering user would read (the native title tooltip,
//      chosen deliberately over a hand-drawn popover — see notes.md for why),
//      not merely that a `title` attribute is present.
//   4. The shortcuts panel behind `?` lists the new key, so the panel and the
//      keyboard agree.
//
// Sandbox: nothing on disk is touched. /api/save-board is intercepted before
// any page script runs; the canvas-creation call (identified by its
// `filename` query param, the only save call new-canvas ever makes) gets a
// fake 200 so the client believes the sidecar write succeeded and draws the
// node, and every other save call is refused outright. Autosave is disabled
// through the settings key. No file under content/ is read for its content
// either: nodes are seeded straight into the fetched canvas JSON like
// shortcuts-panel.test.mjs does.
//
// Set BD_PATCHED_JS to a patched copy of JavaScript/braindump.js to run this
// against a candidate build instead of the file on disk.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4275;
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

const NOTE = { id: "tsh-note", x: 500, y: 320 };
const node = (n) => ({ id: n.id, type: "text", x: n.x, y: n.y, width: 240, height: 140, text: "hello" });

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [node(NOTE)],
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
    // addInitScript runs in every same-origin frame; only the top document
    // owns this board's storage.
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

  // The only write endpoint this suite could ever reach. Canvas creation is
  // the one call that carries a `filename` param; fake that one success so
  // the client draws the node it would draw on disk, and refuse every other
  // save so nothing real is ever touched.
  let sidecarSaves = 0;
  let boardSaves = 0;
  await page.route("**/api/save-board*", (route) => {
    const url = new URL(route.request().url());
    const filename = url.searchParams.get("filename");
    if (filename) {
      sidecarSaves += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: `/content/boards/test-board/${filename}`,
          path: `content/boards/test-board/${filename}`,
        }),
      });
    }
    boardSaves += 1;
    return route.fulfill({ status: 503, body: "blocked by test" });
  });

  if (patchedScript) {
    await page.route("**/braindump.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: patchedScript }));
  }

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`#${NOTE.id}`, { timeout: 15000 });
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none !important;animation:none !important;}" });
  await page.waitForTimeout(150);

  const canvasNodeCount = () =>
    page.evaluate(() => document.querySelectorAll(".bd-item.bd-layer-board-preview").length);

  // ============================================================== phase B
  // Pressing C with nothing focused creates a real canvas node on the board,
  // not just that a handler ran.
  {
    assert.equal(await canvasNodeCount(), 0, "B: setup, no canvas node before the key is pressed");
    await page.keyboard.press("c");
    await page.waitForTimeout(300);
    assert.equal(await canvasNodeCount(), 1, "B: pressing C must create one canvas node on the board");
    assert.equal(sidecarSaves, 1, "B: creating the node must have gone through the sidecar save path");

    const nodeInfo = await page.evaluate(() => {
      const el = document.querySelector(".bd-item.bd-layer-board-preview");
      return {
        action: el?.querySelector(".bd-board-preview-actions")?.textContent?.trim() || "",
      };
    });
    assert.equal(nodeInfo.action, "Open canvas", "B: the created node is a real, openable canvas node");
    console.log("B (C creates a canvas node on the board): ok");
  }

  // Clean the node created in phase B off the board before phase C, undo is
  // the same user-facing action every other tool's cleanup in this repo uses.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  assert.equal(await canvasNodeCount(), 0, "setup: undo must remove the phase-B canvas node before phase C");

  // ============================================================== phase C
  // The same key, while typing in a note, must type the letter instead of
  // firing the tool. This reuses the handler's existing typing-target guard
  // (checked directly: no second canvas node appears, and the letter lands
  // in the note's text).
  {
    await page.dblclick(`#${NOTE.id}`);
    await page.waitForTimeout(150);
    const editing = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const ta = el.querySelector(".bd-text-editor");
      return !!ta && document.activeElement === ta;
    }, NOTE.id);
    assert.ok(editing, "C: setup, double-click should put the caret in the note");

    await page.keyboard.type("abc");
    await page.waitForTimeout(150);
    const typed = await page.evaluate((id) =>
      document.getElementById(id).querySelector(".bd-text-editor").innerText, NOTE.id);
    assert.ok(typed.includes("abc"), `C: the note should contain the literal letters, got ${JSON.stringify(typed)}`);
    assert.equal(await canvasNodeCount(), 0, "C: C must not create a canvas node while typing in a note");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    console.log("C (typing C into a note types c, no canvas node appears): ok");
  }

  // ============================================================== phase D
  // Every toolbar button that has a keyboard shortcut shows it in the exact
  // string a hovering user reads, not merely that a `title` attribute exists
  // on the element. Buttons with no shortcut at all (Recommend, Export,
  // Settings, More, Feature request, Bug report) are not asserted here: they
  // have nothing to show.
  {
    const expectations = [
      { selector: '[data-tool="select"]', pattern: /select.*\(v\)/i },
      { selector: '[data-tool="pan"]', pattern: /pan.*\(space\)/i },
      { selector: '[data-tool="text"]', pattern: /text.*\(t\)/i },
      { selector: '[data-tool="draw"]', pattern: /(pen|draw).*\(p\)/i },
      { selector: '[data-tool="bookmark"]', pattern: /(link|bookmark).*\(l\)/i },
      { selector: '[data-tool="erase"]', pattern: /eraser.*\(e\)/i },
      { selector: '.braindump-toolbar-action-desktop-only[data-tool="save"]', pattern: /save.*\(ctrl(\/cmd)?\+?s\)|save.*ctrl.*s/i },
      { selector: '[data-tool="new-markdown"]', pattern: /markdown.*\(x\)/i },
      { selector: '[data-tool="new-canvas"]', pattern: /canvas.*\(c\)/i },
    ];

    for (const { selector, pattern } of expectations) {
      const title = await page.locator(selector).first().getAttribute("title");
      assert.ok(title, `D: ${selector} must carry a title attribute at all`);
      assert.match(
        title,
        pattern,
        `D: ${selector}'s title "${title}" must read as the tool name plus its key, the exact text a hovering user sees`
      );
    }
    console.log(`D (every shortcut-bearing button's hover text names its key, checked ${expectations.length}): ok`);
  }

  // ============================================================== phase E
  // The shortcuts panel behind `?` must list C, so the panel and the keyboard
  // agree. Read the row like shortcuts-panel.test.mjs does, then perform the
  // gesture the row claims.
  {
    await page.keyboard.press("?");
    await page.waitForTimeout(120);
    const panelVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-board-ui="shortcuts-panel"]');
      return !!el && !el.hidden;
    });
    assert.ok(panelVisible, "E: setup, ? must open the shortcuts panel");

    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-board-ui="shortcuts-panel"] .bd-shortcuts-group')).flatMap((group) => {
        const title = group.querySelector("h3")?.textContent.trim() || "";
        return Array.from(group.querySelectorAll("li")).map((li) => ({
          group: title,
          keys: Array.from(li.querySelectorAll("kbd")).map((k) => k.textContent.trim()).join("+"),
          what: (li.querySelector(".bd-shortcuts-what")?.textContent || "").trim(),
        }));
      }));

    const cRow = rows.find((row) => row.keys.toLowerCase() === "c" && row.group.toLowerCase().includes("tools"));
    assert.ok(cRow, `E: the panel must list a bare "C" row in the Tools group. Rows: ${JSON.stringify(rows)}`);
    assert.match(cRow.what, /canvas/i, `E: the C row must describe the canvas tool, got "${cRow.what}"`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // Perform the gesture the row claims, same discipline as phase B.
    assert.equal(await canvasNodeCount(), 0, "E: setup, no canvas node before performing the row's own claim");
    await page.keyboard.press("c");
    await page.waitForTimeout(300);
    assert.equal(await canvasNodeCount(), 1, "E: the panel's C row must actually do what it says");
    console.log("E (shortcuts panel lists C in Tools, and it does what the row claims): ok");
  }

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log("\ntool-shortcuts-and-hints: all phases passed");
} finally {
  await browser?.close();
  child.kill();
}
