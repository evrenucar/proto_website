# Version Control, Recovery, And Backups

> **Categorize and update as this discussion is evolving.**
>
> Living doc for how Cosmoboard handles undo, history, snapshots, backups, and recovery. Sibling to `vison_planning.md`, `security_and_access.md`, and `ai_agents_in_the_loop.md`. Decisions get promoted to `vison_planning.md → Decisions`. Stable architecture eventually flows to `.agents/holistic_planning/holistic_architecture.md` (do not edit that from here).

Started: 2026-04-28

**Underlying principle: local-first.** All seven Ink & Switch local-first principles (no spinners, no device lock-in, optional network, seamless collaboration, the long now, security by default, ultimate user ownership) are load-bearing. CRDTs are the implementation pattern that makes them composable; this doc is largely about how to lay them down well.

---

## Decisions (locked)

- **L3 backbone: Yjs (browser) + Yrs (Rust on backend / Tauri / node)** *(2026-04-28).* Same wire format on both sides — devices and node speak the same protocol with no translation layer. Yjs is the most production-proven CRDT today (Linear, JupyterLab collab, Affine, BlockNote, tldraw multiplayer). Loro is on the watch list for a possible swap in ~2 years if its production hardening matures and its first-class branching becomes a hard requirement.

- **Three-tier history model** *(2026-04-28).*
  - **Ops:** every CRDT operation is preserved. Truth layer. Feeds time scrubber and realtime collab.
  - **Auto-checkpoints:** debounced groupings of ops with auto-generated descriptions ("auto-saved 2:34pm", "big edit at 4pm"). UX layer for casual rollback.
  - **User milestones:** named, first-class artifacts. Forkable, branchable, mergeable. Onshape-style visual version graph as the design reference.

- **Blob handling: Option 1 now, Option 3 as future** *(2026-04-28).* Content-addressed blob store referenced from CRDT by hash, immediately. Use a **blob queue abstraction** so future work can route blobs to multiple replication targets and add per-blob encryption as a queue processing step. Don't commit to the multi-target complexity today; future-proof the metadata so it's not a rewrite.

- **Realtime collaboration is an architectural goal, not a Phase-6 retrofit** *(2026-04-28).* The CRDT-aware data model is built for it from day 1. When realtime ships, it's a transport addition (op stream over WebRTC / a relay) not a data-model migration. Targets: synced docs, presence (live cursors), hybrid transport (centralized / self-hosted / P2P, switchable per use case).

- **Self-hosted node: turnkey, three deployment modes** *(2026-04-28).* One node implementation:
  - **Local sidecar** bundled with the desktop app.
  - **Self-hosted Docker** for users who want ownership.
  - **Cosmoboard-hosted** for users who want convenience.
  
  Node responsibilities: async device sync, encrypted backup of ops + blobs, relay when devices aren't online together, future realtime presence/collab. **The local app is always authoritative** — works offline, holds the CRDT locally, syncs opportunistically. The hosted node is never required to open or edit documents.

- **GitHub is optional, not central** *(2026-04-28).* GitHub may be useful as an export target for open-source projects later, and as a personal convenience today. It is not the rendezvous, not the L3 backbone, not part of the trust model.

---

## What The User Wants (paraphrased)

- Version control that is **intuitive** — most users don't grok git, but everyone wants "go back to last week."
- **Milestones** users can name and **fork / branch / merge** — Onshape as the visual reference.
- Recovery that works at multiple time scales — undo a typo, restore yesterday's board, recover after a device dies.
- Backups that survive disaster.
- Real-time, zero-delay collaboration as a future capability that the data model should already support.
- Live cursors visible to other users.
- All of it composes with the **encryption decisions** in `security_and_access.md` (no plaintext to providers, opt-in escrow for keys).

---

## Five Distinct Layers

These are different problems with different solutions. Conflating them is how products end up with a confusing "version history" panel that does none of them well.

