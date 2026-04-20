import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bookmarksPage,
  braindumpPage,
  homePage,
  makingPage,
  navigation,
  openQuestsPage,
  photographyItems,
  photographyPage,
  placeholderPage,
  seo,
  site
} from "../src/site-data.mjs";
import {
  featuredProjectIds,
  pageDatabaseCollections,
  pageDatabaseItems
} from "../src/page-database.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const buildDate = new Date().toISOString().slice(0, 10);
const boardsDir = path.join(rootDir, "content", "boards");
const preservedBoardsDir = path.join(rootDir, ".build-preserve", "boards");
const legacyBoardSourcePath = braindumpPage.board?.legacySourcePath
  ? path.join(rootDir, braindumpPage.board.legacySourcePath)
  : null;
const preservedLegacyBoardSourcePath = path.join(
  rootDir,
  ".build-preserve",
  "legacy-braindump-state.json"
);
const notionProjectOverridesPath = path.join(rootDir, "src", "notion-projects.json");
const notionItemsPath = path.join(rootDir, "src", "notion-items.json");
const photographyItemsPath = path.join(rootDir, "photography_assets", "photos.json");

const sectionMeta = {
  projects: {
    label: "Projects",
    heading: "Project work"
  },
  "things_i_do": {
    label: "Things i do",
    heading: "Smaller builds and experiments"
  },
  "open-quests": {
    label: "Open-Quests",
    heading: "Ongoing builds and questions"
  },
  "cool-bookmarks": {
    label: "Cool bookmarks",
    heading: "References worth keeping close"
  }
};
const EMPTY_FIELD_VALUE = "none";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function trimGeneratedWhitespace(value) {
  return String(value || "").replace(/[ \t]+\n/g, "\n");
}

function pageTitle(title) {
  return title.includes(site.name) ? title : `${title} | ${site.name}`;
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

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pagePathToUrl(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");

  if (normalizedPath === "index.html") {
    return `${site.url}/`;
  }

  return `${site.url}/${normalizedPath}`.replace(/([^:]\/)\/+/g, "$1");
}

function relativeHref(fromFile, toFile) {
  if (
    !toFile ||
    isExternalUrl(toFile) ||
    toFile.startsWith("#") ||
    toFile.startsWith("data:") ||
    toFile.startsWith("mailto:") ||
    toFile.startsWith("tel:")
  ) {
    return toFile;
  }

  const fromPath = fromFile.replaceAll("\\", "/");
  const targetPath = toFile.replaceAll("\\", "/");
  const fromDir = path.posix.dirname(fromPath);
  const relativePath = path.posix.relative(fromDir, targetPath);

  return relativePath || path.posix.basename(targetPath);
}

function resolveInlineContentPaths(currentFile, html) {
  return String(html || "").replace(/\b(src|href)="([^"]+)"/g, (match, attribute, value) => {
    if (
      !value ||
      isExternalUrl(value) ||
      value.startsWith("#") ||
      value.startsWith("data:") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:")
    ) {
      return match;
    }

    return `${attribute}="${relativeHref(currentFile, value)}"`;
  });
}

