# Notion sync notes

The site is not pulling from Notion yet, but the structure is ready for it.

## Current setup

- Base project data lives in `src/site-data.mjs`.
- Optional project overrides can live in `src/notion-projects.json`.
- During `npm run build`, the build script checks for that JSON file and merges entries by `slug`.

## Suggested JSON shape

Use `src/notion-projects.example.json` as the template.

Example:

```json
[
  {
    "slug": "moto-gimbal",
    "externalUrl": "https://www.notion.so/your-workspace/your-project-page",
    "status": "Open project notes",
    "summary": "Optional summary override from Notion."
  }
]
```

## Recommended GitHub Action flow

1. Query Notion for your project pages.
2. Map each Notion page to a site `slug`.
3. Write the result to `src/notion-projects.json`.
4. Run `npm run build`.
5. Deploy the generated site or publish the branch as usual.

## Good first step when you are ready

Keep the current hand-written summaries as the default source of truth. Let Notion override only fields that benefit from being updated often:

- `externalUrl`
- `status`
- `summary`

That keeps the website stable even if Notion is unavailable or the sync job fails.
