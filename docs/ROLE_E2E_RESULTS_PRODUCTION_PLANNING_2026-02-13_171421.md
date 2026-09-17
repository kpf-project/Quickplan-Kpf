# Role E2E Results (Manager / Editor / Viewer)

Generated at: 2026-02-13T10:14:21.412Z
App base URL: http://localhost:3000

## Summary
- Overall: FAIL
- Checks: 0

## Role Checks
| Role | Action | HTTP Status | Result | Error |
|---|---|---|---|---|
| - | - | - | BLOCKED | Missing EDITOR_TOKEN/VIEWER_TOKEN |

## Notes
- PASS criteria: manager/editor must not receive 403, viewer must receive 403 on write action
