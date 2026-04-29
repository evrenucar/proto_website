# Fork and Remix Public Boards

## Problem / Why
A public Cosmoboard is a static page, but right now there is no clean path from "I like this board" to "I have my own copy I can edit". GitHub already has the fork primitive. The board viewer should expose it directly so remixing is a one-click move that keeps attribution intact.

## Sketch
- Public boards declare a `remixable: true` flag and a `source` block in the markdown frontmatter that captures origin repo, path, and commit. The viewer reads this and shows a small "Remix" affordance in the corner.
- Clicking Remix kicks off the GitHub fork flow for the host repo, then deep links into the forked copy at the same board path. For users without GitHub auth, offer a "download as zip" fallback that scaffolds a minimal repo layout.
- Forked boards keep an `origin` ribbon at the top with a back-link to the source. Edits on the fork are clearly the user's own. A "propose back" button opens a PR against the source repo, scoped to just the canvas file plus any markdown it touches.
- Track lineage by appending to a `lineage.json` next to the board on each fork. Renders as a small ancestry tree in the board sidebar so a viewer can see who remixed from whom.
- Honor a `license` field in frontmatter and surface it on every fork prompt so attribution is never accidental.

## Notes
- Precedent: Are.na blocks and channels, CodePen forks, Glitch remix, Observable forks. The shared idea is that a public artifact is also a starting template.
- Static-host friendly. The lineage tree is just a JSON file rendered client side.
- Open question: how to handle deep nesting. A fork should pull the full subtree below the board path by default, with a toggle to fork only the single board file.
- Plays well with the Cosmoboard portfolio framing. Evren's site itself becomes a gallery of remixable boards.
