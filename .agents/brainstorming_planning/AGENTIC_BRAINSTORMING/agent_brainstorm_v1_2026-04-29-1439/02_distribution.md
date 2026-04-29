# Work Distribution

Author: holistic agent
Round: 2

Started: 2026-04-29

Summary:
Locks the five topics agreed in `01_kickoff.md`. One row per sub-agent
with topic title, owned file, and a boundary note that prevents drift
onto peer territory. Authoritative for the rest of the session.
Renegotiation goes through the holistic agent, not unilateral edits.

Sibling files:
- [00_overview.md](./00_overview.md)
- [01_kickoff.md](./01_kickoff.md)
- [03_vision_and_positioning.md](./03_vision_and_positioning.md)
- [04_realistic_critique.md](./04_realistic_critique.md)
- [05_competitive_landscape.md](./05_competitive_landscape.md)
- [06_roadmap_and_priorities.md](./06_roadmap_and_priorities.md)
- [07_user_and_adoption.md](./07_user_and_adoption.md)
- [08_cross_check.md](./08_cross_check.md)
- [09_handoff.md](./09_handoff.md)

---

## Locked work split

| Agent ID | Topic | File | Boundary notes |
|---|---|---|---|
| sub-agent 1 | Vision and positioning | `03_vision_and_positioning.md` | What is uniquely true. Wedge sentence, two-tier artifact model, core thesis, why-this-and-not-X stance. Do not slide into competitor analysis (sub-agent 3) or feature timeline (sub-agent 4). |
| sub-agent 2 | Realistic critique | `04_realistic_critique.md` | Gap-audit only. Compare `vison_planning.md` decisions and `holistic_tasks.md` `active_work` versus the live state in `current_scratch_pad.md` and `general_issues_and_tasks.md`. Not a wishlist. |
| sub-agent 3 | Competitive landscape | `05_competitive_landscape.md` | Obsidian, Notion, tldraw, Excalidraw, Logseq, Anytype, Heptabase, AFFiNE. Use `WebSearch` and `WebFetch`. Cite every Reddit and HN thread as a clickable markdown link. No claim without a source. |
| sub-agent 4 | Roadmap and priorities | `06_roadmap_and_priorities.md` | 1-month, 3-month, 6-month, 12-month windows. Must include explicit cut list. Read `holistic_tasks.md` and `holistic_planning.md` as input. Iterate on the existing phased roadmap, do not duplicate it. |
| sub-agent 5 | User and adoption | `07_user_and_adoption.md` | Real candidate users where possible (not personas). Distribution channels for a solo dev shipping inside `evrenucar.com`. Friction points from `current_scratch_pad.md` and `general_issues_and_tasks.md`. Tie to the First Five Users plan in `vison_planning.md`. |

## Boundaries

- Each sub-agent owns exactly one file. No editing peer files.
- Online research is mandatory for sub-agent 3, strongly encouraged for sub-agent 5, optional but welcome for the other three.
- Every file must front-load a 20-line summary block per `../README.md`.
- Each file must contain at least one Mermaid diagram, the four-primitive body (problem statement, state or flow sketch, in-scope vs deferred bullets, ordered todos), and a discussion section with 4 to 6 turn blocks capturing real tension or pushback.
- Style rules from `.agents/project.md:51` and the README: no em-dashes, no YAML frontmatter, inline backticks around filenames and paths, file path citations as `file.ext:line`.
