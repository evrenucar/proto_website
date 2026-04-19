# Online Whiteboard Save Plan

## Current Direction

This is the **no-backend** plan.

For now, the whiteboard recommendation flow should stay fully static and avoid OAuth, token exchange, or automatic pull request creation.

The backend-assisted GitHub PR architecture has been preserved separately in:

- `online_save_backend_plan.md`

That file is for later work if you decide the better UX is worth adding a tiny serverless endpoint.

## Product Decision

Instead of:

- authenticating visitors with GitHub
- writing commits into forks
- opening or updating draft PRs automatically

the current plan is:

- let people edit the board locally in the browser
- let them export a timestamped `.canvas` file
- let them submit a **recommendation** through GitHub Issues or Discussions
- let them attach the exported recommendation `.canvas.json` file and optional notes

This keeps the website static while still giving visitors a clear path to propose changes.

## Why This Direction Fits

### It works on a static site

The entire flow can live on GitHub Pages with no backend.

No server is needed for:

- editing
- importing
- exporting
- preparing a recommendation link

### It matches moderation reality

Approval is not instant, so calling the action a recommendation is more accurate than "save to GitHub."

### It avoids unsafe auth shortcuts

Skipping the backend means avoiding:

- putting a GitHub client secret in frontend code
- asking users for tokens
- trying to misuse GitHub Actions as a live auth service

### It is a good intermediate step

This gives you a real workflow now, and later you can upgrade to automatic draft PRs without redesigning the board system itself.

## Desired Behavior

1. Any page that hosts a whiteboard should be able to use the same save/export/recommendation flow.
2. Exported downloads should be named like:
   - `board_name_YYYY-MM-DD_HH-mm-ss.canvas`
3. Users should be able to submit a recommendation without understanding git.
4. If a user comes back later, they should be able to continue from their local/exported file and submit an updated recommendation.
5. Recommendations should feel like updates to the same board, not unrelated independent boards.
6. Recommendation issue titles should include a short change summary, capped at about 50 characters.

## Recommended Recommendation Model

Use GitHub **Issues** or **Discussions** as the submission surface.

### Recommended v1

Use **GitHub Issues** first.

Why:

- simple to link to
- easy to prefill title/body
- easy to review
- works well even if you later automate triage with GitHub Actions

### Alternative

Use **GitHub Discussions** if you want a more community-style review flow.

That is also valid, but Issues are easier to standardize and automate later.

## Proposed User Flow

### 1. User edits the board locally

The whiteboard should remain local-first.

This already fits the current implementation well:

- browser editing
- `localStorage` draft persistence
- import/export `.canvas`

### 2. User clicks `Send recommendation`

The site should not try to authenticate with GitHub.

Instead it should:

- ask for a short summary for the issue title
- ask for optional longer details for the issue body
- export the current board state as a recommendation `.canvas.json` file
- generate a prefilled GitHub Issue URL
- instruct the user to attach the exported recommendation `.canvas.json` file

### 3. Prefilled GitHub Issue opens

The new issue should contain:

- board title
- short summary in the title, for example `Recommendation: Braindump (added new notes)`
- page URL
- timestamp
- recommendation guidance
- a request to attach the exported recommendation `.canvas.json` file
- optional note template

Example title:

- `Recommendation: Braindump`

Example labels:

- `recommendation`
- `whiteboard`

### 4. User attaches exported file manually

The user drags the downloaded recommendation `.canvas.json` file into the issue.

This is the one manual step that replaces the backend-powered PR automation.

### 5. Maintainer reviews and merges manually

Review process can be:

1. download attached recommendation `.canvas.json`
2. import into the local whiteboard
3. compare against current board
4. manually merge or replace canonical board file

Later, parts of this can be automated.

The recommendation file contains the same board JSON as a normal export.

- Local import should accept `.canvas.json` directly.
- If someone wants to turn it back into a normal board file outside the site, they can rename it from `.canvas.json` to `.canvas`.

## How To Avoid “Independent New Ones” In Practice

Without backend automation, you cannot truly force one evolving recommendation per GitHub user.

But you can shape the workflow so it behaves that way.

## Recommended issue strategy

For each board, treat one issue as the ongoing recommendation thread.

### Option A: one issue per user per board

Tell the user:

- if they already opened a recommendation issue for this board, update that issue instead of opening a new one

This is the closest equivalent to “add on without creating a new independent one.”

### Option B: one shared issue per board

Create a pinned issue like:

- `Braindump recommendations`

Then users comment there with:

- their note
- attached `.canvas`

This is simpler, but attachments and discussion can become messy if many people participate.

### Recommended choice

Use **one issue per user per board**.

The UI copy should say something like:

- `This opens a GitHub issue for this board. If you already created one before, update that issue instead of opening a new one.`

## Repo File Strategy

## Canonical board file

Keep one stable canonical file per board:

- `content/boards/braindump/current.canvas`

This is already the right shape.

Do not create a new in-repo file for every recommendation.

Git already provides history once maintainers merge accepted changes.

## Exported file naming

Downloads should use:

- `board_name_YYYY-MM-DD_HH-mm-ss.canvas`

This is already part of the current implementation direction and should remain the standard.

