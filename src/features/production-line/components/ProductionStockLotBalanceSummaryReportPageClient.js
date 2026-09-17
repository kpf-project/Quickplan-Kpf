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
  Files,
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
    inboundQuantity: Number(row?.inboundQuantity || 0),
    inboundWeightKg: Number(row?.inboundWeightKg || 0),
    issueQuantity: Number(row?.issueQuantity || 0),
    issueWeightKg: Number(row?.issueWeightKg || 0),
    returnQuantity: Number(row?.returnQuantity || 0),
    returnWeightKg: Number(row?.returnWeightKg || 0),
    wasteQuantity: Number(row?.wasteQuantity || 0),
    wasteWeightKg: Number(row?.wasteWeightKg || 0),
    actualQuantity: Number(row?.actualQuantity || 0),
    actualWeightKg: Number(row?.actualWeightKg || 0),
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
    returnQuantity: Number(summary?.returnQuantity || 0),
    returnWeightKg: Number(summary?.returnWeightKg || 0),
    wasteQuantity: Number(summary?.wasteQuantity || 0),
    wasteWeightKg: Number(summary?.wasteWeightKg || 0),
    actualQuantity: Number(summary?.actualQuantity || 0),
    actualWeightKg: Number(summary?.actualWeightKg || 0),
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

function finalizeProductSubtotal(productSubtotal) {
  const finalBalance = calculateFinalBalanceTotals(productSubtotal?.balanceRows || []);
  const subtotal = { ...productSubtotal };
  delete subtotal.balanceRows;

  return {
    ...subtotal,
    balanceQuantity: finalBalance.quantity,
    balanceWeightKg: finalBalance.weightKg,
  };
}

