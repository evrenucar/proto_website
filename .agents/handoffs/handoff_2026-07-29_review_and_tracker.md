# Handoff: review fixes, board tracker, markdown data loss

Date: 2026-07-29
Branch: `fix-markdown-sidecar-405-error`, in sync with origin, working tree clean.
Started from `a9c1e72`, 20 commits landed.

## Read this first

- Live task state: [`todo.md`](../todo.md). Do not read this handoff for what is open.
- The board at `http://127.0.0.1:4173/tracker.html` is a live view of that file.
- Session log: [`current_scratch_pad.md`](../../current_scratch_pad.md).
- Full review write-up: [`reviews_and_feedback/code_review_20260728_154536.md`](../reviews_and_feedback/code_review_20260728_154536.md).

## Where things stand

Every active suite is green, run one file at a time:

| Suite | Result |
| --- | --- |
| `tests/build/` | 4 / 4 |
| `tests/preview/` | 3 / 3 |
| `tests/features/` | 2 / 2 active, 3 parked as `.pending.mjs` |
| `tests/board/` | 32 / 32 |

Board columns: To do 16, In progress 0, Review 8, Done 7.

**Two questions are waiting on the user** in the board's "Waiting on you" panel, about where the
panel text overflow actually happens. Nothing should be guessed at there until they answer.

## What landed

### Data loss, two separate causes

1. **Preview embeds were writing to the repository.** A read-only preview held a live
   `/api/save-board` endpoint and a running autosave loop, so zooming the landing page rewrote
   `content/boards/onboarding/current.canvas`. Guarded `markBoardDirty`, `startAutosaveLoop` and
   `saveBoard`. Reproduced live before fixing, canvas hash changed on the pre-fix runtime and does
   not on the fixed one.
2. **The build was deleting board content.** `build()` preserved `content/boards` into one shared
   `.build-preserve` dir, `rm -rf`'d all of `content/`, then restored. Two overlapping builds raced
   on that dir. `node --test tests/build/*.test.mjs` reaches it, and it deleted 54 tracked files
   during the review. Now clears only the directories the build owns and never touches
   `content/boards`; the preserve/restore helpers are gone.

### The markdown select-all bug

The editor's model is that every direct child of the body is a `.bd-md-line`. The keydown handler
only ever compared a selection against the *active* line, so a selection spanning several lines fell
through to contenteditable, which merges and drops those divs its own way. The editor then found no
active line, dropped to preview, and the next autosave wrote the damage. That is how
`content/boards/cosmoboard/direction.md` was emptied.

Fixed in `JavaScript/braindump.js`: multi-line Backspace and Delete are handled explicitly, and
`normalizeMarkdownEditor` rebuilds the structure on any input that leaves it malformed, covering
paste, cut and drag-drop.

### Cache busting, permanently

`braindump.js` changed six times while the HTML said `?v=59`, so browsers kept serving a stale
runtime. `?v=` for `braindump.js` and `braindump.css` is now a sha1 of the file, computed in
`scripts/build-site.mjs`. It cannot drift again.

`cosmoboard-landing.html` is hand-maintained and still needs both `?v=` values and
`data-board-source-version` re-copied from the generated `onboarding.html` after a runtime or canvas
change. A comment in the file says so.

### Four gaps the "stale" board tests were actually flagging

- The export modal's "Export .canvas" button had no listener bound. Confirmed dead in the browser.
- Export size estimates trusted `content-length` on HEAD and counted zero when it was absent.
  `fetchResourceSizeBytes` falls back to reading the body.
- `serializeState` handed out live node references, because `stripTransientNodeFields` returns the
  original object when it has nothing to strip. It deep clones now. This is the footgun behind
  export-bundle paths getting frozen into committed canvases.
- Pasting a link to one of this site's board pages now creates a live board-preview.
  `resolveBoardReferenceFromUrl` reads `data-board-index`, which the build had been emitting all
  along while the runtime ignored it.

### Smaller

