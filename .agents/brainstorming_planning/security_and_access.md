# Security And Access

> **Categorize and update as this discussion is evolving.**
>
> Living doc for the encryption, identity, and access-control ideation. Sibling to `vison_planning.md`. Decisions get promoted to `vison_planning.md → Decisions`. Stable architecture eventually flows to `.agents/holistic_planning/holistic_architecture.md` (do not edit that from here).

Started: 2026-04-28

---

## Decisions (locked)

- **Recovery model: optional opt-in escrow** *(2026-04-28).* Pure key-only purity is rejected. There will be a recovery vector (third-party or self-hosted) that users opt into. Defeats some of the "no server" purity but matches normal-user expectations. Implications:
  - Phase B (local-first data at rest) gains a sibling option: opt-in escrow alongside passphrase + downloaded recovery file.
  - The product surface will include a clear "make this recoverable" toggle that explains what it costs in trust terms.
  - Escrow service is a deferred build (we are not the escrow vendor in v1). v1 can integrate with an existing service (e.g. a self-hosted backup, or a vetted third party) before we build our own.

---

## What The User Wants (paraphrased)

- All data is safe by default — encryption-first, not a bolt-on.
- Files can be **publicly hosted** (GitHub, S3, IPFS, anywhere) but only readable to someone with the right key.
- **No separate authentication server.** Identity is a key, not an account.
- **Passkeys** are an attractive option but the right primitive is open.
- **Segmented access** — different team members can see different parts of the same workspace.
- All of this should be transparent enough that the user trusts the system with real work.

---

## Goals (in priority order)

1. **Confidentiality.** A file uploaded to a public URL is unreadable without the key.
2. **No central account server.** Auth = key, not an email/password row in a database.
3. **Granular sharing.** Per-board, per-folder, per-file, ideally per-segment-of-a-board.
4. **Survivable UX.** A user who reformats their laptop should not lose all their data.
5. **Auditable.** A reader should be able to verify who encrypted what and when.

---

## Anti-goals (explicit)

- **End-to-end encrypted realtime collab is not a Phase-1 goal.** That is years of work and not the wedge.
- **Server-side full-text search over ciphertext is not a goal.** Search runs locally on decrypted content.
- **Hiding metadata is not a goal in v1.** File names, sizes, timestamps may be visible. Content is what we protect.
- **Forward secrecy across all messages is not a goal in v1.** That belongs to chat apps; we are not Signal.

These are all *deferrable*, not *forbidden*. They go on the long-term list.

---

## Threat Model

Who are we protecting against:

| Adversary | Protection level |
| --- | --- |
| Random web visitor stumbling on a public URL | Full — they see ciphertext only |
| GitHub / S3 / hosting provider reading user content | Full — provider sees ciphertext only |
| ISP / network observer | Full — TLS plus content is already encrypted |
| Malicious browser extension on the user's machine | **Out of scope.** If your browser is compromised, you are compromised. |
| Stolen unlocked device | **Partial.** If someone steals your unlocked laptop, they get everything. Same as any local-first app. |
| Sophisticated state-level adversary | **Not a goal.** We are not building a tool for dissidents in v1. Be honest about this. |

---

## The Three Real Approaches

### Option A — Capability URLs (key-in-fragment)

Each share is a URL like `https://cosmoboard.app/board/abc123#k=BASE64KEY`. The fragment after `#` never reaches the server. The file at `/board/abc123` is ciphertext; the browser uses the fragment to decrypt locally.

- **Used by:** Cryptpad, Standard Notes shared notes, Firefox Send (RIP), 1Password share links.
- **Pros:** trivially simple. Works on any static host. No identity required to read.
- **Cons:** anyone who gets the URL has access. No revocation without re-encryption + re-share. Logs and bookmarks can leak the fragment.
- **Best for:** sharing a board read-only with someone outside the team.

### Option B — Public-key wrapping (a la age / PGP / MLS)

Each user has a keypair. Each file/segment has its own symmetric data key. The data key is wrapped (encrypted) with each authorized user's public key, and the wrapped copies are stored alongside the ciphertext. Reader uses their private key to unwrap, then decrypts the file.

- **Used by:** age (modern PGP replacement), MLS messaging, Tahoe-LAFS, AWS KMS envelopes.
- **Pros:** segmented access is natural. Adding a user means re-wrapping the data key. Removing a user means rotating going forward (past content stays accessible to them — accept this).
- **Cons:** real key management UX. Users need a stable identity (their public key). Onboarding is harder.
- **Best for:** team workspaces, segmented access, the long-term direction.

### Option C — Passkey + PRF-derived keys

The browser's WebAuthn PRF extension lets a passkey deterministically derive a per-relying-party secret. The user's encryption key is derived from their passkey via PRF. No password to remember; hardware-backed; phishing-resistant.

