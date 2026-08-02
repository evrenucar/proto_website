// The command palette behind Ctrl+K, and the experimental-features setting.
//
// From the board: "There should be a command shortcut that opens a command
// palette where you can type any command. All commands and actions should be
// accessible in this command interface without going through the menu." And:
// "There should be a enable experimental features checkbox in settings."
//
// What this suite is for. A palette has three ways to be green and useless:
//
//   1. It opens, and lists six things. So phase B counts the rows and then
//      names twelve specific commands that have to be in there, one from each
//      derivation source (a key binding, a toolbar button, a drawer button, an
//      injected button, a settings boolean, the lock that lives outside the
//      pill). If the derivation loses a source, the count stays plausible and
//      the names go missing, so the names are what is asserted.
//   2. Enter "runs" a command, meaning a handler fired. So phase D never
//      asserts that anything was called. It reads the board before and after -
//      the active tool, the node count, the stroke count, whether the settings
//      panel is on screen, whether the developer overlay is on screen - and for
//      six commands it does the SAME thing through the real control and through
//      the palette and asserts the two deltas are identical. A palette command
//      that quietly did something else, or nothing, fails on the delta.
//   3. It fires while you are typing. Phase A puts the caret in a note, presses
//      the binding, and asserts the palette stayed shut and the note took the
//      keystrokes.
//
// Phase F is the checkbox, and it asserts what it does NOT do as well as what
// it does: running a CLI row makes no network request at all, because the thing
// that was refused on security grounds (a PTY over the preview server) must not
// come back through a settings toggle.
//
// Running this against a candidate build: set BD_PATCHED_JS to a patched copy
// of JavaScript/braindump.js and it is served in place of the repo's. Unset,
// which is how CI runs it, it tests the file on disk.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4317;
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