function absoluteAsset(assetPath) {
  if (!assetPath) {
    return absoluteAsset(seo.defaultImage);
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  return `${site.url}/${assetPath}`.replace(/([^:]\/)\/+/g, "$1");
}

function encodeEmailPart(value) {
  return String(value || "")
    .split("")
    .reverse()
    .join("");
}

function formatDateLabel(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDateOnlyLabel(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

function parseCategoryTags(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(/[,;\n]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function contentPagePath(section, slug) {
  return `content/${section}/${slug}.html`;
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function getSectionLabel(section) {
  return sectionMeta[section]?.label || "Notes";
}

function renderCopyEmailControl({ className, label, content }) {
  return `<button class="${className}" type="button" aria-label="${escapeHtml(
    label
  )}" data-copy-email data-email-user="${escapeHtml(
    encodeEmailPart(site.emailUser)
  )}" data-email-domain="${escapeHtml(encodeEmailPart(site.emailDomain))}" data-email-reversed="true">${content}</button>`;
}

function sectionToNavFile(section) {
  if (section === "projects") {
    return "projects.html";
  }

  if (section === "things_i_do") {
    return "things_i_do.html";
  }

  if (section === "open-quests") {
    return "open-quests.html";
  }

  if (section === "cool-bookmarks") {
    return "cool-bookmarks.html";
  }

  return "";
}

function renderSidebar(currentFile, currentNavFile = currentFile) {
  const links = navigation
    .map(({ label, href }, index) => {
      const current = href === currentNavFile;
      const className = index === 0 ? "nav-link nav-link-first" : "nav-link";
      return `<a class="${className}${current ? " is-current" : ""}" href="${relativeHref(
        currentFile,
        href
      )}"${current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
    })
    .join("");

  return `
    <aside class="sidenav" id="sidenav_menu" aria-label="Primary">
      <div class="sidenav_links">
        ${links}
      </div>
      <div class="sidenav_contacts">
        ${renderCopyEmailControl({
          className: "contact-button",
          label: `Copy ${site.name} email address`,
          content: `<img src="${relativeHref(currentFile, "icon/gmail_white.png")}" alt="Email icon">`
        })}
        <a href="${site.social.linkedin}" target="_blank" rel="noreferrer" aria-label="LinkedIn">
          <img src="${relativeHref(currentFile, "icon/linkedin_white.png")}" alt="LinkedIn icon">
        </a>
        <a href="${site.social.youtube}" target="_blank" rel="noreferrer" aria-label="YouTube">
          <img src="${relativeHref(currentFile, "icon/youtube_white.png")}" alt="YouTube icon">
        </a>
      </div>
    </aside>
  `;
}

function renderFooter(currentFile) {
  const linkedNavigation = navigation
    .map(
      ({ label, href }) =>
        `<a href="${relativeHref(currentFile, href)}">${escapeHtml(label)}</a>`
    )
    .join("");

  return `
      <footer class="page-footer">
        <div class="footer-block footer-brand">
          <a class="footer-logo-link" href="${relativeHref(currentFile, "index.html")}" aria-label="${escapeHtml(
            site.name
          )} home">
            <img class="footer-logo" src="${relativeHref(currentFile, "image/evren_logo_white.svg")}" alt="${escapeHtml(
              site.name
            )} logo">
          </a>
          ${renderCopyEmailControl({
            className: "footer-copy-button",
            label: `Copy ${site.name} email address`,
            content: "Copy email"
          })}
        </div>
        <nav class="footer-block footer-links footer-nav" aria-label="Footer navigation">
          ${linkedNavigation}
        </nav>
        <div class="footer-block footer-links footer-social">
          <a href="${site.social.linkedin}" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="${site.social.youtube}" target="_blank" rel="noreferrer">YouTube</a>
        </div>
      </footer>
  `;
}

function renderBottomTicker() {
  if (!site.tickerText) {
    return "";
  }

  const tickerText = escapeHtml(site.tickerText);

  return `
      <div class="page-bottom-ticker" aria-label="Scrolling site banner">
        <div class="page-bottom-ticker-track">
          <span>${tickerText}</span>
          <span aria-hidden="true">${tickerText}</span>
          <span aria-hidden="true">${tickerText}</span>
        </div>
      </div>
  `;
}

function renderCopyToast() {
  return `
      <div class="copy-toast" role="status" aria-live="polite" hidden data-copy-toast></div>
  `;
}

function renderLightbox() {
  return `
      <div class="lightbox" data-lightbox hidden>
        <button class="lightbox-close" type="button" aria-label="Close image" data-lightbox-close>Close</button>
        <figure class="lightbox-figure">
          <img src="" alt="" data-lightbox-image>
          <figcaption>
            <strong class="lightbox-caption-title" data-lightbox-caption hidden></strong>
            <p class="lightbox-caption-copy" data-lightbox-description hidden></p>
          </figcaption>
        </figure>
      </div>
  `;
}

function renderNavBackdrop() {
  return `
    <button class="nav-backdrop" type="button" aria-label="Close navigation" hidden data-nav-backdrop></button>
  `;
}

function renderDesktopNavToggle() {
  return `
    <button
      class="desktop-nav-toggle"
      type="button"
      aria-expanded="true"
      aria-controls="sidenav_menu"
      aria-label="Close navigation"
      data-desktop-nav-toggle
    >
      <span class="desktop-nav-toggle-icon" aria-hidden="true" data-desktop-nav-toggle-icon></span>
      <span class="sr-only" data-desktop-nav-toggle-label>Close navigation</span>
    </button>
  `;
}

function renderInitialNavigationStateScript() {
  return `
    <script>
      try {
        const root = document.documentElement;
        if (window.localStorage.getItem("evren-site:desktop-nav-collapsed") === "true") {
          root.classList.add("nav-desktop-collapsed");
        }
        if (window.localStorage.getItem("evren-site:mobile-nav-open") === "true") {
          root.classList.add("nav-open");
        }
        if (window.localStorage.getItem("evren-site:mobile-nav-pos") === "left") {
          root.classList.add("nav-pos-left");
        }
      } catch (error) {}
    </script>
  `;
}

function renderShell({
  currentFile,
  currentNavFile = currentFile,
  metaTitle,
  metaDescription,
  bodyClass = "",
  content,
  ogImage = seo.defaultImage,
  robots = "index,follow",
  structuredData = []
}) {
  const canonicalUrl = pagePathToUrl(currentFile);
  const schemaBlocks = structuredData
    .map((item) => `<script type="application/ld+json">${JSON.stringify(item)}</script>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pageTitle(metaTitle))}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}">
    <meta name="robots" content="${robots}">
    <meta name="author" content="${escapeHtml(site.name)}">
    <meta name="theme-color" content="#222222">
    <meta name="keywords" content="${escapeHtml(homePage.seoKeywords.join(", "))}">
    <link rel="canonical" href="${canonicalUrl}">
    <link rel="stylesheet" href="${relativeHref(currentFile, "CSS/site.css")}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(site.name)}">
    <meta property="og:title" content="${escapeHtml(pageTitle(metaTitle))}">
    <meta property="og:description" content="${escapeHtml(metaDescription)}">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="${absoluteAsset(ogImage)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(pageTitle(metaTitle))}">
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
    <meta name="twitter:image" content="${absoluteAsset(ogImage)}">
    <link rel="icon" type="image/png" href="${relativeHref(currentFile, "favicon/favicon-96x96.png")}" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="${relativeHref(currentFile, "favicon/favicon.svg")}" />
    <link rel="shortcut icon" href="${relativeHref(currentFile, "favicon/favicon.ico")}" />
    <link rel="apple-touch-icon" sizes="180x180" href="${relativeHref(currentFile, "favicon/apple-touch-icon.png")}" />
    <meta name="apple-mobile-web-app-title" content="evren" />
    <link rel="manifest" href="${relativeHref(currentFile, "favicon/site.webmanifest")}" />
    ${renderInitialNavigationStateScript()}
    ${schemaBlocks}
    <script src="${relativeHref(currentFile, "JavaScript/site.js")}?v=2" defer></script>
  </head>
  <body class="${escapeHtml(bodyClass)}">
    <a class="skip-link" href="#content">Skip to content</a>
    ${renderDesktopNavToggle()}
    ${renderSidebar(currentFile, currentNavFile)}
    ${renderNavBackdrop()}
    <div class="main-shell">
      <button
        class="mobile-menu"
        type="button"
        aria-expanded="false"
        aria-controls="sidenav_menu"
        data-nav-toggle
      >
        <span></span>
        <span></span>
        <span></span>
        <span class="sr-only">Toggle navigation</span>
      </button>
      <main id="content" class="page-content">
        ${content}
      </main>
      ${renderFooter(currentFile)}
      ${renderBottomTicker()}
    </div>
    ${renderLightbox()}
    ${renderCopyToast()}
  </body>
</html>
`;
}

function renderParagraphs(paragraphs, className = "body-copy") {
  return paragraphs.map((paragraph) => `<p class="${className}">${escapeHtml(paragraph)}</p>`).join("");
}

function renderSectionHeader(tag, title, paragraphs = []) {
  return `
    <div class="section-header">
      <p class="page-tag">${escapeHtml(tag)}</p>
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${renderParagraphs(paragraphs)}
    </div>
  `;
}

function getResolvedItemHref(item) {
  if (item.actionType === "page") {
    return item.actionUrl || item.detailPagePath || "";
  }

  if (item.actionType === "external") {
    return item.actionUrl || "";
  }

  return "";
}

function sectionToCssToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
}

function humanizeToken(value) {
  const text = String(value || "")
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  if (!text) {
    return "";
  }

  return text.replace(/\b\w/g, (character) => character.toUpperCase());
}

function createDisplayEntry({ key, label, value = "", href = "" }) {
  const trimmedValue = String(value ?? "").trim();

  return {
    key,
    label,
    value: trimmedValue || EMPTY_FIELD_VALUE,
    href,
    isEmpty: !trimmedValue
  };
}

function getDisplayFieldEntry(item, fieldName) {
  if (!fieldName) {
    return null;
  }

  switch (fieldName) {
    case "publishingType":
      return createDisplayEntry({
        key: fieldName,
        label: "Type",
        value: item.publishingTypeLabel || item.publishingType || ""
      });
    case "publishingStatus":
      return createDisplayEntry({
        key: fieldName,
        label: "Status",
        value: item.publishingStatus || ""
      });
    case "category":
      return createDisplayEntry({
        key: fieldName,
        label: "Category",
        value: item.category || ""
      });
    case "year":
      return createDisplayEntry({
        key: fieldName,
        label: "Year",
        value: item.year || ""
      });
    case "effort":
      return createDisplayEntry({
        key: fieldName,
        label: "Scale",
        value: item.effort || ""
      });
    case "dateAdded":
      return createDisplayEntry({
        key: fieldName,
        label: "Added",
        value: item.dateAddedLabel || ""
      });
    case "retrievedDate":
      return createDisplayEntry({
        key: fieldName,
        label: "Retrieved",
        value: item.retrievedDateLabel || ""
      });
    case "dateModified":
    case "lastUpdated":
      return createDisplayEntry({
        key: fieldName,
        label: "Last updated",
        value: item.lastUpdatedLabel || ""
      });
    case "notionLink":
      return createDisplayEntry({
        key: fieldName,
        label: "Notion",
        value: item.sharedUrl ? "Open in Notion" : "",
        href: item.sharedUrl || ""
      });
    case "externalLink":
      return createDisplayEntry({
        key: fieldName,
        label: "Link",
        value: item.actionType === "external" && item.actionUrl ? "Open source" : "",
        href: item.actionType === "external" ? item.actionUrl || "" : ""
      });
    default:
      return null;
  }
}

function getCardMetaEntries(item) {
  const hiddenFieldNames = new Set(["summary", "lastUpdated"]);

  if (item.section === "cool-bookmarks") {
    hiddenFieldNames.add("category");
    hiddenFieldNames.add("retrievedDate");
  }

  return item.cardFields
    .filter((fieldName) => !hiddenFieldNames.has(fieldName))
    .map((fieldName) => getDisplayFieldEntry(item, fieldName))
    .filter(Boolean);
}

function getCardFooterEntries(item) {
  if (item.section === "cool-bookmarks") {
    return [getDisplayFieldEntry(item, "retrievedDate")].filter(Boolean);
  }

  return [getDisplayFieldEntry(item, "lastUpdated")].filter(Boolean);
}

function renderIcon(name) {
  switch (name) {
    case "time":
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8"></circle>
          <path d="M12 8v4l2.5 1.5"></path>
        </svg>
      `;
    case "arrow-up":
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 19V5"></path>
          <path d="m6 11 6-6 6 6"></path>
        </svg>
      `;
    case "arrow-left":
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5"></path>
          <path d="m11 18-6-6 6-6"></path>
        </svg>
      `;
    default:
      return "";
  }
}

