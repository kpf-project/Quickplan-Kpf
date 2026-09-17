import assert from "node:assert/strict";
import test from "node:test";

import { fillMissingFgProductNames } from "../src/features/attendance/utils/fillMissingFgProductNames.js";

test("เติมชื่อ FG ของรายการเบิกเรือนจำเดิมจากรหัสสินค้า", () => {
  const rows = [{
    metadata: { fgProductCode: "BL0-3003" },
  }];

  assert.deepEqual(
    fillMissingFgProductNames(rows, new Map([["BL0-3003", "พาเพลิน ขาไก่ รสเผ็ด 320 ก."]])),
    [{ metadata: { fgProductCode: "BL0-3003", fgProductName: "พาเพลิน ขาไก่ รสเผ็ด 320 ก." } }]
  );
});

test("ไม่เขียนทับชื่อ FG snapshot ที่มีอยู่แล้ว", () => {
  const rows = [{
    metadata: { fgProductCode: "BL0-3003", fgProductName: "ชื่อ ณ วันที่เบิก" },
  }];

  assert.equal(
    fillMissingFgProductNames(rows, new Map([["BL0-3003", "ชื่อปัจจุบัน"]]))[0].metadata.fgProductName,
    "ชื่อ ณ วันที่เบิก"
  );
});
