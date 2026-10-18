import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildImportSignature,
  buildVisionExtractionSchema,
  buildVisionPrompt,
  parseImportNumber,
  resolveVisionRows,
} from "../src/lib/scheduleVisionImport.js";

const sectionId = "section-wafer";

async function departmentCatalog(db, departmentId) {
  const source = readFileSync(new URL("../src/lib/scheduleSkuCatalog.js", import.meta.url), "utf8")
    .replace('import "server-only";', "")
    .replace('"@/lib/supabaseRangeFetch"', JSON.stringify(new URL("../src/lib/supabaseRangeFetch.js", import.meta.url).href));
  const { loadScheduleSkuCatalog } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return loadScheduleSkuCatalog(db, undefined, departmentId);
}

function catalogDatabase({ mappingError = null, leadingProducts = 0 } = {}) {
  const tables = {
    products_cache: [
      ...Array.from({ length: leadingProducts }, (_, i) => ({ sku_code: `UNMAPPED-${i}`, sku_name: `อื่น ${i}`, iccat_code: "04", is_active: true })),
      { sku_code: "VL0-5001", sku_name: "เวเฟอร์สติ๊ก ช็อก 5 กก.", brand_name: "ระฆังทอง", iccat_code: "04", is_active: true },
      { sku_code: "BL0-5004", sku_name: "คุกกี้ ช็อก", iccat_code: "04", is_active: true },
    ],
    production_department_products: [
      ...Array.from({ length: 1000 }, (_, i) => ({ department_id: "WAFER", sku_code: `OTHER-${i}` })),
      { department_id: "WAFER", sku_code: "VL0-5001" },
      { department_id: "BISCUIT", sku_code: "BL0-5004" },
    ],
    production_wip_policies: [],
    production_boms: [{ id: "B1", sku_code: "VL0-5001" }, { id: "B2", sku_code: "BL0-5004" }],
    production_bom_versions: [
      { id: "V1", bom_id: "B1", formula_code: "F2", status: "approved", deleted_at: null },
      { id: "V2", bom_id: "B2", formula_code: "F2", status: "approved", deleted_at: null },
    ],
  };
  return { from(table) {
    let rows = [...(tables[table] || [])];
    const query = {
      select() { return query; }, order() { return query; }, limit(n) { rows = rows.slice(0, n); return query; },
      eq(k, v) { rows = rows.filter(row => row[k] === v); return query; },
      in(k, vs) { rows = rows.filter(row => vs.includes(row[k])); return query; },
      is(k, v) { rows = rows.filter(row => (row[k] ?? null) === v); return query; },
      range(from, to) { rows = rows.slice(from, to + 1); return query; },
      then(resolve) { return Promise.resolve({ data: rows, error: table === "production_department_products" ? mappingError : null }).then(resolve); },
    };
    return query;
  } };
}

test("Vision catalog only includes mapped department products, including mappings beyond 1000 rows", async () => {
  const catalog = await departmentCatalog(catalogDatabase(), "WAFER");
  assert.deepEqual(catalog.map(row => row.skuCode), ["VL0-5001"]);
  assert.equal(catalog[0].hasBom, true);
});

test("Vision catalog never falls back to other departments when no mappings exist or loading fails", async () => {
  assert.deepEqual(await departmentCatalog(catalogDatabase(), "EMPTY"), []);
  await assert.rejects(departmentCatalog(catalogDatabase({ mappingError: new Error("mapping unavailable") }), "WAFER"), /mapping unavailable/);
});

test("department Vision catalog is not cut off by the global product catalog limit", async () => {
  const catalog = await departmentCatalog(catalogDatabase({ leadingProducts: 2100 }), "WAFER");
  assert.deepEqual(catalog.map(row => row.skuCode), ["VL0-5001"]);
});

test("unscoped schedule catalog retains its existing products", async () => {
  const catalog = await departmentCatalog(catalogDatabase(), undefined);
  assert.deepEqual(catalog.map(row => row.skuCode).sort(), ["BL0-5004", "VL0-5001"]);
});

test("a saved cross-department alias cannot reintroduce a product into Vision choices", async () => {
  const catalog = await departmentCatalog(catalogDatabase(), "WAFER");
  const source = { columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "XL" };
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [source], cells: [{ columnKey: "qty", rawValue: "13" }] }] },
    template, catalog, shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
    aliases: [{ section_def_id: sectionId, product_column_key: "skuName", sku_code: "BL0-5004", formula_code: "F2",
      source_signature: buildImportSignature({ brand: source.sourceBrand, product: source.sourceProduct, size: source.sourceSize }) }],
  });
  assert.ok(row.products[0].candidates.length > 0);
  assert.deepEqual([...new Set(row.products[0].candidates.map(item => item.skuCode))], ["VL0-5001"]);
  assert.equal(row.rowData.skuName, "เวเฟอร์สติ๊ก ช็อก 5 กก.");
});
const template = {
  name: "แผนกเวเฟอร์สติ๊ก",
  sections: [{
    id: sectionId,
    name: "วางแผนแผนกเวเฟอร์สติ๊ก",
    production_schedule_column_defs: [
      { key: "time", label: "เวลา", col_type: "shift", display_order: 1 },
      { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
      { key: "skuName", label: "สินค้า", col_type: "sku_picker", display_order: 3, auto_fill_field: "brand" },
      { key: "qty", label: "จำนวนชุดแป้ง", col_type: "number", display_order: 4 },
    ],
  }],
};
const product = {
  skuCode: "VL0-5001",
  name: "เวเฟอร์สติ๊ก รสช็อก 5 กก. (1 ปี๊บ)",
  brand: "ระฆังทอง",
  unit: "ปี๊บ",
  hasBom: true,
  formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-1" }],
};
const shiftsBySection = new Map([[sectionId, [{
  id: "shift-2",
  code: "SHIFT2",
  name: "กะ 2",
  startTime: "19:00",
  endTime: "04:00",
}]]]);

test("wafer gram sizes match without Switzerland in the catalog name and reject other packs", () => {
  const correct = { ...product, skuCode: "VL0-4005", name: "เวเฟอร์สติ๊ก รสช็อก 400 ก. (12ปี๊บ)" };
  const wrong = { ...product, skuCode: "VL0-0180", name: "สติ๊ก ครีมช็อกฯ รุ่น Switzerland 180 กรัม" };
  for (const size of ["400g", "400 ก.", "400 กรัม"]) {
    const source = { columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ รุ่น Switzerland", sourceSize: size };
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [source], cells: [{ columnKey: "qty", rawValue: "13" }] }] },
      template, catalog: [wrong, product, correct, { ...correct, skuCode: "COOKIE", name: "คุกกี้แซนวิช ช็อก 400 กรัม" }],
      aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: source.sourceBrand, product: source.sourceProduct, size }), sku_code: product.skuCode, formula_code: "DEFAULT" }],
      shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
    });
    assert.equal(row.rowData.skuName, correct.name);
    assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), ["VL0-4005"]);
    assert.equal(row.rowData.qty, 13);
  }
});

test("wafer explicit gram size without an available match requires review instead of another size", () => {
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "400g" }], cells: [] }] },
    template, catalog: [product], aliases: [], shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
  });
  assert.equal(row.rowData.skuName, null);
  assert.equal(row.products[0].status, "review");
  assert.deepEqual(row.products[0].candidates, []);
  assert.ok(row.issues.length > 0);
});

test("wafer 180g and size printed in the product text retain their own pack sizes", () => {
  const small = { ...product, skuCode: "VL0-0180", name: "เวเฟอร์สติ๊ก รสช็อก 180 กรัม" };
  const large = { ...product, skuCode: "VL0-4005", name: "เวเฟอร์สติ๊ก รสช็อก 400 ก. (12ปี๊บ)" };
  for (const [sourceProduct, sourceSize, expected] of [
    ["สติ๊ก ครีมช็อกฯ", "180g", small.name],
    ["สติ๊ก ครีมช็อกฯ รุ่น Switzerland 400g", null, large.name],
  ]) {
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct, sourceSize }], cells: [] }] },
      template, catalog: [product, small, large], aliases: [], shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
    });
    assert.equal(row.rowData.skuName, expected);
    assert.equal(row.products[0].candidates.length, 1);
  }
});

test("wafer product families cannot be overridden by a learned alias for another family", () => {
  const variants = [
    product,
    { ...product, skuCode: "VL0-5010", name: "เวเฟอร์สติ๊กลายจุด ครีมช็อก 5 กก. (1 ปี๊บ)" },
    { ...product, skuCode: "RAINBOW", name: "เรนโบว์ เวเฟอร์สติ๊ก ครีมช็อก 5 กก. (1 ปี๊บ)" },
    { ...product, skuCode: "FANCY", name: "เวเฟอร์สติ๊กแฟนซี ครีมช็อก 5 กก. (1 ปี๊บ)" },
  ];
  for (const [text, sku, badAlias] of [
    ["สติ๊ก ครีมช็อกฯ", "VL0-5001", "VL0-5010"],
    ["สติ๊กลายจุด ครีมช็อกฯ", "VL0-5010", "VL0-5001"],
    ["เรนโบว์ ครีมช็อกฯ", "RAINBOW", "VL0-5001"],
    ["แฟนซี ครีมช็อกฯ", "FANCY", "RAINBOW"],
  ]) {
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: text, sourceSize: "XL" }], cells: [] }] },
      template, catalog: variants,
      aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: "ระฆังทอง", product: text, size: "XL" }), sku_code: badAlias, formula_code: "DEFAULT" }],
      shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
    });
    assert.equal(row.products[0].selectedKey, `${sku}::DEFAULT`);
    assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), [sku]);
  }
});

