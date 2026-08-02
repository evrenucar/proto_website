// Two small, user-filed cards, checked together because both are about the
// toolbar's icons:
//
// 1. "import export buttons icons need to be switched." The Export button and
//    the Import file-picker label had each other's icon (Export carried the
//    download glyph, Import carried the upload glyph — backwards from the
//    square-and-arrow-up/down convention this app's own markdown-download
//    buttons already use correctly). Checked here against the actual DOM
//    element each control is (by data-tool / accept attribute, not by
//    guessing from a screenshot), not against source text.
//
// 2. "The lock icon should be small but visible and yellow when the page is
//    locked and the bar is auto hidden." The lock button itself folds away
//    with the collapsed toolbar (by design, per direct user feedback the
//    day before — see toolbar-autohide-and-lock.test.mjs case D). Collapsed
//    + locked must still show SOMETHING, or a locked board looks identical
//    to an unlocked one with the toolbar tucked away, which is a trap.
//    Collapsed + unlocked must show nothing extra: just the reveal tab, as
//    before this card.
//
// Real pixels and real computed colour, not classes: transitions are
// disabled up front so a colour read never lands mid-fade, and visibility is
// read through Playwright's actual visibility engine (offsetless / hidden /
// zero-opacity all count as not visible), not a class-name check.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4301;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const notesPath = path.join(process.cwd(), "content", "boards", "test-board", "notes.md");
const fixturesDir = path.join(process.cwd(), "tests", "fixtures");

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

