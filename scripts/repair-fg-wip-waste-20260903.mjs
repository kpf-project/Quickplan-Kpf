import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const target = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (target !== "https://supabase-production.kpfoods.co.th") {
  throw new Error("Wrong database target");
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const db = createClient(target, serviceRoleKey, {
  auth: { persistSession: false },
});

const productionDate = "2026-09-03";
const expectedRows = new Map([
  ["WST030926001", { productCode: "VL0-4005", before: 2.04, after: 2.44 }],
  ["WST030926002", { productCode: "BLI-3002", before: 2.04, after: 0.4 }],
  ["WST030926003", { productCode: "BLI-3002", before: 4.235, void: true }],
]);

async function read(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  const productCodes = ["BLI-3002", "VL0-4005"];
  const rows = await read(
    db
      .from("production_fg_wip_waste_logs")
      .select("*")
      .eq("production_date", productionDate)
      .in("product_code", productCodes)
      .is("voided_at", null)
      .order("created_at", { ascending: true }),
  );

  const summary = rows.map((row) => ({
    id: row.id,
    barcode: row.waste_barcode,
    productCode: row.product_code,
    productName: row.product_name_snapshot,
    wasteType: row.waste_type,
    netWeightKg: Number(row.net_weight_kg),
    createdAt: row.created_at,
  }));
  console.log(JSON.stringify({ target, productionDate, rows: summary }, null, 2));

  if (rows.length !== expectedRows.size) {
    throw new Error(`Expected exactly ${expectedRows.size} active rows, found ${rows.length}`);
  }

  const repairedAt = new Date().toISOString();
  const reason = "Approved correction of FG/WIP packing waste weights for 2026-09-03.";
  const operations = rows.map((row) => {
    const correction = expectedRows.get(row.waste_barcode);
    if (!correction) throw new Error(`Unexpected product: ${row.product_code}`);
    if (row.product_code !== correction.productCode) {
      throw new Error(`Unexpected product for ${row.waste_barcode}: ${row.product_code}`);
    }
    if (row.waste_type !== "filling_scrap") {
      throw new Error(`Unexpected waste type for ${row.product_code}: ${row.waste_type}`);
    }
    const currentWeight = Number(row.net_weight_kg);
    const alreadyCorrected = !correction.void && currentWeight === correction.after;
    if (currentWeight !== correction.before && !alreadyCorrected) {
      throw new Error(
        `Precondition failed for ${row.product_code}: expected ${correction.before}, found ${row.net_weight_kg}`,
      );
    }
    const correctionAudit = {
      reason,
      repairedAt,
      previousNetWeightKg: correction.before,
      correctedNetWeightKg: correction.void ? null : correction.after,
      voidedAsExtraReading: Boolean(correction.void),
    };
    return {
      before: row,
      after: correction.void ? {
        voided_at: repairedAt,
        void_reason: "ยกเลิกรายการชั่งส่วนเกินเพื่อแก้ยอดของเสียวันที่ 03/09/2569 ตามที่ผู้ใช้อนุมัติ",
        metadata: {
          ...(row.metadata || {}),
          weightCorrection: correctionAudit,
        },
      } : alreadyCorrected ? null : {
        net_weight_kg: correction.after,
        metadata: {
          ...(row.metadata || {}),
          weightCorrection: correctionAudit,
        },
      },
    };
  }).filter((operation) => operation.after);

  const backupDir = path.resolve(".codex-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `fg-wip-waste-20260903-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ target, productionDate, reason, operations }, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify({ backupPath, apply: process.argv.includes("--apply") }, null, 2));

  if (!process.argv.includes("--apply")) return;

  for (const operation of operations) {
    const changed = await read(db
      .from("production_fg_wip_waste_logs")
      .update(operation.after)
      .eq("id", operation.before.id)
      .eq("net_weight_kg", operation.before.net_weight_kg)
      .is("voided_at", null)
      .select("id"));
    if (changed.length !== 1) {
      throw new Error(`Concurrent change detected for ${operation.before.product_code}`);
    }
  }

  const verified = await read(
    db
      .from("production_fg_wip_waste_logs")
      .select("id,production_date,waste_barcode,product_code,product_name_snapshot,waste_type,net_weight_kg,voided_at,metadata")
      .eq("production_date", productionDate)
      .in("product_code", productCodes)
      .is("voided_at", null)
      .order("product_code", { ascending: true }),
  );

  const activeTotals = verified.reduce((totals, row) => {
    totals[row.product_code] = (totals[row.product_code] || 0) + Number(row.net_weight_kg || 0);
    return totals;
  }, {});
  if (activeTotals["BLI-3002"] !== 0.4 || activeTotals["VL0-4005"] !== 2.44) {
    throw new Error(`Verification failed: ${JSON.stringify(activeTotals)}`);
  }
  console.log(JSON.stringify({ verified, activeTotals }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
