"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Factory,
  Layers3,
  Loader2,
  SearchX,
  Table2,
  X,
} from "lucide-react";
import { fetcher } from "@/lib/clientFetch";
import PlanningHeader from "./PlanningHeader";

const EmbeddedProductionSchedule = dynamic(() => import("./ProductionScheduleClient"), {
  loading: () => (
    <div className="flex min-h-36 items-center justify-center gap-2 bg-white text-sm text-zinc-500">
      <Loader2 size={16} className="animate-spin" />
      กำลังโหลดตารางแผน...
    </div>
  ),
});

const TEXT = {
  close: "ปิด",
  from: "จากวันที่",
  to: "ถึงวันที่",
  clear: "ล้างตัวกรอง",
  items: "รายการ",
  departments: "แผนก",
  masterReport: "รายงานแผนหลัก",
  pageTitle: "รายงานแผนการผลิตที่เผยแพร่แล้ว",
  pageBody: "ติดตามแผนหลักตามช่วงวันที่ ดูภาพรวมรายแผนก และเปิดรายละเอียดแผนย่อยกับวัตถุดิบรายวันได้ในหน้าเดียว",
  loading: "กำลังโหลดรายงานแผนหลัก...",
  loadingDetail: "กำลังโหลดรายละเอียดแผน...",
  failed: "โหลดรายงานแผนหลักไม่สำเร็จ",
  detailFailed: "โหลดรายละเอียดแผนไม่สำเร็จ",
  none: "ยังไม่มีแผนหลักที่เผยแพร่แล้ว",
  noneRange: "ไม่พบแผนหลักในช่วงวันที่ที่เลือก",
  details: "ดูรายละเอียด",
  hidePlan: "ซ่อนตาราง",
  showPlan: "เปิดตาราง",
};

