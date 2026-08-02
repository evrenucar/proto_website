// Deterministic generator for the Cosmoboard performance benchmark board.
//
// Given the same spec (seed plus node counts) this emits byte-identical JSON,
// every time, on every machine. That is the whole point: a benchmark you
// cannot regenerate is a benchmark you cannot trust six months from now.
//
// Nothing here touches the filesystem unless you run it as a CLI, and the CLI
// refuses to write anywhere under content/. The driver
// (tests/perf/run-benchmark.mjs) does not write the board to disk at all: it
// serves this JSON straight into the page by intercepting the canvas fetch,
// so a benchmark run cannot leave debris in a real board.
//
//   node tests/perf/generate-benchmark-board.mjs --out .tmp/perf-bench/board.canvas
//   node tests/perf/generate-benchmark-board.mjs --seed 7 --videos 20 --print-summary
//
// Node shapes follow content/boards/CANVAS_FORMAT.md as the runtime reads it:
//   text     { type:"text", text }
//   image    { type:"file", file, title, hasAdjustedRatio }
//   markdown { type:"markdown", title, file, href, _rawMarkdown, markdownId }
//   video    { type:"link", url:<youtube watch url>, title, embedMode }

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Frozen identity. A benchmark board is a fixture, not a document, so nothing
// in it may vary with wall-clock time or the machine it was made on.
export const BENCH_CANVAS_ID = "b3n1c4ma-0000-4000-8000-c05m0b0a5d01";
export const BENCH_CREATED_AT = "2026-08-01T00:00:00.000Z";
export const BENCH_UPDATED_AT = "2026-08-01T00:00:00.000Z";

export const ASSET_PREFIX = "/perf-bench-assets";

export const DEFAULT_SPEC = Object.freeze({
  seed: 20260801,
  videos: 12,
  images: 12,
  notes: 12,
  texts: 24,
  // Grid geometry. Cells are wider than the widest node so nothing overlaps,
  // which keeps hit-testing and the drag phase honest.
  cols: 8,
  cellWidth: 520,
  cellHeight: 460,
  originX: -1200,
  originY: -700,
  // Opening camera. Derived from the layout rather than hand-picked, so every
  // run starts with the same nodes on screen. Otherwise "which embeds were
  // near the viewport" varies run to run and the numbers stop being
  // comparable. This is a fixture camera; it is written into the benchmark
  // board only, never into a real board.
  zoom: 0.55,
  marginX: 60,
  marginY: 160,
});

// mulberry32: 32-bit, no dependencies, identical output on every platform
// because every operation stays inside uint32 range.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "board", "camera", "canvas", "cursor", "drag", "embed", "frame", "gesture",
  "handle", "iframe", "jitter", "layout", "marker", "node", "offset", "paint",
  "quantise", "raster", "select", "toolbar", "undo", "viewport", "wheel", "zoom",
  "budget", "commit", "delta", "engine", "fixture", "graph", "hinge", "index",
];

function words(rand, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(WORDS[Math.floor(rand() * WORDS.length)]);
  return out;
}

