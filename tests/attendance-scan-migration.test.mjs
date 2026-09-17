import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("attendance QR migration adds an atomic daily guard without rewriting history", async () => {
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const names = await readdir(migrationDirectory);
  const migrationName = names.find((name) =>
    name.endsWith("_add_attendance_qr_daily_unique_guard.sql")
  );

  assert.ok(migrationName, "attendance QR guard migration must exist");
  const sql = await readFile(new URL(migrationName, migrationDirectory), "utf8");

  assert.match(sql, /add column if not exists employee_code_key text/i);
  assert.match(sql, /add column if not exists scan_business_date date/i);
  assert.match(sql, /create unique index if not exists attendance_scan_events_daily_type_unique_idx/i);
  assert.match(sql, /where status = 'accepted'/i);
  assert.doesNotMatch(sql, /update\s+(public\.)?attendance_scan_events/i);
});
