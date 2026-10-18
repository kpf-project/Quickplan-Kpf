import { loadCatalogDialog } from "./helpers/planning-catalog-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadBindings, transform } from "next/dist/build/swc/index.js";

test("planning picker paginates, resets search and confirms the chosen formula only", async () => {
  const file = "src/features/production-planning/components/PlanningSkuPicker.js";
  assert.ok(readFileSync("src/features/production-planning/components/GenericScheduleTable.js", "utf8").includes('import SkuPickerModal from "./PlanningSkuPicker"'));
  await loadBindings();
  const catalogDialog = await loadCatalogDialog();
  const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url), mod = { exports: {} }, state = [];
  let cursor = 0;
  new Function("require", "module", "exports", code)(name => name === "react" ? { ...require(name), useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; }, useMemo: fn => fn(), useEffect() {}, useRef: () => ({ current: null }), useId: () => "picker" } : name.endsWith(".css") ? { __esModule: true, default: {} } : name.includes("WeightScalePaginationBar") ? function Pager() {} : name === "./PlanningCatalogDialog" ? catalogDialog : require(name), mod, mod.exports);
  const selected = [], formulas = [{ formula_code: "A" }, { formula_code: "B" }];
  const skuMap = new Map(Array.from({ length: 31 }, (_, i) => [`สินค้า ${i}`, { skuCode: `P${i}`, hasBom: i !== 0, formulaOptions: formulas, brand: "brand" }]));
  const render = () => { cursor = 0; return mod.exports.default({ skuMap, onSelect: (...args) => selected.push(args), onClose() {} }); };
  function nodes(n) { return !n || typeof n !== "object" ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)]; }
  let all = nodes(render());
  assert.equal(all.filter(n => n.type === "input" && n.props.type === "radio").length, 15);
  const pager = () => nodes(render()).find(n => typeof n.type === "function" && n.type.name === "Pager");
  pager().props.onPageChange(3);
  assert.equal(nodes(render()).filter(n => n.type === "input" && n.props.type === "radio").length, 1);
  nodes(render()).find(n => n.type === "input" && n.props.type === "search").props.onChange({ target: { value: "P1" } });
  assert.equal(pager().props.page, 1);
  all = nodes(render());
  all.find(n => n.type === "input" && n.props.type === "radio").props.onChange();
  assert.equal(selected.length, 0);
  nodes(render()).find(n => n.type === "select" && n.props["aria-label"] === "สูตรผลิต P1").props.onChange({ target: { value: "B" } });
  nodes(render()).find(n => n.type === "button" && n.props.children === "ใช้สินค้านี้").props.onClick();
  assert.deepEqual(selected, [["สินค้า 1", "brand", formulas[1]]]);
  nodes(render()).find(n => n.type === "input" && n.props.type === "search").props.onChange({ target: { value: "P0" } });
  all = nodes(render());
  assert.equal(all.find(n => n.type === "input" && n.props.type === "radio").props.disabled, true);
});