test("plain wafer does not fall back to polka dot when no plain product is available", () => {
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "XL" }], cells: [] }] },
    template, catalog: [{ ...product, skuCode: "VL0-5010", name: "เวเฟอร์สติ๊กลายจุด ครีมช็อก 5 กก. (1 ปี๊บ)" }],
    aliases: [], shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
  });
  assert.equal(row.products[0].selectedKey, "");
  assert.equal(row.products[0].status, "review");
  assert.equal(row.products[0].isExact, false);
});

test("explicit wafer flavor cannot be replaced by another flavor through scoring or a saved alias", () => {
  const orange = { ...product, skuCode: "VL0-5003", name: "เวเฟอร์สติ๊ก รสส้ม 5 กก. (1 ปี๊บ)" };
  for (const catalog of [[orange, product], [orange]]) {
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-09-29", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "XL" }], cells: [] }] },
      template, catalog,
      aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: "ระฆังทอง", product: "สติ๊ก ครีมช็อกฯ", size: "XL" }), sku_code: orange.skuCode, formula_code: "DEFAULT" }],
      shiftsBySection, dateFrom: "2026-09-28", dateTo: "2026-10-03",
    });
    assert.equal(row.products[0].selectedKey, catalog.length === 2 ? "VL0-5001::DEFAULT" : "");
    assert.ok(row.products[0].candidates.every(item => item.skuCode !== orange.skuCode));
  }
});

test("vision schema is constrained to the active template", () => {
  const schema = buildVisionExtractionSchema(template);
  const row = schema.properties.rows.items;
  assert.deepEqual(row.properties.sectionId.enum, [sectionId]);
  assert.deepEqual(row.properties.products.items.properties.columnKey.enum, ["skuName"]);
  assert.deepEqual(row.properties.cells.items.properties.columnKey.enum, ["qty"]);
});

test("multiple matching SKU select the highest ranked candidate without learning an alias", () => {
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-10-19", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "XL" }], cells: [] }] },
    template, catalog: [product, { ...product, skuCode: "SAME-PACK" }], aliases: [], shiftsBySection,
    dateFrom: "2026-10-19", dateTo: "2026-10-23",
  });
  assert.equal(row.products[0].selectedKey, "VL0-5001::DEFAULT");
  assert.equal(row.products[0].learnAlias, false);
  assert.equal(row.products[0].status, "resolved");
  assert.equal(row.products[0].isSuggested, true);
  assert.equal(row.products[0].isExact, false);
  assert.equal(row.products[0].candidates.length, 2);
});

test("multiple approved formulas preselect the first ranked formula but a missing printed formula stays blank", () => {
  const twoFormulas = { ...product, formulaOptions: [...product.formulaOptions, { formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-2" }] };
  for (const formula of [null, "F3"]) {
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-10-19", sourceShift: "กะ 2", products: [{ columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "XL", sourceFormula: formula }], cells: [] }] },
      template, catalog: [twoFormulas], aliases: [], shiftsBySection, dateFrom: "2026-10-19", dateTo: "2026-10-23",
    });
    assert.equal(row.products[0].selectedKey, formula ? "" : "VL0-5001::DEFAULT");
    assert.equal(row.products[0].candidates.length, formula ? 0 : 2);
    assert.equal(row.products[0].learnAlias, false);
  }
});

test("cream import rejects jam bread, wrong flavor and wrong packaging even through aliases", () => {
  const correct = { ...product, skuCode: "COOKIE", name: "คุกกี้ก้นหอย ครีมใบเตย 1.1 กก. (6ปี๊บ)" };
  const bad = [
    { ...correct, skuCode: "JAM", name: "ขนมปังกรอบ แยมสับปะรด 1.1 กก. (6ปี๊บ)" },
    { ...correct, skuCode: "DURIAN", name: "คุกกี้ก้นหอย ครีมทุเรียน 1.1 กก. (6ปี๊บ)" },
    { ...correct, skuCode: "BIG", name: "คุกกี้ก้นหอย ครีมใบเตย 5 กก. (1ปี๊บ)" },
    { ...correct, skuCode: "SANDWICH", name: "คุกกี้แซนวิช ครีมใบเตย 1.1 กก. (6ปี๊บ)" },
  ];
  const source = { columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "คุกกี้ก้นหอย ครีมใบเตย", sourceSize: "L" };
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-10-19", products: [source], cells: [] }] },
    template: { sections: [{ ...template.sections[0], name: "ส่วนงานป้ายครีม" }] }, catalog: [...bad, correct],
    aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: source.sourceBrand, product: source.sourceProduct, size: "L" }), sku_code: "JAM", formula_code: "DEFAULT" }],
    shiftsBySection: new Map(), dateFrom: "2026-10-19", dateTo: "2026-10-23",
  });
  assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), ["COOKIE"]);
  assert.equal(row.products[0].selectedKey, "COOKIE::DEFAULT");
});

test("cream cookie names hard-filter spiral versus milk/sandwich before ranking and learned aliases", () => {
  const creamSection = { ...template.sections[0], name: "ส่วนงานป้ายครีม" };
  const creamProducts = [
    { ...product, skuCode: "GENERIC", name: "คุกกี้ ครีมวานิลลา 5 กก. (1 ปี๊บ)" },
    { ...product, skuCode: "SPIRAL", name: "คุกกี้ก้นหอย ครีมวานิลลา 5 กก. (1 ปี๊บ)" },
    { ...product, skuCode: "SANDWICH", name: "คุกกี้แซนวิส ครีมวานิลลา 5 กก. (1 ปี๊บ)" },
  ];
  for (const [name, expected, wrong] of [
    ["คุกกี้ก้นหอย ครีมวานิลลา", "SPIRAL", "GENERIC"],
    ["ก้นหอย ครีมวานิลลา", "SPIRAL", "SANDWICH"],
    ["คุกกี้นม ครีมวานิลลา", "SANDWICH", "GENERIC"],
  ]) {
    const source = { columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: name, sourceSize: "XL" };
    const resolve = catalog => resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-10-19", products: [source], cells: [] }] },
      template: { sections: [creamSection] }, catalog, shiftsBySection: new Map(),
      aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: source.sourceBrand, product: name, size: "XL" }), sku_code: wrong, formula_code: "DEFAULT" }],
      dateFrom: "2026-10-19", dateTo: "2026-10-23",
    })[0];
    const row = resolve(creamProducts);
    assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), [expected], name);
    assert.equal(row.products[0].selectedKey, `${expected}::DEFAULT`, name);
    const missing = resolve(creamProducts.filter(item => item.skuCode !== expected));
    assert.equal(missing.products[0].selectedKey, "", `must not replace missing ${name} with another family`);
  }
});

test("tin section excludes jam and cookies and selects its single four kg carton candidate", () => {
  const correct = { ...product, skuCode: "ABC4", name: "ขนมปังกรอบ ABC 4 กก. (1 ลัง)", unit: "กล่อง" };
  const source = { columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "ขนมปังกรอบ A B C", sourceSize: "ลัง 4 กก" };
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-10-19", products: [source], cells: [] }] },
    template: { sections: [{ ...template.sections[0], name: "ส่วนขนมปังกรอบบรรจุปี๊บ" }] },
    catalog: [correct, { ...correct, skuCode: "SMALL", name: "ขนมปังกรอบ ABC 1.1 กก. (6ปี๊บ)" }, { ...correct, skuCode: "JAM", name: "ขนมปังกรอบป้ายแยม ABC 4 กก." }, { ...correct, skuCode: "COOKIE", name: "คุกกี้ ABC 4 กก." }],
    aliases: [], shiftsBySection: new Map(), dateFrom: "2026-10-19", dateTo: "2026-10-23",
  });
  assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), ["ABC4"]);
  assert.equal(row.products[0].selectedKey, "ABC4::DEFAULT");
  assert.equal(row.products[0].status, "resolved");
});

