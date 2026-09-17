"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSearch,
  Files,
  ListOrdered,
  Loader2,
  Printer,
  RefreshCw,
  Scale,
  X,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { fetchProductionPrisonIssueSummaryReport } from "@/features/production-line/services/productionPrisonClient";
import { fetchProductionStockIssueSummaryReport } from "@/features/production-line/services/productionStockIssueClient";
import { useUserProfile } from "@/lib/useUserProfile";

const LIMIT_OPTIONS = [20, 50, 100];

const DEFAULT_REPORT_CONFIG = Object.freeze({
  eyebrow: "รายงานเบิกผลิตภัณฑ์",
  badge: "ภาพรวม",
  title: "รายงานสรุปเบิก",
  printTitle: "รายงานสรุปเบิก",
  excelWorksheetName: "รายงานสรุปเบิก",
  excelTitle: "รายงานสรุปเบิกผลิตภัณฑ์",
  emptyMessage: "ยังไม่พบข้อมูลรายงานสรุปเบิกตามเงื่อนไขที่เลือก",
  hideIssueTypeFilter: false,
  hideIssueTypeColumn: false,
});

const ISSUE_STATUS_OPTIONS = Object.freeze([
  { value: "confirmed", label: "เบิกสำเร็จ" },
  { value: "voided", label: "ยกเลิกเบิก" },
]);

