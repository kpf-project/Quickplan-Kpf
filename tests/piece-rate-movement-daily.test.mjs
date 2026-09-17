import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPieceRateDailyMovementReport,
  mapStockSummaryToPieceRateMovementReport,
} from "../src/features/attendance/utils/buildPieceRateDailyMovementReport.js";

test("piece-rate movement report separates daily rows and carries balances", () => {
  const report = buildPieceRateDailyMovementReport([
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh", product_code: "BL-0001", product_name_snapshot: "สินค้า", lot_no: "LOT-1", quantity_in: 2, weight_in_kg: 20 },
    { movement_date: "2026-08-12", source_document_type: "piece_rate_issue", product_code: "BL-0001", product_name_snapshot: "สินค้า", lot_no: "LOT-1", quantity_out: 1, weight_out_kg: 10 },
    { movement_date: "2026-08-13", source_document_type: "piece_rate_return", product_code: "BL-0001", product_name_snapshot: "สินค้า", lot_no: "LOT-1", quantity_in: 1, weight_in_kg: 4 },
  ], "2026-08-12", "2026-08-13", "");

  assert.deepEqual(report.rows.map((row) => row.reportDate), ["2026-08-12", "2026-08-13"]);
  assert.equal(report.rows[0].openingQty, 2);
  assert.equal(report.rows[0].balanceQty, 1);
  assert.equal(report.rows[1].openingQty, 1);
  assert.equal(report.rows[1].balanceQty, 2);
  assert.equal(report.summary.balanceQty, 2);
});

test("piece-rate movement report nets cancelled inbound and issue rows", () => {
  const report = buildPieceRateDailyMovementReport([
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh", product_code: "BL-0001", lot_no: "LOT-1", quantity_in: 1, weight_in_kg: 10 },
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh_void", product_code: "BL-0001", lot_no: "LOT-1", quantity_out: 1, weight_out_kg: 10 },
    { movement_date: "2026-08-11", source_document_type: "piece_rate_issue", product_code: "BL-0001", lot_no: "LOT-1", quantity_out: 1, weight_out_kg: 10 },
    { movement_date: "2026-08-11", source_document_type: "piece_rate_issue_void", product_code: "BL-0001", lot_no: "LOT-1", quantity_in: 1, weight_in_kg: 10 },
  ], "2026-08-11", "2026-08-11", "");

  assert.equal(report.rows[0].inboundQty, 0);
  assert.equal(report.rows[0].issueQty, 0);
  assert.equal(report.rows[0].balanceQty, 0);
});

test("piece-rate movement report preserves daily carry-forward rows from the central stock summary", () => {
  const report = mapStockSummaryToPieceRateMovementReport({
    rows: [
      {
        issueDate: "2026-08-10",
        productCode: "WKB-0002",
        productName: "Product A",
        lotNo: "LOT-1",
        openingQuantity: 5,
        openingWeightKg: 50,
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 0,
        issueWeightKg: 0,
        returnQuantity: 0,
        returnWeightKg: 0,
        wasteQuantity: 0,
        wasteWeightKg: 0,
        actualQuantity: 0,
        actualWeightKg: 0,
        balanceQuantity: 5,
        balanceWeightKg: 50,
        isCarryForward: true,
      },
    ],
    summary: {
      totalCount: 1,
      openingQuantity: 5,
      openingWeightKg: 50,
      balanceQuantity: 5,
      balanceWeightKg: 50,
    },
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].reportDate, "2026-08-10");
  assert.equal(report.rows[0].openingQty, 5);
  assert.equal(report.rows[0].balanceQty, 5);
  assert.equal(report.rows[0].isCarryForward, true);
  assert.equal(report.summary.balanceQty, 5);
});

test("piece-rate daily report omits dates that have no jam-label movement", () => {
  const report = buildPieceRateDailyMovementReport([
    {
      movement_date: "2026-08-11",
      product_code: "BLO-4004",
      lot_no: "LOT-JAM",
      source_document_type: "piece_rate_weigh",
      quantity_in: 1,
      weight_in_kg: 15,
    },
    {
      movement_date: "2026-08-12",
      product_code: "WKB-SHELL",
      lot_no: "LOT-SCALE",
      source_document_type: "weight_scale_receipt",
      quantity_in: 99,
      weight_in_kg: 999,
    },
  ], "2026-08-12", "2026-08-13");

  assert.deepEqual(report.rows, []);
  assert.equal(report.summary.balanceWeightKg, 0);
});

test("piece-rate daily report omits inactive carried stock but keeps opening balance for active LOTs", () => {
  const report = buildPieceRateDailyMovementReport([
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh", product_code: "ACTIVE", lot_no: "LOT-A", quantity_in: 2, weight_in_kg: 20 },
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh", product_code: "INACTIVE", lot_no: "LOT-B", quantity_in: 3, weight_in_kg: 30 },
    { movement_date: "2026-08-12", source_document_type: "piece_rate_issue", product_code: "ACTIVE", lot_no: "LOT-A", quantity_out: 1, weight_out_kg: 10 },
  ], "2026-08-12", "2026-08-12");

  assert.deepEqual(report.rows.map((row) => row.productCode), ["ACTIVE"]);
  assert.equal(report.rows[0].openingWeightKg, 20);
  assert.equal(report.rows[0].balanceWeightKg, 10);
  assert.equal(report.summary.openingWeightKg, 20);
  assert.equal(report.summary.balanceWeightKg, 10);
});

test("piece-rate daily report skips an empty date between movement dates", () => {
  const report = buildPieceRateDailyMovementReport([
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh", product_code: "WKB-0064", lot_no: "LOT-1", quantity_in: 1, weight_in_kg: 15 },
    { movement_date: "2026-08-13", source_document_type: "piece_rate_issue", product_code: "WKB-0064", lot_no: "LOT-1", quantity_out: 1, weight_out_kg: 15 },
  ], "2026-08-11", "2026-08-13");

  assert.deepEqual(report.rows.map((row) => row.reportDate), ["2026-08-11", "2026-08-13"]);
  assert.equal(report.rows[1].openingWeightKg, 15);
  assert.equal(report.rows[1].balanceWeightKg, 0);
});

test("piece-rate reports restart on 2026-08-11 without carrying older balances", () => {
  const report = buildPieceRateDailyMovementReport([
    { movement_date: "2026-08-10", source_document_type: "piece_rate_weigh", product_code: "OLD", lot_no: "OLD-LOT", quantity_in: 99, weight_in_kg: 999 },
    { movement_date: "2026-08-11", source_document_type: "piece_rate_weigh", product_code: "NEW", lot_no: "NEW-LOT", quantity_in: 2, weight_in_kg: 20 },
  ], "2026-08-11", "2026-08-11");

  assert.deepEqual(report.rows.map((row) => row.productCode), ["NEW"]);
  assert.equal(report.rows[0].openingQty, 0);
  assert.equal(report.summary.balanceQty, 2);
  assert.equal(report.summary.balanceWeightKg, 20);
});
