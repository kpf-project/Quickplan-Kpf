import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transform, loadBindings } from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
await loadBindings();
const file = "src/features/production-planning/components/EditableRequisitionQtyCell.js";
const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });

// Exercise the real handlers without a browser or company API; only React hook storage is substituted.
function mount(onSave, value = 225) {
  const slots = []; let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => name === "react" ? hooks : name.endsWith(".css") ? { __esModule: true, default: {} } : require(name), mod, mod.exports);
  const render = () => { cursor = 0; return mod.exports.default({ value, onSave }); };
  function find(node, type) {
    if (!node || typeof node !== "object") return null;
    if (node.type === type || node.props?.role === type) return node;
    return [node.props?.children].flat(Infinity).map((child) => find(child, type)).find(Boolean) || null;
  }
  return { get: (type) => find(render(), type), edit(text) { this.get("button").props.onClick(); this.get("input").props.onChange({ target: { value: text } }); } };
}
const key = (name) => ({ key: name, nativeEvent: {}, preventDefault() {} });

test("Enter followed by blur saves once and rounds to existing three-decimal precision", async () => {
  const calls = []; let finish;
  const cell = mount((qty) => { calls.push(qty); return new Promise((resolve) => { finish = resolve; }); });
  cell.edit("12.3456");
  const input = cell.get("input");
  const pending = input.props.onKeyDown(key("Enter"));
  input.props.onBlur();
  assert.deepEqual(calls, [12.346]);
  finish(true); await pending;
  assert.equal(cell.get("input"), null);
});

test("blur and Tab save blank as zero for existing day/row deletion logic", async () => {
  for (const trigger of ["blur", "Tab"]) {
    const calls = []; const cell = mount(async (qty) => { calls.push(qty); return true; });
    cell.edit(""); const input = cell.get("input");
    await (trigger === "blur" ? input.props.onBlur() : input.props.onKeyDown(key("Tab")));
    assert.deepEqual(calls, [0]);
  }
});

test("Escape cancels and a subsequent blur never saves", async () => {
  const calls = []; const cell = mount(async (qty) => { calls.push(qty); });
  cell.edit("999"); const input = cell.get("input");
  await input.props.onKeyDown(key("Escape")); await input.props.onBlur();
  assert.deepEqual(calls, []);
  assert.equal(cell.get("input"), null);
});

test("Tab targets the next quantity rather than intervening LOT buttons", async () => {
  for (const shiftKey of [false, true]) {
    const focused = [];
    const previous = { focus() { focused.push("previous"); } };
    const next = { focus() { focused.push("next"); } };
    const current = { closest() { return { querySelectorAll() { return [previous, current, next]; } }; } };
    const cell = mount(async () => true); cell.edit("42");
    await cell.get("input").props.onKeyDown({ ...key("Tab"), currentTarget: current, shiftKey });
    assert.deepEqual(focused, [shiftKey ? "previous" : "next"]);
  }
});

test("invalid and negative input stays editable without writing", async () => {
  for (const draft of ["-1", "abc", "Infinity", "-"]) {
    const calls = []; const cell = mount(async (qty) => { calls.push(qty); });
    cell.edit(draft); await cell.get("input").props.onBlur();
    assert.deepEqual(calls, []); assert.equal(cell.get("input").props.value, draft);
    assert.ok(cell.get("alert"));
  }
});

test("failed save retains draft and can retry, unchanged input never writes", async () => {
  let calls = 0; const cell = mount(async () => ++calls > 1);
  cell.edit("42"); await cell.get("input").props.onKeyDown(key("Enter"));
  assert.equal(cell.get("input").props.value, "42"); assert.ok(cell.get("alert"));
  await cell.get("input").props.onKeyDown(key("Enter"));
  assert.equal(cell.get("input"), null); assert.equal(calls, 2);
  const unchanged = mount(async () => { throw new Error("unchanged must not save"); });
  unchanged.edit("225"); await unchanged.get("input").props.onBlur();
  assert.equal(unchanged.get("input"), null);
});

test("network failure keeps the typed number and announces the error", async () => {
  const cell = mount(async () => { throw new Error("การเชื่อมต่อขัดข้อง"); });
  cell.edit("72"); await cell.get("input").props.onBlur();
  assert.equal(cell.get("input").props.value, "72");
  assert.equal(cell.get("alert").props.children, "การเชื่อมต่อขัดข้อง");
});
