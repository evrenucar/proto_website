# AI Agents In The Loop

> **Categorize and update as this discussion is evolving.**
>
> Living doc for AI agents as collaborators inside Cosmoboard. Sibling to `vison_planning.md` and `security_and_access.md`. Decisions get promoted to `vison_planning.md → Decisions`. Stable architecture eventually flows to `.agents/holistic_planning/holistic_architecture.md` (do not edit that from here).

Started: 2026-04-28

---

## What The User Wants (paraphrased)

- AI agents as collaborators that work *with* the user inside the workspace.
- **Granular access control** — the user grants exactly the scope an agent needs, no more.
- **Clearly labeled and stated** — the user always knows which agent is acting, what it can see, and what it has done.
- Trust comes from transparency and audit, not from "agent mode is enabled."

---

## Goals (in priority order)

1. **Granular scope grants.** An agent gets explicit access to specific boards / folders / files for a specific time window. Default is no access.
2. **Visible labeling at every step.** Which agent. Which model. Which scope. What did it read. What did it write. Visible in the workspace, not buried in logs.
3. **Audit by default.** Every agent action produces a record that lives next to the work, replayable and exportable.
4. **Honest about plaintext exposure.** When an agent runs against encrypted content, the user sees explicitly that decryption + export is happening.
5. **Composable.** Multiple agents can work on the same workspace; coordination happens through workspace artifacts, not hidden side channels.

---

## Anti-goals (explicit)

- **Agents do not get blanket "workspace access."** No "read everything" toggle. If you want it, grant it artifact by artifact (or sub-tree by sub-tree).
- **Agents do not act silently.** No background AI that touches files without producing an audit record.
- **Labels are not enforcement.** A `do-not-share-with-ai` label is a *signal*; the actual gate is the scope grant. Don't lean on labels for security.
- **No proprietary lock-in to one model provider.** Cosmoboard talks to OpenAI, Anthropic, local models, etc. via a thin adapter, not a deeply embedded integration.

---

## Core Tensions

### Local model vs hosted model

| | Local (Ollama, llama.cpp, MLC, WebLLM) | Hosted (Claude, GPT, etc.) |
| --- | --- | --- |
| Data leaves machine? | No | Yes |
| Capability | Lower (small models, slower) | Higher (state-of-the-art) |
| Cost | Free, but hardware-bound | Per-token, scales with use |
| Latency | Fast for small tasks, slow for big ones | Consistent network latency |
| Setup friction | High (download model, configure runtime) | Low (API key) |
| Best for | Sensitive data, simple tasks, offline | Complex tasks, capable reasoning |

**Stance.** Both are first-class. The user sees, at the moment they invoke an agent, which model is being used and where it runs. No hidden defaults that send data out.

### Encryption vs AI

If the workspace is encrypted at rest and the agent is hosted:
- The user *must* decrypt to send to the model.
- Plaintext leaves the machine for the duration of the request.
- The cleartext result comes back and is stored — encrypted or not, depending on the artifact tier.

**Honest UI.** When you grant a hosted agent access to encrypted content, the dialog says: "This will send the decrypted contents of [scope] to [provider]." Not in fine print. Front and center.

### Autonomy vs control

| | On-demand (user invokes) | Continuous (cron / event-driven) |
| --- | --- | --- |
| Audit clarity | Excellent — every run has a user trigger | Harder — runs happen without user attention |
| Useful for | Most tasks: summarize, extract, draft | Watch-this-folder, daily-digest, alert-on-new-file |
| Risk | Low — user is at the wheel | Higher — agent can drift, accumulate cost, surprise the user |
| Default | **Yes** | No, requires explicit setup with hard limits |

**Stance.** Default is on-demand. Continuous agents require explicit, scoped grants with **hard limits** (max calls per day, max cost, kill-switch in the workspace).

---

## Design Directions

### Agents-as-identities

Each agent has a **public identity** — a key, like a user. Sharing a board with the planning agent looks structurally identical to sharing with a teammate. Same UI, same scope grant model, same audit trail.

This makes the security model uniform. The encryption layer (`security_and_access.md`) wraps data keys to authorized public keys. Agents are just authorized public keys.

### Audit-record-as-artifact

Every agent action produces a small markdown file inside the workspace, looking something like:

```markdown
---
agent: planning-agent (claude-opus-4-7)
scope: /board/research (read-only, 1h grant)
prompt: "summarize the key tensions and open questions"
input_size: 4823 chars
output_size: 1204 chars
timestamp: 2026-04-28T14:23:00Z
duration_ms: 5400
hash_of_input: sha256:...
hash_of_output: sha256:...
---

## Output
[the agent's actual output, in markdown]
```

