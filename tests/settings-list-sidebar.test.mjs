import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { loadBindings, transform } from "next/dist/build/swc/index.js";

test("shared settings sidebar keeps selection, search, collapse and create permissions controlled by its caller", async () => {
  await loadBindings();
  const filename = "src/components/settings/SettingsListSidebar.js";
  const { code } = await transform(readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const mod = { exports: {} }, require = createRequire(import.meta.url);
  new Function("require", "module", "exports", code)(name => name.endsWith(".css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : require(name), mod, mod.exports);
  const calls = [];
  const props = { title: "แผนก", items: [{ id: "dept13", code: "KP13", name: "แผนกบิสกิต" }, { id: "dept16", code: "KP16", name: "บรรจุปี๊บเล็ก" }], selectedId: "dept13", search: "", onSelect: id => calls.push(id), onSearch: term => calls.push(term), onToggle: () => calls.push("toggle"), onCreate() {}, canCreate: false };
  const tree = mod.exports.default(props);
  const nav = tree.props.children[2];
  nav.props.children[0][1].props.onClick();
  tree.props.children[1].props.children[1].props.onChange({ target: { value: "บิสกิต" } });
  assert.deepEqual(calls, ["dept16", "บิสกิต"]);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-current="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /แผนกบิสกิต/);
  const collapsed = renderToStaticMarkup(mod.exports.default({ ...props, collapsed: true }));
  assert.match(collapsed, /data-collapsed="true"/);
  assert.doesNotMatch(collapsed, /<input/);
  assert.match(collapsed, />KP13<\/span>/);
});
