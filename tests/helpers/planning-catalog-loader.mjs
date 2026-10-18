import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transform } from "next/dist/build/swc/index.js";

export async function loadCatalogDialog(overrides = {}) {
  const require = createRequire(import.meta.url);
  const filename = "src/features/production-planning/components/PlanningCatalogDialog.js";
  const { code } = await transform(readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => overrides[name] || (name.endsWith(".css") ? { __esModule: true, default: {} } : require(name)), mod, mod.exports);
  return mod.exports;
}