test("tin ABC/AEC shares ABC family with exact four kg XL, 1.1 kg L and master carton unit", () => {
  const sec = { ...template.sections[0], name: "ส่วนขนมปังกรอบบรรจุปี๊บ" };
  const catalog = [
    { ...product, skuCode: "ABC-XL", name: "ขนมปังกรอบ รสเค็มรูป ABC 4 กก. (1 ปี๊บ)", unit: "ปี๊บ" },
    { ...product, skuCode: "BL0-5031", name: "ขนมปังกรอบ รสเค็มรูป ABC 4 กก. (1 ถุง)", unit: "กล่อง" },
    { ...product, skuCode: "ABC-L", name: "ขนมปังกรอบ ABC 1.1 กก. (6 ปี๊บ)", unit: "กล่อง×6ปี๊บ", brand: "แม่มะลิ" },
    { ...product, skuCode: "BAD-5", name: "ขนมปังกรอบ ABC 5 กก. (1 ปี๊บ)", unit: "ปี๊บ" },
    { ...product, skuCode: "BAD-12", name: "ขนมปังกรอบ ABC 1.2 กก. (6 ปี๊บ)", brand: "แม่มะลิ" },
    { ...product, skuCode: "BAD-UNIT", name: "ขนมปังกรอบ ABC 4 กก. (1 กล่อง)", unit: "ถุง" },
    { ...product, skuCode: "OTHER", name: "ขนมปังกรอบ รสเค็ม 4 กก. (1 ปี๊บ)", unit: "ปี๊บ" },
  ];
  for (const [text, size, brand, expected] of [
    ["ขนมปังกรอบ A B C", "XL", "ระฆังทอง", ["ABC-XL", "BL0-5031", "BAD-UNIT"]],
    ["ขนมปังกรอบ A E C", "L", "KPF", ["ABC-L"]],
    ["ขนมปังกรอบ AEC", "ลัง 4 กก.", "ระฆังทอง", ["BL0-5031"]],
    ["ขนมปังกรอบ ABC", "XL", "KPF", []],
  ]) {
    const source = { columnKey: "skuName", sourceBrand: brand, sourceProduct: text, sourceSize: size };
    const [row] = resolveVisionRows({ extraction: { rows: [{ sectionId, workDate: "2026-10-19", products: [source], cells: [] }] }, template: { sections: [sec] }, catalog, aliases: [], shiftsBySection: new Map(), dateFrom: "2026-10-19", dateTo: "2026-10-23" });
    assert.deepEqual(row.products[0].candidates.map(item => item.skuCode).sort(), [...expected].sort(), `${text} ${size} ${brand}`);
    if (expected.length === 1) assert.equal(row.products[0].selectedKey, `${expected[0]}::DEFAULT`);
    if (!expected.length) assert.equal(row.products[0].selectedKey, "");
  }
});

test("section category scope filters candidates and saved aliases before matching", () => {
  const allowed = { ...product, subcategoryId: "cookie" };
  const outside = { ...product, skuCode: "OUTSIDE", subcategoryId: "jam" };
  const source = { columnKey: "skuName", sourceBrand: "ระฆังทอง", sourceProduct: "สติ๊ก ครีมช็อกฯ", sourceSize: "XL" };
  for (const ids of [["cookie"], []]) {
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId, workDate: "2026-10-19", sourceShift: "กะ 2", products: [source], cells: [] }] },
      template, catalog: [outside, allowed], scopesBySection: new Map([[sectionId, ids]]),
      aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: source.sourceBrand, product: source.sourceProduct, size: "XL" }), sku_code: "OUTSIDE", formula_code: "DEFAULT" }],
      shiftsBySection, dateFrom: "2026-10-19", dateTo: "2026-10-23",
    });
    assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), ids.length ? [product.skuCode] : []);
    assert.equal(row.products[0].selectedKey, ids.length ? `${product.skuCode}::DEFAULT` : "");
  }
});

test("jam import keeps per-row brand and uses waiting-for-packaging only for WIP", () => {
  const jamTemplate = { sections: [{ id: "jam", name: "ส่วนงานป้ายแยม", production_schedule_column_defs: [
    { key: "brand", col_type: "brand_auto" },
    { key: "jamSku", label: "สินค้า", col_type: "sku_picker", auto_fill_field: "brand" },
    { key: "jamPeople", col_type: "number" }, { key: "jamQty", col_type: "number" },
  ] }] };
  const fg = { ...product, skuCode: "TEST-FG", name: "ขนมปังกรอบ แยมสตรอ", brand: "ระฆังทอง", itemType: "FG" };
  const wip = { ...product, skuCode: "TEST-WIP", name: "เนื้อขนมป้ายแยมสตรอ", brand: "ไม่กำหนดยี่ห้อ", itemType: "WIP" };
  for (const [brand, sku] of [["ระฆังทอง", fg.skuCode], ["รอบรรจุ", wip.skuCode], ["รอบบรรจุ", wip.skuCode]]) {
    const source = { columnKey: "jamSku", sourceBrand: brand, sourceProduct: "ขนมปังกรอบ แยมสตรอฯ", sourceSize: "-" };
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId: "jam", workDate: "2026-10-19", products: [source], cells: [{ columnKey: "jamPeople", rawValue: "9" }, { columnKey: "jamQty", rawValue: "68" }] }] },
      template: jamTemplate, catalog: [wip, fg],
      aliases: [{ section_def_id: "jam", product_column_key: "jamSku", source_signature: buildImportSignature({ brand, product: source.sourceProduct, size: "-" }), sku_code: sku === fg.skuCode ? wip.skuCode : fg.skuCode, formula_code: "DEFAULT" }],
      shiftsBySection: new Map(), dateFrom: "2026-10-19", dateTo: "2026-10-23",
    });
    assert.equal(row.products[0].selectedKey, `${sku}::DEFAULT`);
    assert.equal(row.products[0].sourceBrand, brand);
    assert.equal(row.rowData.brand, sku === fg.skuCode ? "ระฆังทอง" : "ไม่กำหนดยี่ห้อ");
    assert.equal(row.rowData.jamPeople, 9);
    assert.equal(row.rowData.jamQty, 68);
    assert.deepEqual(row.products[0].candidates.map(item => item.skuCode), [sku]);
  }
});

test("jam blueberry without BOM never falls back to strawberry, even through a saved alias", () => {
  const strawberry = { ...product, skuCode: "TEST-STRAW", name: "เนื้อขนม BEEVER ป้ายแยมสตรอ", itemType: "WIP" };
  const blueberry = { ...strawberry, skuCode: "TEST-BLUE", name: "เนื้อขนม BEEVER บลูเบอร์รี่", hasBom: false, formulaOptions: [] };
  const source = { columnKey: "skuName", sourceBrand: "รอบรรจุ", sourceProduct: "เนื้อขนม BEEVER บลูเบอร์รี่", sourceSize: "-" };
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-10-19", products: [source], cells: [] }] },
    template: { sections: [{ ...template.sections[0], name: "ส่วนงานป้ายแยม" }] }, catalog: [strawberry, blueberry],
    aliases: [{ section_def_id: sectionId, product_column_key: "skuName", source_signature: buildImportSignature({ brand: source.sourceBrand, product: source.sourceProduct, size: "-" }), sku_code: strawberry.skuCode, formula_code: "DEFAULT" }],
    shiftsBySection: new Map(), dateFrom: "2026-10-19", dateTo: "2026-10-23",
  });
  assert.equal(row.products[0].selectedKey, "");
  assert.equal(row.products[0].status, "review");
  assert.deepEqual(row.products[0].candidates, []);
});

test("production numbers accept units but reject mixed text", () => {
  assert.equal(parseImportNumber("1,234 กก."), 1234);
  assert.equal(parseImportNumber("75 กระบะ"), 75);
  assert.equal(parseImportNumber("148 ลัง"), 148);
  assert.equal(parseImportNumber("356 ปี๊บ"), 356);
  assert.equal(parseImportNumber("—"), null);
  assert.equal(parseImportNumber("ประมาณ 14"), undefined);
});

test("biscuit import resolves shift one per section and preserves each printed header time", () => {
  const sections = [
    { id: "cream", name: "ส่วนงานป้ายครีม" },
    { id: "jam", name: "ส่วนงานป้ายแยม" },
    { id: "tin", name: "ส่วนขนมปังกรอบบรรจุปี๊บ" },
  ].map(section => ({ ...section, production_schedule_column_defs: [{ key: "time", col_type: "shift" }] }));
  const shifts = new Map(sections.map(section => [section.id, [{ id: `${section.id}-shift`, code: "SHIFT1", name: "กะ 1", startTime: "07:00", endTime: "16:00" }]]));
  const rows = resolveVisionRows({
    extraction: { rows: sections.map((section, i) => ({ sectionId: section.id, workDate: "2026-10-19", sourceShift: i === 2 ? "07.00 - 17.00" : "07.00 - 19.00", products: [], cells: [] })) },
    template: { name: "แผนกบิสกิต", sections }, catalog: [], aliases: [], shiftsBySection: shifts,
    dateFrom: "2026-10-19", dateTo: "2026-10-23",
  });
  rows.forEach((row, i) => {
    assert.deepEqual(row.issues, []);
    assert.equal(row.rowData.shiftId, `${sections[i].id}-shift`);
    assert.equal(row.rowData.shiftCode, "SHIFT1");
    assert.equal(row.rowData.workStartTime, "07:00");
    assert.equal(row.rowData.workEndTime, i === 2 ? "17:00" : "19:00");
    assert.equal(row.rowData.time, i === 2 ? "กะ 1 (07:00-17:00)" : "กะ 1 (07:00-19:00)");
  });
});

