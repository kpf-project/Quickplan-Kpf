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

test("historical ERP mappings are displayed but never reused for re-export", () => {
  const rows = [
    { claim_grain: "daily", document_no: "X6909/0586", metadata: { externalHistoricalMapping: true } },
  ];
  assert.equal(buildExistingDocumentNumberMap(rows, (value) => JSON.stringify(value)).size, 0);

  const previewRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/preview/route.js", import.meta.url), "utf8");
  assert.match(previewRoute, /const dailyDocumentNoMap = new Map\(\)/);
  assert.match(previewRoute, /dailyDocumentNoMap\.get\(key\) \|\| new Set\(\)/);
  assert.match(previewRoute, /Array\.from\(dailyDocumentNos\)/);
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

test("group item keys distinguish separate documents in the same export batch", () => {
  const source = readFileSync(new URL("../src/app/api/production-planning/requisition/confirm-daily/route.js", import.meta.url), "utf8");
  assert.match(source, /`daily_preview\|\$\{doc\.roomId \|\| "ALL"\}\|\$\{doc\.shiftCode \|\| "ALL"\}`,[\s\S]*groupId,[\s\S]*batchInsert\.data\.id/);
  assert.match(source, /if \(groupItemsError\)[\s\S]*production_requisition_group_batches[\s\S]*production_requisition_export_batches[\s\S]*throw groupItemsError/);
});

test("daily export includes preview drafts added to a date without source demand", () => {
  const source = readFileSync(new URL("../src/app/api/production-planning/requisition/confirm-daily/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const dailyItems = items\.filter\(\(item\) => item\.workDate === selectedDate\)/);
  assert.match(source, /const selectedQty = roundQty\(line\?\.qtyByDate\?\.\[selectedDate\]\)/);
  assert.match(source, /qtyByDate: \{ \[selectedDate\]: selectedQty \}/);
});

test("preview LOT choices are persisted and sent unchanged to export", () => {
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  const draftRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/draft/route.js", import.meta.url), "utf8");
  const exportRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/confirm-daily/route.js", import.meta.url), "utf8");
  const reservationRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/lot-reservations/route.js", import.meta.url), "utf8");
  const lotAllocator = readFileSync(new URL("../src/lib/requisitionLotExport.js", import.meta.url), "utf8");
  assert.match(client, /lotAllocationsByDate/);
  assert.match(client, /lotAllocationOverrides/);
  const lotDialog = readFileSync(new URL("../src/features/production-planning/components/RequisitionLotDialog.js", import.meta.url), "utf8");
  assert.match(lotDialog, /ใบอื่นจองแล้ว/);
  assert.match(client, /syncLotReservations/);
  assert.match(lotAllocator, /reservedQty/);
  assert.match(client, /!hiddenDocKeys\.includes\(doc\.documentKey\) && hasAssignedRoom\(doc\)/);
  assert.match(client, /getLotRequirementRefs\(line, column\)/);
  assert.doesNotMatch(client, /firstEditableColumn/);
  assert.doesNotMatch(client, /<col style=\{\{ width: "60px" \}\} \/>/);
  assert.match(client, /สถานะ LOT/);
  assert.match(draftRoute, /normalizeLotAllocationsByDate/);
  assert.match(exportRoute, /allocationOverridesByKey: lotAllocationOverrides/);
  assert.match(exportRoute, /lotReservationKeys/);
  assert.match(exportRoute, /production_requisition_lot_reservations/);
  assert.match(reservationRoute, /replace_requisition_lot_reservations/);
  assert.match(exportRoute, /lotAllocationKey:/);
  assert.equal((exportRoute.match(/hasAssignedRoom\(doc\) &&/g) || []).length, 2);
});

test("large exports release LOT reservations in URI-safe chunks", () => {
  const exportRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/confirm-daily/route.js", import.meta.url), "utf8");
  assert.match(
    exportRoute,
    /fetchSupabaseRowsByChunks\(\s*lotReservationKeys,[\s\S]*?\.delete\(\)[\s\S]*?\.in\("reservation_key", chunk\)/
  );
  assert.doesNotMatch(exportRoute, /\.in\("reservation_key", lotReservationKeys\)/);
});

test("preview restores saved export LOT snapshots before ERP sync", () => {
  const previewRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/preview/route.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  assert.match(previewRoute, /production_requisition_export_lines/);
  assert.match(previewRoute, /exportedLotsByDate/);
  assert.match(client, /exportedLotsByDate/);
  assert.match(client, /Export แล้ว/);
});

test("editing quantity invalidates the old LOT preview immediately", () => {
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  assert.match(client, /delete nextPreview\[buildLotRequirementKey\(docKey, referenceLine, dateValue\)\]/);
});

test("confirming a LOT updates the visible preview before the server refresh", () => {
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  assert.match(client, /setLotPreviewByKey\(\(current\) => applyConfirmedLotAllocations\(current, updates\)\)/);
});

test("exported dates do not reserve current LOT stock again", () => {
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  const lotPreviewRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/lot-preview/route.js", import.meta.url), "utf8");
  assert.match(client, /\.filter\(\(\[dateValue, qty\]\) => toNumber\(qty\) > 0 && doc\?\.exportedByDate\?\.\[dateValue\] !== true\)/);
  assert.match(client, /isColumnExported\(column\) \? \[\] : getLotRequirementRefs/);
  assert.match(client, /line\?\.erpLotsByDate\?\.\[column\.dateValue\][\s\S]*line\?\.exportedLotsByDate\?\.\[column\.dateValue\]/);
  assert.match(lotPreviewRoute, /reserveAcrossRows:\s*false/);
});

test("exported LOT history remains visible while a later date is allocating LOT", () => {
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  assert.match(client, /const savedLotRows = collectSavedLotRows\(line\)/);
  assert.match(client, /erpRows\.length \? erpRows : exportedRows/);
  assert.doesNotMatch(client, /allRequirements\.length > 0 \? \[\] : \(erpLotRows\.length > 0 \? erpLotRows : exportedLotRows\)/);
});

test("saved export LOT rows attach to the matching material when a document number has repeated slots", () => {
  const previewRoute = readFileSync(new URL("../src/app/api/production-planning/requisition/preview/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(previewRoute, /slots\.length !== 1/);
  assert.match(previewRoute, /slots\.find\(\(item\) =>/);
});

test("LOT preview distinguishes partial, unavailable, and request errors", () => {
  const client = readFileSync(new URL("../src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", import.meta.url), "utf8");
  assert.match(client, /มี LOT บางส่วน/);
  assert.match(client, /ไม่มี LOT พร้อมใช้/);
  assert.match(client, /โหลด LOT ไม่สำเร็จ/);
  assert.doesNotMatch(client, />ต้องจัด LOT</);
});

test("LOT preview batches trade-code lookups and tolerates stale saved LOT choices", () => {
  const allocator = readFileSync(new URL("../src/lib/requisitionLotExport.js", import.meta.url), "utf8");
  assert.match(allocator, /goodsCodes: uniqueCodes\.join\(","\)/);
  assert.match(allocator, /skuCodes: parentCodes\.join\(","\)/);
  assert.doesNotMatch(allocator, /Promise\.all\(chunk\.map\(async \(code\)/);
  assert.match(allocator, /if \(allowPartialStock\)[\s\S]*manualShortageBaseQty = roundQty\(manualShortageBaseQty \+ overrideBaseQty\)/);
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

test("LOT reservations are private, transactional, and checked against current stock", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261002043600_add_requisition_lot_reservations.sql", import.meta.url), "utf8");
  assert.match(sql, /production_requisition_lot_reservations/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /reserved_base_qty > stock\.available_base_qty/);
  assert.match(sql, /revoke all on public\.production_requisition_lot_reservations from authenticated/);
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
