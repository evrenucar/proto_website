// Spawns a preview server and drives the tracker board with Playwright.
//
// Covers the card: "cant delete or chnge type of items in the tracker."
// A card's *status* is already changeable (drag between columns) and its
// *priority* is already clickable. The two operations with no UI at all were
// deleting a card, and moving it between lanes: the `## section` of todo.md it
// lives under, which is what kind of work it is.
//
// WHY THIS RUNS AGAINST A MIRROR OF THE REPO, NOT THE REPO
// -------------------------------------------------------
// The endpoint under test writes to `.agents/todo.md`, and there is no way to
// point it somewhere else: `preview-server.mjs` resolves that path from its own
// file location, not from cwd. Backing the real file up and restoring it (which
// tests/preview/preview-todo-update-endpoint.test.mjs does) would silently
// revert any edit another agent or the user made during the run, and this suite
// deletes cards. So the test copies the two files under test, the real
// `scripts/preview-server.mjs` and the real `.tracker/tracker.html`, into
// `.tmp/scratch/opus5-35/mirror-run/` and runs the server from there. Every
// assertion below is against a real todo.md on a real disk, read back with
// readFile after the real endpoint wrote it. Nothing about the code path is
// mocked; only the file it lands on is a copy.
//
// Assertions are outcomes, not mechanisms: bytes in todo.md after the write, and
// what the board shows after it polls. Both breaks were measured. See
// .tmp/scratch/opus5-35/notes.md.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

// 4301 belongs to tests/board/lock-indicator-and-icons.test.mjs; 4312, 4318,
// 4321, 4322 and 4334 are taken by other suites. 4357 is unused as of this write.
const port = 4357;
const baseUrl = `http://127.0.0.1:${port}`;

// Where the code under test is copied FROM. Point this at a scratch copy of the
// tree to prove this suite goes red against a build without the feature.
const srcDir = process.cwd();
const mirrorDir = path.join(process.cwd(), ".tmp", "scratch", "opus5-35", "mirror-run");

const todoPath = path.join(mirrorDir, ".agents", "todo.md");
const trashPath = path.join(mirrorDir, ".tracker", "deleted-cards.jsonl");

const TARGET = "BUGS-TARGET the card under test";
const TARGET_LINE = "- [~] @tester BUGS-TARGET the card under test !p1";
const TARGET_NOTES = [
  "  a continuation line that belongs to the target",
  "  a second continuation line under the same card"
];

// LF only, on purpose and permanently: todo.md was once rewritten to CRLF and
// that broke the lane lookup, which finds a section with indexOf("\n## X\n").
const FIXTURE_TODO = [
  "# Todo (mirror fixture)",
  "",
  "## Now",
  "",
  "- [ ] NOW-A the only card in Now",
  "",
  "## Bugs",
  "",
  "- [ ] BUGS-ABOVE the card directly above the target !p3",
  "",
  TARGET_LINE,
  ...TARGET_NOTES,
  "",
  "- [x] BUGS-BELOW the card directly below the target",
  "  with a continuation line of its own",
  "",
  "## Test failures",
  "",
  "## Dead code",
  "",
  "## Features and ideas",
  "",
  "- [.] FEAT-A an idea nobody has started",
  "",
  "## Waiting on your review",
  "",
  "## Later",
  "",
  "- [ ] LATER-A something for later",
  ""
].join("\n");

async function buildMirror() {
  await rm(mirrorDir, { recursive: true, force: true });
  await mkdir(path.join(mirrorDir, "scripts", "lib"), { recursive: true });
  await mkdir(path.join(mirrorDir, ".tracker"), { recursive: true });
  await mkdir(path.join(mirrorDir, ".agents"), { recursive: true });

  // The two files under test, plus the one module the server imports and the
  // 404 page it streams for a miss.
  await cp(path.join(srcDir, "scripts", "preview-server.mjs"), path.join(mirrorDir, "scripts", "preview-server.mjs"));
  await cp(path.join(srcDir, "scripts", "lib", "board-store.mjs"), path.join(mirrorDir, "scripts", "lib", "board-store.mjs"));
  await cp(path.join(srcDir, ".tracker", "tracker.html"), path.join(mirrorDir, ".tracker", "tracker.html"));
  await cp(path.join(srcDir, "404.html"), path.join(mirrorDir, "404.html"));

  await writeFile(todoPath, FIXTURE_TODO, "utf8");
  await writeFile(path.join(mirrorDir, ".agents", "review-feedback.json"), "[]\n", "utf8");
  await writeFile(path.join(mirrorDir, ".tracker", "agents.json"), JSON.stringify({ agents: [] }), "utf8");
  await writeFile(path.join(mirrorDir, ".tracker", "tracker-feed.json"), "[]", "utf8");
  await writeFile(path.join(mirrorDir, ".tracker", "card-meta.json"), "{}", "utf8");
  await writeFile(
    path.join(mirrorDir, ".tracker", "tracker-questions.json"),
    JSON.stringify({ branch: "mirror", suites: [], questions: [] }),
    "utf8"
  );
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

const readTodo = () => readFile(todoPath, "utf8");

function crlfPairs(text) {
  return (text.match(/\r\n/g) || []).length;
}

// Which `## heading` a given line sits under. This is the whole point of a lane
// move, so it is asserted directly rather than through the board's own parse.
function laneOf(text, needle) {
  const lines = text.split("\n");
  let lane = null;
  const hits = [];
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { lane = h[1]; continue; }
    if (line.includes(needle)) hits.push(lane);
  }
  return hits;
}

