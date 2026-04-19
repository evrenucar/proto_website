# Notion Sync

The site now uses a token-free Notion sync.

Instead of calling the official Notion API, the sync script reads a local manifest of public shared page URLs and pulls each page through Notion's public web endpoints.

## Setup

Create `src/notion-public-pages.json` from [src/notion-public-pages.example.json](/C:/Users/evren/Documents/GitHub/proto_website/src/notion-public-pages.example.json).

Example:

```json
[
  {
    "url": "https://evrenucar.notion.site/Eurocrate-storage-universal-solution-310312b0d17d807db8f0dd315797b930?source=copy_link",
    "section": "projects",
    "slug": "eurocrate-storage-universal-solution",
    "category": "Storage system",
    "year": "2026",
    "summary": "A short card summary for the project card.",
    "actionLabel": "Read case study",
    "actionType": "page",
    "sortOrder": 10,
    "seoDescription": "A Eurocrate storage project synced from a public Notion page."
  }
]
```

Each entry points at one public shared Notion page.

That public shared page can come from any Notion account or workspace, as long as the page is publicly accessible by URL.

## Required fields

- `url`
- `section`

`section` must be one of:

- `projects`
- `things_i_do`
- `open-quests`

## Optional fields

- `slug`
- `title`
- `category`
- `year`
- `summary`
- `image`
- `alt`
- `actionLabel`
- `actionType`
- `actionUrl`
- `sortOrder`
- `seoDescription`

## What is pulled from Notion

For each public page URL, the sync script pulls:

- the page title
- the page block content
- the page `last_edited_time`
- page cover or first image, if available
- embedded Notion-hosted images and videos, downloaded into `notion_assets/`

## What stays in the local manifest

The card-level placement and labels stay in `src/notion-public-pages.json`:

- which section the item belongs to
- card category
- card year
- card summary override
- card action label and type
- sort order

That is the tradeoff for going token-free. You can still keep all the actual long-form pages inside one Notion database, but the site discovers items from the local list of public shared URLs instead of querying the database directly.

## Generated files

The sync writes:

- `src/notion-items.json`
- `notion_assets/**`

The build then generates internal detail pages under:

- `content/projects/**`
- `content/things_i_do/**`
- `content/open-quests/**`

## Local usage

Run:

```bash
npm run sync:notion
npm run build
```

If `src/notion-public-pages.json` is missing or empty, the sync script removes old generated Notion output and exits cleanly.

## Lean hourly sync

The sync script now checks each public page with a lightweight metadata request first.

If a page `last_edited_time` has not changed, the script reuses the cached rendered HTML and existing downloaded assets instead of pulling the full page again.

That makes an hourly GitHub Actions schedule practical without re-downloading unchanged content every time.

## GitHub Action

The GitHub Action runs `npm run sync:notion` and `npm run build`:

- on pushes to `main`
- on pull requests
- on manual `workflow_dispatch`
- every hour on a schedule using GitHub Actions cron

The current cron is:

```yaml
17 * * * *
```

GitHub cron uses UTC, so the scheduled sync currently runs at `:17` past every hour.

No Notion token or Notion secrets are required for this public-page sync flow.