test("biscuit import never borrows another section's shift when none is assigned", () => {
  const [row] = resolveVisionRows({
    extraction: { rows: [{ sectionId, workDate: "2026-10-19", sourceShift: "07.00 - 19.00", products: [], cells: [] }] },
    template: { name: "บิสกิต", sections: template.sections }, catalog: [], aliases: [],
    shiftsBySection: new Map([["other", [{ id: "other-shift", code: "SHIFT1", name: "กะ 1" }]]]),
    dateFrom: "2026-10-19", dateTo: "2026-10-23",
  });
  assert.equal(row.rowData.shiftId, undefined);
  assert.ok(row.issues.some(issue => issue.includes("จับคู่กะไม่ได้")));
});

test("confirmed alias resolves SKU, brand, BOM and shift without model guessing", () => {
  const sourceProduct = {
    columnKey: "skuName",
    sourceBrand: "ระฆังทอง",
    sourceProduct: "สติ๊ก ครีมช็อกฯ",
    sourceSize: "XL",
    sourceFormula: null,
  };
  const extraction = {
    rows: [{
      sectionId,
      workDate: "2026-09-29",
      sourceRowLabel: "แถว 2 กะ 2",
      sourceShift: "กะ 2",
      cells: [{ columnKey: "qty", rawValue: "13 ชุด" }],
      products: [sourceProduct],
      uncertainFields: [],
    }],
  };
  const aliases = [{
    section_def_id: sectionId,
    product_column_key: "skuName",
    source_signature: buildImportSignature({
      brand: sourceProduct.sourceBrand,
      product: sourceProduct.sourceProduct,
      size: sourceProduct.sourceSize,
    }),
    sku_code: product.skuCode,
    formula_code: "DEFAULT",
  }];

  const [row] = resolveVisionRows({
    extraction,
    template,
    catalog: [product],
    aliases,
    shiftsBySection,
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });

  assert.deepEqual(row.issues, []);
  assert.equal(row.rowData.qty, 13);
  assert.equal(row.rowData.skuName, product.name);
  assert.equal(row.rowData.brand, "ระฆังทอง");
  assert.equal(row.rowData.bomVersionId, "bom-1");
  assert.equal(row.rowData.shiftId, "shift-2");
});

test("a single high-confidence candidate resolves without learning an alias", () => {
  const [row] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId,
        workDate: "2026-09-29",
        sourceRowLabel: null,
        sourceShift: "กะ 2",
        cells: [{ columnKey: "qty", rawValue: "13" }],
        products: [{
          columnKey: "skuName",
          sourceBrand: "ระฆังทอง",
          sourceProduct: "สติ๊ก ครีมช็อกฯ",
          sourceSize: "XL",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template,
    catalog: [product],
    aliases: [],
    shiftsBySection,
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });

  assert.equal(row.rowData.skuName, product.name);
  assert.equal(row.products[0].status, "resolved");
  assert.equal(row.products[0].selectedKey, `${product.skuCode}::DEFAULT`);
  assert.deepEqual(row.issues, []);
});

test("maintenance or cleaning rows with note are accepted without product errors", () => {
  const templateWithNote = {
    ...template,
    sections: [{
      ...template.sections[0],
      production_schedule_column_defs: [
        ...template.sections[0].production_schedule_column_defs,
        { key: "note", label: "หมายเหตุ", col_type: "text", display_order: 5 },
      ],
    }],
  };

  const [row] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId,
        workDate: "2026-09-29",
        sourceRowLabel: null,
        sourceShift: "กะ 2",
        cells: [
          { columnKey: "qty", rawValue: null },
          { columnKey: "note", rawValue: "ล้างเตาอบไอน้ำ / เตาเบิร์นเนอร์" },
        ],
        products: [],
        uncertainFields: [],
      }],
    },
    template: templateWithNote,
    catalog: [product],
    aliases: [],
    shiftsBySection,
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });

  assert.deepEqual(row.issues, []);
  assert.equal(row.rowData.note, "ล้างเตาอบไอน้ำ / เตาเบิร์นเนอร์");
});

test("brand KPF resolves to Mae Mali and prison section selects prison formula", () => {
  const prisonSectionId = "section-prison";
  const prisonTemplate = {
    name: "แผนกบิสกิต",
    sections: [{
      id: prisonSectionId,
      name: "บรรจุปี๊บงานเรือนจำ",
      production_schedule_column_defs: [
        { key: "skuName", label: "ผลิตภัณฑ์", col_type: "sku_picker", display_order: 1 },
      ],
    }],
  };
  const biscuitCatalog = [
    {
      skuCode: "BL0-5001",
      name: "ขนมปังกรอบ แยมสับปะรด 5 กก. (ตราแม่มะลิ)",
      brand: "แม่มะลิ",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [
        { formula_code: "STD", formula_name: "สูตรปกติ", bom_version_id: "bom-std" },
        { formula_code: "V2", formula_name: "บรรจุเรือนจำ", bom_version_id: "bom-rj" },
      ],
    },
    {
      skuCode: "BL0-5002",
      name: "ขนมปังกรอบ แยมสับปะรด (ตราระฆังทอง)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [
        { formula_code: "STD", formula_name: "สูตรปกติ", bom_version_id: "bom-rakhang" },
      ],
    },
  ];

  const [row] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: prisonSectionId,
        workDate: "2026-09-29",
        sourceRowLabel: null,
        sourceShift: null,
        cells: [],
        products: [{
          columnKey: "skuName",
          sourceBrand: "KPF",
          sourceProduct: "ขนมปังกรอบ แยมสับปะรด",
          sourceSize: "XL",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: prisonTemplate,
    catalog: biscuitCatalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });

  // Must choose Mae Mali because sourceBrand is KPF:
  assert.equal(row.rowData.skuName, "ขนมปังกรอบ แยมสับปะรด 5 กก. (ตราแม่มะลิ)");
  // Must choose the prison formula (V2 / บรรจุเรือนจำ) because section is บรรจุปี๊บงานเรือนจำ:
  assert.equal(row.rowData.formulaCode, "V2");
  assert.equal(row.rowData.formulaName, "บรรจุเรือนจำ");
  assert.equal(row.products[0].status, "resolved");
});

test("packaging rules: บรรจุลัง selects ถุง, while XL and L select ปี๊บ", () => {
  const chickenSectionId = "section-chicken";
  const chickenTemplate = {
    name: "แผนกขาไก่",
    sections: [{
      id: chickenSectionId,
      name: "วางแผนแผนกขาไก่",
      production_schedule_column_defs: [
        { key: "skuName", label: "สินค้า", col_type: "sku_picker", display_order: 1 },
      ],
    }],
  };
  const chickenCatalog = [
    {
      skuCode: "KL0-5015",
      name: "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1ถุง)",
      brand: "ระฆังทอง",
      unit: "กล่อง",
      hasBom: true,
      formulaOptions: [{ formula_code: "F1", formula_name: "สูตร 1", bom_version_id: "bom-f1" }],
    },
    {
      skuCode: "KL0-5003",
      name: "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "F1", formula_name: "สูตร 1", bom_version_id: "bom-f1" }],
    },
    {
      skuCode: "KL0-1102",
      name: "ขนมขาไก่ ทรงเครื่อง 5 รส 1.1 กก. (6ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "กล่อง*6ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "F1", formula_name: "สูตร 1", bom_version_id: "bom-f1" }],
    },
  ];

  // 1. บรรจุลัง -> must choose KL0-5015 (ถุง)
  const [rowCarton] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: chickenSectionId,
        workDate: "2026-10-05", // Next week outside 2026-09-28..2026-10-03
        sourceRowLabel: null,
        sourceShift: null,
        cells: [],
        products: [{
          columnKey: "skuName",
          sourceBrand: "ระฆังทอง",
          sourceProduct: "ขนมขาไก่ 5 รส",
          sourceSize: "บรรจุลัง",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: chickenTemplate,
    catalog: chickenCatalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });
  assert.equal(rowCarton.rowData.skuName, "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1ถุง)");
  assert.equal(rowCarton.issues.length, 0); // Must NOT block with issues
  assert.ok(rowCarton.warnings.some((w) => w.includes("อยู่นอกช่วงแผนเดิม"))); // Flagged in warnings

  // 2. XL -> must choose KL0-5003 (ปี๊บ 5 กก.)
  const [rowXl] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: chickenSectionId,
        workDate: "2026-10-05",
        sourceRowLabel: null,
        sourceShift: null,
        cells: [],
        products: [{
          columnKey: "skuName",
          sourceBrand: "ระฆังทอง",
          sourceProduct: "ขนมขาไก่ 5 รส",
          sourceSize: "XL",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: chickenTemplate,
    catalog: chickenCatalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });
  assert.equal(rowXl.rowData.skuName, "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1 ปี๊บ)");
  assert.ok(rowXl.products[0].candidates.some(item => item.name === "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1 ปี๊บ)"));
  assert.equal(rowXl.products[0].status, "resolved");

  // 3. L -> must choose KL0-1102 (ปี๊บ 1.1 กก.)
  const [rowL] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: chickenSectionId,
        workDate: "2026-10-05",
        sourceRowLabel: null,
        sourceShift: null,
        cells: [],
        products: [{
          columnKey: "skuName",
          sourceBrand: "ระฆังทอง",
          sourceProduct: "ขนมขาไก่ 5 รส",
          sourceSize: "L",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: chickenTemplate,
    catalog: chickenCatalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-09-28",
    dateTo: "2026-10-03",
  });
  assert.equal(rowL.rowData.skuName, "ขนมขาไก่ ทรงเครื่อง 5 รส 1.1 กก. (6ปี๊บ)");
  assert.ok(rowL.products[0].candidates.some(item => item.name === "ขนมขาไก่ ทรงเครื่อง 5 รส 1.1 กก. (6ปี๊บ)"));
  assert.equal(rowL.products[0].status, "resolved");
});

