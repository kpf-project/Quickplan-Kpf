import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyPieceRatePayPeriodWage,
  calculatePieceRateWageAmount,
} from "../src/lib/pieceRateWage.js";

test("individual kilogram rows preserve fractional weight", () => {
  assert.equal(calculatePieceRateWageAmount({
    wageBasis: "kg",
    normalizedKgAmount: 147.4,
    payRatePerKg: 2,
  }), 294.8);
});

test("individual count rows preserve their entered quantity", () => {
  assert.equal(calculatePieceRateWageAmount({
    wageBasis: "count",
    countValue: 3.8,
    payRatePerUnit: 2.5,
  }), 9.5);
});

test("pay-period kilogram wages keep the exact fraction when it reaches .5", () => {
  const weights = [16.745, 16.745, 16.62, 16.385, 16.265, 16.375, 16.135, 14.415];
  const rows = weights.map((normalizedKgAmount, index) => ({
    id: String(index),
    employeeCode: "KPF-01271",
    groupDayKey: "2026-10-12",
    loggedAt: `2026-10-12T0${index}:00:00+07:00`,
    workTypeName: "เหมาป้ายแยม",
    wageBasis: "kg",
    normalizedKgAmount,
    payRatePerKg: 4.5,
    wageAmount: Math.trunc(normalizedKgAmount) * 4.5,
    docStatus: "active",
  }));

  const result = applyPieceRatePayPeriodWage(rows);

  assert.equal(result.reduce((sum, row) => sum + row.wageAmount, 0), 583.5825);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0) * 4.5, 583.5825);
});

test("pay-period wage keeps a .5-or-higher fraction and drops a lower fraction", () => {
  const row = (day, normalizedKgAmount, workTypeName = "งานทดสอบ") => ({
    employeeCode: "KPF-00001",
    groupDayKey: day,
    workTypeName,
    wageBasis: "kg",
    normalizedKgAmount,
    payRatePerKg: 4.5,
    wageAmount: 0,
    docStatus: "active",
  });
  const result = applyPieceRatePayPeriodWage([
    row("2026-10-12", 129.499),
    row("2026-10-16", 129.5),
  ]);

  assert.equal(result[0].wageAmount, 580.5);
  assert.equal(result[1].wageAmount, 582.75);
});

test("pay-period wage accumulates through the 15th and starts again on the 16th", () => {
  const row = (day, normalizedKgAmount) => ({
    employeeCode: "KPF-00001",
    groupDayKey: day,
    loggedAt: `${day}T08:00:00+07:00`,
    workTypeName: "งานทดสอบ",
    wageBasis: "kg",
    normalizedKgAmount,
    payRatePerKg: 4.5,
    wageAmount: 0,
    docStatus: "active",
  });
  const result = applyPieceRatePayPeriodWage([
    row("2026-10-01", 60.2),
    row("2026-10-15", 69.485, "งานอีกประเภทในอัตราเดียวกัน"),
    row("2026-10-16", 10.4),
  ]);

  assert.equal(result[0].wageAmount + result[1].wageAmount, 583.5825);
  assert.equal(result[2].wageAmount, 45);
  assert.equal(result.reduce((sum, row) => sum + row.normalizedKgAmount, 0), 140.085);
});

test("report, drilldown, print and Excel use the same pay-period wage rule", () => {
  const service = readFileSync(
    new URL("../src/features/attendance/services/pieceRateWorkService.js", import.meta.url),
    "utf8"
  );

  assert.ok((service.match(/applyPieceRateReportWageRules\(/g) || []).length >= 7);
  assert.match(service, /const roundedWageById = new Map\(summarySourceRows/);
});
