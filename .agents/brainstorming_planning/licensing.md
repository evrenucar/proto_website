# Licensing, Commercialization, And Trademark

> **Categorize and update as this discussion is evolving.**
>
> Living doc for how Cosmoboard, its P2P relay, its addon SDK, and its surrounding artifacts will eventually be licensed. Sibling to `vison_planning.md`, `security_and_access.md`, `version_control_and_backups.md`, `ai_agents_in_the_loop.md`, and `searchbar_tools.md`. Decisions get promoted to `vison_planning.md → Decisions`. Stable architecture eventually flows to `.agents/holistic_planning/` (do not edit that from here).

Started: 2026-04-29

**Underlying principle.** Most code stays open; the moat is dual-licensing + trademark, not closed source. License choice is a downstream consequence of the commitments already locked in `vison_planning.md` (startup intent, two-tier artifact model, encryption-first, self-hosted relay node) and `version_control_and_backups.md` (turnkey self-hosted node, P2P relay).

---

## Index

- [User direction (not yet locked)](#user-direction-not-yet-locked)
- [Per-component license matrix](#per-component-license-matrix)
- [Why AGPLv3 + commercial for engine and relay](#why-agplv3--commercial-for-engine-and-relay)
- [Why Apache-2.0 for the SDK and addons](#why-apache-20-for-the-sdk-and-addons)
- [Why CC-BY for the protocol spec](#why-cc-by-for-the-protocol-spec)
- [Why portfolio code stays MIT but content does not](#why-portfolio-code-stays-mit-but-content-does-not)
- [Trademark](#trademark)
- [Contributor License Agreement (CLA)](#contributor-license-agreement-cla)
- [Linux / OS interfacing](#linux--os-interfacing)
- [Repo-split plan](#repo-split-plan)
- [What execution would look like](#what-execution-would-look-like-not-yet-scheduled)
- [Open Questions](#open-questions)
- [Update Log](#update-log)

---

## User direction (not yet locked)

User has indicated direction during planning conversation. These are *not yet decisions* (have not been ratified into `vison_planning.md → Decisions`) — execution is explicitly deferred until at least the Cosmoboard repo split.

- **Commercial path:** AGPLv3 + commercial dual-license, Sentry / Grafana / Mattermost model.
- **"Nodes" in licensing-question context** = P2P relay servers (the server-side relay/sync infrastructure from `version_control_and_backups.md → Hybrid Sync Transport` and `Self-hosted node`), not canvas items.
- **Repo posture:** Portfolio (`proto_website`) and Cosmoboard split into separate repos before the licensing migration lands. Licensing strategy applies to the future Cosmoboard repo from commit #1.
- **Attribution:** preserve "Evren Ucar" / "Cosmoboard" in all derivative work and forks.
- **Commercialization right:** retained — the dual-license model exists to make this concrete.
- **Addons:** ecosystem-friendly — third-party authors should be able to ship closed-source or differently-licensed addons against a stable SDK.

---

## Per-component license matrix

Future state once Cosmoboard splits. Today, the entire `proto_website` repo is single-LICENSE MIT (2021).

| Component | License | Lives in (future) |
|---|---|---|
| Cosmoboard core engine (canvas runtime, board logic, UI) | AGPL-3.0-or-later + commercial license available | `cosmoboard/` |
| Cosmoboard relay server / P2P sync nodes | AGPL-3.0-or-later + commercial license available | `cosmoboard-relay/` |
| Network protocol spec (relay wire format, sync schema) | CC-BY 4.0 (the spec doc); reference impl AGPL | `cosmoboard-protocol/` or in-repo `/docs/protocol/` |
| Plugin/Addon SDK (headers, API surface, type defs, scaffolding) | Apache-2.0 | `cosmoboard-sdk/` |
| Reference / first-party addons | Apache-2.0 | `cosmoboard-addons-*/` |
| Premium "rich-tier" features (encryption, AI, app sessions, future) | Proprietary, source-available or closed | `cosmoboard-pro/` (private repo) |
| `.canvas` / portable file formats | Format is open (Obsidian-compatible); reference parser MIT | `cosmoboard-canvas-format/` |
| Build/dev tooling (`scripts/`, internal CLIs) | MIT | Wherever it lives |
| Portfolio site code (`site.js`, build) | MIT (status quo) | `proto_website` |
| Portfolio content (`content/` — writing, photography) | All Rights Reserved (or CC-BY-NC-ND for photography) | `proto_website/content/` |
| "Cosmoboard" name + logo | Trademark, NOT licensed under any of the above | Documented in `TRADEMARK.md` |

---

## Why AGPLv3 + commercial for engine and relay

- **AGPL closes the SaaS loophole.** Plain GPL doesn't trigger when modified code runs as a service; AGPL does. A competitor who forks Cosmoboard or the relay and offers "Cosmoboard-but-hosted" must release their modifications.
- **Same license for engine and relay** keeps the dual-license business model coherent: one CLA, one commercial SKU, one trademark.
- **Commercial license** sits next to the AGPL one for customers who can't accept AGPL terms (most enterprises, embedders, anyone wanting closed forks). They pay; they get a non-AGPL grant to the same code. This is the entire revenue surface in the Sentry model.
- **Why AGPL and not BSL or SSPL.** BSL (Sentry's actual current choice) and SSPL (MongoDB's) are stricter but **not OSI-approved open source**, which causes adoption friction (Linux distros won't package, some companies forbid). AGPL is OSI-approved, well-understood, and gives 90% of the moat. Revisit BSL/SSPL only with concrete evidence of cloning.

---

## Why Apache-2.0 for the SDK and addons

- AGPL on the SDK would force every addon author to AGPL their addon. Most won't, and the ecosystem dies before it starts.
- Apache-2.0 on the SDK headers/types/scaffolding lets addon authors ship **whatever license they want** for their own addons (proprietary, MIT, GPL — their choice).
- This is the **"linking exception" pattern**, executed by physically separating the SDK package from the engine. The SDK is what addons depend on. The engine loads addons through the SDK contract.
- Apache-2.0 chosen over MIT for the SDK because of the **explicit patent grant** — important once third-party authors are involved, since it protects them and you from patent ambushes.

---

## Why CC-BY for the protocol spec

- Encourages **alternate clients and relays**. Someone writing a mobile-only client or a Rust relay implementation is a feature, not a threat — the moat is the canonical implementation and the trademark, not the protocol.
- Mirrors how Matrix, ActivityPub, and Obsidian Canvas work: open spec, project-blessed reference impl.

---

## Why portfolio code stays MIT but content does not

- Code is generic (sidebar, nav, email-copy UX) and useful for others to learn from. MIT is fine.
- Photography, writing, and personal projects in `content/` are *not* something to give away freely. Default copyright (all rights reserved) is the right answer; CC-BY-NC-ND is an option for non-commercial sharing with credit.
- **The current blanket MIT accidentally licenses photos to the world.** Worth fixing at repo-split time at the latest.

---

## Trademark

- Code licenses do **not** grant trademark rights — even AGPL leaves the name and logo untouched.
- "Cosmoboard" name + future logo should be protected by a separate `TRADEMARK.md` policy: forks may use the AGPL'd code, but cannot redistribute under the "Cosmoboard" name. This is the second moat — without it, Sentry-vs-GlitchTip / Grafana-vs-many situations get messy.
- Use ™ informally now, ® only after a real registration.
- Registration is deferrable until going public with the Cosmoboard product.

---

## Contributor License Agreement (CLA)

- Without a CLA, dual-licensing breaks the moment a third party contributes — without a sublicensing right over their code, that code can't go into the commercial SKU.
- **DCO sign-off is not sufficient** for dual-licensing.
- Tooling: [CLA Assistant](https://cla-assistant.io/) for GitHub. Or a template ICLA based on Apache Software Foundation's.
- Copyright assignment (Apache Foundation style) is a heavier alternative; CLA is the lighter default.
- Lock the CLA into the new Cosmoboard repo from commit #1, before any external contribution lands.

---

## Linux / OS interfacing

- AGPL is **GPLv3-compatible**; GPLv3-or-later code can combine with AGPL freely.
- Linux is GPLv2-only, **but** has the well-known **syscall exception** that explicitly carves out user-space programs. User-space code linking with the kernel via syscalls can be any license.
- Tauri (MIT/Apache-2.0) and Capacitor (MIT) wrappers, both already on the platform-expansion roadmap, are compatible with AGPL apps.
- Conclusion: there is no licensing block on the user's stated long-term direction of "interface and use Linux at the core." Even an eventual Linux-distro/OS direction works — kernel changes would be GPLv2, the workspace stays AGPL, and userland glue is whatever the project picks.

---

## Repo-split plan

When Cosmoboard splits to its own repo (timing per `vison_planning.md` startup-intent commitment):

- **New repo `cosmoboard/`** — AGPL-3.0-or-later from commit #1, CLA gate, NOTICE file, TRADEMARK.md, AGPL §13 source link in UI.
- **`proto_website` (current repo)** — keep as personal portfolio. Replace blanket MIT with `LICENSE-CODE` (MIT) + `LICENSE-CONTENT` (All Rights Reserved / CC-BY-NC-ND). Update README to spell out which directory is which.
- **AGPL §13 hard requirement.** AGPL-3.0 §13 requires that users interacting with the program over a network can see the source. The Cosmoboard UI will need a footer / about screen with the source link, license, and copyright. This is a hard requirement, not optional polish.

---

## What execution would look like (not yet scheduled)

When the user is ready, in roughly this order:

1. Cosmoboard repo split happens (orthogonal to licensing).
2. New repo lands with AGPL `LICENSE`, `COMMERCIAL-LICENSE.md` stub, `NOTICE`, `CONTRIBUTING.md`, `CLA.md` (or CLA Assistant integration), `TRADEMARK.md`, AGPL §13 footer wired up.
3. SPDX headers in source files (`AGPL-3.0-or-later` for engine and relay, `Apache-2.0` for SDK, `MIT` for tooling).
4. Portfolio `LICENSE-CODE` + `LICENSE-CONTENT` split lands in `proto_website`.
5. Lawyer review of the commercial-license stub, *before* the first paying customer.

None of this is committed to a date. The Decisions section above stays empty until the user ratifies a step (and decisions go into `vison_planning.md → Decisions`, not here).

---

## Open Questions

1. Timing of the Cosmoboard repo split — is there a milestone that triggers it (first outside user, brand pass, encryption Phase A landing, …) or is it a deliberate calendar decision?
2. Hosted-relay business model: is the Cosmoboard-hosted node the primary commercial product, the dual-license commercial grant, or both? Affects whether the commercial license needs to handle hosting/embedding asymmetrically.
3. Trademark registration timing — register before the brand pass (cheap insurance) or after (avoids re-registering if the name changes)?
4. Should "rich-tier" features (`vison_planning.md → Two-tier Artifact Model`) be source-available (BSL-style, with a delayed-AGPL conversion) or fully proprietary? Source-available is friendlier; proprietary protects more.
5. Is a Developer Certificate of Origin good enough as a transition mechanism *before* full CLA tooling is in place, or should the repo refuse external contributions until CLA Assistant is wired up?

---

## Update Log

- 2026-04-29 — File created. User direction captured (AGPLv3 + commercial dual-license, Apache-2.0 SDK, MIT for tooling, trademark separately, CLA required). Per-component matrix laid out. Execution explicitly deferred. No decisions locked yet — Decisions section empty until the user ratifies into `vison_planning.md`.
