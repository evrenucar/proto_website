# Cosmoboard extraction plan

## Purpose
Whether to split Cosmoboard into its own repository, and exactly how, when the trigger fires.

## Read when
Revisiting the split decision, or executing it.

## Skip when
Doing normal feature work. Nothing here changes day-to-day development.

## Canonical for
The split decision, its trigger conditions, and the extraction steps.

---

## Recommendation

**Do not split yet.** Move the engine into a `cosmoboard/` directory instead, and cut the repo when
one of the triggers below actually fires.

Recorded 2026-07-28. This supports the existing decision in
[`project.md`](./project.md) line 24, "All product exploration happens inside evrenucar.com for now."

## Why, with the numbers

The split has mostly already happened by accident. Measured on 2026-07-28:

| File | Lines | Coupling to the other side |
| --- | --- | --- |
| `JavaScript/braindump.js` | 8104 | **0** references to `site.js`, `site.css`, nav, or sidebar |
| `CSS/braindump.css` | 2628 | standalone stylesheet |
| `JavaScript/site.js` | 717 | 6 references to the board |
| `scripts/build-site.mjs` | 2495 | 235 board-related lines, about 9% |
| `scripts/preview-server.mjs` | 578 | mostly the board's write API already |

The engine is a self-contained runtime that the site happens to load with a script tag. What a
separate repo would add on top of that:

- **Separate issue tracking.** Already solved. Issues carry `cosmoboard`, `whiteboard`, and
  `onboarding` labels, and the board files them itself.
- **Hosting it on other pages.** Already solved. Any page with a `[data-board-app="true"]` element
  and the two asset tags mounts a board.
- **Independent releases.** Not yet meaningful. There is no consumer but this site.

What it would cost:

- **Cross-repo version sync.** The 2026-07-28 review found a cache-bust version that had drifted
  between two files inside one repo. Across two repos the same class of bug arrives attached to a
  submodule, an npm publish, or a copy step.
- **A slower loop.** Change the engine, then get it into a real page before you can see it.
- **Splitting the board page generator.** 235 lines of `build-site.mjs` render board pages. Either
  they move and the site consumes generated output, or they stay and the site keeps engine
  knowledge.

## The history argument, and why it does not apply

The usual reason to split early is that private content gets baked into the git history of what
becomes a public repo. It does not bite here: the personal material lives in `content/boards/`,
which is **data**, not engine. No engine file carries personal content. Extracting the engine paths
later gives clean history whenever you want it. The cost is not compounding, so waiting is cheap.

## Do this now instead: directory boundary

One `git mv` plus path updates. Visible separation, one repo, one build, no version sync, and it
turns a future split into a mechanical extraction.

```
cosmoboard/
  runtime/braindump.js
  runtime/braindump.css
  vendor/fflate.min.js
  server/preview-server.mjs
  build/render-board-page.mjs    # the ~235 board lines out of build-site.mjs
```

The site then references `cosmoboard/runtime/*` and imports `renderBoardPage` from
`cosmoboard/build/`. `content/boards/` stays where it is, because it is your content, not the
product.

Reversible with one `git mv` if it feels wrong.

## Triggers that would change the answer

Split when any one of these is true, not before:

1. Someone other than you needs to install or vendor the engine.
2. You want to ship Cosmoboard standalone, on its own domain, with its own release cadence.
3. The site's build stops being the thing that renders board pages.
4. The engine grows a real dependency tree or a bundler step the site does not want.

## Extraction steps, when a trigger fires

Assumes the directory boundary is already in place, which is what makes this short.

1. `git filter-repo --path cosmoboard/ --path tests/board/ --path tests/preview/` into a fresh repo.
   Clean history, no personal content, because none of those paths hold any.
2. Add a minimal `package.json` with a `build` that emits `dist/cosmoboard.js` and
   `dist/cosmoboard.css`, versioned by content hash rather than a hand-edited `?v=` number. That
   removes the drift class of bug rather than moving it across a repo boundary.
3. Site consumes it as a dependency. Pin an exact version. Do not use a git submodule, it turns
   every clone into a two-step operation for one file.
4. `content/boards/` stays in the site repo. The engine repo carries fixture canvases only.
5. Keep the preview server with the engine. It is the engine's dev server, and the site only needs
   it for local board editing.
6. Move `tests/board/` and `tests/preview/` with the engine. `tests/build/` stays with the site.
7. Move the `cosmoboard` and `whiteboard` labelled issues across, and repoint the board's
   recommendation, feature request, and bug report configs at the new repo.

## Open question to settle before step 1

Where board **content** lives once the engine is public. Today `content/boards/` mixes your personal
notes with the demo boards that the onboarding page needs. Split those first, or the engine repo
ends up needing content it cannot have.
