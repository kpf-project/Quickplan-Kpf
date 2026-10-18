import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");
await swc.loadBindings();
const filename = fileURLToPath(new URL("../src/features/production-costing/components/ProductionCostWorkbenchClient.js", import.meta.url));
const source = readFileSync(filename, "utf8").replace("@/lib/productionCostingMath", "../../../lib/productionCostingMath.js");
const { code } = swc.transformSync(source, {
  filename,
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(fileURLToPath(new URL("../src/features/production-costing/components", import.meta.url)));
compiled._compile(code, filename);
const Workbench = compiled.exports.default;

test("FG/WIP LOT opens as one in-flow report without the workbench header underneath", () => {
  const html = renderToStaticMarkup(createElement(Workbench, {
    initialExecutiveReport: true,
    returnHref: "/production-line/costing",
  }));
  assert.match(html, /ต้นทุนการผลิตตาม FG LOT/);
  assert.doesNotMatch(html, /คำนวณต้นทุนการผลิต/);
  assert.equal((html.match(/ประมาณการจาก BOM/g) || []).length, 1);
  assert.doesNotMatch(html, /class="[^"]*fixed inset-x-0/);

  const workbench = renderToStaticMarkup(createElement(Workbench));
  assert.match(workbench, /คำนวณต้นทุนการผลิต/);
  assert.doesNotMatch(workbench, /ต้นทุนการผลิตตาม FG LOT/);
});
