import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "src", "notion-public-pages.json");
const outputPath = path.join(rootDir, "src", "notion-items.json");
const notionAssetsDir = path.join(rootDir, "notion_assets");
const syncCacheVersion = 1;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSection(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");

  if (["project", "projects"].includes(normalized)) {
    return "projects";
  }

  if (
    ["things-i-do", "things i do", "thing", "things", "things_i_do", "making"].includes(
      normalized
    )
  ) {
    return "things_i_do";
  }

  if (["open-quests", "open quests", "open quest", "open_quests"].includes(normalized)) {
    return "open-quests";
  }

  return "";
}

function normalizeActionType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["page", "internal"].includes(normalized)) {
    return "page";
  }

  if (["external", "url", "link"].includes(normalized)) {
    return "external";
  }

  if (["status", "label"].includes(normalized)) {
    return "status";
  }

  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(value || "");
}

function parseNotionPageId(value) {
  const match = String(value || "").match(/([0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27})/);

  if (!match) {
    return "";
  }

  const raw = match[1].replaceAll("-", "");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function normalizeTextEncoding(value) {
  const text = String(value || "");

  if (!/[Ãâ]/.test(text)) {
    return text;
  }

  try {
    const decoded = Buffer.from(text, "latin1").toString("utf8");
    return decoded.includes("\uFFFD") ? text : decoded;
  } catch (error) {
    return text;
  }
}

function propertyValueToPlainText(value) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((segment) => {
      if (!Array.isArray(segment)) {
        return "";
      }

      return normalizeTextEncoding(segment[0] || "");
    })
    .join("")
    .trim();
}

function fileExtensionFromUrl(url, fallback = ".bin") {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname);
    return extension || fallback;
  } catch (error) {
    return fallback;
  }
}

function sanitizeFileName(value) {
  return slugify(value || "asset") || "asset";
}

function formatLastUpdated(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }

  return new Date(timestamp).toISOString();
}

async function loadJsonIfExists(filePath) {
  try {
    await access(filePath);
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }

    return null;
  }
}

async function notionRequest(endpoint, body) {
  const response = await fetch(`https://www.notion.so/api/v3/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Notion request failed for ${endpoint}: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();

  if (data?.message && data?.errorId) {
    throw new Error(`Notion request failed for ${endpoint}: ${data.message}`);
  }

  return data;
}

async function removeAssetDirectory(slug) {
  if (!slug) {
    return;
  }

  await rm(path.join(notionAssetsDir, slug), { recursive: true, force: true });
}

function mergeRecordMaps(baseRecordMap, nextRecordMap) {
  if (!nextRecordMap) {
    return baseRecordMap;
  }

  for (const [table, entries] of Object.entries(nextRecordMap)) {
    if (table === "__version__") {
      continue;
    }

    if (!baseRecordMap[table]) {
      baseRecordMap[table] = {};
    }

    Object.assign(baseRecordMap[table], entries || {});
  }

  return baseRecordMap;
}

function getBlock(recordMap, blockId) {
  return recordMap?.block?.[blockId]?.value?.value || null;
}

function collectMissingChildIds(recordMap, rootId) {
  const missing = new Set();
  const visited = new Set();
  const queue = [rootId];

  while (queue.length > 0) {
    const blockId = queue.shift();

    if (!blockId || visited.has(blockId)) {
      continue;
    }

    visited.add(blockId);
    const block = getBlock(recordMap, blockId);

    if (!block || !Array.isArray(block.content)) {
      continue;
    }

    for (const childId of block.content) {
      const childBlock = getBlock(recordMap, childId);

      if (!childBlock) {
        missing.add(childId);
      } else if (!visited.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return [...missing];
}

async function loadPageRecordMap(pageId) {
  const pageChunk = await notionRequest("loadPageChunk", {
    pageId,
    limit: 100,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false
  });
  const recordMap = mergeRecordMaps({}, pageChunk.recordMap || {});
  let pendingIds = collectMissingChildIds(recordMap, pageId);

  while (pendingIds.length > 0) {
    const synced = await notionRequest("syncRecordValues", {
      requests: pendingIds.map((blockId) => ({
        table: "block",
        id: blockId,
        version: -1
      }))
    });

    mergeRecordMaps(recordMap, synced.recordMap || {});
    pendingIds = collectMissingChildIds(recordMap, pageId);
  }

  return recordMap;
}

async function loadPageMetaBlock(pageId) {
  const synced = await notionRequest("syncRecordValues", {
    requests: [
      {
        table: "block",
        id: pageId,
        version: -1
      }
    ]
  });

  return getBlock(synced.recordMap || {}, pageId);
}

async function getSignedFileUrl(blockId, source) {
  if (!source) {
    return "";
  }

  if (!source.startsWith("attachment:")) {
    return source;
  }

  const response = await notionRequest("getSignedFileUrls", {
    urls: [
      {
        permissionRecord: {
          table: "block",
          id: blockId
        },
        url: source
      }
    ]
  });

  return response?.signedUrls?.[0] || "";
}

async function downloadAsset(url, slug, fileNameHint) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Asset download failed: ${response.status} ${url}`);
  }

  const extension = fileExtensionFromUrl(url);
  const assetDir = path.join(notionAssetsDir, slug);
  const relativeDir = `notion_assets/${slug}`;
  const safeName = `${sanitizeFileName(fileNameHint)}${extension}`;
  const localPath = path.join(assetDir, safeName);

  await mkdir(assetDir, { recursive: true });
  await writeFile(localPath, Buffer.from(await response.arrayBuffer()));

  return `${relativeDir}/${safeName}`.replaceAll("\\", "/");
}

