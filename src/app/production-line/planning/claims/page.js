import { headers } from "next/headers";
import Link from "next/link";
import MaterialClaimsWorkspaceModernClient from "@/features/production-planning/components/MaterialClaimsWorkspaceModernClient";

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

async function fetchDepartmentLookup27Options() {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  if (!gatewayUrl) return [];

  const params = new URLSearchParams({ page: "1", pageSize: "500" });
  const response = await fetch(`${gatewayUrl}/api/department-lookup-27?${params.toString()}`, {
    headers: apiKey ? { "x-api-key": apiKey } : undefined,
    cache: "no-store",
  });
  if (!response.ok) return [];

  const payload = await response.json().catch(() => ({}));
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => ({
    code: String(row?.DEPT_CODE || "").trim().toUpperCase(),
    name: String(row?.DEPT_THAIDESC || "").trim(),
  })).filter((row) => row.code);
}

async function fetchOptional(fetcher, path, fallback = { data: [] }) {
  try {
    const payload = await fetcher(path);
    return { payload, error: "" };
  } catch (error) {
    return { payload: fallback, error: String(error?.message || "") };
  }
}

export default async function MaterialClaimsPage({ searchParams }) {
  const resolved = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = today;
  const defaultTo = addDays(today, 6);

  const inputPlanNo = String(resolved?.planNo || resolved?.masterPlanNo || "").trim().toUpperCase();
  const headerList = await headers();
  const cookie = headerList.get("cookie") || "";
  const baseUrl = await buildBaseUrl();
  const fetchWithRequestContext = createServerFetch({ baseUrl, cookie });

  const [departmentsResult, scheduleInboxResult, schedulePlansResult, lookup27Departments] = await Promise.all([
    fetchOptional(fetchWithRequestContext, "/api/production-planning/departments?scope=assigned", { data: [] }),
    fetchOptional(fetchWithRequestContext, "/api/production-planning/schedule/inbox?scope=own&limit=300", { data: [] }),
    fetchOptional(fetchWithRequestContext, "/api/production-planning/schedule/plans", { data: [] }),
    fetchDepartmentLookup27Options().catch(() => []),
  ]);

  const lookup27ByCode = new Map((Array.isArray(lookup27Departments) ? lookup27Departments : []).map((row) => [row.code, row.name || row.code]));
  const departments = (Array.isArray(departmentsResult.payload?.data) ? departmentsResult.payload.data : []).map((row) => {
    const code = String(row?.code || "").trim().toUpperCase();
    const lookupName = code ? lookup27ByCode.get(code) : null;
    return { ...row, displayName: lookupName || row?.name || code || row?.id };
  });

  const scheduleInboxRows = Array.isArray(scheduleInboxResult.payload?.data) ? scheduleInboxResult.payload.data : [];
  const schedulePlanRows = Array.isArray(schedulePlansResult.payload?.data) ? schedulePlansResult.payload.data : [];
  const planOptionMap = new Map();

  scheduleInboxRows.forEach((item) => {
    const planNo = String(item?.masterPlanNo || item?.master_plan_no || "").trim().toUpperCase();
    if (!planNo || planOptionMap.has(planNo)) return;
    planOptionMap.set(planNo, {
      planNo,
      periodStart: item?.weekStartDate || item?.week_start_date || null,
      periodEnd: item?.periodEnd || item?.period_end || item?.weekStartDate || item?.week_start_date || null,
    });
  });

  schedulePlanRows.forEach((item) => {
    const planNo = String(item?.master_plan_no || "").trim().toUpperCase();
    if (!planNo || planOptionMap.has(planNo)) return;
    planOptionMap.set(planNo, {
      planNo,
      periodStart: item?.week_start_date || null,
      periodEnd: item?.period_end || item?.week_start_date || null,
    });
  });

  if (inputPlanNo && !planOptionMap.has(inputPlanNo)) {
    planOptionMap.set(inputPlanNo, { planNo: inputPlanNo, periodStart: null, periodEnd: null });
  }

  const planOptions = Array.from(planOptionMap.values()).sort((a, b) => b.planNo.localeCompare(a.planNo));
  const masterPlanNo = inputPlanNo || planOptions[0]?.planNo || "";
  const selectedPlan = masterPlanNo ? planOptionMap.get(masterPlanNo) : null;
  const effectiveDateFrom = normalizeDate(resolved?.dateFrom) || normalizeDate(selectedPlan?.periodStart || "") || defaultFrom;
  const effectiveDateTo = normalizeDate(resolved?.dateTo) || normalizeDate(selectedPlan?.periodEnd || "") || (effectiveDateFrom ? addDays(effectiveDateFrom, 5) : defaultTo);

  const schedulePlanMap = new Map();
  scheduleInboxRows
    .filter((item) => String(item?.masterPlanNo || item?.master_plan_no || "").trim().toUpperCase() === masterPlanNo)
    .forEach((item) => {
      const deptId = String(item?.departmentId || item?.dept_id || item?.deptId || "").trim();
      if (!deptId || schedulePlanMap.has(deptId)) return;
      schedulePlanMap.set(deptId, { id: item?.planId || `${masterPlanNo}-${deptId}`, deptId });
    });

  schedulePlanRows
    .filter((item) => String(item?.master_plan_no || "").trim().toUpperCase() === masterPlanNo)
    .forEach((item) => {
      const deptId = String(item?.dept_id || item?.department_id || item?.deptId || "").trim();
      if (!deptId || schedulePlanMap.has(deptId)) return;
      schedulePlanMap.set(deptId, { id: item?.id || `${masterPlanNo}-${deptId}`, deptId });
    });

  const schedulePlans = Array.from(schedulePlanMap.values());

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] px-2 py-4 sm:px-3 lg:px-4">
      <div className="w-full space-y-4">
        <header className="rounded-2xl border border-[#102C57]/20 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-extrabold text-[#102C57]">หน้าเคลมวัตถุดิบ</h1>
              <p className="text-xs text-gray-500">เลือกเคลมแบบ checkbox และรวมกลุ่มใบเบิกตามโครงแผนหลักและแผนย่อย</p>
            </div>
            <div className="flex items-center gap-2">
              {masterPlanNo ? <span className="rounded-full bg-[#102C57]/10 px-3 py-1 text-xs font-bold text-[#102C57]">{masterPlanNo}</span> : null}
              <Link href="/production-line/planning/plan" className="rounded-lg border border-[#102C57]/30 px-3 py-1.5 text-xs font-semibold text-[#102C57] transition-colors hover:bg-[#102C57]/5">
                กลับหน้าวางแผน
              </Link>
            </div>
          </div>
        </header>

        {departmentsResult.error ? <p className="mt-2 text-[11px] text-amber-700">โหลดแผนกไม่ได้: {departmentsResult.error}</p> : null}
        <MaterialClaimsWorkspaceModernClient
          masterPlanNo={masterPlanNo}
          dateFrom={effectiveDateFrom}
          dateTo={effectiveDateTo}
          departments={departments}
          lookup27Departments={lookup27Departments}
          schedulePlans={schedulePlans}
        />
      </div>
    </main>
  );
}