- **Status:** PRF extension is supported in Chromium (Chrome, Edge) and rolling out elsewhere. Apple support exists for some platforms but uneven. Firefox is partial.
- **Used by:** 1Password (login), Proton (key encryption, increasingly). Newer apps starting to combine PRF + age-style wrapping.
- **Pros:** the *cleanest* identity story. Passkey = identity = key. No passphrase mental load.
- **Cons:** device-bound unless the passkey is synced (iCloud Keychain, Google Password Manager). PRF support gaps in older browsers. Recovery story still needs a fallback.
- **Best for:** the eventual production identity layer once browser support is uniform.

---

## Recommended Path

The honest sequencing, oldest-trick-first:

1. **Phase A — Capability URLs for read-only shares.** Easy to ship, immediately useful, no identity infrastructure needed. Encrypt board exports with a per-share random key, put the key in the fragment.
2. **Phase B — Local-first data at rest.** All locally stored data (IndexedDB, exported bundles) gets a master key derived from a user-chosen passphrase + a recovery file the user downloads once. No server involved. Use age-style envelopes so the same file format extends to multi-recipient later.
3. **Phase C — Public/private keypair identity.** Each user generates an age-compatible keypair on first use. Public key is the user's "identity." Sharing a board with a teammate means wrapping the data key to their public key. Still no account server — public keys can be exchanged via QR code, link, or stored in a public file.
4. **Phase D — Passkey + PRF as the key holder.** Once browser support is uniform, the passkey replaces the passphrase. The keypair from Phase C is wrapped with a passkey-PRF-derived key. Survives device loss if passkey sync is enabled.
5. **Phase E — Realtime collab over encrypted state.** Hard. CRDT documents need a shared key. Combine Phase C wrapping with Yjs / Automerge over an untrusted relay. Defer.

**Critical principle.** Ship Phase A and B before any of the harder phases. They earn 80% of the trust at 5% of the engineering cost.

---

## Segmented Access (the team case)

A workspace contains many boards / folders / files. Each artifact has its own symmetric key. Access is granted by wrapping that key to a user's public key. To share a sub-tree:

- Owner picks the sub-tree.
- Owner selects the team members' public keys.
- For each artifact in the sub-tree, the data key is wrapped to each authorized public key.
- The wrapped keys live in a sidecar file next to the artifact.

Revocation is **forward-only**: rotating a sub-tree's key prevents future reads, but anyone who already saw the previous version can still decrypt their copy. This is a property of the math, not a bug. Document it explicitly.

---

## Hard Questions Specific To This Layer

1. **Recovery.** ~~What happens when a user loses their passphrase / passkey / recovery file?~~ **Decided 2026-04-28: optional opt-in escrow.** Users can choose a recovery vector (third-party or self-hosted). Remaining sub-question: which escrow shape ships first — passphrase + downloadable recovery file (no service), self-hostable backup, or integration with an existing recovery provider?
2. **Identity discovery.** How does Alice find Bob's public key? Options: out-of-band (link, QR), DNS-based (similar to Keybase), a directory service (centralizes what we wanted to decentralize).
3. **Search.** Encrypted content is opaque to the server. All search is local, which means downloading everything. Acceptable up to a few thousand files; problematic at 100k.
4. **Sync.** A user with two devices needs both to access the same data. Either keys sync (passkey + iCloud / Google) or the user manually transfers. Be honest about this.
5. **AI agents and encryption are in tension.** An AI that processes a board needs plaintext. If the AI is hosted, plaintext leaves your machine. If the AI is local, the model is smaller. This is a real tradeoff — see `vison_planning.md → AI Agents`.
6. **Audit and integrity.** Should every encrypted file include a signature so readers know it really came from the claimed author? Adds complexity. Worth it for team workspaces; overkill for a personal vault.

---

## Open Questions

- Lock the file format early. age (`age-encryption.org`) is a good candidate — modern, audited, has a JS implementation. Roll-our-own crypto is a no.
- Should the workspace identity be one keypair, or a hierarchy (a root identity that signs delegated keys for each device)? The hierarchy is more correct but is a long way down the road.
- Is the Phase-A capability-URL flow enough for v1, or do we need Phase C (keypair identity) before any external pilot?
- For team segmentation, is the unit "folder" or "page/board"? Smaller units = finer control, more key management overhead.

---

## Update Log

- 2026-04-28 — File created. Approach laid out (capability URLs → local-passphrase → keypair identity → passkey-PRF → encrypted realtime). Hard questions raised. No decisions locked yet.
- 2026-04-28 — Round 2: recovery model decided as **optional opt-in escrow**. Hard question 1 closed. Sibling doc `ai_agents_in_the_loop.md` created — flagged tension between encryption and AI agents (granting hosted-AI access = deliberate decrypt-and-export).
