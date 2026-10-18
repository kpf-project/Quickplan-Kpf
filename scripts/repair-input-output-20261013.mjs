import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in environment");
}

const sb = createClient(supabaseUrl, supabaseKey);
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`=== Repair Input/Output Data for 2026-10-13 (${apply ? "APPLY" : "PREVIEW DRY-RUN"}) ===\n`);

  // 1. Fetch current jam entries for 2026-10-13
  const { data: currentJams, error: jamErr } = await sb
    .from("production_jam_usage_entries")
    .select("*")
    .eq("usage_date", "2026-10-13");
  if (jamErr) throw jamErr;

  console.log("Current Jam Entries for 2026-10-13:");
  console.table(currentJams.map((j) => ({
    id: j.id,
    goods_code: j.goods_code,
    goods_name: j.goods_name_snapshot,
    lot_no: j.lot_no,
    weight_kg: j.weight_kg,
    status: j.status,
  })));

  // 2. Fetch current waste entries for 2026-10-13
  const { data: currentWaste, error: wasteErr } = await sb
    .from("production_piece_rate_waste_logs")
    .select("*")
    .gte("actual_weighed_at", "2026-10-13T00:00:00+07:00")
    .lte("actual_weighed_at", "2026-10-13T23:59:59+07:00");
  if (wasteErr) throw wasteErr;

  console.log(`\nCurrent Waste Entries for 2026-10-13: ${currentWaste.length} entries\n`);

  if (!apply) {
    console.log("DRY RUN ONLY. No changes made.");
    console.log("Run with --apply to apply the following modifications:");
    console.log("1. Void strawberry jam PJST3 (M04-0126-1, id: f9c8eb6c-b700-4b49-9908-aa0f9b22f151)");
    console.log("2. Update pineapple jam (M04-0088, id: 2f6cc52a-37f9-4f8f-8bfb-dc8a98bcd4b6) to 368.79 kg, LOT 261003");
    console.log("3. Insert broken scrap waste log for WKB-0002-1: 4.03 kg");
    console.log("4. Insert broken scrap waste log for WKB-0064: 8.42 kg");
    return;
  }

  // Backup current state
  const backupDir = path.join(process.cwd(), "scripts", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `backup-input-output-20261013-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ currentJams, currentWaste }, null, 2));
  console.log(`Backup saved to: ${backupPath}\n`);

  // 1. Void strawberry jam entry
  const strawberryJam = currentJams.find((j) => j.goods_code === "M04-0126-1" && j.id === "f9c8eb6c-b700-4b49-9908-aa0f9b22f151");
  if (strawberryJam) {
    const { error: voidErr } = await sb
      .from("production_jam_usage_entries")
      .update({
        status: "voided",
        voided_at: new Date().toISOString(),
      })
      .eq("id", strawberryJam.id);
    if (voidErr) throw voidErr;
    console.log(`[OK] Voided strawberry jam PJST3 (${strawberryJam.id})`);
  }

  // 2. Update pineapple jam entry
  const pineappleJam = currentJams.find((j) => j.goods_code === "M04-0088" && j.id === "2f6cc52a-37f9-4f8f-8bfb-dc8a98bcd4b6");
  if (pineappleJam) {
    const { error: updateErr } = await sb
      .from("production_jam_usage_entries")
      .update({
        weight_kg: 368.79,
        lot_no: "261003",
      })
      .eq("id", pineappleJam.id);
    if (updateErr) throw updateErr;
    console.log(`[OK] Updated pineapple jam (${pineappleJam.id}) to 368.79 kg, LOT 261003`);
  }

  // 3. Insert waste logs for WKB-0002-1 and WKB-0064
  const wasteToInsert = [
    {
      request_id: crypto.randomUUID(),
      product_barcode_snapshot: "0400000002927",
      product_code_snapshot: "WKB-0002-1",
      product_goods_code_snapshot: "WKB-0002-1",
      product_sku_code_snapshot: "WKB-0002-1",
      product_name_snapshot: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรดเคพี",
      product_brand_code_snapshot: "0",
      product_brand_name_snapshot: "ไม่กำหนดยี่ห้อ",
      product_unit_snapshot: "KG",
      waste_category: "broken_scrap",
      waste_weight_kg: 4.03,
      machine_code: "P01",
      raw_product_barcode_payload: "0400000002927",
      actual_weighed_at: "2026-10-13T12:00:00+07:00",
      logged_at: new Date().toISOString(),
      status: "confirmed",
      metadata: {
        source: "manual_report_correction",
        reason: "operator_confirmed_broken_scrap_13_10_69",
      },
    },
    {
      request_id: crypto.randomUUID(),
      product_barcode_snapshot: "0400000003146",
      product_code_snapshot: "WKB-0064",
      product_goods_code_snapshot: "WKB-0064",
      product_sku_code_snapshot: "WKB-0064",
      product_name_snapshot: "เนื้อขนมออพายป้ายแยมสับปะรด",
      product_brand_code_snapshot: "0",
      product_brand_name_snapshot: "ไม่กำหนดยี่ห้อ",
      product_unit_snapshot: "KG",
      waste_category: "broken_scrap",
      waste_weight_kg: 8.42,
      machine_code: "P01",
      raw_product_barcode_payload: "0400000003146",
      actual_weighed_at: "2026-10-13T12:00:00+07:00",
      logged_at: new Date().toISOString(),
      status: "confirmed",
      metadata: {
        source: "manual_report_correction",
        reason: "operator_confirmed_broken_scrap_13_10_69",
      },
    },
  ];

  const { data: insertedWaste, error: insertWasteErr } = await sb
    .from("production_piece_rate_waste_logs")
    .insert(wasteToInsert)
    .select("*");
  if (insertWasteErr) throw insertWasteErr;
  console.log(`[OK] Inserted ${insertedWaste.length} waste logs for 2026-10-13`);

  // Verify
  console.log("\n=== Verification ===");
  const { data: verifiedJams } = await sb
    .from("production_jam_usage_entries")
    .select("*")
    .eq("usage_date", "2026-10-13")
    .eq("status", "confirmed");
  console.log("Active Jam Entries for 2026-10-13:");
  console.table(verifiedJams.map((j) => ({
    goods_code: j.goods_code,
    goods_name: j.goods_name_snapshot,
    lot_no: j.lot_no,
    weight_kg: j.weight_kg,
    status: j.status,
  })));

  const { data: verifiedWaste } = await sb
    .from("production_piece_rate_waste_logs")
    .select("*")
    .gte("actual_weighed_at", "2026-10-13T00:00:00+07:00")
    .lte("actual_weighed_at", "2026-10-13T23:59:59+07:00")
    .eq("status", "confirmed");
  console.log("\nActive Waste Entries for 2026-10-13:");
  console.table(verifiedWaste.map((w) => ({
    product_code: w.product_code_snapshot,
    category: w.waste_category,
    weight_kg: w.waste_weight_kg,
  })));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
