# Branch Scoped Scratch Boards

## Problem / Why
A real working session usually wants a temporary place to riff, sketch, or stage half-finished ideas without polluting the main board. Tying a scratch board to the current git branch gives that space a natural lifetime and an obvious cleanup point when the branch merges or is deleted.

## Sketch
- Every board can spawn a scratch sibling at `<board>.scratch/<branch-slug>.canvas`. The viewer auto-detects scratch boards for the current branch and surfaces them as a dim teal tab next to the parent board.
- Scratch boards are first-class canvases with all features, but get a visual treatment that signals they are work-in-progress: dotted frame, subtle "scratch" watermark, branch name in the header.
- A "promote to main board" action lets the user lasso a region on the scratch board and merge it as a node group into the parent. The promoted region carries a back-link to the originating branch and commit.
- When a branch is deleted locally or merged on GitHub, prompt the user to either archive the scratch into `<board>.scratch/archive/` or delete it. Never auto-delete.
- A small status strip on the parent board lists active scratch boards across all branches so collaborators can peek at in-progress work without checking out the branch.

## Notes
- Precedent: Figma branches, Obsidian sandbox notes, the Git stash but as a real persisted artifact you can return to.
- Filesystem-as-hierarchy still wins. The `.scratch/` directory makes the relationship discoverable from a plain file browser without any tool.
- Open question: should scratch boards be ignored by default in the published static site build. Default yes, with an opt-in flag in the board frontmatter.
- Pairs naturally with the canvas PR diff view: opening a PR shows main board diff plus the full scratch board contents as appendix.
