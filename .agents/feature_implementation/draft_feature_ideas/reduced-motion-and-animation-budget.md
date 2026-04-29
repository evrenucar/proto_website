# Reduced Motion and Animation Budget

## Problem / Why
The site uses zoom, pan, and reveal animations in a few places, and more are coming with nested boards. Users with vestibular sensitivity or `prefers-reduced-motion: reduce` should not be hit with parallax, large zooms, or long eased transitions. Today there is no central knob, so each component decides on its own.

## Sketch
- Define a small CSS custom property layer: `--motion-duration-fast`, `--motion-duration-base`, `--motion-duration-slow`, plus `--motion-ease-standard` and `--motion-ease-emphasized`. All components consume these.
- Add a `prefers-reduced-motion: reduce` media query that collapses durations to near zero and disables transform-based zoom and pan animations, replacing them with instant state changes or short opacity fades under 120ms.
- Audit existing animations against a budget. Default page transitions stay under 200ms, canvas zoom under 300ms, sidebar collapse under 180ms. Anything longer needs a written reason.
- Expose a user toggle in the sidebar footer, "Reduce motion", that sets a `data-motion="reduce"` attribute on the root and persists in `localStorage`. This overrides the OS preference upward but never downward.
- Document the tokens and the budget in the design notes so future features inherit the rule.

## Notes
- Touch points: global CSS variables file, the canvas zoom and pan code, the sidebar collapse component, any framer-motion or anime.js usage.
- Worth checking whether the canvas wipe transition on this branch already respects reduced motion. If not, fold that into this work.
- Keep the existing teal accent. This is purely about timing and intensity.

