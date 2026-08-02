// The vnc node, driven against a real RFB server.
//
// tests/helpers/mock-rfb-server.mjs speaks RFB 3.8 over WebSocket with classic
// VNC authentication, so everything here is the real protocol: version
// handshake, DES challenge/response, ServerInit, framebuffer updates. What a
// KasmVNC or websockify target would do, this does.
//
// The card behind it: "add and demonstrate the vnc support. Add it to the test
// board. It should be possible to keep the credentials in place when you reload
// it and have it resume immediately." Each of those clauses is a case below.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { startMockRfbServer } from "../helpers/mock-rfb-server.mjs";

const port = 4216;
const baseUrl = `http://127.0.0.1:${port}`;
const PASSWORD = "hunter2";
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

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

const vnc = await startMockRfbServer({ password: PASSWORD, desktopName: "Mock desktop" });

// Serve the sandbox canvas with the VNC node pointed at the mock server. That
// is exactly how a real board carries one: the target is committed, the
// password is not.
const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  nodes: baseCanvas.nodes.map((node) =>
    node.id === "test-vnc" ? { ...node, url: vnc.url, autoConnect: true } : node),
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  const status = () => page.locator("#test-vnc .bd-vnc-status-text").textContent();
  const vncState = () => page.locator("#test-vnc .bd-vnc-shell").getAttribute("data-vnc-state");
  const connect = async (password, remember = true) => {
    await page.fill("#test-vnc .bd-vnc-password", password);
    const box = page.locator("#test-vnc .bd-vnc-remember");
    if ((await box.isChecked()) !== remember) await box.setChecked(remember);
    await page.click("#test-vnc .bd-vnc-submit");
  };

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-vnc", { timeout: 15000 });

  // --- A: a fresh browser has the target but not the credential, so it asks ---
  await page.waitForSelector("#test-vnc .bd-vnc-form", { timeout: 5000 });
  assert.equal(
    await page.inputValue("#test-vnc .bd-vnc-url"),
    vnc.url,
    "A: the target comes from the canvas, prefilled"
  );

  // --- B: the wrong password is refused, and says so ---
  await connect("not-the-password");
  await page.waitForFunction(() =>
    document.querySelector("#test-vnc .bd-vnc-shell")?.dataset.vncState === "error",
    null, { timeout: 15000 });
  assert.equal(vnc.log.authFailures, 1, "B: the server should have rejected one attempt");
  assert.match(await status(), /fail|reject|denied|lost/i, "B: the node should say the credential was refused");

  // --- C: the right password connects, all the way to a painted screen ---
  await page.click("#test-vnc .bd-vnc-settings-btn");
  await page.waitForSelector("#test-vnc .bd-vnc-form", { timeout: 5000 });
  await connect(PASSWORD);
  await page.waitForFunction(() =>
    document.querySelector("#test-vnc .bd-vnc-shell")?.dataset.vncState === "connected",
    null, { timeout: 20000 });
  assert.equal(await status(), "Mock desktop", "C: the desktop name should come from the server");

  // The framebuffer arrived and noVNC drew it: a canvas at the server's size,
  // painted the colour the server sent. Reading the pixel back is the end of
  // the chain, from RFB rectangle to what is actually on screen.
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#test-vnc .bd-vnc-screen canvas");
    return canvas && canvas.width === 320 && canvas.height === 240;
  }, null, { timeout: 15000 });
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector("#test-vnc .bd-vnc-screen canvas");
    const [r, g, b] = canvas.getContext("2d").getImageData(160, 120, 1, 1).data;
    return [r, g, b];
  });
  assert.deepEqual(painted, [0x2f, 0xda, 0xca], "C: the pixel drawn must be the pixel sent");

  // --- D: the password is kept in this browser, and only there ---
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("vnc-credentials:board:test-board:test-vnc") || "null"));
  assert.deepEqual(stored, { password: PASSWORD }, "D: the credential belongs in localStorage");

  const serialized = await page.evaluate(() => {
    const node = JSON.parse(localStorage.getItem("board:test-board") || "{}")
      .nodes?.find((n) => n.id === "test-vnc");
    return node || null;
  });
  assert.ok(serialized, "D: the board state should hold the vnc node");
  assert.equal(serialized.url, vnc.url, "D: the target is board data");
  assert.equal(serialized.autoConnect, true, "D: remembering turns on resume");
  assert.equal(
    JSON.stringify(serialized).includes(PASSWORD),
    false,
    "D: the password must never reach the canvas, which is a committed file"
  );

  // --- E: keys typed into the session are the remote machine's, not the board's ---
  // Delete would otherwise delete the node the session runs in.
  await page.locator("#test-vnc .bd-vnc-screen canvas").click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#test-vnc").count(), 1, "E: Delete inside a session must not delete the node");

  // --- F: reload, and it comes back by itself ---
  const sessionsBefore = vnc.log.sessions;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-vnc", { timeout: 15000 });
  await page.waitForFunction(() =>
    document.querySelector("#test-vnc .bd-vnc-shell")?.dataset.vncState === "connected",
    null, { timeout: 20000 });
  assert.equal(vnc.log.sessions, sessionsBefore + 1, "F: the reload should have opened a second session");
  assert.equal(
    await page.locator("#test-vnc .bd-vnc-form").count(),
    0,
    "F: resuming means no form, no typing"
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#test-vnc .bd-vnc-screen canvas");
    return canvas && canvas.width === 320;
  }, null, { timeout: 15000 });

  // --- G: deleting the node closes the connection ---
  await page.locator("#test-vnc .bd-vnc-header").click();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#test-vnc").count(), 0, "G: the node should be gone");
  assert.equal(
    await page.evaluate(() => typeof window.__vncLeak),
    "undefined",
    "G: nothing should have been left behind"
  );

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log(`vnc node: all 7 cases passed (${vnc.log.sessions} sessions, ${vnc.log.authFailures} refused)`);
} finally {
  if (browser) await browser.close();
  child.kill();
  await vnc.close();
}
