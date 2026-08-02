// Light mode, and the theme group in board settings.
//
// From the board: "Add a light mode. And also add a custom theme group in
// settings where you can customize the THEME: background color, color of dots,
// types of scale elements (dots, tridots, grid, no grid), the accent color
// (currently the cyan that's everywhere)."
//
// Two things this pins that are easy to break later:
//
//  * A board with no stored theme must render exactly as it did before themes
//    existed. Every themed declaration in braindump.css is written as
//    var(--token, <the literal that used to be there>), and applyBoardTheme
//    never writes a theme key on its own, so an untouched board keeps the old
//    cascade. Case A asserts the resolved colours, not just the absence of the
//    attribute.
//
//  * The grid is decoration. Its markup is inline SVG baked into every
//    generated page by scripts/build-site.mjs, so the style switch rewrites the
//    <pattern> in place. Nothing may start reading it for coordinates, so case
//    F asserts the camera does not move when the style changes.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4233;
const baseUrl = `http://127.0.0.1:${port}`;
const boardUrl = `${baseUrl}/content/boards/test-board.html`;

const DARK_CANVAS = "rgb(21, 21, 21)";
const DARK_GRID_DOT = "rgb(51, 51, 51)";
const DARK_ACCENT = "rgb(63, 218, 202)";
const LIGHT_CANVAS = "rgb(242, 241, 238)";
const LIGHT_ACCENT = "rgb(13, 122, 112)";

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

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
const pageErrors = [];

// Every case gets a fresh context so the stored theme is whatever the case
// says it is. Autosave is off and the save endpoint is blocked in all of them:
// nothing here may reach content/.
async function openBoard(theme) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await context.addInitScript((storedTheme) => {
    const settings = { autosaveEnabled: false, autosaveSeconds: 20, devMode: false };
    if (storedTheme) settings.theme = storedTheme;
    localStorage.setItem("board:test-board:settings", JSON.stringify(settings));
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  }, theme || null);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-title", { timeout: 15000 });
  // Toolbar buttons carry a colour transition and the select tool goes active
  // during init, so a computed colour read immediately after load catches the
  // tween rather than the settled colour. A fixed wait was not enough: with the
  // machine busy the tool can go active after the wait has already started, so
  // the read still lands mid-tween and the accent comes back as the button's
  // resting grey. Every assertion here is about a resolved colour and none is
  // about animation, so take the animation out of the picture entirely.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  await page.waitForTimeout(200);
  return { context, page };
}

async function openSettings(page) {
  if (!(await page.locator('[data-tool="settings"]').isVisible())) {
    await page.click('[data-board-ui="toolbar-more"]');
  }
  await page.click('[data-tool="settings"]');
  await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
}

const readGridPattern = (page) =>
  page.evaluate(() => {
    const pattern = document.querySelector(".braindump-grid pattern");
    return {
      width: Number(pattern.getAttribute("width")),
      height: Number(pattern.getAttribute("height")),
      dots: Array.from(pattern.querySelectorAll("circle")).map((dot) => ({
        cx: Number(dot.getAttribute("cx")),
        cy: Number(dot.getAttribute("cy")),
        fill: getComputedStyle(dot).fill,
      })),
      lines: Array.from(pattern.querySelectorAll("path")).map((line) => ({
        d: line.getAttribute("d"),
        stroke: getComputedStyle(line).stroke,
      })),
    };
  });

// Composes a colour over its first opaque ancestor background and returns the
// WCAG 2.1 contrast ratio, so a translucent panel is measured as it is seen.
const CONTRAST_IN_PAGE = (selector) => {
  const parse = (value) => {
    const match = /rgba?\(([^)]+)\)/.exec(value || "");
    if (!match) return null;
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const element = document.querySelector(selector);
  if (!element) return null;
  const stack = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    const colour = parse(getComputedStyle(node).backgroundColor);
    if (colour && colour.a > 0) {
      stack.push(colour);
      if (colour.a === 1) break;
    }
  }
  let background = stack.length ? stack[stack.length - 1] : { r: 255, g: 255, b: 255, a: 1 };
  if (background.a < 1) background = over(background, { r: 255, g: 255, b: 255, a: 1 });
  for (let i = stack.length - 2; i >= 0; i -= 1) background = over(stack[i], background);
  const foreground = over(parse(getComputedStyle(element).color) || { r: 0, g: 0, b: 0, a: 1 }, background);
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

