import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("piece-rate waste migration creates an isolated, indexed and protected log", async () => {
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const names = await readdir(migrationDirectory);
  const migrationName = names.find((name) => name.endsWith("_add_piece_rate_waste_logs.sql"));

  assert.ok(migrationName, "piece-rate waste migration must exist");
  const sql = await readFile(new URL(migrationName, migrationDirectory), "utf8");

  assert.match(sql, /create table if not exists public\.production_piece_rate_waste_logs/i);
  assert.match(sql, /request_id text not null unique/i);
  assert.match(sql, /waste_weight_kg numeric\(12,\s*3\) not null/i);
  assert.match(sql, /check \(waste_weight_kg > 0\)/i);
  assert.match(sql, /actual_weighed_at timestamptz not null/i);
  assert.match(sql, /metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.production_piece_rate_waste_logs from anon, authenticated/i);
  assert.match(sql, /grant select, insert on public\.production_piece_rate_waste_logs to service_role/i);
  assert.match(sql, /production_piece_rate_waste_logs_active_date_idx/i);
  assert.match(sql, /production_piece_rate_waste_logs_active_product_date_idx/i);
  assert.match(sql, /where status = 'confirmed'/i);
});

test("piece-rate waste category migration persists only supported categories", async () => {
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const names = await readdir(migrationDirectory);
  const migrationName = names.find((name) => name.endsWith("_add_piece_rate_waste_category.sql"));

  assert.ok(migrationName, "piece-rate waste category migration must exist");
  const sql = await readFile(new URL(migrationName, migrationDirectory), "utf8");
  assert.match(sql, /add column if not exists waste_category text/i);
  assert.match(sql, /label_scrap.*broken_scrap.*burnt_scrap/i);
  assert.match(sql, /production_piece_rate_waste_logs_active_category_date_idx/i);
});
