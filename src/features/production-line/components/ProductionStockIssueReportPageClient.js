"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Barcode,
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
  Search,
  X,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { fetchProductionPrisonIssueReport } from "@/features/production-line/services/productionPrisonClient";
import { fetchProductionStockIssueReport } from "@/features/production-line/services/productionStockIssueClient";
import { formatBusinessDateTime } from "@/lib/bangkokDate";
import { useUserProfile } from "@/lib/useUserProfile";
import { ReportHeader } from "@/components/print";
import { upsertTab } from "@/lib/tabState";

const LIMIT_OPTIONS = [20, 50, 100];
const DEFAULT_REPORT_CONFIG = Object.freeze({
  eyebrow: "รายงานเบิกผลิตภัณฑ์",
  badge: "ภาพรวมการเบิก",
  title: "รายงานเบิก",
  description:
    "แสดงรายการเบิกตามบาร์โค้ด พร้อมจัดกลุ่มตาม วันที่ / LOT / สินค้า / ประเภทการเบิก และสรุปรวมท้ายกลุ่มสำหรับงานพิมพ์และส่งออก",
  printTitle: "รายงานเบิกผลิตภัณฑ์",
  excelTitle: "รายงานเบิกผลิตภัณฑ์",
  excelFilePrefix: "stock-issue-report",
  emptyMessage: "ยังไม่พบรายการเบิกตามเงื่อนไขที่เลือก",
  hideIssueTypeFilter: false,
  hideIssueTypeMeta: false,
  hideIssueTypeGroupHeader: false,
  allowedIssueTypes: [],
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

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    issueItemId: String(row?.issueItemId || "").trim(),
    issueNo: String(row?.issueNo || "").trim(),
    issueType: String(row?.issueType || "").trim().toUpperCase(),
    issueDate: String(row?.issueDate || "").trim(),
    issuedAt: row?.issuedAt || null,
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    targetProductCode: String(row?.targetProductCode || "").trim().toUpperCase(),
    targetProductName: String(row?.targetProductName || "").trim(),
    destinationRoomCode: String(row?.destinationRoomCode || "").trim().toUpperCase(),
    destinationRoomName: String(row?.destinationRoomName || "").trim(),
    lotNo: String(row?.lotNo || "").trim() || "-",
    quantity: Number(row?.quantity || 0),
    weightKg: Number(row?.weightKg || 0),
    documentStatus: String(row?.documentStatus || "confirmed").trim(),
    itemStatus: String(row?.itemStatus || "confirmed").trim(),
  }));
}

