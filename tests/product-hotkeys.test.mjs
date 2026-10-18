import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductHotkey, productHotkeyStorageKey, validateProductHotkey, readProductHotkeys, saveProductHotkey, productHotkeyFromEvent } from "../src/lib/productHotkeys.js";

test("keys are normalized, validated and unique within a scope", () => {
  assert.equal(normalizeProductHotkey("j"), "J");
  for (const value of ["0", "11", "ก", "Enter", "!"]) assert.equal(normalizeProductHotkey(value), "");
  assert.equal(validateProductHotkey({ A: "1" }, "A", "1"), "");
  assert.match(validateProductHotkey({ A: "1" }, "B", "1"), /ถูกใช้แล้ว/);
  assert.equal(validateProductHotkey({ A: "1" }, "B", "J"), "");
});

test("station and department scopes are independent and missing identity fails closed", () => {
  assert.notEqual(productHotkeyStorageKey("S1", "D1"), productHotkeyStorageKey("S2", "D1"));
  assert.notEqual(productHotkeyStorageKey("S1", "D1"), productHotkeyStorageKey("S1", "D2"));
  assert.equal(productHotkeyStorageKey(null, "D1"), null);
  assert.equal(productHotkeyStorageKey("S1", null), null);
});

test("stored bindings are checked and never silently overwrite corrupt data", () => {
  assert.deepEqual(readProductHotkeys({ getItem: () => '{"A":"j"}' }, "scope"), { A: "J" });
  assert.deepEqual(readProductHotkeys({ getItem: () => null }, "scope"), {});
  for (const data of ["bad", "[]", '{"A":"1","B":"1"}', '{"A":"Enter"}']) {
    assert.throws(() => readProductHotkeys({ getItem: () => data }, "scope"));
  }
});

test("typing, composition, modifiers and repeat never select products", () => {
  assert.equal(productHotkeyFromEvent({ key: "1" }), "1");
  for (const prop of ["repeat", "isComposing", "ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(productHotkeyFromEvent({ key: "1", [prop]: true }), "");
  assert.equal(productHotkeyFromEvent({ key: "J", target: { closest: () => ({}) } }), "");
});

test("save rereads latest bindings, rejects collisions and preserves other scopes", () => {
  const rows = new Map();
  const storage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value) };
  saveProductHotkey(storage, "S1:D1", "P1", "1");
  saveProductHotkey(storage, "S1:D2", "P2", "1");
  assert.throws(() => saveProductHotkey(storage, "S1:D1", "P2", "1"), /ถูกใช้แล้ว/);
  saveProductHotkey(storage, "S1:D1", "P1", "j");
  assert.deepEqual(readProductHotkeys(storage, "S1:D1"), { P1: "J" });
  assert.deepEqual(readProductHotkeys(storage, "S1:D2"), { P2: "1" });
  assert.throws(() => saveProductHotkey(storage, null, "P1", "1"));
  assert.throws(() => saveProductHotkey({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, "scope", "P1", "1"), /quota/);
});
