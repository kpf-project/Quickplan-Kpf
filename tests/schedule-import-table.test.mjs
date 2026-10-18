import test from "node:test";
import assert from "node:assert/strict";
import * as review from "../src/lib/scheduleImportReview.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import * as widths from "../src/features/production-planning/services/scheduleColumnLayout.js";
import * as highlights from "../src/features/production-planning/services/scheduleHighlightColors.js";
import * as dates from "../src/lib/scheduleDateLayout.js";
import * as formulas from "../src/lib/scheduleFormulaLayout.js";
import * as columnColors from "../src/lib/scheduleColumnColors.js";

const option = { selectionKey: "ABC::F2", skuCode: "ABC", name: "ขนมปังกรอบ ABC 4 กก.", brand: "ระฆังทอง", unit: "กล่อง", formulaCode: "F2", formulaName: "สูตรสอง", rowPatch: { sku: "ขนมปังกรอบ ABC 4 กก.", brand: "ระฆังทอง", formulaCode: "F2", formulaName: "สูตรสอง", bomVersionId: "v2" } };
const section = { id: "tin", color_theme: "yellow", date_layout: { width: 210, headerColor: "#123456", bodyColor: "#FEDCBA" }, formula_layout: { "formula:sku": { label: "สูตรที่ใช้", width: 130 } }, column_colors: { sku: { headerColor: "#AABBCC" } }, production_schedule_column_defs: [{ id: "sku", key: "sku", label: "สินค้า", width: 440, col_type: "sku_picker" }], productOptions: { sku: [option] } };

test("Vision section payload retains the complete configured table presentation", () => {
  assert.equal(typeof review.importPreviewSection, "function");
  const payload = review.importPreviewSection(section, section.productOptions, []);
  assert.deepEqual(payload.date_layout, { width: 210, headerColor: "#123456", bodyColor: "#FEDCBA" });
  assert.deepEqual(payload.formula_layout, section.formula_layout);
  assert.deepEqual(payload.column_colors, section.column_colors);
  assert.equal(payload.color_theme, "yellow");
  assert.equal(payload.columns[0].width, 440);
});

test("Vision table adapter preserves row identity, date groups and scoped approved formula bindings", () => {
  assert.equal(typeof review.importTableData, "function");
  const data = review.importTableData(section, [{ id: "r1", dayKey: "2026-10-19", rowData: { sku: option.name, formulaCode: "F2" } }, { id: "r2", dayKey: "2026-10-19", rowData: { qty: 14 } }]);
  assert.deepEqual(data.rows.map(row => [row.id, row.day_key]), [["r1", "2026-10-19"], ["r2", "2026-10-19"]]);
  assert.equal(data.rows[0].row_data.formulaCode, "F2");
  assert.equal(data.days.length, 1);
  assert.equal(data.days[0].date, "19/10/2569");
  assert.equal(data.skuCatalog[0].skuCode, "ABC");
  assert.equal(data.skuCatalog[0].unit, "กล่อง");
  assert.deepEqual(data.skuCatalog[0].formulaOptions, [{ formula_code: "F2", formula_name: "สูตรสอง", bom_version_id: "v2" }]);
});

test("shared table edits synchronize Vision SKU/formula review and never learn unapproved aliases", () => {
  assert.equal(typeof review.updateImportRow, "function");
  const row = { id: "r1", rowData: { qty: 14 }, issues: ["สินค้า: จำเป็นต้องมีข้อมูล", "วันที่ผิด"], products: [{ columnKey: "sku", status: "review", candidates: [] }] };
  const updated = review.updateImportRow(row, option.rowPatch, { ...section, columns: section.production_schedule_column_defs });
  assert.equal(updated.products[0].selectedKey, "ABC::F2");
  assert.equal(updated.products[0].status, "resolved");
  assert.equal(updated.products[0].userConfirmed, true);
  assert.equal(updated.products[0].learnAlias, false);
  assert.deepEqual(updated.issues, ["วันที่ผิด"]);
  assert.equal(updated.rowData.qty, 14);
  const numeric = review.updateImportRow(updated, { qty: 20 }, section);
  assert.equal(numeric.rowData.qty, 20);
  assert.equal(numeric.products[0].selectedKey, "ABC::F2");
  const missing = review.updateImportRow(updated, { sku: "นอกขอบเขต" }, section);
  assert.equal(missing.products[0].status, "review");
});

