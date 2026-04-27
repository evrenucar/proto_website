# Whiteboard Automated Testing Skill

## Purpose

- Project-specific skill path: `.agents/skills/whiteboard-automated-testing-skill/`
- Use this skill for the final browser verification pass after Braindump or Cosmoboard implementation work is functionally complete.
- Keep the default run minimal and focused on the changed behavior, not broad repeated regression sweeps during implementation.

## What It Contains

- `skill.md`
  - high-level workflow and output rules
- `desktop-testing.md`
  - desktop regression checklist
- `mobile-testing.md`
  - mobile touch and layout checklist
- `previous-tests/`
  - archived runs with `test-log.md` and screenshots

## Test Environment

- Primary MCP: `mcp__playwright__`
- Preferred local server for safe checks: `node scripts/preview-server.mjs`
- Use `node scripts/dev-server.mjs` only when the repository save endpoint itself must be tested.

## Evidence Standard

- Only take screenshots when they materially prove the changed behavior or a visible bug.
- Prefer one final dated log under `previous-tests/` instead of archiving every intermediate debugging run.
- Reset Braindump localStorage before the final run so old boards do not contaminate the result.
