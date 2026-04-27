import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const EXTENSION_BY_MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"]
]);

function sanitizeSegment(value, fallback = "asset") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function stripCanvasExtension(filename) {
  return String(filename || "canvas")
    .replace(/\.canvas\.json$/i, "")
    .replace(/\.canvas$/i, "")
    .replace(/\.json$/i, "");
}

function normalizeAssetPrefix(value) {
  return String(value || "content/assets/images")
    .replace(/\\/g, "/")
    .replace(/\/+$/g, "");
}

function parseDataImageUrl(value) {
  const match = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const extension = EXTENSION_BY_MIME.get(mime);
  if (!extension) return null;

  return {
    mime,
    extension,
    buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64")
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function getAvailableAssetTarget(assetsDir, baseName, extension, usedFilenames) {
  let suffix = "";
  let index = 1;

  while (true) {
    const filename = `${baseName}${suffix}.${extension}`;
    const targetPath = path.join(assetsDir, filename);
    if (!usedFilenames.has(filename) && !(await pathExists(targetPath))) {
      usedFilenames.add(filename);
      return { filename, targetPath };
    }
    index += 1;
    suffix = `-${index}`;
  }
}

async function replaceDataImagesInValue(value, context) {
  if (typeof value === "string") {
    const parsed = parseDataImageUrl(value);
    if (!parsed) return value;

    const fieldSegment = sanitizeSegment(context.pathSegments.join("-"), "asset");
    const assetBase = sanitizeSegment(`${context.canvasSlug}-${context.nodeId}-${fieldSegment}`);
    const { filename, targetPath } = await getAvailableAssetTarget(
      context.assetsDir,
      assetBase,
      parsed.extension,
      context.usedFilenames
    );
    const assetPath = `${context.assetPathPrefix}/${filename}`;

    await writeFile(targetPath, parsed.buffer);
    context.assets.push({
      nodeId: context.nodeId,
      field: context.pathSegments.join("."),
      mime: parsed.mime,
      file: targetPath,
      path: assetPath,
      bytes: parsed.buffer.length
    });

    return assetPath;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = await replaceDataImagesInValue(value[index], {
        ...context,
        pathSegments: [...context.pathSegments, String(index)]
      });
    }
    return value;
  }

  if (value && typeof value === "object") {
    for (const [key, childValue] of Object.entries(value)) {
      value[key] = await replaceDataImagesInValue(childValue, {
        ...context,
        pathSegments: [...context.pathSegments, key]
      });
    }
  }

  return value;
}

export async function extractCanvasAssets(options) {
  const canvasPath = path.resolve(options?.canvasPath || "");
  const assetsDir = path.resolve(options?.assetsDir || path.join(rootDir, "content", "assets", "images"));
  const assetPathPrefix = normalizeAssetPrefix(options?.assetPathPrefix || "content/assets/images");
  const canvasSlug = sanitizeSegment(stripCanvasExtension(path.basename(canvasPath)), "canvas");

  await mkdir(assetsDir, { recursive: true });

  const rawCanvas = await readFile(canvasPath, "utf8");
  const canvas = JSON.parse(rawCanvas);
  const assets = [];
  const usedFilenames = new Set();

  if (Array.isArray(canvas.nodes)) {
    for (let index = 0; index < canvas.nodes.length; index += 1) {
      const node = canvas.nodes[index];
      if (!node || typeof node !== "object") continue;

      const nodeId = sanitizeSegment(node.id || `node-${index + 1}`, `node-${index + 1}`);
      await replaceDataImagesInValue(node, {
        assets,
        assetsDir,
        assetPathPrefix,
        canvasSlug,
        nodeId,
        pathSegments: [],
        usedFilenames
      });
    }
  }

  await writeFile(canvasPath, `${JSON.stringify(canvas, null, 2)}\n`, "utf8");

  return {
    canvasPath,
    assetsDir,
    assetPathPrefix,
    extracted: assets.length,
    assets
  };
}

function parseCliArgs(argv) {
  const args = [...argv];
  const options = {};

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--assets-dir") {
      options.assetsDir = args.shift();
    } else if (arg === "--path-prefix") {
      options.assetPathPrefix = args.shift();
    } else if (!options.canvasPath) {
      options.canvasPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!options.canvasPath || !options.assetsDir && argv.includes("--assets-dir") || !options.assetPathPrefix && argv.includes("--path-prefix")) {
    throw new Error("Usage: npm run extract-assets -- <canvas-file> [--assets-dir content/assets/images] [--path-prefix content/assets/images]");
  }

  return options;
}

async function runCli() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = await extractCanvasAssets(options);
    console.log(`Extracted ${result.extracted} asset${result.extracted === 1 ? "" : "s"} from ${path.relative(process.cwd(), result.canvasPath)}`);
    for (const asset of result.assets) {
      console.log(`- ${asset.path}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await runCli();
}
