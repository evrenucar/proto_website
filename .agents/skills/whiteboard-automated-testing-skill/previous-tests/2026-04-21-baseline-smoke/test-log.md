# 2026-04-21 Baseline Smoke

## Scope

- Target page: `http://127.0.0.1:3000/braindump.html`
- Browser MCP: `mcp__playwright__`
- Goal: seed the new testing archive with a small desktop and mobile evidence set
- Guardrail: skip `Save`, `Export`, `Import`, and full GitHub recommendation submission so the canonical board file is not mutated during the baseline

## Environment

### Desktop pass

- Browser: Playwright Chromium page
- Viewport: `1440x960`
- Local state: replaced with an empty board before the run

### Mobile pass

- Browser: Playwright Chromium mobile context
- Viewport: `390x844`
- Flags:
  - `isMobile: true`
  - `hasTouch: true`
- User agent: iPhone-like Safari string
- Local state: replaced with an empty board before the run

## Results

### Desktop

- `pass` Initial board loaded cleanly without console warnings.
- `pass` Text tool created a note on an empty board.
- `pass` Draw tool created a visible stroke on an empty board.
- `pass` Toolbar active state updated correctly during the smoke sequence.

### Mobile

- `pass` Initial mobile layout rendered with the wrapped toolbar visible.
- `pass` Text tool created a mobile note.
- `pass` Draw tool created a touch-generated stroke.
- `fail` Touch drag on an existing item did not move the item.
  - Before drag attempt: `left: 160px`, `top: 230px`
  - After drag attempt: `left: 160px`, `top: 230px`
  - Likely cause: item drag and resize are still bound to mouse handlers on `.bd-item`, while mobile support is mainly implemented through viewport-level touch handlers.

## Artifacts

- `desktop-initial.png`
- `desktop-note-and-draw.png`
- `mobile-initial.png`
- `mobile-text-note.png`
- `mobile-draw.png`

## Next Fix Target

- Implement touch-based item manipulation for existing nodes on mobile.
- Re-run the mobile checklist after that change and add a second archived test folder instead of overwriting this one.
