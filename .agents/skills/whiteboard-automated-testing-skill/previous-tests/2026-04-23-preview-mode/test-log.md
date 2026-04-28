# Preview Mode Smoke Test
- Date: 2026-04-23
- Server: http://127.0.0.1:4173

## Results
- braindump desktop: pass
- cosmoboard desktop: fail
- preview mode injection: partial

## Notes
- Braindump: draw tool interaction skipped - locator.boundingBox: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('canvas').first()[22m

- Cosmoboard: board mounted without any rendered items
- Cosmoboard: onboarding content was not found inside board items
- Cosmoboard console errors: Failed to load resource: the server responded with a status of 404 (Not Found)
- Preview mode console errors: Failed to load resource: the server responded with a status of 404 (Not Found)
