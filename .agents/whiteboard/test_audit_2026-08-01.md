# Test audit, 2026-08-01: what our suites prove and what they only appear to

Agent opus5-25. Card: *"Tests should assert outcomes, not mechanisms."*

Scope: the 46 suites tracked in git under `tests/` before today's wave. The files agents
opus5-9 to opus5-24 created today (`pin-move-and-snap`, `pen-and-eraser-tools`,
`canvas-tool-and-rename`, `toolbar-dock-position`, `markdown-base64-embedding`,
`tracker-scroll-and-ids`, `perf-benchmark-suite`, `mobile-diagnostics-harness`, `tests/cli/`,
`tests/perf/`) were out of scope and are not judged here.

**Ranked by risk, not by count.** A mechanism assertion only matters if the feature behind it
can break while the suite stays green. Where a mechanism assertion sits next to a real outcome
assertion, that is said and the finding is dropped.

Everything in the "proved" section was measured: the feature was deliberately broken in a full
mirror of the tree at `.tmp/scratch/opus5-25/mirror/`, the suite was run against the break, and
the exit code recorded. Nothing on disk in the repo was touched to do it.

---

## The headline: the audit found a live bug, not just a weak test

**Ctrl+S does not save the board.** On the current, unmodified runtime:

| browser shape | POSTs to `/api/save-board` after Ctrl+S | what happens instead |
| --- | --- | --- |
| File System Access API present (Chrome, Edge) | **0** | a native Save-As dialog opens; nothing is saved |
| API absent (Firefox, Safari) | **0** | a file downloads: `cosmoboard_2026-08-01_12-46-19.canvas` |

`braindump.js:4729` routes Ctrl+S to `saveLocalFile()`, which with no prior file handle falls
through to `saveLocalFileAs()`, which either opens the picker or, in the fallback branch, calls
`exportCanvas()`. The toolbar button next to it carries `aria-label="Save Board (Ctrl+S)"` and
calls `saveBoard()`.

Two suites are supposed to be holding this down, and both are green:

- **`tests/board/board-save-export-runtime.test.mjs`** asserts
  `/\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "s" && !e\.shiftKey\)[\s\S]*saveBoard\(\)/`
  with the comment *"Ctrl/Cmd+S should use the same board save path as the toolbar save button"*.
  The `[\s\S]*` is greedy and unbounded, so it matches a `saveBoard()` roughly 800 lines further
  down the file. **It would pass no matter what the Ctrl+S handler does.**
