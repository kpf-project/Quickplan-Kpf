import assert from "node:assert/strict";
import test from "node:test";

import { buildAvailableLabelProductOptions } from "../src/features/attendance/utils/pieceRateAvailableLabelProducts.js";

test("available-label product filters come from WIP labels instead of the selected FG catalog", () => {
  const options = buildAvailableLabelProductOptions([
    { productCode: "WKB-0064", productName: "เนื้อขนมออพายป้ายแยมสับปะรด" },
    { productCode: "WKB-0064", productName: "เนื้อขนมออพายป้ายแยมสับปะรด" },
    { productCode: "WKB-0045", productName: "แผ่นแครกเกอร์สมุย" },
  ]);

  assert.deepEqual(options, [
    { code: "WKB-0045", name: "แผ่นแครกเกอร์สมุย" },
    { code: "WKB-0064", name: "เนื้อขนมออพายป้ายแยมสับปะรด" },
  ]);
});

test("available-label product filters ignore rows without a product code", () => {
  assert.deepEqual(buildAvailableLabelProductOptions([{ productName: "ไม่มีรหัส" }, null]), []);
});
