"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileCheck,
  FileSearch,
  Files,
  Printer,
  RefreshCw,
  Scale,
  Search,
  Truck,
  X,
} from "lucide-react";
import { printWeightScaleLabelViaAgent } from "@/features/production-line/services/localPrintAgentClient";
import {
  exportScaleReceiptErpExcel,
  fetchScaleReceiptReport,
  logScaleReceiptReportPrint,
  previewScaleReceiptErpExport,
} from "@/features/production-line/services/scaleClient";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  buildWeightScaleReportPrintLog,
  printReportWithBestEffortAudit,
} from "@/lib/weight-scale-report-print-log";

const LIMIT_OPTIONS = [20, 50, 100];

const ITEM_STATUS_FILTER_OPTIONS = [
  { value: "confirmed", label: "ชั่งเข้าสำเร็จ" },
  { value: "available", label: "พร้อมเบิก" },
  { value: "issued", label: "เบิกแล้ว" },
  { value: "voided", label: "ยกเลิกชั่งแล้ว" },
];

function normalizeReceiptRows(receipts) {
  if (!Array.isArray(receipts)) {
    return [];
  }

  return receipts
    .map((receipt) => {
      const id = String(receipt?.id || "").trim();
      if (!id) {
        return null;
      }

      return {
        id,
        barcode: String(receipt?.barcode || "").trim() || "-",
        productCode: String(receipt?.productCode || "").trim().toUpperCase() || "-",
        productName: String(receipt?.productName || "").trim() || "-",
        lotNo: String(receipt?.lotNo || "").trim() || "-",
        netWeightKg: Number.isFinite(Number(receipt?.netWeightKg))
          ? Number(receipt.netWeightKg)
          : 0,
        weighedAt: receipt?.weighedAt || null,
        isTest: Boolean(receipt?.isTest),
        itemStatus: String(receipt?.itemStatus || "").trim().toLowerCase() || "available",
        metadata: receipt?.metadata || {},
      };
    })
    .filter(Boolean);
}

function getCleanReceiptItemStatusLabel(itemStatus) {
  const normalizedStatus = String(itemStatus || "").trim().toLowerCase();
  if (normalizedStatus === "issued") {
    return "เบิกแล้ว";
  }
  if (normalizedStatus === "voided") {
    return "ยกเลิกชั่งแล้ว";
  }
  return "พร้อมเบิก";
}

function getReceiptItemStatusClassName(itemStatus) {
  const normalizedStatus = String(itemStatus || "").trim().toLowerCase();
  if (normalizedStatus === "issued") {
    return "border-[#c9d4e3] bg-[#f5f7fa] text-[#111111]";
  }
  if (normalizedStatus === "voided") {
    return "border-rose-200 bg-rose-50 text-[#111111]";
  }
  return "border-[#d4af37]/35 bg-[#fff8df] text-[#111111]";
}

function normalizeSummary(summary) {
  const safeSummary = summary && typeof summary === "object" ? summary : {};

  return {
    totalCount: Number.isFinite(Number(safeSummary.totalCount))
      ? Number(safeSummary.totalCount)
      : 0,
    actualCount: Number.isFinite(Number(safeSummary.actualCount))
      ? Number(safeSummary.actualCount)
      : 0,
    testCount: Number.isFinite(Number(safeSummary.testCount))
      ? Number(safeSummary.testCount)
      : 0,
    totalNetWeightKg: Number.isFinite(Number(safeSummary.totalNetWeightKg))
      ? Number(safeSummary.totalNetWeightKg)
      : 0,
  };
}

function normalizePagination(pagination) {
  const safePagination = pagination && typeof pagination === "object" ? pagination : {};
  const limit = Number.isFinite(Number(safePagination.limit)) ? Number(safePagination.limit) : 20;
  const totalCount = Number.isFinite(Number(safePagination.totalCount))
    ? Number(safePagination.totalCount)
    : 0;
  const totalPages = Number.isFinite(Number(safePagination.totalPages))
    ? Number(safePagination.totalPages)
    : totalCount
      ? Math.ceil(totalCount / limit)
      : 0;
  const page = Number.isFinite(Number(safePagination.page)) ? Number(safePagination.page) : 1;

  return {
    page: Math.max(1, page),
    limit,
    totalCount,
    totalPages,
  };
}