// Two plain text nodes at a 1:1 camera. Nothing here needs the real board's
// content, and a fixture keeps the counts below exact.
const NODE_A = { id: "cp-a", x: 500, y: 320 };
const NODE_B = { id: "cp-b", x: 1000, y: 320 };
const node = (n) => ({ id: n.id, type: "text", x: n.x, y: n.y, width: 200, height: 120, text: n.id });

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [node(NODE_A), node(NODE_B)],
  edges: []
};

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
// A phase that logs "ok" while it is quietly filing failures is the exact shape
// this repo's test audit went looking for, so the label is computed, not typed.
let phaseMark = 0;
const beginPhase = () => {
  phaseMark = failures.length;
};
const endPhase = (label) => {
  const added = failures.length - phaseMark;
  console.log(added === 0 ? `${label}: ok` : `${label}: FAILED, ${added} problem(s)`);
};

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });

  // Autosave off before any page script runs. Merged rather than overwritten so
  // a reload keeps whatever the board persisted, which is what phase F's
  // persistence case needs, while autosave still cannot come back on.
  await context.addInitScript(() => {
    if (window.top !== window) return;
    const key = "board:test-board:settings";
    let existing = {};
    try {
      existing = JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch (error) {
      existing = {};
    }
    localStorage.setItem(
      key,
      JSON.stringify({ ...existing, autosaveEnabled: false, autosaveSeconds: 20 })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  // Belt and braces on top of the settings key: no probe may write to content/.
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-asset*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  if (patchedScript) {
    await page.route("**/braindump.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: patchedScript }));
  }

  const openBoard = async () => {
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`#${NODE_A.id}`, { timeout: 15000 });
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none !important;animation:none !important;}" });
    await page.waitForTimeout(150);
  };
  await openBoard();

  const PALETTE = '[data-board-ui="command-palette"]';

  const paletteVisible = () => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el || el.hidden) return false;
    const card = el.querySelector(".bd-palette-card");
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 80 && rect.height > 40;
  }, PALETTE);

  const pressBinding = async () => {
    // page.mouse.click's `modifiers` are silently ignored; keyboard.press with a
    // modifier is not, but down/up is the shape this repo trusts.
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await page.waitForTimeout(120);
  };

  const rowTitles = () => page.evaluate((selector) =>
    Array.from(document.querySelectorAll(`${selector} .bd-palette-row .bd-palette-name`))
      .map((el) => el.textContent.trim()), PALETTE);

  const activeTitle = () => page.evaluate((selector) => {
    const row = document.querySelector(`${selector} .bd-palette-row.is-active`);
    return row ? row.querySelector(".bd-palette-name").textContent.trim() : null;
  }, PALETTE);

  const focusedIsPaletteInput = () => page.evaluate(() =>
    document.activeElement?.classList?.contains("bd-palette-input") === true);

  const openPalette = async () => {
    if (!(await paletteVisible())) await pressBinding();
    return paletteVisible();
  };

  const typeQuery = async (query) => {
    await page.keyboard.type(query, { delay: 12 });
    await page.waitForTimeout(120);
  };

  // Everything phase D compares. All of it is what a person sees on the board.
  const readBoard = () => page.evaluate(() => ({
    tool: document.querySelector(".braindump-viewport")?.dataset.mode || null,
    activeToolbarButton:
      document.querySelector(".braindump-toolbar button.active")?.dataset.tool || null,
    nodes: document.querySelectorAll(".bd-item").length,
    strokes: document.querySelectorAll(".bd-item svg.bd-drawing").length,
    settingsPanelOpen: document.querySelector("#braindump-settings-panel:not([hidden])") !== null,
    devOverlay: document.querySelector(".bd-dev-overlay") !== null,
    locked: document.querySelector(".braindump-toolbar-shell")?.classList.contains("is-locked") ||
      document.querySelector('[data-board-ui="toolbar-lock"]')?.getAttribute("aria-pressed") === "true",
    selected: Array.from(document.querySelectorAll(".bd-item.selected")).map((el) => el.id).sort()
  }));

  const deltaOf = (before, after) => {
    const out = {};
    for (const key of Object.keys(after)) {
      const a = JSON.stringify(before[key]);
      const b = JSON.stringify(after[key]);
      if (a !== b) out[key] = `${a} -> ${b}`;
    }
    return out;
  };

  const clickToolbar = async (tool) => {
    const button = page.locator(`.braindump-toolbar button[data-tool="${tool}"]`).first();
    if (!(await button.isVisible())) await page.click('[data-board-ui="toolbar-more"]');
    await button.click();
    await page.waitForTimeout(180);
  };

  // ================================================================= phase A
  // The binding opens it, keyboard-first, and a note keeps its keystrokes.
  {
    beginPhase();
    check(!(await paletteVisible()), "A: nothing should be open before the binding is pressed");
    await pressBinding();
    check(await paletteVisible(), "A: Ctrl+K must open a visible command palette");
    check(await focusedIsPaletteInput(), "A: the search box must take focus, so the palette is usable with the keyboard alone");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    check(!(await paletteVisible()), "A: Escape must close the palette");

    // Escape belongs to the palette while it is up, and to the selection after.
    await page.click(`#${NODE_A.id}`);
    await page.waitForTimeout(80);
    await pressBinding();
    check(await paletteVisible(), "A: the binding must reopen the palette");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    const stillSelected = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".bd-item.selected")).map((el) => el.id));
    check(
      stillSelected.length === 1 && stillSelected[0] === NODE_A.id,
      `A: that Escape belonged to the palette, the selection must survive it, got ${JSON.stringify(stillSelected)}`
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);

    // Typing in a note. The board eats keystrokes when focus is on BODY, and
    // this is exactly where it must not.
    await page.dblclick(`#${NODE_A.id}`);
    await page.waitForTimeout(150);
    const editing = await page.evaluate((id) => {
      const editor = document.getElementById(id)?.querySelector(".bd-text-editor");
      return !!editor && document.activeElement === editor;
    }, NODE_A.id);
    check(editing, "A: setup, double-click should put the caret in the note");
    await page.keyboard.type("keep typing");
    await pressBinding();
    check(!(await paletteVisible()), "A: the binding must not open the palette while you are typing in a note");
    const noteText = await page.evaluate((id) =>
      document.getElementById(id).querySelector(".bd-text-editor").innerText, NODE_A.id);
    check(noteText.includes("keep typing"), `A: the note should have taken the text, got ${JSON.stringify(noteText)}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.evaluate((id) => {
      const editor = document.getElementById(id).querySelector(".bd-text-editor");
      if (editor) editor.innerText = id;
    }, NODE_A.id);
    endPhase("A (Ctrl+K opens it, Escape closes it, a note keeps its keystrokes)");
  }

  // ================================================================= phase B
  // It is an index of the board, not a shortlist. Twelve named commands, one
  // from each place the list is derived from.
  {
    beginPhase();
    check(await openPalette(), "B: the palette must be open before its contents can be read");
    const titles = await rowTitles();
    check(titles.length >= 24, `B: the palette should list the whole board, found ${titles.length} commands`);

    const REQUIRED = [
      ["Pen", "a key binding routed through the toolbar"],
      ["Select", "a key binding routed through the toolbar"],
      ["Eraser", "a button that is injected, not in the page template"],
      ["New canvas", "a button that is injected into the drawer"],
      ["Undo", "a key binding with no button at all"],
      ["Redo", "a key binding with no button at all"],
      ["Save", "the toolbar's own save"],
      ["Export project bundle", "a drawer button"],
      ["Board settings", "a drawer button"],
      ["Show all shortcuts", "the ? panel, reachable from here"],
      ["Workspace: Developer mode", "a settings boolean"],
      ["Lock the board", "the lock, which lives outside the toolbar pill"]
    ];
    for (const [title, why] of REQUIRED) {
      check(titles.includes(title), `B: "${title}" (${why}) is missing from the palette. Got: ${JSON.stringify(titles)}`);
    }

    // Every command shows its own key where it has one, so the palette teaches.
    const undoKeys = await page.evaluate((selector) => {
      const row = Array.from(document.querySelectorAll(`${selector} .bd-palette-row`))
        .find((el) => el.querySelector(".bd-palette-name").textContent.trim() === "Undo");
      return row ? Array.from(row.querySelectorAll("kbd")).map((k) => k.textContent.trim()) : null;
    }, PALETTE);
    check(
      JSON.stringify(undoKeys) === JSON.stringify(["Ctrl", "Z"]),
      `B: the Undo row must show its own shortcut, got ${JSON.stringify(undoKeys)}`
    );

    // Fit, at both ends, with the list scrolling rather than spilling.
    const fitAt = async (width, height, label) => {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      const fit = await page.evaluate((selector) => {
        const card = document.querySelector(`${selector} .bd-palette-card`);
        const list = document.querySelector(`${selector} .bd-palette-list`);
        if (!card || !list) return null;
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: window.innerWidth - rect.right,
          bottom: window.innerHeight - rect.bottom,
          width: rect.width,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          listScrolls: list.scrollHeight > list.clientHeight + 1
        };
      }, PALETTE);
      if (!check(fit, `B/${label}: there is no palette card on screen to measure`)) {
        return { listScrolls: false };
      }
      check(fit.left >= -0.5 && fit.top >= -0.5 && fit.right >= -0.5 && fit.bottom >= -0.5,
        `B/${label}: the palette is cut off: ${JSON.stringify(fit)}`);
      check(fit.width >= 200, `B/${label}: the palette collapsed to ${fit.width}px wide`);
      check(fit.docOverflow <= 0, `B/${label}: it opened a ${fit.docOverflow}px horizontal document scroll`);
      return fit;
    };
    await fitAt(1440, 900, "1440");
    const narrow = await fitAt(390, 844, "390");
    check(narrow.listScrolls, "B/390: the list must scroll inside the card rather than spill off a phone screen");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    endPhase(`B (${titles.length} commands, all twelve named ones present, fits 1440 and 390)`);
  }

  // ================================================================= phase C
  // Typing filters, including out of order, and a miss says so.
  {
    beginPhase();
    await openPalette();
    await typeQuery("eras");
    let titles = await rowTitles();
    check(titles.length > 0 && titles.length < 6, `C: "eras" should narrow the list, got ${titles.length} rows`);
    check(titles.includes("Eraser"), `C: "eras" must find the eraser, got ${JSON.stringify(titles)}`);
    check(await activeTitle() === "Eraser", `C: "eras" should put Eraser under the cursor, got ${await activeTitle()}`);

    // Out of order characters, which is the whole point of fuzzy matching.
    await page.keyboard.press("Control+a");
    await typeQuery("nwmk");
    check(await activeTitle() === "New markdown note",
      `C: the fuzzy query "nwmk" should reach "New markdown note", got ${await activeTitle()}`);

    await page.keyboard.press("Control+a");
    await typeQuery("qzxqzx");
    titles = await rowTitles();
    check(titles.length === 0, `C: a query that matches nothing should show nothing, got ${JSON.stringify(titles)}`);
    const empty = await page.locator(`${PALETTE} .bd-palette-empty`).count();
    check(empty === 1, "C: a query that matches nothing should say so rather than show an empty box");

    // Arrows move, and they move the thing Enter would run.
    await page.keyboard.press("Control+a");
    await typeQuery("to");
    const first = await activeTitle();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(80);
    const second = await activeTitle();
    check(!!first && !!second && first !== second, `C: ArrowDown must move the selection, ${first} -> ${second}`);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(80);
    check(await activeTitle() === first, "C: ArrowUp must move it back");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    endPhase("C (filters, matches out of order, says when nothing matches, arrows move)");
  }

  // ================================================================= phase D
  // The honest part. Six commands, each done twice: once through the control
  // that already existed, once through the palette. The board's before/after
  // delta has to be the same both times.
  {
    beginPhase();
    const runFromPalette = async (query, expectedTitle) => {
      await openPalette();
      await typeQuery(query);
      const title = await activeTitle();
      if (!check(title === expectedTitle,
        `D: "${query}" should land on "${expectedTitle}", got ${JSON.stringify(title)}`)) {
        await page.keyboard.press("Escape");
        return false;
      }
      await page.keyboard.press("Enter");
      await page.waitForTimeout(280);
      check(!(await paletteVisible()), `D: running "${expectedTitle}" should close the palette`);
      return true;
    };

    const scenarios = [
      {
        name: "Pen",
        query: "pen",
        reset: async () => { await page.keyboard.press("v"); await page.waitForTimeout(120); },
        real: async () => clickToolbar("draw")
      },
      {
        name: "Select",
        query: "select",
        reset: async () => { await page.keyboard.press("p"); await page.waitForTimeout(120); },
        real: async () => clickToolbar("select")
      },
      {
        name: "Board settings",
        query: "board sett",
        reset: async () => {
          await page.evaluate(() => {
            const panel = document.querySelector("#braindump-settings-panel");
            if (panel && !panel.hidden) panel.hidden = true;
          });
          await page.waitForTimeout(120);
        },
        real: async () => clickToolbar("settings")
      },
      {
        name: "Workspace: Developer mode",
        query: "developer",
        reset: async () => {
          await page.evaluate(() => {
            const box = document.querySelector("#braindump-setting-dev-mode");
            if (box?.checked) box.click();
          });
          await page.waitForTimeout(200);
        },
        real: async () => {
          await page.evaluate(() => document.querySelector("#braindump-setting-dev-mode").click());
          await page.waitForTimeout(250);
        }
      },
      {
        name: "Delete the selection",
        query: "delete the",
        reset: async () => {
          await page.evaluate((ids) => {
            document.querySelectorAll(".bd-item.selected").forEach((el) => el.classList.remove("selected"));
            document.getElementById(ids)?.classList.add("selected");
          }, NODE_B.id);
          await page.waitForTimeout(100);
        },
        real: async () => { await page.keyboard.press("Delete"); await page.waitForTimeout(220); },
        after: async () => { await page.keyboard.press("Control+z"); await page.waitForTimeout(280); }
      },
      {
        name: "Undo",
        query: "undo",
        reset: async () => {
          // A change to undo: nudge a node with the pointer, from the right of
          // the site's 232px left nav, which is painted over the board.
          await page.keyboard.press("v");
          const box = await page.locator(`#${NODE_B.id}`).boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(200);
          await page.evaluate(() =>
            document.querySelectorAll(".bd-item.selected").forEach((el) => el.classList.remove("selected")));
        },
        real: async () => { await page.keyboard.press("Control+z"); await page.waitForTimeout(280); },
        // Position, not the generic snapshot: undo's whole job here is the x.
        extra: () => page.evaluate((id) => Math.round(parseFloat(document.getElementById(id).style.left)), NODE_B.id)
      }
    ];

    for (const scenario of scenarios) {
      await scenario.reset();
      const beforeReal = { ...(await readBoard()), extra: scenario.extra ? await scenario.extra() : null };
      await scenario.real();
      const afterReal = { ...(await readBoard()), extra: scenario.extra ? await scenario.extra() : null };
      if (scenario.after) await scenario.after();
      const realDelta = deltaOf(beforeReal, afterReal);
      check(
        Object.keys(realDelta).length > 0,
        `D/${scenario.name}: the real control changed nothing measurable, so the comparison would prove nothing`
      );

      await scenario.reset();
      const beforePalette = { ...(await readBoard()), extra: scenario.extra ? await scenario.extra() : null };
      const ran = await runFromPalette(scenario.query, scenario.name);
      const afterPalette = { ...(await readBoard()), extra: scenario.extra ? await scenario.extra() : null };
      if (scenario.after) await scenario.after();
      const paletteDelta = deltaOf(beforePalette, afterPalette);

      if (ran) {
        check(
          JSON.stringify(realDelta) === JSON.stringify(paletteDelta),
          `D/${scenario.name}: the palette did not do what the real control does.\n` +
            `      control: ${JSON.stringify(realDelta)}\n` +
            `      palette: ${JSON.stringify(paletteDelta)}`
        );
      }
      console.log(`D/${scenario.name}: control ${JSON.stringify(realDelta)} | palette ${JSON.stringify(paletteDelta)}`);
    }

    endPhase("D (six commands, palette delta identical to the real control's delta)");

    // Reset the tool and the selection for the phases below.
    await page.keyboard.press("v");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }

  // ================================================================= phase E
  // The shortcuts panel has to agree with what shipped. Read the key it
  // advertises out of the panel and then press exactly that.
  {
    beginPhase();
    await page.keyboard.press("?");
    await page.waitForTimeout(120);
    const advertised = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-board-ui="shortcuts-panel"] li'))
        .map((li) => ({
          keys: Array.from(li.querySelectorAll("kbd")).map((k) => k.textContent.trim()),
          what: (li.querySelector(".bd-shortcuts-what")?.textContent || "").trim()
        }))
        .find((row) => /palette/i.test(row.what)));
    if (check(!!advertised, "E: the shortcuts panel must advertise the command palette")) {
      check(
        JSON.stringify(advertised.keys) === JSON.stringify(["Ctrl", "K"]),
        `E: the panel advertises ${JSON.stringify(advertised.keys)}; that is the key that must open it`
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      // The panel writes "Ctrl" because that is what is printed on the key;
      // Playwright calls it "Control".
      const modifier = advertised.keys[0] === "Ctrl" ? "Control" : advertised.keys[0];
      await page.keyboard.down(modifier);
      await page.keyboard.press(advertised.keys[1].toLowerCase());
      await page.keyboard.up(modifier);
      await page.waitForTimeout(150);
      check(await paletteVisible(), "E: pressing the keys the shortcuts panel advertises must open the palette");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    } else {
      await page.keyboard.press("Escape");
    }

    // And the settings help carries a line for anyone who never finds the key.
    await page.evaluate(() => {
      document.querySelector('[data-board-ui="settings-panel"]').hidden = false;
    });
    const helpLine = page.locator(".braindump-help-list li", { hasText: "Command palette" }).first();
    if (check(await helpLine.count() > 0, "E: the settings help must carry a line about the command palette")) {
      await helpLine.locator("[data-palette-open]").click();
      await page.waitForTimeout(150);
      check(await paletteVisible(), "E: that line's button must open the palette");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => {
      document.querySelector('[data-board-ui="settings-panel"]').hidden = true;
    });
    endPhase("E (the shortcuts panel and the settings help both name the real key)");
  }

  // ================================================================= phase F
  // The experimental-features checkbox: off by default, what it turns on, that
  // it survives a reload, and what it must never turn on.
  await (async function experimentalFeaturesPhase() {
    beginPhase();
    await clickToolbar("settings");
    await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
    const box = page.locator("#braindump-setting-experimental");
    if (!check(await box.count() === 1, "F: settings must carry an experimental-features checkbox")) return;
    check(!(await box.isChecked()), "F: experimental features must be off on a board nobody has touched");
    const rowText = await page.evaluate(() =>
      document.querySelector("#braindump-setting-experimental").closest(".braindump-settings-toggle").innerText);
    check(/experimental/i.test(rowText), `F: the row must name itself, got ${JSON.stringify(rowText)}`);
    // It sits with the other workspace preferences rather than in a group of
    // its own, which is the panel's existing structure.
    const groupHeading = await page.evaluate(() =>
      document.querySelector("#braindump-setting-experimental")
        .closest(".braindump-settings-section")?.querySelector("h2, h3")?.textContent.trim());
    check(groupHeading === "Workspace", `F: the row belongs in the Workspace group, found it under ${JSON.stringify(groupHeading)}`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);

    // Off: no CLI anywhere in the palette.
    await openPalette();
    const titlesOff = await rowTitles();
    check(
      titlesOff.filter((title) => title.startsWith("CLI:")).length === 0,
      `F: with the checkbox off there must be no CLI commands, got ${JSON.stringify(titlesOff.filter((t) => t.startsWith("CLI:")))}`
    );
    // And the switch itself is in the palette, because it is a boolean setting.
    check(titlesOff.includes("Workspace: Experimental features"),
      "F: the experimental toggle is a boolean setting, so the palette must be able to flip it");

    // Turn it on from the palette, which also proves a setting is configurable
    // from here at all.
    await typeQuery("experimental");
    check(await activeTitle() === "Workspace: Experimental features",
      `F: "experimental" should land on the toggle, got ${await activeTitle()}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    check(await box.isChecked(), "F: running the setting command from the palette must tick the real checkbox");

    // On: the CLI commands appear and they name the real CLI.
    await openPalette();
    const titlesOn = await rowTitles();
    const cli = titlesOn.filter((title) => title.startsWith("CLI:"));
    check(cli.length >= 3, `F: with it on the palette should carry the CLI commands, got ${JSON.stringify(cli)}`);
    const cliLines = await page.evaluate((selector) =>
      Array.from(document.querySelectorAll(`${selector} .bd-palette-row`))
        .filter((row) => row.querySelector(".bd-palette-name").textContent.trim().startsWith("CLI:"))
        .map((row) => row.querySelector(".bd-palette-detail")?.textContent.trim() || ""), PALETTE);
    check(cliLines.every((line) => line.startsWith("npm run cosmo ")),
      `F: every CLI row must show the real command line, got ${JSON.stringify(cliLines)}`);
    check(cliLines.some((line) => line.includes("test-board")),
      `F: the lines must be for THIS board, got ${JSON.stringify(cliLines)}`);

    // Running one copies text and does nothing else. No request leaves the
    // page: the terminal that was refused on security grounds must not come
    // back through a checkbox.
    const requests = [];
    const record = (request) => requests.push(request.url());
    page.on("request", record);
    const wsOpened = [];
    page.on("websocket", (socket) => wsOpened.push(socket.url()));
    await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
    await typeQuery("cli nodes");
    const cliTitle = await activeTitle();
    check(/^CLI:/.test(cliTitle || ""), `F: "cli nodes" should land on a CLI row, got ${JSON.stringify(cliTitle)}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    page.off("request", record);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    check(clipboard.startsWith("npm run cosmo nodes"),
      `F: running a CLI command must put the line on the clipboard, got ${JSON.stringify(clipboard)}`);
    check(requests.length === 0, `F: running a CLI command must not talk to any server, it requested ${JSON.stringify(requests)}`);
    check(wsOpened.length === 0, `F: no websocket may open, got ${JSON.stringify(wsOpened)}`);
    const terminalUi = await page.evaluate(() =>
      document.body.innerHTML.toLowerCase().includes("connect to terminal"));
    check(!terminalUi, "F: the checkbox must not surface a terminal connect affordance");

    // It survives a reload, like every other board setting.
    await openBoard();
    await page.waitForTimeout(200);
    await clickToolbar("settings");
    await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
    check(await page.locator("#braindump-setting-experimental").isChecked(),
      "F: the setting must survive a reload");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    await openPalette();
    const titlesAfterReload = await rowTitles();
    check(titlesAfterReload.some((title) => title.startsWith("CLI:")),
      "F: and the CLI commands must still be there after the reload");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // Put the board back the way it was found.
    await page.evaluate(() => {
      const input = document.querySelector("#braindump-setting-experimental");
      if (input?.checked) input.click();
    });
    await page.waitForTimeout(200);
    endPhase(`F (off by default, adds ${cli.length} CLI rows when on, copies and never calls out, survives a reload)`);
  })();

  check(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  await context.close();
} finally {
  await browser?.close();
  child.kill();
}

assert.deepEqual(failures, [], `the command palette is not doing its job:\n  ${failures.join("\n  ")}`);

console.log(
  "\ncommand-palette: Ctrl+K opens it and a note does not, the list is derived from the shortcuts, " +
    "the toolbar and the settings, fuzzy search and the arrows work, six commands produce the same " +
    "board change as their real controls, and the experimental checkbox adds the CLI rows without " +
    "opening anything"
);
