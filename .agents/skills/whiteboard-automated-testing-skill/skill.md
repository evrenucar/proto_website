---
name: whiteboard-automated-testing-skill
description: Test the Braindump whiteboard on desktop and mobile with repeatable browser checks, screenshot evidence, and archived run logs. Use when whiteboard changes touch pan and zoom, drawing, text notes, selection, drag and resize behavior, toolbar actions, persistence, import and export, recommendation flow, or mobile touch interactions, and when Codex should log results under previous-tests.
---

# Whiteboard Automated Testing Skill

## Overview

Use this skill to run Braindump regression checks in the browser and leave behind evidence that another agent can audit quickly.

- Prioritize screenshots over prose when proving that a fix works.
- Reset local state before each run so results are not polluted by an old board.
- Archive every meaningful run under `previous-tests/<date>-<label>/`.

## Load First

- `agents/whiteboard/whiteboard_issues.md`
- `agents/whiteboard/whiteboard_plan.md`
- `braindump.html`
- `JavaScript/braindump.js`
- `CSS/braindump.css`

## Environment Workflow

### 1. Pick the server mode

- Use `node scripts/preview-server.mjs` for read-only verification.
- Use `node scripts/dev-server.mjs` only when the `Save` flow itself must be verified.
- Do not write test data into `content/boards/braindump/current.canvas` unless the test is intentionally disposable or backed up first.

### 2. Configure the browser MCP

- Primary MCP: `mcp__playwright__`
- Prefer:
  - `browser_run_code` for absolute-path screenshots, custom mobile contexts, and touch event simulation
  - `browser_resize` for simple desktop viewport changes
  - `browser_snapshot` to inspect accessible structure and locate controls
  - `browser_take_screenshot` or Playwright `page.screenshot()` for proof artifacts
  - `browser_console_messages` and `browser_network_requests` for regressions that do not show visually

### 3. Reset test state

- Clear or overwrite:
  - `localStorage["board:braindump"]`
  - `localStorage["braindump-canvas"]`
- Use an empty board or a small test fixture before interaction tests.
- Avoid using the user's persisted local board as a baseline.

### 4. Run the correct reference

- Desktop coverage: [desktop-testing.md](desktop-testing.md)
- Mobile coverage: [mobile-testing.md](mobile-testing.md)

### 5. Archive the run

- Create `previous-tests/<YYYY-MM-DD>-<short-label>/`
- Save:
  - `test-log.md`
  - screenshots that prove passes and failures
  - optional console or network dumps if they explain the result

## Output Requirements

- State the exact server URL used.
- State the viewport or device profile used.
- Mark each interaction as `pass`, `fail`, `blocked`, or `not run`.
- For every failure, include:
  - the observed behavior
  - the expected behavior
  - the likely source file or event path if clear
  - at least one screenshot when the issue is visual or layout-related

## Current Baseline Archive

- Historical baseline: `previous-tests/2026-04-21-baseline-smoke/`
  - desktop text creation and drawing render correctly
  - mobile text creation and drawing render correctly
  - mobile touch drag on an existing item failed before the touch-drag fix
- Fix verification: `previous-tests/2026-04-21-mobile-drag-fix/`
  - mobile text node drag now moves from `160px,230px` to `280px,330px`
  - mobile drawing still works after the drag fix
