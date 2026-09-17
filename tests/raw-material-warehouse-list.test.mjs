import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const gatewayPath = path.join(repoRoot, "kpf-api-gateway/server.js");

function readGatewaySource() {
  return fs.readFileSync(gatewayPath, "utf8");
}

test("raw material stock endpoints include warehouse 05", () => {
  const source = readGatewaySource();
  const warehouseClauses = source.match(/WARELOCATION\.WL_CODE IN \(([^)]+)\)/g) || [];

  assert.equal(warehouseClauses.length, 5, "raw material stock endpoints should keep one warehouse whitelist per stock query");
  warehouseClauses.forEach((clause) => {
    assert.match(clause, /'05'/, `${clause} should include warehouse 05`);
  });
});
