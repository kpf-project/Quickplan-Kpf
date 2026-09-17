"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck,
  FileSearch,
  LayoutGrid,
  ListOrdered,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Scale,
  Search,
  Truck,
  X,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { fetchProductionStockLotBalanceSummaryReport } from "@/features/production-line/services/productionStockIssueClient";
import { useUserProfile } from "@/lib/useUserProfile";

const LIMIT_OPTIONS = [20, 50, 100];

function formatWeight(value) {
  const num = Number(value || 0);
  if (num === 0) return "-";
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value) {
  const num = Number(value || 0);
  if (num === 0) return "-";
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    lotNo: String(row?.lotNo || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    balanceQuantity: Number(row?.balanceQuantity || 0),
    balanceWeightKg: Number(row?.balanceWeightKg || 0),
  }));
}

function normalizeSummary(summary) {
  return {
    totalCount: Number(summary?.totalCount || 0),
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

function sortRowsForFinalBalances(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const p = String(a.productCode || "").localeCompare(String(b.productCode || ""));
    if (p !== 0) return p;
    return String(a.lotNo || "").localeCompare(String(b.lotNo || ""));
  });
}

function calculateFinalBalanceTotals(rows) {
  const finalBalancesByLot = new Map();

  sortRowsForFinalBalances(rows).forEach((row) => {
    const balanceKey = [
      String(row.productCode || "").trim().toUpperCase(),
      String(row.lotNo || "").trim() || "-",
    ].join("|");

    finalBalancesByLot.set(balanceKey, {
      quantity: Number(row.balanceQuantity) || 0,
      weightKg: Number(row.balanceWeightKg) || 0,
    });
  });

  return Array.from(finalBalancesByLot.values()).reduce(
    (summary, balance) => ({
      quantity: summary.quantity + balance.quantity,
      weightKg: summary.weightKg + balance.weightKg,
    }),
    { quantity: 0, weightKg: 0 }
  );
}