- `youtube.com/live/<id>` URLs are recognised, they never were.
- Recommendation issues carry the board source version and review framing.
- Wheel zoom ceiling raised 3x to 5x to match touch pinch.
- The unreachable markdown naming dialog is deleted, 98 lines of JS and 61 of CSS.
- `defaultViewport` applies on a first load of the full board, and survives a diff apply.

## The board, and how agents use it

Task tracking went from six markdown files to one. The old files keep a supersede banner so existing
links still resolve.

- `tracker.html` at the repo root, served by the preview server. It fetches `.agents/todo.md` and
  polls every 4s, so editing that file updates an open tab. No build step.
- `tracker-feed.json` is the status strip. Prepend `{ at, agent, text }`. The board sorts by
  timestamp, so order in the file is not load-bearing.
- `tracker-questions.json` holds the status counters and any questions for the user. An empty
  `questions` array hides that panel.
- `/api/add-todo` in `scripts/preview-server.mjs` lets the user file cards from the board. It writes
  only `.agents/todo.md` and only into sections that already exist.

Conventions are in the `todo.md` legend and [`agents.md`](../agents.md): claim a card with `[~]` and
`@your-name`, release to `[A]`, only the user sets `[x]`.

## Traps worth knowing

- **The preview server dies quietly.** Three times in one session it went into a state where it
  answers requests but 404s files that exist. It does not exit, so nothing looks wrong until pages
  break. Kill the `preview-server` node process and `npm run preview` again.
- **Running the app in a browser writes to the repo.** Full board mode autosaves. Testing wrote a
  3.8x camera into the cosmoboard canvas and left stray note files. Set
  `board:<slug>:settings` to `{"autosaveEnabled":false}` in localStorage before driving the board,
  and revert `content/` afterwards.
- **Clearing a board's localStorage from the board page does not work.** Its `beforeunload` handler
  re-saves the draft on the way out. Clear it from another page on the same origin, then navigate.
- **Entering a markdown note takes two clicks.** First selects the node, second focuses the editor.
  This blocked the authoring e2e for a long time.
- **`git add -A` sweeps in test artifacts.** Playwright dumps land in `.playwright-mcp/`, which is
  tracked, and the markdown quick path leaves `note-<stamp>.md` files. Both got committed by
  accident and needed removing.
- **Suites flake when a whole directory runs in parallel**, because concurrent builds write the same
  generated files. Not destructive any more, but run one file at a time for a reliable result.
- **Rebuilding churns unrelated files.** Rendered timestamps follow local time and DST, so a build
  rewrites the project and open-quest pages with meaningless two-hour shifts. Revert those rather
  than committing them.

## Do not trust the review-queue proof blocks

The shared-entity feature sat in the review queue marked done, with a proof line stating the
cosmoboard canvas contains an `entity` node. It does not, and never has in any commit. The
eurocrate project board was likewise recorded as having a 7-node starter canvas; it has zero nodes.
Spot-check anything in that column before marking it `[x]`. There is a warning above it in
`todo.md`.

## Verifying

```
npm run preview                                   # port 4173, owns the write APIs
npm run build                                     # regenerates pages, then revert timestamp churn
node --test tests/board/board-url-paste-preview-e2e.test.mjs   # one file at a time
```

After any `braindump.js` or `braindump.css` change: run the build, then copy the two `?v=` values
from the generated `onboarding.html` into `cosmoboard-landing.html`.

Browser checks go through the board pages at `/cosmoboard.html`, `/onboarding.html`,
`/braindump.html`, and the read-only preview at `/cosmoboard-landing.html`.

## Pick-up points

1. Answer-dependent: the panel text overflow, blocked on the two questions on the board.
2. Caret offset mapping on lines with inline markdown. Code landed, never verified in a browser.
3. The eurocrate project board is empty while being presented as a working project board.
4. Two parked tests, `shared-entity-*.pending.mjs` and `markdown-authoring-e2e.pending.mjs`. Each
   file's header lists what was already ruled out; read it before retrying.
