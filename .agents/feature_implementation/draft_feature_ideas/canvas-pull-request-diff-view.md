# Canvas Pull Request Diff View

## Problem / Why
GitHub renders `.canvas` files as raw JSON, which makes reviewing visual changes useless in a PR. Cosmoboard boards live in git, so the team needs a way to see what actually moved, was added, or was deleted on the canvas without leaving the review flow.

## Sketch
- Add a side-by-side canvas diff renderer that loads two refs (base and head) and overlays them in a single read-only canvas.
- Color code nodes and edges with teal for added, dim red for removed, and a soft outline for moved or resized. Unchanged content stays at low opacity so the eye lands on the delta.
- Detect reparenting and rename across the two trees by node id, fall back to content hash for nodes without stable ids. Surface a small left rail list of changes that double as click-to-pan targets.
- Provide a shareable URL of the form `/review?repo=user/repo&base=main&head=branch&path=board.canvas` so a PR description can deep link straight into the diff. Static-host friendly, no server side rendering required.
- Optional toggle to swap into a unified view that animates between base and head on a slider, useful for layout-only changes.

## Notes
- Precedent: Figma branching diff, GitHub image diff modes (2-up, swipe, onion skin). The slider mode mirrors the onion skin idea.
- Touch points: canvas renderer, file loader that can pull two refs from the GitHub API or from local working tree, a diff utility that walks both canvas trees.
- Open question: how to render diffs of nested boards. First pass can show the parent board diff and badge nested boards that themselves changed, with a click through into their own diff view.
- Markdown nodes should diff their text inline with a standard line diff so prose changes are legible without expanding the node.
