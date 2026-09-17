import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePrisonIssueQuantity,
  calculatePrisonIssueWeight,
  filterAndPaginatePrisonLots,
} from "../src/features/attendance/utils/pieceRatePrisonIssue.js";

test("คำนวณกระบะเทียบเท่าจากน้ำหนักจริง และปัดเป็น 3 ตำแหน่ง", () => {
  assert.equal(calculatePrisonIssueQuantity({
    availableQuantity: 82,
    availableWeightKg: 1639.13,
    issueWeightKg: 10,
  }), 0.5);
});

test("เบิกน้ำหนักที่เหลือทั้งหมดต้องตัดจำนวนกระบะที่เหลือทั้งหมด", () => {
  assert.equal(calculatePrisonIssueQuantity({
    availableQuantity: 0.375,
    availableWeightKg: 7.496,
    issueWeightKg: 7.496,
  }), 0.375);
});

test("คำนวณน้ำหนักตามสัดส่วนกระบะ และปัดเป็น 3 ตำแหน่ง", () => {
  assert.equal(calculatePrisonIssueWeight({
    availableQuantity: 74,
    availableWeightKg: 1474.74,
    issueQuantity: 5,
  }), 99.645);
});

test("เบิกกระบะสุดท้ายต้องตัดน้ำหนักที่เหลือทั้งหมด ไม่ทิ้งเศษ", () => {
  assert.equal(calculatePrisonIssueWeight({
    availableQuantity: 3,
    availableWeightKg: 59.787,
    issueQuantity: 3,
  }), 59.787);
});

test("LOT 52 รายการแบ่งหน้าละ 15 และหน้าสุดท้ายเหลือ 7 รายการ", () => {
  const lots = Array.from({ length: 52 }, (_, index) => ({
    lotNo: `LOT-${String(index + 1).padStart(3, "0")}`,
  }));
  const page = filterAndPaginatePrisonLots({ lots, page: 4, pageSize: 15 });
  assert.equal(page.totalPages, 4);
  assert.equal(page.rows.length, 7);
  assert.equal(page.rows[0].lotNo, "LOT-046");
});

test("โหมดแสดงเฉพาะที่เลือกค้นหา LOT ได้และยังรวมรายการข้ามหน้า", () => {
  const lots = [
    { lotNo: "0108260001-1" },
    { lotNo: "0208260002-1" },
    { lotNo: "0308260003-1" },
  ];
  const page = filterAndPaginatePrisonLots({
    lots,
    query: "0003",
    selectedLotNos: new Set(["0108260001-1", "0308260003-1"]),
    selectedOnly: true,
    page: 1,
    pageSize: 15,
  });
  assert.deepEqual(page.rows.map((row) => row.lotNo), ["0308260003-1"]);
});
