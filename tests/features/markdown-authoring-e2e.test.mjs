// Spawns a preview server and drives Playwright.
//
// Covers the markdown quick path end to end: one click on new-markdown spawns a
// timestamped note onto the board and writes its sidecar, then typing into the
// inline editor round-trips back to that same file.
//
// The interaction that kept this test parked, now pinned down:
//   - Entering a note takes two clicks. The first selects the node, the second
//     puts the caret in the editor. A single click leaves focus on BODY, so
//     keystrokes are swallowed as board shortcuts ("p" picks the pen tool) and
//     the test fails much later with an empty file and no obvious cause. The
//     focus assertion below exists to fail loudly at the real point instead.
//   - There is no save button. `scheduleMarkdownSave` fires 600ms after the
//     active line commits, which happens on blur. Escape blurs and commits.
//     Ctrl+S saves the board, not the sidecar.
//   - Do not blur by clicking [data-board-role="canvas"]. It has no visible box,
//     so Playwright refuses the click and the save never fires.
//   - The node title and the filename use different separators: the board shows
//     note-2026-07-29_10-38-03 while the file is note-2026-07-29-10-38-03.md,
//     because sanitizeMarkdownFilename flattens the underscore. Match either.
//
// Board autosave is switched off before load. Without that, the new node is
// written into content/boards/cosmoboard/current.canvas, and since the finally
// block deletes the .md file, the canvas is left referencing a note that no
// longer exists. That is where the orphan node in the committed canvas came from.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4198;
const baseUrl = `http://127.0.0.1:${port}`;

// Sidecars land beside the canvas, not under markdown/. See resolveMarkdownSavePath.
const boardDir = "content/boards/cosmoboard";
let markdownPath = null;

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

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    localStorage.removeItem("board:cosmoboard");
    localStorage.removeItem("board:cosmoboard:meta");
    localStorage.setItem("board:cosmoboard:settings", JSON.stringify({ autosaveEnabled: false }));
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tool="more"]', { timeout: 15000 });

  const createResponse = page.waitForResponse((response) =>
    response.url().includes("/api/save-markdown") && response.request().method() === "POST"
  );

  await page.locator('[data-tool="more"]').click();
  await page.locator('[data-tool="new-markdown"]').click();

  const created = await createResponse;
  assert.equal(created.status(), 200);

  const createdBody = await created.json();
  markdownPath = createdBody.path;
  // The timestamp keeps its underscore since the server-side sanitizer was
  // aligned with the client's (title and filename agree on separator now).
  assert.match(markdownPath, /^content\/boards\/cosmoboard\/note-[\d_-]+\.md$/);
  assert.equal(path.posix.dirname(markdownPath), boardDir);

  const stamp = path.posix.basename(markdownPath, ".md");
  const titlePattern = new RegExp(stamp.replace(/[-_]/g, "[-_]"));
  const createdMarkdown = page.locator(".bd-layer-markdown").filter({ hasText: titlePattern }).first();
  await createdMarkdown.waitFor();
  await createdMarkdown.locator(".bd-markdown-editor").first().waitFor();

  // Hand the node to the in-page helpers below, so clicks can be aimed at exact
  // coordinates rather than at whatever Playwright picks as an element centre.
  await createdMarkdown.evaluate((item) => {
    window.__item = item;
    window.__ed = item.querySelector(".bd-markdown-editor");
  });

  const editorState = () =>
    page.evaluate(() => ({
      selected: window.__item.classList.contains("selected"),
      focusInEditor: window.__ed.contains(document.activeElement),
      activeLine: window.__ed.querySelector(".bd-md-line--active")?.textContent ?? null,
      text: window.__ed.textContent
    }));

  // Two clicks: select the node, then put the caret on a line.
  const focusFirstLine = async () => {
    if (!(await editorState()).selected) {
      const itemPoint = await page.evaluate(() => {
        const r = window.__item.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + 8 };
      });
      await page.mouse.click(itemPoint.x, itemPoint.y);
      await page.waitForTimeout(150);
    }
    const linePoint = await page.evaluate(() => {
      const line = window.__ed.querySelector(".bd-md-line");
      const r = line.getBoundingClientRect();
      return { x: r.x + 6, y: r.y + r.height / 2 };
    });
    await page.mouse.click(linePoint.x, linePoint.y);
    await page.waitForTimeout(150);

    const state = await editorState();
    assert.ok(
      state.focusInEditor,
      "caret never entered the markdown editor, so typing would land as board shortcuts"
    );
    assert.notEqual(state.activeLine, null, "no markdown line went active after the second click");
    return state;
  };

  await focusFirstLine();
  await page.keyboard.type("First pass.");

  const typed = await editorState();
  assert.equal(typed.activeLine, "First pass.", "typed text did not land in the active line");

  // Escape blurs the editor, which commits the line and schedules the sidecar save.
  const firstSave = page.waitForResponse(
    (response) => response.url().includes("/api/save-markdown") && response.request().method() === "POST",
    { timeout: 10000 }
  );
  await page.keyboard.press("Escape");
  assert.equal((await firstSave).status(), 200);

  await page.waitForFunction(() => document.body.innerText.includes("First pass."));
  assert.match(await readFile(markdownPath, "utf8"), /First pass\./);

  // Edit again through the same inline path, to prove the note round-trips
  // rather than only capturing whatever was typed into a fresh one.
  await focusFirstLine();
  await page.keyboard.press("End");
  await page.keyboard.type(" Second pass.");

  const secondSave = page.waitForResponse(
    (response) => response.url().includes("/api/save-markdown") && response.request().method() === "POST",
    { timeout: 10000 }
  );
  await page.keyboard.press("Escape");
  assert.equal((await secondSave).status(), 200);

  await page.waitForFunction(() => document.body.innerText.includes("Second pass."));
  const finalMarkdown = await readFile(markdownPath, "utf8");
  assert.match(finalMarkdown, /First pass\. Second pass\./);
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill();
  // The quick path names the file after the clock, so there is never a pre-existing
  // version to restore. Remove it, otherwise every run leaves a note behind.
  if (markdownPath) {
    await rm(markdownPath, { force: true });
  }
}

console.log("markdown authoring browser flow check passed");
