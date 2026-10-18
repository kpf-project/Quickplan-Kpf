import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("numbering audit is read-only, bounded, rollback-only and includes voided labels", () => {
  const source = readFileSync("scripts/audit-central-scale-numbering.sql", "utf8")
    .replace(/--[^\n]*/g, "");
  assert.match(source, /begin transaction isolation level repeatable read read only/i);
  assert.match(source, /statement_timeout = '30s'/);
  assert.match(source, /rollback;\s*$/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|create|alter|drop|truncate|commit|nextval|setval)\b/i);
  assert.doesNotMatch(source, /where[^;]*status\s*=/i);
  for (const section of ["duplicate_barcodes", "duplicate_request_ids", "observed_product_digit_collisions", "historical_daily_maxima"]) {
    assert.ok(source.includes(section));
  }
});