function getBookmarkTagValues(item) {
  return item.categoryTags?.length > 0 ? item.categoryTags : [EMPTY_FIELD_VALUE];
}

function renderBookmarkTagStrip(item) {
  if (item.section !== "cool-bookmarks") {
    return "";
  }

  return `
    <div class="content-card-tag-strip">
      ${getBookmarkTagValues(item)
        .map((tag) => `<span class="content-card-tag${tag === EMPTY_FIELD_VALUE ? " is-empty" : ""}">${escapeHtml(tag)}</span>`)
        .join("")}
    </div>
  `;
}

function renderCardMedia(item, currentFile = "") {
  const mediaLabel = escapeHtml(item.publishingTypeLabel || getSectionLabel(item.section));
  const imageHref = currentFile ? relativeHref(currentFile, item.image) : item.image;
  const mediaBadge = item.mediaStartLabel
    ? `<span class="content-card-media-badge"><span class="content-card-media-badge-icon">${renderIcon(
        "time"
      )}</span><span>${escapeHtml(item.mediaStartLabel)}</span></span>`
    : "";

  if (item.image) {
    return `
      <div class="content-card-media">
        <img src="${imageHref}" alt="${escapeHtml(item.alt || item.title)}" loading="eager" decoding="async">
        ${mediaBadge}
      </div>
    `;
  }

  return `
    <div class="content-card-media content-card-media-empty" aria-hidden="true">
      <span>${mediaLabel}</span>
    </div>
  `;
}

function renderCardSeparator() {
  return `<span class="content-card-separator" aria-hidden="true"></span>`;
}

function renderCardMeta(metaEntries) {
  if (metaEntries.length === 0) {
    return "";
  }

  return `
    <div class="content-card-meta">
      ${metaEntries
        .map(
          (entry) =>
            `<span class="content-card-pill content-card-pill--${escapeHtml(
              sectionToCssToken(entry.key)
            )}${entry.isEmpty ? " is-empty" : ""}"><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(
              entry.value
            )}</span></span>`
        )
        .join("")}
    </div>
  `;
}

function renderCardFooter(footerEntries) {
  if (footerEntries.length === 0) {
    return "";
  }

  return `
    <div class="content-card-footer">
      ${footerEntries
        .map(
          (entry) =>
            `<p class="content-card-footnote${entry.isEmpty ? " is-empty" : ""}"><strong>${escapeHtml(
              entry.label
            )}</strong><span>${escapeHtml(entry.value)}</span></p>`
        )
        .join("")}
    </div>
  `;
}

function renderContentCard(item, currentFile = "") {
  const href = getResolvedItemHref(item);
  const resolvedHref = currentFile ? relativeHref(currentFile, href) : href;
  const sectionClass = sectionToCssToken(item.section);
  const variantClass = sectionToCssToken(item.cardVariant || "text");
  const metaEntries = getCardMetaEntries(item);
  const footerEntries = getCardFooterEntries(item);
  const summaryValue = String(item.summary || item.copy || "").trim();
  const summary = hasCardField(item, "summary")
    ? `<p class="content-card-summary${summaryValue ? "" : " is-empty"}">${escapeHtml(
        summaryValue || EMPTY_FIELD_VALUE
      )}</p>`
    : "";
  const metaHtml = renderCardMeta(metaEntries);
  const footerHtml = renderCardFooter(footerEntries);
  const bodyHtml = `
    <div class="content-card-body${item.section === "cool-bookmarks" ? " content-card-body--bookmark" : ""}">
      ${item.section === "cool-bookmarks" ? "" : metaHtml}
      <h3 class="content-card-title">${escapeHtml(item.title)}</h3>
      ${summary}
      ${item.section === "cool-bookmarks" ? metaHtml : ""}
      ${footerHtml}
    </div>
  `;
  const innerHtml =
    variantClass === "text"
      ? `${renderCardSeparator()}${bodyHtml}`
      : `${renderCardMedia(item, currentFile)}${renderBookmarkTagStrip(item)}${renderCardSeparator()}${bodyHtml}`;

  return `
    <article class="content-card content-card--${escapeHtml(sectionClass)} content-card--${escapeHtml(
      variantClass
    )}${item.layoutClass ? ` ${escapeHtml(item.layoutClass)}` : ""}" data-card-size="${escapeHtml(
      item.cardSize || ""
    )}">
      ${
        resolvedHref
          ? `<a class="content-card-link" href="${resolvedHref}"${
              isExternalUrl(resolvedHref) ? ' target="_blank" rel="noreferrer"' : ""
            }>${innerHtml}</a>`
          : `<div class="content-card-link is-static">${innerHtml}</div>`
      }
    </article>
  `;
}

