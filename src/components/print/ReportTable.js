"use client";

import { memo } from "react";
import { Loader2, Inbox } from "lucide-react";

/**
 * Universal Enterprise Report Table Component
 *
 * Implements ISO 32000-2 & W3C CSS Paged Media standards:
 * - Deep navy `#102C57` thead with crisp white text & 0.5pt vector border
 * - Alternating zebra rows (`#f8fafc`) for superior visual scanning
 * - Automatic `tabular-nums` alignment for numeric data cells
 * - Grand Total footer styling with `#102C57` accent top border
 * - W3C table-header-group support so thead repeats on multi-page A4 print
 * - `break-inside: avoid` on rows to prevent awkward page fragmentation
 * - Supports both Compound usage (children: thead/tbody/tfoot) and data-driven usage (columns/data)
 */
function ReportTable({
  columns = null,
  data = null,
  children = null,
  minWidth = "100%",
  isLoading = false,
  loadingMessage = "กำลังโหลดข้อมูล...",
  emptyMessage = "ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา",
  emptyIcon = true,
  summaryRow = null,
  className = "",
  tableClassName = "",
  wrapperClassName = "",
  ...props
}) {
  return (
    <div
      className={`report-table-scroll-container overflow-x-auto rounded-lg border border-[#cbd5e1] bg-white shadow-sm transition-all ${wrapperClassName}`}
    >
      <table
        className={`standard-enterprise-table report-table w-full border-collapse text-[13px] text-[#1e293b] ${tableClassName} ${className}`}
        style={{ minWidth }}
        {...props}
      >
        {/* If custom children are provided (Compound component mode), render them directly */}
        {children ? (
          children
        ) : (
          <>
            {/* Declarative Mode: Columns & Data */}
            {columns && (
              <thead className="bg-[#edf5fc] text-[#102C57]">
                <tr className="border-b border-[#cbd5e1]">
                  {columns.map((col, idx) => {
                    const alignClass =
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left";
                    return (
                      <th
                        key={col.key || idx}
                        style={col.width ? { width: col.width } : undefined}
                        className={`border border-[#cbd5e1] bg-[#edf5fc] px-3.5 py-2.5 font-bold tracking-wide text-[#102C57] print:border-[#94a3b8] print:bg-[#edf5fc] print:text-[#102C57] ${alignClass} ${
                          col.className || ""
                        }`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}

            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={columns?.length || 1}
                    className="py-12 text-center font-medium text-slate-500"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={18} className="animate-spin text-[#102C57]" />
                      <span>{loadingMessage}</span>
                    </div>
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns?.length || 1}
                    className="py-12 text-center font-medium text-slate-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      {emptyIcon && <Inbox size={28} className="text-slate-300" />}
                      <span>{emptyMessage}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, rowIdx) => (
                  <tr
                    key={row.id || rowIdx}
                    className="border-b border-[#cbd5e1] transition-colors odd:bg-white even:bg-[#f8fafc] hover:bg-[#f1f5f9]"
                  >
                    {columns.map((col, colIdx) => {
                      const alignClass =
                        col.align === "right"
                          ? "text-right tabular-nums font-semibold"
                          : col.align === "center"
                          ? "text-center"
                          : "text-left";
                      const val = col.render ? col.render(row, rowIdx) : row[col.key];
                      return (
                        <td
                          key={col.key || colIdx}
                          className={`border border-[#cbd5e1] px-3 py-2 ${alignClass} ${
                            col.cellClassName || ""
                          }`}
                        >
                          {val ?? "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>

            {summaryRow && (
              <tfoot>
                <tr className="border-t-2 border-[#102C57] bg-[#edf5fc] font-bold text-[#102C57]">
                  {summaryRow}
                </tr>
              </tfoot>
            )}
          </>
        )}
      </table>
    </div>
  );
}

/**
 * Enterprise Table Header Cell (Th) for Compound Usage
 */
export function ReportTh({
  children,
  align = "left",
  colSpan,
  rowSpan,
  className = "",
  style,
  ...props
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={style}
      className={`border border-[#cbd5e1] bg-[#edf5fc] px-3.5 py-2.5 font-bold tracking-wide text-[#102C57] print:border-[#94a3b8] print:bg-[#edf5fc] print:text-[#102C57] ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

/**
 * Enterprise Table Data Cell (Td) for Compound Usage
 */
export function ReportTd({
  children,
  align = "left",
  colSpan,
  rowSpan,
  className = "",
  style,
  ...props
}) {
  const alignClass =
    align === "right"
      ? "text-right tabular-nums font-medium"
      : align === "center"
      ? "text-center"
      : "text-left";
  return (
    <td
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={style}
      className={`border border-[#cbd5e1] px-3 py-2 ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

export default memo(ReportTable);
