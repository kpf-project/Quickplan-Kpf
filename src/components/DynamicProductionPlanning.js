import { headers } from "next/headers";
import ProductionPlanningPageClient from "@/features/production-planning/components/ProductionPlanningPageClient";

async function buildBaseUrl() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") || "http";
  if (host) return `${protocol}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

async function fetchOptionalJson(path, fallback) {
  try {
    const headerList = await headers();
    const cookie = headerList.get("cookie") || "";
    const baseUrl = await buildBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return fallback;
    }
    return await response.json();
  } catch {
    return fallback;
  }
}

function getFirstParamValue(value) {
  if (Array.isArray(value)) {
    return value.find((item) => String(item || "").trim().length > 0) ?? "";
  }
  return value ?? "";
}

function readSearchParam(searchParams, keys = []) {
  for (const key of keys) {
    const value = getFirstParamValue(searchParams?.[key]);
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function startOfMonth(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  return `${normalized.slice(0, 7)}-01`;
}

function endOfMonth(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

export default async function DynamicProductionPlanning({
  initialView = "master",
  initialSearchParams = {},
}) {
  const isPlanOrReportView = initialView === "plan" || initialView === "report";
  const dataSource = readSearchParam(initialSearchParams, ["source", "dataSource"]).toLowerCase() === "legacy"
    ? "legacy"
    : "schedule";
  // Ponytail: Avoid blocking SSR with self-referencing HTTP loopback requests; client SWR handles fetching with instant cache.
  const shouldPreloadPlanData = false;
  const initialWorkbenchPlanNo = readSearchParam(initialSearchParams, ["planNo", "masterPlanNo"]).toUpperCase();
  const initialReportPlanNo = readSearchParam(initialSearchParams, ["reportPlanNo"]).toUpperCase();
  const initialWorkbenchQuery = readSearchParam(initialSearchParams, ["q", "query", "workbenchQuery"]);
  const initialReportQuery = readSearchParam(initialSearchParams, ["reportQ", "reportQuery"]);
  const initialWorkbenchScope =
    readSearchParam(initialSearchParams, ["scope"]).toLowerCase() === "all" ? "all" : "own";
  const todayStr = new Date().toISOString().slice(0, 10);
  const statusStart =
    normalizeDateInput(readSearchParam(initialSearchParams, ["startDate", "periodStart", "date"]))
    || todayStr;
  const statusEnd =
    normalizeDateInput(readSearchParam(initialSearchParams, ["endDate", "periodEnd"]))
    || statusStart;
  const statusQuery = new URLSearchParams();
  const statusPeriodStart = startOfMonth(statusStart);
  const statusPeriodEnd = endOfMonth(statusEnd);
  if (statusPeriodStart) statusQuery.set("periodStart", statusPeriodStart);
  if (statusPeriodEnd) statusQuery.set("periodEnd", statusPeriodEnd);
  const statusApiPath = statusQuery.size
    ? `/api/production-planning/status?${statusQuery.toString()}`
    : "/api/production-planning/status";
  const inboxQuery = new URLSearchParams();
  inboxQuery.set("scope", initialWorkbenchScope);
  const effectivePlanNo = initialWorkbenchPlanNo || initialReportPlanNo;
  const effectiveQuery = initialWorkbenchQuery || initialReportQuery;
  if (effectivePlanNo) inboxQuery.set("planNo", effectivePlanNo);
  if (effectiveQuery) inboxQuery.set("q", effectiveQuery);
  if (dataSource !== "legacy") {
    inboxQuery.set("limit", "300");
  }
  const inboxApiPath = dataSource === "legacy"
    ? `/api/production-planning/inbox?${inboxQuery.toString()}`
    : `/api/production-planning/schedule/inbox?${inboxQuery.toString()}`;

  const [initialStatusPayload, initialDepartmentsPayload, initialInboxPayload] = shouldPreloadPlanData
    ? await Promise.all([
      fetchOptionalJson(statusApiPath, { data: [], meta: null }),
      fetchOptionalJson("/api/production-planning/departments", { data: [] }),
      fetchOptionalJson(inboxApiPath, { data: [], meta: {} }),
    ])
    : [null, null, null];

  return (
    <ProductionPlanningPageClient
      initialView={initialView}
      initialSearchParams={initialSearchParams}
      initialStatusPayload={initialStatusPayload}
      initialDepartmentsPayload={initialDepartmentsPayload}
      initialInboxPayload={initialInboxPayload}
    />
  );
}
