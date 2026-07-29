// Spawns a preview server.
//
// Covers /api/todo-update, the endpoint behind the tracker board's drag-between-
// columns gesture and its per-card review buttons. It writes to the real
// .agents/todo.md and .agents/review-feedback.json, so both are backed up and
// restored around every assertion.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const port = 4205;
const baseUrl = `http://127.0.0.1:${port}`;
const todoPath = path.join(process.cwd(), ".agents", "todo.md");
const feedbackPath = path.join(process.cwd(), ".agents", "review-feedback.json");

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

const post = (payload) =>
  fetch(`${baseUrl}/api/todo-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const todoBackup = await readFile(todoPath, "utf8");
const feedbackExisted = existsSync(feedbackPath);
const feedbackBackup = feedbackExisted ? await readFile(feedbackPath, "utf8") : null;

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(child);

  // Find a real card to act on, so the test tracks the file's actual shape.
  const lines = todoBackup.split(/\r?\n/);
  const target = lines.findIndex((l) => /^-\s+\[[ xA~]\]\s+\S/.test(l));
  assert.ok(target >= 0, "todo.md has no cards to test against");
  const original = lines[target];
  // The guard matches on the card's text, so it survives the marker changing.
  const expect = original.replace(/^-\s+\[[ xA~]\]\s+/, "").slice(0, 40);

  // --- moving a card rewrites only its marker ---
  const moved = await post({ line: target, expect, status: "~", lane: "Bugs" });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.success, true);

  let now = (await readFile(todoPath, "utf8")).split(/\r?\n/);
  assert.match(now[target], /^-\s+\[~\]/, "marker was not rewritten");
  assert.equal(
    now[target].replace(/^-\s+\[~\]/, ""),
    original.replace(/^-\s+\[[ xA~]\]/, ""),
    "the rest of the line must survive untouched"
  );
  assert.equal(now.length, lines.length, "line count must not change");

  // --- a bare note records feedback without moving the card ---
  await writeFile(feedbackPath, "[]\n", "utf8");
  const noted = await post({ line: target, expect, note: "just a comment", lane: "Bugs" });
  assert.equal(noted.status, 200);

  now = (await readFile(todoPath, "utf8")).split(/\r?\n/);
  assert.match(now[target], /^-\s+\[~\]/, "a note must not move the card");

  let log = JSON.parse(await readFile(feedbackPath, "utf8"));
  assert.equal(log.length, 1);
  assert.equal(log[0].note, "just a comment");
  assert.equal(log[0].verdict, null);
  assert.equal(log[0].statusFrom, "~");
  assert.equal(log[0].statusTo, "~");
  assert.ok(log[0].title.length > 0, "feedback must carry the card title, it is the only stable key");

  // --- a verdict records and moves, newest entry first ---
  const verdict = await post({ line: target, expect, status: "x", verdict: "works", note: "checked", lane: "Bugs" });
  assert.equal(verdict.status, 200);
  assert.equal(verdict.body.statusFrom, "~");
  assert.equal(verdict.body.statusTo, "x");

  log = JSON.parse(await readFile(feedbackPath, "utf8"));
  assert.equal(log.length, 2);
  assert.equal(log[0].verdict, "works", "newest entry must be first");
  assert.equal(log[0].note, "checked");

  // --- the stale guard refuses a write aimed at a line that moved ---
  const stale = await post({ line: target, expect: "- [ ] something else entirely", status: "x" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.success, false);

  // --- rejects unknown status and verdict rather than writing junk ---
  assert.equal((await post({ line: target, expect, status: "?" })).status, 400);
  assert.equal((await post({ line: target, expect, verdict: "maybe" })).status, 400);
  assert.equal((await post({ line: target, expect })).status, 400, "an empty update is a bad request");

  // --- a line that is not a card is refused ---
  const heading = lines.findIndex((l) => l.startsWith("## "));
  assert.equal((await post({ line: heading, expect: "", status: "x" })).status, 409);

  console.log("todo-update endpoint check passed");
} finally {
  child.kill();
  await writeFile(todoPath, todoBackup, "utf8");
  if (feedbackExisted) await writeFile(feedbackPath, feedbackBackup, "utf8");
  else await rm(feedbackPath, { force: true });
}
