import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { loadProductionStockIssueAvailableReceiptData } from "@/lib/production-stock-issues";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function normalizePage(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeProductCodes(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return [];
  }

  return normalizedValue
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-stock-issue-view");

    const { searchParams } = new URL(request.url);
    const payload = await loadProductionStockIssueAvailableReceiptData(getSupabaseAdmin(), {
      dateFrom: normalizeParam(searchParams.get("dateFrom")),
      dateTo: normalizeParam(searchParams.get("dateTo")),
      search: normalizeParam(searchParams.get("search")),
      productCodes: normalizeProductCodes(searchParams.get("productCodes")),
      page: normalizePage(searchParams.get("page"), 1),
      limit: normalizeLimit(searchParams.get("limit"), 50),
    });

    return Response.json({
      data: payload,
    });
  } catch (error) {
    return jsonError(error);
  }
}