## Recommendation attachment naming

Recommendation downloads should use:

- `board_name_YYYY-MM-DD_HH-mm-ss.canvas.json`

That makes two things explicit:

- it is still whiteboard board data
- it is safe to attach to GitHub Issues

To convert it back on a user's computer, they can rename the file back to:

- `board_name_YYYY-MM-DD_HH-mm-ss.canvas`

## Optional archival strategy later

If maintainers want a local archive of accepted recommendation files, add:

- `content/boards/<slug>/history/`

But this should not be required for the static recommendation flow.

## Suggested UI Copy

Use moderation-aware language everywhere.

### Buttons

- `Save locally`
- `Export .canvas`
- `Send recommendation`

### Helper copy

- `Recommendations are reviewed before they appear on the live board.`
- `A GitHub issue will open. Attach the exported .canvas.json file there.`
- `If you want a normal board file again on your computer, rename it back to .canvas.`
- `If you already submitted a recommendation for this board, update that issue instead of creating a new one.`

### Avoid

- `Publish`
- `Sync to GitHub`
- `Saved to GitHub`

## Repo Changes Needed

## `JavaScript/braindump.js`

Extend the current board-config-driven logic so recommendation actions are board-aware.

Add:

- a `Send recommendation` action
- creation of a prefilled GitHub Issue URL
- optional auto-export of a recommendation `.canvas.json` file before redirect

The recommendation flow should use:

- board slug
- board title
- page URL
- current timestamp

## `scripts/build-site.mjs`

Ensure board pages emit enough metadata for recommendation generation, for example:

- `data-board-slug`
- `data-board-title`
- `data-board-source`
- `data-board-repo-path`
- `data-board-allow-recommendations`

If recommendation configuration is page-specific, emit additional data like:

- `data-github-issue-owner`
- `data-github-issue-repo`
- `data-github-issue-labels`

## `src/site-data.mjs`

Board config should include recommendation metadata, for example:

```js
board: {
  slug: "braindump",
  title: "Braindump",
  pagePath: "braindump.html",
  sourcePath: "content/boards/braindump/current.canvas",
  storageKey: "board:braindump",
  saveEndpoint: "/api/save-board",
  allowRecommendations: true,
  recommendation: {
    type: "issue",
    owner: "evrenucar",
    repo: "proto_website",
    labels: ["recommendation", "whiteboard"]
  }
}
```

## Optional helper script

If the current whiteboard runtime gets too large, split recommendation URL logic into a small helper such as:

- `JavaScript/whiteboard-recommendation.js`

No GitHub auth logic should be present in this version.
The helper should also own:

- short-summary normalization
- title generation with a 50-character summary cap
- recommendation body generation

## Recommendation URL Format

For GitHub Issues, use the standard `issues/new` prefill format.

Example structure:

```text
https://github.com/<owner>/<repo>/issues/new
  ?title=Recommendation%3A%20Braindump%20%28added%20new%20notes%29
  &labels=recommendation,whiteboard
  &body=...
```

Suggested body template:

```md
## Board
Braindump

## Page
https://your-site.example/braindump.html

## Timestamp
2026-04-19 15:42

## Short summary
Added new notes

## Details
Describe your recommendation here.

## Attachment
Please attach the exported recommendation `.canvas.json` file to this issue.

Local import accepts `.canvas.json` directly.
If you want a normal board file again on your computer, rename it back to `.canvas`.

## Notes
- If you already opened a recommendation issue for this board, update that issue instead of creating a new one.
- This recommendation will be reviewed before it appears on the live site.
```

## Recommended Implementation Phases

### Phase 0: Keep current local-first board working

- board config
- canonical board path
- timestamped export naming
- local save/import/export

Deliverable:

- current board remains stable and usable

### Phase 1: Static recommendation MVP

- add recommendation metadata to board config
- add `Send recommendation` button behavior with short-summary and details prompts
- generate prefilled GitHub Issue URL
- encourage file attachment and issue reuse

Deliverable:

- static site can export a board and send users into a reviewable recommendation flow

### Phase 2: Improve maintainer workflow

- issue template for whiteboard recommendations
- labels and triage conventions
- maintainer import/merge checklist for recommendation `.canvas.json` files into canonical `.canvas` board files

Deliverable:

- cleaner review process for incoming `.canvas` files

### Phase 3: Optional GitHub Actions support

Without turning Actions into a backend, they can still help after the issue exists:

- auto-label recommendation issues
- validate attached `.canvas.json` files if automation is added later
- post maintainer guidance comments
- track board-specific recommendation threads

### Phase 4: Optional backend upgrade later

If you later want one-click GitHub-native updates:

- switch to the architecture in `online_save_backend_plan.md`
- keep the same board config model
- replace issue creation with authenticated fork/branch/PR submission

## Final Recommendation

For now, implement the recommendation flow as:

- local-first board editing
- timestamped `.canvas` export
- timestamped recommendation `.canvas.json` export for GitHub Issues
- GitHub Issue creation with prefilled context
- manual file attachment by the user
- maintainer review and import

That keeps the site fully static, avoids unsafe auth shortcuts, and still gives visitors a clear way to propose changes.
