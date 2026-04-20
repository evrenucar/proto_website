# 2026-04-21 Mobile Drag Fix

## Scope

- Target page: `http://127.0.0.1:3000/braindump.html`
- Browser MCP: `mcp__playwright__`
- Goal: verify that touch dragging an existing node now works on mobile after the event-handler update in `JavaScript/braindump.js`
- Guardrail: skip `Save`, `Export`, `Import`, and full GitHub recommendation submission so repository board data is not mutated

## Environment

- Browser: Playwright Chromium mobile context
- Viewport: `390x844`
- Flags:
  - `isMobile: true`
  - `hasTouch: true`
- User agent: iPhone-like Safari string
- Local state: replaced with an empty board before the run

## Results

- `pass` Desktop drag still worked after the shared interaction-handler update.
  - Before drag: `left: 480px`, `top: 300px`
  - After drag: `left: 600px`, `top: 390px`
- `pass` Text tool created a mobile note.
- `pass` Touch dragging the note moved it.
  - Before drag: `left: 160px`, `top: 230px`
  - After drag: `left: 280px`, `top: 330px`
- `pass` Draw tool still created a touch-generated stroke after the drag fix.

## Artifacts

- `desktop-drag-after-touch-fix.png`
- `mobile-before-drag.png`
- `mobile-after-drag-and-draw.png`

## Outcome

- The mobile drag regression reproduced in the earlier baseline is no longer present in this follow-up run.
