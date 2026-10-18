import test from "node:test";
import assert from "node:assert/strict";
import { JAM_REPORTS, buildJamReportRows } from "../src/features/production-line/report-center/jamReportDefinitions.js";
import { buildCenterReportModel } from "../src/features/production-line/report-center/reportDefinitions.js";

test("jam center preserves receipt chunks, issue grouping, movement subtotals and prison columns", () => {
  const receipt = { productCode: "WIP-1", productName: "ขนม", lotNo: "LOT-1", movementAt: "2026-10-01T08:00:00+07:00", quantityIn: 1, weightInKg: 2, status: "ready" };
  const inbound = buildJamReportRows("jam-inbound", { rows: Array.from({ length: 21 }, (_, index) => ({ ...receipt, barcode: String(index) })) });
  assert.deepEqual(inbound.rows.map((row) => row._kind || row.quantity), ["group", 20, 1, "subtotal"]);
  assert.equal(inbound.totalRow.weightKg, 42);
  const details = buildCenterReportModel("jam-fg-detail", { rows: [receipt] });
  assert.equal(details.definition.columns.length, 11);
  assert.equal(details.rows[1].productName, "ขนม");
  const issue = buildJamReportRows("jam-issue", { rows: [
    { ...receipt, kind: "issue", quantityOut: 1, weightOutKg: 3, fgProductCode: "FG-1", fgProductName: "สำเร็จ" },
    { ...receipt, kind: "issue", lotNo: "LOT-2", quantityOut: 2, weightOutKg: 4, fgProductCode: "FG-1", fgProductName: "สำเร็จ" },
    { ...receipt, kind: "issue_void", quantityIn: 1, weightInKg: 3 },
  ] });
  assert.equal(issue.rows.length, 1);
  assert.equal(issue.rows[0].lotWeightsText, "LOT-1 · 3 | LOT-2 · 4");
  assert.equal(issue.totalRow.quantity, 3);
  const movement = buildJamReportRows("jam-movement", { rows: [
    { ...receipt, reportDate: "2026-10-02", inboundQty: 2, inboundWeightKg: 4 },
    { ...receipt, reportDate: "2026-10-01", inboundQty: 1, inboundWeightKg: 2 },
  ] });
  assert.deepEqual(movement.rows.map((row) => row._kind || row.reportDate), ["group", "2026-10-01", "group", "2026-10-02", "subtotal"]);
  assert.equal(movement.rows.at(-1).inboundWeightKg, 6);
  const balance = buildJamReportRows("jam-prison-balance", { rows: [{ ...receipt, balanceQty: 2, balanceWeightKg: 4 }] });
  assert.equal(balance.rows.at(-1).balanceQty, 2);
  assert.equal(balance.totalRow.balanceWeightKg, 4);
  assert.equal(JAM_REPORTS["jam-prison-in"].columns.length, 10);
  assert.deepEqual(JAM_REPORTS["jam-prison-out"].columns.map((col) => col.label), ["#", "วันเวลาเบิก", "บาร์โค้ดป้าย", "สินค้า WIP", "LOT", "สินค้า FG ที่ผลิต", "น้ำหนักเบิก", "หมายเหตุ"]);
  for (const definition of Object.values(JAM_REPORTS)) assert.ok(Math.abs(definition.columns.reduce((total, col) => total + parseFloat(col.width), 0) - 100) < 0.01);
});
