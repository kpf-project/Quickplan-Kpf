import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  combineLotQuantityBreakdowns,
  formatLotUnitReference,
  formatReadableLotQuantityAmount,
  formatReadableLotQuantityUnit,
  formatReadableLotQuantity,
  getLotQuantityBreakdown,
} from "../src/lib/inventoryUnitDisplay.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function buildRecord(baseQuantity) {
  return {
    SKU_CODE: "M03-0002",
    BASE_GOODS_CODE: "M03-0002",
    STOCK_GOODS_CODE: "M03-00020",
    BASE_UNIT_NAME: "KG",
    STOCK_UNIT_NAME: "ถุงx25กก.",
    STOCK_UNIT_FACTOR: 25,
    QTY_BASE: baseQuantity,
  };
}

test("full stock packs use the real ERP stock unit and trade code", () => {
  const breakdown = getLotQuantityBreakdown(buildRecord(50));

  assert.equal(breakdown.wholeStockUnits, 2);
  assert.equal(breakdown.remainderBaseQuantity, 0);
  assert.equal(formatReadableLotQuantity(breakdown), "2 ถุงx25กก.");
  assert.equal(formatLotUnitReference(breakdown), "M03-00020 · ถุงx25กก.");
});

test("a BOM-sized remainder stays in the base unit", () => {
  const breakdown = getLotQuantityBreakdown(buildRecord(23));

  assert.equal(breakdown.wholeStockUnits, 0);
  assert.equal(breakdown.remainderBaseQuantity, 23);
  assert.equal(formatReadableLotQuantity(breakdown), "23 KG");
  assert.equal(formatLotUnitReference(breakdown), "M03-0002 · KG");
});

test("legacy gateway payload derives the real pack factor from ERP quantities", () => {
  const breakdown = getLotQuantityBreakdown({
    SKU_CODE: "M03-0002",
    GOODS_CODE: "M03-0002",
    UTQ_NAME: "ถุงx25กก.",
    UTQ_K_NAME: "KG",
    QTY: 7,
    QTY_K: 175,
  });

  assert.equal(breakdown.stockUnitFactor, 25);
  assert.equal(formatReadableLotQuantity(breakdown), "7 ถุงx25กก.");
  assert.equal(formatLotUnitReference(breakdown), "ถุงx25กก.");
});

test("a mixed lot displays whole packs plus its base-unit remainder", () => {
  const breakdown = getLotQuantityBreakdown(buildRecord(180.5));

  assert.equal(formatReadableLotQuantity(breakdown), "7 ถุงx25กก. + 5.5 KG");
  assert.equal(formatReadableLotQuantityAmount(breakdown), "7 + 5.5");
  assert.equal(formatReadableLotQuantityUnit(breakdown), "ถุงx25กก. + KG");
  assert.equal(
    formatLotUnitReference(breakdown),
    "M03-00020 · ถุงx25กก. + M03-0002 · KG"
  );
});

test("totals preserve physical pack state across separate lots", () => {
  const combined = combineLotQuantityBreakdowns([
    getLotQuantityBreakdown(buildRecord(12.5)),
    getLotQuantityBreakdown(buildRecord(12.5)),
    getLotQuantityBreakdown(buildRecord(175)),
  ]);

  assert.equal(combined.baseQuantity, 200);
  assert.equal(combined.wholeStockUnits, 7);
  assert.equal(combined.remainderBaseQuantity, 25);
  assert.equal(formatReadableLotQuantity(combined), "7 ถุงx25กก. + 25 KG");
});

test("raw-material LOT gateway exposes ERP unit mappings and uses a LOT-aware cursor", () => {
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-materials"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-materials-summary"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.match(routeSource, /parseSkuLotCursor/);
  assert.match(routeSource, /GOODSMASTER\.GOODS_UTQ = SKUMASTER\.SKU_K_UTQ/);
  assert.match(routeSource, /GOODSMASTER\.GOODS_UTQ = SKUMASTER\.SKU_S_UTQ/);
  assert.match(routeSource, /OR ISNULL\(GoodsUnit\.UTQ_QTY, 0\) = ISNULL\(BaseUnit\.UTQ_QTY, 0\)/);
  assert.match(routeSource, /OR ISNULL\(GoodsUnit\.UTQ_QTY, 0\) = ISNULL\(StockUnit\.UTQ_QTY, 0\)/);
  assert.match(routeSource, /GoodsUnit\.UTQ_NAME.*StockUnit\.UTQ_NAME/s);
  assert.match(routeSource, /UTQ2\.UTQ_QTY_1 AS STOCK_UNIT_FACTOR/);
  assert.match(routeSource, /SUM\(SKUMOVE\.SKM_QTY\) AS QTY_BASE/);
  assert.match(routeSource, /ISNULL\(SKM_LOT_NO, ''\) > @cursorLotNo/);
  assert.match(routeSource, /WARELOCATION\.WL_CODE/);
  assert.match(routeSource, /WARELOCATION\.WL_NAME/);
  assert.match(routeSource, /SELECT TOP \(@limit\) \*[\s\S]*?FROM FilteredRows/);
  assert.match(routeSource, /WL_CODE > @cursorWarehouseCode/);
  assert.match(routeSource, /ORDER BY SKU_CODE ASC, ISNULL\(SKM_LOT_NO, ''\) ASC, WL_CODE ASC/);
});

