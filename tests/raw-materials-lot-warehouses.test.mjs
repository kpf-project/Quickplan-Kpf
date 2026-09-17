import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewaySource = fs.readFileSync(
  path.join(rootDir, "kpf-api-gateway", "server.js"),
  "utf8"
);

const summaryDisplayRoutes = [
  ["LOT", "/api/raw-materials", "/api/raw-materials-summary"],
  ["summary", "/api/raw-materials-summary", "/api/raw-materials-movement"],
];

summaryDisplayRoutes.forEach(([label, route, nextRoute]) => {
  test(`raw-materials ${label} endpoint includes warehouses 02, 04, 05, and 17`, () => {
    const routeStart = gatewaySource.indexOf(`app.get("${route}"`);
    const routeEnd = gatewaySource.indexOf(`app.get("${nextRoute}"`, routeStart);
    const routeSource = gatewaySource.slice(routeStart, routeEnd);

    assert.ok(routeStart >= 0 && routeEnd > routeStart);
    assert.match(routeSource, /WARELOCATION\.WL_CODE IN \('02', '04', '05', '17'\)/);
  });
});

test("raw-materials movement endpoint remains limited to warehouses 02 and 04", () => {
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-materials-movement"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/material-movement-log"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.match(routeSource, /WARELOCATION\.WL_CODE IN \('02', '04'\)/);
});

test("FIFO requisition LOT source exposes warehouse and limits stock to 02 and 04", () => {
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-material-lots-by-parent"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/trade-codes"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.match(routeSource, /WARELOCATION\.WL_CODE IN \('02', '04'\)/);
  assert.doesNotMatch(routeSource, /WARELOCATION\.WL_CODE IN \('02', '04', '05', '17'\)/);
  assert.match(routeSource, /WARELOCATION\.WL_CODE/);
  assert.match(routeSource, /ORDER BY PARENT_SKU_CODE ASC, WL_CODE ASC, FIFO_DATE ASC/);
});

test("raw-material LOT rows are separated by warehouse while product totals can combine rows", () => {
  const routeStart = gatewaySource.indexOf('app.get("/api/raw-materials"');
  const routeEnd = gatewaySource.indexOf('app.get("/api/raw-materials-summary"', routeStart);
  const routeSource = gatewaySource.slice(routeStart, routeEnd);

  assert.match(routeSource, /WARELOCATION\.WL_CODE/);
  assert.match(routeSource, /WARELOCATION\.WL_NAME/);
  assert.match(routeSource, /GROUP BY[\s\S]*WARELOCATION\.WL_CODE/);
  assert.match(routeSource, /GROUP BY[\s\S]*WARELOCATION\.WL_NAME/);
  assert.match(routeSource, /warehouseCode: lastRow\.WL_CODE/);
});
