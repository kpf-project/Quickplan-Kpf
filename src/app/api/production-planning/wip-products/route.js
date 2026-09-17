import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  loadApprovedWipVersionMetaBySkus,
  normalizeSku,
} from "@/lib/wipPlanning";

const DEFAULT_LIMIT = 1000;

function normalizeBooleanFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return (
    String(error?.code || "") === "PGRST204"
    || message.includes(String(columnName || "").toLowerCase())
  );
}

async function loadAllowedMasterPlanWipSet(supabaseAdmin, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Set();

  const result = await supabaseAdmin
    .from("production_wip_policies")
    .select("sku_code,allow_master_plan,is_active")
    .in("sku_code", skus)
    .eq("allow_master_plan", true)
    .neq("is_active", false);

  if (result.error) {
    if (isMissingColumnError(result.error, "allow_master_plan")) {
      return new Set();
    }
    throw result.error;
  }

  return new Set(
    (result.data ?? [])
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  );
}

async function loadApprovedFormulaOptionsBySkus(supabaseAdmin, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();

  const bomResult = await supabaseAdmin
    .from("production_boms")
    .select("id,sku_code")
    .in("sku_code", skus);
  if (bomResult.error) {
    throw bomResult.error;
  }

  const boms = Array.isArray(bomResult.data) ? bomResult.data : [];
  const bomIds = boms.map((row) => row?.id).filter(Boolean);
  if (!bomIds.length) return new Map();

  const versionsResult = await supabaseAdmin
    .from("production_bom_versions")
    .select("id,bom_id,version_no,formula_code,formula_name,status")
    .in("bom_id", bomIds)
    .eq("status", "approved")
    .order("version_no", { ascending: false });
  if (versionsResult.error) {
    throw versionsResult.error;
  }

  const skuByBomId = new Map(boms.map((row) => [row.id, normalizeSku(row.sku_code)]));
  const optionsBySku = new Map();
  (versionsResult.data ?? []).forEach((version) => {
    const sku = skuByBomId.get(version?.bom_id);
    if (!sku) return;
    if (!optionsBySku.has(sku)) {
      optionsBySku.set(sku, new Map());
    }
    const formulaCode = String(version?.formula_code || "DEFAULT").trim().toUpperCase() || "DEFAULT";
    const formulaMap = optionsBySku.get(sku);
    if (formulaMap.has(formulaCode)) return;
    formulaMap.set(formulaCode, {
      formula_code: formulaCode,
      formula_name: String(version?.formula_name || "").trim() || (formulaCode === "DEFAULT" ? "Default BOM" : formulaCode),
      bom_version_id: version?.id || null,
    });
  });

  return new Map(
    Array.from(optionsBySku.entries()).map(([sku, formulaMap]) => [sku, Array.from(formulaMap.values())])
  );
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const inputLimit = Number(searchParams.get("limit"));
    const masterPlanOnly = normalizeBooleanFlag(searchParams.get("masterPlanOnly"));
    const limit = Number.isFinite(inputLimit) && inputLimit > 0
      ? Math.min(2000, Math.trunc(inputLimit))
      : DEFAULT_LIMIT;

    const supabaseAdmin = getSupabaseAdmin();
    const productResult = await supabaseAdmin
      .from("products_cache")
      .select("sku_code,sku_name,iccat_code,uom_name")
      .eq("iccat_code", "03")
      .order("sku_code", { ascending: true })
      .limit(limit);

    if (productResult.error) {
      return NextResponse.json(
        { error: productResult.error.message || "Failed to load WIP products" },
        { status: 500 }
      );
    }

    const products = Array.isArray(productResult.data) ? productResult.data : [];
    const skuCodes = products
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean);
    const [versionMetaBySku, formulaOptionsBySku, allowedMasterPlanWipSet] = await Promise.all([
      loadApprovedWipVersionMetaBySkus(supabaseAdmin, skuCodes),
      loadApprovedFormulaOptionsBySkus(supabaseAdmin, skuCodes),
      loadAllowedMasterPlanWipSet(supabaseAdmin, skuCodes),
    ]);

    const rows = masterPlanOnly
      ? products.filter((row) => allowedMasterPlanWipSet.has(normalizeSku(row?.sku_code)))
      : products;

    return NextResponse.json({
      data: rows.map((row) => {
        const skuCode = normalizeSku(row?.sku_code);
        const versionMeta = versionMetaBySku.get(skuCode) || null;
        return {
          skuCode,
          skuName: String(row?.sku_name || "").trim() || skuCode,
          uomName: String(row?.uom_name || "").trim() || "unit",
          wipQtyInputMode: String(versionMeta?.wipQtyInputMode || "").trim().toLowerCase() || "",
          unitsPerBatch: Number(versionMeta?.unitsPerBatch || 0) || 0,
          allowMasterPlan: allowedMasterPlanWipSet.has(skuCode),
          formulaOptions: formulaOptionsBySku.get(skuCode) || [],
        };
      }),
      meta: {
        limit,
        totalRows: rows.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
