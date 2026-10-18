import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import * as layout from "../src/features/production-planning/services/scheduleColumnLayout.js";
import * as colors from "../src/features/production-planning/services/scheduleHighlightColors.js";
import * as dateLayout from "../src/lib/scheduleDateLayout.js";
import * as formulaLayout from "../src/lib/scheduleFormulaLayout.js";
import * as columnColors from "../src/lib/scheduleColumnColors.js";

test("shared layout preserves explicit sizes and gives each data type a practical fallback", async () => {
  const { columnWidth, standardWidth, tableWidth } = await import("../src/features/production-planning/services/scheduleColumnLayout.js");
  assert.equal(columnWidth({ width: 212, col_type: "number" }), 212);
  assert.equal(columnWidth({ col_type: "sku_picker" }), 340);
  assert.equal(standardWidth({ col_type: "shift", width: 72 }), 160);
  assert.equal(standardWidth({ col_type: "brand_auto" }), 90);
  assert.equal(standardWidth({ col_type: "number", key: "people", label: "จำนวนคน" }), 80);
  assert.equal(standardWidth({ col_type: "text", key: "skuName" }), 340);
  assert.equal(tableWidth([{ col_type: "sku_picker" }, { col_type: "number" }], false, false), 440);
  assert.equal(tableWidth([], true, true), 188);
});

