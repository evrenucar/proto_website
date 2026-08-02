// The mobile diagnostics harness measures a real board and the record survives
// the page dying.
//
// Background: the tracker card "crashing on mobile if you zoom out and in too
// fast" could not be reproduced under emulation, and the leading hypothesis is
// phone GPU compositor memory, which desktop Chromium cannot show. That means
// the answer has to come off a real device. On iOS there is no inspector from
// Windows and no window.onerror when the system kills the WebContent process,
// so the instrument has to be the page itself.
//
// What this suite pins, all of it emulated and therefore all of it about the
// harness rather than the crash:
//   A the probe is injected by ?diag=1 and puts a HUD on the page
//   B a real two finger pinch still zooms the board with the probe attached,
//     and the probe records the frame samples and the scale range it produced
//   C a thrown error is captured on the page
//   D the beacon lands on disk as .tmp/diag/<sid>.jsonl while the page is alive
//   E a normal navigation is recorded as a clean exit
//   F a session that never exited cleanly is reported as a crash on next load
//
// F is the case that matters on a phone. Nothing else can tell you an iPhone
// killed the tab.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { chromium, devices } from "playwright";

const port = 4229;
const baseUrl = `http://127.0.0.1:${port}`;
const diagDir = path.join(process.cwd(), ".tmp", "diag");
const boardUrl = `${baseUrl}/content/boards/test-board.html?diag=1`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("diag server did not start")), 10000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`diag server exited early with code ${code}`));
    });
  });
}

await rm(diagDir, { recursive: true, force: true });