test("chicken department: size '-' or brand 'เนื้อขนม' selects WIP, packWeight 5000 selects bag", () => {
  const chickenSectionId = "section-chicken-wip";
  const chickenTemplate = {
    name: "แผนกขาไก่",
    sections: [{
      id: chickenSectionId,
      name: "วางแผนแผนกขาไก่",
      production_schedule_column_defs: [
        { key: "skuName", label: "สินค้า", col_type: "sku_picker", display_order: 1 },
        { key: "packWeight", label: "น้ำหนักบรรจุ (กรัม)", col_type: "number", display_order: 2 },
        { key: "size", label: "ไซส์", col_type: "text", display_order: 3 },
      ],
    }],
  };
  const catalog = [
    {
      skuCode: "KL0-5015",
      name: "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1ถุง)",
      brand: "ระฆังทอง",
      unit: "กล่อง",
      itemType: "FG",
      hasBom: true,
      formulaOptions: [{ formula_code: "F1", formula_name: "สูตร 1", bom_version_id: "bom-f1" }],
    },
    {
      skuCode: "KL0-5003",
      name: "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      itemType: "FG",
      hasBom: true,
      formulaOptions: [{ formula_code: "F1", formula_name: "สูตร 1", bom_version_id: "bom-f1" }],
    },
    {
      skuCode: "WK-7152-1",
      name: "เนื้อขนมขาไก่รสทรงเครื่อง5รส",
      brand: "ไม่กำหนดยี่ห้อ",
      unit: "KG",
      itemType: "WIP",
      hasBom: true,
      formulaOptions: [{ formula_code: "F1", formula_name: "สูตร 1", bom_version_id: "bom-wip" }],
    },
  ];

  // 1. Size "-" in chicken department -> Must choose WIP (WK-7152-1)
  const [rowWipDash] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: chickenSectionId,
        workDate: "2026-10-05",
        sourceRowLabel: null,
        sourceShift: null,
        cells: [
          { columnKey: "size", rawValue: "-" },
        ],
        products: [{
          columnKey: "skuName",
          sourceBrand: "ระฆังทอง",
          sourceProduct: "ขาไก่ 5 รส",
          sourceSize: "-",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: chickenTemplate,
    catalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-10-05",
    dateTo: "2026-10-10",
  });
  assert.equal(rowWipDash.rowData.skuName, "เนื้อขนมขาไก่รสทรงเครื่อง5รส");

  // 2. Brand "เนื้อขนม" -> Must choose WIP (WK-7152-1)
  const [rowWipBrand] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: chickenSectionId,
        workDate: "2026-10-05",
        sourceRowLabel: null,
        sourceShift: null,
        cells: [],
        products: [{
          columnKey: "skuName",
          sourceBrand: "เนื้อขนม",
          sourceProduct: "ขาไก่ทรงเครื่อง 5 รส",
          sourceSize: null,
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: chickenTemplate,
    catalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-10-05",
    dateTo: "2026-10-10",
  });
  assert.equal(rowWipBrand.rowData.skuName, "เนื้อขนมขาไก่รสทรงเครื่อง5รส");

  // 3. Size "บรรจุลัง" + packWeight 5000 -> Must choose bag (KL0-5015)
  const [rowBag5000] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: chickenSectionId,
        workDate: "2026-10-05",
        sourceRowLabel: null,
        sourceShift: null,
        cells: [
          { columnKey: "size", rawValue: "บรรจุลัง" },
          { columnKey: "packWeight", rawValue: "5000" },
        ],
        products: [{
          columnKey: "skuName",
          sourceBrand: "ระฆังทอง",
          sourceProduct: "ขาไก่ 5 รส",
          sourceSize: "บรรจุลัง",
          sourceFormula: null,
        }],
        uncertainFields: [],
      }],
    },
    template: chickenTemplate,
    catalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-10-05",
    dateTo: "2026-10-10",
  });
  assert.equal(rowBag5000.rowData.skuName, "ขนมขาไก่ ทรงเครื่อง 5 รส 5 กก. (1ถุง)");
});

test("duplicate alias signatures are correctly identified for upsert deduplication", () => {
  const item1 = { brand: "แม่มะลิ", product: "ขาไก่ 5 กก.", size: null };
  const item2 = { brand: "แม่มะลิ ", product: "ขาไก่ 5 กก.", size: "" };
  const sig1 = buildImportSignature(item1);
  const sig2 = buildImportSignature(item2);
  assert.equal(sig1, sig2);

  const aliasMap = new Map();
  [item1, item2].forEach((item) => {
    const key = `dept-1::sec-1::skuName::${buildImportSignature(item)}`;
    aliasMap.set(key, item);
  });
  assert.equal(aliasMap.size, 1);
});

