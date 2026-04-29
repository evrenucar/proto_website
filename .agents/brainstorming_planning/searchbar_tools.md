# Searchbar And Tools

> **Categorize and update as this discussion is evolving.**
>
> Living doc for the toolbar / command palette / search ideation. Sibling to `vison_planning.md`. Decisions get promoted to `vison_planning.md → Decisions`. Stable interaction-design choices eventually flow to `.agents/holistic_planning/` (do not edit those from here).

Started: 2026-04-28
Source conversation: user request to ideate on a "common toolbar/searchbar" taking inspiration from other software, applications, and operating systems. Scoped to all three surfaces (toolbar, command palette, search) as one coherent ecosystem, full product arc, ending with an opinionated recommendation.

---

## Index

- [Decisions (locked)](#decisions-locked)
- [Why This Doc Exists](#why-this-doc-exists)
- [Current State (Braindump today)](#current-state-braindump-today)
- [The Three Surfaces (vocabulary)](#the-three-surfaces-vocabulary)
- [Inspirations](#inspirations)
  - [OS-level](#os-level)
  - [Editors / IDEs](#editors--ides)
  - [Browsers](#browsers)
  - [Productivity / spatial apps](#productivity--spatial-apps)
  - [Mobile](#mobile)
- [What's Actually Different About Cosmoboard](#whats-actually-different-about-cosmoboard)
- [Design Dimensions](#design-dimensions)
- [Mobile / Touch Ergonomics](#mobile--touch-ergonomics)
- [Recommendation (opinionated)](#recommendation-opinionated)
- [Search: Scopes, Flows, And Logic](#search-scopes-flows-and-logic)
- [Phasing Suggestion](#phasing-suggestion)
- [Open Questions](#open-questions)
- [Notes And Future Topics](#notes-and-future-topics)
- [Update Log](#update-log)

---

## Decisions (locked)

- *None yet.* This file is at the open-ideation stage. Promote items from *Recommendation* and *Open Questions* into this section as they harden.

---

## Why This Doc Exists

Cosmoboard's Braindump board has a feature-complete persistent toolbar and **no search and no command palette**. The planning layer has acknowledged the gap (`vison_planning.md` lists Cmd-K as a Phase-1 priority; `ai_agents_in_the_loop.md` notes that agent invocation will eventually need surfaces in *all three* of toolbar, palette, and node primitive). If those three surfaces are designed independently — a Cmd-K overlay bolted on, a find-in-board bolted on, a toolbar that grows new buttons forever — they will feel like three different apps.

The point of this doc is to **think about all three together** before any of them is built, look honestly at what other software does well, and land on a recommendation that the three surfaces share an ergonomic spine.

---

## Current State (Braindump today)

| Surface | Today | Where it lives |
| --- | --- | --- |
| Persistent toolbar | Top-of-board shell with mode tools (Select V, Pan Space, Text T, Pen P, Bookmark L), action buttons (Save, Recommend, Export, Open, Import, Settings, New Markdown X, Feature Request, Bug Report), and a More (⋯) overflow. | `JavaScript/braindump.js:285–307` (build) and `:2598–2642` (`handleToolbarAction`). Markup in `content/boards/eurocrate-storage.html:139–217`. |
| Keyboard shortcuts | Ctrl/Cmd+S, Ctrl/Cmd+Shift+S, Ctrl/Cmd+O, Ctrl/Cmd+I, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+X, Ctrl/Cmd+C, Delete/Backspace, V/T/P/L/X mode keys, Space-hold for pan. | `JavaScript/braindump.js:2508–2556`. |
| Command palette | **Does not exist.** | — |
| Search / find | **Does not exist.** No find-in-board, no file search, no cross-board search. | — |
| Toast / notification | `#braindump-toolbar-toast`, 3.2s auto-dismiss. | `JavaScript/braindump.js`. |

So the starting line is: a healthy persistent toolbar, a small but real keyboard-shortcut layer, and two completely empty surfaces (palette and search) that both need designing.

---

## The Three Surfaces (vocabulary)

Different products fuse different combinations of these. Naming them up front so the rest of the doc has terms.

| Surface | Always visible? | Purpose | Failure mode if it's the *only* surface |
| --- | --- | --- | --- |
| **Persistent toolbar** | Yes | Mode switching (the cursor *is* a tool), most-frequent actions, status surface (zoom level, save state, board name). | Becomes a "buttonscape" — every feature grows a button until nothing can be found. |
| **Command palette** | No, transient (Cmd-K) | Typed verbs over the entire app surface. Power-user keyboard-first input. Discoverability for features that don't deserve a button. | Power-user hostile to touch / new users; "nothing exists unless you know its name." |
| **Search / find** | No, transient (Cmd-F or persistent input) | Locate content — nodes, files, markdown bodies, board names, even text inside attachments. | If folded into the palette without thought, results turn into noise (commands and matches mixed). |

Some products fuse two of these (Arc fuses the address bar and palette; Notion fuses palette and search). Some keep all three deliberately separate (VS Code: toolbar, Cmd+P / Cmd+Shift+P, Cmd+F / Ctrl+Shift+F).

How Cosmoboard's three surfaces relate to each other (the recommendation later in this doc):

```
   ┌─────────────────────────────┐
   │  Persistent Toolbar         │   always visible · touch-friendly · status surface
   │  modes (V / T / P / L) +    │   capped at ~5 canonical action buttons
   │  small canonical action set │
   └─────────────────────────────┘
                │
                │ every toolbar button has a mirrored verb in the palette
                ▼
   ┌─────────────────────────────┐         ┌─────────────────────────────┐
   │  Command Palette            │ ←─────→ │  Search / Find              │
   │  verb mode (prefix '>')     │  same   │  default mode (no prefix)   │
   │  e.g. "> Export bundle"     │ overlay │  e.g. "draft kitchen"       │
   └─────────────────────────────┘         └─────────────────────────────┘
                │                                     │
                │ Cmd-K opens this overlay; the prefix decides which mode.
                ▼                                     ▼
            execute verb                       jump to / preview result
```

Cmd-F (lighter, in-artifact next/prev find) is a separate cousin overlay; covered in the *Search: Scopes, Flows, And Logic* section below.

---

## Inspirations

One row per source. *Worth stealing* is opinionated. *Doesn't apply* is the part Cosmoboard should resist copying.

### OS-level

| System | What they do | Worth stealing | Doesn't apply |
| --- | --- | --- | --- |
| **macOS Spotlight** | Cmd-Space, modal centered overlay. Fuzzy-matches files, apps, contacts, calculator, web. Top result is a default-action with Enter. | Single keystroke to summon. Calculator/conversion as a power feature. Top-result-Enter contract. Quick Look on space-bar. | Spotlight is *system-wide*; Cosmoboard is one app. Don't try to compete with the OS. |
| **Windows Search / Run** | Win key opens search, Win+R opens a stricter run dialog. Two surfaces, one keystroke each. | The split between *find* (loose, ranked) and *run* (literal, predictable) is honest. Power users get Win+R, casual users get Win. | Two summon keys feels heavy in a single-app context. |
| **GNOME Activities** | Super key opens a full-screen overlay that *includes* search but is primarily window/workspace switching. | Search-as-a-mode-of-the-overlay rather than search-as-its-own-overlay. Frees up keyboard real estate. | Overlays the entire screen — too heavy for a single board. |
| **Alfred** | macOS power-user palette. Workflows (custom multi-step verbs), keyword-prefixed scopes. | Custom workflows / keyword scopes. The idea that the palette is itself extensible by users. | Workflow editor is a product unto itself; out of scope until the app has plugins. |
| **Raycast** | The modern Alfred. Beautifully designed, extension marketplace, inline rich results (snippets, calendar, GitHub PRs). | Inline rich results inside palette rows (not just text). Extensibility model. AI-augmented commands. | Don't try to be Raycast. They have a team and a marketplace; we have neither. |

### Editors / IDEs

| System | What they do | Worth stealing | Doesn't apply |
| --- | --- | --- | --- |
| **VS Code** | Three explicit surfaces: Cmd+P (file fuzzy search), Cmd+Shift+P (commands), Cmd+F (in-file find). All input modes of the same overlay; the prefix character reroutes (`>` for commands, `:` for line, `@` for symbol). | Prefix-as-mode-switch in a single input. *Same overlay component, different prefix*. Excellent for keyboard users and trivially extensible. | The three modes are still discoverable only to people who read docs. Casual users don't know `>` exists. |
| **JetBrains Search Everywhere** | Shift-Shift opens a tabbed overlay: Files / Classes / Symbols / Actions. Tab cycles modes. | Tabs as explicit scope chips (instead of invisible prefixes). Better for casual users. | Heavy UI; tabs are a lot to render and reason about. |
| **Vim ex-line / `:`** | Single-character prefix opens a command line at the bottom of the screen. Persistent for the duration of the command, dismissed on Enter. | Bottom-of-screen anchor (instead of centered modal). Lets you keep eye contact with the canvas. Mode is unambiguous (you're either in normal mode or in `:`). | Modal editing is a Vim concept. Most users don't have a "normal mode." |
| **Emacs M-x** | Prefix command followed by named function. Tab-completes. The function namespace *is* the command palette. | Naming as a primary product surface — every action has a callable name. Useful for AI agents that need to invoke functions by name. | M-x is brutal for newcomers. We need pretty labels too. |

### Browsers

| System | What they do | Worth stealing | Doesn't apply |
| --- | --- | --- | --- |
| **Chrome omnibox** | URL + search + history + tab-finder + math, all in one input. Provider chips (search Wikipedia from the omnibox). | One field, multiple intents inferred. Provider chips. | Chrome's intent-classifier has decades of telemetry behind it. We won't get that for free. |
| **Arc command bar** | Cmd-T opens a centered overlay that *replaces* the URL bar. Switches tabs, opens URLs, runs commands. Single surface for all entry points. | Single-surface philosophy — "everything you do starts here." Boldest version of the unified-bar idea. | Arc is a browser, where "entering a URL" is the dominant verb. Cosmoboard's dominant verb is editing, not navigating. |
| **Firefox awesome bar** | URL bar that also searches history and bookmarks. | Folding history-search into the URL field. Gentle on casual users. | Not a palette — verbs aren't first-class. |

### Productivity / spatial apps

| System | What they do | Worth stealing | Doesn't apply |
| --- | --- | --- | --- |
| **Notion Cmd+K** | Single overlay fuses page-search + command palette. Recent pages float to the top. AI commands are inline rows. | The page-search-and-palette fusion is well-tested. AI as a first-class palette row. Recents-on-top defaulting. | Notion's content model is a tree of pages. Cosmoboard's is a graph of files plus spatial canvas — search results need a different shape. |
| **Linear** | Cmd+K everywhere. Context-aware (issue actions when on an issue, project actions on a project). Beautiful keyboard navigation. | Context-aware verbs. The palette knows what you have selected. | Linear's data model is small and uniform (issues). Cosmoboard's is heterogeneous (markdown / canvas / file / DB row). |
| **Slack** | Cmd+K is a channel/DM switcher. Cmd+/ is shortcuts help. Cmd+G is search. Three keys, three jobs. | Honest separation of switcher vs commands vs search when the data shapes are different enough. | Three separate surfaces is one surface too many for our product. |
| **Figma Cmd+/** | Quick command palette that runs an action. Cmd+P jumps to a frame. Tools live in the persistent toolbar. | Tools-stay-in-toolbar is the right call for a spatial app. Frame jumping = camera animation. | Figma's commands are mostly *style/layer ops*; ours include encryption, AI, version control — heavier consequences. |
| **Obsidian** | Persistent left-rail toolbar + Cmd+P (commands) + Cmd+O (quick switcher) + Cmd+Shift+F (search). Plugin-extensible palette. | Quick switcher (Cmd+O) is one of the great quality-of-life features in note apps. Plugin extension of palette commands. | Four surfaces. One too many. |
| **Heptabase** | Whiteboard + cards + tags. Search as a sidebar / filter, not a centered modal. Tag autocomplete is the primary find affordance. | Tag-autocomplete-as-find. Sidebar search where the result list is browsable instead of modal. | Sidebar search competes with screen real estate. On a phone it's a non-starter. |
| **tldraw** | Floating toolbar, no command palette. Keyboard shortcuts only. | Spatial-first, no apologies for being keyboard-light on the verb side. Zoom-to-shape-on-find when find exists. | No command palette is a luxury they can afford because tldraw is a primitive, not a workspace. |
| **Excalidraw** | Persistent toolbar + Cmd+/ shortcuts overlay (a help cheat sheet, not a palette). | Cheat-sheet-as-overlay is the simplest possible "palette" — it's just discoverability. Worth shipping early as a stop-gap. | Not a palette; can't grow into one. |

### Mobile

| System | What they do | Worth stealing | Doesn't apply |
| --- | --- | --- | --- |
| **iOS Spotlight** | Pull down on home screen to invoke. Suggested apps and contacts before you type. | Suggestions-before-typing. Recents and predictions. | Pull-down gesture is iOS-conventional; in a canvas app it'll fight pan. |
| **iPadOS Cmd+Space** | Same as macOS Spotlight but with touch fallbacks. Bottom-sheet variants in some apps. | Bottom-sheet keyboard-friendly variant for tablets. | Tablet-specific work is a later phase per `vison_planning.md` Platform Expansion. |
| **Generic mobile FAB / radial menus** | Sketch / drawing apps use long-press radial menus to swap tools without text. | Radial mode-switcher as a touch-native toolbar alternate. | Doesn't replace search; only replaces toolbar. |

---

## What's Actually Different About Cosmoboard

Three constraints that make a copy-paste of any single inspiration above wrong.

1. **Two-tier artifact model.** Per `vison_planning.md → Two-tier Artifact Model`, search must respect *portable* vs *rich*. A rich (encrypted) board's contents should not be indexed in a global search by default — that defeats the encryption story. AI / agent commands carry a consent gate (`ai_agents_in_the_loop.md`); the palette is the natural place to surface "this command will decrypt and send to a hosted model" inline at the moment of invocation, not buried in settings.
2. **Spatial canvas, not a list.** "Find" doesn't mean "scroll until you see it." It means *pan/zoom the camera to the node*. tldraw and Figma do this; Notion and Obsidian don't have to. This affects the search result UI (preview thumbnails, animation, focus ring) and the data shape (every search hit has spatial coordinates).
3. **Files-on-disk data model.** The wedge is "your real folder is the data model." Search must span: markdown bodies, canvas node text, file names, board (.canvas) names, image alt-text, and — once OCR is in (`vison_planning.md → Capabilities`) — text extracted from PDFs and pasted-photo nodes. That's a much wider surface than a typical app's search; it's closer to a desktop-search index.

A fourth, quieter constraint: **the canvas itself is a competing input surface.** Every keystroke that *isn't* in a text field on the canvas is potentially a tool shortcut. The palette can't claim too many keystrokes without killing the spatial flow.

---

## Design Dimensions

Each of these is a real choice with a real trade-off. Listing them flat so the recommendation can answer them explicitly.

| Dimension | Option A | Option B | Trade-off |
| --- | --- | --- | --- |
| **Number of surfaces** | One unified bar (Arc, Notion) | Toolbar + palette + search (VS Code, Slack) | Unified is simpler to learn but harder to keep fast and unambiguous. Three surfaces is honest about different jobs but more for users to memorize. |
| **Palette anchor** | Centered modal (Spotlight, Linear) | Bottom-of-screen line (Vim) | Centered is the modern default. Bottom keeps eyes on the canvas — better for spatial work. |
| **Input grammar** | Verbs-first (`>create text node`) | Nouns-first (`my notes` → ranked across types) | Verbs are predictable; nouns are forgiving. Mode-prefix (VS Code `>`) gets both at the cost of discoverability. |
| **Default scope** | Current board only | Workspace / all boards | Current board is fast and usually what you want. Workspace risks index size and privacy (rich-tier boards). |
| **Keyboard vs touch** | Keyboard-first, touch as fallback | Touch-first variant (radial / sheet) | Cosmoboard runs on phones. A typed-verb-only palette is hostile there. |
| **Tool-mode surface** | Toolbar buttons only | Toolbar + palette verbs (`pen`, `text`) | Doubling helps muscle memory but pollutes search results. Mitigated by scope chips. |
| **Discoverability** | "Read the docs" | Palette is *the* canonical feature list, with descriptions inline | Inline-described commands ARE the docs. Pays compounding interest as features grow. |
| **Agent / AI surfacing** | Toolbar action | Palette verb with inline consent | Palette is gentler for occasional use; toolbar implies "I do this often." Both eventually. |
| **Search backend** | In-memory linear scan | Indexed (Lunr/MiniSearch/SQLite-FTS in IndexedDB) | Linear scan ships in a day and is fine until ~2k nodes. Index work pays off only as boards/workspaces grow. Don't over-engineer day one. |
| **Persistence of recents/history** | None | Per-user history in localStorage | Recents-on-top is one of the cheapest UX wins. Worth doing early. |

---

## Mobile / Touch Ergonomics

The persistent toolbar already has a mobile collapse (the "More" button hides desktop-only buttons). A typed-verb palette is hostile on phones because it demands the keyboard, which steals half the canvas. Three honest options:

- **Bottom-sheet palette.** The same overlay component, but anchored to the bottom and tall enough to show 4-5 results above the keyboard. Standard mobile pattern; nothing to invent.
- **Long-press radial mode-switcher.** Holding two fingers on the canvas (or long-press on the toolbar handle) opens a radial wheel of mode tools. Replaces the toolbar's mode buttons on touch, not the palette. tldraw and Procreate do versions of this.
- **Voice / dictation as an input mode.** A microphone affordance in the palette. Useful on phones; useful for AI verbs. Defer until the AI direction is real.

The toolbar stays. Search stays. The palette gets a touch variant. We don't pretend a single design works for both surfaces.

---

## Recommendation (opinionated)

A concrete design across the three surfaces. Each piece states *what* and *why*.

### 1. Persistent toolbar stays — and stops growing

- **What:** Keep the current top toolbar with mode tools (V/T/P/L/Space) and a small set of canonical actions (Save, Open, Import, Export, Settings). Move the rest (Recommend, Feature Request, Bug Report, New Markdown, anything future) into the palette.
- **Why:** The toolbar is the touch-friendly surface and the discoverable shelf. Once it has more than ~8 buttons it stops being either. Cap it; let the palette absorb the long tail.

### 2. Single Cmd-K bar fuses palette + search

- **What:** Cmd-K (Ctrl-K on Windows/Linux) opens a centered overlay with one input field. Default mode is *find in current board* — typing matches markdown text, node titles, file names. A scope chip ("Board / Workspace / Global") to the left of the input changes the index searched. A leading `>` switches to verb mode (commands). A leading `@` jumps to mentions / agent identities (when those exist). A leading `:` opens the file/node switcher (the Cmd-O equivalent).
- **Why:** Two overlays is one too many. The find/palette distinction is a developer concept, not a user one. Users want "Cmd-K and start typing." Prefix mode-switching is proven (VS Code) and the scope chip rescues it from invisible-prefix syndrome (JetBrains' lesson).
- **Why centered, not bottom-anchored:** centered is the convention; users have muscle memory for it. The cost (eyes off the canvas) is acceptable because the overlay is transient. Reconsider if usability testing says otherwise.

**Mockup of the Cmd-K overlay:**

```
┌────────────────────────────────────────────────────────────────────────┐
│ [board ▾]   Search this board…                                   ⌘K   │  ← input + scope chip
├────────────────────────────────────────────────────────────────────────┤
│ 📄  Draft kitchen plan.md                              in workspace    │
│     …and the **draft** plan we discussed last week…                    │
│                                                                        │
│ 🗺  Renovation Ideas › "draft layout"                  in board        │
│     canvas node · Enter to jump                                        │
│                                                                        │
│ ❯   Export current board                                    verb       │
│     Bundles board + linked assets to a .zip                            │
│                                                                        │
│ 🔒  Tax 2025                                       in workspace        │
│     encrypted · Enter to unlock and search                             │
├────────────────────────────────────────────────────────────────────────┤
│ ↵ open · Tab widen scope · → preview · Esc close                       │  ← keymap footer
└────────────────────────────────────────────────────────────────────────┘
```

Scope chip (top-left) cycles `board → workspace → everywhere`. Each row carries a type icon, a snippet, the scope it came from, and an action hint. Encrypted artifacts surface as titles only unless the user has opted that board into in-clear search.

### 3. Every toolbar button has a verb-equivalent in the palette

- **What:** "Save board," "Export bundle," "Toggle pen," "New markdown node" — every toolbar action is also a named palette verb. The mode tools too (`Activate pen`, `Switch to select`).
- **Why:** Bridges discoverability for new users (palette is the index) and muscle-memory for power users (palette is faster than reaching for the toolbar). Doubling cost is small because verbs are just registrations.

### 4. Spatial result behavior

- **What:** Selecting a node search result animates the camera to it (zoom-to-fit on the node, ~250ms easing) and pulses a focus ring. Does *not* open the node modally. Hitting Escape returns to where you were. (Like Figma's "go to frame.")
- **Why:** This is the defining spatial-app affordance. A search that just selects-and-leaves-you-where-you-are is hostile when the hit is offscreen.

### 5. Agent / encrypted commands surface consent inline

- **What:** Palette verbs that decrypt content, send to a hosted AI, or grant scope to an agent show a one-line consent affordance inside the result row ("⚠ will decrypt and send to Claude — Enter to confirm, Esc to cancel"). No separate dialog.
- **Why:** Per `ai_agents_in_the_loop.md`, the consent moment is the moment of grant, not a settings checkbox. Inline affordance keeps the keyboard flow intact while making the cost legible. Borrows from how 1Password autofill confirms in-line.

### 6. Recents and discovery

- **What:** Empty palette (Cmd-K then no input) shows recent verbs and recently-edited nodes in a 50/50 split. Each verb row has a one-line description.
- **Why:** Spotlight, Raycast, and Notion all do this. It's the cheapest discoverability win and the cheapest reach-back-to-recent-thing win, in the same render.

### 7. Mobile variant

- **What:** Palette opens as a bottom sheet on touch, with a sticky search input above the keyboard. Toolbar gains a long-press radial mode-switcher in a later pass.
- **Why:** A typed palette is non-negotiable for an Obsidian-class workspace, even on mobile. A bottom sheet is the lightest version that actually works.

### 8. Search backend: dumb at first

- **What:** Phase 1 = linear scan over the in-memory board model. Phase 2 = MiniSearch index in IndexedDB, scoped per board. Phase 3 = workspace-wide index with rich-tier exclusion respecting encryption boundaries.
- **Why:** Linear scan is fine until ~2k nodes. Premature indexing costs more than it saves. The phasing matches the rest of the roadmap (`vison_planning.md → Performance Approach`).

---

## Search: Scopes, Flows, And Logic

The Cmd-K bar can search at four nested scopes: a single selection, the current artifact (this board or this markdown file), the current workspace (the open folder + everything under it), and globally across every workspace Cosmoboard has been shown. This section is the deep dive on what each scope *is*, how the user *signals* which one they want, what the *backend* looks like, and how a result *resolves*.

### Scope rings

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  D · Global             every workspace ever opened             │
  │   ┌─────────────────────────────────────────────────────────┐   │
  │   │  C · Workspace      the open folder + all subfolders    │   │
  │   │   ┌─────────────────────────────────────────────────┐   │   │
  │   │   │  B · Artifact   this board / this .md file      │   │   │
  │   │   │   ┌─────────────────────────────────────────┐   │   │   │
  │   │   │   │  A · Selection                          │   │   │   │
  │   │   │   │  one node · one paragraph being edited  │   │   │   │
  │   │   │   └─────────────────────────────────────────┘   │   │   │
  │   │   └─────────────────────────────────────────────────┘   │   │
  │   └─────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────┘
                         ▲                       ▲
                         │                       │
                  default Cmd-F            default Cmd-K
                  (artifact + selection-   (workspace, with the
                   aware highlight)         scope chip to widen
                                            or narrow)
```

### Scope comparison

| Scope | Default trigger | Dataset size | Backend | Privacy default | Result types | Speed budget |
| --- | --- | --- | --- | --- | --- | --- |
| **A · Selection** | Cmd-F inside an editor + "in selection" toggle | one node / one paragraph | substring scan | always plaintext (you are editing it) | text matches with offsets | <8 ms |
| **B · Artifact** (board or `.md`) | Cmd-F | 1 – ~1k nodes / paragraphs | linear scan over the in-memory model | always plaintext | nodes, headings, paragraphs | <16 ms (one frame) |
| **C · Workspace** | Cmd-K (default chip) | 10 – 10k items | MiniSearch / SQLite-FTS persisted in IndexedDB | encrypted boards: title-only by default | files, boards, nodes, sections, tags | <100 ms |
| **D · Global** | Cmd-K with chip widened to "Everywhere" | 1k – ∞ across workspaces | union of per-workspace indices | excluded by default; opt-in per workspace | same as C plus a cross-workspace breadcrumb | <250 ms |

### Keystroke routing

Where a keystroke ends up depends on focus and modifier. Decision tree for an in-board keystroke:

```
keystroke received
       │
       ▼
   focus inside a text editor (markdown body, node text)?
       │
       ├── YES ──→  Cmd-F   → editor's local find             (Scope A inside B)
       │            Cmd-K   → global palette overlay          (Scope per chip; default C)
       │            typing  → editor input
       │            Esc     → leave editor focus
       │
       └── NO  ──→  Cmd-F   → in-board find overlay           (Scope B)
                    Cmd-K   → global palette overlay          (Scope per chip; default C)
                    V/T/P/L → tool mode switch                (existing behavior)
                    Esc     → close any open overlay
```

Two rules fall out of this:

- **Cmd-F always means "smaller scope".** Inside an editor it's local-to-editor; outside it's local-to-artifact. It never leaves the artifact.
- **Cmd-K always means "the palette".** Default scope is the current chip (initialized to *workspace*). The user can also prefix `in:board` / `in:everywhere` to override per-query without touching the chip.

### Query grammar (modifiers)

Default search (no prefix) matches text in the chip's scope. Prefixes route the same input to other modes or scopes.

| Prefix / modifier | Meaning | Example |
| --- | --- | --- |
| *(none)* | match in the chip's scope | `draft kitchen` |
| `>` | run a command verb (palette mode) | `> export bundle` |
| `@` | mention / agent / collaborator identity | `@planning-agent` |
| `:` | quick-switcher to a file or board by name | `: cosmoboard` |
| `type:md` / `type:canvas` / `type:image` / `type:pdf` | restrict by artifact type | `draft type:md` |
| `in:board` / `in:workspace` / `in:everywhere` / `in:selection` | force scope regardless of chip | `tax in:everywhere` |
| `tag:x` | restrict to nodes / files with tag | `tag:research` |
| `path:foo/` | restrict by path prefix | `path:archive/2025/` |
| `is:encrypted` | only encrypted artifacts the user has authorized for in-clear search | `is:encrypted draft` |

Modifiers compose. `draft type:md in:workspace tag:research` is the natural conjunction.

### What gets indexed per artifact type

The index is built lazily and incrementally. Artifact-specific fields below; the rest (mtime, word count, etc.) lives in a sidecar metadata table.

| Artifact type | Indexed fields | Sidecar fields | Notes |
| --- | --- | --- | --- |
| `.md` file | filename, headings (with level), body text | per-section text segments | Long files are also indexed per H1/H2 section so a result can deep-link to a heading anchor. |
| `.canvas` board | filename, board title, each node's text/title, link URLs, edge labels | OCR text from embedded images / PDFs (when OCR runs) | Each node is its own document keyed by `boardId#nodeId`. |
| Image | filename, alt-text | OCR transcript when available | OCR sidecar regenerates if the image is replaced; not regenerated on rename. |
| PDF | filename, pdf.js text-layer text | OCR sidecar for image-only PDFs | Text layer is primary; OCR is fallback. They can coexist. |
| Plain text / CSV | filename, body | header row for CSV | CSV may later promote to structured field search ("`status:done`"). |
| Encrypted (rich-tier) | filename only by default | none | "Make this board's contents searchable in plaintext" is a deliberate per-board grant; without it, a hit shows the title only and Enter requires unlock. |

### Result row anatomy

Every result row has the same shape regardless of type. Type icon and action hint differ; the rest stays constant.

| Element | Purpose | Example |
| --- | --- | --- |
| **Type icon** | Tells the user what kind of thing this is at a glance | 📄 markdown · 🗺 canvas · 🖼 image · 📕 PDF · ❯ verb · 🔒 encrypted |
| **Title** | Primary identifier | filename, board title, node title, or verb name |
| **Breadcrumb** | Where it lives in the folder/board tree | `kitchen-renovation › boards › ideas.canvas` |
| **Snippet** | Match-in-context with the matched substring bolded | `…and the **draft** plan we discussed…` |
| **Scope chip** | Reminds the user which scope this result is from (only on the first row of each scope group) | "in workspace" |
| **Action hint** | What Enter will do | "Open" / "Jump to" / "Run" / "Decrypt and open" |

### Search pipeline (data flow)

What happens after the user types — results render incrementally as the user types, but Enter triggers the action:

```
input string
   │
   ▼
[1] tokenize + parse modifiers          e.g. "draft type:md in:workspace"
   │                                     → text="draft"; filters={type:md, scope:workspace}
   ▼
[2] resolve effective scope             chip + prefix override + focus context
   │                                     → scope = workspace
   ▼
[3] route to backend(s)
        ├── Scope A / B → in-memory linear scan   (this artifact)
        ├── Scope C     → MiniSearch / FTS index  (this workspace)
        └── Scope D     → union of per-workspace indices
   ▼
[4] merge + rank
        fuzzy_match × recency × scope_proximity × type_weight × tag_boost
   ▼
[5] redact rich-tier hits the user has not authorized
        encrypted boards: show title only · cannot expose body even if matched
   ▼
[6] render rows  (icon · title · breadcrumb · snippet · scope chip · action)
   ▼
[7] on Enter → dispatch action by result type   (see below)
```

Steps [1]–[6] run on every keystroke (debounced ~80 ms). Step [7] only runs on Enter or click.

### Opening a result (action by type)

Different types need different "open" behaviors. A switch on `result.type`:

```
result.type
   │
   ├── canvas-node ──────▶  if board not open: open the board first
   │                        camera-animate to node bbox (zoom-to-fit, ~250 ms)
   │                        pulse focus ring
   │                        select node so node-level shortcuts work
   │
   ├── canvas-board ─────▶  open .canvas at its saved camera state
   │
   ├── markdown-file ────▶  open .md in the markdown panel
   │                        scroll to first match · highlight inline · next/prev armed
   │
   ├── markdown-section ─▶  open .md → jump to heading anchor
   │
   ├── image / pdf-text ─▶  open viewer / lightbox
   │                        overlay match position (PDF) · show OCR snippet (image)
   │
   ├── tag / property ───▶  apply as filter to current view (if board)
   │                        or open a tag-detail panel
   │
   ├── verb (>command) ──▶  execute
   │                        if it touches encrypted content or external service:
   │                          show inline consent affordance · require second Enter
   │
   └── agent (@identity) ▶  open agent profile in side panel
                            or invoke "Share with…" verb pre-filled
```

Critical invariant: **selecting a result never destroys the user's current camera/scroll state.** A board-jump pushes the previous camera onto a back-stack so Esc returns. A markdown jump preserves prior scroll position.

### Index lifecycle

Index population is lazy, incremental, and event-driven. No "indexing… please wait" dialogs.

| Event | Action on index | Cost |
| --- | --- | --- |
| Workspace opened | load index from IndexedDB · verify schema version · if missing, schedule background build | low (load) · medium (cold build) |
| File added or dropped | enqueue for indexing (debounced 1 s) | low per file |
| Markdown saved | reindex that file (and its sections) | low |
| Canvas node edited | reindex one document (`boardId#nodeId`) | very low |
| File renamed | update path key; do not touch content | very low |
| File deleted | drop entries with that path | very low |
| Encrypted board: contents-search granted | reindex board contents now (with ephemeral key in memory) | medium |
| Encrypted board: grant revoked | drop body fields · keep title-only entries | low |
| OCR completed (image / PDF) | append OCR text as sidecar field | low per file |
| Workspace closed | flush in-flight · persist | low |

Two notable rules:

- **The index never holds plaintext on disk for rich-tier artifacts.** When the user grants in-the-clear search for an encrypted board, the body fields live only in an in-memory index that disappears on session close. This keeps the rest-encryption posture honest. Cost: a re-build on every session for those boards. Acceptable because they're opt-in.
- **Schema version is part of the persisted index header.** Bumping the index schema invalidates and rebuilds — no hidden upgrade migrations.

### Scope escalation (when there are no results)

When a search in the current scope returns nothing, surface a one-tap widening before the user retypes. Pattern adapted from JetBrains "Search Everywhere" and Linear's empty-state suggestions.

```
user types "draft"   chip = board   →   0 hits
        │
        ▼
  empty result list, plus a single suggestion row:

   ┌────────────────────────────────────────────────────────┐
   │ ↳  No results in this board.   Search workspace?  ⇥    │
   └────────────────────────────────────────────────────────┘
        │
        │  Tab pressed (or row clicked)
        ▼
  chip widens to workspace · query re-runs
        │
        ▼
  N hits across boards / files, grouped by parent

   ┌────────────────────────────────────────────────────────┐
   │  in workspace                                          │
   ├────────────────────────────────────────────────────────┤
   │  📄 Draft kitchen plan.md         …kitchen-renovation/ │
   │  🗺 Renovation Ideas              "draft layout" node  │
   │  📕 Quotes 2026-Q1.pdf            page 3 · "draft #4"  │
   └────────────────────────────────────────────────────────┘

If there are still 0 hits at workspace, the suggestion offers Global next.
```

Three implications of this pattern:

- **Default scope can stay narrow.** No user is punished for the chip starting at *board* — widening is one keystroke.
- **No silent global scans.** The user's content never leaves the chip's scope without a deliberate widening. Privacy posture matches the rest of the product.
- **The empty state is informative.** "No results" alone is the worst message in software. "No results here, but try here" is honest help.

### Where this lands per surface

Putting it back together: the three surfaces from earlier in this doc map to these scopes as follows.

| Surface | Owns which scope(s) | How |
| --- | --- | --- |
| Persistent toolbar | none directly · surfaces a "Find" button that maps to Cmd-F | the toolbar's search button summons the same overlay, pre-set to scope B |
| Command palette / Cmd-K bar | C and D primarily · B if chip is set to *board* · verbs and agent identities regardless of scope | the same overlay; the chip + prefix tell it what scope to query |
| Cmd-F find | A and B | a smaller, lighter overlay that only ever queries the current artifact, with next / prev affordances |

Cmd-K and Cmd-F are not the same overlay component — they're cousins. Cmd-K is centered, multi-type, scope-chipped. Cmd-F is anchored to the artifact it's searching (top-right of the board, or inside the markdown panel), text-only, with next/prev. Putting "find in artifact" inside Cmd-K is possible but loses the next/prev rhythm that makes Cmd-F feel right.

That's a deliberate refinement of the *single fused bar* recommendation: the fused bar is the right call for *cross-cutting search and verbs*, but Cmd-F earns its own cheap dedicated overlay because the next/prev / Enter-to-find-next interaction model is distinct.

---

## Phasing Suggestion

Mapped to existing roadmap language so this slots into `holistic_planning/` cleanly when it gets promoted.

| Phase | Ship | Roughly when |
| --- | --- | --- |
| **A** | Cmd-K overlay with find-in-board (linear scan), recents, basic verb mode (every toolbar button registered as a verb). Keyboard-only. | Within the next 3 months — fits the wedge: a serious workspace ships with Cmd-K. |
| **B** | Spatial result behavior (camera animation), scope chip (board / workspace), recents history persisted, Cheat-sheet (Cmd-/) as a discoverability stop-gap. | Phase-1 follow-up. |
| **C** | Mobile bottom-sheet variant. Long-press radial on toolbar. | When the PWA story lands (per `vison_planning.md`). |
| **D** | MiniSearch-indexed workspace search. OCR'd image text in index. Inline consent rows for AI verbs. Agent identities as `@` mentions. | Aligned with rich-tier work (encryption Phase B–C, AI agents, OCR pipeline). |
| **E** | Plugin/extension API for palette verbs. Voice input. AI-augmented query rewriting. | Long-tail; only if the product earns the user base to justify it. |

---

## Open Questions

1. Should the palette be available *outside* a board — a workspace shell with its own Cmd-K that opens boards, creates new ones, jumps to recents? Or only inside a board?
2. Does the palette *replace* the toolbar's More-menu (⋯) or coexist? If it replaces it, the toolbar is permanently capped at the canonical set.
3. Where do agent verbs live before the agent system itself ships? Hard-coded stubs, or hidden behind a feature flag until `ai_agents_in_the_loop.md` Phase 1 lands?
4. Does mobile get its own design or a stripped overlay? (Recommendation says bottom sheet, but a radial-only no-text mode is also defensible for tap-only users.)
5. Should the cheat-sheet (Cmd-/) be a separate surface or a mode of the palette (typing nothing shows recents *and* the cheat sheet)?
6. How does find-in-board interact with active text editing? If the user is typing in a markdown node, does Cmd-K still summon the global palette, or does it route to the editor's local find first?
7. What is the right scope-chip default — current board, or "ask the user once and remember"?
8. Is search across rich-tier (encrypted) boards a *user-toggled* setting, or is the rich tier always opaque to global search by design? (Answer feeds back into `security_and_access.md`.)
9. Does the palette have its own command for invoking other palettes / nested palettes (e.g. `> Settings...` opens a settings palette context)? Linear and Raycast both do this; it's powerful but expensive to design.

---

## Notes And Future Topics

- **Voice input.** Opens AI direction on the input side. Pair with dictation-to-markdown for a coherent feature.
- **AI-assisted query rewriting.** "Show me everything I wrote about Cosmoboard last week" → structured query. Dangerous to over-promise; valuable when it works.
- **Palette plugin API.** Smallest surface that lets a third party register a verb. Similar question to the plugin/extension system in `vison_planning.md → Notes`.
- **History / recents store.** Where it lives, how long it persists, whether it leaks between portable and rich tiers.
- **Fuzzy ranking model.** Sublime-style subsequence match? Trigram? Lunr default? Decision is small but visible.
- **"Activity" panel.** A passive feed of recent edits across the workspace. Adjacent to search but not the same. Possibly worth its own doc later.
- **Keyboard layout collisions.** Cmd-K is sometimes claimed by browsers / extensions. A configurable summon key is worth designing in early.

---

## Update Log

- 2026-04-28 — File created. Full ideation across persistent toolbar, command palette, and search as one ecosystem. Inspirations table covers OS-level (Spotlight, Run, GNOME, Alfred, Raycast), editors (VS Code, JetBrains, Vim, Emacs), browsers (Chrome, Arc, Firefox), productivity/spatial (Notion, Linear, Slack, Figma, Obsidian, Heptabase, tldraw, Excalidraw), and mobile (iOS, iPadOS, radial menus). Opinionated recommendation lands on: keep the persistent toolbar (capped), one fused Cmd-K bar with prefix mode-switching and a scope chip, every toolbar button registered as a verb, spatial result behavior with camera animation, inline AI/encryption consent, dumb linear-scan search now and indexed search later. Phasing A→E mapped against existing roadmap. No decisions promoted to *Decisions (locked)* yet.
- 2026-04-29 — Added the *Search: Scopes, Flows, And Logic* deep-dive. Four nested scopes (Selection / Artifact / Workspace / Global) defined with their default triggers, dataset sizes, backends, privacy postures, and speed budgets. New diagrams: scope-rings, keystroke-routing decision tree, search-pipeline data flow, open-result branching by type, scope-escalation flow on empty results. New tables: scope comparison, indexed fields per artifact type, query-modifier grammar, result-row anatomy, index lifecycle. Two visual mockups added earlier in the doc: a surfaces-relationship diagram (toolbar ↔ palette ↔ search) in *The Three Surfaces* and a Cmd-K overlay mockup in the *Recommendation*. Refinement to the original "single fused bar" recommendation: Cmd-F gets its own lightweight in-artifact overlay alongside Cmd-K, because next/prev semantics are distinct. No decisions promoted to *Decisions (locked)* yet.
- 2026-04-29 — Added top-of-doc index for navigability. No content changes.
