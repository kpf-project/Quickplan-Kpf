import { headers } from "next/headers";
import Link from "next/link";
import WarehouseMaterialVerificationClient from "@/features/production-planning/components/WarehouseMaterialVerificationClient";

function normalizeDate(value) {
  const raw = String(value || "").slice(0, 10);
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

export const metadata = {
  title: "ตรวจสอบวัตถุดิบ | Production Planning",
};

export default async function WarehouseMaterialVerificationPage({ searchParams }) {
  const resolved = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const inputPlanNo = String(resolved?.masterPlanNo || resolved?.planNo || "").trim().toUpperCase();
  const headerList = await headers();
  const cookie = headerList.get("cookie") || "";
  const baseUrl = await buildBaseUrl();

  let planRows = [];
  try {
    const response = await fetch(`${baseUrl}/api/production-planning/schedule/plans`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      planRows = Array.isArray(payload?.data) ? payload.data : [];
    }
  } catch {
    planRows = [];
  }

  const planMap = new Map();
  planRows.forEach((row) => {
    const planNo = String(row?.master_plan_no || "").trim().toUpperCase();
    if (!planNo || planMap.has(planNo)) return;
    planMap.set(planNo, {
      planNo,
      periodStart: normalizeDate(row?.week_start_date),
      periodEnd: normalizeDate(row?.period_end) || normalizeDate(row?.week_start_date),
    });
  });

  const planOptions = Array.from(planMap.keys()).sort((left, right) => right.localeCompare(left));
  const effectivePlanNo = inputPlanNo || planOptions[0] || "";
  const selectedPlan = effectivePlanNo ? planMap.get(effectivePlanNo) : null;
  const dateFrom = normalizeDate(resolved?.dateFrom) || selectedPlan?.periodStart || today;
  const dateTo = normalizeDate(resolved?.dateTo) || selectedPlan?.periodEnd || addDays(dateFrom, 6);

  return (
    <main className="min-h-screen bg-[#f4f6f8]">
      <div className="border-b border-slate-200 bg-white px-4 py-2 lg:px-6">
        <Link
          href="/production-line/planning/schedule"
          className="text-xs font-bold text-[#102C57] transition hover:text-[#6b4f13]"
        >
          กลับหน้าวางแผนการผลิต
        </Link>
      </div>
      <WarehouseMaterialVerificationClient
        initialMasterPlanNo={effectivePlanNo}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        planOptions={planOptions}
      />
    </main>
  );
}
