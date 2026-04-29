# 1. Test Guide

Use this file as the index for the `tests/` folder.

## 1-A. Context-saving rule

Do not open or read every test file by default.

- Start with this document.
- Pick only the test files that match the area you are changing.
- Read a test file only when you need implementation detail, exact selectors, fixture shape, or cleanup behavior.
- If your change is unrelated to a test's feature area, skip that test file to avoid wasting context.

This matters because most tests are narrow regression guards, and loading all of them into context is usually noise.

## 1-B. How the suite works

- Most files in `tests/` are standalone Node scripts with top-level `assert` checks.
- Browser coverage uses Playwright directly inside the script instead of a separate test runner.
- Several tests start `scripts/preview-server.mjs` on a dedicated port.
- A few tests temporarily write to board or markdown files and then restore them in `finally` blocks.

## 1-C. Prerequisites

- Install dependencies: `npm install`
- If Playwright browsers are missing: `npx playwright install chromium`
- Rebuild site output before preview/browser tests when HTML or runtime assets may be stale: `node scripts/build-site.mjs`

## 1-D. How to run tests

Run one test:

```powershell
node tests/cosmoboard-build.test.mjs
```

Run a small targeted group:

```powershell
node tests/preview-server-routes.test.mjs
node tests/preview-save-endpoint.test.mjs
node tests/preview-markdown-endpoint.test.mjs
```

Run all tests sequentially in PowerShell:

```powershell
Get-ChildItem tests\*.mjs | Sort-Object Name | ForEach-Object { node $_.FullName }
```

Prefer targeted runs over full-suite runs unless you changed shared infrastructure.

## 1-E. Which tests to use

- Build pipeline or generated HTML changes: run the `*-build*` tests.
- Preview server routing or API changes: run the `preview-*` endpoint/server tests.
- Board runtime, toolbar, localStorage, embed, export, paste, or save behavior: run the relevant `*-runtime*` or `*-e2e*` tests.
- Content/entity wiring changes: run the shared entity tests.
- Markdown authoring flow changes: run the markdown tests.

## 2. Test inventory

### 2-A. Board and Cosmoboard

- `board-save-export-runtime.test.mjs`
  Checks static runtime wiring in `JavaScript/braindump.js` and `cosmoboard.html`: Ctrl/Cmd+S save flow, single `.canvas` export action, board-page URL paste resolution, export size fallback fetching, and deep-clone behavior during export.
  Use when editing save/export keyboard shortcuts, export modal logic, URL paste handling, or board serialization.

- `board-save-reload-e2e.test.mjs`
  Opens `cosmoboard` in Playwright, saves through Ctrl+S, verifies `/api/save-board` persists to disk, and confirms the saved board survives reload without downloading a file.
  Use when changing preview save behavior, save shortcuts, local draft restoration, or board persistence.

- `board-url-paste-preview-e2e.test.mjs`
  Pastes a board page URL into `cosmoboard` and verifies it becomes a working `board-preview` node with no error status.
  Use when changing clipboard paste handling, board URL resolution, or board-preview node creation.

- `cosmoboard-build.test.mjs`
  Builds the site and verifies board page discovery, generated board HTML, preview embeds on the homepage, toolbar shell markup, runtime hooks, source version stamping, and sitemap output.
  Use when changing board page generation, homepage board previews, board metadata, or build output structure.

- `cosmoboard-initial-layout.test.mjs`
  Uses Playwright to verify the initial desktop layout does not overlap the sidenav or key onboarding/demo cards.
  Use when changing Cosmoboard layout, positioning, onboarding cards, or desktop spacing.

- `cosmoboard-legacy-render-fields.test.mjs`
  Seeds legacy localStorage state and verifies old `board-preview` and markdown node field shapes still render correctly.
  Use when changing node migration logic, markdown node loading, or backwards compatibility for saved boards.

### 2-B. Export and bundling

- `export-bundling-build.test.mjs`
  Builds board pages and verifies the export modal, single-board export copy, local `fflate` script, and zip-capable import input are present.
  Use when changing export/import UI, board page templates, or bundle-related assets.

- `export-bundling-e2e.test.mjs`
  Imports a handcrafted zip bundle in the browser and verifies bundled image, markdown, and nested board assets are rewritten to blob URLs and rendered.
  Use when changing bundle import/export behavior, zip parsing, blob URL remapping, or embedded asset restoration.

