import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadBindings, transform } from "next/dist/build/swc/index.js";
import * as adjustment from "../src/lib/planningAdjustment.js";

const require = createRequire(import.meta.url);
await loadBindings();
const root = "src/features/production-planning/components/";
const file = root + "PlanningAdjustmentSchedule.js";
const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
const mod = { exports: {} };
let tableProps;
new Function("require", "module", "exports", code)(name => {
  if (name === "./GenericScheduleTable") return { __esModule: true, default: props => { tableProps = props; return React.createElement("table", { "data-shared": "true" }); } };
  if (name.includes("planningAdjustment")) return adjustment;
  if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return require(name);
}, mod, mod.exports);

test("adjustment adapter keeps template object, date/color/formula configuration and shared canvas", () => {
  const sections = [{ id: "a", name: "A", date_layout: { width: 187 }, column_colors: { sku: { headerColor: "#123456" } }, formula_layout: { width: 91 }, production_schedule_column_defs: [{ id: "sku", key: "sku", col_type: "sku_picker", width: 410 }] }, { id: "b", name: "B" }];
  const rows = [{ plan_id: "past", period_start: "2026-10-17", schedule_section_def_id: "a", row_data: { sku: "สินค้าเก่า" }, can_edit: true }, { plan_id: "locked", period_start: "2026-10-20", schedule_section_def_id: "a", row_data: {}, can_edit: false }, { plan_id: "future", period_start: "2026-10-20", schedule_section_def_id: "a", row_data: { sku: "ใหม่", formula_code: "F3" }, can_edit: true }, { plan_id: "other", period_start: "2026-10-20", schedule_section_def_id: "b" }];
  const props = { sections, selectedSectionId: "a", rows, dates: ["2026-10-17", "2026-10-20"], today: "2026-10-18", skuCatalog: [], sectionShifts: [], canAdd: true, onAddRow() {}, onUpdate() {}, onDelete() {} };
  const html = renderToStaticMarkup(React.createElement(mod.exports.default, props));
  assert.match(html, /class="canvas"/);
  assert.match(html, /class="tableViewport"/);
  assert.match(html, /aria-label="Section แผนหลัก"/);
  assert.equal(tableProps.section, sections[0]);
  assert.equal(tableProps.onUpdate, props.onUpdate);
  assert.equal(tableProps.rows.length, 3);
  assert.deepEqual(tableProps.rows.map(row => row.readOnly), [true, true, false]);
  assert.equal(tableProps.rows[2].row_data.formula_code, "F3");
  assert.equal(tableProps.days[1].key, "2026-10-20");
  assert.equal(tableProps.days[1].date, "20/10/2569");
  renderToStaticMarkup(React.createElement(mod.exports.default, { ...props, canAdd: false }));
  assert.equal(tableProps.onAddRow, undefined);
});

test("report uses shared plan/product pickers and retains room WIP and guarded mutations", () => {
  const source = readFileSync(root + "PlanningControlCenterClient.js", "utf8");
  assert.match(source, /<RequisitionPlanPicker/);
  assert.match(source, /<PlanningSkuPicker/);
  assert.match(source, /<PlanningAdjustmentSchedule sections=\{templateSections\}/);
  assert.match(source, /selection\?\.skuCode \? selectedSectionDefId/);
  assert.match(source, /if \(!canEditFgDepartment \|\| !product/);
  assert.match(source, /if \(!row \|\| row.can_edit === false \|\| !isPlanningDateEditable/);
  assert.match(source, /if \(chosenFormula\) newRow.row_data/);
  assert.match(source, /plannableWorkCenters.map/);
  assert.match(source, /editableFromDate: today/);
  const generic = readFileSync(root + "GenericScheduleTable.js", "utf8");
  assert.match(generic, /readOnly=\{readOnly \|\| row.readOnly === true\}/);
});
