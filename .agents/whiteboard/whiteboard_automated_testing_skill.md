# Whiteboard Automated Testing Skill

## Purpose

- Project-specific skill path: `.agents/skills/whiteboard-automated-testing-skill/`
- Use this skill whenever Braindump work needs browser verification on desktop or mobile.
- The skill is focused on repeatable interaction checks, screenshot evidence, and archived test logs.

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

- Take screenshots that prove the intended behavior.
- Log pass and fail results in a dated folder under `previous-tests/`.
- Reset Braindump localStorage before test runs so old boards do not contaminate the result.
