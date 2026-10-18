"use client";

import { memo } from "react";
import { useReportSearch } from "@/components/reporting/useReportSearch";
import ReportSearchStatus from "@/components/reporting/ReportSearchStatus";
import {
  CalendarDays,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Filter,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

/**
 * Universal Enterprise Report Filter Bar
 *
 * Designed to seamlessly blend with KPF Report Center design language:
 * - Deep navy primary `#102C57` & subtle gold `#d4af37` / `#b89025` accents
 * - Clean enterprise slate inputs with consistent 38px/40px height
 * - Flexible date handling: "range" (from - to), "single" (one date), or "none"
 * - Quick search input with instant clear button
 * - Custom slot `children` for specialized report dropdowns / pickers
 * - Standardized action buttons (Search, Reset, Print, Excel Export)
 * - Automatically hidden in A4 print view
 */
function ReportFilterBar({
  dateMode = "range", // "range" | "single" | "none"
  dateFrom = "",
  dateTo = "",
  date = "",
  dateSingle = "",
  onDateFromChange = null,
  onDateToChange = null,
  onDateChange = null,
  onDateSingleChange = null,
  dateLabel = "วันที่",
  dateFromLabel = "จากวันที่",
  dateToLabel = "ถึงวันที่",
  searchQuery = "",
  onSearchQueryChange = null,
  searchPlaceholder = "ค้นหาข้อมูล...",
  searchLabel = "ค้นหาด่วน",
  isLoading = false,
  isPrinting = false,
  isExporting = false,
  onSearch = null,
  onReset = null,
  onPrint = null,
  onExportExcel = null,
  searchButtonLabel = "ค้นหา",
  resetButtonLabel = "ล้างค่า",
  printButtonLabel = "พิมพ์ A4",
  printButtonTitle = "",
  excelButtonLabel = "Excel",
  excelButtonTitle = "",
  children = null,
  customControls = null,
  summaryStats = null,
  secondaryRow = null,
  actions = null,
  extraActions = null,
  className = "",
}) {
  const { searching, search, error } = useReportSearch(isLoading, onSearch);
  return (
    <div
      className={`report-filter-bar print:hidden mb-4 rounded-lg border border-[#dbe6f2] bg-white p-4 shadow-sm transition-all ${className}`}
      role="search"
      aria-label="แถบตัวกรองรายงาน"
      aria-busy={searching}
    >
      {/* Primary Filter Row */}
      <div className="flex flex-wrap items-end gap-3 lg:gap-4">
        {/* Date: Range Mode */}
        {dateMode === "range" && (
          <div className="flex flex-wrap sm:flex-nowrap items-end gap-2">
            <div className="w-full sm:w-auto">
              <label className="block text-[11px] font-black uppercase tracking-wider text-[#64748b] mb-1">
                {dateFromLabel}
              </label>
              <div className="relative flex h-10 items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3 focus-within:border-[#102C57] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#102C57]/10 transition">
                <CalendarRange size={16} className="text-[#94a3b8] shrink-0 mr-2" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange?.(e.target.value)}
                  className="bg-transparent text-[13px] font-semibold text-[#102C57] outline-none w-32 cursor-pointer"
                  aria-label={dateFromLabel}
                />
              </div>
            </div>

            <span className="hidden sm:inline-block pb-2.5 text-xs font-bold text-[#94a3b8]">–</span>

            <div className="w-full sm:w-auto">
              <label className="block text-[11px] font-black uppercase tracking-wider text-[#64748b] mb-1">
                {dateToLabel}
              </label>
              <div className="relative flex h-10 items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3 focus-within:border-[#102C57] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#102C57]/10 transition">
                <CalendarRange size={16} className="text-[#94a3b8] shrink-0 mr-2" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => onDateToChange?.(e.target.value)}
                  className="bg-transparent text-[13px] font-semibold text-[#102C57] outline-none w-32 cursor-pointer"
                  aria-label={dateToLabel}
                />
              </div>
            </div>
          </div>
        )}

        {/* Date: Single Mode */}
        {dateMode === "single" && (
          <div className="w-full sm:w-auto">
            <label className="block text-[11px] font-black uppercase tracking-wider text-[#64748b] mb-1">
              {dateLabel}
            </label>
            <div className="relative flex h-10 items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3 focus-within:border-[#102C57] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#102C57]/10 transition">
              <CalendarDays size={16} className="text-[#94a3b8] shrink-0 mr-2" />
              <input
                type="date"
                value={date || dateSingle}
                onChange={(e) => (onDateChange || onDateSingleChange)?.(e.target.value)}
                className="bg-transparent text-[13px] font-semibold text-[#102C57] outline-none w-36 cursor-pointer"
                aria-label={dateLabel}
              />
            </div>
          </div>
        )}

        {/* Search Query Input (Optional) */}
        {onSearchQueryChange && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-black uppercase tracking-wider text-[#64748b] mb-1">
              {searchLabel}
            </label>
            <div className="relative flex h-10 items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3 focus-within:border-[#102C57] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#102C57]/10 transition">
              <Search size={16} className="text-[#94a3b8] shrink-0 mr-2" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void search();
                  }
                }}
                className="w-full bg-transparent text-[13px] font-medium text-[#102C57] placeholder:text-[#94a3b8] outline-none"
                aria-label={searchLabel}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchQueryChange("")}
                  className="p-1 text-[#94a3b8] hover:text-[#102C57] transition shrink-0"
                  title="ล้างคำค้นหา"
                  aria-label="ล้างคำค้นหา"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Custom Filter Slot (Pickers, Dropdowns, Checkboxes) */}
        {children}
        {customControls}

        {/* Summary Stats Badges (Optional) */}
        {Array.isArray(summaryStats) && summaryStats.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {summaryStats.map((stat, idx) => (
              <div
                key={stat?.label || idx}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  stat?.highlight
                    ? "border-[#d4af37]/40 bg-[#fdfbf2] text-[#856404]"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span className="text-slate-500 mr-1.5">{stat?.label}:</span>
                <span className="font-bold">{stat?.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Core Actions */}
        <div className="ml-auto flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
          {onSearch && (
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--surface-navy,#102C57)] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#183b63] disabled:cursor-not-allowed disabled:opacity-60"
              title="ค้นหาข้อมูล"
            >
              {searching ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Filter size={14} />
              )}
              <span>{searching ? "กำลังค้นหา…" : searchButtonLabel}</span>
            </button>
          )}

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={searching}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#475569] shadow-sm transition hover:bg-[#f8fafc] hover:border-[#94a3b8] disabled:opacity-50"
              title="ล้างค่าตัวกรองทั้งหมด"
            >
              <RotateCcw size={13} />
              <span>{resetButtonLabel}</span>
            </button>
          )}

          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              disabled={isPrinting || searching}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[#102C57] bg-white px-3 text-xs font-bold text-[#102C57] shadow-sm transition hover:bg-[var(--surface-navy,#102C57)] hover:text-white disabled:cursor-wait disabled:opacity-60"
              title={printButtonTitle || "พิมพ์เอกสาร A4"}
            >
              {isPrinting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Printer size={14} />
              )}
              <span className="hidden sm:inline">{printButtonLabel}</span>
            </button>
          )}

          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              disabled={isExporting || searching}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
              title={excelButtonTitle || "ส่งออกรายงานเป็น Excel"}
            >
              {isExporting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={14} />
              )}
              <span className="hidden sm:inline">{excelButtonLabel}</span>
            </button>
          )}

          {actions}
          {extraActions}
        </div>
      </div>

      <ReportSearchStatus loading={searching} error={error} hasPrevious />

      {/* Optional Secondary Filter Row */}
      {secondaryRow && (
        <div className="mt-3 border-t border-[#f1f5f9] pt-3 animate-fadeIn">
          {secondaryRow}
        </div>
      )}
    </div>
  );
}

/**
 * Filter Item Container Helper
 */
export function ReportFilterField({ label, children, className = "" }) {
  return (
    <div className={`filter-field min-w-[140px] ${className}`}>
      {label && (
        <label className="block text-[11px] font-black uppercase tracking-wider text-[#64748b] mb-1">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

export default memo(ReportFilterBar);
