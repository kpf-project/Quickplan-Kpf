"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck,
  FileSearch,
  Files,
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
import { fetchProductionStockMovementSummaryReport } from "@/features/production-line/services/productionStockIssueClient";
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
    issueDate: String(row?.issueDate || "").trim(),
    lotNo: String(row?.lotNo || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    openingQuantity: Number(row?.openingQuantity || 0),
    openingWeightKg: Number(row?.openingWeightKg || 0),
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
    openingQuantity: Number(summary?.openingQuantity || 0),
    openingWeightKg: Number(summary?.openingWeightKg || 0),
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
    lotNos: Array.isArray(filters?.lotNos)
      ? Array.from(new Set(filters.lotNos.map((value) => String(value || "").trim()).filter(Boolean)))
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

function highlightMatch(value, query) {
  const text = String(value || "");
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return text;
  const index = text.toLowerCase().indexOf(normalizedQuery.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark className="bg-[#f8d762] px-0.5 text-[#102C57]">{text.slice(index, index + normalizedQuery.length)}</mark>{text.slice(index + normalizedQuery.length)}</>;
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

function sortRowsForFinalBalances(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const p = String(a.productCode || "").localeCompare(String(b.productCode || ""));
    if (p !== 0) return p;
    const d = String(a.issueDate || "").localeCompare(String(b.issueDate || ""));
    if (d !== 0) return d;
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

function calculateOpeningBalanceTotals(rows) {
  const openingBalancesByLot = new Map();

  sortRowsForFinalBalances(rows).forEach((row) => {
    const balanceKey = [
      String(row.productCode || "").trim().toUpperCase(),
      String(row.lotNo || "").trim() || "-",
    ].join("|");

    if (!openingBalancesByLot.has(balanceKey)) {
      openingBalancesByLot.set(balanceKey, {
        quantity: Number(row.openingQuantity) || 0,
        weightKg: Number(row.openingWeightKg) || 0,
      });
    }
  });

  return Array.from(openingBalancesByLot.values()).reduce(
    (summary, balance) => ({
      quantity: summary.quantity + balance.quantity,
      weightKg: summary.weightKg + balance.weightKg,
    }),
    { quantity: 0, weightKg: 0 }
  );
}

function finalizeProductSubtotal(productSubtotal) {
  const finalBalance = calculateFinalBalanceTotals(productSubtotal?.balanceRows || []);
  const openingBalance = calculateOpeningBalanceTotals(productSubtotal?.balanceRows || []);
  const subtotal = { ...productSubtotal };
  delete subtotal.balanceRows;

  return {
    ...subtotal,
    openingQuantity: openingBalance.quantity,
    openingWeightKg: openingBalance.weightKg,
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

  const worksheet = workbook.addWorksheet("รายงานเคลื่อนไหวสินค้า");
  const columns = [
    { header: "วันที่", key: "issueDateLabel", width: 16 },
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "สินค้า", key: "productDisplay", width: 46 },
    { header: "จำนวนยกมา", key: "openingQuantity", width: 16 },
    { header: "น้ำหนักยกมา (Kg)", key: "openingWeightKg", width: 18 },
    { header: "จำนวนรับเข้าสำเร็จ", key: "inboundQuantity", width: 18 },
    { header: "น้ำหนักรับเข้าสำเร็จ (Kg)", key: "inboundWeightKg", width: 22 },
    { header: "จำนวนเบิกสำเร็จ", key: "issueQuantity", width: 18 },
    { header: "น้ำหนักเบิกสำเร็จ (Kg)", key: "issueWeightKg", width: 22 },
    { header: "จำนวนคงเหลือ", key: "balanceQuantity", width: 16 },
    { header: "น้ำหนักคงเหลือ (Kg)", key: "balanceWeightKg", width: 18 },
  ];

  worksheet.columns = columns;
  const lastColumnLetter = String.fromCharCode(64 + columns.length);

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  worksheet.getCell("A1").value = "รายงานเคลื่อนไหวสินค้า";
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
    worksheet.addRow({
      issueDateLabel: formatDateLabel(row.issueDate),
      lotNo: row.lotNo,
      productDisplay: `${row.productCode} - ${row.productName}`,
      openingQuantity: row.openingQuantity,
      openingWeightKg: row.openingWeightKg,
      inboundQuantity: row.inboundQuantity,
      inboundWeightKg: row.inboundWeightKg,
      issueQuantity: row.issueQuantity,
      issueWeightKg: row.issueWeightKg,
      balanceQuantity: row.balanceQuantity,
      balanceWeightKg: row.balanceWeightKg,
    });
  });

  const finalBalance = calculateFinalBalanceTotals(rows);
  const openingBalance = calculateOpeningBalanceTotals(rows);
  const summaryRow = worksheet.addRow({
    issueDateLabel: "",
    lotNo: "รวม",
    productDisplay: "สรุปยอด",
    openingQuantity: openingBalance.quantity,
    openingWeightKg: openingBalance.weightKg,
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
  const filename = `production-stock-movement-summary-${formatFilenameDateRange(filters.dateFrom, filters.dateTo)}.xlsx`;
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export default function ProductionStockMovementSummaryReportPageClient({
  scope,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
}) {
  const productPickerRef = useRef(null);
  const lotOptionsCacheRef = useRef(new Map());
  const [rows, setRows] = useState(() => normalizeRows(initialRows));
  const [summary, setSummary] = useState(() => normalizeSummary(initialSummary));
  const [filters, setFilters] = useState(() => normalizeFilters(initialFilters, initialPagination));
  const [pagination, setPagination] = useState(() => normalizePagination(initialPagination));
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isLotPickerOpen, setIsLotPickerOpen] = useState(false);
  const [lotOptions, setLotOptions] = useState([]);
  const [lotSearchQuery, setLotSearchQuery] = useState("");
  const [isLoadingLots, setIsLoadingLots] = useState(false);
  const [currentViewPage, setCurrentViewPage] = useState(0);
  const reportStyle = "clean";
  const [isPending, startTransition] = useTransition();

  const profile = useUserProfile();

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const reportPages = useMemo(() => {
    if (!rows.length) return [];

    const sortedRows = sortRowsForFinalBalances(rows);

    const pageUnits = [];
    let currentProductKey = "";
    let currentDateKey = "";
    let currentLotKey = "";

    let productSubtotal = null;

    sortedRows.forEach((row, index) => {
      const nextProductKey = String(row.productCode || "").trim();
      const nextDateKey = String(row.issueDate || "").trim() || "-";
      const nextLotKey = String(row.lotNo || "").trim() || "-";

      const unitRows = [];

      if (nextProductKey !== currentProductKey) {
        if (currentProductKey !== "" && productSubtotal) {
          pageUnits.push({
            rows: [{ type: "product-subtotal", data: finalizeProductSubtotal(productSubtotal) }],
            weight: 1.5
          });
        }
        productSubtotal = {
          openingQuantity: 0, openingWeightKg: 0,
          inboundQuantity: 0, inboundWeightKg: 0,
          issueQuantity: 0, issueWeightKg: 0,
          returnQuantity: 0, returnWeightKg: 0,
          wasteQuantity: 0, wasteWeightKg: 0,
          actualQuantity: 0, actualWeightKg: 0,
          balanceQuantity: 0, balanceWeightKg: 0,
          productDisplay: `${row.productCode} - ${row.productName}`,
          balanceRows: []
        };
        currentDateKey = "";
        currentLotKey = "";
      }

      if (nextDateKey !== currentDateKey) {
        unitRows.push({
          type: "date-header",
          label: formatDateLabel(row.issueDate),
        });
        currentDateKey = nextDateKey;
        currentLotKey = "";
      }

      if (nextLotKey !== currentLotKey || nextProductKey !== currentProductKey) {
        unitRows.push({
          type: "product-header",
          display: `${row.productCode} - ${row.productName}`,
          lotNo: row.lotNo,
        });
        currentLotKey = nextLotKey;
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
        weight: unitRows.reduce(
          (sum, unitRow) => {
            if (unitRow.type === "item") return sum + 1;
            if (unitRow.type === "date-header") return sum + 1;
            if (unitRow.type === "product-header") return sum + 0.8;
            return sum + 1;
          },
          0
        ),
      });
    });

    if (currentProductKey !== "" && productSubtotal) {
      pageUnits.push({
        rows: [{ type: "product-subtotal", data: finalizeProductSubtotal(productSubtotal) }],
        weight: 1.5
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
  }, [rows]);

  const printRows = useMemo(() => reportPages.flat(), [reportPages]);

  const productOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );

  const selectedProducts = useMemo(
    () => productOptions.filter((product) => filters.productCodes.includes(product.code)),
    [filters.productCodes, productOptions]
  );
  const filteredLotOptions = useMemo(() => {
    const query = lotSearchQuery.trim().toLowerCase();
    return query
      ? lotOptions.filter((option) => `${option.productCode} ${option.productName} ${option.lotNo}`.toLowerCase().includes(query))
      : lotOptions;
  }, [lotOptions, lotSearchQuery]);
  const groupedLotOptions = useMemo(() => {
    const groups = new Map();
    filteredLotOptions.forEach((option) => {
      if (!groups.has(option.productCode)) {
        groups.set(option.productCode, {
          productCode: option.productCode,
          productName: option.productName,
          options: [],
        });
      }
      groups.get(option.productCode).options.push(option);
    });
    return Array.from(groups.values());
  }, [filteredLotOptions]);

  const openLotPicker = useCallback(async () => {
    setIsLotPickerOpen(true);
    const cacheKey = [filters.dateFrom, filters.dateTo, ...filters.productCodes.slice().sort()].join("|");
    const cachedLots = lotOptionsCacheRef.current.get(cacheKey);
    if (cachedLots) {
      setLotOptions(cachedLots);
      setIsLoadingLots(false);
      return;
    }

    const visibleLotMap = new Map();
    rows
      .filter((row) => !filters.productCodes.length || filters.productCodes.includes(row.productCode))
      .filter((row) => !filters.dateFrom || row.issueDate >= filters.dateFrom)
      .filter((row) => !filters.dateTo || row.issueDate <= filters.dateTo)
      .filter((row) => row.lotNo && row.lotNo !== "-")
      .forEach((row) => visibleLotMap.set(`${row.productCode}::${row.lotNo}`, {
        key: `${row.productCode}::${row.lotNo}`,
        productCode: row.productCode,
        productName: row.productName,
        lotNo: row.lotNo,
      }));
    const visibleLots = Array.from(visibleLotMap.values())
      .sort((left, right) => left.productCode.localeCompare(right.productCode, "th") || left.lotNo.localeCompare(right.lotNo, "th"));

    if (visibleLots.length) {
      lotOptionsCacheRef.current.set(cacheKey, visibleLots);
      setLotOptions(visibleLots);
      setIsLoadingLots(false);
      return;
    }

    setIsLoadingLots(true);
    try {
      const payload = await fetchProductionStockMovementSummaryReport({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        productCodes: filters.productCodes,
        includeAll: true,
        page: 1,
        limit: 1000,
      });
      const lotMap = new Map();
      normalizeRows(payload?.rows)
        .filter((row) => row.lotNo && row.lotNo !== "-")
        .forEach((row) => lotMap.set(`${row.productCode}::${row.lotNo}`, {
          key: `${row.productCode}::${row.lotNo}`,
          productCode: row.productCode,
          productName: row.productName,
          lotNo: row.lotNo,
        }));
      const lots = Array.from(lotMap.values())
        .sort((left, right) => left.productCode.localeCompare(right.productCode, "th") || left.lotNo.localeCompare(right.lotNo, "th"));
      lotOptionsCacheRef.current.set(cacheKey, lots);
      setLotOptions(lots);
    } finally {
      setIsLoadingLots(false);
    }
  }, [filters.dateFrom, filters.dateTo, filters.productCodes, rows]);

  const reportPeriodLabel = useMemo(() => {
    const dateFromLabel = formatDateLabel(filters.dateFrom);
    const dateToLabel = formatDateLabel(filters.dateTo);
    if (filters.dateFrom === filters.dateTo) {
      return dateFromLabel;
    }
    return `${dateFromLabel} - ${dateToLabel}`;
  }, [filters.dateFrom, filters.dateTo]);

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
        if (nextFilters.dateFrom) params.set("dateFrom", nextFilters.dateFrom);
        if (nextFilters.dateTo) params.set("dateTo", nextFilters.dateTo);
        if (Array.isArray(nextFilters.productCodes)) {
          nextFilters.productCodes.forEach((code) => params.append("productCodes", code));
        }
        if (Array.isArray(nextFilters.lotNos)) nextFilters.lotNos.forEach((lotNo) => params.append("lotNos", lotNo));
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
      }

      const payload = await fetchProductionStockMovementSummaryReport({
        dateFrom: nextFilters.dateFrom,
        dateTo: nextFilters.dateTo,
        productCodes: nextFilters.productCodes,
        lotNos: nextFilters.lotNos,
        includeAll: true, // Fetch all for visual paging
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

  useEffect(() => {
    setRows(normalizeRows(initialRows));
    setSummary(normalizeSummary(initialSummary));
    setFilters(normalizeFilters(initialFilters, initialPagination));
    setPagination(normalizePagination(initialPagination));
    setCurrentViewPage(0);
  }, [initialRows, initialSummary, initialFilters, initialPagination]);

  return (
    <div className="weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626]">
      <div className="weight-scale-report-screen-only">
        <WeightScalePrimaryHeader
          eyebrow="รายงานผลิตภัณฑ์"
          badge="สรุปภาพรวม"
          title="รายงานเคลื่อนไหวสินค้า"
        />

        <div className="mx-auto flex w-full max-w-none flex-col gap-8 px-3 py-8 sm:px-4 lg:px-6 2xl:px-8">
          <section className="overflow-visible border-2 border-[#d4af37] bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]">
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                                    lotNos: [],
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
                    <span className="inline-flex items-center gap-2 text-sm font-black text-black"><Search size={16} />ค้นหา LOT</span>
                    <label className="flex h-12 min-w-0 items-center gap-2 border border-[#d7dbe3] bg-white px-3 transition focus-within:border-[#d4af37]">
                        <Search size={16} className="shrink-0 text-slate-400" />
                        <input
                          type="search"
                          value={lotSearchQuery}
                          onChange={(event) => setLotSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && filters.productCodes.length) {
                              event.preventDefault();
                              void openLotPicker();
                            }
                          }}
                          disabled={!filters.productCodes.length}
                          placeholder={filters.productCodes.length ? "ค้นหาเลข LOT" : "เลือกสินค้าก่อน"}
                          aria-label="ค้นหาเลข LOT"
                          className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-black outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                        />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-black text-black"><Files size={16} />เลือก LOT</span>
                    <button
                      type="button"
                      onClick={() => void openLotPicker()}
                      disabled={!filters.productCodes.length}
                      className="flex h-12 items-center justify-between border border-[#d7dbe3] bg-white px-4 text-left text-[14px] font-semibold text-black transition hover:border-[#d4af37] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <span className="truncate">{filters.lotNos.length ? `เลือกแล้ว ${filters.lotNos.length} LOT` : filters.productCodes.length ? "เปิดรายการ LOT" : "เลือกสินค้าก่อน"}</span>
                      <ChevronDown size={16} />
                    </button>
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
                        lotNos: [],
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
                      const payload = await fetchProductionStockMovementSummaryReport({
                        dateFrom: filters.dateFrom,
                        dateTo: filters.dateTo,
                        productCodes: filters.productCodes,
                        lotNos: filters.lotNos,
                        includeAll: true,
                      });
                      await exportWorkbook({
                        rows: normalizeRows(payload?.rows),
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
                </div>
              </div>

              {rows.some((row) => row.openingQuantity < 0 || row.openingWeightKg < 0 || row.balanceQuantity < 0 || row.balanceWeightKg < 0) && (
                <div role="alert" className="border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                  พบยอดติดลบในรายงาน กรุณาตรวจสอบประวัติรับเข้า เบิก ชั่งคืน และการยกเลิกก่อนใช้ยอดนี้อ้างอิงสต็อก
                </div>
              )}
              <div className="grid gap-px border-x border-b border-[#d7dde5] bg-[#d7dde5] shadow-sm md:grid-cols-4">
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Files size={14} className="text-[#102C57]" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      จำนวนรายการ
                    </p>
                  </div>
                  <p className="text-2xl font-semibold text-[#102C57]">{summary.totalCount}</p>
                </div>
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <FileCheck size={14} className="text-emerald-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      น้ำหนักรับเข้าสำเร็จ
                    </p>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatWeight(summary.inboundWeightKg)}</p>
                </div>
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck size={14} className="text-blue-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      น้ำหนักเบิกสำเร็จ
                    </p>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-blue-700">{formatWeight(summary.issueWeightKg)}</p>
                </div>
                <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Scale size={14} className="text-amber-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                      น้ำหนักคงเหลือ
                    </p>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-[#102C57]">
                    {formatWeight(summary.balanceWeightKg)} <span className="text-sm font-medium text-[#7d8795]">Kg</span>
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
              onClick={() => setCurrentViewPage(prev => Math.max(0, prev - 1))}
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
              onClick={() => setCurrentViewPage(prev => Math.min(reportPages.length - 1, prev + 1))}
              disabled={currentViewPage === reportPages.length - 1}
              className="hover:text-[#d4af37] disabled:opacity-30 disabled:hover:text-white transition-colors"
              title="หน้าถัดไป"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      )}

      {/* A4 Paper Sheets Rendering (Landscape) */}
      <div className="weight-scale-report-screen-only movement-summary-print-pages flex flex-col items-center gap-8 py-4">
        {reportPages.length ? (
          reportPages.map((pageRows, pageIndex) => {
            const isClean = reportStyle === "clean";
            return (
            <section 
              key={pageIndex} 
              className={`weight-scale-report-print-shell movement-summary-print-shell w-full max-w-[305mm] bg-white print:shadow-none relative ${
                isClean
                  ? 'border border-[#94a3b8] shadow-[0_4px_24px_rgba(0,0,0,0.06)]'
                  : 'border border-black shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)]'
              } ${
                reportPages.length === 1 ? 'movement-summary-single-print-sheet' : ''
              } ${
                pageIndex === currentViewPage ? 'block' : 'hidden print:block'
              }`}
              style={{ minHeight: '186mm' }}
            >

              
              {/* Corporate Header */}
              <div className={`movement-summary-print-header bg-white px-6 py-3 border-b ${isClean ? 'border-[#94a3b8]' : 'border-black'}`}>
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
                      <h2 className="text-[18px] font-black text-[#102C57] leading-none uppercase">รายงานเคลื่อนไหวสินค้า</h2>
                      {!isClean && <p className="text-[9px] font-bold text-[#d4af37] uppercase tracking-[0.2em] mt-1">Stock Movement Summary Report</p>}
                    </div>

                    <div className="text-[10px] text-[#102C57] leading-tight text-right">
                       <p><span className="font-black text-[#64748b] uppercase text-[8px]">วันที่พิมพ์:</span> {printedAtLabel}</p>
                       <p><span className="font-black text-[#64748b] uppercase text-[8px]">ผู้ออกรายงาน:</span> {profile.username || "System"}</p>
                    </div>
                 </div>

                 <div className={`grid grid-cols-3 border-t pt-2 ${isClean ? 'border-[#94a3b8]' : 'border-black'}`}>
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

              <div className="weight-scale-report-print-body movement-summary-print-body bg-white px-0 py-3 min-h-[150mm] print:min-h-0 print:border-none print:px-0 print:py-2">
                <div className="movement-summary-table-flow overflow-visible">
                  <style dangerouslySetInnerHTML={{ __html: `
                    @page {
                      size: A4 landscape;
                      margin: 0;
                    }
                    .movement-summary-print-shell {
                      background: white !important;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
                      border: none !important;
                      padding: 16px !important;
                      margin: 20px auto !important;
                      max-width: 305mm !important;
                      min-height: 210mm !important;
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
                      padding: 4px 6px !important;
                      vertical-align: middle !important;
                    }
                    .movement-summary-report-table thead tr {
                      background-color: #f8f9fa !important;
                    }
                    .movement-summary-report-table thead tr:last-child {
                      border-bottom: 2px solid #1a1c1e !important;
                    }
                    .movement-summary-report-table tbody tr.date-header-row {
                      background-color: #e5e7eb !important;
                      color: #1a1c1e !important;
                    }
                    .movement-summary-report-table tbody tr.date-header-row td {
                      padding: 0 !important;
                    }
                    .movement-summary-report-table tbody tr.product-header-row {
                      background-color: #f8fafc !important;
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
                      padding: 10px 6px !important;
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
                      font-size: 10.5px !important;
                      font-variant-numeric: tabular-nums !important;
                    }
                    .movement-summary-screen-table th:nth-child(3),
                    .movement-summary-screen-table td:nth-child(3) {
                      padding-left: 3px !important;
                      padding-right: 3px !important;
                      white-space: nowrap !important;
                      word-break: keep-all !important;
                      overflow-wrap: normal !important;
                    }
                    .movement-summary-screen-table th:nth-child(2),
                    .movement-summary-screen-table td:nth-child(2) {
                      white-space: nowrap !important;
                    }
                    .movement-summary-screen-table tbody tr.grand-total-row td:nth-child(n+4) {
                      padding-left: 3px !important;
                      padding-right: 3px !important;
                    }
                    @media print {
                      body {
                        background: white !important;
                      }
                      .movement-summary-print-pages {
                        display: none !important;
                      }
                      .movement-summary-print-shell {
                        display: none !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                        width: 100% !important;
                        max-width: none !important;
                        padding: 0 4mm !important;
                        border: none !important;
                        min-height: auto !important;
                        overflow: visible !important;
                        break-after: page !important;
                        page-break-after: always !important;
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                      }
                      .movement-summary-print-header {
                        position: fixed !important;
                        top: 0 !important;
                        left: 4mm !important;
                        right: 4mm !important;
                        z-index: 10 !important;
                      }
                      .movement-summary-print-body {
                        padding-top: 24mm !important;
                      }
                      .movement-summary-print-shell + .movement-summary-print-shell {
                        break-before: page !important;
                        page-break-before: always !important;
                      }
                      .movement-summary-print-shell:last-child {
                        break-after: auto !important;
                        page-break-after: auto !important;
                      }
                      .movement-summary-screen-table thead {
                        display: table-header-group !important;
                      }
                      .movement-summary-table-flow {
                        margin-left: 0 !important;
                        margin-right: 0 !important;
                        width: 100% !important;
                      }
                      .movement-summary-screen-table {
                        display: table !important;
                      }
                      .movement-summary-print-grid {
                        display: none !important;
                      }
                      .movement-summary-report-table th,
                      .movement-summary-report-table td {
                        font-size: 11px !important;
                        padding: 3px 4px !important;
                      }
                      .movement-summary-screen-table thead tr:last-child th {
                        font-size: 10px !important;
                        padding: 3px 4px !important;
                      }
                      .movement-summary-screen-table tbody td:nth-child(n+4) {
                        font-size: 11px !important;
                        padding: 3px 4px !important;
                      }
                    }
                  ` }} />
                  <div className="movement-summary-print-grid hidden">
                    <div className="movement-summary-print-grid-row movement-summary-print-grid-head">
                      <div className="movement-summary-print-grid-cell justify-center">ลำดับ</div>
                      <div className="movement-summary-print-grid-cell">สินค้า</div>
                      <div className="movement-summary-print-grid-cell justify-center">LOT</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>ยกยอด</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>รับเข้าสำเร็จ</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>เบิกสำเร็จ</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>ชั่งคืน</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>ของเสีย</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>ใช้จริงสุทธิ</div>
                      <div className="movement-summary-print-grid-cell justify-center" style={{ gridColumn: "span 2" }}>คงเหลือ</div>
                    </div>
                    <div className="movement-summary-print-grid-row movement-summary-print-grid-subhead">
                      <div className="movement-summary-print-grid-cell" />
                      <div className="movement-summary-print-grid-cell" />
                      <div className="movement-summary-print-grid-cell" />
                      {Array.from({ length: 7 }).flatMap((_, index) => [
                        <div key={`${index}-qty`} className="movement-summary-print-grid-cell justify-end">จำนวน</div>,
                        <div key={`${index}-weight`} className="movement-summary-print-grid-cell justify-end">น้ำหนัก</div>,
                      ])}
                    </div>
                    {pageRows.map((vRow, vIndex) => {
                      if (vRow.type === "date-header") {
                        return (
                          <div key={vIndex} className="movement-summary-print-grid-row movement-summary-print-grid-date">
                            <div className="movement-summary-print-grid-cell p-0 flex items-stretch text-[#1a1c1e]" style={{ gridColumn: "span 17", backgroundColor: "#e5e7eb", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                              <div className="w-[4px] self-stretch" style={{ backgroundColor: "#102C57", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}></div>
                              <div className="px-3 py-1 flex items-center gap-1.5">
                                <span className="movement-summary-print-grid-date-label">วันที่รายงาน:</span>
                                <span className="font-semibold">{vRow.label}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (vRow.type === "product-header") {
                        return (
                          <div key={vIndex} className="movement-summary-print-grid-row movement-summary-print-grid-product">
                            <div className="movement-summary-print-grid-cell" style={{ gridColumn: "span 17" }}>
                              <span>สินค้า: {vRow.display}</span>
                              <span className="mx-4 text-[#94a3b8]">|</span>
                              <span>LOT: {vRow.lotNo}</span>
                            </div>
                          </div>
                        );
                      }

                      if (vRow.type === "product-subtotal") {
                        const row = vRow.data;
                        const isLastProductSubtotal = pageIndex === reportPages.length - 1
                          && !pageRows.slice(vIndex + 1).some((nextRow) => nextRow.type === "product-subtotal");
                        const totalPairs = [
                          [formatQuantity(row.openingQuantity), formatQuantity(summary.openingQuantity)],
                          [formatWeight(row.openingWeightKg), formatWeight(summary.openingWeightKg)],
                          [formatQuantity(row.inboundQuantity), formatQuantity(summary.inboundQuantity)],
                          [formatWeight(row.inboundWeightKg), formatWeight(summary.inboundWeightKg)],
                          [formatQuantity(row.issueQuantity), formatQuantity(summary.issueQuantity)],
                          [formatWeight(row.issueWeightKg), formatWeight(summary.issueWeightKg)],
                          [formatQuantity(row.returnQuantity), formatQuantity(summary.returnQuantity)],
                          [formatWeight(row.returnWeightKg), formatWeight(summary.returnWeightKg)],
                          [formatQuantity(row.wasteQuantity), formatQuantity(summary.wasteQuantity)],
                          [formatWeight(row.wasteWeightKg), formatWeight(summary.wasteWeightKg)],
                          [formatQuantity(row.actualQuantity), formatQuantity(summary.actualQuantity)],
                          [formatWeight(row.actualWeightKg), formatWeight(summary.actualWeightKg)],
                          [formatQuantity(row.balanceQuantity), formatQuantity(summary.balanceQuantity)],
                          [formatWeight(row.balanceWeightKg), formatWeight(summary.balanceWeightKg)],
                        ];
                        if (isLastProductSubtotal) {
                          return (
                            <div key={vIndex}>
                              <div className="movement-summary-print-grid-row movement-summary-print-grid-total">
                                <div className="movement-summary-print-grid-cell justify-end" style={{ gridColumn: "span 3" }}>
                                  <span className="movement-summary-print-grid-total-label">สรุปรวม {row.productDisplay}</span>
                                </div>
                                {totalPairs.map(([productValue], totalIndex) => (
                                  <div
                                    key={totalIndex}
                                    className={`movement-summary-print-grid-cell justify-end ${
                                      totalIndex >= 12 ? "text-[#102C57]" : ""
                                    }`}
                                  >
                                    <span className="movement-summary-print-grid-total-value">{productValue}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="movement-summary-print-grid-row movement-summary-print-grid-grand-total">
                                <div className="movement-summary-print-grid-cell justify-end" style={{ gridColumn: "span 3" }}>
                                  สรุปรวมทั้งรายงาน
                                </div>
                                {totalPairs.map(([, reportValue], totalIndex) => (
                                  <div
                                    key={totalIndex}
                                    className={`movement-summary-print-grid-cell justify-end ${
                                      totalIndex >= 12 ? "text-[#102C57]" : ""
                                    }`}
                                  >
                                    {reportValue}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={vIndex}>
                              <div className="movement-summary-print-grid-row movement-summary-print-grid-total">
                              <div className="movement-summary-print-grid-cell justify-end" style={{ gridColumn: "span 3" }}>
                                <span className="movement-summary-print-grid-total-label italic">สรุปรวม {row.productDisplay}</span>
                              </div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.openingQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatWeight(row.openingWeightKg)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.inboundQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatWeight(row.inboundWeightKg)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.issueQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatWeight(row.issueWeightKg)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.returnQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatWeight(row.returnWeightKg)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.wasteQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatWeight(row.wasteWeightKg)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.actualQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end"><span className="movement-summary-print-grid-total-value">{formatWeight(row.actualWeightKg)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end text-[#102C57]"><span className="movement-summary-print-grid-total-value">{formatQuantity(row.balanceQuantity)}</span></div>
                              <div className="movement-summary-print-grid-cell justify-end text-[#102C57]"><span className="movement-summary-print-grid-total-value">{formatWeight(row.balanceWeightKg)}</span></div>
                            </div>
                          </div>
                        );
                      }

                      const row = vRow.data;
                      return (
                        <div key={vIndex} className="movement-summary-print-grid-row movement-summary-print-grid-item">
                          <div className="movement-summary-print-grid-cell justify-center">{row.sequence}</div>
                          <div className="movement-summary-print-grid-cell">{row.productCode} - {row.productName}</div>
                          <div className="movement-summary-print-grid-cell justify-center">{row.lotNo}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatQuantity(row.openingQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatWeight(row.openingWeightKg)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatQuantity(row.inboundQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatWeight(row.inboundWeightKg)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatQuantity(row.issueQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatWeight(row.issueWeightKg)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatQuantity(row.returnQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatWeight(row.returnWeightKg)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatQuantity(row.wasteQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatWeight(row.wasteWeightKg)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatQuantity(row.actualQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end">{formatWeight(row.actualWeightKg)}</div>
                          <div className="movement-summary-print-grid-cell justify-end text-[#102C57]">{formatQuantity(row.balanceQuantity)}</div>
                          <div className="movement-summary-print-grid-cell justify-end text-[#102C57]">{formatWeight(row.balanceWeightKg)}</div>
                        </div>
                      );
                    })}
                  </div>
                   <table className="movement-summary-screen-table movement-summary-report-table min-w-full table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[2.5%]" />
                      <col className="w-[23%]" />
                      <col className="w-[9%]" />
                      {Array.from({ length: 14 }).map((_, index) => (
                        <col key={index} className="w-[4.675%]" />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="table-header">
                        <th rowSpan={2} className="text-center font-bold">#</th>
                        <th rowSpan={2} className="text-left font-bold">สินค้า</th>
                        <th rowSpan={2} className="text-center font-bold">LOT</th>
                        <th colSpan={2} className="text-center font-bold">ยกยอด</th>
                        <th colSpan={2} className="text-center font-bold">รับเข้าสำเร็จ</th>
                        <th colSpan={2} className="text-center font-bold">เบิกสำเร็จ</th>
                        <th colSpan={2} className="text-center font-bold">ชั่งคืน</th>
                        <th colSpan={2} className="text-center font-bold">ของเสีย</th>
                        <th colSpan={2} className="text-center font-bold">ใช้จริงสุทธิ</th>
                        <th colSpan={2} className="text-center font-bold">คงเหลือ</th>
                      </tr>
                      <tr className="table-header">
                        {Array.from({ length: 7 }).flatMap((_, index) => [
                          <th key={`${index}-qty`} className="text-center font-bold text-[9px] text-black">จำนวน</th>,
                          <th key={`${index}-weight`} className="text-center font-bold text-[9px] text-black">น้ำหนัก</th>,
                        ])}
                      </tr>
                    </thead>
                    <tbody className="bg-white text-center">
                      {pageRows.map((vRow, vIndex) => {
                        if (vRow.type === "date-header") {
                          return (
                            <tr key={vIndex} className="date-header-row text-[#1a1c1e]">
                              <td colSpan={17} className="text-left">
                                <div className="flex items-stretch min-h-[28px]">
                                  <div className="w-[4px] self-stretch" style={{ backgroundColor: "#102C57", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}></div>
                                  <div className="px-3 py-1 flex items-center">
                                    <span className="font-bold text-[10px] uppercase tracking-wider text-[#1a1c1e]">วันที่รายงาน: {vRow.label}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        if (vRow.type === "product-header") {
                          return null;
                        }

                        if (vRow.type === "product-subtotal") {
                          const row = vRow.data;
                          return (
                            <tr key={vIndex} className="subtotal-row text-[12px]">
                              <td colSpan={3} className="p-2 text-right italic">รวม {row.productDisplay}</td>
                              <td className="p-2 text-right">{formatQuantity(row.openingQuantity)}</td>
                              <td className="p-2 text-right">{formatWeight(row.openingWeightKg)}</td>
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
                            <td className="p-2 text-right">{formatQuantity(row.openingQuantity)}</td>
                            <td className="p-2 text-right">{formatWeight(row.openingWeightKg)}</td>
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
                          <td colSpan={3} className="p-2.5 text-right font-bold uppercase tracking-widest text-[10px]">สรุปรวมทั้งรายงาน (Grand Total)</td>
                          <td className="p-2 text-right font-bold">{formatQuantity(summary.openingQuantity)}</td>
                          <td className="p-2 text-right font-bold">{formatWeight(summary.openingWeightKg)}</td>
                          <td className="p-2 text-right font-bold">{formatQuantity(summary.inboundQuantity)}</td>
                          <td className="p-2 text-right font-bold">{formatWeight(summary.inboundWeightKg)}</td>
                          <td className="p-2 text-right font-bold">{formatQuantity(summary.issueQuantity)}</td>
                          <td className="p-2 text-right font-bold">{formatWeight(summary.issueWeightKg)}</td>
                          <td className="p-2 text-right font-bold">{formatQuantity(summary.returnQuantity)}</td>
                          <td className="p-2 text-right font-bold">{formatWeight(summary.returnWeightKg)}</td>
                          <td className="p-2 text-right font-bold">{formatQuantity(summary.wasteQuantity)}</td>
                          <td className="p-2 text-right font-bold">{formatWeight(summary.wasteWeightKg)}</td>
                          <td className="p-2 text-right font-bold">{formatQuantity(summary.actualQuantity)}</td>
                          <td className="p-2 text-right font-bold">{formatWeight(summary.actualWeightKg)}</td>
                          <td className="p-2 text-right font-bold text-blue-200">{formatQuantity(summary.balanceQuantity)}</td>
                          <td className="p-2 text-right font-bold text-blue-200">{formatWeight(summary.balanceWeightKg)}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

            </section>
            );
          })
        ) : (
          <div className="w-full max-w-[305mm] bg-white border border-black px-4 py-12 text-center text-sm text-[#111111]">
             {isPending ? "กำลังโหลดข้อมูล..." : "ยังไม่พบข้อมูลการเคลื่อนไหวสินค้าตามเงื่อนไขที่เลือก"}
          </div>
        )}
      </div>

      <div className="weight-scale-report-print-only movement-summary-print-only">
        <style dangerouslySetInnerHTML={{ __html: `
          @page {
            size: A4 landscape;
            margin: 4mm;
          }
          @media print {
            .weight-scale-report-screen-only,
            .weight-scale-report-screen-only * {
              display: none !important;
            }
            .movement-summary-print-only {
              display: block !important;
              width: 100% !important;
            }
            .movement-summary-print-only table {
              width: 100% !important;
              table-layout: fixed !important;
              border-collapse: collapse !important;
              color: #102033 !important;
              font-size: 10.8px !important;
              line-height: 1.22 !important;
            }
            .movement-summary-print-only thead {
              display: table-header-group !important;
            }
            .movement-summary-print-only tfoot {
              display: table-row-group !important;
            }
            .movement-summary-print-only th,
            .movement-summary-print-only td {
              border: 0.5px solid #aeb7c2 !important;
              padding: 2.5px 4px !important;
              vertical-align: middle !important;
            }
            .movement-summary-print-only .print-report-header th {
              border: 0 !important;
              padding: 0 0 4px !important;
              background: #ffffff !important;
            }
            .movement-summary-print-only .print-report-meta th {
              border-left: 0 !important;
              border-right: 0 !important;
              border-top: 1px solid #94a3b8 !important;
              border-bottom: 1px solid #94a3b8 !important;
              background: #ffffff !important;
              padding: 3px 4px !important;
            }
            .movement-summary-print-only .table-header th {
              background: #f8f9fa !important;
              color: #111827 !important;
              font-weight: 800 !important;
              text-align: center !important;
            }
            .movement-summary-print-only .table-header:last-child th {
              border-bottom: 2px solid #1f2937 !important;
              font-size: 9.8px !important;
            }
            .movement-summary-print-only .date-header-row td {
              background: #e5e7eb !important;
              color: #111827 !important;
              font-weight: 800 !important;
              padding: 2px 6px !important;
              break-after: avoid !important;
              page-break-after: avoid !important;
            }
            .movement-summary-print-only thead,
            .movement-summary-print-only thead tr,
            .movement-summary-print-only .date-header-row,
            .movement-summary-print-only .subtotal-row,
            .movement-summary-print-only .grand-total-row {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .movement-summary-print-only tbody tr.zebra-row {
              break-inside: auto !important;
              page-break-inside: auto !important;
            }
            .movement-summary-print-only .subtotal-row td {
              background: #f8fafc !important;
              font-weight: 800 !important;
            }
            .movement-summary-print-only .grand-total-row td {
              background: #102C57 !important;
              color: #ffffff !important;
              font-weight: 900 !important;
            }
            .movement-summary-print-only td:nth-child(n+4) {
              text-align: right !important;
              white-space: nowrap !important;
              font-variant-numeric: tabular-nums !important;
            }
          }
        ` }} />
        {printRows.length ? (
          <table className="movement-summary-print-table">
            <colgroup>
              <col className="w-[2.5%]" />
              <col className="w-[23%]" />
              <col className="w-[9%]" />
              {Array.from({ length: 14 }).map((_, index) => (
                <col key={index} className="w-[4.675%]" />
              ))}
            </colgroup>
            <thead>
              <tr className="print-report-header">
                <th colSpan={17}>
                  <div className="flex items-end justify-between">
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
                    <div className="text-center">
                      <div className="text-[17px] font-black text-[#102C57]">รายงานเคลื่อนไหวสินค้า</div>
                    </div>
                    <div className="text-right text-[9px] leading-tight text-[#102C57]">
                      <div><span className="font-black text-[#64748b]">วันที่พิมพ์:</span> {printedAtLabel}</div>
                      <div><span className="font-black text-[#64748b]">ผู้ออกรายงาน:</span> {profile.username || "System"}</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="print-report-meta">
                <th colSpan={5} className="text-left">แผนก: <span className="font-black">{scope.departmentName || "-"}</span></th>
                <th colSpan={7} className="text-center">ช่วงวันที่: <span className="font-black">{reportPeriodLabel}</span></th>
                <th colSpan={5} className="text-right">
                  สินค้า: <span className="font-black">{selectedProducts.length ? `เลือกแล้ว ${selectedProducts.length} รายการ` : "สินค้าทั้งหมด"}</span>
                </th>
              </tr>
              <tr className="table-header">
                <th rowSpan={2} className="text-center font-bold">#</th>
                <th rowSpan={2} className="text-left font-bold">สินค้า</th>
                <th rowSpan={2} className="text-center font-bold">LOT</th>
                <th colSpan={2} className="text-center font-bold">ยกยอด</th>
                <th colSpan={2} className="text-center font-bold">รับเข้าสำเร็จ</th>
                <th colSpan={2} className="text-center font-bold">เบิกสำเร็จ</th>
                <th colSpan={2} className="text-center font-bold">ชั่งคืน</th>
                <th colSpan={2} className="text-center font-bold">ของเสีย</th>
                <th colSpan={2} className="text-center font-bold">ใช้จริงสุทธิ</th>
                <th colSpan={2} className="text-center font-bold">คงเหลือ</th>
              </tr>
              <tr className="table-header">
                {Array.from({ length: 7 }).flatMap((_, index) => [
                  <th key={`${index}-qty`} className="text-center font-bold">จำนวน</th>,
                  <th key={`${index}-weight`} className="text-center font-bold">น้ำหนัก</th>,
                ])}
              </tr>
            </thead>
            <tbody className="bg-white text-center">
              {printRows.map((vRow, vIndex) => {
                if (vRow.type === "date-header") {
                  return (
                    <tr key={vIndex} className="date-header-row text-[#1a1c1e]">
                      <td colSpan={17} className="text-left">วันที่รายงาน: {vRow.label}</td>
                    </tr>
                  );
                }

                if (vRow.type === "product-header") {
                  return null;
                }

                if (vRow.type === "product-subtotal") {
                  const row = vRow.data;
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={3} className="text-right italic">รวม {row.productDisplay}</td>
                      <td>{formatQuantity(row.openingQuantity)}</td>
                      <td>{formatWeight(row.openingWeightKg)}</td>
                      <td>{formatQuantity(row.inboundQuantity)}</td>
                      <td>{formatWeight(row.inboundWeightKg)}</td>
                      <td>{formatQuantity(row.issueQuantity)}</td>
                      <td>{formatWeight(row.issueWeightKg)}</td>
                      <td>{formatQuantity(row.returnQuantity)}</td>
                      <td>{formatWeight(row.returnWeightKg)}</td>
                      <td>{formatQuantity(row.wasteQuantity)}</td>
                      <td>{formatWeight(row.wasteWeightKg)}</td>
                      <td>{formatQuantity(row.actualQuantity)}</td>
                      <td>{formatWeight(row.actualWeightKg)}</td>
                      <td>{formatQuantity(row.balanceQuantity)}</td>
                      <td>{formatWeight(row.balanceWeightKg)}</td>
                    </tr>
                  );
                }

                const row = vRow.data;
                return (
                  <tr key={vIndex} className="zebra-row">
                    <td className="text-center">{row.sequence}</td>
                    <td className="text-left">{row.productCode} - {row.productName}</td>
                    <td className="text-center">{row.lotNo}</td>
                    <td>{formatQuantity(row.openingQuantity)}</td>
                    <td>{formatWeight(row.openingWeightKg)}</td>
                    <td>{formatQuantity(row.inboundQuantity)}</td>
                    <td>{formatWeight(row.inboundWeightKg)}</td>
                    <td>{formatQuantity(row.issueQuantity)}</td>
                    <td>{formatWeight(row.issueWeightKg)}</td>
                    <td>{formatQuantity(row.returnQuantity)}</td>
                    <td>{formatWeight(row.returnWeightKg)}</td>
                    <td>{formatQuantity(row.wasteQuantity)}</td>
                    <td>{formatWeight(row.wasteWeightKg)}</td>
                    <td>{formatQuantity(row.actualQuantity)}</td>
                    <td>{formatWeight(row.actualWeightKg)}</td>
                    <td>{formatQuantity(row.balanceQuantity)}</td>
                    <td>{formatWeight(row.balanceWeightKg)}</td>
                  </tr>
                );
              })}
              <tr className="grand-total-row">
                <td colSpan={3} className="text-right uppercase tracking-widest">สรุปรวมทั้งรายงาน (Grand Total)</td>
                <td>{formatQuantity(summary.openingQuantity)}</td>
                <td>{formatWeight(summary.openingWeightKg)}</td>
                <td>{formatQuantity(summary.inboundQuantity)}</td>
                <td>{formatWeight(summary.inboundWeightKg)}</td>
                <td>{formatQuantity(summary.issueQuantity)}</td>
                <td>{formatWeight(summary.issueWeightKg)}</td>
                <td>{formatQuantity(summary.returnQuantity)}</td>
                <td>{formatWeight(summary.returnWeightKg)}</td>
                <td>{formatQuantity(summary.wasteQuantity)}</td>
                <td>{formatWeight(summary.wasteWeightKg)}</td>
                <td>{formatQuantity(summary.actualQuantity)}</td>
                <td>{formatWeight(summary.actualWeightKg)}</td>
                <td>{formatQuantity(summary.balanceQuantity)}</td>
                <td>{formatWeight(summary.balanceWeightKg)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
      {isLotPickerOpen ? (
        <div className="weight-scale-report-screen-only fixed inset-0 z-[100] flex items-center justify-center bg-[#071a33]/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsLotPickerOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="lot-picker-title" className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden border border-[#d4af37] bg-white shadow-[0_30px_90px_rgba(0,0,0,.35)]">
            <header className="flex items-center justify-between bg-[#102C57] px-5 py-4 text-white">
              <div><p className="text-[10px] font-black tracking-[.2em] text-[#e8bd42]">LOT FILTER</p><h2 id="lot-picker-title" className="mt-1 text-xl font-black">เลือก LOT ที่ต้องการแสดง</h2><p className="mt-1 text-xs text-slate-300">{selectedProducts.map((product) => product.code).join(", ") || "กรุณาเลือกสินค้า"}</p></div>
              <button type="button" onClick={() => setIsLotPickerOpen(false)} aria-label="ปิดหน้าต่าง" className="grid h-10 w-10 place-items-center border border-white/25 hover:bg-white/10"><X size={20} /></button>
            </header>
            <div className="border-b border-slate-200 p-4">
              <label className="flex h-11 items-center gap-3 border border-slate-300 px-3 focus-within:border-[#d4af37]"><Search size={17} className="text-slate-400" /><input autoFocus value={lotSearchQuery} onChange={(event) => setLotSearchQuery(event.target.value)} placeholder="พิมพ์ค้นหาเลข LOT" className="h-full flex-1 bg-transparent text-sm font-semibold text-black outline-none" /></label>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={filteredLotOptions.length > 0 && filteredLotOptions.every((option) => filters.lotNos.includes(option.key))} onChange={(event) => { const visibleKeys = filteredLotOptions.map((option) => option.key); setFilters((current) => ({ ...current, lotNos: event.target.checked ? Array.from(new Set([...current.lotNos, ...visibleKeys])) : current.lotNos.filter((key) => !visibleKeys.includes(key)) })); }} className="h-4 w-4 accent-[#102C57]" />เลือกผลลัพธ์ทั้งหมด</label>
              <span>{filteredLotOptions.length} LOT</span>
            </div>
            <div className="min-h-48 flex-1 overflow-y-auto">
              {isLoadingLots ? <div className="grid min-h-56 place-items-center text-sm font-bold text-slate-500"><Loader2 className="mb-2 animate-spin" />กำลังโหลด LOT...</div> : groupedLotOptions.length ? groupedLotOptions.map((group) => (
                <section key={group.productCode}>
                  <div className="sticky top-0 z-10 border-y border-[#d4af37]/40 bg-[#fff8e7] px-5 py-2.5 text-sm font-black text-[#102C57]">{highlightMatch(`${group.productCode} - ${group.productName}`, lotSearchQuery)}</div>
                  {group.options.map((option) => (
                    <label key={option.key} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-7 py-3 text-sm font-bold text-[#102C57] hover:bg-[#fffdf5]"><input type="checkbox" checked={filters.lotNos.includes(option.key)} onChange={() => setFilters((current) => ({ ...current, lotNos: current.lotNos.includes(option.key) ? current.lotNos.filter((entry) => entry !== option.key) : [...current.lotNos, option.key] }))} className="h-4 w-4 accent-[#102C57]" /><span>{highlightMatch(option.lotNo, lotSearchQuery)}</span></label>
                  ))}
                </section>
              )) : <div className="grid min-h-56 place-items-center text-sm font-semibold text-slate-400">ไม่พบ LOT ที่ตรงกับเงื่อนไข</div>}
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4"><span className="text-sm text-slate-600">เลือกแล้ว <strong className="text-[#102C57]">{filters.lotNos.length}</strong> LOT</span><div className="flex gap-2"><button type="button" onClick={() => { setFilters((current) => ({ ...current, lotNos: [] })); }} className="h-10 border border-slate-300 px-4 text-sm font-bold text-[#102C57]">ล้างทั้งหมด</button><button type="button" onClick={() => { setIsLotPickerOpen(false); loadRows({ ...filters, page: 1 }); }} className="h-10 bg-[#102C57] px-5 text-sm font-bold text-white">ใช้ตัวกรอง</button></div></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
