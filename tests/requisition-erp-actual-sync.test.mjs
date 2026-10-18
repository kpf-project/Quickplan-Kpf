import assert from "node:assert/strict";
import test from "node:test";

import { matchErpActualDocuments } from "../src/lib/requisitionErpActual.js";

const slot = {
  key: "room|2026-09-23",
  plannedDocumentNo: "XA6909/0001",
  workDate: "2026-09-23",
  departmentCode: "KP13",
  roomLabel: "[B01] ห้องตีแป้งบิสกิต",
  expectedParentSkus: ["M01-0004"],
};

test("matches exact document number before routing fallback", () => {
  const rows = [{ DI_REF: "XA6909/0001", TRD_SH_CODE: "M01-00040" }];
  const [result] = matchErpActualDocuments([slot], rows);
  assert.equal(result.status, "exact");
  assert.equal(result.rows[0].TRD_SH_CODE, "M01-00040");
});

test("combines multiple explicitly mapped ERP documents without routing guesses", () => {
  const rows = [
    { DI_REF: "X6909/0586", TRD_SH_CODE: "M04-0073-10", TRD_QTY: 1, TRD_LOT_NO: "260810" },
    { DI_REF: "X6909/0586", TRD_SH_CODE: "M04-0088", TRD_QTY: 1380, TRD_LOT_NO: "260924" },
    { DI_REF: "X6909/0587", TRD_SH_CODE: "P18-0015", TRD_QTY: 2300, TRD_LOT_NO: "260924" },
  ];
  const [result] = matchErpActualDocuments([{
    ...slot,
    plannedDocumentNo: "X6909/0586 / X6909/0587",
    plannedDocumentNos: ["X6909/0586", "X6909/0587"],
  }], rows);
  assert.equal(result.status, "exact");
  assert.equal(result.actualDocumentNo, "X6909/0586 / X6909/0587");
  assert.deepEqual(result.rows.map((row) => row.TRD_SH_CODE), ["M04-0073-10", "M04-0088", "P18-0015"]);
});

test("matches changed ERP document number only when routing identity is unique", () => {
  const rows = [{
    DI_REF: "XA6909/0099",
    DEPT_CODE: "KP13",
    DI_REMARK: "กะ 1 - แผนกบิสกิต ห้องตีแป้งบิสกิต - แผนผลิต,23/09/2569",
    PARENT_SKU_CODE: "M01-0004",
    TRD_SH_CODE: "M01-00040",
    TRD_UTQNAME: "ถุงx50กก.",
    TRD_QTY: 2,
    TRD_LOT_NO: "010969",
  }];
  const [result] = matchErpActualDocuments([slot], rows);
  assert.equal(result.status, "routing");
  assert.equal(result.actualDocumentNo, "XA6909/0099");
  assert.equal(result.rows[0].TRD_UTQNAME, "ถุงx50กก.");
});

test("marks ambiguous routing matches for review", () => {
  const base = {
    DEPT_CODE: "KP13",
    DI_REMARK: "กะ 1 - แผนกบิสกิต ห้องตีแป้งบิสกิต - แผนผลิต,23/09/2569",
    PARENT_SKU_CODE: "M01-0004",
  };
  const [result] = matchErpActualDocuments([slot], [
    { ...base, DI_REF: "XA6909/0098" },
    { ...base, DI_REF: "XA6909/0099" },
  ]);
  assert.equal(result.status, "review");
  assert.deepEqual(result.candidates, ["XA6909/0098", "XA6909/0099"]);
});

test("combines two manual ERP documents for one room and production date", () => {
  const manualSlot = {
    ...slot,
    plannedDocumentNo: "",
    workDate: "2026-09-25",
    departmentCode: "",
    departmentName: "แผนกบิสกิต",
    expectedParentSkus: ["WK-2202", "M01-0004"],
  };
  const common = {
    DEPT_THAIDESC: "แผนกบิสกิต",
    DI_REMARK: "ตีแป้งบิสกิต แผนการผลิต, 25/09/2569",
  };
  const [result] = matchErpActualDocuments([manualSlot], [
    { ...common, DI_REF: "X6909/0537", PARENT_SKU_CODE: "WK-2202", TRD_SH_CODE: "WK-22020" },
    { ...common, DI_REF: "X6909/0538", PARENT_SKU_CODE: "M01-0004", TRD_SH_CODE: "M01-00040" },
  ]);
  assert.equal(result.status, "routing");
  assert.equal(result.actualDocumentNo, "X6909/0537 / X6909/0538");
  assert.deepEqual(result.rows.map((row) => row.TRD_SH_CODE), ["WK-22020", "M01-00040"]);
});