async function resolveMediaSource(block, slug, fileNameHint) {
  const source =
    propertyValueToPlainText(block?.properties?.source) ||
    block?.format?.display_source ||
    block?.format?.page_cover ||
    "";

  if (!source) {
    return "";
  }

  if (source.startsWith("attachment:")) {
    const signedUrl = await getSignedFileUrl(block.id, source);

    if (!signedUrl) {
      return "";
    }

    return downloadAsset(signedUrl, slug, fileNameHint);
  }

  return source;
}

function applyDecoration(html, decoration) {
  if (!Array.isArray(decoration) || decoration.length === 0) {
    return html;
  }

  const [type, value] = decoration;

  if (type === "b") {
    return `<strong>${html}</strong>`;
  }

  if (type === "i") {
    return `<em>${html}</em>`;
  }

  if (type === "s") {
    return `<s>${html}</s>`;
  }

  if (type === "c") {
    return `<code>${html}</code>`;
  }

  if (type === "_" || type === "u") {
    return `<span class="article-underline">${html}</span>`;
  }

  if (type === "a" && typeof value === "string") {
    return `<a href="${value}" target="_blank" rel="noreferrer">${html}</a>`;
  }

  return html;
}

function renderRichText(value) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((segment) => {
      if (!Array.isArray(segment)) {
        return "";
      }

      const text = escapeHtml(normalizeTextEncoding(segment[0] || ""));
      const decorations = Array.isArray(segment[1]) ? segment[1] : [];
      return decorations.reduce((html, decoration) => applyDecoration(html, decoration), text);
    })
    .join("");
}

function getBlockRichText(block, propertyName = "title") {
  return block?.properties?.[propertyName] || [];
}

function getPlainTextFromBlock(block, propertyName = "title") {
  return propertyValueToPlainText(block?.properties?.[propertyName]);
}

