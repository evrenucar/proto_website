// Markdown download modes: base64 embedded, zip bundle, markdown only.
//
// From the tracker: "Lets have a option to embed the images and other assets
// that are small enough into markdow via embedding them in BASE 64. Maybe for
// now can ask after you click the download icon... Also when embedding base-64
// it would be ideal if in markdown its formatted as a reference: Where the
// image is: ![Growth Chart][chart-1] (at the bototm of the file: [chart-1]:
// data:image/png;base64,iVBORw0KGgo..."
//
// Everything below asserts the file that lands on disk, never the mechanism
// that put it there. No case checks that a handler fired, that a promise
// resolved, or that a fetch happened: each one opens the downloaded bytes and
// reads them. The base64 case decodes the definition back to bytes and
// compares them to the PNG the server actually served, so an export that wrote
// a plausible-looking but corrupt payload fails here.
//
// Hermetic: the board's nodes are injected by intercepting the canvas request,
// autosave is off before any page script runs, and /api/save-board is refused,
// so nothing under content/ is touched either way.
//
// Cases
//   A  no stored setting: the download arrow prompts instead of assuming
//   B  base64: ONE .md, reference style at the point of use, definitions at
//      the bottom, and the base64 decodes back to the original PNG bytes
//   C  base64 leaves what it cannot carry alone: an asset over the size
//      threshold, a remote URL, and an unsafe scheme all stay as written
//   D  markdown only: one .md, no data: URI anywhere, note text intact
//   E  zip: still the zip it produced before this card, .md plus images/
//   F  the setting persists across a reload and skips the prompt
//   G  "remember this choice" in the prompt writes the same setting

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

import { chromium } from "playwright";

const port = 4258;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const faviconPath = path.join(process.cwd(), "favicon", "favicon-96x96.png");

// Matches MARKDOWN_BASE64_MAX_BYTES in braindump.js. The probe below sits well
// clear of it on both sides so this test does not become a threshold test.
const BASE64_MAX_BYTES = 512 * 1024;

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

// Minimal reader over the local file headers, enough to name the entries and
// pull their bytes back out. fflate writes deflate; stored entries are copied.
function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function readDownload(download) {
  const filePath = await download.path();
  assert.ok(filePath, "download produced no file on disk");
  return { name: download.suggestedFilename(), bytes: await readFile(filePath) };
}

const faviconBytes = await readFile(faviconPath);
assert.ok(faviconBytes.length < BASE64_MAX_BYTES, "probe PNG must sit under the embed threshold");
// Fixed byte, so a truncated or re-encoded copy is obvious rather than subtle.
const oversizeBytes = Buffer.alloc(Math.round(BASE64_MAX_BYTES * 1.2), 0x5a);

const richMarkdown = [
  "# Base64 probe",
  "",
  "The chart the request asked for:",
  "",
  "![Growth Chart](/favicon/favicon-96x96.png)",
  "",
  "Too big to carry:",
  "",
  "![Too big](/content/assets/oversize-probe.png)",
  "",
  "Remote image stays remote: ![Remote](https://example.invalid/remote.png)",
  "",
  "![Unsafe](javascript:alert(1))",
  ""
].join("\n");

const simpleMarkdown = ["# Zip probe", "", "![Icon](/favicon/favicon-96x96.png)", ""].join("\n");

