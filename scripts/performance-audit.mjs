import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const PREVIEW_SERVER_SCRIPT = "scripts/preview-server.mjs";
const BOARD_PATH = "content/boards/cosmoboard/current.canvas";
const PARTICIPANT_PDF_PATH = "content/boards/cosmoboard/participant-information.pdf";
const RESULT_ROOT = ".agents/performance_testing/test_results";
const TEMP_ASSET_ROOT = ".tmp/performance-assets";
const VIEWPORT = { width: 1440, height: 960 };
const BOARD_STORAGE_KEYS = [
  "board:cosmoboard",
  "board:cosmoboard:meta",
  "board:cosmoboard:settings",
  "board:cosmoboard:stale",
  "board:cosmoboard:recommendation-modal-dismissed"
];

function parseBoolean(value, fallback = false) {
  if (value === undefined) return true;
  if (/^(1|true|yes|on)$/i.test(String(value))) return true;
  if (/^(0|false|no|off)$/i.test(String(value))) return false;
  return fallback;
}

export function parseBenchmarkArgs(argv = process.argv.slice(2)) {
  const options = {
    iterations: 3,
    trace: false,
    resultRoot: RESULT_ROOT,
    cpuThrottle: 4,
    regressionThreshold: 10,
    skipHeavy: false,
    skipLighthouse: false,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--trace") {
      options.trace = true;
    } else if (arg.startsWith("--trace=")) {
      options.trace = parseBoolean(arg.slice("--trace=".length), options.trace);
    } else if (arg.startsWith("--iterations=")) {
      const parsed = Number.parseInt(arg.slice("--iterations=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) options.iterations = parsed;
    } else if (arg.startsWith("--result-root=")) {
      options.resultRoot = arg.slice("--result-root=".length) || RESULT_ROOT;
    } else if (arg.startsWith("--cpu-throttle=")) {
      const parsed = Number.parseFloat(arg.slice("--cpu-throttle=".length));
      if (Number.isFinite(parsed) && parsed >= 0) options.cpuThrottle = parsed;
    } else if (arg.startsWith("--regression-threshold=")) {
      const parsed = Number.parseFloat(arg.slice("--regression-threshold=".length));
      if (Number.isFinite(parsed) && parsed > 0) options.regressionThreshold = parsed;
    } else if (arg === "--skip-heavy") {
      options.skipHeavy = true;
    } else if (arg.startsWith("--skip-heavy=")) {
      options.skipHeavy = parseBoolean(arg.slice("--skip-heavy=".length), options.skipHeavy);
    } else if (arg === "--skip-lighthouse") {
      options.skipLighthouse = true;
    } else if (arg.startsWith("--skip-lighthouse=")) {
      options.skipLighthouse = parseBoolean(arg.slice("--skip-lighthouse=".length), options.skipLighthouse);
    }
  }

  return options;
}

function printHelp() {
  console.log([
    "Usage: npm run perf:audit -- [--iterations=3] [--trace=false] [--cpu-throttle=4]",
    "                            [--regression-threshold=10] [--skip-heavy] [--skip-lighthouse]",
    "",
    "Writes results to .agents/performance_testing/test_results/<timestamp>/.",
    "The benchmark is opt-in and report-only; it does not run with node --test.",
    "",
    "Note: npm forwards args after `--`. With --cpu-throttle=N, N is the CDP slowdown",
    "factor (4 = 4x slower). Pass 0 to disable throttling. The runner records aggregates",
    "(p50/p95/min/max) across iterations and diffs against the most recent prior run."
  ].join("\n"));
}

function timestampForPath(timestamp) {
  return timestamp.replace(/[:.]/g, "-");
}

function getGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
}

function readJsonFile(filePath) {
  return readFile(path.join(rootDir, filePath), "utf8").then((raw) => JSON.parse(raw));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a free port."));
      });
    });
  });
}

function startPreviewServer(port) {
  const child = spawn(process.execPath, [PREVIEW_SERVER_SCRIPT], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`preview server did not start on port ${port}\n${stdout}\n${stderr}`));
    }, 15000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.includes("Local Access:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`preview server exited early with code ${code}\n${stdout}\n${stderr}`));
    });
  });

  return {
    child,
    ready,
    stop() {
      if (!child.killed) child.kill();
    }
  };
}

function sanitizeAssetFilename(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/").split("/").pop() || "asset";
  const extMatch = raw.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : "";
  const base = (extMatch ? raw.slice(0, -extMatch[0].length) : raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  return `${base}${ext}`;
}

function buildLargeSvg(runId) {
  const pieces = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="4096" viewBox="0 0 4096 4096">',
    '<rect width="4096" height="4096" fill="#101827"/>'
  ];
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const hue = (x * 11 + y * 17) % 360;
      const opacity = 0.45 + ((x + y) % 5) * 0.08;
      pieces.push(
        `<rect x="${x * 32}" y="${y * 32}" width="30" height="30" fill="hsl(${hue} 72% 58%)" opacity="${opacity.toFixed(2)}"/>`
      );
    }
  }
  pieces.push(
    `<text x="128" y="3840" font-family="Arial, sans-serif" font-size="96" fill="#ffffff">${runId}</text>`,
    "</svg>"
  );
  return pieces.join("");
}

