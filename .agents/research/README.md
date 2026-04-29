# research/

In-depth research artifacts: comparisons, evaluations, format dives, deep technology spikes. Each file is self-contained, visual-first, and easy to scan.

## Read when

- Starting a deep comparison between candidate libraries or formats.
- Writing up findings from a research spike.
- Looking for the artifact behind a confirmed decision in `holistic_planning/`.

## Skip when

- You only need a short reference table or external link. That belongs in `holistic_planning/holistic_research.md`.
- You are capturing early ideas before any research has happened. That belongs in `brainstorming_planning/`.
- You are designing or building a feature. That belongs in `feature_implementation/`.

---

## Folder layout

```
research/
  README.md                    this file
  research_areas.md            minimal index of active and proposed research directions
  <research_topic>.md          active research artifact, one per topic
  completed_research/          archived once the research has been consumed by a decision
```

---

## Document template

Every research file in this folder follows the same shape, top to bottom. Sections appear in this order. Do not interleave references with the body.

### 1. Abstract

Two to four sentences at the very top of the file. State what was researched, why, and the verdict in plain language. A reader who only reads the abstract should know whether this artifact is worth opening further.

### 2. Main Findings

Bullet list directly under the abstract. Each bullet is a key conclusion, short enough to scan. This is the executive summary. If a finding needs nuance, link to the section in the body that covers it.

### 3. Visuals at the forefront

Diagrams come before long prose. Prioritize:

1. **Flow diagram** for any decision tree or branching evaluation.
2. **Comparison matrix** as a Mermaid `quadrantChart` or a dense table at the top of the body, not buried at the end.
3. **Sequence diagram** when timing or actor interaction matters.
4. **State diagram** when the topic involves state transitions.
5. **Pie or `xychart-beta` bar chart** when summarizing numeric tradeoffs.

Use Mermaid fenced blocks where possible. Fall back to ASCII art when Mermaid does not handle a layout well. Keep diagrams next to the prose they describe.

### 4. Body

Methodology, scope, what was tested or compared, edge cases, caveats. Annotate diagrams with prose, do not duplicate them.

### 5. Tables, links, references at the end

Comparison tables, external URLs, citations, and links to related docs go at the end of the file. Not interleaved with the body. A reader who wants to verify a claim should be able to scroll to one place at the bottom.

---

## Batching guidance for subagents

Match the model to the scope of the question. Do not default to Opus for trivial work, and do not default to Haiku for synthesis.

| Scope | Model | When |
| --- | --- | --- |
| Complex in-depth comparisons, multi-source synthesis, reasoning across several candidates | Opus 4.6 or 4.7 | Most artifacts that live in this folder. Use Opus 4.7 for the hardest synthesis, Opus 4.6 when speed matters. |
| Medium-scope lookups, structured summarization, single-candidate writeup | Sonnet | A self-contained section of a larger artifact. |
| Narrow factual lookup, single-source extraction, link gathering | Haiku | One question, one source, no judgment required. |

When fanning research out across subagents:

- Batch independent research questions into parallel agent calls in a single message. One agent per candidate or per sub-question, each returning a self-contained section that drops into the final artifact.
- Default to one Plan or Explore subagent for scoping first. Fan out only when sub-questions are clearly independent.
- Tell each agent the document template above so its output drops in cleanly. The orchestrator should still own the abstract and main findings, since those require synthesis across all returned sections.

---

## Lifecycle

1. Create the artifact at `.agents/research/<topic>.md`. Fill in the abstract and main findings before doing the deep work, even as `TBD`, so the artifact's purpose is visible from day one.
2. Add an entry to `research_areas.md` under the right heading and link the file.
3. Do the research. Update the artifact in place. Move findings out of `TBD` as they solidify.
4. When the research has been consumed by a decision or roadmap entry, move the file to `completed_research/` and update the link in `research_areas.md`. Add a single `Outcome:` line at the top of the artifact noting where the decision landed (for example a `holistic_planning.md` confirmed-decision, a feature spec, or a backlog ticket). Do not edit the body after archiving.

---

## Conventions

- One topic per file. Do not bundle two comparisons into one artifact.
- Filenames are kebab-case or snake_case, lowercase, no dates.
- Diagrams in Mermaid fenced blocks where possible.
- Follow the project writing rule from `project.md`: no em dashes. Use a period, comma, or connector word instead.
- Status legend for any todos inside the artifact: `[ ]` pending, `[A]` agent-confirmed-done, `[x]` user-verified-done.

---

## See also

- [`../agents.md`](../agents.md) top-level agent router
- [`../project.md`](../project.md) durable product facts and writing rules
- [`../holistic_planning/holistic_research.md`](../holistic_planning/holistic_research.md) short reference tables and external links
- [`../brainstorming_planning/`](../brainstorming_planning/) early idea capture before research begins
- [`../feature_implementation/README.md`](../feature_implementation/README.md) where research feeds into a feature spec
