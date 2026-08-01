// Spawns a preview server and drives Playwright.
//
// Covers scripts/cosmo.mjs, the CLI view over board data, end to end:
//
//   1. boards / nodes / grep read the same .canvas files the browser reads.
//   2. add-note adds exactly one node AND writes the sidecar at the path the
//      shared sanitizer produces, which is the path the preview server would
//      have produced for the same title. There is one sanitizer, not three:
//      this test also fails if preview-server.mjs grows a local copy again.
//   3. export produces a file that re-imports.
//   4. a write against a stale base is REFUSED, with the canvas untouched and
//      no orphan sidecar left behind.
//   5. the board the CLI wrote loads in a real browser and the note renders.
//
// Nothing here touches content/. The CLI runs with --root pointed at a scratch
// copy of the repo, and the browser gets that copy through a route intercept,
// with autosave off and /api/save-board blocked.

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

import { sanitizeMarkdownFilename } from "../../scripts/lib/board-store.mjs";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(rootDir, "scripts", "cosmo.mjs");
const port = 4188;
const baseUrl = `http://127.0.0.1:${port}`;

const NOTE_TITLE = "CLI round trip";
const NOTE_BODY = "# CLI round trip\n\nWritten by the CLI, read by the browser.\n";

// Scratch root outside the repo tree so a stray write can never hit content/.
const scratch = await mkdtemp(path.join(os.tmpdir(), "cosmo-cli-"));
const boardDir = path.join(scratch, "content", "boards", "test-board");

async function run(args, { expectFail = false } = {}) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [cli, ...args, "--root", scratch]);
    if (expectFail) assert.fail(`expected "${args.join(" ")}" to fail, it succeeded`);
    return { code: 0, stdout };
  } catch (error) {
    if (!expectFail) assert.fail(`"${args.join(" ")}" failed: ${error.stderr || error.message}`);
    return { code: error.code, stdout: error.stdout || "", stderr: error.stderr || "" };
  }
}

async function runJson(args) {
  const { stdout } = await run([...args, "--json"]);
  return JSON.parse(stdout);
}

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

let child;
let browser;

