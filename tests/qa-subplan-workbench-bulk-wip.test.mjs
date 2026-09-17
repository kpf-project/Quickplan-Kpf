import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/features/production-planning/components/QaSubplanWorkbenchClient.js", import.meta.url),
  "utf8"
);

test("QA WIP workbench exposes the approved bulk editor controls", () => {
  [
    "เพิ่ม WIP หลายรายการ",
    "กำหนดวันที่ทั้งหมด",
    "กำหนดกะทั้งหมด",
    "กำหนด Section ทั้งหมด",
    "เลือก WIP หลายรายการ",
    "บันทึก WIP",
  ].forEach((label) => assert.match(source, new RegExp(label)));
});

test("QA WIP matrix exposes grouped date navigation and compact modes", () => {
  ["1 วัน", "3 วัน", "7 วัน", "เปิดทั้งหมด", "ยุบทั้งหมด"].forEach((label) => {
    assert.match(source, new RegExp(label));
  });
  assert.match(source, /groupedMatrixColumns/);
  assert.match(source, /colSpan=\{group\.columns\.length\}/);
  assert.match(source, /function WipMaterialMatrix/);
  assert.match(source, /rowSpan=\{2\}/);
  assert.match(source, /column\.skuCode/);
  assert.match(source, /onEditWip\(column\.id\)/);
  assert.match(source, /aria-label=\{`แก้ไข WIP/);
});

test("WIP picker only uses department values available inside the matrix view", () => {
  assert.doesNotMatch(
    source,
    /activeDeptId=\{activeDepartmentId \|\| activeDepartment\?\.id \|\| selectedDepartmentId\}/
  );
});

test("modern WIP matrix is excluded from the legacy-table hiding selector", () => {
  assert.match(source, /overflow-x-auto:not\(\.wip-modern-matrix\)/);
  assert.doesNotMatch(source, /\[&>div\.overflow-x-auto\]:hidden/);
});

test("global table styles keep the modern matrix header visible", () => {
  const css = fs.readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.overflow-x-auto:not\(\.wip-modern-matrix\) > table > thead/);
  assert.match(css, /\.wip-modern-matrix > table > thead[\s\S]*display: table-header-group/);
});