| Layer | Time scale | Granularity | Where it lives | What problem it solves |
| --- | --- | --- | --- | --- |
| **L1 — Within-session undo** | Seconds to minutes | Per-action | RAM (operation stack) | "I just did the wrong thing, undo it" — Cmd-Z |
| **L2 — Local rolling history** | Hours to days | Per-autosave-tick | Local IndexedDB / filesystem | "What did this board look like an hour ago?" |
| **L3 — Long-term op log + checkpoints + milestones** | Days to forever | Per-op + per-checkpoint + per-milestone | CRDT op store (local + node) | Granular history, named savepoints, branches, realtime collab |
| **L4 — Disaster backups** | Forever | Per-snapshot | Off-device (encrypted) | "My laptop died, give me my workspace back" |
| **L5 — Account / key recovery** | Catastrophic | Per-identity | Opt-in escrow (`security_and_access.md`) | "I lost my passphrase / passkey, can I still get in?" |

**Critical principle.** Each layer should be designable, shippable, and testable independently. They compose; they do not depend on each other being finished.

---

## Layer 1 — Within-session Undo

Already partially exists in any editor; needs to be uniform across boards, markdown, and structured views.

- Operation-stack-based, not state-snapshot-based. Each user action emits a forward + reverse op pair.
- Bounded depth (e.g. last 200 actions) — don't grow unboundedly in memory.
- Crosses surfaces: undoing a markdown edit and a canvas drag should both be in the same stack.
- Cleared on session end (reload). L2 takes over for anything older.
- In Yjs: leverage `Y.UndoManager` per artifact, scoped to the user's own client ID so undo doesn't roll back collaborators' edits.

---

## Layer 2 — Local Rolling History

Cheap, fast, local-only "what did this look like 20 minutes ago?"

- Snapshots from the auto-checkpoint stream (L3) get persisted to the local store with logarithmic retention (every snapshot for 1h, every 10th for 1d, every 100th for 1w).
- Total local storage budget per user, configurable. Default 500MB. Old snapshots drop off.
- One-click restore replaces current state with the snapshot, pushing a new milestone first so the restore itself is reversible.
- Storage: on-disk under `.cosmoboard/history/` when File System Access is available, IndexedDB fallback.

---

## Layer 3 — Op log + Checkpoints + Milestones (the CRDT layer)

The replacement for git. Three sub-layers:

### Layer 3a — Ops (CRDT operation log)

- Every meaningful change generates Yjs ops continuously. Users never see ops directly.
- Op encoding is small and binary (Yjs default).
- Ops are the source of truth for both history and realtime collab — same data, different transport.
- Local store: IndexedDB (default) or `.cosmoboard/ops/<artifact>/` on disk.
- Sync: ops flow opportunistically over WebRTC P2P or via the node (see Hybrid Sync below).

### Layer 3b — Auto-checkpoints

- Computed by the client from idle windows (~30s) and significant boundaries (file save, board switch, day rollover).
- Each auto-checkpoint has a description generated from op stats: "Added 4 nodes, edited 2 markdown files, 14:32–15:01."
- Surfaced in the history panel and on the time scrubber as snap points.
- Auto-checkpoints are *views* over the op log, not separate storage. Computed on demand (cached locally).

### Layer 3c — Milestones (the user-facing version graph)

This is the surface that mirrors Onshape's version graph.

- A milestone is a **first-class artifact** with a name, description, optional tags, and a pointer to a specific op log position.
- Milestones can be forked: "branch from milestone 'v1' and try the new layout."
- A fork is a separate Yjs document seeded from the milestone state, with its own op history going forward.
- Forks can be merged back: CRDT semantics handle most merges automatically; ambiguous semantic merges surface as a manual UI (side-by-side view of the diverging nodes).
- The visual model is a **graph, not a list**. Branches are columns, milestones are nodes, merges are crossings. Onshape's version manager is the closest visual reference; Git's `lol` graph is a degraded version of the same idea.
- Milestones can be exported to portable form (markdown + JSON Canvas snapshots) for "open in Obsidian"-tier compatibility.

### Why CRDT instead of git