function generateHeavyBoardFixture(runId, originalState = {}, nodeCount = 750) {
  const baseNodes = Array.isArray(originalState.nodes) ? originalState.nodes.slice() : [];
  const generatedNodes = [];
  const cols = Math.ceil(Math.sqrt(nodeCount));
  const cellWidth = 220;
  const cellHeight = 140;
  const xOffset = -((cols / 2) * cellWidth);
  const yOffset = 4000;
  for (let i = 0; i < nodeCount; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = xOffset + col * cellWidth + ((row % 2 === 0) ? 0 : cellWidth / 2);
    const y = yOffset + row * cellHeight;
    if (i % 25 === 0) {
      generatedNodes.push({
        id: `heavy-${runId}-md-${i}`,
        x,
        y,
        width: 200,
        height: 120,
        type: "markdown",
        title: `Heavy md ${i}`,
        _rawMarkdown: `# Heavy ${i}\n\nGenerated row ${row} col ${col}. Performance fixture node ${i}.\n\n- bullet a\n- bullet b\n- bullet c`
      });
    } else {
      generatedNodes.push({
        id: `heavy-${runId}-${i}`,
        x,
        y,
        width: 200,
        height: 120,
        type: "text",
        text: `Heavy node ${i}\nrow=${row} col=${col}\nperf fixture cell to exercise hit-testing and DOM scale.`
      });
    }
  }
  return {
    canvasId: originalState.canvasId || `heavy-${runId}`,
    createdAt: originalState.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [...baseNodes, ...generatedNodes],
    edges: originalState.edges || [],
    viewport: { x: 0, y: 0, z: 0.4 }
  };
}

async function runLighthouseAudit(baseUrl, resultDir, options = {}) {
  if (options.skip) {
    return { skipped: true, skipReason: "disabled by --skip-lighthouse" };
  }
  let lighthouse;
  try {
    lighthouse = (await import("lighthouse")).default;
  } catch {
    return { skipped: true, skipReason: "lighthouse package not installed" };
  }
  let chromeLauncher;
  try {
    chromeLauncher = await import("chrome-launcher");
  } catch {
    return { skipped: true, skipReason: "chrome-launcher package not installed" };
  }
  let chrome;
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
    const result = await lighthouse(`${baseUrl}/cosmoboard`, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"]
    });
    if (!result || !result.lhr) return { skipped: true, skipReason: "no lighthouse result" };
    await writeFile(path.join(resultDir, "lighthouse.json"), JSON.stringify(result.lhr, null, 2), "utf8");
    const categories = {};
    for (const [name, entry] of Object.entries(result.lhr.categories || {})) {
      if (entry && typeof entry.score === "number") categories[name] = entry.score * 100;
    }
    return { skipped: false, categories };
  } catch (error) {
    return { skipped: true, skipReason: `lighthouse error: ${error.message || error}` };
  } finally {
    if (chrome) await chrome.kill().catch(() => {});
  }
}

async function withSwappedBoardCanvas(boardPath, fixtureState, callback) {
  const absoluteBoardPath = path.isAbsolute(boardPath) ? boardPath : path.join(rootDir, boardPath);
  const original = await readFile(absoluteBoardPath);
  await writeFile(absoluteBoardPath, JSON.stringify(fixtureState), "utf8");
  try {
    return await callback();
  } finally {
    await writeFile(absoluteBoardPath, original);
  }
}

async function prepareBenchmarkAssets(runId) {
  const assetDir = path.join(rootDir, TEMP_ASSET_ROOT, runId);
  await mkdir(assetDir, { recursive: true });

  const pdfSource = path.join(rootDir, PARTICIPANT_PDF_PATH);
  const pdfPath = path.join(assetDir, `${runId}-participant-information.pdf`);
  const pdfBytes = await readFile(pdfSource);
  await writeFile(pdfPath, pdfBytes);

  const svgPath = path.join(assetDir, `${runId}-large-image.svg`);
  await writeFile(svgPath, buildLargeSvg(runId), "utf8");

  return {
    assetDir,
    files: [pdfPath, svgPath]
  };
}

async function cleanupTempAssets(assetDir) {
  if (!assetDir) return;
  const safePath = path.normalize(assetDir);
  const allowedRoot = path.normalize(path.join(rootDir, TEMP_ASSET_ROOT));
  if (!safePath.startsWith(allowedRoot)) return;
  await rm(safePath, { recursive: true, force: true });
}

async function cleanupGeneratedBoardAssets(paths, runId = "") {
  const boardDir = path.normalize(path.join(rootDir, "content/boards/cosmoboard"));
  const runPrefix = sanitizeAssetFilename(runId).replace(/\.[a-z0-9]+$/i, "");
  const candidates = new Set(paths.filter(Boolean));
  if (runPrefix) {
    try {
      for (const item of await readdir(boardDir)) {
        if (item.startsWith(runPrefix)) {
          candidates.add(`content/boards/cosmoboard/${item}`);
        }
      }
    } catch {
      // Missing board directory is reported through skipped paths below.
    }
  }
  const deleted = [];
  const skipped = [];

  for (const repoPath of candidates) {
    const relative = String(repoPath).replace(/^\/+/, "").replaceAll("\\", "/");
    const target = path.normalize(path.join(rootDir, relative));
    const basename = path.basename(target);
    const withinBoard = target.startsWith(`${boardDir}${path.sep}`) || target === boardDir;
    const benchmarkPrefixed = basename.startsWith("perf-audit-");

    if (!withinBoard || !benchmarkPrefixed) {
      skipped.push(relative);
      continue;
    }

    try {
      await unlink(target);
      deleted.push(relative);
    } catch {
      skipped.push(relative);
    }
  }

  return { deleted, skipped };
}

async function configureContext(context) {
  await context.addInitScript((keys) => {
    try {
      for (const key of keys) localStorage.removeItem(key);
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith("board:cosmoboard")) localStorage.removeItem(key);
      }
    } catch {
      // Storage can be unavailable on some blank origins; the board origin is cleared on navigation.
    }

    try {
      Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
      Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    } catch {
      // File System Access API is optional; the benchmark uses the input/download fallback path.
    }

    window.__perfLoafEntries = [];
    try {
      if (
        "PerformanceObserver" in window &&
        PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")
      ) {
        const observer = new PerformanceObserver((list) => {
          window.__perfLoafEntries.push(...list.getEntries().map((entry) => ({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
            blockingDuration: entry.blockingDuration || Math.max(0, entry.duration - 50)
          })));
        });
        observer.observe({ type: "long-animation-frame", buffered: true });
        window.__perfLoafObserver = observer;
      }
    } catch {
      window.__perfLoafUnsupported = true;
    }

    window.__perfVitals = { lcp: null, cls: 0, inp: null, eventDurations: [] };
    const supported = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
    try {
      if (supported.includes("largest-contentful-paint")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__perfVitals.lcp = entry.startTime;
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }
    } catch {}
    try {
      if (supported.includes("layout-shift")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__perfVitals.cls += entry.value || 0;
          }
        }).observe({ type: "layout-shift", buffered: true });
      }
    } catch {}
    try {
      if (supported.includes("event")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const duration = entry.duration || 0;
            window.__perfVitals.eventDurations.push(duration);
            if (window.__perfVitals.inp === null || duration > window.__perfVitals.inp) {
              window.__perfVitals.inp = duration;
            }
          }
        }).observe({ type: "event", durationThreshold: 16, buffered: true });
      }
    } catch {}
  }, BOARD_STORAGE_KEYS);
}

