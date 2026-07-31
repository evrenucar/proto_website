# Cosmoboard direction handoff

Use this file to continue the product-direction and architecture discussion in the correct Cosmoboard repository.

## Why this handoff exists

The discussion began inside the Punchlist repository by mistake. Punchlist should remain its own focused personal task-planning app. Cosmoboard is a separate product direction and should be designed, tracked, and implemented in its own repository.

No Cosmoboard implementation or repository split was started here.

## Product vision

Cosmoboard should become a project-centered productivity environment that combines:

- A spatial canvas for understanding projects and relationships.
- Markdown for durable, portable information.
- A CLI for fast control, scripting, and agent access.
- Human and AI-agent collaboration in the same project workspace.
- Project-based information storage and retrieval.
- Hosted applications and persistent application state inside projects.
- Higher performance on large and long-running workspaces.
- Terminal sessions and remote graphical sessions such as VNC.
- Collaboration between multiple people and agents.

Possible later forms include a dedicated Gecko-based browser or a complete Linux distribution. Those are long-term directions, not first-version requirements.

The unifying idea is one interface where project knowledge, tasks, conversations, tools, running applications, and computational sessions stay connected rather than living in separate products.

## Existing starting point

There is already a separate sibling checkout named `aide-board`. It is currently clean and contains:

- A project board.
- An agent graph.
- Human-agent chat.
- Agent presence and phase-by-phase progress.
- Interactive review and question pages.
- Local HTML reports.
- A small Node server and file-based project state.

It currently acts as Punchlist's development interface, but it is already physically separated from the Punchlist repository. It may be the natural seed for Cosmoboard, subject to design review.

The current `aide-board` architecture is deliberately small:

- Static HTML pages.
- Small zero-dependency Node scripts.
- State stored in the consuming project's `status/` directory.
- Punchlist embedded as the board pane.
- No general application-hosting, terminal, VNC, or collaborative storage layer yet.

## Important product boundary

Punchlist and Cosmoboard should not collapse into one product.

- Punchlist remains the focused, local-first personal planner distributed as one HTML file.
- Cosmoboard becomes the broader project workspace and agent-operating environment.
- Cosmoboard may host or integrate Punchlist as one interface, but Punchlist should remain independently usable and releasable.

This separation also resolves a prior Punchlist product constraint: collaboration, terminals, hosted apps, and operating-system ambitions do not belong in its minimal single-file scope.

## Scope decomposition

The vision contains several independent systems. Design them as stages rather than one specification.

### Stage 0: Product boundary and repository decision

Decide whether Cosmoboard:

1. Evolves directly from `aide-board`.
2. Starts as a new repository that imports selected `aide-board` concepts.
3. Uses `aide-board` as a temporary prototype while a new core is designed.

No option has been approved yet.

### Stage 1: Human-and-agent project workspace

Generalize today's board, chat, graph, progress, reports, and reviews into a standalone project workspace.

The first version should prove that a human and one or more agents can:

- See the same project state.
- Store durable project information.
- Plan and track work.
- Ask and answer structured questions.
- Attach visual references and per-item feedback.
- Understand who is acting and what phase work is in.

### Stage 2: Unified canvas, Markdown, and CLI

Give the same project entities multiple coordinated interfaces:

- Canvas for spatial relationships.
- Markdown for direct editing and portability.
- CLI for automation and agent control.

These should be views over shared project data, not three independent stores.

### Stage 3: Application and session hosting

Add explicit project resources for:

- Terminal sessions.
- Long-running processes.
- Web applications.
- Persisted application state.
- Remote graphical sessions such as VNC.

This stage requires a trusted local or remote runtime. It should not be simulated inside the initial static interface.

### Stage 4: Collaboration

Add multi-user ownership, permissions, presence, history, conflict handling, and shared project state. Design this after the single-user and multi-agent data model is stable.

### Stage 5: Dedicated browser or operating environment

Evaluate a Gecko-based browser shell or Linux distribution only after the workspace and runtime layers prove valuable. The earlier stages should expose clean interfaces so either form can host them later.

## Design principles

- Start from the smallest useful standalone Cosmoboard.
- Keep the data model independent of any single UI.
- Treat canvas, Markdown, and CLI as peer interfaces over shared entities.
- Make agent actions explicit, inspectable, reversible, and permissioned.
- Separate durable project knowledge from ephemeral process and UI state.
- Preserve portability. Projects should have a clear exportable representation.
- Do not scaffold browser-engine, VNC, container, or operating-system layers before their stage begins.
- Prefer process boundaries and small protocols over shared internal code between Punchlist and Cosmoboard.

## Requested planning workflow

Evren wants the design process presented at a live local URL.

The planning interface should:

- Use an interactive HTML page.
- Present one decision at a time.
- Include diagrams, mockups, or other visual references where useful.
- Provide a feedback field for every item.
- Allow screenshots or pasted visual references.
- Show a final summary before submission.
- Send the structured answers back to the working agent/model.

The existing `aide-board` review harness already provides much of this interaction pattern and should be evaluated for reuse in the correct repository.

## First unresolved question

What should Cosmoboard's first independently useful version prove?

- A human-and-agent project workspace based on today's board, chat, graph, progress, and review tools.
- A unified canvas, Markdown, and CLI workspace.
- A remote-computing workspace centered on terminals and VNC.

The preliminary recommendation is the first option. It has real working material in `aide-board`, establishes the shared project model needed by later stages, and avoids committing early to a browser engine or operating system.

## Required next steps in the correct repository

1. Read this handoff and inspect the correct repository.
2. Check whether it already contains Cosmoboard code, plans, or naming decisions.
3. Reconcile those findings with the `aide-board` starting point.
4. Continue the brainstorming process one scope question at a time.
5. Build the requested interactive local planning page with visual references.
6. Compare two or three repository/separation approaches.
7. Present the staged architecture for approval.
8. Only after approval, write a committed design specification and implementation plan.

Do not implement or move code before the design is approved.

## Changes made in the wrong Punchlist repository

No Punchlist app source, generated app output, tests, workflows, or website files were edited.

Changes made by the agent during orientation and planning:

- Created `docs/codebase-orientation-2026-07-29.md`.
- Created `status/codebase-orientation.html`.
- Updated `status/status-board.json` with:
  - A completed codebase-orientation task.
  - A paused Cosmoboard direction task with design-process children.
  - Corresponding history entries and the Codex agent-device name.
- `status/archive.json` may have been created or updated by the sanctioned board-writing helper while it pruned old completed board items.
- Cleared the stale `claude` heartbeat after Evren explicitly approved it.
- Created this migration file.

The working tree already contained other unrelated modified and untracked status/review files. They were not edited or removed.

