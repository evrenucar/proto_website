import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  featuredProjectSlugs,
  homePage,
  makingItems,
  makingPage,
  navigation,
  photographyItems,
  photographyPage,
  placeholderPage,
  projects,
  seo,
  site
} from "../src/site-data.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const buildDate = new Date().toISOString().slice(0, 10);
const notionProjectOverridesPath = path.join(rootDir, "src", "notion-projects.json");

const pageUrls = {
  "index.html": `${site.url}/`,
  "projects.html": `${site.url}/projects.html`,
  "things_i_do.html": `${site.url}/things_i_do.html`,
  "photography.html": `${site.url}/photography.html`,
  "coming_soon.html": `${site.url}/coming_soon.html`,
  "404.html": `${site.url}/404.html`
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageTitle(title) {
  return title.includes(site.name) ? title : `${title} | ${site.name}`;
}

function absoluteAsset(assetPath) {
  return `${site.url}/${assetPath}`.replace(/([^:]\/)\/+/g, "$1");
}

function renderSidebar(currentFile) {
  const links = navigation
    .map(({ label, href }, index) => {
      const current = href === currentFile;
      const className = index === 0 ? "nav-link nav-link-first" : "nav-link";
      return `<a class="${className}${current ? " is-current" : ""}" href="${href}"${
        current ? ' aria-current="page"' : ""
      }>${escapeHtml(label)}</a>`;
    })
    .join("");

  return `
    <aside class="sidenav" id="sidenav_menu" aria-label="Primary">
      <div class="sidenav_links">
        <a class="logo-link" href="index.html" aria-label="${escapeHtml(site.name)} home">
          <img id="logo" src="image/evren_icon_white.png" alt="${escapeHtml(site.name)} logo" height="35">
        </a>
        ${links}
      </div>
      <div class="sidenav_contacts">
        <a href="mailto:${site.email}" aria-label="Email ${escapeHtml(site.name)}">
          <img src="icon/gmail_white.png" alt="Email icon" height="40">
        </a>
        <a href="${site.social.linkedin}" target="_blank" rel="noreferrer" aria-label="LinkedIn">
          <img src="icon/linkedin_white.png" alt="LinkedIn icon" height="40">
        </a>
        <a href="${site.social.youtube}" target="_blank" rel="noreferrer" aria-label="YouTube">
          <img src="icon/youtube_white.png" alt="YouTube icon" height="40">
        </a>
      </div>
    </aside>
  `;
}

function renderShell({
  currentFile,
  metaTitle,
  metaDescription,
  bodyClass = "",
  content,
  ogImage = seo.defaultImage,
  robots = "index,follow",
  structuredData = []
}) {
  const canonicalUrl = pageUrls[currentFile];
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
    <link rel="stylesheet" href="CSS/site.css">
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
    <link rel="icon" href="image/evren_icon_black.png" type="image/png">
    ${schemaBlocks}
    <script src="JavaScript/site.js" defer></script>
  </head>
  <body class="${escapeHtml(bodyClass)}">
    <a class="skip-link" href="#content">Skip to content</a>
    ${renderSidebar(currentFile)}
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
      <footer class="page-footer">
        <p>${escapeHtml(site.email)}</p>
        <p>
          <a href="${site.social.linkedin}" target="_blank" rel="noreferrer">LinkedIn</a>
          <span>|</span>
          <a href="${site.social.youtube}" target="_blank" rel="noreferrer">YouTube</a>
        </p>
      </footer>
    </div>
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

function renderProjectCard(project, detailed = true) {
  return `
    <article class="work-card${detailed ? "" : " work-card-compact"}">
      <div class="work-thumb">
        <img src="${project.image}" alt="${escapeHtml(project.alt)}" loading="lazy">
        <div class="work-overlay">
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.category)}<span>${escapeHtml(project.year)}</span></p>
        </div>
      </div>
      ${
        detailed
          ? `<div class="work-details">
              <p>${escapeHtml(project.summary)}</p>
              <div class="work-actions">
                ${
                  project.externalUrl
                    ? `<a class="action-link" href="${escapeHtml(project.externalUrl)}" target="_blank" rel="noreferrer">Open project notes</a>`
                    : `<span class="status-label">${escapeHtml(project.status)}</span>`
                }
              </div>
            </div>`
          : ""
      }
    </article>
  `;
}

function renderMakingCard(item) {
  return `
    <article class="mini-card">
      <div class="work-thumb">
        <img src="${item.image}" alt="${escapeHtml(item.alt)}" loading="lazy">
        <div class="work-overlay work-overlay-small">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.category)}</p>
        </div>
      </div>
    </article>
  `;
}

function renderHomePage(projectData) {
  const featuredProjects = featuredProjectSlugs
    .map((slug) => projectData.find((project) => project.slug === slug))
    .filter(Boolean);

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
      ${renderSectionHeader("Work", "What I usually help with", [
        "I work best when a project needs both thinking and making. The details do not need to be solved yet. They just need to be worth testing."
      ])}
      <div class="text-grid">
        ${serviceCards}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Projects", "Selected projects", [
        "The longer case studies are still being rebuilt. For now the short summaries stay on the main project page."
      ])}
      <div class="work-grid">
        ${featuredProjects.map((project) => renderProjectCard(project, true)).join("")}
      </div>
    </section>

    <section class="page-section">
      ${renderSectionHeader("Process", "How I like to work", [
        "I prefer getting to a physical version early. A rough object usually answers more than a polished slide."
      ])}
      <div class="text-grid">
        ${processCards}
      </div>
    </section>
  `;
}

function renderProjectsPage(projectData) {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Projects", "Project work", [
        "A selection of product and concept work. The long writeups are still being rebuilt, so this page stays short and direct for now."
      ])}
      <div class="work-grid">
        ${projectData.map((project) => renderProjectCard(project, true)).join("")}
      </div>
    </section>

    <section class="page-section note-block">
      <p>
        Detailed project pages can later point to Notion or another external source. The structure is already in place for that, without changing the visible layout again.
      </p>
    </section>
  `;
}

