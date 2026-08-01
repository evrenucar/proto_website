// Spawns a preview server (just to serve the static tracker.html) and drives it with
// Playwright. Every read the tracker makes (todo.md, agents.json, per-agent feeds,
// tracker-feed.json, review-feedback.json, card-meta.json, tracker-questions.json) and
// every write it can make (/api/todo-update, /api/add-todo) is intercepted with
// page.route, so this test never touches the real .agents/todo.md or any real agent's
// feed file. That also makes the board's card set deterministic instead of whatever the
// live board happens to hold right now.
//
// Covers the tracker.html card:
//   "when I click items move things drag items the scroll position of items disappear
//    ... maybe best to add ID numbers to them ... top left"
// and:
//   "Agents on the tracker board if they are not used for a while can be depreciated
//    from showing at the top of the status feed (after 6 hrs or so)"
//
// Asserts user-visible outcomes only: the actual scrollTop in pixels of a column that
// was scrolled before a re-render, a card showing the same id text after lines are
// inserted above it in todo.md, and an agent chip actually absent/present from the
// who-strip based on how old its last feed line is.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 4256;
const baseUrl = `http://127.0.0.1:${port}`;

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

// A "To do" column ([ ]) with enough filler cards to overflow the 62vh col-body and
// actually need to scroll, plus one named target card whose identity (lane + text)
// never changes between versions.
function buildTodoMd(fillerCount, extraLinesAboveTarget) {
  const lines = ["# Todo (fixture)", "", "## Bugs", ""];
  for (let i = 0; i < extraLinesAboveTarget; i++) {
    lines.push(`- [ ] Newly inserted filler line ${i}, added above the target card`);
  }
  for (let i = 0; i < fillerCount; i++) {
    lines.push(`- [ ] Filler card ${i} so the To do column is tall enough to scroll`);
  }
  lines.push("- [ ] Target card whose id and scroll position must survive a re-render");
  lines.push("");
  return lines.join("\n");
}

const TARGET_TEXT = "Target card whose id and scroll position must survive a re-render";

// Route state, mutated between phases of the test rather than re-registering routes.
const state = {
  todoMd: buildTodoMd(40, 0),
  agents: [
    { id: "test-fresh", n: 1, model: "test", goal: "posts recently", color: "#5cc47f" },
    { id: "test-stale", n: 2, model: "test", goal: "has not posted in a while", color: "#e0655f" }
  ],
  feeds: {
    "test-fresh": [{ at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), text: "one hour ago" }],
    "test-stale": [{ at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), text: "seven hours ago" }]
  }
};

async function installFixtureRoutes(page) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;

    if (p === "/.agents/todo.md") {
      return route.fulfill({ status: 200, contentType: "text/markdown; charset=utf-8", body: state.todoMd });
    }
    if (p === "/.tracker/tracker-questions.json") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ branch: "fixture", suites: [], questions: [] })
      });
    }
    if (p === "/.tracker/tracker-feed.json") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (p === "/.agents/review-feedback.json") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (p === "/.tracker/card-meta.json") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (p === "/.tracker/agents.json") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ agents: state.agents }) });
    }
    if (p.startsWith("/.tracker/feed/")) {
      const id = decodeURIComponent(p.slice("/.tracker/feed/".length).replace(/\.jsonl$/, ""));
      const lines = (state.feeds[id] || []).map((l) => JSON.stringify(l)).join("\n");
      return route.fulfill({ status: 200, contentType: "text/plain", body: lines });
    }
    // Never let the board's own writes reach the real server: this is the tracker
    // equivalent of blocking /api/save-board and disabling autosave for a board probe.
    if (p === "/api/todo-update" || p === "/api/add-todo") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    return route.continue();
  });
}

function findColBody(page) {
  return page.evaluateHandle(() => {
    const bodies = Array.from(document.querySelectorAll(".col-body"));
    return bodies.find((b) => b.getAttribute("data-status") === " ") || null;
  });
}

async function cardCount(page) {
  return page.locator("#board .card").count();
}

