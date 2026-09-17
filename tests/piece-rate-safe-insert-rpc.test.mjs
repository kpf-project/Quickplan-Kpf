import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260716001000_fix_safe_piece_rate_insert_rpc_defaults.sql";
const servicePath = "src/features/attendance/services/pieceRateWorkService.js";

test("safe piece-rate insert RPC lets table defaults fill missing generated values", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /v_payload\s*:=\s*coalesce\(p_payload,\s*'\{\}'::jsonb\)\s*-\s*'id'/);
  assert.match(sql, /jsonb_object_keys\(v_payload\)/);
  assert.doesNotMatch(sql, /SELECT\s+string_agg\(quote_ident\(column_name\),\s*', '\)/i);
  assert.match(sql, /IF\s+v_cols\s+IS\s+NULL/i);
});

test("piece-rate service uses the same duplicate window as the database RPC default", () => {
  const source = readFileSync(servicePath, "utf8");

  assert.match(source, /p_duplicate_window_seconds:\s*300/);
});

test("piece-rate logs persist LOT as a real column", () => {
  const migration = readFileSync("supabase/migrations/20260804050755_add_piece_rate_lot_no.sql", "utf8");
  const source = readFileSync(servicePath, "utf8");

  assert.match(migration, /alter table public\.production_piece_rate_logs/i);
  assert.match(migration, /add column if not exists lot_no text/i);
  assert.match(migration, /production_piece_rate_logs_lot_no_logged_at_idx/i);
  assert.match(source, /import \{ buildPieceRateLotNo \}/);
  assert.match(source, /"lot_no"/);
  assert.match(source, /lot_no:\s*lotNo/);
  assert.match(source, /lotNo:\s*row\.lot_no \|\| null/);
});
