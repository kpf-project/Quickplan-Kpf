import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routePath = "src/app/api/attendance/piece-rate/waste/route.js";
const servicePath = "src/features/attendance/services/pieceRateWasteService.js";
const clientPath = "src/features/attendance/services/pieceRateWasteClient.js";
const pieceRateServicePath = "src/features/attendance/services/pieceRateWorkService.js";

test("piece-rate waste API is permission protected and isolated from wage and stock waste writes", () => {
  assert.equal(existsSync(routePath), true, "piece-rate waste route must exist");
  assert.equal(existsSync(servicePath), true, "piece-rate waste service must exist");
  assert.equal(existsSync(clientPath), true, "piece-rate waste client must exist");

  const route = readFileSync(routePath, "utf8");
  const service = readFileSync(servicePath, "utf8");
  const client = readFileSync(clientPath, "utf8");
  const pieceRateService = readFileSync(pieceRateServicePath, "utf8");

  assert.match(route, /requirePermissionKeys/);
  assert.match(route, /createPieceRateWasteLog/);
  assert.match(route, /runtime = "nodejs"/);
  assert.match(service, /production_piece_rate_waste_logs/);
  assert.match(service, /resolvePieceRateProductByBarcode/);
  assert.match(service, /wasteWeightKg/);
  assert.match(service, /wasteCategory/);
  assert.match(service, /label_scrap/);
  assert.match(service, /broken_scrap/);
  assert.match(service, /burnt_scrap/);
  assert.match(service, /requestId/);
  assert.match(service, /23505/);
  assert.doesNotMatch(service, /production_piece_rate_logs/);
  assert.doesNotMatch(service, /production_stock_movements|create_production_stock_waste/);
  assert.match(client, /\/api\/attendance\/piece-rate\/waste/);
  assert.match(pieceRateService, /export async function resolvePieceRateProductByBarcode/);
});
