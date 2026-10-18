import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadBindings, transform } from "next/dist/build/swc/index.js";
import * as weekly from "../src/features/production-planning/services/wipWeeklyGrid.js";
import * as weight from "../src/features/production-planning/services/wipPlanDisplayWeight.js";
import { renderToStaticMarkup } from "react-dom/server";

test("preview weight metadata keeps bound versions and resolves only the same legacy SKU/formula", async () => {
  await loadBindings();
  const file = "src/lib/wipPlanDisplayWeights.js";
  const { code } = await transform(readFileSync(file, "utf8"), { filename: file, module: { type: "commonjs" } });
  const mod = { exports: {} };
  const tables = { production_boms: [{ id: "bom", sku_code: "W1" }], production_bom_versions: [
    { id: "old", bom_id: "bom", base_batch: 2, base_output_boxes: 100, wip_qty_input_mode: "batch", formula_code: "DEFAULT", status: "approved", version_no: 1 },
    { id: "new", bom_id: "bom", base_batch: 1, base_output_boxes: 90, wip_qty_input_mode: "batch", formula_code: "DEFAULT", status: "approved", version_no: 2 },
    { id: "other", bom_id: "bom", base_batch: 1, base_output_boxes: 999, wip_qty_input_mode: "batch", formula_code: "F2", status: "approved", version_no: 3 },
  ] };
  const db = { from: table => { let rows = tables[table]; const q = { select: () => q, in: (key, values) => { rows = rows.filter(row => values.includes(row[key])); return q; }, eq: (key, value) => { rows = rows.filter(row => row[key] === value); return q; }, then: resolve => resolve(rows) }; return q; } };
  new Function("require", "module", "exports", code)(name => name.includes("supabaseRangeFetch") ? { fetchSupabaseRowsByChunks: async (values, query) => values.length ? await query(values) : [] } : name.includes("wipPlanning") ? { loadProductsMetaBySkus: async () => new Map([["W1", { uom_name: "KG" }]]) } : weight, mod, mod.exports);
  const input = [{ skuCode: "W1", bomVersionId: "old", plannedQty: 2 }, { skuCode: "W1", plannedQty: 2 }, { skuCode: "W1", formulaCode: "MISSING", plannedQty: 2 }];
  const result = await mod.exports.enrichWipPlanDisplayWeights(db, input);
  assert.equal(result[0].kgPerBatch, 50);
  assert.equal(result[0].planningUnit, "batch");
  assert.equal(result[1].kgPerBatch, 90);
  assert.equal(result[2].kgPerBatch, null);
  assert.equal(input[0].kgPerBatch, undefined);
  assert.equal(result[0].bomVersionId, "old");
});

test("weekly material preview keeps every date and separate trade-unit identity without multiplying totals", () => {
  const columns = [{ key: "a", workDate: "2026-10-19" }, { key: "b", workDate: "2026-10-19" }, { key: "c", workDate: "2026-10-21" }];
  const rows = weekly.weeklyMaterialProjection(columns, [{ code: "M1", unit: "ถุง", values: { a: 2, b: 3, c: 1 } }, { code: "M2", unit: "kg", values: { a: 10 } }], ["2026-10-19", "2026-10-20", "2026-10-21"]);
  assert.deepEqual(rows[0].byDate, { "2026-10-19": 5, "2026-10-20": 0, "2026-10-21": 1 });
  assert.equal(rows[0].total, 6);
  assert.equal(rows[1].total, 10);
  assert.equal(rows.length, 2);
});

test("daily kg uses stored factors only with kg output and never invents weight for non-kg units", () => {
  assert.equal(weekly.draftLineKg({ plannedQty: 14, planningUnit: "batch", displayUnit: "KG", displayFactor: 195.65 }), 2739.1);
  assert.equal(weekly.draftLineKg({ plannedQty: 7, planningUnit: "KG", displayFactor: 99 }), 7);
  assert.equal(weekly.draftLineKg({ plannedQty: 14, planningUnit: "batch", displayUnit: "ถุง", displayFactor: 1 }), null);
  assert.equal(weekly.draftLineKg({ plannedQty: "", planningUnit: "batch", displayUnit: "KG", displayFactor: 195.65 }), null);
});