function renderProjectCard(project, currentFile = "") {
  return renderContentCard(project, currentFile);
}

function renderMakingCard(item, currentFile = "") {
  return renderContentCard(item, currentFile);
}

function renderTextCards(items, currentFile = "") {
  return items.map((item) => renderContentCard(item, currentFile)).join("");
}

function renderPhotoCard(photo) {
  return `
    <figure class="photo-card ${photo.span}">
      <button
        type="button"
        class="photo-button"
        data-lightbox-button
        data-lightbox-src="${photo.image}"
        data-lightbox-alt="${escapeHtml(photo.alt)}"
        data-lightbox-caption="${escapeHtml(photo.title || "")}"
        data-lightbox-description="${escapeHtml(photo.description || "")}"
      >
        <img src="${photo.image}" alt="${escapeHtml(photo.alt)}">
      </button>
      <figcaption>${escapeHtml(photo.title || "")}</figcaption>
    </figure>
  `;
}

function renderPhotoGrid(items) {
  return items.map((photo) => renderPhotoCard(photo)).join("");
}

function renderInfoPage(currentFile, { tag, title, intro, items }) {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader(tag, title, intro)}
      <div class="text-grid">
        ${renderTextCards(items, currentFile)}
      </div>
    </section>
  `;
}

function renderDetailActions(item, currentFile) {
  const fallbackHref = relativeHref(currentFile, sectionToNavFile(item.section));

  return `
    <div class="detail-action-row">
      <a class="detail-nav-link" href="#content">
        <span class="detail-nav-icon">${renderIcon("arrow-up")}</span>
        <span>Go back to top</span>
      </a>
      <a
        class="detail-nav-link"
        href="${fallbackHref}"
        data-history-back
        data-fallback-href="${fallbackHref}"
      >
        <span class="detail-nav-icon">${renderIcon("arrow-left")}</span>
        <span>Go back</span>
      </a>
    </div>
  `;
}

function renderDetailRelatedItems(currentFile, item, relatedItems) {
  if (!Array.isArray(relatedItems) || relatedItems.length === 0) {
    return "";
  }

  return `
    <section class="detail-related-section">
      <div class="section-header">
        <p class="page-tag">${escapeHtml(getSectionLabel(item.section))}</p>
        <h2 class="section-title">More ${escapeHtml(getSectionLabel(item.section).toLowerCase())}</h2>
      </div>
      <div class="detail-related-grid">
        ${relatedItems
          .map((relatedItem) => renderContentCard({ ...relatedItem, cardSize: "sm" }, currentFile))
          .join("")}
      </div>
    </section>
  `;
}

function renderDetailPage(item, currentFile, relatedItems = []) {
  const detailMetaEntries = item.detailVisibility.showMeta
    .map((fieldName) => getDisplayFieldEntry(item, fieldName))
    .filter(Boolean);
  const sectionClass = sectionToCssToken(item.section);

  return `
    <article class="page-section page-section-first detail-page detail-page--${escapeHtml(sectionClass)}">
      <div class="detail-page-intro">
        ${renderSectionHeader(
        item.publishingTypeLabel || getSectionLabel(item.section),
        item.detailPage?.title || item.title,
        item.summary ? [item.summary] : []
      )}
        ${
          detailMetaEntries.length > 0
            ? `<div class="detail-meta">${detailMetaEntries
                .map((entry) =>
                  entry.href && !entry.isEmpty
                    ? `<div class="detail-meta-item detail-meta-link"><span>${escapeHtml(
                        entry.label
                      )}</span><a class="action-link" href="${entry.href}" target="_blank" rel="noreferrer">${escapeHtml(
                        entry.value
                      )}</a></div>`
                    : `<div class="detail-meta-item${entry.isEmpty ? " is-empty" : ""}"><span>${escapeHtml(
                        entry.label
                      )}</span><strong>${escapeHtml(
                        entry.value
                      )}</strong></div>`
                )
                .join("")}</div>`
            : ""
        }
      </div>
      ${
        item.detailVisibility.showHero && item.image
          ? `<figure class="detail-hero"><img src="${relativeHref(currentFile, item.image)}" alt="${escapeHtml(
              item.alt || item.title
            )}"></figure>`
          : ""
      }
      <div class="article-content">
        ${resolveInlineContentPaths(currentFile, item.detailPage?.contentHtml || "")}
      </div>
      <div class="detail-endcap">
        ${renderDetailRelatedItems(currentFile, item, relatedItems)}
        ${renderDetailActions(item, currentFile)}
      </div>
    </article>
  `;
}

function renderHomePage(currentFile, { projectsData, makingData, openQuestsData, coolBookmarksData, photographyData }) {
  const featuredProjects = featuredProjectIds
    .map((slug) => projectsData.find((project) => project.slug === slug))
    .filter(Boolean);
  const makingPreview = makingData.slice(0, 6);
  const photographyPreview = photographyData.slice(0, 6);

  const facts = homePage.facts
    .map(
      (fact) => `
        <div class="info-pill">
          <p>${escapeHtml(fact.label)}</p>
          <strong>${escapeHtml(fact.value)}</strong>
        </div>
      `
    )
    .join("");

  const serviceCards = homePage.services
    .map(
      (service) => `
        <article class="text-card">
          <h3>${escapeHtml(service.title)}</h3>
          <p>${escapeHtml(service.copy)}</p>
        </article>
      `
    )
    .join("");

  const processCards = homePage.process
    .map(
      (step) => `
        <article class="text-card">
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.copy)}</p>
        </article>
      `
    )
    .join("");

  return `
    <section class="home-hero">
      <img class="main-photo" src="${homePage.hero.image.src}" alt="${escapeHtml(homePage.hero.image.alt)}">
      <div class="home-copy">
        <p class="page-tag">${escapeHtml(homePage.hero.eyebrow)}</p>
        <h1 class="home-title">${escapeHtml(homePage.hero.titleLead)} <span>${escapeHtml(
    homePage.hero.titleHighlight
  )}</span></h1>
        ${renderParagraphs(homePage.hero.intro)}
      </div>
    </section>

    <section class="page-section info-strip">
      ${facts}
    </section>

    <section class="page-section">
      ${renderSectionHeader("Design engineering consulting", "What I usually help with", homePage.consultingIntro)}
      <div class="text-grid">
        ${serviceCards}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("My Process", "How I like to work", homePage.processIntro)}
      <div class="text-grid">
        ${processCards}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Projects", "Selected projects", [
        "The longer case studies are still being rebuilt. For now the short summaries stay on the main project page."
      ])}
      <div class="work-grid">
        ${featuredProjects.map((project) => renderProjectCard(project, currentFile)).join("")}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Things i do", "Smaller builds and experiments", makingPage.intro.slice(0, 1))}
      <div class="mini-grid">
        ${makingPreview.map((item) => renderMakingCard(item, currentFile)).join("")}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Photography", "Analog archive", photographyPage.intro.slice(0, 1))}
      <div class="photo-grid photo-grid-preview">
        ${renderPhotoGrid(photographyPreview)}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Open-Quests", "Ongoing builds and questions", openQuestsPage.intro.slice(0, 1))}
      <div class="text-grid">
        ${renderTextCards(openQuestsData, currentFile)}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Cool bookmarks", "References worth keeping close", bookmarksPage.intro.slice(0, 1))}
      <div class="text-grid">
        ${renderTextCards(coolBookmarksData, currentFile)}
      </div>
    </section>

    <section class="page-section hello-section">
      ${renderSectionHeader("Hello", "Reach out", homePage.hello.copy)}
      <div class="hello-card">
        <p class="body-copy hello-copy">
          If something here feels relevant to what you are building, send a note.
        </p>
        ${renderCopyEmailControl({
          className: "hello-copy-button",
          label: `Copy ${site.name} email address`,
          content: escapeHtml(homePage.hello.buttonLabel)
        })}
      </div>
    </section>
  `;
}

function renderProjectsPage(currentFile, projectsData) {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Projects", "Project work", [
        "A selection of product and concept work. The long writeups are still being rebuilt, so this page stays short and direct for now."
      ])}
      <div class="work-grid">
        ${projectsData.map((project) => renderProjectCard(project, currentFile)).join("")}
      </div>
    </section>

    <section class="page-section note-block">
      <p>
        Detailed project pages can point to synced Notion content or another external source, without changing the visible layout again.
      </p>
    </section>
  `;
}

