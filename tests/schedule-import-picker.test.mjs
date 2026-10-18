import test from "node:test";
import assert from "node:assert/strict";
import * as vision from "../src/lib/scheduleVisionImport.js";
import { readFileSync } from "node:fs";
import { isProductInImportScope } from "../src/lib/scheduleImportScope.js";

const column = { key: "sku", label: "สินค้า", col_type: "sku_picker", auto_fill_field: "brand" };
const section = { id: "cream", name: "ป้ายครีม", production_schedule_column_defs: [column] };
const formula = { formula_code: "F1", formula_name: "สูตรหลัก", bom_version_id: "v1" };
const catalog = Array.from({ length: 12 }, (_, i) => ({ skuCode: `C${i}`, name: `คุกกี้ ${i}`, brand: "ระฆังทอง", subcategoryId: "cookie", hasBom: true, formulaOptions: [formula] }));

test("manual picker includes every scoped SKU/formula, not only AI top eight or original flavor", () => {
  assert.equal(typeof vision.buildSectionProductOptions, "function");
  const options = vision.buildSectionProductOptions(section, [...catalog,
    { ...catalog[0], skuCode: "JAM", subcategoryId: "jam" },
    { ...catalog[0], skuCode: "NO-BOM", hasBom: false },
  ], ["cookie"]);
  assert.equal(options.sku.length, 12);
  assert.deepEqual(options.sku.map(item => item.skuCode).sort(), catalog.map(item => item.skuCode).sort());
  assert.equal(options.sku[0].rowPatch.bomVersionId, "v1");
  assert.deepEqual(vision.buildSectionProductOptions(section, catalog, []).sku, []);
});

function modalFunctions(preview) {
  const source = readFileSync(new URL("../src/features/production-planning/components/ScheduleVisionImportModal.js", import.meta.url), "utf8");
  const select = source.slice(source.indexOf("  function selectProduct("), source.indexOf("  function updateCell("));
  const move = source.slice(source.indexOf("  function updateRowSection("), source.indexOf("  function deleteRow("));
  const sections = preview.sections;
  const factory = new Function("setPreview", "setReviewed", "sectionMap", "getProductOptions", "moveImportRow", `${select}\n${move}\nreturn { selectProduct, updateRowSection };`);
  return import("../src/lib/scheduleImportReview.js").then(review => {
    const actions = factory(update => { preview = update(preview); }, () => {}, new Map(sections.map(item => [item.id, item])), review.getProductOptions, review.moveImportRow);
    return { actions, current: () => preview };
  });
}

test("manual selection uses section catalog and clears stale product errors without learning an incompatible alias", async () => {
  const option = { selectionKey: "C11::F1", skuCode: "C11", rowPatch: { sku: "คุกกี้ 11", brand: "ระฆังทอง", formulaCode: "F1", bomVersionId: "v1" } };
  const preview = { sections: [{ id: "cream", columns: [column], productOptions: { sku: [option] } }], rows: [{ id: "r1", sectionDefId: "cream", issues: ["สินค้า: ไม่พบสินค้าหรือสูตรที่ตรง"], rowData: {}, products: [{ columnKey: "sku", status: "review", selectedKey: "", candidates: [] }] }] };
  const { actions, current } = await modalFunctions(preview);
  actions.selectProduct("r1", "sku", "C11::F1");
  const row = current().rows[0];
  assert.equal(row.rowData.sku, "คุกกี้ 11");
  assert.equal(row.products[0].userConfirmed, true);
  assert.equal(row.products[0].learnAlias, false);
  assert.deepEqual(row.issues, []);
});

