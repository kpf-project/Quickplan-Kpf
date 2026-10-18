"use client";

import PermissionGate from "@/components/PermissionGate";
import { useDepartmentLookup27Page } from "@/features/department-lookup-27/hooks/useDepartmentLookup27Page";

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function DepartmentLookup27PageContent() {
  const {
    records,
    loading,
    errorMessage,
    pagination,
    searchText,
    setSearchText,
    reload,
    canGoPrevious,
    canGoNext,
    goToPage,
  } = useDepartmentLookup27Page();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f8f9fa] text-[#1e293b]">
      <div className="shrink-0 bg-gradient-to-r from-[#102C57] to-[#0f172a] text-white shadow-xl">
        <div className="mx-auto flex max-w-[95%] flex-col gap-4 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.35em] text-[#d4af37]">
                Data
              </div>
              <h1 className="mt-2 text-2xl font-bold text-white">
                ข้อมูลแผนก Lookup 27
              </h1>
              <p className="mt-1 text-sm text-white/70">
                แสดงรหัสแผนกและชื่อแผนกแบบไม่ซ้ำ ตาม LOOKUP_TYPE = 27
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Records"
                value={pagination.totalRecords.toLocaleString()}
              />
              <StatCard
                label="Page"
                value={`${pagination.page} / ${pagination.totalPages}`}
              />
              <StatCard
                label="Per Page"
                value={pagination.pageSize.toLocaleString()}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 lg:flex-row lg:items-center">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  reload();
                }
              }}
              placeholder="ค้นหารหัสแผนก หรือชื่อแผนก..."
              className="h-11 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => reload()}
                disabled={loading}
                className="h-11 rounded-xl bg-[#d4af37] px-4 text-sm font-bold text-[#102C57] transition hover:bg-[#b5952f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "กำลังโหลด..." : "รีเฟรช"}
              </button>
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, pagination.page - 1))}
                disabled={!canGoPrevious || loading}
                className="h-11 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => goToPage(pagination.page + 1)}
                disabled={!canGoNext || loading}
                className="h-11 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ถัดไป
              </button>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[95%] flex-1 overflow-y-auto pb-6">
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-navy,#102C57)] text-white">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">รหัสแผนก</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">ชื่อแผนก (ไทย)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {loading && records.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-6 py-14 text-center text-slate-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : records.length > 0 ? (
                  records.map((record, index) => (
                    <tr
                      key={`${record.DEPT_CODE || "dept"}-${record.DEPT_THAIDESC || "name"}-${index}`}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {record.DEPT_CODE || "-"}
                      </td>
                      <td className="px-4 py-3">{record.DEPT_THAIDESC || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-6 py-14 text-center text-slate-500">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 p-4 lg:hidden">
            {loading && records.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                กำลังโหลดข้อมูล...
              </div>
            ) : records.length > 0 ? (
              records.map((record, index) => (
                <div
                  key={`${record.DEPT_CODE || "dept"}-${record.DEPT_THAIDESC || "name"}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {record.DEPT_CODE || "-"}
                      </div>
                      <div className="mt-1 text-sm font-bold text-[#102C57]">
                        {record.DEPT_THAIDESC || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                ไม่พบข้อมูล
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentLookup27Page() {
  return (
    <PermissionGate permissionsAny={["admin-products", "admin-settings"]}>
      <DepartmentLookup27PageContent />
    </PermissionGate>
  );
}
