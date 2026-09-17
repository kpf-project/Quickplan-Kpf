"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  ChevronDown,
  Download,
  FileSearch,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import {
  fetchProductionPrisonLotBalanceReport,
  fetchProductionPrisonMovementSummaryReport,
} from "@/features/production-line/services/productionPrisonClient";
import { useUserProfile } from "@/lib/useUserProfile";

const LIMIT_OPTIONS = [20, 50, 100];

const REPORT_CONFIG = Object.freeze({
  lot: {
    eyebrow: "รายงานเรือนจำ",
    badge: "คงเหลือ",
    title: "รายงาน Lot คงค้างเรือนจำ",
    printTitle: "รายงาน Lot คงค้างเรือนจำ",
    reportSubtitle: "Prison Lot Balance Report",
    excelWorksheetName: "รายงาน Lot คงค้างเรือนจำ",
    excelTitle: "รายงาน Lot คงค้างเรือนจำ",
    excelFilePrefix: "prison-lot-balance-report",
    emptyMessage: "ยังไม่พบ Lot คงค้างเรือนจำตามเงื่อนไขที่เลือก",
    showDate: false,
  },
  summary: {
    eyebrow: "รายงานเรือนจำ",
    badge: "สรุป",
    title: "รายงานสรุป ชั่ง-เบิก เรือนจำ",
    printTitle: "รายงานสรุป ชั่ง-เบิก เรือนจำ",
    reportSubtitle: "Prison Stock Movement Summary Report",
    excelWorksheetName: "รายงานสรุปชั่ง-เบิกเรือนจำ",
    excelTitle: "รายงานสรุปชั่ง-เบิกเรือนจำ",
    excelFilePrefix: "prison-weigh-issue-summary-report",
    emptyMessage: "ยังไม่พบข้อมูลสรุปชั่ง-เบิกเรือนจำตามเงื่อนไขที่เลือก",
    showDate: true,
  },
});

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatDateLabel(value) {
  if (!value) {
    return "-";
  }

  const [yearText, monthText, dayText] = String(value).split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!year || !month || !day) {
    return "-";
  }

  const buddhistYear = String(year + 543).slice(-2);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${buddhistYear}`;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    issueDate: String(row?.issueDate || row?.lastInboundDate || "").trim(),
    lotNo: String(row?.lotNo || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    inboundQuantity: Number(row?.inboundQuantity || 0),
    inboundWeightKg: Number(row?.inboundWeightKg || 0),
    issueQuantity: Number(row?.issueQuantity || 0),
    issueWeightKg: Number(row?.issueWeightKg || 0),
    balanceQuantity: Number(row?.balanceQuantity || 0),
    balanceWeightKg: Number(row?.balanceWeightKg || 0),
  }));
}

function normalizeSummary(summary) {
  return {
    totalCount: Number(summary?.totalCount || 0),
    inboundQuantity: Number(summary?.inboundQuantity || 0),
    inboundWeightKg: Number(summary?.inboundWeightKg || 0),
    issueQuantity: Number(summary?.issueQuantity || 0),
    issueWeightKg: Number(summary?.issueWeightKg || 0),
    balanceQuantity: Number(summary?.balanceQuantity || 0),
    balanceWeightKg: Number(summary?.balanceWeightKg || 0),
  };
}

function normalizePagination(pagination) {
  const limit = Number(pagination?.limit || 20);
  const totalCount = Number(pagination?.totalCount || 0);
  const totalPages = Number(pagination?.totalPages || 0);
  const page = Number(pagination?.page || 1);

  return {
    page: page > 0 ? page : 1,
    limit,
    totalCount,
    totalPages,
  };
}

function normalizeFilters(filters, pagination) {
  const normalizedPagination = normalizePagination(pagination);

  return {
    dateFrom: String(filters?.dateFrom || "").trim(),
    dateTo: String(filters?.dateTo || "").trim(),
    productCodes: Array.isArray(filters?.productCodes)
      ? Array.from(
          new Set(
            filters.productCodes
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          )
        )
      : [],
    limit: LIMIT_OPTIONS.includes(normalizedPagination.limit) ? normalizedPagination.limit : 20,
    page: normalizedPagination.page,
  };
}

function normalizeProductOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => ({
      code: String(option?.code || "").trim().toUpperCase(),
      name: String(option?.name || "").trim() || "-",
    }))
    .filter((option) => option.code)
    .sort((left, right) => left.code.localeCompare(right.code));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatFilenameDateRange(dateFrom, dateTo) {
  const safeFrom = String(dateFrom || "").replaceAll("-", "") || "all";
  const safeTo = String(dateTo || "").replaceAll("-", "") || safeFrom;
  return `${safeFrom}_${safeTo}`;
}

async function exportWorkbook({ rows, filters, scope, selectedProducts, config }) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(config.excelWorksheetName);
  const columns = [];

  if (config.showDate) {
    columns.push({ header: "วันที่", key: "issueDateLabel", width: 16 });
  }

  columns.push(
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "สินค้า", key: "productDisplay", width: 46 },
    { header: "จำนวนรับเข้า", key: "inboundQuantity", width: 16 },
    { header: "น้ำหนักรับเข้า (Kg)", key: "inboundWeightKg", width: 18 },
    { header: "จำนวนเบิก", key: "issueQuantity", width: 16 },
    { header: "น้ำหนักเบิก (Kg)", key: "issueWeightKg", width: 18 },
    { header: "จำนวนคงเหลือ", key: "balanceQuantity", width: 16 },
    { header: "น้ำหนักคงเหลือ (Kg)", key: "balanceWeightKg", width: 18 }
  );

  worksheet.columns = columns;
  const lastColumnLetter = String.fromCharCode(64 + columns.length);

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  worksheet.getCell("A1").value = config.excelTitle;
  worksheet.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: "FF102C57" },
  };

  worksheet.mergeCells(`A2:${lastColumnLetter}2`);
  worksheet.getCell("A2").value = `หน่วยงาน: ${scope.departmentName || "-"}`;
  worksheet.getCell("A2").font = { size: 11, color: { argb: "FF3A4A5E" } };

  worksheet.mergeCells(`A3:${lastColumnLetter}3`);
  worksheet.getCell("A3").value = `ช่วงวันที่: ${formatDateLabel(filters.dateFrom)} - ${formatDateLabel(filters.dateTo)}`;
  worksheet.getCell("A3").font = { size: 11, color: { argb: "FF3A4A5E" } };

  worksheet.mergeCells(`A4:${lastColumnLetter}4`);
  worksheet.getCell("A4").value = `สินค้า: ${
    selectedProducts.length
      ? selectedProducts.map((product) => `${product.code} ${product.name}`).join(", ")
      : "ทุกสินค้าในรายงาน"
  }`;
  worksheet.getCell("A4").font = { size: 11, color: { argb: "FF3A4A5E" } };

  const headerRow = worksheet.getRow(6);
  headerRow.values = columns.map((column) => column.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  headerRow.height = 24;

  rows.forEach((row) => {
    const payload = {};
    if (config.showDate) {
      payload.issueDateLabel = formatDateLabel(row.issueDate);
    }
    payload.lotNo = row.lotNo;
    payload.productDisplay = `${row.productCode} - ${row.productName}`;
    payload.inboundQuantity = row.inboundQuantity;
    payload.inboundWeightKg = row.inboundWeightKg;
    payload.issueQuantity = row.issueQuantity;
    payload.issueWeightKg = row.issueWeightKg;
    payload.balanceQuantity = row.balanceQuantity;
    payload.balanceWeightKg = row.balanceWeightKg;
    const dataRow = worksheet.addRow(payload);
    dataRow.font = { size: 11, color: { argb: "FF1F2937" } };
  });

  const summaryRow = worksheet.addRow({
    lotNo: "รวม",
    inboundQuantity: rows.reduce((sum, row) => sum + row.inboundQuantity, 0),
    inboundWeightKg: rows.reduce((sum, row) => sum + row.inboundWeightKg, 0),
    issueQuantity: rows.reduce((sum, row) => sum + row.issueQuantity, 0),
    issueWeightKg: rows.reduce((sum, row) => sum + row.issueWeightKg, 0),
    balanceQuantity: rows.reduce((sum, row) => sum + row.balanceQuantity, 0),
    balanceWeightKg: rows.reduce((sum, row) => sum + row.balanceWeightKg, 0),
  });
  summaryRow.font = { bold: true, color: { argb: "FF102C57" } };
  summaryRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8E7B0" },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${config.excelFilePrefix}-${formatFilenameDateRange(filters.dateFrom, filters.dateTo)}.xlsx`;
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export default function ProductionPrisonBalanceReportPageClient({
  mode,
  scope,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
}) {
  const config = REPORT_CONFIG[mode] || REPORT_CONFIG.lot;
  const useReportPaper = mode === "lot" || mode === "summary";
  const productPickerRef = useRef(null);
  const profile = useUserProfile();
  const [rows, setRows] = useState(() => normalizeRows(initialRows));
  const [summary, setSummary] = useState(() => normalizeSummary(initialSummary));
  const [filters, setFilters] = useState(() => normalizeFilters(initialFilters, initialPagination));
  const [pagination, setPagination] = useState(() => normalizePagination(initialPagination));
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const productOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );

  const selectedProducts = useMemo(
    () => productOptions.filter((product) => filters.productCodes.includes(product.code)),
    [filters.productCodes, productOptions]
  );

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const reportPeriodLabel = useMemo(() => {
    const dateFromLabel = formatDateLabel(filters.dateFrom);
    const dateToLabel = formatDateLabel(filters.dateTo);
    return filters.dateFrom === filters.dateTo
      ? dateFromLabel
      : `${dateFromLabel} - ${dateToLabel}`;
  }, [filters.dateFrom, filters.dateTo]);

  const pageSubtotal = useMemo(
    () =>
      rows.reduce(
        (accumulator, row) => ({
          inboundQuantity: accumulator.inboundQuantity + row.inboundQuantity,
          inboundWeightKg: accumulator.inboundWeightKg + row.inboundWeightKg,
          issueQuantity: accumulator.issueQuantity + row.issueQuantity,
          issueWeightKg: accumulator.issueWeightKg + row.issueWeightKg,
          balanceQuantity: accumulator.balanceQuantity + row.balanceQuantity,
          balanceWeightKg: accumulator.balanceWeightKg + row.balanceWeightKg,
        }),
        {
          inboundQuantity: 0,
          inboundWeightKg: 0,
          issueQuantity: 0,
          issueWeightKg: 0,
          balanceQuantity: 0,
          balanceWeightKg: 0,
        }
      ),
    [rows]
  );

  useEffect(() => {
    if (!isProductPickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!productPickerRef.current?.contains(event.target)) {
        setIsProductPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isProductPickerOpen]);

  const fetcher = mode === "summary"
    ? fetchProductionPrisonMovementSummaryReport
    : fetchProductionPrisonLotBalanceReport;

  const loadRows = useCallback((nextFilters) => {
    startTransition(async () => {
      const payload = await fetcher({
        dateFrom: nextFilters.dateFrom,
        dateTo: nextFilters.dateTo,
        productCodes: nextFilters.productCodes,
        page: nextFilters.page,
        limit: nextFilters.limit,
      });
      const data = payload?.data || payload;
      setRows(normalizeRows(data?.rows));
      setSummary(normalizeSummary(data?.summary));
      setPagination(normalizePagination(data?.pagination));
      setFilters((current) => ({
        ...current,
        page: nextFilters.page,
      }));
    });
  }, [fetcher]);

  return (
    <div className="weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626]">
      <div className="print:hidden">
        <WeightScalePrimaryHeader eyebrow={config.eyebrow} badge={config.badge} title={config.title} />
      </div>

      <div className="mx-auto flex max-w-[88rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative z-30 overflow-visible border-2 border-[#d4af37] bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)] print:hidden">
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                    <CalendarRange size={16} />
                    จากวันที่
                  </span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, dateFrom: event.target.value, page: 1 }))
                    }
                    className="h-12 border border-[#d7dbe3] px-4 text-[14px] font-semibold text-black outline-none transition focus:border-[#d4af37]"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                    <CalendarRange size={16} />
                    ถึงวันที่
                  </span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, dateTo: event.target.value, page: 1 }))
                    }
                    className="h-12 border border-[#d7dbe3] px-4 text-[14px] font-semibold text-black outline-none transition focus:border-[#d4af37]"
                  />
                </label>

                <div className="relative flex flex-col gap-2" ref={productPickerRef}>
                  <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                    <Package size={16} />
                    สินค้า
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsProductPickerOpen((current) => !current)}
                    className="flex h-12 items-center justify-between border border-[#d7dbe3] px-4 text-left text-[14px] font-semibold text-black transition hover:border-[#d4af37]"
                  >
                    <span className="truncate">
                      {selectedProducts.length ? `เลือกแล้ว ${selectedProducts.length} รายการ` : "ทุกสินค้าในรายงาน"}
                    </span>
                    <ChevronDown size={16} />
                  </button>

                  {isProductPickerOpen ? (
                    <div className="absolute top-full z-50 mt-1 max-h-72 w-[44rem] max-w-[calc(100vw-2rem)] overflow-y-auto border border-[#d7dbe3] bg-white shadow-[0_16px_30px_rgba(16,44,87,0.12)]">
                      {productOptions.map((product) => {
                        const checked = filters.productCodes.includes(product.code);
                        return (
                          <label
                            key={product.code}
                            className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-black hover:bg-[#fff8e7]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setFilters((current) => ({
                                  ...current,
                                  page: 1,
                                  productCodes: checked
                                    ? current.productCodes.filter((entry) => entry !== product.code)
                                    : [...current.productCodes, product.code],
                                }))
                              }
                              className="mt-0.5 h-4 w-4 border-slate-300 text-[#102C57]"
                            />
                            <span className="min-w-0 whitespace-normal break-words leading-snug">{`${product.code} - ${product.name}`}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      dateFrom: initialFilters.dateFrom,
                      dateTo: initialFilters.dateTo,
                      productCodes: [],
                      page: 1,
                      limit: 20,
                    }))
                  }
                  className="inline-flex h-12 items-center gap-2 border border-[#d7dbe3] px-4 text-sm font-bold text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fff8e7]"
                >
                  <RefreshCw size={16} />
                  รีเซ็ต
                </button>
                <button
                  type="button"
                  onClick={() => loadRows({ ...filters, page: 1 })}
                  className="inline-flex h-12 items-center gap-2 bg-[#102C57] px-4 text-sm font-bold text-white transition hover:bg-[#173b72]"
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  ค้นหา
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const payload = await fetcher({
                      dateFrom: filters.dateFrom,
                      dateTo: filters.dateTo,
                      productCodes: filters.productCodes,
                      includeAll: true,
                    });
                    const data = payload?.data || payload;
                    await exportWorkbook({
                      rows: normalizeRows(data?.rows),
                      filters,
                      scope,
                      selectedProducts,
                      config,
                    });
                  }}
                  className="inline-flex h-12 items-center gap-2 border border-[#d4af37] px-4 text-sm font-bold text-[#102C57] transition hover:bg-[#fff8e7]"
                >
                  <Download size={16} />
                  ส่งออก Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-12 items-center gap-2 border border-[#d4af37] px-4 text-sm font-bold text-[#102C57] transition hover:bg-[#fff8e7]"
                >
                  <Printer size={16} />
                  พิมพ์รายงาน
                </button>
              </div>
            </div>

            {!useReportPaper ? (
              <div className="grid gap-4 md:grid-cols-4">
                <article className="border border-[#d4af37]/30 bg-[#fff8e7] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#7a5f00]">จำนวนรายการ</p>
                  <p className="mt-2 text-3xl font-black text-[#102C57]">{summary.totalCount}</p>
                </article>
                <article className="border border-[#d4af37]/30 bg-[#fff8e7] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#7a5f00]">น้ำหนักรับเข้า</p>
                  <p className="mt-2 text-3xl font-black text-[#102C57]">{formatWeight(summary.inboundWeightKg)}</p>
                </article>
                <article className="border border-[#d4af37]/30 bg-[#fff8e7] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#7a5f00]">น้ำหนักเบิก</p>
                  <p className="mt-2 text-3xl font-black text-[#102C57]">{formatWeight(summary.issueWeightKg)}</p>
                </article>
                <article className="border border-[#d4af37]/30 bg-[#fff8e7] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#7a5f00]">น้ำหนักคงเหลือ</p>
                  <p className="mt-2 text-3xl font-black text-[#102C57]">{formatWeight(summary.balanceWeightKg)}</p>
                </article>
              </div>
            ) : null}
          </div>
        </section>

        {useReportPaper ? (
          <style dangerouslySetInnerHTML={{ __html: `
            @page {
              size: A4 landscape;
              margin: 0;
            }
            .prison-movement-summary-print-shell {
              width: 100%;
              max-width: 292mm;
              min-height: 210mm;
            }
            .prison-movement-summary-report-table {
              table-layout: fixed;
            }
            @media print {
              .prison-movement-summary-print-shell {
                width: 100% !important;
                max-width: none !important;
                min-height: auto !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                overflow: visible !important;
              }
              .prison-movement-summary-print-shell .overflow-x-auto {
                overflow: visible !important;
              }
              .prison-movement-summary-report-table {
                width: 100% !important;
                min-width: 0 !important;
                table-layout: fixed !important;
              }
              .prison-movement-summary-report-table th,
              .prison-movement-summary-report-table td {
                padding: 3px 4px !important;
                font-size: 11px !important;
              }
              .prison-movement-summary-report-table .product-cell {
                white-space: nowrap !important;
                font-size: 10.5px !important;
              }
            }
          ` }} />
        ) : null}

        <section className={`overflow-hidden bg-white ${
          useReportPaper
            ? "weight-scale-report-print-shell prison-movement-summary-print-shell mx-auto border border-[#94a3b8] shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] print:shadow-none"
            : "border-2 border-[#d4af37] shadow-[0_20px_40px_rgba(0,0,0,0.12)]"
        }`}>
          {useReportPaper ? (
            <div className="bg-white px-6 py-3 border-b border-[#94a3b8]">
              <div className="flex justify-between items-end mb-3">
                <div className="flex items-center gap-3">
                  <Image
                    src="/brand/LOGO-KPF1.png"
                    alt="KPF"
                    width={40}
                    height={40}
                    className="h-10 w-auto object-contain"
                  />
                  <div className="flex flex-col">
                    <h1 className="text-[14px] font-black text-[#102C57] leading-none uppercase">บริษัท เคพีฟู้ดส์ จำกัด</h1>
                    <p className="text-[9px] font-bold text-[#64748b] tracking-wider">K.P. foods Co.,Ltd.</p>
                  </div>
                </div>

                <div className="text-center pb-1">
                  <h2 className="text-[18px] font-black text-[#102C57] leading-none uppercase">{config.printTitle}</h2>
                  <p className="text-[9px] font-bold text-[#d4af37] uppercase tracking-[0.2em] mt-1">{config.reportSubtitle}</p>
                </div>

                <div className="text-[10px] text-[#102C57] leading-tight text-right">
                  <p suppressHydrationWarning><span className="font-black text-[#64748b] uppercase text-[8px]">วันที่พิมพ์:</span> {printedAtLabel}</p>
                  <p><span className="font-black text-[#64748b] uppercase text-[8px]">ผู้ออกรายงาน:</span> {profile.username || "System"}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 border-t border-[#94a3b8] pt-2">
                <div className="flex gap-2 items-center">
                  <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">แผนก:</span>
                  <span className="text-[11px] font-bold text-[#102C57]">{scope.departmentName || "-"}</span>
                </div>
                <div className="flex gap-2 items-center justify-center">
                  <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">ช่วงวันที่:</span>
                  <span className="text-[11px] font-bold text-[#102C57]">{reportPeriodLabel}</span>
                </div>
                <div className="flex gap-2 items-center justify-end">
                  <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">สินค้า:</span>
                  <span className="text-[11px] font-bold text-[#102C57] whitespace-nowrap">
                    {selectedProducts.length ? `เลือกแล้ว ${selectedProducts.length} รายการ` : "สินค้าทั้งหมด"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b border-[#d4af37]/30 bg-[#102C57] px-4 py-4 text-white sm:px-6 print:bg-white print:text-black">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37] print:text-black">ผลลัพธ์รายงาน</p>
              <h2 className="mt-1 text-2xl font-black tracking-[0.08em]">{config.title}</h2>
            </div>
          )}

          <div className="overflow-x-auto border border-[#c4c6cf] bg-white">
            <table className={`w-full min-w-[1080px] border-collapse text-left text-[13px] font-medium text-[#191c1d] ${
              useReportPaper ? "prison-movement-summary-report-table" : ""
            }`}>
              <colgroup>
                {config.showDate ? <col className="w-[7%]" /> : null}
                <col className={config.showDate ? "w-[42%]" : "w-[38%]"} />
                <col className={config.showDate ? "w-[12%]" : "w-[14%]"} />
                {Array.from({ length: 6 }).map((_, index) => (
                  <col key={index} className={config.showDate ? "w-[6.5%]" : "w-[8%]"} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#f1f3f5] text-[#102C57]">
                <tr>
                  {config.showDate ? (
                    <th rowSpan={2} className="border border-[#e1e3e4] bg-[#e9ecef] p-2 text-center align-middle font-black">
                      วันที่
                    </th>
                  ) : null}
                  <th rowSpan={2} className="border border-[#e1e3e4] bg-[#e9ecef] p-2 align-middle font-black">
                    สินค้า
                  </th>
                  <th rowSpan={2} className="border border-[#e1e3e4] bg-[#e9ecef] p-2 text-center align-middle font-black">
                    LOT
                  </th>
                  <th colSpan={2} className="border border-[#e1e3e4] p-2 text-center font-black">
                    รับเข้า
                  </th>
                  <th colSpan={2} className="border border-[#e1e3e4] p-2 text-center font-black">
                    เบิกออก
                  </th>
                  <th colSpan={2} className="border border-[#e1e3e4] p-2 text-center font-black">
                    คงเหลือ
                  </th>
                </tr>
                <tr className="bg-[#f8f9fa]">
                  <th className="border border-[#e1e3e4] p-1 text-center text-[10px] font-black tracking-[0.08em] text-black">จำนวน</th>
                  <th className="border border-[#e1e3e4] p-1 text-center text-[10px] font-black tracking-[0.08em] text-black">น้ำหนัก</th>
                  <th className="border border-[#e1e3e4] p-1 text-center text-[10px] font-black tracking-[0.08em] text-black">จำนวน</th>
                  <th className="border border-[#e1e3e4] p-1 text-center text-[10px] font-black tracking-[0.08em] text-black">น้ำหนัก</th>
                  <th className="border border-[#e1e3e4] p-1 text-center text-[10px] font-black tracking-[0.08em] text-black">จำนวน</th>
                  <th className="border border-[#e1e3e4] p-1 text-center text-[10px] font-black tracking-[0.08em] text-black">น้ำหนัก</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row, index) => (
                  <tr key={`${row.issueDate}-${row.lotNo}-${row.productCode}-${index}`} className="group transition-colors hover:bg-blue-50/70">
                    {config.showDate ? (
                      <td className="whitespace-nowrap border border-[#e1e3e4] p-2 text-center text-[#5f6b7b]">
                        {formatDateLabel(row.issueDate)}
                      </td>
                    ) : null}
                    <td className="product-cell whitespace-nowrap border border-[#e1e3e4] p-2 font-semibold text-black">
                      {`${row.productCode} - ${row.productName}`}
                    </td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] p-2 text-center font-bold text-[#102C57]">
                      {row.lotNo}
                    </td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] p-2 text-right font-bold text-black">{formatQuantity(row.inboundQuantity)}</td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] p-2 text-right font-bold text-black">{formatWeight(row.inboundWeightKg)}</td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] p-2 text-right text-black">{formatQuantity(row.issueQuantity)}</td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] p-2 text-right text-black">{formatWeight(row.issueWeightKg)}</td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] bg-blue-50/20 p-2 text-right font-black text-[#005eb2]">{formatQuantity(row.balanceQuantity)}</td>
                    <td className="whitespace-nowrap border border-[#e1e3e4] bg-blue-50/20 p-2 text-right font-black text-[#005eb2]">{formatWeight(row.balanceWeightKg)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={config.showDate ? 9 : 8} className="border border-[#e1e3e4] px-4 py-16 text-center text-sm font-semibold text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <FileSearch size={32} className="text-slate-300" />
                        <span>{config.emptyMessage}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length ? (
                <tfoot>
                  <tr className="bg-slate-100 text-[13px] font-black text-[#102C57]">
                    <td colSpan={config.showDate ? 3 : 2} className="border border-[#e1e3e4] p-2 text-right text-[11px] uppercase tracking-[0.12em]">
                      รวมยอดหน้านี้ (SUBTOTAL)
                    </td>
                    <td className="border border-[#e1e3e4] p-2 text-right">{formatQuantity(pageSubtotal.inboundQuantity)}</td>
                    <td className="border border-[#e1e3e4] p-2 text-right">{formatWeight(pageSubtotal.inboundWeightKg)}</td>
                    <td className="border border-[#e1e3e4] p-2 text-right">{formatQuantity(pageSubtotal.issueQuantity)}</td>
                    <td className="border border-[#e1e3e4] p-2 text-right">{formatWeight(pageSubtotal.issueWeightKg)}</td>
                    <td className="border border-[#e1e3e4] p-2 text-right">{formatQuantity(pageSubtotal.balanceQuantity)}</td>
                    <td className="border border-[#e1e3e4] p-2 text-right">{formatWeight(pageSubtotal.balanceWeightKg)}</td>
                  </tr>
                  <tr className="border-t-2 border-[#102C57] bg-[#102C57] text-[13px] font-black text-white">
                    <td colSpan={config.showDate ? 3 : 2} className="border border-[#102C57] p-3 text-right text-xs uppercase tracking-[0.18em]">
                      รวมยอดสุทธิทั้งหมด (GRAND TOTAL)
                    </td>
                    <td className="border border-[#2a4670] p-3 text-right">{formatQuantity(summary.inboundQuantity)}</td>
                    <td className="border border-[#2a4670] p-3 text-right">{formatWeight(summary.inboundWeightKg)}</td>
                    <td className="border border-[#2a4670] p-3 text-right">{formatQuantity(summary.issueQuantity)}</td>
                    <td className="border border-[#2a4670] p-3 text-right">{formatWeight(summary.issueWeightKg)}</td>
                    <td className="border border-[#2a4670] bg-[#00325f] p-3 text-right">{formatQuantity(summary.balanceQuantity)}</td>
                    <td className="border border-[#2a4670] bg-[#00325f] p-3 text-right">{formatWeight(summary.balanceWeightKg)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <p className="text-sm font-semibold text-slate-600">
              หน้า {pagination.page} จาก {pagination.totalPages || 1} | ทั้งหมด {pagination.totalCount} รายการ
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => loadRows({ ...filters, page: Math.max(1, pagination.page - 1) })}
                disabled={pagination.page <= 1 || isPending}
                className="inline-flex h-11 items-center gap-2 border border-[#d7dbe3] px-4 text-sm font-bold text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fff8e7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => loadRows({ ...filters, page: pagination.page + 1 })}
                disabled={pagination.totalPages === 0 || pagination.page >= pagination.totalPages || isPending}
                className="inline-flex h-11 items-center gap-2 bg-[#102C57] px-4 text-sm font-bold text-white transition hover:bg-[#173b72] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ถัดไป
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
