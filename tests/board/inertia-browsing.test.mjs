// Inertia browsing: flick the board and it keeps gliding, decelerating to a stop.
//
// Everything below is measured on the REAL camera, read out of the canvas
// element's own transform, because that is the only thing a person can see. No
// assertion in this file looks at a listener, a flag, a class or the source of
// braindump.js. The question this suite is built around is the one from
// .agents/whiteboard/test_audit_2026-08-01.md: if the body of the glide were
// deleted and its names left alone, would this go red? Each case below was run
// against a deliberately broken mirror to answer that, and the failures are
// recorded in .tmp/scratch/opus5-42/notes.md.
//
// The six things a person can tell apart, in order:
//
//   A  a fast flick is still moving after the button comes up, and then stops
//      on its own without anyone touching anything
//   B  a slow, deliberate drag that ends stops dead where it was let go
//   C  a click during a glide halts the board inside a frame or two
//   D  with the setting switched off, in the settings panel, the same flick
//      does not glide at all
//   E  the coasting-time control in the settings panel measurably changes how
//      far the same flick carries
//   F  the glide is timed against real elapsed seconds, not frames: with
//      requestAnimationFrame throttled to about 30Hz, the same flick covers
//      the same ground. A per-frame decay glides about twice as far (or half
//      as far) when the frame rate halves, and this repo has a 240Hz user.
//
// Port 4401. Autosave is disabled through the board's settings key before any
// page script runs and /api/save-board is blocked outright in every context,
// so nothing here can write into content/.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4401;
const baseUrl = `http://127.0.0.1:${port}`;

// Where the drag happens. Clear of the 232px site nav on the left, clear of
// the toolbar at the bottom of the board.
const FLICK_START = { x: 980, y: 300 };
const VIEWPORT = { width: 1280, height: 800 };

// Poll budget for a glide to come to rest. The longest coasting time the dial
// offers is 0.6s, and a capped 6000px/s flick takes about 3.3s to fall under
// the runtime's stop speed from there.
const SETTLE_TIMEOUT_MS = 7000;

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

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
const failures = [];
const notes = [];

// requestAnimationFrame, forced to roughly 30Hz. Installed before any page
// script runs, so the runtime never sees the real one.
const THROTTLE_RAF = () => {
  if (window.top !== window) return;
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(performance.now()), 33);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
};

async function openBoard({ throttleFrames = false } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  // Autosave off before any page script runs. Every probe, without exception.
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 300, devMode: false })
    );
  });
  if (throttleFrames) await context.addInitScript(THROTTLE_RAF);

  const page = await context.newPage();
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".braindump-toolbar-shell", { timeout: 20000 });
  // The board settles its own camera on load (fit-to-content). Wait for that to
  // finish, or the first reading is a moving target.
  await settle(page, 3000);
  return { context, page };
}

// The camera, as the page draws it.
function camera(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".braindump-canvas");
    const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || "");
    return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
  });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Waits until the camera stops changing. Returns how long that took, or null
// if it never settled.
async function settle(page, budget = SETTLE_TIMEOUT_MS) {
  const started = Date.now();
  let previous = await camera(page);
  let still = 0;
  while (Date.now() - started < budget) {
    await page.waitForTimeout(40);
    const now = await camera(page);
    if (distance(now, previous) < 0.3) {
      still += 1;
      if (still >= 4) return Date.now() - started;
    } else {
      still = 0;
    }
    previous = now;
  }
  return null;
}

// One middle-button pan, released at whatever speed the timing produces.
// Middle-drag is the pan gesture every desktop shape of this board shares, and
// page.mouse drives real input rather than dispatched events.
//
// Returns the camera as it stood at the instant of release: the last
// pointermove is the last thing that moves it, so a read taken before the
// button comes up is the release position exactly.
async function drag(page, { steps, stepPx, gapMs }) {
  await page.mouse.move(FLICK_START.x, FLICK_START.y);
  await page.mouse.down({ button: "middle" });
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(FLICK_START.x - i * stepPx, FLICK_START.y);
    if (gapMs > 0) await page.waitForTimeout(gapMs);
  }
  const atRelease = await camera(page);
  await page.mouse.up({ button: "middle" });
  return atRelease;
}

// A throw: eight fast steps, released while still moving.
const FLICK = { steps: 8, stepPx: 40, gapMs: 10 };
// A deliberate drag: the same kind of move, slowly, ending where it ended.
const SLOW_DRAG = { steps: 6, stepPx: 25, gapMs: 170 };

async function flickAndMeasure(page) {
  const atRelease = await drag(page, FLICK);
  const settleMs = await settle(page);
  const atRest = await camera(page);
  return { atRelease, atRest, settleMs, glide: distance(atRelease, atRest) };
}

