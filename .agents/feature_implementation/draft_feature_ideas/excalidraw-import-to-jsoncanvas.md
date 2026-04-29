# Excalidraw Import to JSONCanvas

## Problem / Why
A lot of design and product folks already keep loose diagrams in Excalidraw `.excalidraw` files, often inside their Obsidian vault via the Excalidraw plugin. Letting them drop one of those files onto a Cosmoboard board and get a usable JSONCanvas equivalent removes a real switching cost and makes Cosmoboard feel like a superset rather than yet another silo.

## Sketch
- Parse the `.excalidraw` JSON, walk its `elements` array, and translate the supported shapes (rectangle, ellipse, text, arrow, line, image, frame) into JSONCanvas nodes and edges.
- Map Excalidraw frames to JSONCanvas groups, and arrows with `startBinding` and `endBinding` to JSONCanvas edges between the bound nodes.
- Drop unsupported types (freedraw strokes, complex stroke styles) onto a single PNG fallback node per region, so nothing visually disappears, and log the loss in the import report.
- Pull embedded images out of the `files` table in the `.excalidraw` and write them through the content-hashed asset store.
- Offer the inverse "Export selection as Excalidraw" later, gated on the import being solid first.

## Notes
- Reference: Excalidraw element schema in `@excalidraw/excalidraw` types, and the JSONCanvas node and edge shapes.
- Touch points: import dispatcher, JSONCanvas writer, asset store.
- Open question: do we preserve the Excalidraw "rough" sketchy look on the fallback raster, or render the survivable shapes in our native clean style. Default to clean, offer a toggle.
