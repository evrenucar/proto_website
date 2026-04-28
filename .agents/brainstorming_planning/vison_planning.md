# Vison Planning

> **Categorize and update as this discussion is evolving.**
>
> This is a living doc. Sections below are deliberate categories so new thoughts have a home. When something here gets settled, move it from *Open Questions* to *Decisions*. When the surrounding planning system catches up (e.g. updates land in `.agents/holistic_planning/`), strike or summarize the section here. Date entries when the substance changes.

Started: 2026-04-28
Source conversation: vision discussion between user and agent on what this app *is*, why it exists vs Obsidian / Miro / FigJam / Excalidraw / Heptabase, performance approach, platform expansion, capabilities, limitations, and naming. Round 2 added security/access and AI-agents.

Holding pen for evolving discussion. Stable decisions belong in `.agents/holistic_planning/` (do not edit those from here). This file is the *thinking layer* — the planning layer is downstream of it.

Sibling docs in this folder:
- [`security_and_access.md`](./security_and_access.md) — encryption, identity, segmented access.
- [`ai_agents_in_the_loop.md`](./ai_agents_in_the_loop.md) — AI agents as collaborators, scope grants, audit trail.
- [`version_control_and_backups.md`](./version_control_and_backups.md) — five-layer model (undo, rolling history, git, backups, key recovery), visual canvas diff, time scrubber.
- [`searchbar_tools.md`](./searchbar_tools.md) — toolbar, command palette, and search as one ecosystem; inspirations from OSes / editors / browsers / spatial apps; Cmd-K recommendation.

---

## Decisions (locked)

### Round 1 (2026-04-28)

- **Top 3-month priority:** bulletproof Obsidian round-trip. Markdown and `.canvas` files must open identically in Cosmoboard and Obsidian, both directions. Locks the wedge.
- **Doc placement:** new folder `.agents/brainstorming_planning/` is the home for evolving discussion. Topics that outgrow a section get their own `.md` here. Stable decisions flow into `.agents/holistic_planning/` when ready.
- **Naming for now:** `Cosmoboard` stays as the working name in code and existing planning docs. Brand pass deferred 6–12 months.
- **Scope discipline:** existing `.agents/holistic_planning/` files stay as the stable layer. This brainstorming folder does not edit them.

### Round 2 (2026-04-28)

- **Commitment level: startup intent.** Eventually company / collaborators / funding. Implies real outside users in months not years. Encryption / AI / collab are real Phase-2 work, not perpetual "later." Polish bar is product, not demo.
- **Wedge is aspirational, not architectural.** Markdown + canvas stay portable as the *entry point*. Encrypted artifacts, AI outputs, and app sessions are first-class but explicitly *not* Obsidian-portable. The two-tier model below makes this explicit.
- **Validation signal: 5 outside users using it weekly without nagging.** Drives the next 6 months. Personal use alone is not evidence.
- **Encryption recovery: optional opt-in escrow.** Pure key-only purity is rejected. There will be a recovery vector (third-party or self-hosted) that users opt into. Defeats some no-server purity but matches real-user expectations. See `security_and_access.md`.

---

## Core Thesis

A lightweight, web-first, local-first workspace where **your real files on disk are the data model**. A spatial canvas, a markdown editor, structured database views, and embedded apps are all *views over the same files*. Everything portable starts portable to Obsidian and to plain folders.

The bet is that no single existing tool combines (a) real files you own, (b) a high-performance spatial canvas, (c) markdown plus JSON Canvas as open formats, and (d) the runway to grow into hosted apps and eventually a small OS — without locking you into a cloud account.

The wedge is not the canvas. The wedge is **"open the same folder in Obsidian and nothing breaks."** That is the line that lets people trust the system enough to put real work in it.

### Wedge sentence (candidate)

> **A workspace that is a folder. Markdown, canvases, files — your data, on disk, openable anywhere.**

- "A workspace that is a folder" is novel — Notion isn't, Miro isn't, even Obsidian doesn't lead with it.
- "Markdown, canvases, files" sets the format expectation honestly.
- "Your data, on disk, openable anywhere" is the trust line that matters most.

Everything else (performance, embeds, app streaming, OS dreams) is a *consequence* of getting that right.

