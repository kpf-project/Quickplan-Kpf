"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const RAW_CATEGORY_CODES = new Set(["01", "02", "05", "08", "10"]);
const TRADE_CODE_PAGE_SIZE = 200;
const MAX_TRADE_CODE_ROWS = 2000;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) return;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length)) || 0,
  };
}

function getGatewayConfig() {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  if (!gatewayUrl) {
    throw new Error("Missing KPF_GATEWAY_URL in environment");
  }
  return { gatewayUrl, apiKey };
}

async function fetchTradeCodesBySearch(search) {
  const rows = [];
  let page = 1;
  let cursor = null;
  const { gatewayUrl, apiKey } = getGatewayConfig();

  while (rows.length < MAX_TRADE_CODE_ROWS) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(TRADE_CODE_PAGE_SIZE));
    params.set("search", search);

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`${gatewayUrl}/api/trade-codes?${params.toString()}`, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to load trade codes (${response.status})`);
    }
    const pageRows = Array.isArray(payload?.data) ? payload.data : [];
    rows.push(...pageRows);

    const nextCursor = payload?.cursor?.next ?? null;
    const hasMore = Boolean(payload?.cursor?.hasMore);
    if (!hasMore || !nextCursor || pageRows.length === 0) {
      break;
    }

    page += 1;
    cursor = nextCursor;
  }

  return rows.slice(0, MAX_TRADE_CODE_ROWS);
}

async function loadAllBomItems(supabase) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("production_bom_items")
      .select("id,version_id,material_sku_code,material_goods_code,uom_name")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return rows;
}

async function loadProductsBySku(supabase, skuCodes) {
  const normalizedSkus = Array.from(new Set((skuCodes || []).map(normalizeCode).filter(Boolean)));
  const products = new Map();

  for (let index = 0; index < normalizedSkus.length; index += 200) {
    const chunk = normalizedSkus.slice(index, index + 200);
    const { data, error } = await supabase
      .from("products_cache")
      .select("sku_code,iccat_code,uom_name")
      .in("sku_code", chunk);

    if (error) {
      throw error;
    }

    (data || []).forEach((row) => {
      products.set(normalizeCode(row?.sku_code), {
        skuCode: normalizeCode(row?.sku_code),
        iccatCode: normalizeCode(row?.iccat_code),
        uomName: normalizeText(row?.uom_name),
      });
    });
  }

  return products;
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function resolveTradeRowForItem(rows, item) {
  const itemGoodsCode = normalizeCode(item?.material_goods_code || item?.material_sku_code);
  const itemSkuCode = normalizeCode(item?.material_sku_code);

  return (Array.isArray(rows) ? rows : []).find((row) => {
    const goodsCode = normalizeCode(row?.GOODS_CODE);
    const skuCode = normalizeCode(row?.SKU_CODE);
    if (goodsCode !== itemGoodsCode) {
      return false;
    }
    if (!itemSkuCode) {
      return true;
    }
    return !skuCode || skuCode === itemSkuCode;
  }) || null;
}

function resolveExpectedUnit(item, product, tradeRow) {
  const fallbackUnit = normalizeText(product?.uomName || item?.uom_name);
  if (!tradeRow) {
    return fallbackUnit;
  }
  return normalizeText(tradeRow?.UTQ_NAME_2 || tradeRow?.UTQ_NAME || fallbackUnit);
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const allItems = await loadAllBomItems(supabase);
  const limitedItems = options.limit > 0 ? allItems.slice(0, options.limit) : allItems;
  const productsBySku = await loadProductsBySku(
    supabase,
    limitedItems.map((item) => item.material_sku_code)
  );

  const rawItems = limitedItems.filter((item) => {
    const product = productsBySku.get(normalizeCode(item.material_sku_code));
    return RAW_CATEGORY_CODES.has(normalizeCode(product?.iccatCode));
  });

  const distinctSearchKeys = Array.from(
    new Set(rawItems.map((item) => normalizeCode(item.material_goods_code || item.material_sku_code)).filter(Boolean))
  );

  const tradeRowsBySearch = new Map();
  await mapWithConcurrency(distinctSearchKeys, 6, async (searchKey) => {
    const rows = await fetchTradeCodesBySearch(searchKey);
    tradeRowsBySearch.set(searchKey, rows);
    return rows;
  });

  const updates = [];
  rawItems.forEach((item) => {
    const product = productsBySku.get(normalizeCode(item.material_sku_code));
    const searchKey = normalizeCode(item.material_goods_code || item.material_sku_code);
    const tradeRows = tradeRowsBySearch.get(searchKey) || [];
    const tradeRow = resolveTradeRowForItem(tradeRows, item);
    const expectedUnit = resolveExpectedUnit(item, product, tradeRow);
    const currentUnit = normalizeText(item.uom_name);

    if (!expectedUnit || currentUnit === expectedUnit) {
      return;
    }

    updates.push({
      id: item.id,
      versionId: item.version_id,
      skuCode: normalizeCode(item.material_sku_code),
      goodsCode: searchKey,
      currentUnit,
      expectedUnit,
    });
  });

  console.log(`BOM items scanned: ${limitedItems.length}`);
  console.log(`RAW items checked: ${rawItems.length}`);
  console.log(`Rows needing repair: ${updates.length}`);

  updates.forEach((item) => {
    console.log(
      [
        `- id=${item.id}`,
        `version=${item.versionId}`,
        `sku=${item.skuCode}`,
        `goods=${item.goodsCode}`,
        `uom: ${item.currentUnit || "(blank)"} -> ${item.expectedUnit}`,
      ].join(" | ")
    );
  });

  if (!options.apply || !updates.length) {
    console.log(options.apply ? "No updates applied." : "Dry run only. Re-run with --apply to persist changes.");
    return;
  }

  for (const item of updates) {
    const { error } = await supabase
      .from("production_bom_items")
      .update({ uom_name: item.expectedUnit })
      .eq("id", item.id);
    if (error) {
      throw error;
    }
  }

  console.log(`Applied ${updates.length} unit repairs.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
