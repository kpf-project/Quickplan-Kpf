import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import {
  explodeWipDemandFromMainRows,
  loadMainPlanRowsForMasterPlan,
  loadProductsMetaBySkus,
  loadStockBySkus,
  normalizeSku,
  roundQty,
  toFiniteNumber,
} from "@/lib/wipPlanning";
import { loadPlanningScopeByUser } from "@/lib/planningScope";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const inputMasterPlanNo = String(
      searchParams.get("masterPlanNo") || searchParams.get("planNo") || ""
    )
      .trim()
      .toUpperCase();
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadPlanningScopeByUser(supabaseAdmin, request, permission);
    const mainRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);
    if (!mainRows.length) {
      return NextResponse.json({ error: "Master plan not found" }, { status: 404 });
    }

    const demandSourceRows = scope.canManageGlobal
      ? mainRows
      : mainRows.filter((row) => scope.editableSkuSet.has(normalizeSku(row?.sku_code)));
    const { wipDemandRows } = await explodeWipDemandFromMainRows(supabaseAdmin, demandSourceRows);
    if (!wipDemandRows.length) {
      return NextResponse.json(
        {
          data: [],
          meta: {
            masterPlanNo,
            note: "No WIP demand in your editable FG scope",
            demandFgScope: scope.canManageGlobal ? "all" : "editable_only",
          },
        },
        { status: 200 }
      );
    }

    const wipSkus = wipDemandRows.map((row) => row.skuCode);
    const [stockBySku, productMetaBySku] = await Promise.all([
      loadStockBySkus(request, wipSkus),
      loadProductsMetaBySkus(supabaseAdmin, wipSkus),
    ]);

    const payload = wipDemandRows.map((row) => {
      const sku = normalizeSku(row.skuCode);
      const available = toFiniteNumber(stockBySku.get(sku), 0);
      const required = roundQty(row.requiredQty);
      const gap = roundQty(required - available);
      const recommended = Math.max(0, roundQty(gap));
      const meta = productMetaBySku.get(sku);
      return {
        sku_code: sku,
        sku_name: row.skuName || meta?.sku_name || sku,
        // Show sufficiency in the product's real stock unit, not the planning batch unit.
        uom: meta?.uom_name || row.uom || "unit",
        weekly_demand_qty: required,
        available_qty: roundQty(available),
        safety_stock_qty: 0,
        gap_qty: roundQty(gap),
        recommended_production_qty: recommended,
      };
    });

    return NextResponse.json(
      {
        data: payload.sort((a, b) => a.sku_code.localeCompare(b.sku_code)),
        meta: {
          masterPlanNo,
          canManageGlobal: Boolean(scope.canManageGlobal),
          demandFgScope: scope.canManageGlobal ? "all" : "editable_only",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