| Concern | Git answer | CRDT answer |
| --- | --- | --- |
| History granularity | Per-commit | Per-op (much finer) |
| Realtime collab path | Foreign | Native (op log IS the realtime stream) |
| Encrypted-at-rest | Awkward (binary blobs, no diff) | Natural (ops are small binary, encryption is fine) |
| Mixed media | Slow on binaries | Doesn't store blobs (separate hash store) |
| Branching UX | Per-developer mental model | Per-document, visual graph possible |
| Manual conflict resolution | Frequent | Rare (CRDT auto-merges; only ambiguous semantic conflicts surface) |
| Tooling | Mature ecosystem | Newer; we provide the tooling |

The tooling gap is real. We mitigate by exporting milestones to plain markdown + JSON Canvas snapshots that Obsidian and plain VS Code can still read.

---

## Layer 4 — Disaster Backups

L3 (sync to a node) gets you 80% of disaster recovery for free. L4 is the explicit, complete-workspace backup.

- A backup is a self-contained, encrypted bundle (Cosmoboard rich-tier export format).
- Generated on a user-chosen cadence: manual, daily, weekly.
- Pushed to a user-chosen destination: local external drive, S3-compatible, IPFS, the user's self-hosted node, or simply downloaded as a file.
- Default to incremental backups (op delta + new blobs) plus periodic full backups. If using a remote, surface running storage cost.

---

## Layer 5 — Account / Key Recovery

**Decided** in `security_and_access.md`: **optional opt-in escrow.** User chooses to keep a recovery copy of their key with a third party, a self-hosted backup, or a vetted external service. Without opt-in, lost key = lost data. Surface this honestly at setup.

---

## The Two Showpiece Features

**Decision (2026-04-28):** ship visual canvas diff first, time scrubber second.

### Visual Diff For Canvases (showpiece 1, ships first)

When you compare two milestones (or any two op-log positions) of a board, you see:
- **Added nodes** outlined in green, optional fade-in.
- **Removed nodes** ghosted in red at their old position.
- **Moved nodes** with an arrow from old to new, old position ghosted.
- **Changed nodes** outlined in amber, with an inline content diff preview.
- **Resized nodes** with corner indicators showing size delta.

Computed by:
1. Match nodes by stable ID across the two states (assumes nodes have IDs that survive renames — already on the scratch pad).
2. Property diff for matched nodes (position, size, content hash).
3. Classify unmatched nodes as added or removed.
4. For markdown content, standard text diff (LCS).

**Why this matters.** No competitor ships canvas-aware diff. Obsidian Canvas, Miro, FigJam — none. It's the differentiator.

### Time Scrubber (showpiece 2, ships later)

A horizontal slider on the board (toggleable, hidden by default) that lets the user drag through the board's history in real time, using the visual diff overlay as the slider moves.

- Slider positions are op-log timestamps; snap points are auto-checkpoints and milestones.
- "Restore from here" creates a new milestone at the chosen state.
- Performance: rendering historical state on drag is expensive; needs L1/L2 caching and the LOD system from `vison_planning.md → Performance Approach`.

---

## Branching And Merging (Onshape-flavored)

Design references:
- **Onshape Versions and History.** Visual graph of versions and branches; named versions; explicit branching with a UI you can navigate without thinking about git.
- **Yjs forks-as-snapshots.** Implementation pattern: snapshot the doc state, instantiate a new Y.Doc from it, edits go forward independently.

Design directions to validate:
- Each branch is its own Y.Doc instance, seeded from a milestone snapshot.
- Branches have human names and live as artifacts in the workspace (a `branches/` view, similar to how files live in folders).
- Merge UI: when two branches are merged, CRDT does the obvious work; only nodes that diverged in incompatible ways surface a side-by-side picker.
- Visualization: graph view per artifact, with nodes for milestones, edges for merges, columns for branches.

Hard parts to think about:
- Cross-artifact branches (a "branch" of the whole workspace, not just one board) — possible but needs a workspace-level milestone concept.
- Branch performance with N=100s of branches — Yjs documents are independent so this scales reasonably; the visualization is the bottleneck.
- Mobile UX for the version graph — Onshape doesn't really solve this; we'd be inventing.

---

## Presence (live cursors, edit awareness)

For Phase-6 realtime collab, presence is the human-visible part of "we're working together right now."

