import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";
import {
  loadScaleProductsData,
  SCALE_CATEGORY_CODE,
  SCALE_DEPARTMENT_CODE,
} from "@/lib/scale/products";

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEmptyDashboardData(scope = {}) {
  return {
    scope: {
      departmentId: scope.departmentId ?? null,
      departmentCode: scope.departmentCode ?? SCALE_DEPARTMENT_CODE,
      departmentName: scope.departmentName ?? "",
      categoryCode: scope.categoryCode ?? SCALE_CATEGORY_CODE,
      productCount: scope.productCount ?? 0,
      source: scope.source ?? "fallback",
    },
    summary: {
      openingRowCount: 0,
      balanceRowCount: 0,
      openingWeightKg: 0,
      currentWeightKg: 0,
      currentQuantity: 0,
    },
    openingBalances: [],
    currentBalances: [],
  };
}

function isMissingProductionStockError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_stock_opening_balances")
    || message.includes("production_stock_movements")
    || message.includes("production_stock_balances_v")
  );
}

export async function loadProductionStockDashboardData(
  supabaseAdmin = getSupabaseAdmin()
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const departmentId = scopeData?.preset?.departmentId || null;

  if (!departmentId) {
    return buildEmptyDashboardData();
  }

  const scope = {
    departmentId,
    departmentCode: scopeData?.preset?.departmentCode || SCALE_DEPARTMENT_CODE,
    departmentName: scopeData?.preset?.departmentName || "",
    categoryCode: scopeData?.preset?.categoryCode || SCALE_CATEGORY_CODE,
    productCount: Array.isArray(scopeData?.products) ? scopeData.products.length : 0,
    source: scopeData?.source || "fallback",
  };

  const openingBalancesQuery = supabaseAdmin
    .from("production_stock_opening_balances")
    .select(
      "id,balance_date,department_code,product_code,product_name_snapshot,category_code,lot_no,uom_name,quantity,weight_kg,source,import_batch_no,remark,created_at"
    )
    .eq("department_id", departmentId)
    .eq("category_code", scope.categoryCode)
    .order("balance_date", { ascending: false })
    .order("product_code", { ascending: true })
    .limit(12);

  const balancesQuery = supabaseAdmin
    .from("production_stock_balances_v")
    .select(
      "department_code,product_code,product_name_snapshot,category_code,lot_no,opening_quantity,opening_weight_kg,receipt_quantity,receipt_weight_kg,issue_quantity,issue_weight_kg,actual_use_quantity,actual_use_weight_kg,return_quantity,return_weight_kg,adjustment_in_quantity,adjustment_in_weight_kg,adjustment_out_quantity,adjustment_out_weight_kg,current_quantity,current_weight_kg"
    )
    .eq("department_id", departmentId)
    .eq("category_code", scope.categoryCode)
    .order("product_code", { ascending: true })
    .limit(20);

  const [openingBalancesResult, currentBalancesResult] = await Promise.all([
    openingBalancesQuery,
    balancesQuery,
  ]);

  if (openingBalancesResult.error) {
    if (isMissingProductionStockError(openingBalancesResult.error)) {
      return buildEmptyDashboardData(scope);
    }

    throw new Error("Failed to load production stock opening balances");
  }

  if (currentBalancesResult.error) {
    if (isMissingProductionStockError(currentBalancesResult.error)) {
      return buildEmptyDashboardData(scope);
    }

    throw new Error("Failed to load production stock balances");
  }

  const openingBalances = (openingBalancesResult.data ?? []).map((row) => ({
    id: row.id,
    balanceDate: row.balance_date || "",
    departmentCode: String(row.department_code || "").trim(),
    productCode: String(row.product_code || "").trim().toUpperCase(),
    productName: String(row.product_name_snapshot || "").trim(),
    categoryCode: String(row.category_code || "").trim(),
    lotNo: String(row.lot_no || "").trim(),
    uomName: String(row.uom_name || "").trim(),
    quantity: normalizeNumber(row.quantity),
    weightKg: normalizeNumber(row.weight_kg),
    source: String(row.source || "").trim(),
    importBatchNo: String(row.import_batch_no || "").trim(),
    remark: String(row.remark || "").trim(),
    createdAt: row.created_at || null,
  }));

  const currentBalances = (currentBalancesResult.data ?? []).map((row) => ({
    departmentCode: String(row.department_code || "").trim(),
    productCode: String(row.product_code || "").trim().toUpperCase(),
    productName: String(row.product_name_snapshot || "").trim(),
    categoryCode: String(row.category_code || "").trim(),
    lotNo: String(row.lot_no || "").trim(),
    openingQuantity: normalizeNumber(row.opening_quantity),
    openingWeightKg: normalizeNumber(row.opening_weight_kg),
    receiptQuantity: normalizeNumber(row.receipt_quantity),
    receiptWeightKg: normalizeNumber(row.receipt_weight_kg),
    issueQuantity: normalizeNumber(row.issue_quantity),
    issueWeightKg: normalizeNumber(row.issue_weight_kg),
    actualUseQuantity: normalizeNumber(row.actual_use_quantity),
    actualUseWeightKg: normalizeNumber(row.actual_use_weight_kg),
    returnQuantity: normalizeNumber(row.return_quantity),
    returnWeightKg: normalizeNumber(row.return_weight_kg),
    adjustmentInQuantity: normalizeNumber(row.adjustment_in_quantity),
    adjustmentInWeightKg: normalizeNumber(row.adjustment_in_weight_kg),
    adjustmentOutQuantity: normalizeNumber(row.adjustment_out_quantity),
    adjustmentOutWeightKg: normalizeNumber(row.adjustment_out_weight_kg),
    currentQuantity: normalizeNumber(row.current_quantity),
    currentWeightKg: normalizeNumber(row.current_weight_kg),
  }));

  const summary = currentBalances.reduce(
    (accumulator, row) => ({
      openingRowCount: openingBalances.length,
      balanceRowCount: accumulator.balanceRowCount + 1,
      openingWeightKg: Number(
        (accumulator.openingWeightKg + row.openingWeightKg).toFixed(3)
      ),
      currentWeightKg: Number(
        (accumulator.currentWeightKg + row.currentWeightKg).toFixed(3)
      ),
      currentQuantity: Number(
        (accumulator.currentQuantity + row.currentQuantity).toFixed(3)
      ),
    }),
    {
      openingRowCount: openingBalances.length,
      balanceRowCount: 0,
      openingWeightKg: 0,
      currentWeightKg: 0,
      currentQuantity: 0,
    }
  );

  return {
    scope,
    summary,
    openingBalances,
    currentBalances,
  };
}
