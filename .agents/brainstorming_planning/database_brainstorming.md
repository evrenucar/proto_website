# Database Brainstorming

> **Categorize and update as this discussion is evolving.**
>
> Living doc for the structured / database / bases layer. Sibling to `vison_planning.md`, `version_control_and_backups.md`, `searchbar_tools.md`, `ai_agents_in_the_loop.md`, `security_and_access.md`. Decisions get promoted to `vison_planning.md → Decisions`. Stable architecture eventually flows to `.agents/holistic_planning/holistic_architecture.md` (do not edit that from here).

Started: 2026-04-29
Source conversation: user request to add a dedicated brainstorming file for the database concept. Scope confirmed in interview: Cosmoboard bases (broader than the existing canvas `base` node) with a future bridge where the same `.md` + `.base` files render *editable* in Cosmoboard and *as a preview page* on the website. Obsidian Bases compat target = subset round-trip + our extensions in a separate namespace. All four topic clusters in scope (data model · views · query/storage/perf · sync/import/export). Decisions section starts empty — fresh brainstorm.

Holding pen for evolving discussion. Stable decisions belong in `.agents/holistic_planning/` (do not edit those from here). This file is the *thinking layer* — the planning layer is downstream of it.

### How this doc fits

```
                           ┌─────────────────────────────┐
                           │     vison_planning.md       │   north star · decisions index
                           └──────────────┬──────────────┘
                                          │
                                          │  "Structured" pillar (Phase 3)
                                          ▼
                           ┌─────────────────────────────┐
                           │  database_brainstorming.md  │   ◀── this file
                           │   (the structured layer)    │
                           └──────────────┬──────────────┘
                                          │
                       cross-cuts ⇣       │       cross-cuts ⇡
                                          │
   ┌──────────────────┬───────────────────┼────────────────────┬────────────────┐
   ▼                  ▼                   ▼                    ▼                ▼
 version_control  ai_agents_in_   security_and_access   searchbar_tools     page_database
 _and_backups.md  the_loop.md     .md                   .md                  /  (sibling)

 row history,    AI-computed     encrypted bases,      database results    *other* DB system
 milestones      columns;         per-row scope         in palette;         (website cards).
 over rows;      schema-aware     grants                tag/property        §10 sketches the
 branching       agents                                 facets              bridge to it.
 a base.
```

The page_database system in `.agents/page_database/` is a **different concept** with a similar word. It models website cards (Notion-synced + local) for the portfolio listing pages. The Cosmoboard database concept brainstormed here is broader (file-backed, Obsidian-compatible, queryable) and §10 sketches the future bridge where Cosmoboard bases eventually subsume page_database.

---

## Index