- **`tests/board/board-save-reload-e2e.test.mjs`** presses Ctrl+S and waits for a
  `/api/save-board` POST. It never disables autosave. Measured with the whole Ctrl+S branch
  deleted: **0 POSTs within 1.5s of the keypress, 1 POST at 19.4s** from the 20-second autosave
  timer, comfortably inside `waitForResponse`'s 30s default. Its `assert.equal(downloadTriggered,
  false, "Ctrl+S should not download a .canvas file")` — which is precisely the regression that
  shipped — cannot see it, because the suite runs headless Chromium, where the picker opens
  instead of downloading.

So the suite that names the regression in its own assertion message is blind to it for two
independent reasons at once. This is the sharpest example in the tree of the pattern the card is
about, and it is the reason the card was worth more than its `!p3`.

A one-line hunk is proposed in `.tmp/scratch/opus5-25/patch.json`. **It needs the user's
decision**, because "Ctrl+S saves a local file" is a defensible product choice; what is not
defensible is the tooltip, the two suites and the runtime disagreeing.

---

## Proved findings

Each one: break the feature, run the suite, record that it stayed green.

### 1. Bundle export is guarded by five regexes, and nothing clicks the button

`tests/export/export-bundling-runtime.test.mjs` is five `assert.match` calls against the text of
`JavaScript/braindump.js`. `tests/export/export-bundling-e2e.test.mjs` opens the export modal,
screenshots it, clicks **Cancel**, and spends its remaining 250 lines on the *import* half.
`tests/export/export-size-subpages-e2e.test.mjs` only reads the size estimate label.

**Break:** `return;` on the line after `exportProjectBundle`'s `closeExportModal()`. The button
now shows a "Bundling project..." toast and downloads nothing, ever.

**Result:** all three suites green.

```
export-bundling-runtime     exit=0
export-bundling-e2e         exit=0
export-size-subpages-e2e    exit=0
```

A second, subtler break — rewrite the markdown node's path to a bundle path but never write the
bytes into the zip, so the bundle ships a canvas pointing at a file it does not carry — also left
`export-bundling-runtime` green.

**Why it matters:** the objective is a stranger sending a suggestion through the download /
upload / commit route. The zip is that route.

**Closed by** the new `tests/export/export-bundle-download-e2e.test.mjs` (already in the repo). It
fails on both breaks:

- against the dead export: `page.waitForEvent: Timeout 30000ms exceeded while waiting for event "download"`
- against the dangling reference: `C: board.canvas points at "markdown/bundle-note_notes.md", which is not in the bundle`

### 2. The recommendation download is checked by its filename and nothing else

`tests/features/recommendation-flow-e2e.test.mjs` asserts the download's *name* matches
`/^cosmoboard_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.canvas\.(diff|json)$/`, then checks the GitHub
issue URL in forensic detail. It never opens the file.

**Break:** `delete diff.baseCanvasId;` after `createCanvasDiff`.

**Result:** suite green. Then, driving the exact same downloaded file back through
`#braindump-import`, the board answered:

```
downloaded cosmoboard_2026-08-01_12-34-26.canvas.diff (905 bytes)
has baseCanvasId: false
toasts after re-import: ["Not a valid canvas diff file."]
```

The visitor gets a green flow and an attachment nobody can apply. `applyDiffFlow`
(`braindump.js:10185`) refuses on exactly that missing field.

**Closed by** the replacement in `proposed/tests/features/recommendation-flow-e2e.test.mjs`, which
opens the file, asserts the diff's shape and that the visitor's own edit is in it, and then feeds
it back through the import route. Against the break it fails with
`a diff without baseCanvasId is refused on import, and cannot be applied`.

The old version also left autosave on and `/api/save-board` unblocked while it drove the real
cosmoboard. The replacement blocks both.

### 3. "Older local draft was archived" is checked by looking for that sentence in the source

The runtime keeps an open tab's unsaved work when the committed board moves under it, by copying
the draft to a `board:<slug>:stale:<reason>:<timestamp>` key before clearing the live one. The
only test touching it is one line in `tests/build/cosmoboard-build.test.mjs`:

```js
assert.match(runtimeSource, /Older local draft was archived/);
```

**Break:** delete `localStorage.setItem(archiveKey, rawState)` from `archiveSavedState`, leaving
`clearSavedStateKeys()`. The draft is destroyed while the board still says it was kept.

**Result:** `cosmoboard-build` green. Storage measured side by side:

```
BROKEN : { "archiveKeys": [], "recoverable": false }
INTACT : { "archiveKeys": ["board:test-board:stale:identity:1785580652932"], "recoverable": true }
```

**Why it matters:** "the runtime must not lose markdown" is one of the two gates on release. This
is the same class of loss, one layer up.

**Closed by** the new `proposed/tests/board/local-draft-archive-e2e.test.mjs`. Passes intact;
against the break it fails with `B: exactly one archive of the draft must survive, got []`.

### 4. Ctrl+S — covered above, and proved with a timing probe

Measured twice: the false green (19.4s autosave), and what the key really does in both browser
shapes. The replacement in `proposed/tests/board/board-save-reload-e2e.test.mjs` fails on today's
runtime and passes the moment the one-line hunk in `patch.json` is applied.

---

## Fossils: assertions that cannot fail for the right reason

These carry little false-green risk, because the behaviour is covered elsewhere. They cost false
reds and reader-hours, and they make the suite count look better than the coverage is.

