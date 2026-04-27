# Cosmoboard Onboarding Test Log

- Date: 2026-04-23
- Server: `http://127.0.0.1:4173/cosmoboard.html`
- Desktop viewport: `1440x960`
- Mobile viewport: `390x844` with `isMobile: true` and `hasTouch: true`

## Results

- desktop layout and nav: `pass`
  - loaded `index.html`, navigated into `cosmoboard.html`, then back out to `projects.html` and into `cosmoboard.html` again
  - onboarding panel copy rendered
  - board title node, linked GitHub card, and toolbar were all visible
- mobile layout: `pass`
  - onboarding panel rendered
  - toolbar remained visible
  - mobile menu button remained visible
- console review: `pass`
  - no warnings or errors were captured during the run

## Screenshot Proof

- `cosmoboard-desktop-initial.png`
- `cosmoboard-desktop-linked-item.png`
- `cosmoboard-mobile.png`

## Notes

- This run used the preview server because repository writes were not part of the check.
- Local `board:cosmoboard` state was cleared before each pass so the board loaded from the canonical file.
