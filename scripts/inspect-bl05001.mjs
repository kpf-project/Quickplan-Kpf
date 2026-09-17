import fs from "fs";

// Load .env.local manually
const content = fs.readFileSync(".env.local", "utf8");
const env = {};
content.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const idx = trimmed.indexOf("=");
  if (idx !== -1) {
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function run() {
  // 1. Get BL0-5001 BOM and versions
  const bomRes = await fetch(`${supabaseUrl}/rest/v1/production_boms?sku_code=eq.BL0-5001&select=*,production_bom_versions(*)`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const boms = await bomRes.json();
  console.log("=== BOM BL0-5001 ===");
  console.log(JSON.stringify(boms, null, 2));

  if (!boms[0]) return;
  const v13 = boms[0].production_bom_versions.find((v) => v.version_no === 13) || boms[0].production_bom_versions[0];
  console.log("\nUsing BOM Version:", v13.version_no, "ID:", v13.id);

  const itemRes = await fetch(`${supabaseUrl}/rest/v1/production_bom_items?version_id=eq.${v13.id}&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const items = await itemRes.json();
  console.log("\n=== BL0-5001 BOM v13 Items (Count:", items.length, ") ===");
  items.forEach((it) => {
    console.log(`- SKU: ${it.material_sku_code} | Part: ${it.material_goods_code} | Qty: ${it.qty} ${it.uom_name} | Basis: ${it.calculation_basis}`);
  });

  // 3. Inspect WKB-0002 and its children recursively
  async function traceBom(sku, level = 1) {
    const bRes = await fetch(`${supabaseUrl}/rest/v1/production_boms?sku_code=eq.${sku}&select=*,production_bom_versions(*)`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const bData = await bRes.json();
    if (!bData[0]) {
      console.log(`${"  ".repeat(level)}[No BOM found for ${sku}]`);
      return;
    }
    const b = bData[0];
    const latestV = b.production_bom_versions.sort((a, b) => b.version_no - a.version_no)[0];
    console.log(`\n${"  ".repeat(level)}=== Level ${level} WIP: ${sku} (v${latestV ? latestV.version_no : 'none'}, ID: ${latestV ? latestV.id : '-'}, formula: ${latestV ? latestV.formula_name || latestV.formula_code : '-'}) ===`);
    if (!latestV) return;

    const itRes = await fetch(`${supabaseUrl}/rest/v1/production_bom_items?version_id=eq.${latestV.id}&select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const its = await itRes.json();
    for (const it of its) {
      console.log(`${"  ".repeat(level + 1)}- SKU: ${it.material_sku_code} | Part: ${it.material_goods_code} | Qty: ${it.qty} ${it.uom_name} | Basis: ${it.calculation_basis}`);
      const childSku = it.material_sku_code || it.material_goods_code;
      if (childSku && (childSku.startsWith("WK") || childSku.startsWith("WKB"))) {
        await traceBom(childSku, level + 2);
      }
    }
  }

  await traceBom("WKB-0002", 1);

  console.log("\n=== Checking WK-2202 ===");
  const pRes = await fetch(`${supabaseUrl}/rest/v1/products_cache?sku_code=ilike.*2202*&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("Products matching 2202:", await pRes.json());

  const bRes = await fetch(`${supabaseUrl}/rest/v1/production_boms?sku_code=ilike.*2202*&select=id,sku_code`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("BOMs matching 2202:", await bRes.json());
}

run().catch(console.error);
