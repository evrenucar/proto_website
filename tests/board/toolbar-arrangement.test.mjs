// The card, in the user's words:
//
//   "There should be a setting option that enables you to re-arrange the items
//    available on the toolbar. Bring them in from the extra 3 dot or put it
//    back as well. Only static items are lock, more actions, settings. Also
//    when adjusting and editing them around the auto hide shouldn't trigger.
//    Also there should be the option to go back to the default settings there."
//
// Four requirements, one case each, plus persistence and touch.
//
// Every assertion here is about what a person sees on the toolbar: which
// labelled controls are in the pill, which are in the ... drawer, in what order,
// and whether they are visible with the drawer shut. Nothing reads
// data-arrange-id, the stored settings shape, or any function name, so the
// suite cannot go green on a feature that has been gutted behind its own API.
// The order is read as aria-labels, which is what a screen reader and a
// tooltip both say, rather than as element identity.
//
// The one thing that is deliberately not asserted is the *stored* arrangement:
// case C reloads the page and re-reads the toolbar instead, so "it persisted"
// is proved by the toolbar coming back that way, not by a key existing.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4249;
const baseUrl = `http://127.0.0.1:${port}`;
// Nothing under content/ is seeded or restored, unlike most board suites, and
// nothing here needs it: every assertion is about the toolbar, and the sandbox
// board's own nodes are never read, moved or created. The run therefore cannot
// leave a mark on the repository even if it crashes half way through — autosave
// is off before the first page script runs and /api/save-board is refused
// outright, so the only remaining write path was the fixture restore itself.
//
// "The board is up" is read off the toolbar rather than off a node on the
// canvas, for the same reason: it is what this suite is about, and it does not
// depend on the sandbox board still containing any particular node. The Canvas
// button is the last thing the runtime injects into the drawer before the
// arrangement code reads the default order out of the DOM, so waiting for it
// also guarantees the toolbar has finished being assembled.
const BOARD_READY = '[data-tool="new-canvas"]';

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

