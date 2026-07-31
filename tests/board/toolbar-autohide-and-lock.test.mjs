// Two coupled features from the tracker, in the user's own words:
//
// "Ability to have the bottom tool bar auto hide... a small rounded corner
// rectangular tab left that comes up when you bring your mouse or tap on
// it. On mobile the touch target should be a bit larger than the
// button-tab itself."
//
// "Ability to have the page 'locked' so until it's unlocked it can't be
// edited. Can display a small lock icon on the toolbar (should also be
// visible in the collapsed auto-hidden state of the taskbar)."
//
// Both shipped on 2026-07-31. This suite was written while the runtime was
// owned by another agent, so it originally patched an in-memory copy of
// braindump.js and served that; now that the patch is on disk it drives the
// real files like every other suite.
//
// The lock's scope is the part worth reading the assertions for: it blocks
// what mutates a board (drag, resize, delete, create, paste, import, drawing,
// text and markdown editing) and deliberately leaves panning, zooming,
// selecting and copying alone, so a locked board is still fully inspectable.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4242;
const baseUrl = `http://127.0.0.1:${port}`;
// The sandbox board invites free play (see test-board-basics.test.mjs), so
// whatever a user or another agent left on it is unpredictable — a stray
// node sitting on top of #test-text has silently swallowed a click here
// before. Seed the same known-good fixture that suite uses and restore the
// original file in the finally block, so this run doesn't depend on, or
// permanently touch, what's on disk.
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

