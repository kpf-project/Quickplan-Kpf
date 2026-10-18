import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const target = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!target || !serviceRoleKey) {
  throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(target, serviceRoleKey, {
  auth: { persistSession: false },
});

const FROM_SKU_CODE = "WK-2208";
const FROM_GOODS_CODE = "WK-22080";
const TO_SKU_CODE = "WK-2202";
const TO_GOODS_CODE = "WK-22020";
const TO_SKU_NAME = "แป้งสาลี - D1 (22.5 Kg.)";

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`\n=== REPAIR: Replace ${FROM_GOODS_CODE} (${FROM_SKU_CODE}) -> ${TO_GOODS_CODE} (${TO_SKU_CODE}) ===`);
  console.log(`Mode: ${isApply ? "APPLY (LIVE WRITE)" : "DRY-RUN (PREVIEW ONLY)"}\n`);

  // 1. Verify target product exists in products_cache
  const { data: targetProduct, error: prodErr } = await supabase
    .from("products_cache")
    .select("sku_code, sku_name, uom_name")
    .eq("sku_code", TO_SKU_CODE)
    .single();

  if (prodErr || !targetProduct) {
    throw new Error(`Target product ${TO_SKU_CODE} not found in products_cache: ${prodErr?.message}`);
  }
  console.log(`Target product verified: [${targetProduct.sku_code}] ${targetProduct.sku_name} (${targetProduct.uom_name})`);

  // 2. Fetch BOM items to update
  const { data: bomItems, error: bomErr } = await supabase
    .from("production_bom_items")
    .select("id, version_id, material_sku_code, material_goods_code, qty, uom_name, calculation_basis")
    .or(`material_sku_code.eq.${FROM_SKU_CODE},material_goods_code.eq.${FROM_GOODS_CODE}`)
    .order("id", { ascending: true });

  if (bomErr) throw new Error(`Failed to load BOM items: ${bomErr.message}`);
  console.log(`Found ${bomItems?.length || 0} BOM items to replace.`);

  // 3. Fetch Routing components to update
  const { data: routingComponents, error: rcErr } = await supabase
    .from("production_routing_components")
    .select("id, fg_sku_code, parent_sku_code, component_sku_code, component_sku_name, department_id, work_center_id, node_key, is_active, room_mode, dispatch_split_mode")
    .eq("component_sku_code", FROM_SKU_CODE)
    .order("id", { ascending: true });

  if (rcErr) throw new Error(`Failed to load routing components: ${rcErr.message}`);
  console.log(`Found ${routingComponents?.length || 0} routing component items to replace.`);

  if ((bomItems?.length || 0) === 0 && (routingComponents?.length || 0) === 0) {
    console.log("No items found to update. Nothing to do.");
    return;
  }

  // 4. Create Backup JSON
  const backupDir = path.resolve("backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `backup-replace-wk22080-to-wk22020-${timestamp}.json`);

  const backupData = {
    timestamp: new Date().toISOString(),
    isApply,
    source: {
      fromSku: FROM_SKU_CODE,
      fromGoods: FROM_GOODS_CODE,
      toSku: TO_SKU_CODE,
      toGoods: TO_GOODS_CODE,
      toSkuName: TO_SKU_NAME,
    },
    bomItemsCount: bomItems.length,
    bomItems,
    routingComponentsCount: routingComponents.length,
    routingComponents,
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`Backup saved to: ${backupPath}`);

  if (!isApply) {
    console.log("\n[DRY RUN] Preview of changes:");
    console.log(`- production_bom_items: would update ${bomItems.length} rows:`);
    console.log(`    material_sku_code: "${FROM_SKU_CODE}" -> "${TO_SKU_CODE}"`);
    console.log(`    material_goods_code: "${FROM_GOODS_CODE}" -> "${TO_GOODS_CODE}"`);
    console.log(`- production_routing_components: would update ${routingComponents.length} rows:`);
    console.log(`    component_sku_code: "${FROM_SKU_CODE}" -> "${TO_SKU_CODE}"`);
    console.log(`    component_sku_name: -> "${TO_SKU_NAME}"`);
    console.log(`    node_key: replace "${FROM_SKU_CODE}" with "${TO_SKU_CODE}"`);
    console.log("\nTo execute these changes, rerun with --apply");
    return;
  }

  // 5. APPLY: Update BOM items
  console.log("\nApplying changes to production_bom_items...");
  const bomIds = bomItems.map((b) => b.id);
  const { data: updatedBom, error: updateBomErr } = await supabase
    .from("production_bom_items")
    .update({
      material_sku_code: TO_SKU_CODE,
      material_goods_code: TO_GOODS_CODE,
    })
    .in("id", bomIds)
    .select("id, material_sku_code, material_goods_code");

  if (updateBomErr) {
    throw new Error(`Failed to update production_bom_items: ${updateBomErr.message}`);
  }
  console.log(`Successfully updated ${updatedBom.length} rows in production_bom_items.`);

  // 6. APPLY: Update Routing components
  console.log("\nApplying changes to production_routing_components...");
  let rcUpdatedCount = 0;
  for (const rc of routingComponents) {
    const nextNodeKey = rc.node_key.replaceAll(FROM_SKU_CODE, TO_SKU_CODE);
    const { error: updateRcErr } = await supabase
      .from("production_routing_components")
      .update({
        component_sku_code: TO_SKU_CODE,
        component_sku_name: TO_SKU_NAME,
        node_key: nextNodeKey,
      })
      .eq("id", rc.id);

    if (updateRcErr) {
      throw new Error(`Failed updating routing component ${rc.id}: ${updateRcErr.message}`);
    }
    rcUpdatedCount++;
  }
  console.log(`Successfully updated ${rcUpdatedCount} rows in production_routing_components.`);

  // 7. Post-update Verification
  console.log("\nVerifying updates...");

  // Check remaining old BOM items
  const { data: remainingBom } = await supabase
    .from("production_bom_items")
    .select("id")
    .or(`material_sku_code.eq.${FROM_SKU_CODE},material_goods_code.eq.${FROM_GOODS_CODE}`);

  if ((remainingBom?.length || 0) > 0) {
    throw new Error(`Verification failed: ${remainingBom.length} BOM items still have old codes`);
  }

  // Check remaining old routing components
  const { data: remainingRc } = await supabase
    .from("production_routing_components")
    .select("id")
    .eq("component_sku_code", FROM_SKU_CODE);

  if ((remainingRc?.length || 0) > 0) {
    throw new Error(`Verification failed: ${remainingRc.length} routing components still have old codes`);
  }

  // Check updated BOM items
  const { data: verifyBom } = await supabase
    .from("production_bom_items")
    .select("id")
    .eq("material_sku_code", TO_SKU_CODE)
    .eq("material_goods_code", TO_GOODS_CODE)
    .in("id", bomIds);

  if (verifyBom?.length !== bomIds.length) {
    throw new Error(`Verification mismatch: expected ${bomIds.length} updated BOM items, found ${verifyBom?.length}`);
  }

  console.log(`VERIFICATION PASSED:`);
  console.log(` - production_bom_items with ${FROM_GOODS_CODE}: 0 remaining.`);
  console.log(` - production_bom_items with ${TO_GOODS_CODE} (${TO_SKU_CODE}): ${verifyBom.length} verified.`);
  console.log(` - production_routing_components with ${FROM_SKU_CODE}: 0 remaining.`);
  console.log(` - production_routing_components updated to ${TO_SKU_CODE}: ${rcUpdatedCount} verified.`);
  console.log(`\nALL CHANGES APPLIED SUCCESSFULLY!`);
}

run().catch((err) => {
  console.error("\n[ERROR]", err);
  process.exit(1);
});
