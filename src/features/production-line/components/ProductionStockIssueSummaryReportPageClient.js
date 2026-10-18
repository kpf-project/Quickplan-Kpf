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
import { ReportHeader, ReportFilterBar } from "@/components/print";

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

function ReportCenterSummaryRow({ row, expanded, toggle, issueTypes }) {
  return <>
    <tr className={expanded ? "report-center-selected" : ""}>
      <td><button type="button" aria-label={`รายละเอียด ${row.productCode} LOT ${row.lotNo}`} aria-expanded={expanded} onClick={toggle}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
      <td><strong className="font-medium">{row.productCode}</strong><span className="block text-[10px] text-slate-500">{formatDateLabel(row.issueDate)} · {getIssueTypeLabel(issueTypes, row.issueType)}{row.issueStatus === "voided" ? " · ยกเลิก" : ""}</span></td>
      <td>{row.lotNo}</td><td>{formatWeight(row.totalWeightKg)}</td><td>{formatWeight(row.returnWeightKg)}</td><td>{formatWeight(row.actualWeightKg)}</td>
    </tr>
    {expanded && <tr><td colSpan={6}><div className="text-xs leading-6"><strong>{getProductDisplay(row)}</strong><p>จำนวนเบิก {formatQuantity(row.quantity)} · คืน {formatQuantity(row.returnQuantity)} · ใช้จริง {formatQuantity(row.actualQuantity)}</p><p>วันที่คืน: {row.returnDates.map(formatDateLabel).join(", ") || "ไม่มีรายการคืน"}</p><p>บาร์โค้ด: {row.barcodes.join(", ") || "-"}</p><p className="text-slate-500">เอกสารและรายการต้นทางดูได้ในมุมมอง “ละเอียด”</p></div></td></tr>}
  </>;
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
      targetProductCode: String(row?.targetProductCode || "").trim().toUpperCase(),
      targetProductName: String(row?.targetProductName || "").trim(),
      destinationRoomCode: String(row?.destinationRoomCode || "").trim().toUpperCase(),
      destinationRoomName: String(row?.destinationRoomName || "").trim(),
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

function getProductDisplay(row) {
  const source = `${row.productCode} - ${row.productName}`;
  if (row.destinationRoomName) return `${source} → ${row.destinationRoomName}`;
  return row.targetProductCode
    ? `${source} → ${row.targetProductCode} - ${row.targetProductName || "-"}`
    : source;
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
    const key = `${row.productCode}|${row.destinationRoomCode}|${row.issueStatus}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  });

  let excelSequence = 1;
  groups.forEach((groupRows) => {
    const productCode = groupRows[0].productCode;
    const statusLabel = groupRows[0].issueStatus === "voided" ? "ยกเลิกเบิก" : "";
    const statusSuffix = statusLabel ? ` (${statusLabel})` : "";
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
        productDisplay: `${getProductDisplay(row)}${row.issueStatus === "voided" ? " (ยกเลิกเบิก)" : ""}`,
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
      productDisplay: `สรุปรวม ${productCode} (${statusLabel})`,
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
  reportCenter = false,
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
  const [expandedRow, setExpandedRow] = useState(null);
  const loadedCenterFilters = useRef(JSON.stringify(normalizeFilters(initialFilters, initialPagination)));

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const matchLot = String(row.lotNo || "").toLowerCase().includes(q);
      const matchTarget = `${row.targetProductCode || ""} ${row.targetProductName || ""}`
        .toLowerCase()
        .includes(q);
      const matchBarcode = Array.isArray(row.barcodes) && row.barcodes.some((bc) =>
        String(bc || "").toLowerCase().includes(q)
      );
      return matchLot || matchBarcode || matchTarget;
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
      const key = `${row.productCode}|${row.destinationRoomCode}|${row.issueStatus}`;
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

      if (groupRows.length > 1) {
        virtualRows.push({
          type: 'product-footer',
          data: {
            productCode,
            productName: `${productName} (${statusLabel})`,
            targetProductCode: groupRows[0].targetProductCode,
            destinationRoomCode: groupRows[0].destinationRoomCode,
            destinationRoomName: groupRows[0].destinationRoomName,
            targetProductName: groupRows[0].targetProductName,
            statusLabel,
            quantity: Number(productQty.toFixed(3)),
            totalWeightKg: Number(productWeight.toFixed(2)),
            returnQuantity: Number(productReturnQty.toFixed(3)),
            returnWeightKg: Number(productReturnWeight.toFixed(2)),
            actualQuantity: Number(productActualQty.toFixed(3)),
            actualWeightKg: Number(productActualWeight.toFixed(2)),
          }
        });
      }
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
    const FIRST_PAGE_LIMIT = 24;
    const OTHER_PAGE_LIMIT = 24;

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
        loadedCenterFilters.current = JSON.stringify(nextFilters);
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

  useEffect(() => {
    if (!reportCenter || window.parent === window) return;
    const ready = () => window.parent.postMessage({ type: "kpf-report-ready", actions: "stock-summary" }, window.location.origin);
    const receive = (event) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "kpf-report-connect") ready();
      if (event.data?.type !== "kpf-report-action") return;
      if (["print", "excel"].includes(event.data.action) && (isPending || loadedCenterFilters.current !== JSON.stringify(filters))) {
        setErrorMessage("กรุณากดใช้ตัวกรองและรอโหลดข้อมูลให้เสร็จก่อนพิมพ์หรือส่งออก");
        return;
      }
      if (event.data.action === "print") handlePrintReport();
      if (event.data.action === "excel" && !isExporting && !isPending) void handleExportReport();
    };
    window.addEventListener("message", receive);
    ready();
    return () => window.removeEventListener("message", receive);
  });

  return (
    <div className={`weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626] ${reportCenter ? "report-center-summary" : ""}`}>
      <style>{`
        .summary-issue-report-print-shell {
          box-sizing: border-box;
          width: 210mm;
          max-width: 100%;
          min-width: 0;
          margin-inline: auto;
        }
        @media screen {
          .summary-issue-report-print-shell { aspect-ratio: 210 / 297; }
        }
        .issue-summary-preview-pages { overflow-x: visible; }
        .summary-issue-report-table th,
        .summary-issue-report-table td,
        .issue-summary-print-table th,
        .issue-summary-print-table td { word-break: normal; overflow-wrap: normal; }
        .summary-issue-report-table td[colspan],
        .issue-summary-print-table td[colspan] { white-space: normal !important; }
        .issue-summary-document-header > div:first-child,
        .issue-summary-document-header > th > div:first-child {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 6px;
          white-space: normal !important;
        }
        .issue-summary-document-header > div:first-child > div:nth-child(2),
        .issue-summary-document-header > th > div:first-child > div:nth-child(2) {
          grid-column: 1 / -1;
          grid-row: 2;
          padding: 0;
        }
        .issue-summary-document-header h1 { font-size: 17px; line-height: 1.3; }
        .issue-summary-document-header img { max-height: 36px; }
      `}</style>
      {reportCenter && <div className="report-center-summary-screen weight-scale-report-screen-only">
        <div className="report-center-summary-meta">แหล่งข้อมูล: สต็อกฝ่ายผลิต · {scope.departmentName || "แผนกตามการตั้งค่า"} · ยอดรวมเฉพาะเบิกสำเร็จ</div>
        <form className="report-center-summary-filters" onSubmit={(event) => { event.preventDefault(); if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) { setErrorMessage("กรุณาเลือกช่วงวันที่ให้ถูกต้อง"); return; } loadReport(filters); }}>
          <label>ตั้งแต่ <input aria-label="วันที่เริ่มต้นรายงาน" type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => handleFieldChange("dateFrom", event.target.value)} /></label>
          <label>ถึง <input aria-label="วันที่สิ้นสุดรายงาน" type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => handleFieldChange("dateTo", event.target.value)} /></label>
          <details><summary>สินค้า ({filters.productCodes.length ? `${filters.productCodes.length} รายการ` : "ทั้งหมด"})</summary><select aria-label="กรองสินค้าในรายงาน" multiple value={filters.productCodes} onChange={(event) => handleFieldChange("productCodes", Array.from(event.target.selectedOptions, (option) => option.value))}>{normalizedProductOptions.map((option) => <option key={option.code} value={option.code}>{option.code} {option.name}</option>)}</select></details>
          <label>สถานะ <select value={filters.issueStatuses[0] || "confirmed"} onChange={(event) => handleFieldChange("issueStatuses", [event.target.value])}><option value="confirmed">เบิกสำเร็จ</option><option value="voided">ยกเลิกเบิก</option></select></label>
          <label>ประเภท <select value={filters.issueTypes[0] || ""} onChange={(event) => handleFieldChange("issueTypes", event.target.value ? [event.target.value] : [])}><option value="">ทุกประเภท</option>{issueTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button type="submit" disabled={isPending}>ค้นหา</button>
        </form>
        {(errorMessage || feedback) && <div role={errorMessage ? "alert" : "status"} className={errorMessage ? "text-red-700 py-3" : "text-emerald-700 py-3"}>{errorMessage || feedback}</div>}
        <div className="report-center-summary-table-wrap report-center-table-scroll" aria-busy={isPending} suppressHydrationWarning>
          <table className="report-center-summary-table"><thead><tr><th aria-label="รายละเอียด" /><th>สินค้า / วันที่</th><th>LOT</th><th>เบิก (กก.)</th><th>คืน (กก.)</th><th>ใช้จริง (กก.)</th></tr></thead><tbody>
            {!filteredRows.length && <tr><td colSpan={6} className="text-center py-12">{isPending ? "กำลังโหลด…" : resolvedReportConfig.emptyMessage}</td></tr>}
            {filteredRows.map((row, index) => <ReportCenterSummaryRow key={`${row.productCode}-${row.lotNo}-${row.issueDate}-${row.issueType}-${row.destinationRoomCode}-${row.targetProductCode}-${row.issueStatus}-${index}`} row={row} expanded={expandedRow === index} toggle={() => setExpandedRow(expandedRow === index ? null : index)} issueTypes={issueTypes} />)}
          </tbody>{filteredRows.length > 0 && <tfoot><tr><th colSpan={3}>รวมทั้งสิ้น (เฉพาะเบิกสำเร็จ)</th><th>{formatWeight(filteredSummary.totalWeightKg)}</th><th>{formatWeight(filteredSummary.totalReturnWeightKg)}</th><th>{formatWeight(filteredSummary.totalActualWeightKg)}</th></tr></tfoot>}</table>
        </div>
        <style>{`
          @media screen {
            .report-center-summary { background:white; min-height:0; color:#102f59; }
            .report-center-summary > .weight-scale-report-screen-only:not(.report-center-summary-screen), .report-center-summary > .mx-auto { display:none; }
            .report-center-summary-screen { padding:10px 20px 24px; font-size:13px; }
            .report-center-summary-meta { color:#6280a2; font-size:11px; text-align:right; margin:0 0 16px; }
            .report-center-summary-table-wrap { overflow-x:auto; }
            .report-center-summary-table { width:100%; min-width:620px; border-collapse:collapse; }
            .report-center-summary-table th,.report-center-summary-table td { border:1px solid #dce7f4; padding:13px 15px; }
            .report-center-summary-table thead { background:#f8f9fa; border-bottom:2px solid #1a1c1e; color:#1a1c1e; }
            .report-center-summary-table tfoot { background:#f8f9fa; }
            .report-center-summary-table th { font-weight:700; }
            .report-center-summary-table td:nth-child(n+4),.report-center-summary-table tfoot th:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; }
            .report-center-summary-table tfoot th:first-child { text-align:left; }
            .report-center-summary-table tfoot { font-size:15px; }
            .report-center-summary-table .report-center-selected { background:#fff5cf; }
            .report-center-summary-table td:first-child { width:34px;padding:8px; }
            .report-center-summary-table button { display:grid;place-items:center;background:none;border:0;color:#436b96;padding:4px;cursor:pointer; }
            .report-center-summary-table button:focus-visible { outline:2px solid #2c72c6; }
            .report-center-summary-filters { display:flex;align-items:end;gap:12px;flex-wrap:wrap;background:#ffffff;padding:14px 18px;margin-bottom:16px;border:1px solid #dbe6f2;border-radius:8px;box-shadow:0 2px 8px rgba(16,44,87,0.04); }
            .report-center-summary-filters label { display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;color:#102C57;text-transform:uppercase;letter-spacing:0.04em; }
            .report-center-summary-filters input,.report-center-summary-filters select { border:1px solid #cbd5e1;padding:8px 12px;background:white;border-radius:6px;font-size:13px;color:#0f172a;outline:none;transition:border-color 0.15s ease,box-shadow 0.15s ease; }
            .report-center-summary-filters input:focus,.report-center-summary-filters select:focus { border-color:#d4af37;box-shadow:0 0 0 3px rgba(212,175,55,0.18); }
            .report-center-summary-filters details { position:relative;font-size:11px;font-weight:700;color:#102C57; }
            .report-center-summary-filters summary { border:1px solid #cbd5e1;padding:8px 14px;background:white;border-radius:6px;cursor:pointer;font-size:13px;color:#0f172a;transition:border-color 0.15s ease; }
            .report-center-summary-filters summary:hover { border-color:#d4af37; }
            .report-center-summary-filters details select { position:absolute;left:0;top:calc(100% + 4px);z-index:20;min-width:260px;max-width:calc(100vw - 60px);min-height:160px;border-radius:6px;border:1px solid #cbd5e1;box-shadow:0 12px 28px rgba(16,44,87,0.14); }
            .report-center-summary-filters button { background:var(--surface-navy, #102C57);color:white;border:0;padding:9px 20px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.03em;align-self:end;cursor:pointer;transition:background 0.15s ease; }
            .report-center-summary-filters button:hover { background:#173b70; }
          }
        `}</style>
      </div>}
      <div className="weight-scale-report-screen-only">
        <WeightScalePrimaryHeader
          eyebrow={resolvedReportConfig.eyebrow}
          badge={resolvedReportConfig.badge}
          title={resolvedReportConfig.title}
        />
      </div>

      <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <section className="weight-scale-report-print-shell border border-[#d7dde5] border-t-2 border-t-[#d4af37] bg-white">
          <div className="weight-scale-report-screen-only border-b border-[#d7dde5] bg-[#fcfbf7] p-5">
            <ReportFilterBar
              dateMode="range"
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onDateFromChange={(val) => handleFieldChange("dateFrom", val)}
              onDateToChange={(val) => handleFieldChange("dateTo", val)}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              searchPlaceholder="ระบุ Lot บาร์โค้ด หรือสินค้าปลายทาง..."
              searchLabel="ค้นหา Lot / บาร์โค้ด / สินค้าปลายทาง"
              isLoading={isPending}
              onSearch={() => loadReport(filters)}
              searchButtonLabel="โหลดรายงาน"
              className="mb-0 border-0 bg-transparent p-0 shadow-none"
            />

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
                  className="weight-scale-report-screen-only inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#173b67]"
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
            <div className="flex items-center gap-4 bg-[var(--surface-navy,#102C57)] text-white px-6 py-2 rounded-full shadow-lg">
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
        <div className="weight-scale-report-screen-only issue-summary-preview-pages flex w-full flex-col items-center gap-4 py-4">
          {reportPages.length ? (
            reportPages.map((pageRows, pageIndex) => (
              <section 
                key={pageIndex} 
                className={`weight-scale-report-print-shell summary-issue-report-print-shell bg-white border border-slate-300 shadow-sm print:max-w-none print:shadow-none relative ${
                  pageIndex === currentViewPage ? 'block' : 'hidden print:block'
                }`}
              >
                {/* Corporate Report Header */}
                <div className="bg-white px-4 py-2 border-b border-slate-300">
                  <ReportHeader
                    className="issue-summary-document-header"
                    title={resolvedReportConfig.printTitle}
                    subtitle="Stock Issue Summary Report"
                    meta={[
                      { label: "แผนก", value: scope.departmentName || "-" },
                      { label: "ช่วงวันที่", value: reportPeriodLabel },
                      { label: "ประเภท", value: issueTypeSummaryLabel },
                    ]}
                    printedAt={printedAtLabel}
                    printedBy={profile.username || "System"}
                    page={pageIndex + 1}
                    totalPages={reportPages.length}
                    variant="block"
                  />
                </div>

                <div className="weight-scale-report-print-body bg-white px-4 pt-2 pb-8 print:border-none print:px-0">
                  <div className="overflow-hidden">
                    <style dangerouslySetInnerHTML={{ __html: `
                      .summary-issue-report-table {
                        width: 100% !important;
                        table-layout: fixed !important;
                      }
                      .summary-issue-report-table th,
                      .summary-issue-report-table td {
                        border: 1px solid #cbd5e1 !important;
                        white-space: normal !important;
                        overflow: visible;
                        padding-left: 2px !important;
                        padding-right: 2px !important;
                        font-size: 10px !important;
                        line-height: 1.35 !important;
                      }
                      .summary-issue-report-table th.border-l,
                      .summary-issue-report-table td.border-l {
                        border-left: 1px solid #94a3b8 !important;
                      }
                      .summary-issue-report-table th {
                        letter-spacing: 0 !important;
                      }
                      .summary-issue-report-table .summary-issue-product-cell {
                        font-size: 10px !important;
                        white-space: normal !important;
                        overflow: visible !important;
                        line-height: 1.35 !important;
                      }
                      .summary-issue-report-table .summary-issue-type-cell {
                        font-size: 10.5px !important;
                        white-space: normal !important;
                        overflow-wrap: normal !important;
                        line-height: 1.1 !important;
                      }
                      .summary-issue-report-table .summary-issue-lot-cell {
                        font-size: 10px !important;
                        letter-spacing: 0 !important;
                        white-space: nowrap !important;
                        overflow: visible !important;
                      }
                      .summary-issue-report-table .summary-issue-weight-cell {
                        font-variant-numeric: tabular-nums;
                        text-align: right !important;
                        white-space: nowrap !important;
                      }
                    ` }} />
                    <table className="weight-scale-report-print-table summary-issue-report-table table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: "3%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: resolvedReportConfig.hideIssueTypeColumn ? "31%" : "24%" }} />
                        {!resolvedReportConfig.hideIssueTypeColumn ? <col style={{ width: "7%" }} /> : null}
                        <col style={{ width: "5.5%" }} />
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "5.5%" }} />
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "5.5%" }} />
                        <col style={{ width: "10.5%" }} />
                      </colgroup>
                      <thead className="bg-[#f8f9fa]">
                        <tr className="border-b-2 border-[#1a1c1e] text-[12px] font-black uppercase text-[#1a1c1e]">
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
                                <td className="summary-issue-product-cell px-2 py-0.5 text-left">{getProductDisplay(row)}{row.issueStatus === "voided" ? " (ยกเลิกเบิก)" : ""}</td>
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
                                  สรุปรวม {getProductDisplay(data)}{data.statusLabel ? ` (${data.statusLabel})` : ""}
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
            <div className="summary-issue-report-print-shell bg-white border border-slate-300 px-4 py-8 text-center text-sm text-[#111111]">
               {isPending ? "กำลังโหลดข้อมูล..." : resolvedReportConfig.emptyMessage}
            </div>
          )}
        </div>
      </div>

      <div className="weight-scale-report-print-only issue-summary-print-only">
        <style dangerouslySetInnerHTML={{ __html: `
          @page {
            size: A4 portrait;
            margin: 8mm 6mm;
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
              font-size: 8pt !important;
              line-height: 1.2 !important;
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
              border: 0.5pt solid #cbd5e1 !important;
              padding: 1px 2px !important;
              vertical-align: middle !important;
              white-space: normal !important;
              overflow: visible !important;
            }
            .issue-summary-print-table .print-report-header th {
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              border-bottom: 0.75pt solid #cbd5e1 !important;
              padding: 0 0 5px !important;
              background: #ffffff !important;
            }
            .issue-summary-print-table .print-report-meta th {
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              border-bottom: 0.75pt solid #cbd5e1 !important;
              padding: 3px 4px !important;
              background: #ffffff !important;
            }
            .issue-summary-print-table .table-header th {
              background: #f8f9fa !important;
              color: #1a1c1e !important;
              font-weight: 900 !important;
              text-align: center !important;
              font-size: 10px !important;
              border-bottom: 2px solid #1a1c1e !important;
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
              font-size: 8pt !important;
              white-space: normal !important;
              overflow: visible !important;
              line-height: 1.35 !important;
              text-align: left !important;
            }
            .issue-summary-print-table .issue-summary-lot-cell {
              font-size: 10px !important;
              letter-spacing: 0 !important;
              white-space: nowrap !important;
            }
            .issue-summary-print-table .issue-summary-weight-cell {
              text-align: right !important;
              font-variant-numeric: tabular-nums !important;
              white-space: nowrap !important;
            }
            .issue-summary-print-table .issue-summary-type-cell {
              font-size: 10.5px !important;
              white-space: normal !important;
              overflow-wrap: normal !important;
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
              break-inside: avoid !important;
              page-break-inside: avoid !important;
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
              <col style={{ width: "3%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: resolvedReportConfig.hideIssueTypeColumn ? "31%" : "24%" }} />
              {!resolvedReportConfig.hideIssueTypeColumn ? <col style={{ width: "7%" }} /> : null}
              <col style={{ width: "5.5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5.5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5.5%" }} />
              <col style={{ width: "10.5%" }} />
            </colgroup>
            <thead>
              <ReportHeader
                className="issue-summary-document-header"
                title={resolvedReportConfig.printTitle}
                subtitle="Stock Issue Summary Report"
                meta={[
                  { label: "แผนก", value: scope.departmentName || "-" },
                  { label: "ช่วงวันที่", value: reportPeriodLabel },
                  { label: "ประเภท", value: issueTypeSummaryLabel },
                ]}
                printedAt={printedAtLabel}
                printedBy={profile.username || "System"}
                variant="table-rows"
                colSpan={resolvedReportConfig.hideIssueTypeColumn ? 10 : 11}
              />
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
                      <td className="issue-summary-product-cell">{getProductDisplay(row)}</td>
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
                      <td colSpan={resolvedReportConfig.hideIssueTypeColumn ? 4 : 5} className="text-right">
                        สรุปรวม {data.productCode} ({data.statusLabel})
                      </td>
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
