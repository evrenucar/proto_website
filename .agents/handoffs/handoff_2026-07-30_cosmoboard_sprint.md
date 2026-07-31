# Handoff 2026-07-30: the Cosmoboard sprint session

One very long session, everything uncommitted in the working tree on branch
`fix-markdown-sidecar-405-error`. Written so a fresh session (or a fresh `/clear`) picks up with
zero context loss. The board is the live state; this file is the map.

## Read first, in order

1. [`../todo.md`](../todo.md), the single live list. Now section has 4 open To dos and a large
   Review column; the Backlog column holds the 16-card roadmap sweep, tagged by work area.
2. [`../review-feedback.json`](../review-feedback.json), the user's verdicts, every session.
3. The tracker at `http://127.0.0.1:4174/.tracker/tracker.html` (`npm run preview` if down).

## What this session built (all in Review unless marked Done by the user)

**Board runtime** (`JavaScript/braindump.js`, `CSS/braindump.css`, all pages rebuilt):
- Interaction relay: one set of window listeners for all node drag/resize (was 10 per node);
  34x lower pointer-move cost, deleted nodes no longer leak.
- Gesture-scoped `will-change`: zoom never stalls, text re-rasters crisp at rest.
- Lazy embeds: iframes activate within 600px of the viewport, unload after 120s offscreen
  (never while a YouTube embed plays). `registerLazyEmbed` near the interaction relay.
- Selection-as-state: MutationObserver-backed Set behind `getSelectedItemElements()`;
  `takeRecords()` drain keeps same-task reads exact.
- One-click entry into markdown notes (movement-free mouseup activates; drag still wins).
- Shift+Arrow extends selection across markdown lines; multi-line delete handles the collapse.
- Underscore emphasis at word boundaries; image lines `![alt](src)`; image paste into notes
  (uploads via save-asset, static hosts get a toast). All three share renderer/caret-map
  lockstep; `matchWholeLineImage` is the shared predicate pattern. Caret probes 72/72.
- Entity node renderer (`renderEntityNode`) + base rows name their backing entity.
- Embed overflow clipped (iframe flex-only sizing; shells clip to node box).
- GitHub sync: settings section (repo/branch/token/enable) in the gear panel; every save
  commits the canvas via the Contents API; works on static hosts; 30s autosync rate limit.
- Static-host detection: `X-Cosmoboard-Server` header + silent HEAD probe; no more 405 noise.
- Developer mode (gear panel): FPS, worst-frame + spike counter, camera, zoom, pointer,
  counts, selection.

**Tracker** (`.tracker/tracker.html`, `scripts/preview-server.mjs`):
- Priority chips 1-5 (`!p<n>` tokens), inline title editing, persistent drafts, card
  timestamps (`.tracker/card-meta.json`), compact mode, wrapping headings, Backlog column
  (`[.]` marker), Done as a collapsed full-width bar, claimed cards sort first, instant more,
  self-version watch ("New version, reload" button via Last-Modified).
- `/api/todo-update` handles status, verdict, note, priority, text edits (guarding marker,
  owner tag, priority token).

**Pages and content:**
- `cosmoboard-landing.html` promoted (nav target, indexed, sitemap) AND generated from
  `src/templates/cosmoboard-landing.template.html`; never edit the output.
- Test board `/content/boards/test-board.html` (sandbox), dev board `/content/boards/dev.html`
  (docs as real markdown nodes + live tracker embed). Both noindex, out of sitemap.
- Maker Faire PDFs deleted; `.playwright-mcp/` untracked and ignored.
- Notion sync hardened (unreadable page falls back to cache with a warning); root cause is the
  Project Box page's public share being off, only the user can re-share.

**Tests and docs:**
- Stage gate: `node tests/board/test-board-basics.test.mjs` (9 cases, run after any board
  change). Caret: `markdown-caret-offset-mapping` (72 probes). Benchmark:
  `node tests/benchmarks/machine-readability.mjs` (89 percent, informational).
- Build lock `tests/helpers/build-lock.mjs`: every build-invoking test takes it; parallel runs
  no longer flake. Export suite 3/3 for the first time (import picker silently ignored zips,
  now routed through openCanvasFlow).
- Standing docs, all linked on the dev board: `whiteboard/performance_analysis_2026-07-30.md`,
  `whiteboard/realtime_collaboration_note.md`,
  `research/vnc_and_iframe_embedding_2026-07-30.md`,
  `research/machine_readability_benchmark.md`, and the **proposed roadmap update** at the end of
  `holistic_planning/holistic_planning.md` (awaiting the user's approve/edit; the old objective
  stands until then).

## Open To dos

None. The final four (zip download with images, alt-drag copy, free-space placement via
`findFreeCanvasPosition`, dev-board showcase plus tracker-footer links) were built and verified
at the end of the session; all are in Review with how-to-check steps. The Backlog column holds
the sixteen tagged roadmap cards; nothing else is open. Next session starts from the user's
verdicts on Review and the proposed roadmap at the end of holistic_planning.md.

## Gotchas that bit this session (do not relearn these)

- **Stale tabs clobber**: any open board tab autosaves its in-memory state over disk changes.
  After changing a canvas on disk, rebuild (source-version re-stamps) AND tell the user to
  reload open tabs. Op-level writes (backlogged, [sync]) is the real fix.
- The user co-edits todo.md and the boards live; re-read before editing, never assume file
  state, leave their `!p` tokens and verdicts alone.
- After changing `scripts/preview-server.mjs`, restart the server (kill port 4174, `npm run
  preview`); static file changes need no restart. Background server handles get externally
  stopped sometimes; check `curl -sI 127.0.0.1:4174` (the `X-Cosmoboard-Server` header proves
  current code) before assuming it is down.
- `npm run build` after touching build scripts, board data, or the runtime; the landing page
  regenerates itself now, no manual hash syncing.
- Reset the sandbox with care: `content/boards/test-board/` is untracked until first commit, so
  git checkout does not work there yet; restore from the canvas's `_rawMarkdown` and notes.md.
- Suites: run with the build lock in place; the export e2e blocks `/api/save-board` and restores
  the cosmoboard canvas, keep it that way.

## State of the tree

Nothing committed this entire session (per the user's workflow, review happens on the board
first). `git status` is large: runtime, tracker, server, tests, docs, generated pages, deleted
PDFs, untracked new boards/helpers/handoffs. The two shipping gates (build does not delete
content, runtime does not lose markdown) are covered by passing tests.
