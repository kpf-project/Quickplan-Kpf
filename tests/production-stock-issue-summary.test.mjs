import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionStockIssueSummary,
  buildProductionStockIssueSummaryRows,
} from "../src/lib/production-stock-issue-summary-rows.js";

test("issue summary calculates issued, returned, and actual usage totals", () => {
  const rows = buildProductionStockIssueSummaryRows([
    {
      issueDate: "2026-07-30",
      lotNo: "LOT-001",
      issueType: "KPF",
      productCode: "WKB-0001",
      productName: "Test Product",
      quantity: 1,
      weightKg: 120,
      returnQuantity: 0,
      returnWeightKg: 8,
      barcode: "BC-001",
    },
    {
      issueDate: "2026-07-30",
      lotNo: "LOT-001",
      issueType: "KPF",
      productCode: "WKB-0001",
      productName: "Test Product",
      quantity: 1,
      weightKg: 80,
      returnQuantity: 1,
      returnWeightKg: 12,
      barcode: "BC-002",
    },
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    issueStatus: "confirmed",
    issueDate: "2026-07-30",
    lotNo: "LOT-001",
    issueType: "KPF",
    productCode: "WKB-0001",
    productName: "Test Product",
    quantity: 2,
    totalWeightKg: 200,
    returnQuantity: 1,
    returnWeightKg: 20,
    barcodes: ["BC-001", "BC-002"],
    returnDates: ["2026-07-30"],
    actualQuantity: 1,
    actualWeightKg: 180,
  });

  assert.deepEqual(buildProductionStockIssueSummary(rows), {
    totalCount: 1,
    totalQuantity: 2,
    totalWeightKg: 200,
    totalReturnQuantity: 1,
    totalReturnWeightKg: 20,
    totalActualQuantity: 1,
    totalActualWeightKg: 180,
  });
});

test("issue summary collects and sorts returnDates", () => {
  const rows = buildProductionStockIssueSummaryRows([
    {
      issueDate: "2026-07-30",
      lotNo: "LOT-001",
      issueType: "KPF",
      productCode: "WKB-0001",
      productName: "Test Product",
      quantity: 1,
      weightKg: 100,
      returnQuantity: 1,
      returnWeightKg: 10,
      returnDate: "2026-07-31",
    },
    {
      issueDate: "2026-07-30",
      lotNo: "LOT-001",
      issueType: "KPF",
      productCode: "WKB-0001",
      productName: "Test Product",
      quantity: 1,
      weightKg: 100,
      returnQuantity: 1,
      returnWeightKg: 10,
      returnDate: "2026-07-30",
    },
  ]);

  assert.equal(rows.length, 2);
  const row30 = rows.find(r => r.issueDate === "2026-07-30");
  const row31 = rows.find(r => r.issueDate === "2026-07-31");

  assert.ok(row30);
  assert.equal(row30.quantity, 2);
  assert.equal(row30.returnQuantity, 1);
  assert.deepEqual(row30.returnDates, ["2026-07-30"]);

  assert.ok(row31);
  assert.equal(row31.quantity, 0);
  assert.equal(row31.returnQuantity, 1);
  assert.deepEqual(row31.returnDates, ["2026-07-31"]);
});

test("actual usage is clamped at zero for inconsistent legacy return totals", () => {
  const [row] = buildProductionStockIssueSummaryRows([
    {
      issueDate: "2026-07-30",
      lotNo: "LOT-002",
      issueType: "KPF",
      productCode: "WKB-0002",
      productName: "Legacy Product",
      quantity: 1,
      weightKg: 10,
      returnQuantity: 2,
      returnWeightKg: 12,
    },
  ]);

  assert.equal(row.actualQuantity, 0);
  assert.equal(row.actualWeightKg, 0);
});

test("mixed statuses never merge or inflate active issue totals", () => {
  const base = { issueDate: "2026-09-06", lotNo: "LOT-1", issueType: "KPF", productCode: "SKU-1", productName: "Product", quantity: 1, weightKg: 10 };
  const rows = buildProductionStockIssueSummaryRows([
    { ...base, documentStatus: "confirmed", itemStatus: "confirmed", barcode: "active" },
    { ...base, documentStatus: "confirmed", itemStatus: "voided", weightKg: 90, barcode: "voided-item" },
    { ...base, documentStatus: "voided", itemStatus: "confirmed", weightKg: 80, barcode: "voided-document" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(buildProductionStockIssueSummary(rows).totalWeightKg, 10);
  assert.equal(buildProductionStockIssueSummary(rows).totalQuantity, 1);
  const voided = rows.filter((row) => row.issueStatus === "voided");
  assert.equal(voided[0].totalWeightKg, 170);
  assert.equal(buildProductionStockIssueSummary(voided).totalWeightKg, 0);
  assert.equal(buildProductionStockIssueSummary(voided, { includeVoided: true }).totalWeightKg, 170);
});
