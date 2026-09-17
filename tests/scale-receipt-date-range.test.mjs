import assert from "node:assert/strict";
import test from "node:test";

import { toScaleReceiptIsoDateRange } from "../src/lib/scale/date-range.js";
import {
  matchesScaleReceiptReportStatus,
  normalizeScaleReceiptReportStatus,
} from "../src/lib/scale/receipt-report-status.js";

test("scale receipt date filters use Bangkok day boundaries", () => {
  const range = toScaleReceiptIsoDateRange({
    dateFrom: "2026-07-01",
    dateTo: "2026-07-01",
  });

  assert.equal(range.startIso, "2026-06-30T17:00:00.000Z");
  assert.equal(range.endIso, "2026-07-01T17:00:00.000Z");
  assert.equal(range.normalizedDateFrom, "2026-07-01");
  assert.equal(range.normalizedDateTo, "2026-07-01");
});

test("scale receipt date filters default to the selected end date when start is empty", () => {
  const range = toScaleReceiptIsoDateRange({
    dateFrom: "",
    dateTo: "2026-07-03",
  });

  assert.equal(range.startIso, "2026-07-02T17:00:00.000Z");
  assert.equal(range.endIso, "2026-07-03T17:00:00.000Z");
  assert.equal(range.normalizedDateFrom, "2026-07-03");
  assert.equal(range.normalizedDateTo, "2026-07-03");
});

test("weight receipt reports default to successful receipts", () => {
  assert.equal(normalizeScaleReceiptReportStatus(), "confirmed");
  assert.equal(normalizeScaleReceiptReportStatus("all"), "confirmed");
  assert.equal(normalizeScaleReceiptReportStatus("confirmed"), "confirmed");
  assert.equal(normalizeScaleReceiptReportStatus("voided"), "voided");
});

test("successful receipt status includes available and issued but excludes voided", () => {
  assert.equal(matchesScaleReceiptReportStatus("available", "confirmed"), true);
  assert.equal(matchesScaleReceiptReportStatus("issued", "confirmed"), true);
  assert.equal(matchesScaleReceiptReportStatus("voided", "confirmed"), false);
});

test("cancelled receipt mode contains cancelled receipts only", () => {
  assert.equal(matchesScaleReceiptReportStatus("available", "voided"), false);
  assert.equal(matchesScaleReceiptReportStatus("issued", "voided"), false);
  assert.equal(matchesScaleReceiptReportStatus("voided", "voided"), true);
});
