import { loadCatalogDialog } from "./helpers/planning-catalog-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { materialTradeKey, filterMaterialCatalog, loadCompleteMaterialCatalog, isRequisitionLineExportLocked } from "../src/lib/requisitionMaterialPicker.js";
import * as pickerHelpers from "../src/lib/requisitionMaterialPicker.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadBindings, transform } from "next/dist/build/swc/index.js";

test("catalog traverses all pages and retains trade codes and trade units including WIP", async () => {
  const calls = [];
  const options = await loadCompleteMaterialCatalog({
    loadTrades: async ({ page, cursor }) => { calls.push(cursor); return page === 1 ? { rows: [{ skuCode: "S", goodsCode: "T1", unit: "KG", name: "ผง", itemType: "RAW" }], hasMore: true, nextCursor: "next" } : { rows: [{ skuCode: "S", goodsCode: "T2", unit: "ถุง", name: "ผง", itemType: "RAW" }, { skuCode: "W", goodsCode: "WT", unit: "ชุด", name: "ครีม", itemType: "WIP" }], hasMore: false }; },
    loadProducts: async () => [{ skuCode: "S", goodsCode: "S", unit: "base" }, { skuCode: "W", goodsCode: "W", unit: "base" }, { skuCode: "F", goodsCode: "F", unit: "KG", name: "สำรอง", itemType: "WIP" }],
  });
  assert.deepEqual(calls, ["", "next"]);
  assert.deepEqual(options.map(materialTradeKey).sort(), ["F|KG", "T1|KG", "T2|ถุง", "WT|ชุด"].sort());
  assert.equal(filterMaterialCatalog(options, "ผง", "RAW", "ถุง")[0].goodsCode, "T2");
  assert.equal(filterMaterialCatalog(options, "WT", "WIP").length, 1);
  await assert.rejects(() => loadCompleteMaterialCatalog({ loadTrades: async () => ({ rows: [{}], hasMore: true }), loadProducts: async () => [] }), /ไม่ครบ/);
  let productPages = 0;
  const complete = await loadCompleteMaterialCatalog({ loadTrades: async () => ({ rows: [], hasMore: false }), loadProducts: async () => ++productPages === 1 ? { rows: [], hasMore: true } : { rows: [{ skuCode: "LAST", goodsCode: "LAST", unit: "KG" }], hasMore: false } });
  assert.equal(productPages, 2);
  assert.equal(complete[0].goodsCode, "LAST");
});

