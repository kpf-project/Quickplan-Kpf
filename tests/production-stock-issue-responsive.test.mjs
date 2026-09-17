import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../src/features/production-line/components/ProductionStockIssuePageClient.js",
  import.meta.url
);

test("stock issue page contains wide tables without overflowing the document", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /min-w-0 overflow-hidden/);
  assert.match(source, /overflow-x-auto[^"\n]*overscroll-x-contain/);
  assert.match(source, /min-w-\[72rem\]/);
  assert.match(source, /min-w-\[56rem\]/);
});

test("stock issue dialogs fit mobile dynamic viewports", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /max-h-\[100dvh\]/);
  assert.match(source, /max-h-\[44dvh\]/);
  assert.match(source, /w-full min-w-0 sm:min-w-\[17rem\]/);
  assert.match(source, /items-stretch p-0 sm:items-center sm:p-4/);
  assert.match(source, /w-full[^"\n]*sm:w-auto/);
});

test("stock issue controls stack on mobile and preserve larger layouts", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /flex-col gap-2[^"\n]*sm:flex-row/);
  assert.match(source, /grid-cols-2.*sm:flex/s);
  assert.match(source, /text-base.*sm:text-3xl/s);
});

test("mobile issue picker keeps search visible and collapses advanced filters", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /isMobileFiltersOpen/);
  assert.match(source, /aria-expanded=\{isMobileFiltersOpen\}/);
  assert.match(source, /id="mobile-issue-picker-filters"/);
  assert.match(source, /ตัวกรองเพิ่มเติม/);
  assert.match(source, /เลือกแล้ว \{selectedPickerSummary\.totalCount\} รายการ/);
  assert.match(source, /ChevronLeft/);
  assert.match(source, /ChevronRight/);
});