test("wafer stick department resolves KPF/Mae Mali, Rakhang Thong, Rainbow, Fancy and XL/L accurately", () => {
  const stickSectionId = "section-wafer-stick";
  const stickTemplate = {
    name: "แผนกเวเฟอร์สติ๊ก",
    sections: [{
      id: stickSectionId,
      name: "วางแผนแผนกเวเฟอร์สติ๊ก",
      production_schedule_column_defs: [
        { key: "time", label: "เวลา", col_type: "shift", display_order: 1 },
        { key: "machine", label: "เครื่องจักร", col_type: "text", display_order: 2 },
        { key: "furnace_name", label: "เตา หมายเลข", col_type: "text", display_order: 3 },
        { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 4 },
        { key: "skuName", label: "สินค้า", col_type: "sku_picker", display_order: 5, auto_fill_field: "brand" },
        { key: "qty", label: "จำนวนชุดแป้ง (ชุด)", col_type: "number", display_order: 6 },
        { key: "daily_yield_kg", label: "ขนมที่เดินงานได้ (กก.)", col_type: "number", display_order: 7 },
        { key: "target_packages", label: "จำนวนบรรจุ", col_type: "number", display_order: 8 },
      ],
    }],
  };

  const stickCatalog = [
    {
      skuCode: "V17-0009",
      name: "แม่มะลิ เรนโบว์ เวเฟอร์สติ๊ก ช็อก 5 กก. (1 ปี๊บ)",
      brand: "แม่มะลิ 5 กก.",
      unit: "ปี๊บ/5กก.",
      hasBom: true,
      formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-v170009" }],
    },
    {
      skuCode: "V17-1007",
      name: "แม่มะลิ เรนโบว์ เวเฟอร์สติ๊ก ช็อก 1.1 กก. (6 ปี๊บ)",
      brand: "แม่มะลิ 1.1 กก.",
      unit: "กล่อง*6ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-v171007" }],
    },
    {
      skuCode: "V17-0012",
      name: "แม่มะลิ เรนโบว์ เวเฟอร์สติ๊ก ส้ม 5 กก. (1 ปี๊บ)",
      brand: "แม่มะลิ 5 กก.",
      unit: "ปี๊บ/5กก.",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-v170012" }],
    },
    {
      skuCode: "V17-0020",
      name: "แม่มะลิ แฟนซี เวเฟอร์สติ๊ก สตรอ-ช็อค 5 กก. (1 ปี๊บ)",
      brand: "แม่มะลิ 5 กก.",
      unit: "ปี๊บ(5กก.)",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-v170020" }],
    },
    {
      skuCode: "VL0-5001",
      name: "เวเฟอร์สติ๊ก รสช็อก 5 กก. (1 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-vl05001" }],
    },
    {
      skuCode: "VL0-1104",
      name: "เวเฟอร์สติ๊ก รสช็อก 1.1 กก. (6 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "กล่อง*6ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-vl01104" }],
    },
    {
      skuCode: "VL0-5003",
      name: "เวเฟอร์สติ๊ก รสส้ม 5 กก. (1 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-vl05003" }],
    },
    {
      skuCode: "VL0-5007",
      name: "เวเฟอร์สติ๊กแฟนซี รสสตรอฯ-ช็อกไส้สตรอฯ 5 กก. (1 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-vl05007" }],
    },
    {
      skuCode: "VL0-5010",
      name: "เวเฟอร์สติ๊กลายจุด ครีมช็อก 5 กก. (1 ปี๊บ)",
      brand: "ระฆังทอง",
      unit: "ปี๊บ",
      hasBom: true,
      formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-vl05010" }],
    },
  ];

  const shiftsBySection = new Map([[stickSectionId, [
    { id: "shift-1", code: "SHIFT1", name: "กะ 1", startTime: "07:00", endTime: "16:00" },
    { id: "shift-2", code: "SHIFT2", name: "กะ 2", startTime: "19:00", endTime: "04:00" },
  ]]]);

  const testCases = [
    // Mon: KPF Rainbow Choc XL -> V17-0009
    { brand: "KPF", product: "เรนโบว์ ครีมช็อกฯ", size: "XL", expectedSku: "V17-0009" },
    // Tue: Rakhang Plain Stick Choc XL -> VL0-5001
    { brand: "ระฆังทอง", product: "สติ๊ก ครีมช็อกฯ", size: "XL", expectedSku: "VL0-5001" },
    // Wed shift 1: Rakhang Stick Orange XL -> VL0-5003
    { brand: "ระฆังทอง", product: "สติ๊ก ครีมส้ม", size: "XL", expectedSku: "VL0-5003" },
    // Wed shift 2: KPF Rainbow Orange XL -> V17-0012
    { brand: "KPF", product: "เรนโบว์ ครีมส้ม", size: "XL", expectedSku: "V17-0012" },
    // Thu shift 1: KPF Fancy Straw-Choc XL -> V17-0020
    { brand: "KPF", product: "แฟนซี สตรอ - ช็อก ครีมสตรอฯ", size: "XL", expectedSku: "V17-0020" },
    // Thu shift 2: Rakhang Fancy Straw-Choc XL -> VL0-5007
    { brand: "ระฆังทอง", product: "แฟนซี สตรอ - ช็อก ครีมสตรอฯ", size: "XL", expectedSku: "VL0-5007" },
    // Fri shift 1: KPF Rainbow Choc L -> V17-1007
    { brand: "KPF", product: "เรนโบว์ ครีมช็อกฯ", size: "L", expectedSku: "V17-1007" },
    // Fri shift 2: KPF Polka Dot Choc XL -> VL0-5010
    { brand: "KPF", product: "สติ๊กลายจุด ครีมช็อกฯ", size: "XL", expectedSku: "VL0-5010" },
    // Sat shift 1: Rakhang Stick Choc L -> VL0-1104
    { brand: "ระฆังทอง", product: "สติ๊ก ครีมช็อกฯ", size: "L", expectedSku: "VL0-1104" },
    // Sat shift 2: Rakhang Stick Choc XL -> VL0-5001
    { brand: "ระฆังทอง", product: "สติ๊ก ครีมช็อกฯ", size: "XL", expectedSku: "VL0-5001" },
  ];

  testCases.forEach((tc, idx) => {
    const [resolved] = resolveVisionRows({
      extraction: {
        rows: [{
          sectionId: stickSectionId,
          workDate: "2026-10-05",
          sourceRowLabel: null,
          sourceShift: "กะ 1",
          cells: [
            { columnKey: "machine", rawValue: "3 เลน" },
            { columnKey: "furnace_name", rawValue: "เตา 3" },
            { columnKey: "qty", rawValue: "14" },
            { columnKey: "daily_yield_kg", rawValue: "910" },
            { columnKey: "target_packages", rawValue: "182" },
          ],
          products: [{
            columnKey: "skuName",
            sourceBrand: tc.brand,
            sourceProduct: tc.product,
            sourceSize: tc.size,
            sourceFormula: null,
          }],
          uncertainFields: [],
        }],
      },
      template: stickTemplate,
      catalog: stickCatalog,
      aliases: [],
      shiftsBySection,
      dateFrom: "2026-10-05",
      dateTo: "2026-10-10",
    });

    const expectedProduct = stickCatalog.find((p) => p.skuCode === tc.expectedSku);
    if (tc.brand === "KPF" && /ลายจุด/.test(tc.product)) {
      assert.equal(resolved.rowData.skuName, null, "wrong brand must not resolve even when family matches");
      assert.equal(resolved.products[0].status, "review");
      return;
    }
    assert.equal(
      resolved.rowData.skuName,
      expectedProduct.name,
      `Case ${idx + 1} (${tc.brand} ${tc.product} ${tc.size}) should resolve to ${tc.expectedSku} (${expectedProduct.name}) but got ${resolved.rowData.skuName}`
    );
  });
});