const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [
    {
      id: "md-rich",
      type: "markdown",
      x: 120,
      y: 120,
      width: 460,
      height: 380,
      title: "base64-probe",
      markdownId: "md-base64-probe",
      _rawMarkdown: richMarkdown
    },
    {
      id: "md-simple",
      type: "markdown",
      x: 640,
      y: 120,
      width: 420,
      height: 300,
      title: "zip-probe",
      markdownId: "md-zip-probe",
      _rawMarkdown: simpleMarkdown
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, z: 1 }
};

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
const failures = [];
const record = (label, fn) => {
  try {
    fn();
    console.log(`ok   ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`FAIL ${label}: ${error.message}`);
  }
};

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });

  // No markdownDownloadMode key is written here on purpose: case A is about
  // what a board with nothing stored does. This merges rather than overwrites
  // so the reload in case F is a real reload of a real stored setting, not one
  // this script quietly puts back.
  await context.addInitScript(() => {
    if (window.top !== window) return;
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem("board:test-board:settings") || "{}") || {};
    } catch {
      stored = {};
    }
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ ...stored, autosaveEnabled: false, autosaveSeconds: 20, devMode: false })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });

  const page = await context.newPage();
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/content/assets/oversize-probe.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: oversizeBytes }));

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#md-rich .bd-markdown-download-btn").waitFor({ timeout: 20000 });

  const promptModal = page.locator('[data-board-ui="md-download-modal"]');
  const chooseMode = async (mode) => {
    const download = page.waitForEvent("download", { timeout: 15000 });
    await promptModal.locator(`[data-md-download-mode="${mode}"]`).click();
    return readDownload(await download);
  };

  // -------------------------------------------------------------------------
  // A. Nothing stored: the arrow asks, and nothing lands on disk until it is
  //    answered. This is the shipped default the card is explicit about.
  // -------------------------------------------------------------------------
  let stray = null;
  const catchStray = (download) => { stray = download; };
  page.on("download", catchStray);

  await page.locator("#md-rich .bd-markdown-download-btn").click();
  await promptModal.waitFor({ state: "visible", timeout: 8000 });
  await page.waitForTimeout(1200);
  page.off("download", catchStray);

  record("A default with nothing stored prompts", () => {
    assert.equal(stray, null, "a file was downloaded before the mode was picked");
  });
  for (const mode of ["base64", "zip", "plain"]) {
    const count = await promptModal.locator(`[data-md-download-mode="${mode}"]`).count();
    record(`A prompt offers ${mode}`, () => assert.equal(count, 1));
  }

  // -------------------------------------------------------------------------
  // B. base64: one .md, reference style, definitions at the bottom, and the
  //    payload decodes back to the exact bytes the server served.
  // -------------------------------------------------------------------------
  const embedded = await chooseMode("base64");
  const embeddedText = embedded.bytes.toString("utf8");

  record("B base64 produces a single .md, not a zip", () => {
    assert.ok(embedded.name.endsWith(".md"), `expected a .md, got ${embedded.name}`);
    assert.ok(!embedded.name.endsWith(".zip"), `expected a .md, got ${embedded.name}`);
  });

  record("B point of use is reference style with the alt text kept", () => {
    assert.ok(
      embeddedText.includes("![Growth Chart][favicon-96x96-1]"),
      `no reference-style image tag in:\n${embeddedText.slice(0, 400)}`
    );
    assert.ok(
      !embeddedText.includes("![Growth Chart](data:"),
      "the data URI was inlined into the image tag instead of referenced"
    );
    assert.ok(
      !embeddedText.includes("![Growth Chart](/favicon/favicon-96x96.png)"),
      "the original path survived next to the reference"
    );
  });

  const definitionMatch = /^\[favicon-96x96-1\]: data:image\/png;base64,([A-Za-z0-9+/=]+)$/m.exec(embeddedText);
  record("B definition sits at the bottom of the file", () => {
    assert.ok(definitionMatch, "no `[label]: data:image/png;base64,...` definition line");
    assert.ok(
      embeddedText.indexOf("[favicon-96x96-1]: data:") > embeddedText.indexOf("![Growth Chart]"),
      "the definition is above the point of use, not at the bottom"
    );
    const tail = embeddedText.trimEnd().split("\n").pop();
    assert.ok(tail.startsWith("[favicon-96x96-1]: data:"), `last line of the file is ${JSON.stringify(tail)}`);
  });

  record("B the base64 decodes back to the original image bytes", () => {
    assert.ok(definitionMatch, "no definition to decode");
    const decoded = Buffer.from(definitionMatch[1], "base64");
    assert.equal(decoded.length, faviconBytes.length, "decoded length differs from the served PNG");
    assert.ok(decoded.equals(faviconBytes), "decoded bytes differ from the served PNG");
    assert.equal(decoded.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "decoded payload is not a PNG");
  });

  record("B frontmatter still opens the file", () => {
    assert.ok(embeddedText.startsWith("---\n"), `file does not start with frontmatter:\n${embeddedText.slice(0, 120)}`);
    assert.ok(/^id: /m.test(embeddedText), "frontmatter lost its id");
  });

  // -------------------------------------------------------------------------
  // C. What base64 refuses to carry stays exactly as the note wrote it.
  // -------------------------------------------------------------------------
  record("C an oversize asset keeps its path and gets no definition", () => {
    assert.ok(
      embeddedText.includes("![Too big](/content/assets/oversize-probe.png)"),
      "the oversize image ref was rewritten"
    );
    assert.ok(!/^\[oversize-probe-\d\]: data:/m.test(embeddedText), "the oversize image was embedded anyway");
  });

  record("C a remote URL is left alone", () => {
    assert.ok(
      embeddedText.includes("![Remote](https://example.invalid/remote.png)"),
      "the remote image ref was rewritten"
    );
  });

  record("C an unsafe scheme is left alone and never becomes a definition", () => {
    assert.ok(embeddedText.includes("![Unsafe](javascript:alert(1))"), "the javascript: ref was rewritten");
    assert.ok(!/data:.*javascript/i.test(embeddedText), "a javascript: ref reached a definition line");
  });

  const unsafeIsImage = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll("#md-rich .bd-md-line"));
    const line = lines.find((el) => el.textContent.includes("Unsafe"));
    return Boolean(line?.querySelector("img"));
  });
  record("C an unsafe scheme still refuses to render as an image", () => {
    assert.equal(unsafeIsImage, false, "javascript: rendered as an <img>");
  });

  // -------------------------------------------------------------------------
  // D. Markdown only.
  // -------------------------------------------------------------------------
  await page.locator("#md-rich .bd-markdown-download-btn").click();
  await promptModal.waitFor({ state: "visible", timeout: 8000 });
  const plain = await chooseMode("plain");
  const plainText = plain.bytes.toString("utf8");

  record("D markdown only produces a single .md", () => {
    assert.ok(plain.name.endsWith(".md"), `expected a .md, got ${plain.name}`);
  });
  record("D markdown only carries no asset and no data URI", () => {
    assert.ok(!plainText.includes("base64,"), "a base64 payload reached the markdown-only download");
    assert.ok(!/\]: data:/.test(plainText), "a reference definition reached the markdown-only download");
  });
  record("D markdown only keeps the note's own text intact", () => {
    assert.ok(
      plainText.includes("![Growth Chart](/favicon/favicon-96x96.png)"),
      "the image line was deleted; without-assets means without the bytes, not without the writing"
    );
    assert.ok(plainText.startsWith("---\n"), "frontmatter was dropped");
  });

  // -------------------------------------------------------------------------
  // E. Zip: unchanged from what this repo shipped before the card.
  // -------------------------------------------------------------------------
  await page.locator("#md-simple .bd-markdown-download-btn").click();
  await promptModal.waitFor({ state: "visible", timeout: 8000 });
  const zipped = await chooseMode("zip");

  record("E zip mode still produces a zip", () => {
    assert.ok(zipped.name.endsWith(".zip"), `expected a .zip, got ${zipped.name}`);
    assert.equal(zipped.bytes.subarray(0, 4).toString("hex"), "504b0304", "not a zip archive");
  });

  const zipEntries = readZipEntries(zipped.bytes);
  record("E the zip carries the image bytes and the rewritten markdown", () => {
    const imageEntry = zipEntries.get("images/favicon-96x96.png");
    assert.ok(imageEntry, `no images/ entry; got ${[...zipEntries.keys()].join(", ")}`);
    assert.ok(imageEntry.equals(faviconBytes), "the bundled image differs from the served PNG");
    const mdName = [...zipEntries.keys()].find((name) => name.endsWith(".md"));
    assert.ok(mdName, "no .md entry in the zip");
    const mdText = zipEntries.get(mdName).toString("utf8");
    assert.ok(mdText.includes("![Icon](images/favicon-96x96.png)"), `ref not rewritten:\n${mdText}`);
    assert.ok(!mdText.includes("base64,"), "the zip's markdown embedded the image as well");
  });

  // -------------------------------------------------------------------------
  // F. The setting picks the default, and survives a reload.
  // -------------------------------------------------------------------------
  await page.locator("[data-tool='more']").click();
  await page.locator(".braindump-toolbar-actions.is-open [data-tool='settings']").click();
  const modeSelect = page.locator('[data-board-ui="settings-panel"] select[id^="braindump-setting-md-download"]');
  await modeSelect.waitFor({ state: "visible", timeout: 8000 });

  const optionValues = await modeSelect.locator("option").evaluateAll((options) => options.map((o) => o.value));
  record("F the settings panel offers ask plus the three modes", () => {
    assert.deepEqual(optionValues, ["ask", "base64", "zip", "plain"]);
  });
  const defaultValue = await modeSelect.inputValue();
  record("F the stored default starts at ask", () => assert.equal(defaultValue, "ask"));

  await modeSelect.selectOption("plain");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#md-rich .bd-markdown-download-btn").waitFor({ timeout: 20000 });

  await page.locator("[data-tool='more']").click();
  await page.locator(".braindump-toolbar-actions.is-open [data-tool='settings']").click();
  await modeSelect.waitFor({ state: "visible", timeout: 8000 });
  const afterReload = await modeSelect.inputValue();
  record("F the setting survives a reload", () => assert.equal(afterReload, "plain"));

  await page.keyboard.press("Escape");
  const directDownloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.locator("#md-rich .bd-markdown-download-btn").click();
  const direct = await readDownload(await directDownloadPromise);
  const promptVisibleAfterSetting = await promptModal.isVisible();

  record("F a stored mode downloads without prompting", () => {
    assert.equal(promptVisibleAfterSetting, false, "the prompt appeared even though a mode is stored");
    assert.ok(direct.name.endsWith(".md"), `expected a .md, got ${direct.name}`);
    assert.ok(!direct.bytes.toString("utf8").includes("base64,"), "the stored plain mode embedded assets anyway");
  });

  // -------------------------------------------------------------------------
  // G. "Remember this choice" writes the same setting the panel does.
  // -------------------------------------------------------------------------
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("board:test-board:settings") || "{}");
    raw.markdownDownloadMode = "ask";
    localStorage.setItem("board:test-board:settings", JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#md-rich .bd-markdown-download-btn").waitFor({ timeout: 20000 });

  await page.locator("#md-rich .bd-markdown-download-btn").click();
  await promptModal.waitFor({ state: "visible", timeout: 8000 });
  await promptModal.locator("#braindump-md-download-remember").check();
  const rememberedDownload = page.waitForEvent("download", { timeout: 15000 });
  await promptModal.locator('[data-md-download-mode="base64"]').click();
  await rememberedDownload;

  const storedMode = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("board:test-board:settings") || "{}").markdownDownloadMode);
  record("G remember writes the picked mode to the setting", () => {
    assert.equal(storedMode, "base64");
  });

  record("no page errors", () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser?.close();
  child.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("\nmarkdown-base64-embedding: all cases passed");
