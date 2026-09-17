import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { explodeBomBatch } from "@/lib/bomExplosionRpc";

export const dynamic = "force-dynamic";

const FG_CATEGORY_CODES = ["04", "04-1", "04-2"];

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "production-line-planning-view",
      "plan.edit_own_dept",
    ]);

    const searchParams = new URL(request.url).searchParams;
    const departmentId = String(searchParams.get("departmentId") || "").trim();
    if (!departmentId) {
      return NextResponse.json({ error: "ต้องระบุ departmentId" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // 1. SKUs bound to this department (settings > department-products)
    const { data: scopeRows, error: scopeError } = await db
      .from("production_department_products")
      .select("sku_code")
      .eq("department_id", departmentId);

    if (scopeError) {
      throw scopeError;
    }

    const scopedSkus = Array.from(
      new Set((scopeRows ?? []).map((row) => String(row?.sku_code || "").trim()).filter(Boolean))
    );
    if (!scopedSkus.length) {
      return NextResponse.json({ ok: true, data: [], meta: { fgCount: 0 } });
    }

    // 2. Keep only FG SKUs
    const { data: fgProducts, error: fgError } = await db
      .from("products_cache")
      .select("sku_code")
      .in("sku_code", scopedSkus)
      .in("iccat_code", FG_CATEGORY_CODES);

    if (fgError) {
      throw fgError;
    }

    const fgSkus = Array.from(
      new Set((fgProducts ?? []).map((row) => normalizeSku(row?.sku_code)).filter(Boolean))
    );
    if (!fgSkus.length) {
      return NextResponse.json({ ok: true, data: [], meta: { fgCount: 0 } });
    }

    // 3. Explode BOMs of those FGs and keep WIP components (all levels)
    const explosionRows = await explodeBomBatch(
      db,
      fgSkus.map((skuCode) => ({ skuCode, plannedQty: 1 }))
    );

    const fgByWipSku = new Map();
    explosionRows.forEach((row) => {
      if (row.itemType !== "WIP") return;
      if (!fgByWipSku.has(row.materialSkuCode)) {
        fgByWipSku.set(row.materialSkuCode, new Set());
      }
      fgByWipSku.get(row.materialSkuCode).add(row.rootSkuCode);
    });

    const wipSkus = Array.from(fgByWipSku.keys());
    if (!wipSkus.length) {
      return NextResponse.json({ ok: true, data: [], meta: { fgCount: fgSkus.length } });
    }

    // 4. Product display data
    const { data: wipProducts, error: wipError } = await db
      .from("products_cache")
      .select("sku_code,sku_name,uom_name")
      .in("sku_code", wipSkus);

    if (wipError) {
      throw wipError;
    }

    const productBySku = new Map(
      (wipProducts ?? []).map((row) => [normalizeSku(row?.sku_code), row])
    );

    const data = wipSkus
      .map((skuCode) => {
        const product = productBySku.get(skuCode);
        return {
          skuCode: String(product?.sku_code || skuCode).trim(),
          name: String(product?.sku_name || "").trim(),
          unit: String(product?.uom_name || "").trim(),
          fgSkus: Array.from(fgByWipSku.get(skuCode) || []).sort(),
        };
      })
      .sort((a, b) => a.skuCode.localeCompare(b.skuCode));

    return NextResponse.json({ ok: true, data, meta: { fgCount: fgSkus.length } });
  } catch (error) {
    return jsonError(error);
  }
}