function normalizeSummary(summary) {
  return {
    totalCount: Number(summary?.totalCount || 0),
    totalQuantity: Number(summary?.totalQuantity || 0),
    totalWeightKg: Number(summary?.totalWeightKg || 0),
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

const ISSUE_STATUS_OPTIONS = Object.freeze([
  { value: "confirmed", label: "เบิกสำเร็จ" },
  { value: "voided", label: "ยกเลิกเบิก" },
]);

function normalizeFilters(filters, pagination) {
  const normalizedPagination = normalizePagination(pagination);

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
      ? [filters.issueType.toUpperCase()]
      : [],
    issueStatuses: (() => {
      const normalizedStatuses = Array.isArray(filters?.issueStatuses)
        ? Array.from(
            new Set(
              filters.issueStatuses
                .map((value) => String(value || "").trim().toLowerCase())
                .filter((value) => ISSUE_STATUS_OPTIONS.some((option) => option.value === value))
            )
          )
        : [];

      return normalizedStatuses.length ? normalizedStatuses : ["confirmed"];
    })(),
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

function getIssueTypeLabel(issueTypes, value) {
  return issueTypes.find((option) => option.value === value)?.label || value;
}

function getIssueTypeSummaryLabel(issueTypes, selectedValues) {
  if (!selectedValues || selectedValues.length === 0) return "ทุกประเภท";
  if (selectedValues.length === 1) return getIssueTypeLabel(issueTypes, selectedValues[0]);
  return `เลือกแล้ว ${selectedValues.length} ประเภท`;
}

function getIssueStatusSummaryLabel(selectedValues) {
  if (!selectedValues || selectedValues.length === 0) return "ทุกสถานะ";
  if (selectedValues.length === 1) {
    return ISSUE_STATUS_OPTIONS.find((option) => option.value === selectedValues[0])?.label || selectedValues[0];
  }
  return `เลือกแล้ว ${selectedValues.length} สถานะ`;
}

function filterRowsByAllowedIssueTypes(rows, allowedIssueTypes) {
  if (!Array.isArray(allowedIssueTypes) || !allowedIssueTypes.length) {
    return Array.isArray(rows) ? rows : [];
  }

  const allowed = new Set(
    allowedIssueTypes
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean)
  );

  return (Array.isArray(rows) ? rows : []).filter((row) =>
    allowed.has(String(row?.issueType || "").trim().toUpperCase())
  );
}

function isConfirmedIssueRow(row) {
  return row?.documentStatus === "confirmed" && row?.itemStatus === "confirmed";
}

function getIssueStatusLabel(row) {
  return isConfirmedIssueRow(row) ? "เบิกแล้ว" : "ยกเลิกแล้ว";
}

function getIssueStatusClassName(row) {
  return isConfirmedIssueRow(row)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function getProductDisplay(row) {
  const source = `${row.productCode} - ${row.productName}`;
  if (row.destinationRoomName) return `${source} → ${row.destinationRoomName}`;
  return row.targetProductCode
    ? `${source} → ${row.targetProductCode} - ${row.targetProductName || "-"}`
    : source;
}

function getIssueGroupStatus(group) {
  const items = Array.isArray(group?.items) ? group.items : [];
  const confirmedCount = items.filter((item) => isConfirmedIssueRow(item)).length;

  if (!items.length || confirmedCount === items.length) {
    return {
      label: "เบิกแล้ว",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (confirmedCount === 0) {
    return {
      label: "ยกเลิกแล้ว",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: "มีรายการยกเลิก",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

async function exportIssueWorkbook({
  groupedRows,
  filters,
  summary,
  departmentName,
  selectedProducts,
  issueTypes,
  reportConfig,
}) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(reportConfig.title);
  worksheet.columns = [
    { header: "ลำดับ", key: "sequence", width: 10 },
    { header: "รหัสบาร์โค้ด", key: "barcode", width: 24 },
    { header: "สินค้า", key: "productDisplay", width: 48 },
    { header: "LOT", key: "lotNo", width: 16 },
    { header: "จำนวน", key: "quantity", width: 12 },
    { header: "น้ำหนัก (Kg)", key: "weightKg", width: 16 },
    { header: "วันที่–เวลาเบิก", key: "issuedAtLabel", width: 22 },
    { header: "สถานะ", key: "statusLabel", width: 16 },
  ];

  worksheet.mergeCells("A1:H1");
  worksheet.getCell("A1").value = reportConfig.excelTitle;
  worksheet.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: "FF102C57" },
  };

  worksheet.mergeCells("A2:H2");
  worksheet.getCell("A2").value = `หน่วยงาน: ${departmentName || "-"}`;
  worksheet.getCell("A2").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A3:H3");
  worksheet.getCell("A3").value = `ช่วงวันที่: ${formatDateLabel(filters.dateFrom)} - ${formatDateLabel(filters.dateTo)}`;
  worksheet.getCell("A3").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A4:H4");
  worksheet.getCell("A4").value = `ประเภทการเบิก: ${
    getIssueTypeSummaryLabel(issueTypes, filters.issueTypes)
  } | สินค้า: ${
    selectedProducts.length
      ? selectedProducts.map((product) => `${product.code} ${product.name}`).join(", ")
      : "ทุกสินค้าในรายงาน"
  }`;
  worksheet.getCell("A4").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  if (reportConfig.hideIssueTypeMeta) {
  worksheet.getCell("A4").value = `สินค้า: ${
    selectedProducts.length
      ? selectedProducts.map((product) => `${product.code} ${product.name}`).join(", ")
      : "ทุกสินค้าในรายงาน"
  }`;
  }

  const headerRow = worksheet.getRow(6);
  headerRow.values = worksheet.columns.map((column) => column.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  headerRow.height = 24;

  let sequence = 1;
  groupedRows.forEach((group) => {
    const groupRow = worksheet.addRow({
      sequence: "",
      barcode: `วันที่ ${group.issueDateLabel}`,
      productDisplay: `${group.productDisplay}`,
      lotNo: group.lotNo,
      quantity: "",
      weightKg: "",
      issuedAtLabel: getIssueTypeLabel(issueTypes, group.issueType),
      statusLabel: "",
    });
    groupRow.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    groupRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF102C57" },
    };

    if (reportConfig.hideIssueTypeGroupHeader) {
      groupRow.getCell(7).value = "";
    }

    group.items.forEach((row) => {
      worksheet.addRow({
        sequence: sequence,
        barcode: row.barcode,
        productDisplay: getProductDisplay(row),
        lotNo: row.lotNo,
        quantity: row.quantity,
        weightKg: row.weightKg,
        issuedAtLabel: formatBusinessDateTime(row.issueDate, row.issuedAt),
        statusLabel: getIssueStatusLabel(row),
      });
      sequence += 1;
    });

    const subtotalRow = worksheet.addRow({
      sequence: "",
      barcode: "",
      productDisplay: "สรุปรวม",
      lotNo: "",
      quantity: group.totalQuantity,
      weightKg: group.totalWeightKg,
      issuedAtLabel: "",
      statusLabel: "",
    });
    subtotalRow.font = {
      bold: true,
      color: { argb: "FF111111" },
    };
    subtotalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFBFCFD" },
    };
  });

  const summaryRow = worksheet.addRow({
    sequence: "",
    barcode: "",
    productDisplay: "สรุปรวมทั้งรายงาน",
    lotNo: "",
    quantity: summary.totalQuantity,
    weightKg: summary.totalWeightKg,
    issuedAtLabel: "",
    statusLabel: "",
  });
  summaryRow.font = {
    bold: true,
    color: { argb: "FF111111" },
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

  worksheet.getColumn("weightKg").numFmt = "#,##0.00";
  worksheet.views = [{ state: "frozen", ySplit: 6 }];
  worksheet.autoFilter = "A6:H6";

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${reportConfig.excelFilePrefix}_${formatFilenameDateRange(filters.dateFrom, filters.dateTo)}.xlsx`
  );
}

export default function ProductionStockIssueReportPageClient({
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
  const fetchIssueReport = isPrisonReport
    ? fetchProductionPrisonIssueReport
    : fetchProductionStockIssueReport;
  const normalizedProductOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );
  const [rows, setRows] = useState(() =>
    filterRowsByAllowedIssueTypes(normalizeRows(initialRows), resolvedReportConfig.allowedIssueTypes)
  );
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

  const [searchBarcodeQuery, setSearchBarcodeQuery] = useState("");
  const [activeSearchBarcode, setActiveSearchBarcode] = useState("");
  const [barcodeMatches, setBarcodeMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchError, setSearchError] = useState(false);
  const [highlightedIssueItemId, setHighlightedIssueItemId] = useState(null);

  const selectedProducts = useMemo(
    () =>
      normalizedProductOptions.filter((option) =>
        filters.productCodes.includes(option.code)
      ),
    [filters.productCodes, normalizedProductOptions]
  );

  const issueTypeSummaryLabel = useMemo(
    () => getIssueTypeSummaryLabel(issueTypes, filters.issueTypes),
    [filters.issueTypes, issueTypes]
  );
  const issueStatusSummaryLabel = useMemo(
    () => getIssueStatusSummaryLabel(filters.issueStatuses),
    [filters.issueStatuses]
  );

  const groupedRows = useMemo(() => {
    const groups = [];
    const groupMap = new Map();

    rows.forEach((row, index) => {
      const key = [row.issueDate, row.lotNo, row.productCode, row.destinationRoomCode, row.issueType].join("|");
      if (!groupMap.has(key)) {
        const group = {
          key,
          issueDate: row.issueDate,
          issueDateLabel: formatDateLabel(row.issueDate),
          lotNo: row.lotNo,
          productDisplay: getProductDisplay(row),
          issueType: row.issueType,
          totalQuantity: 0,
          totalWeightKg: 0,
          items: [],
        };
        groupMap.set(key, group);
        groups.push(group);
      }

      const group = groupMap.get(key);
      group.items.push({
        ...row,
        sequence: (pagination.page - 1) * pagination.limit + index + 1,
      });
      if (isConfirmedIssueRow(row)) {
        group.totalQuantity = Number((group.totalQuantity + row.quantity).toFixed(3));
        group.totalWeightKg = Number((group.totalWeightKg + row.weightKg).toFixed(2));
      }
    });

    return groups;
  }, [pagination.limit, pagination.page, rows]);

  const productSummaryLabel = useMemo(() => {
    if (!selectedProducts.length) {
      return "ทุกสินค้าในรายงาน";
    }
    if (selectedProducts.length === 1) {
      return `${selectedProducts[0].code} ${selectedProducts[0].name}`;
    }
    return `เลือกแล้ว ${selectedProducts.length} รายการ`;
  }, [selectedProducts]);

  const reportPeriodLabel = useMemo(() => {
    const dateFromLabel = formatDateLabel(filters.dateFrom);
    const dateToLabel = formatDateLabel(filters.dateTo);
    if (filters.dateFrom === filters.dateTo) {
      return dateFromLabel;
    }
    return `${dateFromLabel} - ${dateToLabel}`;
  }, [filters.dateFrom, filters.dateTo]);

  const applyPayload = (payload) => {
    const normalizedRows = filterRowsByAllowedIssueTypes(
      normalizeRows(payload?.rows),
      resolvedReportConfig.allowedIssueTypes
    );
    setRows(normalizedRows);
    setSummary(
      normalizeSummary({
        totalCount: normalizedRows.filter((row) => isConfirmedIssueRow(row)).length,
        totalQuantity: normalizedRows.reduce(
          (sum, row) => (isConfirmedIssueRow(row) ? Number((sum + row.quantity).toFixed(3)) : sum),
          0
        ),
        totalWeightKg: normalizedRows.reduce(
          (sum, row) => (isConfirmedIssueRow(row) ? Number((sum + row.weightKg).toFixed(2)) : sum),
          0
        ),
      })
    );
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

  const flatVirtualRows = useMemo(() => {
    const virtualRows = [];
    groupedRows.forEach((group) => {
      virtualRows.push({ type: 'group-header', data: group });
      group.items.forEach((item) => {
        virtualRows.push({ type: 'item', data: item });
      });
      virtualRows.push({ type: 'group-footer', data: group });
    });
    if (rows.length) {
      virtualRows.push({
        type: 'grand-footer',
        data: {
          totalQuantity: summary.totalQuantity,
          totalWeightKg: summary.totalWeightKg,
        },
      });
    }
    return virtualRows;
  }, [rows, groupedRows, summary]);

  const reportPages = useMemo(() => {
    if (!rows.length) return [];

    let pages = [];
    let currentPage = [];
    let currentWeight = 0;
    const FIRST_PAGE_LIMIT = 24;
    const OTHER_PAGE_LIMIT = 24;

    const getLimit = () => (pages.length === 0 ? FIRST_PAGE_LIMIT : OTHER_PAGE_LIMIT);

    groupedRows.forEach(group => {
      // 1. Add group-header
      const headerWeight = 2.5;
      let limit = getLimit();
      
      // Prevent orphan headers: require room for header + at least 1 item
      if (currentWeight + headerWeight + 1.0 > limit) {
        pages.push(currentPage);
        currentPage = [];
        currentWeight = 0;
        limit = getLimit();
      }
      
      currentPage.push({ type: 'group-header', data: group });
      currentWeight += headerWeight;

      // 2. Add group items
      group.items.forEach(item => {
        const itemWeight = 1.0;
        limit = getLimit();

        if (currentWeight + itemWeight > limit) {
          pages.push(currentPage);
          currentPage = [];
          currentWeight = 0;
          limit = getLimit();

          // Since this is a new page and we split a group, add the group-header as a continuation!
          const contHeaderWeight = 2.5;
          currentPage.push({ 
            type: 'group-header', 
            data: { ...group, isContinuation: true } 
          });
          currentWeight += contHeaderWeight;
        }

        currentPage.push({ type: 'item', data: item });
        currentWeight += itemWeight;
      });

      // 3. Add group-footer
      const footerWeight = 1.5;
      limit = getLimit();

      if (currentWeight + footerWeight > limit) {
        pages.push(currentPage);
        currentPage = [];
        currentWeight = 0;
        limit = getLimit();
      }

      currentPage.push({ type: 'group-footer', data: group });
      currentWeight += footerWeight;
    });

    // 4. Add grand-footer at the very end
    const grandFooterWeight = 1.5;
    let limit = getLimit();

    if (currentWeight + grandFooterWeight > limit) {
      pages.push(currentPage);
      currentPage = [];
      currentWeight = 0;
    }

    currentPage.push({
      type: 'grand-footer',
      data: {
        totalQuantity: summary.totalQuantity,
        totalWeightKg: summary.totalWeightKg,
      }
    });
    currentWeight += grandFooterWeight;

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }, [rows, groupedRows, summary]);

  const loadReport = (nextFilters) => {
    setErrorMessage("");
    setFeedback("");

    startTransition(async () => {
      try {
        if (typeof window !== "undefined") {
          const params = new URLSearchParams();
          if (nextFilters.dateFrom) params.set("dateFrom", nextFilters.dateFrom);
          if (nextFilters.dateTo) params.set("dateTo", nextFilters.dateTo);
          if (nextFilters.search) params.set("search", nextFilters.search);
          if (nextFilters.lotNo) params.set("lotNo", nextFilters.lotNo);
          if (nextFilters.issueType && nextFilters.issueType !== "ALL") params.set("issueType", nextFilters.issueType);
          if (Array.isArray(nextFilters.productCodes) && nextFilters.productCodes.length > 0) {
            nextFilters.productCodes.forEach((code) => params.append("productCodes", code));
          }
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
          upsertTab(newUrl);
        }

        const payload = await fetchIssueReport({
          dateFrom: nextFilters.dateFrom,
          dateTo: nextFilters.dateTo,
          issueTypes: nextFilters.issueTypes.length > 0 ? nextFilters.issueTypes : null,
          issueStatuses: nextFilters.issueStatuses.length > 0 ? nextFilters.issueStatuses : null,
          productCodes: nextFilters.productCodes,
          includeAll: true, // Always fetch all for visual paging
          page: 1,
          limit: 1000,
        });

        applyPayload(payload);
        setCurrentViewPage(0);
        setFeedback("อัปเดตรายงานเบิกเรียบร้อย");
      } catch (error) {
        setErrorMessage(error?.message || "ไม่สามารถโหลดรายงานเบิกได้");
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
    if (!normalizedValue) return;

    setFilters((current) => {
      const exists = current.issueTypes.includes(normalizedValue);
      return {
        ...current,
        issueTypes: exists
          ? current.issueTypes.filter((v) => v !== normalizedValue)
          : [...current.issueTypes, normalizedValue],
        page: 1,
      };
    });
  };

  const clearIssueTypeSelection = () => {
    setFilters((current) => ({
      ...current,
      issueTypes: [],
      page: 1,
    }));
  };

  const toggleIssueStatus = (value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (!ISSUE_STATUS_OPTIONS.some((option) => option.value === normalizedValue)) return;

    setFilters((current) => ({
      ...current,
      issueStatuses: [normalizedValue],
      page: 1,
    }));
  };

  const clearIssueStatusSelection = () => {
    setFilters((current) => ({
      ...current,
      issueStatuses: ["confirmed"],
      page: 1,
    }));
  };

  const clearProductSelection = () => {
    setFilters((current) => ({
      ...current,
      productCodes: [],
      page: 1,
    }));
  };

  const handleReloadReport = () => {
    loadReport(filters);
  };

  const handleChangePage = (nextPage) => {
    const targetPage = Math.max(1, nextPage);
    const nextFilters = {
      ...filters,
      page: targetPage,
    };

    setFilters(nextFilters);
    loadReport(nextFilters);
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    setFeedback("");
    setErrorMessage("");

    try {
      const payload = await fetchIssueReport({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        issueTypes: filters.issueTypes.length > 0 ? filters.issueTypes : null,
        issueStatuses: filters.issueStatuses.length > 0 ? filters.issueStatuses : null,
        productCodes: filters.productCodes,
        includeAll: true,
        page: 1,
        limit: filters.limit,
      });

      const exportRows = normalizeRows(payload?.rows);
      if (!exportRows.length) {
        throw new Error("ไม่พบข้อมูลสำหรับส่งออกรายงานเบิก");
      }

      const exportGroupedRows = (() => {
        const groups = [];
        const groupMap = new Map();
        exportRows.forEach((row) => {
          const key = [row.issueDate, row.lotNo, row.productCode, row.destinationRoomCode, row.issueType].join("|");
          if (!groupMap.has(key)) {
            const group = {
              key,
              issueDate: row.issueDate,
              issueDateLabel: formatDateLabel(row.issueDate),
              lotNo: row.lotNo,
              productDisplay: getProductDisplay(row),
              issueType: row.issueType,
              totalQuantity: 0,
              totalWeightKg: 0,
              items: [],
            };
            groupMap.set(key, group);
            groups.push(group);
          }

          const group = groupMap.get(key);
          group.items.push(row);
          if (isConfirmedIssueRow(row)) {
            group.totalQuantity = Number((group.totalQuantity + row.quantity).toFixed(3));
            group.totalWeightKg = Number((group.totalWeightKg + row.weightKg).toFixed(2));
          }
        });
        return groups;
      })();

      await exportIssueWorkbook({
        groupedRows: exportGroupedRows,
        filters,
        summary: normalizeSummary(payload?.summary),
        departmentName: scope.departmentName,
        selectedProducts,
        issueTypes,
        reportConfig: resolvedReportConfig,
      });

      setFeedback("ส่งออกรายงานเบิก Excel เรียบร้อย");
    } catch (error) {
      setErrorMessage(error?.message || "ส่งออกรายงานเบิกไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintReport = () => {
    setFeedback("");
    setErrorMessage("");
    window.print();
  };

  const goToMatch = (match) => {
    if (!match) return;
    setCurrentViewPage(match.pageIndex);
    setHighlightedIssueItemId(match.issueItemId);
    setTimeout(() => {
      const element = document.getElementById(`row-${match.issueItemId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleBarcodeSearch = (term) => {
    setSearchError(false);
    setHighlightedIssueItemId(null);
    
    const trimmed = String(term || "").trim();
    if (!trimmed) {
      handleClearBarcodeSearch();
      return;
    }

    setActiveSearchBarcode(trimmed);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("barcode", trimmed);
      window.history.replaceState(null, "", url.pathname + url.search);
    }

    const normalizedTerm = trimmed.toLowerCase();
    const matches = [];

    reportPages.forEach((pageRows, pageIndex) => {
      pageRows.forEach((vRow) => {
        if (vRow.type === "item") {
          const row = vRow.data;
          const rowBarcode = String(row.barcode || "").toLowerCase();
          const rowProductCode = String(row.productCode || "").toLowerCase();
          
          let matchType = null;
          if (rowBarcode === normalizedTerm) {
            matchType = "exact-barcode";
          } else if (rowBarcode.includes(normalizedTerm)) {
            matchType = "barcode";
          } else if (rowProductCode === normalizedTerm || rowProductCode.includes(normalizedTerm)) {
            matchType = "product-code";
          }

          if (matchType) {
            matches.push({
              pageIndex,
              issueItemId: row.issueItemId,
              barcode: row.barcode,
              productCode: row.productCode,
              matchType,
            });
          }
        }
      });
    });

    if (matches.length > 0) {
      setBarcodeMatches(matches);
      setCurrentMatchIndex(0);
      goToMatch(matches[0]);
    } else {
      setBarcodeMatches([]);
      setCurrentMatchIndex(0);
      setSearchError(true);
    }
  };

  const handleClearBarcodeSearch = () => {
    setSearchBarcodeQuery("");
    setActiveSearchBarcode("");
    setBarcodeMatches([]);
    setCurrentMatchIndex(0);
    setSearchError(false);
    setHighlightedIssueItemId(null);
    
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("barcode");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  };

  const handlePrevMatch = () => {
    if (barcodeMatches.length <= 1) return;
    const nextIndex = (currentMatchIndex - 1 + barcodeMatches.length) % barcodeMatches.length;
    setCurrentMatchIndex(nextIndex);
    goToMatch(barcodeMatches[nextIndex]);
  };

  const handleNextMatch = () => {
    if (barcodeMatches.length <= 1) return;
    const nextIndex = (currentMatchIndex + 1) % barcodeMatches.length;
    setCurrentMatchIndex(nextIndex);
    goToMatch(barcodeMatches[nextIndex]);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const bc = params.get("barcode");
      if (bc && rows.length > 0) {
        setSearchBarcodeQuery(bc);
        const timer = setTimeout(() => {
          handleBarcodeSearch(bc);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626]">
      <div className="weight-scale-report-screen-only">
        <WeightScalePrimaryHeader
          eyebrow={resolvedReportConfig.eyebrow}
          badge={resolvedReportConfig.badge}
          title={resolvedReportConfig.title}
          description={resolvedReportConfig.description}
        />
      </div>

      <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <section className="weight-scale-report-print-shell border border-[#d7dde5] border-t-2 border-t-[#d4af37] bg-white">
          <div className="weight-scale-report-screen-only border-b border-[#d7dde5] bg-[#fcfbf7] px-6 py-5">
            {/* Barcode Search Section */}
            <div className="mb-5 border-b border-[#eef2f6] pb-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795] flex items-center gap-1.5">
                    <Barcode size={14} className="text-[#d4af37]" /> ค้นหาบาร์โค้ดแบบเจาะรายการ (Enter หรือสแกนเพื่อค้นหา)
                  </span>
                  <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-white px-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] focus-within:border-[#d4af37] focus-within:ring-1 focus-within:ring-[#d4af37] transition-all">
                    <Search size={16} className="text-[#7d8795]" />
                    <input
                      type="text"
                      placeholder="พิมพ์เลขบาร์โค้ด / สแกนบาร์โค้ด หรือพิมพ์รหัสสินค้า..."
                      value={searchBarcodeQuery}
                      onChange={(e) => setSearchBarcodeQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleBarcodeSearch(searchBarcodeQuery);
                        }
                      }}
                      className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none placeholder:text-[#94a3b8]"
                    />
                    {searchBarcodeQuery && (
                      <button
                        type="button"
                        onClick={handleClearBarcodeSearch}
                        className="text-[#7d8795] hover:text-[#102C57] p-1 rounded-full hover:bg-slate-100 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleBarcodeSearch(searchBarcodeQuery)}
                    className="h-12 border border-[#d4af37] bg-[#fffdf5] hover:bg-[#fff9e0] px-6 text-sm font-black text-[#7f5d00] transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    ค้นหาบาร์โค้ด
                  </button>
                  {activeSearchBarcode && (
                    <button
                      type="button"
                      onClick={handleClearBarcodeSearch}
                      className="h-12 border border-slate-200 bg-white hover:bg-slate-50 px-4 text-sm font-semibold text-[#5f6b7b] transition-colors cursor-pointer"
                    >
                      ล้างคำค้นหา
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation for matches */}
              {barcodeMatches.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-[#fffdf0] border border-[#eadfb8] px-4 py-2.5 rounded shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[#7f5d00]">
                    <span>พบ <strong className="font-extrabold text-[15px]">{barcodeMatches.length}</strong> รายการ</span>
                    <span>ที่ตรงกับคำค้นหา</span>
                    <code className="bg-[#fff9e0] px-1.5 py-0.5 border border-[#eadfb8] font-mono font-bold text-[#102C57]">{activeSearchBarcode}</code>
                    <span className="inline-flex items-center rounded bg-[var(--surface-navy,#102C57)] px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white whitespace-nowrap">
                      {barcodeMatches[currentMatchIndex]?.matchType === "product-code" ? "ตรงจากรหัสสินค้า" : "ตรงจากบาร์โค้ด"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handlePrevMatch}
                      className="px-3 py-1.5 bg-white border border-[#eadfb8] rounded hover:bg-[#fff9e0] font-black text-xs text-[#7f5d00] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      disabled={barcodeMatches.length <= 1}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="text-xs font-bold text-[#7d8795]">
                      รายการที่ {currentMatchIndex + 1} / {barcodeMatches.length} (แผ่นที่ {barcodeMatches[currentMatchIndex]?.pageIndex + 1})
                    </span>
                    <button
                      type="button"
                      onClick={handleNextMatch}
                      className="px-3 py-1.5 bg-white border border-[#eadfb8] rounded hover:bg-[#fff9e0] font-black text-xs text-[#7f5d00] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      disabled={barcodeMatches.length <= 1}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}

              {/* Search error (not found) */}
              {searchError && (
                <div className="mt-3 flex items-center justify-between bg-rose-50 border border-rose-200 px-4 py-3 rounded text-sm text-rose-700 shadow-sm animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-rose-800">ไม่พบรายการเบิก:</span> 
                    <span>ไม่พบเลขบาร์โค้ด หรือ รหัสสินค้า &quot;{activeSearchBarcode}&quot; ในรายงานช่วงเวลา แผนก หรือ เงื่อนไขที่ระบุด้านล่าง</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearBarcodeSearch}
                    className="text-xs font-black underline hover:text-rose-900 uppercase tracking-wider"
                  >
                    ล้างตัวค้นหา
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.4fr_auto]">
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

              <div className="relative block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  เลือกสินค้า
                </span>
                <button
                  type="button"
                  onClick={() => setIsProductPickerOpen((current) => !current)}
                  className="mt-2 flex h-12 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-[#102C57]">
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
                  <div className="absolute left-0 right-0 z-20 mt-2 border border-[#d7dde5] bg-white shadow-[0_18px_40px_rgba(16,44,87,0.14)]">
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

                    <div className="flex items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-3">
                      <button
                        type="button"
                        onClick={clearProductSelection}
                        className="text-xs font-black uppercase tracking-[0.14em] text-[#7d8795] transition hover:text-[#102C57]"
                      >
                        ล้างทั้งหมด
                      </button>
                      <span className="text-xs font-semibold text-[#7d8795]">
                        {selectedProducts.length
                          ? `เลือกแล้ว ${selectedProducts.length} รายการ`
                          : "ยังไม่ได้เลือกสินค้า"}
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto py-2">
                      {normalizedProductOptions.length ? (
                        normalizedProductOptions.map((product) => {
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
                        })
                      ) : (
                        <p className="px-4 py-6 text-sm text-[#7d8795]">
                          ไม่พบรายการสินค้าให้เลือก
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleReloadReport}
                  disabled={isPending}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 border border-[#d4af37] bg-[var(--surface-navy,#102C57)] px-5 text-sm font-black uppercase tracking-[0.14em] text-[#fff7df] transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
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

            <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative block min-w-[14rem]">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    สถานะรายการ
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsIssueStatusPickerOpen((current) => !current)}
                    className="mt-2 flex h-12 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-[#102C57]">
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
                    <div className="absolute left-0 right-0 z-30 mt-2 border border-[#d7dde5] bg-white shadow-[0_18px_40px_rgba(16,44,87,0.14)]">
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

                      <div className="flex items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-3">
                        <button
                          type="button"
                          onClick={clearIssueStatusSelection}
                          className="text-xs font-black uppercase tracking-[0.14em] text-[#7d8795] transition hover:text-[#102C57]"
                        >
                          ล้างทั้งหมด
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

                {!resolvedReportConfig.hideIssueTypeFilter ? (
                 <div className="relative block min-w-[16rem]">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    ประเภทการเบิก
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsIssueTypePickerOpen((current) => !current)}
                    className="mt-2 flex h-12 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-[#102C57]">
                      {resolvedReportConfig.hideIssueTypeMeta ? "" : issueTypeSummaryLabel}
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
                          เลือกประเภท
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsIssueTypePickerOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center border border-[#d7dde5] text-[#5f6b7b] transition hover:border-[#102C57] hover:text-[#102C57]"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-3">
                        <button
                          type="button"
                          onClick={clearIssueTypeSelection}
                          className="text-xs font-black uppercase tracking-[0.14em] text-[#7d8795] transition hover:text-[#102C57]"
                        >
                          ล้างทั้งหมด
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
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex items-center gap-3">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    แสดงต่อหน้า
                  </span>
                  <select
                    value={String(filters.limit)}
                    onChange={(event) =>
                      handleFieldChange(
                        "limit",
                        Number.parseInt(event.target.value, 10) || 20
                      )
                    }
                    className="h-10 border border-[#d7dde5] bg-white px-3 text-sm font-semibold text-[#102C57] outline-none"
                  >
                    {LIMIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} รายการ
                      </option>
                    ))}
                  </select>
                </label>

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

          <div className="weight-scale-report-screen-only grid gap-px border-x border-b border-[#d7dde5] bg-[#d7dde5] md:grid-cols-3 shadow-sm">
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Files size={14} className="text-[#102C57]" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  รายการเบิกทั้งหมด
                </p>
              </div>
              <p className="text-2xl font-semibold text-[#102C57]">{summary.totalCount}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <ListOrdered size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  จำนวนรวม (หน่วย)
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatQuantity(summary.totalQuantity)}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Scale size={14} className="text-amber-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  น้ำหนักเบิกรวม
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-[#102C57]">
                {formatWeight(summary.totalWeightKg)}
              </p>
            </div>
          </div>
        </section>

        {/* Visual Paging Controls (Crystal Report Style - Sticky/Floating at the bottom) */}
        {reportPages.length > 1 && (
          <div className="weight-scale-report-screen-only fixed inset-x-0 bottom-2 z-50 flex justify-center pointer-events-none print:hidden">
            <div className="flex items-center gap-3 bg-[var(--surface-navy,#102C57)]/95 text-white px-5 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setCurrentViewPage(prev => Math.max(0, prev - 1))}
                disabled={currentViewPage === 0}
                className="pointer-events-auto hover:text-[#d4af37] disabled:opacity-30 disabled:hover:text-white transition-colors"
                title="หน้าก่อนหน้า"
              >
                <ChevronLeft size={22} />
              </button>
              
              <div className="flex flex-col items-center min-w-[104px] leading-none">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#d4af37]/70">แผ่นที่</span>
                <span className="text-sm font-bold">{currentViewPage + 1} / {reportPages.length}</span>
              </div>

              <button
                type="button"
                onClick={() => setCurrentViewPage(prev => Math.min(reportPages.length - 1, prev + 1))}
                disabled={currentViewPage === reportPages.length - 1}
                className="pointer-events-auto hover:text-[#d4af37] disabled:opacity-30 disabled:hover:text-white transition-colors"
                title="หน้าถัดไป"
              >
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
        )}

        {/* A4 Paper Sheets Rendering (Screen Only) */}
        <div className="flex w-full flex-col items-center gap-8 overflow-x-auto py-4 pb-40 print:hidden">
          {reportPages.length ? (
            reportPages.map((pageRows, pageIndex) => (
              <section 
                key={pageIndex} 
                className={`weight-scale-report-print-shell detailed-issue-report-print-shell min-h-[210mm] w-[297mm] min-w-[297mm] max-w-[297mm] bg-white border border-black shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] relative ${
                  pageIndex === currentViewPage ? 'block' : 'hidden'
                }`}
              >
                {/* Corporate Report Header */}
                <div className="bg-white px-6 py-2 border-b border-black">
                  <ReportHeader
                    title={resolvedReportConfig.printTitle}
                    subtitle="Detailed Stock Issue Report"
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

                <div className="weight-scale-report-print-body min-h-[155mm] bg-white px-4 py-2">
                  <div className="overflow-hidden">
                    <table className="detailed-issue-report-table min-w-full table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "34%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "15%" }} />
                      </colgroup>
                      <thead className="bg-[#f8f9fa]">
                        <tr className="border-b-2 border-[#1a1c1e] text-[12.5px] font-black uppercase tracking-normal text-[#1a1c1e]">
                          <th className="px-3 py-0.5 text-center">ลำดับ</th>
                          <th className="px-3 py-0.5 text-center">รหัสบาร์โค้ด</th>
                          <th className="px-3 py-0.5 text-left detailed-issue-product-cell">สินค้า</th>
                          <th className="px-3 py-0.5 text-center">LOT</th>
                          <th className="px-3 py-0.5 text-center">จำนวน</th>
                          <th className="px-3 py-0.5 text-center">น้ำหนัก</th>
                          <th className="px-3 py-0.5 text-center detailed-issue-time-cell">วันที่–เวลาเบิก</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {pageRows.map((vRow, vIndex) => {
                          if (vRow.type === 'group-header') {
                            const group = vRow.data;
                            return (
                              <tr key={vIndex} className="bg-[var(--surface-navy,#102C57)] text-white">
                                <td colSpan={7} className="px-3 py-1">
                                  <div className="flex items-center gap-5 whitespace-nowrap">
                                    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f3d67a]">วันที่:</span>
                                      <span className="text-[12.5px] font-bold">{group.issueDateLabel}</span>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f3d67a]">สินค้า/LOT:</span>
                                      <span className="text-[12.5px] font-bold whitespace-nowrap">{group.productDisplay} | {group.lotNo}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f3d67a]">ประเภท:</span>
                                      <span className="text-[12.5px] font-bold">{getIssueTypeLabel(issueTypes, group.issueType)}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'item') {
                            const row = vRow.data;
                            const isHighlighted = row.issueItemId === highlightedIssueItemId;
                            return (
                              <tr 
                                key={vIndex} 
                                id={`row-${row.issueItemId}`}
                                className={`border-b border-black text-[12.5px] font-semibold text-[#111111] transition-all duration-300 ${
                                  isHighlighted 
                                    ? "bg-amber-100/90 text-amber-900 border-l-4 border-l-amber-500 font-bold" 
                                    : ""
                                }`}
                              >
                                <td className="px-3 py-0.5 text-center">{row.sequence}</td>
                                <td className="px-3 py-0.5 text-center font-mono text-[11px] whitespace-nowrap">{row.barcode}</td>
                                <td className="px-3 py-0.5 text-left whitespace-nowrap detailed-issue-product-cell">{getProductDisplay(row)}</td>
                                <td className="px-3 py-0.5 text-center whitespace-nowrap">{row.lotNo}</td>
                                <td className="px-3 py-0.5 text-center">{formatQuantity(row.quantity)}</td>
                                <td className="px-3 py-0.5 text-center">{formatWeight(row.weightKg)}</td>
                                <td className="px-3 py-0.5 text-center text-[11px] leading-none whitespace-nowrap detailed-issue-time-cell">{formatBusinessDateTime(row.issueDate, row.issuedAt)}</td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'group-footer') {
                            const group = vRow.data;
                            return (
                              <tr key={vIndex} className="bg-[#fbfcfd] border-b border-black">
                                <td colSpan={4} className="px-3 py-1 text-right font-black text-[12.5px]">สรุปรวมกลุ่ม</td>
                                <td className="px-3 py-1 text-center font-bold text-[12.5px]">{formatQuantity(group.totalQuantity)}</td>
                                <td className="px-3 py-1 text-center font-bold text-[12.5px]">{formatWeight(group.totalWeightKg)}</td>
                                <td />
                              </tr>
                            );
                          }
                          if (vRow.type === 'grand-footer') {
                            const data = vRow.data;
                            return (
                              <tr key={vIndex} className="bg-[#f0eada] border-b border-black text-[#102C57]">
                                <td colSpan={4} className="px-3 py-1.5 text-right font-black text-[12.5px] uppercase tracking-wider">สรุปรวมทั้งสิ้น</td>
                                <td className="px-3 py-1.5 text-center font-extrabold text-[12.5px]">{formatQuantity(data.totalQuantity)}</td>
                                <td className="px-3 py-1.5 text-center font-extrabold text-[12.5px]">{formatWeight(data.totalWeightKg)}</td>
                                <td />
                              </tr>
                            );
                          }
                          return null;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="absolute bottom-2 left-0 right-0 px-6 flex justify-between items-center text-[10px] text-[#64748b]">
                   <span>KPF Production Line Console - Detailed Issue</span>
                   <span className="font-bold">หน้า {pageIndex + 1} / {reportPages.length}</span>
                </div>
              </section>
            ))
          ) : (
            <div className="w-[297mm] min-w-[297mm] max-w-[297mm] bg-white border border-black px-4 py-12 text-center text-sm text-[#111111]">
               {isPending ? "กำลังโหลดข้อมูล..." : resolvedReportConfig.emptyMessage}
            </div>
          )}
        </div>

      {/* Continuous print table: the browser paginates the A4 landscape document. */}
      <div className="weight-scale-report-print-only hidden print:block">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          @page {
            size: A4 landscape;
            margin: 8mm 6mm;
          }
          .daily-issue-print-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 10.5pt !important;
            line-height: 1.25 !important;
            color: #111827 !important;
          }
          .daily-issue-print-table th,
          .daily-issue-print-table td {
            border: 0.5pt solid #cbd5e1 !important;
            padding: 4px 5px !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: clip !important;
          }
          .daily-issue-print-table .print-report-header th {
            border: none !important;
            border-bottom: 2px solid #102C57 !important;
            padding: 0 0 6px !important;
            background: #ffffff !important;
          }
          .daily-issue-print-table .print-report-meta th {
            border: none !important;
            border-bottom: 1px solid #102C57 !important;
            padding: 4px 5px !important;
            background: #f8fafc !important;
            color: #102C57 !important;
          }
          .daily-issue-print-table .table-header th {
            background: #f8f9fa !important;
            color: #1a1c1e !important;
            font-weight: 900 !important;
            text-align: center !important;
            font-size: 11px !important;
            border: 0.5pt solid #cbd5e1 !important;
            border-bottom: 2px solid #1a1c1e !important;
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }
          .daily-issue-print-table .group-header-row td {
            background: var(--surface-navy, #102C57) !important;
            color: #ffffff !important;
            font-weight: 900 !important;
            padding: 4px 6px !important;
            border: 0.5pt solid #102C57 !important;
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
          .daily-issue-print-table thead {
            display: table-header-group !important;
          }
          .daily-issue-print-table thead tr,
          .daily-issue-print-table .group-header-row,
          .daily-issue-print-table .subtotal-row,
          .daily-issue-print-table .grand-total-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .daily-issue-print-table tbody tr.item-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .daily-issue-print-table tbody tr.item-row:nth-child(even) {
            background-color: #f8fafc !important;
          }
          .daily-issue-print-table .subtotal-row td {
            background-color: #fbfcfd !important;
            color: #111111 !important;
            font-weight: 900 !important;
            border: 0.5pt solid #cbd5e1 !important;
          }
          .daily-issue-print-table .grand-total-row td {
            background-color: #f0eada !important;
            color: #102C57 !important;
            font-weight: 900 !important;
            border: 0.5pt solid #d4af37 !important;
          }
          .daily-issue-print-table .table-header th:not(:nth-child(4)),
          .daily-issue-print-table tbody tr.item-row td:not(:nth-child(4)) {
            text-align: center !important;
          }
          .daily-issue-print-table .table-header th:nth-child(4),
          .daily-issue-print-table tbody tr.item-row td:nth-child(4) {
            text-align: left !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            line-height: 1.2 !important;
          }
          .daily-issue-print-table .subtotal-row td:first-child,
          .daily-issue-print-table .grand-total-row td:first-child {
            text-align: right !important;
          }
          .daily-issue-print-table .subtotal-row td:nth-child(2),
          .daily-issue-print-table .subtotal-row td:nth-child(3),
          .daily-issue-print-table .grand-total-row td:nth-child(2),
          .daily-issue-print-table .grand-total-row td:nth-child(3) {
            text-align: center !important;
          }
        ` }} />
        {flatVirtualRows.length ? (
          <table className="daily-issue-print-table">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "36%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <ReportHeader
                title={resolvedReportConfig.printTitle}
                subtitle="Detailed Stock Issue Report"
                meta={[
                  { label: "แผนก", value: scope.departmentName || "-" },
                  { label: "ช่วงวันที่", value: reportPeriodLabel },
                  { label: "ประเภท", value: issueTypeSummaryLabel },
                ]}
                printedAt={printedAtLabel}
                printedBy={profile.username || "System"}
                variant="table-rows"
                colSpan={8}
              />
              <tr className="table-header">
                <th>ลำดับ</th>
                <th>วันที่–เวลาเบิก</th>
                <th>รหัสบาร์โค้ด</th>
                <th className="text-left">สินค้า WIP → สินค้าปลายทาง</th>
                <th>LOT</th>
                <th>ประเภท</th>
                <th>จำนวน</th>
                <th>น้ำหนัก</th>
              </tr>
            </thead>
            <tbody>
              {flatVirtualRows.map((vRow, vIndex) => {
                if (vRow.type === 'group-header') {
                  return null;
                }
                if (vRow.type === 'item') {
                  const row = vRow.data;
                  return (
                    <tr key={vIndex} className="item-row">
                      <td>{row.sequence}</td>
                      <td>{formatBusinessDateTime(row.issueDate, row.issuedAt)}</td>
                      <td>{row.barcode}</td>
                      <td className="text-left">{getProductDisplay(row)}</td>
                      <td>{row.lotNo}</td>
                      <td>{getIssueTypeLabel(issueTypes, row.issueType)}</td>
                      <td>{formatQuantity(row.quantity)}</td>
                      <td>{formatWeight(row.weightKg)} Kg</td>
                    </tr>
                  );
                }
                if (vRow.type === 'group-footer') {
                  const group = vRow.data;
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={6} className="text-right">รวม {group.productDisplay} | LOT {group.lotNo}</td>
                      <td>{formatQuantity(group.totalQuantity)}</td>
                      <td>{formatWeight(group.totalWeightKg)} Kg</td>
                    </tr>
                  );
                }
                if (vRow.type === 'grand-footer') {
                  const data = vRow.data;
                  return (
                    <tr key={vIndex} className="grand-total-row">
                      <td colSpan={6} className="text-right uppercase tracking-wider">สรุปรวมทั้งสิ้น</td>
                      <td>{formatQuantity(data.totalQuantity)}</td>
                      <td>{formatWeight(data.totalWeightKg)} Kg</td>
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
  </div>
);
}