test("real AI modal renders the same configured master table, dates, formula column and colors", async () => {
  await loadBindings();
  const require = createRequire(import.meta.url);
  async function component(file, imports) {
    const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(name => imports(name) ?? require(name), mod, mod.exports);
    return mod.exports.default;
  }
  const generic = await component("src/features/production-planning/components/GenericScheduleTable.js", name => name.endsWith(".css") ? { __esModule: true, default: { table: "shared-master-table" } } : name.includes("scheduleColumnColors") ? columnColors : name.includes("scheduleFormulaLayout") ? formulas : name.includes("scheduleDateLayout") ? dates : name.includes("scheduleHighlightColors") ? highlights : name.includes("scheduleColumnLayout") ? widths : name.includes("PlanningSkuPicker") ? () => null : undefined);
  const table = await component("src/features/production-planning/components/ScheduleVisionSectionTable.js", name => name.includes("GenericScheduleTable") ? { default: generic, __esModule: true } : name.includes("scheduleImportReview") ? review : undefined);
  const payloadSection = review.importPreviewSection(section, section.productOptions, []);
  const preview = { sections: [payloadSection], rows: [
    { id: "r1", sectionDefId: "tin", dayKey: "2026-10-19", rowData: option.rowPatch, issues: [], warnings: [], products: [{ columnKey: "sku", sourceBrand: "ระฆังทอง", sourceProduct: "ขนมปังกรอบ ABC", sourceSize: "XL", selectedKey: option.selectionKey, status: "resolved", candidates: [] }] },
    { id: "r2", sectionDefId: "tin", dayKey: "2026-10-19", rowData: {}, issues: [], warnings: [], products: [{ columnKey: "sku", sourceBrand: "KPF", sourceProduct: "คุกกี้นม ครีมวานิลลา", sourceSize: "L", selectedKey: "", status: "review", candidates: [] }] },
  ] };
  let stateIndex = 0;
  const modal = await component("src/features/production-planning/components/ScheduleVisionImportModal.js", name => name === "react" ? { ...React, useState(initial) { return React.useState(++stateIndex === 4 ? preview : initial); } } : name.includes("ScheduleVisionSectionTable") ? { default: table, __esModule: true } : name.includes("scheduleImportReview") ? review : undefined);
  const html = renderToStaticMarkup(React.createElement(modal, { isOpen: true, dateFrom: "2026-10-19", dateTo: "2026-10-23" }));
  assert.match(html, /shared-master-table/);
  assert.match(html, /width:808px;min-width:808px/);
  assert.match(html, /background-color:#123456/);
  assert.match(html, /background-color:#FEDCBA/);
  assert.match(html, /background-color:#AABBCC/);
  assert.match(html, /สูตรที่ใช้/);
  assert.match(html, /19\/10\/2569/);
  assert.match(html, /ขนมปังกรอบ ABC/);
  assert.match(html, /color:#526B8A/);
  assert.match(html, /จากใบ: ระฆังทอง · ขนมปังกรอบ ABC · XL/);
  assert.match(html, /จากใบ: KPF · คุกกี้นม ครีมวานิลลา · L/);
  assert.match(html, /color:#B45309/);
  assert.match(html, /สินค้า: ไม่พบสินค้าหรือสูตรที่ตรงกับ “คุกกี้นม ครีมวานิลลา”/);
  const shiftHtml = renderToStaticMarkup(React.createElement(generic, {
    section: { columns: [{ id: "time", key: "time", col_type: "shift", label: "เวลา" }] },
    rows: [{ id: "r1", day_key: "2026-10-19", row_data: { time: "กะ 1 (07:00-19:00)" } }],
    days: [{ key: "2026-10-19", date: "19/10/2569", label: "จ." }],
    skuCatalog: [], sectionShifts: [{ id: "s1", name: "กะ 1", startTime: "07:00", endTime: "16:00" }], onUpdate() {}, onDelete() {},
  }));
  assert.match(shiftHtml, /<option value="กะ 1 \(07:00-19:00\)" selected="">กะ 1 \(07:00-19:00\)<\/option>/);
});