async function configurePageCdp(context, page, options = {}) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const throttleRate = Number(options.cpuThrottle) || 0;
  if (throttleRate > 0) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttleRate });
  }
  try {
    await cdp.send("Performance.enable");
  } catch {
    // Performance domain unavailable on some Chromium builds; runtime metrics are then absent.
  }
  return cdp;
}

async function collectRuntimeMetrics(cdp) {
  try {
    const result = await cdp.send("Performance.getMetrics");
    const map = new Map((result.metrics || []).map((entry) => [entry.name, entry.value]));
    return {
      scriptDurationMs: map.has("ScriptDuration") ? map.get("ScriptDuration") * 1000 : null,
      taskDurationMs: map.has("TaskDuration") ? map.get("TaskDuration") * 1000 : null,
      layoutDurationMs: map.has("LayoutDuration") ? map.get("LayoutDuration") * 1000 : null,
      recalcStyleDurationMs: map.has("RecalcStyleDuration") ? map.get("RecalcStyleDuration") * 1000 : null,
      jsHeapUsedSizeMb: map.has("JSHeapUsedSize") ? map.get("JSHeapUsedSize") / (1024 * 1024) : null,
      jsHeapTotalSizeMb: map.has("JSHeapTotalSize") ? map.get("JSHeapTotalSize") / (1024 * 1024) : null,
      documents: map.get("Documents") ?? null,
      nodes: map.get("Nodes") ?? null,
      layoutCount: map.get("LayoutCount") ?? null,
      recalcStyleCount: map.get("RecalcStyleCount") ?? null
    };
  } catch {
    return null;
  }
}

async function collectVitalsMetrics(page) {
  return page.evaluate(() => {
    const vitals = window.__perfVitals || {};
    const events = Array.isArray(vitals.eventDurations) ? vitals.eventDurations : [];
    return {
      lcpMs: typeof vitals.lcp === "number" ? vitals.lcp : null,
      cls: typeof vitals.cls === "number" ? vitals.cls : null,
      inpMs: typeof vitals.inp === "number" ? vitals.inp : null,
      eventCount: events.length
    };
  });
}

async function waitForExpectedBoardNodes(page, expectedNodes) {
  const expectedIds = expectedNodes
    .map((node) => String(node.id || ""))
    .filter(Boolean);
  await page.waitForFunction((ids) => ids.every((id) => document.getElementById(id)), expectedIds, {
    timeout: 60000
  });
}

async function openMeasuredPage(context, baseUrl, expectedNodes, options = {}) {
  await context.clearCookies();
  const page = await context.newPage();
  const cdp = await configurePageCdp(context, page, options);

  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForExpectedBoardNodes(page, expectedNodes);
  const boardReadyMs = await page.evaluate(() => performance.now());
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  return {
    page,
    cdp,
    load: await collectLoadMetrics(page, boardReadyMs)
  };
}

async function collectLoadMetrics(page, boardReadyMs) {
  return page.evaluate((readyMs) => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      navigationMs: nav ? nav.duration : null,
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      loadEventMs: nav ? nav.loadEventEnd : null,
      responseEndMs: nav ? nav.responseEnd : null,
      boardReadyMs: readyMs
    };
  }, boardReadyMs);
}

async function collectResourceMetrics(page) {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType || "other",
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
      duration: entry.duration || 0
    }));
    const byType = {};
    for (const entry of entries) {
      byType[entry.initiatorType] = (byType[entry.initiatorType] || 0) + 1;
    }
    return {
      count: entries.length,
      transferSizeBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
      encodedBodySizeBytes: entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      decodedBodySizeBytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
      byType,
      largest: entries
        .slice()
        .sort((a, b) => b.transferSize - a.transferSize)
        .slice(0, 10)
    };
  });
}

async function collectLongAnimationFrameMetrics(page) {
  return page.evaluate(() => {
    const entries = Array.isArray(window.__perfLoafEntries) ? window.__perfLoafEntries : [];
    return {
      supported: !window.__perfLoafUnsupported,
      count: entries.length,
      totalDurationMs: entries.reduce((sum, entry) => sum + (entry.duration || 0), 0),
      totalBlockingDurationMs: entries.reduce((sum, entry) => sum + (entry.blockingDuration || 0), 0),
      maxDurationMs: entries.reduce((max, entry) => Math.max(max, entry.duration || 0), 0)
    };
  });
}

