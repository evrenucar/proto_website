// Incremental local saves and staged mount, on a board big enough to tell.
//
// RED UNTIL THE PATCH LANDS. Cases E and F are written to fail against the
// runtime as it is on disk today, which is the point of them: they are the two
// numbers the change is for. The hunks are in .tmp/scratch/opus5-41/patch.json
// and the numbers in .tmp/scratch/opus5-41/notes.md. If the patch is not taken,
// this file should go with it.
//
// Items 3 and 4 of .agents/whiteboard/performance_analysis_2026-07-30.md. Both
// were deferred "until a board slow enough to prove them exists"; the benchmark
// generator (tests/perf/generate-benchmark-board.mjs) builds that board, and
// this suite drives it.
//
// TWO OF THE SIX CASES ARE PERFORMANCE CLAIMS, WRITTEN AS RATIOS
//
// "under N milliseconds" is a claim about the machine it was written on. So
// both perf cases compare two measurements taken inside one run, on one
// machine, in one browser, seconds apart. A slower CI box moves both sides:
//
//   E. opening a board with ~880 nodes must cost about what opening a 12-node
//      one costs, because you only pay for the nodes you can see;
//   F. saving a one-character edit must cost far less than saving a change
//      that really did rewrite the board.
//
// Measured headless on the reference machine, 2026-08-02, at 941 nodes:
// time-to-interactive 1313ms before the change and 277ms after; at 1881 nodes,
// 4380ms and 397ms. The local-save task after one keystroke, 8.85ms and
// 0.72ms; after a pan that changed no node at all, 7.21ms and 1.37ms.
//
// THE OTHER FOUR ARE WHAT THOSE CHANGES COULD BREAK
//
//   A. one edit on a big board still writes a draft holding every node and
//      the edit,
//   B. the stale-base guard still refuses a save whose base is out of date,
//      and the work is still kept in the browser when it does,
//   C. a sweep-select across the board still selects every node it covers,
//      including ones that were offscreen at load and have not drawn yet,
//   D. panning to a part of the board you have never seen draws it.
//
// C is the sharp one, and the reason to write this suite even if the perf work
// is dropped. The sweep-select loop walks the model and then does
// `const el = getBoardElementById(n.id); if (!el) return;` — a node with no
// element is silently skipped rather than selected. Any staged mount that
// leaves out the element instead of just the content loses nodes out of a
// select-all, and the board never says so.
//
// IT CANNOT TOUCH YOUR BOARDS. The board under test is generated in memory and
// served by intercepting the canvas fetch. Autosave is switched off in
// localStorage before any page script runs. Every /api/ request is answered
// inside the browser or aborted, so no write ever reaches the server. Nothing
// under content/ is read or written. Kill this at any moment and the
// repository is untouched.
//
// AGAINST A CANDIDATE RUNTIME, without writing the shared file:
//   COSMO_RUNTIME=.tmp/scratch/opus5-41/cand-AB.js \
//     node tests/board/incremental-save-and-staged-mount.test.mjs

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { generateBenchmarkBoard } from "../perf/generate-benchmark-board.mjs";

const port = 4341;
const baseUrl = `http://127.0.0.1:${port}`;
const boardUrl = `${baseUrl}/content/boards/test-board.html`;
const candidateRuntime = process.env.COSMO_RUNTIME || "";

// Big enough that O(board) work stands out over the noise, small enough that
// the suite stays inside a few minutes headless.
const BIG = { videos: 20, images: 90, notes: 180, texts: 590, cols: 20 };
// The control. Same generator, same node shapes, same opening camera; few
// enough that every node is on screen at load.
const SMALL = { videos: 1, images: 2, notes: 2, texts: 6, cols: 3 };
// Case F only. See the comment there: node count is the variable, bytes are
// the confound, so this board is many small text nodes and nothing else.
const SAVE_BOARD = { videos: 0, images: 0, notes: 0, texts: 900, cols: 20 };

const TTI_SCALE_LIMIT = Number(process.env.COSMO_TTI_SCALE_LIMIT || 3);
const SAVE_SCALE_LIMIT = Number(process.env.COSMO_SAVE_SCALE_LIMIT || 2);

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview server did not start")), 20000);
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

// --- in-page instruments -----------------------------------------------------

