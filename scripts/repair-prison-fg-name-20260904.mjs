import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const target = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (target !== "https://supabase-production.kpfoods.co.th") throw new Error("Wrong database target");
const db = createClient(target, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const scope = {
  id: "f1b215f8-f7be-413e-85bb-22a0bc1e2edc",
  sourceDocumentNo: "PRW-260903-000001-01",
  fgProductCode: "BL0-3003",
};

async function read(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

const [movement, product] = await Promise.all([
  read(db.from("production_stock_movements").select("*").eq("id", scope.id).single()),
  read(db.from("products_cache").select("sku_code,sku_name").eq("sku_code", scope.fgProductCode).single()),
]);

if (movement.source_document_no !== scope.sourceDocumentNo
  || movement.source_document_type !== "piece_rate_prison_issue"
  || movement.metadata?.fgProductCode !== scope.fgProductCode
  || String(movement.metadata?.fgProductName || "").trim()) {
  throw new Error("Movement precondition failed");
}

const metadata = { ...movement.metadata, fgProductName: product.sku_name };
const backupDir = path.resolve(".codex-backups");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `prison-fg-name-${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify({ target, before: movement, after: { metadata } }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ backupPath, apply: process.argv.includes("--apply"), product }, null, 2));

if (process.argv.includes("--apply")) {
  const changed = await read(db.from("production_stock_movements")
    .update({ metadata })
    .eq("id", scope.id)
    .eq("source_document_no", scope.sourceDocumentNo)
    .select("id,source_document_no,metadata"));
  if (changed.length !== 1 || changed[0].metadata?.fgProductName !== product.sku_name) {
    throw new Error("Verification failed");
  }
  console.log(JSON.stringify({ verified: changed[0] }, null, 2));
}
