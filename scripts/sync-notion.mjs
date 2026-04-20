import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "src", "notion-public-pages.json");
const outputPath = path.join(rootDir, "src", "notion-items.json");
const notionAssetsDir = path.join(rootDir, "notion_assets");
const syncCacheVersion = 8;

const defaultNotionPropertyAliases = Object.freeze({
  publishingType: [">[Mc", "A|cR", "Publishing_Type", "Publishing Type", "publishing_type", "publishing type"],
  publishingStatus: [
    ">{Jz",
    "CEpZ",
    "Publishing_Status",
    "Publishing Status",
    "publishing_status",
    "publishing status"
  ],
  summary: [
    "isHq",
    "summary",
    "Summary",
    "notes",
    "Notes",
    "links",
    "Links",
    "notes and links",
    "Notes and links",
    "notes_links"
  ],
  effort: ["SDhZ", "Publishing_Size", "Publishing Size", "publishing_size", "publishing size"],
  externalUrl: ["Io_F", "Z]sx", "External_Url", "External Url", "external_url", "external url", "link", "Link"],
  category: ["e]w[", "category", "Category", "tags", "Tags", "topics", "Topics"],
  year: ["year", "Year"]
});

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

  if (
    [
      "cool-bookmarks",
      "cool bookmarks",
      "cool bookmark",
      "cool_bookmarks",
      "bookmarks",
      "bookmark",
      "web-app",
      "web app",
      "website",
      "reference",
      "references",
      "resource",
      "resources"
    ].includes(normalized)
  ) {
    return "cool-bookmarks";
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
  if (/[\u00f0\u00c3\u00c2\u00e2]/.test(text)) {
    try {
      const decoded = Buffer.from(text, "latin1").toString("utf8");
      return decoded.includes("\uFFFD") ? text : decoded;
    } catch (error) {
      return text;
    }
  }

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

function normalizePropertyAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getNotionPropertyAliases(entry) {
  const entryAliases =
    entry?.propertyAliases && typeof entry.propertyAliases === "object" ? entry.propertyAliases : {};
  const keys = new Set([
    ...Object.keys(defaultNotionPropertyAliases),
    ...Object.keys(entryAliases)
  ]);

  return Object.fromEntries(
    Array.from(keys, (key) => {
      const localAliases = Array.isArray(entryAliases[key])
        ? entryAliases[key]
        : entryAliases[key]
          ? [entryAliases[key]]
          : [];

      return [
        key,
        [...localAliases, ...(defaultNotionPropertyAliases[key] || [])]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      ];
    })
  );
}

function readNotionProperty(properties, aliases = []) {
  if (!properties || typeof properties !== "object" || !Array.isArray(aliases) || aliases.length === 0) {
    return "";
  }

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(properties, alias)) {
      const value = propertyValueToPlainText(properties[alias]);

      if (value) {
        return value;
      }
    }
  }

  const propertyEntries = Object.entries(properties);

  for (const alias of aliases) {
    const normalizedAlias = normalizePropertyAlias(alias);

    if (!normalizedAlias) {
      continue;
    }

    const matchedEntry = propertyEntries.find(([propertyName]) => {
      return normalizePropertyAlias(propertyName) === normalizedAlias;
    });

    if (!matchedEntry) {
      continue;
    }

    const value = propertyValueToPlainText(matchedEntry[1]);

    if (value) {
      return value;
    }
  }

  return "";
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

function fileExtensionFromContentType(contentType) {
  const normalized = String(contentType || "").trim().toLowerCase();

  if (normalized.includes("image/jpeg")) {
    return ".jpg";
  }

  if (normalized.includes("image/png")) {
    return ".png";
  }

  if (normalized.includes("image/webp")) {
    return ".webp";
  }

  if (normalized.includes("image/gif")) {
    return ".gif";
  }

  if (normalized.includes("image/svg+xml")) {
    return ".svg";
  }

  if (normalized.includes("video/mp4")) {
    return ".mp4";
  }

  return "";
}