- **`tests/board/board-shift-snap-runtime.test.mjs`** — 17 regexes over `braindump.js`. Every
  behaviour it names is asserted for real by `board-shift-snap-stroke-e2e` (paths, angles,
  tolerance window, two segments per stroke) and `board-shift-snap-no-history-spam` (one stroke,
  one undo, across 40 Shift-held moves). It has already gone red once from an unrelated feature
  registering a handler above the one it scrapes for. **Delete it.**
- **`tests/board/vnc-node.test.mjs` case G** —
  `assert.equal(await page.evaluate(() => typeof window.__vncLeak), "undefined")`, labelled
  "nothing should have been left behind". `__vncLeak` does not appear anywhere in
  `JavaScript/braindump.js`; it is a variable nobody writes, asserted to be undefined. It cannot
  fail. The rest of that suite is among the best in the tree — it drives real RFB and reads a
  pixel back off the canvas — so this one line is the only blemish.
- **`tests/board/board-save-export-runtime.test.mjs`** — six regexes. Beyond the vacuous Ctrl+S
  one already covered, the deep-clone-on-serialize check
  (`nodes.map((node) => JSON.parse(JSON.stringify(...)))`) is the only guard on "exporting must
  not rewrite the live board", and it guards the *spelling* of the fix, not the property.
- **`tests/board/resize-handle-clipping.test.mjs`** — every assertion is a computed style or a
  bounding box: `overflow: visible`, `overflow: hidden`, `border-radius !== "0px"`,
  `display: block`, handle rect past the corner. The thing it exists for, "so it's grabbable", is
  proved elsewhere: `node-size-and-overflow` drags the handle and asserts the drawn box changed,
  and `test-board-basics` case E does the same and undoes it. Low risk, high false-red surface:
  any CSS refactor that keeps the affordance can turn it red.
- **`tests/board/markdown-drag-and-title.test.mjs`** — asserts `flex-grow: 0`, `flex-shrink: 1`,
  `flex-basis: auto` on the title, for the stated reason "so empty header space stays draggable".
  Nothing then drags by the empty header space; case 2 drags from `.bd-markdown-body`. The proxy
  and the outcome are not connected.
- **`tests/board/toolbar-autohide-and-lock.test.mjs` case J** — computes a "76x48px tap target"
  from `getComputedStyle(tab, "::before")` offsets and never taps inside it. I set
  `pointer-events: none` on that pseudo-element and the case stayed green, printing
  `J: visible tab 44x16px, tap target 76x48px`. **But** I then tapped 8px above the visible tab in
  both builds and the toolbar revealed either way: the shell reveals on pointer entry, so the
  expansion is redundant and the real risk is a false red if anyone removes it. Downgraded on the
  evidence rather than reported as a hole.

## Checked and found sound

Worth recording so the next pass does not re-audit them.

- **`markdown-wheel-zoom`** — the outcome twin written after the known regression. Asserts the
  camera transform changed, both directions, and that a selected note scrolls its own text
  instead. Exactly right.
- **`overlay-wheel-scroll`** — asserts the panel's `scrollTop` moved *and* the camera did not.
- **`shift-constrained-drag`** — nine cases, all on measured node positions with deliberately
  off-axis input so a coincidentally straight cursor cannot pass. Case D distinguishes which
  anchor the code used by the position it produces. Model work.
- **`alt-drag-copy-undo`** — DOM positions and the serialized model both asserted, so a fix that
  repaired the DOM and left orphans in `nodes` would still fail.
- **`node-size-and-overflow`** — 3 node types x 5 sizes, measuring spill against every clipping
  ancestor. Two general invariants rather than the two reported symptoms.
- **`pin-to-viewport`** — case L stamps the embed's `contentWindow` and checks the same element
  with the same marker survives pin, pan, zoom and unpin. That is the only honest way to prove an
  iframe was not re-parented.
