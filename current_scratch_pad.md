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

- Adding concise GPT performance testing feedback under `.agents/reviews_and_feedback/`.
- Scope is a visual Markdown review file summarizing the latest benchmark consensus.
- Avoid app/runtime changes and do not alter benchmark result artifacts.

### Start Of Session

- Date: 2026-04-29
- Working on: `gpt_performance_testing_feedback_<timestamp>.md`.
- Why now: User asked to save the performance findings as a concise visual feedback file.
- Known constraints: Target `.agents/reviews_and_feedback/`; main recommendations/issues must be at the top; keep it to the point with graphs and tables.

### End Of Session

- Date: 2026-04-29
- What changed:
  - Added `.agents/reviews_and_feedback/gpt_performance_testing_feedback_20260429_134703.md`.
  - Feedback starts with main recommendations/issues, then concise consensus, metric table, and Mermaid visuals.
  - Verified the file path and required sections/visual blocks with `Test-Path` and `Select-String`.
- What still needs work:
  - No follow-up needed for this documentation artifact.
- Next step:
  - Use the feedback file as the short performance-review summary before any import/render optimization work.
