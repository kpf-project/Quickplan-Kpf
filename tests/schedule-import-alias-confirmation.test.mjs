import test from "node:test";
import assert from "node:assert/strict";
import { confirmedImportAliases, importAliasConfirmationKey } from "../src/lib/scheduleImportAliasConfirmation.js";

test("legacy automatic aliases are ignored until the exact SKU/formula pair is explicitly confirmed", async () => {
  const old = { section_def_id: "section", product_column_key: "sku", source_signature: "abc", sku_code: "OLD", formula_code: "DEFAULT" };
  const verified = { ...old, sku_code: "VERIFIED" };
  const db = { from(table) {
    assert.equal(table, "system_settings");
    return { select() { return this; }, in(_key, keys) {
      const key = importAliasConfirmationKey("BISCUIT", verified);
      return { data: keys.includes(key) ? [{ setting_key: key }] : [], error: null };
    } };
  } };
  assert.deepEqual(await confirmedImportAliases(db, "BISCUIT", [old, verified]), [verified]);
  assert.deepEqual(await confirmedImportAliases(db, "OTHER", [verified]), []);
  assert.notEqual(importAliasConfirmationKey("BISCUIT", verified), importAliasConfirmationKey("BISCUIT", { ...verified, formula_code: "F2" }));
});
