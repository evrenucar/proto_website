# Page Database Plan

## Goal

Create one content system that can drive:

- cards on listing pages
- internal detail pages
- external-link cards
- local-only items with no Notion page
- public Notion-backed items from any Notion account or workspace

The system should standardize behavior while still allowing different pages to present the same item differently.

## Current repo state

- `src/site-data.mjs` holds page copy and several local item arrays.
- `src/notion-public-pages.json` holds public Notion URLs and lightweight card overrides.
- `scripts/sync-notion.mjs` pulls public Notion pages into `src/notion-items.json`.
- `scripts/build-site.mjs` merges local items and Notion items, then renders different card shapes for different sections.

## Current pain points

- Card data is split across multiple places.
- Card fields are mostly hard-coded in the build layer.
- Click behavior is standardized in code, but not modeled clearly in the data.
- Local-only items and Notion-backed items do not share one schema.
- Different sections use different card structures, which makes reuse harder.
- The current token-free public-page flow is good for content sync, but not enough for interactive comments.

## Recommended direction

Use two layers:

1. A single item registry for content.
2. A collection/view config layer for presentation defaults.

The item registry should describe what an item is.

The collection/view config should describe how a page wants to show that item.

That keeps cards standardized without forcing every page to look identical.

## Item registry shape

Each item should be able to say:

- what section it belongs to
- whether it is local-only or Notion-backed
- what its default card title, summary, image, and metadata are
- what click behavior it uses
- whether it has an internal detail page
- which detail-page elements are visible

Suggested shape:

```json
{
  "id": "eurocrate-storage-universal-solution",
  "section": "projects",
  "source": {
    "type": "notion-public",
    "url": "https://example.notion.site/...public-link...",
    "syncContent": true
  },
  "content": {
    "title": "Eurocrate storage universal solution",
    "summary": "A short card summary.",
    "description": "Longer SEO or page description.",
    "image": "notion_assets/eurocrate-storage-universal-solution/card-image.png",
    "alt": "Eurocrate storage universal solution"
  },
  "meta": {
    "category": "Storage system",
    "year": "2026",
    "dateAdded": "2026-04-19",
    "dateModified": "2026-04-19T10:00:00.000Z",
    "extra": {
      "client": "",
      "status": "active"
    }
  },
  "card": {
    "size": "lg",
    "fields": ["category", "year", "summary", "dateModified"],
    "click": {
      "mode": "page",
      "url": ""
    }
  },
  "detail": {
    "enabled": true,
    "showHero": true,
    "showMeta": ["category", "year", "dateAdded", "dateModified", "notionLink"],
    "showComments": false
  }
}
```

## Local-only items

Local-only items should use the same schema.

The only difference should be:

- `source.type = "local"`
- no Notion URL is required
- detail content can come from a local HTML or Markdown source, or from inline fields

Example:

```json
{
  "id": "useful-aluminum-supplier",
  "section": "cool-bookmarks",
  "source": {
    "type": "local"
  },
  "content": {
    "title": "Useful aluminum supplier",
    "summary": "Reliable source for small workshop quantities.",
    "description": ""
  },
  "meta": {
    "category": "Supplier",
    "dateAdded": "2026-04-19"
  },
  "card": {
    "size": "sm",
    "fields": ["category", "summary", "dateAdded"],
    "click": {
      "mode": "external",
      "url": "https://example.com"
    }
  },
  "detail": {
    "enabled": false,
    "showComments": false
  }
}
```

## Collection and page presentation

The site should not let every item fully redesign its own card.

Instead, each collection page should define presentation defaults such as:

- default card variant
- allowed card sizes
- default visible fields
- default click behavior
- default detail-page metadata visibility

Example collection config:

```json
{
  "projects": {
    "cardVariant": "media",
    "defaultSize": "lg",
    "defaultFields": ["category", "year", "summary"],
    "defaultClickMode": "page",
    "detailDefaults": {
      "showHero": true,
      "showMeta": ["category", "year", "dateModified", "notionLink"]
    }
  },
  "cool-bookmarks": {
    "cardVariant": "text",
    "defaultSize": "sm",
    "defaultFields": ["summary", "dateAdded"],
    "defaultClickMode": "external",
    "detailDefaults": {
      "showHero": false,
      "showMeta": ["dateAdded"]
    }
  }
}
```

This is the cleanest way to keep cards standardized while still allowing per-page flexibility.

## Standard click behavior

Click behavior should be normalized into one small set of modes:

- `page`
- `external`
- `status`
- `none`

Rules:

- `page`: card opens the generated internal page
- `external`: card opens a direct external link
- `status`: card is visible but not clickable and shows a label
- `none`: card is present without an action

That same behavior should drive the whole card and the action label, instead of each section inventing its own interaction.

## Dates and extra variables

Dates should be normalized centrally:

- `dateAdded`
- `dateModified`
- `notionLastEdited`

Extra metadata should live under one `meta.extra` object so new variables can be added without changing the whole schema each time.

The card config should decide which fields are shown.

The detail-page config should decide which fields are shown there.

## Notion input model

Public Notion content should remain supported because it is simple and works without secrets.

That means:

- any public shared Notion page URL can be used
- the public URL can come from another Notion account or workspace
- card-level overrides should stay local so the site presentation stays under repo control

## Comments

Comments should be treated as a read-only feature, not a write-back feature.

Recommended path:

1. Phase 1: no website comments, only page/content sync.
2. Phase 2: read-only mirrored comments from Notion.

Important constraint:

The current token-free public-page sync does not automatically give full comment retrieval.

If read-only mirrored comments are added, they should be planned as a separate sync path and checked carefully against the exact access model for each Notion source page.

## Best migration order

1. Create the new page database schema.
2. Move local items into that schema.
3. Adapt the Notion sync output to match the same schema.
4. Add collection/view config for standardized card rendering.
5. Refactor `scripts/build-site.mjs` to render cards from shared helpers and shared config.
6. Add optional detail-page visibility toggles.
7. Only then evaluate read-only comment mirroring.
