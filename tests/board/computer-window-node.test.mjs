// The computer window: one node, a protocol switch, and one protocol that
// actually connects.
//
// The card asked for a "computer window" that switches between VNC, RDP and
// local. Only VNC can be spoken from a browser: there is no TCP socket here and
// no JavaScript RDP client anywhere, so RDP in a tab always means a gateway,
// and a terminal always means something local serving a PTY. The node therefore
// has to do two things well and this file checks both of them as outcomes, not
// as wiring:
//
//   1. The choice is real. Switch to RDP, reload, and it is still RDP.
//   2. A protocol with no client opens nothing. The RDP target here is the live
//      mock VNC server, so if the node dialled anything the server would count
//      a connection. It must not, not on a button press, and not on the
//      auto-resume path where a password is stored and autoConnect is on.
//
// And the regression that matters: VNC still connects to a real RFB server and
// paints the pixel the server sent, after every one of those switches.
// tests/helpers/mock-rfb-server.mjs is the same RFB 3.8 server vnc-node.test.mjs
// runs against, so "connected" here means the whole handshake, not a class name.
//
// Hermetic: the board is injected by intercepting the canvas fetch, autosave is
// off before any page script runs, and /api/save-board is refused, so nothing
// under content/ is touched either way.
//
// COMPUTER_PATCH_DIR: point it at a directory holding a patched braindump.js and
// braindump.css and they are served instead of the repo's. That is how this was
// proved red before the patch and green after; it is inert when unset.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { startMockRfbServer } from "../helpers/mock-rfb-server.mjs";

const port = 4266;
const baseUrl = `http://127.0.0.1:${port}`;
const PASSWORD = "hunter2";
const patchDir = process.env.COMPUTER_PATCH_DIR || "";
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview server did not start")), 15000);
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

