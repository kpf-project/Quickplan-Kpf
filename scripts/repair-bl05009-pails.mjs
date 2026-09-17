import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const target = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (target !== "https://supabase-production.kpfoods.co.th") throw new Error("Wrong database target");
const db = createClient(target, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const scope = { "20260828058": 315, "20260828059": 300, "20260828060": 285 };
const docs = Object.keys(scope);
const reason = "User confirmed kilograms were entered as pails; divide by 5 kg/pail. Approved correction of three documents on 2026-09-03.";
async function read(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
async function main() {
  const logs = await read(db.from("production_piece_rate_logs").select("*").in("doc_no", docs));
  const movements = await read(db.from("production_stock_movements").select("*").eq("product_code", "BL0-5009").eq("lot_no", "2808265009-1"));
  for (const table of ["production_piece_rate_stock_issues", "production_piece_rate_stock_returns"]) {
    if ((await read(db.from(table).select("id").in("piece_rate_doc_no", docs))).length) throw new Error(`Dependent transactions in ${table}`);
  }
  if (logs.length !== 3 || movements.length !== 3) throw new Error("Unexpected row count");
  const operations = [];
  const repairedAt = new Date().toISOString();
  for (const row of logs) {
    const kg = scope[row.doc_no];
    const qty = kg / 5;
    const movement = movements.find((m) => m.id === row.stock_movement_id && m.source_document_no === row.doc_no);
    if (row.product_code_snapshot !== "BL0-5009" || row.doc_status !== "active" || row.input_mode_snapshot !== "pail"
      || row.input_value !== kg || row.weight_kg_snapshot !== 5 || row.normalized_kg_amount_snapshot !== kg * 5
      || row.pay_rate_per_kg_snapshot !== 2.5 || row.wage_basis_snapshot !== "kg"
      || !movement || movement.source_document_type !== "piece_rate_weigh" || movement.quantity_in !== 1
      || movement.weight_in_kg !== kg * 5 || movement.quantity_out !== 0 || movement.weight_out_kg !== 0) throw new Error(`Precondition failed: ${row.doc_no}`);
    operations.push({ table: "production_piece_rate_logs", before: row, after: {
      input_value: qty,
      normalized_kg_amount_snapshot: kg,
      wage_amount_snapshot: kg * 2.5,
      metadata: { ...row.metadata, normalizedKgAmount: kg, unitCorrection: { reason, repairedAt, previousInputValue: row.input_value, previousKg: row.normalized_kg_amount_snapshot, previousWage: row.wage_amount_snapshot } },
    } });
    operations.push({ table: "production_stock_movements", before: movement, after: {
      quantity_in: qty, weight_in_kg: kg,
      metadata: { ...movement.metadata, unitCorrection: { reason, repairedAt, previousQuantity: movement.quantity_in, previousWeightKg: movement.weight_in_kg } },
    } });
  }
  const dir = path.resolve(".codex-backups");
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `bl05009-pails-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify({ target, reason, operations }), { flag: "wx" });
  console.log(JSON.stringify({ backup, apply: process.argv.includes("--apply"), corrections: logs.map((r) => ({ doc: r.doc_no, pails: scope[r.doc_no] / 5, kg: scope[r.doc_no], wage: scope[r.doc_no] * 2.5 })) }));
  if (!process.argv.includes("--apply")) return;
  const completed = [];
  try {
    for (const op of operations) {
      let query = db.from(op.table).update(op.after).eq("id", op.before.id);
      for (const key of Object.keys(op.after)) query = query.eq(key, key === "metadata" ? JSON.stringify(op.before[key]) : op.before[key]);
      const changed = await read(query.select("id"));
      if (changed.length !== 1) throw new Error(`Concurrent change: ${op.table}/${op.before.id}`);
      completed.push(op);
    }
    for (const op of operations) {
      const [actual] = await read(db.from(op.table).select("*").eq("id", op.before.id));
      for (const [key, value] of Object.entries({ ...op.before, ...op.after })) {
        if (key === "updated_at" || key === "metadata") continue;
        if (JSON.stringify(actual[key]) !== JSON.stringify(value)) throw new Error(`Verification failed: ${op.before.id}/${key}`);
      }
    }
    console.log("Verified 3 documents + 3 stock movements. Total: 180 pails, 900 kg, 2250 THB.");
  } catch (error) {
    for (const op of completed.reverse()) {
      const restore = Object.fromEntries(Object.keys(op.after).map((key) => [key, op.before[key]]));
      let query = db.from(op.table).update(restore).eq("id", op.before.id);
      for (const key of Object.keys(op.after)) query = query.eq(key, key === "metadata" ? JSON.stringify(op.after[key]) : op.after[key]);
      const restored = await read(query.select("id"));
      if (restored.length !== 1) throw new Error(`Rollback conflict; use backup ${backup}`);
    }
    throw error;
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