const child = spawn(process.execPath, ["scripts/mobile-diag-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 5"] });

  // Autosave off before any page script runs. This server has no save routes at
  // all, but a probe that overwrote the sandbox board once is reason enough to
  // belt and brace it.
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
  await page.route("**/api/save-*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  // The canvas is a zero size transform container, so wait on the viewport that
  // takes the touches instead. Playwright calls the canvas itself hidden.
  await page.waitForSelector(".braindump-viewport", { timeout: 15000 });
  await page.waitForSelector(".braindump-canvas", { state: "attached", timeout: 15000 });

  // --- A: the probe is there because the URL asked for it ---
  await page.waitForFunction(() => !!window.__cosmoDiag, null, { timeout: 10000 });
  assert.equal(
    await page.locator("script[src='/tools/mobile-diag.js']").count(),
    1,
    "A: ?diag=1 must inject exactly one probe script tag"
  );
  await page.waitForSelector("#cosmo-diag-hud", { timeout: 5000 });
  assert.equal(
    await page.locator("#cosmo-diag-hud").isVisible(),
    true,
    "A: the HUD must be visible on the page, it is the only readout a phone has"
  );

  // And the same page without the flag is untouched, so the probe cannot leak
  // into an ordinary visit.
  const plain = await (await fetch(`${baseUrl}/content/boards/test-board.html`)).text();
  assert.equal(
    plain.includes("mobile-diag.js"), false,
    "A: a page requested without ?diag=1 must not carry the probe"
  );

  const cdp = await context.newCDPSession(page);
  const zoom = () => page.evaluate(() => {
    const t = document.querySelector(".braindump-canvas").style.transform || "";
    const m = /scale\(([\d.]+)\)/.exec(t);
    return m ? Number(m[1]) : 1;
  });

  // A real two finger pinch through CDP, same shape as mobile-pinch-zoom.test.mjs.
  // The second touchstart is the one that carries touches.length === 2, which is
  // what the viewport listener needs to begin a pinch.
  async function pinch(ax, ay, bx, by, spread, steps = 12) {
    const touch = (x, y, id) => ({ x, y, id, radiusX: 12, radiusY: 12, force: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(ax, ay, 1)] });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touch(ax, ay, 1), touch(bx, by, 2)]
    });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ox = (bx - ax) * (spread - 1) * t * 0.5;
      const oy = (by - ay) * (spread - 1) * t * 0.5;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touch(ax - ox, ay - oy, 1), touch(bx + ox, by + oy, 2)]
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(80);
  }

  // --- B: the board still works with the probe attached, and the probe saw it ---
  const before = await zoom();
  await pinch(150, 500, 240, 560, 2.6);
  await pinch(150, 500, 240, 560, 1.9);
  await pinch(150, 500, 240, 560, 2.4);
  const after = await zoom();
  assert.ok(
    after > before * 1.2,
    `B: a pinch must still zoom the board while the probe runs, ${before.toFixed(3)} -> ${after.toFixed(3)}`
  );

  // Samples are emitted once a second, so wait for two windows rather than
  // sleeping a guessed amount.
  await page.waitForFunction(() => window.__cosmoDiag.samples.length >= 2, null, { timeout: 8000 });
  const measured = await page.evaluate(() => window.__cosmoDiag.report());

  assert.ok(measured.counters.touchstart >= 6,
    `B: the probe must count the touch starts it saw, got ${measured.counters.touchstart}`);
  assert.ok(measured.counters.gestures >= 3,
    `B: three pinches must be counted as three two finger gestures, got ${measured.counters.gestures}`);
  assert.ok(measured.counters.touchmove >= 30,
    `B: the session touch counters must stay cumulative rather than being reset by the per second window, got ${measured.counters.touchmove}`);
  assert.equal(measured.counters.maxTouches, 2,
    `B: two fingers must be seen as two, got ${measured.counters.maxTouches}`);
  assert.ok(measured.scaleRange[1] > 1.2,
    `B: the probe must record the zoom range it observed, got max ${measured.scaleRange[1]}`);
  const sample = measured.samples[measured.samples.length - 1];
  assert.ok(sample.fps > 0, `B: a sample must carry a frame rate, got ${sample.fps}`);
  assert.ok(sample.worst > 0, `B: a sample must carry a worst frame time, got ${sample.worst}`);
  assert.ok(sample.nodes > 10, `B: a sample must carry a DOM node count, got ${sample.nodes}`);

  // Chromium exposes performance.memory, WebKit does not. The probe must report
  // that difference rather than assume it, because iOS is the platform that
  // cannot be inspected from this machine at all.
  assert.equal(measured.env.caps.jsHeap, true, "B: Chromium must be detected as exposing a JS heap reading");
  assert.equal(typeof sample.heapMB, "number", "B: on Chromium the heap column must be filled");
  assert.equal(
    typeof measured.env.caps.deviceMemory, "boolean",
    "B: deviceMemory support must be reported as a fact, not guessed"
  );

  // --- C: an error on the page is captured by the probe ---
  await page.evaluate(() => {
    setTimeout(() => { throw new Error("diag-probe-boom"); }, 0);
  });
  await page.waitForFunction(() => window.__cosmoDiag.counters.errors >= 1, null, { timeout: 5000 });
  const withError = await page.evaluate(() => window.__cosmoDiag.report());
  assert.ok(
    withError.events.some((e) => e.kind === "error" && /diag-probe-boom/.test(e.msg)),
    "C: the thrown error must appear in the probe's event log"
  );

  // --- D: it is on disk on this machine while the phone is still running ---
  const sid = withError.sid;
  await page.waitForTimeout(600); // the error record is beaconed immediately
  const files = await readdir(diagDir);
  assert.ok(files.includes(`${sid}.jsonl`), `D: expected .tmp/diag/${sid}.jsonl, saw ${files.join(", ") || "nothing"}`);
  const lines = (await readFile(path.join(diagDir, `${sid}.jsonl`), "utf8"))
    .split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(lines.length >= 2, `D: the session file must hold several records, got ${lines.length}`);
  const hello = lines.find((l) => l.kind === "hello");
  assert.ok(hello, "D: the first record must be the environment record");
  assert.ok(/Android|Mobile/.test(hello.env.ua), `D: the environment record must carry the device UA, got ${hello.env.ua}`);
  assert.ok(
    lines.some((l) => l.kind === "error" && /diag-probe-boom/.test(l.msg)),
    "D: the error must have reached disk, that is the point of the beacon"
  );

  // --- E: a normal exit is recorded as clean ---
  await page.goto(`${baseUrl}/go`, { waitUntil: "domcontentloaded" });
  const live = await page.evaluate(() => JSON.parse(localStorage.getItem("cosmoDiag:live")));
  assert.equal(live.sid, sid, "E: the breadcrumb must belong to the session that just ended");
  assert.equal(live.clean, true, "E: navigating away must be recorded as a clean exit, or every run looks like a crash");

  // --- F: a session that never exited cleanly is reported on the next load ---
  // This is the whole iOS story. When the system kills the WebContent process
  // nothing fires, so the only evidence is a breadcrumb that was never marked
  // clean. Faked here by writing the record a killed session would have left.
  await page.evaluate(() => {
    localStorage.setItem("cosmoDiag:live", JSON.stringify({
      sid: "faked-kill",
      clean: false,
      at: new Date().toISOString(),
      t: 41000,
      phase: 3,
      phaseText: "4. pinch out and in FAST, 20 times, do not stop",
      last: { kind: "sample", fps: 41.2, worst: 210, jank: 6, heapMB: null, nodes: 1200, scale: 0.21 },
      worstFrame: 210,
      errors: 0,
      scale: [0.2, 4.8]
    }));
  });
  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cosmoDiag, null, { timeout: 10000 });
  assert.equal(
    await page.evaluate(() => window.__cosmoDiag.suspectedCrash()),
    true,
    "F: a breadcrumb left unclean must be read as a crash on the next load"
  );
  await page.waitForSelector("#cosmo-diag-hud button", { timeout: 5000 });
  const badge = await page.locator("#cosmo-diag-hud button").first().textContent();
  assert.ok(/CRASHED LAST RUN/.test(badge), `F: the HUD must say so on the phone, got "${badge}"`);

  const carried = await page.evaluate(() => window.__cosmoDiag.report().previousSession);
  assert.equal(carried.phaseText, "4. pinch out and in FAST, 20 times, do not stop",
    "F: the report must carry what the dead session was doing when it went quiet");
  assert.deepEqual(carried.scale, [0.2, 4.8],
    "F: and the zoom range it had reached, which is the number the grid layer hypothesis needs");

  const unexpected = pageErrors.filter((e) => !/diag-probe-boom/.test(e));
  assert.deepEqual(unexpected, [], "the run must produce no page errors beyond the one it threw on purpose");
  console.log("mobile diagnostics harness: all 6 cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
}
