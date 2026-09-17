import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const round = (value) => Number(Number(value).toFixed(4));
export function priceHistoricalRow(row, mappings, profiles, weights) {
  const goods = row.product_goods_code_snapshot || row.product_code_snapshot;
  const sku = row.product_sku_code_snapshot || row.product_code_snapshot;
  const mapping = mappings.find((m) => m.product_code === goods)
    || mappings.find((m) => m.product_code === sku);
  if (!mapping) throw new Error(`Missing mapping: ${goods}`);
  const profile = profiles.find((p) => p.id === mapping.profile_id && p.is_active);
  if (!profile) throw new Error(`Missing active profile: ${goods}`);
  if (!["kg", "pail"].includes(row.input_mode_snapshot)) throw new Error(`Unknown historical input mode: ${goods}`);
  const weight = weights.find((w) => w.id === mapping.weight_option_id && w.is_active);
  const kgPerPail = Number(weight?.weight_kg || profile.kg_per_pail || 0);
  const kg = row.input_mode_snapshot === "pail" ? round(Number(row.input_value) * kgPerPail) : round(row.input_value);
  // A wage repair must not silently change physical stock quantities.
  if (Math.abs(kg - Number(row.normalized_kg_amount_snapshot)) > 0.0001) throw new Error(`Weight differs: ${goods}`);
  const rate = Number(profile.pay_rate_per_kg);
  if (profile.wage_basis !== "kg" || !Number.isFinite(rate) || rate < 0) throw new Error(`Invalid kg wage basis: ${goods}`);
  return {
    piece_rate_profile_id: profile.id,
    piece_rate_profile_name_snapshot: profile.name,
    wage_basis_snapshot: "kg",
    pay_rate_per_kg_snapshot: rate,
    pay_rate_per_unit_snapshot: Number(profile.pay_rate_per_unit || 0),
    wage_amount_snapshot: round(kg * rate),
  };
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const target = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (target !== "https://supabase-production.kpfoods.co.th") throw new Error("Unexpected database target");
  const db = createClient(target, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  async function all(table) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await db.from(table).select("*").order(table.endsWith("mappings") ? "product_code" : "id").range(start, start + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  }
  const planArg = process.argv.find((arg) => arg.startsWith("--apply-plan="));
  if (planArg) {
    const planPath = path.resolve(planArg.slice(13));
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    if (plan.target !== target || plan.blocked.length) throw new Error("Plan has unresolved rows or wrong target");
    for (const [table, key] of [["production_piece_rate_product_mappings", "mappings"], ["production_piece_rate_profiles", "profiles"], ["production_piece_rate_profile_weights", "weights"]]) {
      if (JSON.stringify(await all(table)) !== JSON.stringify(plan[key])) throw new Error("Settings changed since plan; regenerate before applying");
    }
    let changed = 0;
    for (const item of plan.changes) {
      let query = db.from("production_piece_rate_logs").update(item.after).eq("id", item.before.id);
      for (const key of [...Object.keys(item.after), "input_value", "normalized_kg_amount_snapshot", "doc_status"]) {
        query = item.before[key] == null ? query.is(key, null) : query.eq(key, item.before[key]);
      }
      const { data, error } = await query.select("id");
      if (error || data.length !== 1) throw new Error(`Stopped after ${changed}: ${item.before.id}: ${error?.message || "Concurrent change"}`);
      changed++;
      if (changed % 100 === 0) console.log(`Updated ${changed}/${plan.changes.length}`);
    }
    const actual = new Map((await all("production_piece_rate_logs")).map((row) => [row.id, row]));
    for (const item of plan.changes) {
      for (const [key, value] of Object.entries(item.after)) {
        if (actual.get(item.before.id)?.[key] !== value) throw new Error(`Verification failed: ${item.before.id}/${key}`);
      }
    }
    console.log(JSON.stringify({ updated: changed, verified: changed, backup: planPath }));
    return;
  }
  const [rows, mappings, profiles, weights] = await Promise.all([
    all("production_piece_rate_logs"), all("production_piece_rate_product_mappings"),
    all("production_piece_rate_profiles"), all("production_piece_rate_profile_weights"),
  ]);
  const plan = { target, capturedAt: new Date().toISOString(), mappings, profiles, weights, changes: [], blocked: [] };
  for (const row of rows) {
    try {
      const after = priceHistoricalRow(row, mappings, profiles, weights);
      if (Object.entries(after).some(([key, value]) => row[key] !== value)) plan.changes.push({ before: row, after });
    } catch (error) { plan.blocked.push({ id: row.id, reason: error.message, status: row.doc_status }); }
  }
  const dir = path.resolve(".codex-backups");
  fs.mkdirSync(dir, { recursive: true });
  const output = path.join(dir, `piece-rate-reprice-${Date.now()}.json`);
  fs.writeFileSync(output, JSON.stringify(plan), { flag: "wx" });
  const reasons = {};
  for (const item of plan.blocked) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
  console.log(JSON.stringify({ scanned: rows.length, changes: plan.changes.length, blocked: plan.blocked.length, reasons, plan: output, example: plan.changes.filter((i) => i.before.product_code_snapshot === "BL0-1104").slice(0, 1).map((i) => ({ kg: i.before.normalized_kg_amount_snapshot, before: i.before.wage_amount_snapshot, after: i.after.wage_amount_snapshot })) }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