async function measurePanningFps(page) {
  await page.locator('[data-tool="pan"]').first().click();
  const viewport = page.locator("#braindump-viewport");
  const rect = await viewport.boundingBox();
  if (!rect) throw new Error("Could not locate board viewport for panning benchmark.");

  const startX = rect.x + rect.width * 0.55;
  const startY = rect.y + rect.height * 0.55;
  const durationMs = 1400;
  const steps = 70;

  await page.evaluate((sampleMs) => {
    window.__perfRafSample = new Promise((resolve) => {
      const frameIntervals = [];
      const start = performance.now();
      let last = start;
      function tick(now) {
        frameIntervals.push(now - last);
        last = now;
        if (now - start < sampleMs) {
          requestAnimationFrame(tick);
          return;
        }
        const sorted = frameIntervals.slice().sort((a, b) => a - b);
        const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.95)));
        const maxFrameMs = sorted[sorted.length - 1] || 0;
        const totalMs = now - start;
        const jankyFrameCount = frameIntervals.filter((interval) => interval > 50).length;
        resolve({
          durationMs: totalMs,
          frameCount: frameIntervals.length,
          averageFps: frameIntervals.length / (totalMs / 1000),
          minFps: maxFrameMs > 0 ? 1000 / maxFrameMs : null,
          p95FrameMs: sorted[p95Index] || null,
          maxFrameMs,
          jankyFrameCount,
          jankyFrameRatio: frameIntervals.length ? jankyFrameCount / frameIntervals.length : 0
        });
      }
      requestAnimationFrame(tick);
    });
  }, durationMs + 250);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = startX + Math.sin(t * Math.PI * 2) * 220;
    const y = startY + Math.cos(t * Math.PI * 2) * 120;
    await page.mouse.move(x, y, { steps: 2 });
    await page.waitForTimeout(durationMs / steps);
  }
  await page.mouse.up();

  return page.evaluate(() => window.__perfRafSample);
}

async function measureImport(page, files, mode) {
  const uploadTimings = [];
  const uploadStarts = new Map();

  const onRequest = (request) => {
    if (request.url().includes("/api/save-asset")) {
      uploadStarts.set(request, Date.now());
    }
  };
  const onResponse = async (response) => {
    if (!response.url().includes("/api/save-asset")) return;
    const request = response.request();
    const started = uploadStarts.get(request) || Date.now();
    const requestUrl = new URL(response.url());
    const filename = sanitizeAssetFilename(requestUrl.searchParams.get("filename") || "asset");
    const inferredPath = `content/boards/cosmoboard/${filename}`;
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    uploadTimings.push({
      url: response.url(),
      status: response.status(),
      durationMs: Date.now() - started,
      path: body?.path || inferredPath,
      sizeBytes: request.postDataBuffer()?.length || 0
    });
  };

  page.on("request", onRequest);
  page.on("response", onResponse);

  const beforeCount = await page.locator(".bd-item").count();
  const started = await page.evaluate(() => performance.now());
  await page.locator('[data-board-ui="import-input"]').setInputFiles(files);
  await page.waitForFunction(
    ({ before, expected }) => document.querySelectorAll(".bd-item").length >= before + expected,
    { before: beforeCount, expected: files.length },
    { timeout: 60000 }
  );
  await page.waitForTimeout(500);
  const finished = await page.evaluate(() => performance.now());

  page.off("request", onRequest);
  page.off("response", onResponse);

  return {
    mode,
    durationMs: finished - started,
    fileCount: files.length,
    uploadWriteMs: uploadTimings.reduce((sum, timing) => sum + timing.durationMs, 0),
    uploads: uploadTimings
  };
}

async function withMockedSaveAssetRoute(context, filesByName, callback) {
  const uploads = [];
  const handler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const filename = sanitizeAssetFilename(url.searchParams.get("filename") || "asset");
    const bodySize = request.postDataBuffer()?.length || filesByName.get(filename) || 0;
    uploads.push({ filename, bodySize });
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        success: true,
        slug: "cosmoboard",
        path: `content/boards/cosmoboard/${filename}`,
        url: `/content/boards/cosmoboard/${filename}`
      })
    });
  };

  await context.route("**/api/save-asset?**", handler);
  try {
    const result = await callback();
    result.mockedUploads = uploads;
    return result;
  } finally {
    await context.unroute("**/api/save-asset?**", handler);
  }
}

async function measureExport(page) {
  await page.waitForFunction(() => Boolean(window.fflate), null, { timeout: 30000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  const started = await page.evaluate(() => performance.now());

  const moreButton = page.locator('[data-tool="more"]').first();
  await moreButton.click();
  await page.locator("#braindump-toolbar-actions button[data-tool='export']").click();
  await page.locator("#braindump-export-confirm").click();

  const download = await downloadPromise;
  const downloadedPath = await download.path();
  const finished = await page.evaluate(() => performance.now());
  const sizeBytes = downloadedPath ? (await stat(downloadedPath)).size : null;

  return {
    durationMs: finished - started,
    filename: download.suggestedFilename(),
    sizeBytes
  };
}

async function finalizeScenarioPage(page, cdp, extraMetrics = {}) {
  const [resources, longAnimationFrames, runtime, vitals] = await Promise.all([
    collectResourceMetrics(page),
    collectLongAnimationFrameMetrics(page),
    collectRuntimeMetrics(cdp),
    collectVitalsMetrics(page)
  ]);
  await cdp.detach().catch(() => {});
  await page.close().catch(() => {});

  return {
    ...extraMetrics,
    resources,
    longAnimationFrames,
    runtime,
    vitals
  };
}

async function runBoardLoadPanScenario(context, baseUrl, expectedNodes, iteration, options = {}) {
  const { page, cdp, load } = await openMeasuredPage(context, baseUrl, expectedNodes, options);
  const panFps = await measurePanningFps(page);
  const metrics = await finalizeScenarioPage(page, cdp, { load, panFps });
  return { iteration, metrics };
}

async function runImportScenario(context, baseUrl, expectedNodes, files, iteration, mode, options = {}) {
  const { page, cdp, load } = await openMeasuredPage(context, baseUrl, expectedNodes, options);
  const importMetrics = await measureImport(page, files, mode);
  const metrics = await finalizeScenarioPage(page, cdp, { load, import: importMetrics });
  return { iteration, metrics };
}

async function runExportScenario(context, baseUrl, expectedNodes, iteration, options = {}) {
  const { page, cdp, load } = await openMeasuredPage(context, baseUrl, expectedNodes, options);
  const exportMetrics = await measureExport(page);
  const metrics = await finalizeScenarioPage(page, cdp, { load, export: exportMetrics });
  return { iteration, metrics };
}

function getNested(value, pathValue) {
  return String(pathValue)
    .split(".")
    .reduce((current, key) => (current && current[key] !== undefined ? current[key] : null), value);
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value, digits = 1) {
  const number = numberOrNull(value);
  return number === null ? "" : number.toFixed(digits);
}

export function formatCsvValue(value) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replaceAll('"', '""')}"`;
}

