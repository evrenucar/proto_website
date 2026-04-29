#!/usr/bin/env node
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const contentDir = path.join(rootDir, "content");

const dryRun = process.argv.includes("--dry-run");

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function isCanvasFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".canvas") || lower.endsWith(".canvas.json");
}

const summary = { scanned: 0, updated: 0, skipped: 0, errors: 0 };

for await (const filePath of walk(contentDir)) {
  if (!isCanvasFile(filePath)) continue;
  summary.scanned += 1;

  const rel = path.relative(rootDir, filePath).replaceAll("\\", "/");
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    summary.errors += 1;
    console.error(`! read failed: ${rel} — ${err.message}`);
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    summary.errors += 1;
    console.error(`! parse failed: ${rel} — ${err.message}`);
    continue;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    summary.skipped += 1;
    continue;
  }

  const hasId = typeof parsed.canvasId === "string" && parsed.canvasId.length > 0;
  const hasCreated = typeof parsed.createdAt === "string" && parsed.createdAt.length > 0;
  const hasUpdated = typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0;

  if (hasId && hasCreated && hasUpdated) {
    summary.skipped += 1;
    continue;
  }

  let mtimeIso;
  try {
    const st = await stat(filePath);
    mtimeIso = st.mtime.toISOString();
  } catch {
    mtimeIso = new Date().toISOString();
  }

  const rest = Object.fromEntries(
    Object.entries(parsed).filter(([k]) => k !== "canvasId" && k !== "createdAt" && k !== "updatedAt")
  );
  const next = {
    canvasId: hasId ? parsed.canvasId : randomUUID(),
    createdAt: hasCreated ? parsed.createdAt : mtimeIso,
    updatedAt: hasUpdated ? parsed.updatedAt : mtimeIso,
    ...rest
  };

  const added = [];
  if (!hasId) added.push(`canvasId=${next.canvasId}`);
  if (!hasCreated) added.push(`createdAt=${next.createdAt}`);
  if (!hasUpdated) added.push(`updatedAt=${next.updatedAt}`);

  if (dryRun) {
    console.log(`~ would update: ${rel} (${added.join(", ")})`);
    summary.updated += 1;
    continue;
  }

  try {
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    summary.updated += 1;
    console.log(`+ updated: ${rel} (${added.join(", ")})`);
  } catch (err) {
    summary.errors += 1;
    console.error(`! write failed: ${rel} — ${err.message}`);
  }
}

console.log("");
console.log(`scanned=${summary.scanned} updated=${summary.updated} skipped=${summary.skipped} errors=${summary.errors}${dryRun ? " (dry-run)" : ""}`);