test("biscuit department resolves cream, cracker, jam WIP, and prison products with high accuracy", () => {
  const creamSectionId = "sec-cream";
  const crackerSectionId = "sec-cracker";
  const jamSectionId = "sec-jam";
  const prisonSectionId = "sec-prison";

  const biscuitTemplate = {
    name: "แผนกบิสกิต",
    sections: [
      {
        id: creamSectionId,
        name: "ส่วนงานป้ายครีม",
        production_schedule_column_defs: [
          { key: "time", label: "เวลาทำงาน", col_type: "shift", display_order: 1 },
          { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
          { key: "skuName", label: "ผลิตภัณฑ์", col_type: "sku_picker", auto_fill_field: "brand", display_order: 3 },
          { key: "machine", label: "เครื่อง", col_type: "number", display_order: 4 },
          { key: "qty", label: "จำนวนงาน", col_type: "number", display_order: 5 },
          { key: "note", label: "หมายเหตุ", col_type: "text", display_order: 6 },
        ],
      },
      {
        id: crackerSectionId,
        name: "ส่วนขนมปังกรอบบรรจุปี๊บ",
        production_schedule_column_defs: [
          { key: "time", label: "เวลาทำงาน", col_type: "shift", display_order: 1 },
          { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
          { key: "skuName", label: "ผลิตภัณฑ์", col_type: "sku_picker", auto_fill_field: "brand", display_order: 3 },
          { key: "people", label: "จำนวนคน", col_type: "number", display_order: 4 },
          { key: "qty", label: "จำนวนงาน", col_type: "number", display_order: 5 },
        ],
      },
      {
        id: jamSectionId,
        name: "ส่วนงานป้ายแยม",
        production_schedule_column_defs: [
          { key: "time", label: "เวลา", col_type: "shift", display_order: 1 },
          { key: "jamBrand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
          { key: "jamSku", label: "ผลิตภัณฑ์", col_type: "sku_picker", auto_fill_field: "jamBrand", display_order: 3 },
          { key: "jamPeople", label: "จำนวนคน", col_type: "number", display_order: 4 },
          { key: "jamQty", label: "จำนวนงาน", col_type: "number", display_order: 5 },
        ],
      },
      {
        id: prisonSectionId,
        name: "บรรจุปี๊บงานเรือนจำ",
        production_schedule_column_defs: [
          { key: "time", label: "เวลา", col_type: "shift", display_order: 1 },
          { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
          { key: "skuName", label: "ผลิตภัณฑ์", col_type: "sku_picker", auto_fill_field: "brand", display_order: 3 },
          { key: "people", label: "จำนวนคน", col_type: "number", display_order: 4 },
          { key: "qty", label: "จำนวนงาน", col_type: "number", display_order: 5 },
        ],
      },
    ],
  };

  const biscuitCatalog = [
    // Cream products
    { skuCode: "B01-1001", name: "แม่มะลิ คุกกี้ วานิลลา 5 กก. (1 ปี๊บ)", brand: "แม่มะลิ 5 กก.", unit: "ปี๊บ(5กก.)", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-1" }] },
    { skuCode: "B01-1018", name: "แม่มะลิ คุกกี้ ทุเรียน 1.1 กก. (6 ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-2" }] },
    { skuCode: "B01-1019", name: "แม่มะลิ คุกกี้ วานิลลา 1.1 กก. (6 ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-3" }] },
    { skuCode: "BL0-5027", name: "คุกกี้ก้นหอย ครีมใบเตย 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-4" }] },
    { skuCode: "BL0-1106", name: "คุกกี้ก้นหอย ครีมใบเตย 1.1 กก. (6ปี๊บ)", brand: "ระฆังทอง", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-5" }] },
    { skuCode: "BL0-1101", name: "คุกกี้ก้นหอย ครีมทุเรียน 1.1 กก. (6ปี๊บ)", brand: "ระฆังทอง", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-6" }] },
    { skuCode: "BL0-5024", name: "คุกกี้ก้นหอย ครีมทุเรียน 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-7" }] },
    { skuCode: "BL0-5026", name: "คุกกี้ก้นหอย ครีมวานิลลา 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-8" }] },
    { skuCode: "BL0-5028", name: "คุกกี้ก้นหอย ครีมกาแฟ  5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-9" }] },
    // Cream products - Sandwich cookies (คุกกี้นม)
    { skuCode: "BL0-5005", name: "คุกกี้แซนวิช ครีมวานิลลา 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-22" }] },
    { skuCode: "BL0-5007", name: "คุกกี้แซนวิช ครีมทุเรียน 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-23" }] },
    { skuCode: "BL0-1102", name: "คุกกี้แซนวิส ครีมทุเรียน 1.1 กก. (6ปี๊บ)", brand: "ระฆังทอง", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-24" }] },
    { skuCode: "BL0-5004", name: "คุกกี้แซนวิช ครีมช็อก 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-25" }] },
    { skuCode: "BL0-1107", name: "คุกกี้แซนวิส ครีมช็อก 1.1 กก. (6ปี๊บ)", brand: "ระฆังทอง", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-26" }] },
    { skuCode: "BL0-5008", name: "คุกกี้แซนวิช คุกกี้ครีมสตรอฯ 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-27" }] },
    { skuCode: "WKB-0053", name: "แผนคุกกี้นม", brand: "ไม่กำหนดยี่ห้อ", unit: "KG", itemType: "WIP", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-28" }] },
    // Cracker products
    { skuCode: "B01-1009", name: "แม่มะลิ งาหอม รสงา 5 กก. (1 ปี๊บ)", brand: "แม่มะลิ 5 กก.", unit: "ปี๊บ/5กก.", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2", bom_version_id: "bom-10" }] },
    { skuCode: "BL0-1109", name: "ขนมปังกรอบ รสมะพร้าว 1.1กก. (6ปี๊บ)", brand: "ระฆังทอง", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-11" }] },
    { skuCode: "B06-0005", name: "แม่มะลิ งาหอม รสงา 1.1 กก. (6 ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-12" }] },
    { skuCode: "B06-0006", name: "แม่มะลิ สมุย รสมะพร้าว 1.1 กก. (6 ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-13" }] },
    // Jam WIP products
    { skuCode: "WKB-0065", name: "เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด", brand: "ไม่กำหนดยี่ห้อ", unit: "KG", itemType: "WIP", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-14" }] },
    { skuCode: "WKB-0066", name: "เนื้อขนมบีเวอร์ป้ายแยมสตรอ", brand: "ไม่กำหนดยี่ห้อ", unit: "KG", itemType: "WIP", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-15" }] },
    { skuCode: "WKB-0067", name: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสตรอ", brand: "ไม่กำหนดยี่ห้อ", unit: "KG", itemType: "WIP", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-16" }] },
    { skuCode: "WKB-0002-1", name: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรดเคพี", brand: "ไม่กำหนดยี่ห้อ", unit: "KG", itemType: "WIP", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก", bom_version_id: "bom-17" }] },
    // Prison FG products
    { skuCode: "B03-0003", name: "แม่มะลิ แยมสับปะรด 5 กก. (1 ปี๊บ)", brand: "แม่มะลิ 5 กก.", unit: "ปี๊บ/5กก.", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "เรือนจำ", bom_version_id: "bom-18" }] },
    { skuCode: "BL0-1104", name: "ขนมปังกรอบ แยมสับปะรด 1.1 กก. (6ปี๊บ)", brand: "ระฆังทอง", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "V2", formula_name: "เรือนจำ", bom_version_id: "bom-19" }] },
    { skuCode: "BL0-5001", name: "ขนมปังกรอบ แยมสับปะรด 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "V2", formula_name: "เรือนจำ", bom_version_id: "bom-20" }] },
    { skuCode: "BL0-5030", name: "ขนมปังกรอบ แยมสับปะรด 5 กก. (1ถุง)", brand: "ระฆังทอง", unit: "กล่อง", hasBom: true, formulaOptions: [{ formula_code: "RJ", formula_name: "เรือนจำ", bom_version_id: "bom-21" }] },
  ];

  const testCases = [
    // 1. Cream: KPF Vanilla XL -> B01-1001
    { sectionId: creamSectionId, colKey: "skuName", brand: "KPF", product: "คุกกี้ก้นหอย ครีมวานิลลา", size: "XL", expectedSku: "B01-1001" },
    // 2. Cream: KPF Durian L -> B01-1018
    { sectionId: creamSectionId, colKey: "skuName", brand: "KPF", product: "คุกกี้ก้นหอย ครีมทุเรียน", size: "L", expectedSku: "B01-1018" },
    // 3. Cream: KPF Vanilla L -> B01-1019
    { sectionId: creamSectionId, colKey: "skuName", brand: "KPF", product: "คุกกี้ก้นหอย ครีมวานิลลา", size: "L", expectedSku: "B01-1019" },
    // 4. Cream: Rakhang Pandan XL -> BL0-5027
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้ก้นหอย ครีมใบเตย", size: "XL", expectedSku: "BL0-5027" },
    // 5. Cream: Rakhang Pandan L -> BL0-1106
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้ก้นหอย ครีมใบเตย", size: "L", expectedSku: "BL0-1106" },
    // 6. Cream: Rakhang Durian L -> BL0-1101
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้ก้นหอย ครีมทุเรียน", size: "L", expectedSku: "BL0-1101" },
    // 7. Cream: Rakhang Durian XL -> BL0-5024
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้ก้นหอย ครีมทุเรียน", size: "XL", expectedSku: "BL0-5024" },
    // 8. Cream: Rakhang Vanilla XL -> BL0-5026
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้ก้นหอย ครีมวานิลลา", size: "XL", expectedSku: "BL0-5026" },
    // 9. Cracker: KPF Ngahom XL -> B01-1009
    { sectionId: crackerSectionId, colKey: "skuName", brand: "KPF", product: "แครกเกอร์ \"งาหอม\"", size: "XL", expectedSku: "B01-1009" },
    // 10. Cracker: Rakhang Coconut L -> BL0-1109
    { sectionId: crackerSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "ขนมปังกรอบ รสมะพร้าว", size: "L", expectedSku: "BL0-1109" },
    // 11. Cracker: KPF Ngahom L -> B06-0005
    { sectionId: crackerSectionId, colKey: "skuName", brand: "KPF", product: "แครกเกอร์ \"งาหอม\"", size: "L", expectedSku: "B06-0005" },
    // 12. Cracker: KPF Samui L -> B06-0006
    { sectionId: crackerSectionId, colKey: "skuName", brand: "KPF", product: "แครกเกอร์ \"สมุย\"", size: "L", expectedSku: "B06-0006" },
    // 13. Jam WIP: Beever Pineapple -> WKB-0065
    { sectionId: jamSectionId, colKey: "jamSku", brand: "รอบบรรจุ", product: "เนื้อขนม BEEVER สับปะรด", size: "-", expectedSku: "WKB-0065" },
    // 14. Jam WIP: Beever Straw -> WKB-0066
    { sectionId: jamSectionId, colKey: "jamSku", brand: "รอบบรรจุ", product: "เนื้อขนม BEEVER สตรอฯ", size: "-", expectedSku: "WKB-0066" },
    // 15. Jam WIP: Botan Straw -> WKB-0067
    { sectionId: jamSectionId, colKey: "jamSku", brand: "รอบบรรจุ", product: "ขนมปังกรอบ แยมสตรอฯ", size: "-", expectedSku: "WKB-0067" },
    // 16. Jam WIP: Botan Pineapple -> WKB-0002-1
    { sectionId: jamSectionId, colKey: "jamSku", brand: "รอบบรรจุ", product: "ขนมปังกรอบ แยมสับปะรด", size: "-", expectedSku: "WKB-0002-1" },
    // 17. Prison FG: Mae Mali Pineapple XL -> B03-0003
    { sectionId: prisonSectionId, colKey: "skuName", brand: "แม่มะลิ", product: "ขนมปังกรอบ แยมสับปะรด", size: "XL", expectedSku: "B03-0003" },
    // 18. Prison FG: Rakhang Pineapple L -> BL0-1104
    { sectionId: prisonSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "ขนมปังกรอบ แยมสับปะรด", size: "L", expectedSku: "BL0-1104" },
    // 19. Prison FG: Rakhang Pineapple XL -> BL0-5001
    { sectionId: prisonSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "ขนมปังกรอบ แยมสับปะรด", size: "XL", expectedSku: "BL0-5001" },
    // 20. Prison FG: Rakhang Pineapple ลัง 5 กก -> BL0-5030
    { sectionId: prisonSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "ขนมปังกรอบ แยมสับปะรด", size: "ลัง 5 กก", expectedSku: "BL0-5030" },
    // 21. Cream: Rakhang Milk Cookie (Sandwich) Vanilla XL -> BL0-5005
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้นม ครีมวานิลลา", size: "XL", expectedSku: "BL0-5005" },
    // 22. Cream: Rakhang Milk Cookie (Sandwich) Durian L -> BL0-1102
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้นม ครีมทุเรียน", size: "L", expectedSku: "BL0-1102" },
    // 23. Cream: Rakhang Milk Cookie (Sandwich) Durian XL -> BL0-5007
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้นม ครีมทุเรียน", size: "XL", expectedSku: "BL0-5007" },
    // 24. Cream: Rakhang Milk Cookie (Sandwich) Choc L -> BL0-1107
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้นม ครีมช็อก", size: "L", expectedSku: "BL0-1107" },
    // 25. Cream: Rakhang Milk Cookie (Sandwich) Choc XL -> BL0-5004
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้นม ครีมช็อก", size: "XL", expectedSku: "BL0-5004" },
    // 26. Cream: Rakhang Milk Cookie (Sandwich) Straw XL -> BL0-5008
    { sectionId: creamSectionId, colKey: "skuName", brand: "ระฆังทอง", product: "คุกกี้นม ครีมสตรอฯ", size: "XL", expectedSku: "BL0-5008" },
  ];

  testCases.forEach((tc, idx) => {
    const [resolved] = resolveVisionRows({
      extraction: {
        rows: [{
          sectionId: tc.sectionId,
          workDate: "2026-10-06",
          sourceRowLabel: null,
          sourceShift: null,
          cells: [],
          products: [{
            columnKey: tc.colKey,
            sourceBrand: tc.brand,
            sourceProduct: tc.product,
            sourceSize: tc.size,
            sourceFormula: null,
          }],
          uncertainFields: [],
        }],
      },
      template: biscuitTemplate,
      catalog: biscuitCatalog,
      aliases: [],
      shiftsBySection: new Map(),
      dateFrom: "2026-10-05",
      dateTo: "2026-10-10",
    });

    const expectedProduct = biscuitCatalog.find((p) => p.skuCode === tc.expectedSku);
    const resolvedName = resolved.rowData[tc.colKey];
    if (tc.sectionId === creamSectionId && (
      /คุกกี้นม/.test(tc.product) && !/แซนวิช|แซนวิส/.test(expectedProduct.name)
      || /ก้นหอย/.test(tc.product) && !/ก้นหอย/.test(expectedProduct.name)
    )) {
      assert.equal(resolvedName, null, "generic cookie master cannot stand in for an explicit cookie family");
      assert.equal(resolved.products[0].candidates.length, 0);
      return;
    }
    if (resolvedName === null) {
      assert.equal(resolved.products[0].status, "review");
      assert.equal(resolved.products[0].learnAlias, false);
      assert.ok(resolved.products[0].candidates.some(item => item.name === expectedProduct.name), `review candidates should retain ${tc.expectedSku}`);
      return;
    }
    assert.equal(
      resolvedName,
      expectedProduct.name,
      `Case ${idx + 1} (${tc.brand} ${tc.product} ${tc.size}) should resolve to ${tc.expectedSku} (${expectedProduct.name}) but got ${resolvedName}`
    );
  });
});

