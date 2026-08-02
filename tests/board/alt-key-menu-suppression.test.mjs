// Firefox opens its menu bar on a bare Alt press and closes it on the next one.
// Alt is a board modifier (alt-drag copies a node), so every use of it flickered
// the top of the browser window. Reported from the tracker: "top bar of firefox
// opens and closes as i click alt".
//
// The fix claims the default on a bare Alt, in both directions, without touching
// the cases where Alt legitimately belongs to the browser or the OS. That is
// what this suite pins: suppressed when the board owns the key, untouched when
// it does not. Chromium is used as the driver because preventDefault is what is
// being asserted, and that is engine-independent; the menu bar it protects
// against is Firefox's.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

import { chromium } from "playwright";

const port = 4214;
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

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-note-md", { timeout: 15000 });

  // Record what happened to each key event after the board's own handlers ran.
  // Registered now, so it sits behind the runtime's window listeners.
  await page.evaluate(() => {
    window.__seen = [];
    const note = (e) => window.__seen.push({
      type: e.type,
      key: e.key,
      prevented: e.defaultPrevented,
      target: e.target?.tagName || "",
    });
    window.addEventListener("keydown", note);
    window.addEventListener("keyup", note);
  });

  const seenFor = (type, key) => page.evaluate(({ type, key }) =>
    window.__seen.filter((s) => s.type === type && s.key === key), { type, key });
  const clear = () => page.evaluate(() => { window.__seen = []; });

  // --- 1. A bare Alt is claimed, both down and up. ---
  // Firefox arms the menu bar on the press and opens it on the release, so both
  // halves have to be answered.
  await page.keyboard.press("Alt");
  await page.waitForTimeout(100);
  const altDown = await seenFor("keydown", "Alt");
  const altUp = await seenFor("keyup", "Alt");
  assert.equal(altDown.length, 1, "expected one Alt keydown");
  assert.equal(altDown[0].prevented, true, "a bare Alt keydown should be claimed by the board");
  assert.equal(altUp.length, 1, "expected one Alt keyup");
  assert.equal(altUp[0].prevented, true, "a bare Alt keyup should be claimed by the board");

  // --- 2. Alt as a modifier is untouched. ---
  // Alt+letter reaches the browser's own menu access keys as before; only the
  // solo press is suppressed.
  await clear();
  await page.keyboard.press("Alt+f");
  await page.waitForTimeout(100);
  const altF = await seenFor("keydown", "f");
  assert.equal(altF.length, 1, "expected one f keydown");
  assert.equal(altF[0].prevented, false, "Alt+f should still reach the browser");

  // --- 3. AltGr keeps working. ---
  // On a Turkish, German or any other AltGr layout the right Alt key produces
  // characters. Windows reports it as Ctrl+Alt, and every platform reports the
  // key as AltGraph, so both shapes are guarded. Dispatched rather than typed,
  // because the driver cannot press a physical AltGr.
  await clear();
  const altGrResults = await page.evaluate(() => {
    const out = [];
    for (const init of [
      { key: "AltGraph", ctrlKey: true, altKey: true },
      { key: "Alt", ctrlKey: true, altKey: true },
    ]) {
      const evt = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
      window.dispatchEvent(evt);
      out.push({ key: init.key, ctrl: init.ctrlKey, prevented: evt.defaultPrevented });
    }
    return out;
  });
  for (const r of altGrResults) {
    assert.equal(r.prevented, false, `AltGr shape (key=${r.key}, ctrl=${r.ctrl}) must not be claimed`);
  }

  // --- 4. Typing beats the board. ---
  // While the caret is in a field, Alt belongs to the text editing context.
  await clear();
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "alt-probe-input";
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.press("Alt");
  await page.waitForTimeout(100);
  const altInField = await seenFor("keydown", "Alt");
  assert.equal(altInField.length, 1, "expected one Alt keydown in the field");
  assert.equal(altInField[0].target, "INPUT", "the probe input should be the target");
  assert.equal(altInField[0].prevented, false, "Alt inside a text field is not the board's to claim");

  // --- 5. Alt still works as the copy modifier it was added for. ---
  // Claiming the default must not disturb the modifier state a drag reads.
  await page.evaluate(() => document.querySelector("#alt-probe-input")?.remove());
  const nodeBox = await page.locator("#test-text").boundingBox();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 140, nodeBox.y + 120, { steps: 8 });
  await page.keyboard.down("Alt");
  await page.waitForTimeout(150);
  const clonesWhileHeld = await page.evaluate(() => document.querySelectorAll(".bd-copy-source").length);
  await page.keyboard.up("Alt");
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(clonesWhileHeld, 1, "holding Alt mid-drag should still put a copy at the origin");

  console.log("alt key menu suppression check passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
