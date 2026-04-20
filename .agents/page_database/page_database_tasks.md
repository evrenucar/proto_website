# Page Database Tasks

## Current status (what is going on)

- Planning exists in `agents/page_database/page_database_plan.md`.
- Hourly Notion sync is in place.
  - Validation: `npm run sync:notion`
- The Notion sync is lean: unchanged pages are reused from cache instead of being fully pulled again.
  - Validation: the sync still reuses unchanged pages when the cache version matches
- Comments are scoped to read-only only.
- Stage 1 is now implemented: local shared page database source.
  - Added `src/page-database.mjs`
  - Moved local project, making, open-quest, and bookmark items out of `src/site-data.mjs`
- Stage 2 is now implemented: build pipeline reads the shared local source.
  - `scripts/build-site.mjs` now loads local items from `pageDatabaseItems`
  - Homepage featured projects and bookmark cards now read from the shared source
  - Card field visibility and detail meta visibility now come through normalized item data
  - Validation: `npm run build`
  - Validation: browser check via Playwright CLI screenshots
  - Note: the first browser pass caught a missing `cool-bookmarks` section mapping and that was fixed in `scripts/build-site.mjs`
  - Validation: checked generated output in `index.html`, `projects.html`, `things_i_do.html`, `open-quests.html`, `cool-bookmarks.html`, and `content/projects/eurocrate-storage-universal-solution.html`
- Stage 3 is now implemented: Notion publishing fields feed the page database model.
  - `Publishing_Type` can override the fallback manifest `section`
  - `Publishing_Status`, `summary`, `effort`, `dateAdded`, and `dateModified` now sync into `src/notion-items.json`
  - Notion property alias support now exists for future databases with different property names or property ids
  - Validation: `npm run sync:notion`
  - Validation: `ipad-os-on-iphone` now routes into `open-quests` from Notion data instead of staying forced under `projects`
- Stage 4 is now implemented: standardized modular cards and centered detail pages.
  - content cards now use one shared render model for projects, things i do, open quests, and bookmarks
  - the whole title card is clickable when the item has a page or external link
  - projects, things i do, open quests, and bookmarks now share one visual system with section-specific accents
  - summary now shows by default for `projects`, `things_i_do`, and `open-quests`
  - detail pages now use centered intro/content framing and stay centered when the desktop nav is collapsed
  - Validation: `npm run build`
  - Validation: Playwright screenshots for `projects.html`, `open-quests.html`, `content/projects/project-box-system.html`, and the same detail page with collapsed desktop nav state
- Stage 5 is now implemented: card polish pass and bookmark database wiring.
  - the accent strip now sits between the media area and the content area instead of on the rounded outer edge
  - card hover no longer lifts or adds drop shadow
  - image hover brightness is still retained
  - `open-quests` cards now use a split layout with media on the left and a vertical accent strip
  - `lastUpdated` now renders as a small footer field on every card, with `none` when missing
  - empty configured fields now render as `none` instead of disappearing
  - the bookmark page `Material Properties Database` now comes through the same main Notion manifest path under `cool-bookmarks`
  - built-in alias support now covers the current bookmark database property ids, so adding another page from that same bookmark database only needs the Notion link plus the `cool-bookmarks` section entry
  - Validation: `npm run sync:notion`
  - Validation: `npm run build`
  - Validation: Playwright screenshots for `projects.html`, `open-quests.html`, `things_i_do.html`, `cool-bookmarks.html`, and `content/cool-bookmarks/material-properties-database.html`
- Stage 6 is now implemented: ordering, tighter project cards, and detail-page endcaps.
  - `projects`, `things_i_do`, and `open-quests` now sort newest-first using `lastUpdated`, with undated items falling after dated ones
  - project cards now use a smaller default size and a tighter status/category row
  - Notion-backed categories now only come from actual Notion data, so missing categories render as `none`
  - bookmark-style `Publishing_Type` values like `Web_app` now map into `cool-bookmarks` without needing a custom section synonym later
  - open-quest cards now stay wide and horizontal instead of collapsing into awkward tall ratios on listing pages
  - detail pages now end with a related-item gallery plus `Go back to top` and `Go back` controls
  - Validation: `npm run sync:notion`
  - Validation: `npm run build`
  - Validation: Playwright screenshots for `projects.html`, `open-quests.html`, and `content/projects/project-box-system.html`
