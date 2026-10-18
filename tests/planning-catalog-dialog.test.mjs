import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadBindings, transform } from "next/dist/build/swc/index.js";
import { loadCatalogDialog } from "./helpers/planning-catalog-loader.mjs";

const require = createRequire(import.meta.url);
test("shared catalog sequence continues across pages and page-size changes", async () => {
  await loadBindings();
  const { PlanningCatalogRowNumber } = await loadCatalogDialog();
  assert.equal(PlanningCatalogRowNumber({ page: 1, limit: 15, index: 0 }).props.children, 1);
  assert.equal(PlanningCatalogRowNumber({ page: 2, limit: 15, index: 0 }).props.children, 16);
  assert.equal(PlanningCatalogRowNumber({ page: 2, limit: 25, index: 2 }).props.children, 28);
});
function nodes(node) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
async function load(file, overrides) {
  const filename = `src/features/production-planning/components/${file}.js`;
  const { code } = await transform(readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => overrides[name] || (name.endsWith(".css") ? { __esModule: true, default: {} } : require(name)), mod, mod.exports);
  return mod.exports.default;
}

test("shared catalog frame restores focus/scroll and traps keyboard without dismissing a busy save", async () => {
  await loadBindings();
  const effects = [], first = { focus() { this.focused = true; }, getClientRects: () => [1] }, last = { focus() { this.focused = true; }, getClientRects: () => [1] };
  const root = { querySelector: () => first, querySelectorAll: () => [first, last] };
  const api = await loadCatalogDialog({ react: { ...require("react"), useEffect: fn => effects.push(fn), useId: () => "catalog", useRef: () => ({ current: root }) } });
  const previousDoc = globalThis.document;
  const previous = { focus() { this.focused = true; } };
  globalThis.document = { activeElement: previous, body: { style: { overflow: "auto" } } };
  try {
    let closed = 0;
    const tree = api.default({ title: "เลือกสินค้า", onClose: () => closed++ });
    const cleanup = effects[0]();
    assert.equal(document.body.style.overflow, "hidden"); assert.equal(first.focused, true);
    const panel = nodes(tree).find(node => node.props?.role === "dialog");
    assert.equal(panel.props["aria-labelledby"], "catalog");
    document.activeElement = last;
    let prevented = false;
    panel.props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    panel.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
    assert.equal(closed, 1);
    const busy = nodes(api.default({ title: "เพิ่ม", busy: true, onClose: () => closed++ })).find(node => node.props?.role === "dialog");
    busy.props.onKeyDown({ key: "Escape" }); assert.equal(closed, 1);
    cleanup(); assert.equal(document.body.style.overflow, "auto"); assert.equal(previous.focused, true);
  } finally { globalThis.document = previousDoc; }
});

test("department WIP adapter retains department endpoint, SKU identity and original unit metadata", async () => {
  await loadBindings();
  const item = { skuCode: "W1", name: "แป้งหมัก", unit: "KG", fgSkus: ["FG1"] }, requests = [], choices = [];
  const Picker = function Picker() {};
  const component = await load("DepartmentWipPicker", { react: { ...require("react"), useMemo: fn => fn() }, swr: { __esModule: true, default: url => { requests.push(url); return { data: { data: [item] }, mutate() {} }; } }, "@/lib/clientFetch": { fetcher() {} }, "./PlanningSkuPicker": { __esModule: true, default: Picker } });
  const element = component({ activeDeptId: "dept/1", onSelect: row => choices.push(row) });
  assert.equal(element.type, Picker); assert.equal(element.props.requireBom, false);
  assert.equal(requests[0], "/api/production-planning/wip-options?departmentId=dept%2F1");
  assert.equal(element.props.skuMap.get("W1").unit, "KG");
  element.props.onSelect("not-allowed"); assert.equal(choices.length, 0);
  element.props.onSelect("W1"); assert.equal(choices[0], item);
});

test("WIP mode shares the planning table while bypassing only the FG-specific BOM chooser", async () => {
  await loadBindings(); const state = []; let cursor = 0;
  const frame = await loadCatalogDialog();
  const component = await load("PlanningSkuPicker", { react: { ...require("react"), useState: initial => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => state[i] = typeof value === "function" ? value(state[i]) : value]; }, useEffect() {}, useMemo: fn => fn(), useRef: () => ({ current: null }), useId: () => "wip" }, "./PlanningCatalogDialog": frame, "@/features/production-line/components/WeightScalePaginationBar": () => null });
  const choices = [], map = new Map([["W1", { skuCode: "W1", name: "แป้งหมัก", unit: "KG", itemType: "WIP", fgSkus: ["FG1"] }]]);
  const render = extra => { cursor = 0; return component({ skuMap: map, requireBom: false, onClose() {}, onSelect: code => choices.push(code), ...extra }); };
  let all = nodes(render()); assert.equal(all.find(node => node.type === "input" && node.props.type === "radio").props.disabled, false);
  const disclosure = all.find(node => node.type === "details");
  assert.ok(disclosure);
  assert.equal(disclosure.props.open, undefined);
  assert.equal(nodes(disclosure).find(node => node.type === "li").props.children, "FG1");
  let stopped = false;
  disclosure.props.onClick({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(nodes(render()).find(node => node.type === "input" && node.props.type === "radio").props.checked, false);
  all.find(node => node.type === "input" && node.props.type === "radio").props.onChange();
  all = nodes(render()); assert.ok(all.some(node => node.props?.children === "แป้งหมัก"));
  assert.equal(all.some(node => node.type === "select"), false);
  all.find(node => node.props?.children === "ใช้ WIP นี้").props.onClick(); assert.deepEqual(choices, ["W1"]);
  assert.equal(nodes(render({ error: "failed" })).find(node => node.props?.children === "ใช้ WIP นี้").props.disabled, true);
});