function flattenScenarioIterations(run) {
  const rows = [];
  for (const scenario of run.scenarios || []) {
    (scenario.iterations || []).forEach((iteration, index) => {
      rows.push({
        scenario: scenario.name,
        iteration: iteration.iteration || index + 1,
        metrics: iteration.metrics || {}
      });
    });
  }
  return rows;
}

function averageScenarioMetric(scenario, metricPath) {
  const values = (scenario.iterations || [])
    .map((iteration) => numberOrNull(getNested(iteration.metrics || {}, metricPath)))
    .filter((value) => value !== null);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * q)));
  return sortedValues[index];
}

export function computeStats(values) {
  const numeric = values.map((value) => numberOrNull(value)).filter((value) => value !== null);
  if (!numeric.length) return null;
  const sorted = numeric.slice().sort((a, b) => a - b);
  const sum = numeric.reduce((acc, value) => acc + value, 0);
  return {
    count: numeric.length,
    min: sorted[0],
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    mean: sum / numeric.length
  };
}

function aggregateScenarioMetric(scenario, metricPath) {
  return computeStats(
    (scenario.iterations || []).map((iteration) => getNested(iteration.metrics || {}, metricPath))
  );
}

const AGGREGATE_METRIC_PATHS = [
  "load.boardReadyMs",
  "load.navigationMs",
  "panFps.averageFps",
  "panFps.p95FrameMs",
  "panFps.jankyFrameCount",
  "import.durationMs",
  "import.uploadWriteMs",
  "export.durationMs",
  "export.sizeBytes",
  "resources.count",
  "resources.transferSizeBytes",
  "longAnimationFrames.count",
  "longAnimationFrames.totalBlockingDurationMs",
  "runtime.scriptDurationMs",
  "runtime.jsHeapUsedSizeMb",
  "vitals.lcpMs",
  "vitals.cls",
  "vitals.inpMs"
];

export function buildRunAggregates(run) {
  const byScenario = {};
  for (const scenario of run.scenarios || []) {
    const metrics = {};
    for (const metricPath of AGGREGATE_METRIC_PATHS) {
      const stats = aggregateScenarioMetric(scenario, metricPath);
      if (stats) metrics[metricPath] = stats;
    }
    byScenario[scenario.name] = metrics;
  }
  return { byScenario };
}

