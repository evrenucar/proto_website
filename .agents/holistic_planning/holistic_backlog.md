# Holistic Backlog

## Purpose
Medium-term and later-priority live work that still matters but is not actively being worked on.

## Read when
Looking for what to pick up next after active work clears, or checking later-priority items.

## Skip when
Working on current active tasks or looking for completed history.

## Canonical for
Medium-term work items, later-priority tasks, deferred but live work.

---

## medium_term

- [ ] Add realtime collaboration across boards, markdown, and structured data if the architecture can support it cleanly.
  - Scope:
    - aim for broad realtime coverage rather than boards only if practical
    - evaluate CRDT infrastructure and presence model
    - keep async GitHub flows and local-first behavior intact
  - Validation:
    - confirm realtime collaboration is additive and does not break the file-first model

- [ ] Evaluate whether the custom Cosmoboard runtime should remain primary or whether a framework-backed editor path is worth adopting later.
  - Scope:
    - compare the current custom runtime with options like `tldraw` only if the custom path becomes too expensive
    - avoid migration churn before the product model is stable
  - Validation:
    - confirm any future runtime shift is justified by real product pressure, not novelty

## parked

- [ ] Fix the image focus-view dismissal hit area on the existing site.
  - Current issue:
    - clicking the black area to the left or right of a smaller focused image does not always close the view
    - the active hit area seems larger than the visible image
  - Expected behavior:
    - clicking anywhere outside the visible image should exit the focus view
  - Reason this is here:
    - it is still unresolved
    - it is not part of the current highest-priority Cosmoboard implementation path