try {
  await waitForServer(child);
  browser = await chromium.launch();

  // --- A: no stored theme renders exactly as it did before themes existed ---
  {
    const { context, page } = await openBoard(null);
    const state = await page.evaluate(() => ({
      viewportAttribute: document.querySelector(".braindump-viewport").getAttribute("data-bd-theme"),
      rootAttribute: document.documentElement.getAttribute("data-bd-theme"),
      canvas: getComputedStyle(document.querySelector(".braindump-viewport")).backgroundColor,
      accent: getComputedStyle(document.querySelector(".braindump-toolbar button.active")).color,
      stored: localStorage.getItem("board:test-board:settings"),
    }));
    const grid = await readGridPattern(page);

    assert.equal(state.viewportAttribute, null, "A: an unthemed board must carry no theme attribute");
    assert.equal(state.rootAttribute, null, "A: an unthemed board must not mark the document either");
    assert.equal(state.canvas, DARK_CANVAS, "A: the canvas must still be #151515");
    assert.equal(state.accent, DARK_ACCENT, "A: the accent must still resolve to the cyan");
    assert.equal(grid.dots.length, 1, "A: the default grid is a single dot per tile");
    assert.deepEqual(
      { cx: grid.dots[0].cx, cy: grid.dots[0].cy, width: grid.width, height: grid.height },
      { cx: 1, cy: 1, width: 30, height: 30 },
      "A: the default pattern must match the geometry build-site.mjs emits"
    );
    assert.equal(grid.dots[0].fill, DARK_GRID_DOT, "A: the dots must still be #333");
    assert.ok(
      !JSON.parse(state.stored).theme,
      "A: simply loading a board must not write a theme key, or every existing board opts in by accident"
    );
    await context.close();
  }

  // --- B: the settings panel grows a theme group -----------------------------
  {
    const { context, page } = await openBoard(null);
    await openSettings(page);
    const ui = await page.evaluate(() => {
      const panel = document.querySelector("#braindump-settings-panel");
      const section = Array.from(panel.querySelectorAll(".braindump-settings-section")).find((node) =>
        node.querySelector("h3")?.textContent.trim() === "Theme"
      );
      if (!section) return null;
      return {
        modes: Array.from(section.querySelectorAll('input[type="radio"]')).map((input) => input.value),
        colours: Array.from(section.querySelectorAll('input[type="color"]')).length,
        gridOptions: Array.from(section.querySelectorAll("select option")).map((option) => option.value),
      };
    });

    assert.ok(ui, "B: the settings panel must contain a Theme section");
    assert.deepEqual(ui.modes, ["dark", "light"], "B: the theme group offers a dark and a light preset");
    assert.equal(ui.colours, 3, "B: background, dot colour and accent each get a colour input");
    assert.deepEqual(
      ui.gridOptions,
      ["dots", "tridots", "grid", "none"],
      "B: the four scale elements the request named"
    );
    await context.close();
  }

  // --- C: a stored light theme paints the board light ------------------------
  {
    const { context, page } = await openBoard({ mode: "light" });
    const state = await page.evaluate(() => ({
      viewportAttribute: document.querySelector(".braindump-viewport").getAttribute("data-bd-theme"),
      rootAttribute: document.documentElement.getAttribute("data-bd-theme"),
      canvas: getComputedStyle(document.querySelector(".braindump-viewport")).backgroundColor,
      accent: getComputedStyle(document.querySelector(".braindump-toolbar button.active")).color,
    }));

    assert.equal(state.viewportAttribute, "light", "C: the viewport carries the mode");
    assert.equal(
      state.rootAttribute,
      "light",
      "C: a full board marks the document too, since the intro panel sits outside the viewport"
    );
    assert.equal(state.canvas, LIGHT_CANVAS, "C: the canvas takes the light preset background");
    assert.equal(
      state.accent,
      LIGHT_ACCENT,
      "C: the light preset must not keep the cyan, which is 1.66:1 on paper"
    );
    await context.close();
  }

  // --- D: body text clears WCAG AA in both modes -----------------------------
  {
    for (const [mode, theme] of [["dark", null], ["light", { mode: "light" }]]) {
      const { context, page } = await openBoard(theme);
      await openSettings(page);
      for (const selector of ["#test-title", ".braindump-settings-label", ".braindump-help-copy"]) {
        const ratio = await page.evaluate(CONTRAST_IN_PAGE, selector);
        assert.ok(
          ratio !== null && ratio >= 4.5,
          `D: ${selector} in ${mode} mode is ${ratio?.toFixed(2)}:1, under the 4.5:1 AA floor for body text`
        );
      }
      await context.close();
    }
  }

  // --- E: a custom accent overrides the preset it was seeded from ------------
  {
    const { context, page } = await openBoard({ mode: "light", accent: "#8b1d5c" });
    const state = await page.evaluate(() => ({
      accent: getComputedStyle(document.querySelector(".braindump-toolbar button.active")).color,
      triple: getComputedStyle(document.querySelector(".braindump-viewport"))
        .getPropertyValue("--bd-accent-rgb")
        .trim(),
    }));

    assert.equal(state.accent, "rgb(139, 29, 92)", "E: the stored accent wins over the mode's preset");
    assert.equal(
      state.triple,
      "139, 29, 92",
      "E: the rgb triple must follow, or every rgba() wash keeps the old hue"
    );
    await context.close();
  }

  // --- F: the four grid styles, driven from the panel ------------------------
  {
    const { context, page } = await openBoard(null);
    await openSettings(page);
    const select = page.locator('#braindump-settings-panel select[id^="braindump-theme-grid-style"]');
    const camera = () => page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
    const cameraBefore = await camera();

    await select.selectOption("tridots");
    let grid = await readGridPattern(page);
    assert.equal(grid.dots.length, 2, "F: a triangular lattice needs two rows per tile");
    assert.ok(
      Math.abs(grid.height - 30 * Math.sqrt(3)) < 0.001,
      "F: the tri-dot tile is two rows of 30·sin(60°)"
    );
    assert.deepEqual(
      { cx: grid.dots[1].cx, cy: Math.round(grid.dots[1].cy * 1000) / 1000 },
      { cx: 16, cy: Math.round((1 + (30 * Math.sqrt(3)) / 2) * 1000) / 1000 },
      "F: the second row is offset by half a step"
    );

    await select.selectOption("grid");
    grid = await readGridPattern(page);
    assert.equal(grid.dots.length, 0, "F: grid lines replace the dots");
    assert.equal(grid.lines.length, 1, "F: one corner path per tile draws the whole lattice");
    assert.equal(grid.lines[0].stroke, DARK_GRID_DOT, "F: the lines take the configured grid colour");

    await select.selectOption("none");
    grid = await readGridPattern(page);
    assert.equal(grid.dots.length + grid.lines.length, 0, "F: 'none' empties the pattern");

    await select.selectOption("dots");
    grid = await readGridPattern(page);
    assert.deepEqual(
      { dots: grid.dots.length, cx: grid.dots[0].cx, cy: grid.dots[0].cy, height: grid.height },
      { dots: 1, cx: 1, cy: 1, height: 30 },
      "F: going back to dots restores the geometry the page shipped with"
    );

    assert.equal(
      await camera(),
      cameraBefore,
      "F: the grid is decoration. Changing it must never move the camera"
    );
    await context.close();
  }

  // --- G: picking a mode reseeds the swatches and persists --------------------
  {
    const { context, page } = await openBoard(null);
    await openSettings(page);
    await page.click('#braindump-settings-panel .braindump-settings-mode:has(input[value="light"])');
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => {
      const section = Array.from(
        document.querySelectorAll("#braindump-settings-panel .braindump-settings-section")
      ).find((node) => node.querySelector("h3")?.textContent.trim() === "Theme");
      return {
        swatches: Array.from(section.querySelectorAll('input[type="color"]')).map((input) => input.value),
        stored: JSON.parse(localStorage.getItem("board:test-board:settings")).theme,
        canvas: getComputedStyle(document.querySelector(".braindump-viewport")).backgroundColor,
      };
    });

    assert.equal(state.canvas, LIGHT_CANVAS, "G: clicking Light repaints the board");
    assert.deepEqual(
      state.swatches,
      ["#f2f1ee", "#c4c2bc", "#0d7a70"],
      "G: a mode is a preset, so it loads its colours into the swatches rather than leaving dark's showing"
    );
    assert.equal(state.stored.mode, "light", "G: the choice survives a reload");
    assert.equal(state.stored.accent, "#0d7a70", "G: and so do the colours it seeded");
    await context.close();
  }

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log("theme and light mode: all 7 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