// Applied before the server even spawns: a missing anchor means the file has
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

  async function preparedContext(contextOptions) {
    const context = await browser.newContext(contextOptions);
    await context.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
    await context.addInitScript(() => {
      localStorage.setItem(
        "board:test-board:settings",
        JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
      );
      localStorage.removeItem("board:test-board");
      localStorage.removeItem("board:test-board:meta");
    });
    return context;
  }

  const context = await preparedContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-text", { timeout: 15000 });

  const openSettings = async () => {
    await page.keyboard.press("Escape");
    if (!(await page.locator('[data-tool="settings"]').isVisible())) {
      await page.click('[data-board-ui="toolbar-more"]');
    }
    await page.click('[data-tool="settings"]');
    await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
  };

  // --- A: the settings panel offers an auto-hide toggle ---
  await openSettings();
  const autoHideCheckbox = page.locator("#braindump-setting-toolbar-autohide");
  await autoHideCheckbox.waitFor({ state: "attached", timeout: 3000 });

  // --- B: enabling it, then idling with the pointer elsewhere, collapses
  // the toolbar down to the reveal tab ---
  await autoHideCheckbox.check();
  await page.keyboard.press("Escape");
  await page.mouse.move(700, 200);
  await page.waitForTimeout(1300);
  const collapsedState = await page.evaluate(() => ({
    shellCollapsed: document.querySelector('[data-board-ui="toolbar-shell"]')?.classList.contains("is-collapsed"),
    pillInert: document.querySelector('[data-board-ui="toolbar"]')?.hasAttribute("inert"),
  }));
  assert.equal(collapsedState.shellCollapsed, true, "B: toolbar shell must collapse once autohide is on and idle");
  assert.equal(collapsedState.pillInert, true, "B: the collapsed pill must be inert (out of the tab order)");
  assert.equal(await page.locator('[data-board-ui="toolbar"]').isVisible(), false, "B: the pill must be visually hidden once collapsed");

  // --- C: the reveal tab is visible while collapsed, and bringing the
  // pointer to it reveals the toolbar — a hover, deliberately, not a click:
  // the tab sits inside the same shell that reveals on mouseenter, so once
  // the pointer arrives the tab has already done its job (and, correctly,
  // disappears again as the real toolbar takes its place). That matches the
  // request verbatim ("comes up when you bring your mouse... on it"); the
  // tab's own click handler is what a tap or a keyboard Enter/Space uses,
  // since neither of those triggers a hover first.
  const revealTab = page.locator('[data-board-ui="toolbar-reveal"]');
  await revealTab.waitFor({ state: "visible", timeout: 3000 });
  const revealBox = await revealTab.boundingBox();
  await page.mouse.move(revealBox.x + revealBox.width / 2, revealBox.y + revealBox.height / 2);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-board-ui="toolbar"]').isVisible(), true, "C: bringing the pointer to the reveal tab must show the toolbar again");

  // --- D: lock button exists, and stays visible even once the toolbar
  // collapses again ---
  const lockButton = page.locator('[data-board-ui="toolbar-lock"]');
  await lockButton.waitFor({ state: "visible", timeout: 3000 });
  await page.mouse.move(700, 200);
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('[data-board-ui="toolbar"]').isVisible(), false, "D: sanity check — toolbar should be collapsed again");
  assert.equal(await lockButton.isVisible(), true, "D: the lock button must stay visible while the toolbar is collapsed");

  // --- E: keyboard reachability — the reveal tab is focusable while
  // collapsed, and focusing it reveals the toolbar. Tested before the lock
  // button on purpose: the lock button lives in the same shell, and shell
  // focus reveals the toolbar too (see buildToolbarLockDock's focusin
  // handler), which would hide the reveal tab (display:none once revealed)
  // out from under this check if it ran second. ---
  //
  // The reveal tab only exists while collapsed, so the moment it reveals the
  // toolbar it removes itself from the document's focusable set — it hands
  // focus forward instead of holding onto it. The meaningful check is the
  // outcome: the toolbar opens, and focus lands on a real, visible control
  // inside it rather than falling back to <body>.
  await page.evaluate(() => document.querySelector('[data-board-ui="toolbar-reveal"]').focus());
  await page.waitForTimeout(50);
  const afterRevealFocus = await page.evaluate(() => ({
    collapsed: document.querySelector('[data-board-ui="toolbar-shell"]').classList.contains("is-collapsed"),
    activeIsToolbarControl: !!document.activeElement?.closest('[data-board-ui="toolbar"]'),
  }));
  assert.equal(afterRevealFocus.collapsed, false, "E: focusing the reveal tab must reveal the toolbar");
  assert.equal(afterRevealFocus.activeIsToolbarControl, true, "E: focus must land on a real toolbar control, not get stranded on <body>");

  // Lock button: always in the document (not collapse-gated), so testing it
  // after the toolbar is already revealed is not a special case for it.
  const lockFocusable = await page.evaluate(() => {
    const btn = document.querySelector('[data-board-ui="toolbar-lock"]');
    btn.focus();
    return document.activeElement === btn;
  });
  assert.equal(lockFocusable, true, "E: the lock button must be reachable by keyboard");

  // Turn autohide back off so the rest of the run isn't fighting a collapse
  // timer while it drives the toolbar directly.
  await openSettings();
  await page.locator("#braindump-setting-toolbar-autohide").uncheck();
  await page.keyboard.press("Escape");

  // --- F: locking toggles the button's state and persists to the same
  // per-board settings key the rest of the settings panel uses ---
  await lockButton.click();
  await page.waitForTimeout(100);
  assert.equal(await lockButton.getAttribute("aria-pressed"), "true", "F: the lock button must report aria-pressed=true once locked");
  const settingsAfterLock = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("board:test-board:settings") || "{}")
  );
  assert.equal(settingsAfterLock.locked, true, "F: locking must persist under the board's existing settings key");

  // --- G: a locked board blocks drag, resize-triggering selection change,
  // delete, text editing and paste, but selecting and panning still work ---
  const posBeforeLocked = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });

  const textBox = await page.locator("#test-text").boundingBox();
  await page.mouse.move(textBox.x + 30, textBox.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(textBox.x + 30 + i * 15, textBox.y + 10 + i * 10);
  }
  await page.mouse.up();
  const posAfterLockedDrag = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  assert.deepEqual(posAfterLockedDrag, posBeforeLocked, "G: a locked board must not let a drag move a node");
  // Clicking the node is still a selection, not an edit.
  assert.equal(
    await page.evaluate(() => document.getElementById("test-text").classList.contains("selected")),
    true,
    "G: clicking a node on a locked board must still select it"
  );

  await page.mouse.dblclick(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await page.waitForTimeout(150);
  const editingStarted = await page.evaluate(
    () => document.querySelector("#test-text .bd-text-editor")?.contentEditable === "true"
  );
  assert.equal(editingStarted, false, "G: a locked board must not enter text-edit mode on double-click");

  const nodeCountBeforePaste = await page.evaluate(() => document.querySelectorAll(".bd-item").length);
  await page.mouse.move(700, 500);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "https://example.com/locked-board-paste-probe");
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(150);
  const nodeCountAfterPaste = await page.evaluate(() => document.querySelectorAll(".bd-item").length);
  assert.equal(nodeCountAfterPaste, nodeCountBeforePaste, "G: a locked board must not create a node from a paste");

  await page.keyboard.press("Delete");
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => !!document.getElementById("test-text")),
    true,
    "G: a locked board must not delete the selected node"
  );

  // Undo of a move made BEFORE the lock must also be blocked while locked.
  await lockButton.click(); // unlock
  await page.waitForTimeout(100);
  const textBox2 = await page.locator("#test-text").boundingBox();
  await page.mouse.move(textBox2.x + 30, textBox2.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(textBox2.x + 30 + i * 12, textBox2.y + 10 + i * 8);
  }
  await page.mouse.up();
  const posAfterUnlockedDrag = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  assert.notEqual(posAfterUnlockedDrag.left, posBeforeLocked.left, "G: sanity check — unlocked drag must still move the node");

  await lockButton.click(); // lock again, with a pending undo entry on the stack
  await page.waitForTimeout(100);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const posAfterLockedUndo = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  assert.deepEqual(posAfterLockedUndo, posAfterUnlockedDrag, "G: a locked board must not let Ctrl+Z undo a prior move");

  // Panning must still work while locked (space + drag pans the camera).
  const cameraBeforePan = await page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
  await page.keyboard.down("Space");
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(300, 340);
  await page.mouse.up();
  await page.keyboard.up("Space");
  const cameraAfterPan = await page.evaluate(() => document.querySelector(".braindump-canvas").style.transform);
  assert.notEqual(cameraAfterPan, cameraBeforePan, "G: panning must still work on a locked board");

  // --- H: unlocking restores normal editing ---
  await lockButton.click();
  await page.waitForTimeout(100);
  assert.equal(await lockButton.getAttribute("aria-pressed"), "false", "H: the lock button must report aria-pressed=false once unlocked");
  const textBox3 = await page.locator("#test-text").boundingBox();
  const posBeforeFinalDrag = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  await page.mouse.move(textBox3.x + 30, textBox3.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(textBox3.x + 30 + i * 12, textBox3.y + 10 + i * 8);
  }
  await page.mouse.up();
  const posAfterFinalDrag = await page.evaluate(() => {
    const el = document.getElementById("test-text");
    return { left: el.style.left, top: el.style.top };
  });
  assert.notEqual(posAfterFinalDrag.left, posBeforeFinalDrag.left, "H: unlocking must restore normal dragging");

  // --- I: no page errors from our own code across the whole run ---
  assert.deepEqual(pageErrors, [], "I: the run must produce no page errors");

  await context.close();

  // --- J: mobile / coarse-pointer touch target is larger than the visual
  // reveal tab, per the request's "touch target should be a bit larger than
  // the button-tab itself" ---
  const mobileContext = await preparedContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForSelector("#test-text", { timeout: 15000 });

  const pointerIsCoarse = await mobilePage.evaluate(() => matchMedia("(pointer: coarse)").matches);
  assert.equal(pointerIsCoarse, true, "J: sanity check — the mobile context must actually report pointer: coarse");

  if (!(await mobilePage.locator('[data-tool="settings"]').isVisible())) {
    await mobilePage.click('[data-board-ui="toolbar-more"]');
  }
  await mobilePage.click('[data-tool="settings"]');
  await mobilePage.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
  await mobilePage.locator("#braindump-setting-toolbar-autohide").check();
  await mobilePage.keyboard.press("Escape");
  await mobilePage.tap("body");
  await mobilePage.waitForTimeout(1300);
  await mobilePage.locator('[data-board-ui="toolbar-reveal"]').waitFor({ state: "visible", timeout: 3000 });

  const touchTarget = await mobilePage.evaluate(() => {
    const btn = document.querySelector('[data-board-ui="toolbar-reveal"]');
    const rect = btn.getBoundingClientRect();
    const before = getComputedStyle(btn, "::before");
    const num = (v) => Math.abs(parseFloat(v)) || 0;
    return {
      visibleWidth: rect.width,
      visibleHeight: rect.height,
      expandLeft: num(before.left),
      expandRight: num(before.right),
      expandTop: num(before.top),
      expandBottom: num(before.bottom),
    };
  });
  const hitWidth = touchTarget.visibleWidth + touchTarget.expandLeft + touchTarget.expandRight;
  const hitHeight = touchTarget.visibleHeight + touchTarget.expandTop + touchTarget.expandBottom;
  assert.ok(
    hitWidth > touchTarget.visibleWidth && hitHeight > touchTarget.visibleHeight,
    `J: the tap target (${hitWidth}x${hitHeight}) must be larger than the visible tab (${touchTarget.visibleWidth}x${touchTarget.visibleHeight})`
  );
  assert.ok(hitHeight >= 44, `J: the tap target height (${hitHeight}px) should meet a ~44px minimum touch target`);
  console.log(
    `J: visible tab ${touchTarget.visibleWidth}x${touchTarget.visibleHeight}px, tap target ${hitWidth}x${hitHeight}px`
  );

  await mobileContext.close();

  console.log("toolbar autohide + lock: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
  await writeFile(canvasPath, canvasBackup, "utf8");
  await writeFile(notesPath, notesBackup, "utf8");
}
