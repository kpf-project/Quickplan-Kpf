import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("waste form requires and submits one visible waste category", () => {
  const source = readFileSync("src/app/production-line/attendance/piece-rate-scan/PieceRateWasteForm.js", "utf8");

  assert.match(source, /เศษป้าย/);
  assert.match(source, /เศษหัก/);
  assert.match(source, /ไหม้/);
  assert.match(source, /if \(!wasteCategory\)/);
  assert.match(source, /กรุณาเลือกประเภทของเสียก่อนบันทึก/);
  assert.match(source, /wasteCategory,/);
  assert.match(source, /disabled=\{isSubmitting \|\| isScaleBusy \|\| !wasteCategory \|\| !desktopScale\?\.canSave\}/);
  assert.match(
    source,
    /if \(!desktopScale\?\.canSave \|\| Number\(exactWeightKg \|\| 0\) <= 0\)/,
    "waste save must use the same centralized scale readiness as weigh-in"
  );
  assert.match(source, /desktopScale\?\.portOpen !== false/);
});