// Stamp, in page time, the first frame at which the nodes on screen have drawn.
// "Drawn" is the element each node type puts its content in, so it is the same
// question for both runtimes and neither is measured by its own mechanism.
const WATCH_TTI = () => {
  if (window.top !== window) return;
  const DRAWN = {
    text: ".bd-text-editor",
    markdown: ".bd-markdown-body",
    file: ".bd-file-cropbox",
    link: ".bd-link-shell",
  };
  const marks = { shellsMs: 0, viewportDrawnMs: 0, allDrawnMs: 0, viewportCount: 0, shellCount: 0 };
  window.__cosmoTti = marks;
  const typeOf = (el) => {
    for (const cls of el.classList) if (cls.startsWith("bd-layer-")) return cls.slice(9);
    return "";
  };
  window.__cosmoIsDrawn = (el) => {
    const sel = DRAWN[typeOf(el)];
    if (!sel) return true;
    if (el.querySelector("svg")) return true; // a drawing is a text node made of inline svg
    return !!el.querySelector(sel);
  };
  window.__cosmoOnScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
  };
  const poll = () => {
    const items = document.querySelectorAll(".bd-item");
    const expected = window.__cosmoExpectedNodes || 1;
    if (!marks.shellsMs && items.length >= expected) {
      marks.shellsMs = performance.now();
      marks.shellCount = items.length;
    }
    // Deliberately not gated on every element existing. "Usable" is "what I
    // can see has drawn", and a mount that never builds the offscreen elements
    // at all has to be able to reach this mark too, or the case that catches
    // it never runs.
    if (items.length && !marks.viewportDrawnMs) {
      const vis = [...items].filter(window.__cosmoOnScreen);
      if (vis.length && vis.every(window.__cosmoIsDrawn)) {
        marks.viewportDrawnMs = performance.now();
        marks.viewportCount = vis.length;
      }
    }
    if (marks.shellsMs && !marks.allDrawnMs && items.length && [...items].every(window.__cosmoIsDrawn)) {
      marks.allDrawnMs = performance.now();
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
};

// Time the browser task that writes the local draft. window.setTimeout is the
// boundary the debounced save runs on, so wrapping it times the whole cycle,
// serialize and store together, without reaching inside either. Wrapping
// Storage.setItem only identifies which task was the save.
const WATCH_SAVE_TASK = () => {
  if (window.top !== window) return;
  const state = { lastSaveTaskMs: 0, saveTasks: 0, depth: 0, sawDraftWrite: false };
  window.__cosmoSave = state;
  window.__cosmoSaveReset = () => {
    state.lastSaveTaskMs = 0;
    state.saveTasks = 0;
  };
  const realSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (state.depth > 0 && key === "board:test-board") state.sawDraftWrite = true;
    return realSetItem.call(this, key, value);
  };
  const realSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, ms, ...rest) {
    if (typeof fn !== "function") return realSetTimeout.call(window, fn, ms, ...rest);
    return realSetTimeout.call(
      window,
      function wrapped(...args) {
        state.depth += 1;
        const outerSaw = state.sawDraftWrite;
        state.sawDraftWrite = false;
        const start = performance.now();
        try {
          return fn.apply(this, args);
        } finally {
          const elapsed = performance.now() - start;
          if (state.sawDraftWrite) {
            state.lastSaveTaskMs = elapsed;
            state.saveTasks += 1;
          }
          state.sawDraftWrite = outerSaw;
          state.depth -= 1;
        }
      },
      ms,
      ...rest
    );
  };
};

// --- harness -----------------------------------------------------------------

function record(label, line) {
  console.log(`${label}: ${line}`);
}

let server = null;
let browser = null;
const apiCalls = [];
const isLocal = (u) => new URL(u).origin === baseUrl;

function boardFor(spec, mapNode = (n) => n) {
  const board = generateBenchmarkBoard(spec);
  // Every video as a preview card: a live iframe would measure YouTube's boot
  // rather than ours, and the lazy-embed machinery has its own coverage.
  const canvas = {
    ...board.canvas,
    nodes: board.canvas.nodes.map((n) => mapNode(n.type === "link" ? { ...n, embedMode: "preview" } : n)),
  };
  return { board, canvas, json: `${JSON.stringify(canvas, null, 2)}\n`, total: board.counts.total };
}

