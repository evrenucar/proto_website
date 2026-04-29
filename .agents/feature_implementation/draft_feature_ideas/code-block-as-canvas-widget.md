# Code Block as Canvas Widget

## Problem / Why
A markdown fenced code block is static text, but inside a canvas the same block could be a tiny live widget, a slider, a chart, a JSON-driven preview. Authors want one source of truth (the code block in markdown) that turns into a useful interactive node when the markdown is embedded into a canvas. Today they have to maintain two assets, one for reading and one for showing.

## Sketch
- Recognize a small set of fence info-strings as widget hints, for example ` ```chart`, ` ```slider`, ` ```mermaid`, ` ```form`. The fenced body is the widget's data or definition.
- When the markdown is rendered inline on a canvas, those fenced blocks render as widget nodes with the body parsed and the widget's chrome (axes, handle, button) drawn natively. When the same markdown is rendered in plain text mode, the block stays as a regular code block with the source visible.
- A "promote to standalone node" action lifts a widget out of its parent markdown node into its own canvas node, while leaving an anchor in the markdown so round-tripping back to plain text still works.
- Live values: a slider widget can write its current value to a sibling code block tagged `value-of: <slider-id>`, which other widgets read. This gives small reactive setups without adding a real scripting layer.
- Widget set is intentionally tiny at MVP. Each widget is a small pure function, no eval, no remote fetch by default.

## Notes
- Precedent: Observable's reactive cells, mdx's component embedding, Notion's inline databases. The local-first twist is that everything is plain markdown the user can read and edit by hand.
- Code areas to touch: markdown renderer (fence handler), canvas embed renderer (recognize widget hints), one tiny widget registry module.
- Open question: should widget state (slider position, form input) persist? Yes, but in a sidecar `.canvas-state` file next to the canvas, not inside the markdown, so reading the markdown elsewhere stays clean.
- Security: no code execution in widgets by default. Anything beyond pure declarative widgets goes behind an explicit user opt-in per board.