function sentence(rand, wordCount) {
  const list = words(rand, wordCount);
  const text = list.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function paragraph(rand, sentences) {
  const out = [];
  for (let i = 0; i < sentences; i++) out.push(sentence(rand, 6 + Math.floor(rand() * 9)));
  return out.join(" ");
}

// Eleven characters, the shape of a real YouTube id, so the runtime's id
// parser takes the same path it takes for a real video.
function benchVideoId(index) {
  return `PERFb${String(index).padStart(6, "0")}`;
}

function buildMarkdown(rand, index) {
  const lines = [
    `# Benchmark note ${index}`,
    "",
    paragraph(rand, 3),
    "",
    "## Why this note exists",
    "",
    paragraph(rand, 2),
    "",
    "- " + sentence(rand, 7),
    "- " + sentence(rand, 5) + " with `inline code`",
    "- a [link](https://example.com) and an _emphasis_ run",
    "",
    "## Numbers",
    "",
    "| phase | p95 | worst |",
    "| --- | --- | --- |",
    `| zoom | ${(rand() * 200).toFixed(1)}ms | ${(rand() * 400).toFixed(1)}ms |`,
    `| drag | ${(rand() * 200).toFixed(1)}ms | ${(rand() * 400).toFixed(1)}ms |`,
    "",
    "```js",
    "const budget = 1000 / 60;",
    "const lost = deltas.reduce((n, d) => n + Math.max(0, Math.round(d / budget) - 1), 0);",
    "```",
    "",
    paragraph(rand, 4),
    "",
  ];
  return lines.join("\n");
}

/**
 * Build the benchmark board.
 * @param {Partial<typeof DEFAULT_SPEC>} overrides
 * @returns {{ spec: object, canvas: object, json: string, sha256: string, counts: object }}
 */
export function generateBenchmarkBoard(overrides = {}) {
  const spec = { ...DEFAULT_SPEC, ...overrides };
  for (const key of ["seed", "videos", "images", "notes", "texts", "cols"]) {
    if (!Number.isInteger(spec[key]) || spec[key] < 0) {
      throw new Error(`benchmark spec.${key} must be a non-negative integer, got ${spec[key]}`);
    }
  }
  if (spec.cols < 1) throw new Error("benchmark spec.cols must be at least 1");

  const rand = mulberry32(spec.seed);

  // Round-robin the four kinds so every screenful holds a mix. A block of 24
  // videos in one corner would make the camera position decide the result.
  const order = [];
  const remaining = { video: spec.videos, image: spec.images, markdown: spec.notes, text: spec.texts };
  const cycle = ["video", "image", "markdown", "text", "text"];
  let guard = 0;
  while (Object.values(remaining).some((n) => n > 0)) {
    for (const kind of cycle) {
      if (remaining[kind] > 0) {
        order.push(kind);
        remaining[kind] -= 1;
      }
    }
    if (++guard > 100000) throw new Error("benchmark layout failed to converge");
  }

  // Row 0 is reserved for the drag target, so the drag phase always has a
  // plain text node it can grab. A live embed can only be grabbed by its
  // header (.bd-embed-shield swallows mousedown over the iframe), and an
  // image node resizes by ratio, so neither makes an honest drag subject.
  const gridOriginY = spec.originY + spec.cellHeight;

  const counters = { video: 0, image: 0, markdown: 0, text: 0 };
  const nodes = order.map((kind, i) => {
    const col = i % spec.cols;
    const row = Math.floor(i / spec.cols);
    const x = spec.originX + col * spec.cellWidth;
    const y = gridOriginY + row * spec.cellHeight;
    const n = ++counters[kind];

    if (kind === "video") {
      return {
        id: `perf-video-${n}`,
        x,
        y,
        width: 420,
        height: 236,
        type: "link",
        url: `https://www.youtube.com/watch?v=${benchVideoId(n)}`,
        title: `Benchmark video ${n}`,
        embedMode: "live",
      };
    }
    if (kind === "image") {
      // Sizes vary deterministically so the layout is not a perfect lattice
      // and image scaling costs differ node to node, as on a real board.
      const width = 320 + Math.floor(rand() * 5) * 20;
      return {
        id: `perf-image-${n}`,
        x,
        y,
        width,
        height: Math.round((width * 400) / 640),
        type: "file",
        file: `${ASSET_PREFIX}/img-${n}.png`,
        title: `Benchmark image ${n}`,
        hasAdjustedRatio: true,
      };
    }
    if (kind === "markdown") {
      return {
        id: `perf-note-${n}`,
        x,
        y,
        width: 420,
        height: 380,
        type: "markdown",
        title: `Benchmark note ${n}`,
        file: `${ASSET_PREFIX}/note-${n}.md`,
        href: `${ASSET_PREFIX}/note-${n}.md`,
        markdownId: `cosmo-note-perf-bench-${n}`,
        markdownUpdatedAt: BENCH_UPDATED_AT,
        _rawMarkdown: buildMarkdown(rand, n),
      };
    }
    return {
      id: `perf-text-${n}`,
      x,
      y,
      width: 340,
      height: 180,
      type: "text",
      text: `Benchmark text ${n}. ${paragraph(rand, 2)}`,
    };
  });

  nodes.unshift({
    id: "perf-drag-handle",
    x: spec.originX + spec.cellWidth,
    y: spec.originY,
    width: 340,
    height: 170,
    type: "text",
    text: "Drag target. The benchmark grabs this node for the drag phase.",
  });

  // Camera placed so the board's top-left corner lands at (marginX, marginY)
  // on screen, which puts the drag target in the upper-left quadrant and a
  // mixed screenful of videos, images, notes and text below it.
  const camera = {
    x: Number((spec.marginX - spec.originX * spec.zoom).toFixed(4)),
    y: Number((spec.marginY - spec.originY * spec.zoom).toFixed(4)),
    z: spec.zoom,
  };

  const canvas = {
    canvasId: BENCH_CANVAS_ID,
    createdAt: BENCH_CREATED_AT,
    updatedAt: BENCH_UPDATED_AT,
    generator: {
      name: "cosmoboard-perf-benchmark",
      version: 1,
      spec: {
        seed: spec.seed,
        videos: spec.videos,
        images: spec.images,
        notes: spec.notes,
        texts: spec.texts,
        cols: spec.cols,
        zoom: spec.zoom,
      },
    },
    nodes,
    edges: [],
    viewport: { ...camera },
    defaultViewport: { ...camera },
  };

  const json = `${JSON.stringify(canvas, null, 2)}\n`;
  return {
    spec,
    canvas,
    json,
    sha256: createHash("sha256").update(json, "utf8").digest("hex"),
    counts: {
      video: counters.video,
      image: counters.image,
      markdown: counters.markdown,
      text: counters.text + 1, // the drag handle is a text node too
      total: nodes.length,
    },
  };
}

/** The markdown body served for a note's sidecar path, same bytes as inline. */
export function benchmarkNoteMarkdown(board, index) {
  const node = board.canvas.nodes.find((n) => n.id === `perf-note-${index}`);
  return node ? node._rawMarkdown : "";
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const spec = {};
  for (const key of ["seed", "videos", "images", "notes", "texts", "cols"]) {
    if (args[key] !== undefined) spec[key] = Number(args[key]);
  }
  const board = generateBenchmarkBoard(spec);

  if (args.out) {
    const target = path.resolve(String(args.out));
    const contentDir = path.resolve("content");
    if (target === contentDir || target.startsWith(contentDir + path.sep)) {
      console.error("refusing to write the benchmark board under content/. Use .tmp/ or tests/fixtures/.");
      process.exit(2);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, board.json, "utf8");
    console.log(`wrote ${target}`);
  } else {
    process.stdout.write(board.json);
  }

  if (args["print-summary"] || args.out) {
    const c = board.counts;
    console.error(
      `seed ${board.spec.seed} | ${c.total} nodes: ${c.video} video, ${c.image} image, ` +
        `${c.markdown} markdown, ${c.text} text | sha256 ${board.sha256.slice(0, 16)}`
    );
  }
}
