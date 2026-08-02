// Two cards from the tracker, both about the theme group in settings:
//
//   "accept color from theme setting should also control the default pen
//    color (they are the same)" — the accent swatch and the pen's ink were
//    the same cyan by coincidence: the accent lives in --bd-accent, the pen
//    had that same literal hard-coded a second time. This asserts a custom
//    accent actually reaches the next stroke drawn, and does NOT repaint ink
//    already on the board — a stroke keeps whatever colour it was drawn
//    with, which is a much smaller and less destructive claim than rewriting
//    board data on a settings change.
//
//   "For the theme settings add a way to 'return to default color scheme'
//    button small" — the important detail from the theme card: a board that
//    was never customized has NO theme key in its settings at all, and every
//    themed colour resolves through a CSS custom property's fallback to the
//    original literal. So reset must CLEAR the stored theme, not write the
//    default values back in. This suite proves that by comparing the reset
//    board's computed colours against a board that never had a theme, and by
//    asserting the persisted settings blob has no "theme" property left,
//    rather than one that merely equals the defaults.
//
// Deliberately not asserted: that some internal function ran or a listener
// fired. Every check here is either a rendered colour or the literal shape
// of what got written to localStorage.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4193;
const baseUrl = `http://127.0.0.1:${port}`;
const boardUrl = `${baseUrl}/content/boards/test-board.html`;

const CUSTOM_ACCENT_HEX = "#8b1d5c";
const CUSTOM_ACCENT_RGB = "rgb(139, 29, 92)";
const DEFAULT_ACCENT_RGB = "rgb(63, 218, 202)";
const DEFAULT_CANVAS_RGB = "rgb(21, 21, 21)";
const DEFAULT_GRID_DOT_RGB = "rgb(51, 51, 51)";

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
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
const pageErrors = [];