---

## Two-tier Artifact Model

The aspirational-wedge decision (Round 2) makes this explicit. Cosmoboard has two clearly labeled tiers of content:

| Tier | What's in it | Portability promise | Examples |
| --- | --- | --- | --- |
| **Portable artifacts** | Markdown, JSON Canvas, plain images, plain attachments | Round-trips losslessly with Obsidian and a plain filesystem. Always exportable. | `.md` notes, `.canvas` boards, dropped images, PDFs as files |
| **Rich artifacts** | Encrypted files, AI-derived outputs, app sessions, multi-user shared state, structured DB views with custom UI | **Does not round-trip to Obsidian.** Exportable to a Cosmoboard bundle, viewable elsewhere only with explicit fallback or stripped-down rendering. | Encrypted board with wrapped keys; AI-summarized canvas; live VS Code Web session; CRDT-shared workspace |

**Design implications.**
- Every artifact is visually labeled with its tier. Users see at a glance whether something will survive outside Cosmoboard.
- Workspace can mix tiers. A folder can hold both portable notes and an encrypted sub-board.
- Export flows are tier-aware. Exporting a portable artifact gives plain markdown / canvas. Exporting a rich artifact gives a Cosmoboard bundle with a clear note about what cannot be opened elsewhere.
- The marketing line ("open in Obsidian") refers to the **portable tier**, which is what onboarding starts with. Rich features unlock as users want them.

**Why this matters.** The wedge gets people in the door. The rich tier is what they stay for. Without explicit tiering the product feels dishonest as soon as encryption or AI shows up. With it, the boundary is a feature, not a regression.

---

## Why This And Not X

The internal honest answer. Each row says what *they* do well, where *we* differ, and where we should not pretend to be better.

| Tool | What they do well | Where Cosmoboard differs | Where we should not claim a win |
| --- | --- | --- | --- |
| **Obsidian** | Markdown ownership, plugin ecosystem, Bases, mature graph and search | Web-first, real spatial canvas as a primary surface (not a plugin), runs on any device without install, cleaner UX defaults, room for app embeds | Plugin maturity. Years behind. Compete on UX and canvas, not on plugin count. |
| **Obsidian Canvas** | JSON Canvas format, file-backed, simple and stable | Higher node count, embeds, app sessions, multi-board nesting, performance work (LOD, foveated) | Same format compatibility — that is the *handshake*, not a differentiator. |
| **Miro** | Polished collaborative whiteboarding, sticky-note culture | Local-first, files on disk, durable writing in markdown, no cloud lock | Live multiplayer ergonomics. Miro has spent a decade on it. We will not match parity for years. |
| **FigJam** | Tight integration with Figma, ease of use | Same as Miro — own your data, can hold real notes and databases too | Figma graveyard pull. Designers who already live in Figma will not switch for a side workspace. |
| **Excalidraw** | Hand-drawn aesthetic, simple, embeddable, open | We are a workspace; they are a canvas. Coexistence, not competition. | Drawing aesthetic. We may eventually add a sketch mode but should not try to *be* Excalidraw. |
| **Notion** | Page object model, databases, soft on-ramp | Local files, real markdown, no cloud lock, spatial canvas | Rich text polish, integrations marketplace. They have an army. |
| **Heptabase** | Closest competitor — local-first whiteboard with notes, well executed | Open formats (md + JSON Canvas) instead of proprietary, web-native instead of desktop-only, app-streaming ambition | UX polish today. They have been heads-down on this exact product longer. |
| **AFFiNE** | Block + canvas + database, partially local-first, open source | Files-on-disk-first instead of block-DB-first, simpler mental model, true Obsidian round-trip | Block editor depth, real-time, team features. |
| **Anytype** | Local-first, encrypted, cross-device | Open formats over a custom object graph, simpler portability story | Encryption, sync infrastructure, mobile parity. |
| **tldraw** | Best-in-class canvas SDK and performance | We are the workspace; they may even be a runtime candidate | Canvas engine quality. Borrow from them. |
| **Logseq / Tana / Roam** | Block-based outliner thinking | Files and pages over blocks; more compatible with normal markdown | Block-graph queries. Different paradigm; not aiming for it. |

