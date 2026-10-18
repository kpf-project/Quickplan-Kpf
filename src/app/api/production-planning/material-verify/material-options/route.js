import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { RAW_CATEGORY_OPTIONS, WIP_CATEGORY_OPTIONS } from "@/lib/bomMatrix";
import { normalizeParam } from "@/lib/validation";
import { normalizeSku } from "@/lib/materialClaims";
import { loadCompleteMaterialCatalog } from "@/lib/requisitionMaterialPicker";

export const dynamic = "force-dynamic";

const MATERIAL_CATEGORY_OPTIONS = [...WIP_CATEGORY_OPTIONS, ...RAW_CATEGORY_OPTIONS];
const DEFAULT_PAGE_SIZE = 300;
const MAX_PAGE_SIZE = 500;
const TRADE_CODE_PAGE_SIZE = 500;
const PRODUCT_CACHE_PAGE_SIZE = 1000;
const RAW_CATEGORY_SET = new Set(RAW_CATEGORY_OPTIONS.map((value) => String(value).trim().toUpperCase()));

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizePageSize(value) {
  return Math.min(MAX_PAGE_SIZE, normalizePositiveInteger(value, DEFAULT_PAGE_SIZE));
}

function getErrorMessage(error, fallback = "Unknown error") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object") {
    const message = error.message || error.error || error.details;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function listTradeCodesForVerify({ search, page, pageSize, cursor }) {
  if (page > 1 && !cursor) {
    return { rows: [], nextCursor: null, hasMore: false };
  }

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(Math.min(TRADE_CODE_PAGE_SIZE, pageSize)));
  params.set("iccatCodes", MATERIAL_CATEGORY_OPTIONS.join(","));
  if (search) {
    params.set("search", search);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const result = await fetchGatewayJson("/api/trade-codes", params, "production");
  if (!result.ok) {
    throw new Error(getErrorMessage(result.error, "Failed to load material options"));
  }

  const payload = result.data ?? {};

  return {
    rows: Array.isArray(payload.data) ? payload.data : [],
    nextCursor: payload.cursor?.next ?? null,
    hasMore: Boolean(payload.cursor?.hasMore),
  };
}

function mapTradeCodeOption(row) {
  const skuCode = normalizeSku(row?.SKU_CODE);
  const goodsCode = normalizeSku(row?.GOODS_CODE || row?.SKU_CODE);
  if (!skuCode || !goodsCode) return null;

  return {
    skuCode,
    goodsCode,
    name:
      String(row?.GOODS_ALIAS || "").trim()
      || String(row?.SKU_NAME || "").trim()
      || goodsCode
      || skuCode,
    unit:
      String(row?.UTQ_NAME_2 || "").trim()
      || String(row?.UTQ_NAME_1 || "").trim()
      || String(row?.UTQ_NAME || "").trim()
      || "-",
    category: String(row?.ICCAT_CODE || "").trim().toUpperCase() || null,
    categoryName: String(row?.ICCAT_NAME || "").trim() || null,
    itemType: WIP_CATEGORY_OPTIONS.includes(String(row?.ICCAT_CODE || "").trim().toUpperCase()) ? "WIP" : "RAW",
  };
}

function mapProductCacheOption(row) {
  const skuCode = normalizeSku(row?.sku_code);
  if (!skuCode) return null;

  return {
    skuCode,
    goodsCode: skuCode,
    name: String(row?.sku_name || skuCode).trim() || skuCode,
    unit: String(row?.uom_name || "").trim() || "-",
    category: String(row?.iccat_code || "").trim().toUpperCase() || null,
    categoryName: String(row?.iccat_name || "").trim() || null,
    itemType: WIP_CATEGORY_OPTIONS.includes(String(row?.iccat_code || "").trim().toUpperCase()) ? "WIP" : "RAW",
  };
}

async function listProductCacheOptions({ search, page, pageSize }) {
  const supabaseAdmin = getSupabaseAdmin();
  const offsetPage = Math.max(0, page - 1);
  const effectivePageSize = Math.min(PRODUCT_CACHE_PAGE_SIZE, pageSize);
  let query = supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code,iccat_name,uom_name,is_active")
    .in("iccat_code", MATERIAL_CATEGORY_OPTIONS)
    .order("sku_code", { ascending: true })
    .range(offsetPage * effectivePageSize, (offsetPage + 1) * effectivePageSize - 1);

  if (search) {
    query = query.or(`sku_code.ilike.%${search}%,sku_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Failed to load material catalog");
  }

  return Array.isArray(data) ? data : [];
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
      "plan.verify_materials",
    ]);

    const { searchParams } = new URL(request.url);
    const search = normalizeParam(searchParams.get("search")) || "";
    const page = normalizePositiveInteger(searchParams.get("page"), 1);
    const pageSize = normalizePageSize(searchParams.get("pageSize") || searchParams.get("limit"));
    const cursor = normalizeParam(searchParams.get("cursor")) || "";
    if (searchParams.get("catalog") === "all") {
      const options = await loadCompleteMaterialCatalog({
        loadTrades: async args => { const result = await listTradeCodesForVerify({ ...args, search: "" }); return { ...result, rows: result.rows.map(mapTradeCodeOption).filter(Boolean) }; },
        loadProducts: async args => { const rows = await listProductCacheOptions({ ...args, search: "" }); return { rows: rows.map(mapProductCacheOption).filter(Boolean), hasMore: rows.length >= args.pageSize }; },
      });
      return NextResponse.json({ data: options, meta: { complete: true, count: options.length } });
    }

    const seen = new Set();
    const options = [];
    const addOption = (option) => {
      if (!option) return;
      const key = `${option.skuCode}::${option.goodsCode}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push(option);
    };

    const tradeResult = await listTradeCodesForVerify({ search, page, pageSize, cursor });
    const tradeOptions = tradeResult.rows.map(mapTradeCodeOption).filter(Boolean);
    const tradeSkuSet = new Set(tradeOptions.map((option) => option.skuCode));
    const productRows = await listProductCacheOptions({ search, page, pageSize });

    productRows
      .map(mapProductCacheOption)
      .filter((option) => {
        if (!option) return false;
        const category = String(option.category || "").trim().toUpperCase();
        return !RAW_CATEGORY_SET.has(category) || !tradeSkuSet.has(option.skuCode);
      })
      .forEach(addOption);
    tradeOptions.forEach(addOption);

    return NextResponse.json({
      data: options.slice(0, pageSize),
      meta: {
        page,
        pageSize,
        count: Math.min(options.length, pageSize),
        hasMore: tradeResult.hasMore || productRows.length >= pageSize,
        nextCursor: tradeResult.nextCursor,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
