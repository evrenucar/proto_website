# Canvas Keyboard Nav and ARIA

## Problem / Why
The canvas surface is currently mouse and trackpad first. Keyboard users and screen reader users cannot move between nodes, open them, or understand spatial structure. A canvas that is unusable without a pointer is not acceptable for a public portfolio, and it blocks any future "preview-first embed" reader who lands via a deep link.

## Sketch
- Make every canvas node a focusable element with a stable tab order derived from reading order, top to bottom then left to right, ties broken by node id.
- Add arrow-key spatial navigation between focused nodes. Up, down, left, right pick the nearest neighbor in that direction by center distance.
- Expose roles and labels: the canvas root is `role="application"` with an `aria-label`, each node is `role="group"` or `role="article"` with `aria-label` from its title or first heading, edges get `aria-describedby` linking endpoints.
- Provide a visible focus ring in teal that matches the existing accent and meets 3 to 1 contrast against the dark background. Suppress the ring on mouse focus using `:focus-visible`.
- Add a keyboard shortcut overlay, triggered by `?`, that lists the canvas keys. Mention it once via a small hint on first focus.

## Notes
- Touch points: the canvas renderer, the node component, and the global stylesheet that owns `:focus-visible`.
- Precedent worth a quick look: tldraw and Excalidraw both have partial keyboard nav. Obsidian Canvas has very limited a11y, so this is a real differentiator for Cosmoboard.
- Open question: how to announce edges without flooding screen readers. A "show connections" command that lists neighbors in a live region may be cleaner than per-edge ARIA.

