import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const globalsCss = fs.readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf8");

test("BOM table keeps a wide product name column and all cells in one grid row", () => {
  assert.match(
    globalsCss,
    /grid-template-columns:\s*40px\s+170px\s+370px\s+90px\s+90px\s+310px\s+130px\s+65px;/,
    "the product name track must be 370px while preserving the DOM column order"
  );

  assert.match(
    globalsCss,
    /min-width:\s*1265px;/,
    "the minimum row width must include the wider product name track"
  );

  assert.doesNotMatch(
    globalsCss,
    /\.bom-column-order[\s\S]*?:nth-child\(4\)[\s\S]*?grid-column:\s*5/,
    "moving an earlier cell to a later grid column makes the next cell wrap onto another row"
  );
});

test("BOM empty state spans the full grid width", () => {
  assert.match(
    globalsCss,
    /\.bom-column-order\s*>\s*tbody\s*>\s*tr\s*>\s*td\[colspan\]\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/,
    "a colspan cell must explicitly span every CSS Grid track"
  );
});
