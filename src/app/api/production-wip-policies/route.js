import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";
import { fetchGatewayJson } from "@/lib/gatewayClient";

const TRADE_CODE_PAGE_SIZE = 500;
const MAX_TRADE_CODE_ROWS = 100000;

async function listTradeCodesForWip({ iccatCodes, search }) {
  const rows = [];
  let page = 1;
  let cursor = null;

  while (rows.length < MAX_TRADE_CODE_ROWS) {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", TRADE_CODE_PAGE_SIZE.toString());
    if (search) {
      params.set("search", search);
    }
    if (iccatCodes && iccatCodes.length) {
      params.set("iccatCodes", iccatCodes.join(","));
    }
    if (cursor) {
      params.set("cursor", cursor);
    }

    const result = await fetchGatewayJson("/api/trade-codes", params, "production");
    if (!result.ok) {
      throw new Error("Failed to load trade codes");
    }

    const payload = result.data ?? {};
    const pageRows = Array.isArray(payload.data) ? payload.data : [];
    rows.push(...pageRows);

    const nextCursor = payload.cursor?.next ?? null;
    const hasMore = Boolean(payload.cursor?.hasMore);
    if (!hasMore || !nextCursor || pageRows.length === 0) {
      break;
    }

    page += 1;
    cursor = nextCursor;
  }

  return rows.slice(0, MAX_TRADE_CODE_ROWS);
}

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;
const ALLOWED_SUPPLY_MODES = new Set(["stock", "make_to_order", "hybrid"]);

function normalizeSupplyMode(value, fallback = "stock") {
  const normalized = String(value || "").trim().toLowerCase();
  if (ALLOWED_SUPPLY_MODES.has(normalized)) return normalized;
  return fallback;
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist")
    || message.includes("relation")
    || String(error?.code || "") === "42P01"
  );
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return (
    String(error?.code || "") === "PGRST204"
    || message.includes(String(columnName || "").toLowerCase())
  );
}

async function loadPolicyMapBySku(supabaseAdmin, skuCodes = []) {
  if (!skuCodes.length) return new Map();
  let policyResult = await supabaseAdmin
    .from("production_wip_policies")
    .select("sku_code,supply_mode,note,is_active,allow_master_plan,requires_requisition")
    .in("sku_code", skuCodes);

  if (policyResult.error && isMissingColumnError(policyResult.error, "requires_requisition")) {
    policyResult = await supabaseAdmin
      .from("production_wip_policies")
      .select("sku_code,supply_mode,note,is_active,allow_master_plan")
      .in("sku_code", skuCodes);
  }

  if (policyResult.error && isMissingColumnError(policyResult.error, "allow_master_plan")) {
    policyResult = await supabaseAdmin
      .from("production_wip_policies")
      .select("sku_code,supply_mode,note,is_active")
      .in("sku_code", skuCodes);
  }

  if (policyResult.error) {
    if (isMissingTableError(policyResult.error)) {
      return new Map();
    }
    throw policyResult.error;
  }

  const map = new Map();
  (policyResult.data ?? []).forEach((row) => {
    const skuCode = String(row?.sku_code || "").trim().toUpperCase();
    if (!skuCode) return;
    map.set(skuCode, {
      supplyMode: normalizeSupplyMode(row?.supply_mode),
      note: normalizeParam(row?.note) || "",
      isActive: row?.is_active !== false,
      allowMasterPlan: row?.allow_master_plan === true,
      requiresRequisition: row?.requires_requisition === true,
    });
  });
  return map;
}

