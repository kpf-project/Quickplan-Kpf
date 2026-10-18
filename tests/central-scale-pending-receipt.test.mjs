import test from "node:test";
import assert from "node:assert/strict";
import { readPendingReceipt, persistPendingReceipt, clearConfirmedReceipt, withCentralReceiptLock, assertCentralReceiptMatches } from "../src/lib/scale/pending-receipt.js";

test("pending receipt survives reload and only matching confirmation releases it", () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const payload = { requestId: "request-1", pointId: "point-1", productCode: "PRODUCT" };
  persistPendingReceipt(storage, payload);
  assert.deepEqual(readPendingReceipt(storage), payload);
  assert.throws(() => persistPendingReceipt(storage, { ...payload, requestId: "request-2" }));
  assert.throws(() => clearConfirmedReceipt(storage, "request-2"));
  assert.deepEqual(readPendingReceipt(storage), payload);
  clearConfirmedReceipt(storage, "request-1");
  assert.equal(readPendingReceipt(storage), null);
});

test("receipt confirmation checks exact context and reconciles gross/tare/net before releasing pending", () => {
  const pending = { requestId: "request", pointId: "point", departmentId: "dept", productCode: "PRODUCT", tareWeightKg: "0.500" };
  const receipt = { request_id: "request", point_id: "point", department_id: "dept", product_code: "PRODUCT",
    barcode: "12102680010001", lot_no: "1210268001-1", gross_kg: "19.020", tare_kg: "0.500", net_kg: "18.520" };
  assert.doesNotThrow(() => assertCentralReceiptMatches(receipt, pending));
  for (const invalid of [{ department_id: "OTHER" }, { point_id: "OTHER" }, { net_kg: "18.521" }, { tare_kg: "0.501" },
    { gross_kg: "NaN" }, { net_kg: "Infinity" }, { lot_no: "" }, { barcode: "invalid" }]) {
    assert.throws(() => assertCentralReceiptMatches({ ...receipt, ...invalid }, pending));
  }
});

test("two tabs cannot submit concurrently and unsupported locking fails closed", async () => {
  let held = false;
  let release;
  let writes = 0;
  const locks = { async request(_name, _options, callback) {
    if (held) return callback(null);
    held = true;
    try { return await callback({}); } finally { held = false; }
  } };
  const first = withCentralReceiptLock(locks, async () => { writes++; await new Promise(resolve => { release = resolve; }); });
  await assert.rejects(withCentralReceiptLock(locks, () => { writes++; }));
  assert.equal(writes, 1);
  release();
  await first;
  await assert.rejects(withCentralReceiptLock(null, () => { writes++; }));
  assert.equal(writes, 1);
});