These are **regular files**. They live in a `_audit/` subfolder of the workspace by default. They are exportable, readable in Obsidian, replayable (rerun the same agent on the same input and compare). Tamper-evidence comes from hashing + optional signatures.

### Scope-grants-as-objects

A scope grant is a real artifact, not a settings checkbox. Looks like:

```yaml
# .agents/grants/grant-2026-04-28-planning.yaml
agent: planning-agent
public_key: age1...
permissions:
  - read: /board/research
  - write: /board/research/ai-output
expires: 2026-04-28T15:23:00Z
issued_by: anil@local
issued_at: 2026-04-28T14:23:00Z
```

Properties:
- **Visible** in the workspace; you can see all active grants.
- **Expirable** — most grants should be short-lived.
- **Revocable** — kill the grant, the agent loses access on next call.
- **Granular** — read vs write, per-path, per-time-window.

### Labels as signals

Artifacts can be labeled `ai:no-share`, `ai:read-ok`, `ai:read-and-write-ok`. The workspace renders these visibly. When an agent is invoked over a scope that includes a `no-share`-labeled artifact, the user sees a warning.

**Important.** Labels are advisory. The actual gate is the scope grant. A grant that includes a `no-share` artifact still works — the warning surfaces the conflict, the user resolves it.

### Multi-agent coordination through the workspace

Agents leave notes for each other in shared markdown / canvas, not via hidden side channels. If the planning agent wants the writing agent to draft something, it writes the request as a markdown file. The user can read it, approve, modify, redirect.

**Why.** Hidden agent-to-agent protocols become opaque fast. Workspace-as-bus keeps everything visible and inspectable.

---

## Recommended Phasing

1. **Phase A — Single-shot AI commands.** "Summarize this board," "extract a table from this image," "draft a markdown note from this audio." Each command runs in-place, requires confirmation, produces an audit record. No persistent agent identity yet.
2. **Phase B — Named agent personas.** Each agent has a name, public key, and configurable model. Scope grants become real artifacts. Audit records reference the named agent.
3. **Phase C — Multi-agent workspaces.** Agents can leave notes for each other through the workspace. Coordination is visible. Still on-demand by default.
4. **Phase D — Continuous agents with hard limits.** Cron / event-driven agents with explicit budgets, time windows, and kill-switches. Approve cautiously.
5. **Phase E — Agent marketplace / community plugins.** Third-party agent definitions. Heaviest because trust + sandboxing become real. Far out.

**Critical principle.** Phase A is mostly UX work over existing API calls. Don't over-architect — get the audit record right first. Everything later builds on it.

---

## Hard Questions

1. **Local-first vs hosted-first default.** When a new user installs Cosmoboard, does the AI work out of the box (hosted, with their API key) or do they have to install Ollama / WebLLM first? The former is friction-free but assumes they're OK with hosted; the latter is principled but loses 90% of users at "install Ollama."
2. **One agent or many.** Per-board agent personas (a "research assistant" board, a "coding agent" board) vs one universal agent that adapts to context?
3. **Where does the audit record live for encrypted artifacts?** If the source is encrypted, is the audit record also encrypted? If yes, can the user prove what an agent did without decrypting? If no, the audit record leaks information about the source.
4. **Tamper-evident without a server.** Hashes + signatures help, but without a central log there's no append-only guarantee. Do we accept this, or is some kind of public hash chain (Sigstore / a public Git repo / a Merkle log) part of the design?
5. **Labels for granularity.** "Don't share *this paragraph* with AI" is finer than "don't share this file." Worth supporting? Costs UI complexity; gains real privacy.
6. **Agent-as-user UX.** If an agent has a public key like a user, do agents appear in the same "members" list as humans? Could be confusing or could be elegant. Pick a design and commit.
7. **Cost control.** Hosted models cost money. Continuous agents can run up bills. Hard caps per agent, per workspace, per day. Where does the limit live? Who can raise it?

---

## Open Questions (specific to this layer)

- What's the minimal Phase A demo? "Summarize this board → markdown file" feels right but maybe "extract structured data from a dragged photo" is more compelling.
- Should agent invocations be a board-level toolbar action, a canvas-node primitive (drop an "AI block" with a prompt), or a command-palette verb? Probably all three eventually; pick the first.
- Does the audit record need to be human-readable, machine-readable, or both? Markdown with frontmatter gives both for free.
- How do we surface "you're about to send X tokens to a hosted model" before the call, so the user has cost-awareness?

---

## Update Log

- 2026-04-28 — File created. Goals, anti-goals, tensions, design directions, recommended phasing, hard questions captured. No decisions locked yet beyond the user's stated direction (granular control, clear labeling).
