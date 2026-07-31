// A node is the size it says it is, and nothing paints outside it.
//
// Reported from the tracker: "With previews if you try to make them as compact
// as possible the content can overflow. That shouldn't be possible. And with
// youtube videos (probably with other links its similar as well) you can only
// resize up down. Ideally you should be able to resize the complete block so
// its large or smaller without making anything overflow inside."
//
// Two faults, one card. `.bd-auto-size-content` clamped preview cards to a
// 250-400px band, so a sideways resize drag changed the stored width and never
// the drawn box, which is what "only resizes up and down" was. And
// `.bd-link-shell` kept its intrinsic content height however short the node was
// dragged, so the card painted straight through the bottom edge.
//
// The two invariants asserted here are deliberately general: they catch any
// future min-width, max-width or unclipped shell creeping back onto any node
// type, not just the ones in this report.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4226;
const baseUrl = `http://127.0.0.1:${port}`;
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

const baseCanvas = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...baseCanvas,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [
    {
      id: "probe-preview", type: "link", x: 420, y: 140, width: 320, height: 300,
      url: "https://example.com/article", embedMode: "preview",
      title: "A preview card with a long enough title to wrap onto a second line",
      description: "And a description under it, long enough that a short node has to do something about it rather than paint it outside the box.",
      image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='340'%3E%3Crect width='600' height='340' fill='%23234'/%3E%3C/svg%3E",
    },
    {
      id: "probe-live", type: "link", x: 880, y: 140, width: 520, height: 320,
      url: "https://example.com/", embedMode: "live", title: "A live embed",
    },
    {
      id: "probe-app", type: "app", x: 420, y: 540, width: 340, height: 240,
      embedMode: "preview",
      appConfig: { appName: "Demo app", icon: "\u{1F5A5}", description: "An app card, which shares the auto-size class with link previews.", url: "https://example.com/" },
    },
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
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
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

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#probe-preview", { timeout: 15000 });
  await page.waitForTimeout(600);

  // Set the model size the way a resize drag does, then read back what was
  // drawn and what escaped. Spill is measured against every clipping ancestor
  // inside the node, so an element hidden by an overflow:hidden parent does not
  // count as escaping.
  const measure = (id, w, h) => page.evaluate(({ id, w, h }) => {
    const el = document.getElementById(id);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const node = el.getBoundingClientRect();
    let worst = { right: 0, bottom: 0, top: 0, what: "" };
    for (const child of el.querySelectorAll("*")) {
      if (child.classList.contains("resize-handle")) continue;
      const cs = getComputedStyle(child);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      let r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      let left = r.left, right = r.right, top = r.top, bottom = r.bottom;
      for (let a = child.parentElement; a && a !== el.parentElement; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (as.overflow === "visible" && as.overflowX === "visible" && as.overflowY === "visible") continue;
        const ar = a.getBoundingClientRect();
        left = Math.max(left, ar.left); right = Math.min(right, ar.right);
        top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom);
      }
      if (right <= left || bottom <= top) continue;
      const overRight = right - node.right;
      const overBottom = bottom - node.bottom;
      const overTop = node.top - top;
      if (overRight > worst.right || overBottom > worst.bottom || overTop > worst.top) {
        worst = {
          right: Math.max(worst.right, overRight),
          bottom: Math.max(worst.bottom, overBottom),
          top: Math.max(worst.top, overTop),
          what: child.className || child.tagName,
        };
      }
    }
    return { boxW: node.width, boxH: node.height, worst };
  }, { id, w, h });

  const SIZES = [[50, 50], [200, 130], [300, 300], [500, 310], [900, 600]];
  const NODES = ["probe-preview", "probe-live", "probe-app"];

  for (const id of NODES) {
    for (const [w, h] of SIZES) {
      const m = await measure(id, w, h);

      // --- Invariant 1: the drawn box is the model size. ---
      // This is the "only resizes up and down" bug. A 500px-wide preview card
      // used to draw at 400, and a 50px one at 250.
      assert.ok(Math.abs(m.boxW - w) <= 0.5,
        `${id} at ${w}x${h}: drawn width ${m.boxW.toFixed(1)} must equal the model width ${w}`);
      assert.ok(Math.abs(m.boxH - h) <= 0.5,
        `${id} at ${w}x${h}: drawn height ${m.boxH.toFixed(1)} must equal the model height ${h}`);

      // --- Invariant 2: nothing paints outside the node. ---
      assert.ok(m.worst.right <= 0.5,
        `${id} at ${w}x${h}: "${m.worst.what}" spills ${m.worst.right.toFixed(1)}px past the right edge`);
      assert.ok(m.worst.bottom <= 0.5,
        `${id} at ${w}x${h}: "${m.worst.what}" spills ${m.worst.bottom.toFixed(1)}px below the bottom edge`);
      assert.ok(m.worst.top <= 0.5,
        `${id} at ${w}x${h}: "${m.worst.what}" spills ${m.worst.top.toFixed(1)}px above the top edge`);
    }
  }

  // --- The card degrades in the right order. ---
  // At a short height the hero image absorbs the shrink so the title survives,
  // rather than the text being pushed out of the box first.
  await measure("probe-preview", 260, 150);
  const titleInside = await page.evaluate(() => {
    const el = document.getElementById("probe-preview");
    const node = el.getBoundingClientRect();
    const title = el.querySelector(".bd-bookmark-title")?.getBoundingClientRect();
    return title ? title.bottom <= node.bottom + 0.5 && title.top >= node.top - 0.5 : false;
  });
  assert.equal(titleInside, true, "a short card must keep its title, letting the image take the shrink");

  // --- The mode toggle keeps the size. ---
  // Switching a wide live embed back to preview used to snap it to 400px. This
  // one needs a real resize drag rather than an inline style, because the
  // toggle re-renders from the model and only a drag writes to the model.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#probe-live", { timeout: 15000 });
  await page.waitForTimeout(600);

  // The handle only shows on a selected node, so select it the way a user does.
  await page.click("#probe-live .bd-embed-header", { position: { x: 200, y: 14 } });
  await page.waitForTimeout(200);
  const handleBox = await page.locator("#probe-live .resize-handle").boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 130, handleBox.y + handleBox.height / 2 - 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const dragged = await page.evaluate(() => {
    const el = document.getElementById("probe-live");
    return { boxW: el.getBoundingClientRect().width, modelW: parseFloat(el.style.width) };
  });
  assert.ok(Math.abs(dragged.boxW - 650) <= 1.5,
    `a sideways drag must widen the drawn box, got ${dragged.boxW.toFixed(1)} for a model of ${dragged.modelW}`);

  await page.click("#probe-live .bd-embed-toggle-btn");
  await page.waitForTimeout(300);
  const afterToggle = await page.evaluate(() => {
    const el = document.getElementById("probe-live");
    const r = el.getBoundingClientRect();
    return { boxW: r.width, modelW: parseFloat(el.style.width) };
  });
  assert.ok(Math.abs(afterToggle.boxW - 650) <= 0.5,
    `switching to preview must keep the width, drawn ${afterToggle.boxW.toFixed(1)}`);
  assert.ok(Math.abs(afterToggle.modelW - 650) <= 0.5, "and the model must still say 650");

  // --- The resize handle stays reachable at the floor. ---
  // A node dragged tiny has to be draggable back out.
  await page.click("#probe-preview");
  await page.waitForTimeout(200);
  await measure("probe-preview", 50, 50);
  const handleReachable = await page.evaluate(() => {
    const handle = document.querySelector("#probe-preview .resize-handle");
    if (!handle) return false;
    const r = handle.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === handle || handle.contains(hit));
  });
  assert.equal(handleReachable, true, "the resize handle must stay clickable at the size floor");

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log(`node size and overflow: ${NODES.length} node types x ${SIZES.length} sizes, plus degrade order, mode toggle and handle reach, all passed`);
} finally {
  if (browser) await browser.close();
  child.kill();
}