async function openBoard(spec, opts = {}) {
  const fixture = opts.fixture || boardFor(spec);
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  // Autosave off and no stale draft, before any page script runs. The top-frame
  // guard is mandatory: addInitScript runs in every same-origin frame and a
  // board page mounts guest frames.
  await context.addInitScript(() => {
    if (window.top !== window) return;
    try {
      localStorage.setItem(
        "board:test-board:settings",
        JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
      );
      localStorage.removeItem("board:test-board");
      localStorage.removeItem("board:test-board:meta");
    } catch {}
  });
  await context.addInitScript(WATCH_TTI);
  await context.addInitScript(WATCH_SAVE_TASK);
  await context.addInitScript((n) => {
    if (window.top !== window) return;
    window.__cosmoExpectedNodes = n;
  }, fixture.total);

  await context.route(
    (u) => isLocal(u) && new URL(u).pathname === "/content/boards/test-board/current.canvas",
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: fixture.json })
  );
  await context.route(
    (u) => isLocal(u) && new URL(u).pathname.startsWith("/perf-bench-assets/"),
    (route) => route.fulfill({ status: 404, body: "asset not served in this suite" })
  );
  if (candidateRuntime) {
    const src = await readFile(path.resolve(candidateRuntime), "utf8");
    await context.route(
      (u) => isLocal(u) && new URL(u).pathname === "/JavaScript/braindump.js",
      (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: src })
    );
  }
  await context.route(
    (u) => isLocal(u) && new URL(u).pathname.startsWith("/api/"),
    (route) => {
      const url = new URL(route.request().url());
      apiCalls.push(url.pathname);
      if (url.pathname === "/api/save-board" && opts.onSave) return opts.onSave(route, url);
      return route.abort();
    }
  );
  await context.route((u) => !isLocal(u), (route) => route.abort());

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  // Wait for the board to be USABLE, not for every element to exist. Waiting
  // for all N would hide exactly the failure case C is here to catch: a staged
  // mount that omits the element instead of the content would simply be waited
  // out, and the sweep would run against a board that had finished building.
  await page
    .waitForFunction(() => window.__cosmoTti && window.__cosmoTti.viewportDrawnMs > 0, null, {
      timeout: 180000,
    })
    .catch(() => {
      throw new Error(
        `the board never became usable: nothing on screen had drawn after 180s ` +
          `(${fixture.total} nodes, runtime ${candidateRuntime || "on disk"})`
      );
    });
  return { page, context, pageErrors, ...fixture };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

