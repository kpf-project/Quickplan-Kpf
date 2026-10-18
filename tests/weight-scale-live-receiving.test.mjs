import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const repoRoot = path.resolve(import.meta.dirname, "..");
const livePagePath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLivePageClient.js"
);
const liveProductModalPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLiveProductPickerModal.js"
);
const inboundPagePath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScalePageClient.js"
);
const labelServicePath = path.join(
  repoRoot,
  "src/features/production-line/services/weightScaleReceiptLabel.js"
);
const sidebarPath = path.join(repoRoot, "src/components/Sidebar.js");
const headerPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScalePrimaryHeader.js"
);
const liveRoutePath = path.join(
  repoRoot,
  "src/app/production-line/weight-scale-live/page.js"
);
const receiptRoutePath = path.join(
  repoRoot,
  "src/app/api/scale/receipts/route.js"
);
const liveReceiptRoutePath = path.join(
  repoRoot,
  "src/app/api/scale/live/receipts/route.js"
);
const liveAccessPath = path.join(
  repoRoot,
  "src/lib/scale/live-access.js"
);
const liveProductsPath = path.join(
  repoRoot,
  "src/lib/scale/live-products.js"
);
const receiptServicePath = path.join(repoRoot, "src/lib/scale/receipts.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("inbound and serial receiving pages share one receipt label contract", () => {
  assert.equal(
    fs.existsSync(labelServicePath),
    true,
    "shared receipt label service should exist"
  );

  const inboundSource = read(inboundPagePath);
  const liveSource = read(livePagePath);
  const expectedImport = /weightScaleReceiptLabel/;

  assert.match(inboundSource, expectedImport);
  assert.match(liveSource, expectedImport);
  assert.doesNotMatch(inboundSource, /function buildReceiptPrintLabel\(/);
  assert.doesNotMatch(liveSource, /function buildReceiptPrintLabel\(/);
});

test("serial receiving saves the receipt before it sends the print job", () => {
  const source = read(livePagePath);
  const saveStart = source.indexOf("async function handleSaveWeightResult()");
  const saveEnd = source.indexOf("\n  return (", saveStart);
  const saveSource = source.slice(saveStart, saveEnd);

  assert.ok(saveStart > -1, "save handler should exist");
  assert.ok(
    saveSource.indexOf("await saveWeightScaleLiveReceipt(")
      < saveSource.indexOf("await printWeightScaleLabelViaAgent("),
    "receipt must be persisted before printing"
  );
  assert.match(saveSource, /receipt:\s*result\?\.receipt/);
});

test("serial receiving bootstraps product config before creating a new lot", () => {
  const source = read(livePagePath);

  assert.match(source, /async function persistSelectedProductConfig\(/);
  assert.match(
    source,
    /const productConfigId\s*=\s*await persistSelectedProductConfig\(\)/
  );
  assert.match(source, /resolveActiveLotId\(productConfigId\)/);
  assert.match(
    source,
    /saveWeightScaleLiveReceipt\(\{[\s\S]*productConfigId,/
  );
});

test("serial settings consume the saved config envelope returned by the agent", () => {
  const source = read(livePagePath);

  assert.match(
    source,
    /normalizeSerialConfig\(result\?\.config\s*\|\|\s*result\)/
  );
});

test("serial receiving keeps twenty latest records and supports receipt-only reprint", () => {
  const source = read(livePagePath);

  assert.match(source, /RECENT_RECEIPTS_LIMIT\s*=\s*20/);
  assert.match(source, /handleReprintReceipt/);
  assert.match(source, /grossWeightKg/);
  assert.match(source, /tareWeightKg/);
  assert.match(source, /พิมพ์ซ้ำ/);

  const reprintStart = source.indexOf("async function handleReprintReceipt");
  const reprintEnd = source.indexOf("\n  async function", reprintStart + 1);
  const reprintSource = source.slice(reprintStart, reprintEnd);

  assert.ok(reprintStart > -1, "reprint handler should exist");
  assert.match(reprintSource, /printWeightScaleLabelViaAgent/);
  assert.doesNotMatch(
    reprintSource,
    /saveWeightScaleLiveReceipt|saveScaleReceipt|createScaleLot/
  );
});

test("serial receiving history is isolated from the original inbound scale history", () => {
  const liveSource = read(livePagePath);
  const liveRouteSource = read(liveRoutePath);
  const liveReceiptRouteSource = read(liveReceiptRoutePath);
  const liveProductsSource = read(liveProductsPath);
  const receiptRouteSource = read(receiptRoutePath);
  const receiptServiceSource = read(receiptServicePath);

  assert.match(liveSource, /recentWeightSource:\s*"serial-live"/);
  assert.match(liveProductsSource, /LIVE_SCALE_WEIGHT_SOURCE/);
  assert.match(liveReceiptRouteSource, /LIVE_SCALE_WEIGHT_SOURCE/);
  assert.match(receiptRouteSource, /recentWeightSource/);
  assert.match(receiptServiceSource, /metadata->>weightSource/);
  assert.match(receiptServiceSource, /\.filter\(\s*"metadata->>weightSource"/);
});

test("serial receiving scopes WIP products across authorized departments and uses its own endpoint", () => {
  const liveSource = read(livePagePath);
  const liveRouteSource = read(liveRoutePath);
  const liveReceiptRouteSource = read(liveReceiptRoutePath);
  const liveAccessSource = read(liveAccessPath);
  const liveProductsSource = read(liveProductsPath);
  const sharedReceiptRouteSource = read(receiptRoutePath);

  assert.match(liveRouteSource, /loadWeightScaleLiveProductsData/);
  assert.match(liveProductsSource, /LIVE_SCALE_WIP_CATEGORY_CODE/);
  assert.match(liveProductsSource, /\.eq\("iccat_code", LIVE_SCALE_WIP_CATEGORY_CODE\)/);
  assert.match(liveAccessSource, /production_department_users/);
  assert.match(liveAccessSource, /production_department_products/);
  assert.match(liveAccessSource, /role === "editor"/);
  assert.doesNotMatch(liveAccessSource, /SCALE_DEPARTMENT_CODE|KP13/);
  assert.match(liveSource, /selectedProduct\?\.departmentId/);
  assert.match(liveSource, /product\.departmentCode/);
  assert.match(liveSource, /saveWeightScaleLiveReceipt/);
  assert.match(liveReceiptRouteSource, /assertWeightScaleLiveReceiptAccess/);
  assert.doesNotMatch(sharedReceiptRouteSource, /assertWeightScaleLiveReceiptAccess/);
});

test("serial receiving is reachable from the system sidebar and weight menu", () => {
  const routePattern = /\/production-line\/weight-scale-live/;

  assert.match(read(sidebarPath), routePattern);
  assert.match(read(headerPath), routePattern);
});

test("serial receiving avoids expensive decorative effects on the live weight surface", () => {
  const source = read(livePagePath);

  assert.doesNotMatch(source, /radial-gradient/);
  assert.doesNotMatch(source, /backdrop-blur/);
});

test("serial receiving owns an independent Thai industrial station interface", () => {
  const source = read(livePagePath);

  assert.doesNotMatch(source, /WeightScalePrimaryHeader/);
  assert.match(source, /KPF <span>WEIGH PRO/);
  assert.match(source, /รอน้ำหนักนิ่ง/);
  assert.match(source, /น้ำหนักสุทธิ \(NET\)/);
  assert.match(source, /เริ่มรอบใหม่/);
  assert.match(source, /เปลี่ยนสินค้า/);
  assert.match(source, /รายการชั่งล่าสุด/);
  assert.match(source, /bg-\[var\(--surface-navy,#001F3F\)\]/);
  assert.match(source, /text-\[#E9C349\]/);
});

test("live scale uses the selected light workstation layout and displays net as the main weight", () => {
  const source = read(livePagePath);
  const css = read(path.join(repoRoot, "src/features/production-line/components/WeightScaleLivePageClient.module.css"));
  const instrument = source.slice(source.indexOf('data-testid="live-net-weight"'), source.indexOf('className={styles.metrics}'));
  assert.match(instrument, /currentWeightEvaluation.netWeightKg.toFixed\(3\)/);
  assert.doesNotMatch(instrument, /grossWeightKg.toFixed/);
  assert.match(source, /disabled=\{isSavingWeight \|\| !canSave\}/);
  assert.match(source, /receipt.workstationId === workstationId/);
  assert.match(source, /product.departmentId === departmentId/);
  assert.match(source, /stationReceipts.map/);
  assert.match(css, /grid-template-columns: minmax\(210px/);
  assert.match(css, /@media \(max-width: 639px\)/);
  const selection = source.slice(source.indexOf("function selectProductForSetup"), source.indexOf("async function saveProductPickerSetup"));
  assert.match(selection, /setLiveReading\(null\)/);
  assert.match(selection, /setIsStable\(false\)/);
  assert.match(selection, /setIsReadingFresh\(false\)/);
});

test("station history never mixes other stations, departments, or unassigned legacy receipts", () => {
  const source = read(livePagePath);
  const body = source.slice(source.indexOf("function filterStationReceipts("), source.indexOf("\nfunction buildInitialReceiptsState"));
  const filter = vm.runInNewContext(`${body}; filterStationReceipts`);
  const rows = [
    { id: "a", workstationId: "one", productCode: "P1" },
    { id: "b", workstationId: "two", productCode: "P1" },
    { id: "c", workstationId: "one", productCode: "P2" },
    { id: "legacy", workstationId: null, productCode: "P1" },
  ];
  const products = [{ code: "P1", departmentId: "D1" }, { code: "P2", departmentId: "D2" }];
  assert.deepEqual(Array.from(filter(rows, "one", "D1", products), row => row.id), ["a"]);
  assert.deepEqual(Array.from(filter(rows, "one", null, products), row => row.id), ["a", "c"]);
  assert.equal(filter(rows, null, "D1", products).length, 0);
});

test("compact station separates product selection from hardware tabs and reuses pallet product images", () => {
  const source = read(livePagePath);
  const header = source.slice(source.indexOf("<WeightScaleLiveSubHeader"), source.indexOf('{activeStationMode === "return"'));
  assert.doesNotMatch(header, /openProductSetup/);
  assert.match(header, /ตั้งค่าอุปกรณ์/);
  assert.match(source, /เปลี่ยนสินค้า \/ LOT/);
  assert.match(source, /hidden=\{settingsTab !== "scale"\}/);
  assert.match(source, /hidden=\{settingsTab !== "printer"\}/);
  assert.match(source, /src=\{selectedProduct.imageUrl\}/);
  assert.doesNotMatch(source, /scale-wkb0002-illustration/);
  assert.match(read(path.join(repoRoot, "src/lib/scale/live-products.js")), /iccat_name,image_url/);
});

test("serial receiving opens settings and product selection in modals without side metrics", () => {
  const source = [
    read(livePagePath),
    read(liveProductModalPath),
    read(path.join(repoRoot, "src/components/ProductPicker.js")),
  ].join("\n");

  assert.ok(
    (source.match(/role="dialog"/g) || []).length >= 2,
    "settings and product selection should each use a dialog"
  );
  assert.match(source, /fixed inset-0 z-\[80\]/);
  assert.doesNotMatch(source, /รอบชั่งเฉลี่ย/);
  assert.doesNotMatch(source, /รายการสำเร็จวันนี้/);
  assert.doesNotMatch(source, /น้ำหนักสุทธิรวม/);
  assert.doesNotMatch(source, /averageCycleSeconds/);
});

test("serial receiving product modal matches the inbound picker without minimum weight", () => {
  const pageSource = read(livePagePath);
  const modalSource = read(liveProductModalPath) + read(path.join(repoRoot, "src/components/ProductPicker.js"));

  assert.match(pageSource, /WeightScaleLiveProductPickerModal/);
  assert.match(modalSource, /ค้นหาชื่อสินค้า หรือรหัสสินค้า/);
  assert.match(modalSource, /<table[\s\S]*<thead[\s\S]*<tbody/);
  assert.match(modalSource, /ตั้งค่าก่อนเริ่มชั่ง/);
  assert.match(modalSource, /LOT ปัจจุบัน/);
  assert.match(modalSource, /น้ำหนักภาชนะ/);
  assert.match(modalSource, /ใช้สินค้านี้/);
  assert.doesNotMatch(modalSource, /น้ำหนักขั้นต่ำ|เป้าหมาย \(MIN\)/);
});

test("new serial receiving files contain no common UTF-8 mojibake sequences", () => {
  const source = [
    read(livePagePath),
    read(liveProductModalPath),
    read(path.join(repoRoot, "src/features/production-line/services/localScaleAgentClient.js")),
    read(path.join(repoRoot, "local-scale-agent/server.js")),
  ].join("\n");

  assert.doesNotMatch(source, /à¸|à¹|â€|Ã|Â/);
});