const post = (payload) =>
  fetch(`${baseUrl}/api/todo-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

await buildMirror();

const child = spawn(process.execPath, [path.join(mirrorDir, "scripts", "preview-server.mjs")], {
  cwd: mirrorDir,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
const failures = [];
const note = (ok, message) => { if (!ok) failures.push(message); };

// Stops the run when a later case cannot mean anything, and prints everything
// found so far rather than only the last thing.
function bail(message) {
  failures.push(message);
  throw new Error(`tracker delete / lane-change failures:\n- ${failures.join("\n- ")}`);
}

// Waiting for the board to catch up is a means, not the outcome. When the board
// never gets there, record it and carry on to the file assertions, which say
// what actually went wrong instead of "timeout on line 212".
async function softWait(page, fn, arg, message, timeout = 10000) {
  try {
    await page.waitForFunction(fn, arg, { timeout });
    return true;
  } catch {
    failures.push(message);
    return false;
  }
}

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();

  // Board write endpoints are blocked outright even though the tracker never
  // calls them, per the concurrency rules. The mirror has no content/ at all.
  await page.route("**/api/save-board*", (route) => route.abort());
  await page.route("**/api/save-markdown*", (route) => route.abort());

  await page.goto(`${baseUrl}/.tracker/tracker.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#board .card", { timeout: 15000 });

  const card = page.locator("#board .card").filter({ has: page.locator(`.card-title[data-text="${TARGET}"]`) });
  const above = page.locator("#board .card").filter({ has: page.locator('.card-title[data-text^="BUGS-ABOVE"]') });
  assert.equal(await card.count(), 1, "fixture: the target card must render exactly once");

  // ============================================================
  // A) The two controls exist and say what they do.
  // ============================================================
  const laneBadge = card.locator(".lane");
  assert.equal(await laneBadge.count(), 1, "a card must carry exactly one lane control");
  note((await laneBadge.textContent()).trim() === "Bugs", `lane badge should read "Bugs", read "${(await laneBadge.textContent()).trim()}"`);
  note(await card.locator(".db").count() === 1, "a card must carry a delete control");

  // ============================================================
  // B) Change the card's lane from the board. Bugs -> Later.
  // ============================================================
  await laneBadge.click();
  const menu = card.locator(".lane-menu");
  try {
    await menu.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    assert.fail("clicking a card's lane badge must open the list of lanes to move it to");
  }
  const offered = (await menu.locator("button").allTextContents()).map((s) => s.trim());
  note(
    offered.includes("Later") && offered.includes("Now") && offered.includes("Features and ideas"),
    `lane menu should offer every lane, offered: ${JSON.stringify(offered)}`
  );

  const beforeMove = await readTodo();
  await menu.locator('button[data-lane-to="Later"]').click();

  // The board polls; exactly one copy of the card must end up showing the new lane.
  await softWait(
    page,
    (t) => {
      const els = Array.from(document.querySelectorAll(`#board .card-title[data-text="${t}"]`));
      if (els.length !== 1) return false;
      const badge = els[0].closest(".card").querySelector(".lane");
      return badge && badge.textContent.trim() === "Later";
    },
    TARGET,
    "after picking a new lane, the board never showed exactly one copy of the card in that lane"
  );

  const afterMove = await readTodo();
  const movedLanes = laneOf(afterMove, "BUGS-TARGET");
  assert.deepEqual(
    movedLanes,
    ["Later"],
    `after a lane change the card line must sit under "## Later" and nowhere else, found under ${JSON.stringify(movedLanes)}`
  );
  note(
    afterMove.includes(`${TARGET_LINE}\n${TARGET_NOTES[0]}\n${TARGET_NOTES[1]}`),
    "the card's marker, owner, priority and both continuation lines must move with it"
  );
  note(crlfPairs(afterMove) === 0, `lane move introduced ${crlfPairs(afterMove)} CRLF pairs into todo.md`);
  note(
    laneOf(afterMove, "BUGS-ABOVE")[0] === "Bugs" && laneOf(afterMove, "BUGS-BELOW")[0] === "Bugs",
    "the cards around the moved one must stay in Bugs"
  );
  note(
    afterMove.includes("- [x] BUGS-BELOW the card directly below the target\n  with a continuation line of its own"),
    "the card below the moved one must keep its own continuation line"
  );
  // Everything except the moved block is byte-identical.
  const strip = (text) => text.split("\n").filter((l) => !l.includes("BUGS-TARGET") && !TARGET_NOTES.includes(l)).join("\n");
  note(
    strip(afterMove).replace(/\n{3,}/g, "\n\n") === strip(beforeMove).replace(/\n{3,}/g, "\n\n"),
    "a lane move must not rewrite any other card"
  );

  // Move it back, so the delete cases run on a card in its original lane.
  await card.locator(".lane").click();
  await card.locator('.lane-menu button[data-lane-to="Bugs"]').click();
  await page.waitForFunction(
    (t) => {
      const el = document.querySelector(`#board .card-title[data-text="${t}"]`);
      const badge = el && el.closest(".card").querySelector(".lane");
      return badge && badge.textContent.trim() === "Bugs";
    },
    TARGET,
    { timeout: 10000 }
  );

  // ============================================================
  // C) Delete asks first, and the first step does not delete anything.
  // ============================================================
  const beforeDelete = await readTodo();
  await card.locator(".db").click();
  await page.waitForTimeout(500);
  note(
    (await readTodo()) === beforeDelete,
    "clicking delete must not write to todo.md until it has been confirmed"
  );
  if (await card.locator(".confirm").count() !== 1) {
    bail("the delete control must open a confirm step, and none appeared");
  }
  await card.locator(".confirm .no").click();
  await page.waitForTimeout(120);
  note(await card.locator(".confirm").count() === 0, "Keep must close the confirm");
  note((await readTodo()) === beforeDelete, "Keep must leave todo.md untouched");
  note(await card.count() === 1, "Keep must leave the card on the board");

  // ============================================================
  // D) Confirming removes the card from the file and from the board, and
  //    nothing else in the file moves.
  // ============================================================
  await card.locator(".db").click();
  await card.locator(".confirm .yes").click();
  await page.waitForFunction(
    (t) => !document.querySelector(`#board .card-title[data-text="${t}"]`),
    TARGET,
    { timeout: 10000 }
  );

  const afterDelete = await readTodo();
  note(!afterDelete.includes("BUGS-TARGET"), "the deleted card's line must be gone from todo.md");
  for (const line of TARGET_NOTES) {
    note(!afterDelete.includes(line.trim()), `the deleted card's note line "${line.trim()}" must go with it`);
  }
  // The rest of the file, byte for byte: the block and its one separator blank
  // line removed, nothing else touched.
  const expectedAfterDelete = (() => {
    const lines = beforeDelete.split("\n");
    const at = lines.findIndex((l) => l.includes("BUGS-TARGET"));
    lines.splice(at, 1 + TARGET_NOTES.length + (lines[at + 1 + TARGET_NOTES.length] === "" ? 1 : 0));
    return lines.join("\n");
  })();
  note(
    afterDelete === expectedAfterDelete,
    "deleting a card must remove exactly its own block and leave every other byte of todo.md alone"
  );
  note(crlfPairs(afterDelete) === 0, `delete introduced ${crlfPairs(afterDelete)} CRLF pairs into todo.md`);
  note(await above.count() === 1, "the card above the deleted one must still be on the board");

  // The removed block is on disk regardless of whether anyone clicks Undo.
  note(existsSync(trashPath), "a deleted card must be recorded in .tracker/deleted-cards.jsonl");
  if (existsSync(trashPath)) {
    const trash = JSON.parse((await readFile(trashPath, "utf8")).trim().split("\n").pop());
    note(
      trash.block === [TARGET_LINE, ...TARGET_NOTES].join("\n"),
      `the trash record must carry the card verbatim, got ${JSON.stringify(trash.block)}`
    );
  }

  // ============================================================
  // E) Undo puts the card back whole.
  // ============================================================
  const undo = page.locator("#undo");
  if (!(await undo.isVisible())) {
    bail("a delete must leave an undo affordance on screen; nothing appeared");
  }
  await page.locator("#undo-btn").click();
  await page.waitForFunction(
    (t) => !!document.querySelector(`#board .card-title[data-text="${t}"]`),
    TARGET,
    { timeout: 10000 }
  );

  const afterUndo = await readTodo();
  note(
    afterUndo.includes(`${TARGET_LINE}\n${TARGET_NOTES[0]}\n${TARGET_NOTES[1]}`),
    "undo must restore the card's marker, owner, priority and every note line"
  );
  assert.deepEqual(laneOf(afterUndo, "BUGS-TARGET"), ["Bugs"], "undo must put the card back in its own lane, once");
  note(crlfPairs(afterUndo) === 0, `undo introduced ${crlfPairs(afterUndo)} CRLF pairs into todo.md`);
  note(
    (await page.locator("#board .card").filter({ has: page.locator(`.card-title[data-text="${TARGET}"]`) }).count()) === 1,
    "undo must not produce two copies of the card"
  );

  // ============================================================
  // F) The stale-text guard still holds for both new gestures. Deleting the
  //    wrong card because the file shifted is unrecoverable from the UI.
  // ============================================================
  const lines = (await readTodo()).split("\n");
  const targetIndex = lines.findIndex((l) => l.includes("BUGS-TARGET"));
  const beforeStale = await readTodo();

  const staleDelete = await post({ line: targetIndex, expect: "a card that is not there any more", remove: true });
  note(staleDelete.status === 409, `a delete aimed at a moved line must be refused, got ${staleDelete.status}`);
  const staleMove = await post({ line: targetIndex, expect: "a card that is not there any more", toLane: "Later" });
  note(staleMove.status === 409, `a lane move aimed at a moved line must be refused, got ${staleMove.status}`);
  note((await readTodo()) === beforeStale, "a refused write must not have changed todo.md");

  // Aimed at a heading rather than a card: also refused.
  const headingIndex = lines.findIndex((l) => l === "## Bugs");
  note((await post({ line: headingIndex, remove: true })).status === 409, "deleting a heading line must be refused");

  // Unknown lane is refused before anything is read or written.
  const badLane = await post({ line: targetIndex, expect: "@tester BUGS-TARGET", toLane: "Somewhere Else" });
  note(badLane.status === 400, `an unknown lane must be refused, got ${badLane.status}`);
  note((await readTodo()) === beforeStale, "a refused lane move must not have changed todo.md");

  // Restoring the same card twice must not duplicate it.
  const dupe = await post({ restore: TARGET_LINE, toLane: "Bugs" });
  note(dupe.status === 409, `restoring a card already in the file must be refused, got ${dupe.status}`);

  // ============================================================
  // H) The gestures that already worked still work. The new branches sit in
  //    front of the status/priority/text code in the same handler, so a card
  //    that can no longer change column would be the obvious way to break this.
  // ============================================================
  const statusMove = await post({ line: targetIndex, expect: "@tester BUGS-TARGET", status: " " });
  note(statusMove.status === 200, `a plain status change must still be accepted, got ${statusMove.status}`);
  await softWait(
    page,
    (t) => {
      const el = document.querySelector(`#board .card-title[data-text="${t}"]`);
      const body = el && el.closest(".col-body");
      return !!body && body.getAttribute("data-status") === " ";
    },
    TARGET,
    "after a status change the card must appear in the To do column"
  );
  note(
    (await readTodo()).includes("- [ ] @tester BUGS-TARGET"),
    "a status change must rewrite only the marker, keeping the owner tag"
  );

  // ============================================================
  // G) The file is still LF-only after everything above.
  // ============================================================
  const finalText = await readTodo();
  assert.equal(crlfPairs(finalText), 0, "todo.md must still be LF-only after every gesture in this suite");

  await context.close();
} finally {
  if (browser) await browser.close();
  child.kill();
}

assert.deepEqual(failures, [], `tracker delete / lane-change failures:\n- ${failures.join("\n- ")}`);

console.log("tracker: cards can be deleted (with confirm, undo and a trash record) and moved between lanes");