test("moving section removes old choices/SKU/formula and rebinds target columns and shift", async () => {
  const old = { id: "old", columns: [column, { key: "qty", label: "จำนวนงาน", col_type: "number" }] };
  const target = { id: "new", columns: [{ ...column, key: "jamSku", auto_fill_field: "jamBrand" }, { key: "jamQty", label: "จำนวนงาน", col_type: "number" }, { key: "time", label: "เวลา", col_type: "shift" }], productOptions: { jamSku: [{ selectionKey: "J1::F1" }] }, shifts: [{ id: "s-new", code: "SHIFT1", name: "กะ 1", startTime: "07:00", endTime: "19:00" }] };
  const { actions, current } = await modalFunctions({ sections: [old, target], rows: [{ id: "r1", sectionDefId: "old", issues: [], warnings: [], rowData: { sku: "คุกกี้", brand: "ระฆังทอง", qty: 14, formulaCode: "F1", bomVersionId: "old-v", shiftId: "old-s" }, products: [{ columnKey: "sku", sourceProduct: "ต้นฉบับ", selectedKey: "C1::F1", candidates: [{ selectionKey: "C1::F1" }], userConfirmed: true, learnAlias: true }] }] });
  actions.updateRowSection("r1", "new");
  const row = current().rows[0];
  assert.equal(row.sectionDefId, "new");
  assert.equal(row.rowData.jamQty, 14);
  assert.equal(row.rowData.sku, undefined);
  assert.equal(row.rowData.jamSku, null);
  assert.equal(row.rowData.bomVersionId, undefined);
  assert.equal(row.rowData.shiftId, "s-new");
  assert.equal(row.products[0].columnKey, "jamSku");
  assert.equal(row.products[0].selectedKey, "");
  assert.deepEqual(row.products[0].candidates, []);
  assert.equal(row.products[0].learnAlias, false);
});

test("save accepts explicit manual corrections but still rejects foreign scope, missing BOM and wrong formula", async () => {
  const source = readFileSync(new URL("../src/app/api/production-planning/schedule/plans/[id]/rows/route.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
  const chosen = { ...catalog[0], name: "คุกกี้ วานิลลา 5 กก." };
  const factory = new Function("loadTemplate", "loadScheduleSkuCatalog", "loadScheduleImportScopes", "isProductInImportScope", "matchesImportProduct", "normalizeImportText", `${source};return validateVisionRows;`);
  const validate = factory(async () => ({ dept_id: "d1", sections: [{ ...section, production_schedule_column_defs: [column, { key: "brand", col_type: "brand_auto" }] }] }), async () => [chosen], async () => new Map([["cream", ["cookie"]]]), isProductInImportScope, vision.matchesImportProduct, vision.normalizeImportText);
  const db = { from(table) {
    const query = { select() { return query; }, eq() { return query; }, in() { return query; }, is() { return query; },
      maybeSingle() { return Promise.resolve({ data: { dept_id: "d1", template_id: "t1", week_start_date: "2026-10-19", period_end: "2026-10-23" } }); },
      then(resolve) { assert.equal(table, "production_section_shifts"); return Promise.resolve({ data: [] }).then(resolve); } };
    return query;
  } };
  const input = { sectionDefId: "cream", dayKey: "2026-10-19", rowData: { sku: chosen.name, brand: chosen.brand, formulaCode: "F1", bomVersionId: "v1", visionProductSources: [{ columnKey: "sku", sourceBrand: "ระฆังทอง", sourceProduct: "คุกกี้ ครีมทุเรียน", sourceSize: "XL", userConfirmed: false }] } };
  await assert.rejects(validate(db, "p1", [input]), /ไม่ผ่านเงื่อนไข/);
  input.rowData.visionProductSources[0].userConfirmed = true;
  await assert.doesNotReject(validate(db, "p1", [input]));
  chosen.subcategoryId = "jam";
  await assert.rejects(validate(db, "p1", [input]), /นอกหมวด/);
  chosen.subcategoryId = "cookie";
  chosen.hasBom = false;
  await assert.rejects(validate(db, "p1", [input]), /ไม่มี BOM/);
  chosen.hasBom = true;
  input.rowData.bomVersionId = "unapproved";
  await assert.rejects(validate(db, "p1", [input]), /BOM ที่อนุมัติ/);
});