async function exportWorkbook({ rows, filters, scope, selectedProducts }) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("รายงานสรุปคงเหลือราย Lot");
  const columns = [
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "สินค้า", key: "productDisplay", width: 46 },
    { header: "จำนวนรับเข้า", key: "inboundQuantity", width: 16 },
    { header: "น้ำหนักรับเข้า (Kg)", key: "inboundWeightKg", width: 18 },
    { header: "จำนวนเบิก", key: "issueQuantity", width: 16 },
    { header: "น้ำหนักเบิก (Kg)", key: "issueWeightKg", width: 18 },
    { header: "จำนวนคงเหลือ", key: "balanceQuantity", width: 16 },
    { header: "น้ำหนักคงเหลือ (Kg)", key: "balanceWeightKg", width: 18 },
  ];

  worksheet.columns = columns;
  const lastColumnLetter = String.fromCharCode(64 + columns.length);

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  worksheet.getCell("A1").value = "รายงานสรุปคงเหลือราย Lot";
  worksheet.getCell("A1").font = {
    size: 18,
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

  rows.forEach((row) => {
    worksheet.addRow({
      lotNo: row.lotNo,
      productDisplay: `${row.productCode} - ${row.productName}`,
      inboundQuantity: row.inboundQuantity,
      inboundWeightKg: row.inboundWeightKg,
      issueQuantity: row.issueQuantity,
      issueWeightKg: row.issueWeightKg,
      balanceQuantity: row.balanceQuantity,
      balanceWeightKg: row.balanceWeightKg,
    });
  });

  const finalBalance = calculateFinalBalanceTotals(rows);
  const summaryRow = worksheet.addRow({
    lotNo: "รวม",
    productDisplay: "สรุปยอด",
    inboundQuantity: rows.reduce((sum, row) => sum + row.inboundQuantity, 0),
    inboundWeightKg: rows.reduce((sum, row) => sum + row.inboundWeightKg, 0),
    issueQuantity: rows.reduce((sum, row) => sum + row.issueQuantity, 0),
    issueWeightKg: rows.reduce((sum, row) => sum + row.issueWeightKg, 0),
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
  const filename = `production-stock-lot-balance-summary-${Date.now()}.xlsx`;
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export default function ProductionStockLotBalanceSummaryReportPageClient({
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
  const [reportStyle, setReportStyle] = useState("clean");
  const [isPending, startTransition] = useTransition();
  const [hideZeroBalances, setHideZeroBalances] = useState(true);

  // Filter rows based on hideZeroBalances
  const displayedRows = useMemo(() => {
    if (hideZeroBalances) {
      return rows.filter((row) => Number(row.balanceQuantity) !== 0 || Number(row.balanceWeightKg) !== 0);
    }
    return rows;
  }, [rows, hideZeroBalances]);

  const displayedSummary = useMemo(() => {
    const finalBalance = calculateFinalBalanceTotals(displayedRows);
    return {
      inboundQuantity: displayedRows.reduce((sum, row) => sum + row.inboundQuantity, 0),
      inboundWeightKg: displayedRows.reduce((sum, row) => sum + row.inboundWeightKg, 0),
      issueQuantity: displayedRows.reduce((sum, row) => sum + row.issueQuantity, 0),
      issueWeightKg: displayedRows.reduce((sum, row) => sum + row.issueWeightKg, 0),
      returnQuantity: displayedRows.reduce((sum, row) => sum + row.returnQuantity, 0),
      returnWeightKg: displayedRows.reduce((sum, row) => sum + row.returnWeightKg, 0),
      wasteQuantity: displayedRows.reduce((sum, row) => sum + row.wasteQuantity, 0),
      wasteWeightKg: displayedRows.reduce((sum, row) => sum + row.wasteWeightKg, 0),
      actualQuantity: displayedRows.reduce((sum, row) => sum + row.actualQuantity, 0),
      actualWeightKg: displayedRows.reduce((sum, row) => sum + row.actualWeightKg, 0),
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
            rows: [{ type: "product-subtotal", data: finalizeProductSubtotal(productSubtotal) }],
            weight: 1.5,
          });
        }
        productSubtotal = {
          inboundQuantity: 0,
          inboundWeightKg: 0,
          issueQuantity: 0,
          issueWeightKg: 0,
          returnQuantity: 0,
          returnWeightKg: 0,
          wasteQuantity: 0,
          wasteWeightKg: 0,
          actualQuantity: 0,
          actualWeightKg: 0,
          balanceQuantity: 0,
          balanceWeightKg: 0,
          productDisplay: `${row.productCode} - ${row.productName}`,
          balanceRows: [],
        };
      }

      unitRows.push({ type: "item", data: { ...row, sequence: index + 1 } });

      if (productSubtotal) {
        productSubtotal.inboundQuantity += Number(row.inboundQuantity) || 0;
        productSubtotal.inboundWeightKg += Number(row.inboundWeightKg) || 0;
        productSubtotal.issueQuantity += Number(row.issueQuantity) || 0;
        productSubtotal.issueWeightKg += Number(row.issueWeightKg) || 0;
        productSubtotal.returnQuantity += Number(row.returnQuantity) || 0;
        productSubtotal.returnWeightKg += Number(row.returnWeightKg) || 0;
        productSubtotal.wasteQuantity += Number(row.wasteQuantity) || 0;
        productSubtotal.wasteWeightKg += Number(row.wasteWeightKg) || 0;
        productSubtotal.actualQuantity += Number(row.actualQuantity) || 0;
        productSubtotal.actualWeightKg += Number(row.actualWeightKg) || 0;
        productSubtotal.balanceRows.push(row);
      }

      currentProductKey = nextProductKey;

      pageUnits.push({
        rows: unitRows,
        weight: unitRows.reduce((sum, unitRow) => {
          if (unitRow.type === "item") return sum + 1;
          return sum + 1;
        }, 0),
      });
    });

    if (currentProductKey !== "" && productSubtotal) {
      pageUnits.push({
        rows: [{ type: "product-subtotal", data: finalizeProductSubtotal(productSubtotal) }],
        weight: 1.5,
      });
    }

    let pages = [];
    let currentPage = [];
    let currentWeight = 0;
    const FIRST_PAGE_LIMIT = 48;
    const OTHER_PAGE_LIMIT = 48;

    pageUnits.forEach((unit) => {
      const limit = pages.length === 0 ? FIRST_PAGE_LIMIT : OTHER_PAGE_LIMIT;

      if (currentPage.length && currentWeight + unit.weight > limit) {
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
          badge="สถานะคลังสะสม"
          title="รายงานสรุปคงเหลือราย Lot"
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

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const payload = await fetchProductionStockLotBalanceSummaryReport({
                        productCodes: filters.productCodes,
                        includeAll: true,
                      });
                      const fetchedRows = normalizeRows(payload?.rows);
                      const finalRows = hideZeroBalances
                        ? fetchedRows.filter((row) => Number(row.balanceQuantity) !== 0 || Number(row.balanceWeightKg) !== 0)
                        : fetchedRows;
                      await exportWorkbook({
                        rows: finalRows,
                        filters,
                        scope,
                        selectedProducts,
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
                   <div className="flex h-12 items-center border border-[#d7dbe3] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setReportStyle("classic")}
                      className={`inline-flex h-full items-center gap-1.5 px-3 text-sm font-bold transition ${
                        reportStyle === "classic"
                          ? "bg-[#102C57] text-white"
                          : "text-[#102C57] hover:bg-[#f0f4f8]"
                      }`}
                    >
                      <ListOrdered size={14} />
                      Classic
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportStyle("clean")}
                      className={`inline-flex h-full items-center gap-1.5 px-3 text-sm font-bold transition ${
                        reportStyle === "clean"
                          ? "bg-[#102C57] text-white"
                          : "text-[#102C57] hover:bg-[#f0f4f8]"
                      }`}
                    >
                      <LayoutGrid size={14} />
                      Clean
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-px border-x border-b border-[#d7dde5] bg-[#d7dde5] shadow-sm md:grid-cols-4">
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Files size={14} className="text-[#102C57]" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      จำนวน Lot ทั้งหมด
                    </p>
                  </div>
                  <p className="text-2xl font-semibold text-[#102C57]">{displayedSummary.totalCount}</p>
                </div>
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <FileCheck size={14} className="text-emerald-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      น้ำหนักรับเข้าสะสม
                    </p>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatWeight(displayedSummary.inboundWeightKg)}</p>
                </div>
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck size={14} className="text-blue-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      น้ำหนักเบิกสะสม
                    </p>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-blue-700">{formatWeight(displayedSummary.issueWeightKg)}</p>
                </div>
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Scale size={14} className="text-amber-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      น้ำหนักคงเหลือสะสม
                    </p>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-[#102C57]">
                    {formatWeight(displayedSummary.balanceWeightKg)} <span className="text-sm font-medium text-[#7d8795]">Kg</span>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Visual Paging Controls */}
      {reportPages.length > 0 && (
        <div className="weight-scale-report-screen-only flex justify-center mb-6">
          <div className="flex items-center gap-4 bg-[#102C57] text-white px-6 py-2 rounded-full shadow-lg">
            <button
              type="button"
              onClick={() => setCurrentViewPage((prev) => Math.max(0, prev - 1))}
              disabled={currentViewPage === 0}
              className="hover:text-[#d4af37] disabled:opacity-30 disabled:hover:text-white transition-colors"
              title="หน้าก่อนหน้า"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="flex flex-col items-center min-w-[120px]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#d4af37]/70">แผ่นที่</span>
              <span className="text-sm font-bold">{currentViewPage + 1} / {reportPages.length}</span>
            </div>

            <button
              type="button"
              onClick={() => setCurrentViewPage((prev) => Math.min(reportPages.length - 1, prev + 1))}
              disabled={currentViewPage === reportPages.length - 1}
              className="hover:text-[#d4af37] disabled:opacity-30 disabled:hover:text-white transition-colors"
              title="หน้าถัดไป"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      )}

      {/* A4 Paper Sheets Rendering */}
      <div className="flex flex-col items-center gap-8 py-4 print:gap-0 print:py-0">
        {reportPages.length ? (
          reportPages.map((pageRows, pageIndex) => {
            const isClean = reportStyle === "clean";
            const isPortrait = reportStyle === "portrait";
            return (
              <section
                key={pageIndex}
                className={`weight-scale-report-print-shell movement-summary-print-shell w-full bg-white print:shadow-none relative ${
                  isPortrait ? "max-w-[210mm]" : "max-w-[305mm]"
                } ${
                  isClean || isPortrait
                    ? "border border-[#94a3b8] shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
                    : "border border-black shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)]"
                } ${reportPages.length === 1 ? "movement-summary-single-print-sheet" : ""} ${
                  pageIndex === currentViewPage ? "block" : "hidden print:block"
                }`}
                style={{ minHeight: isPortrait ? "270mm" : "186mm" }}
              >
                {/* Corporate Header */}
                <div className={`movement-summary-print-header bg-white px-6 py-3 border-b ${isClean || isPortrait ? "border-[#94a3b8]" : "border-black"}`}>
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

                    <div className="-mt-1 text-center pb-1">
                      <h2 className="text-[18px] font-black text-[#102C57] leading-none uppercase">รายงานสรุปคงเหลือราย Lot</h2>
                      {!isClean && !isPortrait && (
                        <p className="text-[9px] font-bold text-[#d4af37] uppercase tracking-[0.2em] mt-1">
                          Lot Stock Balance Summary Report
                        </p>
                      )}
                    </div>

                    <div className="text-[10px] text-[#102C57] leading-tight text-right">
                      <p><span className="font-black text-[#64748b] uppercase text-[8px]">วันที่พิมพ์:</span> {printedAtLabel}</p>
                      <p><span className="font-black text-[#64748b] uppercase text-[8px]">ผู้ออกรายงาน:</span> {profile.username || "System"}</p>
                      <p><span className="font-black text-[#64748b] uppercase text-[8px]">หน้า:</span> {pageIndex + 1} / {reportPages.length}</p>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 border-t pt-2 ${isClean || isPortrait ? "border-[#94a3b8]" : "border-black"}`}>
                    <div className="flex gap-2 items-center">
                      <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">แผนก:</span>
                      <span className="text-[11px] font-bold text-[#102C57]">{scope.departmentName || "-"}</span>
                    </div>
                    <div className="flex gap-2 items-center justify-end">
                      <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">สินค้า:</span>
                      <span className="text-[11px] font-bold text-[#102C57] whitespace-nowrap">
                        {selectedProducts.length ? `เลือกแล้ว ${selectedProducts.length} รายการ` : "สินค้าทั้งหมด"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="weight-scale-report-print-body movement-summary-print-body bg-white px-0 py-3 min-h-[150mm] print:min-h-0 print:border-none print:px-0 print:py-2">
                  <div className="movement-summary-table-flow overflow-visible">
                    <style dangerouslySetInnerHTML={{ __html: `
                      @page {
                        size: A4 ${isPortrait ? "portrait" : "landscape"};
                        margin: 0;
                      }
                      .movement-summary-print-shell {
                        background: white !important;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
                        border: none !important;
                        padding: 16px !important;
                        margin: 20px auto !important;
                        max-width: ${isPortrait ? "210mm" : "305mm"} !important;
                        min-height: ${isPortrait ? "297mm" : "210mm"} !important;
                      }
                      .movement-summary-report-table {
                        width: 100% !important;
                        table-layout: fixed !important;
                        border-collapse: collapse !important;
                        font-size: 11px !important;
                        color: #1a1c1e !important;
                      }
                      .movement-summary-table-flow {
                        margin-left: -16px !important;
                        margin-right: -16px !important;
                        width: calc(100% + 32px) !important;
                      }
                      .movement-summary-report-table th,
                      .movement-summary-report-table td {
                        border: 0.5px solid #b4b8c0 !important;
                        padding: 6px 8px !important;
                        vertical-align: middle !important;
                      }
                      .movement-summary-report-table thead tr {
                        background-color: #f8f9fa !important;
                      }
                      .movement-summary-report-table thead tr:last-child {
                        border-bottom: 2px solid #1a1c1e !important;
                      }
                      .movement-summary-report-table tbody tr.zebra-row:nth-child(even) {
                        background-color: #fafbfc !important;
                      }
                      .movement-summary-report-table tbody tr.subtotal-row {
                        background-color: #f8f9fa !important;
                        font-weight: 600 !important;
                      }
                      .movement-summary-report-table tbody tr.grand-total-row {
                        background-color: #102C57 !important;
                        color: #ffffff !important;
                        font-weight: bold !important;
                      }
                      .movement-summary-report-table tbody tr.grand-total-row td {
                        background-color: #102C57 !important;
                        border-left: none !important;
                        border-right: none !important;
                        border-color: #102C57 !important;
                        color: #ffffff !important;
                        font-weight: bold !important;
                        padding: 10px 8px !important;
                      }
                      .movement-summary-screen-table thead tr:last-child th {
                        padding-left: 3px !important;
                        padding-right: 3px !important;
                        text-align: center !important;
                        font-size: 10px !important;
                        line-height: 1.15 !important;
                        white-space: nowrap !important;
                      }
                      .movement-summary-screen-table tbody td:nth-child(n+4) {
                        padding-left: 3px !important;
                        padding-right: 3px !important;
                        white-space: nowrap !important;
                        font-size: 11px !important;
                        font-variant-numeric: tabular-nums !important;
                      }
                      .movement-summary-screen-table tbody tr.grand-total-row td:not(:first-child) {
                        font-size: 11px !important;
                        padding-left: 2px !important;
                        padding-right: 2px !important;
                        white-space: nowrap !important;
                        font-variant-numeric: tabular-nums !important;
                      }
                      .movement-summary-screen-table th:nth-child(3),
                      .movement-summary-screen-table td:nth-child(3) {
                        white-space: nowrap !important;
                        word-break: keep-all !important;
                        overflow-wrap: normal !important;
                      }
                      @media print {
                        body {
                          background: white !important;
                        }
                        .movement-summary-print-shell {
                          margin: 0 !important;
                          box-shadow: none !important;
                          width: 100% !important;
                          max-width: none !important;
                          padding: 0 4mm !important;
                          border: none !important;
                          min-height: auto !important;
                          overflow: visible !important;
                        }
                        .movement-summary-screen-table {
                          display: table !important;
                        }
                        .movement-summary-table-flow {
                          margin-left: 0 !important;
                          margin-right: 0 !important;
                          width: 100% !important;
                        }
                        .movement-summary-report-table th,
                        .movement-summary-report-table td {
                          font-size: 11px !important;
                          padding: 4px 6px !important;
                        }
                      }
                    ` }} />

                    {isPortrait ? (
                      <table className="movement-summary-screen-table movement-summary-report-table min-w-full table-fixed border-collapse">
                        <colgroup>
                          <col className="w-[8%]" />
                          <col className="w-[20%]" />
                          <col className="w-[38%]" />
                          <col className="w-[20%]" />
                          <col className="w-[14%]" />
                        </colgroup>
                        <thead>
                          <tr className="table-header">
                            <th className="text-center font-bold">ลำดับ</th>
                            <th className="text-center font-bold">รหัสสินค้า</th>
                            <th className="text-left font-bold">ชื่อสินค้า</th>
                            <th className="text-center font-bold">LOT</th>
                            <th className="text-right font-bold">จำนวนคงเหลือ</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white text-center">
                          {pageRows.map((vRow, vIndex) => {
                            if (vRow.type === "product-subtotal") {
                              const row = vRow.data;
                              return (
                                <tr key={vIndex} className="subtotal-row text-[12px]">
                                  <td colSpan={4} className="p-2.5 text-right font-bold italic">รวม {row.productDisplay}</td>
                                  <td className="p-2.5 text-right font-bold text-[#102C57]">{formatQuantity(row.balanceQuantity)}</td>
                                </tr>
                              );
                            }

                            const row = vRow.data;
                            return (
                              <tr key={vIndex} className="zebra-row font-normal text-[12px]">
                                <td className="p-2.5 text-center">{row.sequence}</td>
                                <td className="p-2.5 text-center font-mono">{row.productCode}</td>
                                <td className="p-2.5 text-left">{row.productName}</td>
                                <td className="p-2.5 text-center font-mono">{row.lotNo}</td>
                                <td className="p-2.5 text-right font-bold tabular-nums">{formatQuantity(row.balanceQuantity)}</td>
                              </tr>
                            );
                          })}
                          {pageIndex === reportPages.length - 1 ? (
                            <tr className="grand-total-row text-[12px] font-bold">
                              <td colSpan={4} className="p-3 text-right font-bold uppercase tracking-widest text-[10px]">
                                สรุปรวมทั้งรายงาน (Grand Total)
                              </td>
                              <td className="p-3 text-right font-bold text-blue-200 tabular-nums">{formatQuantity(displayedSummary.balanceQuantity)}</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    ) : (
                      <table className="movement-summary-screen-table movement-summary-report-table min-w-full table-fixed border-collapse">
                        <colgroup>
                          <col className="w-[2.5%]" />
                          <col className="w-[20%]" />
                          <col className="w-[9.5%]" />
                          {Array.from({ length: 12 }).map((_, index) => (
                            <col key={index} className="w-[5.665%]" />
                          ))}
                        </colgroup>
                        <thead>
                          <tr className="table-header">
                            <th rowSpan={2} className="text-center font-bold">#</th>
                            <th rowSpan={2} className="text-left font-bold">สินค้า</th>
                            <th rowSpan={2} className="text-center font-bold">LOT</th>
                            <th colSpan={2} className="text-center font-bold">รับเข้าสะสม</th>
                            <th colSpan={2} className="text-center font-bold">เบิกสะสม</th>
                            <th colSpan={2} className="text-center font-bold">ชั่งคืนสะสม</th>
                            <th colSpan={2} className="text-center font-bold">ของเสียสะสม</th>
                            <th colSpan={2} className="text-center font-bold">ใช้จริงสะสม</th>
                            <th colSpan={2} className="text-center font-bold">คงเหลือสะสม</th>
                          </tr>
                          <tr className="table-header">
                            {Array.from({ length: 6 }).flatMap((_, index) => [
                              <th key={`${index}-qty`} className="text-center font-bold text-[9px] text-black">จำนวน</th>,
                              <th key={`${index}-weight`} className="text-center font-bold text-[9px] text-black">น้ำหนัก</th>,
                            ])}
                          </tr>
                        </thead>
                        <tbody className="bg-white text-center">
                          {pageRows.map((vRow, vIndex) => {
                            if (vRow.type === "product-subtotal") {
                              const row = vRow.data;
                              return (
                                <tr key={vIndex} className="subtotal-row text-[12px]">
                                  <td colSpan={3} className="p-2 text-right italic">รวม {row.productDisplay}</td>
                                  <td className="p-2 text-right">{formatQuantity(row.inboundQuantity)}</td>
                                  <td className="p-2 text-right">{formatWeight(row.inboundWeightKg)}</td>
                                  <td className="p-2 text-right">{formatQuantity(row.issueQuantity)}</td>
                                  <td className="p-2 text-right">{formatWeight(row.issueWeightKg)}</td>
                                  <td className="p-2 text-right">{formatQuantity(row.returnQuantity)}</td>
                                  <td className="p-2 text-right">{formatWeight(row.returnWeightKg)}</td>
                                  <td className="p-2 text-right">{formatQuantity(row.wasteQuantity)}</td>
                                  <td className="p-2 text-right">{formatWeight(row.wasteWeightKg)}</td>
                                  <td className="p-2 text-right">{formatQuantity(row.actualQuantity)}</td>
                                  <td className="p-2 text-right">{formatWeight(row.actualWeightKg)}</td>
                                  <td className="p-2 text-right">{formatQuantity(row.balanceQuantity)}</td>
                                  <td className="p-2 text-right">{formatWeight(row.balanceWeightKg)}</td>
                                </tr>
                              );
                            }

                            const row = vRow.data;
                            return (
                              <tr key={vIndex} className="zebra-row font-normal text-[12px]">
                                <td className="p-2 text-center">{row.sequence}</td>
                                <td className="p-2 text-left">{row.productCode} - {row.productName}</td>
                                <td className="p-2 text-center">{row.lotNo}</td>
                                <td className="p-2 text-right">{formatQuantity(row.inboundQuantity)}</td>
                                <td className="p-2 text-right">{formatWeight(row.inboundWeightKg)}</td>
                                <td className="p-2 text-right">{formatQuantity(row.issueQuantity)}</td>
                                <td className="p-2 text-right">{formatWeight(row.issueWeightKg)}</td>
                                <td className="p-2 text-right">{formatQuantity(row.returnQuantity)}</td>
                                <td className="p-2 text-right">{formatWeight(row.returnWeightKg)}</td>
                                <td className="p-2 text-right">{formatQuantity(row.wasteQuantity)}</td>
                                <td className="p-2 text-right">{formatWeight(row.wasteWeightKg)}</td>
                                <td className="p-2 text-right">{formatQuantity(row.actualQuantity)}</td>
                                <td className="p-2 text-right">{formatWeight(row.actualWeightKg)}</td>
                                <td className="p-2 text-right">{formatQuantity(row.balanceQuantity)}</td>
                                <td className="p-2 text-right">{formatWeight(row.balanceWeightKg)}</td>
                              </tr>
                            );
                          })}
                          {pageIndex === reportPages.length - 1 ? (
                            <tr className="grand-total-row text-[12px] font-bold">
                              <td colSpan={3} className="p-2.5 text-right font-bold uppercase tracking-widest text-[10px]">
                                สรุปรวมทั้งรายงาน (Grand Total)
                              </td>
                              <td className="p-2 text-right font-bold">{formatQuantity(displayedSummary.inboundQuantity)}</td>
                              <td className="p-2 text-right font-bold">{formatWeight(displayedSummary.inboundWeightKg)}</td>
                              <td className="p-2 text-right font-bold">{formatQuantity(displayedSummary.issueQuantity)}</td>
                              <td className="p-2 text-right font-bold">{formatWeight(displayedSummary.issueWeightKg)}</td>
                              <td className="p-2 text-right font-bold">{formatQuantity(displayedSummary.returnQuantity)}</td>
                              <td className="p-2 text-right font-bold">{formatWeight(displayedSummary.returnWeightKg)}</td>
                              <td className="p-2 text-right font-bold">{formatQuantity(displayedSummary.wasteQuantity)}</td>
                              <td className="p-2 text-right font-bold">{formatWeight(displayedSummary.wasteWeightKg)}</td>
                              <td className="p-2 text-right font-bold">{formatQuantity(displayedSummary.actualQuantity)}</td>
                              <td className="p-2 text-right font-bold">{formatWeight(displayedSummary.actualWeightKg)}</td>
                              <td className="p-2 text-right font-bold text-blue-200">{formatQuantity(displayedSummary.balanceQuantity)}</td>
                              <td className="p-2 text-right font-bold text-blue-200">{formatWeight(displayedSummary.balanceWeightKg)}</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </section>
            );
          })
        ) : (
          <div className="w-full max-w-[305mm] bg-white border border-[#94a3b8] px-4 py-12 text-center text-sm text-[#111111]">
            {isPending ? "กำลังโหลดข้อมูล..." : "ยังไม่พบข้อมูลสรุปคงเหลือราย Lot ตามเงื่อนไขที่เลือก"}
          </div>
        )}
      </div>
    </div>
  );
}