try {
  await waitForServer(child);
  browser = await chromium.launch();

  async function preparedContext(contextOptions) {
    const context = await browser.newContext(contextOptions);
    // Never write to content/: autosave off before any page script runs, and
    // the save endpoint refused outright.
    await context.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
    await context.addInitScript(() => {
      if (window.top !== window) return;
      // Merged, not overwritten. This runs again on every navigation, and the
      // whole of case C is "the arrangement survived a reload" — a blind
      // setItem here would wipe the thing under test and the case would fail
      // for a reason that has nothing to do with the runtime.
      const key = "board:test-board:settings";
      let existing = {};
      try {
        existing = JSON.parse(localStorage.getItem(key) || "{}") || {};
      } catch (error) {
        existing = {};
      }
      localStorage.setItem(
        key,
        JSON.stringify({ ...existing, autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
      );
      localStorage.removeItem("board:test-board");
      localStorage.removeItem("board:test-board:meta");
    });
    return context;
  }

  // What a person actually sees: the labelled controls in the pill and in the
  // drawer, in order. Elements the stylesheet hides at this width (the Save and
  // Recommend twins that only exist for a coarse pointer) are left out, because
  // nobody can see or move them either.
  const readToolbar = (target) =>
    target.evaluate(() => {
      const pill = document.querySelector('[data-board-ui="toolbar"]');
      const drawer = document.querySelector('[data-board-ui="toolbar-actions"]');
      const labelOf = (el) => el.getAttribute("aria-label") || el.getAttribute("title") || "";
      const listed = (root) =>
        Array.from(root.children)
          .filter((el) => el !== drawer)
          .filter((el) => labelOf(el) && getComputedStyle(el).display !== "none")
          .map(labelOf);
      return { pill: listed(pill), drawer: listed(drawer) };
    });

  const context = await preparedContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(BOARD_READY, { state: "attached", timeout: 15000 });

  const moreButton = page.locator('[data-board-ui="toolbar-more"]');
  const arrangeBar = page.locator('[data-board-ui="toolbar-arrange-bar"]');

  const openSettings = async () => {
    await page.keyboard.press("Escape");
    if (!(await page.locator('[data-tool="settings"]').isVisible())) {
      await moreButton.click();
    }
    await page.click('[data-tool="settings"]');
    await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
  };

  const enterArrangeMode = async () => {
    await openSettings();
    await page.click('[data-board-ui="toolbar-arrange"]');
    await arrangeBar.waitFor({ state: "visible", timeout: 5000 });
  };

  // Drag by pointer, from the middle of `from` to the point given. Several
  // intermediate moves, because one jump lands the whole gesture in a single
  // pointermove and would not exercise the live reordering at all.
  const dragTo = async (fromLocator, to) => {
    const box = await fromLocator.boundingBox();
    assert.ok(box, "drag source must have a box");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(
        startX + ((to.x - startX) * step) / 8,
        startY + ((to.y - startY) * step) / 8
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(80);
  };

  const centreOf = async (locator) => {
    const box = await locator.boundingBox();
    assert.ok(box, "target must have a box");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const defaultLayout = await readToolbar(page);
  assert.ok(
    defaultLayout.pill.includes("Add Bookmark (L)"),
    `sanity: the bookmark tool must start in the pill, got ${JSON.stringify(defaultLayout.pill)}`
  );
  assert.ok(
    defaultLayout.drawer.includes("Export project bundle"),
    `sanity: Export must start in the drawer, got ${JSON.stringify(defaultLayout.drawer)}`
  );

  // --- A: settings offers the way in, and it opens an arrangement mode ---
  // A mode rather than always-on drag: the card says "a setting option that
  // enables you to re-arrange", and the buttons being arranged are the board's
  // primary controls, so a slow press on the pen must keep selecting the pen.
  await openSettings();
  const arrangeEntry = page.locator('[data-board-ui="toolbar-arrange"]');
  await arrangeEntry.waitFor({ state: "visible", timeout: 5000 });
  await arrangeEntry.click();
  await arrangeBar.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await page.locator('[data-board-ui="toolbar-actions"]').isVisible(),
    true,
    "A: the ... drawer must be open for the whole mode, since it is one of the two ends items move between"
  );
  // Pressing a tool while arranging must not run the tool.
  const activeToolBefore = await page.evaluate(
    () => document.querySelector('[data-board-ui="toolbar"] button.active')?.dataset.tool || ""
  );
  await page.locator('[data-tool="draw"]').click({ force: true });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-board-ui="toolbar"] button.active')?.dataset.tool || ""),
    activeToolBefore,
    "A: clicking a tool while arranging must not select it"
  );

  // --- B: drag a tool out of the pill into the ... drawer ---
  const bookmark = page.locator('[data-tool="bookmark"]');
  await dragTo(bookmark, await centreOf(page.locator('[data-board-ui="toolbar-actions"]')));

  let layout = await readToolbar(page);
  assert.equal(
    layout.pill.includes("Add Bookmark (L)"),
    false,
    `B: the bookmark must be gone from the pill, got ${JSON.stringify(layout.pill)}`
  );
  assert.ok(
    layout.drawer.includes("Add Bookmark (L)"),
    `B: the bookmark must be in the drawer, got ${JSON.stringify(layout.drawer)}`
  );

  // Out of the mode, drawer shut: the strongest form of "no longer in the
  // pill" is that it is not on screen at all until the ... is opened.
  await page.click('[data-board-ui="toolbar-arrange-done"]');
  await arrangeBar.waitFor({ state: "hidden", timeout: 5000 });
  assert.equal(
    await bookmark.isVisible(),
    false,
    "B: with the drawer shut, a tool moved into the drawer must not be visible"
  );
  await moreButton.click();
  await page.waitForTimeout(120);
  assert.equal(await bookmark.isVisible(), true, "B: opening the ... drawer must reveal it there");
  await page.keyboard.press("Escape");

  // --- C: it survives a reload ---
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(BOARD_READY, { state: "attached", timeout: 15000 });
  layout = await readToolbar(page);
  assert.equal(
    layout.pill.includes("Add Bookmark (L)"),
    false,
    `C: after a reload the bookmark must still be out of the pill, got ${JSON.stringify(layout.pill)}`
  );
  assert.ok(
    layout.drawer.includes("Add Bookmark (L)"),
    `C: after a reload the bookmark must still be in the drawer, got ${JSON.stringify(layout.drawer)}`
  );
  assert.equal(
    await page.locator('[data-tool="bookmark"]').isVisible(),
    false,
    "C: and it must still not be sitting in the pill after a reload"
  );

  // --- D: drag one back the other way, "or put it back as well" ---
  await enterArrangeMode();
  const pillBox = await page.locator('[data-board-ui="toolbar"]').boundingBox();
  await dragTo(page.locator('[data-tool="export"]'), { x: pillBox.x + 24, y: pillBox.y + pillBox.height / 2 });
  layout = await readToolbar(page);
  assert.ok(
    layout.pill.includes("Export project bundle"),
    `D: Export must now be in the pill, got ${JSON.stringify(layout.pill)}`
  );
  assert.equal(
    layout.drawer.includes("Export project bundle"),
    false,
    `D: and must be gone from the drawer, got ${JSON.stringify(layout.drawer)}`
  );
  assert.equal(
    layout.pill[0],
    "Export project bundle",
    `D: dropped at the left edge, it must land first in the pill, got ${JSON.stringify(layout.pill)}`
  );
  // Deliberately NOT asserting the 3-dot's position here. B removed a tool and
  // D added one, so the pill's movable count is back to its boot value, and
  // that is the single value at which even a broken fixed-item seating lands
  // the 3-dot at the end. An assertion here passes either way and would read as
  // coverage it does not provide. It lives in G2, after a reset and a net
  // growth, where it can actually fail.
  await page.click('[data-board-ui="toolbar-arrange-done"]');
  await arrangeBar.waitFor({ state: "hidden", timeout: 5000 });
  assert.equal(
    await page.locator('[data-tool="export"]').isVisible(),
    true,
    "D: with the drawer shut, a tool moved into the pill must be visible"
  );

  // --- E: the three static items refuse to move ---
  // "Only static items are lock, more actions, settings."
  await enterArrangeMode();
  const beforeStatic = await readToolbar(page);
  const settingsIndexBefore = beforeStatic.drawer.indexOf("Board settings");
  const moreIndexBefore = beforeStatic.pill.indexOf("More board actions");
  assert.ok(settingsIndexBefore >= 0, "E: sanity — Settings starts in the drawer");
  assert.ok(moreIndexBefore >= 0, "E: sanity — the ... button starts in the pill");

  // Settings, dragged hard into the middle of the pill.
  await dragTo(page.locator('[data-tool="settings"]'), { x: pillBox.x + 80, y: pillBox.y + pillBox.height / 2 });
  // The ... button, dragged into the drawer.
  await dragTo(moreButton, await centreOf(page.locator('[data-board-ui="toolbar-actions"]')));
  // The lock, dragged into the pill.
  const lockButton = page.locator('[data-board-ui="toolbar-lock"]');
  await dragTo(lockButton, { x: pillBox.x + 120, y: pillBox.y + pillBox.height / 2 });

  const afterStatic = await readToolbar(page);
  assert.equal(
    afterStatic.pill.includes("Board settings"),
    false,
    `E: Settings must not be draggable into the pill, got ${JSON.stringify(afterStatic.pill)}`
  );
  assert.equal(
    afterStatic.drawer.indexOf("Board settings"),
    settingsIndexBefore,
    `E: Settings must not move inside the drawer either, got ${JSON.stringify(afterStatic.drawer)}`
  );
  assert.equal(
    afterStatic.drawer.includes("More board actions"),
    false,
    `E: the ... button must not be draggable into the drawer, got ${JSON.stringify(afterStatic.drawer)}`
  );
  assert.equal(
    afterStatic.pill.indexOf("More board actions"),
    afterStatic.pill.length - 1,
    `E: the ... button must stay last in the pill, got ${JSON.stringify(afterStatic.pill)}`
  );
  assert.equal(
    await page.evaluate(
      () =>
        !!document
          .querySelector('[data-board-ui="toolbar-lock"]')
          ?.closest('[data-board-ui="toolbar-dock"]')
    ),
    true,
    "E: the lock must stay in its own dock, not end up inside the toolbar"
  );
  assert.equal(
    afterStatic.pill.includes("Toggle board lock") || afterStatic.pill.some((l) => /lock/i.test(l)),
    false,
    `E: no lock control may appear in the pill, got ${JSON.stringify(afterStatic.pill)}`
  );

  // --- F: auto-hide must not fire while arranging ---
  // "Also when adjusting and editing them around the auto hide shouldn't
  // trigger." The collapse timer is 900ms; this idles for well over three
  // times that with the pointer parked in the middle of the board.
  await page.click('[data-board-ui="toolbar-arrange-done"]');
  await arrangeBar.waitFor({ state: "hidden", timeout: 5000 });
  await openSettings();
  await page.locator("#braindump-setting-toolbar-autohide").check();
  await page.keyboard.press("Escape");
  await page.mouse.move(700, 200);
  await page.waitForTimeout(1400);
  assert.equal(
    await page.locator('[data-board-ui="toolbar"]').isVisible(),
    false,
    "F: sanity — with auto-hide on and the pointer away, the toolbar does collapse"
  );

  await page.mouse.move(720, 940);
  await page.waitForTimeout(200);
  await enterArrangeMode();
  await page.mouse.move(700, 200);
  await page.waitForTimeout(3000);
  assert.equal(
    await page.locator('[data-board-ui="toolbar"]').isVisible(),
    true,
    "F: the toolbar must NOT auto-hide while the arrangement mode is active, however long the pointer idles"
  );
  assert.equal(
    await page.locator('[data-board-ui="toolbar-actions"]').isVisible(),
    true,
    "F: and the drawer must still be open, so a drag between the two is still possible"
  );
  // A drag still works after that idle, which is the thing the collapse would
  // have taken away.
  await dragTo(page.locator('[data-tool="text"]'), await centreOf(page.locator('[data-board-ui="toolbar-actions"]')));
  layout = await readToolbar(page);
  assert.ok(
    layout.drawer.includes("Add Text (T)"),
    `F: a drag after the idle must still work, got ${JSON.stringify(layout.drawer)}`
  );

  // Leaving the mode hands auto-hide back.
  await page.click('[data-board-ui="toolbar-arrange-done"]');
  await page.mouse.move(700, 200);
  await page.waitForTimeout(1400);
  assert.equal(
    await page.locator('[data-board-ui="toolbar"]').isVisible(),
    false,
    "F: once the mode is over, auto-hide must work again"
  );

  // --- G: reset restores the default order exactly ---
  await page.mouse.move(720, 940);
  await page.waitForTimeout(200);
  await openSettings();
  await page.locator("#braindump-setting-toolbar-autohide").uncheck();
  await page.keyboard.press("Escape");

  await enterArrangeMode();
  const scrambled = await readToolbar(page);
  assert.notDeepEqual(
    scrambled.pill,
    defaultLayout.pill,
    "G: sanity — the pill really is scrambled before the reset"
  );
  await page.click('[data-board-ui="toolbar-arrange-reset"]');
  await page.waitForTimeout(150);
  const afterReset = await readToolbar(page);
  assert.deepEqual(
    afterReset.pill,
    defaultLayout.pill,
    "G: reset must restore the pill's default order exactly"
  );
  assert.deepEqual(
    afterReset.drawer,
    defaultLayout.drawer,
    "G: reset must restore the drawer's default order exactly"
  );
  await page.click('[data-board-ui="toolbar-arrange-done"]');
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(BOARD_READY, { state: "attached", timeout: 15000 });
  assert.deepEqual(
    await readToolbar(page),
    defaultLayout,
    "G: and the reset must survive a reload"
  );

  // --- G2: the 3-dot stays last when the pill GROWS, with nothing removed ---
  // This has to run straight after the reset, and that placement is the whole
  // point of the case.
  //
  // Case E asserts the same property but is only reached after B removed a tool
  // and D added one, so the pill's movable count is back to its boot value.
  // That is the single value at which seating a fixed item by its absolute
  // index happens to land it at the end anyway, so E stayed green while the
  // ordinary case was broken. Proved: seating the 3-dot by absolute index
  // instead of by distance-from-the-end leaves E and D both passing, and fails
  // only here.
  //
  // A user who only ever performs the card's "or put it back as well" move,
  // with no compensating removal, hits the broken state on move one: the 3-dot
  // ends up sandwiched between two buttons, which is exactly what "only static
  // items are lock, more actions, settings" is supposed to prevent.
  await enterArrangeMode();
  const grownPillBox = await page.locator('[data-board-ui="toolbar"]').boundingBox();
  await dragTo(
    page.locator('[data-tool="export"]'),
    { x: grownPillBox.x + 24, y: grownPillBox.y + grownPillBox.height / 2 }
  );
  const grown = await readToolbar(page);
  assert.ok(
    grown.pill.includes("Export project bundle"),
    `G2: sanity — Export must be in the pill, got ${JSON.stringify(grown.pill)}`
  );
  assert.ok(
    grown.pill.length > defaultLayout.pill.length,
    `G2: sanity — the pill must have GROWN net, not merely swapped. was ${defaultLayout.pill.length}, now ${grown.pill.length}`
  );
  assert.equal(
    grown.pill[grown.pill.length - 1],
    "More board actions",
    `G2: the 3-dot must stay last once the pill grows, got ${JSON.stringify(grown.pill)}`
  );
  await page.click('[data-board-ui="toolbar-arrange-reset"]');
  await page.waitForTimeout(150);
  await page.click('[data-board-ui="toolbar-arrange-done"]');

  // --- H: a stored arrangement naming a tool that does not exist, and missing
  // one that does, must not break the toolbar ---
  // The forward-compatibility promise: unknown ids are dropped, and any tool
  // the stored state never mentions comes back in its default place, so a
  // release that adds a button is never invisible to someone who rearranged
  // their toolbar before it existed.
  await page.evaluate(() => {
    const key = "board:test-board:settings";
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    stored.toolbarArrangement = {
      pill: ["a-tool-from-the-future", "draw", "select"],
      more: ["export", 42, null, "export"],
    };
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(BOARD_READY, { state: "attached", timeout: 15000 });
  const salvaged = await readToolbar(page);
  // The order the stored state asked for is honoured where it could be
  // understood: it put Draw before Select, and the shipped pill has Select
  // first, so this cannot pass by accident on a runtime that ignored the key.
  // What is deliberately NOT asserted is that the two understood ids land at
  // indices 0 and 1. The refill puts every unmentioned tool back at its own
  // default index, which interleaves them, and that is the behaviour worth
  // having: the release that adds a tool wants it near where it ships, not
  // pushed behind everything the user happened to have named.
  assert.ok(
    salvaged.pill.indexOf("Draw (P)") >= 0 &&
      salvaged.pill.indexOf("Draw (P)") < salvaged.pill.indexOf("Select (V)"),
    `H: the ids it did understand must be honoured in the order given, got ${JSON.stringify(salvaged.pill)}`
  );
  assert.ok(
    defaultLayout.pill.indexOf("Select (V)") < defaultLayout.pill.indexOf("Draw (P)"),
    "H: sanity — the shipped pill really does put Select before Draw, so the check above is not vacuous"
  );
  // "export" was named twice and among two non-strings; it must appear once.
  assert.equal(
    salvaged.drawer.filter((label) => label === "Export project bundle").length,
    1,
    `H: a repeated or malformed entry must not duplicate a control, got ${JSON.stringify(salvaged.drawer)}`
  );
  const salvagedAll = [...salvaged.pill, ...salvaged.drawer].sort();
  const defaultAll = [...defaultLayout.pill, ...defaultLayout.drawer].sort();
  assert.deepEqual(
    salvagedAll,
    defaultAll,
    "H: every tool must still be reachable — none dropped, none duplicated"
  );

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  await context.close();

  // --- I: touch parity ---
  // Everything shipped this week has a touch path; a desktop-only arrangement
  // mode would be the exact complaint the touch-parity card was about. Driven
  // with pointerType "touch" on a coarse-pointer context, because Playwright's
  // touchscreen can tap but cannot drag.
  const mobileContext = await preparedContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (err) => mobileErrors.push(String(err)));
  await mobilePage.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForSelector(BOARD_READY, { state: "attached", timeout: 15000 });

  assert.equal(
    await mobilePage.evaluate(() => matchMedia("(pointer: coarse)").matches),
    true,
    "I: sanity — the mobile context must really report a coarse pointer"
  );

  if (!(await mobilePage.locator('[data-tool="settings"]').isVisible())) {
    await mobilePage.tap('[data-board-ui="toolbar-more"]');
  }
  await mobilePage.tap('[data-tool="settings"]');
  await mobilePage.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
  await mobilePage.tap('[data-board-ui="toolbar-arrange"]');
  await mobilePage.locator('[data-board-ui="toolbar-arrange-bar"]').waitFor({ state: "visible", timeout: 5000 });

  const beforeTouch = await readToolbar(mobilePage);
  assert.ok(beforeTouch.pill.includes("Draw (P)"), `I: sanity — the pen starts in the pill, got ${JSON.stringify(beforeTouch.pill)}`);

  await mobilePage.evaluate(async () => {
    const pen = document.querySelector('[data-tool="draw"]');
    const drawer = document.querySelector('[data-board-ui="toolbar-actions"]');
    const from = pen.getBoundingClientRect();
    const to = drawer.getBoundingClientRect();
    const fire = (type, x, y, target) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
        })
      );
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endX = to.x + to.width / 2;
    const endY = to.y + to.height / 2;
    fire("pointerdown", startX, startY, pen);
    for (let step = 1; step <= 8; step++) {
      fire("pointermove", startX + ((endX - startX) * step) / 8, startY + ((endY - startY) * step) / 8, window);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    fire("pointerup", endX, endY, window);
  });
  await mobilePage.waitForTimeout(150);

  const afterTouch = await readToolbar(mobilePage);
  assert.equal(
    afterTouch.pill.includes("Draw (P)"),
    false,
    `I: a touch drag must move the pen out of the pill, got ${JSON.stringify(afterTouch.pill)}`
  );
  assert.ok(
    afterTouch.drawer.includes("Draw (P)"),
    `I: ...and into the drawer, got ${JSON.stringify(afterTouch.drawer)}`
  );
  assert.deepEqual(mobileErrors, [], "I: the mobile run must produce no page errors");

  await mobileContext.close();

  console.log("toolbar arrangement: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
