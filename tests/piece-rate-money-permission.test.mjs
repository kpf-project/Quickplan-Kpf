import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(
  "src/features/attendance/services/pieceRateWorkService.js",
  "utf8"
);

test("piece-rate report money requires the dedicated permission", () => {
  const capabilitiesSource = serviceSource.match(
    /function buildReportCapabilities[\s\S]*?\n}\n\nfunction normalizeText/
  )?.[0] || "";

  assert.match(
    capabilitiesSource,
    /permissionSet\.has\(REPORT_MONEY_PERMISSION_KEY\)/
  );
  assert.doesNotMatch(
    capabilitiesSource,
    /const canViewMoney =[\s\S]*?\|\| canEdit/,
    "report managers must not inherit access to confidential wage amounts"
  );
});