function normalizeFilterState(filters, pagination) {
  const safeFilters = filters && typeof filters === "object" ? filters : {};
  const normalizedPagination = normalizePagination(pagination);
  const requestedItemStatus = String(safeFilters.itemStatus || "").trim().toLowerCase();

  return {
    dateFrom: String(safeFilters.dateFrom || "").trim(),
    dateTo: String(safeFilters.dateTo || "").trim(),
    search: String(safeFilters.search || "").trim(),
    lotNo: String(safeFilters.lotNo || "").trim().toUpperCase(),
    isTest:
      typeof safeFilters.isTest === "boolean"
        ? safeFilters.isTest
          ? "test"
          : "actual"
        : "all",
    itemStatus: ["confirmed", "available", "issued", "voided"].includes(requestedItemStatus)
      ? requestedItemStatus
      : "confirmed",
    productCodes: Array.isArray(safeFilters.productCodes)
      ? Array.from(
          new Set(
            safeFilters.productCodes
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          )
        )
      : [],
    limit: LIMIT_OPTIONS.includes(normalizedPagination.limit) ? normalizedPagination.limit : 20,
    page: normalizedPagination.page,
    maxItems: safeFilters.maxItems ? Number.parseInt(String(safeFilters.maxItems), 10) || "" : "",
    itemStart: safeFilters.itemStart ? Number.parseInt(String(safeFilters.itemStart), 10) || "" : "",
    itemEnd: safeFilters.itemEnd ? Number.parseInt(String(safeFilters.itemEnd), 10) || "" : "",
    recordType: String(safeFilters.recordType || "all").trim().toLowerCase(),
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

function formatWeightDisplay(value) {
  const normalizedValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return normalizedValue.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function calculateProductionShift(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const bangkokTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const hours = bangkokTime.getHours();
  const minutes = bangkokTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  let shift = 1;
  const productionDate = new Date(bangkokTime);
  if (timeInMinutes >= 361 && timeInMinutes <= 1140) {
    shift = 1;
  } else {
    shift = 2;
    if (timeInMinutes <= 360) {
      productionDate.setDate(productionDate.getDate() - 1);
    }
  }
  const year = productionDate.getFullYear();
  const month = String(productionDate.getMonth() + 1).padStart(2, "0");
  const day = String(productionDate.getDate()).padStart(2, "0");
  return {
    productionDate: `${year}-${month}-${day}`,
    shift,
  };
}

function formatShiftLabel(shift) {
  if (shift === 1) return "กะ1 [06:01 - 19:00]";
  if (shift === 2) return "กะ2 [19:01 - 06:00]";
  return `กะ ${shift}`;
}

function formatReportGroupDateLabel(productionDate) {
  if (!productionDate) return "-";
  const [yearText, monthText, dayText] = productionDate.split("-");
  const buddhistYear = String(Number(yearText) + 543).slice(-2);
  return `${dayText}/${monthText}/${buddhistYear}`;
}

function formatDateInputLabel(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "-";
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!year || !month || !day) {
    return "-";
  }

  const buddhistYear = String(year + 543).slice(-2);
  const paddedDay = String(day).padStart(2, "0");
  const paddedMonth = String(month).padStart(2, "0");

  return `${paddedDay}/${paddedMonth}/${buddhistYear}`;
}

function buildReceiptPrintLabel(receipt) {
  if (!receipt?.barcode) {
    return null;
  }

  return {
    barcodeValue: receipt.barcode,
    barcodeText: receipt.barcode,
    productName: receipt.productName || "-",
    productCode: receipt.productCode || "-",
    lotNo: receipt.lotNo || "-",
    tareWeightKg: Number.isFinite(Number(receipt.tareWeightKg))
      ? Number(receipt.tareWeightKg)
      : 0,
    netWeightKg: Number.isFinite(Number(receipt.netWeightKg))
      ? Number(receipt.netWeightKg)
      : 0,
    weighedAt: receipt.weighedAt || new Date().toISOString(),
    unitLabel: "กก.",
    printer: {
      labelWidthMm: 80,
      labelHeightMm: 50,
      symbology: "CODE128",
    },
  };
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

function buildErpReceiptExportFilters({ departmentId, filters }) {
  return {
    departmentId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    search: filters.search,
    itemStatus: filters.itemStatus,
    productCodes: filters.productCodes,
  };
}

function formatFilenameDateRange(dateFrom, dateTo) {
  const normalizedFrom = String(dateFrom || "").trim();
  const normalizedTo = String(dateTo || "").trim();
  const safeFrom = normalizedFrom ? normalizedFrom.replaceAll("-", "") : "all";
  const safeTo = normalizedTo ? normalizedTo.replaceAll("-", "") : safeFrom;
  return `${safeFrom}_${safeTo}`;
}

async function exportReportWorkbook({
  rows = [],
  filters,
  summary,
  departmentName,
  selectedProducts,
}) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(filters.recordType === "return" ? "รายงานชั่งคืนวัตถุดิบ" : "รายงานชั่งน้ำหนัก");

  worksheet.columns = [
    { header: "ลำดับ", key: "sequence", width: 10 },
    { header: "บาร์โค้ด", key: "barcode", width: 24 },
    { header: "สินค้า", key: "productDisplay", width: 58 },
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "จำนวน", key: "quantity", width: 12 },
    { header: "น้ำหนักสุทธิ (Kg)", key: "netWeightKg", width: 18 },
    { header: "เวลา", key: "weighedAt", width: 22 },
  ];

  worksheet.mergeCells("A1:G1");
  worksheet.getCell("A1").value = filters.recordType === "return" ? "รายงานชั่งคืนวัตถุดิบย้อนหลัง" : "รายงานชั่งน้ำหนักย้อนหลัง";
  worksheet.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: "FF102C57" },
  };

  worksheet.mergeCells("A2:G2");
  worksheet.getCell("A2").value = `หน่วยงาน: ${departmentName || "-"}`;
  worksheet.getCell("A2").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A3:G3");
  worksheet.getCell("A3").value = `ช่วงวันที่: ${filters.dateFrom || "-"} ถึง ${filters.dateTo || "-"}`;
  worksheet.getCell("A3").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A4:G4");
  worksheet.getCell("A4").value = `สินค้า: ${
    selectedProducts.length
      ? selectedProducts.map((product) => `${product.code} ${product.name}`).join(", ")
      : "ทั้งหมด"
  }`;
  worksheet.getCell("A4").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A5:G5");
  worksheet.getCell("A5").value = `ประเภทรายการ: ${
    filters.isTest === "actual"
      ? "ข้อมูลจริง"
      : filters.isTest === "test"
        ? "ข้อมูลทดสอบ"
        : "ทั้งหมด"
  } | จำนวน ${summary.totalCount} รายการ | น้ำหนักรวม ${formatWeightDisplay(
    summary.totalNetWeightKg
  )} Kg`;
  worksheet.getCell("A5").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  const headerRow = worksheet.getRow(7);
  headerRow.values = worksheet.columns.map((column) => column.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  headerRow.height = 24;

  rows.forEach((row, index) => {
    worksheet.addRow({
      sequence: index + 1,
      barcode: row.barcode,
      productDisplay: row.productCode
        ? `${row.productCode} - ${row.productName}`
        : row.productName,
      lotNo: row.lotNo,
      quantity: 1,
      netWeightKg: row.netWeightKg,
      weighedAt: formatDateTime(row.weighedAt),
    });
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      if (rowNumber > 7) {
        cell.alignment = { vertical: "top", wrapText: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: rowNumber % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
        };
      }
    });
  });

  worksheet.getColumn("netWeightKg").numFmt = "#,##0.00";
  worksheet.views = [{ state: "frozen", ySplit: 7 }];
  worksheet.autoFilter = "A7:F7";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${
    filters.recordType === "return" ? "weight-scale-return-report" : "weight-scale-report"
  }_${formatFilenameDateRange(
    filters.dateFrom,
    filters.dateTo
  )}.xlsx`;

  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export default function WeightScaleReportPageClient({
  departmentId = null,
  departmentName = "แผนกบิสกิต",
  productOptions = [],
  initialReportPayload = null,
}) {
  const normalizedProductOptions = useMemo(
    () => normalizeProductOptions(productOptions),
    [productOptions]
  );
  const initialRows = useMemo(
    () => normalizeReceiptRows(initialReportPayload?.receipts),
    [initialReportPayload]
  );
  const initialSummary = useMemo(
    () => normalizeSummary(initialReportPayload?.summary),
    [initialReportPayload]
  );
  const initialPagination = useMemo(
    () => normalizePagination(initialReportPayload?.pagination),
    [initialReportPayload]
  );
  const initialFilters = useMemo(
    () => normalizeFilterState(initialReportPayload?.filters, initialReportPayload?.pagination),
    [initialReportPayload]
  );

  const [filters, setFilters] = useState(initialFilters);
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [pagination, setPagination] = useState(initialPagination);
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reprintReceiptId, setReprintReceiptId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewingErp, setIsPreviewingErp] = useState(false);
  const [isExportingErp, setIsExportingErp] = useState(false);
  const [erpPreview, setErpPreview] = useState(null);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [currentViewPage, setCurrentViewPage] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setRows(normalizeReceiptRows(initialReportPayload?.receipts));
    setSummary(normalizeSummary(initialReportPayload?.summary));
    setPagination(normalizePagination(initialReportPayload?.pagination));
    setFilters(normalizeFilterState(initialReportPayload?.filters, initialReportPayload?.pagination));
    setCurrentViewPage(0);
  }, [initialReportPayload]);

  const profile = useUserProfile();

  const activeReceipts = useMemo(() => {
    const isLookingForVoided = filters.itemStatus === "voided";

    const baselineRows = rows.filter(r => {
      const status = String(r.itemStatus || "").trim().toLowerCase();
      if (isLookingForVoided) {
        return status === "voided";
      }
      return status !== "voided";
    });

    const mapped = baselineRows.map((item, index) => ({
      ...item,
      originalSequence: index + 1
    }));

    const filtered = mapped.filter(r => {
      if (
        ["available", "issued", "voided"].includes(filters.itemStatus)
        && r.itemStatus !== filters.itemStatus
      ) {
        return false;
      }
      return true;
    });

    let startIdx = 0;
    let endIdx = filtered.length;

    if (filters.itemStart) {
      startIdx = Math.max(0, Number.parseInt(String(filters.itemStart), 10) - 1);
    }
    if (filters.itemEnd) {
      endIdx = Number.parseInt(String(filters.itemEnd), 10);
    } else if (filters.maxItems) {
      const maxItemsLimit = Number.parseInt(String(filters.maxItems), 10) || 0;
      if (maxItemsLimit > 0) {
        endIdx = maxItemsLimit;
      }
    }

    return filtered.slice(startIdx, endIdx);
  }, [rows, filters.itemStatus, filters.itemStart, filters.itemEnd, filters.maxItems]);

  const summaryStats = useMemo(() => {
    const available = rows.filter(r => r.itemStatus === 'available').length;
    const issued = rows.filter(r => r.itemStatus === 'issued').length;
    const totalCount = activeReceipts.length;
    const totalWeight = activeReceipts.reduce((acc, r) => acc + (Number(r.netWeightKg) || 0), 0);
    return { available, issued, totalCount, totalWeight };
  }, [rows, activeReceipts]);

  const selectedProducts = useMemo(
    () =>
      normalizedProductOptions.filter((option) =>
        filters.productCodes.includes(option.code)
      ),
    [filters.productCodes, normalizedProductOptions]
  );

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const productSummaryLabel = useMemo(() => {
    if (!selectedProducts.length) {
      return "สินค้าทั้งหมด";
    }

    if (selectedProducts.length === 1) {
      return `${selectedProducts[0].code} ${selectedProducts[0].name}`;
    }

    return `เลือกแล้ว ${selectedProducts.length} รายการ`;
  }, [selectedProducts]);

  const flatVirtualRows = useMemo(() => {
    if (!activeReceipts.length) return [];

    const dateGroupsMap = new Map();
    activeReceipts.forEach(receipt => {
      let prodDate = receipt.metadata?.productionDate;
      let shift = receipt.metadata?.shift;
      if (!prodDate || !shift) {
        const calculated = calculateProductionShift(receipt.weighedAt);
        prodDate = calculated.productionDate;
        shift = calculated.shift;
      }
      const dateKey = `${prodDate}|${shift}`;
      if (!dateGroupsMap.has(dateKey)) {
        dateGroupsMap.set(dateKey, {
          label: `${formatReportGroupDateLabel(prodDate)} - ${formatShiftLabel(shift)}`,
          products: new Map()
        });
      }
      
      const productKey = `${receipt.productCode}|${receipt.lotNo}`;
      const dateGroup = dateGroupsMap.get(dateKey);
      if (!dateGroup.products.has(productKey)) {
        dateGroup.products.set(productKey, {
          productDisplay: receipt.productCode ? `${receipt.productCode} - ${receipt.productName}` : receipt.productName,
          lotNo: receipt.lotNo || "-",
          isTest: receipt.isTest,
          items: []
        });
      }
      dateGroup.products.get(productKey).items.push(receipt);
    });

    const virtualRows = [];
    let displaySeq = 1;

    dateGroupsMap.forEach((dateGroup) => {
      const visibleProducts = Array.from(dateGroup.products.values());
      if (visibleProducts.length === 0) return;

      let dateHeaderPushed = false;

      visibleProducts.forEach((productGroup) => {
        if (!dateHeaderPushed) {
          virtualRows.push({ type: 'date-header', label: dateGroup.label });
          dateHeaderPushed = true;
        }

        const hasAvailable = productGroup.items.some(item => String(item.itemStatus).toLowerCase() === "available");
        const hasVoidedOnly = productGroup.items.every(item => String(item.itemStatus).toLowerCase() === "voided");
        const calculatedStatus = hasVoidedOnly ? "voided" : (hasAvailable ? "available" : "issued");

        virtualRows.push({ 
          type: 'product-header', 
          display: productGroup.productDisplay, 
          lotNo: productGroup.lotNo,
          itemStatus: calculatedStatus,
          isTest: productGroup.isTest,
          itemsCount: productGroup.items.length
        });
        
        const chunksMap = new Map();
        productGroup.items.forEach(item => {
          const chunkIdx = Math.floor((item.originalSequence - 1) / 20);
          if (!chunksMap.has(chunkIdx)) {
            chunksMap.set(chunkIdx, []);
          }
          chunksMap.get(chunkIdx).push(item);
        });

        const sortedChunkIndices = Array.from(chunksMap.keys()).sort((a, b) => a - b);
        sortedChunkIndices.forEach(chunkIdx => {
          const chunkItems = chunksMap.get(chunkIdx);
          const chunkWeight = chunkItems.reduce((acc, item) => acc + (Number(item.netWeightKg) || 0), 0);

          chunkItems.forEach((item) => {
            virtualRows.push({
              type: "detail",
              sequence: displaySeq++,
              barcode: item.barcode || "-",
              productDisplay: productGroup.productDisplay,
              lotNo: productGroup.lotNo,
              qty: 1,
              weight: Number(item.netWeightKg) || 0,
              timeLabel: formatDateTime(item.weighedAt),
            });
          });

          virtualRows.push({
            type: "subtotal",
            qty: chunkItems.length,
            weight: chunkWeight,
          });
        });
        
        virtualRows.push({ 
          type: 'product-footer', 
          lotNo: productGroup.lotNo, 
          qty: productGroup.items.length,
          weight: productGroup.items.reduce((acc, i) => acc + (Number(i.netWeightKg) || 0), 0)
        });
      });
    });

    return virtualRows;
  }, [activeReceipts]);

  const reportPages = useMemo(() => {
    if (!activeReceipts.length) return [];

    const pages = [];

    // Grouping by Date/Shift and then Product/Lot
    const dateGroupsMap = new Map();
    activeReceipts.forEach(receipt => {
      let prodDate = receipt.metadata?.productionDate;
      let shift = receipt.metadata?.shift;
      if (!prodDate || !shift) {
        const calculated = calculateProductionShift(receipt.weighedAt);
        prodDate = calculated.productionDate;
        shift = calculated.shift;
      }
      const dateKey = `${prodDate}|${shift}`;
      if (!dateGroupsMap.has(dateKey)) {
        dateGroupsMap.set(dateKey, {
          label: `${formatReportGroupDateLabel(prodDate)} - ${formatShiftLabel(shift)}`,
          products: new Map()
        });
      }
      
      const productKey = `${receipt.productCode}|${receipt.lotNo}`;
      const dateGroup = dateGroupsMap.get(dateKey);
      if (!dateGroup.products.has(productKey)) {
        dateGroup.products.set(productKey, {
          productDisplay: receipt.productCode ? `${receipt.productCode} - ${receipt.productName}` : receipt.productName,
          lotNo: receipt.lotNo || "-",
          isTest: receipt.isTest,
          items: []
        });
      }
      dateGroup.products.get(productKey).items.push(receipt);
    });

    // Build flat list with group headers as "virtual rows" to estimate height
    const virtualRows = [];
    let displaySeq = 1;

    dateGroupsMap.forEach((dateGroup) => {
      const visibleProducts = Array.from(dateGroup.products.values());
      if (visibleProducts.length === 0) return;

      let dateHeaderPushed = false;

      visibleProducts.forEach((productGroup) => {
        if (!dateHeaderPushed) {
          virtualRows.push({ type: 'date-header', label: dateGroup.label });
          dateHeaderPushed = true;
        }

        const hasAvailable = productGroup.items.some(item => String(item.itemStatus).toLowerCase() === "available");
        const hasVoidedOnly = productGroup.items.every(item => String(item.itemStatus).toLowerCase() === "voided");
        const calculatedStatus = hasVoidedOnly ? "voided" : (hasAvailable ? "available" : "issued");

        virtualRows.push({ 
          type: 'product-header', 
          display: productGroup.productDisplay, 
          lotNo: productGroup.lotNo,
          itemStatus: calculatedStatus,
          isTest: productGroup.isTest,
          itemsCount: productGroup.items.length
        });
        
        const chunksMap = new Map();
        productGroup.items.forEach(item => {
          const chunkIdx = Math.floor((item.originalSequence - 1) / 20);
          if (!chunksMap.has(chunkIdx)) {
            chunksMap.set(chunkIdx, []);
          }
          chunksMap.get(chunkIdx).push(item);
        });

        const sortedChunkIndices = Array.from(chunksMap.keys()).sort((a, b) => a - b);
        sortedChunkIndices.forEach(chunkIdx => {
          const chunkItems = chunksMap.get(chunkIdx);
          const chunkWeight = chunkItems.reduce((acc, item) => acc + (Number(item.netWeightKg) || 0), 0);

          chunkItems.forEach((item) => {
            virtualRows.push({
              type: "detail",
              sequence: displaySeq++,
              barcode: item.barcode || "-",
              productDisplay: productGroup.productDisplay,
              lotNo: productGroup.lotNo,
              qty: 1,
              weight: Number(item.netWeightKg) || 0,
              timeLabel: formatDateTime(item.weighedAt),
            });
          });

          virtualRows.push({
            type: "subtotal",
            qty: chunkItems.length,
            weight: chunkWeight,
          });
        });
        
        virtualRows.push({ 
          type: 'product-footer', 
          lotNo: productGroup.lotNo, 
          qty: productGroup.items.length,
          weight: productGroup.items.reduce((acc, i) => acc + (Number(i.netWeightKg) || 0), 0)
        });
      });
    });

    // Distribute virtual rows into pages
    let currentPage = [];
    let currentWeight = 0;
    const FIRST_PAGE_LIMIT = 42; // Header + group rows leave room for about 37 detail rows on A4.
    const OTHER_PAGE_LIMIT = 40; // Chrome print needs a tighter limit to avoid splitting one sheet into two pages.

    virtualRows.forEach(row => {
      let rowWeight = 1;
      if (row.type === 'date-header') rowWeight = 2.5;
      if (row.type === 'product-header') rowWeight = 2.5;
      if (row.type === 'product-footer') rowWeight = 1.5;
      if (row.type === 'subtotal') rowWeight = 1.2;

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
  }, [activeReceipts]);

  const reportPeriodLabel = useMemo(() => {
    const dateFromLabel = formatDateInputLabel(filters.dateFrom);
    const dateToLabel = formatDateInputLabel(filters.dateTo);

    if (dateFromLabel === "-" && dateToLabel === "-") {
      return "ยังไม่ได้กำหนดช่วงวันที่";
    }

    if (filters.dateFrom && filters.dateTo && filters.dateFrom === filters.dateTo) {
      return dateFromLabel;
    }

    return `${dateFromLabel} - ${dateToLabel}`;
  }, [filters.dateFrom, filters.dateTo]);

  const selectedProductCountLabel = useMemo(() => {
    if (!selectedProducts.length) {
      return "ทุกสินค้าในรายงาน";
    }

    if (selectedProducts.length === 1) {
      return `${selectedProducts[0].code} - ${selectedProducts[0].name}`;
    }

    return `${selectedProducts.length} รายการ`;
  }, [selectedProducts]);

  const applyReportPayload = (payload) => {
    setRows(normalizeReceiptRows(payload?.receipts));
    setSummary(normalizeSummary(payload?.summary));
    setPagination(normalizePagination(payload?.pagination));
  };

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
          if (nextFilters.isTest && nextFilters.isTest !== "all") params.set("isTest", nextFilters.isTest);
          if (nextFilters.itemStatus && nextFilters.itemStatus !== "all") params.set("itemStatus", nextFilters.itemStatus);
          if (nextFilters.maxItems) params.set("maxItems", nextFilters.maxItems);
          if (nextFilters.itemStart) params.set("itemStart", nextFilters.itemStart);
          if (nextFilters.itemEnd) params.set("itemEnd", nextFilters.itemEnd);
          if (nextFilters.recordType) params.set("recordType", nextFilters.recordType);
          if (Array.isArray(nextFilters.productCodes)) {
            nextFilters.productCodes.forEach((code) => params.append("productCodes", code));
          }
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
        }

        // Fetch ALL items to handle client-side visual paging like Crystal Reports
        const payload = await fetchScaleReceiptReport({
          departmentId,
          dateFrom: nextFilters.dateFrom,
          dateTo: nextFilters.dateTo,
          search: nextFilters.search,
          lotNo: nextFilters.lotNo,
          isTest: nextFilters.isTest === "all" ? null : nextFilters.isTest,
          itemStatus: nextFilters.itemStatus,
          productCodes: nextFilters.productCodes,
          includeAll: true, // Always fetch everything
          limit: 100000, // Safe upper limit for a single report
          page: 1,
          recordType: nextFilters.recordType || "all",
        });

        if (payload && payload.filters) {
          payload.filters.itemStatus = nextFilters.itemStatus;
          payload.filters.maxItems = nextFilters.maxItems;
          payload.filters.itemStart = nextFilters.itemStart;
          payload.filters.itemEnd = nextFilters.itemEnd;
          payload.filters.recordType = nextFilters.recordType || "all";
        }

        applyReportPayload(payload);
        setCurrentViewPage(0);
        setFeedback("อัปเดตรายงานเรียบร้อย");
      } catch (error) {
        setErrorMessage(error?.message || "ไม่สามารถโหลดรายงานได้");
      }
    });
  };

  const handleFieldChange = (key, value, { resetPage = true } = {}) => {
    setErpPreview(null);
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: resetPage ? 1 : current.page,
    }));
  };

  const handleRecordTypeChange = (newRecordType) => {
    setErpPreview(null);
    const nextFilters = {
      ...filters,
      recordType: newRecordType,
      page: 1,
    };
    setFilters(nextFilters);
    loadReport(nextFilters);
  };

  const toggleProductCode = (productCode) => {
    const normalizedCode = String(productCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setErpPreview(null);
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

  const clearProductSelection = () => {
    setErpPreview(null);
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
      const payload = await fetchScaleReceiptReport({
        departmentId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        lotNo: filters.lotNo,
        isTest: filters.isTest === "all" ? null : filters.isTest,
        itemStatus: filters.itemStatus,
        productCodes: filters.productCodes,
        includeAll: true,
        limit: filters.limit,
        page: 1,
        recordType: filters.recordType || "all",
      });

      let exportRows = normalizeReceiptRows(payload?.receipts);
      if (!exportRows.length) {
        throw new Error("ไม่พบข้อมูลสำหรับส่งออกรายงาน");
      }

      let startIdx = 0;
      let endIdx = exportRows.length;
      if (filters.itemStart) {
        startIdx = Math.max(0, Number.parseInt(String(filters.itemStart), 10) - 1);
      }
      if (filters.itemEnd) {
        endIdx = Number.parseInt(String(filters.itemEnd), 10);
      } else if (filters.maxItems) {
        const maxItemsLimit = Number.parseInt(String(filters.maxItems), 10) || 0;
        if (maxItemsLimit > 0) {
          endIdx = maxItemsLimit;
        }
      }
      exportRows = exportRows.slice(startIdx, endIdx);

      await exportReportWorkbook({
        rows: exportRows,
        filters,
        summary: normalizeSummary(payload?.summary),
        departmentName,
        selectedProducts,
      });

      setFeedback("ส่งออกรายงาน Excel เรียบร้อย");
    } catch (error) {
      setErrorMessage(error?.message || "ส่งออกรายงานไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreviewErpExport = async () => {
    setIsPreviewingErp(true);
    setFeedback("");
    setErrorMessage("");

    try {
      const payload = await previewScaleReceiptErpExport(
        buildErpReceiptExportFilters({ departmentId, filters })
      );
      setErpPreview(payload);
      setFeedback(
        `พรีวิว ERP พร้อมแล้ว: ${payload.documentCount} เอกสาร / ${payload.rowCount} รายการ`
      );
    } catch (error) {
      setErpPreview(null);
      setErrorMessage(error?.message || "พรีวิว Export ERP ไม่สำเร็จ");
    } finally {
      setIsPreviewingErp(false);
    }
  };

  const handleExportErp = async () => {
    setIsExportingErp(true);
    setFeedback("");
    setErrorMessage("");

    try {
      const payload = await exportScaleReceiptErpExcel(
        buildErpReceiptExportFilters({ departmentId, filters })
      );
      downloadBlob(payload.blob, payload.fileName);
      setErpPreview(null);
      setFeedback(
        `Export ERP เรียบร้อย: ${payload.documentCount} เอกสาร / ${payload.rowCount} รายการ`
      );
    } catch (error) {
      setErrorMessage(error?.message || "Export ERP ไม่สำเร็จ");
    } finally {
      setIsExportingErp(false);
    }
  };

  const handlePrintReport = () => {
    setFeedback("");
    setErrorMessage("");
    const auditPayload = buildWeightScaleReportPrintLog({
      requestId: crypto.randomUUID(),
      filters,
      receipts: activeReceipts,
    });
    printReportWithBestEffortAudit({
      auditPayload,
      logAudit: logScaleReceiptReportPrint,
      print: () => window.print(),
    });
  };

  const handleReprintReceipt = async (receipt) => {
    const printLabel = buildReceiptPrintLabel(receipt);
    if (!printLabel) {
      setErrorMessage("ไม่พบข้อมูลฉลากของรายการนี้");
      setFeedback("");
      return;
    }

    setReprintReceiptId(receipt.id);
    setErrorMessage("");
    setFeedback("");

    try {
      await printWeightScaleLabelViaAgent(printLabel);
      setFeedback(`ส่งงานพิมพ์ฉลาก ${receipt.barcode} เรียบร้อย`);
    } catch (error) {
      setErrorMessage(error?.message || "พิมพ์ฉลากรายการนี้ไม่สำเร็จ");
    } finally {
      setReprintReceiptId("");
    }
  };

  return (
    <div className="weight-scale-report-page min-h-screen bg-[#f4f6f8] text-[#262626]">
      <div className="weight-scale-report-screen-only">
        <WeightScalePrimaryHeader
          eyebrow="รายงานชั่งน้ำหนัก"
          badge="ตรวจสอบย้อนหลัง"
          title="รายงานสรุปชั่งแบบละเอียด"
        />
      </div>

      <div className="mx-auto max-w-[88rem] px-4 py-4 sm:px-6 lg:px-8">
        {/* Tab Selection */}
        <div className="weight-scale-report-screen-only mb-6 flex border-b border-[#cbd5e1] gap-2">
          <button
            type="button"
            onClick={() => handleRecordTypeChange("all")}
            className={`px-5 py-3 text-sm font-black uppercase tracking-[0.12em] border-b-2 transition duration-200 ${
              filters.recordType === "all"
                ? "border-[#102C57] text-[#102C57] font-black"
                : "border-transparent text-[#7d8795] hover:text-[#102C57] hover:border-[#cbd5e1]"
            }`}
          >
            ทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => handleRecordTypeChange("production")}
            className={`px-5 py-3 text-sm font-black uppercase tracking-[0.12em] border-b-2 transition duration-200 ${
              filters.recordType === "production"
                ? "border-[#102C57] text-[#102C57] font-black"
                : "border-transparent text-[#7d8795] hover:text-[#102C57] hover:border-[#cbd5e1]"
            }`}
          >
            ชั่งรับเข้าผลิตสำเร็จ
          </button>
          <button
            type="button"
            onClick={() => handleRecordTypeChange("return")}
            className={`px-5 py-3 text-sm font-black uppercase tracking-[0.12em] border-b-2 transition duration-200 ${
              filters.recordType === "return"
                ? "border-[#102C57] text-[#102C57] font-black"
                : "border-transparent text-[#7d8795] hover:text-[#102C57] hover:border-[#cbd5e1]"
            }`}
          >
            ชั่งคืนวัตถุดิบ
          </button>
        </div>

        {filters.recordType === "all" ? (
          <p className="weight-scale-report-screen-only -mt-3 mb-4 text-xs font-semibold text-amber-700">
            แสดงรับเข้าผลิตและชั่งคืนตามวันที่ทำรายการจริง รายการชั่งคืนนอกช่วงวันที่จะไม่รวมในรายงานนี้
          </p>
        ) : null}

        <section className="weight-scale-report-screen-only mb-8">
          <div className="border border-[#d7dde5] bg-[#fcfbf7] px-6 py-3 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.1fr_1.1fr_1.4fr_auto]">
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  จากวันที่
                </span>
                <div className="mt-1 flex h-10 items-center gap-3 border border-[#d7dde5] bg-white px-4">
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
                <div className="mt-1 flex h-10 items-center gap-3 border border-[#d7dde5] bg-white px-4">
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
                  ค้นหา
                </span>
                <div className="mt-1 flex h-10 items-center gap-3 border border-[#d7dde5] bg-white px-4">
                  <Search size={16} className="text-[#7d8795]" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(event) => handleFieldChange("search", event.target.value)}
                    placeholder="บาร์โค้ด / รหัสสินค้า / ชื่อสินค้า / LOT"
                    className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none placeholder:text-[#9aa4b2]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  LOT เฉพาะ
                </span>
                <input
                  type="text"
                  value={filters.lotNo}
                  onChange={(event) => handleFieldChange("lotNo", event.target.value.toUpperCase())}
                  placeholder="เช่น 2908260054-1"
                  className="mt-1 h-10 w-full border border-[#d7dde5] bg-white px-4 text-sm font-semibold uppercase text-[#102C57] outline-none placeholder:text-[#9aa4b2]"
                />
              </label>

              <div className="relative block">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                  เลือกสินค้า
                </span>
                <button
                  type="button"
                  onClick={() => setIsProductPickerOpen((current) => !current)}
                  className="mt-1 flex h-10 w-full items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left"
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
                  className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#d4af37] bg-[#102C57] px-5 text-sm font-black uppercase tracking-[0.14em] text-[#fff7df] transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
                >
                  {isPending ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <FileSearch size={16} />
                  )}
                  ค้นหา
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-col gap-1 min-w-[140px] sm:max-w-[220px]">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    สถานะ
                  </span>
                  <select
                    value={filters.itemStatus}
                    onChange={(event) => handleFieldChange("itemStatus", event.target.value)}
                    className="h-10 border border-[#d7dde5] bg-white px-3 text-sm font-semibold text-[#102C57] outline-none"
                  >
                    {ITEM_STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-col gap-1 min-w-[200px] sm:max-w-[300px]">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    ช่วงลำดับที่ต้องการแสดง
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={filters.itemStart}
                      onChange={(event) => {
                        const val = event.target.value;
                        handleFieldChange("itemStart", val ? Math.max(1, Number.parseInt(val, 10)) : "");
                      }}
                      placeholder="เริ่มต้น"
                      className="h-10 w-24 border border-[#d7dde5] bg-white px-2 text-center text-sm font-semibold text-[#102C57] outline-none placeholder:text-[#9aa4b2]"
                    />
                    <span className="text-slate-400 text-sm font-bold">ถึง</span>
                    <input
                      type="number"
                      min={1}
                      value={filters.itemEnd}
                      onChange={(event) => {
                        const val = event.target.value;
                        handleFieldChange("itemEnd", val ? Math.max(1, Number.parseInt(val, 10)) : "");
                      }}
                      placeholder="สิ้นสุด"
                      className="h-10 w-24 border border-[#d7dde5] bg-white px-2 text-center text-sm font-semibold text-[#102C57] outline-none placeholder:text-[#9aa4b2]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  ส่งออก Excel
                </button>
                {filters.recordType === "production" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handlePreviewErpExport()}
                      disabled={isPreviewingErp || isExportingErp || isPending}
                      className="weight-scale-report-screen-only inline-flex h-10 items-center justify-center gap-2 border border-[#d4af37] bg-[#fff8df] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:bg-[#f1df9a] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPreviewingErp ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <ClipboardCheck size={14} />
                      )}
                      Preview ERP
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportErp()}
                      disabled={!erpPreview || isPreviewingErp || isExportingErp || isPending}
                      className="weight-scale-report-screen-only inline-flex h-10 items-center justify-center gap-2 border border-[#d4af37] bg-[#102C57] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#fff7df] transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isExportingErp ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Export ERP
                    </button>
                  </>
                )}
              </div>
            </div>

            {erpPreview ? (
              <div className="mt-4 border border-[#d4af37] bg-[#102C57] p-4 text-[#fff7df]">
                <div className="flex flex-col gap-1 border-b border-[#d4af37]/40 pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                      ERP WIP Receipt Preview
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white/85">
                      ระบบยังไม่จองเลขจริงจนกว่าจะกด Export ERP
                    </p>
                  </div>
                  <p className="text-sm font-black">
                    {erpPreview.documentCount} เอกสาร / {erpPreview.rowCount} รายการ
                  </p>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {(erpPreview.documents || []).map((document) => (
                    <div
                      key={`${document.documentDate}-${document.documentNo}`}
                      className="border border-white/15 bg-white/[0.06] px-3 py-2"
                    >
                      <p className="text-[11px] font-semibold text-white/60">
                        {document.documentDate}
                      </p>
                      <p className="mt-1 text-base font-black tracking-[0.08em] text-[#d4af37]">
                        {document.documentNo}
                      </p>
                      <p className="mt-1 text-xs text-white/70">
                        {document.rowCount} รายการ
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {feedback ? (
              <p className="mt-4 text-sm font-semibold text-emerald-700">{feedback}</p>
            ) : null}
            {errorMessage ? (
              <p className="mt-4 text-sm font-semibold text-rose-600">{errorMessage}</p>
            ) : null}
          </div>

          <div className="weight-scale-report-screen-only grid gap-px border-x border-b border-[#d7dde5] bg-[#d7dde5] md:grid-cols-4 shadow-sm">
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Files size={14} className="text-[#102C57]" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  รายการทั้งหมด
                </p>
              </div>
              <p className="text-2xl font-semibold text-[#102C57]">{summary.totalCount}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <FileCheck size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  พร้อมเบิก
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{summaryStats.available}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Truck size={14} className="text-blue-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  เบิกแล้ว
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-blue-700">{summaryStats.issued}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Scale size={14} className="text-amber-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  น้ำหนักสุทธิรวม
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-[#102C57]">
                {formatWeightDisplay(summaryStats.totalWeight)} <span className="text-sm font-medium text-[#7d8795]">Kg</span>
              </p>
            </div>
          </div>
        </section>

        {/* Visual Paging Controls (Crystal Report Style) */}
        {reportPages.length > 1 && (
          <div className="weight-scale-report-screen-only fixed inset-x-0 bottom-2 z-50 flex justify-center pointer-events-none print:hidden">
            <div className="flex items-center gap-3 bg-[#102C57]/95 text-white px-5 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
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
        <div className="flex flex-col items-center gap-8 py-4 pb-40 print:hidden">
          {reportPages.length ? (
            reportPages.map((pageRows, pageIndex) => (
              <section 
                key={pageIndex} 
                className={`weight-scale-report-print-shell detailed-report-print-shell w-full max-w-[214mm] min-h-[296mm] bg-white border border-black shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] relative ${
                  pageIndex === currentViewPage ? 'block' : 'hidden'
                }`}
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
                        <h2 className="text-[18px] font-black text-[#102C57] leading-none uppercase">
                          {filters.recordType === "return" ? "รายงานชั่งคืนวัตถุดิบละเอียด" : "รายงานชั่งน้ำหนักละเอียด"}
                        </h2>
                        <p className="text-[9px] font-bold text-[#d4af37] uppercase tracking-[0.2em] mt-1">
                          {filters.recordType === "return" ? "Detailed Return Report" : "Detailed Weight Report"}
                        </p>
                      </div>

                      <div className="text-[10px] text-[#102C57] leading-tight text-right">
                         <div><span className="font-bold">วันที่พิมพ์:</span> {printedAtLabel}</div>
                         <div><span className="font-bold">ผู้ออกรายงาน:</span> {profile.username || "System"}</div>
                      </div>
                   </div>

                   <div className="grid grid-cols-3 border-t border-black pt-2">
                      <div className="flex gap-2 items-center">
                        <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">แผนก:</span>
                        <span className="text-[11px] font-bold text-[#102C57]">{departmentName || "-"}</span>
                      </div>
                      <div className="flex gap-2 items-center justify-center">
                        <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">ช่วงวันที่:</span>
                        <span className="text-[11px] font-bold text-[#102C57]">{reportPeriodLabel}</span>
                      </div>
                      <div className="flex gap-2 items-center justify-end">
                        <span className="text-[11px] font-black text-[#64748b] uppercase whitespace-nowrap">ขอบเขต:</span>
                        <span className="text-[11px] font-bold text-[#102C57] truncate">{selectedProductCountLabel}</span>
                      </div>
                   </div>
                </div>

                <div className="weight-scale-report-print-body detailed-report-print-body bg-white px-4 py-2 min-h-[240mm]">
                  <div className="overflow-hidden">
                    <table className="detailed-report-print-table min-w-full table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "34%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "15%" }} />
                      </colgroup>
                      <thead className="bg-[#f8f5ee]">
                        <tr className="border-b border-black text-[12.5px] font-black uppercase tracking-normal text-[#111111]">
                          <th className="px-3 py-0.5 text-center">ลำดับ</th>
                          <th className="px-3 py-0.5 text-center">บาร์โค้ด</th>
                          <th className="px-3 py-0.5 text-left">สินค้า</th>
                          <th className="px-3 py-0.5 text-center">LOT</th>
                          <th className="px-3 py-0.5 text-center">จำนวน</th>
                          <th className="px-3 py-0.5 text-center">น้ำหนัก</th>
                          <th className="px-3 py-0.5 text-center">เวลา</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {pageRows.map((vRow, vIndex) => {
                          if (vRow.type === 'date-header') {
                            return (
                              <tr key={vIndex} className="bg-[#102C57] text-white">
                                <td colSpan={7} className="px-3 py-1">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f3d67a]">วันที่รายงาน:</span>
                                    <span className="text-[12.5px] font-bold">{vRow.label}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'product-header') {
                            return (
                              <tr key={vIndex} className="bg-[#f1f5f9] border-b border-black">
                                <td colSpan={7} className="px-3 py-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 text-[12.5px] font-black text-[#102C57]">
                                      <span>สินค้า: {vRow.display}</span>
                                      <span className="text-[#64748b]">|</span>
                                      <span>LOT: {vRow.lotNo}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className={`px-2 py-0.5 text-[10px] border ${
                                        vRow.itemStatus === 'issued' ? 'bg-gray-100' : 'bg-[#fff8df] border-[#d4af37]'
                                      }`}>
                                        {getCleanReceiptItemStatusLabel(vRow.itemStatus)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'detail') {
                            return (
                              <tr key={vIndex} className="border-b border-black text-[12.5px] font-semibold text-[#111111]">
                                <td className="px-3 py-0.5 text-center">{vRow.sequence}</td>
                                <td className="px-3 py-0.5 text-center font-mono text-[11px] leading-tight">{vRow.barcode}</td>
                                <td className="px-3 py-0.5 text-left">{vRow.productDisplay}</td>
                                <td className="px-3 py-0.5 text-center">{vRow.lotNo}</td>
                                <td className="px-3 py-0.5 text-center">{vRow.qty}</td>
                                <td className="px-3 py-0.5 text-center">{formatWeightDisplay(vRow.weight)}</td>
                                <td className="px-3 py-0.5 text-center text-[11px] leading-tight">{vRow.timeLabel}</td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'subtotal') {
                            return (
                              <tr key={vIndex} className="bg-[#fbfcfd] border-b border-gray-300 text-[12.5px] text-[#111111] font-bold">
                                <td colSpan={4} className="px-3 py-1 text-right font-black">
                                  ยอดรวม
                                </td>
                                <td className="px-3 py-1 text-center font-black">{vRow.qty}</td>
                                <td className="px-3 py-1 text-center font-black">{formatWeightDisplay(vRow.weight)}</td>
                                <td />
                              </tr>
                            );
                          }
                          if (vRow.type === 'product-footer') {
                            return (
                              <tr key={vIndex} className="bg-[#fbfcfd] border-b border-black">
                                <td colSpan={4} className="px-3 py-1 text-right font-black text-[12.5px]">สรุปยอดLot - {vRow.lotNo}</td>
                                <td className="px-3 py-1 text-center font-bold text-[12.5px]">{vRow.qty}</td>
                                <td className="px-3 py-1 text-center font-bold text-[12.5px]">{formatWeightDisplay(vRow.weight)}</td>
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
                   <span>KPF Production Line Console</span>
                   <span className="font-bold">หน้า {pageIndex + 1} / {reportPages.length}</span>
                </div>
              </section>
            ))
          ) : (
            <div className="w-full max-w-[210mm] bg-white border border-black px-4 py-12 text-center text-sm text-[#111111]">
               {isPending ? "กำลังโหลดข้อมูล..." : "ยังไม่พบรายการย้อนหลังตามเงื่อนไขที่เลือก"}
            </div>
          )}
        </div>

      {/* Continuous Print Table for A4 Portrait */}
      <div className="weight-scale-report-print-only hidden print:block">
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
          .daily-weight-detail-print-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 11px !important;
            color: #111827 !important;
          }
          .daily-weight-detail-print-table th,
          .daily-weight-detail-print-table td {
            border: 0.5px solid #cbd5e1 !important;
            padding: 4px 5px !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: clip !important;
          }
          .daily-weight-detail-print-table .print-report-header th {
            border: none !important;
            border-bottom: 2px solid #102C57 !important;
            padding: 0 0 6px !important;
            background: #ffffff !important;
          }
          .daily-weight-detail-print-table .print-report-meta th {
            border: none !important;
            border-bottom: 1px solid #102C57 !important;
            padding: 4px 5px !important;
            background: #f8fafc !important;
            color: #102C57 !important;
          }
          .daily-weight-detail-print-table .table-header th {
            background: #f8f5ee !important;
            color: #111111 !important;
            font-weight: 900 !important;
            text-align: center !important;
            font-size: 11.5px !important;
            border: 0.5px solid #cbd5e1 !important;
          }
          .daily-weight-detail-print-table .date-header-row td {
            background: #102C57 !important;
            color: #ffffff !important;
            font-weight: 900 !important;
            padding: 4px 6px !important;
            border: 0.5px solid #102C57 !important;
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
          .daily-weight-detail-print-table thead,
          .daily-weight-detail-print-table thead tr,
          .daily-weight-detail-print-table .date-header-row,
          .daily-weight-detail-print-table .subtotal-row,
          .daily-weight-detail-print-table .grand-total-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .daily-weight-detail-print-table tbody tr.item-row {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .daily-weight-detail-print-table tbody tr.item-row:nth-child(even) {
            background-color: #f8fafc !important;
          }
          .daily-weight-detail-print-table .subtotal-row td {
            background-color: #fbfcfd !important;
            color: #111111 !important;
            font-weight: 900 !important;
            border: 0.5px solid #cbd5e1 !important;
          }
          .daily-weight-detail-print-table .grand-total-row td {
            background-color: #102C57 !important;
            color: #ffffff !important;
            font-weight: 900 !important;
            border: 0.5px solid #102C57 !important;
          }
          .daily-weight-detail-print-table .table-header th:nth-child(1),
          .daily-weight-detail-print-table .table-header th:nth-child(2),
          .daily-weight-detail-print-table .table-header th:nth-child(4),
          .daily-weight-detail-print-table .table-header th:nth-child(5),
          .daily-weight-detail-print-table .table-header th:nth-child(6),
          .daily-weight-detail-print-table .table-header th:nth-child(7),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(1),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(2),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(4),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(5),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(6),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(7) {
            text-align: center !important;
          }
          .daily-weight-detail-print-table .table-header th:nth-child(3),
          .daily-weight-detail-print-table tbody tr.item-row td:nth-child(3) {
            text-align: left !important;
          }
          .daily-weight-detail-print-table .subtotal-row td:first-child,
          .daily-weight-detail-print-table .grand-total-row td:first-child {
            text-align: right !important;
          }
          .daily-weight-detail-print-table .subtotal-row td:nth-child(2),
          .daily-weight-detail-print-table .subtotal-row td:nth-child(3),
          .daily-weight-detail-print-table .grand-total-row td:nth-child(2),
          .daily-weight-detail-print-table .grand-total-row td:nth-child(3) {
            text-align: center !important;
          }
        ` }} />
        {flatVirtualRows.length ? (
          <table className="daily-weight-detail-print-table">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr className="print-report-header">
                <th colSpan={7}>
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
                      <div className="text-[17px] font-black text-[#102C57]">
                        {filters.recordType === "return" ? "รายงานชั่งคืนวัตถุดิบละเอียด" : "รายงานชั่งน้ำหนักละเอียด"}
                      </div>
                      <div className="mt-1 text-[8px] font-black uppercase tracking-[0.22em] text-[#d4af37]">
                        {filters.recordType === "return" ? "Detailed Return Report" : "Detailed Weight Report"}
                      </div>
                    </div>
                    <div className="text-right text-[9px] leading-tight text-[#102C57]">
                      <div><span className="font-black text-[#64748b]">วันที่พิมพ์:</span> {printedAtLabel}</div>
                      <div><span className="font-black text-[#64748b]">ผู้ออกรายงาน:</span> {profile.username || "System"}</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="print-report-meta">
                <th colSpan={3} className="text-left">แผนก: <span className="font-black">{departmentName || "-"}</span></th>
                <th colSpan={2} className="text-center">ช่วงวันที่: <span className="font-black">{reportPeriodLabel}</span></th>
                <th colSpan={2} className="text-right">ขอบเขต: <span className="font-black">{selectedProductCountLabel}</span></th>
              </tr>
              <tr className="table-header">
                <th>ลำดับ</th>
                <th>บาร์โค้ด</th>
                <th className="text-left">สินค้า</th>
                <th>LOT</th>
                <th>จำนวน</th>
                <th>น้ำหนัก</th>
                <th>เวลา</th>
              </tr>
            </thead>
            <tbody>
              {flatVirtualRows.map((vRow, vIndex) => {
                if (vRow.type === 'date-header') {
                  return (
                    <tr key={vIndex} className="date-header-row">
                      <td colSpan={7} className="text-left">
                        วันที่รายงาน: {vRow.label}
                      </td>
                    </tr>
                  );
                }
                if (vRow.type === 'product-header') {
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={7} className="text-left font-bold">
                        สินค้า: {vRow.display} | LOT: {vRow.lotNo} ({getCleanReceiptItemStatusLabel(vRow.itemStatus)})
                      </td>
                    </tr>
                  );
                }
                if (vRow.type === 'detail') {
                  return (
                    <tr key={vIndex} className="item-row">
                      <td>{vRow.sequence}</td>
                      <td>{vRow.barcode}</td>
                      <td className="text-left">{vRow.productDisplay}</td>
                      <td>{vRow.lotNo}</td>
                      <td>{vRow.qty}</td>
                      <td>{formatWeightDisplay(vRow.weight)} Kg</td>
                      <td>{vRow.timeLabel}</td>
                    </tr>
                  );
                }
                if (vRow.type === 'subtotal') {
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={4} className="text-right">ยอดรวม</td>
                      <td>{vRow.qty}</td>
                      <td>{formatWeightDisplay(vRow.weight)} Kg</td>
                      <td />
                    </tr>
                  );
                }
                if (vRow.type === 'product-footer') {
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={4} className="text-right">สรุปยอด LOT - {vRow.lotNo}</td>
                      <td>{vRow.qty}</td>
                      <td>{formatWeightDisplay(vRow.weight)} Kg</td>
                      <td />
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