async function exportWorkbook({ rows, scope, selectedProducts }) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("รายงานสรุปคงเหลือราย Lot (A4)");
  const columns = [
    { header: "ลำดับ", key: "sequence", width: 10 },
    { header: "รหัสสินค้า", key: "productCode", width: 16 },
    { header: "รายการสินค้า", key: "productName", width: 35 },
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "จำนวนคงเหลือ", key: "balanceQuantity", width: 16 },
    { header: "น้ำหนักคงเหลือ (Kg)", key: "balanceWeightKg", width: 18 },
  ];

  worksheet.columns = columns;
  const lastColumnLetter = String.fromCharCode(64 + columns.length);

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  worksheet.getCell("A1").value = "รายงานสรุปยอดสินค้าคงเหลือราย Lot (แนวตั้ง)";
  worksheet.getCell("A1").font = {
    size: 16,
    bold: true,
    color: { argb: "FF102C57" },
  };

  worksheet.mergeCells(`A2:${lastColumnLetter}2`);
  worksheet.getCell("A2").value = `หน่วยงาน: ${scope.departmentName || "-"}`;
  worksheet.getCell("A2").font = { size: 11, color: { argb: "FF3A4A5E" } };

  worksheet.mergeCells(`A3:${lastColumnLetter}3`);
  worksheet.getCell("A3").value = `สินค้า: ${
    selectedProducts.length
      ? selectedProducts.map((product) => `${product.code} ${product.name}`).join(", ")
      : "ทุกสินค้าในรายงาน"
  }`;
  worksheet.getCell("A3").font = { size: 11, color: { argb: "FF3A4A5E" } };

  const headerRow = worksheet.getRow(5);
  headerRow.values = columns.map((column) => column.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  headerRow.height = 24;

  const sorted = sortRowsForFinalBalances(rows);
  let currentProductCode = "";
  let subtotalQty = 0;
  let subtotalWeight = 0;
  let currentProductName = "";
  let rowSeq = 1;

  sorted.forEach((row) => {
    if (currentProductCode && row.productCode !== currentProductCode) {
      const subtotalRow = worksheet.addRow({
        sequence: "",
        productCode: "",
        productName: `รวม (${currentProductCode}) - ${currentProductName}`,
        lotNo: "",
        balanceQuantity: subtotalQty,
        balanceWeightKg: subtotalWeight,
      });
      subtotalRow.font = { bold: true, italic: true };
      subtotalRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };

      subtotalQty = 0;
      subtotalWeight = 0;
    }

    worksheet.addRow({
      sequence: rowSeq++,
      productCode: row.productCode,
      productName: row.productName,
      lotNo: row.lotNo,
      balanceQuantity: row.balanceQuantity,
      balanceWeightKg: row.balanceWeightKg,
    });

    currentProductCode = row.productCode;
    currentProductName = row.productName;
    subtotalQty += Number(row.balanceQuantity) || 0;
    subtotalWeight += Number(row.balanceWeightKg) || 0;
  });

  if (currentProductCode) {
    const subtotalRow = worksheet.addRow({
      sequence: "",
      productCode: "",
      productName: `รวม (${currentProductCode}) - ${currentProductName}`,
      lotNo: "",
      balanceQuantity: subtotalQty,
      balanceWeightKg: subtotalWeight,
    });
    subtotalRow.font = { bold: true, italic: true };
    subtotalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
  }

  const finalBalance = calculateFinalBalanceTotals(rows);
  const summaryRow = worksheet.addRow({
    sequence: "",
    productCode: "",
    productName: "รวมทั้งสิ้น (Grand Total)",
    lotNo: "",
    balanceQuantity: finalBalance.quantity,
    balanceWeightKg: finalBalance.weightKg,
  });
  summaryRow.font = { bold: true, color: { argb: "FF102C57" } };
  summaryRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8E7B0" },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `production-stock-lot-balance-simple-${Date.now()}.xlsx`;
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export default function ProductionStockLotBalanceReportPageClient({
  scope,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
}) {
  const productPickerRef = useRef(null);
  const [rows, setRows] = useState(() => normalizeRows(initialRows));
  const [summary, setSummary] = useState(() => normalizeSummary(initialSummary));
  const [filters, setFilters] = useState(() => normalizeFilters(initialFilters, initialPagination));
  const [pagination, setPagination] = useState(() => normalizePagination(initialPagination));
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [currentViewPage, setCurrentViewPage] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [hideZeroBalances, setHideZeroBalances] = useState(true);

  const displayedRows = useMemo(() => {
    if (hideZeroBalances) {
      return rows.filter((row) => Number(row.balanceQuantity) !== 0 || Number(row.balanceWeightKg) !== 0);
    }
    return rows;
  }, [rows, hideZeroBalances]);

  const displayedSummary = useMemo(() => {
    const finalBalance = calculateFinalBalanceTotals(displayedRows);
    return {
      balanceQuantity: finalBalance.quantity,
      balanceWeightKg: finalBalance.weightKg,
      totalCount: displayedRows.length,
    };
  }, [displayedRows]);

  const profile = useUserProfile();

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const flatVirtualPrintRows = useMemo(() => {
    if (!displayedRows.length) return [];

    const sortedRows = sortRowsForFinalBalances(displayedRows);
    const virtualRows = [];
    let currentProductKey = "";
    let productSubtotal = null;

    sortedRows.forEach((row, index) => {
      const nextProductKey = String(row.productCode || "").trim();

      if (nextProductKey !== currentProductKey) {
        if (currentProductKey !== "" && productSubtotal) {
          virtualRows.push({ type: "product-subtotal", data: { ...productSubtotal } });
        }
        productSubtotal = {
          productCode: row.productCode,
          productName: row.productName,
          lotNo: "รวมยอดสินค้า",
          balanceQuantity: 0,
          balanceWeightKg: 0,
        };
      }

      virtualRows.push({ type: "item", data: { ...row, sequence: index + 1 } });

      if (productSubtotal) {
        productSubtotal.balanceQuantity += Number(row.balanceQuantity) || 0;
        productSubtotal.balanceWeightKg += Number(row.balanceWeightKg) || 0;
      }

      currentProductKey = nextProductKey;
    });

    if (productSubtotal) {
      virtualRows.push({ type: "product-subtotal", data: { ...productSubtotal } });
    }

    return virtualRows;
  }, [displayedRows]);

  const reportPages = useMemo(() => {
    if (!displayedRows.length) return [];

    const sortedRows = sortRowsForFinalBalances(displayedRows);
    const pageUnits = [];
    let currentProductKey = "";
    let productSubtotal = null;

    sortedRows.forEach((row, index) => {
      const nextProductKey = String(row.productCode || "").trim();
      const unitRows = [];

      if (nextProductKey !== currentProductKey) {
        if (currentProductKey !== "" && productSubtotal) {
          pageUnits.push({
            rows: [{ type: "product-subtotal", data: { ...productSubtotal } }],
            weight: 1.5,
          });
        }
        productSubtotal = {
          productCode: row.productCode,
          productName: row.productName,
          lotNo: "รวมยอดสินค้า",
          balanceQuantity: 0,
          balanceWeightKg: 0,
        };
      }

      unitRows.push({ type: "item", data: { ...row, sequence: index + 1 } });

      if (productSubtotal) {
        productSubtotal.balanceQuantity += Number(row.balanceQuantity) || 0;
        productSubtotal.balanceWeightKg += Number(row.balanceWeightKg) || 0;
      }

      currentProductKey = nextProductKey;

      pageUnits.push({
        rows: unitRows,
        weight: 1,
      });
    });

    if (productSubtotal) {
      pageUnits.push({
        rows: [{ type: "product-subtotal", data: { ...productSubtotal } }],
        weight: 1.5,
      });
    }

    const pages = [];
    let currentPage = [];
    let currentWeight = 0;
    const maxPageWeight = 34; // fit ~34 rows per A4 portrait page

    pageUnits.forEach((unit) => {
      if (currentWeight + unit.weight > maxPageWeight && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentWeight = 0;
      }
      currentPage.push(...unit.rows);
      currentWeight += unit.weight;
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  }, [displayedRows]);

  const productOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );

  const selectedProducts = useMemo(
    () => productOptions.filter((product) => filters.productCodes.includes(product.code)),
    [filters.productCodes, productOptions]
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

  const loadRows = useCallback((nextFilters) => {
    startTransition(async () => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams();
        if (Array.isArray(nextFilters.productCodes)) {
          nextFilters.productCodes.forEach((code) => params.append("productCodes", code));
        }
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
      }

      const payload = await fetchProductionStockLotBalanceSummaryReport({
        productCodes: nextFilters.productCodes,
        includeAll: true,
        page: 1,
        limit: 1000,
      });

      setRows(normalizeRows(payload?.rows));
      setSummary(normalizeSummary(payload?.summary));
      setPagination(normalizePagination(payload?.pagination));
      setCurrentViewPage(0);
      setFilters((current) => ({
        ...current,
        page: 1,
      }));
    });
  }, [startTransition]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRows(normalizeRows(initialRows));
    setSummary(normalizeSummary(initialSummary));
    setFilters(normalizeFilters(initialFilters, initialPagination));
    setPagination(normalizePagination(initialPagination));
    setCurrentViewPage(0);
  }, [initialRows, initialSummary, initialFilters, initialPagination]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626]">
      <div className="weight-scale-report-screen-only">
        <WeightScalePrimaryHeader
          eyebrow="รายงานสต็อกคงเหลือ"
          badge="คงเหลือราย Lot แนวตั้ง"
          title="รายงานสรุปคงเหลือราย Lot (แนวตั้ง)"
        />

        <div className="mx-auto flex w-full max-w-none flex-col gap-8 px-3 py-8 sm:px-4 lg:px-6 2xl:px-8">
          <section className="overflow-visible border-2 border-[#d4af37] bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]">
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="grid flex-1 gap-4 md:grid-cols-3">
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
                      <div className="absolute top-full z-50 mt-1 max-h-72 w-[44rem] max-w-[calc(100vw-2rem)] overflow-auto border border-[#d7dbe3] bg-white shadow-[0_16px_30px_rgba(16,44,87,0.12)]">
                        {productOptions.map((product) => {
                          const checked = filters.productCodes.includes(product.code);
                          return (
                            <label
                              key={product.code}
                              className="flex min-w-max cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-black hover:bg-[#fff8e7]"
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
                                className="h-4 w-4 shrink-0 border-slate-300 text-[#102C57]"
                              />
                              <span className="whitespace-nowrap">{`${product.code} - ${product.name}`}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                      <Scale size={16} />
                      ยอดคงเหลือ
                    </span>
                    <label className="flex h-12 cursor-pointer items-center gap-3 border border-[#d7dbe3] px-4 text-left text-[14px] font-semibold text-black transition hover:border-[#d4af37] bg-white select-none">
                      <input
                        type="checkbox"
                        checked={hideZeroBalances}
                        onChange={(e) => setHideZeroBalances(e.target.checked)}
                        className="h-4 w-4 rounded border-[#d7dbe3] text-[#102C57] focus:ring-[#102C57]"
                      />
                      <span>ซ่อนยอดคงเหลือที่เป็น 0</span>
                    </label>
                  </div>

                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFilters((current) => ({
                          ...current,
                          productCodes: [],
                          page: 1,
                          limit: 20,
                        }));
                        setHideZeroBalances(true);
                      }}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 border border-[#d7dbe3] px-4 text-sm font-bold text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fff8e7]"
                    >
                      <RefreshCw size={16} />
                      รีเซ็ต
                    </button>
                    <button
                      type="button"
                      onClick={() => loadRows({ ...filters, page: 1 })}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#102C57] px-4 text-sm font-bold text-white transition hover:bg-[#173b72]"
                    >
                      {isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      ค้นหา
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#e2e8f0] pb-6">
              <div className="flex flex-wrap items-center gap-2.5">
                {reportPages.length > 0 ? (
                  <span className="inline-flex h-7 items-center bg-[#f1f5f9] px-2.5 text-xs font-bold text-[#475569]">
                    ทั้งหมด {reportPages.length} หน้า
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/production-line/stock/balance?${new URLSearchParams(
                    filters.productCodes.map((code) => ["productCodes", code])
                  ).toString()}`}
                  className="inline-flex h-10 items-center justify-center gap-2 border border-[#cbd5e1] px-4 text-xs font-bold text-[#475569] transition hover:bg-slate-50"
                >
                  <ChevronLeft size={14} />
                  กลับหน้าสรุปเดิม
                </a>
                <button
                  type="button"
                  onClick={() => exportWorkbook({ rows: displayedRows, scope, selectedProducts })}
                  disabled={!displayedRows.length}
                  className="inline-flex h-10 items-center justify-center gap-2 border border-[#d7dbe3] px-4 text-xs font-bold text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fff8e7] disabled:opacity-40"
                >
                  <Download size={14} />
                  ส่งออก Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={!displayedRows.length}
                  className="inline-flex h-10 items-center justify-center gap-2 bg-[#102C57] px-4 text-xs font-bold text-white transition hover:bg-[#173b72] disabled:opacity-40"
                >
                  <Printer size={14} />
                  พิมพ์รายงาน (A4)
                </button>
              </div>
            </div>

            {reportPages.length > 1 ? (
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-4">
                <span className="text-xs font-bold text-[#64748b]">
                  กำลังแสดงตัวอย่างหน้า {currentViewPage + 1} จาก {reportPages.length}
                </span>
                <div className="inline-flex gap-1">
                  <button
                    type="button"
                    disabled={currentViewPage <= 0}
                    onClick={() => setCurrentViewPage((c) => Math.max(0, c - 1))}
                    className="flex h-8 w-8 items-center justify-center border border-[#d7dbe3] bg-white text-black transition hover:bg-[#fff8e7] disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={currentViewPage >= reportPages.length - 1}
                    onClick={() => setCurrentViewPage((c) => Math.min(reportPages.length - 1, c + 1))}
                    className="flex h-8 w-8 items-center justify-center border border-[#d7dbe3] bg-white text-black transition hover:bg-[#fff8e7] disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="overflow-auto py-6 sm:px-4">
              {reportPages[currentViewPage] ? (
                <div className="lot-balance-portrait-print-shell mx-auto w-[210mm] min-h-[297mm] bg-white p-[16px] shadow-[0_4px_12px_rgba(0,0,0,0.15)] relative">
                  <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-start border-b-2 border-black pb-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Image
                          src="/brand/LOGO-KPF1.png"
                          alt="KPF Logo"
                          width={48}
                          height={48}
                          priority
                          className="h-12 w-12 object-contain"
                        />
                        <div className="leading-tight">
                          <p className="text-[12px] font-black text-black">บริษัท เคพีฟู้ดส์ จำกัด</p>
                          <p className="text-[9px] font-semibold text-[#475569]">K.P. foods Co.,Ltd.</p>
                        </div>
                      </div>
                      <h2 className="lot-balance-report-title self-center px-4 text-center text-[14px] font-black text-black">
                        รายงานสรุปยอดคงเหลือสินค้าแยกตาม Lot
                      </h2>
                      <div className="justify-self-end text-right text-[10px] text-[#475569]">
                        <p><span className="font-bold">หน่วยงาน:</span> {scope.departmentName || "-"}</p>
                        <p><span className="font-bold">วันที่พิมพ์:</span> {printedAtLabel}</p>
                        <p><span className="font-bold">ผู้พิมพ์:</span> {profile.username || "-"}</p>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="lot-balance-portrait-report-table min-w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-[8%]" />
                        <col className="w-[18%]" />
                        <col className="w-[36%]" />
                        <col className="w-[18%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead>
                        <tr className="table-header">
                          <th className="text-center font-bold">#</th>
                          <th className="text-left font-bold">รหัสสินค้า</th>
                          <th className="text-left font-bold">รายการสินค้า</th>
                          <th className="text-center font-bold">LOT</th>
                          <th className="text-center font-bold">จำนวน</th>
                          <th className="text-center font-bold">น้ำหนัก (กก.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportPages[currentViewPage].map((vRow, idx) => {
                          if (vRow.type === "product-subtotal") {
                            const row = vRow.data;
                            return (
                              <tr key={idx} className="subtotal-row text-[11px] font-bold">
                                <td colSpan={4} className="p-2 text-right italic">
                                  รวม ({row.productCode}) - {row.productName}
                                </td>
                                <td className="p-2 text-center">{formatQuantity(row.balanceQuantity)}</td>
                                <td className="p-2 text-center">{formatWeight(row.balanceWeightKg)}</td>
                              </tr>
                            );
                          }

                          const row = vRow.data;
                          return (
                            <tr key={idx} className="zebra-row text-[11px] font-normal">
                              <td className="p-2 text-center">{row.sequence}</td>
                              <td className="p-2 text-left">{row.productCode}</td>
                              <td className="p-2 text-left truncate">{row.productName}</td>
                              <td className="p-2 text-center">{row.lotNo}</td>
                              <td className="p-2 text-center">{formatQuantity(row.balanceQuantity)}</td>
                              <td className="p-2 text-center">{formatWeight(row.balanceWeightKg)}</td>
                            </tr>
                          );
                        })}
                        {currentViewPage === reportPages.length - 1 ? (
                          <tr className="grand-total-row text-[12px] font-bold">
                            <td colSpan={4} className="p-2 text-right font-bold">
                              รวมทั้งสิ้น (Grand Total)
                            </td>
                            <td className="p-2 text-center font-bold">{formatQuantity(displayedSummary.balanceQuantity)}</td>
                            <td className="p-2 text-center font-bold">{formatWeight(displayedSummary.balanceWeightKg)}</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>

                    {/* Footer */}
                    <div className="absolute bottom-[16px] left-[16px] right-[16px] flex items-center justify-between border-t border-[#cbd5e1] pt-2 text-[9px] text-[#64748b]">
                      <span>KPF Production Inventory Control System</span>
                      <span>หน้า {currentViewPage + 1} จาก {reportPages.length}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-[210mm] min-h-[200px] bg-white flex items-center justify-center p-6 shadow">
                  <span className="text-sm font-semibold text-[#64748b]">ไม่พบข้อมูลสรุปยอดคงเหลือราย Lot</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Printable Area */}
      <div className="lot-balance-portrait-print-shell weight-scale-report-print-only hidden print:block">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          @page {
            size: A4 portrait;
            margin: 8mm 6mm;
          }
          .daily-summary-print-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 11px !important;
            color: #111827 !important;
          }
          .daily-summary-print-table th,
          .daily-summary-print-table td {
            border: 0.5px solid #cbd5e1 !important;
            padding: 4px 6px !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: clip !important;
          }
          .daily-summary-print-table .print-report-header th {
            border: none !important;
            border-bottom: 2px solid #102C57 !important;
            padding: 0 0 6px !important;
            background: #ffffff !important;
          }
          .daily-summary-print-table .print-report-meta th {
            border: none !important;
            border-bottom: 1px solid #102C57 !important;
            padding: 4px 6px !important;
            background: #f8fafc !important;
            color: #102C57 !important;
          }
          .daily-summary-print-table .table-header th {
            background-color: #f1f5f9 !important;
            color: #111111 !important;
            font-weight: 700 !important;
            font-size: 11px !important;
            border: 0.5px solid #cbd5e1 !important;
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }
          .daily-summary-print-table thead,
          .daily-summary-print-table thead tr,
          .daily-summary-print-table .subtotal-row,
          .daily-summary-print-table .grand-total-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .daily-summary-print-table tbody tr.item-row {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .daily-summary-print-table tbody tr.item-row:nth-child(even) {
            background-color: #f8fafc !important;
          }
          .daily-summary-print-table .subtotal-row td {
            background-color: #f1f5f9 !important;
            color: #111111 !important;
            font-weight: 700 !important;
            border: 0.5px solid #cbd5e1 !important;
          }
          .daily-summary-print-table .grand-total-row td {
            background-color: #e2e8f0 !important;
            color: #111111 !important;
            font-weight: 700 !important;
            border: 0.5px solid #cbd5e1 !important;
          }
          .daily-summary-print-table .table-header th:nth-child(1),
          .daily-summary-print-table .table-header th:nth-child(4),
          .daily-summary-print-table .table-header th:nth-child(5),
          .daily-summary-print-table .table-header th:nth-child(6),
          .daily-summary-print-table tbody tr.item-row td:nth-child(1),
          .daily-summary-print-table tbody tr.item-row td:nth-child(4),
          .daily-summary-print-table tbody tr.item-row td:nth-child(5),
          .daily-summary-print-table tbody tr.item-row td:nth-child(6) {
            text-align: center !important;
          }
          .daily-summary-print-table .table-header th:nth-child(2),
          .daily-summary-print-table .table-header th:nth-child(3),
          .daily-summary-print-table tbody tr.item-row td:nth-child(2),
          .daily-summary-print-table tbody tr.item-row td:nth-child(3) {
            text-align: left !important;
          }
          .daily-summary-print-table .subtotal-row td:first-child,
          .daily-summary-print-table .grand-total-row td:first-child {
            text-align: right !important;
          }
          .daily-summary-print-table .subtotal-row td:nth-child(2),
          .daily-summary-print-table .subtotal-row td:nth-child(3),
          .daily-summary-print-table .grand-total-row td:nth-child(2),
          .daily-summary-print-table .grand-total-row td:nth-child(3) {
            text-align: center !important;
          }
        ` }} />
        {displayedRows.length ? (
          <table className="daily-summary-print-table">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[16%]" />
              <col className="w-[34%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="print-report-header">
                <th colSpan={6}>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-start pb-2">
                    <div className="flex items-center gap-3 text-left">
                      <Image
                        src="/brand/LOGO-KPF1.png"
                        alt="KPF"
                        width={40}
                        height={40}
                        className="h-10 w-auto object-contain"
                      />
                      <div>
                        <div className="text-[13px] font-black text-[#102C57]">บริษัท เคพีฟู้ดส์ จำกัด</div>
                        <div className="text-[9px] font-bold text-[#64748b]">K.P. foods Co.,Ltd.</div>
                      </div>
                    </div>
                    <div className="lot-balance-report-title text-center">
                      <div className="text-[17px] font-black text-[#102C57]">รายงานสรุปยอดคงเหลือสินค้าแยกตาม Lot</div>
                      <div className="mt-1 text-[8px] font-black uppercase tracking-[0.22em] text-[#d4af37]">Stock Lot Balance Summary Report</div>
                    </div>
                    <div className="text-right text-[9px] leading-tight text-[#102C57]">
                      <div><span className="font-black text-[#64748b]">วันที่พิมพ์:</span> {printedAtLabel}</div>
                      <div><span className="font-black text-[#64748b]">ผู้ออกรายงาน:</span> {profile.username || "-"}</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="print-report-meta">
                <th colSpan={3} className="text-left">แผนก: <span className="font-black">{scope.departmentName || "-"}</span></th>
                <th colSpan={3} className="text-right">ขอบเขต: <span className="font-black">{selectedProducts.length ? selectedProducts.map((p) => p.code).join(", ") : "ทุกสินค้าในรายงาน"}</span></th>
              </tr>
              <tr className="table-header">
                <th>#</th>
                <th className="text-left">รหัสสินค้า</th>
                <th className="text-left">รายการสินค้า</th>
                <th>LOT</th>
                <th className="text-center">จำนวน</th>
                <th className="text-center">น้ำหนัก (กก.)</th>
              </tr>
            </thead>
            <tbody>
              {flatVirtualPrintRows.map((vRow, vIndex) => {
                if (vRow.type === "product-subtotal") {
                  const row = vRow.data;
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={4} className="text-right italic">
                        รวม ({row.productCode}) - {row.productName}
                      </td>
                      <td className="text-center">{formatQuantity(row.balanceQuantity)}</td>
                      <td className="text-center">{formatWeight(row.balanceWeightKg)}</td>
                    </tr>
                  );
                }

                const row = vRow.data;
                return (
                  <tr key={vIndex} className="item-row">
                    <td>{row.sequence}</td>
                    <td>{row.productCode}</td>
                    <td className="text-left">{row.productName}</td>
                    <td>{row.lotNo}</td>
                    <td className="text-right">{formatQuantity(row.balanceQuantity)}</td>
                    <td className="text-right">{formatWeight(row.balanceWeightKg)}</td>
                  </tr>
                );
              })}
              <tr className="grand-total-row">
                <td colSpan={4} className="text-right font-black uppercase tracking-wider">
                  รวมทั้งสิ้น (Grand Total)
                </td>
                <td className="text-right font-black">{formatQuantity(displayedSummary.balanceQuantity)}</td>
                <td className="text-right font-black">{formatWeight(displayedSummary.balanceWeightKg)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .lot-balance-portrait-print-shell {
          color: #111111 !important;
        }
        .lot-balance-portrait-print-shell {
          color: #111111 !important;
        }
        .lot-balance-portrait-print-shell * {
          color: #111111 !important;
        }
        .lot-balance-portrait-report-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          font-size: 12px;
          color: #111111;
        }
        .lot-balance-portrait-report-table th,
        .lot-balance-portrait-report-table td {
          border: 0.5px solid #cbd5e1;
          padding: 6px 8px;
          vertical-align: middle;
        }
        .lot-balance-portrait-report-table thead th {
          background-color: #f1f5f9 !important;
          color: #111111 !important;
          font-weight: bold !important;
          border-color: #cbd5e1 !important;
        }
        .lot-balance-portrait-report-table tbody tr.zebra-row:nth-child(even) {
          background-color: #f8fafc;
        }
        .lot-balance-portrait-report-table tbody tr.subtotal-row td {
          background-color: #f1f5f9 !important;
          color: #111111 !important;
          font-weight: bold !important;
          border-color: #cbd5e1 !important;
        }
        .lot-balance-portrait-report-table tbody tr.grand-total-row {
          background-color: #e2e8f0 !important;
          color: #111111 !important;
          font-weight: bold !important;
        }
        .lot-balance-portrait-report-table tbody tr.grand-total-row td {
          background-color: #e2e8f0 !important;
          color: #111111 !important;
          border-color: #cbd5e1 !important;
        }
      ` }} />
    </div>
  );
}
