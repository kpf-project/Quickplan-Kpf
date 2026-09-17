import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("weight scale header shows the full lot number on one line", () => {
  const source = readRepoFile("src/features/production-line/components/WeightScalePageClient.js");

  assert.doesNotMatch(
    source,
    /<p className="[^"]*truncate[^"]*">\{selectedProductProfile\.lotNo \|\| "-"\}<\/p>/,
    "lot number display should not truncate long lot values"
  );
  assert.match(
    source,
    /<p className="[^"]*whitespace-nowrap[^"]*">\{selectedProductProfile\.lotNo \|\| "-"\}<\/p>/,
    "lot number display should stay on one line"
  );
});

test("stock opening balance copy uses KP13 scope instead of the old DEP-BIS label", () => {
  const checkedFiles = [
    "src/lib/production-stock-opening-balances.js",
    "src/features/production-line/components/ProductionStockOpeningBalanceImportClient.js",
    "src/app/production-line/stock/page.js",
  ];

  checkedFiles.forEach((relativePath) => {
    assert.doesNotMatch(
      readRepoFile(relativePath),
      /DEP-BIS/,
      `${relativePath} should not reference the old DEP-BIS scope`
    );
  });
});

test("database stock functions are patched to use KP13 active scope", () => {
  const source = readRepoFile(
    "supabase/migrations/20260629_patch_stock_scope_to_kp13.sql"
  );
  const latestPatchSource = readRepoFile(
    "supabase/migrations/20260714000000_repatch_stock_issue_scope_to_kp13.sql"
  );

  assert.match(source, /create_production_stock_issue/);
  assert.match(source, /sync_production_weight_receipt_stock_movement/);
  assert.match(source, /KP13/);
  assert.doesNotMatch(source, /DEP-BIS/);

  assert.match(latestPatchSource, /create_production_stock_issue/);
  assert.match(latestPatchSource, /sync_production_weight_receipt_stock_movement/);
  assert.match(latestPatchSource, /KP13/);
  assert.doesNotMatch(latestPatchSource, /DEP-BIS/);
});

test("product picker includes a sequence column before product code", () => {
  const source = readRepoFile("src/features/production-line/components/WeightScalePageClient.js");

  assert.match(
    source,
    /<th className="w-\[8%\][^"]*">\{"\\u0e25\\u0e33\\u0e14\\u0e31\\u0e1a"\}<\/th>[\s\S]*<th className="w-\[16%\][^"]*">\{"\\u0e23\\u0e2b\\u0e31\\u0e2a"\}<\/th>/,
    "sequence header should appear before product code"
  );
  assert.match(
    source,
    /filteredProducts\.map\(\(product, productIndex\) =>/,
    "product picker should expose productIndex for sequence numbering"
  );
  assert.match(
    source,
    /\{productIndex \+ 1\}/,
    "product picker should render one-based sequence numbers"
  );
});

test("recent receipt history table uses compact row spacing", () => {
  const source = readRepoFile("src/features/production-line/components/WeightScalePageClient.js");
  const historyTableStart = source.indexOf("LOWER SECTION: ACTIVITY JOURNAL");
  const historyTableEnd = source.indexOf("{isSettingsOpen", historyTableStart);
  const historyTableSource = source.slice(historyTableStart, historyTableEnd);

  assert.ok(historyTableStart > -1, "history table section should be present");
  assert.doesNotMatch(
    historyTableSource,
    /px-[46] py-4/,
    "history table should not use tall py-4 cell padding"
  );
  assert.match(
    historyTableSource,
    /px-4 py-2/,
    "history table should use compact py-2 cell padding"
  );
});

test("recent receipt history separates product code and name and hides test filters", () => {
  const source = readRepoFile("src/features/production-line/components/WeightScalePageClient.js");
  const historyTableStart = source.indexOf("LOWER SECTION: ACTIVITY JOURNAL");
  const historyTableEnd = source.indexOf("{isSettingsOpen", historyTableStart);
  const historyTableSource = source.slice(historyTableStart, historyTableEnd);

  assert.match(
    historyTableSource,
    /รหัสสินค้า[\s\S]*ชื่อสินค้า/,
    "history table should render product code and product name as separate columns"
  );
  assert.doesNotMatch(
    historyTableSource,
    /productCode\}-\{receipt\.productName/,
    "history table should not combine product code and product name in one cell"
  );
  assert.doesNotMatch(
    source,
    /RECEIPT_FILTER_OPTIONS|receiptFilter|setReceiptFilter|ข้อมูลทดสอบ|ทั้งหมด|โหมด:/,
    "weight scale page should not expose test/all receipt filters or test mode controls"
  );
  assert.match(
    source,
    /recentReceipts\.filter\(\(receipt\) => !receipt\.isTest\)/,
    "history should show only real scale receipts"
  );
});

test("weight scale page uses compact navigation header without the large title block", () => {
  const pageSource = readRepoFile("src/features/production-line/components/WeightScalePageClient.js");
  const headerSource = readRepoFile("src/features/production-line/components/WeightScalePrimaryHeader.js");

  assert.match(
    pageSource,
    /<WeightScalePrimaryHeader[\s\S]*?\scompact[\s\S]*?actions=/,
    "weight scale page should opt into the compact header layout"
  );
  assert.match(
    headerSource,
    /!\s*compact\s*\?\s*\(/,
    "primary header should skip the title intro block when compact is enabled"
  );
  assert.match(
    headerSource,
    /compact\s*\?\s*"flex-1"\s*:\s*"border-t border-white\/10 pt-4"/,
    "compact header should move the menu up by removing the top divider spacing"
  );
});
