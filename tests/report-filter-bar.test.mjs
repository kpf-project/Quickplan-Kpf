import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const filterBarSource = fs.readFileSync(
  "src/components/print/ReportFilterBar.js",
  "utf8"
);

test("Report center status checkboxes stay compact even without the options wrapper", () => {
  const styles = fs.readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");
  assert.match(styles, /\.filterField:has\(>label input\[type="checkbox"\]\)/);
  assert.match(styles, /\.filterField input\[type="checkbox"\]\{width:16px;height:16px/);
});

test("Unsaved dialog follows the selected centered design and safe keyboard default", () => {
  const source = fs.readFileSync("src/components/GlobalNavigationGuard.js", "utf8");
  const styles = fs.readFileSync("src/components/GlobalNavigationGuard.module.css", "utf8");
  assert.match(source, /มีข้อมูลที่ยังไม่ได้บันทึก/);
  assert.match(source, /ออกโดยไม่บันทึก/);
  assert.match(source, /อยู่หน้านี้ต่อ/);
  assert.match(source, /stayRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(styles, /justify-content: center/);
  assert.match(styles, /grid-template-columns: 1fr 1fr/);
});
const indexSource = fs.readFileSync(
  "src/components/print/index.js",
  "utf8"
);

test("ReportFilterBar is officially exported from print package", () => {
  assert.match(
    indexSource,
    /export\s+\{\s*default\s+as\s+ReportFilterBar,\s*ReportFilterField\s*\}\s+from\s+["']\.\/ReportFilterBar["']/
  );
});

test("ReportFilterBar matches Report Center theme and hide in print", () => {
  assert.match(filterBarSource, /#102C57/);
  assert.match(filterBarSource, /#dbe6f2/);
  assert.match(filterBarSource, /print:hidden/);
  assert.match(filterBarSource, /role="search"/);
});

test("ReportFilterBar supports range and single date modes", () => {
  assert.match(filterBarSource, /dateMode === "range"/);
  assert.match(filterBarSource, /dateMode === "single"/);
  assert.match(filterBarSource, /onDateFromChange/);
  assert.match(filterBarSource, /onDateToChange/);
  assert.match(filterBarSource, /onDateChange/);
  assert.match(filterBarSource, /dateSingle/);
  assert.match(filterBarSource, /onDateSingleChange/);
});

test("ReportFilterBar supports quick search with clear action", () => {
  assert.match(filterBarSource, /onSearchQueryChange/);
  assert.match(filterBarSource, /searchPlaceholder/);
  assert.match(filterBarSource, /onSearchQueryChange\(""\)/);
});

test("ReportFilterBar provides standard action buttons and slots", () => {
  assert.match(filterBarSource, /onSearch/);
  assert.match(filterBarSource, /onReset/);
  assert.match(filterBarSource, /onPrint/);
  assert.match(filterBarSource, /onExportExcel/);
  assert.match(filterBarSource, /isPrinting/);
  assert.match(filterBarSource, /isExporting/);
  assert.match(filterBarSource, /secondaryRow/);
  assert.match(filterBarSource, /extraActions/);
  assert.match(filterBarSource, /actions/);
  assert.match(filterBarSource, /customControls/);
});

test("ReportFilterField provides clean field container", () => {
  assert.match(filterBarSource, /export function ReportFilterField/);
  assert.match(filterBarSource, /min-w-\[140px\]/);
});