function decodeHtmlEntityString(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function resolveAbsoluteUrl(baseUrl, value) {
  try {
    return new URL(value, baseUrl).toString();
  } catch (error) {
    return "";
  }
}

function extractMetaContent(html, attributeName, attributeValues) {
  const source = String(html || "");

  for (const attributeValue of attributeValues) {
    const escapedValue = String(attributeValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const contentFirstPattern = new RegExp(
      `<meta[^>]*content=(["'])(.*?)\\1[^>]*${attributeName}=(["'])${escapedValue}\\3[^>]*>`,
      "i"
    );
    const attributeFirstPattern = new RegExp(
      `<meta[^>]*${attributeName}=(["'])${escapedValue}\\1[^>]*content=(["'])(.*?)\\2[^>]*>`,
      "i"
    );
    const contentFirstMatch = source.match(contentFirstPattern);

    if (contentFirstMatch?.[2]) {
      return decodeHtmlEntityString(contentFirstMatch[2]);
    }

    const attributeFirstMatch = source.match(attributeFirstPattern);

    if (attributeFirstMatch?.[3]) {
      return decodeHtmlEntityString(attributeFirstMatch[3]);
    }
  }

  return "";
}

function extractOpenGraphImageUrl(html, pageUrl) {
  const rawUrl =
    extractMetaContent(html, "property", ["og:image", "og:image:url", "og:image:secure_url"]) ||
    extractMetaContent(html, "name", ["twitter:image", "twitter:image:src"]);

  return rawUrl ? resolveAbsoluteUrl(pageUrl, rawUrl) : "";
}

function extractYouTubeVideoId(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (hostname.endsWith("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v") || "";
      }

      const pathSegments = url.pathname.split("/").filter(Boolean);

      if (["embed", "shorts", "live"].includes(pathSegments[0])) {
        return pathSegments[1] || "";
      }
    }
  } catch (error) {
    return "";
  }

  return "";
}

function buildYouTubeEmbedUrl(urlString) {
  const videoId = extractYouTubeVideoId(urlString);

  if (!videoId) {
    return "";
  }

  try {
    const sourceUrl = new URL(urlString);
    const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
    const playlistId = sourceUrl.searchParams.get("list");
    const startSeconds = extractMediaStartSeconds(urlString);

    if (playlistId) {
      embedUrl.searchParams.set("list", playlistId);
    }

    if (startSeconds > 0) {
      embedUrl.searchParams.set("start", String(startSeconds));
    }

    return embedUrl.toString();
  } catch (error) {
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  }
}

function parseTimestampValue(value) {
  const text = String(value || "").trim().toLowerCase();

  if (!text) {
    return 0;
  }

  if (/^\d+$/.test(text)) {
    return Number(text);
  }

  let totalSeconds = 0;

  for (const match of text.matchAll(/(\d+)(h|m|s)/g)) {
    const amount = Number(match[1]);

    if (!Number.isFinite(amount)) {
      continue;
    }

    if (match[2] === "h") {
      totalSeconds += amount * 3600;
    }

    if (match[2] === "m") {
      totalSeconds += amount * 60;
    }

    if (match[2] === "s") {
      totalSeconds += amount;
    }
  }

  if (totalSeconds > 0) {
    return totalSeconds;
  }

  const colonParts = text.split(":").map((part) => Number(part));

  if (colonParts.every((part) => Number.isFinite(part))) {
    return colonParts.reduce((accumulator, part) => accumulator * 60 + part, 0);
  }

  return 0;
}

function extractMediaStartSeconds(urlString) {
  try {
    const url = new URL(urlString);
    const candidates = [
      url.searchParams.get("t"),
      url.searchParams.get("start"),
      url.searchParams.get("time_continue")
    ];

    if (url.hash) {
      const hash = url.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hash.includes("=") ? hash : `t=${hash}`);
      candidates.push(hashParams.get("t"), hashParams.get("start"));
    }

    for (const candidate of candidates) {
      const seconds = parseTimestampValue(candidate);

      if (seconds > 0) {
        return seconds;
      }
    }
  } catch (error) {
    return 0;
  }

  return 0;
}

