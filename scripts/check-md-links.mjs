#!/usr/bin/env node
/**
 * check-md-links.mjs
 *
 * Walks every .md file in the repo, resolves relative markdown links against
 * the filesystem, and reports broken ones.
 *
 * Usage:  node scripts/check-md-links.mjs [--quiet]
 *
 * Exit code 0 = 0 broken links; 1 = at least one broken link.
 *
 * Out of scope: HTML <a href> tags (skipped silently).
 * Reference-style [text][ref] links are skipped (inline style dominates repo).
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const quiet = process.argv.includes("--quiet");

// Directories to skip entirely during walk
const SKIP_DIRS = new Set(["node_modules", ".git", ".archive", ".tmp"]);

// Also skip by prefix
function shouldSkipDir(name) {
  return (
    SKIP_DIRS.has(name) ||
    name.startsWith(".tmp_preview_server") ||
    name === "worktrees" // .claude/worktrees — parallel agent checkouts, not part of this tree
  );
}

/** Collect all .md files under root recursively. */
function collectMdFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        results.push(...collectMdFiles(path.join(dir, entry.name)));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/** Strip fenced code blocks (``` ... ```) from text. */
function stripFencedBlocks(text) {
  return text.replace(/^```[\s\S]*?^```/gm, "");
}

/** Strip inline code spans. Longest delimiter first to avoid partial matches. */
function stripInlineCode(text) {
  text = text.replace(/```[^`][\s\S]*?```/g, "``"); // triple-backtick (after fenced blocks already removed)
  text = text.replace(/``[\s\S]*?``/g, "``");        // double-backtick (may contain single backticks)
  text = text.replace(/`[^`]*`/g, "``");             // single-backtick
  return text;
}

/**
 * Extract all inline markdown links from text.
 * Returns array of { text, url, line }.
 * Handles both [text](url) and ![alt](url).
 * Skips reference-style [text][ref].
 */
function extractLinks(raw) {
  const cleaned = stripInlineCode(stripFencedBlocks(raw));
  const lines = cleaned.split("\n");
  const found = [];

  // Matches optional ! for images, then [text](url)
  const linkRe = /!?\[([^\]]*)\]\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    let m;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(lines[i])) !== null) {
      found.push({ text: m[1], url: m[2], line: i + 1 });
    }
  }
  return found;
}

/** Returns true if the link should be skipped (absolute, mailto, anchor-only, tel, root-relative). */
function isSkippedScheme(url) {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    url.startsWith("#") ||
    url.startsWith("/") // root-relative web paths (/en/docs/...) — not local FS links
  ) {
    return true;
  }
  // Windows absolute paths like C:/Users/... or drive-letter paths
  if (/^[A-Za-z]:[\\/]/.test(url)) return true;
  return false;
}

/** Strip #anchor and ?query from a URL path before resolving. */
function stripSuffix(url) {
  return url.replace(/[?#].*$/, "");
}

// --- Main ---

const mdFiles = collectMdFiles(ROOT);

let totalLinks = 0;
let totalBroken = 0;
const groupedOutput = [];

for (const file of mdFiles) {
  const raw = readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const links = extractLinks(raw);

  // Resolve each link once: compute target, skip absolute/anchor-only, then check disk
  const checks = links.flatMap((l) => {
    const target = stripSuffix(l.url);
    return !isSkippedScheme(l.url) && target ? [{ ...l, target }] : [];
  });
  totalLinks += checks.length;

  for (const { text, url, line, target } of checks) {
    const resolved = path.resolve(dir, target);
    if (!existsSync(resolved)) {
      totalBroken++;
      if (!quiet) {
        const rel = path.relative(ROOT, file).replaceAll("\\", "/");
        const resolvedRel = path.relative(ROOT, resolved).replaceAll("\\", "/");
        groupedOutput.push(`${rel}:${line}: broken link [${text}](${url}) → ${resolvedRel}`);
      }
    }
  }
}

if (!quiet && groupedOutput.length > 0) {
  console.log(groupedOutput.join("\n"));
}

console.log(
  `\nChecked ${totalLinks} links across ${mdFiles.length} files. ${totalBroken} broken.`
);

process.exit(totalBroken > 0 ? 1 : 0);
