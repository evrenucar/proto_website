# Board Runtime Scope Refactor Test Log

- Date: 2026-04-23
- Preview server:
  - `http://127.0.0.1:4173`
  - `http://192.168.2.18:4173`
- Desktop viewport: `1440x960`
- Mobile viewport: `390x844` with touch context

## Validation

- `npm run build`: pass
- `node tests/cosmoboard-build.test.mjs`: pass
- Desktop smoke:
  - `braindump.html`: pass
  - `cosmoboard.html`: pass
- Mobile smoke:
  - `cosmoboard.html`: pass
- Console follow-up:
  - direct check on `cosmoboard.html` returned no console errors

## What Was Checked

- Both board pages expose the new generic host hooks:
  - `data-board-app="true"`
  - `data-board-role="canvas"`
- Braindump still loads with the toolbar visible after the runtime selector refactor.
- Cosmoboard still loads with the toolbar, board nodes, and onboarding panel visible.
- The mobile Cosmoboard layout still shows the board surface and onboarding panel together.

## Screenshot Proof

- `braindump-runtime-smoke.png`
- `cosmoboard-runtime-smoke.png`
- `cosmoboard-runtime-mobile-smoke.png`
