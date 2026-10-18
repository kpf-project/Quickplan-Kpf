"use client";

import Image from "next/image";
import { useMemo } from "react";
import { formatThaiPrintDateTime } from "@/lib/print/printStandards";
import { formatReportDateText } from "@/lib/print/reportDate";

/**
 * Clean, Formal & Modern Enterprise Report Header
 *
 * Designed for both high-resolution A4 vector printing (ISO 32000-2 / W3C CSS Paged Media)
 * and clean responsive on-screen web views in KPF Quickplan.
 *
 * @param {Object} props
 * @param {string} props.title - Primary Thai report title (e.g. "รายงานสรุปการเบิกจ่ายวัตถุดิบ")
 * @param {string} [props.subtitle] - English formal subtitle (e.g. "STOCK ISSUE SUMMARY REPORT")
 * @param {string} [props.docNo] - Controlled document/form number (e.g. "FM-PD-025 Rev.01")
 * @param {Array<{label: string, value: any}>|{left?: string, center?: string, right?: string}} [props.meta] - Scope/filter context ribbon
 * @param {string} [props.printedAt] - Custom formatted print timestamp (defaults to current Thai datetime)
 * @param {string} [props.printedBy="System"] - Username or issuer role
 * @param {number|string} [props.page] - Current page number
 * @param {number|string} [props.totalPages] - Total page count
 * @param {string} [props.logoSrc="/brand/LOGO-KPF1.png"] - Company logo path
 * @param {string} [props.companyNameTh="บริษัท เคพีฟู้ดส์ จำกัด"] - Formal company name (TH)
 * @param {string} [props.companyNameEn="K.P. foods Co.,Ltd."] - Company name (EN)
 * @param {"block"|"table-rows"|"thead"} [props.variant="block"] - Render format
 * @param {number} [props.colSpan=10] - Table column span (when variant is table-rows or thead)
 * @param {string} [props.className=""] - Additional class name
 */
export default function ReportHeader({
  title = "รายงานมาตรฐาน",
  subtitle = null,
  docNo = null,
  meta = null,
  printedAt = null,
  printedBy = "System",
  page = null,
  totalPages = null,
  logoSrc = "/brand/LOGO-KPF1.png",
  companyNameTh = "บริษัท เคพีฟู้ดส์ จำกัด",
  companyNameEn = "K.P. foods Co.,Ltd.",
  variant = "block",
  colSpan = 10,
  className = "",
}) {
  const timestamp = useMemo(() => {
    return formatReportDateText(printedAt || formatThaiPrintDateTime());
  }, [printedAt]);

  // Normalize meta into an array of items { label, value, key }
  const metaItems = useMemo(() => {
    if (!meta) return [];
    if (Array.isArray(meta)) {
      return meta
        .filter((item) => item && (item.label || item.value))
        .map((item, index) => ({
          key: `meta-${index}`,
          label: item.label,
          value: /วันที่|ช่วง|date/i.test(item.label || "") ? formatReportDateText(item.value ?? "-") : item.value ?? "-",
        }));
    }
    // Backward-compatible object shape { left, center, right }
    const items = [];
    if (meta.left) items.push({ key: "left", label: "", value: formatReportDateText(meta.left) });
    if (meta.center) items.push({ key: "center", label: "", value: formatReportDateText(meta.center) });
    if (meta.right) items.push({ key: "right", label: "", value: formatReportDateText(meta.right) });
    return items;
  }, [meta]);

  // Main Identity & Title Block
  const headerContent = (
    <div className="flex items-end justify-between gap-4 pb-2 border-b-2 border-[#102C57]">
      {/* Left: Brand Logo & Company Title */}
      <div className="flex items-center gap-3 text-left shrink-0">
        <Image
          src={logoSrc}
          alt="KPF"
          width={42}
          height={42}
          className="h-10 w-auto object-contain"
          priority
        />
        <div className="flex flex-col">
          <span className="text-[13.5px] font-black tracking-tight text-[#102C57] leading-none uppercase">
            {companyNameTh}
          </span>
          <span className="text-[8.5px] font-bold text-[#64748b] tracking-wider uppercase mt-1">
            {companyNameEn}
          </span>
        </div>
      </div>

      {/* Center: Document Title, Subtitle & Optional Doc No */}
      <div className="text-center flex-1 px-2">
        <h1 className="text-[17px] sm:text-[18px] font-black text-[#102C57] leading-none tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <div className="text-[8.5px] font-bold text-[#b89025] uppercase tracking-[0.22em] mt-1.5 leading-none">
            {subtitle}
          </div>
        )}
        {docNo && (
          <div className="text-[9px] font-semibold text-slate-500 mt-1 leading-none">
            เลขที่เอกสาร: <span className="font-bold text-[#102C57]">{docNo}</span>
          </div>
        )}
      </div>

      {/* Right: Audit Trail, Timestamp & Page Number */}
      <div className="text-right text-[9.5px] leading-tight text-[#102C57] shrink-0 font-medium space-y-0.5">
        <div suppressHydrationWarning>
          <span className="font-bold text-[#64748b] uppercase text-[8.5px]">วันที่พิมพ์:</span>{" "}
          <span className="font-semibold tabular-nums" suppressHydrationWarning>{timestamp}</span>
        </div>
        <div>
          <span className="font-bold text-[#64748b] uppercase text-[8.5px]">ผู้ออกรายงาน:</span>{" "}
          <span className="font-semibold">{printedBy || "System"}</span>
        </div>
        {(page != null || totalPages != null) && (
          <div>
            <span className="font-bold text-[#64748b] uppercase text-[8.5px]">หน้า:</span>{" "}
            <span className="font-bold text-[#102C57] tabular-nums">
              {page ?? 1}
              {totalPages != null ? ` / ${totalPages}` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // Secondary Context / Metadata Ribbon
  const metaRibbon = metaItems.length > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 px-2 bg-slate-50 border-b border-slate-300 text-[10px] text-[#102C57]">
      {metaItems.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          {item.label && (
            <span className="font-bold text-[#64748b] uppercase text-[9px] whitespace-nowrap">
              {item.label}:
            </span>
          )}
          <span className="font-bold text-[#102C57]">{item.value}</span>
        </div>
      ))}
    </div>
  );

  // Render variant 1: Inside HTML table (as <tr>s)
  if (variant === "table-rows") {
    return (
      <>
        <tr className={`print-report-header ${className}`}>
          <th colSpan={colSpan} className="text-left font-normal border-none p-0 bg-transparent">
            {headerContent}
          </th>
        </tr>
        {metaRibbon && (
          <tr className="print-report-meta">
            <th colSpan={colSpan} className="text-left font-normal border-none p-0 bg-transparent">
              {metaRibbon}
            </th>
          </tr>
        )}
      </>
    );
  }

  // Render variant 2: Inside <thead> element
  if (variant === "thead") {
    return (
      <thead className={`print-report-header-group ${className}`}>
        <tr className="print-report-header">
          <th colSpan={colSpan} className="text-left font-normal border-none p-0 bg-transparent">
            {headerContent}
          </th>
        </tr>
        {metaRibbon && (
          <tr className="print-report-meta">
            <th colSpan={colSpan} className="text-left font-normal border-none p-0 bg-transparent">
              {metaRibbon}
            </th>
          </tr>
        )}
      </thead>
    );
  }

  // Render variant 3 (default): Block element (header / div)
  return (
    <header className={`report-header-block w-full bg-white ${className}`}>
      {headerContent}
      {metaRibbon}
    </header>
  );
}