// The node carries no `protocol` field, exactly like every vnc node committed
// before the switch existed. Reading as VNC is case A.
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
    // addInitScript runs in every same-origin frame, and a nested canvas would
    // otherwise wipe the board state of the page that owns it.
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    // Clear once, on the first load only. This script runs again on reload, and
    // wiping the board draft there would throw away the very thing case D is
    // asking about: whether the protocol survived.
    if (sessionStorage.getItem("computer-window-booted")) return;
    sessionStorage.setItem("computer-window-booted", "1");
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    localStorage.removeItem("vnc-credentials:board:test-board:test-vnc");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  if (patchDir) {
    const js = await readFile(path.join(patchDir, "braindump.js"), "utf8");
    const css = await readFile(path.join(patchDir, "braindump.css"), "utf8");
    await page.route("**/braindump.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: js }));
    await page.route("**/braindump.css*", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: css }));
  }
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  const shell = "#test-vnc .bd-vnc-shell";
  const protocolOf = () => page.inputValue("#test-vnc .bd-vnc-protocol");
  const panelText = () => page.locator("#test-vnc .bd-vnc-requirements").innerText();
  const statusText = () => page.locator("#test-vnc .bd-vnc-status-text").textContent();
  const setProtocol = async (value) => {
    await page.selectOption("#test-vnc .bd-vnc-protocol", value);
    await page.waitForFunction(
      (want) => document.querySelector("#test-vnc .bd-vnc-protocol")?.value === want,
      value,
      { timeout: 5000 }
    );
  };
  const waitConnected = () => page.waitForFunction(
    () => document.querySelector("#test-vnc .bd-vnc-shell")?.dataset.vncState === "connected",
    null,
    { timeout: 20000 }
  );
  // The framebuffer arrived and noVNC drew it. Reading the pixel back is the
  // end of the chain, from RFB rectangle to what is on screen.
  const paintedPixel = async () => {
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#test-vnc .bd-vnc-screen canvas");
      return canvas && canvas.width === 320 && canvas.height === 240;
    }, null, { timeout: 15000 });
    return page.evaluate(() => {
      const canvas = document.querySelector("#test-vnc .bd-vnc-screen canvas");
      const [r, g, b] = canvas.getContext("2d").getImageData(160, 120, 1, 1).data;
      return [r, g, b];
    });
  };

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-vnc", { timeout: 15000 });
  await page.waitForSelector("#test-vnc .bd-vnc-form", { timeout: 10000 });

  // --- A: a node saved before the switch existed reads as VNC ---
  // Backward compatibility is not a nicety here: two committed boards carry a
  // vnc node with no protocol field.
  assert.equal(
    await protocolOf(),
    "vnc",
    "A: a node with no protocol field must default to VNC, which is what every committed board has"
  );

  // --- B: VNC still connects, all the way to a painted screen ---
  await page.fill("#test-vnc .bd-vnc-password", PASSWORD);
  await page.locator("#test-vnc .bd-vnc-remember").setChecked(true);
  await page.click("#test-vnc .bd-vnc-submit");
  await waitConnected();
  assert.equal(await statusText(), "Mock desktop", "B: the desktop name should come from the server");
  assert.deepEqual(await paintedPixel(), [0x2f, 0xda, 0xca], "B: the pixel drawn must be the pixel sent");
  assert.equal(vnc.log.sessions, 1, "B: one real RFB session");

  // --- C: switching to RDP opens nothing ---
  // The switch lives on the settings form, the same place the target does, so
  // this is the path a user takes: Settings, then pick a protocol. The target
  // is still the live mock server, so a node that dialled anything would show
  // up as a connection on the server's own counter.
  const connectionsAfterVnc = vnc.log.connections;
  await page.click("#test-vnc .bd-vnc-settings-btn");
  await page.waitForSelector("#test-vnc .bd-vnc-protocol", { timeout: 5000 });
  await setProtocol("rdp");
  await page.waitForSelector("#test-vnc .bd-vnc-requirements", { timeout: 5000 });
  assert.equal(
    await page.locator("#test-vnc .bd-vnc-screen").count(),
    0,
    "C: no screen for a protocol with no client"
  );
  assert.equal(
    await page.locator("#test-vnc .bd-vnc-password").count(),
    0,
    "C: no password field for a protocol that cannot use one"
  );

  const rdpPanel = await panelText();
  assert.match(rdpPanel, /gateway/i, "C: the panel must say a gateway is what is missing");
  assert.match(rdpPanel, /guacd/i, "C: and name it, so this is actionable rather than a shrug");
  assert.match(rdpPanel, /docker run/i, "C: with the command that starts it");

  // There is no Connect button to press, which is the point: the panel is the
  // whole affordance. What is left that could dial is Enter in the target
  // field, which submits the form even with no submit button in it.
  assert.equal(
    await page.locator("#test-vnc .bd-vnc-connect-btn").count(),
    0,
    "C: no Connect button for a protocol that cannot connect"
  );
  await page.click("#test-vnc .bd-vnc-url");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  assert.equal(
    vnc.log.connections,
    connectionsAfterVnc,
    "C: RDP must not open a socket. The target is a live server, so any attempt would have landed"
  );
  assert.match(
    await statusText(),
    /needs a Guacamole gateway/i,
    "C: and the header must say why, not sit on the last protocol's status"
  );

  // --- D: the choice is board data, so it survives a reload ---
  // The trap: autoConnect is true and the password is stored from case B, so
  // the auto-resume path is armed. It must still not dial.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#test-vnc", { timeout: 15000 });
  await page.waitForSelector("#test-vnc .bd-vnc-protocol", { timeout: 10000 });
  assert.equal(await protocolOf(), "rdp", "D: the protocol is board data and must come back as RDP");
  await page.waitForTimeout(2000);
  assert.equal(
    vnc.log.connections,
    connectionsAfterVnc,
    "D: a board saved on RDP must open silent, even with a stored password and autoConnect on"
  );
  assert.equal(
    await page.locator("#test-vnc .bd-vnc-screen").count(),
    0,
    "D: and with no session UI pretending otherwise"
  );

  // --- E: the terminal is honest about needing a host, and about the risk ---
  await setProtocol("terminal");
  const terminalPanel = await panelText();
  assert.match(terminalPanel, /PTY/i, "E: a terminal needs a PTY host and should say so");
  assert.match(
    terminalPanel,
    /origin/i,
    "E: and must name the Origin check, since a WebSocket is not covered by CORS and the local server does not check it"
  );

  // --- F: local is labelled as future work rather than offered ---
  await setProtocol("local");
  assert.match(await panelText(), /future work/i, "F: local should say it is future work, in the node");
  assert.equal(
    vnc.log.connections,
    connectionsAfterVnc,
    "F: nothing in the unavailable protocols opens a socket"
  );

  // --- G: switch back to VNC and it connects again, from the stored password ---
  // The whole point of the switch: the working protocol keeps working.
  await setProtocol("vnc");
  await page.waitForSelector("#test-vnc .bd-vnc-password", { timeout: 5000 });
  await page.click("#test-vnc .bd-vnc-connect-btn");
  await waitConnected();
  assert.deepEqual(await paintedPixel(), [0x2f, 0xda, 0xca], "G: VNC must still paint the server's pixel");
  assert.equal(vnc.log.sessions, 2, "G: a second real RFB session, after four protocol switches and a reload");

  // --- H: the protocol is in the board file, the password never is ---
  // The local save is debounced by 400ms, so wait for the write rather than
  // guessing at it.
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("board:test-board") || "{}")
      .nodes?.find((n) => n.id === "test-vnc")?.protocol === "vnc",
    null, { timeout: 5000 });
  const serialized = await page.evaluate(() => {
    const node = JSON.parse(localStorage.getItem("board:test-board") || "{}")
      .nodes?.find((n) => n.id === "test-vnc");
    return node || null;
  });
  assert.ok(serialized, "H: the board state should hold the node");
  assert.equal(serialized.type, "vnc", "H: the stored type stays vnc, so older boards and readers are untouched");
  assert.equal(serialized.protocol, "vnc", "H: the protocol rides in the board file next to the target");
  assert.equal(
    JSON.stringify(serialized).includes(PASSWORD),
    false,
    "H: the password must never reach the canvas, which is a committed file"
  );

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log(
    `computer window: all 8 cases passed (${vnc.log.sessions} RFB sessions, ${vnc.log.connections} sockets opened)`
  );
} finally {
  if (browser) await browser.close();
  child.kill();
  await vnc.close();
}