const ISSUE_TYPE_VISUALS = Object.freeze({
  KPF: {
    logoSrc: "/brand/LOGO-KPF1.png",
    logoAlt: "KPF",
  },
  PB: {
    logoSrc: "/brand/LOGO PB1.png",
    logoAlt: "PB",
  },
  PRISON: {
    shortLabel: "RJ",
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

function highlightText(text, search) {
  if (!search || !text) return text;
  const parts = String(text).split(new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === search.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 text-[#102C57] font-black rounded px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => {
    const quantity = Number(row?.quantity || 0);
    const totalWeightKg = Number(row?.totalWeightKg || 0);
    const returnQuantity = Number(row?.returnQuantity || 0);
    const returnWeightKg = Number(row?.returnWeightKg || 0);
    return {
      issueStatus: row?.issueStatus === "voided" ? "voided" : "confirmed",
      issueDate: String(row?.issueDate || "").trim(),
      lotNo: String(row?.lotNo || "").trim() || "-",
      barcodes: Array.isArray(row?.barcodes) ? row.barcodes : [],
      issueType: String(row?.issueType || "").trim().toUpperCase(),
      productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
      productName: String(row?.productName || "").trim() || "-",
      quantity,
      totalWeightKg,
      returnQuantity,
      returnWeightKg,
      actualQuantity: Number(row?.actualQuantity ?? Math.max(0, quantity - returnQuantity)),
      actualWeightKg: Number(row?.actualWeightKg ?? Math.max(0, totalWeightKg - returnWeightKg)),
      returnDates: Array.isArray(row?.returnDates) ? row.returnDates : [],
    };
  });
}

function normalizeSummary(summary) {
  const totalQuantity = Number(summary?.totalQuantity || 0);
  const totalWeightKg = Number(summary?.totalWeightKg || 0);
  const totalReturnQuantity = Number(summary?.totalReturnQuantity || 0);
  const totalReturnWeightKg = Number(summary?.totalReturnWeightKg || 0);
  return {
    totalCount: Number(summary?.totalCount || 0),
    totalQuantity,
    totalWeightKg,
    totalReturnQuantity,
    totalReturnWeightKg,
    totalActualQuantity: Number(
      summary?.totalActualQuantity ?? Math.max(0, totalQuantity - totalReturnQuantity)
    ),
    totalActualWeightKg: Number(
      summary?.totalActualWeightKg ?? Math.max(0, totalWeightKg - totalReturnWeightKg)
    ),
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
  const normalizedStatuses = Array.isArray(filters?.issueStatuses)
    ? Array.from(
        new Set(
          filters.issueStatuses
            .map((value) => String(value || "").trim().toLowerCase())
            .filter((value) => ISSUE_STATUS_OPTIONS.some((option) => option.value === value))
        )
      )
    : [];

  return {
    dateFrom: String(filters?.dateFrom || "").trim(),
    dateTo: String(filters?.dateTo || "").trim(),
    issueTypes: Array.isArray(filters?.issueTypes)
      ? Array.from(
          new Set(
            filters.issueTypes
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          )
        )
      : filters?.issueType && filters.issueType !== "ALL"
      ? [String(filters.issueType).trim().toUpperCase()]
      : [],
    issueStatuses: normalizedStatuses.length ? normalizedStatuses : ["confirmed"],
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

function getIssueTypeLabel(issueTypes, value) {
  return issueTypes.find((option) => option.value === value)?.label || value;
}

function getIssueTypeSummaryLabel(issueTypes, selectedValues) {
  if (!selectedValues || selectedValues.length === 0) return "ทุกประเภท";
  if (selectedValues.length === 1) return getIssueTypeLabel(issueTypes, selectedValues[0]);
  return `เลือกแล้ว ${selectedValues.length} ประเภท`;
}

function getIssueStatusSummaryLabel(selectedValues) {
  if (!selectedValues || selectedValues.length === 0) return "เบิกแล้ว";
  if (selectedValues.length === 1) {
    return ISSUE_STATUS_OPTIONS.find((option) => option.value === selectedValues[0])?.label || selectedValues[0];
  }
  return `เลือกแล้ว ${selectedValues.length} สถานะ`;
}

function formatFilenameDateRange(dateFrom, dateTo) {
  const safeFrom = String(dateFrom || "").replaceAll("-", "") || "all";
  const safeTo = String(dateTo || "").replaceAll("-", "") || safeFrom;
  return `${safeFrom}_${safeTo}`;
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

async function exportSummaryWorkbook({
  rows,
  filters,
  summary,
  scope,
  selectedProducts,
  issueTypes,
  reportConfig,
}) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(reportConfig.excelWorksheetName);
  const columns = [
    { header: "ลำดับ", key: "sequence", width: 10 },
    { header: "วันที่", key: "issueDateLabel", width: 16 },
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "สินค้า", key: "productDisplay", width: 46 },
  ];

  if (!reportConfig.hideIssueTypeColumn) {
    columns.push({ header: "ประเภทการเบิก", key: "issueTypeLabel", width: 20 });
  }

  columns.push(
    { header: "จำนวนเบิก", key: "quantity", width: 14 },
    { header: "น้ำหนักเบิก (Kg)", key: "totalWeightKg", width: 18 },
    { header: "จำนวนคืน", key: "returnQuantity", width: 14 },
    { header: "น้ำหนักคืน (Kg)", key: "returnWeightKg", width: 18 },
    { header: "จำนวนใช้จริง", key: "actualQuantity", width: 14 },
    { header: "น้ำหนักใช้จริง (Kg)", key: "actualWeightKg", width: 18 }
  );

  worksheet.columns = columns;

  const lastColumnLetter = String.fromCharCode(64 + columns.length);
  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  worksheet.getCell("A1").value = reportConfig.excelTitle;
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
  } | ประเภทการเบิก: ${getIssueTypeSummaryLabel(issueTypes, filters.issueTypes)}`;
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

  // Sort rows by product first
  const sortedRows = [...rows].sort((left, right) => {
    const prodCompare = left.productCode.localeCompare(right.productCode);
    if (prodCompare !== 0) return prodCompare;
    const dateCompare = left.issueDate.localeCompare(right.issueDate);
    if (dateCompare !== 0) return dateCompare;
    return left.lotNo.localeCompare(right.lotNo);
  });

  const groups = new Map();
  sortedRows.forEach(row => {
    const key = `${row.productCode}|${row.issueStatus}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  });

  let excelSequence = 1;
  groups.forEach((groupRows) => {
    const productCode = groupRows[0].productCode;
    const statusSuffix = groupRows[0].issueStatus === "voided" ? " (ยกเลิกเบิก)" : "";
    let productQty = 0;
    let productWeight = 0;
    let productReturnQty = 0;
    let productReturnWeight = 0;
    let productActualQty = 0;
    let productActualWeight = 0;
    const productName = groupRows[0].productName;

    groupRows.forEach(row => {
      const values = {
        sequence: excelSequence++,
        issueDateLabel: formatDateLabel(row.issueDate),
        lotNo: row.lotNo,
        productDisplay: `${row.productCode} - ${row.productName}${row.issueStatus === "voided" ? " (ยกเลิกเบิก)" : ""}`,
        issueTypeLabel: getIssueTypeLabel(issueTypes, row.issueType),
        quantity: row.quantity,
        totalWeightKg: row.totalWeightKg,
        returnQuantity: row.returnQuantity,
        returnWeightKg: row.returnWeightKg,
        actualQuantity: row.actualQuantity,
        actualWeightKg: row.actualWeightKg,
      };
      worksheet.addRow(values);
      productQty += row.quantity;
      productWeight += row.totalWeightKg;
      productReturnQty += row.returnQuantity;
      productReturnWeight += row.returnWeightKg;
      productActualQty += row.actualQuantity;
      productActualWeight += row.actualWeightKg;
    });

    // Add product subtotal row
    const subtotalValues = {
      sequence: "",
      issueDateLabel: "",
      lotNo: "",
      productDisplay: `สรุปรวม ${productCode}${statusSuffix}`,
      issueTypeLabel: reportConfig.hideIssueTypeColumn ? undefined : "",
      quantity: Number(productQty.toFixed(3)),
      totalWeightKg: Number(productWeight.toFixed(2)),
      returnQuantity: Number(productReturnQty.toFixed(3)),
      returnWeightKg: Number(productReturnWeight.toFixed(2)),
      actualQuantity: Number(productActualQty.toFixed(3)),
      actualWeightKg: Number(productActualWeight.toFixed(2)),
    };
    const subtotalRow = worksheet.addRow(subtotalValues);
    subtotalRow.font = { bold: true };
    subtotalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
  });

  const summaryValues = {
    sequence: "",
    issueDateLabel: "",
    lotNo: "",
    productDisplay: "สรุปรวมเฉพาะเบิกสำเร็จ",
    issueTypeLabel: reportConfig.hideIssueTypeColumn ? undefined : "",
    quantity: summary.totalQuantity,
    totalWeightKg: summary.totalWeightKg,
    returnQuantity: summary.totalReturnQuantity,
    returnWeightKg: summary.totalReturnWeightKg,
    actualQuantity: summary.totalActualQuantity,
    actualWeightKg: summary.totalActualWeightKg,
  };
  const summaryRow = worksheet.addRow(summaryValues);
  summaryRow.font = { bold: true, color: { argb: "FF102C57" } };
  summaryRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      if (rowNumber > 6) {
        cell.alignment = { vertical: "top", wrapText: true };
      }
    });
  });

  worksheet.getColumn("totalWeightKg").numFmt = "#,##0.00";
  worksheet.getColumn("returnWeightKg").numFmt = "#,##0.00";
  worksheet.getColumn("actualWeightKg").numFmt = "#,##0.00";
  worksheet.views = [{ state: "frozen", ySplit: 6 }];
  worksheet.autoFilter = `A6:${lastColumnLetter}6`;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${reportConfig.excelFilePrefix}_${formatFilenameDateRange(filters.dateFrom, filters.dateTo)}.xlsx`
  );
}

export default function ProductionStockIssueSummaryReportPageClient({
  scope,
  issueTypes,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
  reportConfig = {},
}) {
  const resolvedReportConfig = {
    ...DEFAULT_REPORT_CONFIG,
    ...reportConfig,
  };
  const isPrisonReport = resolvedReportConfig.allowedIssueTypes?.length === 1
    && resolvedReportConfig.allowedIssueTypes[0] === "PRISON";
  const fetchIssueSummaryReport = isPrisonReport
    ? fetchProductionPrisonIssueSummaryReport
    : fetchProductionStockIssueSummaryReport;

  const normalizedProductOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );
  const [rows, setRows] = useState(() => normalizeRows(initialRows));
  const [summary, setSummary] = useState(() => normalizeSummary(initialSummary));
  const [filters, setFilters] = useState(() => normalizeFilters(initialFilters, initialPagination));
  const [pagination, setPagination] = useState(() => normalizePagination(initialPagination));
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isIssueTypePickerOpen, setIsIssueTypePickerOpen] = useState(false);
  const [isIssueStatusPickerOpen, setIsIssueStatusPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const matchLot = String(row.lotNo || "").toLowerCase().includes(q);
      const matchBarcode = Array.isArray(row.barcodes) && row.barcodes.some((bc) =>
        String(bc || "").toLowerCase().includes(q)
      );
      return matchLot || matchBarcode;
    });
  }, [rows, searchQuery]);

  const filteredSummary = useMemo(() => {
    return filteredRows.filter((row) => row.issueStatus !== "voided").reduce(
      (sum, row) => ({
        totalQuantity: Number((sum.totalQuantity + (row.quantity || 0)).toFixed(3)),
        totalWeightKg: Number((sum.totalWeightKg + (row.totalWeightKg || 0)).toFixed(3)),
        totalReturnQuantity: Number((sum.totalReturnQuantity + (row.returnQuantity || 0)).toFixed(3)),
        totalReturnWeightKg: Number((sum.totalReturnWeightKg + (row.returnWeightKg || 0)).toFixed(3)),
        totalActualQuantity: Number((sum.totalActualQuantity + (row.actualQuantity || 0)).toFixed(3)),
        totalActualWeightKg: Number((sum.totalActualWeightKg + (row.actualWeightKg || 0)).toFixed(3)),
      }),
      {
        totalQuantity: 0,
        totalWeightKg: 0,
        totalReturnQuantity: 0,
        totalReturnWeightKg: 0,
        totalActualQuantity: 0,
        totalActualWeightKg: 0,
      }
    );
  }, [filteredRows]);

  const issueTypePickerRef = useRef(null);
  const issueStatusPickerRef = useRef(null);
  const productPickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        issueTypePickerRef.current &&
        !issueTypePickerRef.current.contains(event.target)
      ) {
        setIsIssueTypePickerOpen(false);
      }
      if (
        issueStatusPickerRef.current &&
        !issueStatusPickerRef.current.contains(event.target)
      ) {
        setIsIssueStatusPickerOpen(false);
      }
      if (
        productPickerRef.current &&
        !productPickerRef.current.contains(event.target)
      ) {
        setIsProductPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedProducts = useMemo(
    () =>
      normalizedProductOptions.filter((option) =>
        filters.productCodes.includes(option.code)
      ),
    [filters.productCodes, normalizedProductOptions]
  );

  const reportPeriodLabel = useMemo(() => {
    const dateFromLabel = formatDateLabel(filters.dateFrom);
    const dateToLabel = formatDateLabel(filters.dateTo);
    if (filters.dateFrom === filters.dateTo) {
      return dateFromLabel;
    }
    return `${dateFromLabel} - ${dateToLabel}`;
  }, [filters.dateFrom, filters.dateTo]);

  const productSummaryLabel = useMemo(() => {
    if (!selectedProducts.length) {
      return "ทุกสินค้าในรายงาน";
    }
    if (selectedProducts.length === 1) {
      return `${selectedProducts[0].code} ${selectedProducts[0].name}`;
    }
    return `เลือกแล้ว ${selectedProducts.length} รายการ`;
  }, [selectedProducts]);

  const issueTypeSummaryLabel = useMemo(
    () => getIssueTypeSummaryLabel(issueTypes, filters.issueTypes),
    [filters.issueTypes, issueTypes]
  );
  const issueStatusSummaryLabel = useMemo(
    () => getIssueStatusSummaryLabel(filters.issueStatuses),
    [filters.issueStatuses]
  );

  const applyPayload = (payload) => {
    setRows(normalizeRows(payload?.rows));
    setSummary(normalizeSummary(payload?.summary));
    setPagination(normalizePagination(payload?.pagination));
  };

  const [currentViewPage, setCurrentViewPage] = useState(0);
  const profile = useUserProfile();

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const issuePrintRows = useMemo(() => {
    if (!filteredRows.length) return [];

    // Sort rows by product first
    const sorted = [...filteredRows].sort((left, right) => {
      const prodCompare = left.productCode.localeCompare(right.productCode);
      if (prodCompare !== 0) return prodCompare;
      const dateCompare = left.issueDate.localeCompare(right.issueDate);
      if (dateCompare !== 0) return dateCompare;
      return left.lotNo.localeCompare(right.lotNo);
    });

    // Group rows by product code to easily insert subtotals
    const virtualRows = [];
    let seq = 1;
    
    const groups = new Map();
    sorted.forEach(row => {
      const key = `${row.productCode}|${row.issueStatus}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    });

    groups.forEach((groupRows) => {
      const productCode = groupRows[0].productCode;
      const statusLabel = groupRows[0].issueStatus === "voided" ? "ยกเลิกเบิก" : "";
      let productQty = 0;
      let productWeight = 0;
      let productReturnQty = 0;
      let productReturnWeight = 0;
      let productActualQty = 0;
      let productActualWeight = 0;
      const productName = groupRows[0].productName;

      groupRows.forEach(row => {
        virtualRows.push({ 
          type: 'item', 
          data: { ...row, sequence: seq++ } 
        });
        productQty += row.quantity;
        productWeight += row.totalWeightKg;
        productReturnQty += row.returnQuantity;
        productReturnWeight += row.returnWeightKg;
        productActualQty += row.actualQuantity;
        productActualWeight += row.actualWeightKg;
      });

      virtualRows.push({
        type: 'product-footer',
        data: {
          productCode,
          productName: `${productName} (${statusLabel})`,
          statusLabel,
          quantity: Number(productQty.toFixed(3)),
          totalWeightKg: Number(productWeight.toFixed(2)),
          returnQuantity: Number(productReturnQty.toFixed(3)),
          returnWeightKg: Number(productReturnWeight.toFixed(2)),
          actualQuantity: Number(productActualQty.toFixed(3)),
          actualWeightKg: Number(productActualWeight.toFixed(2)),
        }
      });
    });

    // Add grand footer at the very end
    virtualRows.push({
      type: 'grand-footer',
      data: {
        quantity: filteredSummary.totalQuantity,
        totalWeightKg: filteredSummary.totalWeightKg,
        returnQuantity: filteredSummary.totalReturnQuantity,
        returnWeightKg: filteredSummary.totalReturnWeightKg,
        actualQuantity: filteredSummary.totalActualQuantity,
        actualWeightKg: filteredSummary.totalActualWeightKg,
      }
    });

    return virtualRows;
  }, [filteredRows, filteredSummary]);

  const reportPages = useMemo(() => {
    if (!issuePrintRows.length) return [];

    let pages = [];
    let currentPage = [];
    let currentWeight = 0;
    const FIRST_PAGE_LIMIT = 63; 
    const OTHER_PAGE_LIMIT = 63;

    issuePrintRows.forEach(row => {
      let rowWeight = 1;
      if (row.type === 'product-footer') rowWeight = 1.5;
      if (row.type === 'grand-footer') rowWeight = 1.5;
      
      const limit = pages.length === 0 ? FIRST_PAGE_LIMIT : OTHER_PAGE_LIMIT;

      if (currentWeight + rowWeight > limit) {
        pages.push(currentPage);
        currentPage = [];
        currentWeight = 0;
      }
      currentPage.push(row);
      currentWeight += rowWeight;
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }, [issuePrintRows]);

  const loadReport = (nextFilters) => {
    setErrorMessage("");
    setFeedback("");
    setIsIssueTypePickerOpen(false);
    setIsIssueStatusPickerOpen(false);
    setIsProductPickerOpen(false);

    startTransition(async () => {
      try {
        const payload = await fetchIssueSummaryReport({
          dateFrom: nextFilters.dateFrom,
          dateTo: nextFilters.dateTo,
          issueTypes: nextFilters.issueTypes.length > 0 ? nextFilters.issueTypes : null,
          issueStatuses: nextFilters.issueStatuses.length > 0 ? nextFilters.issueStatuses : ["confirmed"],
          productCodes: nextFilters.productCodes,
          includeAll: true, // Always fetch all for visual paging
          page: 1,
          limit: 1000,
        });

        applyPayload(payload);
        setCurrentViewPage(0);
        setFeedback("อัปเดตรายงานสรุปเรียบร้อย");
      } catch (error) {
        setErrorMessage(error?.message || "ไม่สามารถโหลดรายงานสรุปได้");
      }
    });
  };

  const handleFieldChange = (key, value, { resetPage = true } = {}) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: resetPage ? 1 : current.page,
    }));
  };

  const toggleProductCode = (productCode) => {
    const normalizedCode = String(productCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setFilters((current) => {
      const exists = current.productCodes.includes(normalizedCode);
      return {
        ...current,
        productCodes: exists
          ? current.productCodes.filter((code) => code !== normalizedCode)
          : [...current.productCodes, normalizedCode],
        page: 1,
      };
    });
  };

  const toggleIssueType = (value) => {
    const normalizedValue = String(value || "").trim().toUpperCase();
    if (!normalizedValue) {
      return;
    }

    setFilters((current) => {
      const exists = current.issueTypes.includes(normalizedValue);
      return {
        ...current,
        issueTypes: exists
          ? current.issueTypes.filter((entry) => entry !== normalizedValue)
          : [...current.issueTypes, normalizedValue],
        page: 1,
      };
    });
  };

  const toggleIssueStatus = (value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (!ISSUE_STATUS_OPTIONS.some((option) => option.value === normalizedValue)) {
      return;
    }

    setFilters((current) => ({
      ...current,
      issueStatuses: [normalizedValue],
      page: 1,
    }));
  };

  const handleChangePage = (nextPage) => {
    const nextFilters = {
      ...filters,
      page: Math.max(1, nextPage),
    };
    setFilters(nextFilters);
    loadReport(nextFilters);
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    setFeedback("");
    setErrorMessage("");

    try {
      const payload = await fetchIssueSummaryReport({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        issueTypes: filters.issueTypes.length > 0 ? filters.issueTypes : null,
        issueStatuses: filters.issueStatuses.length > 0 ? filters.issueStatuses : ["confirmed"],
        productCodes: filters.productCodes,
        includeAll: true,
        page: 1,
        limit: filters.limit,
      });

      const exportRows = normalizeRows(payload?.rows);
      if (!exportRows.length) {
        throw new Error("ไม่พบข้อมูลสำหรับส่งออกรายงาน");
      }

      await exportSummaryWorkbook({
        rows: exportRows,
        filters,
        summary: normalizeSummary(payload?.summary),
        scope,
        selectedProducts,
        issueTypes,
        reportConfig: resolvedReportConfig,
      });

      setFeedback("ส่งออกรายงาน Excel เรียบร้อย");
    } catch (error) {
      setErrorMessage(error?.message || "ส่งออกรายงานไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintReport = () => {
    setFeedback("");
    setErrorMessage("");
    window.print();
  };

  return (
    <div className="weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626]">
      <div className="weight-scale-report-screen-only">
        <WeightScalePrimaryHeader
          eyebrow={resolvedReportConfig.eyebrow}
          badge={resolvedReportConfig.badge}
          title={resolvedReportConfig.title}
        />
      </div>

      <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <section className="weight-scale-report-print-shell border border-[#d7dde5] border-t-2 border-t-[#d4af37] bg-white">
          <div className="weight-scale-report-screen-only border-b border-[#d7dde5] bg-[#fcfbf7] px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_auto] items-end">
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  จากวันที่
                </span>
                <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-white px-4">
                  <CalendarRange size={16} className="text-[#7d8795]" />
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) => handleFieldChange("dateFrom", event.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  ถึงวันที่
                </span>
                <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-white px-4">
                  <CalendarRange size={16} className="text-[#7d8795]" />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) => handleFieldChange("dateTo", event.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  ค้นหา Lot / บาร์โค้ด
                </span>
                <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-white px-4">
                  <FileSearch size={16} className="text-[#7d8795]" />
                  <input
                    type="text"
                    placeholder="ระบุเลข Lot หรือ บาร์โค้ด..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-[#7d8795] hover:text-[#102C57] focus:outline-none"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => loadReport(filters)}
                  disabled={isPending}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 border border-[#d4af37] bg-[#102C57] px-5 text-sm font-black uppercase tracking-[0.14em] text-[#fff7df] transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
                >
                  {isPending ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <FileSearch size={16} />
                  )}
                  โหลดรายงาน
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-[#eef2f6] pt-5 lg:flex-row lg:items-end lg:justify-between animate-fadeIn">
              <div className="flex flex-wrap items-end gap-4">
                {!resolvedReportConfig.hideIssueTypeFilter ? (
                  <div className="relative block w-44" ref={issueTypePickerRef}>
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                      ประเภทการเบิก
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsIssueTypePickerOpen((current) => !current)}
                      className="mt-2 flex h-12 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left font-semibold text-[#102C57]"
                    >
                      <span className="min-w-0 truncate">
                        {issueTypeSummaryLabel}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-[#7d8795] transition ${
                          isIssueTypePickerOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {isIssueTypePickerOpen ? (
                      <div className="absolute left-0 right-0 z-20 mt-2 border border-[#d7dde5] bg-white shadow-[0_18px_40px_rgba(16,44,87,0.14)]">
                        <div className="flex items-center justify-between border-b border-[#eef2f6] px-4 py-3">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7d8795]">
                            เลือกได้หลายประเภท
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsIssueTypePickerOpen(false)}
                            className="inline-flex h-8 w-8 items-center justify-center border border-[#d7dde5] text-[#5f6b7b] transition hover:border-[#102C57] hover:text-[#102C57]"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="max-h-72 overflow-y-auto py-2">
                          {issueTypes.map((option) => {
                            const checked = filters.issueTypes.includes(option.value);
                            const visual = ISSUE_TYPE_VISUALS[option.value];
                            return (
                              <label
                                key={option.value}
                                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[#f8fafc]"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleIssueType(option.value)}
                                  className="h-4 w-4 border-[#cdd6e1] text-[#102C57] focus:ring-[#d4af37]"
                                />
                                <span className="flex min-w-0 flex-1 items-center gap-3">
                                  {visual?.logoSrc ? (
                                    <span className="flex h-6 w-10 items-center justify-center overflow-hidden">
                                      <Image
                                        src={visual.logoSrc}
                                        alt={visual.logoAlt}
                                        width={30}
                                        height={16}
                                        className="h-auto max-h-4 w-auto object-contain"
                                      />
                                    </span>
                                  ) : (
                                    <span className="inline-flex h-6 min-w-[2.4rem] items-center justify-center rounded border border-[#eadfb8] bg-white px-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#7f5d00]">
                                      {visual?.shortLabel || "TYPE"}
                                    </span>
                                  )}
                                  <span className="text-sm font-semibold text-[#102C57]">
                                    {option.label}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="block w-44">
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                      ประเภทการเบิก
                    </span>
                    <div className="mt-2 flex h-12 items-center border border-[#d7dde5] bg-white px-4 text-sm font-semibold text-[#102C57]">
                      {issueTypeSummaryLabel}
                    </div>
                  </div>
                )}

                <div className="relative block w-40" ref={issueStatusPickerRef}>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    สถานะรายการ
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsIssueStatusPickerOpen((current) => !current)}
                    className="mt-2 flex h-12 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left font-semibold text-[#102C57]"
                  >
                    <span className="min-w-0 truncate">
                      {issueStatusSummaryLabel}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-[#7d8795] transition ${
                        isIssueStatusPickerOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isIssueStatusPickerOpen ? (
                    <div className="absolute left-0 right-0 z-20 mt-2 border border-[#d7dde5] bg-white shadow-[0_18px_40px_rgba(16,44,87,0.14)]">
                      <div className="flex items-center justify-between border-b border-[#eef2f6] px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7d8795]">
                          เลือกสถานะ
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsIssueStatusPickerOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center border border-[#d7dde5] text-[#5f6b7b] transition hover:border-[#102C57] hover:text-[#102C57]"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="py-2">
                        {ISSUE_STATUS_OPTIONS.map((option) => {
                          const checked = filters.issueStatuses.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[#f8fafc]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleIssueStatus(option.value)}
                                className="h-4 w-4 border-[#cdd6e1] text-[#102C57] focus:ring-[#d4af37]"
                              />
                              <span className={`inline-flex border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${
                                option.value === "confirmed"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              }`}>
                                {option.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="relative block w-56" ref={productPickerRef}>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    เลือกสินค้า
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsProductPickerOpen((current) => !current)}
                    className="mt-2 flex h-12 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left font-semibold text-[#102C57]"
                  >
                    <span className="min-w-0 truncate">
                      {productSummaryLabel}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-[#7d8795] transition ${
                        isProductPickerOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isProductPickerOpen ? (
                    <div className="absolute left-0 z-20 mt-2 w-[24rem] border border-[#d7dde5] bg-white shadow-[0_18px_40px_rgba(16,44,87,0.14)]">
                      <div className="flex items-center justify-between border-b border-[#eef2f6] px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7d8795]">
                          เลือกได้หลายรายการ
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsProductPickerOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center border border-[#d7dde5] text-[#5f6b7b] transition hover:border-[#102C57] hover:text-[#102C57]"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="max-h-72 overflow-y-auto py-2">
                        {normalizedProductOptions.map((product) => {
                          const checked = filters.productCodes.includes(product.code);
                          return (
                            <label
                              key={product.code}
                              className="flex cursor-pointer items-start gap-3 px-4 py-2 transition hover:bg-[#f8fafc]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleProductCode(product.code)}
                                className="mt-1 h-4 w-4 border-[#cdd6e1] text-[#102C57] focus:ring-[#d4af37]"
                              />
                              <span className="min-w-0 text-sm text-[#102C57]">
                                <span className="block font-black">{product.code}</span>
                                <span className="mt-0.5 block text-[13px] leading-6 text-[#334155]">
                                  {product.name}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="weight-scale-report-screen-only inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#173b67]"
                >
                  <Printer size={14} />
                  พิมพ์รายงาน
                </button>

                <button
                  type="button"
                  onClick={() => void handleExportReport()}
                  disabled={isExporting || isPending}
                  className="weight-scale-report-screen-only inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-white px-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] hover:text-[#7f5d00] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExporting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  ส่งออก Excel
                </button>
              </div>
            </div>

            {feedback ? (
              <p className="mt-4 text-sm font-semibold text-emerald-700">{feedback}</p>
            ) : null}
            {errorMessage ? (
              <p className="mt-4 text-sm font-semibold text-rose-600">{errorMessage}</p>
            ) : null}
          </div>

          <p className="px-5 py-2 text-sm text-amber-800">ยอดรวมด้านล่างนับเฉพาะเบิกสำเร็จ รายการยกเลิกเบิกแสดงแยกกลุ่มและไม่รวมในยอดใช้งาน</p>
          <div className="weight-scale-report-screen-only grid gap-px border-x border-b border-[#d7dde5] bg-[#d7dde5] md:grid-cols-2 xl:grid-cols-4 shadow-sm">
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Files size={14} className="text-[#102C57]" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  รายการสรุป
                </p>
              </div>
              <p className="text-2xl font-semibold text-[#102C57]">{summary.totalCount}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <ListOrdered size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  เบิกรวม
                </p>
              </div>
              <p className="mt-1 text-xl font-semibold text-[#102C57]">
                {formatQuantity(summary.totalQuantity)} <span className="text-xs text-[#7d8795]">หน่วย</span>
              </p>
              <p className="text-sm font-semibold text-[#64748b]">{formatWeight(summary.totalWeightKg)} Kg</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw size={14} className="text-rose-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  คืนรวม
                </p>
              </div>
              <p className="mt-1 text-xl font-semibold text-rose-700">
                {formatQuantity(summary.totalReturnQuantity)} <span className="text-xs text-[#7d8795]">หน่วย</span>
              </p>
              <p className="text-sm font-semibold text-[#64748b]">{formatWeight(summary.totalReturnWeightKg)} Kg</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Scale size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  ใช้จริงรวม
                </p>
              </div>
              <p className="mt-1 text-xl font-semibold text-emerald-700">
                {formatQuantity(summary.totalActualQuantity)} <span className="text-xs text-[#7d8795]">หน่วย</span>
              </p>
              <p className="text-sm font-semibold text-[#64748b]">{formatWeight(summary.totalActualWeightKg)} Kg</p>
            </div>
          </div>
        </section>

        {/* Visual Paging Controls */}
        {reportPages.length > 1 && (
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

        {/* A4 Paper Sheets Rendering */}
        <div className="weight-scale-report-screen-only issue-summary-preview-pages flex flex-col items-center gap-8 py-4">
          {reportPages.length ? (
            reportPages.map((pageRows, pageIndex) => (
              <section 
                key={pageIndex} 
                className={`weight-scale-report-print-shell summary-issue-report-print-shell w-full max-w-[210mm] bg-white border border-black shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] print:max-w-none print:shadow-none relative ${
                  pageIndex === currentViewPage ? 'block' : 'hidden print:block'
                }`}
                style={{ minHeight: '296mm' }}
              >
                {/* Compact Corporate Header */}
                <div className="bg-white px-6 py-3 border-b border-black">
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
                        <h2 className="text-[18px] font-black text-[#102C57] leading-none uppercase">{resolvedReportConfig.printTitle}</h2>
                        <p className="text-[9px] font-bold text-[#d4af37] uppercase tracking-[0.2em] mt-1">Stock Issue Summary Report</p>
                      </div>

                      <div className="text-[10px] text-[#102C57] leading-tight text-right">
                         <p><span className="font-black text-[#64748b] uppercase text-[8px]">วันที่พิมพ์:</span> {printedAtLabel}</p>
                         <p><span className="font-black text-[#64748b] uppercase text-[8px]">ผู้ออกรายงาน:</span> {profile.username || "System"}</p>
                         <p><span className="font-black text-[#64748b] uppercase text-[8px]">หน้า:</span> {pageIndex + 1} / {reportPages.length}</p>
                      </div>
                   </div>

                   <div className="grid grid-cols-3 border-t border-black pt-2">
                      <div className="flex gap-2 items-center">
                        <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">แผนก:</span>
                        <span className="text-[11px] font-bold text-[#102C57]">{scope.departmentName || "-"}</span>
                      </div>
                      <div className="flex gap-2 items-center justify-center">
                        <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">ช่วงวันที่:</span>
                        <span className="text-[11px] font-bold text-[#102C57]">{reportPeriodLabel}</span>
                      </div>
                      <div className="flex gap-2 items-center justify-end">
                        <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">ประเภท:</span>
                        <span className="text-[11px] font-bold text-[#102C57] truncate pl-4">{issueTypeSummaryLabel}</span>
                      </div>
                   </div>
                </div>

                <div className="weight-scale-report-print-body bg-white px-4 py-4 min-h-[240mm] print:border-none print:px-0">
                  <div className="overflow-hidden">
                    <style dangerouslySetInnerHTML={{ __html: `
                      .summary-issue-report-table {
                        width: 100% !important;
                        table-layout: fixed !important;
                      }
                      .summary-issue-report-table th,
                      .summary-issue-report-table td {
                        border: 1px solid #cbd5e1 !important;
                        white-space: nowrap !important;
                        overflow: hidden;
                        text-overflow: clip;
                        padding-left: 2px !important;
                        padding-right: 2px !important;
                        font-size: 11.5px !important;
                      }
                      .summary-issue-report-table th.border-l,
                      .summary-issue-report-table td.border-l {
                        border-left: 1px solid #94a3b8 !important;
                      }
                      .summary-issue-report-table th {
                        letter-spacing: 0.04em !important;
                      }
                      .summary-issue-report-table .summary-issue-product-cell {
                        font-size: 11px !important;
                        white-space: normal !important;
                        overflow-wrap: anywhere !important;
                        overflow: visible !important;
                        text-overflow: clip !important;
                        line-height: 1.1 !important;
                      }
                      .summary-issue-report-table .summary-issue-type-cell {
                        font-size: 10.5px !important;
                        white-space: normal !important;
                        overflow-wrap: break-word !important;
                        line-height: 1.1 !important;
                      }
                      .summary-issue-report-table .summary-issue-lot-cell {
                        font-size: 11px !important;
                        letter-spacing: 0 !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: clip !important;
                      }
                      .summary-issue-report-table .summary-issue-weight-cell {
                        font-variant-numeric: tabular-nums;
                        text-align: right !important;
                      }
                      @media print {
                        .summary-issue-report-print-shell {
                          min-height: auto !important;
                          max-width: none !important;
                          break-inside: avoid !important;
                          page-break-inside: avoid !important;
                          break-after: page !important;
                          page-break-after: always !important;
                        }
                        .summary-issue-report-print-shell:last-child {
                          break-after: auto !important;
                          page-break-after: auto !important;
                        }
                        .summary-issue-report-table {
                          table-layout: fixed !important;
                        }
                        .summary-issue-report-table th,
                        .summary-issue-report-table td {
                          font-size: 11.5px !important;
                        }
                        .summary-issue-report-table .summary-issue-product-cell {
                          font-size: 11px !important;
                        }
                      }
                    ` }} />
                    <table className="weight-scale-report-print-table summary-issue-report-table table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: "4.5%" }} />
                        <col style={{ width: "7.5%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: resolvedReportConfig.hideIssueTypeColumn ? "35%" : "27%" }} />
                        {!resolvedReportConfig.hideIssueTypeColumn ? <col style={{ width: "8%" }} /> : null}
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "8%" }} />
                      </colgroup>
                      <thead className="bg-[#f1f5f9]">
                        <tr className="border-b border-black text-[12px] font-black uppercase text-[#111111]">
                          <th rowSpan={2} className="px-1 py-0.5 text-center">ลำดับ</th>
                          <th rowSpan={2} className="px-1 py-0.5 text-center">วันที่</th>
                          <th rowSpan={2} className="summary-issue-lot-cell px-1 py-0.5 text-center">LOT</th>
                          <th rowSpan={2} className="px-1 py-0.5 text-left summary-issue-product-cell">สินค้า</th>
                          {!resolvedReportConfig.hideIssueTypeColumn ? (
                            <th rowSpan={2} className="summary-issue-type-cell px-1 py-0.5 text-center">ประเภทการเบิก</th>
                          ) : null}
                          <th colSpan={2} className="border-l border-black bg-[#eaf2ff] px-1 py-0.5 text-center">เบิก</th>
                          <th colSpan={2} className="border-l border-black bg-[#fff0f0] px-1 py-0.5 text-center">คืน</th>
                          <th colSpan={2} className="border-l border-black bg-[#edf8ef] px-1 py-0.5 text-center">ใช้จริง</th>
                        </tr>
                        <tr className="border-b border-black text-[10px] font-black text-[#111111]">
                          <th className="border-l border-black bg-[#eaf2ff] px-1 py-0.5">จำนวน</th>
                          <th className="bg-[#eaf2ff] px-1 py-0.5 text-right">น้ำหนัก</th>
                          <th className="border-l border-black bg-[#fff0f0] px-1 py-0.5">จำนวน</th>
                          <th className="bg-[#fff0f0] px-1 py-0.5 text-right">น้ำหนัก</th>
                          <th className="border-l border-black bg-[#edf8ef] px-1 py-0.5">จำนวน</th>
                          <th className="bg-[#edf8ef] px-1 py-0.5 text-right">น้ำหนัก</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white text-center">
                        {pageRows.map((vRow, vIndex) => {
                          if (vRow.type === 'item') {
                            const row = vRow.data;

                            // Find the previous 'item' row on this page (if any) to check for duplicate date
                            let isDuplicateDate = false;
                            if (vIndex > 0) {
                              const prevRow = pageRows[vIndex - 1];
                              if (prevRow && prevRow.type === 'item' 
                                  && prevRow.data.issueDate === row.issueDate
                                  && prevRow.data.productCode === row.productCode) {
                                isDuplicateDate = true;
                              }
                            }

                            // Find matching barcodes for search highlight
                            const matchingBarcodes = searchQuery.trim() 
                              ? (row.barcodes || []).filter(bc => 
                                  String(bc).toLowerCase().includes(searchQuery.trim().toLowerCase())
                                )
                              : [];

                            return (
                              <tr key={vIndex} className="border-b border-black text-[12px] font-semibold text-[#111111]">
                                <td className="px-1.5 py-0.5">{row.sequence}</td>
                                <td className="px-1.5 py-0.5">{isDuplicateDate ? "" : formatDateLabel(row.issueDate)}</td>
                                <td className="summary-issue-lot-cell px-1 py-0.5 text-center">
                                  <div>{highlightText(row.lotNo, searchQuery)}</div>
                                  {matchingBarcodes.length > 0 && (
                                    <div className="text-[9px] leading-tight text-[#64748b] mt-0.5">
                                      {matchingBarcodes.map((bc, idx) => (
                                        <span key={idx} className="inline-block bg-slate-100 border border-slate-200 px-1 rounded mr-1">
                                          {highlightText(bc, searchQuery)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="summary-issue-product-cell px-2 py-0.5 text-left">{row.productCode} - {row.productName}{row.issueStatus === "voided" ? " (ยกเลิกเบิก)" : ""}</td>
                                {!resolvedReportConfig.hideIssueTypeColumn ? (
                                  <td className="summary-issue-type-cell px-1 py-0.5 text-center">{getIssueTypeLabel(issueTypes, row.issueType)}</td>
                                ) : null}
                                <td className="border-l border-black px-1 py-0.5">{formatQuantity(row.quantity)}</td>
                                <td className="summary-issue-weight-cell px-1 py-0.5">{formatWeight(row.totalWeightKg)}</td>
                                <td className="border-l border-black px-1 py-0.5" style={{ whiteSpace: row.returnDates && row.returnDates.length > 0 ? "normal" : "nowrap" }}>
                                  <div>{formatQuantity(row.returnQuantity)}</div>
                                  {row.returnDates && row.returnDates.length > 0 && (
                                    <div className="text-[9px] text-rose-600 font-bold leading-tight mt-0.5">
                                      ({row.returnDates.map(d => formatDateLabel(d)).join(", ")})
                                    </div>
                                  )}
                                </td>
                                <td className="summary-issue-weight-cell px-1 py-0.5">
                                  <div>{formatWeight(row.returnWeightKg)}</div>
                                  {row.returnDates && row.returnDates.length > 0 && (
                                    <div className="text-[9px] text-rose-600 font-bold leading-tight mt-0.5">
                                      &nbsp;
                                    </div>
                                  )}
                                </td>
                                <td className="border-l border-black bg-[#f5fbf6] px-1 py-0.5 font-black text-emerald-800">{formatQuantity(row.actualQuantity)}</td>
                                <td className="summary-issue-weight-cell bg-[#f5fbf6] px-1 py-0.5 font-black text-emerald-800">{formatWeight(row.actualWeightKg)}</td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'product-footer') {
                            const data = vRow.data;
                            return (
                              <tr key={vIndex} className="bg-[#f1f5f9] border-b border-black text-[12px] font-black text-[#111111]">
                                <td colSpan={resolvedReportConfig.hideIssueTypeColumn ? 4 : 5} className="px-1.5 py-1 text-right">
                                  สรุปรวม {data.productCode}{data.statusLabel ? ` (${data.statusLabel})` : ""}
                                </td>
                                <td className="px-1.5 py-1 text-center font-bold">{formatQuantity(data.quantity)}</td>
                                <td className="summary-issue-weight-cell px-1.5 py-1 font-bold">{formatWeight(data.totalWeightKg)}</td>
                                <td className="px-1.5 py-1 text-center font-bold">{formatQuantity(data.returnQuantity)}</td>
                                <td className="summary-issue-weight-cell px-1.5 py-1 font-bold">{formatWeight(data.returnWeightKg)}</td>
                                <td className="bg-[#edf8ef] px-1.5 py-1 text-center font-bold">{formatQuantity(data.actualQuantity)}</td>
                                <td className="summary-issue-weight-cell bg-[#edf8ef] px-1.5 py-1 font-bold">{formatWeight(data.actualWeightKg)}</td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'grand-footer') {
                            const data = vRow.data;
                            return (
                              <tr key={vIndex} className="bg-[#e2e8f0] border-b border-black text-[12px] font-black text-[#102C57]">
                                <td colSpan={resolvedReportConfig.hideIssueTypeColumn ? 4 : 5} className="px-1.5 py-1 text-right">
                                  สรุปรวมเฉพาะเบิกสำเร็จ
                                </td>
                                <td className="px-1.5 py-1 text-center font-extrabold">{formatQuantity(data.quantity)}</td>
                                <td className="summary-issue-weight-cell px-1.5 py-1 font-extrabold">{formatWeight(data.totalWeightKg)}</td>
                                <td className="px-1.5 py-1 text-center font-extrabold">{formatQuantity(data.returnQuantity)}</td>
                                <td className="summary-issue-weight-cell px-1.5 py-1 font-extrabold">{formatWeight(data.returnWeightKg)}</td>
                                <td className="bg-[#dff3e4] px-1.5 py-1 text-center font-extrabold">{formatQuantity(data.actualQuantity)}</td>
                                <td className="summary-issue-weight-cell bg-[#dff3e4] px-1.5 py-1 font-extrabold">{formatWeight(data.actualWeightKg)}</td>
                              </tr>
                            );
                          }
                          return null;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="absolute bottom-2 left-0 right-0 px-6 flex justify-between items-center text-[10px] text-[#64748b] print:hidden">
                   <span>KPF Production Line Console - Issue Summary</span>
                   <span className="font-bold">หน้า {pageIndex + 1} / {reportPages.length}</span>
                </div>
              </section>
            ))
          ) : (
            <div className="w-full max-w-[210mm] bg-white border border-black px-4 py-12 text-center text-sm text-[#111111]">
               {isPending ? "กำลังโหลดข้อมูล..." : resolvedReportConfig.emptyMessage}
            </div>
          )}
        </div>
      </div>

      <div className="weight-scale-report-print-only issue-summary-print-only">
        <style dangerouslySetInnerHTML={{ __html: `
          @page {
            size: A4 portrait;
            margin: 7mm;
          }
          @media print {
            .weight-scale-report-screen-only,
            .weight-scale-report-screen-only *,
            .issue-summary-preview-pages,
            .issue-summary-preview-pages * {
              display: none !important;
            }
            .issue-summary-print-only {
              display: block !important;
              width: 100% !important;
              background: #ffffff !important;
              color: #111827 !important;
            }
            .issue-summary-print-table {
              width: 100% !important;
              table-layout: fixed !important;
              border-collapse: collapse !important;
              font-size: 11.5px !important;
              line-height: 1.1 !important;
              color: #111827 !important;
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }
            .issue-summary-print-table thead {
              display: table-header-group !important;
            }
            .issue-summary-print-table tfoot {
              display: table-row-group !important;
            }
            .issue-summary-print-table th,
            .issue-summary-print-table td {
              border: 0.5px solid #cbd5e1 !important;
              padding: 1px 2px !important;
              vertical-align: middle !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: clip !important;
            }
            .issue-summary-print-table .print-report-header th {
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              border-bottom: 1px solid #cbd5e1 !important;
              padding: 0 0 5px !important;
              background: #ffffff !important;
            }
            .issue-summary-print-table .print-report-meta th {
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              border-bottom: 1px solid #cbd5e1 !important;
              padding: 3px 4px !important;
              background: #ffffff !important;
            }
            .issue-summary-print-table .table-header th {
              background: #f1f5f9 !important;
              color: #111827 !important;
              font-weight: 900 !important;
              text-align: center !important;
              font-size: 11.5px !important;
            }
            .issue-summary-print-table .table-header th.col-issue {
              background: #eaf2ff !important;
            }
            .issue-summary-print-table .table-header th.col-return {
              background: #fff0f0 !important;
            }
            .issue-summary-print-table .table-header th.col-actual {
              background: #edf8ef !important;
            }
            .issue-summary-print-table td.col-actual-body {
              background: #f5fbf6 !important;
            }
            .issue-summary-print-table .issue-summary-product-cell {
              font-size: 11px !important;
              white-space: normal !important;
              overflow-wrap: anywhere !important;
              overflow: visible !important;
              line-height: 1.1 !important;
              text-align: left !important;
            }
            .issue-summary-print-table .issue-summary-lot-cell {
              font-size: 11px !important;
              letter-spacing: 0 !important;
            }
            .issue-summary-print-table .issue-summary-weight-cell {
              text-align: right !important;
              font-variant-numeric: tabular-nums !important;
            }
            .issue-summary-print-table .issue-summary-type-cell {
              font-size: 10.5px !important;
              white-space: normal !important;
              overflow-wrap: break-word !important;
              line-height: 1.1 !important;
            }
            .issue-summary-print-table thead,
            .issue-summary-print-table thead tr,
            .issue-summary-print-table .product-footer-row,
            .issue-summary-print-table .grand-footer-row {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .issue-summary-print-table tbody tr.item-row {
              break-inside: auto !important;
              page-break-inside: auto !important;
            }
            .issue-summary-print-table .product-footer-row td {
              background: #f1f5f9 !important;
              font-weight: 900 !important;
            }
            .issue-summary-print-table .grand-footer-row td {
              background: #e2e8f0 !important;
              color: #102C57 !important;
              font-weight: 900 !important;
            }
          }
        ` }} />
        {issuePrintRows.length ? (
          <table className="issue-summary-print-table">
            <colgroup>
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "7.5%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: resolvedReportConfig.hideIssueTypeColumn ? "35%" : "27%" }} />
              {!resolvedReportConfig.hideIssueTypeColumn ? <col style={{ width: "8%" }} /> : null}
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr className="print-report-header">
                <th colSpan={resolvedReportConfig.hideIssueTypeColumn ? 10 : 11}>
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
                      <div className="text-[17px] font-black text-[#102C57]">{resolvedReportConfig.printTitle}</div>
                      <div className="mt-1 text-[8px] font-black uppercase tracking-[0.22em] text-[#d4af37]">Stock Issue Summary Report</div>
                    </div>
                    <div className="text-right text-[9px] leading-tight text-[#102C57]">
                      <div><span className="font-black text-[#64748b]">วันที่พิมพ์:</span> {printedAtLabel}</div>
                      <div><span className="font-black text-[#64748b]">ผู้ออกรายงาน:</span> {profile.username || "System"}</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="print-report-meta">
                <th colSpan={3} className="text-left">แผนก: <span className="font-black">{scope.departmentName || "-"}</span></th>
                <th colSpan={resolvedReportConfig.hideIssueTypeColumn ? 4 : 5} className="text-center">ช่วงวันที่: <span className="font-black">{reportPeriodLabel}</span></th>
                <th colSpan={3} className="text-right">ประเภท: <span className="font-black">{issueTypeSummaryLabel}</span></th>
              </tr>
              <tr className="table-header">
                <th rowSpan={2}>ลำดับ</th>
                <th rowSpan={2}>วันที่</th>
                <th rowSpan={2}>LOT</th>
                <th rowSpan={2} className="issue-summary-product-cell">สินค้า</th>
                {!resolvedReportConfig.hideIssueTypeColumn ? <th rowSpan={2} className="issue-summary-type-cell">ประเภทการเบิก</th> : null}
                <th colSpan={2} className="col-issue">เบิก</th>
                <th colSpan={2} className="col-return">คืน</th>
                <th colSpan={2} className="col-actual">ใช้จริง</th>
              </tr>
              <tr className="table-header">
                <th className="col-issue">จำนวน</th>
                <th className="col-issue text-right">น้ำหนัก</th>
                <th className="col-return">จำนวน</th>
                <th className="col-return text-right">น้ำหนัก</th>
                <th className="col-actual">จำนวน</th>
                <th className="col-actual text-right">น้ำหนัก</th>
              </tr>
            </thead>
            <tbody className="text-center">
              {issuePrintRows.map((vRow, vIndex) => {
                if (vRow.type === "item") {
                  const row = vRow.data;

                  // Find the previous 'item' row on this sheet (if any) to check for duplicate date
                  let isDuplicateDate = false;
                  if (vIndex > 0) {
                    const prevRow = issuePrintRows[vIndex - 1];
                    if (prevRow && prevRow.type === 'item' 
                        && prevRow.data.issueDate === row.issueDate
                        && prevRow.data.productCode === row.productCode) {
                      isDuplicateDate = true;
                    }
                  }

                  // Find matching barcodes for search highlight
                  const matchingBarcodes = searchQuery.trim() 
                    ? (row.barcodes || []).filter(bc => 
                        String(bc).toLowerCase().includes(searchQuery.trim().toLowerCase())
                      )
                    : [];

                  return (
                    <tr key={vIndex} className="item-row">
                      <td>{row.sequence}</td>
                      <td>{isDuplicateDate ? "" : formatDateLabel(row.issueDate)}</td>
                      <td className="issue-summary-lot-cell">
                        <div>{highlightText(row.lotNo, searchQuery)}</div>
                        {matchingBarcodes.length > 0 && (
                          <div className="text-[9px] leading-tight text-[#64748b] mt-0.5">
                            {matchingBarcodes.map((bc, idx) => (
                              <span key={idx} className="inline-block bg-slate-100 border border-slate-200 px-1 rounded mr-1">
                                {highlightText(bc, searchQuery)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="issue-summary-product-cell">{row.productCode} - {row.productName}</td>
                      {!resolvedReportConfig.hideIssueTypeColumn ? (
                        <td className="issue-summary-type-cell">{getIssueTypeLabel(issueTypes, row.issueType)}</td>
                      ) : null}
                      <td>{formatQuantity(row.quantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(row.totalWeightKg)}</td>
                      <td style={{ whiteSpace: row.returnDates && row.returnDates.length > 0 ? "normal" : "nowrap" }}>
                        <div>{formatQuantity(row.returnQuantity)}</div>
                        {row.returnDates && row.returnDates.length > 0 && (
                          <div className="text-[9px] text-rose-600 font-bold leading-tight mt-0.5">
                            ({row.returnDates.map(d => formatDateLabel(d)).join(", ")})
                          </div>
                        )}
                      </td>
                      <td className="issue-summary-weight-cell">
                        <div>{formatWeight(row.returnWeightKg)}</div>
                        {row.returnDates && row.returnDates.length > 0 && (
                          <div className="text-[9px] text-rose-600 font-bold leading-tight mt-0.5">
                            &nbsp;
                          </div>
                        )}
                      </td>
                      <td className="col-actual-body">{formatQuantity(row.actualQuantity)}</td>
                      <td className="issue-summary-weight-cell col-actual-body">{formatWeight(row.actualWeightKg)}</td>
                    </tr>
                  );
                }

                if (vRow.type === "product-footer") {
                  const data = vRow.data;
                  return (
                    <tr key={vIndex} className="product-footer-row">
                      <td colSpan={resolvedReportConfig.hideIssueTypeColumn ? 4 : 5} className="text-right">สรุปรวม {data.productCode}</td>
                      <td>{formatQuantity(data.quantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(data.totalWeightKg)}</td>
                      <td>{formatQuantity(data.returnQuantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(data.returnWeightKg)}</td>
                      <td>{formatQuantity(data.actualQuantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(data.actualWeightKg)}</td>
                    </tr>
                  );
                }

                if (vRow.type === "grand-footer") {
                  const data = vRow.data;
                  return (
                    <tr key={vIndex} className="grand-footer-row">
                      <td colSpan={resolvedReportConfig.hideIssueTypeColumn ? 4 : 5} className="text-right">สรุปรวมเฉพาะเบิกสำเร็จ</td>
                      <td>{formatQuantity(data.quantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(data.totalWeightKg)}</td>
                      <td>{formatQuantity(data.returnQuantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(data.returnWeightKg)}</td>
                      <td>{formatQuantity(data.actualQuantity)}</td>
                      <td className="issue-summary-weight-cell">{formatWeight(data.actualWeightKg)}</td>
                    </tr>
                  );
                }

                return null;
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
