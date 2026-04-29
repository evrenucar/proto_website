# Landing Page Data Handling

> **Categorize and update as this discussion is evolving.**
>
> Living doc for the "where your stuff stays" data-handling section on `cosmoboard-landing.html`. Sibling to `vison_planning.md`, `security_and_access.md`, and the rest. Decisions get promoted to `vison_planning.md → Decisions`. Once the section ships and the design is stable, this doc becomes a record rather than active spec.

Started: 2026-04-29

---

## Index

- [Decisions (locked)](#decisions-locked)
- [Why This Doc Exists](#why-this-doc-exists)
- [Today's Data Flow (honest)](#todays-data-flow-honest)
- [The Trust-Boundary Diagram (chosen)](#the-trust-boundary-diagram-chosen)
- [Alternatives Considered](#alternatives-considered)
  - [Alt 1 — Concentric Rings](#alt-1--concentric-rings)
  - [Alt 2 — Stays-vs-Goes Split](#alt-2--stays-vs-goes-split)
- [Prose Copy Candidates](#prose-copy-candidates)
- [Where It Sits In The Page](#where-it-sits-in-the-page)
- [Implementation Notes](#implementation-notes)
- [Open Questions](#open-questions)
- [Update Log](#update-log)

---

## Decisions (locked)

- **Visual style: trust-boundary box** *(2026-04-29).* "Your device" rectangle contains all storage paths; one labeled outbound arrow fires only when the user clicks Recommend. Chosen over concentric rings and stays-vs-goes split because it's the most concrete about *actual* data flow.
- **Section heading: "Where your stuff stays"** *(2026-04-29).* Matches the page's casual voice; mirrors the existing "Where it lives" header rhythm.
- **Position: between Principles and Bringing your stuff in** *(2026-04-29).* Builds on the "Local-first" + "Safe by default" principles directly above before the migration section.
- **Forward-looking `(PLANNED)` tag for encryption** *(2026-04-29).* A muted follow-up line mentions encryption / portable bundles / self-hosted sync, matching the `(PLANNED)` pattern already used in the migration section. Keeps the page honest about what's shipped vs planned.
- **Minimal first ship** *(2026-04-29).* Prose ≤ 4 short paragraphs. SVG ≤ ~30 lines. No hover treatments, no animations. Polish comes later if needed.

---

## Why This Doc Exists

`vison_planning.md → First Five Users` flagged that getting outside users to "feel safe putting real notes there" requires, at minimum, a clear data-handling explanation on the landing page. This doc captures the full design — diagram, prose, alternatives, implementation notes — so:

- The rationale lives next to the rest of the brainstorming.
- A future implementation pass (or contributor) can ship updates without re-deriving the design.
- The brainstorming layer stays the source of truth; the landing page is the reflection.

---

## Today's Data Flow (honest)

What actually happens to a user's data right now, end-to-end:

| Path | What happens | When |
| --- | --- | --- |
| **In-browser** | Every edit autosaves to IndexedDB via the board runtime (`JavaScript/braindump.js`). | Continuously, while editing. |
| **On disk** | When the local preview server runs, autosave POSTs to `/api/save-board` and `/api/save-asset`, which write `.canvas`, `.md`, and dropped assets to `content/boards/...` on disk. | Continuous, only when `scripts/preview-server.mjs` is running. |
| **GitHub** | The Recommend button assembles the canvas + a short summary the user typed and opens a pre-filled GitHub issue with the canvas attached. | Only when the user clicks Recommend and confirms. |
| **Anywhere else** | Nothing today. No telemetry, no analytics, no cloud sync, no third-party storage. | Never (today). |

What's coming (per other brainstorming docs):

- Capability URLs for read-only encrypted shares (`security_and_access.md → Phase A`).
- Encrypted CRDT op envelopes for sync between user's own devices (`version_control_and_backups.md → Hybrid Sync Transport`).
- Self-hosted node turnkey three-mode (local sidecar / Docker / Cosmoboard-hosted) (`version_control_and_backups.md → Decisions`).

---

## The Trust-Boundary Diagram (chosen)

Canonical ASCII version. The SVG on the landing page is a translation of this.

```
   ┌────────────────────────────────────────────────────────┐
   │                    YOUR DEVICE                         │
   │                                                        │
   │  ┌──────────────┐    ┌──────────────────────────────┐  │
   │  │  You edit a  │ ─▶ │  Browser storage             │  │
   │  │  board /     │    │  IndexedDB · autosave        │  │
   │  │  note        │    │  works offline               │  │
   │  └──────────────┘    └──────────────────────────────┘  │
   │         │                                              │
   │         │  if local dev-server runs                    │
   │         ▼                                              │
   │  ┌──────────────────────────────────────────────────┐  │
   │  │  Your disk: .canvas + .md files                  │  │
   │  │  in your project folder                          │  │
   │  └──────────────────────────────────────────────────┘  │
   │                                                        │
   └─────────────────────────┬──────────────────────────────┘
                             │
                  only when YOU click "Recommend" 🚀
                             ▼
              ┌────────────────────────────────┐
              │  GitHub issue                  │
              │  visibility per your repo      │
              └────────────────────────────────┘
```

**Reading rules.**

- The outer "YOUR DEVICE" box is the trust boundary. Anything inside stays under your control.
- Internal arrows show automatic data flow that never leaves your machine.
- The single outbound arrow is the only path data takes outside, and it requires an explicit user action.
- Nothing else exists in this picture by design — no analytics, no telemetry, no silent sync.

---

## Alternatives Considered

### Alt 1 — Concentric Rings

Mirrors the page's existing "Scope and roadmap" rings. Innermost = your data, next = your devices, outer = the world.

```
         ┌──── outer: the internet ────┐
         │  ┌── your devices ──┐       │
         │  │  ┌── browser ──┐ │       │
         │  │  │   YOU       │ │       │
         │  │  │   • boards  │ │       │
         │  │  │   • notes   │ │       │
         │  │  └─────────────┘ │       │
         │  └──────────────────┘       │
         └─────────────────────────────┘
```

**Why not chosen.** Visually consistent with the rest of the page, but less concrete about actual data flow. There's no way to show "Recommend" as the only outbound path — it would just be an arrow pointing to the outer ring, which doesn't say "you have to click something."

### Alt 2 — Stays-vs-Goes Split

Two parallel columns.

```
STAYS ON YOUR DEVICE         LEAVES ONLY WHEN YOU CHOOSE
─────────────────────         ─────────────────────────────
• Boards (.canvas)           • Recommendations (GitHub issue)
• Markdown notes             • Exports you download / share
• Dropped images, PDFs       • (planned) encrypted shared boards
• Drafts, autosaves
```

**Why not chosen.** Simpler and more scannable, but loses the spatial intuition of "trust boundary." A list says *what*; a box-with-an-arrow shows *how*. For a first-time visitor deciding whether to trust the tool, the visual is stronger.

---

## Prose Copy Candidates

Three drafts. Locked for ship: **Draft A**. Drafts B and C are kept here in case the user wants to swap.

### Draft A (locked)

> By default, your boards, notes, and dropped files autosave to your browser, so editing works fully offline. If you are also running the local dev-server, the same edits sync to plain .canvas and .md files in your project folder.
>
> Nothing leaves your machine unless you click **Recommend**, which opens a GitHub issue with the canvas attached.
>
> There is no telemetry. No analytics. No silent cloud sync either.

### Draft B (terser)

> Your boards, notes, and files autosave to your browser, and to disk if the local dev-server is running. Nothing leaves your machine unless you click Recommend.

### Draft C (more reassuring, longer)

> Cosmoboard is built local-first, which is a way of saying: your data lives on your device by default, and stays there unless you say otherwise.
>
> Boards autosave to your browser. If you run the local dev-server, the same boards write to disk as plain .canvas and .md files. Nothing else happens automatically.
>
> The only way data leaves is the **Recommend** button, which opens a GitHub issue with the canvas you reviewed. You see what is being sent before it goes.

### Forward-looking line (after the diagram)

> Encryption, portable encrypted shares, and self-hosted sync are part of the plan but not shipped yet. *(PLANNED)*

---

## Where It Sits In The Page

```
   cosmoboard-landing.html sections, in order:
   
   1.  Eyebrow + h1 + lede
   2.  CTA (Try the live prototype)
   3.  What it is
   4.  What it is not
   5.  Scope and roadmap (rings)
   6.  Principles (grid-2)
   7. ▶ Where your stuff stays  ◀  ← NEW SECTION INSERTS HERE
   8.  Bringing your stuff in (PLANNED)
   9.  Where it lives
   10. Live preview
   11. Pills + footer + ticker
```

**Why between Principles and Migration:**

- **Principles** says "Local-first" and "Safe by default" abstractly. The new section turns those abstractions into a concrete picture.
- **Bringing your stuff in** talks about migrating user data *into* Cosmoboard. The new section answers a prerequisite question — "what happens to it once it's in there?" — that visitors will reasonably want answered before reading about migration.
- **Where it lives** is about Cosmoboard itself living inside `evrenucar.com`, which is hosting context, not user-data context. Different concern.

---

## Implementation Notes

For the SVG ship in `cosmoboard-landing.html`:

- Insert between line ~448 (close of Principles `.grid-2`) and line ~450 (open of "Bringing your stuff in").
- Reuse the `.migration-graph` class so the existing `@media (max-width: 560px)` text-size override at line 290 applies for free.
- Marker id: `dh-arrow` so it doesn't collide with the existing `mg-arrow`.
- Color tokens (already defined in the inline `<style>`):
  - Outer device box: stroke `--accent` (`#3fdaca`), fill `rgba(63,218,202,0.04)`.
  - Inner boxes: stroke `--border` (`#2d2c2c`), fill `--bg-card` (`#1a1919`), text `--text` (`#fafafa`).
  - Arrows: stroke `--accent` at 0.55 opacity, with the `dh-arrow` marker on the end.
  - Internal labels (e.g. "if local dev-server runs"): text `--text-faint` (`#707070`), small italic.
- Mobile responsiveness: `viewBox` scales naturally; the existing `.migration-graph svg text { font-size: 18px; }` override at narrow widths handles label legibility.

For the **minimal first ship**: keep the SVG to ~one outer rect, three inner rects, three internal arrows, one outbound arrow with label, one GitHub-issue rect. Skip hover treatments, animations, decoration. Clarity is in the structure, not the polish.

---

## Open Questions

- Heading wording: "Where your stuff stays" works. Alternatives if it lands too casual: "Your data, briefly" / "What happens to your stuff" / "Trust boundary." Lock A unless the user pushes back.
- Should the diagram include `(PLANNED)` artifacts inside the trust boundary (greyed out with a "future" tag), or is the muted follow-up paragraph enough? **Current call:** muted paragraph only — keeps the diagram about today's reality.
- Should the muted follow-up paragraph link out to the brainstorming docs (e.g. `security_and_access.md`)? Probably not — they're internal, not meant for external visitors. A future `/docs/` route could link them publicly.

---

## Update Log

- 2026-04-29 — File created. Decisions locked: trust-boundary box style, "Where your stuff stays" heading, position between Principles and Migration, forward-looking `(PLANNED)` tag for encryption, minimal-first-ship discipline. Three prose drafts captured (Draft A locked for ship). Two alternative visual approaches documented with rationale for not choosing them. Implementation notes for the SVG ship on `cosmoboard-landing.html` (marker id, color tokens, responsive class reuse, line-number anchors).