function renderMakingPage() {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Things I do", "Smaller builds and experiments", makingPage.intro)}
      <div class="mini-grid">
        ${makingItems.map((item) => renderMakingCard(item)).join("")}
      </div>
    </section>
  `;
}

function renderPhotographyPage() {
  return `
    <section class="page-section page-section-first">
      ${renderSectionHeader("Photography", "Analog archive", photographyPage.intro)}
      <div class="photo-grid">
        ${photographyItems
          .map(
            (photo) => `
              <figure class="photo-card ${photo.span}">
                <button
                  type="button"
                  class="photo-button"
                  data-lightbox-button
                  data-lightbox-src="${photo.image}"
                  data-lightbox-alt="${escapeHtml(photo.alt)}"
                  data-lightbox-caption="${escapeHtml(photo.title)}"
                >
                  <img src="${photo.image}" alt="${escapeHtml(photo.alt)}">
                </button>
                <figcaption>${escapeHtml(photo.title)}</figcaption>
              </figure>
            `
          )
          .join("")}
      </div>
      <div class="lightbox" data-lightbox hidden>
        <button class="lightbox-close" type="button" aria-label="Close image" data-lightbox-close>Close</button>
        <figure class="lightbox-figure">
          <img src="" alt="" data-lightbox-image>
          <figcaption data-lightbox-caption></figcaption>
        </figure>
      </div>
    </section>
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
  email: site.email,
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
  url: pageUrls["projects.html"],
  description:
    "A selection of project summaries by Evren Ucar across product concepts, workshop tools, and mobility ideas."
};

async function loadProjectData() {
  let projectData = [...projects];

  try {
    await access(notionProjectOverridesPath);
    const rawOverrides = await readFile(notionProjectOverridesPath, "utf8");
    const overrides = JSON.parse(rawOverrides);

    if (Array.isArray(overrides)) {
      const overrideMap = new Map(
        overrides
          .filter((item) => item && typeof item.slug === "string")
          .map((item) => [item.slug, item])
      );

      projectData = projectData.map((project) => ({
        ...project,
        ...(overrideMap.get(project.slug) || {})
      }));
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  return projectData;
}

function renderSitemap(pageList) {
  const urls = pageList
    .filter((page) => !["coming_soon.html", "404.html"].includes(page.file))
    .map(
      (page) => `  <url>
    <loc>${pageUrls[page.file]}</loc>
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
  const projectData = await loadProjectData();

  const pages = [
    {
      file: "index.html",
      title: homePage.title,
      description: homePage.description,
      ogImage: homePage.hero.image.src,
      bodyClass: "page-home",
      structuredData: [websiteSchema, personSchema],
      content: renderHomePage(projectData)
    },
    {
      file: "projects.html",
      title: "Projects",
      description:
        "Selected project summaries from Evren Ucar across industrial design, product concepts, and physical prototyping work.",
      ogImage: projectData[2].image,
      bodyClass: "page-projects",
      structuredData: [websiteSchema, collectionSchema],
      content: renderProjectsPage(projectData)
    },
    {
      file: "things_i_do.html",
      title: "Things I Do",
      description: makingPage.description,
      ogImage: makingItems[0].image,
      bodyClass: "page-making",
      structuredData: [websiteSchema],
      content: renderMakingPage()
    },
    {
      file: "photography.html",
      title: "Photography",
      description: photographyPage.description,
      ogImage: photographyItems[4].image,
      bodyClass: "page-photography",
      structuredData: [websiteSchema],
      content: renderPhotographyPage()
    },
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

  await mkdir(path.join(rootDir, "CSS"), { recursive: true });
  await mkdir(path.join(rootDir, "JavaScript"), { recursive: true });

  await Promise.all(
    pages.map((page) =>
      writeFile(
        path.join(rootDir, page.file),
        renderShell({
          currentFile: page.file,
          metaTitle: page.title,
          metaDescription: page.description,
          bodyClass: page.bodyClass,
          ogImage: page.ogImage,
          robots: page.robots,
          structuredData: page.structuredData,
          content: page.content
        }),
        "utf8"
      )
    )
  );

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
