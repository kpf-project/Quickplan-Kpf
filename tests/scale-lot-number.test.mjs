import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const helperSource = fs.readFileSync(
  path.join(repoRoot, "src/features/production-line/services/scaleLotNumber.js"),
  "utf8"
);
const helperModule = await import(
  `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
);
const {
  buildAutoScaleLotNo,
  getScaleShiftNumber,
  resolveAutoScaleLot,
} = helperModule;

test("buildAutoScaleLotNo formats production date, product digits, and shift", () => {
  assert.equal(
    buildAutoScaleLotNo("WKB-0002", new Date("2026-06-29T01:00:00.000Z")),
    "2906260002-1"
  );
});

test("buildAutoScaleLotNo keeps overnight shift on the previous production date", () => {
  assert.equal(
    buildAutoScaleLotNo("WKB-0002", new Date("2026-06-29T23:59:00.000Z")),
    "2906260002-2"
  );
});

test("getScaleShiftNumber switches from shift 1 to shift 2 after 19:00 Bangkok time", () => {
  assert.equal(getScaleShiftNumber(new Date("2026-06-29T12:00:00.000Z")), 1);
  assert.equal(getScaleShiftNumber(new Date("2026-06-29T12:01:00.000Z")), 2);
});

test("resolveAutoScaleLot rotates a stale current lot to the production date and shift", () => {
  assert.deepEqual(
    resolveAutoScaleLot({
      productCode: "WKB-0002",
      currentLotNo: "0707260002-1",
      timestamp: new Date("2026-07-14T04:27:30.403Z"),
    }),
    {
      expectedLotNo: "1407260002-1",
      currentLotNo: "0707260002-1",
      shouldRotate: true,
    }
  );
});

test("receipt persistence resolves the expected lot before inserting a weight", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/lib/scale/receipts.js"),
    "utf8"
  );

  assert.match(source, /import \{ buildAutoScaleLotNo \}/);
  assert.match(source, /const expectedLotNo = buildAutoScaleLotNo\(configResult\.data\.sku_code, weighedAt\)/);
  assert.match(source, /\.eq\("lot_code", expectedLotNo\)/);
  assert.match(source, /lot_id: resolvedLotId/);
  assert.match(source, /current_lot_id: resolvedLotId/);
});

test("weight scale page refreshes its visible current lot from the saved receipt", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/WeightScalePageClient.js"),
    "utf8"
  );

  assert.match(source, /function applyResolvedReceiptLot\(receipt\)/);
  assert.match(source, /applyResolvedReceiptLot\(result\?\.receipt\)/);
  assert.match(source, /currentLotId: resolvedLotId/);
  assert.match(source, /lotNo: resolvedLotNo/);
});

test("weight scale page auto-applies generated lot while keeping manual lot editable", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/WeightScalePageClient.js"),
    "utf8"
  );

  assert.match(source, /import \{ buildAutoScaleLotNo \}/);
  assert.match(source, /const autoLotNo = buildAutoScaleLotNo\(productCode\);/);
  assert.match(source, /setDraftLotNo\(autoLotNo\);/);
  assert.match(source, /applyAutoDraftLotNo\(selectedProductCode\);/);
  assert.match(source, /setDraftLotNo\(lotOption\.lotNo\);/);
});

test("product overview falls back to auto lot and uses dark product names", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/WeightScalePageClient.js"),
    "utf8"
  );

  assert.match(
    source,
    /const overviewAutoLot = buildAutoScaleLotNo\(productCode\);/,
    "overview rows should compute the same auto lot as the selected product flow"
  );
  assert.match(
    source,
    /overviewProfile\.lotNo[\s\S]*\|\| overviewAutoLot[\s\S]*\|\| product\.currentLot\?\.lotNo/,
    "overview lot should fall back to the generated auto lot before showing a dash"
  );
  assert.doesNotMatch(
    source,
    /text-\[#445468\]/,
    "non-selected product names should use a darker color"
  );
  assert.match(
    source,
    /isSelected \? "text-white\/92" : "text-black"/,
    "non-selected product names should render as dark black"
  );
});
