import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const formSource = fs.readFileSync(
  "src/app/production-line/attendance/piece-rate-scan/PieceRateWorkForm.js",
  "utf8"
);

test("pail count is submitted unchanged so the service converts it to kilograms only once", () => {
  assert.doesNotMatch(
    formSource,
    /resolvedInputValue\s*=\s*Number\(\(resolvedInputValue\s*\*\s*kgPerPail\)/
  );
});
