import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWipOpening, pendingWipOpeningKey, readPendingWipOpening } from "../src/lib/wip-opening-input.js";

const input = () => ({ requestId: "11111111-1111-4111-8111-111111111111", departmentId: "22222222-2222-4222-8222-222222222222", openingDate: "2026-10-13", items: [{ productCode: "wkb-0064", lotNo: "131026", quantities: { sachet: "7", pack: "10", kg: "5.200" }, notes: "ตรวจนับ" }] });
test("opening preserves independent quantities, never converts or sums unlike units", () => {
  const parsed = normalizeWipOpening(input());
  assert.deepEqual(Object.fromEntries(parsed.entries.map(e => [e.unit,e.quantity])), { kg: 5.2, pack: 10, sachet: 7 });
  assert.equal(parsed.entries[0].productCode, "WKB-0064");
  const reordered = input();
  reordered.items[0].quantities = { kg: 5.2, pack: 10, sachet: 7 };
  assert.deepEqual(normalizeWipOpening(reordered), parsed);
});

test("pending requests are isolated by actor and request, including simultaneous tabs", () => {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) };
  const one = input(), two = { ...input(), requestId: "33333333-3333-4333-8333-333333333333" };
  values.set(pendingWipOpeningKey("actor-a", one.requestId), JSON.stringify(one));
  values.set(pendingWipOpeningKey("actor-a", two.requestId), JSON.stringify(two));
  assert.equal(readPendingWipOpening(storage, "actor-b"), null);
  assert.deepEqual(readPendingWipOpening(storage, "actor-a"), one);
  values.delete(pendingWipOpeningKey("actor-a", one.requestId));
  assert.deepEqual(readPendingWipOpening(storage, "actor-a"), two);
  values.set(pendingWipOpeningKey("actor-a", two.requestId), "invalid");
  assert.throws(() => readPendingWipOpening(storage, "actor-a"));
});
test("rejects invalid dates, precision, negatives, duplicate keys and unsupported units", () => {
  for (const date of ["2026-02-30", "2026-13-01", "not-date", "2026-10-13T00:00:00Z"]) assert.throws(() => normalizeWipOpening({ ...input(), openingDate: date }));
  for (const quantities of [{ pack: "1.5" }, { kg: "1.0001" }, { kg: "-1" }, { kg: "1e3" }, { kg: "5abc" }, { box: 1 }, { pack: 0 }, { pail: true }, { sachet: "1000000000" }]) {
    const payload = input(); payload.items[0].quantities = quantities;
    assert.throws(() => normalizeWipOpening(payload));
  }
  const duplicate = input(); duplicate.items.push({ ...duplicate.items[0] });
  assert.throws(() => normalizeWipOpening(duplicate), /ซ้ำ/);
  assert.throws(() => normalizeWipOpening({ ...input(), items: Array(51).fill(input().items[0]) }));
});
