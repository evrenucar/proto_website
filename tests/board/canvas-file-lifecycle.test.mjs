// The lifecycle of a sub-canvas file: it appears when a node needs it and it
// goes when nothing points at it any more.
//
// Every assertion here reads the filesystem, or reads the board file the board
// itself wrote. Nothing asserts that a handler fired, that a request was made,
// or that a string exists in braindump.js. The bug this covers was found by
// listing a directory: the cosmoboard picked up 13 empty, unreferenced .canvas
// files in about three minutes of use, because Ctrl+Z took the node off the
// board and left the file on disk. So the test that matters is `ls`.
//
// The invariant, stated once and checked after every gesture below:
//
//     the set of .canvas sidecars in the board's directory
//   ==
//     the set of canvasPaths on the board-preview nodes in current.canvas
//   +   the bystander files this test planted and never referenced
//
// Both halves matter. A fix that deleted every sidecar would satisfy "no
// orphans" and is caught by cases E, F and G, where a canvas somebody has
// written into, and a file nobody ever referenced, both have to survive.
//
// Sandbox: a board this test creates and removes, content/boards/canvas-lifecycle-probe.
// Never test-board, which other suites drive concurrently, and never cosmoboard.
// The board page is fetched and its slug rewritten in flight, so no new file is
// added to content/ except that one directory. Autosave is off before any page
// script runs, and every write request is checked against that slug before it
// is allowed through; anything else is aborted AND recorded, and the recording
// is asserted empty at the end, so the guard is a test rather than a hope.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4399;
const baseUrl = `http://127.0.0.1:${port}`;
const root = process.cwd();
const slug = "canvas-lifecycle-probe";
const boardDir = path.join(root, "content", "boards", slug);
const boardPath = path.join(boardDir, "current.canvas");
const pageUrl = `${baseUrl}/content/boards/test-board.html`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview server did not start")), 15000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) { clearTimeout(timer); resolve(); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`preview server exited early, code ${code}`)); });
  });
}

// What is actually on disk, minus the board's own file.
const sidecars = async () =>
  (await readdir(boardDir)).filter((f) => f.endsWith(".canvas") && f !== "current.canvas").sort();

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

// What the board says it points at. Read out of the file the board wrote, not
// out of the page: a reference that only exists in a browser's memory is not a
// reference that survives closing the tab.
const referencedSidecars = async () => {
  const board = await readJson(boardPath);
  return board.nodes
    .filter((n) => n.type === "board-preview" && n.canvasPath)
    .map((n) => String(n.canvasPath).split("/").pop())
    .sort();
};

// Files this test plants and never references. They are the control group: the
// cheap version of this fix is to sweep unreferenced sidecars on load, and this
// is what that would destroy.
const BYSTANDER_WITH_WORK = "bystander-with-work.canvas";
const BYSTANDER_EMPTY = "bystander-empty.canvas";
const bystanderWithWork = {
  canvasId: "bystander-1",
  nodes: [{ id: "keep-1", type: "text", x: 0, y: 0, width: 200, height: 100, text: "someone's work" }],
  edges: []
};
const bystanderEmpty = { canvasId: "bystander-2", nodes: [], edges: [] };

