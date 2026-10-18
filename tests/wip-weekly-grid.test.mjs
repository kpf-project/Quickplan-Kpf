import test from "node:test";
import assert from "node:assert/strict";
import { groupWeeklyDraftLines, planningDates } from "../src/features/production-planning/services/wipWeeklyGrid.js";

test("weekly projection preserves duplicate records, shifts and unit snapshots", () => {
  const lines = [
    { id: "a", skuCode: "WIP-1", shiftId: "s1", planningUnit: "ถุง", workDate: "2026-10-19", plannedQty: "22" },
    { id: "b", skuCode: "WIP-1", shiftId: "s1", planningUnit: "ถุง", workDate: "2026-10-20", plannedQty: "8" },
    { id: "c", skuCode: "WIP-1", shiftId: "s1", planningUnit: "ถุง", workDate: "2026-10-19", plannedQty: "3" },
    { id: "d", skuCode: "WIP-1", shiftId: "s2", planningUnit: "ถุง", workDate: "2026-10-19", plannedQty: "4" },
    { id: "e", skuCode: "WIP-1", shiftId: "s1", planningUnit: "กก.", workDate: "2026-10-19", plannedQty: "5" },
    { id: "f", skuCode: "", workDate: "2026-10-19" },
    { id: "g", skuCode: "", workDate: "2026-10-20" },
  ];
  const rows = groupWeeklyDraftLines(lines);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0].lines.map(line => line.id), ["a", "b"]);
  assert.equal(rows[1].lines[0].id, "c");
  assert.equal(rows.flatMap(row => row.lines).length, lines.length);
  assert.deepEqual(rows.flatMap(row => row.lines).map(line => line.id).sort(), lines.map(line => line.id).sort());
  assert.equal(lines[0].plannedQty, "22");
});

test("week columns include all existing dates without timezone shift or truncation", () => {
  const dates = planningDates([{ workDate: "2026-10-28" }], { start: "2026-10-19", end: "2026-10-25" });
  assert.equal(dates[0], "2026-10-19");
  assert.equal(dates.at(-1), "2026-10-28");
  assert.equal(dates.length, 10);
  assert.deepEqual(planningDates([{ workDate: "invalid" }], {}), []);
  assert.deepEqual(planningDates([], { start: "2026-10-19", end: "2026-10-25" }), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
});

test("source sections, workstreams and merge policies never share an editable row", () => {
  const base = { skuCode: "WIP-1", shiftId: "s1", sourceSectionDefId: "room1", workstreamCode: "room1", mergePolicy: "strict_separate" };
  const lines = [
    { ...base, id: "a", workDate: "2026-10-19" },
    { ...base, id: "b", workDate: "2026-10-20", sourceSectionDefId: "room2" },
    { ...base, id: "c", workDate: "2026-10-21", workstreamCode: "room2" },
    { ...base, id: "d", workDate: "2026-10-22", mergePolicy: "other" },
  ];
  assert.equal(groupWeeklyDraftLines(lines).length, 4);
});