// The settings panel, opened the way a person opens it.
async function openSettings(page) {
  if (!(await page.locator('[data-tool="settings"]').isVisible())) {
    await page.click('[data-board-ui="toolbar-more"]');
  }
  await page.click('[data-tool="settings"]');
  await page.waitForSelector("#braindump-settings-panel:not([hidden])", { timeout: 5000 });
}

async function closeSettings(page) {
  await page.keyboard.press("Escape");
  await page.waitForSelector("#braindump-settings-panel", { state: "hidden", timeout: 5000 });
}

try {
  await waitForServer(child);
  browser = await chromium.launch();

  // --- A: a fast flick keeps moving after release, then stops by itself -----
  {
    const { context, page } = await openBoard();
    const atRelease = await drag(page, FLICK);

    // Two readings taken after the button is already up. If the board only
    // moved while the button was down, these are all the same point.
    await page.waitForTimeout(60);
    const early = await camera(page);
    await page.waitForTimeout(90);
    const later = await camera(page);

    const settleMs = await settle(page);
    const atRest = await camera(page);
    const glide = distance(atRelease, atRest);

    notes.push(
      `A: released, then ${distance(atRelease, early).toFixed(1)}px by +60ms, ` +
        `${distance(early, later).toFixed(1)}px more over the next 90ms, ` +
        `${glide.toFixed(1)}px total, at rest after ${settleMs}ms`
    );

    if (distance(atRelease, early) < 10) {
      failures.push(
        `A: the camera moved ${distance(atRelease, early).toFixed(1)}px in the 60ms after the button ` +
          "came up. A flick has to keep going once you let go."
      );
    }
    if (distance(early, later) < 5) {
      failures.push(
        `A: the camera moved ${distance(early, later).toFixed(1)}px between 60ms and 150ms after ` +
          "release. It has to still be gliding there, not already stopped."
      );
    }
    if (glide < 100) {
      failures.push(`A: the whole glide after release was ${glide.toFixed(1)}px. That is not a flight.`);
    }
    if (settleMs === null) {
      failures.push(`A: the board was still moving ${SETTLE_TIMEOUT_MS}ms after release. A glide has to stop on its own.`);
    }
    await context.close();
  }

  // --- B: a slow drag that ends stops dead ----------------------------------
  {
    const { context, page } = await openBoard();
    const atRelease = await drag(page, SLOW_DRAG);
    await page.waitForTimeout(500);
    const after = await camera(page);
    const drift = distance(atRelease, after);
    notes.push(`B: slow drag released, drifted ${drift.toFixed(2)}px in the next 500ms`);
    if (drift > 2) {
      failures.push(
        `B: a slow, deliberate drag slid ${drift.toFixed(1)}px after it was let go. ` +
          "Only a throw may throw; the board must not slide away from a hand that stopped."
      );
    }
    await context.close();
  }

  // --- C: a click during a glide halts it -----------------------------------
  {
    const { context, page } = await openBoard();
    await drag(page, FLICK);

    // Prove it is genuinely in flight at the moment of the interruption.
    await page.waitForTimeout(70);
    const before = await camera(page);
    await page.waitForTimeout(60);
    const moving = await camera(page);
    const speed = distance(before, moving);

    // Touch the board: one plain click on the canvas.
    await page.mouse.move(500, 520);
    await page.mouse.down();
    await page.mouse.up();
    const atClick = await camera(page);
    await page.waitForTimeout(250);
    const afterClick = await camera(page);
    const coast = distance(atClick, afterClick);

    notes.push(
      `C: in flight at ${speed.toFixed(1)}px/60ms when clicked, then ${coast.toFixed(2)}px over 250ms`
    );

    if (speed < 5) {
      failures.push(
        `C: the board had already stopped (${speed.toFixed(1)}px in 60ms) before the click, so this case proves nothing`
      );
    }
    if (coast > 3) {
      failures.push(
        `C: the board kept coasting ${coast.toFixed(1)}px for 250ms after a click. ` +
          "Touching a moving board has to stop it, not fight it."
      );
    }
    await context.close();
  }

  // --- D: switched off in the settings panel, the same flick does not glide --
  {
    const { context, page } = await openBoard();
    await openSettings(page);

    const toggle = page.locator('#braindump-settings-panel input[id^="braindump-setting-inertia-"]').first();
    if ((await toggle.count()) === 0) {
      failures.push("D: the settings panel has no control for inertia at all");
    } else {
      if (!(await toggle.isChecked())) {
        failures.push("D: inertia is off by default, so a board nobody has configured never glides");
      }
      const slider = page.locator('#braindump-settings-panel input[type="range"][id*="inertia"]');
      if ((await slider.count()) === 0) {
        failures.push("D: the settings panel has a switch for inertia but nothing to adjust how much");
      }

      await toggle.uncheck();
      await closeSettings(page);

      const atRelease = await drag(page, FLICK);
      await page.waitForTimeout(400);
      const after = await camera(page);
      const drift = distance(atRelease, after);
      notes.push(`D: with the setting off, the same flick drifted ${drift.toFixed(2)}px`);
      if (drift > 2) {
        failures.push(
          `D: with the setting switched off, a flick still carried the board ${drift.toFixed(1)}px. ` +
            "Off has to mean off."
        );
      }
    }
    await context.close();
  }

  // --- E: the adjustment changes how far the same flick carries -------------
  {
    const { context, page } = await openBoard();
    const slider = page.locator('#braindump-settings-panel input[type="range"][id*="inertia"]');
    const readout = page.locator("#braindump-settings-panel [data-inertia-readout]");

    const measureAt = async (presses) => {
      await openSettings(page);
      // Home takes the dial to its minimum; each ArrowRight is one step up.
      // Real key input on the real control, not a value poked into the DOM.
      await slider.press("Home");
      for (let i = 0; i < presses; i += 1) await slider.press("ArrowRight");
      const label = (await readout.count()) ? (await readout.first().textContent()).trim() : "";
      await closeSettings(page);
      const result = await flickAndMeasure(page);
      return { ...result, label };
    };

    if ((await slider.count()) === 0) {
      failures.push("E: there is no control in the settings panel for how far a glide carries");
    } else {
      const shortest = await measureAt(1); // dial at 2
      const longest = await measureAt(8); // dial at 9

      notes.push(
        `E: dial low (${shortest.label}) carried ${shortest.glide.toFixed(0)}px in ${shortest.settleMs}ms; ` +
          `dial high (${longest.label}) carried ${longest.glide.toFixed(0)}px in ${longest.settleMs}ms`
      );

      if (shortest.label && longest.label && shortest.label === longest.label) {
        failures.push(`E: the readout says "${shortest.label}" at both ends of the control`);
      }
      if (!(longest.glide > shortest.glide * 1.8)) {
        failures.push(
          `E: the same flick carried ${shortest.glide.toFixed(0)}px at the low end of the control and ` +
            `${longest.glide.toFixed(0)}px at the high end. The adjustment has to change how far it goes.`
        );
      }
      if (shortest.settleMs === null || longest.settleMs === null) {
        failures.push("E: a glide never came to rest at one end of the control");
      }
    }
    await context.close();
  }

  // --- F: the glide is timed in seconds, not in frames -----------------------
  {
    // Both halves of the motion are checked, because a per-frame glide can be
    // wrong in either of two ways: multiply the step by a constant instead of
    // dt and it travels twice as far when frames get longer; decay per frame
    // as well and the distance comes out right while the flight takes twice
    // as long. A person sees both.
    const measureTwice = async (throttleFrames) => {
      const runs = [];
      for (let i = 0; i < 2; i += 1) {
        const { context, page } = await openBoard({ throttleFrames });
        const measured = await flickAndMeasure(page);
        runs.push(measured);
        await context.close();
      }
      return {
        glide: (runs[0].glide + runs[1].glide) / 2,
        settleMs: (runs[0].settleMs + runs[1].settleMs) / 2
      };
    };

    const native = await measureTwice(false);
    const throttled = await measureTwice(true);
    const distanceRatio = throttled.glide / native.glide;
    const durationRatio = throttled.settleMs / native.settleMs;

    notes.push(
      `F: the same flick carried ${native.glide.toFixed(0)}px over ${native.settleMs.toFixed(0)}ms at the ` +
        `native frame rate and ${throttled.glide.toFixed(0)}px over ${throttled.settleMs.toFixed(0)}ms with ` +
        `requestAnimationFrame throttled to ~30Hz (${distanceRatio.toFixed(2)}x distance, ` +
        `${durationRatio.toFixed(2)}x time)`
    );

    if (!(distanceRatio > 0.6 && distanceRatio < 1.4)) {
      failures.push(
        `F: halving the frame rate changed how far a flick carries by ${distanceRatio.toFixed(2)}x ` +
          `(${native.glide.toFixed(0)}px against ${throttled.glide.toFixed(0)}px). The glide must be timed ` +
          "against real elapsed seconds, or a 240Hz monitor gets a different board from a 60Hz one."
      );
    }
    if (!(durationRatio > 0.6 && durationRatio < 1.4)) {
      failures.push(
        `F: halving the frame rate changed how long a flick keeps moving by ${durationRatio.toFixed(2)}x ` +
          `(${native.settleMs.toFixed(0)}ms against ${throttled.settleMs.toFixed(0)}ms). The decay must be ` +
          "per second, not per frame."
      );
    }
  }
} finally {
  if (browser) await browser.close();
  child.kill();
}

for (const note of notes) console.log(`  ${note}`);

assert.deepEqual(failures, [], `inertia browsing is not right:\n  ${failures.join("\n  ")}`);

console.log(
  "inertia browsing: a flick keeps gliding and stops on its own, a slow drag stops dead, " +
    "a click halts a glide, the settings switch turns it off, the settings dial changes how far " +
    "it carries, and the distance does not depend on the frame rate"
);
