import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const bomCss = fs.readFileSync(path.join(repoRoot, "src/features/production-line/components/BomEditorPageClient.module.css"), "utf8");
const bomEditorSource = fs.readFileSync(
  path.join(repoRoot, "src/features/production-line/components/BomEditorPageClient.js"),
  "utf8"
);

test("BOM uses the shared native table with a wide name column rather than separate CSS grids", () => {
  assert.match(bomEditorSource, /<ReportTable tableClassName=\{styles.treeTable\}/);
  assert.match(bomCss, /th:nth-child\(4\)\s*\{\s*width:26%!important/);
  assert.doesNotMatch(bomEditorSource, /className="bom-column-order/);
});

test("BOM empty state spans all eleven native columns", () => {
  assert.match(bomEditorSource, /colSpan=\{11\}/);
});

test("BOM substitute picker shows one option per parent SKU", () => {
  assert.match(
    bomEditorSource,
    /const substituteOptionsByCode = new Map\(\);[\s\S]*?substituteOptionsByCode\.has\(code\)[\s\S]*?Array\.from\(substituteOptionsByCode\.values\(\)\)/,
    "trade-code expansion must not render duplicate substitute options for the same parent SKU"
  );
});
