import assert from "node:assert/strict";
import test from "node:test";

async function importOptional(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  }
}

test("bulk edit changes calculation basis value without changing material quantity", async () => {
  const { applyBomBulkEdit } = await importOptional(
    "../src/features/production-line/utils/bomBulkActions.js"
  );
  assert.equal(typeof applyBomBulkEdit, "function", "bulk edit helper must exist");

  const rows = [
    { id: "a", qty: 2, calculationBasis: "JOB_QTY", headcountBase: 4 },
    { id: "b", qty: 3, calculationBasis: "JOB_QTY", headcountBase: 5 },
    { id: "c", qty: 7, calculationBasis: "MACHINE_COUNT", machineBase: 2 },
  ];
  const result = applyBomBulkEdit(rows, new Set(["a", "b"]), {
    calculationBasis: "DOUGH_SET_COUNT",
    baseValue: 14,
  });

  assert.deepEqual(result, [
    { id: "a", qty: 2, calculationBasis: "DOUGH_SET_COUNT", headcountBase: 4, doughSetBase: 14 },
    { id: "b", qty: 3, calculationBasis: "DOUGH_SET_COUNT", headcountBase: 5, doughSetBase: 14 },
    { id: "c", qty: 7, calculationBasis: "MACHINE_COUNT", machineBase: 2 },
  ]);
});

test("bulk delete removes only selected BOM rows", async () => {
  const { removeSelectedBomRows } = await importOptional(
    "../src/features/production-line/utils/bomBulkActions.js"
  );
  assert.equal(typeof removeSelectedBomRows, "function", "bulk delete helper must exist");

  const result = removeSelectedBomRows(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    new Set(["a", "c"])
  );

  assert.deepEqual(result, [{ id: "b" }]);
});

test("formula rename trims the new name without changing its code", async () => {
  const { prepareBomFormulaMutation } = await importOptional(
    "../src/lib/bomFormulaManagement.js"
  );
  assert.equal(typeof prepareBomFormulaMutation, "function", "formula mutation helper must exist");

  assert.deepEqual(
    prepareBomFormulaMutation({
      action: "rename",
      formulaCode: "f2",
      formulaName: "  สูตรวัตถุดิบทดแทน  ",
    }),
    {
      ok: true,
      action: "rename",
      formulaCode: "F2",
      formulaName: "สูตรวัตถุดิบทดแทน",
    }
  );
});

test("default formula cannot be deactivated", async () => {
  const { prepareBomFormulaMutation } = await importOptional(
    "../src/lib/bomFormulaManagement.js"
  );
  assert.equal(typeof prepareBomFormulaMutation, "function", "formula mutation helper must exist");

  assert.deepEqual(
    prepareBomFormulaMutation({ action: "deactivate", formulaCode: "DEFAULT" }),
    {
      ok: false,
      status: 400,
      error: "ไม่สามารถปิดใช้งานสูตรหลัก DEFAULT ได้",
    }
  );
});