function renderMakingPage(currentFile, makingData) {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Things I do", "Smaller builds and experiments", makingPage.intro)}
      <div class="mini-grid">
        ${makingData.map((item) => renderMakingCard(item, currentFile)).join("")}
      </div>
    </section>
  `;
}

function renderPhotographyPage(photographyData) {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Photography", "Analog archive", photographyPage.intro)}
      <div class="photo-grid">
        ${renderPhotoGrid(photographyData)}
      </div>
    </section>
  `;
}

function renderBraindumpPage(currentFile, board = braindumpPage.board) {
  const boardSourceHref = relativeHref(currentFile, board.sourcePath);
  const legacyBoardSourceHref = board.legacySourcePath
    ? relativeHref(currentFile, board.legacySourcePath)
    : "";
  const recommendationConfig = board.recommendation || {};

  return `
    <link rel="stylesheet" href="CSS/braindump.css?v=6">
    <div
      class="braindump-viewport"
      id="braindump-viewport"
      data-board-slug="${escapeHtml(board.slug)}"
      data-board-title="${escapeHtml(board.title)}"
      data-board-source="${escapeHtml(boardSourceHref)}"
      data-board-legacy-source="${escapeHtml(legacyBoardSourceHref)}"
      data-board-repo-path="${escapeHtml(board.sourcePath)}"
      data-board-storage-key="${escapeHtml(board.storageKey)}"
      data-board-legacy-storage-key="${escapeHtml(board.legacyStorageKey || "")}"
      data-board-save-endpoint="${escapeHtml(board.saveEndpoint || "/api/save-board")}"
      data-board-allow-recommendations="${board.allowRecommendations ? "true" : "false"}"
      data-recommendation-type="${escapeHtml(recommendationConfig.type || "")}"
      data-recommendation-owner="${escapeHtml(recommendationConfig.owner || "")}"
      data-recommendation-repo="${escapeHtml(recommendationConfig.repo || "")}"
      data-recommendation-labels="${escapeHtml((recommendationConfig.labels || []).join(","))}"
    >
      <div class="braindump-canvas" id="braindump-canvas">
        <svg id="braindump-svg-layer"></svg>
      </div>
      <div class="braindump-toolbar-shell">
        <div class="braindump-toolbar">
          <button type="button" data-tool="select" aria-label="Select (V)" title="Select (V)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
          </button>
          <button type="button" data-tool="pan" aria-label="Pan (Space)" title="Pan (Space)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="heroicon-hand"><path d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>
          </button>
          <button type="button" data-tool="text" aria-label="Add Text (T)" title="Text (T)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M12 4v16M9 20h6"/></svg>
          </button>
          <button type="button" data-tool="draw" aria-label="Draw (P)" title="Pen (P)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          <button type="button" data-tool="bookmark" aria-label="Add Bookmark (L)" title="Link (L)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <div class="braindump-toolbar-divider"></div>
          <button type="button" data-tool="save" aria-label="Save Board (Ctrl+S)" title="Save (Ctrl+S)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>
          <button type="button" data-tool="recommend" aria-label="Send recommendation" title="Send recommendation">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
          </button>
          <button type="button" data-tool="export" aria-label="Export .canvas" title="Export (.canvas)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <label class="braindump-file-label" aria-label="Import .canvas or .canvas.json" title="Import (.canvas / .canvas.json)">
            <input type="file" id="braindump-import" accept=".canvas,.canvas.json,.json" hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </label>
        </div>
        <div class="braindump-recommend-panel" id="braindump-recommend-panel" hidden>
          <input
            type="text"
            id="braindump-recommend-summary"
            class="braindump-recommend-input"
            maxlength="50"
            placeholder="Short description"
            aria-label="Short description for recommendation"
          >
          <button type="button" id="braindump-recommend-submit" class="braindump-recommend-submit" title="Send recommendation">Send recommendation</button>
        </div>
        <div class="braindump-toolbar-toast" id="braindump-toolbar-toast" role="status" aria-live="polite" hidden></div>
      </div>
      <div id="braindump-modal" class="braindump-modal" hidden>
        <!-- Dynamic content for forms -->
      </div>
    </div>
    <script src="${relativeHref(currentFile, "JavaScript/braindump.js")}?v=19" defer></script>
  `;
}

