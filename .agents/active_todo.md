# Active TODOs — Braindump markdown editor

Status legend:
- `[x]` user-confirmed working
- `[A]` agent-confirmed via browser/Playwright test, not yet user-verified
- `[ ]` pending / not started

Last touched: 2026-04-26 / 2026-04-27 (cluster fix + polish session).

---

## [A] Selection state machine cluster
Root cause: `setMarkdownLineRaw` did `lineEl.textContent = raw`, destroying rendered DOM children that the browser's caret pointed into. Fix: capture click coords in `mousedown`, `preventDefault`, switch to raw, then re-place caret via `caretRangeFromPoint` in rAF, with a `_suppressSelectionChange` guard to avoid re-entrancy.
- [A] #1 Caret on line-select stays at end (no snap-to-start)
- [A] #2 Click-to-place caret lands at click point inside markdown text
  - [A] Sub-fix: re-enabled `itemSelected` wheel route (selecting the markdown window enables scroll on hover)
  - [ ] **Code-only (browser session closed; needs user verify):** rendered→raw caret offset mapping for lines with inline markdown. Helpers `computeVisibleOffsetInLine` + `buildVisibleToRawMap` + `visibleToRawOffset` compute the visible text offset BEFORE the raw-swap, then map it through the markdown markers (`**`, `*`, `_`, `` ` ``, `[text](url)`, leading `# / - / > / 1.` prefix) to find the equivalent raw offset. Without this, clicking on a line with `**bold**` would land on the wrong character because raw is longer than visible.
- [A] #4 Wheel over inactive markdown blocks routes through to canvas zoom
  - [A] Sub-fix: pinch-zoom (`ctrlKey` on wheel — how trackpads signal pinch) ALWAYS routes to canvas zoom, regardless of selected/editing state. Without this, pinch over a selected/editing block would page-zoom the whole tab.
  - Test: `tests/markdown-wheel-routing.test.mjs` covers all 6 routing cases (pinch + plain wheel × selected/unselected/editing). Run with `node tests/markdown-wheel-routing.test.mjs`.
- [A] #8 Up/Down arrow between blocks lands caret at end-of-line
- [A] #13 Click inside a note area activates the block + enables scroll in one step
- [A] #17 ESC mirrors click-away (exits edit mode)
  - [A] Sub-fix: ESC also deselects ALL `.bd-item.selected` on the canvas (not just markdown — applies to text/bookmark/base/board-preview/etc). Window-level ESC handler appended after the modal/panel checks; per-markdown handleEscape no longer `stopPropagation`s so the window handler runs after.
  - [A] Sub-fix: ESC also blurs any focused `.bd-text-editor` (text node editor)
  - Test: `tests/esc-deselect.test.mjs` covers 5 cases (editing markdown, selected-only, multi-select, focused text editor, no-op)
- [A] #18 Clicking markdown text selects the host bd-item (`selected` class)
- [A] #19 Click-away in one click — caret + selection + active line all cleared
  - Sub-fix landed after first regression report: also calls `removeAllRanges()` on selections inside the body (contenteditable shows a caret based on selection, not just focus)

## [A] Tab in bullets
- [A] #10 Tab indents bullet by 2 spaces, after Enter and after navigating away
  - Was a downstream symptom of the broken selection state machine; verified working with real Playwright keyboard

## [A] CSS polish
- [A] #3 Overflow gradient ends at `rgba(63, 218, 202, 0.85)` so cyan reads as cyan
- [A] #12 Scrollbar thumb default opacity bumped (always visible while content overflows)
- [A] #15 `ResizeObserver` also observes parent `.bd-item` so the gradient state stays in sync after extend → compact
- [A] #16 Gradient `border-radius: 0 0 7px 7px` removed (parent uses 8px; mismatch caused a visible bottom gap)
- [A] Removed `.bd-markdown-body { overflow-y: hidden !important }` + `.bd-item.selected .bd-markdown-body { overflow-y: auto !important }` — was breaking fullscreen scroll (#6)

## [A] Editor mechanics
- [A] #9 Backspace **and** Delete on full-line selection now drop the line entirely (no merge-upward), via shared `removeActiveLineEntirely` helper
- [A] #11 Multi-line paste renders all pasted lines (not just first n-1) and parks caret on a fresh trailing line below

## [A] Markdown block lifecycle
- [A] #5 Top-right button is now "Open markdown" (was "Open fullscreen"); legacy `.bd-markdown-view-link` CSS removed
- [A] #6 Fullscreen view is editable + scrollable
  - Sub-fix: `renderFullscreenMarkdown` now calls `attachMarkdownEditor`
  - Sub-fix: `closeMarkdownFullscreen` syncs content back to canvas body via `readMarkdownEditorContent` + rebuild
  - Sub-fix: wheel handler short-circuits when there's no `.bd-item` parent (i.e. fullscreen) — always allows native body scroll, suppresses pinch page-zoom
  - Sub-fix: fullscreen body auto-focuses on open via rAF (scroll + typing work without an extra click)
  - Test extension: `tests/markdown-wheel-routing.test.mjs` now also asserts fullscreen editable/scrollable/focused + plain & pinch wheel routing
- [A] #7 "New markdown" toolbar button bypasses the modal panel
  - Sub-fix: spawns at canvas-center with -80px Y lift to clear toolbar
  - Sub-fix: auto-named `note-YYYYMMDD-HHMMSS`
  - Sub-fix: `flushLocalStateSave()` immediately so refresh keeps the node
- [A] #20 Auto-name + double-click rename
  - Sub-fix: `defaultMarkdownTimestampName()` helper
  - Sub-fix: `bindMarkdownTitleRename(titleEl, nodeObj)` swaps span ↔ input on dblclick, commits on Enter/blur, ESC cancels
  - Sub-fix: `committed` guard prevents double-commit when blur fires twice

## [x] Closed without code change
- [x] #14 "Reveal hidden overflow text when block area is too small" — user confirmed existing gradient + scroll affordances are sufficient

---

## Follow-ups scheduled
- Remote agent on **Mon 2026-05-04, 11:00 Europe/Amsterdam** runs a 12-point read-only regression audit of the cluster + lifecycle fixes. Routine: `trig_01E6dLtQgwhkKG3fcRgiw94b` — https://claude.ai/code/routines/trig_01E6dLtQgwhkKG3fcRgiw94b
- ⚠ GitHub not connected for `evrenucar/proto_website` — run `/web-setup` before the routine fires or it'll fail at clone.

## Known unresolved
- None at session end. Promote items from `[A]` → `[x]` as you verify them in normal use.