test("real add handler creates a fresh record on the selected date and opens only that record's picker", () => {
  const source = readFileSync("src/features/production-planning/components/QaSubplanWorkbenchClient.js", "utf8").replaceAll("\r", "");
  const emptyStart = source.indexOf("function emptyLine(");
  const empty = new Function("todayDate", `${source.slice(emptyStart, source.indexOf("\nfunction resolveSectionKey", emptyStart))}; return emptyLine;`)(() => "2026-10-18");
  const start = source.indexOf("  const addLine = useCallback(") + "  const addLine = useCallback(".length;
  const callback = source.slice(start, source.indexOf("\n  }, [", start) + 4);
  let draft = [{ id: "original", workDate: "2026-10-19", plannedQty: 22 }], picker, editing = new Set();
  const localDraftStateRef = { current: {} };
  const add = new Function("defaultDraftDate", "localDraftStateRef", "draftUrl", "activeSectionShifts", "activeSectionModel", "emptyLine", "setDraftLines", "setWipPickerLineId", "setEditingWipIds", `return (${callback});`)("2026-10-19", localDraftStateRef, "fixture", [{ shiftId: "s1", shiftCode: "1" }], { section: { id: "room", name: "ห้องตีแป้ง" } }, empty, update => { draft = update(draft); }, id => { picker = id; }, update => { editing = update(editing); });
  add("2026-10-23");
  assert.equal(draft[1].workDate, "2026-10-23");
  assert.equal(draft[1].sourceSectionDefId, "room");
  assert.equal(draft[1].shiftId, "s1");
  assert.equal(draft[0].plannedQty, 22);
  assert.equal(picker, draft[1].id);
  assert.equal(editing.has(picker), true);
  assert.equal(localDraftStateRef.current.dirty, true);
});

export async function loadWorkbench() {
  await loadBindings();
  const file = "src/features/production-planning/components/WeeklyPlanningWorkbench.js";
  const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url), mod = { exports: {} };
  const paperFile = "src/features/production-planning/components/RequisitionPaper.js";
  const paperCode = await transform(readFileSync(paperFile, "utf8"), { filename: paperFile, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const paper = { exports: {} };
  new Function("require", "module", "exports", paperCode.code)(name => name.endsWith(".css") ? { __esModule: true, default: {} } : require(name), paper, paper.exports);
  let state = [], cursor = 0;
  new Function("require", "module", "exports", code)(name => {
    if (name === "react") return { ...require("react"), useMemo: fn => fn(), useEffect() {}, useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; } };
    if (name.endsWith(".css")) return { __esModule: true, default: {} };
    if (name.includes("wipWeeklyGrid")) return weekly;
    if (name.includes("RequisitionPlanPicker")) return { __esModule: true, default: () => null };
    if (name === "./RequisitionPaper") return paper.exports;
    return require(name);
  }, mod, mod.exports);
  const render = props => { cursor = 0; return mod.exports.default(props); };
  render.Paper = paper.exports.default;
  return render;
}
function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }

test("plan trigger opens the shared archive with permitted plans and their actual dates", async () => {
  const render = await loadWorkbench();
  const plans = [{ planNo: "MP1", periodStart: "2026-10-19", periodEnd: "2026-10-25" }];
  const selected = [];
  const props = { selectablePlanOptions: plans, activeMasterPlanNo: "MP1", setMasterPlanNo: value => selected.push(value) };
  nodes(render(props)).find(node => node.props?.["aria-label"] === "เลขที่แผนการผลิต").props.onClick();
  const picker = nodes(render(props)).find(node => node.props?.plans === plans);
  assert.ok(picker);
  assert.equal(picker.props.selectedPlanNo, "MP1");
  picker.props.onSelect("MP1");
  assert.deepEqual(selected, ["MP1"]);
  picker.props.onClose();
  assert.equal(nodes(render(props)).some(node => node.props?.plans === plans), false);
});

test("reference toolbar owns room selection and bounded document zoom without changing plan data", async () => {
  const render = await loadWorkbench(), rooms = [], saves = [];
  const props = { sectionTabs: [{ id: "mix", name: "ห้องตีแป้ง" }, { id: "cream", name: "ห้องชั่งครีม" }], selectedSectionId: "mix", setSelectedSectionId: id => rooms.push(id), activeMasterPlanNo: "MP1", activeDepartmentId: "D1", saveDraft: () => saves.push(true) };
  let all = nodes(render(props));
  assert.equal(all.some(node => node.props?.["aria-label"] === "ค้นหาวัตถุดิบ"), false);
  const nav = all.find(node => node.type === "nav" && node.props["aria-label"] === "ส่วนงาน / ห้องผลิต");
  nodes(nav).find(node => node.type === "button" && node.props.children === "ห้องชั่งครีม").props.onClick();
  assert.deepEqual(rooms, ["cream"]);
  for (let count = 0; count < 12; count++) nodes(render(props)).find(node => node.props?.["aria-label"] === "ย่อ Preview").props.onClick();
  all = nodes(render(props));
  assert.equal(all.find(node => node.type === "output").props.children[0], 50);
  assert.ok(all.some(node => node.props?.style?.zoom === .5));
  assert.equal(all.find(node => node.props?.["aria-label"] === "ย่อ Preview").props.disabled, true);
  for (let count = 0; count < 15; count++) nodes(render(props)).find(node => node.props?.["aria-label"] === "ขยาย Preview").props.onClick();
  all = nodes(render(props));
  assert.equal(all.find(node => node.type === "output").props.children[0], 150);
  assert.equal(all.find(node => node.props?.["aria-label"] === "ขยาย Preview").props.disabled, true);
  assert.equal(saves.length, 0);
});

