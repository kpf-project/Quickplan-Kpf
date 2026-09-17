import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const componentPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleCancelPageClient.js"
);

function readSource() {
  return fs.readFileSync(componentPath, "utf8");
}

test("weight cancel history date changes reload cancelable rows immediately", () => {
  const source = readSource();

  assert.match(
    source,
    /const handlePickerDateChange = useCallback\(/,
    "cancel picker should centralize date changes"
  );
  assert.match(
    source,
    /handlePickerDateChange[\s\S]*loadPickerRows\(nextFilters\)/,
    "changing date filters should reload the cancelable list without requiring another click"
  );
  assert.match(
    source,
    /onChange=\{\(event\) => handlePickerDateChange\("dateFrom", event\.target\.value\)\}/,
    "dateFrom input should use the auto-loading date handler"
  );
  assert.match(
    source,
    /onChange=\{\(event\) => handlePickerDateChange\("dateTo", event\.target\.value\)\}/,
    "dateTo input should use the auto-loading date handler"
  );
});