function normalizeDateOnly(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function formatDate(dateStr) {
  const raw = normalizeDateOnly(dateStr);
  if (!raw) return "-";
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function buildRangeLabel(start, end) {
  const normalizedStart = normalizeDateOnly(start);
  const normalizedEnd = normalizeDateOnly(end) || normalizedStart;
  if (!normalizedStart) return "-";
  return normalizedStart === normalizedEnd
    ? formatDate(normalizedStart)
    : `${formatDate(normalizedStart)} - ${formatDate(normalizedEnd)}`;
}

function aggregateMasterPlans(plans = []) {
  const map = new Map();
  (Array.isArray(plans) ? plans : []).forEach((plan) => {
    const masterPlanNo = String(plan?.masterPlanNo || "").trim().toUpperCase();
    if (!masterPlanNo) return;
    const current = map.get(masterPlanNo) || {
      masterPlanNo,
      plans: [],
      periodStart: null,
      periodEnd: null,
      totalRows: 0,
    };
    const start = normalizeDateOnly(plan?.weekStartDate);
    const end = normalizeDateOnly(plan?.periodEnd) || start;
    if (start && (!current.periodStart || start < current.periodStart)) current.periodStart = start;
    if (end && (!current.periodEnd || end > current.periodEnd)) current.periodEnd = end;
    current.totalRows += Number(plan?.totalRows || 0) || 0;
    current.plans.push(plan);
    map.set(masterPlanNo, current);
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      plans: group.plans.slice().sort((left, right) => {
        const leftDept = String(left?.department?.code || left?.department?.name || "").trim();
        const rightDept = String(right?.department?.code || right?.department?.name || "").trim();
        if (leftDept !== rightDept) return leftDept.localeCompare(rightDept, "th");
        return String(left?.weekStartDate || "").localeCompare(String(right?.weekStartDate || ""));
      }),
    }))
    .sort((left, right) => String(right.periodStart || "").localeCompare(String(left.periodStart || "")));
}

function daysBetween(start, end) {
  const normalizedStart = normalizeDateOnly(start);
  const normalizedEnd = normalizeDateOnly(end) || normalizedStart;
  if (!normalizedStart || !normalizedEnd) return 0;
  const startDate = new Date(`${normalizedStart}T00:00:00.000Z`);
  const endDate = new Date(`${normalizedEnd}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

function Badge({ children, tone = "neutral" }) {
  const toneClass = {
    neutral: "border-zinc-200 bg-white text-zinc-700",
    teal: "border-teal-200 bg-teal-50 text-teal-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    dark: "border-zinc-700 bg-zinc-900 text-white",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function StatTile({ icon: Icon, label, value, note, tone = "neutral" }) {
  const iconTone = tone === "teal" ? "bg-teal-50 text-teal-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-700";
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-normal text-zinc-950">{value}</p>
        </div>
        <div className={`rounded-md p-2 ${iconTone}`}>
          <Icon size={18} />
        </div>
      </div>
      {note ? <p className="mt-2 text-xs text-zinc-500">{note}</p> : null}
    </div>
  );
}

function FieldLabel({ children, tone = "light" }) {
  return <span className={`text-xs font-semibold ${tone === "dark" ? "text-white/65" : "text-zinc-500"}`}>{children}</span>;
}

function DateFilter({ label, value, min, onChange, tone = "light" }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-44">
      <FieldLabel tone={tone}>{label}</FieldLabel>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className={`h-10 rounded-md px-3 text-sm font-semibold outline-none transition ${
          tone === "dark"
            ? "border border-white/10 bg-white text-zinc-900 focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            : "border border-zinc-200 bg-white text-zinc-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        }`}
      />
    </label>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-5 py-14 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-zinc-100 text-zinc-500">
        <SearchX size={20} />
      </div>
      <p className="mt-4 text-sm font-bold text-zinc-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-zinc-500">{body}</p>
    </div>
  );
}

function DataTable({ columns, rows, emptyText }) {
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="bg-zinc-50 text-zinc-600">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-3 py-3 font-semibold ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={row.key || rowIndex} className="hover:bg-teal-50/40">
              {columns.map((column) => (
                <td key={`${row.key || rowIndex}-${column.key}`} className={`px-3 py-3 text-zinc-800 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-zinc-500">
                {emptyText || "ไม่มีข้อมูล"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailModal({ masterPlanNo, onClose }) {
  const detailUrl = masterPlanNo
    ? `/api/production-planning/schedule/master-report-detail?masterPlanNo=${encodeURIComponent(masterPlanNo)}`
    : null;
  const { data, isLoading, error } = useSWR(detailUrl, fetcher, { revalidateOnFocus: false });
  const detail = data?.data ?? null;

  if (!masterPlanNo) return null;

  const subPlanRows = (detail?.subPlans || []).map((subPlan) => ({
    key: `${subPlan.subPlanNo}-${subPlan.departmentId}`,
    subPlanNo: subPlan.subPlanNo || "-",
    department: subPlan.departmentCode || subPlan.departmentName || "-",
    status: subPlan.status || "-",
    confirmedAt: formatDateTime(subPlan.confirmedAt),
    note: subPlan.note || "-",
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-5">
      <button type="button" aria-label={TEXT.close} className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-md border border-zinc-200 bg-stone-50 shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
        <div className="border-b border-zinc-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-teal-700">{TEXT.masterReport}</p>
              <h2 className="mt-1 font-mono text-2xl font-bold tracking-normal text-zinc-950">{masterPlanNo}</h2>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
              <X size={16} />
              {TEXT.close}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white py-14 text-sm text-zinc-500">
              <Loader2 size={16} className="animate-spin" />
              {TEXT.loadingDetail}
            </div>
          ) : null}
          {!isLoading && error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {TEXT.detailFailed}
            </div>
          ) : null}
          {!isLoading && !error && detail ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <StatTile icon={CalendarDays} label="ช่วงวันที่แผน" value={buildRangeLabel(detail.periodStart, detail.periodEnd)} tone="teal" />
                <StatTile icon={Factory} label="แผนกที่ยืนยัน" value={formatNumber(detail.departmentCount || 0, 0)} />
                <StatTile icon={Layers3} label="แผนย่อย" value={formatNumber(detail.subPlanCount || 0, 0)} />
                <StatTile icon={ClipboardList} label="วันผลิตทั้งหมด" value={formatNumber(detail.dayCount || 0, 0)} />
                <StatTile icon={Table2} label="ยืนยันล่าสุด" value={formatDateTime(detail.latestConfirmedAt)} tone="amber" />
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-zinc-950">แผนย่อยที่ยืนยัน</h3>
                    <p className="mt-1 text-sm text-zinc-500">ตรวจรายการจากแต่ละแผนก</p>
                  </div>
                  <Badge tone="teal">{formatNumber(subPlanRows.length, 0)} {TEXT.items}</Badge>
                </div>
                <DataTable
                  rows={subPlanRows}
                  columns={[
                    { key: "subPlanNo", label: "เลขแผนย่อย", render: (row) => <span className="font-mono font-bold text-zinc-950">{row.subPlanNo}</span> },
                    { key: "department", label: "แผนก" },
                    { key: "status", label: "สถานะ", align: "center", render: (row) => <Badge tone="teal">{row.status}</Badge> },
                    { key: "confirmedAt", label: "ยืนยันเมื่อ", align: "center" },
                    { key: "note", label: "หมายเหตุ" },
                  ]}
                />
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-base font-bold text-zinc-950">โครงสร้างรายวัน</h3>
                  <p className="mt-1 text-sm text-zinc-500">เห็นแผนย่อยและวัตถุดิบที่ต้องใช้แยกตามวันผลิตจริง</p>
                </div>
                {(detail.dailyRows || []).map((dayRow, index) => {
                  const subPlanItems = (dayRow.subPlanItems || []).map((item, itemIndex) => ({
                    key: `${dayRow.date}-${item.planId || item.subPlanNo || "item"}-${itemIndex}`,
                    subPlanNo: item.subPlanNo || "-",
                    departmentName: item.departmentName || "-",
                    skuCode: item.skuCode || "-",
                    plannedQty: formatNumber(item.plannedQty, 2),
                  }));
                  const materialItems = (dayRow.materialItems || []).map((material) => ({
                    key: `${dayRow.date}-${material.materialKey}`,
                    materialCode: material.goodsCode || material.skuCode || "-",
                    name: material.name || "-",
                    requiredQty: formatNumber(material.requiredQty, 2),
                    issueQty: formatNumber(material.issueQty, 2),
                  }));

                  return (
                    <details key={`detail-day-${dayRow.date}`} className="overflow-hidden rounded-md border border-zinc-200 bg-white" open={index === 0}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-zinc-50">
                        <div>
                          <p className="text-lg font-bold text-zinc-950">{formatDate(dayRow.date)}</p>
                          <p className="mt-1 text-sm text-zinc-500">
                            แผนย่อย {formatNumber(dayRow.subPlanCount || 0, 0)} รายการ · วัตถุดิบ {formatNumber(dayRow.materialCount || 0, 0)} รายการ
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(dayRow.departments || []).map((departmentCode) => <Badge key={`${dayRow.date}-${departmentCode}`}>{departmentCode}</Badge>)}
                          <Badge tone="amber">WIP / RAW</Badge>
                        </div>
                      </summary>
                      <div className="grid gap-4 border-t border-zinc-200 bg-stone-50 p-4 xl:grid-cols-2">
                        <div className="space-y-2">
                          <h4 className="text-sm font-bold text-zinc-900">แผนย่อยในวันนี้</h4>
                          <DataTable
                            rows={subPlanItems}
                            columns={[
                              { key: "subPlanNo", label: "เลขแผนย่อย", render: (row) => <span className="font-mono font-bold text-zinc-950">{row.subPlanNo}</span> },
                              { key: "departmentName", label: "แผนก" },
                              { key: "skuCode", label: "รหัสสินค้า", render: (row) => <span className="font-mono text-zinc-900">{row.skuCode}</span> },
                              { key: "plannedQty", label: "จำนวน", align: "right" },
                            ]}
                          />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-sm font-bold text-zinc-900">วัตถุดิบที่ต้องใช้ / เบิก</h4>
                          <DataTable
                            rows={materialItems}
                            columns={[
                              { key: "materialCode", label: "รหัสวัตถุดิบ", render: (row) => <span className="font-mono text-zinc-900">{row.materialCode}</span> },
                              { key: "name", label: "ชื่อวัตถุดิบ" },
                              { key: "requiredQty", label: "ต้องใช้", align: "right" },
                              { key: "issueQty", label: "เบิกจริง", align: "right", render: (row) => <span className="font-bold text-teal-700">{row.issueQty}</span> },
                            ]}
                          />
                        </div>
                      </div>
                    </details>
                  );
                })}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MasterPlanCard({ group, isExpanded, onToggle, onOpenDetail }) {
  return (
    <section className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="dark">แผนหลัก</Badge>
            <span className="font-mono text-xl font-bold tracking-normal text-zinc-950">{group.masterPlanNo}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="teal">{formatNumber(group.plans.length || 0, 0)} {TEXT.departments}</Badge>
            <Badge>{formatNumber(group.totalRows || 0, 0)} {TEXT.items}</Badge>
            <Badge tone="amber">{buildRangeLabel(group.periodStart, group.periodEnd)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpenDetail} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-bold text-white transition hover:bg-teal-800">
            <Table2 size={16} />
            {TEXT.details}
          </button>
          <button type="button" onClick={onToggle} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {isExpanded ? TEXT.hidePlan : TEXT.showPlan}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="space-y-4 border-t border-zinc-200 bg-stone-50 p-3 sm:p-4">
          {group.plans.map((plan) => {
            const departmentCode = String(plan?.department?.code || "").trim().toUpperCase();
            const departmentName = String(plan?.department?.name || "").trim();
            const dateFromValue = normalizeDateOnly(plan?.weekStartDate);
            const dateToValue = normalizeDateOnly(plan?.periodEnd) || dateFromValue;
            return (
              <div key={plan.id || `${group.masterPlanNo}-${departmentCode}`} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">
                    {departmentCode ? `${departmentCode}${departmentName ? ` - ${departmentName}` : ""}` : (departmentName || "-")}
                  </Badge>
                  <Badge>{formatNumber(plan?.totalRows || 0, 0)} {TEXT.items}</Badge>
                  <Badge tone="amber">{buildRangeLabel(dateFromValue, dateToValue)}</Badge>
                </div>
                <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                  <EmbeddedProductionSchedule
                    deptId={plan?.deptId || null}
                    masterPlanNo={plan?.masterPlanNo || null}
                    dateFrom={dateFromValue || null}
                    dateTo={dateToValue || null}
                    embedded
                    readOnly
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default function ScheduleReportClient({ initialDateFrom, initialDateTo }) {
  const [dateFrom, setDateFrom] = useState(normalizeDateOnly(initialDateFrom) || "");
  const [dateTo, setDateTo] = useState(normalizeDateOnly(initialDateTo) || "");
  const [expandedMasterPlans, setExpandedMasterPlans] = useState(() => new Set());
  const [selectedMasterPlanNo, setSelectedMasterPlanNo] = useState("");

  const inboxUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("limit", "300");
    return `/api/production-planning/schedule/inbox?${params.toString()}`;
  }, [dateFrom, dateTo]);

  const { data, isLoading, error } = useSWR(inboxUrl, fetcher, { revalidateOnFocus: false });
  const groups = useMemo(() => aggregateMasterPlans(data?.data ?? []), [data]);
  const summary = useMemo(() => groups.reduce((acc, group) => {
    acc.masterPlans += 1;
    acc.departmentPlans += Number(group.plans?.length || 0);
    acc.totalRows += Number(group.totalRows || 0);
    acc.totalDays += daysBetween(group.periodStart, group.periodEnd);
    return acc;
  }, { masterPlans: 0, departmentPlans: 0, totalRows: 0, totalDays: 0 }), [groups]);

  const toggleGroup = (masterPlanNo) => setExpandedMasterPlans((prev) => {
    const next = new Set(prev);
    if (next.has(masterPlanNo)) next.delete(masterPlanNo);
    else next.add(masterPlanNo);
    return next;
  });

  return (
    <>
      <div className="min-h-screen bg-stone-50 text-zinc-950">
        <PlanningHeader
          activeTab="schedule-report"
          title={TEXT.pageTitle}
          description={TEXT.pageBody}
          toolbar={(
            <>
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <CalendarDays size={16} className="text-[#d4af37]" />
                ช่วงวันที่รายงาน
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <DateFilter label={TEXT.from} value={dateFrom} onChange={setDateFrom} tone="dark" />
                <DateFilter label={TEXT.to} value={dateTo} min={dateFrom || undefined} onChange={setDateTo} tone="dark" />
              </div>
              {dateFrom || dateTo ? (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="mt-3 inline-flex h-9 items-center rounded-md border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  {TEXT.clear}
                </button>
              ) : null}
            </>
          )}
        >
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile icon={ClipboardList} label="เลขแผนหลัก" value={summary.masterPlans.toLocaleString("th-TH")} tone="teal" />
              <StatTile icon={Factory} label="แผนกในรายงาน" value={summary.departmentPlans.toLocaleString("th-TH")} />
              <StatTile icon={CalendarDays} label="วันในแผน" value={summary.totalDays.toLocaleString("th-TH")} tone="amber" />
              <StatTile icon={Layers3} label="รายการที่วางทั้งหมด" value={summary.totalRows.toLocaleString("th-TH")} />
            </div>
        </PlanningHeader>

        <main className="px-3 py-5 sm:px-4 sm:py-6">
          <div className="mx-auto max-w-7xl space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white py-16 text-sm text-zinc-500">
                <Loader2 size={16} className="animate-spin" />
                {TEXT.loading}
              </div>
            ) : null}
            {!isLoading && error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {TEXT.failed}
              </div>
            ) : null}
            {!isLoading && !error && groups.length === 0 ? (
              <EmptyState
                title={dateFrom || dateTo ? TEXT.noneRange : TEXT.none}
                body="ลองเปลี่ยนช่วงวันที่ หรือกลับไปเผยแพร่แผนหลักก่อนเข้าหน้านี้"
              />
            ) : null}
            {!isLoading && !error ? groups.map((group) => (
              <MasterPlanCard
                key={group.masterPlanNo}
                group={group}
                isExpanded={expandedMasterPlans.has(group.masterPlanNo)}
                onOpenDetail={() => setSelectedMasterPlanNo(group.masterPlanNo)}
                onToggle={() => toggleGroup(group.masterPlanNo)}
              />
            )) : null}
          </div>
        </main>
      </div>
      {selectedMasterPlanNo ? <DetailModal masterPlanNo={selectedMasterPlanNo} onClose={() => setSelectedMasterPlanNo("")} /> : null}
    </>
  );
}