async function targetCardNum(page) {
  return page.evaluate((targetText) => {
    const titles = Array.from(document.querySelectorAll("#board .card-title"));
    const el = titles.find((t) => t.getAttribute("data-text") === targetText);
    if (!el) return null;
    const card = el.closest(".card");
    const num = card.querySelector(".card-num");
    return num ? num.textContent.trim() : null;
  }, TARGET_TEXT);
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
const failures = [];

try {
  await waitForServer(child);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await installFixtureRoutes(page);

  await page.goto(`${baseUrl}/.tracker/tracker.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#board .card", { timeout: 15000 });

  const initialCount = await cardCount(page);
  assert.equal(initialCount, 41, `expected 40 filler + 1 target card, got ${initialCount}`);

  // ---- every card shows a visible id ----
  const idTexts = await page.$$eval("#board .card .card-num", (els) => els.map((e) => e.textContent.trim()));
  assert.equal(idTexts.length, initialCount, "every rendered card should carry a .card-num element");
  for (const t of idTexts) {
    if (!/^#[0-9a-z]+$/.test(t)) failures.push(`card id "${t}" does not look like a short id`);
  }

  const idBefore = await targetCardNum(page);
  assert.ok(idBefore, "target card should show an id before any re-render");

  // ============================================================
  // 1) Scroll position survives a re-render triggered by clicking a priority chip.
  // ============================================================
  const colHandle = await findColBody(page);
  await page.evaluate((el) => { el.scrollTop = 220; }, colHandle);
  const scrollBeforeChip = await page.evaluate((el) => el.scrollTop, colHandle);
  assert.ok(scrollBeforeChip > 100, "test setup: column did not actually scroll");

  // Click a priority chip on a filler card (not the target), which POSTs to the
  // (intercepted) /api/todo-update endpoint and forces an immediate re-render.
  // Dispatched via evaluate rather than locator.click(): Playwright's click()
  // scrolls the target into view first, which would reset the very scrollTop
  // this step is testing before the click even happens.
  await page.evaluate(() => {
    document.querySelector("#board .col-body[data-status=' '] .card .pb").click();
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#board .card").length > 0,
    null,
    { timeout: 5000 }
  );
  // The re-render happens synchronously once the (mocked) fetch resolves; give it a tick.
  await page.waitForTimeout(150);

  const scrollAfterChip = await page.evaluate(() => {
    const bodies = Array.from(document.querySelectorAll(".col-body"));
    const b = bodies.find((x) => x.getAttribute("data-status") === " ");
    return b ? b.scrollTop : null;
  });
  if (scrollAfterChip !== scrollBeforeChip) {
    failures.push(
      `priority-chip re-render: column scrollTop changed from ${scrollBeforeChip} to ${scrollAfterChip}`
    );
  }

  // ============================================================
  // 2) Scroll position survives a re-render triggered by a poll picking up new content
  //    (todo.md changed underneath the page, as happens with concurrent hand/agent edits).
  // ============================================================
  await page.evaluate((el) => { el.scrollTop = 340; }, await findColBody(page));
  const scrollBeforePoll = await page.evaluate(() => {
    const bodies = Array.from(document.querySelectorAll(".col-body"));
    const b = bodies.find((x) => x.getAttribute("data-status") === " ");
    return b.scrollTop;
  });
  assert.ok(scrollBeforePoll > 100, "test setup: column did not actually scroll before poll test");

  // Insert 5 new lines above the target card, simulating hand/agent edits to todo.md.
  state.todoMd = buildTodoMd(40, 5);
  await page.waitForFunction(
    (expected) => document.querySelectorAll("#board .card").length === expected,
    initialCount + 5,
    { timeout: 10000 }
  );

  const scrollAfterPoll = await page.evaluate(() => {
    const bodies = Array.from(document.querySelectorAll(".col-body"));
    const b = bodies.find((x) => x.getAttribute("data-status") === " ");
    return b ? b.scrollTop : null;
  });
  if (scrollAfterPoll !== scrollBeforePoll) {
    failures.push(`poll re-render: column scrollTop changed from ${scrollBeforePoll} to ${scrollAfterPoll}`);
  }

  // ---- same card, same id, after lines were inserted above it ----
  const idAfter = await targetCardNum(page);
  if (idAfter !== idBefore) {
    failures.push(`target card id changed from "${idBefore}" to "${idAfter}" after unrelated lines were inserted above it`);
  }

  // ============================================================
  // 3) Agent aging: a stale agent is absent from the who-strip, a fresh one is present,
  //    and posting again brings the stale one straight back.
  // ============================================================
  await page.waitForTimeout(4200); // let at least one more poll cycle run against current state
  const staleVisible = await page.locator('.who-chip[title="test-stale"]').count();
  const freshVisible = await page.locator('.who-chip[title="test-fresh"]').count();
  if (staleVisible !== 0) failures.push(`agent idle 7h ("test-stale") is still shown on the who-strip`);
  if (freshVisible !== 1) failures.push(`agent active 1h ago ("test-fresh") is missing from the who-strip`);

  // test-stale posts again, right now.
  state.feeds["test-stale"] = [
    ...state.feeds["test-stale"],
    { at: new Date().toISOString(), text: "back again" }
  ];
  await page.waitForFunction(
    () => !!document.querySelector('.who-chip[title="test-stale"]'),
    null,
    { timeout: 10000 }
  );
  const staleBackCount = await page.locator('.who-chip[title="test-stale"]').count();
  if (staleBackCount !== 1) failures.push(`agent that just posted again ("test-stale") did not reappear on the who-strip`);

  await context.close();
} finally {
  if (browser) await browser.close();
  child.kill();
}

assert.deepEqual(failures, [], `tracker scroll/id/aging regressions:\n${failures.join("\n")}`);

console.log("tracker scroll-preservation, visible card ids, and agent aging all hold up");