function formatDurationLabel(totalSeconds) {
  const seconds = Number(totalSeconds);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function extractMediaStartLabel(urlString) {
  return formatDurationLabel(extractMediaStartSeconds(urlString));
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

  if (
    !source.startsWith("attachment:") &&
    !/secure\.notion-static\.com|amazonaws\.com\/secure\.notion-static/i.test(source)
  ) {
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

  const extension =
    fileExtensionFromUrl(url, "") || fileExtensionFromContentType(response.headers.get("content-type")) || ".bin";
  const assetDir = path.join(notionAssetsDir, slug);
  const relativeDir = `notion_assets/${slug}`;
  const safeName = `${sanitizeFileName(fileNameHint)}${extension}`;
  const localPath = path.join(assetDir, safeName);

  await mkdir(assetDir, { recursive: true });
  await writeFile(localPath, Buffer.from(await response.arrayBuffer()));

  return `${relativeDir}/${safeName}`.replaceAll("\\", "/");
}

async function fetchExternalPreviewImage(url, slug) {
  if (!isExternalUrl(url)) {
    return "";
  }

  const youtubeVideoId = extractYouTubeVideoId(url);

  if (youtubeVideoId) {
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;

    try {
      return await downloadAsset(thumbnailUrl, slug, "external-preview");
    } catch (error) {
      return thumbnailUrl;
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; EvrenSiteBot/1.0; +https://evrenucar.com)"
      }
    });

    if (!response.ok) {
      return "";
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return "";
    }

    const html = await response.text();
    const previewImageUrl = extractOpenGraphImageUrl(html, url);

    if (!previewImageUrl) {
      return "";
    }

    try {
      return await downloadAsset(previewImageUrl, slug, "external-preview");
    } catch (error) {
      return previewImageUrl;
    }
  } catch (error) {
    return "";
  }
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

  if (
    source.startsWith("attachment:") ||
    /secure\.notion-static\.com|amazonaws\.com\/secure\.notion-static/i.test(source)
  ) {
    const signedUrl = await getSignedFileUrl(block.id, source);

    if (!signedUrl) {
      return "";
    }

    return downloadAsset(signedUrl, slug, fileNameHint);
  }

  if (
    block?.type === "image" ||
    /secure\.notion-static\.com|amazonaws\.com\/secure\.notion-static/i.test(source) ||
    /\.(png|jpe?g|webp|gif|svg|mp4|webm|ogg)(\?|$)/i.test(source)
  ) {
    try {
      return await downloadAsset(source, slug, fileNameHint);
    } catch (error) {
      return source;
    }
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

function findFirstExternalBookmarkUrl(recordMap, blockIds) {
  for (const blockId of blockIds) {
    const block = getBlock(recordMap, blockId);

    if (!block) {
      continue;
    }

    if (block.type === "bookmark" || block.type === "embed") {
      const source = propertyValueToPlainText(block?.properties?.source);

      if (isExternalUrl(source)) {
        return source;
      }
    }

    if (Array.isArray(block.content) && block.content.length > 0) {
      const nested = findFirstExternalBookmarkUrl(recordMap, block.content);

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
    const embedSource = buildYouTubeEmbedUrl(source);

    if (!embedSource) {
      return `<p><a href="${source}" target="_blank" rel="noreferrer">${escapeHtml(source)}</a></p>`;
    }

    return `<div class="article-embed"><iframe src="${embedSource}" loading="lazy" allowfullscreen title="Embedded video" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe></div>`;
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

  if (Number(cache.version) !== syncCacheVersion) {
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
    externalPreviewImage: String(cache.externalPreviewImage || ""),
    contentHtml: String(cache.contentHtml || ""),
    publishingType: String(cache.publishingType || item?.publishingType || ""),
    publishingStatus: String(cache.publishingStatus || item?.publishingStatus || ""),
    category: String(cache.category || item?.category || ""),
    year: String(cache.year || item?.year || ""),
    effort: String(cache.effort || item?.effort || ""),
    notionExternalUrl: String(cache.notionExternalUrl || ""),
    mediaStartLabel: String(cache.mediaStartLabel || item?.mediaStartLabel || ""),
    dateAdded: String(cache.dateAdded || item?.dateAdded || ""),
    dateModified: String(cache.dateModified || item?.dateModified || "")
  };
}

function buildItemFromSource(entry, sourceData) {
  const sharedUrl = entry.url || entry.sharedUrl || "";
  const pageId = sourceData.pageId || parseNotionPageId(sharedUrl);
  const section = normalizeSection(sourceData.publishingType) || normalizeSection(entry.section);

  if (!pageId) {
    throw new Error(`Could not parse a Notion page id from "${sharedUrl}".`);
  }

  if (!section) {
    throw new Error(`Entry "${sharedUrl}" is missing a valid section.`);
  }

  const title = entry.title || sourceData.notionTitle;
  const slug = slugify(entry.slug || title);
  const summary = entry.summary || sourceData.notionSummary || "";
  const image = entry.image || sourceData.notionImage || sourceData.externalPreviewImage || "";
  const actionUrl =
    entry.actionUrl ||
    (section === "cool-bookmarks" || normalizeActionType(entry.actionType) === "external"
      ? sourceData.notionExternalUrl || ""
      : "");
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
    category: sourceData.category || "",
    year: entry.year ? String(entry.year) : sourceData.year || "",
    publishingType: sourceData.publishingType || "",
    publishingStatus: sourceData.publishingStatus || "",
    effort: sourceData.effort || "",
    dateAdded: sourceData.dateAdded || "",
    dateModified: sourceData.dateModified || sourceData.lastUpdated || "",
    image,
    alt: entry.alt || title,
    summary,
    actionLabel,
    actionType,
    actionUrl,
    sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : null,
    sharedUrl,
    lastUpdated: sourceData.lastUpdated || "",
    mediaStartLabel: sourceData.mediaStartLabel || "",
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
      externalPreviewImage: sourceData.externalPreviewImage || "",
      contentHtml: sourceData.contentHtml || "",
      publishingType: sourceData.publishingType || "",
      publishingStatus: sourceData.publishingStatus || "",
      category: sourceData.category || "",
      year: sourceData.year || "",
      effort: sourceData.effort || "",
      notionExternalUrl: sourceData.notionExternalUrl || "",
      mediaStartLabel: sourceData.mediaStartLabel || "",
      dateAdded: sourceData.dateAdded || "",
      dateModified: sourceData.dateModified || sourceData.lastUpdated || ""
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
  const propertyAliases = getNotionPropertyAliases(entry);

  await removeAssetDirectory(assetSlug);

  const notionSummary =
    readNotionProperty(pageBlock.properties, propertyAliases.summary) ||
    findFirstTextSnippet(recordMap, getBlockChildren(pageBlock));
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
  const publishingType = readNotionProperty(pageBlock.properties, propertyAliases.publishingType);
  const publishingStatus = readNotionProperty(pageBlock.properties, propertyAliases.publishingStatus);
  const category = readNotionProperty(pageBlock.properties, propertyAliases.category);
  const year = readNotionProperty(pageBlock.properties, propertyAliases.year);
  const effort = readNotionProperty(pageBlock.properties, propertyAliases.effort);
  const notionExternalUrl =
    readNotionProperty(pageBlock.properties, propertyAliases.externalUrl) ||
    findFirstExternalBookmarkUrl(recordMap, getBlockChildren(pageBlock));
  const section = normalizeSection(publishingType) || normalizeSection(entry.section);
  const mediaStartLabel = extractMediaStartLabel(notionExternalUrl);
  const externalPreviewImage =
    section === "cool-bookmarks" && !entry.image && !notionImage && notionExternalUrl
      ? await fetchExternalPreviewImage(notionExternalUrl, assetSlug)
      : "";

  return {
    pageId,
    assetSlug,
    dateAdded: formatLastUpdated(pageBlock.created_time),
    dateModified: formatLastUpdated(pageBlock.last_edited_time),
    lastUpdated: formatLastUpdated(pageBlock.last_edited_time),
    notionTitle,
    notionSummary,
    notionImage: notionImage || externalPreviewImage,
    externalPreviewImage,
    publishingType,
    publishingStatus,
    category,
    year,
    effort,
    notionExternalUrl,
    mediaStartLabel,
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