try {
  // --- scratch copy of the board data the CLI will operate on ---
  await mkdir(path.join(scratch, "src"), { recursive: true });
  await mkdir(boardDir, { recursive: true });
  await cp(path.join(rootDir, "src", "registry.json"), path.join(scratch, "src", "registry.json"));
  await cp(
    path.join(rootDir, "content", "boards", "test-board", "current.canvas"),
    path.join(boardDir, "current.canvas")
  );
  await cp(
    path.join(rootDir, "content", "boards", "test-board", "notes.md"),
    path.join(boardDir, "notes.md")
  );

  // --- read commands ---
  const boards = await runJson(["boards"]);
  const testBoard = boards.boards.find((entry) => entry.slug === "test-board");
  assert.ok(testBoard, "boards --json must list test-board from the registry");
  assert.equal(testBoard.path, "content/boards/test-board/current.canvas");

  const before = await runJson(["nodes", "test-board"]);
  assert.ok(before.count > 0, "the seeded test board must have nodes");
  assert.ok(before.updatedAt, "a board file must carry updatedAt for the stale guard to work");

  // --- one sanitizer, not three ---
  // The CLI names sidecars with the same function the preview server runs on
  // /api/save-markdown, which is what makes a CLI note and a browser note land
  // on the same path. Guard the import, because this is exactly the symmetry
  // that broke once between the browser copy and the server copy.
  const serverSource = await readFile(path.join(rootDir, "scripts", "preview-server.mjs"), "utf8");
  assert.doesNotMatch(
    serverSource,
    /function sanitizeMarkdownFilename/,
    "preview-server.mjs defines its own sanitizer again; it must import the shared one"
  );
  assert.match(
    serverSource,
    /from "\.\/lib\/board-store\.mjs"/,
    "preview-server.mjs must import the shared board store"
  );
  const expectedFilename = sanitizeMarkdownFilename(`${NOTE_TITLE}.md`);
  assert.equal(expectedFilename, "cli-round-trip.md");

  // --- add a note ---
  const bodyFile = path.join(scratch, "body.md");
  await writeFile(bodyFile, NOTE_BODY, "utf8");
  const added = await runJson([
    "add-note", "test-board",
    "--title", NOTE_TITLE,
    "--content-file", bodyFile
  ]);

  const after = await runJson(["nodes", "test-board"]);
  assert.equal(after.count, before.count + 1, "add-note must add exactly one node");
  assert.equal(added.markdown, `content/boards/test-board/${expectedFilename}`);

  const sidecars = (await readdir(boardDir)).filter((name) => name.endsWith(".md")).sort();
  assert.deepEqual(sidecars, ["cli-round-trip.md", "notes.md"], "the sidecar must exist on disk under the sanitized name");
  assert.equal(await readFile(path.join(boardDir, expectedFilename), "utf8"), NOTE_BODY);

  const node = after.nodes.find((item) => item.id === added.nodeId);
  assert.equal(node.type, "markdown");
  assert.equal(node.title, NOTE_TITLE);
  assert.equal(node.file, `/content/boards/test-board/${expectedFilename}`);
  assert.equal(node.href, node.file, "href and file must agree, as they do for a browser-made note");
  assert.equal(node._rawMarkdown, NOTE_BODY, "the body must be inlined so the node renders without the file");
  assert.match(node.markdownId, /^cosmo-note-/, "a note needs the markdown identity the browser stamps");
  assert.notEqual(after.updatedAt, before.updatedAt, "a write must move updatedAt forward");
  assert.equal(after.canvasId, before.canvasId, "a write must preserve canvas identity");

  // --- grep finds the node by its text ---
  const hits = await runJson(["grep", "read by the browser", "--board", "test-board"]);
  assert.equal(hits.count, 1);
  assert.equal(hits.matches[0].id, added.nodeId);
  assert.equal(hits.matches[0].field, "_rawMarkdown");

  const missing = await runJson(["grep", "zzz-no-such-string-zzz"]);
  assert.equal(missing.count, 0, "a search with no hits must still be valid JSON, not an error");

  // --- a stale base is refused ---
  const staleAttempt = await run(
    ["add-note", "test-board", "--title", "stale writer", "--base", "2000-01-01T00:00:00.000Z"],
    { expectFail: true }
  );
  assert.equal(staleAttempt.code, 3, "a stale-base write must exit 3");
  assert.match(staleAttempt.stderr, /changed on disk/, "the refusal must say why, on stderr");

  const afterStale = await runJson(["nodes", "test-board"]);
  assert.equal(afterStale.count, after.count, "a refused write must not change the canvas");
  assert.equal(afterStale.updatedAt, after.updatedAt, "a refused write must not restamp updatedAt");
  const sidecarsAfterStale = (await readdir(boardDir)).filter((name) => name.endsWith(".md")).sort();
  assert.deepEqual(sidecarsAfterStale, sidecars, "a refused write must leave no orphan sidecar");

  // A base that matches the file writes normally, so the guard is not just
  // refusing everything.
  await run(["add-note", "test-board", "--title", "fresh writer", "--base", afterStale.updatedAt]);
  const afterFresh = await runJson(["nodes", "test-board"]);
  assert.equal(afterFresh.count, after.count + 1, "a current base must write");

  // --- export re-imports ---
  const exportPath = path.join(scratch, "exported.canvas");
  const exported = await runJson(["export", "test-board", "--out", exportPath]);
  assert.equal(exported.nodes, afterFresh.count);
  assert.ok(exported.markdownInlined >= 1, "export must inline the markdown sidecars it can read");

  const reimported = await runJson(["nodes", exportPath]);
  assert.equal(reimported.count, afterFresh.count, "the exported file must re-import with every node");
  assert.equal(reimported.canvasId, afterFresh.canvasId, "an export must keep the canvas identity");
  const reimportedNote = reimported.nodes.find((item) => item.id === added.nodeId);
  assert.equal(reimportedNote._rawMarkdown, NOTE_BODY, "the exported note must carry its body");

  const rejected = await run(["nodes", path.join(scratch, "nope.canvas")], { expectFail: true });
  assert.equal(rejected.code, 2, "a missing file must exit 2");

  // --- the CLI's board renders in a real browser ---
  child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(child);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => {
    localStorage.removeItem("board:test-board");
    localStorage.removeItem("board:test-board:meta");
    localStorage.setItem("board:test-board:settings", JSON.stringify({ autosaveEnabled: false }));
  });

  const page = await context.newPage();
  // Serve the scratch canvas instead of the committed one, and refuse any save.
  await page.route("**/test-board/current.canvas*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: await readFile(path.join(boardDir, "current.canvas"), "utf8")
    });
  });
  await page.route(`**/${expectedFilename}*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/markdown; charset=utf-8",
      body: await readFile(path.join(boardDir, expectedFilename), "utf8")
    });
  });
  await page.route("**/api/save-board*", (route) => route.abort());

  await page.goto(`${baseUrl}/content/boards/test-board.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-tool="more"]', { timeout: 15000 });

  const rendered = page.locator(".bd-layer-markdown").filter({ hasText: NOTE_TITLE }).first();
  await rendered.waitFor({ timeout: 15000 });
  const renderedText = await rendered.innerText();
  assert.match(
    renderedText,
    /Written by the CLI, read by the browser/,
    "the note the CLI wrote must render its body on the board"
  );
  // The editor renders every line as a .bd-md-line, styled by level, so a
  // heading proves the body went through the markdown renderer rather than
  // landing as raw text.
  const heading = rendered.locator(".bd-md-line--h1").first();
  await heading.waitFor({ timeout: 10000 });
  assert.equal(
    (await heading.innerText()).trim(),
    "CLI round trip",
    "the note must render as markdown, not as raw text"
  );

  const onBoard = await page.evaluate((id) =>
    !!document.querySelector(`[data-node-id="${id}"], #node-${id}`), added.nodeId);
  assert.ok(onBoard || renderedText.includes(NOTE_TITLE), "the CLI node must be present in the DOM");
} finally {
  if (browser) await browser.close();
  if (child) child.kill();
  await rm(scratch, { recursive: true, force: true });
}

console.log("cli over board data check passed");