function renderPlaceholderPage(title, bodyCopy) {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Soon", title, [bodyCopy])}
      <p class="body-copy"><a class="action-link" href="projects.html">Back to projects</a></p>
    </section>
  `;
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

  if (["none", "disabled", "off"].includes(normalized)) {
    return "none";
  }

  return "";
}

function getCollectionConfig(section) {
  return pageDatabaseCollections[section] || {};
}

function normalizeFieldList(values, fallback = []) {
  const sourceValues = Array.isArray(values) && values.length > 0 ? values : fallback;

  return sourceValues
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeDetailVisibility(detailConfig, collectionConfig) {
  const collectionVisibility = collectionConfig.defaultDetailVisibility || {};

  return {
    showHero:
      typeof detailConfig?.showHero === "boolean"
        ? detailConfig.showHero
        : collectionVisibility.showHero !== false,
    showMeta: normalizeFieldList(
      detailConfig?.showMeta,
      normalizeFieldList(collectionVisibility.showMeta)
    ),
    showComments:
      typeof detailConfig?.showComments === "boolean"
        ? detailConfig.showComments
        : Boolean(collectionVisibility.showComments)
  };
}

function hasCardField(item, fieldName) {
  return item.cardFields.includes(fieldName);
}

function normalizePageDatabaseItem(item) {
  const normalizedSection = normalizeSection(item.section);

  if (!normalizedSection) {
    return null;
  }

  const collectionConfig = getCollectionConfig(normalizedSection);
  const content = item.content || {};
  const meta = item.meta || {};
  const card = item.card || {};
  const click = card.click || {};
  const detail = item.detail || {};
  const title = content.title || item.title || "";
  const slug = slugify(item.id || item.slug || title);
  const summary = content.summary || item.summary || item.copy || "";
  const publishingType = meta.publishingType || item.publishingType || getSectionLabel(normalizedSection);
  const dateAdded = meta.dateAdded || item.dateAdded || "";
  const dateModified = meta.dateModified || item.dateModified || item.lastUpdated || "";
  const actionUrl = click.url || item.externalUrl || item.actionUrl || "";
  let actionType = normalizeActionType(click.mode || item.actionType);
  let actionLabel = click.label || item.actionLabel || item.status || "";

  if (!actionType) {
    if (actionUrl) {
      actionType = isExternalUrl(actionUrl) ? "external" : "page";
    } else if (actionLabel) {
      actionType = "status";
    } else {
      actionType = detail.enabled ? "page" : "none";
    }
  }

  const detailPage =
    detail.enabled && detail.pageContentHtml
      ? {
          title: detail.title || title,
          description: detail.description || summary || "",
          contentHtml: detail.pageContentHtml
        }
      : null;

  return {
    section: normalizedSection,
    slug,
    sourceType: item.source?.type || "local",
    title,
    publishingType,
    publishingTypeLabel: humanizeToken(publishingType) || getSectionLabel(normalizedSection),
    publishingStatus: meta.publishingStatus || item.publishingStatus || "",
    effort: meta.effort || item.effort || "",
    category: meta.category || item.category || "",
    year: meta.year || (item.year ? String(item.year) : ""),
    dateAdded,
    dateAddedLabel: formatDateLabel(dateAdded),
    retrievedDateLabel: formatDateOnlyLabel(dateAdded),
    dateModified,
    notionLastEdited: meta.notionLastEdited || dateModified,
    image: content.image || item.image || "",
    alt: content.alt || item.alt || title,
    categoryTags: parseCategoryTags(meta.category || item.category || ""),
    summary,
    actionLabel,
    actionType,
    actionUrl,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : null,
    sharedUrl: item.sharedUrl || "",
    mediaStartLabel: item.mediaStartLabel || "",
    lastUpdated: dateModified,
    lastUpdatedLabel: formatDateLabel(dateModified),
    detailPage,
    detailPagePath: detailPage ? contentPagePath(normalizedSection, slug) : "",
    cardVariant: card.variant || collectionConfig.cardVariant || "",
    cardSize: card.size || collectionConfig.defaultCardSize || "",
    cardFields: normalizeFieldList(card.fields, normalizeFieldList(collectionConfig.defaultCardFields)),
    layoutClass: card.layoutClass || item.span || "",
    detailVisibility: normalizeDetailVisibility(detail, collectionConfig)
  };
}

function normalizeNotionItem(item) {
  const section = normalizeSection(item.section);

  if (!section || !item || !item.slug || !item.title) {
    return null;
  }

  const collectionConfig = getCollectionConfig(section);
  const slug = slugify(item.slug);
  const detailPage = item.detailPage?.contentHtml
    ? {
        ...item.detailPage
      }
    : null;
  const publishingType = item.publishingType || getSectionLabel(section);
  const dateAdded = item.dateAdded || "";
  const dateModified = item.dateModified || item.lastUpdated || "";
  let actionType = normalizeActionType(item.actionType);
  let actionLabel = item.actionLabel || "";
  const actionUrl = item.actionUrl || "";

  if (!actionType) {
    if (detailPage) {
      actionType = "page";
    } else if (actionUrl) {
      actionType = isExternalUrl(actionUrl) ? "external" : "page";
    } else if (actionLabel) {
      actionType = "status";
    }
  }

  if ((actionType === "page" || actionType === "external") && !actionLabel) {
    actionLabel = "Open page";
  }

  const detailPagePath = detailPage ? contentPagePath(section, slug) : "";
  const detailVisibility = normalizeDetailVisibility(item.detail || {}, collectionConfig);

  return {
    ...item,
    section,
    slug,
    sourceType: item.source?.type || "notion-public",
    title: item.title,
    publishingType,
    publishingTypeLabel: humanizeToken(publishingType) || getSectionLabel(section),
    publishingStatus: item.publishingStatus || "",
    effort: item.effort || "",
    category: item.category || "",
    year: item.year ? String(item.year) : "",
    dateAdded,
    dateAddedLabel: formatDateLabel(dateAdded),
    retrievedDateLabel: formatDateOnlyLabel(dateAdded),
    dateModified,
    notionLastEdited: dateModified,
    image: item.image || "",
    alt: item.alt || item.title,
    categoryTags: parseCategoryTags(item.category || ""),
    summary: item.summary || "",
    actionLabel,
    actionType,
    actionUrl,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : null,
    sharedUrl: item.sharedUrl || "",
    mediaStartLabel: item.mediaStartLabel || "",
    lastUpdated: dateModified,
    lastUpdatedLabel: formatDateLabel(dateModified),
    detailPage,
    detailPagePath,
    cardVariant: item.card?.variant || collectionConfig.cardVariant || "",
    cardSize: item.card?.size || collectionConfig.defaultCardSize || "",
    cardFields: normalizeFieldList(item.card?.fields, normalizeFieldList(collectionConfig.defaultCardFields)),
    layoutClass: item.card?.layoutClass || item.span || "",
    detailVisibility
  };
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

function normalizePhotographyItem(item, index) {
  if (!item) {
    return null;
  }

  const title = String(item.title || `Archive ${String(index + 1).padStart(2, "0")}`);
  const description = String(item.description || "");
  const fileName = String(item.file || "").trim();
  const image = String(item.image || "").trim() || (fileName ? `photography_assets/${fileName}` : "");

  if (!image) {
    return null;
  }

  return {
    title,
    description,
    image,
    alt: String(item.alt || title),
    span: String(item.span || "")
  };
}

async function loadPhotographyItems() {
  const items = await loadJsonIfExists(photographyItemsPath);

  if (Array.isArray(items) && items.length > 0) {
    return items.map((item, index) => normalizePhotographyItem(item, index)).filter(Boolean);
  }

  return photographyItems
    .map((item, index) => normalizePhotographyItem(item, index))
    .filter(Boolean);
}

async function preserveBoardContent() {
  await rm(path.dirname(preservedBoardsDir), { recursive: true, force: true });
  await mkdir(path.dirname(preservedBoardsDir), { recursive: true });

  try {
    await access(boardsDir);
    await cp(boardsDir, preservedBoardsDir, { recursive: true, force: true });
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  if (!legacyBoardSourcePath) return;

  try {
    await access(legacyBoardSourcePath);
    await cp(legacyBoardSourcePath, preservedLegacyBoardSourcePath, { force: true });
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function restoreBoardContent() {
  let hasPreservedBoards = false;
  let hasPreservedLegacyBoard = false;

  try {
    await access(preservedBoardsDir);
    hasPreservedBoards = true;
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  if (legacyBoardSourcePath) {
    try {
      await access(preservedLegacyBoardSourcePath);
      hasPreservedLegacyBoard = true;
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (!hasPreservedBoards && !hasPreservedLegacyBoard) {
    await rm(path.dirname(preservedBoardsDir), { recursive: true, force: true });
    return;
  }

  await mkdir(path.join(rootDir, "content"), { recursive: true });

  if (hasPreservedBoards) {
    await cp(preservedBoardsDir, boardsDir, { recursive: true, force: true });
  }

  if (legacyBoardSourcePath && hasPreservedLegacyBoard) {
    try {
      await mkdir(path.dirname(legacyBoardSourcePath), { recursive: true });
      await cp(preservedLegacyBoardSourcePath, legacyBoardSourcePath, { force: true });
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  await rm(path.dirname(preservedBoardsDir), { recursive: true, force: true });
}

async function loadLegacyProjectOverrides() {
  const overrides = await loadJsonIfExists(notionProjectOverridesPath);

  if (!Array.isArray(overrides)) {
    return [];
  }

  return overrides
    .filter((item) => item && typeof item.slug === "string")
    .map((item) =>
      normalizeNotionItem({
        section: "projects",
        slug: item.slug,
        title: item.title || item.slug,
        summary: item.summary || "",
        actionLabel: item.externalUrl ? item.status || "Open project notes" : item.status || "",
        actionType: item.externalUrl ? "external" : item.status ? "status" : "",
        actionUrl: item.externalUrl || "",
        image: item.image || "",
        alt: item.alt || item.title || item.slug
      })
    )
    .filter(Boolean);
}

async function loadNotionItems() {
  const items = await loadJsonIfExists(notionItemsPath);

  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(normalizeNotionItem).filter(Boolean);
}

function getDateSortValue(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function shouldSortNewestFirst(section) {
  return ["projects", "things_i_do", "open-quests"].includes(section);
}

function sortContentItems(a, b) {
  const section = a.section || b.section || "";
  const dateA = getDateSortValue(a.lastUpdated || a.dateModified);
  const dateB = getDateSortValue(b.lastUpdated || b.dateModified);
  const hasDateA = dateA !== null;
  const hasDateB = dateB !== null;

  if (shouldSortNewestFirst(section)) {
    if (hasDateA && hasDateB && dateA !== dateB) {
      return dateB - dateA;
    }

    if (hasDateA && !hasDateB) {
      return -1;
    }

    if (!hasDateA && hasDateB) {
      return 1;
    }
  }

  const hasOrderA = Number.isFinite(a.sortOrder);
  const hasOrderB = Number.isFinite(b.sortOrder);

  if (hasOrderA && hasOrderB && a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  if (hasOrderA && !hasOrderB) {
    return -1;
  }

  if (!hasOrderA && hasOrderB) {
    return 1;
  }

  return a.title.localeCompare(b.title);
}

function mergeItems(baseItems, overrideItems) {
  const merged = new Map(baseItems.map((item) => [item.slug, item]));

  overrideItems.forEach((item) => {
    const existing = merged.get(item.slug);

    if (!existing) {
      merged.set(item.slug, item);
      return;
    }

    const nextItem = {
      ...existing
    };

    Object.entries(item).forEach(([key, value]) => {
      if (key === "detailPage" || key === "detailPagePath") {
        return;
      }

      if (value === undefined || value === null) {
        return;
      }

      if (typeof value === "string" && value.trim() === "") {
        return;
      }

      nextItem[key] = value;
    });

    merged.set(item.slug, {
      ...nextItem,
      detailPage: item.detailPage || existing.detailPage || null,
      detailPagePath: item.detailPagePath || existing.detailPagePath || ""
    });
  });

  return Array.from(merged.values()).sort(sortContentItems);
}

function filterBySection(items, section) {
  return items.filter((item) => item.section === section);
}

function getSiblingItems(item, collectionItems, maxItems = 3) {
  return collectionItems
    .filter((candidate) => candidate.slug !== item.slug)
    .filter((candidate) => Boolean(getResolvedItemHref(candidate)))
    .slice(0, maxItems);
}

async function loadContentData() {
  const localItems = pageDatabaseItems.map(normalizePageDatabaseItem).filter(Boolean);
  const legacyProjectOverrides = await loadLegacyProjectOverrides();
  const notionItems = await loadNotionItems();
  const photographyData = await loadPhotographyItems();

  const notionProjects = [...legacyProjectOverrides, ...filterBySection(notionItems, "projects")];
  const projectsData = mergeItems(filterBySection(localItems, "projects"), notionProjects);
  const makingData = mergeItems(
    filterBySection(localItems, "things_i_do"),
    filterBySection(notionItems, "things_i_do")
  );
  const openQuestsData = mergeItems(
    filterBySection(localItems, "open-quests"),
    filterBySection(notionItems, "open-quests")
  );
  const coolBookmarksData = mergeItems(
    filterBySection(localItems, "cool-bookmarks"),
    filterBySection(notionItems, "cool-bookmarks")
  );
  const detailItems = [...projectsData, ...makingData, ...openQuestsData, ...coolBookmarksData].filter(
    (item) => item.detailPage?.contentHtml
  );

  return {
    projectsData,
    makingData,
    openQuestsData,
    coolBookmarksData,
    photographyData,
    detailItems
  };
}

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.name,
  url: site.url,
  description: site.description
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: site.name,
  url: site.url,
  jobTitle: "Freelance Industrial Design Engineer",
  alumniOf: {
    "@type": "CollegeOrUniversity",
    name: "Delft University of Technology"
  },
  image: absoluteAsset(seo.defaultImage),
  sameAs: [site.social.linkedin, site.social.youtube],
  knowsAbout: [
    "industrial design",
    "prototype development",
    "mechanics",
    "electronics",
    "analog photography",
    "fabrication"
  ]
};

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Projects",
  url: pagePathToUrl("projects.html"),
  description:
    "A selection of project summaries by Evren Ucar across product concepts, workshop tools, and mobility ideas."
};

function renderSitemap(pageList) {
  const urls = pageList
    .filter((page) => !["coming_soon.html", "404.html"].includes(page.file))
    .map(
      (page) => `  <url>
    <loc>${pagePathToUrl(page.file)}</loc>
    <lastmod>${buildDate}</lastmod>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function build() {
  const { projectsData, makingData, openQuestsData, coolBookmarksData, photographyData, detailItems } =
    await loadContentData();
  await preserveBoardContent();
  await rm(path.join(rootDir, "content"), { recursive: true, force: true });

  const pages = [
    {
      file: "index.html",
      title: homePage.title,
      description: homePage.description,
      ogImage: homePage.hero.image.src,
      bodyClass: "page-home",
      structuredData: [websiteSchema, personSchema],
      content: renderHomePage("index.html", {
        projectsData,
        makingData,
        openQuestsData,
        coolBookmarksData,
        photographyData
      })
    },
    {
      file: "projects.html",
      title: "Projects",
      description:
        "Selected project summaries from Evren Ucar across industrial design, product concepts, and physical prototyping work.",
      ogImage: projectsData[0]?.image || seo.defaultImage,
      bodyClass: "page-projects",
      structuredData: [websiteSchema, collectionSchema],
      content: renderProjectsPage("projects.html", projectsData)
    },
    {
      file: "things_i_do.html",
      title: "Things I Do",
      description: makingPage.description,
      ogImage: makingData[0]?.image || seo.defaultImage,
      bodyClass: "page-making",
      structuredData: [websiteSchema],
      content: renderMakingPage("things_i_do.html", makingData)
    },
    {
      file: "open-quests.html",
      title: "Open Quests",
      description: openQuestsPage.description,
      ogImage: seo.defaultImage,
      bodyClass: "page-open-quests",
      structuredData: [websiteSchema],
      content: renderInfoPage("open-quests.html", {
        tag: "Open-Quests",
        title: "Ongoing builds and questions",
        intro: openQuestsPage.intro,
        items: openQuestsData
      })
    },
    {
      file: "cool-bookmarks.html",
      title: "Cool Bookmarks",
      description: bookmarksPage.description,
      ogImage: seo.defaultImage,
      bodyClass: "page-bookmarks",
      structuredData: [websiteSchema],
      content: renderInfoPage("cool-bookmarks.html", {
        tag: "Cool bookmarks",
        title: "References worth keeping close",
        intro: bookmarksPage.intro,
        items: coolBookmarksData
      })
    },
    {
      file: "braindump.html",
      title: braindumpPage.title,
      description: braindumpPage.description,
      ogImage: seo.defaultImage,
      bodyClass: "page-braindump",
      structuredData: [],
      content: renderBraindumpPage("braindump.html", braindumpPage.board)
    },
    {
      file: "photography.html",
      title: "Photography",
      description: photographyPage.description,
      ogImage: photographyData[4]?.image || seo.defaultImage,
      bodyClass: "page-photography",
      structuredData: [websiteSchema],
      content: renderPhotographyPage(photographyData)
    },
    ...detailItems.map((item) => ({
      file: item.detailPagePath,
      currentNavFile: sectionToNavFile(item.section),
      title: item.detailPage?.title || item.title,
      description: item.detailPage?.description || item.summary || site.description,
      ogImage: item.image || seo.defaultImage,
      bodyClass: "page-detail",
      structuredData: [websiteSchema],
      content: renderDetailPage(
        item,
        contentPagePath(item.section, item.slug),
        getSiblingItems(
          item,
          {
            projects: projectsData,
            things_i_do: makingData,
            "open-quests": openQuestsData,
            "cool-bookmarks": coolBookmarksData
          }[item.section] || []
        )
      )
    })),
    {
      file: "coming_soon.html",
      title: placeholderPage.title,
      description: placeholderPage.description,
      ogImage: seo.defaultImage,
      bodyClass: "page-placeholder",
      robots: "noindex,follow",
      structuredData: [websiteSchema],
      content: renderPlaceholderPage(placeholderPage.heading, placeholderPage.copy)
    },
    {
      file: "404.html",
      title: "Page not found",
      description: "The requested page could not be found on evrenucar.com.",
      ogImage: seo.defaultImage,
      bodyClass: "page-placeholder",
      robots: "noindex,follow",
      structuredData: [websiteSchema],
      content: renderPlaceholderPage(
        "Page not found",
        "That page is not here. The site structure has been cleaned up, so some older links may have moved."
      )
    }
  ];

  await Promise.all(
    pages.map(async (page) => {
      const outputPath = path.join(rootDir, page.file);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(
        outputPath,
        trimGeneratedWhitespace(
          renderShell({
            currentFile: page.file,
            currentNavFile: page.currentNavFile,
            metaTitle: page.title,
            metaDescription: page.description,
            bodyClass: page.bodyClass,
            ogImage: page.ogImage,
            robots: page.robots,
            structuredData: page.structuredData,
            content: page.content
          })
        ),
        "utf8"
      );
    })
  );

  await restoreBoardContent();

  await Promise.all([
    writeFile(
      path.join(rootDir, "robots.txt"),
      `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`,
      "utf8"
    ),
    writeFile(path.join(rootDir, "sitemap.xml"), renderSitemap(pages), "utf8")
  ]);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
