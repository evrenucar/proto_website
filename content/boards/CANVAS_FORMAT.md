# .canvas format

## Purpose

A `.canvas` file is the canonical board file for Cosmoboard. It is plain JSON, stored on disk under `content/boards/<slug>/current.canvas`, and loaded at runtime by the Cosmoboard engine. The format is intentionally close to the [Obsidian Canvas](https://jsoncanvas.org/) spec so boards can be imported and exported with compatible tooling.

Every board is exactly one `.canvas` file. The file describes the full persistent state of the board: which nodes exist, where they are placed, and where the viewport was last parked. Transient UI state (selection, hover, active tool) is never written to the file.

## Top-level keys

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `nodes` | `Node[]` | Yes | Ordered list of all items on the board. Render order is array order (later items paint on top). |
| `edges` | `Edge[]` | Yes | Connections between nodes. May be an empty array. |
| `viewport` | `Viewport` | Yes | The camera state the board was saved at. |
| `version` | `integer` | No | Schema version integer. Defaults to `1` when absent. |

### Viewport

| Key | Type | Description |
| --- | --- | --- |
| `x` | `number` | Horizontal pan offset in canvas coordinates. |
| `y` | `number` | Vertical pan offset in canvas coordinates. |
| `z` | `number` | Zoom scale factor (1.0 = 100 %). |

### Edge

Edges are stored but not actively rendered in the current engine implementation. Shape is reserved for future use.

| Key | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique edge identifier. |
| `fromNode` | `string` | ID of the source node. |
| `toNode` | `string` | ID of the destination node. |
| `label` | `string` | Optional display label. |

## Item types

Every node shares a common geometry envelope and a `type` discriminator. All coordinates are in canvas space (see [Coordinate system](#coordinate-system)).

### Common node fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Unique identifier for this node on this board. |
| `x` | `number` | Yes | Left edge of the node in canvas coordinates. |
| `y` | `number` | Yes | Top edge of the node in canvas coordinates. |
| `width` | `number` | Yes | Width of the node in canvas coordinates. |
| `height` | `number` | Yes | Height of the node in canvas coordinates. |
| `type` | `string` | Yes | Item type discriminator. See types below. |

---

### `text`

A plain-text or inline-SVG node. Used for free-form notes, labels, and freehand drawing strokes.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | `string` | Yes | Content. Plain text for notes; an inline `<svg>` string for drawing strokes. |

Drawing strokes are stored as `text` nodes whose `text` value is a self-contained `<svg>` element with `class="bd-drawing"`. Stroke geometry is encoded as SVG `<path>` elements with absolute coordinates matching the board's canvas space.

---

### `link`

A URL bookmark card with optional rich-preview metadata.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | `string` | Yes | The target URL. May be empty (`""`) while the user is editing. |
| `title` | `string` | No | Display title fetched or entered by the user. |
| `description` | `string` | No | Short description or OG description. |
| `image` | `string` | No | Preview image URL (may be a `data:` URI for locally cached images). |
| `embedMode` | `"preview" \| "live"` | No | `"preview"` renders a card; `"live"` mounts an interactive iframe. Defaults to `"preview"`. |
| `hasAdjustedRatio` | `boolean` | No | Whether the node's aspect ratio has been manually adjusted away from the image's intrinsic ratio. |
| `embedRatio` | `number` | No | Stored aspect ratio for iframe embeds (width ÷ height). |
| `isEditingUrl` | `boolean` | No | Ephemeral write-time flag indicating the URL input is open. Should be `false` or absent in saved files. |

---

### `markdown`

An inline render of a `.md` file referenced by path.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | `string` | Yes | Path to the source markdown file (relative or absolute from the site root). |
| `href` | `string` | No | Navigation href for opening the file. Usually the same as `file`. |
| `title` | `string` | No | Display title shown when the file is collapsed or loading. |
| `_rawMarkdown` | `string` | No | Cached raw markdown content. Written at save time for offline/static rendering. Treated as a cache — the file is authoritative. |

---

### `board-preview`

An embedded preview of another board, rendered read-only inside a minimap-style card.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `boardSlug` | `string` | Yes | Slug identifier of the linked board (matches the directory name under `content/boards/`). |
| `boardSource` | `string` | Yes | Relative path to the linked board's `.canvas` file. |
| `boardHref` | `string` | Yes | Navigation href for opening the linked board in its full-page view. |
| `title` | `string` | No | Display title for the preview card. |
| `description` | `string` | No | Short description shown in the card footer. |

---

### `base`

A live data table sourced from a JSON collection. Renders rows from a filtered and projected dataset.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | `string` | Yes | Path to the source JSON file (e.g. `content/base-data/items.json`). |
| `collection` | `string` | No | Optional sub-collection name within the source file. |
| `filter` | `string` | No | Filter expression string (e.g. `"section=projects"`). |
| `columns` | `string[]` | No | Ordered list of column names to display. |
| `title` | `string` | No | Display title for the base card header. |

---

### `file`

An embedded image or binary asset. The file content is stored as a `data:` URI or as a path to an asset on disk.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | `string` | Yes | `data:` URI containing the file content, or a path to the source asset. |
| `hasAdjustedRatio` | `boolean` | No | Whether the node's aspect ratio has been manually adjusted. |

---

### `app`

An embedded application card backed by an app configuration record.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | `string` | Yes | Path to the app configuration JSON file. |
| `embedMode` | `"preview" \| "live"` | No | Render mode. Defaults to `"preview"`. |
| `appConfig` | `object` | No | Inline snapshot of the app config (slug, appName, description, url, icon, tags). Treated as a cache — the source file is authoritative. |

## Coordinate system

The canvas uses a flat 2D coordinate system with no physical units.

- **Origin** — the point `(0, 0)` is an arbitrary logical center. There is no required home position.
- **X axis** — positive X is to the right.
- **Y axis** — positive Y is downward (matches browser layout conventions).
- **No fixed bounds** — the canvas is infinite in all directions. Nodes may be placed at any coordinate, including large negative values.
- **Viewport** — the `viewport` object stores the last saved camera position. `x` and `y` are the pan offset applied to the canvas transform; `z` is the zoom scale factor where `1.0` equals 100 % and values less than `1.0` zoom out. The exact CSS transform applied is `translate(x px, y px) scale(z)` (or equivalent).
- **Node geometry** — `x` and `y` on a node are the position of its top-left corner in canvas space. `width` and `height` are the node's dimensions in the same coordinate space.
- **Drawing strokes** — freehand strokes are stored as SVG paths whose coordinates are in canvas space. The SVG `viewBox` attribute encodes the bounding box of the stroke in canvas coordinates; the element is sized and positioned by the host node's geometry envelope.

## Embed semantics

The `embedMode` field on `link` and `app` nodes controls how external content is rendered:

| Value | Rendering behavior |
| --- | --- |
| `"preview"` | A static card: title, description, thumbnail image, and a clickable link. No live network request at board render time. |
| `"live"` | An interactive iframe mounted inside the node bounds. The iframe is loaded eagerly when the node enters the viewport. Use sparingly — live embeds are heavy and unsuitable for boards with many external links. |

When `embedMode` is absent the engine defaults to `"preview"`.

The `image` field on `link` nodes may contain a `data:` URI. This is used to cache a thumbnail locally so the board can render a preview without a network request. Data URIs are written by the dev server's save endpoint when metadata is prefetched.

## Versioning

The format is at **v1**. The `version` field is optional; when absent the file is treated as v1.

Breaking changes to the format (removing a field, changing its semantics) will increment `version`. Additive changes (new optional fields, new node types) will not increment it. The JSON Schema (`canvas.schema.json`) in this directory is marked `"not final"` and will be updated in sync with the format.

Cosmoboard's interchange profiles (`native`, `obsidian-compatible`, `portable-bundle`) may produce or consume `.canvas` files with additional or restricted fields. For the `obsidian-compatible` profile, the Cosmoboard-specific types (`board-preview`, `base`, `app`) will be exported as Obsidian-compatible fallback representations.

## Worked example

Source file: [`content/boards/cosmoboard/current.canvas`](cosmoboard/current.canvas)

The excerpt below shows the three most common node types as they appear in that file.

```json
{
  "nodes": [
    {
      "id": "cosmo-title",
      "x": 120,
      "y": 80,
      "width": 1220,
      "height": 170,
      "type": "text",
      "text": "Cosmoboard\nA first onboarding board inside the current site\nFile-first. Local-first. Oriented, not just captured."
    },
    {
      "id": "cosmo-board-file",
      "x": 480,
      "y": 790,
      "width": 320,
      "height": 180,
      "type": "link",
      "url": "content/boards/cosmoboard/current.canvas",
      "title": "Open Board File",
      "description": "The canvas file is the board. Edit it locally first, then rebuild and ship.",
      "embedMode": "preview"
    },
    {
      "id": "cosmo-braindump",
      "x": 120,
      "y": 789,
      "width": 320,
      "height": 330,
      "type": "board-preview",
      "boardSlug": "braindump",
      "boardSource": "content/boards/braindump/current.canvas",
      "boardHref": "braindump.html",
      "title": "Braindump",
      "description": "A linked board preview."
    }
  ],
  "edges": [],
  "viewport": {
    "x": 1579.5,
    "y": -1015.3,
    "z": 0.82
  }
}
```

**Annotated fields:**

- `"type": "text"` — plain text note; `text` holds the display string (newlines are literal).
- `"type": "link"` — URL bookmark; `embedMode: "preview"` means render as a card, not a live iframe.
- `"type": "board-preview"` — inline minimap of another board; `boardSlug` drives which board to load, `boardHref` is the navigation target.
- `viewport.z` — zoom at 82 %, i.e. slightly zoomed out from 1:1.

## See also

- [`content/boards/AGENTS.md`](AGENTS.md) — per-directory worker notes for the `content/boards/` tree (sibling unit).
- [`canvas.schema.json`](canvas.schema.json) — JSON Schema (draft 2020-12) for this format.
- [`.agents/whiteboard/cosmoboard_implementation_plan.md`](../../.agents/whiteboard/cosmoboard_implementation_plan.md) — full implementation roadmap for the Cosmoboard engine.
- [`.agents/holistic_planning/extension_seams.md`](../../.agents/holistic_planning/extension_seams.md) — enumeration of surfaces an extension can plug into, including canvas-item renderer seams (sibling unit).