test("raw-material LOT balance carries weighted purchase cost by SKU and LOT", () => {
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-materials"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-materials-summary"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.match(routeSource, /PurchaseCosts\.SKU_CODE = RawBase\.SKU_CODE/);
  assert.match(routeSource, /PurchaseCosts\.LOT_NO = ISNULL\(RawBase\.SKM_LOT_NO, ''\)/);
  assert.match(routeSource, /SUM\(NET_PURCHASE_AMOUNT\) AS NET_PURCHASE_AMOUNT/);
  assert.match(routeSource, /NET_PURCHASE_AMOUNT \/ NULLIF\(PurchaseCosts\.RECEIVED_BASE_QTY, 0\)/);
  assert.match(routeSource, /QTY_BASE \* UNIT_COST/);
  assert.match(routeSource, /DOCTYPE\.DT_PROPERTIES IN \(301, 303, 304, 336\)/);
  assert.match(routeSource, /ICCAT\.ICCAT_CODE IN \('01', '02', '05', '08', '10'\)/);
  assert.match(routeSource, /@warehouseCode IS NULL OR WARELOCATION\.WL_CODE = @warehouseCode/);
  assert.match(routeSource, /@costStatus IS NULL OR COST_STATUS = @costStatus/);
});

test("raw-material LOT UI keeps unit reference and adds costing without ERP source columns", () => {
  const componentSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "components", "RawMaterialsPageClient.js"),
    "utf8"
  );

  assert.match(componentSource, />รหัสหน่วยอ้างอิง</);
  assert.match(componentSource, />ต้นทุน\/หน่วยหลัก</);
  assert.match(componentSource, />มูลค่าคงเหลือ</);
  assert.match(componentSource, /RAW_MATERIAL_COST_CODES = \["01", "02", "03", "05", "08", "10"\]/);
  assert.doesNotMatch(componentSource, /<th[^>]*>ที่มา ERP<\/th>/);

  const serviceSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "services", "rawMaterialsService.js"),
    "utf8"
  );
  assert.match(serviceSource, /params\.set\("warehouseCode", warehouseCode\)/);
  assert.match(serviceSource, /params\.set\("costStatus", costStatus\)/);
});

test("raw-material service versions the unit schema to bypass stale gateway cache", () => {
  const serviceSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "services", "rawMaterialsService.js"),
    "utf8"
  );

  assert.match(serviceSource, /params\.set\("unitSchema", "4"\)/);
  assert.doesNotMatch(serviceSource, /cacheControl\.includes\("no-store"\)/);
  assert.match(serviceSource, /searchParams\.get\("noCache"\)/);
});

test("LOT costing uses ERP net purchase value and weighted base quantity without VAT", () => {
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-material-lot-costs"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-material-receipts"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.match(routeSource, /DT_PROPERTIES IN \(301, 303, 304, 336\)/);
  assert.match(routeSource, /CASE WHEN DOCTYPE\.DT_PROPERTIES IN \(304, 336\) THEN -1 ELSE 1 END/);
  assert.match(routeSource, /ICCAT_CODE IN \('01', '02', '05', '08', '10'\)/);
  assert.match(routeSource, /TRD_QTY, 0\) \+ COALESCE\(TRANSTKD\.TRD_Q_FREE, 0\)/);
  assert.match(routeSource, /NULLIF\(TRANSTKD\.TRD_UTQQTY, 0\), 1\)/);
  assert.match(routeSource, /SUM\(NET_PURCHASE_AMOUNT\) AS NET_PURCHASE_AMOUNT/);
  assert.match(routeSource, /NET_PURCHASE_AMOUNT \/ NULLIF\(A\.RECEIVED_BASE_QTY, 0\)/);
  assert.match(routeSource, /A\.NET_PURCHASE_AMOUNT < 0 THEN 'review'/);
  assert.match(routeSource, /NULLIF\(LTRIM\(RTRIM\(A\.BASE_UNIT_NAME\)\), ''\) IS NULL/);
  assert.match(routeSource, /GROUP BY SKU_CODE, SKU_NAME, ICCAT_CODE, ICCAT_NAME, LOT_NO, BASE_UNIT_NAME/);
  assert.match(routeSource, /SKUMASTER\.SKU_CODE = @skuCode/);
  assert.match(routeSource, /TRANSTKD\.TRD_LOT_NO[\s\S]*= @lotNo/);
  assert.doesNotMatch(routeSource, /VAT_AMOUNT \/ NULLIF\(A\.RECEIVED_BASE_QTY/);

  const costingSource = fs.readFileSync(
    path.join(rootDir, "src", "lib", "productionCostingService.js"),
    "utf8"
  );
  assert.match(costingSource, /new URLSearchParams\(\{ search: lotNo, skuCode, lotNo, pageSize: "200", costSchema: "1" \}\)/);
  assert.doesNotMatch(costingSource, /new URLSearchParams\(\{ search: materialSkuCode, pageSize: "200"/);
});

test("LOT costing table separates product, LOT, and unit cost columns", () => {
  const componentSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "components", "RawMaterialLotCostPageClient.js"),
    "utf8"
  );

  assert.match(componentSource, />รหัสสินค้า</);
  assert.match(componentSource, />สินค้า</);
  assert.match(componentSource, />LOT</);
  assert.match(componentSource, />ต้นทุน \/ หน่วย</);
  assert.match(componentSource, /const PAGE_SIZE = 100/);
  assert.match(componentSource, /row\.SKU_CODE.*row\.LOT_NO/s);
});