test("real master table and preview share pixel widths, resize handles and nonduplicated dates", async () => {
  await loadBindings();
  const file = "src/features/production-planning/components/GenericScheduleTable.js";
  const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url), mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => name.endsWith(".css") ? { __esModule: true, default: {} } : name.includes("scheduleColumnColors") ? columnColors : name.includes("scheduleFormulaLayout") ? formulaLayout : name.includes("scheduleDateLayout") ? dateLayout : name.includes("scheduleHighlightColors") ? colors : name.includes("scheduleColumnLayout") ? layout : name.includes("PlanningSkuPicker") ? () => null : require(name), mod, mod.exports);
  const props = { section: { columns: [{ id: "product", key: "skuName", label: "สินค้า", col_type: "text", width: 340 }] }, rows: [{ id: "r1", day_key: "mon", row_data: { skuName: "สินค้ายาว" } }], days: [{ key: "mon", label: "จ.", date: "19/10/2569", full: "วันจันทร์ที่ 19 ตุลาคม" }], skuCatalog: [], onUpdate() {}, onDelete() {}, onAddRow() {} };
  const normal = renderToStaticMarkup(React.createElement(mod.exports.default, props));
  for (const [brand, color] of [["ระฆังทอง", "#102C57"], ["แม่มะลิ 5 กก.", "#EF1717"], ["แม่มัลิ", "#EF1717"], ["KPF", "#EF1717"], [" kpf ", "#EF1717"]]) {
    for (const mode of ["editable", "readonly", "locked-row"]) {
      const branded = renderToStaticMarkup(React.createElement(mod.exports.default, {
        ...props,
        readOnly: mode === "readonly",
        section: { columns: [{ id: "brand", key: "brand", label: "แบรนด์", col_type: "brand_auto" }] },
        rows: [{ id: "r1", day_key: "mon", readOnly: mode === "locked-row", row_data: { brand } }],
      }));
      assert.ok(branded.includes(`style="color:${color}"`), `${brand}: ${mode}`);
      assert.ok(branded.includes(brand));
    }
  }
  assert.match(normal, /width:528px;min-width:528px/);
  assert.match(normal, /rowSpan="1"|rowspan="1"/);
  assert.match(normal, /วันที่/);
  assert.doesNotMatch(normal, /วันจันทร์ที่ 19 ตุลาคม/);
  assert.doesNotMatch(normal, /role="separator"/);
  const preview = renderToStaticMarkup(React.createElement(mod.exports.default, { ...props, onColumnSelect() {}, onColumnResize() {}, selectedColumnId: "product" }));
  assert.match(preview, /width:528px;min-width:528px/);
  assert.match(preview, /role="separator"/);
  assert.match(preview, /aria-valuenow="340"/);
  const embedded = renderToStaticMarkup(React.createElement(mod.exports.default, { ...props, readOnly: true, hideDayGroupHeader: true }));
  assert.match(embedded, /width:528px;min-width:528px/);
  assert.match(embedded, /วันที่/);
  assert.doesNotMatch(embedded, /วันจันทร์ที่ 19 ตุลาคม/);
  const dateStyled = renderToStaticMarkup(React.createElement(mod.exports.default, { ...props, section: { ...props.section, date_layout: { width: 220, headerColor: "#123456", bodyColor: "#FEDCBA" } }, onColumnResize() {}, onColumnSelect() {} }));
  assert.match(dateStyled, /width:588px;min-width:588px/);
  assert.match(dateStyled, /aria-label="ความกว้าง วันที่"/);
  assert.match(dateStyled, /<th[^>]*background-color:#123456/);
  assert.match(dateStyled, /<td[^>]*background-color:#FEDCBA/);
  for (const col_type of ["text", "number", "sku_picker", "shift", "brand_auto", "time"]) {
    const colored = { ...props, section: { columns: [{ ...props.section.columns[0], col_type, highlight_color: "#123456" }] } };
    const html = renderToStaticMarkup(React.createElement(mod.exports.default, colored));
    assert.match(html, /<td[^>]*style="background-color:#123456;color:#FFFFFF"/);
    assert.match(html, /<th[^>]*style="[^"]*background-color:#123456/);
  }
  const formulaProps = { ...props, section: { columns: [{ id: "sku", key: "product", col_type: "sku_picker", label: "สินค้า", width: 340 }] }, rows: [{ id: "r1", day_key: "mon", row_data: { product: "สินค้า A", formula_code: "F3", formula_name: "สูตรสาม" } }], skuCatalog: [{ name: "สินค้า A", formulaOptions: [{ formula_code: "F3", formula_name: "สูตรสาม" }] }] };
  const editable = renderToStaticMarkup(React.createElement(mod.exports.default, formulaProps));
  assert.match(editable, /สูตรผลิต สินค้า A/);
  const lockedRow = renderToStaticMarkup(React.createElement(mod.exports.default, { ...formulaProps, onAddRow: undefined, rows: formulaProps.rows.map(row => ({ ...row, readOnly: true })) }));
  assert.doesNotMatch(lockedRow, /<select/);
  assert.match(lockedRow, /aria-hidden="true"/);
  assert.doesNotMatch(lockedRow, /group-hover:opacity-100/);
  assert.doesNotMatch(editable, /เพิ่มรายการ|เพิ่มแถว จันทร์/);
  const paper = renderToStaticMarkup(React.createElement(mod.exports.default, { ...formulaProps, readOnly: true }));
  assert.match(paper, />สูตร<\/th>/);
  assert.match(paper, />F3<\/span>/);
  assert.doesNotMatch(paper, /<select/);
  for (const col_type of ["text", "number", "sku_picker", "shift", "brand_auto", "time", "formula"]) {
    for (const readOnly of [false, true]) {
      const split = { ...props, readOnly, section: { columns: [{ id: "split", key: "value", label: "แยกสี", col_type, width: 100 }], column_colors: { split: { headerColor: "#123456", bodyColor: "#FEDCBA" } } } };
      const markup = renderToStaticMarkup(React.createElement(mod.exports.default, split));
      assert.match(markup, /<th[^>]*background-color:#123456/);
      assert.match(markup, /<td[^>]*background-color:#FEDCBA/);
      const navy = renderToStaticMarkup(React.createElement(mod.exports.default, { ...split, headerVariant: "navy" }));
      assert.match(navy, /<th[^>]*background-color:#123456/);
    }
  }
});

test("settings preview uses the master table without scaling and stages saves", () => {
  const source = readFileSync("src/features/production-planning/components/ScheduleTemplateDesigner.js", "utf8");
  assert.match(source, /<GenericScheduleTable/);
  assert.match(source, /onColumnResize=/);
  assert.match(source, /บันทึกการตั้งค่า/);
  assert.match(source, /beforeunload/);
  assert.doesNotMatch(source, /transform:\s*scale/);
  assert.match(source, /styles\.editorDock.*aria-label="แถบตั้งค่าคอลัมน์"/);
  const dockStart = source.indexOf("className={styles.editorDock}");
  assert.ok(dockStart < source.indexOf("className={styles.columnPopover}"));
  assert.ok(source.indexOf("className={styles.columnPopover}") < source.indexOf("className={paperStyles.designerCanvas}"));
  const css = readFileSync("src/features/production-planning/components/ScheduleTemplateDesigner.module.css", "utf8");
  assert.match(css, /\.columnPopover\s*\{\s*position: static;/);
  assert.match(css, /\.editorDock\s*\{[^}]*min-height: 84px/);
  assert.doesNotMatch(css, /\.columnPopover\s*\{[^}]*position: absolute/);
});
