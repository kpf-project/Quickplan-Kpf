import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { loadScaleReceiptReportData } from "@/lib/scale/receipts";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeLimit(value, fallback = 200) {
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

function normalizeTestFilter(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (["true", "1", "test"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "actual"].includes(normalizedValue)) {
    return false;
  }

  return null;
}

function normalizeItemStatusFilter(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (!normalizedValue) {
    return "confirmed";
  }

  if (["confirmed", "available", "issued", "voided"].includes(normalizedValue)) {
    return normalizedValue;
  }

  return "confirmed";
}

function normalizeRecordType(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  return ["all", "production", "return"].includes(normalizedValue) ? normalizedValue : "all";
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-scale-receipt-report");

    const { searchParams } = new URL(request.url);
    const supabaseAdmin = getSupabaseAdmin();
    const payload = await loadScaleReceiptReportData(supabaseAdmin, {
      departmentId: normalizeParam(searchParams.get("departmentId")),
      limit: normalizeLimit(searchParams.get("limit"), 50),
      page: normalizePage(searchParams.get("page"), 1),
      dateFrom: normalizeParam(searchParams.get("dateFrom")),
      dateTo: normalizeParam(searchParams.get("dateTo")),
      search: normalizeParam(searchParams.get("search")) || "",
      lotNo: normalizeParam(searchParams.get("lotNo")) || "",
      isTest: normalizeTestFilter(searchParams.get("isTest")),
      itemStatus: normalizeItemStatusFilter(searchParams.get("itemStatus")),
      productCodes: normalizeProductCodes(searchParams.get("productCodes")),
      includeAll: normalizeBooleanFlag(searchParams.get("includeAll")),
      recordType: normalizeRecordType(searchParams.get("recordType")),
    });

    return Response.json({
      data: payload,
    });
  } catch (error) {
    return jsonError(error);
  }
}
