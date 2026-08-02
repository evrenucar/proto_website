// The embed header address: the highlight from a copy must not linger, and
// hovering must say what a double-click does.
//
// From the user, verbatim: "after I double click copy link from youtube top
// or embed the text shouldn't stay highlighted. Also when I hover above it
// it sohuld instruct to double clik to copy url."
//
// The address being visibly selectable at all is a deliberate earlier choice
// (see the "embed header shows the real address" card in todo.md): for a
// live embed the header is the ONLY drag handle, since the shield below it
// takes the pointer over the iframe, so the address can't swallow mousedown
// without stranding the node. Double-click selects and copies instead, and
// the selection is shown via a Range specifically so there is visual proof
// of what got copied. This suite is about that visible proof outstaying its
// welcome, not about removing it: the selection must still flash before it
// clears, or "you can see what was copied" quietly stops being true.
//
// Hermetic: the embed points at a page this same preview server serves, so
// the suite needs no internet and no real YouTube iframe.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4322;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
// Deliberately not a localhost/same-origin address: the runtime strips those
// down to a bare path for portability (normalizeAssetUrl, so a board saved
// against the preview host still resolves once deployed), which would mask
// what this suite is actually checking. A URL that looks like a real site's
// own address, routed locally instead of hitting the network, is what
// stays intact end to end the way an external video's or page's address
// does for a real board.
const ADDRESS = "https://example.invalid/embed/probe";

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

// Probe node injected by intercepting the canvas request, so nothing on disk
// is touched in either direction.
const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [
    { id: "addr-probe", type: "link", x: 160, y: 140, width: 480, height: 300, url: ADDRESS, embedMode: "live" },
  ],
  edges: [],
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  // Autosave off before any page script runs, and the save endpoint refused
  // outright, so this probe can never touch the real sandbox board.
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
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  // The embed's own iframe target: routed locally so the suite never touches
  // the network, same as youtube.com is aborted in the YouTube suites.
  await page.route("**://example.invalid/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>probe</title>" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#addr-probe .bd-embed-domain[data-embed-url]").waitFor({ timeout: 20000 });

  const addressEl = "#addr-probe .bd-embed-domain";
  const selectionText = () => page.evaluate(() => window.getSelection().toString());

  // --- A: hovering the address surfaces the double-click instruction ---
  // The default context here is already mouse-shaped (hover: hover, pointer:
  // fine), which is what makes case E meaningful below: that one deliberately
  // switches to a touch-shaped context and expects the opposite.
  await page.hover(addressEl);
  await page.waitForTimeout(150);
  const hint = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const style = getComputedStyle(el, "::after");
    return { content: style.content, opacity: style.opacity };
  }, addressEl);
  assert.match(hint.content.replace(/^"|"$/g, ""), /double.?click/i,
    `A: hovering the address must surface a double-click instruction, got content ${hint.content}`);
  assert.equal(hint.opacity, "1", `A: the hint must actually be visible on hover, got opacity ${hint.opacity}`);
  await page.mouse.move(20, 20);
  await page.waitForTimeout(150);

  // --- B: the copy still visibly selects the text (the existing feedback) ---
  await page.dblclick(addressEl);
  const rightAfter = await selectionText();
  assert.equal(rightAfter, ADDRESS,
    `B: double-click must still visibly select the address immediately after, got "${rightAfter}"`);

  // --- C: the clipboard receives the address ---
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, ADDRESS, `C: double-click must put the address on the clipboard, got "${clip}"`);

  // --- D: the highlight does not stay ---
  // This is the user's report. Poll rather than a single fixed wait, so the
  // failure message says how long it actually took (or that it never did).
  const clearedWithin = async (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if ((await selectionText()) === "") return Date.now() - start;
      await page.waitForTimeout(50);
    }
    return -1;
  };
  const clearedAfterMs = await clearedWithin(2000);
  assert.notEqual(clearedAfterMs, -1,
    `D: the selection must clear itself; still showed "${await selectionText()}" after 2s`);
  assert.ok(clearedAfterMs < 2000,
    `D: expected the highlight to clear well under 2s of the copy, took ${clearedAfterMs}ms`);

  // --- E: the hint never appears on touch ---
  // A separate context with hasTouch:true, not a CDP media override: measured
  // directly, plain Emulation.setEmulatedMedia({features:[{name:"hover",...}]})
  // does not move matchMedia's answer in this Chromium build, only an actual
  // touch-capable context does (it also flips (pointer: coarse), which is what
  // Chromium's own hover/pointer media features are keyed off in practice).
  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 860 } });
  await touchContext.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });
  const touchPage = await touchContext.newPage();
  await touchPage.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await touchPage.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await touchPage.route("**://example.invalid/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>probe</title>" }));
  assert.equal(
    await touchPage.evaluate(() => matchMedia("(hover: hover)").matches),
    false,
    "E: setup check, the touch context itself must report (hover: hover) as false or this case proves nothing"
  );
  await touchPage.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await touchPage.locator(addressEl).waitFor({ timeout: 20000 });
  await touchPage.hover(addressEl);
  await touchPage.waitForTimeout(150);
  const touchHint = await touchPage.evaluate((sel) => {
    const el = document.querySelector(sel);
    return getComputedStyle(el, "::after").content;
  }, addressEl);
  assert.equal(touchHint, "none",
    `E: a touch context must never see the hover hint, got content ${touchHint}`);
  await touchContext.close();

  // --- F: the node can still be dragged by the header after all of the above ---
  // The whole reason the address is double-click-only and not sweep-selectable:
  // for a live embed the header is the ONLY drag handle. This is the guard on
  // that trade staying made.
  const before = await page.evaluate(() => {
    const el = document.querySelector("#addr-probe");
    return { left: el.style.left, top: el.style.top };
  });
  const box = await page.locator(addressEl).boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 85, from.y + 55, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const el = document.querySelector("#addr-probe");
    return { left: el.style.left, top: el.style.top };
  });
  assert.notDeepEqual(after, before,
    "F: dragging the node by its header (through the address) must still move it, or the hint/clear timer broke the only drag handle a live embed has");

  console.log("embed address hint: all 6 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