await rm(boardDir, { recursive: true, force: true });
await mkdir(boardDir, { recursive: true });
await writeFile(boardPath, `${JSON.stringify({
  canvasId: "canvas-lifecycle-probe-board",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  nodes: [{ id: "anchor-text", type: "text", x: 0, y: 0, width: 220, height: 120, text: "probe board" }],
  edges: []
}, null, 2)}\n`, "utf8");
await writeFile(path.join(boardDir, BYSTANDER_WITH_WORK), `${JSON.stringify(bystanderWithWork, null, 2)}\n`, "utf8");
await writeFile(path.join(boardDir, BYSTANDER_EMPTY), `${JSON.stringify(bystanderEmpty, null, 2)}\n`, "utf8");

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
try {
  await waitForServer(child);

  // -----------------------------------------------------------------------
  // 0. The route the fix depends on, and what it refuses. No browser needed.
  //    A route that can delete files is the part of this change that has to be
  //    wrong-proof, so it is checked before anything else runs.
  // -----------------------------------------------------------------------
  const del = async (p) => {
    const res = await fetch(`${baseUrl}/api/delete-canvas?slug=${slug}&path=${encodeURIComponent(p)}`, { method: "POST" });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const inBoardDir = (name) => `content/boards/${slug}/${name}`;

  const refusals = {
    "the board's own current.canvas": await del(inBoardDir("current.canvas")),
    "a sidecar with a node in it": await del(inBoardDir(BYSTANDER_WITH_WORK)),
    "a .canvas outside the board's directory": await del("content/boards/cosmoboard/current.canvas"),
    "a traversal out of the board's directory": await del(`content/boards/${slug}/../../../package.json`),
    "a file that is not a .canvas": await del(inBoardDir("notes.md")),
    "no path at all": await del("")
  };
  for (const [what, result] of Object.entries(refusals)) {
    assert.ok(result.status === 403 || result.status === 409,
      `0: deleting ${what} must be refused, got ${result.status} ${JSON.stringify(result.body)}`);
    assert.equal(result.body?.deleted, false, `0: ${what} must report nothing deleted`);
  }
  assert.deepEqual(await sidecars(), [BYSTANDER_EMPTY, BYSTANDER_WITH_WORK],
    "0: every refusal above left the directory exactly as it was");
  // The cosmoboard's own file is the one those refusals were protecting.
  await readJson(path.join(root, "content", "boards", "cosmoboard", "current.canvas"));

  // -----------------------------------------------------------------------
  // 0b. Four creations in flight at once, which is what a fast hand on the
  //     canvas tool produces. Four canvases must mean four files.
  //
  //     Driven at the API rather than the keyboard because that is the only
  //     way to make it deterministic: Playwright's key presses are far enough
  //     apart that they usually miss the window, and "usually" is how this got
  //     to production. The filenames the runtime generates carry a
  //     second-resolution timestamp, so four created in one second all ask for
  //     the same name and the server is what has to tell them apart. When it
  //     did not, four nodes pointed at one file and three canvases were gone
  //     the moment they were made.
  // -----------------------------------------------------------------------
  const concurrentName = "canvas-2026-08-02_11-11-11.canvas";
  const concurrent = await Promise.all(Array.from({ length: 4 }, (unused, i) =>
    fetch(`${baseUrl}/api/save-board?slug=${slug}&filename=${concurrentName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasId: `concurrent-${i}`, nodes: [], edges: [] })
    }).then((res) => res.json())));

  const concurrentUrls = concurrent.map((r) => r.url);
  assert.equal(new Set(concurrentUrls).size, 4,
    `0b: four canvases created at once must get four different files, got ${JSON.stringify(concurrentUrls)}`);
  const concurrentIds = new Set();
  for (const url of concurrentUrls) {
    concurrentIds.add((await readJson(path.join(root, url.replace(/^\//, "")))).canvasId);
  }
  assert.equal(concurrentIds.size, 4,
    `0b: and all four identities must survive on disk, found ${JSON.stringify([...concurrentIds])}`);

  for (const url of concurrentUrls) {
    const gone = await del(url.replace(/^\//, ""));
    assert.equal(gone.body?.deleted, true, `0b: cleanup of ${url} failed: ${JSON.stringify(gone)}`);
  }
  assert.deepEqual(await sidecars(), [BYSTANDER_EMPTY, BYSTANDER_WITH_WORK],
    "0b: and the four empty canvases can be removed again, leaving the directory as it was");

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message)));
  const refusedWrites = [];

  // Serve the real board page, re-pointed at this test's own board. Nothing is
  // written into content/ to make this run except the probe directory itself.
  // The three replacements are counted: if the page template stops carrying one
  // of these attributes, this goes red instead of quietly driving test-board.
  //
  // When staticHost is on, X-Cosmoboard-Server is stripped from the response,
  // which is exactly what the runtime probes for with a HEAD of its own page.
  // That is how case J puts the board on a host with no write API at all.
  let staticHost = false;
  await page.route(pageUrl, async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["content-length"];
    if (staticHost) delete headers["x-cosmoboard-server"];
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: response.status(), headers, body: "" });
    }
    const original = await response.text();
    const body = original
      .replace('data-board-slug="test-board"', `data-board-slug="${slug}"`)
      .replace('data-board-source="test-board/current.canvas"', `data-board-source="${slug}/current.canvas"`)
      .replace('data-board-storage-key="board:test-board"', `data-board-storage-key="board:${slug}"`);
    assert.equal(body.split(slug).length - 1, 3,
      "the board page template must still carry the slug, source and storage-key attributes this test rewrites");
    await route.fulfill({ status: response.status(), headers, body });
  });

  // Any write that is not aimed at this test's own board is aborted and
  // remembered. Asserted empty at the end, so this is evidence and not just a
  // safety net.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const isWrite = route.request().method() !== "GET";
    if (!isWrite) return route.fallback();
    const target = url.searchParams.get("path") || "";
    const wrongBoard = url.searchParams.get("slug") !== slug;
    const wrongPath = target && !target.startsWith(`content/boards/${slug}/`);
    if (wrongBoard || wrongPath) {
      refusedWrites.push(`${route.request().method()} ${url.pathname}${url.search}`);
      return route.abort();
    }
    return route.fallback();
  });

  await page.addInitScript((boardSlug) => {
    if (window.top !== window) return;
    // Autosave off before any page script runs, and no stale draft from an
    // earlier run of this suite.
    localStorage.setItem(`board:${boardSlug}:settings`,
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false }));
    localStorage.removeItem(`board:${boardSlug}`);
  }, slug);

  const openBoard = async () => {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#braindump-viewport", { timeout: 15000 });
    await page.waitForTimeout(900);
  };

  const canvasNodesOnBoard = () =>
    page.evaluate(() => document.querySelectorAll(".bd-item.bd-layer-board-preview").length);

  // Ctrl+S, which this runtime routes to saveBoard(). The board file is how the
  // page tells the filesystem what it still references.
  const saveBoardToDisk = async () => {
    const before = (await readJson(boardPath)).updatedAt;
    await page.keyboard.press("Control+s");
    for (let i = 0; i < 60 && (await readJson(boardPath)).updatedAt === before; i++) {
      await page.waitForTimeout(100);
    }
    assert.notEqual((await readJson(boardPath)).updatedAt, before, "the board did not save to disk");
  };

  // The canvas tool, via its shortcut. The toolbar folds, rearranges and hides
  // buttons behind a menu; the key does not.
  const pressCanvasShortcut = async () => { await page.keyboard.press("c"); };

  const waitForSidecarCount = async (expected, label) => {
    for (let i = 0; i < 60; i++) {
      if ((await sidecars()).length === expected) return;
      await page.waitForTimeout(100);
    }
    assert.equal((await sidecars()).length, expected, label);
  };

  await openBoard();
  // The keyboard shortcut spawns at the pointer, so put the pointer over empty
  // board. x must clear 232px: the site's left nav is painted over the board.
  await page.mouse.move(760, 520);
  await page.mouse.click(760, 520);
  await page.waitForTimeout(150);

  assert.deepEqual(await sidecars(), [BYSTANDER_EMPTY, BYSTANDER_WITH_WORK],
    "A: loading the board created and removed nothing");

  // -----------------------------------------------------------------------
  // A. One canvas: one file, and the board points at it.
  // -----------------------------------------------------------------------
  await pressCanvasShortcut();
  await waitForSidecarCount(3, "A: one canvas creates exactly one file");
  const createdFile = (await sidecars()).find((f) => f.startsWith("canvas-"));
  assert.ok(createdFile, `A: the new file is named like a canvas, got ${JSON.stringify(await sidecars())}`);
  const createdState = await readJson(path.join(boardDir, createdFile));
  assert.deepEqual(createdState.nodes, [], "A: a new canvas starts empty");
  assert.ok(createdState.canvasId, "A: and carries an id");
  assert.equal(await canvasNodesOnBoard(), 1, "A: the canvas is on the board as one node");

  await saveBoardToDisk();
  assert.deepEqual(await referencedSidecars(), [createdFile],
    "A: the board file points at the file that was just created");

  // -----------------------------------------------------------------------
  // B. Ctrl+Z. The headline: the node goes and the file must go with it.
  // -----------------------------------------------------------------------
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(600);
  assert.equal(await canvasNodesOnBoard(), 0, "B: undo takes the canvas off the board");

  await waitForSidecarCount(2, "B: undo must take the file it created with it");
  assert.deepEqual(await sidecars(), [BYSTANDER_EMPTY, BYSTANDER_WITH_WORK],
    `B: after undo the only .canvas files left are the ones this test planted, found ${JSON.stringify(await sidecars())}`);

  await saveBoardToDisk();
  assert.deepEqual(await referencedSidecars(), [],
    "B: and the board no longer references anything");

  // -----------------------------------------------------------------------
  // C. Redo. Undo must not be a one-way door: the file comes back with the
  //    node, or redo hands back a node pointing at nothing.
  // -----------------------------------------------------------------------
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(600);
  assert.equal(await canvasNodesOnBoard(), 1, "C: redo puts the canvas back on the board");
  await waitForSidecarCount(3, "C: redo puts its file back too");

  await saveBoardToDisk();
  const afterRedoReferenced = await referencedSidecars();
  assert.deepEqual(afterRedoReferenced, [createdFile], "C: pointing at the same file it did before");
  const afterRedoState = await readJson(path.join(boardDir, createdFile));
  assert.equal(afterRedoState.canvasId, createdState.canvasId,
    "C: and the file that came back has the identity the node still stores");

  // Back to a clean board for the next case.
  await page.keyboard.press("Control+z");
  await waitForSidecarCount(2, "C: undone again");

  // -----------------------------------------------------------------------
  // D. Four canvases as fast as the keyboard sends them. Four files, four
  //    references, no orphans, no two nodes sharing one file.
  //
  //    The pointer moves between presses only so the four nodes land apart
  //    and can be clicked individually in E and F. The presses themselves are
  //    back to back, and the runtime does not wait for one file to be written
  //    before asking for the next.
  // -----------------------------------------------------------------------
  const spots = [[460, 250], [1010, 250], [460, 620], [1010, 620]];
  for (const [x, y] of spots) {
    await page.mouse.move(x, y);
    await page.keyboard.press("c");
  }
  await waitForSidecarCount(6, "D: four rapid creations write four files");
  await page.waitForTimeout(400);
  assert.equal(await canvasNodesOnBoard(), 4, "D: and put four nodes on the board");

  await saveBoardToDisk();
  const rapidFiles = (await sidecars()).filter((f) => f.startsWith("canvas-"));
  const rapidReferenced = await referencedSidecars();
  assert.equal(rapidFiles.length, 4, `D: exactly four files, got ${JSON.stringify(rapidFiles)}`);
  assert.equal(new Set(rapidReferenced).size, 4,
    `D: four different files are referenced, so no two nodes share one canvas, got ${JSON.stringify(rapidReferenced)}`);
  assert.deepEqual(rapidReferenced.slice().sort(), rapidFiles.slice().sort(),
    "D: every file is referenced and every reference resolves");

  const rapidIds = new Set();
  for (const file of rapidFiles) rapidIds.add((await readJson(path.join(boardDir, file))).canvasId);
  assert.equal(rapidIds.size, 4, "D: and each has its own identity");

  // Which node on the board owns which file, read out of the board file the
  // runtime just wrote. Not the node title: the server uniquifies a colliding
  // filename, so the third canvas created in one second is titled canvas-X and
  // stored as canvas-X-3.canvas.
  const nodeIdForFile = async (file) => {
    const board = await readJson(boardPath);
    const node = board.nodes.find((n) => n.type === "board-preview" && String(n.canvasPath || "").endsWith(`/${file}`));
    assert.ok(node, `no node in the board file points at ${file}`);
    return node.id;
  };
  const clickNodeById = async (nodeId) => {
    const box = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      // Top-left of the card: the title strip. The middle carries the preview
      // and the "Open canvas" button.
      return { x: Math.round(rect.x + 30), y: Math.round(rect.y + 10) };
    }, nodeId);
    assert.ok(box, `node ${nodeId} is not on the board`);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(200);
  };

  // -----------------------------------------------------------------------
  // E. A canvas somebody has written into. Deleting its node must not delete
  //    the work. This is the case that stops "fix the orphans" from becoming
  //    "delete the canvases".
  // -----------------------------------------------------------------------
  const workedFile = rapidFiles[0];
  const workedPath = path.join(boardDir, workedFile);
  const workedNodeId = await nodeIdForFile(workedFile);
  const workedState = await readJson(workedPath);
  workedState.nodes = [{ id: "inside-1", type: "text", x: 40, y: 40, width: 200, height: 120, text: "written inside" }];
  await writeFile(workedPath, `${JSON.stringify(workedState, null, 2)}\n`, "utf8");

  await clickNodeById(workedNodeId);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(800);

  assert.equal(await canvasNodesOnBoard(), 3, "E: the node is gone from the board");
  assert.ok((await sidecars()).includes(workedFile),
    `E: a canvas with work in it survives its node being deleted, ${workedFile} was removed`);
  assert.equal((await readJson(workedPath)).nodes.length, 1,
    "E: and still has what was written into it");

  // Undo the delete. The node comes back; the file must not be reset to empty
  // on the way.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  assert.equal(await canvasNodesOnBoard(), 4, "E: undo brings the node back");
  assert.equal((await readJson(workedPath)).nodes.length, 1,
    "E: and restoring a node must not overwrite the canvas it points at with an empty one");
  assert.equal((await readJson(workedPath)).nodes[0].text, "written inside");

  // -----------------------------------------------------------------------
  // F. Delete the other three, whose canvases are empty. Those files go.
  // -----------------------------------------------------------------------
  for (const file of rapidFiles.filter((f) => f !== workedFile)) {
    await clickNodeById(await nodeIdForFile(file));
    await page.keyboard.press("Delete");
    await page.waitForTimeout(600);
  }
  await waitForSidecarCount(3, "F: deleting three empty canvases removes their three files");
  assert.equal(await canvasNodesOnBoard(), 1, "F: one canvas node is left on the board");

  await saveBoardToDisk();
  assert.deepEqual(await referencedSidecars(), [workedFile],
    "F: one canvas node left, and it is the one with work in it");
  assert.deepEqual(await sidecars(), [BYSTANDER_EMPTY, BYSTANDER_WITH_WORK, workedFile].sort(),
    "F: the directory holds exactly the referenced canvas and the two bystanders");

  // -----------------------------------------------------------------------
  // H. Alt-drag copies a canvas node, and the copy points at the SAME file.
  //    Undoing the copy must not take that file, because the original is
  //    still on the board and still needs it. The file here is empty, so
  //    nothing else stands between it and deletion: the server would allow
  //    this one.
  // -----------------------------------------------------------------------
  await page.mouse.move(760, 520);
  await page.keyboard.press("c");
  await waitForSidecarCount(4, "H: a fresh empty canvas to copy");
  const sharedFile = (await sidecars()).find((f) => f.startsWith("canvas-") && f !== workedFile);
  assert.ok(sharedFile, "H: the fresh canvas is on disk");
  assert.deepEqual((await readJson(path.join(boardDir, sharedFile))).nodes, [], "H: and it is empty");

  await saveBoardToDisk();
  const sharedNodeId = await nodeIdForFile(sharedFile);
  const grab = await page.evaluate((id) => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return { x: Math.round(rect.x + 30), y: Math.round(rect.y + 10) };
  }, sharedNodeId);

  await page.mouse.click(grab.x, grab.y);
  await page.waitForTimeout(150);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 260, grab.y + 90, { steps: 10 });
  await page.keyboard.down("Alt");
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.waitForTimeout(400);
  assert.equal(await canvasNodesOnBoard(), 3, "H: alt-drag leaves a copy of the canvas node behind");
  assert.equal((await sidecars()).length, 4, "H: copying a node writes no new file");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(900);
  assert.equal(await canvasNodesOnBoard(), 2, "H: undo removes the copy");
  assert.ok((await sidecars()).includes(sharedFile),
    `H: the original still points at ${sharedFile}, so undoing the copy must not delete it`);

  // -----------------------------------------------------------------------
  // G. The bystanders. Nobody referenced these for the whole session, one of
  //    them is empty, and both are still here. A sweep of unreferenced
  //    sidecars on load would have taken them, silently.
  // -----------------------------------------------------------------------
  await openBoard();
  await page.waitForTimeout(1200);
  assert.deepEqual(await readJson(path.join(boardDir, BYSTANDER_WITH_WORK)), bystanderWithWork,
    "G: an unreferenced canvas with work in it is byte-for-byte untouched");
  assert.deepEqual(await readJson(path.join(boardDir, BYSTANDER_EMPTY)), bystanderEmpty,
    "G: and an unreferenced EMPTY canvas is untouched too, because nothing sweeps this directory");
  assert.ok((await sidecars()).includes(workedFile), "G: and the referenced canvas is still there after a reload");

  // -----------------------------------------------------------------------
  // J. The same board on a host with no write API: evrenucar.com on GitHub
  //    Pages. There is no server to delete anything, so the runtime must not
  //    ask, and the file must simply stay where the repository put it. A
  //    request here would be a 405 in the visitor's console on every undo.
  // -----------------------------------------------------------------------
  const deleteRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/delete-canvas")) deleteRequests.push(request.url());
  });
  staticHost = true;
  await openBoard();
  await page.waitForTimeout(1500);

  await clickNodeById(await nodeIdForFile(sharedFile));
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1200);
  assert.equal(await canvasNodesOnBoard(), 1, "J: the node still comes off the board");
  assert.deepEqual(deleteRequests, [],
    "J: a host with no write endpoint must not be sent a delete request at all");
  assert.ok((await sidecars()).includes(sharedFile),
    `J: and ${sharedFile} is untouched, because on a static host the file is the repository's`);

  assert.deepEqual(refusedWrites, [], "no request tried to write outside this test's own board");
  assert.deepEqual(pageErrors, [], "no uncaught page errors anywhere in this run");

  console.log("canvas-file-lifecycle: all cases passed");
} finally {
  if (browser) await browser.close();
  child.kill();
  try {
    await rm(boardDir, { recursive: true, force: true });
  } catch (error) {
    console.error("cleanup failed:", error.message);
  }
}