- **Library:** `y-protocols/awareness` (Yjs's standard presence module). Each user broadcasts their cursor position, selection, and a small payload (name, avatar, color).
- **Transport:** awareness messages flow over the same channel as ops (P2P or via the node).
- **Storage:** awareness is **ephemeral** — never stored, never history-relevant. Lives in memory only.
- **Conflict-free by construction:** awareness is last-write-wins per user.

Presence depth tiers (decide as we ship):
- Cursor position only.
- Cursor + active selection.
- Cursor + selection + activity descriptor ("Anil is editing the research board").
- Full presence (cursor + selection + activity + voice/video if/when).

---

## Hybrid Sync Transport

The user's framing: "centralized servers / self-hosted servers / P2P / a hybrid of 1-2-3 depending on what is being done."

Concretely:
- **P2P (WebRTC)** when both devices are online — fastest, no third party, ciphertext doesn't even leave the LAN if peers are on the same network.
- **Self-hosted node (Yrs)** when one device is offline — node stores ops as ciphertext, devices fetch when they reconnect. Same node also handles backup and future realtime relay.
- **Cosmoboard-hosted node** as a deployment option for users who want convenience — same protocol, opaque ciphertext, no plaintext access for us.
- **Direct file copy** as the always-available escape hatch.

The transport is selected per-sync-event based on availability:
1. Try P2P (signal via the node or out-of-band).
2. Fall back to the node (push-pull async).
3. If the node is unreachable, hold ops locally and retry.

---

## Blob Queue Abstraction

User direction: ship Option 1 (hash-addressed blob store) NOW, but build a **queue abstraction** that future-proofs toward Option 3 (multi-target replication + per-blob encryption).

Today (Phase 1):
- Drop a blob → hash it → store bytes locally → emit a CRDT reference `{type, hash, name, size}`.
- Sync to a single backend (local or node).
- Encryption: not yet enforced per-blob; whole-bundle encryption suffices.

Future (Phase 2+):
- Queue can route a blob to multiple replication targets (local, node, S3, IPFS).
- Encryption is a queue processing step: blob is encrypted before storage, key wrapped per recipient (per `security_and_access.md`).
- Deduplication by hash prevents double-storage across targets.

The metadata to lock now:
```json
{
  "type": "image",
  "hash": "sha256:...",
  "size": 1234567,
  "name": "diagram.png",
  "mime": "image/png",
  "encryption": null,
  "replication": []
}
```

`encryption` and `replication` start null/empty; they fill in when Phase 2 lands. Importantly, no schema migration is needed.

---

## Tech Candidates (updated)

| Concern | Candidate | Notes |
| --- | --- | --- |
| Browser CRDT | Yjs | Locked. |
| Server / native CRDT | Yrs | Same wire format as Yjs. Locked. |
| Local op store | IndexedDB or filesystem (`y-indexeddb`, custom FS adapter) | Filesystem when File System Access available, IDB fallback. |
| P2P transport | `y-webrtc` or custom WebRTC + libp2p later | Start with `y-webrtc` for speed; revisit if NAT traversal becomes a real issue. |
| Node (server) | Yrs + minimal HTTP/WebSocket layer | Tiny binary. Three deployment shapes (local sidecar, Docker, hosted). |
| Presence | `y-protocols/awareness` | Standard. |
| Bundle format | `.cosmobundle` (zip with manifest, ops dump, blob set) | Documented format. Same shape used for export, share, L4 backups. |
| Encrypted bundle | age-encrypted `.cosmobundle.age` | Reuses encryption library from `security_and_access.md`. |
| Diff (canvas) | Bespoke algorithm over Yjs state at two op-log positions | Small custom code. |
| Diff (text/markdown) | Standard LCS or `diff-match-patch` | Library exists. |
| Branching | Yjs document fork (snapshot → new Y.Doc) | Library-supported pattern; we layer the UI. |
| Watch list | Loro | Revisit in ~2 years for possible swap if branching becomes a hard requirement Yjs can't match. |

---

## Recommended Phasing (updated for CRDT-first architecture)

1. **L1 + L2 first.** Within-session undo via `Y.UndoManager`. Local rolling history with a basic history panel.
2. **L3a — CRDT plumbing.** Move artifact storage to Yjs documents. Local op store. Realtime not yet wired; this is just adopting the data model.
3. **Visual canvas diff (showpiece 1).** Ship over current vs last auto-checkpoint. Sells the differentiator.
4. **L4 — manual export bundle.** "Download a backup of this workspace" button. No remote yet. Cheap and trust-building.
5. **L3b — auto-checkpoints + history panel.** UI over the op log.
6. **L3c — user milestones + branching UI.** Onshape-style version graph. Forks first; merges later.
7. **Time scrubber (showpiece 2).** Wire up over op-log positions and milestones.
8. **Self-hosted node v1.** Local sidecar mode first (bundles with the desktop app). Async sync between two of the user's own devices via the node.
9. **P2P sync.** WebRTC + `y-webrtc` between devices. Falls back to node when offline.
10. **Encryption integration.** Per `security_and_access.md` Phase B + C: ops encrypted at rest in the node, blobs encrypted via the queue's encryption step.
11. **Realtime collab + presence.** Awareness over the same transport. Cursor visibility, selection sharing.
12. **Hosted node deployment.** Same node, run by us, opt-in. Convenience for users who don't want to self-host.
13. **L5 — escrow integration.** Hooks for the chosen escrow provider once `security_and_access.md` resolves which one.

**Critical principle.** Phase 1 (within-session undo) ships before any of the rest matters. CRDT plumbing (Phase 2) is the largest single bet — get it right, the rest stacks cleanly.

---

## Hard Questions

1. **Branching UX inspiration: how literal is the Onshape reference?** Onshape's version manager is a graph view embedded in the document panel. Cosmoboard could do the same (graph as a board panel) or invent something more spatial (branches as canvas regions, milestones as visible cards). The literal Onshape route is faster to design and easier to explain.
2. **Cross-artifact branches.** Branching a single board is simple. Branching the whole workspace ("my entire research project, before and after the rewrite") is a different concept. Defer or design now?
3. **Where ops live for shared artifacts.** A board shared with a collaborator: their ops accumulate in their local store, ours in ours, and they merge via the node. Storage budget grows on both sides. Is that fine, or do we need lazy fetching of ops we haven't seen?
4. **Visual diff for forked branches.** Diffing two milestones on the same branch is straightforward. Diffing across branches (which is the whole point of branching) needs a 3-way diff that highlights what each branch did since the divergence point. Real but more complex.
5. **Ops-encryption in the node.** Per `security_and_access.md`, ops in the node are ciphertext. But Yjs ops contain structural metadata (op type, target ID, etc.) that leaks shape if not also encrypted. Do we encrypt the op envelope or each op individually? Affects sync efficiency.
6. **Conflict surface for milestone merges.** Yjs auto-merges most things. Some merges are semantically ambiguous (two branches both edited the same node's text in incompatible ways). What does the manual conflict UI look like, and what's our budget for inventing it well?

---

## Open Questions

- Smallest demo for the milestone/branching UI: probably "fork this milestone, edit the fork, see both in the version graph, merge back." That's a Phase-6-of-the-plan demo, not v1.
- Should auto-checkpoint descriptions use a small local model (privacy) or be deterministic-from-stats (no model needed)? Deterministic is safer; local model is friendlier.
- Does the time scrubber expose ops or aggregate to checkpoints? Recommendation says "snap points are checkpoints and milestones" — implicitly aggregated. But for power users, an op-granular mode might be a power feature.

---

## Update Log

- 2026-04-28 — File created. Five-layer model laid out. Two showpiece features named (visual canvas diff, time scrubber).
- 2026-04-28 — Round 4: dropped git as L3 backbone after user input. Locked Yjs (browser) + Yrs (node/server) as the CRDT pair. Locked three-tier history (ops + auto-checkpoints + named milestones with fork/branch). Locked blob handling (Option 1 now with queue abstraction toward Option 3). Locked self-hosted node turnkey three-mode (local sidecar, Docker, hosted). Locked realtime collab as architecture goal, not retrofit. Locked visual canvas diff first, time scrubber second. New sections added: Branching/Merging, Presence, Hybrid Sync Transport, Blob Queue Abstraction. Tech Candidates updated. Phasing updated.
