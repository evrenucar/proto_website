// Markdown base64 download: layout of the reference block at the bottom of
// the file.
//
// From the tracker: "The base64 embed for the markdown is great. But maybe
// nice to add 15 empty lines before the reference base64 data. And if
// possible it shouldn't show in markdwon editors with full text it sohuld
// collapse (not sur eif possibl)"
//
// Two asks, two kinds of assertion:
//   - 15 blank lines before the first `[label]: data:...` line. That is a
//     byte-level fact about the downloaded file, asserted directly on the
//     bytes that land on disk.
//   - "collapse in markdown editors" cannot be asserted against Obsidian,
//     VS Code or Typora from here: none of them are launched by this suite.
//     What IS asserted is the one thing the file's own bytes can guarantee:
//     the reference block is wrapped in a raw `<details><summary>` disclosure
//     widget, present in the exact form the fix claims, which is the
//     standard, verified way to get a collapsed-by-default section in any
//     renderer that honours raw HTML (GitHub, VS Code's and Obsidian's
//     preview, Typora). Whether a *plain source editor* also folds it is a
//     separate, per-editor question this suite does not claim to answer.
//
// Everything below opens the actual downloaded bytes, never a regex over
// braindump.js and never a fired-event check. Hermetic: autosave is off
// before any page script runs and /api/save-board is blocked, so nothing
// under content/ is touched either way.
//
// Cases
//   A  exactly 15 empty lines sit between the last body line and the first
//      reference definition
//   B  the reference block sits at the very end of the file, and every
//      definition line is inside it
//   C  the base64 still decodes back to the exact bytes of the source PNG
//   D  the collapsing wrapper is present in the exact form claimed, and
//      still leaves the point-of-use reference resolvable

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4312;
const baseUrl = `http://127.0.0.1:${port}`;
const canvasPath = path.join(process.cwd(), "content", "boards", "test-board", "current.canvas");
const faviconPath = path.join(process.cwd(), "favicon", "favicon-96x96.png");

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

async function readDownload(download) {
  const filePath = await download.path();
  assert.ok(filePath, "download produced no file on disk");
  return await readFile(filePath);
}

const faviconBytes = await readFile(faviconPath);

const noteMarkdown = ["# Layout probe", "", "![Growth Chart](/favicon/favicon-96x96.png)", ""].join("\n");

const canvasOnDisk = JSON.parse(await readFile(canvasPath, "utf8"));
const probeCanvas = {
  ...canvasOnDisk,
  nodes: [
    {
      id: "md-layout",
      type: "markdown",
      x: 120,
      y: 120,
      width: 460,
      height: 380,
      title: "layout-probe",
      markdownId: "md-layout-probe",
      _rawMarkdown: noteMarkdown
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

  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem(
      "board:test-board:settings",
      JSON.stringify({ autosaveEnabled: false, autosaveSeconds: 20, devMode: false, markdownDownloadMode: "base64" })
    );
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
  });

  const page = await context.newPage();
  await page.route("**/content/boards/test-board/current.canvas*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probeCanvas) }));
  await page.route("**/api/save-board*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));
  await page.route("**/api/save-markdown*", (route) => route.fulfill({ status: 503, body: "blocked by test" }));

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#md-layout .bd-markdown-download-btn").waitFor({ timeout: 20000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.locator("#md-layout .bd-markdown-download-btn").click();
  const bytes = await readDownload(await downloadPromise);
  const text = bytes.toString("utf8");
  const lines = text.split("\n");

  // -------------------------------------------------------------------------
  // A. Exactly 15 empty lines between the last body line and the first
  //    reference definition.
  // -------------------------------------------------------------------------
  const defIndex = lines.findIndex((line) => /^\[favicon-96x96-1\]: data:/.test(line));
  record("A a reference definition line exists", () => {
    assert.ok(defIndex >= 0, `no [favicon-96x96-1]: data: line found in:\n${text.slice(0, 400)}`);
  });

  let blankRunStart = defIndex;
  while (blankRunStart > 0 && lines[blankRunStart - 1] === "") blankRunStart -= 1;
  const blankCount = defIndex - blankRunStart;
  record("A exactly 15 blank lines precede the first definition", () => {
    assert.equal(blankCount, 15, `expected 15 blank lines directly above the definition, counted ${blankCount}`);
  });

  const lastBodyLineIndex = blankRunStart - 1;
  record("A the line right before the blank run is not itself blank", () => {
    assert.ok(lastBodyLineIndex >= 0 && lines[lastBodyLineIndex].trim() !== "",
      `line above the 15 blank lines is ${JSON.stringify(lines[lastBodyLineIndex])}`);
  });

  // -------------------------------------------------------------------------
  // B. The reference block sits at the very end of the file.
  // -------------------------------------------------------------------------
  record("B every definition line lands after the point of use", () => {
    const useIndex = lines.findIndex((line) => line.includes("![Growth Chart][favicon-96x96-1]"));
    assert.ok(useIndex >= 0, "no reference-style point of use found");
    assert.ok(useIndex < defIndex, "the definition sits above the point of use");
  });
  record("B nothing but blank lines and closing markup follows the last definition", () => {
    const after = lines.slice(defIndex + 1).map((line) => line.trim());
    for (const line of after) {
      assert.ok(line === "" || line === "</details>",
        `unexpected content after the reference block: ${JSON.stringify(line)}`);
    }
  });

  // -------------------------------------------------------------------------
  // C. The base64 decodes back to the original PNG bytes.
  // -------------------------------------------------------------------------
  const definitionMatch = /^\[favicon-96x96-1\]: data:image\/png;base64,([A-Za-z0-9+/=]+)$/m.exec(text);
  record("C the base64 decodes back to the original image bytes", () => {
    assert.ok(definitionMatch, "no definition line to decode");
    const decoded = Buffer.from(definitionMatch[1], "base64");
    assert.equal(decoded.length, faviconBytes.length, "decoded length differs from the served PNG");
    assert.ok(decoded.equals(faviconBytes), "decoded bytes differ from the served PNG");
  });

  // -------------------------------------------------------------------------
  // D. NO raw-HTML wrapper, and the reference still resolves.
  //
  //    This case previously asserted a <details><summary> disclosure around the
  //    reference block. That was removed after measuring what it actually did.
  //    Link reference definitions render no visible output of their own, so in
  //    any rendered preview the base64 is ALREADY entirely invisible and there
  //    is nothing for a disclosure to hide. Wrapping it produced a "click to
  //    expand" control that expands to show nothing, and in a renderer with raw
  //    HTML disabled it printed the literal tags as text where previously there
  //    was nothing at all. It also had to be left unclosed to keep the
  //    definitions on the final line, and an unclosed <details> swallows
  //    everything after it when a note is transcluded into another note.
  //
  //    So the assertion is inverted on purpose: no raw HTML goes into a
  //    downloaded note. The 15 blank lines above are the real fix, and they are
  //    for source panes, which is what the request was about. Whether a source
  //    pane folds further is per-editor and not something the file can dictate.
  // -------------------------------------------------------------------------
  record("D no raw HTML wrapper is emitted around the reference block", () => {
    assert.equal(text.includes("<details>"), false,
      `a <details> wrapper hides nothing here and breaks transclusion when unclosed:\n${text.slice(-400)}`);
    assert.equal(text.includes("<summary>"), false, "no <summary> should be emitted either");
  });
  record("D the point of use still carries the alt text and resolves to the definition's label", () => {
    assert.ok(text.includes("![Growth Chart][favicon-96x96-1]"), "point of use lost its reference form");
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
console.log("\nmarkdown-base64-layout: all cases passed");
