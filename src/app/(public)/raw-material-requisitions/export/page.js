import { headers } from "next/headers";
import { RequisitionHistoryConsoleClient } from "@/features/production-planning/components/RequisitionHistoryConsoleClient";

function normalizeDate(value) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function normalizeGrain(value, fallback = "weekly") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "daily") return "daily";
  if (normalized === "weekly") return "weekly";
  return fallback;
}

async function buildBaseUrl() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") || "http";
  if (host) return `${protocol}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

function createServerFetch({ baseUrl, cookie = "" }) {
  return async function fetchWithCookies(path) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to load: ${path}`);
    }
    return payload;
  };
}

async function fetchOptional(fetcher, path, fallback = { data: [] }) {
  try {
    const payload = await fetcher(path);
    return { payload, error: "" };
  } catch (error) {
    return { payload: fallback, error: String(error?.message || "") };
  }
}

export default async function RequisitionExportPage({ searchParams }) {
  const resolved = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = today;
  const defaultTo = addDays(today, 6);

  const inputPlanNo = String(resolved?.planNo || resolved?.masterPlanNo || "").trim().toUpperCase();
  const grain = normalizeGrain(resolved?.grain || resolved?.bucket || resolved?.exportMode, "weekly");
  const dateFrom = normalizeDate(resolved?.dateFrom) || defaultFrom;
  const dateTo = normalizeDate(resolved?.dateTo) || defaultTo;

  const headerList = await headers();
  const cookie = headerList.get("cookie") || "";
  const baseUrl = await buildBaseUrl();
  const fetchWithRequestContext = createServerFetch({ baseUrl, cookie });

  const masterPlanResult = await fetchOptional(
    fetchWithRequestContext,
    "/api/production-planning/master-plan-options",
    { data: [] }
  );

  const planOptions = (Array.isArray(masterPlanResult.payload?.data) ? masterPlanResult.payload.data : [])
    .map((item) => ({
      planNo: String(item?.master_plan_no || item?.planNo || "").trim().toUpperCase(),
      periodStart: item?.period_start || item?.periodStart || null,
      periodEnd: item?.period_end || item?.periodEnd || null,
      totalItems: Number(item?.total_items || item?.totalItems || 0),
    }))
    .filter((item) => item.planNo);

  const masterPlanNo = inputPlanNo || planOptions[0]?.planNo || "";

  return (
    <RequisitionHistoryConsoleClient
      masterPlanNo={masterPlanNo}
      planOptions={planOptions}
    />
  );
}

