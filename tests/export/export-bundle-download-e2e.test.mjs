// The .zip a visitor downloads has to contain the board and everything it
// points at.
//
// Written for the test-audit card ("tests should assert outcomes, not
// mechanisms"). Before this file the bundle export was guarded by
// tests/export/export-bundling-runtime.test.mjs, which is five regular
// expressions run against the text of JavaScript/braindump.js. Nothing anywhere
// clicked "Export .zip". Measured 2026-08-01: put `return;` on the line after
// exportProjectBundle's `closeExportModal()` and the whole export tree stays
// green (export-bundling-runtime, export-bundling-e2e, export-size-subpages-e2e)
// while the button downloads nothing at all. export-bundling-e2e opens the
// modal, screenshots it, and clicks Cancel; the rest of that file is the import
// half.
//
// So this asserts the artefact, not the code that makes it: a real click, a real
// download, the bytes read back off disk, unzipped in Node, and one invariant
// that no single-string check can fake -- every path inside board.canvas has to
// resolve to an entry that is actually in the archive. A bundle whose canvas
// points at files it did not carry is exactly the "sent a suggestion and it was
// useless on the other end" failure the download / upload / commit route exists
// to avoid.
//
// Hermetic: the board's nodes are injected by intercepting the canvas request,
// autosave is off before any page script runs and /api/save-board is refused, so
// nothing under content/ is written in either direction. The two payloads the
// bundle has to collect are real files this same preview server serves.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { chromium } from "playwright";

const port = 4246;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(process.cwd(), ".tmp", "export-bundle-download-e2e");
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");

// The two things the bundle has to go and fetch, as they sit in the repo.
const NOTE_SOURCE = "content/boards/test-board/notes.md";
const BOARD_SOURCE = "content/boards/cosmoboard/current.canvas";

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

