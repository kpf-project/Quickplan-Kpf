import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("legacy WIP without a version uses approved matching formula, while bound versions never fall back", async () => {
  const { wipPlanWeightVersion, wipPlanKgPerBatch, wipPlanDisplayKg } = await import("../src/features/production-planning/services/wipPlanDisplayWeight.js");
  const boms = [{ id: "cream", sku_code: "WKB-0057" }, { id: "other", sku_code: "OTHER" }];
  const versions = [
    { id: "old", bom_id: "cream", formula_code: "DEFAULT", status: "approved", version_no: 1, base_batch: 10, base_output_boxes: 305.3 },
    { id: "current", bom_id: "cream", formula_code: "DEFAULT", status: "approved", version_no: 2, base_batch: 10, base_output_boxes: 305.3 },
    { id: "draft", bom_id: "cream", formula_code: "DEFAULT", status: "draft", version_no: 3, base_batch: 1, base_output_boxes: 999 },
    { id: "f2", bom_id: "cream", formula_code: "F2", status: "approved", version_no: 4, base_batch: 1, base_output_boxes: 100 },
    { id: "other", bom_id: "other", formula_code: "DEFAULT", status: "approved", version_no: 8, base_batch: 1, base_output_boxes: 900 },
  ];
  const line = { skuCode: "WKB-0057", formulaCode: "DEFAULT", unit: "batch", plannedQty: 22 };
  const version = wipPlanWeightVersion(line, versions, boms);
  assert.equal(version.id, "current");
  assert.equal(wipPlanDisplayKg({ ...line, kgPerBatch: wipPlanKgPerBatch(version, line.skuCode, "WKB-0057", "KG") }), 671.66);
  assert.equal(wipPlanWeightVersion({ ...line, bomVersionId: "old" }, versions, boms).id, "old");
  assert.equal(wipPlanWeightVersion({ ...line, bomVersionId: "missing" }, versions, boms), null);
  assert.equal(wipPlanWeightVersion({ ...line, bomVersionId: "other" }, versions, boms), null);
  assert.equal(wipPlanWeightVersion({ ...line, formulaCode: "F2" }, versions, boms).id, "f2");
  assert.equal(wipPlanWeightVersion({ ...line, formulaCode: "F3" }, versions, boms), null);
  assert.equal(wipPlanWeightVersion({ ...line, formulaCode: null }, versions, boms).id, "current");
});
test("WIP weight uses the bound SKU's BOM output base, not recipe ingredient totals or latest BOM", async () => {
  const { wipPlanKgPerBatch } = await import("../src/features/production-planning/services/wipPlanDisplayWeight.js");
  const version = { base_batch: 2, base_output_boxes: 391.3 };
  assert.equal(wipPlanKgPerBatch(version, "WIP-1", "WIP-1", "KG"), 195.65);
  assert.equal(wipPlanKgPerBatch(version, "WIP-1", "OTHER", "KG"), null);
  assert.equal(wipPlanKgPerBatch(version, "WIP-1", "WIP-1", "ถุงx25กก."), null);
  assert.equal(wipPlanKgPerBatch(null, "WIP-1", "WIP-1", "KG"), null);
  assert.equal(wipPlanKgPerBatch({ base_batch: 0, base_output_boxes: 10 }, "WIP-1", "WIP-1", "KG"), null);
});

test("draft API enriches legacy lines with kg without binding or changing their stored formula", async () => {
  const weight = await import("../src/features/production-planning/services/wipPlanDisplayWeight.js");
  const { fetchSupabaseRowsByChunks } = await import("../src/lib/supabaseRangeFetch.js");
  const source = readFileSync("src/app/api/production-planning/wip-plan/draft/route.js", "utf8");
  const start = source.indexOf('    if (searchParams.get("includeWeight")');
  const block = source.slice(start, source.indexOf("    return NextResponse.json(", start));
  const rows = {
    production_boms: [{ id: "cream", sku_code: "WKB-0057" }],
    production_bom_versions: [{ id: "approved", bom_id: "cream", formula_code: "DEFAULT", status: "approved", version_no: 1, base_batch: 10, base_output_boxes: 305.3 }],
  };
  const db = { from(table) {
    let filtered = rows[table];
    return { select() { return this; }, in(key, values) { filtered = filtered.filter(row => values.includes(row[key])); return this; }, eq(key, value) { filtered = filtered.filter(row => row[key] === value); return this; }, then(resolve) { return Promise.resolve({ data: filtered, error: null }).then(resolve); } };
  } };
  const lines = [{ skuCode: "WKB-0057", plannedQty: 22, unit: "batch", formulaCode: "DEFAULT", bomVersionId: null }];
  const run = new (Object.getPrototypeOf(async function () {}).constructor)("searchParams", "lines", "supabaseAdmin", "fetchSupabaseRowsByChunks", "loadProductsMetaBySkus", "wipPlanWeightVersion", "wipPlanKgPerBatch", block);
  await run(new URLSearchParams("includeWeight=1"), lines, db, fetchSupabaseRowsByChunks, async () => new Map([["WKB-0057", { uom_name: "KG" }]]), weight.wipPlanWeightVersion, weight.wipPlanKgPerBatch);
  assert.equal(weight.wipPlanDisplayKg(lines[0]), 671.66);
  assert.equal(lines[0].weightUsesCurrentBom, true);
  assert.equal(lines[0].bomVersionId, null);
  assert.equal(lines[0].formulaCode, "DEFAULT");
});

test("room WIP kg display follows edited batches without converting kg a second time", async () => {
  const { wipPlanDisplayKg } = await import("../src/features/production-planning/services/wipPlanDisplayWeight.js");
  assert.equal(wipPlanDisplayKg({ plannedQty: 22, unit: "batch", kgPerBatch: 30.53 }), 671.66);
  assert.equal(wipPlanDisplayKg({ plannedQty: 8, unit: "ชุด", kgPerBatch: 30.53 }), 244.24);
  assert.equal(wipPlanDisplayKg({ plannedQty: 22, unit: "batch" }), null);
  assert.equal(wipPlanDisplayKg({ plannedQty: 22, unit: "batch", kgPerBatch: 0 }), null);
  assert.equal(wipPlanDisplayKg({ plannedQty: 0, unit: "batch", kgPerBatch: 30.53 }), 0);
  assert.equal(wipPlanDisplayKg({ plannedQty: 8, unit: "kg", kgPerBatch: 30.53 }), 8);
  assert.equal(wipPlanDisplayKg({ plannedQty: 8, unit: "ถุง", kgPerBatch: 30.53 }), null);
  assert.equal(wipPlanDisplayKg({ plannedQty: -1, unit: "batch", kgPerBatch: 30.53 }), null);
  const source = readFileSync("src/features/production-planning/components/PlanningControlCenterClient.js", "utf8");
  assert.match(source, /includeWeight=1/);
  assert.match(source, /<WipWeeklyTable/);
  assert.match(source, /buildWipWeeklyRows\(roomWipLines\)/);
});
