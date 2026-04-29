# Current Scratch Pad

This file is the shared short-term work log for the current session.



## SCRATCH PAD (FAST NOTES BUGS AND TODOS)

- [BUG] When you CTRL+A inside a markdown window when there is no text and delete. THe active edit bar with the blue opacity disappears. All edits default to preview version. ANd even if you save it then refresh all changes disappear but the regular markdown editing is back after refresh
- [BUG] When you are sending feature request, bug reporting or rending recommendation the text can overflow. Fix this! (example: ![alt text](image.png))
- [FEATURE_REQUEST] Inline image pasting inside markdown files.
- [FEATURE_REQUEST] Markdown file download button. Just saves the markdown. On the left of the fullscreen button. Switches to the left when markdown files are made fullscreen. If markdown file contains external links like images and canvasses it will export as a 
- [IDEA] Should .md and .canvas files have an ID? So even if name is updated the file can just be restored or updated with a new file being imported. That is unique to creation and who it is created by etc. It can be stamped per user and browser as well. Not sure if this is okay from a privacy side.

## Archieved_scratch_pad_items(completed or discarded)
- [completed] [FEATURE_REQUEST] Importing files and images via drag and drop doesnt't work only works for markdown files for now



## How To Use It

- Read this at the start of a work session to understand the current scope.
- Update it at the start of a work session with what is being worked on now.
- Update it again at the end of a work session with what changed, what is blocked, and what is next.
- Keep it focused on current work only. Move long-term or stable guidance into other docs.
- The user can write here too.

## Session Update Template

### Start Of Session

- Date:
- Working on:
- Why now:
- Known constraints:

### End Of Session

- Date:
- What changed:
- What still needs work:
- Next step:

## Current Scope

- Creating a core board review under `reviews_and_feedback/gpt_review_<timestamp>.md`.
- Scope is performance, functionality, product vision alignment, and code cleanliness for the current board runtime.
- Skipping brainstorming, backlog, handoff, archive, and planning-management docs except required session context.

### Start Of Session

- Date: 2026-04-29
- Working on: Core board review document with diagrams and tables.
- Why now: User asked for a complete review of the current board, focused on core implementation rather than planning docs.
- Known constraints: Do not change board runtime behavior; keep code/content files untouched except scratch pad and the new review document.

### End Of Session

- Date: 2026-04-29
- What changed:
  - Created `reviews_and_feedback/gpt_review_20260429_032501.md`.
  - Review covers performance, functionality, product vision alignment, and code cleanliness for the board core.
  - Included Mermaid diagrams, finding matrices, test results, and a prioritized roadmap.
  - Ran targeted verification; several board/export/preview/feature tests currently fail and are documented in the review.
  - Cleaned up test-generated tracked output changes and a temporary markdown note; remaining dirty files match pre-existing work plus this scratch pad and review file.
- What still needs work:
  - Fix red test paths called out in the review, especially export modal `.canvas`, markdown save path, recommendation source version, board previews, bundle E2E, markdown authoring, shared entities, and YouTube nocookie.
- Next step:
  - Pick the first P0 item from the review and implement it with a focused regression test.

### Start Of Session

- Date: 2026-04-29
- Working on: Checking current login/auth state visible from this environment.
- Why now: User asked whether they are logged in.
- Known constraints: "Logged in" is ambiguous, so verify concrete local indicators before answering.

### End Of Session

- Date: 2026-04-28
- What changed:
  - **New endpoint** `/api/save-asset` in `scripts/preview-server.mjs` — accepts raw-binary POST (`?slug=&filename=`), streams chunks to disk, allowlists `.png/.jpg/.jpeg/.gif/.webp/.svg/.pdf/.txt`, 200MB cap, collision-safe filenames. MIME types extended to cover `.pdf/.gif/.webp/.jpeg`.
  - **Drop handler** in `JavaScript/braindump.js` (`attachMarkdownDropHandler`) now classifies by extension and routes to:
    - `.md` → existing markdown save + markdown node
    - images → `/api/save-asset` then image node (auto-sized)
    - `.pdf` → `/api/save-asset` then live-embed link node (iframe), URL stored absolute via `location.origin`
    - `.txt` → text node with content inline (no upload)
  - Unsupported drops now show a clear toast instead of letting the browser navigate to the file.
  - Window-level dragover/drop guards prevent the browser from opening dropped files outside the viewport.
  - **Drop UX**: 3px dashed teal outline (`bd-md-drop-target`) plus a centered overlay card "Drop to add to board / Markdown · Images · PDF · Text" (`bd-drop-overlay`). Both shown during dragover.
  - **`renderLinkNode`** hostname extraction now passes `location.origin` as a base so relative URLs (e.g. local PDF paths) don't throw.
  - User-verified end-to-end with `Participant information.pdf` (118KB) on cosmoboard via http://127.0.0.1:4173.
  - Active todo line in `.agents/active_todo.md` flipped to `[x]`.
- What still needs work:
  - PDF iframe falls back to opening the raw PDF in browser. A richer file card (Phase 6A in `cosmoboard_implementation_plan.md`) is still open work.
  - Bundle export does not yet round-trip dropped images/PDFs as portable sidecars (markdown sidecars are persisted; assets are not).
- Next step:
  - User reviews and commits when ready.