- [Decisions (locked)](#decisions-locked)
- [What this doc is for](#what-this-doc-is-for)
- [Why a database layer at all](#why-a-database-layer-at-all)
- [Conceptual model](#conceptual-model)
- [Data model](#data-model)
- [Storage format](#storage-format)
- [Query, filter, formula](#query-filter-formula)
- [Views](#views)
- [Cosmoboard ↔ website: unified render](#cosmoboard--website-unified-render)
- [Sync, conflicts, version control](#sync-conflicts-version-control)
- [Import / export](#import--export)
- [Competitive comparison](#competitive-comparison)
- [Future bridges (cross-doc)](#future-bridges-cross-doc)
- [Open Questions](#open-questions)
- [Hard Questions](#hard-questions)
- [Update Log](#update-log)

---

## Decisions (locked)

*None yet.* This file starts at the open-ideation stage. As items harden, lift them out of *Open Questions* / *Hard Questions* into this section and promote the largest cross-cutting calls to `vison_planning.md → Decisions`.

---

## What this doc is for

Cosmoboard already ships a `base` node in `.canvas` files — a small live data table with `source`, `collection`, `filter`, `columns`, `title` (rendered by `renderBaseNode` in `JavaScript/braindump.js:5881`). It works for the demo case ("show me a table of projects in this canvas") and not much else.

The user's product intent is bigger than that node. From `holistic_planning.md → Product Pillars`:

> **Structured** — Databases and bases can query, filter, and cross-reference notes, boards, and files.

And from the Phased Roadmap:

> **Phase 3 — Structured local views.** Base / database layer over notes, boards, and assets.

So there are two open design questions sitting on top of the existing canvas node:

1. **What is the underlying database?** A directory of markdown files with frontmatter? A `.base` YAML view definition à la Obsidian? A SQLite file? Some hybrid? The canvas `base` node is one *consumer* of whatever the answer is.
2. **How does it cross over to the website?** The user's intent (interview, 2026-04-29): "markdown files should also become website page databases as well that will be displayed in their preview mode for websites." Same files, two render modes — *editable* in Cosmoboard, *preview* on the site.

This doc thinks through both, in public.

---

## Why a database layer at all

A spatial canvas + markdown folder gets you 80% of "thinking workspace." The remaining 20% — the part that turns notes into a system — is when you want to *ask the folder questions*:

- "Show me every project tagged `active` and sort by last edit."
- "Group all my industrial-design notes by client."
- "Calendar of every dated note in `kitchen-renovation/`."
- "Which research notes link to this paper?"

Markdown alone can't answer these without scrolling. A graph view (Obsidian) helps with the link question, but not the others. Tags help with the first, but only crudely. The **structured layer** is the answer to *all* of them — it treats your folder as a queryable database and lets a view be the answer to a question.

Coverage today vs. with a structured layer:

```
                 NO STRUCTURED LAYER                WITH STRUCTURED LAYER
   ──────────────────────────────────────    ──────────────────────────────────────
   "find a note"           ▓▓▓▓▓░░░░░         ▓▓▓▓▓▓▓▓▓▓                 ← search
   "show all of type X"    ▓░░░░░░░░░         ▓▓▓▓▓▓▓▓▓▓                 ← base/table
   "group by Y"            ░░░░░░░░░░         ▓▓▓▓▓▓▓▓▓▓                 ← group view
   "calendar"              ░░░░░░░░░░         ▓▓▓▓▓▓▓▓▓▓                 ← calendar view
   "what links here"       ▓▓▓░░░░░░░         ▓▓▓▓▓▓▓▓▓▓                 ← relation
   "publish as a list"     ░░░░░░░░░░         ▓▓▓▓▓▓▓▓▓▓                 ← unified render
   "compute a column"      ░░░░░░░░░░         ▓▓▓▓▓▓▓▓░░                 ← formulas / AI
```

The existing canvas `base` node already gestures at the bottom three rows in a tiny way. The job of this doc is to think about doing them well, broadly, and portably.

---

## Conceptual model

The minimum useful vocabulary. Everything below is built from these five ideas.

```
   ┌───────────────────────────────────────────────────────────────────────┐
   │                          THE FIVE PIECES                              │
   │                                                                       │
   │   ┌────────────┐                                                      │
   │   │  DATABASE  │   "the projects in my workspace"                     │
   │   │   (a set)  │   defined by a *source rule*                         │
   │   └─────┬──────┘   (folder, tag, glob, query)                         │
   │         │                                                             │
   │         │  yields                                                     │
   │         ▼                                                             │
   │   ┌────────────┐                                                      │
   │   │    ROW     │   one .md file (or one record inside a structured    │
   │   │            │   container — see §Storage format)                   │
   │   └─────┬──────┘                                                      │
   │         │  has                                                        │
   │         ▼                                                             │
   │   ┌────────────┐                                                      │
   │   │   FIELD    │   one frontmatter key, one body-extracted value,     │
   │   │  (column)  │   or one computed expression                         │
   │   └─────┬──────┘                                                      │
   │         │                                                             │
   │         │  filtered / sorted / grouped by                             │
   │         ▼                                                             │
   │   ┌────────────┐                                                      │
   │   │   QUERY    │   filter + sort + group + projection                 │
   │   │  (a view's │                                                      │
   │   │   recipe)  │                                                      │
   │   └─────┬──────┘                                                      │
   │         │  rendered by                                                │
   │         ▼                                                             │
   │   ┌────────────┐                                                      │
   │   │    VIEW    │   table · board · calendar · gallery · canvas-node   │
   │   │            │   (and: website preview)                             │
   │   └────────────┘                                                      │
   └───────────────────────────────────────────────────────────────────────┘
```

Three things this model deliberately commits to:

- **Rows are files, not opaque records.** A row's content is a real `.md` (or other portable artifact) on disk. A "database" is just a *named view rule* over a folder. Same wedge as the rest of Cosmoboard: open the folder in Obsidian and the rows are still files.
- **Fields are pluggable.** Frontmatter keys are the cheap default; body-extracted (e.g. first H1 → title), inline (`key:: value` Dataview-style), and computed (formula or AI) fields stack on top.
- **Views are recipes, not duplicates.** A view does not own data. Two views over the same database just disagree about how to *show* it.

---

## Data model

### Field types (first cut)

| Type | Source | Storage form | Example |
| --- | --- | --- | --- |
| `text` | frontmatter | YAML string | `title: Kitchen plan` |
| `number` | frontmatter | YAML number | `effort: 8` |
| `boolean` | frontmatter | YAML bool | `published: true` |
| `date` | frontmatter | ISO 8601 string | `due: 2026-05-15` |
| `datetime` | frontmatter | ISO 8601 with tz | `last_edit: 2026-04-29T10:32:00+02:00` |
| `enum` (single) | frontmatter | one of declared values | `status: active` |
| `multi` (tags) | frontmatter | YAML list | `tags: [design, kitchen]` |
| `relation` | frontmatter (path or wikilink) | string path or `[[link]]` | `client: [[Anil Industrial]]` |
| `file` | frontmatter (path) | string path | `hero: ./images/cover.png` |
| `body` | derived from `.md` body | inline | first H1 → `title` |
| `inline-prop` | Dataview-style `key:: value` in body | inline | `due:: 2026-05-15` |
| `computed` | formula expression | not stored | `days_left = due - now()` |
| `ai-computed` | LLM call with declared inputs | cached + recomputed on input change | `summary = ai("Summarize the body")` |

**Declared vs inferred.** The schema can be either:

- **Inferred** — read every row in the database, union the frontmatter keys, type-guess (numbers → `number`, ISO strings → `date`, etc.). Cheap. Works on day one. Wrong sometimes (a string column that happens to all be digits).
- **Declared** — the `.base` definition lists fields and types explicitly. Authoritative. Slightly more typing for the user.

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │                          SCHEMA RESOLUTION                          │
   │                                                                     │
   │   .base file says       row frontmatter says       what gets used   │
   │   ─────────────────     ─────────────────────     ─────────────     │
   │      no fields:         year: 2026                 inferred:        │
   │      (none declared)    title: Kitchen             year: number     │
   │                         tags: [a, b]               title: text      │
   │                                                    tags: multi      │
   │                                                                     │
   │      year: number       year: "2026" (string!)     declared wins    │
   │      title: text                                   year: 2026       │
   │                                                    (parse error     │
   │                                                     surfaces in UI) │
   │                                                                     │
   │      year: number       year: 2026                 declared +       │
   │      title: text        cost: 1500 (extra)         inferred extras  │
   │                                                    are kept,        │
   │                                                    typed by guess   │
   └─────────────────────────────────────────────────────────────────────┘
```

**Recommendation (open):** declared fields override; inferred fields fill in the rest with a small "inferred" badge in the UI so the user can promote them with one click.

### Relations between databases

Relations are not a separate type system — they're a string path or wikilink that the runtime *resolves* against another database. Chains are flat (no Notion-style two-way auto-mirroring; reverse links are a *query*, not a stored field).

```
       ┌────────────────────┐                  ┌────────────────────┐
       │ projects/           │                  │ clients/           │
       │ ├── kitchen.md      │                  │ ├── anil.md        │
       │ │   client: [[anil]]│ ──── resolves ──▶│ │   name: Anil ID  │
       │ ├── library.md      │                  │ │   active: true   │
       │ │   client: [[oma]] │                  │ │                  │
       │ └── ...             │                  │ ├── oma.md         │
       └────────────────────┘                  │ │   name: OMA ...   │
                ▲                               │ └── ...             │
                │                               └────────────────────┘
                │ reverse query (computed in views, not stored):
                │   "all projects where client = this row"
                │
       Anil's page can ask:
         related "active projects" = projects.where(client == self).where(status == "active")
```

Two design corollaries:
- **No write-back to the linked file when a relation is created.** Editing `kitchen.md`'s frontmatter to set `client: [[anil]]` does not modify `anil.md`. The reverse list is computed at view time. This keeps file ownership clean and round-trips losslessly.
- **Wikilinks vs paths.** Both should resolve. `[[anil]]` is friendlier to Obsidian; `./clients/anil.md` is friendlier to plain editors and CI pipelines. The runtime should accept both and normalize on save (preference: `[[anil]]` when the target is unambiguous).

---

## Storage format

This is the largest single open question. Three honest options:

| Strategy | Where data lives | Where the view lives | Pros | Cons |
| --- | --- | --- | --- | --- |
| **A · File-per-row** (the Obsidian way) | One `.md` per row in a folder; data is the YAML frontmatter | A `.base` YAML file describing source + view | Maximally portable; works with plain editors; no migration; round-trips Obsidian | Frontmatter is awkward for tabular data with many fields; perf hits at thousands of rows; querying needs an index |
| **B · Single-file table** (the Notion way) | One `.csv` / `.json` / `.parquet` per database | Same `.base` YAML, but `source: ./data/projects.csv` | Cleanest for spreadsheet-like data; small file count; predictable shape | Rows aren't standalone documents; can't drop into a board or open in Obsidian as notes; loses the "every row is a file" wedge |
| **C · SQLite + projections** (the Tana way) | `.cosmoboard/db.sqlite` is the truth; markdown projections sync both ways | `.base` is a query | Fastest; supports thousands of rows; good for relations and computed columns | Heaviest; the `.sqlite` is opaque to plain editors; sync conflicts get hard; least Obsidian-compatible |

**Recommendation (open):** ship **Option A** for v1 (matches the wedge, matches Obsidian), tolerate its perf ceiling at ~5k rows per database, and add **Option B as an opt-in** for clearly-tabular data (CSV imports, sensor logs, transaction tables). Reserve **Option C** for "we measured a real perf wall" — not before.

### Example `.base` file (subset of Obsidian Bases YAML, with our extensions in a separate namespace)

```yaml
# projects.base — shared with Obsidian for the subset; extensions are ours

filters:
  and:
    - taggedWith(file, "project")
    - file.folder == "projects"

properties:
  status:
    displayName: "Status"
  due:
    displayName: "Due"

formulas:
  days_left: 'date(this.due) - date(now())'

views:
  - type: table
    name: "Active"
    filters:
      and:
        - this.status == "active"
    order:
      - file.name
      - status
      - due
      - formula.days_left

  # ─── Cosmoboard extensions ────────────────────────────────────
  # Lives in our namespace so Obsidian ignores it and our app reads it.
  cosmoboard:
    - type: canvas-base-node       # the existing .canvas base node
      name: "Active (board)"
      filters:
        and:
          - this.status == "active"
      columns: ["title", "publishingStatus", "year", "effort"]
    - type: ai-summary
      name: "Status digest"
      input: "{{rows.where(status==active)}}"
      prompt: "One paragraph status digest, friendly tone."
      cache_key: "weekly"
```

The top-level structure (`filters`, `properties`, `formulas`, `views`) mirrors Obsidian Bases. The `cosmoboard:` block is our extension namespace — Obsidian ignores keys it doesn't know, our renderer reads them. Subset round-trip: open the same vault in Obsidian, the table view works; open in Cosmoboard, the canvas view + AI summary also work.

### File layout under a workspace

```
my-workspace/
├── projects/                             ← rows live here, one .md per row
│   ├── kitchen-plan.md
│   ├── library-renovation.md
│   └── ...
├── clients/
│   ├── anil.md
│   └── oma.md
├── .bases/                               ← view definitions (our convention)
│   ├── projects.base                     ← Obsidian-compatible
│   └── projects.cosmoboard.json          ← our extras (or inline in .base)
├── .cosmoboard/
│   ├── index/                            ← derived; safe to delete
│   │   ├── projects.idx                  ← MiniSearch / FTS for queries
│   │   └── ai-cache.kv                   ← AI-computed column cache
│   └── history/                          ← from version_control_and_backups.md
└── boards/
    └── overview.canvas                   ← contains a `base` node referencing projects.base
```

Two rules:
- **Everything outside `.cosmoboard/` is portable.** The `.cosmoboard/` folder is a derived cache; deleting it costs CPU on next open, never data.
- **`.bases/` is the cross-tool meeting point.** Same files Obsidian reads (when its Bases plugin is on) and we read.

---

## Query, filter, formula

### The expression layer

Three jobs, one syntax:

```
   FILTER       which rows match     →  table_filter, view_filter
   FORMULA      a computed value     →  computed columns, derived fields
   PROJECTION   what rows to show    →  view "order"/"columns" lists
```

A filter is just a boolean formula. A formula is just an expression that may reference fields and other formulas. Projection is a list of field names plus formulas. So the language is *one* expression grammar.

### Sketch (subset round-trip with Obsidian Bases formula syntax)

```ebnf
expr      ::= literal
            | field-ref
            | unary-op expr
            | expr binary-op expr
            | function-call
            | "(" expr ")"

literal   ::= string | number | boolean | date-literal | null
field-ref ::= "this." ident | "file." ident | ident
binary-op ::= "==" | "!=" | "<" | "<=" | ">" | ">="
            | "&&" | "||"
            | "+" | "-" | "*" | "/"
            | "in" | "contains"
function-call ::= ident "(" [ expr ("," expr)* ] ")"

# Built-in functions (subset; aim for parity with Obsidian Bases first):
#   now()                        — current datetime
#   today()                      — current date
#   date(x)                      — parse to date
#   formatDate(d, fmt)
#   length(list)
#   contains(list, item)
#   taggedWith(file, tag)        — Obsidian-compat
#   inFolder(file, path)         — Obsidian-compat
#   icon(name)                   — render helper
#   if(cond, then, else)
```

### Filter examples (real ones, in increasing order of muscle)

| Goal | Expression |
| --- | --- |
| Active projects | `this.status == "active"` |
| Due in the next week | `this.due >= today() && this.due < today() + days(7)` |
| Tagged research, not archived | `contains(this.tags, "research") && this.archived != true` |
| In the projects folder, with a client | `inFolder(file, "projects") && this.client != null` |
| Reverse: clients linked from any active project | `this in projects.where(p, p.status == "active").map(p, p.client)` |

The last one is the one that needs care — see *Hard Questions* on whether reverse-relation queries deserve syntactic sugar (Dataview's `dv.pages("...")` is a precedent).

### Side-by-side with Obsidian Bases

```
   GOAL                   OBSIDIAN BASES                  COSMOBOARD (subset)
   ─────────────────────  ─────────────────────────       ─────────────────────────
   active rows            this.status == "active"   ←─── identical
   tag filter             taggedWith(file, "x")     ←─── identical
   in folder              inFolder(file, "p/")      ←─── identical
   formula column         days_left:                ←─── identical
                            'date(this.due) - now()'
   ───  our extensions  ────────────────────────────────────────────────────────
   AI column              (not in Obsidian)               ai_summary:
                                                            kind: ai
                                                            input: "{{this.body}}"
                                                            prompt: "Summarize"
   board view embed       (not in Obsidian)               cosmoboard.canvas-base-node
   spatial sort           (not in Obsidian)               order: ["spatial.x"]
```

The tax of subset compat: when our extension fields appear in a row, we hide them from Obsidian's view by living under the `cosmoboard:` namespace. Obsidian shows the row unchanged.

---

## Views

### View-type matrix

| View | What it shows | Field requirements | Best for | Lives in |
| --- | --- | --- | --- | --- |
| **Table** | Rows × columns, sortable / filterable | any | spreadsheet feel; auditing | sidebar, fullscreen, canvas node |
| **Board** (kanban) | Columns grouped by an `enum` field, cards within | one `enum` (status / stage) | workflow tracking | sidebar, fullscreen |
| **Calendar** | Month grid with rows on their dates | one `date` / `datetime` | scheduling | sidebar, fullscreen |
| **Gallery** | Card grid with hero image | optional `file` (image) | visual collections (projects, references) | sidebar, fullscreen, **website preview** |
| **List** | Compact row list with a few fields | any | quick scan | sidebar |
| **Canvas base node** | Live data table embedded in a `.canvas` board | any | spatial dashboards (the existing node — `JavaScript/braindump.js:5881`) | inside `.canvas` |
| **Map** *(later)* | Geo-tagged rows on a map | one `geo` / lat-lng | site notes, travel | sidebar |
| **Graph** *(later)* | Nodes & edges from `relation` fields | one or more `relation` | concept maps | sidebar, canvas |

### ASCII mockups (one per major view)

#### Table view

```
┌───────────────────────────────────────────────────────────────────────┐
│ ▾ projects.base · Active (table)                       [+ row]  [⋮]  │
├──────────────────┬───────────┬────────────┬─────────┬─────────┬──────┤
│ title            │ status    │ due        │ effort  │ client  │ days │
├──────────────────┼───────────┼────────────┼─────────┼─────────┼──────┤
│ Kitchen plan     │ ● active  │ 2026-05-15 │ 8       │ Anil    │  16  │
│ Library renov.   │ ● active  │ 2026-06-01 │ 13      │ OMA     │  33  │
│ Eurocrate v2     │ ◐ paused  │ 2026-07-15 │ 5       │ —       │  77  │
│ + Add row…       │           │            │         │         │      │
└──────────────────┴───────────┴────────────┴─────────┴─────────┴──────┘
                ▲                                            ▲
                │                                            │
        click → open .md                          formula column "days"
```

#### Board (kanban) view

```
┌─ projects.base · Active (board)  group=status ───────────────────────┐
│                                                                       │
│  ┌─ active ────────┐  ┌─ paused ───────┐  ┌─ done ─────────┐         │
│  │                 │  │                 │  │                 │        │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │        │
│  │ │ Kitchen     │ │  │ │ Eurocrate v2│ │  │ │ Closet rebuild│        │
│  │ │ Anil · 5/15 │ │  │ │ —    · 7/15│ │  │ │ Anil · 3/02 │ │        │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │        │
│  │ ┌─────────────┐ │  │                 │  │                 │        │
│  │ │ Library ren.│ │  │                 │  │                 │        │
│  │ │ OMA  · 6/01 │ │  │                 │  │                 │        │
│  │ └─────────────┘ │  │                 │  │                 │        │
│  │ + add card      │  │                 │  │                 │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
   drag a card between columns → updates row.status (frontmatter write)
```

#### Calendar view

```
┌─ projects.base · upcoming (calendar)  field=due ─────────── May 2026 ┐
│  Mon       Tue       Wed       Thu       Fri       Sat       Sun     │
│ ─────────────────────────────────────────────────────────────────── │
│  27        28        29        30        01        02        03      │
│  04        05        06        07        08        09        10      │
│            ┌──────┐                                                   │
│            │ Pre- │                                                   │
│            │ ship │                                                   │
│            └──────┘                                                   │
│  11        12        13        14    ┌────────┐ 16        17          │
│                                       │ Kitchen │                     │
│                                       │ plan due│                     │
│                                       └────────┘                      │
│  18        19        20        21        22        23        24       │
│  25        26        27        28        29        30        31       │
└──────────────────────────────────────────────────────────────────────┘
   click event → open the .md  ·  drag event → write new frontmatter date
```

#### Gallery view (also the website preview shape — see §10)

```
┌─ projects.base · all (gallery) ─────────────────────────────────────┐
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │ ▒▒▒▒▒▒▒▒▒▒▒▒ │  │ ▒▒▒▒▒▒▒▒▒▒▒▒ │  │ ▒▒▒▒▒▒▒▒▒▒▒▒ │                │
│  │ ▒  hero  ▒▒  │  │ ▒  hero  ▒▒  │  │ ▒  hero  ▒▒  │                │
│  │ ▒▒▒▒▒▒▒▒▒▒▒▒ │  │ ▒▒▒▒▒▒▒▒▒▒▒▒ │  │ ▒▒▒▒▒▒▒▒▒▒▒▒ │                │
│  │ Kitchen plan │  │ Library ren. │  │ Eurocrate v2 │                │
│  │ Anil  · 2026 │  │ OMA  · 2026  │  │ — · 2025     │                │
│  └──────────────┘  └──────────────┘  └──────────────┘                │
└──────────────────────────────────────────────────────────────────────┘
   same shape: editable in Cosmoboard sidebar, read-only on the website
```

#### Canvas `base` node (today, with what we'd extend)

```
┌─ a board.canvas with a base node embedded ──────────────────────────┐
│                                                                      │
│                                  ┌─────────────────────────────┐    │
│                                  │ ▾ Projects (base node)      │    │
│   ┌─────────┐                    ├──────────┬──────┬───────────┤    │
│   │  text   │                    │ title    │ year │ status    │    │
│   │  node   │                    ├──────────┼──────┼───────────┤    │
│   └─────────┘                    │ Kitchen  │ 2026 │ ● active  │    │
│                                  │ Library  │ 2026 │ ● active  │    │
│   ┌─────────┐                    │ Eurocr.. │ 2025 │ ◐ paused  │    │
│   │  link   │                    └──────────┴──────┴───────────┘    │
│   │  node   │                       ▲                                │
│   └─────────┘                       │                                │
│                                     └── source: projects.base        │
│                                         filter:  status != "done"    │
│                                         order:   ["title"]           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Today's renderer (`renderBaseNode` in `JavaScript/braindump.js:5881`) supports `source`, `collection`, `filter`, `columns`, `title`. Extensions worth adding (open):

- multiple views inside one node (table / kanban / calendar — toggle in the node header);
- a "live edit" mode where the node is itself an editable table that writes back to frontmatter;
- node-local sort and filter overlay without modifying the underlying `.base`.

#### AI columns (dataflow)

```
   row inputs                  prompt template                cache
   ──────────                  ───────────────                ─────
   this.body          ────┐                                   ┌──────────────┐
   this.title         ────┼──▶  "Summarize the project        │ ai-cache.kv  │
   this.tags          ────┘     in one paragraph in           │ key=hash(    │
                                a friendly tone."             │  inputs +    │
                                            │                 │  prompt +    │
                                            ▼                 │  model)      │
                                   ┌────────────────┐         └──────┬───────┘
                                   │  AI provider   │  ◀── miss ─────┘
                                   │  (Claude/GPT/  │
                                   │   local model) │  ─── hit ──────┐
                                   └────────┬───────┘                │
                                            │                        │
                                            ▼                        ▼
                                   formula.summary ────────── view shows it
                                                              with a small ✦
                                                              "AI" badge
```

Tied to `ai_agents_in_the_loop.md`'s consent rule: *granting an AI column access to a base is a deliberate decryption-and-export*. Surface this at the moment of declaration, not in settings. Per-base toggle: "AI columns can read row contents."

---

## Cosmoboard ↔ website: unified render

The interview lock: same `.md` + `.base` files, edit mode in Cosmoboard, preview mode on the website. One source of truth, two render targets.

```
                            ┌──────────────────────────────┐
                            │   FILES (source of truth)    │
                            │                              │
                            │   projects/*.md              │
                            │   .bases/projects.base       │
                            └──────────────┬───────────────┘
                                           │
                       ┌───────────────────┼───────────────────┐
                       │                                       │
                edit-mode render                         preview-mode render
                       │                                       │
                       ▼                                       ▼
   ┌─────────────────────────────────┐        ┌─────────────────────────────────┐
   │  COSMOBOARD                     │        │  WEBSITE                        │
   │  ──────────                     │        │  ─────────                      │
   │  • full table / board / cal     │        │  • read-only gallery / list     │
   │  • cell editing                 │        │  • SEO meta + share image       │
   │  • AI column refresh            │        │  • static rendered cards        │
   │  • row create / delete          │        │  • detail page = .md preview    │
   │  • drag in canvas base node     │        │  • filters as URL query params  │
   │  ░ rich-tier widgets visible    │        │  ░ rich-tier widgets stripped   │
   │    (encrypted, AI-computed)     │        │    or replaced with placeholder │
   └─────────────────────────────────┘        └─────────────────────────────────┘
                       ▲                                       ▲
                       │                                       │
                  writes back                            never writes;
                  on edit                                build-time render
```

### Render-mode state switch

```
                         ┌───────────────┐
                  ┌────▶ │   EDIT MODE   │ ◀────┐
                  │      │  (Cosmoboard) │      │
   open in        │      └───────┬───────┘      │  toggle in Cosmoboard
   Cosmoboard ────┘              │              │  ("preview as web")
                                 │ "publish"    │
                                 │ (build step) │
                                 ▼              │
                         ┌───────────────┐      │
                         │ PREVIEW MODE  │ ─────┘
                         │  (website)    │
                         └───────────────┘
                                 ▲
                                 │ open in browser
                                 │ at evrenucar.com/...
                          end-user reader
```

### What changes between modes

| Aspect | Edit mode (Cosmoboard) | Preview mode (website) |
| --- | --- | --- |
| Permissions | local user, full read/write | public reader, read-only |
| Field affordances | inline-editable cells, popovers | flattened text + links |
| Formulas | recomputed live | recomputed at build time |
| AI columns | refresh on demand, show stale badge if old | snapshot at build; no live calls |
| Encrypted fields | unlock prompt; visible once granted | redacted; row may be omitted entirely |
| Rich-tier widgets (canvas base node, embedded apps) | live | stripped → placeholder card with link to Cosmoboard |
| Filters | as in `.base` view | URL query params extend / override (`?status=active&tag=research`) |
| Detail page | the `.md` opens in Cosmoboard's markdown panel | the `.md` renders as a standalone web page (existing site rendering) |
| Comments / interactions | (later) | read-only mirror per `page_database/` plan, if at all |

### Bridge to `page_database/`

The current `page_database/` plan (`.agents/page_database/page_database_plan.md`) describes a parallel system for website cards (Notion-synced + local) on the portfolio listing pages. It is **not** the structured layer brainstormed here, but it covers the same surface — listing pages on the website.

Long-term direction (open, not locked): Cosmoboard bases **subsume** `page_database/`. The unified model is:

```
   today                                         later (open)
   ─────                                         ────────────
   Notion / local items                          a Cosmoboard base
        │                                                │
        ▼                                                ▼
   src/notion-items.json                          .bases/site.base
   src/site-data.mjs                              + projects/*.md (rows)
        │                                                │
        ▼                                                ▼
   scripts/build-site.mjs renders                Cosmoboard renders
   listing pages                                 the *same* base
                                                 in preview mode →
                                                 listing pages
```

This is a **future** decision. v1 keeps `page_database/` running as-is; the structured layer ships independently. When the structured layer is mature enough, page_database migrates to it.

---

## Sync, conflicts, version control

The structured layer **inherits everything from `version_control_and_backups.md`**: Yjs/Yrs CRDT plumbing, three-tier history (ops + auto-checkpoints + milestones), branching per-artifact, hybrid sync (P2P / node / file copy).

Three database-specific adaptations:

### 1. A row is a Y.Doc; a base is a query over many Y.Docs

```
   workspace
     │
     ├── projects/                       ← folder
     │    ├── kitchen.md   ←──┐  one Y.Doc per row
     │    ├── library.md   ←──┤  CRDT-merge per file
     │    └── ...          ←──┘  history per file
     │
     └── .bases/
          └── projects.base  ←── one Y.Doc for the *view definition*
                                 (filters, columns, sort)
                                 history per .base
```

**Branching unit (consequence):** branching is per-file (already locked in `version_control_and_backups.md`). A "branch the projects database" is a workspace-level concept that does not exist in v1.

### 2. Conflict scenarios

| Scenario | What happens | Ops layer | Resolution |
| --- | --- | --- | --- |
| Two devices edit different fields of the same row | both keep | merges cleanly | nothing surfaces |
| Two devices edit the **same field** | both kept side-by-side in YAML, with a "review this" marker | merges with marker | inline picker on next open |
| One device deletes a row, other edits it | the edit wins (resurrect); marker on row | last-writer-wins-resurrect | banner: "this row was deleted on another device — keep / re-delete" |
| Schema drift: declared field changes type in `.base` while rows hold old values | view shows row with a "type mismatch" badge | merges; mismatch is a render-time issue | inline "fix" — repair, ignore, or relax declaration |
| Filter changes mid-edit (a row stops matching) | row drops out of the live view; underlying file unchanged | nothing to merge | nothing surfaces |
| Two devices add a row with the same filename | one gets a `-2` suffix (filesystem-level) | normal CRDT | banner: "duplicate filename, renamed" |

### 3. Index and AI-cache invalidation

```
   row file changed (.md)              .base changed
        │                                    │
        ▼                                    ▼
   ┌──────────────────┐                ┌──────────────────┐
   │  reindex this    │                │  full reindex    │
   │  row's docs:     │                │  for this base   │
   │   .idx (search)  │                │   .idx           │
   │   ai-cache.kv    │                │   nothing in     │
   │     (only if     │                │   ai-cache (rows │
   │     content      │                │   are unchanged) │
   │     changed)     │                └──────────────────┘
   └──────────────────┘
```

Two rules:
- **AI cache key includes the input hash + prompt + model.** Changing the prompt invalidates everything; changing one row only invalidates that row's cell.
- **The index is derived; never the truth.** It's safe to delete `.cosmoboard/index/`. Cost is a rebuild on next open.

---

## Import / export

### Round-trip survival matrix

What survives in / out of each tool, for one Cosmoboard base. ✓ = lossless, △ = approximate, ✗ = lost.

| Concept | Obsidian Bases | Notion (export → re-import) | Airtable | CSV | Cosmoboard bundle |
| --- | --- | --- | --- | --- | --- |
| Row identity (filename / id) | ✓ | △ (uses Notion ID) | △ (record id) | ✗ (rebuild from columns) | ✓ |
| Markdown body | ✓ | △ (block conversion) | ✗ | ✗ | ✓ |
| Frontmatter scalar fields | ✓ | △ (typed properties) | △ | △ (header row) | ✓ |
| Multi-select / tags | ✓ | △ | △ | △ (comma list) | ✓ |
| Relations | △ (resolved on open) | △ (Notion relation prop) | △ (linked record) | ✗ | ✓ |
| File attachments | ✓ (path) | ✓ | △ (re-uploaded) | ✗ | ✓ |
| Computed columns (formula) | ✓ | △ (Notion formula syntax) | △ (Airtable formula) | ✗ | ✓ |
| AI columns | ✗ (our extension) | ✗ | ✗ | ✗ | ✓ |
| View definitions (`.base`) | ✓ | △ (Notion views per DB) | △ | ✗ | ✓ |
| Canvas base node | ✗ | ✗ | ✗ | ✗ | ✓ |
| History / milestones | ✗ | ✗ | ✗ | ✗ | ✓ |

### `.base` subset compat — what we share with Obsidian

```
                Cosmoboard `.base`                            Obsidian Bases
   ╔════════════════════════════════════════╗     ╔══════════════════════════════════╗
   ║                                        ║     ║                                  ║
   ║   ┌──────────────────────────────┐    ║     ║   ┌──────────────────────────┐  ║
   ║   │     SHARED SUBSET            │    ║     ║   │   SHARED SUBSET          │  ║
   ║   │                              │═════════════│                          │  ║
   ║   │  filters · properties ·      │    ║     ║   │  same keys, same syntax  │  ║
   ║   │  formulas · views.{table,    │    ║     ║   │                          │  ║
   ║   │  board, calendar, gallery}   │    ║     ║   │                          │  ║
   ║   └──────────────────────────────┘    ║     ║   └──────────────────────────┘  ║
   ║                                        ║     ║                                  ║
   ║   ┌──────────────────────────────┐    ║     ║   ┌──────────────────────────┐  ║
   ║   │  cosmoboard:                 │    ║     ║   │   (ignored — unknown     │  ║
   ║   │    ai-summary, canvas-base-  │    ║     ║   │    top-level key, the    │  ║
   ║   │    node, spatial sort, ...   │    ║     ║   │    YAML still parses)    │  ║
   ║   └──────────────────────────────┘    ║     ║   └──────────────────────────┘  ║
   ╚════════════════════════════════════════╝     ╚══════════════════════════════════╝

       ▲                                                     ▲
       │                                                     │
       └────────── same .base file, both apps read it ───────┘
```

Three concrete commitments this implies:
- Our parser is permissive about unknown keys (forward-compat for new Obsidian Bases features).
- Our writer never emits a key into the shared namespace that Obsidian doesn't define. Anything novel goes under `cosmoboard:`.
- Our formula syntax tracks Obsidian Bases' built-in functions for the shared subset; novel functions live in a `cosmoboard.*` namespace (e.g. `cosmoboard.ai(...)`).

### Importers (in priority order)

1. **Markdown folder + frontmatter** — already the native shape. Effectively zero work.
2. **CSV** — one row per line, header → fields, choose folder destination, generate `.md` per row. Useful for "I have a spreadsheet of references."
3. **Obsidian vault** — open the folder; if `.base` files exist, they just work in our subset.
4. **Notion export (markdown + CSV)** — Notion's "Export as Markdown & CSV" produces both. Convert; map relations as best-effort.
5. **Airtable** — CSV per-table export plus attachments folder; same path as Notion.

### Exporters

- **Plain markdown bundle** — strip our `cosmoboard:` extensions; emit shareable folder. Usable in Obsidian / VS Code / static-site generators.
- **Cosmoboard bundle (`.cosmobundle`)** — full fidelity: rows + bases + history + AI cache + assets.
- **Static HTML preview** — the website render mode, packaged as a folder of HTML for hosting anywhere.

---

## Competitive comparison

The standard "where do we sit." Heavy table because the differentiation is in the rows we win on, not on a one-line claim.

| Feature | **Notion** | **Airtable** | **Obsidian Bases** | **Tana** | **Coda** | **Cosmoboard (target)** |
| --- | --- | --- | --- | --- | --- | --- |
| Rows are files on disk | ✗ | ✗ | ✓ (.md) | ✗ | ✗ | ✓ (.md) |
| Open format | ✗ | ✗ | ✓ (md + .base YAML) | ✗ | ✗ | ✓ (md + .base YAML) |
| Local-first | ✗ | ✗ | ✓ | △ (sync to cloud) | ✗ | ✓ |
| Works offline | △ (Notion now offline-ish) | ✗ | ✓ | △ | ✗ | ✓ |
| Frontmatter as schema | ✗ | ✗ | ✓ | ✗ (super-tags) | ✗ | ✓ |
| Inline `key:: value` | ✗ | ✗ | ✓ (Dataview-style) | △ | ✗ | ✓ (planned) |
| Declared schema possible | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Relations between DBs | ✓ | ✓ | △ (wikilinks) | ✓ (super-tags) | ✓ | ✓ |
| Reverse relations as queries | ✓ (auto-mirrored) | ✓ | ✓ (Dataview) | ✓ | ✓ | ✓ (computed, not stored) |
| Formula language | ✓ (Notion) | ✓ (Airtable) | ✓ (Bases) | ✓ | ✓ | ✓ (Bases-subset + ours) |
| AI computed columns | ✓ | △ (via integrations) | △ (plugin) | ✓ | △ | ✓ (with consent gate) |
| Table view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Board / kanban | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gallery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Embedded in spatial canvas** | ✗ | ✗ | △ (Canvas plugin shows files, not bases) | ✗ | ✗ | **✓ (canvas `base` node)** |
| **Same data renders editable + as a website** | △ (publish) | ✗ | △ (Publish) | ✗ | △ (publish) | **✓ (unified render)** |
| CRDT realtime | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ (Phase 6, planned) |
| Per-row history / branching | ✗ | △ | ✗ | △ | △ | ✓ (from version_control_and_backups) |
| End-to-end encryption | ✗ | ✗ | ✗ (vault-level) | ✗ | ✗ | ✓ (planned, per security_and_access) |
| Open source | ✗ | ✗ | △ (free, not open) | ✗ | ✗ | △ (AGPL+commercial, per licensing.md) |
| Plugin / extension API | ✓ | ✓ | ✓ | △ | ✓ | △ (later) |

**Where we win on paper:** files-on-disk + spatial canvas embed + same-data-two-modes + CRDT history + e2e encryption. No competitor clears all five.

**Where we will not win for a long time:** plugin / extension ecosystem (Notion / Obsidian / Airtable have years of community work), polish parity with Notion, formula-language richness with Airtable, super-tag ergonomics with Tana.

**Honest read:** the differentiators are real but only matter to a user who *already wants* file-on-disk + canvas. Marketing should not lead with "vs Notion" — it should lead with the wedge from `vison_planning.md` ("a workspace that is a folder") and let bases be the proof.

---

## Future bridges (cross-doc)

This doc cross-cuts most of the brainstorm folder. A map for future readers:

```
                          database_brainstorming.md
                                    │
        ┌───────────────┬───────────┼────────────┬──────────────────┐
        ▼               ▼           ▼            ▼                  ▼
   version_control  ai_agents   security_and  searchbar_tools  vison_planning
   _and_backups     _in_the_    access        .md              .md
   .md              loop.md     .md
                                                                     │
                                                                     │ pillar
                                                                     │ "Structured"
                                                                     ▼
                                                          holistic_planning/
                                                          holistic_planning.md
                                                            (Phase 3 milestone)

   what each contributes ↓

   version_control      → row Y.Docs, per-file branching, base-as-Y.Doc,
                          AI cache invalidation as a "blob queue" consumer,
                          merge conflict scenarios specialized for rows
                          (§Sync, conflicts, version control)

   ai_agents            → AI-computed columns, consent at column declaration,
                          schema-aware agents that query bases as tools
                          (§Views → AI columns, §Future bridges)

   security_and_access  → encrypted bases, per-row scope grants, redaction
                          rules in the website preview render mode
                          (§Cosmoboard ↔ website, §Sync conflicts)

   searchbar_tools      → bases as a result type in Cmd-K, tag/property
                          facets in the palette, "open this base" as a verb
                          (§Views, §Future bridges)

   vison_planning       → two-tier model: portable bases (md+frontmatter+
                          .base) vs rich bases (encrypted, AI-computed,
                          spatial); structured pillar; Phase 3 placement
                          (§What this doc is for)

   page_database/       → not a brainstorm doc; the website-cards system
                          this layer eventually subsumes
                          (§Cosmoboard ↔ website → Bridge)
```

---

## Open Questions

These are the calls that should land in this file before promoting to *Decisions*.

### Storage and schema

1. **Storage Option A vs hybrid.** v1 ships file-per-row markdown as the default; do we ship Option B (single-file CSV/JSON) at the same time as opt-in, or wait for a real demand signal?
2. **Inferred vs declared schema default.** Should a brand-new `.base` start with no declarations and infer everything (least friction) or insist on at least one declared field (forces a bit of structure)?
3. **Inline `key:: value` (Dataview-style).** Adopt as a recognized field source, or skip in favor of frontmatter-only (cleaner, less ambiguous, but loses a Dataview workflow that some Obsidian users rely on)?
4. **Relation syntax.** `[[wikilink]]` only, `./path/file.md` only, or both with normalization on save? Default normalization direction?
5. **Where exactly does `.base` live?** A dedicated `.bases/` folder, alongside the data folder it queries, or anywhere (and the runtime indexes them)?

### Query language

6. **Formula syntax: track Obsidian Bases verbatim, or stay in spirit and diverge for our extensions?** Tracking is cheaper for round-trip; divergence may be needed for AI / spatial extensions.
7. **Reverse relations: query-only, or syntactic sugar for "rows linking to this row"?** Dataview has the precedent; Notion auto-mirrors. We are saying we do not auto-mirror — does that imply sugar (`incoming(this)`) or just the long form?
8. **Computed-column recomputation timing.** On every render? On row change only? On explicit refresh? Different answers for plain formulas vs AI columns.

### Views and node behavior

9. **Canvas `base` node — extend in place, or replace with a multi-view node?** If multi-view, the same node header carries a tab-strip (Table / Board / Calendar / Gallery).
10. **Editable cells inside the canvas `base` node?** If yes, we open writes from a canvas to the underlying `.md` frontmatter — bigger surface for sync conflicts.
11. **Default view of a brand-new base.** Table is conventional; gallery is friendlier for visual content. Pick one default, or infer from row content (does a `hero` field exist? → gallery).

### Cosmoboard ↔ website bridge

12. **Build pipeline for preview mode.** Does the website render bases at static-build time (`scripts/build-site.mjs`), or at request time via a small server-side function? Static is friendlier to the static-host wedge; request-time gives live filtering.
13. **URL filter parameters.** What's the contract — `?status=active&tag=research` flat, or a richer DSL (`?q=status:active+tag:research`)? Implications for SEO and shareability.
14. **What gets hidden from preview by default?** AI columns (privacy), encrypted fields (must), `cosmoboard:` extensions (must — no renderer on web)? Or visible-by-default-with-redaction?

### Sync, conflicts, AI

15. **AI cache portability across devices.** Push to the node (cheap on devices, costs node storage) or rebuild on each device (slower, free)?
16. **Schema drift when rows arrive from another device.** Auto-promote inferred fields to declared on type-stable rows? Or surface a "you have N inferred fields — promote?" nudge?

### Naming

17. **"Database" vs "base."** Obsidian uses "Bases." Notion / Airtable use "database." Our docs flip between. Picking one in the UI matters; both is acceptable in design docs.

---

## Hard Questions

The deeper unresolved tensions. These are where a wrong answer locks us into something we'll regret.

### A. Where is the source of truth, really?

Files on disk is the wedge. But once we have an index (search), an AI cache, a CRDT op log, and a website-render output, *most* reads go through derived layers. Are we honest that the files are still the truth, or is the CRDT op log the truth and the files are a *projection*?

The cleanest answer is: **files are truth at rest, the CRDT op log is truth in motion, and the index is always derived.** A clean shutdown writes ops back to files; a clean open reads files into memory. This is the Yjs `y-leveldb` pattern.

But this opens a subtler problem — see hard question B.

### B. What happens when an external editor (Obsidian, VS Code) modifies a file while Cosmoboard has it open?

Three possibilities:
- **File-system watch + reload.** Cosmoboard sees the modification, integrates it as a series of CRDT ops. Risks merge conflicts on a per-file basis when both sides edit at once.
- **Lock-on-open.** Cosmoboard takes a soft lock; refuses external edits during a session. Hostile to the wedge.
- **Last-writer-wins-with-warning.** Cosmoboard checks mtime on save and surfaces a banner if the file changed under it.

Recommendation (open): start with file-system watch, accept that edits during a Cosmoboard session may produce per-file CRDT merge markers, lean on `version_control_and_backups.md`'s "review this" pattern.

### C. How does encryption interact with the website preview?

If a base contains encrypted rows or fields, what does the website render?

- Hide the row entirely? Then the public list of "all my projects" silently omits the encrypted ones.
- Show the row with redacted fields? Then the *existence* leaks.
- Render two bases — a public one and an encrypted one — and the user opts in row by row?

This is genuinely hard and ties to `security_and_access.md`. We probably want **explicit per-row publish flags** in frontmatter (`published: true`) and a default of *not* publishing — never the other way around.

### D. AI columns and the offline / portable promise

A row whose `summary` field is an AI computation:
- offline, on a cold device with no cache → empty cell
- in Obsidian → empty cell (no provider configured)
- exported to plain markdown → either empty or last cached value

Two design responses:
- **AI is a transient view, not data.** Cells are recomputed; cached values are convenience, not state.
- **AI cache is exportable as data.** A `.ai-cache.md` sidecar holds the most recent computed values; preview mode reads it; offline reads it.

The first is cleaner; the second is friendlier to the wedge ("the website looks the same when you're offline"). Probably both: keep cache as data, mark it explicitly as "AI snapshot from {date}", invalidate on input change.

### E. Will `page_database/` actually be subsumed?

The architecturally-clean answer is yes. The risk is that subsumption is a multi-month migration of a working system to chase elegance. The pragmatic answer is: keep `page_database/` running, design Cosmoboard bases compatibly, and migrate **only** when we'd otherwise duplicate work building two parallel renderers for listing pages.

---

## Update Log

- 2026-04-29 — File created. Brainstorm captures the structured / database / bases layer for Cosmoboard, with subset round-trip to Obsidian Bases as the compat target and a unified "edit in Cosmoboard / preview on the website" render model. 17 ASCII visuals (entity diagram, schema-resolution table, relation diagram, file-tree, query EBNF, side-by-side compat sketch, six view mockups, AI dataflow, two-render pipeline, render-mode state machine, sync flow tables, subset-compat venn, cross-doc map). Decisions section deliberately empty per interview ("fresh brainstorm"). Five-section open-questions list and five hard questions left for the next round.
