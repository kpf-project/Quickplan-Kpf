import test from "node:test";
import assert from "node:assert/strict";

const units = await import("../src/lib/packingUnits.js").catch(() => ({}));
const rows = [
  { SKU_CODE: "FG1", GOODS_CODE: "FG1", UTQ_NAME: "ปี๊บ", UTQ_QTY: 1, UTQ_NAME_2: "ปี๊บ", UTQ_QTY_2: 1 },
  { SKU_CODE: "FG1", GOODS_CODE: "CASE1", UTQ_NAME: "ปี๊บ", UTQ_QTY: 1, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 12 },
];

test("pail product exposes only real units and derives 5 cases as 60 pails", () => {
  assert.equal(typeof units.buildPackingUnits, "function");
  const profile = units.buildPackingUnits("FG1", rows);
  assert.deepEqual(profile.map(({ code, label, factor }) => ({ code, label, factor })), [
    { code: "pail", label: "ปี๊บ", factor: 1 }, { code: "carton", label: "ลัง", factor: 12 },
  ]);
  assert.equal(units.quantityInBase(profile, { carton: 5 }), 60);
  assert.equal(units.quantityInBase(profile, { carton: 1, pail: 3 }), 15);
});

test("sachet-pack-case hierarchy uses ERP ratios, never product name or another SKU", () => {
  assert.equal(typeof units.buildPackingUnits, "function");
  const profile = units.buildPackingUnits("TEA", [
    { SKU_CODE: "TEA", UTQ_NAME: "ซอง", UTQ_QTY: 1, UTQ_NAME_2: "แพ็ค", UTQ_QTY_2: 10 },
    { SKU_CODE: "TEA", UTQ_NAME: "ซอง", UTQ_QTY: 1, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 200 },
    { SKU_CODE: "OTHER", UTQ_NAME: "ปี๊บ", UTQ_QTY: 1, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 12 },
  ]);
  assert.deepEqual(profile.map(u => [u.code, u.factor]), [["sachet", 1], ["pack", 10], ["carton", 200]]);
  assert.equal(units.quantityInBase(profile, { pack: 2, sachet: 3 }), 23);
  assert.throws(() => units.quantityInBase(profile, { pail: 1 }), /หน่วย/);
  assert.throws(() => units.quantityInBase(profile, { pack: 0.5 }), /จำนวนเต็ม/);
});

test("missing or contradictory conversions fail closed; kg supports three decimals", () => {
  assert.equal(typeof units.buildPackingUnits, "function");
  assert.throws(() => units.buildPackingUnits("FG1", []), /หน่วย/);
  assert.throws(() => units.buildPackingUnits("FG1", [...rows, { ...rows[1], UTQ_QTY_2: 24 }]), /ขัดแย้ง/);
  assert.throws(() => units.buildPackingUnits("FG1", [{ ...rows[1], UTQ_QTY_2: null }]), /อัตรา/);
  const kg = units.buildPackingUnits("KG1", [{ SKU_CODE: "KG1", UTQ_NAME: "กก.", UTQ_QTY: 1, UTQ_NAME_2: "กก.", UTQ_QTY_2: 1 }]);
  assert.equal(units.quantityInBase(kg, { kg: "1.125" }), 1.125);
  assert.throws(() => units.quantityInBase(kg, { kg: "1.1234" }), /ทศนิยม/);
  assert.throws(() => units.quantityInBase(kg, { kg: -1 }), /จำนวน/);
});

test("ERP decorated unit names identify units but never invent quantity conversions from their text", () => {
  const profile = units.buildPackingUnits("P", [{ SKU_CODE: "P", UTQ_NAME: "ปี๊บ/5กก.", UTQ_QTY: 1, UTQ_NAME_1: "กล่อง*12", UTQ_QTY_1: 12, UTQ_NAME_2: "ปี๊บ", UTQ_QTY_2: 1 }]);
  assert.deepEqual(profile.map(u => [u.code, u.factor]), [["pail", 1], ["carton", 12]]);
  const packs = units.buildPackingUnits("P", [{ SKU_CODE: "P", UTQ_NAME: "แพ็คx12ซอง", UTQ_QTY: 1, UTQ_NAME_2: "กล่อง*24", UTQ_QTY_2: 24 }]);
  assert.deepEqual(packs.map(u => [u.code, u.factor]), [["pack", 1], ["carton", 24]]);
  assert.throws(() => units.buildPackingUnits("P", [{ SKU_CODE: "P", UTQ_NAME: "ถุง", UTQ_QTY: 1 }]), /หน่วย/);
});
