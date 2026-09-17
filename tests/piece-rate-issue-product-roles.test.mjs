import assert from "node:assert/strict";
import test from "node:test";

import { validatePieceRateIssueProductRoles } from "../src/features/attendance/utils/pieceRateIssueProductRoles.js";

test("FG selection and WIP label may have different product codes", () => {
  assert.equal(validatePieceRateIssueProductRoles({
    fgProduct: { code: "B03-0012", name: "Allpine แยมสับปะรด 192ก. (24 ห่อ)" },
    wipLog: { productCode: "WKB-0064", productName: "เนื้อขนมออพายป้ายแยมสับปะรด" },
  }), "");
});

test("issue flow still requires both an FG selection and a WIP label", () => {
  assert.equal(validatePieceRateIssueProductRoles({ fgProduct: null, wipLog: { productCode: "WKB-0064" } }), "กรุณาระบุสินค้า FG ก่อนสแกนป้าย WIP");
  assert.equal(validatePieceRateIssueProductRoles({ fgProduct: { code: "B03-0012" }, wipLog: null }), "ไม่พบข้อมูลสินค้า WIP ในป้าย");
});