- Stage 7 is now implemented: bookmark media cards and retrieval metadata polish.
  - `cool-bookmarks` now uses a media card variant instead of a text-only card
  - bookmark card media follows the fallback order: explicit entry image, Notion page cover / first image, then external-page preview image
  - public Notion-hosted bookmark images are now downloaded locally through signed URLs so they render reliably on the site
  - bookmark tags now sit under the image strip and use the synced category/tags value
  - bookmark cards now show `Retrieved` using the page creation time instead of `Last updated`, and the footer date omits the hour
  - status/type pills were tightened further, and bookmark pills were reduced again so they do not waste width
  - support now exists for video start-time badges on thumbnail media when the external link contains a start timestamp
  - the bottom ticker now compensates for the scrollbar gutter so the cyan strip reaches the visual edge
  - Validation: `npm run sync:notion`
  - Validation: `npm run build`
  - Validation: Playwright screenshots for `cool-bookmarks.html`, `content/cool-bookmarks/material-properties-database.html`, and `projects.html`
  - Note: the video timestamp badge and open-graph-only fallback paths are implemented, but the current live bookmark example already has a Notion image and no timestamped video link, so those two paths were not exercised by the current dataset

## What is left (to be done)

### 1. Finish the shared schema

- align Notion-backed items more explicitly with the page database shape
  - current state: they normalize into the same internal build shape, but the raw source files are still separate from `src/page-database.mjs`
- decide whether `src/notion-items.json` should stay as-is or move closer to the page database schema
- decide whether collection config should also hold detail defaults for future local detail pages

### 2. Expand standardized card behavior

- keep using one click model: `page`, `external`, `status`, `none`
  - current state: wired through normalized items
- decide whether to expose more field keys beyond the current set
  - current state: `publishingType`, `publishingStatus`, `category`, `year`, `effort`, `summary`, `dateAdded`, and `lastUpdated` all have render support
- decide whether card size also needs grid-span presets in data
  - current state: `cardSize` now affects card styling, but not automatic grid span changes
- decide whether local placeholder cards should keep showing explicit `none` values or whether those placeholders should be replaced with real Notion-backed items sooner
  - current state: they now keep structural consistency by showing `none`

### 3. Expand standardized detail-page behavior

- decide whether archived or draft-like statuses should stay visible or be auto-filtered
  - current state: statuses are displayed, not filtered
- decide which detail metadata fields should be shown by default for each collection
  - current state: `publishingType`, `publishingStatus`, `dateAdded`, `lastUpdated`, and `notionLink` are supported
- keep detail-page rendering driven by data instead of section-specific hard-coding
  - current state: hero visibility and meta visibility are already data-aware
- keep comments optional per detail page
- decide whether detail-page intro metadata should keep horizontally scrolling on small screens or collapse into a second layout
  - current state: it stays in one compact row and can scroll horizontally when space is tight

### 4. Clean up the source split further

- decide whether more local content should move out of `src/site-data.mjs`
  - page copy and global site copy can stay there
  - card/item content should prefer `src/page-database.mjs`
- wire any additional Notion bookmarks databases into the same sync/build path
  - current state: `cool-bookmarks` already merges Notion items and the current bookmark database works through built-in aliases
  - current state: other bookmark databases with different property ids can still use `propertyAliases` per entry until a shared preset is added
- add one explicit example of:
  - a local-only item
  - a public Notion-backed item
  - a direct external-link bookmark
- decide whether per-database property alias presets should live in a dedicated config file instead of repeating them per entry

## Not in scope for now

- website comment write-back
- changing the site into a new visual system
- replacing the current public-page Notion sync approach

## Done already

- GitHub Actions runs the sync hourly
- unchanged Notion pages are skipped and reused from cache
- read-only comments are the only comment direction still under consideration
- `src/page-database.mjs` exists and is wired into the build
- local cards are no longer sourced from multiple separate arrays in `src/site-data.mjs`
- Notion publishing fields now shape section routing and card/detail metadata
- title cards now share one modular design system and use whole-card click behavior
- detail pages are visually centered in both normal and collapsed desktop-nav states
- bookmark-style Notion pages can now live in the main manifest and resolve direct external links through synced Notion fields
- card fields now stay structurally consistent by rendering `none` when configured data is missing

## Completion criteria

- one shared content schema exists for local and Notion-backed content at the build layer
- local and Notion-backed items use the same core normalized model
- card click behavior is standardized
- card field visibility is configurable per page or collection
- detail-page visibility is configurable per item
- the build still produces the same overall site structure and feel