test("real picker retains multi-selection across pages and search, blocks duplicates and retains failed submit", async () => {
  await loadBindings();
  const catalogDialog = await loadCatalogDialog();
  const filename = "src/features/production-planning/components/RequisitionMaterialPicker.js";
  const { code } = await transform(readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url), mod = { exports: {} }, state = [], refs = [];
  let cursor = 0, refCursor = 0, calls = 0, submitted;
  const rows = Array.from({ length: 32 }, (_, i) => ({ skuCode: "same-sku", goodsCode: `T${String(i + 1).padStart(2, "0")}`, name: `วัตถุดิบ ${i + 1}`, unit: i === 31 ? "ถุง" : "KG", itemType: i > 24 ? "WIP" : "RAW" }));
  const swr = { __esModule: true, default: () => ({ data: { data: rows }, isLoading: false, mutate() {} }) };
  new Function("require", "module", "exports", code)(name => name === "react" ? { ...require(name), useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; }, useRef: initial => refs[refCursor++] ||= { current: initial }, useEffect() {}, useMemo: fn => fn(), useDeferredValue: value => value } : name === "swr" ? swr : name.includes("requisitionMaterialPicker") ? pickerHelpers : name.includes("clientFetch") ? { fetcher() {} } : name.endsWith(".css") ? { __esModule: true, default: {} } : name === "./PlanningCatalogDialog" ? catalogDialog : name.includes("WeightScalePaginationBar") ? function Pager() {} : require(name), mod, mod.exports);
  const render = () => { cursor = 0; refCursor = 0; return mod.exports.default({ open: true, document: { documentKey: "one", roomLabel: "ห้องทดสอบ" }, existingLineKeys: new Set(["T01|KG"]), onClose() {}, onConfirm: async options => { calls++; submitted = options; return false; } }); };
  const nodes = n => !n || typeof n !== "object" ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const all = () => nodes(render());
  const check = label => all().find(n => n.type === "input" && n.props["aria-label"] === label);
  assert.equal(check("เลือก T01 KG").props.disabled, true);
  const rowFor = label => all().find(n => n.type === "tr" && nodes(n).some(child => child.props?.["aria-label"] === label));
  rowFor("เลือก T01 KG").props.onClick();
  assert.equal(check("เลือก T01 KG").props.checked, false);
  rowFor("เลือก T02 KG").props.onClick();
  assert.equal(check("เลือก T02 KG").props.checked, true);
  let stopped = false;
  check("เลือก T02 KG").props.onClick({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  check("เลือก T02 KG").props.onChange();
  assert.equal(check("เลือก T02 KG").props.checked, false);
  rowFor("เลือก T02 KG").props.onClick();
  const pager = () => all().find(n => typeof n.type === "function" && n.type.name === "Pager");
  assert.equal(pager().props.limit, 15);
  assert.deepEqual(pager().props.limitOptions, [15, 25, 50]);
  pager().props.onPageChange(2);
  check("เลือก T26 KG").props.onChange();
  all().find(n => n.type === "input" && n.props.type === "search").props.onChange({ target: { value: "T03" } });
  check("เลือก T03 KG").props.onChange();
  assert.equal(all().filter(n => n.type === "button" && String(n.props["aria-label"] || "").startsWith("ลบ ")).length, 3);
  const submit = all().find(n => n.type === "button" && JSON.stringify(n.props.children).includes("รายการในใบนี้"));
  const pending = submit.props.onClick();
  await submit.props.onClick();
  await pending;
  assert.equal(calls, 1);
  assert.deepEqual(submitted.map(materialTradeKey).sort(), ["T02|KG", "T03|KG", "T26|KG"]);
  assert.ok(all().some(n => n.props?.role === "alert"));
  assert.equal(all().filter(n => n.type === "button" && String(n.props["aria-label"] || "").startsWith("ลบ ")).length, 3);
  all().find(n => n.type === "input" && n.props.type === "search").props.onChange({ target: { value: "" } });
  assert.equal(check("เลือก T02 KG").props.checked, true);
  pager().props.onPageChange(3);
  pager().props.onLimitChange(25);
  assert.equal(pager().props.page, 1);
  assert.equal(pager().props.limit, 25);
  assert.equal(check("เลือก T02 KG").props.checked, true);
  assert.deepEqual(all().filter(n => n.type === "th").slice(1).map(n => n.props.children), ["#", "รหัส", "ชื่อ", "หน่วย", "ประเภท", "สถานะ"]);
});

test("whole-row deletion locks on any exported quantity or retained exported/ERP LOT", () => {
  const doc = { exportedByDate: { mon: true } };
  assert.equal(isRequisitionLineExportLocked(doc, { qtyByDate: { mon: 1, tue: 5 } }), true);
  assert.equal(isRequisitionLineExportLocked(doc, { qtyByDate: { tue: 5 } }), false);
  assert.equal(isRequisitionLineExportLocked({}, { exportedLotsByDate: { mon: [{}] } }), true);
  assert.equal(isRequisitionLineExportLocked({}, { erpLotsByDate: { mon: [{}] } }), true);
});

test("batch additions commit once and close only after successful persistence", () => {
  const source = readFileSync("src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", "utf8");
  const add = source.slice(source.indexOf("const addMaterialToDocument ="), source.indexOf("const openSupplementalDrawer ="));
  assert.match(add, /options\.map/);
  assert.equal((add.match(/commitDrafts\(nextDrafts\)/g) || []).length, 1);
  assert.ok(add.indexOf("if (!await commitDrafts(nextDrafts)) return false") < add.indexOf("setItemManagerState(null)"));
  const remove = source.slice(source.indexOf("const deleteLine ="), source.indexOf("const addMaterialToDocument ="));
  assert.match(remove, /isRequisitionLineExportLocked/);
  assert.ok(remove.indexOf("isRequisitionLineExportLocked") < remove.indexOf("commitDrafts"));
});