**Honest summary.** The closest fight is Heptabase + Affine + Obsidian-with-Canvas. The win condition is *not* feature parity. It is: open the folder in three different tools (Cosmoboard, Obsidian, plain VS Code) and the data is the same. Nobody else clears that bar with a real spatial canvas attached.

---

## Pillars (tension only — full list lives in `holistic_planning.md`)

The existing pillars — Local-first, Portable, Embeddable, Structured, Performant, Gradual Collaboration, Safe by Default — are right. Tensions to manage:

- **Performant vs Embeddable.** Every embed (PDF, iframe, app) is a performance liability. Need a strict policy: embeds *cheap by default*, *expensive on demand*. Enforce as a board-wide budget, not per-node.
- **Local-first vs Realtime.** CRDT realtime is in the roadmap (Phase 6). Phases 1–5 must not bake in assumptions that break under CRDT later (e.g. autoincrement IDs, last-write-wins state, server-canonical timestamps).
- **Portable vs Rich tier.** Now formalized in the two-tier model above. The rich tier explicitly does not round-trip; the portable tier does. Onboarding always starts in the portable tier.
- **Safe by Default vs AI ergonomics.** Encryption protects content; AI agents need plaintext. Granting an AI agent access is a deliberate decryption-and-export. Surface this at the moment of grant, not in settings. See `ai_agents_in_the_loop.md`.

---

## Performance Approach

Foveated rendering, low-res rendering, real-time resolution adjustment — worth taking seriously. They are the only path to high-density boards staying interactive. Cheap-to-expensive:

| Technique | What it does | When to add | Cost |
| --- | --- | --- | --- |
| Frustum culling | Don't render nodes outside the viewport | Now (likely partial already) | Low |
| LOD per node | Distant or zoomed-out nodes render a thumbnail/placeholder, full render on focus | Phase 1 | Medium |
| Dynamic resolution during pan/zoom | Render at half-res while gesturing, restore on idle | Phase 1 | Low–Medium |
| Tile-based caching | Cache rendered regions of the board, repaint only dirty tiles | Phase 2 | Medium |
| Offscreen canvas + worker | Heavy paint and PDF rasterization off the main thread | Phase 2 | Medium |
| Foveated rendering | Full quality near cursor / focal point, degrade outward | Phase 3+ | High — only if measurements show it pays off |
| WebGPU / WebGL canvas | High node-count rendering with GPU | Late phase, only if 2D canvas hits a wall | High |
| Image and PDF placeholders | Blurhash-style placeholders, swap on intersection-observer | Phase 1 | Low |

**Recommendation.** Foveated rendering is a great north star but premature. The 80% win is **LOD + dynamic-resolution-during-gesture + tile cache**. Foveated only earns its complexity once boards routinely hit hundreds of media nodes.

A performance budget should live next to the board engine: **"a board with N=200 mixed nodes pans at 60fps on a 2020 laptop."** Without a number, performance work has no acceptance criterion.

---

## Capabilities (and how realistic each is)

| Capability | Practical near-term version | Honest version of the long-term |
| --- | --- | --- |
| **Drag a photo of a paper page in, get a readable element** | Drag image → store as image node + run client-side OCR (Tesseract.js) → attach a sidecar `.md` with the extracted text | Real value comes from a vision model that returns structured markdown (headings, lists, tables). Feasible with Claude/GPT vision. Add as opt-in pipeline. |
| **CLI inside the app** | Command palette (Cmd-K) that takes typed verbs: open, find, link, move, export | A real shell is hard in browser without WebContainers. Start with a scriptable command palette; promote to terminal only when there's a clear use. |
| **App streaming** | Embed already-web-native tools (VS Code Web, JupyterLab, Excalidraw) as iframes with saved session URL state | True desktop-app streaming (Figma, Photoshop) needs a remote rendering service or WebRTC gateway. Years out. Don't promise this. |
| **Offline collaboration** | GitHub PR-based recommendation flow (Phase 5 in roadmap) | CRDT sync that works offline and merges later. Yjs or Automerge plus a sync server even if optional. |
| **Integrated version control that is intuitive** | Periodic auto-commits to a local repo, plus a UI that shows board diff visually (added/moved/removed nodes) | A "time scrubber" on the board itself, treating commits as snapshots. Visual diff of canvases is genuinely novel. |
| **Work with any and all files** | Generic file node + viewer registry; PDF, image, text, audio, video built in; everything else opens externally | True in-place editing for arbitrary formats is unrealistic. Focus on viewing + opening; editing only for safe formats (md, txt, json, csv, basic images). |
| **Mobile / desktop / VR app** | Web app already runs on mobile and desktop. Wrap with Capacitor / Tauri later if needed. VR is a stretch goal. | A full native app per platform is a team-of-multiple effort. Web-first holds up for a long time. |
| **Linux distro / OS** | Long-term north star. Don't build toward this in code today. | Genuinely interesting only if the workspace metaphor becomes the *default* shell. Treat as aspirational; revisit in 2–3 years. |

