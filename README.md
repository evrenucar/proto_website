# evrenucar.com

Personal website for Evren Ucar.

## Setup

```bash
npm run sync:notion
npm run build
npm run preview
```

Preview runs at `http://127.0.0.1:4173`.

## Structure

- `src/site-data.mjs` holds the base copy, fallback cards, and photography content.
- `src/notion-public-pages.json` is the token-free manifest of public shared Notion page URLs.
- `scripts/sync-notion.mjs` turns those public pages into `src/notion-items.json`.
- `scripts/build-site.mjs` generates the static HTML pages, generated detail pages, `robots.txt`, and `sitemap.xml`.
- `CSS/site.css` is the shared styling.
- `JavaScript/site.js` handles the mobile nav, copy-email buttons, and photography lightbox.

## Notion flow

The site supports public shared Notion pages for:

- `Projects`
- `Things i do`
- `Open-Quests`

Each manifest entry can control:

- which section the item belongs to
- the card summary and labels
- whether the card opens an internal page, an external URL, or only shows a status label
- sort order

The page title, long-form content, media, and last-updated time are pulled from the public shared Notion page itself.

No Notion token is required.

## Commands

```bash
npm run sync:notion
npm run build
```

More detail is in [docs/notion-sync.md](/C:/Users/evren/Documents/GitHub/proto_website/docs/notion-sync.md).