// Fresh context per case so stored theme/brush state cannot leak between them.
async function openBoard(theme) {
  // Taller than the default so there is genuinely empty canvas space below
  // every fixture node (they all sit within y=80..720) to draw the probe
  // stroke on, clear of both the nodes and the site's left nav rail.
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  await context.addInitScript((storedTheme) => {
    // addInitScript runs in every same-origin frame, including any iframe the
    // page mounts itself; only the top document owns this board's storage.
    if (window.top !== window) return;
    const settings = { autosaveEnabled: false, autosaveSeconds: 20, devMode: false };
    if (storedTheme) settings.theme = storedTheme;
    localStorage.setItem("board:test-board:settings", JSON.stringify(settings));
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    localStorage.removeItem("board:test-board:brush");
  }, theme || null);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-title", { timeout: 15000 });
  // Toolbar buttons carry a 200ms colour transition and the select tool goes
  // active during init, so a computed read taken right after load can land
  // mid-tween. Nothing here is about animation, so take it out of the
  // picture entirely rather than guess at a wait that is long enough.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }"
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

// Canvas units -> screen pixels, read straight off the camera the board is
// actually using. The board keeps whatever camera the last session left, by
// design, so nothing here assumes z=1 or a fixed origin.
const camera = (page) =>
  page.evaluate(() => {
    const viewport = document.querySelector("#braindump-viewport");
    const canvas = document.querySelector("#braindump-canvas");
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(canvas.style.transform);
    const rect = viewport.getBoundingClientRect();
    return { left: rect.left, top: rect.top, x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
  });

// Draws one short stroke with the pen tool and returns the rendered colour of
// the path it produced: the actual "stroke" the SVG paints, not a value read
// back out of a setting.
async function drawStrokeAndReadColour(page) {
  await page.click('[data-tool="draw"]');
  await page.waitForTimeout(80);
  const known = new Set(
    await page.evaluate(() => Array.from(document.querySelectorAll(".bd-item")).map((el) => el.id))
  );
  const cam = await camera(page);
  const px = (x) => cam.left + cam.x + x * cam.z;
  const py = (y) => cam.top + cam.y + y * cam.z;
  // Empty canvas space well below every fixture node (they all sit within
  // y=80..720) and clear of the site nav rail, which covers screen x=0..230.
  await page.mouse.move(px(600), py(900));
  await page.mouse.down();
  await page.mouse.move(px(900), py(940), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const colour = await page.evaluate((knownIds) => {
    const fresh = Array.from(document.querySelectorAll(".bd-item")).find((el) => !knownIds.includes(el.id));
    const path = fresh?.querySelector("svg.bd-drawing path");
    if (!path) return null;
    return { attr: path.getAttribute("stroke"), computed: getComputedStyle(path).stroke };
  }, Array.from(known));

  assert.ok(colour, "a pointer-up with the pen must create exactly one new stroke node with a path");
  return colour;
}

const readThemedColours = (page) =>
  page.evaluate(() => ({
    canvas: getComputedStyle(document.querySelector(".braindump-viewport")).backgroundColor,
    accent: getComputedStyle(document.querySelector(".braindump-toolbar button.active")).color,
    gridDot: getComputedStyle(document.querySelector(".braindump-grid pattern circle")).fill,
    viewportAttr: document.querySelector(".braindump-viewport").getAttribute("data-bd-theme"),
    rootAttr: document.documentElement.getAttribute("data-bd-theme")
  }));

try {
  await waitForServer(child);
  browser = await chromium.launch();

  // --- 1: a custom accent is what the very next stroke gets drawn in --------
  {
    const { context, page } = await openBoard({ accent: CUSTOM_ACCENT_HEX });
    const stroke = await drawStrokeAndReadColour(page);
    assert.equal(
      stroke.attr.toLowerCase(),
      CUSTOM_ACCENT_HEX,
      `1: the stroke's stroke attribute must be the custom accent, got ${stroke.attr}`
    );
    assert.equal(
      stroke.computed,
      CUSTOM_ACCENT_RGB,
      `1: the rendered stroke colour must resolve to the custom accent, got ${stroke.computed}`
    );
    await context.close();
  }

  // --- 2: reset makes a customized board's colours match one that never had
  //        a theme at all, not merely equal the shipped preset by coincidence
  {
    const { context: freshContext, page: freshPage } = await openBoard(null);
    const untouched = await readThemedColours(freshPage);
    const untouchedStored = await freshPage.evaluate(() =>
      localStorage.getItem("board:test-board:settings")
    );
    assert.ok(
      !JSON.parse(untouchedStored).theme,
      "2 setup: a board that was never customized must carry no theme key to begin with"
    );
    await freshContext.close();

    const { context, page } = await openBoard({
      mode: "light",
      background: "#222222",
      gridColor: "#444444",
      accent: CUSTOM_ACCENT_HEX
    });
    await openSettings(page);

    const beforeReset = await readThemedColours(page);
    assert.equal(beforeReset.accent, CUSTOM_ACCENT_RGB, "2 setup: the custom theme is actually applied first");

    const resetButton = page.locator('#braindump-settings-panel [id^="braindump-theme-reset-"]');
    assert.equal(await resetButton.count(), 1, "2: the Theme settings section must offer a reset button");
    await resetButton.click();
    await page.waitForTimeout(150);

    const afterReset = await readThemedColours(page);
    assert.deepEqual(
      afterReset,
      untouched,
      "2: after reset every themed colour must compute identical to a board with no theme stored"
    );
    assert.equal(afterReset.accent, DEFAULT_ACCENT_RGB, "2: sanity: the untouched-board accent really is the shipped cyan");
    assert.equal(afterReset.canvas, DEFAULT_CANVAS_RGB, "2: sanity: the untouched-board canvas really is #151515");
    assert.equal(afterReset.gridDot, DEFAULT_GRID_DOT_RGB, "2: sanity: the untouched-board grid dot really is #333");

    // --- 3: the stored settings key is genuinely cleared, not overwritten
    //        with the default values -------------------------------------
    const storedAfterReset = await page.evaluate(() =>
      localStorage.getItem("board:test-board:settings")
    );
    const parsed = JSON.parse(storedAfterReset);
    assert.ok(
      !("theme" in parsed) || parsed.theme === undefined,
      `3: reset must delete the theme key from storage, not write defaults into it, got ${JSON.stringify(parsed.theme)}`
    );

    // Bonus: the pen follows the reset too, tying both cards together.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    const strokeAfterReset = await drawStrokeAndReadColour(page);
    assert.equal(
      strokeAfterReset.attr.toLowerCase(),
      "#3fdaca",
      `bonus: after reset the pen must be back to the default accent, got ${strokeAfterReset.attr}`
    );

    await context.close();
  }

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log("theme reset and pen colour: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
