# Engine Registry Verification Test Log

- Date: 2026-04-23
- Server: `http://127.0.0.1:4173`
- Desktop viewport: `1440x960`

## Results

- desktop initial load: `pass`
- draw tool activation: `pass`
- drawing stroke: `pass`
- console check: `pass`

## Screenshot Proof

- `braindump-desktop-initial.png` (already existed)
- `braindump-desktop-text.png` (already existed)
- `braindump-desktop-draw.png`

## Notes (Automated Playwright Run — 2026-04-23)

- **Engine refactor selectors confirmed:** All three generic selectors — `[data-board-app="true"]`, `[data-board-role="canvas"]`, and `[data-board-ui="toolbar"]` — were present and attached in the DOM after page load.
- **Draw tool activation:** Clicking `[data-tool="draw"]` set `data-mode="draw"` on the viewport element and triggered `aria-pressed="true"` on the button. Both are expected post-refactor behaviors.
- **Board loaded with content:** 98 `.bd-item` canvas elements were rendered from the board state. The engine initialized correctly with the new generic selectors.
- **Mouse stroke dispatch:** Mouse events dispatched from (600, 400) to (750, 500) in 15 incremental steps. Viewport bounding box confirmed as `{x:0, y:0, width:1440, height:960}` (full-screen `position:fixed`).
- **Console errors:** Two `400` errors from `/api/save-board` only — expected in static preview mode. No JavaScript runtime errors or unhandled exceptions.
- **Playwright:** 1.59.1, headless Chromium.

---

# 2026-04-23 Engine Registry Verification

## Scope

- verify the shared board registry and generic board page renderer
- verify Braindump still works after host-scoped runtime changes
- verify Cosmoboard still mounts correctly on desktop and mobile

## Local preview

- `http://127.0.0.1:4173`
- `http://192.168.2.18:4173`

## Commands

```powershell
npm run build
node tests/cosmoboard-build.test.mjs
```

## Browser verification

Desktop Braindump:
- cleared local storage and reloaded the page
- confirmed board mount
- verified pan changed the canvas transform
- verified wheel zoom changed the canvas transform
- created and edited a new text note: `Engine registry verification note`
- drew a new stroke and confirmed it became a new `.bd-layer-draw` node
- exported the board to `braindump-export.canvas`
- created an extra note: `AFTER EXPORT`
- imported the exported file and confirmed:
  - the exported verification note remained
  - the extra post-export note was removed
  - item count returned to the exported count

Desktop Cosmoboard:
- opened `cosmoboard.html`
- confirmed board mount and onboarding panel copy

Mobile Braindump:
- opened a touch/mobile context at `390x844`
- created and edited a new text note: `Mobile smoke note`

Mobile Cosmoboard:
- opened `cosmoboard.html` in the same mobile context
- confirmed board mount and onboarding panel copy

## Result summary

- `npm run build`: pass
- `node tests/cosmoboard-build.test.mjs`: pass
- Braindump desktop interaction matrix: pass
- Braindump mobile text smoke: pass
- Cosmoboard desktop smoke: pass
- Cosmoboard mobile smoke: pass

## Screenshots and proof artifacts

- `braindump-desktop-initial.png`
- `braindump-desktop-text.png`
- `braindump-desktop-draw.png`
- `braindump-mobile-smoke.png`
- `cosmoboard-desktop-smoke.png`
- `cosmoboard-mobile-smoke.png`
- `braindump-export.canvas`

## Console note

- Static preview still emits `404` requests for `/api/save-board` because the lightweight local server does not provide the repository save endpoint.
- Local draft persistence and import/export still worked during verification.
- This was observed during preview verification and was not introduced by the board registry / host-scoping changes.
