import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("gateway defines /api/production-receipts route with DT_PROPERTIES=305 and ICCAT 03", () => {
  const gatewaySource = fs.readFileSync(
    path.join(rootDir, "kpf-api-gateway", "server.js"),
    "utf8"
  );

  const routeStart = gatewaySource.indexOf('app.get("/api/production-receipts"');
  assert.ok(routeStart > 0, "Route /api/production-receipts must exist in server.js");

  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-material-requisitions"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.match(routeSource, /DOCTYPE\.DT_PROPERTIES = 305/);
  assert.match(routeSource, /ICCAT\.ICCAT_CODE = '03'/);
  assert.match(routeSource, /DEPTTAB\.DEPT_CODE/);
  assert.match(routeSource, /PRJTAB\.PRJ_NAME/);
  assert.match(routeSource, /parseReceiptCursor/);
  assert.match(routeSource, /NET_AMOUNT_EXCL_VAT/);
  assert.match(routeSource, /UNIT_PRICE_EXCL_VAT/);
});

test("rawMaterialsService and client define production receipts functions", () => {
  const serviceSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "services", "rawMaterialsService.js"),
    "utf8"
  );
  assert.match(serviceSource, /export async function listProductionReceipts/);
  assert.match(serviceSource, /\/api\/production-receipts/);

  const clientSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "services", "rawMaterialsClient.js"),
    "utf8"
  );
  assert.match(clientSource, /export async function fetchProductionReceipts/);
  assert.match(clientSource, /\/api\/production-receipts/);

  const routeSource = fs.readFileSync(
    path.join(rootDir, "src", "app", "api", "production-receipts", "route.js"),
    "utf8"
  );
  assert.match(routeSource, /listProductionReceipts/);
});

test("RawMaterialReceiptsPageClient renders both tabs with matching design", () => {
  const componentSource = fs.readFileSync(
    path.join(rootDir, "src", "features", "raw-materials", "components", "RawMaterialReceiptsPageClient.js"),
    "utf8"
  );

  assert.match(componentSource, /ประวัติรับเข้าวัตถุดิบแยก LOT/);
  assert.match(componentSource, /รับสินค้าจากการผลิต/);
  assert.match(componentSource, /fetchProductionReceipts/);
  assert.match(componentSource, /fetchRawMaterialReceipts/);
  assert.match(componentSource, /isProduction \? "เลขที่เอกสาร" : "เลขที่ INV"/);
  assert.match(componentSource, /ประเภท: 03 \(งานระหว่างทำ\)/);
  assert.match(componentSource, /DEPT_THAIDESC/);
  assert.match(componentSource, /PRJ_NAME/);
});
