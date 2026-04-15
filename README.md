# evrenucar.com

Personal website for Evren Ucar.

## Setup

```bash
npm run build
npm run preview
```

Preview runs at `http://127.0.0.1:4173`.

## Structure

- `src/site-data.mjs` holds the main site copy, project list, archive items, and photography selection.
- `scripts/build-site.mjs` generates the static HTML pages plus `robots.txt` and `sitemap.xml`.
- `CSS/site.css` is the shared styling for the live site.
- `JavaScript/site.js` handles the mobile navigation and photography lightbox.

## Updating content

- Edit `src/site-data.mjs` for the main homepage text, project summaries, and archive labels.
- Run `npm run build` after content or layout changes.

## Future Notion path

- `scripts/build-site.mjs` will automatically read `src/notion-projects.json` if it exists.
- Use `src/notion-projects.example.json` as the shape for future overrides.
- This makes it possible for a GitHub Action to fetch project links or summary overrides from Notion and rebuild the site without changing the hand-written base content.

More detail is in [docs/notion-sync.md](/c:/Users/evren/Documents/GitHub/proto_website/docs/notion-sync.md).