function parseIncomingRows(body) {
  const inputRows = Array.isArray(body?.rows) ? body.rows : [body];
  const rows = [];
  const errors = [];

  inputRows.forEach((item, index) => {
    const skuCode = String(item?.skuCode || item?.sku_code || "").trim().toUpperCase();
    if (!skuCode) return;
    const supplyModeRaw = String(item?.supplyMode || item?.supply_mode || "").trim().toLowerCase();
    if (supplyModeRaw && !ALLOWED_SUPPLY_MODES.has(supplyModeRaw)) {
      errors.push({
        index,
        skuCode,
        message: "Invalid supply mode",
      });
      return;
    }
    rows.push({
      skuCode,
      supplyMode: normalizeSupplyMode(supplyModeRaw || "stock"),
      note: normalizeParam(item?.note) || null,
      isActive: normalizeBoolean(item?.isActive ?? item?.is_active, true),
      allowMasterPlan: normalizeBoolean(item?.allowMasterPlan ?? item?.allow_master_plan, false),
      requiresRequisition: normalizeBoolean(item?.requiresRequisition ?? item?.requires_requisition, false),
    });
  });

  return { rows, errors };
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const search = normalizeParam(searchParams.get("search"));
    const inputLimit = Number(searchParams.get("limit"));
    const limit = Number.isFinite(inputLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(inputLimit)))
      : DEFAULT_LIMIT;

    let searchedSkuCodes = null;
    if (search) {
      try {
        const matchingTradeCodes = await listTradeCodesForWip({ iccatCodes: ["03"], search });
        if (matchingTradeCodes.length > 0) {
          searchedSkuCodes = Array.from(
            new Set(matchingTradeCodes.map((row) => String(row.SKU_CODE || "").trim().toUpperCase()).filter(Boolean))
          );
        }
      } catch (err) {
        console.error("Failed to query trade codes search fallback", err);
      }
    }

    const supabaseAdmin = getSupabaseAdmin();
    let productQuery = supabaseAdmin
      .from("products_cache")
      .select("sku_code,sku_name,uom_name,iccat_code")
      .eq("iccat_code", "03")
      .order("sku_code", { ascending: true })
      .limit(limit);

    if (search) {
      const escaped = search.replace(/[%_]/g, "\\$&");
      let orClause = "sku_code.ilike.%" + escaped + "%,sku_name.ilike.%" + escaped + "%";
      if (searchedSkuCodes && searchedSkuCodes.length > 0) {
        const chunk = searchedSkuCodes.slice(0, 100);
        orClause += ",sku_code.in.(" + chunk.map((c) => '"' + c + '"').join(",") + ")";
      }
      productQuery = productQuery.or(orClause);
    }

    const productResult = await productQuery;
    if (productResult.error) {
      return Response.json(
        { error: productResult.error.message || "Failed to load WIP products" },
        { status: 500 }
      );
    }

    const products = Array.isArray(productResult.data) ? productResult.data : [];
    const skuCodes = products
      .map((row) => String(row?.sku_code || "").trim().toUpperCase())
      .filter(Boolean);

    // Fetch trade codes for these WIPs to map to goodsCode
    const tradeCodeMap = new Map();
    try {
      const tradeCodeRows = await listTradeCodesForWip({ iccatCodes: ["03"] });
      tradeCodeRows.forEach((row) => {
        const sku = String(row?.SKU_CODE || "").trim().toUpperCase();
        const goods = String(row?.GOODS_CODE || "").trim().toUpperCase();
        if (sku && goods) {
          if (!tradeCodeMap.has(sku)) {
            tradeCodeMap.set(sku, new Set());
          }
          tradeCodeMap.get(sku).add(goods);
        }
      });
    } catch (err) {
      console.error("Failed to load WIP trade codes mapping", err);
    }

    const policyMap = await loadPolicyMapBySku(supabaseAdmin, skuCodes);
    const payload = products.map((row) => {
      const skuCode = String(row?.sku_code || "").trim().toUpperCase();
      const policy = policyMap.get(skuCode);
      const goodsCodesSet = tradeCodeMap.get(skuCode);
      const goodsCode = goodsCodesSet ? Array.from(goodsCodesSet).join(", ") : skuCode;
      return {
        skuCode,
        goodsCode,
        skuName: String(row?.sku_name || "").trim(),
        uomName: String(row?.uom_name || "").trim(),
        supplyMode: policy?.supplyMode || "stock",
        isActive: policy?.isActive ?? true,
        allowMasterPlan: policy?.allowMasterPlan === true,
        requiresRequisition: policy?.requiresRequisition === true,
        note: policy?.note || "",
        hasPolicy: Boolean(policy),
      };
    });

    return Response.json({
      data: payload,
      meta: {
        search: search || "",
        limit,
        totalRows: payload.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);

    const body = await readJson(request);
    const { rows, errors } = parseIncomingRows(body);

    if (errors.length > 0) {
      return Response.json(
        {
          error: "Invalid input rows",
          details: errors,
        },
        { status: 400 }
      );
    }
    if (!rows.length) {
      return Response.json({ error: "rows are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const skuCodes = rows.map((row) => row.skuCode);
    const productResult = await supabaseAdmin
      .from("products_cache")
      .select("sku_code,iccat_code")
      .in("sku_code", skuCodes);

    if (productResult.error) {
      return Response.json(
        { error: productResult.error.message || "Failed to validate sku codes" },
        { status: 500 }
      );
    }

    const validWipSet = new Set(
      (productResult.data ?? [])
        .filter((row) => String(row?.iccat_code || "").trim() === "03")
        .map((row) => String(row?.sku_code || "").trim().toUpperCase())
        .filter(Boolean)
    );

    const invalidSkuCodes = skuCodes.filter((skuCode) => !validWipSet.has(skuCode));
    if (invalidSkuCodes.length > 0) {
      return Response.json(
        {
          error: "Only WIP SKU (iccat_code=03) is allowed",
          details: { skuCodes: invalidSkuCodes },
        },
        { status: 400 }
      );
    }

    const upsertRows = rows.map((row) => ({
      sku_code: row.skuCode,
      supply_mode: row.supplyMode,
      note: row.note,
      is_active: row.isActive,
      allow_master_plan: row.allowMasterPlan,
      requires_requisition: row.requiresRequisition,
      created_by: userId,
      updated_by: userId,
    }));

    let upsertResult = await supabaseAdmin
      .from("production_wip_policies")
      .upsert(upsertRows, { onConflict: "sku_code" })
      .select("sku_code,supply_mode,note,is_active,allow_master_plan,requires_requisition");

    if (upsertResult.error && isMissingColumnError(upsertResult.error, "requires_requisition")) {
      return Response.json(
        {
          error: "WIP policy requires_requisition column is missing. Run migration 20260719_add_requires_requisition_to_wip_policies.sql first.",
        },
        { status: 500 }
      );
    }

    if (upsertResult.error && isMissingColumnError(upsertResult.error, "allow_master_plan")) {
      return Response.json(
        {
          error: "WIP policy allow_master_plan column is missing. Run migration 20260711_add_allow_master_plan_to_wip_policies.sql first.",
        },
        { status: 500 }
      );
    }

    if (upsertResult.error) {
      if (isMissingTableError(upsertResult.error)) {
        return Response.json(
          {
            error: "WIP policy table is missing. Run migration 20260607_add_wip_supply_modes.sql first.",
          },
          { status: 500 }
        );
      }
      return Response.json(
        { error: upsertResult.error.message || "Failed to update WIP policies" },
        { status: 500 }
      );
    }

    const payload = (upsertResult.data ?? []).map((row) => ({
      skuCode: String(row?.sku_code || "").trim().toUpperCase(),
      supplyMode: normalizeSupplyMode(row?.supply_mode),
      note: normalizeParam(row?.note) || "",
      isActive: row?.is_active !== false,
      allowMasterPlan: row?.allow_master_plan === true,
      requiresRequisition: row?.requires_requisition === true,
    }));

    return Response.json({
      ok: true,
      data: payload,
      meta: { updatedRows: payload.length },
    });
  } catch (error) {
    return jsonError(error);
  }
}
