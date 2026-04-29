// E2E test: a Shift-snap stroke must create exactly one undo entry,
// regardless of how many pointer moves fire during the preview window.
//
// Spec: .agents/feature_implementation/straight-line-shift-snap.md (section 3,
// "no undo entry is created for every Shift preview movement").
//
// Strategy: drive a stroke with ~40 Shift-held pointer moves, confirm the
// board grew by exactly one bd-item, then press Ctrl+Z once and confirm the
// item count is back to baseline. If the snap branch were spamming the undo
// stack, one Ctrl+Z would only roll back the last preview frame and leave
// most of the stroke intact.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4202;
const baseUrl = `http://127.0.0.1:${port}`;

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

async function countBoardItems(page) {
  return await page.evaluate(() => document.querySelectorAll(".bd-item").length);
}

try {
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/braindump.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tool="draw"]', { timeout: 15000 });
  await page.click('[data-tool="draw"]');

  const baseline = await countBoardItems(page);

  // Drive a stroke with many Shift-held moves. The path-string hot loop runs
  // once per move during preview, so we want enough samples to make any
  // accidental per-move undo write blatantly obvious.
  const ax = 700;
  const ay = 500;
  await page.mouse.move(ax, ay);
  await page.mouse.down();

  // Short freehand prefix.
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(ax + i * 6, ay + i * 2, { steps: 1 });
  }

  // Long Shift-held preview window. Many small moves so the snap branch
  // recomputes endpoint repeatedly.
  await page.keyboard.down("Shift");
  for (let i = 1; i <= 40; i++) {
    await page.mouse.move(ax + 30 + i * 4, ay + 12 + (i % 3), { steps: 1 });
  }
  await page.keyboard.up("Shift");

  // A bit of resumed freehand to sanity-check the bake.
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(ax + 200 + i * 6, ay + 40 + i * 2, { steps: 1 });
  }
  await page.mouse.up();

  const afterStroke = await countBoardItems(page);
  assert.equal(
    afterStroke - baseline,
    1,
    `stroke must create exactly one bd-item (baseline=${baseline}, after=${afterStroke})`
  );

  // One Ctrl+Z should roll back the entire stroke. If the snap preview were
  // pushing per-move actions, this would only remove the last preview frame
  // and the stroke node would remain on the board.
  await page.keyboard.press("Control+z");

  // Give the undo path a beat — undo() is synchronous but the DOM mutation
  // still benefits from an event-loop turn.
  await page.waitForFunction(
    (target) => document.querySelectorAll(".bd-item").length === target,
    baseline,
    { timeout: 2000 }
  ).catch(async () => {
    const stuck = await countBoardItems(page);
    throw new Error(`one Ctrl+Z must remove the entire stroke. baseline=${baseline}, after_undo=${stuck}`);
  });

  const afterUndo = await countBoardItems(page);
  assert.equal(afterUndo, baseline, "after Ctrl+Z, item count must equal baseline");

  console.log("board-shift-snap-no-history-spam: ok (1 stroke = 1 undo entry across 40 Shift-held moves)");
} finally {
  if (browser) await browser.close();
  child.kill();
}
