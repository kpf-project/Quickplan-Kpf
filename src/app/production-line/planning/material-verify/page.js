import { headers } from "next/headers";
import Link from "next/link";
import MaterialVerifyClient from "@/features/production-planning/components/MaterialVerifyClient";

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

export default async function MaterialVerifyPage({ searchParams }) {
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
  const planOptions = Array.from(planMap.values()).map((row) => row.planNo).sort((left, right) => right.localeCompare(left));
  const effectivePlanNo = inputPlanNo || planOptions[0] || "";
  const selectedPlan = effectivePlanNo ? planMap.get(effectivePlanNo) : null;
  const dateFrom = normalizeDate(resolved?.dateFrom) || selectedPlan?.periodStart || today;
  const dateTo = normalizeDate(resolved?.dateTo) || selectedPlan?.periodEnd || addDays(dateFrom, 6);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] px-2 py-3 sm:px-3 lg:px-4 lg:py-3">
      <div className="w-full space-y-3">
        <header className="rounded-2xl border border-[#102C57]/20 bg-white p-3 shadow-sm lg:p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-extrabold text-[#102C57]">ตรวจสอบวัตถุดิบ</h1>
              <p className="text-[11px] text-gray-500 lg:text-[10px]">
                ตรวจสอบและยืนยันปริมาณวัตถุดิบก่อนส่งต่อไปหน้าเคลม โดยดูได้ทั้งภาพรวมและแยกตามแผนกที่เกี่ยวข้อง
              </p>
            </div>
            <Link
              href="/production-line/planning"
              className="rounded-lg border border-[#102C57]/30 px-3 py-1.5 text-xs font-semibold text-[#102C57] transition-colors hover:bg-[#102C57]/5 lg:px-2.5 lg:py-1 lg:text-[11px]"
            >
              กลับหน้าวางแผน
            </Link>
          </div>
        </header>
        <MaterialVerifyClient
          initialMasterPlanNo={effectivePlanNo}
          initialDateFrom={dateFrom}
          initialDateTo={dateTo}
          planOptions={planOptions}
        />
      </div>
    </main>
  );
}