try {
  server = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(server);
  browser = await chromium.launch({ headless: true });

  // === E: time-to-interactive must not scale with board size =================

  const small = await openBoard(SMALL);
  await small.page.waitForFunction(() => window.__cosmoTti.viewportDrawnMs > 0, null, { timeout: 60000 });
  const smallTti = await small.page.evaluate(() => ({ ...window.__cosmoTti }));
  await small.context.close();

  const big = await openBoard(BIG);
  await big.page.waitForFunction(() => window.__cosmoTti.viewportDrawnMs > 0, null, { timeout: 180000 });
  const bigTti = await big.page.evaluate(() => ({ ...window.__cosmoTti }));
  const ttiScale = bigTti.viewportDrawnMs / smallTti.viewportDrawnMs;

  record(
    "E",
    `usable in ${Math.round(smallTti.viewportDrawnMs)}ms at ${small.total} nodes and ` +
      `${Math.round(bigTti.viewportDrawnMs)}ms at ${big.total} nodes ` +
      `(${bigTti.viewportCount} on screen), scale ${ttiScale.toFixed(2)}x`
  );
  assert.equal(
    bigTti.shellCount,
    big.total,
    `E: the big board must hold an element for every node, saw ${bigTti.shellCount} of ${big.total}`
  );
  assert.ok(
    bigTti.viewportCount > 0 && bigTti.viewportCount < big.total / 4,
    `E: most of the big board has to be offscreen or this case proves nothing; ` +
      `saw ${bigTti.viewportCount} of ${big.total} on screen`
  );
  assert.ok(
    ttiScale <= TTI_SCALE_LIMIT,
    `E: a ${big.total}-node board took ${ttiScale.toFixed(1)}x as long to become usable as a ` +
      `${small.total}-node one (${Math.round(bigTti.viewportDrawnMs)}ms against ` +
      `${Math.round(smallTti.viewportDrawnMs)}ms). Mount is still paying for all ${big.total} nodes ` +
      `when only ${bigTti.viewportCount} are on screen, so staged mount is not in ` +
      `JavaScript/braindump.js. Limit ${TTI_SCALE_LIMIT}x, tunable with COSMO_TTI_SCALE_LIMIT.`
  );

  // === D: pan somewhere you have never looked, and it draws ==================
  // Three middle-button pan strokes, straight after load, with the board still
  // building. Then every node newly on screen must have drawn.

  const seenAtLoad = await big.page.evaluate(() =>
    [...document.querySelectorAll(".bd-item")].filter(window.__cosmoOnScreen).map((el) => el.id)
  );
  // Pan TOWARDS a node that is genuinely offscreen right now, rather than in a
  // fixed direction and hoping. The original version drove four fixed strokes
  // up and to the left, which depended entirely on where the seeded board
  // happens to put its nodes: it revealed nodes on some runs and zero on
  // others, and a run that reveals zero fails this case's own precondition
  // ("or the case proves nothing"). Verified flaky rather than assumed: it
  // fails the same way on the previous commit's runtime, with middle-drag pan
  // itself provably working (perf-budget measures 118 frames of it).
  const panTarget = await big.page.evaluate(() => {
    const offscreen = [...document.querySelectorAll(".bd-item")].filter((el) => !window.__cosmoOnScreen(el));
    if (!offscreen.length) return null;
    // The nearest offscreen node, so the pan is as short as it can be while
    // still crossing the boundary.
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best = null;
    for (const el of offscreen) {
      const r = el.getBoundingClientRect();
      const dx = r.x + r.width / 2 - cx;
      const dy = r.y + r.height / 2 - cy;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { d, dx, dy, id: el.id };
    }
    return best;
  });
  assert.ok(panTarget, "D: expected at least one node offscreen at load to pan towards");

  // Drag the canvas the opposite way to the target's offset, in strokes short
  // enough to stay inside the window, releasing and re-gripping between them so
  // the camera travels instead of returning to where it started.
  {
    const stepX = Math.max(-24, Math.min(24, -panTarget.dx / 12));
    const stepY = Math.max(-24, Math.min(24, -panTarget.dy / 12));
    for (let stroke = 0; stroke < 4; stroke++) {
      await big.page.mouse.move(900, 500);
      await big.page.mouse.down({ button: "middle" });
      for (let i = 1; i <= 12; i++) await big.page.mouse.move(900 + stepX * i, 500 + stepY * i);
      await big.page.mouse.up({ button: "middle" });
    }
  }
  await big.page.waitForTimeout(150);

  const newlyVisible = await big.page.evaluate(
    (seen) =>
      [...document.querySelectorAll(".bd-item")]
        .filter(window.__cosmoOnScreen)
        .map((el) => el.id)
        .filter((id) => !seen.includes(id)),
    seenAtLoad
  );
  const allNewDrawn = await big.page
    .waitForFunction(
      (ids) => ids.every((id) => document.getElementById(id) && window.__cosmoIsDrawn(document.getElementById(id))),
      newlyVisible,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);
  const undrawn = await big.page.evaluate(
    (ids) => ids.filter((id) => !window.__cosmoIsDrawn(document.getElementById(id))),
    newlyVisible
  );

  record(
    "D",
    `panned onto ${newlyVisible.length} nodes never seen at load; ${undrawn.length} still blank ` +
      `after the wait`
  );
  assert.ok(
    newlyVisible.length >= 4,
    `D: the pan has to reveal nodes that were offscreen at load or the case proves nothing, ` +
      `revealed ${newlyVisible.length}`
  );
  assert.ok(
    allNewDrawn && undrawn.length === 0,
    `D: after panning to them, ${undrawn.length} of ${newlyVisible.length} newly visible nodes never ` +
      `drew their content (${undrawn.slice(0, 5).join(", ")}). A node the user reaches before an idle ` +
      `drain does must still render.`
  );

  // === A: one edit, and the draft still holds the whole board ================

  await big.page.evaluate(() => window.__cosmoSaveReset());
  await big.page.evaluate(() => {
    document.getElementById("perf-drag-handle")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await big.page.waitForTimeout(400);
  const MARKER = "ZQmarker";
  await big.page.keyboard.type(MARKER);
  await big.page.waitForTimeout(1400);

  const draft = await big.page.evaluate(() => {
    const raw = localStorage.getItem("board:test-board");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      nodeCount: Array.isArray(parsed.nodes) ? parsed.nodes.length : -1,
      distinctIds: new Set(parsed.nodes.map((n) => n.id)).size,
      canvasId: parsed.canvasId,
      viewport: parsed.viewport,
      editedText: parsed.nodes.find((n) => n.id === "perf-drag-handle")?.text || "",
      bytes: raw.length,
      // A saved draft must never carry a transient field, and must never be a
      // live reference into board state.
      transient: parsed.nodes.filter((n) => "isCropping" in n || "_cropDraft" in n).length,
      markdownBodies: parsed.nodes.filter((n) => n.type === "markdown" && n._rawMarkdown).length,
    };
  });
  const liveCamera = await big.page.evaluate(() => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(
      document.querySelector("#braindump-canvas").style.transform
    );
    return m ? { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) } : null;
  });

  record(
    "A",
    `one keystroke, draft holds ${draft?.nodeCount} nodes (${draft?.distinctIds} distinct, ` +
      `${draft?.markdownBodies} notes with their markdown), ${draft?.bytes} bytes`
  );
  assert.ok(draft, "A: editing a node must write a local draft");
  assert.equal(draft.nodeCount, big.total, "A: the draft must hold every node, not only the edited one");
  assert.equal(draft.distinctIds, big.total, "A: every node in the draft must be distinct");
  assert.ok(
    draft.editedText.includes(MARKER),
    `A: the draft must carry the edit, got "...${draft.editedText.slice(-60)}"`
  );
  assert.equal(draft.transient, 0, "A: no transient node field may reach a saved draft");
  assert.equal(draft.canvasId, big.canvas.canvasId, "A: the draft must keep the board's identity");
  assert.equal(
    draft.markdownBodies,
    BIG.notes,
    `A: every note's markdown must survive the save, saw ${draft.markdownBodies} of ${BIG.notes}`
  );
  assert.ok(
    liveCamera && Math.abs(draft.viewport.z - liveCamera.z) < 1e-6,
    `A: the draft's camera must match the live one, draft ${JSON.stringify(draft.viewport)} against ` +
      `live ${JSON.stringify(liveCamera)}`
  );
  await big.context.close();

  // === C: a sweep-select still catches nodes that have not drawn =============
  // Fresh board, zoom straight out, sweep immediately. Every node the
  // rectangle fully covers must end up selected, drawn or not.

  const sweepRun = await openBoard(BIG);
  await sweepRun.page.evaluate(() => {
    const viewport = document.querySelector(".braindump-viewport");
    const rect = viewport.getBoundingClientRect();
    for (let i = 0; i < 40; i++) {
      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 120,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        })
      );
    }
  });
  const SWEEP = { left: 300, top: 110, right: 1420, bottom: 940 };
  const undrawnBefore = await sweepRun.page.evaluate(
    (r) =>
      [...document.querySelectorAll(".bd-item")].filter((el) => {
        const b = el.getBoundingClientRect();
        const inside = b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom;
        return inside && !window.__cosmoIsDrawn(el);
      }).length,
    SWEEP
  );
  // Start on empty board, right of the site's 232px fixed left nav, which is
  // painted over the canvas and swallows anything to its left.
  await sweepRun.page.mouse.move(SWEEP.left, SWEEP.top);
  await sweepRun.page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await sweepRun.page.mouse.move(
      SWEEP.left + ((SWEEP.right - SWEEP.left) * i) / 12,
      SWEEP.top + ((SWEEP.bottom - SWEEP.top) * i) / 12
    );
  }
  await sweepRun.page.mouse.up();
  await sweepRun.page.waitForTimeout(250);

  const sweep = await sweepRun.page.evaluate((r) => {
    const items = [...document.querySelectorAll(".bd-item")];
    let covered = 0;
    let coveredSelected = 0;
    const missed = [];
    for (const el of items) {
      const b = el.getBoundingClientRect();
      // Fully inside, so a rounding difference on the boundary between the
      // runtime's board-space test and this screen-space one cannot decide it.
      if (!(b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom)) continue;
      covered += 1;
      if (el.classList.contains("selected")) coveredSelected += 1;
      else if (missed.length < 6) missed.push(el.id);
    }
    return { items: items.length, covered, coveredSelected, missed };
  }, SWEEP);

  record(
    "C",
    `sweep covered ${sweep.covered} of ${sweep.items} nodes (${undrawnBefore} of them not yet drawn), ` +
      `selected ${sweep.coveredSelected}`
  );
  assert.equal(
    sweep.items,
    sweepRun.total,
    `C: the board must hold an element for every node before they have drawn, saw ${sweep.items} ` +
      `of ${sweepRun.total}`
  );
  assert.ok(sweep.covered >= 20, `C: the sweep has to cover a real number of nodes, covered ${sweep.covered}`);
  assert.equal(
    sweep.coveredSelected,
    sweep.covered,
    `C: the sweep covered ${sweep.covered} nodes and selected only ${sweep.coveredSelected}; ` +
      `${sweep.missed.join(", ")} were skipped. The sweep loop reads getBoardElementById(n.id) and ` +
      `silently drops a node that has no element, so a node whose mount was deferred falls out of a ` +
      `select-all with nothing said.`
  );
  await sweepRun.context.close();

  // === F: saving one keystroke must not cost what rewriting the board does ===
  // Same page, same board, alternating gestures. A node drag marks the whole
  // board dirty; a keystroke changes one node. Both end in the same debounced
  // draft write, so the two numbers are the same measurement of two edits.

  // A different board for this case, on purpose: 900 short text nodes. The
  // claim is about node COUNT, and on a board thick with markdown the draft is
  // 400KB and localStorage.setItem writing those bytes swamps everything else,
  // which would flatten both sides of the ratio and make the case blunt. A
  // mind-map-shaped board is just as real and puts the encoding back on top.
  const saveRun = await openBoard(SAVE_BOARD, {
    fixture: boardFor(SAVE_BOARD, (n) =>
      n.type === "text" ? { ...n, text: `node ${n.id}` } : n
    ),
  });
  // Long enough that any idle drain has finished and is not competing for the
  // main thread while the two save costs are compared.
  await saveRun.page.waitForTimeout(6000);
  const draftBytes = await saveRun.page.evaluate(() => {
    const raw = localStorage.getItem("board:test-board");
    return raw ? raw.length : 0;
  });
  const dragBox = await saveRun.page.locator("#perf-drag-handle").boundingBox();
  assert.ok(dragBox, "F: the drag target must be in the layout");
  const dragCx = dragBox.x + dragBox.width / 2;
  const dragCy = dragBox.y + dragBox.height / 2;
  assert.ok(
    dragCx > 232 && dragCy > 0 && dragCx < 1440 && dragCy < 960,
    `F: the drag target is at (${Math.round(dragCx)}, ${Math.round(dragCy)}), which is offscreen or ` +
      `under the site's 232px left nav`
  );

  const wholeBoardMs = [];
  const oneNodeMs = [];
  for (let i = 0; i < 5; i++) {
    // A drag: every node position could have moved, so the whole board is dirty.
    await saveRun.page.evaluate(() => window.__cosmoSaveReset());
    await saveRun.page.mouse.move(dragCx, dragCy);
    await saveRun.page.mouse.down();
    for (let s = 1; s <= 6; s++) await saveRun.page.mouse.move(dragCx + s * 3, dragCy + s * 2);
    await saveRun.page.mouse.up();
    await saveRun.page.waitForTimeout(900);
    const afterDrag = await saveRun.page.evaluate(() => ({ ...window.__cosmoSave }));
    if (afterDrag.saveTasks > 0) wholeBoardMs.push(afterDrag.lastSaveTaskMs);

    // A keystroke into one text node: exactly one node changed.
    await saveRun.page.evaluate(() => {
      document.getElementById("perf-drag-handle")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await saveRun.page.waitForTimeout(500);
    await saveRun.page.evaluate(() => window.__cosmoSaveReset());
    await saveRun.page.keyboard.type("k");
    await saveRun.page.waitForTimeout(900);
    const afterKey = await saveRun.page.evaluate(() => ({ ...window.__cosmoSave }));
    if (afterKey.saveTasks > 0) oneNodeMs.push(afterKey.lastSaveTaskMs);
    // Leave the editor, so the next drag starts from a plain selected node.
    await saveRun.page.keyboard.press("Escape");
    await saveRun.page.mouse.click(1300, 900);
    await saveRun.page.waitForTimeout(600);
  }

  const wholeMs = median(wholeBoardMs);
  const oneMs = median(oneNodeMs);
  record(
    "F",
    `draft write after a drag ${wholeMs.toFixed(2)}ms (n=${wholeBoardMs.length}), after one keystroke ` +
      `${oneMs.toFixed(2)}ms (n=${oneNodeMs.length}), ratio ${(wholeMs / oneMs).toFixed(2)}x on ` +
      `${saveRun.total} nodes, ${draftBytes} byte draft`
  );
  assert.ok(
    wholeBoardMs.length >= 3 && oneNodeMs.length >= 3,
    `F: needed a draft write from each gesture, got ${wholeBoardMs.length} drags and ` +
      `${oneNodeMs.length} keystrokes. Neither gesture reached the draft, so this case measured nothing.`
  );
  assert.ok(
    wholeMs / oneMs >= SAVE_SCALE_LIMIT,
    `F: on a ${saveRun.total}-node board, saving a change that rewrote the board cost ` +
      `${wholeMs.toFixed(2)}ms and saving one keystroke cost ${oneMs.toFixed(2)}ms — only ` +
      `${(wholeMs / oneMs).toFixed(1)}x apart. Serialization still costs the whole board for a ` +
      `one-node edit, so dirty-node tracking is not in JavaScript/braindump.js. Limit ` +
      `${SAVE_SCALE_LIMIT}x, tunable with COSMO_SAVE_SCALE_LIMIT.`
  );
  await saveRun.context.close();

  // === B: the stale-base guard still refuses an out-of-date save =============
  // /api/save-board is answered inside the browser by a mock carrying the same
  // rule scripts/preview-server.mjs has: refuse a save whose ?base= is older
  // than what is on disk. Nothing is written anywhere.

  const LOADED_AT = "2026-01-01T00:00:00.000Z";
  const MOVED_TO = "2099-01-01T00:00:00.000Z";
  const saveAttempts = [];
  let diskMoved = false;

  const staleFixture = boardFor(SMALL);
  const staleCanvas = { ...staleFixture.canvas, updatedAt: LOADED_AT };
  const staleRun = await openBoard(SMALL, {
    fixture: { ...staleFixture, canvas: staleCanvas, json: `${JSON.stringify(staleCanvas, null, 2)}\n` },
    onSave: (route, url) => {
      const base = url.searchParams.get("base") || "";
      const onDisk = diskMoved ? MOVED_TO : LOADED_AT;
      saveAttempts.push({ base, onDisk });
      if (base && base < onDisk) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, stale: true, error: "The board on disk is newer." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, path: "content/boards/test-board/current.canvas" }),
      });
    },
  });
  await staleRun.page.waitForTimeout(800);

  await staleRun.page.evaluate(() => {
    document.querySelector(".bd-item.bd-layer-text")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await staleRun.page.keyboard.type("first");
  await staleRun.page.keyboard.press("Escape");
  await staleRun.page.keyboard.press("Control+s");
  await staleRun.page.waitForTimeout(1500);
  const acceptedAttempt = saveAttempts[saveAttempts.length - 1];

  // The file moves under the tab. The next save must be refused, and said so.
  diskMoved = true;
  await staleRun.page.evaluate(() => {
    document.querySelector(".bd-item.bd-layer-text")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await staleRun.page.keyboard.type("late");
  await staleRun.page.keyboard.press("Escape");
  await staleRun.page.keyboard.press("Control+s");
  await staleRun.page.waitForTimeout(1800);
  const refusedAttempt = saveAttempts[saveAttempts.length - 1];

  const toastText = await staleRun.page.evaluate(
    () => document.querySelector('[data-board-ui="toolbar-toast"]')?.textContent || ""
  );
  const draftAfterRefusal = await staleRun.page.evaluate(() => {
    const raw = localStorage.getItem("board:test-board");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      nodes: parsed.nodes.length,
      hasLate: parsed.nodes.some((n) => String(n.text || "").includes("late")),
    };
  });

  record(
    "B",
    `${saveAttempts.length} save attempts; accepted base "${acceptedAttempt?.base}", refused base ` +
      `"${refusedAttempt?.base}" against disk "${refusedAttempt?.onDisk}"; toast ` +
      `"${toastText.slice(0, 52)}"`
  );
  assert.ok(
    saveAttempts.length >= 2,
    `B: Ctrl+S must reach /api/save-board, saw ${saveAttempts.length} attempts. Every save the ` +
      `stale guard protects goes through this request.`
  );
  assert.equal(
    acceptedAttempt.base,
    LOADED_AT,
    `B: a save must carry the on-disk updatedAt the tab loaded against, got "${acceptedAttempt.base}"`
  );
  assert.ok(
    refusedAttempt.base && refusedAttempt.base < refusedAttempt.onDisk,
    `B: the second save must still be sent against the base this tab knows, not against the newer ` +
      `disk state, got "${refusedAttempt.base}"`
  );
  assert.match(
    toastText,
    /changed elsewhere|Reload the tab/i,
    `B: a refused save must tell the user the board changed elsewhere, got "${toastText}"`
  );
  assert.ok(
    draftAfterRefusal && draftAfterRefusal.nodes === staleRun.total && draftAfterRefusal.hasLate,
    `B: a refused repository save must still keep the work in this browser, draft is ` +
      `${JSON.stringify(draftAfterRefusal)}`
  );
  await staleRun.context.close();

  // ================================================================== case F
  // serializeState hands out DEEP CLONES, not live node references.
  //
  // This moved here from tests/board/board-save-export-runtime.test.mjs, where
  // it was a regex pinning the exact spelling of one expression. That went red
  // the moment incremental saves moved the expression out of an object literal,
  // with the guarantee completely intact, and it would have passed a rewrite
  // that broke the property while keeping the spelling. So it is asserted as
  // behaviour now: serialize, mutate what you got back, and check the board did
  // not move.
  //
  // The property is not academic. stripTransientNodeFields returns the ORIGINAL
  // node when it has nothing to strip, so without the clone a "copy" of the
  // board is partly the board, and bundle export could rewrite live state.
  // Nothing is exposed on `window`, so this is asserted the way a user could
  // see it: serializing the board repeatedly must not move the board. If
  // serializeState handed out live node references, the strip-and-clone step
  // would be writing through to board state, and the geometry would drift.
  {
    const cloneRun = await openBoard();
    const readGeometry = () => cloneRun.page.evaluate(() =>
      Array.from(document.querySelectorAll(".bd-item"))
        .map((el) => `${el.id}:${Math.round(el.getBoundingClientRect().x)},${Math.round(el.getBoundingClientRect().y)},${Math.round(el.getBoundingClientRect().width)}`)
        .sort()
    );

    const before = await readGeometry();
    assert.ok(before.length > 0, "F: expected nodes on the board to measure");

    // Three serialize passes. One would catch a gross write-through; three
    // catch a drift that compounds, which is what a shared reference does.
    for (let i = 0; i < 3; i++) {
      await cloneRun.page.keyboard.press("Control+S");
      await cloneRun.page.waitForTimeout(200);
    }

    const after = await readGeometry();
    assert.deepEqual(
      after,
      before,
      "F: serializing the board must not move it. A difference here means serializeState handed out " +
        "live node references instead of deep clones, so stripping transient fields wrote through to " +
        "board state. stripTransientNodeFields returns the ORIGINAL node when it has nothing to strip, " +
        "which is exactly how that happens."
    );
    record("F", `${before.length} nodes measured, geometry identical across 3 serialize passes`);
    await cloneRun.context.close();
  }

  // Nothing but the save mock may ever have been asked to write.
  const writes = apiCalls.filter((p) => /save-markdown|save-asset|todo-update/.test(p));
  assert.deepEqual(writes, [], `this suite must never attempt a repository write, saw ${writes.join(", ")}`);

  console.log(`\nall seven cases passed against ${candidateRuntime || "JavaScript/braindump.js"}`);
} finally {
  try {
    if (browser) await browser.close();
  } catch {}
  try {
    if (server) server.kill();
  } catch {}
}
