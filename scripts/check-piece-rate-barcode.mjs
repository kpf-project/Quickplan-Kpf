import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile(".env.local");

  const barcode = process.argv[2];
  if (!barcode) {
    throw new Error("barcode is required");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const trade = await supabase
    .from("pallet_trade_code_barcodes")
    .select("goods_code,sku_code,product_barcode")
    .eq("product_barcode", barcode);

  const legacy = await supabase
    .from("product_barcodes")
    .select("sku_code,product_barcode")
    .eq("product_barcode", barcode);

  const goods =
    trade.data?.[0]?.goods_code ||
    legacy.data?.[0]?.sku_code ||
    trade.data?.[0]?.sku_code ||
    null;
  const legacySku = legacy.data?.[0]?.sku_code || null;
  const sku =
    trade.data?.[0]?.sku_code ||
    legacySku ||
    null;

  let mappings = { data: [], error: null };
  let product = { data: [], error: null };
  let profiles = { data: [], error: null };

  if (goods || sku) {
    const filters = [
      goods ? `product_code.eq.${goods}` : null,
      sku ? `product_code.eq.${sku}` : null,
      sku ? `sku_code.eq.${sku}` : null,
      legacySku ? `product_code.eq.${legacySku}` : null,
      legacySku ? `sku_code.eq.${legacySku}` : null,
    ].filter(Boolean).join(",");

    mappings = await supabase
      .from("production_piece_rate_product_mappings")
      .select("product_code,sku_code,profile_id,weight_option_id,updated_at")
      .or(filters);
  }

  if (sku) {
    product = await supabase
      .from("products_cache")
      .select("sku_code,sku_name,brand_name")
      .eq("sku_code", sku);
  }

  const profileIds = [...new Set((mappings.data || []).map((row) => row.profile_id).filter(Boolean))];
  if (profileIds.length) {
    profiles = await supabase
      .from("production_piece_rate_profiles")
      .select("id,name,input_mode,is_active")
      .in("id", profileIds);
  }

  console.log(JSON.stringify({
    barcode,
    trade: trade.data,
    tradeError: trade.error?.message || null,
    legacy: legacy.data,
    legacyError: legacy.error?.message || null,
    resolved: { goods, sku, legacySku },
    products: product.data,
    productError: product.error?.message || null,
    mappings: mappings.data,
    mappingsError: mappings.error?.message || null,
    profiles: profiles.data,
    profileError: profiles.error?.message || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
