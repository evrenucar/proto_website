import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const port = 4182;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(process.cwd(), ".tmp", "export-bundling-e2e");
const bundlePath = path.join(outDir, "portable-project-bundle.zip");

const textEncoder = new TextEncoder();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset);
}

function writeUint32(buffer, offset, value) {
  buffer.writeUInt32LE(value >>> 0, offset);
}

function createStoredZip(entries) {
  const fileRecords = [];
  const chunks = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBytes = textEncoder.encode(name);
    const data = content instanceof Uint8Array ? content : textEncoder.encode(String(content));
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, crc);
    writeUint32(localHeader, 18, data.length);
    writeUint32(localHeader, 22, data.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, Buffer.from(data));
    fileRecords.push({ nameBytes, data, crc, offset });
    offset += localHeader.length + data.length;
  }

  const centralDirectoryOffset = offset;
  for (const record of fileRecords) {
    const centralHeader = Buffer.alloc(46 + record.nameBytes.length);

    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, 0);
    writeUint16(centralHeader, 14, 0);
    writeUint32(centralHeader, 16, record.crc);
    writeUint32(centralHeader, 20, record.data.length);
    writeUint32(centralHeader, 24, record.data.length);
    writeUint16(centralHeader, 28, record.nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, record.offset);
    centralHeader.set(record.nameBytes, 46);

    chunks.push(centralHeader);
    offset += centralHeader.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = Buffer.alloc(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, fileRecords.length);
  writeUint16(endRecord, 10, fileRecords.length);
  writeUint32(endRecord, 12, centralDirectorySize);
  writeUint32(endRecord, 16, centralDirectoryOffset);
  writeUint16(endRecord, 20, 0);
  chunks.push(endRecord);

  return Buffer.concat(chunks);
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

await mkdir(outDir, { recursive: true });

const boardState = {
  nodes: [
    {
      id: "bundle-image",
      type: "file",
      x: 120,
      y: 140,
      width: 160,
      height: 110,
      file: "assets/bundle-image.svg"
    },
    {
      id: "bundle-markdown",
      type: "markdown",
      x: 340,
      y: 120,
      width: 360,
      height: 260,
      file: "markdown/bundle-note.md",
      title: "Bundled markdown"
    },
    {
      id: "bundle-board",
      type: "board-preview",
      x: 760,
      y: 120,
      width: 340,
      height: 300,
      boardSlug: "nested-bundle",
      boardSource: "boards/nested.canvas",
      title: "Nested bundle board"
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, z: 1 }
};

const nestedBoardState = {
  nodes: [
    {
      id: "nested-note",
      type: "text",
      x: 40,
      y: 40,
      width: 220,
      height: 120,
      text: "Nested board survived bundle import"
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, z: 1 }
};

const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="110"><rect width="160" height="110" fill="#153d42"/><circle cx="80" cy="55" r="32" fill="#3fdaca"/></svg>`;
const markdown = "# Bundled markdown\n\nThis note survived bundle import.";

await writeFile(
  bundlePath,
  createStoredZip([
    ["board.canvas", JSON.stringify(boardState)],
    ["assets/bundle-image.svg", imageSvg],
    ["markdown/bundle-note.md", markdown],
    ["boards/nested.canvas", JSON.stringify(nestedBoardState)]
  ])
);

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
try {
  await waitForServer(child);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(`${baseUrl}/cosmoboard`, { waitUntil: "networkidle", timeout: 15000 });
  await page.evaluate(() => {
    localStorage.removeItem("board:cosmoboard");
  });
  await page.reload({ waitUntil: "networkidle", timeout: 15000 });

  await page.locator("[data-tool='more']").click();
  await page.locator(".braindump-toolbar-actions.is-open [data-tool='export']").click();
  await page.locator("#braindump-export-modal:not([hidden])").waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(outDir, "export-modal.png"), fullPage: true });
  await page.locator("#braindump-export-cancel").click();

  await page.locator("#braindump-import").setInputFiles(bundlePath);
  await page.waitForFunction(() => {
    const rawState = localStorage.getItem("board:cosmoboard");
    if (!rawState) return false;
    const state = JSON.parse(rawState);
    return state.nodes?.some((node) => node.type === "file" && String(node.file).startsWith("blob:")) &&
      state.nodes?.some((node) => node.type === "markdown" && String(node.file).startsWith("blob:")) &&
      state.nodes?.some((node) => node.type === "board-preview" && String(node.boardSource).startsWith("blob:"));
  }, { timeout: 5000 });

  await page.waitForSelector(".bd-markdown-body h1", { timeout: 5000 });
  await page.waitForFunction(() => document.body.innerText.includes("Nested bundle board"), null, { timeout: 5000 });
  await page.screenshot({ path: path.join(outDir, "imported-bundle.png"), fullPage: true });

  const importedState = await page.evaluate(() => JSON.parse(localStorage.getItem("board:cosmoboard")));
  assert.equal(importedState.nodes.length, 3);
  assert.equal(importedState.nodes.filter((node) => String(node.file || node.boardSource || "").startsWith("blob:")).length, 3);
} finally {
  if (browser) await browser.close();
  child.kill();
}

console.log("export bundling browser import check passed");
