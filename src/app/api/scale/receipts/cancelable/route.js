import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { loadScaleCancelableReceiptsData } from "@/lib/scale/receipts";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 200);
}

function normalizePage(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeProductCodes(value) {
  return String(value || "")
    .split(",")
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-scale-receipt-view");

    const { searchParams } = new URL(request.url);
    const payload = await loadScaleCancelableReceiptsData(getSupabaseAdmin(), {
      departmentId: normalizeParam(searchParams.get("departmentId")),
      limit: normalizeLimit(searchParams.get("limit"), 50),
      page: normalizePage(searchParams.get("page"), 1),
      dateFrom: normalizeParam(searchParams.get("dateFrom")),
      dateTo: normalizeParam(searchParams.get("dateTo")),
      barcode: normalizeParam(searchParams.get("barcode")),
      productCodes: normalizeProductCodes(searchParams.get("productCodes")),
      status: normalizeParam(searchParams.get("status")) || undefined,
    });

    return Response.json({
      data: payload,
    });
  } catch (error) {
    return jsonError(error);
  }
}