- **`youtube-url-and-resume`** — case G reads the playhead back out of the *local save*, not off
  the DOM iframe, so it proves the number reached the model and survived serialization.
- **`mobile-pinch-zoom`** — the comment on `freshBoard()` records that the first version could not
  fail, and says why. That is the discipline this card is asking for, written down by the author.
- **`markdown-caret-offset-mapping`**, **`perf-budget`**, **`vnc-node`** (apart from case G),
  **`preview-todo-update-endpoint`**, **`preview-save-endpoint`**, **`preview-frame-check-endpoint`**,
  **`extract-assets`**, **`toolbar-panel-viewport-fit-e2e`** — all assert artefacts, files, pixels
  or measured geometry.
- **`markdown-wheel-routing`** — the card's own example. Still asserts `reachedViewport`, but
  `markdown-wheel-zoom` now sits beside it asserting the camera. Leave it; it is the cheap check
  and the expensive one is present. Its one remaining gap is that the fullscreen block asserts
  `overflow-y: auto` and `defaultPrevented` without ever scrolling the fullscreen body. Same shape
  as the `markdown-base64-embedding` fullscreen miss found today.
- **`esc-deselect`** — looks like a class-toggle test, and is not: the runtime's selection model
  *is* `.bd-item.selected`, queried directly at six sites. Its real weakness is that it fabricates
  selection with `classList.add` instead of clicking, so it cannot catch a break in the path from
  a click to a selection. Low risk, since `test-board-basics` and `shift-constrained-drag` both
  click to select.
- **`cosmoboard-initial-layout`** — pins a fixed camera in the test on purpose. Correct, and the
  reason is written in the file.

## Test-infrastructure findings

Not about outcomes, but they cause failures nobody can read.

- **Port collisions.** Four pairs of suites bind the same port: 4205
  (`resize-handle-clipping` / `preview-todo-update-endpoint`), 4214 (`alt-key-menu-suppression` /
  `preview-frame-check-endpoint`'s mock upstream), and, from suites added today, 4193
  (`theme-reset-and-pen-colour` / `preview-save-endpoint`) and 4196 (`touch-gesture-parity` /
  `export-size-subpages-e2e`). Run either pair concurrently and you get `EADDRINUSE`, or worse, a
  suite talking to the wrong server. Ports 4189–4192, 4204, 4206, 4209, 4215, 4217, 4219–4223,
  4225, 4227, 4230, 4234–4236, 4238–4240, 4243, 4245, 4248 are free as of this write.
- **Autosave left on.** `board-save-reload-e2e`, `recommendation-flow-e2e`,
  `board-url-paste-preview-e2e` and `export-size-subpages-e2e` all drive a real board with
  autosave enabled and `/api/save-board` unblocked. The first two back up and restore the canvas;
  the last two do not. This is the failure mode the concurrency rules exist to prevent.

## The rule this suggests, for whoever writes the next test

Every one of the four proved findings has the same shape: **the test observed the machinery and
not the artefact.** A regex saw the source, a listener saw an event, a download event saw a
filename, a build test saw a string.

The check that catches all four is one question asked before the assertion is written:

> If I delete the body of the function this is about and leave its name and its strings alone,
> does this test go red?

For `export-bundling-runtime`, `board-save-export-runtime`, the `Older local draft was archived`
line and `recommendation-flow-e2e`, the answer was no. It costs about four minutes to check, in a
mirror of the tree, and it is the only check that would have caught the markdown zoom regression
too.

---

## Where the work is

- Report: this file.
- New suite, already in the repo: `tests/export/export-bundle-download-e2e.test.mjs`.
- Proposed replacements and one new file: `.tmp/scratch/opus5-25/proposed/`, with
  `manifest.json`.
- The one runtime hunk, which needs the user: `.tmp/scratch/opus5-25/patch.json`.
- Reproduction notes and the exact breaks: `.tmp/scratch/opus5-25/notes.md`.
