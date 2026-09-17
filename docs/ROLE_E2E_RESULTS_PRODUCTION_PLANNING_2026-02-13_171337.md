# Role E2E Results (Manager / Editor / Viewer)

Generated at: 2026-02-13T10:13:37.026Z
App base URL: http://localhost:3000

## Summary
- Overall: FAIL
- Checks: 0

## Role Checks
| Role | Action | HTTP Status | Result | Error |
|---|---|---|---|---|
| - | - | - | BLOCKED | Missing EDITOR_TOKEN/VIEWER_TOKEN |

## Notes
- PASS criteria: manager/editor ต้องไม่โดน 403, viewer ต้องโดน 403 ใน action เขียนข้อมูล
