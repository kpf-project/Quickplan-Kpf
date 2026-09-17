"use client";

import { useMemo, useState, useEffect } from "react";
import { X, Search, ZoomIn, Users, Scale, CheckCircle2 } from "lucide-react";

function formatWeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 3,
  });
}

function EmployeePhotoAvatar({ employeeCode, employeeName, onZoom }) {
  const [hasError, setHasError] = useState(false);
  const src = `/api/employees/photos/${encodeURIComponent(employeeCode)}`;

  return (
    <div
      onClick={() => onZoom?.(src, `${employeeName} (รหัส: ${employeeCode})`)}
      className="group relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-[#d4af37]/40 bg-slate-100 shadow-sm transition-all hover:border-[#102C57] hover:shadow-md"
      title="คลิกเพื่อขยายรูปพนักงาน"
    >
      {!hasError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={employeeName}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-black text-slate-400 text-base">
          {employeeCode.slice(-4)}
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <ZoomIn size={18} className="text-white drop-shadow" />
      </div>
    </div>
  );
}

export default function PieceRateEmployeeSummaryModal({
  isOpen,
  onClose,
  todayRows = [],
  onPreviewPhoto,
}) {
  const [searchTerm, setSearchTerm] = useState("");

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Aggregate by employee
  const { employeeList, totalPeople, totalTransactions, totalLineWeight } = useMemo(() => {
    const map = new Map();
    let sumWeight = 0;
    let sumTransactions = 0;

    // todayRows is newest first, so we reverse it to chronological order (1st weigh of day -> 24th)
    const chronological = [...todayRows].reverse();

    chronological.forEach((row) => {
      const code = String(row.employeeCode || "").trim();
      if (!code || code === "-") return;

      const weight = Number(row.normalizedKgAmount ?? row.inputValue ?? row.countValue ?? 0);
      sumWeight += weight;
      sumTransactions += 1;

      if (!map.has(code)) {
        map.set(code, {
          employeeCode: code,
          employeeName: row.employeeName || "-",
          departmentName: row.departmentName || "-",
          weights: [],
          totalWeight: 0,
          totalCount: 0,
        });
      }

      const emp = map.get(code);
      emp.totalCount += 1;
      emp.totalWeight += weight;
      emp.weights.push(weight);
    });

    const list = Array.from(map.values()).sort((a, b) => b.totalCount - a.totalCount);

    return {
      employeeList: list,
      totalPeople: list.length,
      totalTransactions: sumTransactions,
      totalLineWeight: sumWeight,
    };
  }, [todayRows]);

  // Filtered employees by search
  const filteredEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return employeeList;
    return employeeList.filter(
      (emp) =>
        emp.employeeName.toLowerCase().includes(term) ||
        emp.employeeCode.toLowerCase().includes(term)
    );
  }, [employeeList, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/75 p-1.5 sm:p-2 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="piece-rate-summary-title"
    >
      <div className="flex h-[calc(100dvh-12px)] w-[calc(100vw-12px)] flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-[#f8fafc] shadow-2xl sm:h-[calc(100dvh-16px)] sm:w-[calc(100vw-16px)]">
        {/* Header Bar */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102C57] text-[#f8df8a] shadow-inner">
              <Users size={22} />
            </div>
            <div>
              <h1 id="piece-rate-summary-title" className="text-base sm:text-lg font-black tracking-tight text-[#0f2747]">
                สรุปรายการชั่งรายคนประจำวัน
              </h1>
              <p className="text-[11px] font-bold tracking-wider text-[#b68a12] uppercase">
                DAILY WORKER PRODUCTION SUMMARY (TODAY)
              </p>
            </div>
          </div>

          {/* Quick Stats KPI Badges */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
              <Users size={14} className="text-[#102C57]" />
              <span>พนักงาน:</span>
              <strong className="text-[#102C57] text-sm tabular-nums">{totalPeople}</strong>
              <span>คน</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>บันทึกรวม:</span>
              <strong className="text-emerald-700 text-sm tabular-nums">{totalTransactions.toLocaleString()}</strong>
              <span>ครั้ง</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-[#d4af37]/50 bg-amber-50/70 px-3 py-1.5 text-xs font-bold text-[#8a6b0c]">
              <Scale size={14} className="text-[#b68a12]" />
              <span>ผลผลิตรวม:</span>
              <strong className="text-[#0f2747] text-sm tabular-nums">{formatWeight(totalLineWeight)}</strong>
              <span>กก./ปี๊บ</span>
            </div>
          </div>

          {/* Search Input & Close */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ หรือ รหัสพนักงาน..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-44 sm:w-60 rounded-xl border border-slate-300 bg-slate-50 pl-8 pr-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-[#102C57] focus:bg-white focus:ring-2 focus:ring-[#102C57]/10"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 cursor-pointer"
              aria-label="ปิดหน้าต่าง"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Content Body: 2 Columns Card Grid */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4">
          {filteredEmployees.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center text-slate-400">
              <Users size={48} className="stroke-[1.5] text-slate-300 mb-3" />
              <p className="font-bold text-sm text-slate-600">
                {searchTerm ? `ไม่พบข้อมูลพนักงานที่ตรงกับ "${searchTerm}"` : "ยังไม่มีรายการบันทึกของวันนี้"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                เมื่อมีการชั่งและบันทึกงาน รายการจะแสดงขึ้นมาแบบเรียลไทม์ทันที
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
              {filteredEmployees.map((emp) => {
                const weightSlots = Array.from({ length: 24 }, (_, index) => (
                  emp.weights[index] !== undefined ? emp.weights[index] : null
                ));

                return (
                  <article
                    key={emp.employeeCode}
                    className="flex flex-col sm:flex-row items-stretch gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300 hover:shadow"
                  >
                    {/* Left: Employee Info & Summary Badges */}
                    <div className="flex sm:w-64 shrink-0 items-center sm:items-start gap-3 border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 sm:pr-3">
                      <EmployeePhotoAvatar
                        employeeCode={emp.employeeCode}
                        employeeName={emp.employeeName}
                        onZoom={(src, title) => onPreviewPhoto?.({ src, title })}
                      />

                      <div className="min-w-0 flex-1">
                        <h2
                          className="whitespace-normal break-words text-sm font-black leading-tight text-[#102C57]"
                          title={emp.employeeName}
                        >
                          {emp.employeeName}
                        </h2>
                        <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                          รหัส: <span className="font-mono text-slate-700">{emp.employeeCode}</span>
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md bg-[#102C57] px-2 py-0.5 text-[10px] font-black text-[#f8df8a] shadow-xs">
                            {emp.totalCount} รายการ
                          </span>
                        </div>

                        <div className="mt-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            ยอดรวมสะสม
                          </span>
                          <strong className="text-base font-black text-[#0f2747] tabular-nums tracking-tight">
                            {formatWeight(emp.totalWeight)}
                            <small className="ml-1 text-[11px] font-bold text-slate-500">กก.</small>
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Right: 24 daily slots, fixed at 12 above and 12 below. */}
                    <div className="grid min-w-0 flex-1 grid-cols-12 content-center gap-0.5 sm:gap-1">
                      {weightSlots.map((value, index) => (
                        <div
                          key={`${emp.employeeCode}-${index}`}
                          className={`flex h-9 min-w-0 items-center justify-center rounded border text-center text-[9px] font-black tabular-nums leading-none tracking-[-0.02em] sm:h-10 sm:text-[10px] ${
                            value !== null
                              ? "border-slate-300 bg-[#f8fafc] text-[#102C57] shadow-2xs"
                              : "border-dashed border-slate-200 bg-slate-50/40 text-transparent"
                          }`}
                        >
                          {value !== null ? formatWeight(value) : "-"}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* Footer info strip */}
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2 text-[11px] font-semibold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>อัปเดตข้อมูลแบบเรียลไทม์ (Live Sync)</span>
          </div>
          <span>กดปุ่ม ESC หรือคลิกปุ่มกากบาทเพื่อปิด</span>
        </footer>
      </div>
    </div>
  );
}
