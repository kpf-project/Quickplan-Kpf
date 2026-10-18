"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export default function WeightScalePaginationBar({
  page = 1,
  totalPages = 1,
  totalCount = 0,
  limit = 25,
  limitOptions = [25, 50, 100],
  onPageChange,
  onLimitChange,
  isLoading = false,
}) {
  if (totalCount === 0) {
    return null;
  }

  const safePage = Math.max(1, Math.min(page, Math.max(1, totalPages)));
  const startIndex = Math.min((safePage - 1) * limit + 1, totalCount);
  const endIndex = Math.min(safePage * limit, totalCount);

  // Generate page numbers window
  const pages = [];
  const maxButtons = 5;
  let startPage = Math.max(1, safePage - Math.floor(maxButtons / 2));
  let endPage = startPage + maxButtons - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    pages.push(p);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
      {/* Left: Record Range Summary */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">
          แสดง <strong className="font-mono text-slate-800">{startIndex}</strong> -{" "}
          <strong className="font-mono text-slate-800">{endIndex}</strong> จากทั้งหมด{" "}
          <strong className="font-mono text-slate-900">{totalCount}</strong> รายการ
        </span>
      </div>

      {/* Right: Rows per page + Page Navigation */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Limit Dropdown */}
        {limitOptions?.length > 1 && onLimitChange ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">แสดงหน้าละ:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              disabled={isLoading}
              className="rounded-sm border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 focus:border-[#001F3F] focus:outline-none"
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} แถว
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Page Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange?.(1)}
            disabled={safePage <= 1 || isLoading}
            title="หน้าแรก"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white"
          >
            <ChevronsLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => onPageChange?.(safePage - 1)}
            disabled={safePage <= 1 || isLoading}
            title="หน้าก่อนหน้า"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white"
          >
            <ChevronLeft size={13} />
          </button>

          {pages.map((p) => {
            const isActive = p === safePage;
            return (
              <button
                key={p}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onPageChange?.(p)}
                disabled={isLoading}
                className={`flex h-7 min-w-[28px] items-center justify-center rounded-sm px-1.5 font-mono text-xs font-black transition ${
                  isActive
                    ? "border border-[#001F3F] bg-[var(--surface-navy,#001F3F)] text-[#d4af37] shadow-sm"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPageChange?.(safePage + 1)}
            disabled={safePage >= totalPages || isLoading}
            title="หน้าถัดไป"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white"
          >
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => onPageChange?.(totalPages)}
            disabled={safePage >= totalPages || isLoading}
            title="หน้าสุดท้าย"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white"
          >
            <ChevronsRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