test("raw-material receipt ledger preserves each INV and LOT and prices the net amount excluding VAT", () => {
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-material-receipts"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-material-requisitions"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.match(routeSource, /DT_PROPERTIES IN \(301, 303\)/);
  assert.match(routeSource, /DOCINFO\.DI_REF LIKE 'INV%'/);
  assert.match(routeSource, /CAST\(TRANSTKD\.TRD_B_SELL AS DECIMAL\(28, 8\)\) AS NET_AMOUNT_EXCL_VAT/);
  assert.match(routeSource, /NET_AMOUNT_EXCL_VAT <= 0 THEN 'review'/);
  assert.match(routeSource, /NET_AMOUNT_EXCL_VAT \/ NET_BASE_QTY/);
  assert.match(routeSource, /ORDER BY SKU_CODE ASC, LOT_NO ASC, DI_DATE ASC, DI_REF ASC, DI_KEY ASC, TRD_SEQ ASC, TRD_KEY ASC/);
  assert.match(routeSource, /SKU_CODE > @cursorSkuCode/);
  assert.match(routeSource, /COUNT\(DISTINCT DI_KEY\) AS TOTAL_INVOICES/);
  assert.match(routeSource, /parseReceiptCursor/);
  assert.match(routeSource, /isExport \? 5000 : 200/);
  assert.match(routeSource, /CAST\(DOCINFO\.DI_DATE AS DATE\) AS DI_DATE/);
  assert.match(routeSource, /DOCINFO\.DI_DATE < DATEADD\(DAY, 1, @dateToParam\)/);
  assert.match(routeSource, /AND ICCAT\.ICCAT_CODE IN \('01', '02', '03', '05', '08', '10'\)/);
  assert.doesNotMatch(routeSource, /GROUP BY SKU_CODE/);

  const componentSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "components", "RawMaterialReceiptsPageClient.js"),
    "utf8"
  );
  assert.match(componentSource, />เลขที่ INV</);
  assert.match(componentSource, />รหัสสินค้า</);
  assert.match(componentSource, />ชื่อสินค้า</);
  assert.match(componentSource, />ราคา\/หน่วย<br \/>ไม่รวม VAT</);
  assert.match(componentSource, /row\.UNIT_PRICE_EXCL_VAT/);
  assert.match(componentSource, /row\.NET_AMOUNT_EXCL_VAT/);
  assert.match(componentSource, /key=\{rowKey\(row\)\}/);
  assert.doesNotMatch(componentSource, /<th[^>]*>ผู้ขาย<\/th>/);
  assert.match(componentSource, /<aside className="fixed bottom-0 right-0 top-\[49px\]/);
  assert.doesNotMatch(componentSource, /xl:grid-cols-\[minmax\(0,1fr\)_380px\]/);
  assert.match(componentSource, /w-\[260px\][^>]*>ชื่อสินค้า/);
  assert.match(componentSource, /whitespace-normal break-words[^>]*>\{row\.SKU_NAME/);
  assert.doesNotMatch(componentSource, /truncate whitespace-nowrap[^>]*>\{row\.SKU_NAME/);
  assert.match(componentSource, /pageSize: String\(EXPORT_PAGE_SIZE\)/);
  assert.match(componentSource, /export: "1"/);
  assert.match(componentSource, /import\("exceljs\/dist\/exceljs\.min\.js"\)/);
  assert.match(componentSource, /text\/csv;charset=utf-8/);
  assert.doesNotMatch(componentSource, />PO</);
  assert.doesNotMatch(componentSource, />GR</);
});

test("raw-material API keeps trade-code and unit fields in the LOT payload", () => {
  const routeSource = fs.readFileSync(
    path.join(rootDir, "src", "app", "api", "raw-materials", "route.js"),
    "utf8"
  );

  for (const field of [
    "BASE_GOODS_CODE",
    "STOCK_GOODS_CODE",
    "STOCK_UNIT_NAME",
    "STOCK_UNIT_FACTOR",
    "BASE_UNIT_NAME",
    "QTY_BASE",
    "WL_CODE",
    "WL_NAME",
  ]) {
    assert.match(routeSource, new RegExp(`"${field}"`));
  }
});

test("summary endpoint exposes split-unit quantities for UI and export", () => {
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-materials-summary"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-materials-movement"', routeStart);
  const summarySource = gatewaySource.slice(routeStart, routeEnd);
  const apiSource = fs.readFileSync(
    path.join(rootDir, "src", "app", "api", "raw-materials-summary", "route.js"),
    "utf8"
  );
  const serviceSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "services", "rawMaterialsService.js"),
    "utf8"
  );

  for (const field of ["STOCK_UNIT_NAME", "STOCK_UNIT_FACTOR", "BASE_UNIT_NAME", "QTY_BASE"]) {
    assert.match(summarySource, new RegExp(field));
    assert.match(apiSource, new RegExp(`"${field}"`));
  }
  assert.match(serviceSource, /params\.set\("summaryUnitSchema", "1"\)/);
});