// Minimal ZIP reader: walk the central directory, inflate each entry. fflate
// writes deflate (method 8) and stored (method 0); both are handled. Reading the
// archive rather than trusting a library keeps this test honest about what is
// really on disk.
function readZip(buffer) {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) { eocd = i; break; }
  }
  assert.notEqual(eocd, -1, "the downloaded file is not a zip: no end-of-central-directory record");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, `central directory entry ${i} has a bad signature`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, `local header for ${name} has a bad signature`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  defaultViewport: { x: 0, y: 0, z: 1 },
  nodes: [
    {
      id: "bundle-note", type: "markdown", x: 120, y: 120, width: 360, height: 260,
      file: NOTE_SOURCE, title: "A note the bundle has to carry",
    },
    {
      id: "bundle-board", type: "board-preview", x: 540, y: 120, width: 340, height: 300,
      boardSlug: "cosmoboard", boardSource: BOARD_SOURCE, boardHref: "cosmoboard.html",
      title: "A linked board the bundle has to carry",
    },
    { id: "bundle-text", type: "text", x: 120, y: 460, width: 300, height: 140, text: "Plain node, no payload" },
  ],
  edges: [],
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    // The File System Access API opens a native save dialog that no driver can
    // answer, so the runtime's own fallback download path is the one a test can
    // observe. This is the path every Firefox and Safari visitor gets anyway.
    delete window.showSaveFilePicker;
    delete window.showOpenFilePicker;
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#bundle-note", { timeout: 20000 });

  const openExportModal = async () => {
    await page.keyboard.press("Escape");
    if (!(await page.locator('[data-tool="export"]').isVisible())) {
      await page.click('[data-board-ui="toolbar-more"]');
    }
    await page.click('[data-tool="export"]');
    await page.locator("#braindump-export-modal:not([hidden])").waitFor({ timeout: 5000 });
  };

  // The size estimate is async; the modal is usable before it lands, but waiting
  // keeps the click off a re-rendering button.
  const settleEstimate = () =>
    page.waitForFunction(() => {
      const text = document.querySelector("#braindump-export-size-estimate")?.textContent || "";
      return text && text !== "Calculating...";
    }, null, { timeout: 15000 });

  // ============ A: clicking Export .zip actually downloads a zip ============
  await openExportModal();
  await settleEstimate();
  assert.equal(
    await page.locator("#braindump-export-subpages").isChecked(), true,
    "A: linked boards and notes are included by default"
  );
  const bundleDownload = page.waitForEvent("download", { timeout: 30000 });
  await page.click("#braindump-export-confirm");
  const download = await bundleDownload;
  const savedPath = path.join(outDir, download.suggestedFilename());
  await download.saveAs(savedPath);

  assert.match(download.suggestedFilename(), /\.zip$/, "A: the bundle must be named as a zip");
  const bytes = await readFile(savedPath);
  assert.ok(bytes.length > 512, `A: the bundle is ${bytes.length} bytes, which is not a board`);

  const entries = readZip(bytes);

  // ============ B: the board itself is in there, and parses ============
  assert.ok(entries.has("board.canvas"), `B: the bundle must contain board.canvas, got ${[...entries.keys()]}`);
  const bundled = JSON.parse(entries.get("board.canvas").toString("utf8"));
  assert.deepEqual(
    bundled.nodes.map((node) => node.id).sort(),
    ["bundle-board", "bundle-note", "bundle-text"],
    "B: every node on the board must survive into the bundle"
  );

  // ============ C: the note is carried, byte for byte ============
  const noteNode = bundled.nodes.find((node) => node.id === "bundle-note");
  assert.notEqual(noteNode.file, NOTE_SOURCE,
    "C: the bundled canvas must point inside the bundle, not back at a repo path the recipient does not have");
  assert.ok(entries.has(noteNode.file), `C: board.canvas points at "${noteNode.file}", which is not in the bundle`);
  assert.equal(
    entries.get(noteNode.file).toString("utf8"),
    await readFile(NOTE_SOURCE, "utf8"),
    "C: the bundled note must be the note, byte for byte"
  );

  // ============ D: the linked board is carried, and is still a board ============
  const boardNode = bundled.nodes.find((node) => node.id === "bundle-board");
  assert.notEqual(boardNode.boardSource, BOARD_SOURCE, "D: the linked board must be rewritten to point inside the bundle");
  assert.ok(entries.has(boardNode.boardSource),
    `D: board.canvas points at "${boardNode.boardSource}", which is not in the bundle`);
  const nested = JSON.parse(entries.get(boardNode.boardSource).toString("utf8"));
  assert.ok(Array.isArray(nested.nodes) && nested.nodes.length > 0,
    "D: the carried board must still be a readable canvas with nodes in it");

  // ============ E: nothing in the canvas dangles ============
  // The invariant, and the one a string check cannot fake: any path the bundled
  // canvas rewrote to a bundle-relative location has to exist in the archive.
  const dangling = [];
  for (const node of bundled.nodes) {
    for (const key of ["file", "boardSource", "image"]) {
      const value = node[key];
      if (typeof value !== "string") continue;
      if (!/^(assets|markdown|boards)\//.test(value)) continue;
      if (!entries.has(value)) dangling.push(`${node.id}.${key} -> ${value}`);
    }
  }
  assert.deepEqual(dangling, [], `E: the bundle's canvas points at files it did not carry: ${dangling.join(", ")}`);

  // ============ F: unticking subpages ships the board alone, and says so ============
  // The smaller bundle is a real choice a visitor makes, and it must not leave
  // the canvas pointing at bundle paths that were never written.
  await openExportModal();
  await settleEstimate();
  await page.locator("#braindump-export-subpages").uncheck();
  await settleEstimate();
  const leanDownload = page.waitForEvent("download", { timeout: 30000 });
  await page.click("#braindump-export-confirm");
  const lean = await leanDownload;
  const leanPath = path.join(outDir, `lean-${lean.suggestedFilename()}`);
  await lean.saveAs(leanPath);

  const leanEntries = readZip(await readFile(leanPath));
  assert.deepEqual([...leanEntries.keys()], ["board.canvas"],
    `F: without subpages the bundle is the board alone, got ${[...leanEntries.keys()]}`);
  const leanCanvas = JSON.parse(leanEntries.get("board.canvas").toString("utf8"));
  // The runtime writes repo paths both root-absolute and page-relative; both
  // resolve on the site, so compare without the leading slash, as the build
  // suite does.
  const unrooted = (value) => String(value || "").replace(/^\//, "");
  assert.equal(unrooted(leanCanvas.nodes.find((node) => node.id === "bundle-note").file), NOTE_SOURCE,
    "F: a note left out of the bundle must keep its original path, not a bundle path that is not there");
  assert.equal(unrooted(leanCanvas.nodes.find((node) => node.id === "bundle-board").boardSource), BOARD_SOURCE,
    "F: and so must a linked board");

  assert.deepEqual(pageErrors, [], "the run must produce no page errors");
  console.log(
    `export bundle download: all 6 cases passed ` +
    `(${bytes.length} byte bundle, ${entries.size} entries: ${[...entries.keys()].join(", ")})`
  );
} finally {
  if (browser) await browser.close();
  child.kill();
  await rm(outDir, { recursive: true, force: true });
}
