import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const formSource = fs.readFileSync(
  "src/app/production-line/attendance/piece-rate-scan/PieceRateWorkForm.js",
  "utf8"
);
const workstationSource = fs.readFileSync(
  "src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.js",
  "utf8"
);
const serviceSource = fs.readFileSync(
  "src/features/attendance/services/pieceRateWorkService.js",
  "utf8"
);

test("pail count is submitted unchanged so the service converts it to kilograms only once", () => {
  assert.doesNotMatch(
    formSource,
    /resolvedInputValue\s*=\s*Number\(\(resolvedInputValue\s*\*\s*kgPerPail\)/
  );
});

test("pail entry accepts an editable actual total weight and stores it as normalized kilograms", () => {
  assert.match(formSource, /actualWeightKg:\s*actualPailWeightKg/);
  assert.match(workstationSource, /น้ำหนักจริงรวม \(กก\.\)/);
  assert.match(formSource, /weightKg:\s*slipPayload\.normalizedKgAmount/);
  assert.match(serviceSource, /parsePositiveNumber\(body\.actualWeightKg, "actualWeightKg"\)/);
  assert.match(serviceSource, /actualPailWeightKg\s*\?\?/);
});