---

## AI Agents In The Loop (summary — full doc: [`ai_agents_in_the_loop.md`](./ai_agents_in_the_loop.md))

User direction: AI agents should be collaborators with **granular access control and clear labeling**. Trust through transparency, not just permission flags.

**Core stance.**
- Treat agents as identities. An agent has a public key like a user; "share this board with the planning agent" looks structurally identical to sharing with a teammate.
- Every agent action produces an **audit record** in the workspace itself — replayable, exportable.
- **Scope grants are first-class objects.** "Read-only access to /board/research for 1 hour" is an artifact, expirable, revocable. Not a settings checkbox.
- **Labels are signals, not enforcement.** A `do-not-share-with-ai` label warns the user and the agent, but the actual gate is the scope grant.

**Tensions.**
- Local model (Ollama, llama.cpp, MLC) is private but limited. Hosted (Claude, GPT) is capable but plaintext leaves the machine.
- Encrypted-at-rest + hosted AI = granting access *is* a deliberate decryption-and-export. Surface this honestly at the moment of grant.

See sibling doc for full ideation, recommended phasing, and open questions.

---

## Security And Access (summary — full doc: [`security_and_access.md`](./security_and_access.md))

User direction: **encryption-first, no central auth server, segmented team access, eventually passkeys.**

**Recommended phased path.**
1. Capability URLs (key-in-fragment) for read-only public shares.
2. Local-first data at rest (passphrase + downloadable recovery file).
3. Public/private keypair identity (age-compatible, exchanged out-of-band).
4. Passkey + PRF as the key holder once browser support stabilizes.
5. Realtime collab over encrypted state (deferred).

**Locked decision (Round 2).** Recovery uses **optional opt-in escrow**. Pure key-only purity rejected. Implications: a recovery service exists in scope (third-party or self-hosted), users opt in, defeats some "no server" purity but matches normal-user expectations.

See sibling doc for threat model, segmentation design, and the rest.

---

## Limitations And Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| **Browser is not a real filesystem** | File System Access API is Chromium-only; Safari and Firefox lack it. Mobile browsers worse. | Capability detection. Local IndexedDB fallback. Native wrapper (Tauri) when this becomes the primary friction. |
| **Cross-origin embeds are limited** | Most websites refuse to be iframed (X-Frame-Options, CSP). | Provider adapters, OG-card previews, "open in new tab" fallback. Already in roadmap — keep expectations realistic in marketing. |
| **Canvas performance ceiling on touch devices** | A laptop-grade canvas does not translate to phones. | Mobile-specific rendering path: smaller LOD thresholds, no live embeds, simplified gestures. Plan for this from the start. |
| **The product is broad** | Spatial canvas + markdown + databases + apps + collab + encryption + AI is seven products. Easy to drift. | Two-tier model + wedge-first onboarding. Every feature decision asks: portable tier or rich tier? |
| **Dishonest wedge** | If we promise "open in Obsidian" and half the artifacts can't, we burn trust. | Two-tier labeling. Marketing mentions the portable tier; rich tier is upsell. |
| **Solo maintenance at startup pace** | Encryption, AI scope-grants, CRDT collab are all heavy investments. One person can't do them in parallel. | Sequence ruthlessly. Defer realtime. Encryption arrives via age (existing library), not roll-our-own. AI arrives via hosted models (existing APIs), not custom inference. |
| **Validation drift** | If the validation bar (5 weekly outside users) slips, the product is in demo state forever. | Tie roadmap milestones to user-acquisition steps, not feature checklists. |

