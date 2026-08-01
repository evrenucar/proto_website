// Direct user feedback on the toolbar auto-hide + lock shipped 2026-07-31:
//
// "The auto hide is cool and all but it should hide together with the lock
// icon. Also it should be at the bottom of the window centerd."
//
// Two claims, both checked here in real pixels rather than by inspecting
// classes or attributes:
//
// 1. The toolbar dock (the whole bottom assembly: the button pill plus the
//    lock/reveal dock riding beside it) sits horizontally centered on the
//    window, at the bottom rather than the top.
// 2. Collapsing the toolbar (auto-hide, idle pointer) takes the lock button
//    down with it — genuinely invisible AND unreachable by pressing Tab,
//    not just visually hidden while still sitting in the tab order. Bringing
//    the pointer back restores the pill and the lock together, in the same
//    check.
//
// The lock used to live in its own dock specifically so it would survive
// collapse (see the 2026-07-31 handoff); this is a deliberate reversal of
// that call, done because the user said so directly.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4260;
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

  async function openBoard(viewport) {
    const context = await browser.newContext({ viewport });
    await context.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
    await context.addInitScript(() => {
      if (window.top !== window) return;
      localStorage.setItem(
        "board:test-board:settings",
        JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
      );
      localStorage.removeItem("board:test-board");
      localStorage.removeItem("board:test-board:meta");
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#test-text", { timeout: 15000 });
    return { context, page };
  }

  // --- A: the dock (the whole bottom toolbar assembly) sits horizontally
  // centered on the window, within a pixel, at several widths that stay in
  // the desktop (non-mobile-column) layout. ---
  for (const width of [1440, 1200, 1024]) {
    const { context, page } = await openBoard({ width, height: 900 });
    const rect = await page.evaluate(() => {
      const shell = document.querySelector('[data-board-ui="toolbar-shell"]');
      return shell.getBoundingClientRect();
    });
    const dockCenterX = rect.left + rect.width / 2;
    const viewportCenterX = width / 2;
    assert.ok(
      Math.abs(dockCenterX - viewportCenterX) <= 1,
      `A: at ${width}px the dock's center (${dockCenterX}) must equal the viewport center (${viewportCenterX}) within a pixel`
    );
    await context.close();
  }

  // --- B: the dock sits at the bottom of the window, not the top. ---
  {
    const { context, page } = await openBoard({ width: 1440, height: 900 });
    const rect = await page.evaluate(() => {
      const shell = document.querySelector('[data-board-ui="toolbar-shell"]');
      return shell.getBoundingClientRect();
    });
    assert.ok(rect.top > 900 / 2, "B: the dock must sit in the bottom half of the window, not the top");
    assert.ok(900 - rect.bottom < 900 - rect.top, "B: the dock must be closer to the bottom edge than the top edge");
    await context.close();
  }

  // --- C: collapsing auto-hide takes the lock down with the toolbar —
  // genuinely not visible, and not reachable by pressing Tab — and bringing
  // the pointer back restores both together. ---
  {
    const { context, page } = await openBoard({ width: 1440, height: 900 });

    const openSettings = async () => {
      await page.keyboard.press("Escape");
      if (!(await page.locator('[data-tool="settings"]').isVisible())) {
        await page.click('[data-board-ui="toolbar-more"]');
      }
      await page.click('[data-tool="settings"]');
      await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
    };

    await openSettings();
    await page.locator("#braindump-setting-toolbar-autohide").check();
    await page.keyboard.press("Escape");

    const toolbarPill = page.locator('[data-board-ui="toolbar"]');
    const lockButton = page.locator('[data-board-ui="toolbar-lock"]');

    // Sanity: both visible before idling.
    assert.equal(await toolbarPill.isVisible(), true, "C: sanity — pill visible before idle collapse");
    assert.equal(await lockButton.isVisible(), true, "C: sanity — lock visible before idle collapse");

    await page.mouse.move(700, 200);
    await page.waitForTimeout(1300);

    assert.equal(await toolbarPill.isVisible(), false, "C: the pill must collapse on idle");
    assert.equal(await lockButton.isVisible(), false, "C: the lock must collapse together with the pill");

    // Real Tab traversal, not an attribute check: start focus at the body and
    // walk forward, confirming the lock button is never the element that
    // ends up focused while the dock is genuinely collapsed. Tabbing far
    // enough forward legitimately reaches the reveal tab, which by design
    // reveals the toolbar and hands focus into it the moment it is
    // focused (existing, deliberate behavior, unchanged here) — so once
    // that reveal happens the "collapsed" guarantee is no longer the thing
    // under test, and the loop stops there rather than treating the lock
    // becoming focusable again post-reveal as a violation.
    await page.evaluate(() => document.body.focus());
    let sawLockFocusedWhileCollapsed = false;
    let stayedCollapsed = true;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => ({
        isLockFocused: document.activeElement === document.querySelector('[data-board-ui="toolbar-lock"]'),
        collapsed: document.querySelector('[data-board-ui="toolbar-shell"]').classList.contains("is-collapsed"),
      }));
      if (state.collapsed && state.isLockFocused) {
        sawLockFocusedWhileCollapsed = true;
        break;
      }
      if (!state.collapsed) {
        stayedCollapsed = false;
        break;
      }
    }
    assert.equal(sawLockFocusedWhileCollapsed, false, "C: Tab must never land focus on the lock button while it is collapsed");
    assert.equal(stayedCollapsed, false, "C: sanity — tabbing far enough forward must eventually reach the reveal tab and reveal the toolbar");

    // Re-collapse and confirm again from scratch, since the loop above only
    // proves the lock was skipped up to the point the reveal tab (which by
    // design reveals on focus) was reached. Blur first: the reveal tab's
    // focus handoff left focus sitting inside the toolbar, and :focus-within
    // deliberately blocks auto-collapse the same way :hover does.
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(700, 200);
    await page.waitForTimeout(1300);
    assert.equal(await lockButton.isVisible(), false, "C: sanity — collapsed again before the restore check");

    // Bring the pointer back to the REVEAL TAB: both restore together.
    // Deliberately the tab and not the shell's centre. The shell keeps the
    // hidden pill's full layout width, and hovering anywhere in that invisible
    // span used to reopen the toolbar, which the user reported as "the expand
    // on hover had a very large target ... it should have a smaller target of
    // the small hidden state pill shape". Case F below pins that down; this
    // case just has to reach for the affordance a person would actually aim at.
    const tabBox = await page.locator('[data-board-ui="toolbar-reveal"]').boundingBox();
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.waitForTimeout(150);
    assert.equal(await toolbarPill.isVisible(), true, "C: the pill must restore when the pointer returns");
    assert.equal(await lockButton.isVisible(), true, "C: the lock must restore together with the pill");

    // And once restored, the lock is reachable by keyboard again.
    const lockFocusableAfterRestore = await page.evaluate(() => {
      const btn = document.querySelector('[data-board-ui="toolbar-lock"]');
      btn.focus();
      return document.activeElement === btn;
    });
    assert.equal(lockFocusableAfterRestore, true, "C: the lock must be focusable again once restored");

    await context.close();
  }

  // --- E: the COLLAPSED affordance is centered on the window. ---
  // Case A measures the expanded shell, which `left: 50%; transform:
  // translateX(-50%)` guarantees, so it passes whether or not the thing the
  // user is complaining about works. This case measures the only element that
  // is actually on screen once auto-hide has collapsed the toolbar, which is
  // what "it should be at the bottom of the window centerd" is about. Before
  // the fix the tab measured 995.5 against a 720 center at 1440px, 275px out,
  // and case A still passed.
  for (const width of [1440, 1200, 1024]) {
    const { context, page } = await openBoard({ width, height: 900 });

    await page.keyboard.press("Escape");
    if (!(await page.locator('[data-tool="settings"]').isVisible())) {
      await page.click('[data-board-ui="toolbar-more"]');
    }
    await page.click('[data-tool="settings"]');
    await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
    await page.locator("#braindump-setting-toolbar-autohide").check();
    await page.keyboard.press("Escape");

    // Idle the pointer away from the toolbar so auto-hide actually collapses.
    await page.mouse.move(width / 2, 200);
    await page.waitForTimeout(1300);

    const reveal = page.locator('[data-board-ui="toolbar-reveal"]');
    await reveal.waitFor({ state: "visible", timeout: 5000 });

    const rect = await reveal.boundingBox();
    const tabCenterX = rect.x + rect.width / 2;
    const viewportCenterX = width / 2;
    assert.ok(
      Math.abs(tabCenterX - viewportCenterX) <= 1,
      `E: at ${width}px the collapsed reveal tab's center (${tabCenterX}) must equal the viewport center (${viewportCenterX}) within a pixel`
    );
    // It must be tucked against the bottom edge, not merely in the bottom half.
    // "The hidden toolbar currently is a bit too high from the bottom edge. It
    // should be very close to the bottom edge." 50px was too high; assert a
    // real gap in pixels so "close" cannot drift back out.
    const gapFromBottom = 900 - (rect.y + rect.height);
    assert.ok(
      gapFromBottom >= 0 && gapFromBottom <= 16,
      `E: at ${width}px the collapsed tab must sit within 16px of the bottom edge, measured ${gapFromBottom}px`
    );

    // F: only the tab reveals the toolbar. The shell keeps the hidden pill's
    // full layout width, so before this the entire invisible toolbar was a
    // hover target and the toolbar sprang back from far away. Hover a point
    // inside the shell but well away from the tab, and nothing should reopen.
    const shell = await page.locator('[data-board-ui="toolbar-shell"]').boundingBox();
    const farFromTab = { x: shell.x + 12, y: shell.y + shell.height / 2 };
    await page.mouse.move(farFromTab.x, farFromTab.y);
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator('[data-board-ui="toolbar"]').isVisible(),
      false,
      `F: at ${width}px hovering the shell away from the tab must NOT reveal the toolbar`
    );

    // ...but the tab itself still does.
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator('[data-board-ui="toolbar"]').isVisible(),
      true,
      `F: at ${width}px hovering the tab itself must reveal the toolbar`
    );

    await context.close();
  }

  console.log("toolbar dock position + collapse coupling: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
  await writeFile(canvasPath, canvasBackup, "utf8");
  await writeFile(notesPath, notesBackup, "utf8");
}
