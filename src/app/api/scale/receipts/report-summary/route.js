import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadScaleReceiptSummaryReportData } from "@/lib/scale/receipts";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCALE_RECEIPT_PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-settings-view",
  "production-line-settings-manage",
];

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

function normalizeBooleanFlag(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }

  return ["true", "1", "yes", "on"].includes(normalizedValue);
}

function normalizeProductCodes(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return [];
  }

  return normalizedValue
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeItemStatusFilter(value) {
  return String(value ?? "").trim().toLowerCase() === "voided"
    ? "voided"
    : "confirmed";
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, SCALE_RECEIPT_PERMISSION_KEYS);

    const { searchParams } = new URL(request.url);
    const supabaseAdmin = getSupabaseAdmin();
    const payload = await loadScaleReceiptSummaryReportData(supabaseAdmin, {
      departmentId: normalizeParam(searchParams.get("departmentId")),
      limit: normalizeLimit(searchParams.get("limit"), 50),
      page: normalizePage(searchParams.get("page"), 1),
      dateFrom: normalizeParam(searchParams.get("dateFrom")),
      dateTo: normalizeParam(searchParams.get("dateTo")),
      productCodes: normalizeProductCodes(searchParams.get("productCodes")),
      itemStatus: normalizeItemStatusFilter(searchParams.get("itemStatus")),
      includeAll: normalizeBooleanFlag(searchParams.get("includeAll")),
      summaryChunkSize: 20,
    });

    return Response.json({
      data: payload,
    });
  } catch (error) {
    return jsonError(error);
  }
}