---

## Platform Expansion Strategy

Stay web-first. Honest sequencing:

1. **Web (now)** — works on every desktop and phone browser. Free distribution. Easy update.
2. **Web app installed (PWA, soon)** — same code, installable, offline cache, app icon. Almost free.
3. **Desktop wrapper (later)** — Tauri preferred over Electron (Rust shell, ~5MB, native FS). Adds File System Access on browsers that lack it.
4. **Mobile native wrapper (later)** — Capacitor over the same web build. Adds camera intent, share-sheet, real local storage.
5. **VR / spatial (long-term)** — interesting because Cosmoboard *is* spatial. WebXR could give a 3D canvas room nearly free. Don't plan for it; be ready to demo it.
6. **Linux distro / OS (aspirational)** — only if the workspace becomes someone's default shell. Worth revisiting once daily-active users exist.

**Recommendation.** Skip steps 3 and 4 for now. Make the PWA story excellent; that buys 80% of the platform reach for ~5% of the cost.

---

## Naming

Honest takes on each candidate:

| Name | Verdict | Why |
| --- | --- | --- |
| **Cosmoboard** | **Keep as the working name.** | Already in the codebase, planning docs, and CSS. Renaming costs more than the upside right now. Descriptive and self-explanatory. |
| visios | Pass | Microsoft Visio collision. Search-poisoned. |
| spaces | Pass | Too generic. Apple "Spaces", Twitter Spaces, AWS Spaces. Won't rank, won't trademark. |
| cosmos | Pass | Azure Cosmos DB, Cosmos Network (crypto), Carl Sagan. Too taken. |
| evrenos / evrenboard | Personal-only | "Evren" ties to your name. Fine for an internal codename or a personal manifesto, weak for a product trying to onboard others. |
| spaceos | Pass | Generic, taken, vague. |
| **nokta_os** | **Strong contender — but only if the OS direction becomes real.** | Distinctive in English, no major collisions, ties to your prior project. The `_os` suffix only earns its keep if you actually ship an OS layer. Today the product isn't an OS. |

**Recommendation.**
- **Now:** keep `Cosmoboard` as the working name.
- **6–12 months from now**, once the product has external users, do a deliberate brand pass.
- **Avoid** picking a brand name today and trying to retrofit it.

---

## Near-Term Recommended Priorities (3–6 months)

Ordered by leverage. Updated for startup-intent commitment + 5-weekly-users validation target:

1. **Lock the wedge.** Bulletproof Obsidian round-trip for boards + markdown. *(Top priority for next 3 months.)*
2. **Two-tier model in the UI.** Visual labeling of portable vs rich artifacts. Cheap to ship; pays off the rest of the roadmap.
3. **Cosmoboard onboarding page on `evrenucar.com`.** A real entry point with boards, markdown, and an example database. The First Five Users surface.
4. **Performance baseline.** N=200 nodes, 60fps pan, 2020 laptop. Add LOD + gesture-time low-res. Skip foveated until measurements demand it.
5. **PWA install + offline.** Cheap step that makes the product feel real on phones / installable on desktops.
6. **Capability-URL share encryption** (security Phase A). Easiest encryption win; lets users share without an account.
7. **Drag-paper-photo → OCR → markdown.** High-delight, signals the AI direction. Tesseract first; vision-model upgrade path later.
8. **Command palette.** Cheaper than a CLI, gets 80% of the "high-productivity" feeling.

Defer: realtime collab, app streaming, encryption Phases C–E, full agent system, mobile wrappers, OS direction.

---

## First Five Users

Validation target = 5 outside users using it weekly without nagging. To get there, onboarding has to do these things:

| Onboarding requirement | Status today | Gap |
| --- | --- | --- |
| Land on a page that explains what this is in 10 seconds | Cosmoboard onboarding page is in the planning docs, not built | Build it |
| Make a board in <1 minute without instructions | Braindump exists; sign-up not required | Likely fine; verify with a fresh user |
| Save the board and reopen it later | Local-first save works; cross-device sync does not | Decide whether sync is required for "weekly use" or whether single-device use is OK for v1 |
| Share something they made with someone else | Capability-URL share doesn't exist yet | Phase A encryption + share button |
| Feel safe putting real notes there | Storage is localStorage / static-host; encryption is not on by default | At minimum: clear data-handling explanation. Better: opt-in encryption for sensitive boards |
| Come back next week | No retention loop yet | What is the *one thing* a user makes here that they couldn't make elsewhere? Possibly: a board with both notes and a database view, exportable to Obsidian |

