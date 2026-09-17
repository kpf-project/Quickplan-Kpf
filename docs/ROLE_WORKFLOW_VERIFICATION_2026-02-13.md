# Role Workflow Verification (Planning API)

Generated at: 2026-02-13T09:52:56.615Z

## Summary
- Total checks: 9
- Pass: 9
- Fail: 0

## Results
| Route | File | Guard | Matched tokens | Status |
|---|---|---|---|---|
| Calculate materials | `src/app/api/production-planning/calculate/route.js` | yes | plan.calculate_own_dept, plan.edit_own_dept, production-line-planning-manage | PASS |
| Master publish | `src/app/api/production-planning/master-publish/route.js` | yes | plan.publish_master, production-line-planning-manage | PASS |
| Replan enqueue | `src/app/api/production-planning/replan/route.js` | yes | plan.approve_exception, production-line-planning-manage | PASS |
| Replan worker | `src/app/api/production-planning/replan/worker/route.js` | yes | plan.approve_exception, production-line-planning-manage | PASS |
| ETA feedback | `src/app/api/production-planning/eta-feedback/route.js` | yes | plan.calculate_own_dept, production-line-planning-manage | PASS |
| Advanced scheduling | `src/app/api/production-planning/scheduling/advanced/route.js` | yes | plan.approve_exception, production-line-planning-manage | PASS |
| Scheduling policies | `src/app/api/production-planning/scheduling/policies/route.js` | yes | plan.approve_exception, production-line-planning-manage | PASS |
| Department capacities | `src/app/api/production-planning/scheduling/capacities/route.js` | yes | plan.approve_exception, production-line-planning-manage | PASS |
| Plan status mutations | `src/app/api/production-planning/status/route.js` | yes | plan.edit_own_dept, plan.calculate_own_dept, production-line-planning-manage | PASS |

## Failures
- None

## Notes
- This is a static guard check on API source files.
- End-to-end user-role verification (manager/editor/viewer) must still be executed in UAT.
