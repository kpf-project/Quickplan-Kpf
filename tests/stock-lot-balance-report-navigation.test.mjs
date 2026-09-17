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

test("lot balance report navigation exposes detailed and A4 destinations", () => {
  const source = readRepoFile(
    "src/features/production-line/components/WeightScalePrimaryHeader.js"
  );

  assert.match(source, /key: "lot-balance-report"/);
  assert.match(
    source,
    /href: "\/production-line\/stock\/balance"[\s\S]*label: "รายงานสรุปคงเหลือราย Lot แบบละเอียด"/
  );
  assert.match(
    source,
    /href: "\/production-line\/stock\/balance\/lot"[\s\S]*label: "รายงานสรุปยอดคงเหลือราย Lot"/
  );
  assert.match(
    source,
    /const exactActiveItem = section\.items\.find\(\(item\) => isExactActivePath\(pathname, item\.href\)\)/,
    "nested report routes should prefer an exact active item"
  );
  assert.match(
    source,
    /const isItemActive = isExactActivePath\(pathname, item\.href\)/,
    "only the exact report destination should be highlighted"
  );
  assert.match(
    source,
    /normalizedHref === "\/production-line\/stock\/balance\/lot"/,
    "the A4 destination should opt into route prefetching"
  );
});

test("detailed lot balance report no longer links to the A4 page", () => {
  const source = readRepoFile(
    "src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js"
  );

  assert.doesNotMatch(source, /รายงาน A4 แนวตั้ง/);
  assert.doesNotMatch(
    source,
    /href=\{`\/production-line\/stock\/balance\/lot/
  );
});

test("A4 lot balance preview renders a standalone shadowed paper", () => {
  const source = readRepoFile(
    "src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js"
  );

  assert.doesNotMatch(
    source,
    /<section className="flex flex-col gap-4 border-2 border-\[#102c57\] bg-white p-6 shadow-/
  );
  assert.match(
    source,
    /lot-balance-portrait-print-shell mx-auto w-\[210mm\] min-h-\[297mm\] bg-white[^"]*shadow-/
  );
});

test("A4 lot balance report avoids styled-jsx hydration scope attributes", () => {
  const source = readRepoFile(
    "src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js"
  );
  const staticStyleBlocks = source.match(/<style dangerouslySetInnerHTML=/g) || [];

  assert.doesNotMatch(source, /<style\s+jsx\s+global>/);
  assert.equal(
    staticStyleBlocks.length,
    2,
    "screen and print CSS should render as stable static style blocks"
  );
});

test("A4 lot balance report content is dark black on screen and in print", () => {
  const source = readRepoFile(
    "src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js"
  );
  const darkShellRules =
    source.match(
      /\.lot-balance-portrait-print-shell\s*\{[^}]*color: #111111 !important;[^}]*\}/g
    ) || [];

  assert.equal(
    darkShellRules.length,
    2,
    "screen and print report shells should both force dark-black content"
  );
  assert.doesNotMatch(
    source,
    /color: #ffffff !important;/,
    "A4 report table text should not be forced to white"
  );
});

test("A4 lot balance report uses centered company headers and the logged-in printer", () => {
  const source = readRepoFile(
    "src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js"
  );
  const headerGrids = source.match(/grid grid-cols-\[1fr_auto_1fr\]/g) || [];
  const centeredTitles = source.match(/lot-balance-report-title[^\"]*text-center/g) || [];
  const thaiCompanyNames = source.match(/บริษัท เคพีฟู้ดส์ จำกัด/g) || [];
  const englishCompanyNames = source.match(/K\.P\. foods Co\.,Ltd\./g) || [];
  const printerBindings = source.match(/profile\.username \|\| "-"/g) || [];

  assert.equal(headerGrids.length, 2, "preview and print should use centered three-column headers");
  assert.equal(centeredTitles.length, 2, "both report titles should occupy the centered column");
  assert.equal(thaiCompanyNames.length, 2, "both headers should show the requested Thai company name");
  assert.equal(englishCompanyNames.length, 2, "both headers should show the requested English company name");
  assert.equal(printerBindings.length, 2, "both headers should display the logged-in username");
  assert.doesNotMatch(source, /profile\?\.name|profile\.name/);
});