**Working hypothesis for the wedge of *retention*.** "I can put notes, files, and a small database next to a canvas, and the whole thing is one folder I trust." That's the hook. Performance and AI are *additions* on top.

**Who are the first five?** Open question. Candidates: industrial-design colleagues, Delft / OMA Collective network, online communities that already use Obsidian + frustration with their canvas plugin. Worth naming actual people before the onboarding page ships.

---

## Open Questions

These are still open — answer them in this file, then promote the answer to *Decisions* above.

### From Round 1
1. Does the wedge sentence ("a workspace that is a folder") land for you, or does it underplay something you care about?
2. Which competitor matters most for positioning — Heptabase (closest), Obsidian (most familiar), or none of them (build the thing, position later)?
3. Is the OS / Linux distro direction a real long-term plan, or a north-star metaphor only? Answer changes whether `nokta_os` is a viable future name.
4. Should "integrated version control that is intuitive" become a named product feature with its own UX (time scrubber, visual board diff), or stay implicit via GitHub PR flow?
5. Should the brainstorming folder eventually feed `holistic_planning.md`, or stay separate as the *thinking layer* indefinitely?

### From Round 2 (open-ended, asked in conversation)
6. What keeps this project alive past month 12 / month 24? Startup-intent answer raises the stakes; what's the structural answer to *not* burning out or drifting?
7. Solo for now, or active recruiting of collaborators? Startup intent usually implies team — at what size and when?
8. The vision reads as additive ("I'd also like to..."). What is the *first thing to cut* when reality bites? Naming this in advance saves months later.
9. Who are the first five? Real names, not personas — they shape the onboarding page.

---

## Notes And Future Topics To Explore

Bare-bones list. When a topic earns more than a line, give it its own `.md` file under this folder and link it here.

- **AI / vision-model integration as a first-class capability** — see [`ai_agents_in_the_loop.md`](./ai_agents_in_the_loop.md).
- **Encryption story** — see [`security_and_access.md`](./security_and_access.md).
- **Version control, recovery, and backups** — see [`version_control_and_backups.md`](./version_control_and_backups.md).
- **Toolbar, command palette, and search** — see [`searchbar_tools.md`](./searchbar_tools.md).
- Plugin / extension system. What is the smallest API surface that does not lock us in?
- Real-time collab without a backend. Possible with WebRTC + Yjs; what is the discovery story?
- The "stream apps" idea — what is the smallest demo that proves it (e.g. embedded VS Code Web with persistent state)?
- Inline image pasting in markdown (already in current scratch pad as a feature request).
- File IDs that survive renames (already in current scratch pad as an idea).
- **First-five-users acquisition plan** — naming actual people, not personas. May earn its own file once names are listed.
- **Funding path.** Startup-intent commitment implies eventually money. Bootstrap, grants, angel, VC. Worth its own file when it stops being abstract.

---

## Update Log

- 2026-04-28 — File created. Vision discussion captured. Round 1 decisions locked: Obsidian round-trip is top priority for the next 3 months, and `Cosmoboard` stays as working name.
- 2026-04-28 — Round 2 added: security/access (sibling doc) and AI agents in the loop. Four new decisions locked (commitment = startup intent, wedge = aspirational, validation = 5 weekly outside users, recovery = optional opt-in escrow). New sections added: Two-tier Artifact Model, First Five Users, AI Agents summary, Security summary. Open questions re-numbered.
- 2026-04-28 — Round 3: created `version_control_and_backups.md`. Five-layer model (undo, rolling history, git, backups, key recovery), visual canvas diff and time scrubber as showpiece features. Linked from sibling docs list and Notes section. No new decisions locked yet — remaining open questions about plaintext-vs-encrypted git default, auto-commit cadence, and multi-device sync rendezvous.