const canvasBackup = await readFile(canvasPath, "utf8");
const notesBackup = await readFile(notesPath, "utf8");
await writeFile(canvasPath, await readFile(path.join(fixturesDir, "test-board-seed.canvas"), "utf8"), "utf8");
await writeFile(notesPath, await readFile(path.join(fixturesDir, "test-board-seed-notes.md"), "utf8"), "utf8");

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();

  async function openBoard() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Rule: never let a probe write to content/. Block the save endpoint AND
    // disable autosave through the settings key before any page script runs.
    await context.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
    await context.addInitScript(() => {
      if (window.top !== window) return;
      localStorage.setItem(
        "board:test-board:settings",
        JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
      );
      localStorage.removeItem("board:test-board");
      localStorage.removeItem("board:test-board:meta");
      // Never assert a colour without disabling transitions first.
      const style = document.createElement("style");
      style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
      document.documentElement.appendChild(style);
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#test-text", { timeout: 15000 });
    return { context, page };
  }

  const openSettings = async (page) => {
    await page.keyboard.press("Escape");
    if (!(await page.locator('[data-tool="settings"]').isVisible())) {
      await page.click('[data-board-ui="toolbar-more"]');
    }
    await page.click('[data-tool="settings"]');
    await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
  };

  // --- Card 1: the Export button and the Import file-picker label carry the
  // glyph that matches what each one actually does, identified by the
  // element itself (data-tool for Export; the accept list for Import — the
  // one that takes image/pdf/markdown files into the board, as opposed to
  // the neighboring "Open Canvas" control that only takes .canvas files) —
  // not by which one currently happens to look like which icon. ---
  {
    const { context, page } = await openBoard();
    if (!(await page.locator('[data-tool="export"]').isVisible())) {
      await page.click('[data-board-ui="toolbar-more"]');
    }

    const exportPolyline = await page
      .locator('[data-tool="export"] svg polyline')
      .getAttribute("points");
    // The upload-shaped arrow (points up, out of the tray): Export sends the
    // board's data OUT, the "square.and.arrow.up" / share-and-export glyph
    // this app's own ecosystem convention (and the one most visitors already
    // know from iOS/macOS) uses for that direction.
    assert.equal(
      exportPolyline,
      "17 8 12 3 7 8",
      `Export button must carry the upload/outward glyph (arrow pointing up), got polyline points="${exportPolyline}"`
    );
    // Sanity: clicking it actually opens the export flow, confirming this is
    // really the export control and not a lookalike.
    await page.click('[data-tool="export"]');
    await page.waitForSelector("#braindump-export-modal:not([hidden])", { timeout: 3000 });
    await page.click("#braindump-export-cancel");

    const importInput = page.locator('input#braindump-import');
    const importAccept = await importInput.getAttribute("accept");
    assert.ok(
      /image\/\*/.test(importAccept || "") && /\.md/.test(importAccept || ""),
      `sanity: #braindump-import must be the multi-file-type importer, got accept="${importAccept}"`
    );
    const importPolyline = await page
      .locator('label:has(input#braindump-import) svg polyline')
      .getAttribute("points");
    // The download-shaped arrow (points down, into the tray): Import brings
    // outside files IN to the board, the "square.and.arrow.down" / save-and-
    // import direction.
    assert.equal(
      importPolyline,
      "7 10 12 15 17 10",
      `Import control must carry the download/inward glyph (arrow pointing down), got polyline points="${importPolyline}"`
    );

    await context.close();
  }

  // --- Card 2, part A: collapsed + LOCKED shows a small, visible, yellow
  // indicator. ---
  {
    const { context, page } = await openBoard();
    await openSettings(page);
    await page.locator("#braindump-setting-toolbar-autohide").check();
    await page.keyboard.press("Escape");

    const lockButton = page.locator('[data-board-ui="toolbar-lock"]');
    await lockButton.click();
    await page.waitForTimeout(100);
    assert.equal(await lockButton.getAttribute("aria-pressed"), "true", "sanity: board must report locked");

    await page.mouse.move(700, 200);
    await page.waitForTimeout(1300);
    assert.equal(
      await page.locator('[data-board-ui="toolbar"]').isVisible(),
      false,
      "sanity: the pill must be collapsed before checking the indicator"
    );

    const indicator = page.locator('[data-board-ui="toolbar-lock-indicator"]');
    assert.equal(
      await indicator.isVisible(),
      true,
      "A: locked + collapsed must show a visible lock indicator"
    );

    const box = await indicator.boundingBox();
    assert.ok(box && box.width > 0 && box.width <= 16 && box.height > 0 && box.height <= 16, `A: the indicator must be small (measured ${box?.width}x${box?.height})`);

    const bg = await indicator.evaluate((el) => getComputedStyle(el).backgroundColor);
    // rgb(242, 183, 5) == #f2b705, a yellow chosen against the toolbar
    // dock's own always-dark (#1a1919 in both themes) background.
    assert.equal(bg, "rgb(242, 183, 5)", `A: the indicator must be the expected yellow, got ${bg}`);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    assert.ok(r > 180 && g > 120 && b < 100, `A: sanity — computed colour ${bg} must actually read as yellow, not e.g. the dark tab background`);

    // B: the indicator must not be a second, independent hover target next
    // to the tab — it must not add any hoverable area the tab did not
    // already have. Checked geometrically (containment), which is the outcome
    // that actually matters: an indicator fully inside the tab's own box
    // cannot enlarge the tab's hover footprint no matter how it hovers,
    // whereas one that pokes out beside the tab could reveal the toolbar
    // from a point a person would not consider "on the tab". Card's own
    // wording allows hovering it to still reveal "if it is the tab" — this
    // proves it geometrically is.
    const tabBox = await page.locator('[data-board-ui="toolbar-reveal"]').boundingBox();
    assert.ok(
      box.x >= tabBox.x - 0.5 &&
        box.y >= tabBox.y - 0.5 &&
        box.x + box.width <= tabBox.x + tabBox.width + 0.5 &&
        box.y + box.height <= tabBox.y + tabBox.height + 0.5,
      `B: the indicator (${JSON.stringify(box)}) must sit entirely within the reveal tab's own box (${JSON.stringify(tabBox)}), not extend hoverable area beyond it`
    );

    // And, since it is geometrically part of the tab, hovering it does what
    // hovering the tab does: reveals the toolbar.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator('[data-board-ui="toolbar"]').isVisible(),
      true,
      "B: hovering the indicator (inside the tab's own box) still reveals the toolbar, same as hovering the tab"
    );

    // Re-collapse and confirm a point in the shell away from the tab
    // (and therefore away from the indicator) still does NOT reveal —
    // unchanged from toolbar-dock-position.test.mjs case F, re-proven here
    // because the indicator is new and must not have changed it.
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(700, 200);
    await page.waitForTimeout(1300);
    const shellBox = await page.locator('[data-board-ui="toolbar-shell"]').boundingBox();
    await page.mouse.move(shellBox.x + 12, shellBox.y + shellBox.height / 2);
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator('[data-board-ui="toolbar"]').isVisible(),
      false,
      "B: hovering the shell away from the tab must still not reveal the toolbar"
    );

    await context.close();
  }

  // --- Card 2, part C: collapsed + UNLOCKED shows nothing extra — same as
  // before this card, just the reveal tab. ---
  {
    const { context, page } = await openBoard();
    await openSettings(page);
    await page.locator("#braindump-setting-toolbar-autohide").check();
    await page.keyboard.press("Escape");

    await page.mouse.move(700, 200);
    await page.waitForTimeout(1300);
    assert.equal(
      await page.locator('[data-board-ui="toolbar"]').isVisible(),
      false,
      "sanity: the pill must be collapsed before checking the indicator"
    );

    const revealVisible = await page.locator('[data-board-ui="toolbar-reveal"]').isVisible();
    assert.equal(revealVisible, true, "sanity: the reveal tab must still show while collapsed and unlocked");

    const indicator = page.locator('[data-board-ui="toolbar-lock-indicator"]');
    assert.equal(
      await indicator.isVisible(),
      false,
      "C: collapsed + unlocked must NOT show the lock indicator"
    );

    await context.close();
  }

  console.log("lock indicator + import/export icons: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
  await writeFile(canvasPath, canvasBackup, "utf8");
  await writeFile(notesPath, notesBackup, "utf8");
}
