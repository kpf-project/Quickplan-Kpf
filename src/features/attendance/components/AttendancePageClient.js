"use client";

import { useAttendancePage } from "@/features/attendance/hooks/useAttendancePage";
import PermissionGate from "@/components/PermissionGate";

function AttendancePageContent() {
  const {
    badgenumber,
    setBadgenumber,
    records,
    loading,
    errorMessage,
    pagination,
    loadAttendance,
    handleSearch,
    handleKeyDown,
    canGoNext,
  } = useAttendancePage();

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12 md:px-10">
        <header className="flex flex-col gap-4">
          <p className="text-sm uppercase tracking-[0.3em] text-[#6b5e52]">
            ระบบลงเวลา
          </p>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-[#102C57]">
              ประวัติการเข้า-ออกงาน
            </h1>
            <p className="text-sm text-[#5a534b]">
              รายการทั้งหมด: <span className="font-semibold text-[#2563EB]">{pagination.totalRecords.toLocaleString()}</span>
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-6 rounded-3xl border border-[#e2d9cf] bg-white p-6 shadow-sm">
          {/* Search Bar (Optional) */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <input
              value={badgenumber}
              onChange={(e) => setBadgenumber(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ค้นหาด้วยรหัสพนักงาน (ไม่บังคับ)"
              className="w-full rounded-xl border border-[#d8cbbf] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] md:w-80"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-xl bg-[var(--surface-navy,#102C57)] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E40AF] disabled:opacity-50"
            >
              ค้นหา
            </button>
            <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
              <button
                onClick={() => loadAttendance(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ก่อนหน้า
              </button>
              <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
                หน้า {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => loadAttendance(pagination.page + 1)}
                disabled={!canGoNext || loading}
                className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ถัดไป
              </button>
            </div>
            {loading && <span className="text-xs text-[#6b5e52] animate-pulse">กำลังโหลดข้อมูล...</span>}
          </div>

          {errorMessage && (
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">
              {errorMessage}
            </div>
          )}

          <div className="overflow-visible rounded-2xl border border-[#e6ded5]">
            <div className="table-scroll">
              <table className="w-full border-collapse text-left text-sm table-bordered">
                <thead className="bg-[var(--surface-navy,#102C57)] text-sm uppercase tracking-wider text-white text-center">
                <tr>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">วันที่</th>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">รหัสเครื่องสแกน</th>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">รหัสพนักงาน</th>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">แผนก</th>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">เวลาเข้า</th>
                  <th className="px-6 py-4 font-semibold border-b border-[#0f172a]">เวลาออก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee5db] bg-white text-[#1f3a3b]">
                {loading && records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#8b7665]">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : records.length > 0 ? (
                  records.map((record, index) => (
                    <tr key={index} className="hover:bg-[#fbf8f4]">
                      <td className="px-6 py-4 font-mono text-[#5a534b]">{record.DateStr}</td>
                      <td className="px-6 py-4 font-medium">{record.Badgenumber}</td>
                      <td className="px-6 py-4 font-mono text-sm text-[#5a534b]">{record.SSN || "-"}</td>
                      <td className="px-6 py-4">{record.Name}</td>
                      <td className="px-6 py-4">{record.DEPTNAME}</td>
                      <td className="px-6 py-4 font-mono text-green-700 font-semibold bg-green-50/50">
                        {record.CheckIn}
                      </td>
                      <td className="px-6 py-4 font-mono text-red-700 font-semibold bg-red-50/50">
                        {record.CheckIn !== record.CheckOut ? record.CheckOut : "-"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#8b7665]">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
        </div>
        </section>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <PermissionGate requireAdmin>
      <AttendancePageContent />
    </PermissionGate>
  );
}