test("department preview renders the shared requisition paper/table without LOT or document actions", async () => {
  const render = await loadWorkbench();
  const props = { activeMasterPlanNo: "MP1", activeDepartment: { name: "แผนกบิสกิต" }, activeSectionModel: { name: "ห้องตีแป้ง" }, activeSectionDraftLines: [{ id: "w1", workDate: "2026-10-19", skuCode: "WKB-0041", skuName: "แป้งหมัก", plannedQty: 14, planningUnit: "batch" }, { id: "w2", workDate: "2026-10-19", skuCode: "WKB-0053", skuName: "แผ่นคุกกี้นม", plannedQty: 15, planningUnit: "batch" }], previewMeta: { planRange: { start: "2026-10-19", end: "2026-10-25" } }, matrixColumns: [{ key: "a", workDate: "2026-10-19" }], materialRows: [{ code: "M01", name: "แป้ง", unit: "ถุง", values: { a: 2 } }] };
  const element = nodes(render(props)).find(node => node.type === render.Paper);
  assert.ok(element);
  const html = renderToStaticMarkup(element);
  assert.match(html, /ใบสั่งงาน \/ ใบขอเบิกวัตถุดิบ/);
  assert.match(html, /ห้องตีแป้ง/);
  assert.match(html, /M01/);
  assert.match(html, /19\/10\/2569/);
  assert.match(html, /แป้งหมัก 14 \/ แผ่นคุกกี้นม 15/);
  assert.doesNotMatch(html, /batch/);
  assert.doesNotMatch(html, /<details|<summary/);
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.doesNotMatch(html, /สถานะ LOT|Export|ซ่อนใบนี้|เพิ่มวัตถุดิบ|ลบวัตถุดิบ/);
  assert.equal(props.materialRows[0].values.a, 2);
});

test("day picker changes only view, add is date-scoped and edits retain line identities", async () => {
  const render = await loadWorkbench(), calls = [];
  const props = { activeMasterPlanNo: "MP1", activeSectionModel: { id: "room" }, activeSectionDraftLines: [{ id: "a", skuCode: "WIP1", workDate: "2026-10-19", plannedQty: 2 }, { id: "b", skuCode: "WIP2", workDate: "2026-10-20", plannedQty: 3 }], previewMeta: { planRange: { start: "2026-10-19", end: "2026-10-25" } }, matrixColumns: [], materialRows: [], selectablePlanOptions: [], departmentTabs: [], sectionTabs: [], activeSectionShifts: [], wipSkuNameBySku: new Map(), updateLine: (...args) => calls.push(["update", ...args]), addLine: date => calls.push(["add", date]), removeLine: id => calls.push(["delete", id]) };
  let all = nodes(render(props));
  assert.equal(all.filter(n => n.type === "input" && n.props.type === "number").length, 1);
  all.find(n => n.props?.["aria-label"] === "เลือกวันที่คีย์แผน").props.onClick();
  all = nodes(render(props));
  assert.equal(all.filter(n => n.props?.role === "option").length, 7);
  all.find(n => n.props?.["data-date"] === "2026-10-20").props.onClick();
  assert.deepEqual(calls, []);
  all = nodes(render(props));
  all.find(n => n.type === "input" && n.props.type === "number").props.onChange({ target: { value: "4" } });
  all.find(n => n.props?.["aria-label"] === "เพิ่มสินค้าในวันที่เลือก").props.onClick();
  assert.deepEqual(calls, [["update", "b", "plannedQty", "4"], ["add", "2026-10-20"]]);
  const locked = nodes(render({ ...props, isConfirmedSubplanLocked: true }));
  assert.ok(locked.filter(n => n.type === "input" && n.props.type === "number").every(n => n.props.disabled));
});
