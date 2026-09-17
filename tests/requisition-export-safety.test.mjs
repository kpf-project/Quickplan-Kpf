import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildExistingDocumentNumberMap,
  loadExistingRequisitionExportGroups,
} from "../src/lib/requisitionExportSafety.js";

function mock(dataByCall) {
  const calls = [];
  return { calls, from(table) {
    const filters = { table };
    calls.push(filters);
    return {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      in(key, value) { filters[key] = value; return this; },
      async order() { return dataByCall.shift(); },
    };
  } };
}
const options = { masterPlanNo: "MP-1", selectedDate: "2026-09-03", dateFrom: "2026-09-01", dateTo: "2026-09-07", dailyDepartmentIds: ["D1"], weeklyDepartmentIds: ["D2"] };

test("loads prior daily and weekly exports without deleting or blocking them", async () => {
  const db = mock([{ data: [{ document_no: "OLD-D" }] }, { data: [{ document_no: "OLD-W" }] }]);
  assert.equal((await loadExistingRequisitionExportGroups(db, options)).length, 2);
  assert.equal(db.calls[0]["metadata->>selectedDate"], options.selectedDate);
  assert.equal(db.calls[1]["metadata->>dateFrom"], options.dateFrom);
});

test("re-export maps latest group identity back to its original document number", () => {
  const rows = [{ claim_grain: "daily", document_no: "REQ-001", metadata: { ownerDepartmentId: "D1", roomId: "R1", shiftCode: "DAY", selectedDate: "2026-09-03" } }];
  const map = buildExistingDocumentNumberMap(rows, (value) => JSON.stringify(value));
  assert.equal(map.size, 1);
  assert.equal([...map.values()][0], "REQ-001");
});

test("route reuses document numbers and saves current rows through versioned transaction", () => {
  const source = readFileSync(new URL("../src/app/api/production-planning/requisition/confirm-daily/route.js", import.meta.url), "utf8");
  assert.match(source, /buildExistingDocumentNumberMap/);
  assert.match(source, /matchedDocumentNoMap\.get\(key\)/);
  assert.match(source, /rpc\("save_requisition_export_version"/);
  assert.match(source, /existingExportGroups\.length > 0/);
  assert.match(source, /ยังไม่ได้ติดตั้งระบบประวัติ Export/);
  assert.doesNotMatch(source, /assertRequisitionExportIsNew/);
  assert.doesNotMatch(source, /\.from\("production_requisition_exports"\)\s*\.delete\(/);
  assert.match(source, /Failed to clean up requisition groups after export error/);
  assert.equal((source.match(/!excludedDocumentKeys\.includes\(doc\.documentKey\)/g) || []).length, 2);
});

test("daily export includes preview drafts added to a date without source demand", () => {
  const source = readFileSync(new URL("../src/app/api/production-planning/requisition/confirm-daily/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const dailyItems = items\.filter\(\(item\) => item\.workDate === selectedDate\)/);
  assert.match(source, /const selectedQty = roundQty\(line\?\.qtyByDate\?\.\[selectedDate\]\)/);
  assert.match(source, /qtyByDate: \{ \[selectedDate\]: selectedQty \}/);
});

test("migration versions exports, serializes same-document requests, and keeps a current projection", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260904022237_add_requisition_export_versions.sql", import.meta.url), "utf8");
  assert.match(sql, /production_requisition_export_versions/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /legacyBackfill/);
  assert.match(sql, /on conflict \(doc_ref\) do update/);
  assert.match(sql, /delete from public\.production_requisition_export_lines/);
  assert.match(sql, /insert into public\.production_requisition_export_versions[\s\S]*delete from public\.production_requisition_export_lines/);
});

test("hotfix permits legacy and current snapshots in the first re-export batch", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260904023905_allow_legacy_and_current_export_versions_per_batch.sql", import.meta.url), "utf8");
  assert.match(sql, /drop constraint if exists production_requisition_export_versions_batch_doc_unique/);
  assert.match(sql, /export_batch_id, doc_ref, version_no/);
});

test("RPC hotfix targets the surviving document-version unique key", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260904024714_fix_requisition_export_version_conflict_target.sql", import.meta.url), "utf8");
  assert.match(sql, /export_batch_id <> p_export_batch_id/);
  assert.match(sql, /on conflict \(doc_ref, version_no\) do nothing/);
  assert.doesNotMatch(sql, /on conflict \(export_batch_id, doc_ref\)/);
});