- `export-bundling-runtime.test.mjs`
  Verifies the runtime source includes markdown and board-preview assets in bundle export/import logic.
  Use when refactoring export/import runtime code and you want a fast static regression check before browser coverage.

- `export-size-subpages-e2e.test.mjs`
  Opens the export modal and verifies the estimated export size gets larger when linked boards/markdown subpages are included.
  Use when changing size estimation, subpage inclusion, or resource measurement logic.

### 2-C. Preview server and markdown authoring

- `extract-assets.test.mjs`
  Unit-style filesystem test for `extractCanvasAssets()`. It extracts inline data URLs into image files and rewrites canvas node paths.
  Use when changing asset extraction, canvas normalization, or asset output path rules.

- `markdown-authoring-e2e.test.mjs`
  Uses the UI to create and edit a markdown node, verifies `/api/save-markdown`, and confirms the markdown file is written to disk and re-rendered.
  Use when changing markdown creation/edit flows, markdown modal UI, or preview markdown persistence.

- `preview-markdown-endpoint.test.mjs`
  Calls `/api/save-markdown?slug=cosmoboard` directly and verifies the response payload plus file write.
  Use when changing the markdown save API without needing full browser coverage.

- `preview-mode-smoke.mjs`
  Older manual-style Playwright smoke script for `braindump.html`, `cosmoboard.html`, and preview-mode injection. It assumes a server is already running on port `4173` and writes screenshots/logs into `.agents/...`.
  Use only for manual investigation or broad smoke checking. Do not treat it as the first-choice regression test for normal feature work.

- `preview-save-endpoint.test.mjs`
  Calls `/api/save-board?slug=cosmoboard` directly and verifies the board file is updated.
  Use when changing board save API behavior, payload handling, or disk persistence.

- `preview-server-routes.test.mjs`
  Starts the preview server and verifies extensionless routes map to the correct generated HTML pages instead of the 404 page.
  Use when changing route resolution, preview server path mapping, or extensionless board/project URLs.

### 2-D. Recommendations, entities, and embeds

- `recommendation-flow-e2e.test.mjs`
  Exercises the recommendation export and GitHub handoff flow, verifying the downloaded filename, modal copy, and generated GitHub issue URL/body.
  Use when changing recommendation UI, exported recommendation files, or GitHub handoff/query-string generation.

- `shared-entity-build.test.mjs`
  Builds the site and verifies entity data is wired consistently across `src/registry.json`, `content/entities/index.json`, base data, and the Cosmoboard canvas.
  Use when changing entity generation, registry shaping, or project-to-entity linking.

- `shared-entity-runtime-e2e.test.mjs`
  Loads Cosmoboard in the browser and verifies shared entity nodes and base table rendering for the Eurocrate entity.
  Use when changing entity rendering, base table rendering, or board-to-entity runtime integration.

- `youtube-live-embed.test.mjs`
  Seeds saved board state with YouTube watch/live URLs and verifies the generated embed iframe URL, permissions, open-link behavior, and sizing.
  Use when changing bookmark embeds, YouTube URL normalization, iframe attributes, or live-preview rendering.

## 3. Suggested minimal test sets

### 3-A. Save and persistence changes

- `board-save-export-runtime.test.mjs`
- `board-save-reload-e2e.test.mjs`
- `preview-save-endpoint.test.mjs`

### 3-B. Markdown changes

- `preview-markdown-endpoint.test.mjs`
- `markdown-authoring-e2e.test.mjs`

### 3-C. Export and import changes

- `board-save-export-runtime.test.mjs`
- `export-bundling-runtime.test.mjs`
- `export-bundling-build.test.mjs`
- `export-bundling-e2e.test.mjs`
- `export-size-subpages-e2e.test.mjs`

### 3-D. Preview server changes

- `preview-server-routes.test.mjs`
- `preview-save-endpoint.test.mjs`
- `preview-markdown-endpoint.test.mjs`

### 3-E. Board rendering and layout changes

- `cosmoboard-build.test.mjs`
- `cosmoboard-initial-layout.test.mjs`
- `cosmoboard-legacy-render-fields.test.mjs`

## 4. When not to use a test

- Do not run Playwright-heavy tests for content-only edits unless the content affects the feature under test.
- Do not read `preview-mode-smoke.mjs` unless you specifically need that legacy/manual smoke workflow.
- Do not inspect every test file just to understand the test suite; use this document to narrow the list first.
