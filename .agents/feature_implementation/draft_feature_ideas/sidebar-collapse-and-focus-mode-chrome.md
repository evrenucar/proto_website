# Sidebar Collapse and Focus Mode Chrome

## Problem / Why
The left sidebar is core to the navigation model, but on narrow screens and during deep canvas work it competes with the content. Users want a way to fold the sidebar to a thin rail, then fully hide it for a focus pass, without losing the ability to jump back. The current behavior is binary and a little jumpy.

## Sketch
- Three-state sidebar: expanded, rail, hidden. Rail shows icons only at a fixed width near 56px. Hidden removes the sidebar entirely and reveals a small floating "show nav" affordance in the top left.
- Smooth transition between states using the shared motion tokens, under 180ms, with reduced-motion fallback to instant. The content area uses CSS grid columns so reflow is clean and no horizontal scroll appears mid-animation.
- Keyboard shortcut, `Cmd or Ctrl + \\`, cycles through expanded, rail, hidden. The state persists per device in `localStorage`, plus an opt-in URL flag so a shared link can open in focus mode.
- Focus mode also tones down non-essential page chrome: header drops to a thin strip, footer hides, and any inline canvas embeds gain a subtle border so they still feel anchored on a quieter page.
- Maintain focus and ARIA correctness: when the sidebar hides, focus moves to the content's main landmark, and the show-nav button is reachable by tab and labeled.

## Notes
- Touch points: the layout shell component, the sidebar component, global keyboard shortcut handling, the motion tokens from the reduced-motion work if that lands first.
- Precedent: Linear's command bar and Notion's sidebar both have similar three-state behavior, worth a quick look for the rail width and icon spacing.
- Keep the teal highlight for the active nav item visible in the rail state, since that is the strongest "you are here" signal when labels are gone.

