# Optional Light Mode With Paired Tokens

## Problem / Why
The site is dark by default and that is the brand. Some readers genuinely prefer light, especially for long markdown pages in bright rooms, and print and screenshot use cases benefit from a light surface. A real light mode also forces the codebase to clean up hardcoded colors, which pays off for theming nested boards later.

## Sketch
- Introduce a token layer: `--bg`, `--bg-elevated`, `--fg`, `--fg-muted`, `--border`, `--accent`, `--accent-fg`, `--link`, `--link-visited`. Dark mode keeps current values. Light mode is a paired set tuned to the same hues, with the teal accent darkened slightly so it hits 4.5 to 1 against light backgrounds.
- Theme switch reads OS preference by default, with a manual override in the sidebar that persists. Order of precedence: explicit override, then OS, then dark fallback. Use `color-scheme` so native form controls and scrollbars match.
- Replace hardcoded `#hex` and `rgba` values across components with the token names. The canvas grid, node borders, and the photography page caption strip all need updates.
- Keep the photography grid visually identical in feel: in light mode, image backgrounds stay dark behind each photo so the grid still reads as a gallery, only the chrome around it flips.
- Add a visual regression check or at least a dual-screenshot snapshot of the home, photography, and a sample markdown page in both modes.

## Notes
- This is also a low risk way to find latent contrast bugs in dark mode while doing the audit.
- Touch points: the global token file, every component that hardcodes color, the sidebar settings area, the photography page wrapper.
- Open question: do we theme `.canvas` content, or treat board content as user data that keeps its own colors. Probably the latter, with chrome themed.