function findFirstTextSnippet(recordMap, blockIds) {
  for (const blockId of blockIds) {
    const block = getBlock(recordMap, blockId);

    if (!block) {
      continue;
    }

    if (
      ["text", "quote", "bulleted_list", "numbered_list", "callout", "to_do"].includes(block.type)
    ) {
      const text = getPlainTextFromBlock(block);

      if (text) {
        return text;
      }
    }

    if (Array.isArray(block.content) && block.content.length > 0) {
      const nested = findFirstTextSnippet(recordMap, block.content);

      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

async function findFirstImage(recordMap, blockIds, slug) {
  for (const blockId of blockIds) {
    const block = getBlock(recordMap, blockId);

    if (!block) {
      continue;
    }

    if (block.type === "image") {
      return resolveMediaSource(block, slug, "card-image");
    }

    if (Array.isArray(block.content) && block.content.length > 0) {
      const nested = await findFirstImage(recordMap, block.content, slug);

      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

function getPageTitle(pageBlock) {
  return getPlainTextFromBlock(pageBlock, "title");
}

function getBlockChildren(block) {
  return Array.isArray(block?.content) ? block.content : [];
}

async function renderListItems(recordMap, blockIds, context, listType) {
  const listTag = listType === "numbered_list" ? "ol" : "ul";
  const listItems = [];

  for (const blockId of blockIds) {
    const block = getBlock(recordMap, blockId);

    if (!block) {
      continue;
    }

    const nestedHtml = await renderBlocks(recordMap, getBlockChildren(block), context);
    listItems.push(`<li>${renderRichText(getBlockRichText(block))}${nestedHtml}</li>`);
  }

  return `<${listTag} class="article-list">${listItems.join("")}</${listTag}>`;
}

function renderExternalEmbed(source) {
  if (!source) {
    return "";
  }

  if (/youtube\.com|youtu\.be/i.test(source)) {
    return `<div class="article-embed"><iframe src="${source}" loading="lazy" allowfullscreen title="Embedded video"></iframe></div>`;
  }

  if (/vimeo\.com/i.test(source)) {
    return `<div class="article-embed"><iframe src="${source}" loading="lazy" allowfullscreen title="Embedded video"></iframe></div>`;
  }

  return `<p><a href="${source}" target="_blank" rel="noreferrer">${escapeHtml(source)}</a></p>`;
}

async function renderMediaBlock(recordMap, block, context) {
  const source = await resolveMediaSource(block, context.slug, `${block.type}-${block.id}`);
  const caption = renderRichText(getBlockRichText(block));

  if (!source) {
    return "";
  }

  if (block.type === "image") {
    return `
      <figure class="article-figure">
        <img src="${source}" alt="${escapeHtml(getPlainTextFromBlock(block) || context.title)}">
        ${caption ? `<figcaption>${caption}</figcaption>` : ""}
      </figure>
    `;
  }

  if (/\.(mp4|webm|ogg)(\?|$)/i.test(source)) {
    return `
      <figure class="article-figure">
        <video controls preload="metadata" src="${source}"></video>
        ${caption ? `<figcaption>${caption}</figcaption>` : ""}
      </figure>
    `;
  }

  return renderExternalEmbed(source);
}

async function renderBlocks(recordMap, blockIds, context) {
  let html = "";

  for (let index = 0; index < blockIds.length; index += 1) {
    const block = getBlock(recordMap, blockIds[index]);

    if (!block) {
      continue;
    }

    if (block.type === "column_list" || block.type === "column") {
      html += await renderBlocks(recordMap, getBlockChildren(block), context);
      continue;
    }

    if (block.type === "bulleted_list" || block.type === "numbered_list") {
      const listType = block.type;
      const listIds = [blockIds[index]];

      while (index + 1 < blockIds.length) {
        const nextBlock = getBlock(recordMap, blockIds[index + 1]);

        if (!nextBlock || nextBlock.type !== listType) {
          break;
        }

        listIds.push(blockIds[index + 1]);
        index += 1;
      }

      html += await renderListItems(recordMap, listIds, context, listType);
      continue;
    }

    if (block.type === "text") {
      html += `<p>${renderRichText(getBlockRichText(block))}</p>`;
      continue;
    }

    if (block.type === "header") {
      html += `<h1>${renderRichText(getBlockRichText(block))}</h1>`;
      continue;
    }

    if (block.type === "sub_header") {
      html += `<h2>${renderRichText(getBlockRichText(block))}</h2>`;
      continue;
    }

    if (block.type === "sub_sub_header") {
      html += `<h3>${renderRichText(getBlockRichText(block))}</h3>`;
      continue;
    }

    if (block.type === "quote") {
      html += `<blockquote>${renderRichText(getBlockRichText(block))}</blockquote>`;
      continue;
    }

    if (block.type === "callout") {
      const icon = block?.format?.page_icon || "";
      html += `<div class="article-callout">${
        icon ? `<span class="article-callout-icon">${escapeHtml(icon)}</span>` : ""
      }<div>${renderRichText(getBlockRichText(block))}</div></div>`;
      continue;
    }

    if (block.type === "code") {
      html += `<pre><code>${escapeHtml(getPlainTextFromBlock(block))}</code></pre>`;
      continue;
    }

    if (block.type === "divider") {
      html += "<hr>";
      continue;
    }

    if (block.type === "to_do") {
      const checked = /yes|true|1/i.test(getPlainTextFromBlock(block, "checked"));
      html += `<label class="article-checkbox"><input type="checkbox"${
        checked ? " checked" : ""
      } disabled><span>${renderRichText(getBlockRichText(block))}</span></label>`;
      continue;
    }

    if (block.type === "toggle") {
      html += `<details><summary>${renderRichText(getBlockRichText(block))}</summary>${await renderBlocks(
        recordMap,
        getBlockChildren(block),
        context
      )}</details>`;
      continue;
    }

    if (block.type === "bookmark" || block.type === "embed") {
      const source = propertyValueToPlainText(block?.properties?.source);
      html += renderExternalEmbed(source);
      continue;
    }

    if (block.type === "image" || block.type === "video") {
      html += await renderMediaBlock(recordMap, block, context);
      continue;
    }
  }

  return html;
}

async function removeGeneratedNotionOutput() {
  await Promise.all([
    rm(outputPath, { force: true }),
    rm(notionAssetsDir, { recursive: true, force: true })
  ]);
}

function getCachedSourceData(item) {
  const cache = item?.syncCache;

  if (!cache || typeof cache !== "object") {
    return null;
  }

  const pageId = String(cache.pageId || parseNotionPageId(item?.sharedUrl || "")).trim();

  if (!pageId) {
    return null;
  }

  return {
    pageId,
    assetSlug: String(cache.assetSlug || item?.slug || "").trim(),
    notionTitle: String(cache.notionTitle || "").trim(),
    notionSummary: String(cache.notionSummary || ""),
    notionImage: String(cache.notionImage || ""),
    contentHtml: String(cache.contentHtml || "")
  };
}

function buildItemFromSource(entry, sourceData) {
  const sharedUrl = entry.url || entry.sharedUrl || "";
  const pageId = sourceData.pageId || parseNotionPageId(sharedUrl);
  const section = normalizeSection(entry.section);

  if (!pageId) {
    throw new Error(`Could not parse a Notion page id from "${sharedUrl}".`);
  }

  if (!section) {
    throw new Error(`Entry "${sharedUrl}" is missing a valid section.`);
  }

  const title = entry.title || sourceData.notionTitle;
  const slug = slugify(entry.slug || title);
  const summary = entry.summary || sourceData.notionSummary || "";
  const image = entry.image || sourceData.notionImage || "";
  const actionUrl = entry.actionUrl || "";
  let actionType = normalizeActionType(entry.actionType);
  let actionLabel = entry.actionLabel || "";

  if (!actionType) {
    if (actionUrl) {
      actionType = isExternalUrl(actionUrl) ? "external" : "page";
    } else {
      actionType = "page";
    }
  }

  if (!actionLabel) {
    if (actionType === "external") {
      actionLabel = "Open link";
    } else if (actionType === "status") {
      actionLabel = "Coming soon";
    } else {
      actionLabel = "Open page";
    }
  }

  return {
    slug,
    section,
    title,
    category: entry.category || "",
    year: entry.year ? String(entry.year) : "",
    image,
    alt: entry.alt || title,
    summary,
    actionLabel,
    actionType,
    actionUrl,
    sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : null,
    sharedUrl,
    lastUpdated: sourceData.lastUpdated || "",
    detailPage: {
      title,
      description: entry.seoDescription || summary || "",
      contentHtml: sourceData.contentHtml || ""
    },
    syncCache: {
      version: syncCacheVersion,
      pageId,
      assetSlug: sourceData.assetSlug || "",
      notionTitle: sourceData.notionTitle || "",
      notionSummary: sourceData.notionSummary || "",
      notionImage: sourceData.notionImage || "",
      contentHtml: sourceData.contentHtml || ""
    }
  };
}

async function buildFreshSourceData(entry, pageId) {
  const recordMap = await loadPageRecordMap(pageId);
  const pageBlock = getBlock(recordMap, pageId);

  if (!pageBlock) {
    throw new Error(`Could not load the Notion page for "${entry.url || entry.sharedUrl || ""}".`);
  }

  const notionTitle = getPageTitle(pageBlock);
  const effectiveTitle = entry.title || notionTitle;
  const assetSlug = slugify(entry.slug || effectiveTitle);

  await removeAssetDirectory(assetSlug);

  const notionSummary = findFirstTextSnippet(recordMap, getBlockChildren(pageBlock));
  const notionImage =
    (await resolveMediaSource(
      {
        ...pageBlock,
        id: pageBlock.id,
        properties: {
          ...pageBlock.properties,
          source: pageBlock?.format?.page_cover ? [[pageBlock.format.page_cover]] : []
        }
      },
      assetSlug,
      "page-cover"
    )) || (await findFirstImage(recordMap, getBlockChildren(pageBlock), assetSlug));

  return {
    pageId,
    assetSlug,
    lastUpdated: formatLastUpdated(pageBlock.last_edited_time),
    notionTitle,
    notionSummary,
    notionImage,
    contentHtml: await renderBlocks(recordMap, getBlockChildren(pageBlock), {
      slug: assetSlug,
      title: effectiveTitle
    })
  };
}

async function cleanupUnusedAssetDirectories(currentItems) {
  let directoryEntries = [];

  try {
    directoryEntries = await readdir(notionAssetsDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }

    return;
  }

  const usedAssetSlugs = new Set(
    currentItems
      .map((item) => item?.syncCache?.assetSlug)
      .filter((value) => typeof value === "string" && value.trim() !== "")
  );

  await Promise.all(
    directoryEntries
      .filter((entry) => entry.isDirectory() && !usedAssetSlugs.has(entry.name))
      .map((entry) => rm(path.join(notionAssetsDir, entry.name), { recursive: true, force: true }))
  );
}

async function main() {
  const sourceEntries = await loadJsonIfExists(sourcePath);

  if (!Array.isArray(sourceEntries) || sourceEntries.length === 0) {
    await removeGeneratedNotionOutput();
    console.log("Skipping Notion sync because src/notion-public-pages.json is missing or empty.");
    process.exit(0);
  }

  await mkdir(notionAssetsDir, { recursive: true });
  const previousItems = await loadJsonIfExists(outputPath);
  const cachedItemsByPageId = new Map(
    (Array.isArray(previousItems) ? previousItems : [])
      .map((item) => [item?.syncCache?.pageId || parseNotionPageId(item?.sharedUrl || ""), item])
      .filter(([pageId]) => Boolean(pageId))
  );

  const items = [];
  let reusedCount = 0;
  let refreshedCount = 0;

  for (const entry of sourceEntries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const sharedUrl = entry.url || entry.sharedUrl || "";
    const pageId = parseNotionPageId(sharedUrl);

    if (!pageId) {
      throw new Error(`Could not parse a Notion page id from "${sharedUrl}".`);
    }

    const section = normalizeSection(entry.section);

    if (!section) {
      throw new Error(`Entry "${sharedUrl}" is missing a valid section.`);
    }

    const pageMeta = await loadPageMetaBlock(pageId);

    if (!pageMeta) {
      throw new Error(`Could not load the Notion page metadata for "${sharedUrl}".`);
    }

    const lastUpdated = formatLastUpdated(pageMeta.last_edited_time);
    const cachedItem = cachedItemsByPageId.get(pageId);
    const cachedSourceData = getCachedSourceData(cachedItem);

    if (cachedSourceData && cachedItem?.lastUpdated === lastUpdated) {
      items.push(
        buildItemFromSource(entry, {
          ...cachedSourceData,
          pageId,
          lastUpdated
        })
      );
      reusedCount += 1;
      continue;
    }

    items.push(await buildItemFromSource(entry, await buildFreshSourceData(entry, pageId)));
    refreshedCount += 1;
  }

  await cleanupUnusedAssetDirectories(items);
  await writeFile(outputPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  console.log(
    `Synced ${items.length} public Notion pages to ${path.relative(
      rootDir,
      outputPath
    )}. Reused ${reusedCount}, refreshed ${refreshedCount}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
