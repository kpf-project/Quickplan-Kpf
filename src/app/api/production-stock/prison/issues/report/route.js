import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { loadProductionPrisonIssueReportData } from "@/lib/production-prison";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeLimit(value, fallback = 20) {
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
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeIssueStatuses(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return ["confirmed"];
  }

  const statuses = normalizedValue
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => ["confirmed", "voided"].includes(entry));
  return statuses.length ? statuses : ["confirmed"];
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-prison-issue-report");

    const { searchParams } = new URL(request.url);
    const payload = await loadProductionPrisonIssueReportData(getSupabaseAdmin(), {
      dateFrom: normalizeParam(searchParams.get("dateFrom")),
      dateTo: normalizeParam(searchParams.get("dateTo")),
      issueStatuses: normalizeIssueStatuses(searchParams.get("issueStatuses")),
      productCodes: normalizeProductCodes(searchParams.get("productCodes")),
      page: normalizePage(searchParams.get("page"), 1),
      limit: normalizeLimit(searchParams.get("limit"), 20),
      includeAll: normalizeBooleanFlag(searchParams.get("includeAll")),
    });

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}