test("summary table shares one 15-column CSS grid between header and virtual rows", () => {
  const componentSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "components", "RawMaterialsPageClient.js"),
    "utf8"
  );
  assert.match(componentSource, /const SUMMARY_GRID_TEMPLATE = .*minmax\(0,80fr\)/);
  assert.equal((componentSource.match(/gridTemplateColumns: SUMMARY_GRID_TEMPLATE/g) || []).length, 3);
  assert.match(componentSource, /loading\s*\? \{ display: "block", width: "100%" \}/);
  assert.match(componentSource, /style=\{\{ gridColumn: "1 \/ -1" \}\}/);
  assert.match(componentSource, /gridColumn: "3 \/ span 5"/);
  assert.doesNotMatch(componentSource, /summaryIsVirtualized/);
  const rowStart = componentSource.indexOf("key={`summary-");
  const rowEnd = componentSource.indexOf("</tr>", rowStart);
  const summaryRow = componentSource.slice(rowStart, rowEnd);
  assert.equal((summaryRow.match(/<td/g) || []).length, 15);
  assert.doesNotMatch(summaryRow, /\sw-\[/);
  assert.equal((summaryRow.match(/text-center/g) || []).length >= 5, true);
  assert.equal((componentSource.match(/border-white\/50/g) || []).length >= 15, true);
});

test("material verification uses only warehouses 02 and 04 and exposes their breakdown", () => {
  const routeSource = fs.readFileSync(
    path.join(rootDir, "src", "app", "api", "production-planning", "material-verify", "summary", "route.js"),
    "utf8"
  );
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );
  const modalSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "production-planning", "components", "MaterialVerifyModal.js"),
    "utf8"
  );

  assert.match(routeSource, /summaryBySkuParams\.set\("warehouseCodes", "02,04"\)/);
  assert.match(routeSource, /warehouseBreakdown/);
  assert.match(routeSource, /requirement_unit: stockMeta\.tradeUnit/);
  assert.match(routeSource, /unit: row\.requirement_unit/);
  assert.match(gatewaySource, /STRING_SPLIT\(@warehouseCodesParam, ','\)/);
  assert.match(gatewaySource, /WAREHOUSE_BREAKDOWN/);
  assert.match(modalSource, /ความต้องการจาก BOM/);
  assert.match(modalSource, /สต็อกพร้อมใช้/);
  assert.match(modalSource, /คงเหลือหลังใช้/);
  assert.match(modalSource, /คลัง \{warehouse\.warehouseCode\}/);
  assert.match(modalSource, /backdrop-blur-\[3px\]/);
  assert.match(modalSource, /fixed inset-0 z-\[300\]/);
  assert.match(modalSource, /Section: \{section\.name\}/);
  assert.match(modalSource, /Trade Code/);
  assert.match(modalSource, /mat\.requiredBaseQty/);
  assert.match(modalSource, /const aggregatedMap = new Map\(\)/);
  assert.match(modalSource, /existing\.requiredQty = Number\(existing\.requiredQty/);
  assert.match(modalSource, /existing\.requiredBaseQty = Number\(existing\.requiredBaseQty/);
  assert.match(modalSource, /const isExpanded = expandedMaterials\[item\.materialCode\] === true/);
  assert.match(modalSource, /เปิดทั้งหมด/);
  assert.match(modalSource, /ยุบทั้งหมด/);
});
