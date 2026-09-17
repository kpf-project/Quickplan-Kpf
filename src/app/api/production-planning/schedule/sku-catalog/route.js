import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return (
    String(error?.code || "") === "PGRST204"
    || message.includes(String(columnName || "").toLowerCase())
  );
}

async function loadMasterPlanWipProducts(db) {
  const policyResult = await db
    .from("production_wip_policies")
    .select("sku_code,allow_master_plan,is_active")
    .eq("allow_master_plan", true);

  if (policyResult.error) {
    if (isMissingColumnError(policyResult.error, "allow_master_plan")) {
      return [];
    }
    throw policyResult.error;
  }

  const skuCodeSet = new Set(
    (policyResult.data ?? [])
      .filter((row) => row?.is_active !== false)
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  );
  const skuCodes = Array.from(skuCodeSet);
  if (!skuCodes.length) return [];

  const productResult = await db
    .from("products_cache")
    .select("sku_code,sku_name,brand_name,uom_name,iccat_code")
    .eq("iccat_code", "03")
    .limit(5000);

  if (productResult.error) {
    throw productResult.error;
  }

  return (productResult.data ?? []).filter((row) => skuCodeSet.has(normalizeSku(row?.sku_code)));
}

async function loadApprovedSkuSet(db, skuCodes) {
  const approvedSkus = new Set();
  const formulaOptionsBySku = new Map();
  if (!skuCodes.length) return { approvedSkus, formulaOptionsBySku };

  const { data: boms, error: bomsError } = await db
    .from("production_boms")
    .select("id,sku_code")
    .in("sku_code", skuCodes);

  if (bomsError) {
    throw bomsError;
  }

  const bomIds = (boms ?? []).map((bom) => bom.id).filter(Boolean);
  const skuByBomId = new Map((boms ?? []).map((bom) => [bom.id, normalizeSku(bom.sku_code)]));
  if (!bomIds.length) return { approvedSkus, formulaOptionsBySku };

  const { data: versions, error: versionsError } = await db
    .from("production_bom_versions")
    .select("id,bom_id,formula_code,formula_name,version_no")
    .in("bom_id", bomIds)
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("version_no", { ascending: false });

  if (versionsError) {
    throw versionsError;
  }

  (versions ?? []).forEach((version) => {
    const skuCode = skuByBomId.get(version.bom_id);
    if (skuCode) {
      approvedSkus.add(skuCode);
      if (!formulaOptionsBySku.has(skuCode)) {
        formulaOptionsBySku.set(skuCode, []);
      }
      
      const list = formulaOptionsBySku.get(skuCode);
      const code = String(version.formula_code || "DEFAULT").trim().toUpperCase();
      
      // Keep only the latest approved version for each formula code
      if (list.some((f) => f.formula_code === code)) {
        return;
      }

      list.push({
        formula_code: code,
        formula_name: String(version.formula_name || "Default BOM").trim(),
        bom_version_id: version.id,
      });
    }
  });

  return { approvedSkus, formulaOptionsBySku };
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "production-line-planning-view",
      "plan.edit_own_dept",
    ]);

    const searchParams = new URL(request.url).searchParams;
    const rawCodes = searchParams.get("iccatCodes");
    const iccatCodes = rawCodes
      ? rawCodes.split(",").map((code) => code.trim()).filter(Boolean)
      : ["04", "04-1", "04-2"];

    const db = getSupabaseAdmin();
    const { data: baseProducts, error: productsError } = await db
      .from("products_cache")
      .select("sku_code,sku_name,brand_name,uom_name,iccat_code")
      .in("iccat_code", iccatCodes)
      .eq("is_active", true)
      .order("sku_name", { ascending: true })
      .limit(2000);

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    const wipProducts = await loadMasterPlanWipProducts(db);
    const productBySku = new Map();
    [...(baseProducts ?? []), ...wipProducts].forEach((row) => {
      const skuCode = normalizeSku(row?.sku_code);
      if (!skuCode) return;
      productBySku.set(skuCode, row);
    });

    const products = Array.from(productBySku.values());
    const skuCodes = products.map((row) => normalizeSku(row.sku_code)).filter(Boolean);
    const { approvedSkus, formulaOptionsBySku } = await loadApprovedSkuSet(db, skuCodes);

    const catalog = products
      .map((row) => {
        const itemType = normalizeSku(row.iccat_code) === "03" ? "WIP" : "FG";
        const skuCode = String(row.sku_code || "").trim();
        const normalizedSku = normalizeSku(skuCode);
        return {
          skuCode,
          name: String(row.sku_name || "").trim(),
          brand: String(row.brand_name || "").trim(),
          unit: String(row.uom_name || "").trim(),
          hasBom: approvedSkus.has(normalizedSku),
          formulaOptions: formulaOptionsBySku.get(normalizedSku) || [],
          itemType,
        };
      })
      .filter((row) => row.name)
      .sort((a, b) => a.name.localeCompare(b.name, "th"));

    return NextResponse.json({ ok: true, data: catalog });
  } catch (error) {
    return jsonError(error);
  }
}
