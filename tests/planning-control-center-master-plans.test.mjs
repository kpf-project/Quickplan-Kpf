import assert from "node:assert/strict";
import test from "node:test";

test("report master-plan dropdown accepts the dedicated options API response", async () => {
  const optionsModule = await import("../src/lib/planningMasterPlanOptions.js").catch(() => ({}));
  assert.equal(typeof optionsModule.normalizePlanningMasterPlanOptions, "function");

  const result = optionsModule.normalizePlanningMasterPlanOptions([
    {
      master_plan_no: "MP202608013",
      period_start: "2026-08-28",
      period_end: "2026-08-28",
    },
    {
      master_plan_no: "MP202608014",
      period_start: "2026-08-29",
      period_end: "2026-08-29",
    },
    {
      master_plan_no: " mp202608013 ",
      period_start: "2026-08-28",
      period_end: "2026-08-30",
    },
  ]);

  assert.deepEqual(result, [
    {
      masterPlanNo: "MP202608014",
      periodStart: "2026-08-29",
      periodEnd: "2026-08-29",
    },
    {
      masterPlanNo: "MP202608013",
      periodStart: "2026-08-28",
      periodEnd: "2026-08-30",
    },
  ]);
});