test("biscuit import resolves KPF Mae Mali milk cookies, spiral coffee, and AEC tin crackers accurately", () => {
  const creamSec = {
    id: "sec-cream",
    name: "ส่วนงานป้ายครีม",
    production_schedule_column_defs: [
      { key: "time", label: "เวลาทำงาน", col_type: "shift", display_order: 1 },
      { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
      { key: "skuName", label: "ผลิตภัณฑ์", col_type: "sku_picker", auto_fill_field: "brand", display_order: 3 },
      { key: "machine", label: "เครื่อง", col_type: "number", display_order: 4 },
      { key: "qty", label: "จำนวนงาน", col_type: "number", display_order: 5 },
    ],
  };
  const tinSec = {
    id: "sec-tin",
    name: "ส่วนขนมปังกรอบบรรจุปี๊บ",
    production_schedule_column_defs: [
      { key: "time", label: "เวลาทำงาน", col_type: "shift", display_order: 1 },
      { key: "brand", label: "แบรนด์", col_type: "brand_auto", display_order: 2 },
      { key: "skuName", label: "ผลิตภัณฑ์", col_type: "sku_picker", auto_fill_field: "brand", display_order: 3 },
      { key: "people", label: "จำนวนคน", col_type: "number", display_order: 4 },
      { key: "qty", label: "จำนวนงาน", col_type: "number", display_order: 5 },
    ],
  };

  const catalog = [
    { skuCode: "B01-1001", name: "แม่มะลิ คุกกี้ วานิลลา 5 กก. (1 ปี๊บ)", brand: "แม่มะลิ 5 กก.", unit: "ปี๊บ(5กก.)", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2" }] },
    { skuCode: "B01-1019", name: "แม่มะลิ คุกกี้ วานิลลา 1.1 กก. (6 ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก" }] },
    { skuCode: "B01-0013", name: "แม่มะลิ คุกกี้ ทุเรียน 5 กก. (1 ปี๊บ)", brand: "แม่มะลิ 5 กก.", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2" }] },
    { skuCode: "B01-1018", name: "แม่มะลิ คุกกี้ ทุเรียน 1.1 กก. (6 ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2" }] },
    { skuCode: "B01-1011", name: "แม่มะลิ ก้นหอย กาแฟ 5 กก. (1 ปี๊บ)", brand: "แม่มะลิ 5 กก.", unit: "ปี๊บ/5กก.", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2" }] },
    { skuCode: "BL0-5005", name: "คุกกี้แซนวิช ครีมวานิลลา 5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "DEFAULT", formula_name: "สูตรหลัก" }] },
    { skuCode: "BL0-5028", name: "คุกกี้ก้นหอย ครีมกาแฟ  5 กก. (1 ปี๊บ)", brand: "ระฆังทอง", unit: "ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F2", formula_name: "สูตร F2" }] },
    { skuCode: "B03-0014", name: "แม่มะลิ AEC รสเค็ม 1.1 กก. (6ปี๊บ)", brand: "แม่มะลิ 1.1 กก.", unit: "กล่อง*6ปี๊บ", hasBom: true, formulaOptions: [{ formula_code: "F3", formula_name: "หลัก" }] },
    { skuCode: "BL0-5031", name: "ขนมปังกรอบ รสเค็มรูป ABC 4 กก. (1 ถุง)", brand: "ระฆังทอง", unit: "กล่อง", hasBom: true, formulaOptions: [{ formula_code: "DEFAULTH", formula_name: "สูตรหลัก" }] },
  ];

  const cases = [
    { sec: creamSec, brand: "KPF", text: "คุกกี้นม ครีมวานิลลา", size: "L", expected: "B01-1019" },
    { sec: creamSec, brand: "KPF", text: "คุกกี้นม ครีมวานิลลา", size: "XL", expected: "B01-1001" },
    { sec: creamSec, brand: "KPF", text: "คุกกี้นม ครีมทุเรียน", size: "L", expected: "B01-1018" },
    { sec: creamSec, brand: "KPF", text: "คุกกี้นม ครีมทุเรียน", size: "XL", expected: "B01-0013" },
    { sec: creamSec, brand: "KPF", text: "คุกกี้ก้นหอย ครีมกาแฟ", size: "XL", expected: "B01-1011" },
    { sec: creamSec, brand: "ระฆังทอง", text: "คุกกี้ก้นหอย ครีมกาแฟ", size: "XL", expected: "BL0-5028" },
    { sec: creamSec, brand: "ระฆังทอง", text: "คุกกี้นม ครีมวานิลลา", size: "XL", expected: "BL0-5005" },
    { sec: tinSec, brand: "KPF", text: "ขนมปังกรอบ A E C", size: "L", expected: "B03-0014" },
    { sec: tinSec, brand: "ระฆังทอง", text: "ขนมปังกรอบ A B C", size: "XL", expected: "BL0-5031" },
  ];

  for (const c of cases) {
    const source = { columnKey: "skuName", sourceBrand: c.brand, sourceProduct: c.text, sourceSize: c.size };
    const [row] = resolveVisionRows({
      extraction: { rows: [{ sectionId: c.sec.id, workDate: "2026-10-19", products: [source], cells: [] }] },
      template: { sections: [c.sec] },
      catalog,
      aliases: [],
      shiftsBySection: new Map(),
      dateFrom: "2026-10-19",
      dateTo: "2026-10-23",
    });
    const expected = catalog.find(p => p.skuCode === c.expected);
    assert.equal(
      row.rowData.skuName,
      expected.name,
      `${c.sec.name}: ${c.brand} ${c.text} ${c.size} expected ${c.expected} (${expected.name}) but got ${row.rowData.skuName}`
    );
  }

  // Verify in-context grounding catalog injection in buildVisionPrompt
  const prompt = buildVisionPrompt({
    template: { sections: [creamSec] },
    dateFrom: "2026-10-19",
    dateTo: "2026-10-23",
    shiftsBySection: new Map(),
    catalog,
    scopesBySection: null,
  });
  assert.ok(prompt.includes("Master Catalog ในระบบที่อนุญาต"));
  assert.ok(prompt.includes("B01-1001: [แม่มะลิ 5 กก.] แม่มะลิ คุกกี้ วานิลลา 5 กก."));

  // Verify model suggestedSkuCode boost in Stage 2
  const [boostedRow] = resolveVisionRows({
    extraction: {
      rows: [{
        sectionId: creamSec.id,
        workDate: "2026-10-19",
        products: [{
          columnKey: "skuName",
          sourceBrand: "KPF",
          sourceProduct: "คุกกี้นม ครีมวานิลลา",
          sourceSize: "L",
          suggestedSkuCode: "B01-1019",
        }],
        cells: [],
      }],
    },
    template: { sections: [creamSec] },
    catalog,
    aliases: [],
    shiftsBySection: new Map(),
    dateFrom: "2026-10-19",
    dateTo: "2026-10-23",
  });
  assert.equal(boostedRow.rowData.skuName, "แม่มะลิ คุกกี้ วานิลลา 1.1 กก. (6 ปี๊บ)");
  assert.equal(boostedRow.products[0].suggestedSkuCode, "B01-1019");
});