export async function findPreviousRunResults(resultRoot, currentTimestampDir) {
  const root = path.isAbsolute(resultRoot) ? resultRoot : path.join(rootDir, resultRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== currentTimestampDir && /^\d{4}-\d{2}-\d{2}T/.test(name))
    .sort()
    .reverse();
  for (const folder of folders) {
    const candidate = path.join(root, folder, "results.json");
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.aggregates) {
        return { folder, results: parsed };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function diffAggregates(previous, current, thresholdPercent = 10) {
  const rows = [];
  if (!previous || !current) return rows;
  const prevByScenario = previous.byScenario || {};
  const currByScenario = current.byScenario || {};
  for (const scenarioName of Object.keys(currByScenario)) {
    const prevMetrics = prevByScenario[scenarioName] || {};
    const currMetrics = currByScenario[scenarioName] || {};
    for (const metricPath of AGGREGATE_METRIC_PATHS) {
      const prevStats = prevMetrics[metricPath];
      const currStats = currMetrics[metricPath];
      if (!prevStats || !currStats) continue;
      const prev = prevStats.p50;
      const curr = currStats.p50;
      const delta = curr - prev;
      const deltaPercent = prev !== 0 ? (delta / prev) * 100 : null;
      const higherIsBetter = /\.(averageFps|minFps)$/.test(metricPath);
      const regressed = deltaPercent !== null
        ? (higherIsBetter ? deltaPercent < -thresholdPercent : deltaPercent > thresholdPercent)
        : false;
      rows.push({ scenario: scenarioName, metricPath, prev, curr, delta, deltaPercent, regressed });
    }
  }
  return rows;
}

const CSV_METRIC_PATHS = [
  "load.boardReadyMs",
  "load.navigationMs",
  "panFps.averageFps",
  "panFps.p95FrameMs",
  "panFps.jankyFrameCount",
  "import.durationMs",
  "import.uploadWriteMs",
  "export.durationMs",
  "export.sizeBytes",
  "resources.count",
  "resources.transferSizeBytes",
  "longAnimationFrames.count",
  "longAnimationFrames.totalBlockingDurationMs",
  "runtime.scriptDurationMs",
  "runtime.jsHeapUsedSizeMb",
  "vitals.lcpMs",
  "vitals.cls",
  "vitals.inpMs"
];

export function buildSummaryCsv(run) {
  const headers = ["runId", "timestamp", "gitSha", "scenario", "iteration", ...CSV_METRIC_PATHS];
  const rows = [headers];
  for (const row of flattenScenarioIterations(run)) {
    rows.push([
      run.runId,
      run.timestamp,
      run.gitSha,
      row.scenario,
      row.iteration,
      ...CSV_METRIC_PATHS.map((metricPath) => getNested(row.metrics, metricPath))
    ]);
  }
  const aggregates = (run.aggregates || buildRunAggregates(run)).byScenario || {};
  for (const [scenarioName, metrics] of Object.entries(aggregates)) {
    for (const stat of ["min", "p50", "p95", "max", "mean"]) {
      rows.push([
        run.runId,
        run.timestamp,
        run.gitSha,
        scenarioName,
        stat,
        ...CSV_METRIC_PATHS.map((metricPath) => metrics[metricPath]?.[stat] ?? null)
      ]);
    }
  }
  return rows.map((row) => row.map(formatCsvValue).join(",")).join("\n") + "\n";
}

function scenarioLabels(run) {
  return (run.scenarios || []).map((scenario) => scenario.name);
}

function mermaidStringList(values) {
  return `[${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(", ")}]`;
}

function mermaidNumberList(values) {
  return `[${values.map((value) => Math.max(0, Number(value) || 0).toFixed(1)).join(", ")}]`;
}

function relevantScenariosFor(run, metricPath) {
  const aggregates = run.aggregates?.byScenario || {};
  const labels = [];
  const values = [];
  for (const scenario of run.scenarios || []) {
    const stats = aggregates[scenario.name]?.[metricPath];
    if (stats && Number.isFinite(stats.p50)) {
      labels.push(scenario.name);
      values.push(stats.p50);
    }
  }
  return { labels, values };
}

function appendXyChart(lines, title, unit, slice) {
  if (!slice.labels.length) return;
  const yMax = Math.max(10, ...slice.values) * 1.25;
  lines.push("```mermaid");
  lines.push("xychart-beta");
  lines.push(`  title "${title}"`);
  lines.push(`  x-axis ${mermaidStringList(slice.labels)}`);
  lines.push(`  y-axis "${unit}" 0 --> ${Math.ceil(yMax)}`);
  lines.push(`  bar ${mermaidNumberList(slice.values)}`);
  lines.push("```", "");
}

function formatStatCell(stats, statKey, digits = 1) {
  if (!stats || stats[statKey] === undefined || stats[statKey] === null) return "";
  return formatNumber(stats[statKey], digits);
}

export function buildReportMarkdown(run) {
  if (!run.aggregates) run.aggregates = buildRunAggregates(run);
  const rows = flattenScenarioIterations(run);
  const aggregates = run.aggregates.byScenario || {};
  const scenarios = run.scenarios || [];

  const lines = [];
  lines.push("# Cosmoboard Performance Audit Report", "");
  lines.push("| Field | Value |", "| --- | --- |");
  lines.push(`| Run ID | ${run.runId || ""} |`);
  lines.push(`| Timestamp | ${run.timestamp || ""} |`);
  lines.push(`| Git SHA | ${run.gitSha || ""} |`);
  lines.push(`| Node | ${run.environment?.node || ""} |`);
  lines.push(`| Platform | ${run.environment?.platform || ""} |`);
  lines.push(`| Chromium | ${run.environment?.chromium || ""} |`);
  lines.push(`| Viewport | ${run.environment?.viewport || "1440x960"} |`);
  lines.push(`| Iterations | ${run.environment?.iterations ?? ""} |`);
  lines.push(`| CPU Throttle | ${run.environment?.cpuThrottle ?? "none"} |`, "");

  lines.push("## Metric Coverage", "");
  lines.push("| Family | Present In Report |", "| --- | --- |");
  lines.push("| Load | navigation timing and board-ready time |");
  lines.push("| Panning FPS | average FPS, p95 frame time, janky-frame count (>50ms) |");
  lines.push("| Import | UI-only and full upload/write duration |");
  lines.push("| Export | bundle duration and artifact size |");
  lines.push("| Resource | count and transfer/encoded/decoded sizes |");
  lines.push("| LoAF | Long Animation Frames count and blocking duration |");
  lines.push("| Runtime | CDP Performance.metrics — script duration, JS heap |");
  lines.push("| Web Vitals | LCP, CLS, INP estimate via PerformanceObserver |");
  lines.push("| Lighthouse | category scores when MCP is reachable |", "");

  lines.push("## Aggregate By Scenario (across iterations)", "");
  lines.push("| Scenario | Metric | min | p50 | p95 | max | mean | n |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  const aggregateMetricsToShow = [
    ["load.boardReadyMs", "Load Ready ms"],
    ["panFps.averageFps", "Pan Avg FPS"],
    ["panFps.p95FrameMs", "Pan p95 frame ms"],
    ["panFps.jankyFrameCount", "Janky frames (>50ms)"],
    ["import.durationMs", "Import ms"],
    ["import.uploadWriteMs", "Upload/Write ms"],
    ["export.durationMs", "Export ms"],
    ["resources.transferSizeBytes", "Transfer bytes"],
    ["longAnimationFrames.totalBlockingDurationMs", "LoAF Blocking ms"],
    ["runtime.scriptDurationMs", "Script ms"],
    ["runtime.jsHeapUsedSizeMb", "JS Heap MB"],
    ["vitals.lcpMs", "LCP ms"],
    ["vitals.cls", "CLS"],
    ["vitals.inpMs", "INP ms"]
  ];
  let aggregateRowsRendered = 0;
  for (const scenario of scenarios) {
    for (const [metricPath, label] of aggregateMetricsToShow) {
      const stats = aggregates[scenario.name]?.[metricPath];
      if (!stats) continue;
      lines.push([
        `| ${scenario.name}`,
        label,
        formatStatCell(stats, "min"),
        formatStatCell(stats, "p50"),
        formatStatCell(stats, "p95"),
        formatStatCell(stats, "max"),
        formatStatCell(stats, "mean"),
        stats.count ?? "",
        "|"
      ].join(" | "));
      aggregateRowsRendered += 1;
    }
  }
  if (!aggregateRowsRendered) {
    lines.push("| _no scenarios produced numeric metrics_ |  |  |  |  |  |  |  |");
  }
  lines.push("");

  if (run.diff && Array.isArray(run.diff.rows)) {
    lines.push(`## Δ vs previous run (\`${run.diff.previousFolder || "unknown"}\`)`, "");
    if (!run.diff.rows.length) {
      lines.push("_No comparable metrics found in the previous run._", "");
    } else {
      lines.push(`Threshold: regression flag at ±${run.diff.thresholdPercent}% on p50.`, "");
      lines.push("| Scenario | Metric | prev p50 | curr p50 | Δ | Δ% | Flag |");
      lines.push("| --- | --- | ---: | ---: | ---: | ---: | :---: |");
      for (const diffRow of run.diff.rows) {
        const flag = diffRow.regressed ? "⚠️" : "";
        lines.push([
          `| ${diffRow.scenario}`,
          diffRow.metricPath,
          formatNumber(diffRow.prev),
          formatNumber(diffRow.curr),
          formatNumber(diffRow.delta),
          diffRow.deltaPercent === null ? "" : formatNumber(diffRow.deltaPercent, 1),
          flag,
          "|"
        ].join(" | "));
      }
      lines.push("");
    }
  } else {
    lines.push("## Δ vs previous run", "", "_No previous run found — this is the baseline._", "");
  }

  lines.push("```mermaid");
  lines.push("flowchart TD");
  lines.push("  A[Fresh Chromium context] --> B[Clear board:cosmoboard storage, settings, cookies]");
  lines.push("  B --> C[Disable HTTP cache with CDP Network.setCacheDisabled]");
  lines.push("  C --> CT[CDP Emulation.setCPUThrottlingRate]");
  lines.push("  CT --> D[Load current /cosmoboard or heavy fixture]");
  lines.push("  D --> E[Wait for expected nodes]");
  lines.push("  E --> F[Pointer panning FPS + janky-frame count]");
  lines.push("  E --> G[Large import UI-only mocked /api/save-asset]");
  lines.push("  E --> H[Large import full upload/write /api/save-asset]");
  lines.push("  E --> I[Export bundle through toolbar UI]");
  lines.push("  E --> LH[Lighthouse audit via chrome-devtools MCP]");
  lines.push("  F --> J[Aggregate p50/p95, diff vs previous, write artifacts]");
  lines.push("  G --> J");
  lines.push("  H --> K[Delete benchmark-prefixed generated assets only]");
  lines.push("  K --> J");
  lines.push("  I --> J");
  lines.push("  LH --> J");
  lines.push("```", "");

  lines.push("```mermaid");
  lines.push("sequenceDiagram");
  lines.push("  participant Runner");
  lines.push("  participant Browser");
  lines.push("  participant Server as Preview Server");
  lines.push("  participant Disk");
  lines.push("  Runner->>Server: start scripts/preview-server.mjs");
  lines.push("  Runner->>Browser: fresh 1440x960 context, cache disable, CPU throttle");
  lines.push("  Browser->>Server: GET /cosmoboard");
  lines.push("  Browser->>Browser: wait for board node IDs");
  lines.push("  Browser->>Browser: real pointer panning, rAF sampling, vitals observers");
  lines.push("  Browser->>Server: POST /api/save-asset in full upload/write mode");
  lines.push("  Server->>Disk: write benchmark-prefixed files");
  lines.push("  Runner->>Disk: delete only those generated files");
  lines.push("  Runner->>Disk: write results.json (with aggregates) for next run's diff");
  lines.push("```", "");

  appendXyChart(lines, "Load Ready ms (p50)", "ms", relevantScenariosFor(run, "load.boardReadyMs"));
  appendXyChart(lines, "Pan Average FPS (p50)", "fps", relevantScenariosFor(run, "panFps.averageFps"));
  appendXyChart(lines, "Import Duration ms (p50)", "ms", relevantScenariosFor(run, "import.durationMs"));
  appendXyChart(lines, "Export Duration ms (p50)", "ms", relevantScenariosFor(run, "export.durationMs"));

  const transferSlice = relevantScenariosFor(run, "resources.transferSizeBytes");
  if (transferSlice.labels.length) {
    lines.push("```mermaid");
    lines.push("pie title Resource Transfer KB by Scenario (p50)");
    transferSlice.labels.forEach((label, index) => {
      const kb = (transferSlice.values[index] || 0) / 1024;
      lines.push(`  "${label}" : ${Math.max(1, Math.round(kb))}`);
    });
    lines.push("```", "");
  }

  if (run.lighthouse) {
    lines.push("## Lighthouse", "");
    if (run.lighthouse.skipped) {
      lines.push(`_Lighthouse skipped: ${run.lighthouse.skipReason || "MCP unavailable"}._`, "");
    } else if (run.lighthouse.categories) {
      lines.push("| Category | Score (0–100) |", "| --- | ---: |");
      for (const [category, score] of Object.entries(run.lighthouse.categories)) {
        lines.push(`| ${category} | ${formatNumber(score, 0)} |`);
      }
      lines.push("");
    }
  }

  lines.push("## Dense Metric Table — Per Iteration", "");
  lines.push("| Scenario | Iteration | Load Ready ms | Pan Avg FPS | Pan p95 ms | Janky | Import ms | Upload/Write ms | Export ms | Artifact KB | Transfer KB | LoAF Blocking ms | LCP ms | CLS | INP ms | JS Heap MB |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const row of rows) {
    lines.push([
      `| ${row.scenario}`,
      row.iteration,
      formatNumber(getNested(row.metrics, "load.boardReadyMs")),
      formatNumber(getNested(row.metrics, "panFps.averageFps")),
      formatNumber(getNested(row.metrics, "panFps.p95FrameMs")),
      getNested(row.metrics, "panFps.jankyFrameCount") ?? "",
      formatNumber(getNested(row.metrics, "import.durationMs")),
      formatNumber(getNested(row.metrics, "import.uploadWriteMs")),
      formatNumber(getNested(row.metrics, "export.durationMs")),
      formatNumber((numberOrNull(getNested(row.metrics, "export.sizeBytes")) || 0) / 1024),
      formatNumber((numberOrNull(getNested(row.metrics, "resources.transferSizeBytes")) || 0) / 1024),
      formatNumber(getNested(row.metrics, "longAnimationFrames.totalBlockingDurationMs")),
      formatNumber(getNested(row.metrics, "vitals.lcpMs")),
      formatNumber(getNested(row.metrics, "vitals.cls"), 3),
      formatNumber(getNested(row.metrics, "vitals.inpMs")),
      formatNumber(getNested(row.metrics, "runtime.jsHeapUsedSizeMb"), 1),
      "|"
    ].join(" | "));
  }
  lines.push("");

  lines.push("## Cleanup", "");
  lines.push("| Deleted Generated Asset |", "| --- |");
  const deleted = run.cleanup?.deletedGeneratedAssets || [];
  if (deleted.length) {
    deleted.forEach((item) => lines.push(`| ${item} |`));
  } else {
    lines.push("| None recorded |");
  }
  lines.push("");

  lines.push("## Artifact Contract", "");
  lines.push("| Artifact | Status |", "| --- | --- |");
  lines.push("| results.json | written |");
  lines.push("| summary.csv | written |");
  lines.push("| report.md | written |");
  lines.push(`| lighthouse.json | ${run.lighthouse && !run.lighthouse.skipped ? "written" : "skipped"} |`);
  lines.push(`| trace.zip | ${run.tracePath ? "written" : "not requested"} |`);

  return lines.join("\n") + "\n";
}

async function filesBySanitizedName(filePaths) {
  const map = new Map();
  for (const filePath of filePaths) {
    const name = sanitizeAssetFilename(path.basename(filePath));
    const stats = await stat(filePath);
    map.set(name, stats.size);
  }
  return map;
}

async function runBenchmark() {
  const options = parseBenchmarkArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const timestamp = new Date().toISOString();
  const timestampDir = timestampForPath(timestamp);
  const runId = `perf-audit-${timestampDir.replace(/z$/i, "Z")}`;
  const resultDir = path.join(rootDir, options.resultRoot, timestampDir);
  await mkdir(resultDir, { recursive: true });

  const boardState = await readJsonFile(BOARD_PATH);
  const expectedNodes = Array.isArray(boardState.nodes) ? boardState.nodes : [];
  const heavyFixture = generateHeavyBoardFixture(runId, boardState);
  const heavyExpectedNodes = (heavyFixture.nodes || []).filter((node) => /^heavy-/.test(node.id));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startPreviewServer(port);
  const preparedAssets = await prepareBenchmarkAssets(runId);
  const filesByName = await filesBySanitizedName(preparedAssets.files);

  let browser = null;
  let context = null;
  let tracePath = null;
  const generatedBoardAssets = [];
  const scenarioOpts = { cpuThrottle: options.cpuThrottle };

  const result = {
    runId,
    timestamp,
    gitSha: getGitSha(),
    environment: {
      node: process.version,
      platform: `${process.platform} ${os.release()}`,
      arch: process.arch,
      cpus: os.cpus().length,
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
      baseUrl,
      iterations: options.iterations,
      cpuThrottle: options.cpuThrottle,
      regressionThreshold: options.regressionThreshold
    },
    scenarios: [
      { name: "board-load-pan", iterations: [] },
      { name: "large-import-ui-only", iterations: [] },
      { name: "large-import-full-upload", iterations: [] },
      { name: "export-bundle", iterations: [] },
      { name: "heavy-board-load-pan", iterations: [] }
    ],
    cleanup: {
      deletedGeneratedAssets: [],
      skippedGeneratedAssets: []
    }
  };

  try {
    await server.ready;
    browser = await chromium.launch();
    result.environment.chromium = browser.version();
    context = await browser.newContext({
      viewport: VIEWPORT,
      acceptDownloads: true
    });
    await configureContext(context);

    if (options.trace) {
      tracePath = path.join(resultDir, "trace.zip");
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      result.tracePath = path.relative(rootDir, tracePath).replaceAll("\\", "/");
    }

    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      result.scenarios[0].iterations.push(
        await runBoardLoadPanScenario(context, baseUrl, expectedNodes, iteration, scenarioOpts)
      );

      result.scenarios[1].iterations.push(
        await withMockedSaveAssetRoute(context, filesByName, () =>
          runImportScenario(context, baseUrl, expectedNodes, preparedAssets.files, iteration, "UI-only mocked /api/save-asset", scenarioOpts)
        )
      );

      const fullImport = await runImportScenario(
        context,
        baseUrl,
        expectedNodes,
        preparedAssets.files,
        iteration,
        "full upload/write /api/save-asset",
        scenarioOpts
      );
      for (const upload of fullImport.metrics.import.uploads || []) {
        if (upload.path) generatedBoardAssets.push(upload.path);
      }
      result.scenarios[2].iterations.push(fullImport);

      result.scenarios[3].iterations.push(
        await runExportScenario(context, baseUrl, expectedNodes, iteration, scenarioOpts)
      );

      if (!options.skipHeavy) {
        const heavyIteration = await withSwappedBoardCanvas(BOARD_PATH, heavyFixture, () =>
          runBoardLoadPanScenario(context, baseUrl, heavyExpectedNodes, iteration, scenarioOpts)
        );
        result.scenarios[4].iterations.push(heavyIteration);
      }
    }

    if (!options.skipLighthouse) {
      result.lighthouse = await runLighthouseAudit(baseUrl, resultDir, { skip: options.skipLighthouse });
    } else {
      result.lighthouse = { skipped: true, skipReason: "disabled by --skip-lighthouse" };
    }

    if (options.trace && context) {
      await context.tracing.stop({ path: tracePath });
    }

    const cleanup = await cleanupGeneratedBoardAssets(generatedBoardAssets, runId);
    result.cleanup.deletedGeneratedAssets = cleanup.deleted;
    result.cleanup.skippedGeneratedAssets = cleanup.skipped;

    result.aggregates = buildRunAggregates(result);

    const previous = await findPreviousRunResults(options.resultRoot, timestampDir);
    if (previous) {
      result.diff = {
        previousFolder: previous.folder,
        previousRunId: previous.results.runId,
        thresholdPercent: options.regressionThreshold,
        rows: diffAggregates(previous.results.aggregates, result.aggregates, options.regressionThreshold)
      };
    }

    await writeFile(path.join(resultDir, "results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await writeFile(path.join(resultDir, "summary.csv"), buildSummaryCsv(result), "utf8");
    await writeFile(path.join(resultDir, "report.md"), buildReportMarkdown(result), "utf8");

    console.log(`Performance audit complete: ${path.relative(rootDir, resultDir).replaceAll("\\", "/")}`);
  } finally {
    if (context) {
      if (options.trace && tracePath && !existsSync(tracePath)) {
        await context.tracing.stop({ path: tracePath }).catch(() => {});
      }
      await context.close().catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    server.stop();
    await cleanupTempAssets(preparedAssets.assetDir);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  runBenchmark().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
