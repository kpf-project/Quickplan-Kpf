"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck,
  FileSearch,
  Files,
  ListOrdered,
  Package,
  Printer,
  RefreshCw,
  Scale,
  Truck,
  X,
} from "lucide-react";
import { fetchScaleReceiptSummaryReport } from "@/features/production-line/services/scaleClient";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { useUserProfile } from "@/lib/useUserProfile";

const LIMIT_OPTIONS = [20, 50, 100];

function normalizeSummaryRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const lotNo = String(row?.lotNo || "").trim();
      const groupDate = String(row?.groupDate || "").trim();
      const productCode = String(row?.productCode || "").trim().toUpperCase();
      const productName = String(row?.productName || "").trim();
      if (!lotNo && !productCode && !productName) {
        return null;
      }

      const quantity = Number.parseInt(String(row?.quantity ?? "").trim(), 10);
      const totalNetWeightKg = Number.parseFloat(String(row?.totalNetWeightKg ?? "").trim());

      return {
        groupDate: groupDate || "-",
        lotNo: lotNo || "-",
        productCode: productCode || "-",
        productName: productName || "-",
        productDisplay:
          productCode && productCode !== "-"
            ? `${productCode} - ${productName || "-"}`
            : productName || "-",
        quantity: Number.isFinite(quantity) ? quantity : 0,
        totalNetWeightKg: Number.isFinite(totalNetWeightKg)
          ? Number(totalNetWeightKg.toFixed(2))
          : 0,
      };
    })
    .filter(Boolean);
}

function normalizeSummary(summary) {
  const safeSummary = summary && typeof summary === "object" ? summary : {};

  return {
    totalCount: Number.isFinite(Number(safeSummary.totalCount))
      ? Number(safeSummary.totalCount)
      : 0,
    totalQuantity: Number.isFinite(Number(safeSummary.totalQuantity))
      ? Number(safeSummary.totalQuantity)
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

  return {
    dateFrom: String(safeFilters.dateFrom || "").trim(),
    dateTo: String(safeFilters.dateTo || "").trim(),
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

function formatSummaryGroupDateLabel(productionDate) {
  if (!productionDate) return "-";
  const [yearText, monthText, dayText] = productionDate.split("-");
  const buddhistYear = String(Number(yearText) + 543).slice(-2);
  return `${dayText}/${monthText}/${buddhistYear}`;
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
  const normalizedFrom = String(dateFrom || "").trim();
  const normalizedTo = String(dateTo || "").trim();
  const safeFrom = normalizedFrom ? normalizedFrom.replaceAll("-", "") : "all";
  const safeTo = normalizedTo ? normalizedTo.replaceAll("-", "") : safeFrom;
  return `${safeFrom}_${safeTo}`;
}

async function exportSummaryWorkbook({
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

  const worksheet = workbook.addWorksheet("สรุปชั่งเข้าสำเร็จ");

  worksheet.columns = [
    { header: "ลำดับ", key: "sequence", width: 10 },
    { header: "วันที่", key: "groupDateLabel", width: 16 },
    { header: "LOT", key: "lotNo", width: 18 },
    { header: "สินค้า", key: "productDisplay", width: 52 },
    { header: "จำนวน", key: "quantity", width: 14 },
    { header: "น้ำหนัก (Kg)", key: "totalNetWeightKg", width: 18 },
  ];

  worksheet.mergeCells("A1:F1");
  worksheet.getCell("A1").value = "รายงานสรุปชั่งเข้าสำเร็จ";
  worksheet.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: "FF102C57" },
  };

  worksheet.mergeCells("A2:F2");
  worksheet.getCell("A2").value = `หน่วยงาน: ${departmentName || "-"}`;
  worksheet.getCell("A2").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A3:F3");
  worksheet.getCell("A3").value = `ช่วงวันที่: ${filters.dateFrom || "-"} ถึง ${filters.dateTo || "-"}`;
  worksheet.getCell("A3").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

  worksheet.mergeCells("A4:F4");
  worksheet.getCell("A4").value = `สินค้า: ${
    selectedProducts.length
      ? selectedProducts.map((product) => `${product.code} ${product.name}`).join(", ")
      : "ทุกสินค้าในรายงาน"
  }`;
  worksheet.getCell("A4").font = {
    size: 11,
    color: { argb: "FF3A4A5E" },
  };

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

  rows.forEach((row, index) => {
    worksheet.addRow({
      sequence: index + 1,
      groupDateLabel: formatSummaryGroupDateLabel(row.groupDate),
      lotNo: row.lotNo,
      productDisplay: row.productDisplay,
      quantity: row.quantity,
      totalNetWeightKg: row.totalNetWeightKg,
    });
  });

  const summaryRow = worksheet.addRow({
    sequence: "",
    groupDateLabel: "",
    lotNo: "",
    productDisplay: "สรุปรวม",
    quantity: summary.totalQuantity,
    totalNetWeightKg: summary.totalNetWeightKg,
  });

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
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: rowNumber % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
        };
      }
    });
  });

  summaryRow.font = {
    bold: true,
    color: { argb: "FF111111" },
  };

  worksheet.getColumn("totalNetWeightKg").numFmt = "#,##0.00";
  worksheet.views = [{ state: "frozen", ySplit: 6 }];
  worksheet.autoFilter = "A6:F6";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `weight-scale-summary-report_${formatFilenameDateRange(
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

export default function WeightScaleSummaryReportPageClient({
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
    () => normalizeSummaryRows(initialReportPayload?.rows),
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
  const [isExporting, setIsExporting] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedProducts = useMemo(
    () =>
      normalizedProductOptions.filter((option) =>
        filters.productCodes.includes(option.code)
      ),
    [filters.productCodes, normalizedProductOptions]
  );

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

  const groupedRows = useMemo(() => {
    const dateGroups = [];
    const dateMap = new Map();

    rows.forEach((row) => {
      // For summary rows, we use the stored production date/shift if available
      // or calculate from groupDate (which is the calendar date of weighing)
      const metadata = row.metadata || {};
      let prodDate = metadata.productionDate;
      let shift = metadata.shift;

      if (!prodDate || !shift) {
        // Fallback: groupDate is YYYY-MM-DD
        const calculated = calculateProductionShift(row.groupDate);
        prodDate = calculated.productionDate;
        shift = calculated.shift;
      }

      const groupDateKey = `${prodDate}|${shift}`;
      const groupDateLabel = `${formatSummaryGroupDateLabel(prodDate)} - ${formatShiftLabel(shift)}`;

      if (!dateMap.has(groupDateKey)) {
        const dateGroup = {
          key: groupDateKey,
          dateLabel: groupDateLabel,
          displayDate: formatSummaryGroupDateLabel(prodDate), // Just the date for summary
          items: [],
          totalQuantity: 0,
          totalNetWeightKg: 0,
          dateSequenceCounter: 0,
        };
        dateMap.set(groupDateKey, dateGroup);
        dateGroups.push(dateGroup);
      }

      const dateGroup = dateMap.get(groupDateKey);
      dateGroup.dateSequenceCounter += 1;

      dateGroup.items.push({
        ...row,
        sequence: dateGroup.dateSequenceCounter,
      });

      dateGroup.totalQuantity += row.quantity;
      dateGroup.totalNetWeightKg += Number(row.totalNetWeightKg) || 0;
    });

    return dateGroups.map((dateGroup) => ({
      ...dateGroup,
      totalNetWeightKg: Number(dateGroup.totalNetWeightKg.toFixed(2)),
    }));
  }, [rows]);

  const applyReportPayload = (payload) => {
    setRows(normalizeSummaryRows(payload?.rows));
    setSummary(normalizeSummary(payload?.summary));
    setPagination(normalizePagination(payload?.pagination));
  };

  const [currentViewPage, setCurrentViewPage] = useState(0);

  useEffect(() => {
    setRows(normalizeSummaryRows(initialReportPayload?.rows));
    setSummary(normalizeSummary(initialReportPayload?.summary));
    setPagination(normalizePagination(initialReportPayload?.pagination));
    setFilters(normalizeFilterState(initialReportPayload?.filters, initialReportPayload?.pagination));
    setCurrentViewPage(0);
  }, [initialReportPayload]);
  const profile = useUserProfile();

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const printRows = useMemo(() => {
    const virtualRows = [];
    groupedRows.forEach(dateGroup => {
      virtualRows.push({ type: 'date-header', label: dateGroup.dateLabel });

      let currentGroupKey = "";
      let currentGroupItems = [];
      const flushCurrentGroup = () => {
        if (!currentGroupItems.length) {
          return;
        }

        currentGroupItems.forEach((item, index) => {
          virtualRows.push({ type: 'item', data: item, sequence: index + 1 });
        });

        const groupQty = currentGroupItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
        const groupWeight = currentGroupItems.reduce((acc, i) => acc + (Number(i.totalNetWeightKg) || 0), 0);
        virtualRows.push({
          type: "subtotal",
          qty: groupQty,
          weight: groupWeight,
        });

        currentGroupItems = [];
      };

      dateGroup.items.forEach((item) => {
        const itemGroupKey =
          item.parentGroupKey ||
          `${item.groupDate || ""}|${item.lotNo || ""}|${item.productCode || ""}|${item.productName || ""}`;

        if (currentGroupKey && currentGroupKey !== itemGroupKey) {
          flushCurrentGroup();
        }

        currentGroupKey = itemGroupKey;
        currentGroupItems.push(item);
      });

      flushCurrentGroup();
    });

    return virtualRows;
  }, [groupedRows]);

  const reportPages = useMemo(() => {
    if (!rows.length) return [];

    let pages = [];
    let currentPage = [];
    let currentWeight = 0;
    const FIRST_PAGE_LIMIT = 35;
    const OTHER_PAGE_LIMIT = 45;

    printRows.forEach(row => {
      let rowWeight = 1;
      if (row.type === 'date-header') rowWeight = 2.5;
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
  }, [rows, printRows]);

  const loadReport = (nextFilters) => {
    setErrorMessage("");
    setFeedback("");

    startTransition(async () => {
      try {
        if (typeof window !== "undefined") {
          const params = new URLSearchParams();
          if (nextFilters.dateFrom) params.set("dateFrom", nextFilters.dateFrom);
          if (nextFilters.dateTo) params.set("dateTo", nextFilters.dateTo);
          if (Array.isArray(nextFilters.productCodes)) {
            nextFilters.productCodes.forEach((code) => params.append("productCodes", code));
          }
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
        }

        const payload = await fetchScaleReceiptSummaryReport({
          departmentId,
          dateFrom: nextFilters.dateFrom,
          dateTo: nextFilters.dateTo,
          productCodes: nextFilters.productCodes,
          includeAll: true, // Always fetch everything for visual paging
          limit: 1000,
          page: 1,
        });

        applyReportPayload(payload);
        setCurrentViewPage(0);
        setFeedback("อัปเดตรายงานสรุปชั่งเรียบร้อย");
      } catch (error) {
        setErrorMessage(error?.message || "ไม่สามารถโหลดรายงานสรุปชั่งได้");
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
      const payload = await fetchScaleReceiptSummaryReport({
        departmentId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        productCodes: filters.productCodes,
        includeAll: true,
        limit: filters.limit,
        page: 1,
      });

      const exportRows = normalizeSummaryRows(payload?.rows);
      if (!exportRows.length) {
        throw new Error("ไม่พบข้อมูลสำหรับส่งออกรายงาน");
      }

      await exportSummaryWorkbook({
        rows: exportRows,
        filters,
        summary: normalizeSummary(payload?.summary),
        departmentName,
        selectedProducts,
      });

      setFeedback("ส่งออกรายงานสรุปชั่ง Excel เรียบร้อย");
    } catch (error) {
      setErrorMessage(error?.message || "ส่งออกรายงานสรุปชั่งไม่สำเร็จ");
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
          eyebrow="รายงานชั่งน้ำหนัก"
          badge="สรุปภาพรวม"
          title="รายงานสรุปชั่งเข้าสำเร็จ"
        />
      </div>

      <div className="mx-auto max-w-[88rem] px-4 py-4 sm:px-6 lg:px-8">
        <section className="weight-scale-report-screen-only mb-8">
          <div className="border border-[#d7dde5] bg-[#fcfbf7] px-6 py-3 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.4fr_auto]">
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
                  โหลดรายงาน
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div />

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
                  รายการสรุป
                </p>
              </div>
              <p className="text-2xl font-semibold text-[#102C57]">{summary.totalCount}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <ListOrdered size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  จำนวนรวม
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{summary.totalQuantity}</p>
            </div>
            <div className="bg-white px-5 py-4 flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-1">
                <Scale size={14} className="text-amber-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7d8795]">
                  น้ำหนักรวม
                </p>
              </div>
              <p className="mt-1 text-2xl font-semibold text-[#102C57]">
                {formatWeightDisplay(summary.totalNetWeightKg)} <span className="text-sm font-medium text-[#7d8795]">Kg</span>
              </p>
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

        {/* A4 Paper Sheets Rendering (Crystal Report Style) */}
        <div className="weight-scale-report-screen-only daily-summary-preview-pages flex flex-col items-center gap-8 py-4">
          {reportPages.length ? (
            reportPages.map((pageRows, pageIndex) => (
              <section 
                key={pageIndex} 
                className={`weight-scale-report-print-shell w-full max-w-[210mm] bg-white border border-black shadow-[0_20px_50px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] print:max-w-none print:shadow-none relative ${
                  pageIndex === currentViewPage ? 'block' : 'hidden print:block'
                }`}
                style={{ minHeight: '296mm' }} // Fix height to A4
              >
                {/* Compact Corporate Header (Formal & Space-Saving) */}
                <div className="bg-white px-6 py-3 border-b border-black">
                   <div className="flex justify-between items-end mb-3">
                      {/* Left: Identity */}
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

                      {/* Center: Title */}
                      <div className="text-center pb-1">
                        <h2 className="text-[18px] font-black text-[#102C57] leading-none uppercase">รายงานสรุปชั่งเข้าสำเร็จรายวัน</h2>
                        <p className="text-[9px] font-bold text-[#d4af37] uppercase tracking-[0.2em] mt-1">Daily Weight Summary Report</p>
                      </div>

                      {/* Right: Audit Info */}
                      <div className="text-[10px] text-[#102C57] leading-tight text-right">
                         <p><span className="font-black text-[#64748b] uppercase text-[8px]">วันที่พิมพ์:</span> {printedAtLabel}</p>
                         <p><span className="font-black text-[#64748b] uppercase text-[8px]">ผู้ออกรายงาน:</span> {profile.username || "System"}</p>
                         <p><span className="font-black text-[#64748b] uppercase text-[8px]">หน้า:</span> {pageIndex + 1} / {reportPages.length}</p>
                      </div>
                   </div>

                   {/* Criteria Summary Row */}
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

                <div className="weight-scale-report-print-body bg-white px-4 py-4 min-h-[235mm] print:border-none print:px-0">
                  <div className="overflow-hidden">
                    <style dangerouslySetInnerHTML={{ __html: `
                      .summary-report-print-table th,
                      .summary-report-print-table td {
                        white-space: nowrap !important;
                        overflow: hidden;
                        text-overflow: clip;
                      }
                      @media print {
                        .summary-report-print-table th,
                        .summary-report-print-table td {
                          font-size: 12.5px !important;
                        }
                      }
                    ` }} />
                    <table className="weight-scale-report-print-table summary-report-print-table min-w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-[10%]" />
                        <col className="w-[20%]" />
                        <col className="w-[45%]" />
                        <col className="w-[10%]" />
                        <col className="w-[15%]" />
                      </colgroup>
                      <thead className="bg-[#f8f5ee]">
                        <tr className="border-b border-black text-[12.5px] font-black uppercase tracking-[0.14em] text-[#111111]">
                          <th className="px-3 py-0.5 text-center">ลำดับ</th>
                          <th className="px-3 py-0.5 text-center">LOT</th>
                          <th className="px-3 py-0.5 text-left">สินค้า</th>
                          <th className="px-3 py-0.5 text-center">จำนวน</th>
                          <th className="px-3 py-0.5 text-center">น้ำหนัก</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {pageRows.map((vRow, vIndex) => {
                          if (vRow.type === 'date-header') {
                            return (
                              <tr key={vIndex} className="bg-[#102C57] text-white">
                                <td colSpan={5} className="px-3 py-1">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f3d67a]">วันที่รายงาน:</span>
                                    <span className="text-[12.5px] font-bold">{vRow.label}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'item') {
                            const row = vRow.data;
                            return (
                              <tr key={vIndex} className="border-b border-black text-[12.5px] font-semibold text-[#111111]">
                                <td className="px-3 py-0.5 text-center">{vRow.sequence}</td>
                                <td className="px-3 py-0.5 text-center">{row.lotNo}</td>
                                <td className="px-3 py-0.5 text-left">{row.productDisplay}</td>
                                <td className="px-3 py-0.5 text-center">{row.quantity}</td>
                                <td className="px-3 py-0.5 text-center">{formatWeightDisplay(row.totalNetWeightKg)} Kg</td>
                              </tr>
                            );
                          }
                          if (vRow.type === 'subtotal') {
                            return (
                              <tr key={vIndex} className="bg-[#fbfcfd] border-b border-gray-300 text-[12.5px] text-[#111111] font-bold">
                                <td colSpan={3} className="px-3 py-1 text-right font-black">
                                  ยอดรวม
                                </td>
                                <td className="px-3 py-1 text-center font-black">{vRow.qty}</td>
                                <td className="px-3 py-1 text-center font-black">{formatWeightDisplay(vRow.weight)} Kg</td>
                              </tr>
                            );
                          }
                          return null;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Page Footer */}
                <div className="absolute bottom-2 left-0 right-0 px-6 flex justify-between items-center text-[10px] text-[#64748b] print:hidden">
                   <span>KPF Production Line Console - Summary</span>
                   <span className="font-bold">หน้า {pageIndex + 1} / {reportPages.length}</span>
                </div>
              </section>
            ))
          ) : (
            <div className="w-full max-w-[210mm] bg-white border border-black px-4 py-12 text-center text-sm text-[#111111]">
               {isPending ? "กำลังโหลดข้อมูล..." : "ยังไม่พบรายการสรุปชั่งตามเงื่อนไขที่เลือก"}
            </div>
          )}
        </div>
      </div>

      <div className="weight-scale-report-print-only daily-summary-print-only">
        <style dangerouslySetInnerHTML={{ __html: `
          @page {
            size: A4 portrait;
            margin: 7mm;
          }
          @media print {
            .weight-scale-report-screen-only,
            .weight-scale-report-screen-only *,
            .daily-summary-preview-pages,
            .daily-summary-preview-pages * {
              display: none !important;
            }
            .daily-summary-print-only {
              display: block !important;
              width: 100% !important;
              background: #ffffff !important;
              color: #111827 !important;
            }
            .daily-summary-print-table {
              width: 100% !important;
              table-layout: fixed !important;
              border-collapse: collapse !important;
              font-size: 12px !important;
              line-height: 1.2 !important;
              color: #111827 !important;
            }
            .daily-summary-print-table thead {
              display: table-header-group !important;
            }
            .daily-summary-print-table tfoot {
              display: table-row-group !important;
            }
            .daily-summary-print-table th,
            .daily-summary-print-table td {
              border-bottom: 0.5px solid #111827 !important;
              padding: 2.5px 4px !important;
              vertical-align: middle !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: clip !important;
            }
            .daily-summary-print-table .print-report-header th {
              border-bottom: 1px solid #111827 !important;
              padding: 0 0 5px !important;
              background: #ffffff !important;
            }
            .daily-summary-print-table .print-report-meta th {
              border-bottom: 1px solid #111827 !important;
              padding: 3px 4px !important;
              background: #ffffff !important;
            }
            .daily-summary-print-table .table-header th {
              background: #f8f5ee !important;
              color: #111827 !important;
              font-weight: 900 !important;
              text-align: center !important;
              font-size: 11.5px !important;
            }
            .daily-summary-print-table .date-header-row td {
              background: #102C57 !important;
              color: #ffffff !important;
              font-weight: 900 !important;
              padding: 3px 6px !important;
              break-after: avoid !important;
              page-break-after: avoid !important;
            }
            .daily-summary-print-table thead,
            .daily-summary-print-table thead tr,
            .daily-summary-print-table .date-header-row,
            .daily-summary-print-table .subtotal-row,
            .daily-summary-print-table .grand-total-row {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .daily-summary-print-table tbody tr.item-row {
              break-inside: auto !important;
              page-break-inside: auto !important;
            }
            .daily-summary-print-table .subtotal-row td {
              background: #fbfcfd !important;
              font-weight: 900 !important;
            }
            .daily-summary-print-table .grand-total-row td {
              background: #102C57 !important;
              color: #ffffff !important;
              font-weight: 900 !important;
              border-bottom-color: #102C57 !important;
            }
            .daily-summary-print-table td:nth-child(1),
            .daily-summary-print-table td:nth-child(2),
            .daily-summary-print-table td:nth-child(4),
            .daily-summary-print-table td:nth-child(5) {
              text-align: center !important;
            }
            .daily-summary-print-table td:nth-child(3) {
              text-align: left !important;
            }
            .daily-summary-print-table .date-header-row td {
              text-align: left !important;
            }
          }
        ` }} />
        {printRows.length ? (
          <table className="daily-summary-print-table">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[20%]" />
              <col className="w-[46%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="print-report-header">
                <th colSpan={5}>
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
                      <div className="text-[17px] font-black text-[#102C57]">รายงานสรุปชั่งเข้าสำเร็จรายวัน</div>
                      <div className="mt-1 text-[8px] font-black uppercase tracking-[0.22em] text-[#d4af37]">Daily Weight Summary Report</div>
                    </div>
                    <div className="text-right text-[9px] leading-tight text-[#102C57]">
                      <div><span className="font-black text-[#64748b]">วันที่พิมพ์:</span> {printedAtLabel}</div>
                      <div><span className="font-black text-[#64748b]">ผู้ออกรายงาน:</span> {profile.username || "System"}</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="print-report-meta">
                <th colSpan={2} className="text-left">แผนก: <span className="font-black">{departmentName || "-"}</span></th>
                <th className="text-center">ช่วงวันที่: <span className="font-black">{reportPeriodLabel}</span></th>
                <th colSpan={2} className="text-right">ขอบเขต: <span className="font-black">{selectedProductCountLabel}</span></th>
              </tr>
              <tr className="table-header">
                <th>ลำดับ</th>
                <th>LOT</th>
                <th className="text-left">สินค้า</th>
                <th>จำนวน</th>
                <th>น้ำหนัก</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((vRow, vIndex) => {
                if (vRow.type === "date-header") {
                  return (
                    <tr key={vIndex} className="date-header-row">
                      <td colSpan={5}>วันที่รายงาน: {vRow.label}</td>
                    </tr>
                  );
                }

                if (vRow.type === "item") {
                  const row = vRow.data;
                  return (
                    <tr key={vIndex} className="item-row">
                      <td>{vRow.sequence}</td>
                      <td>{row.lotNo}</td>
                      <td>{row.productDisplay}</td>
                      <td>{row.quantity}</td>
                      <td>{formatWeightDisplay(row.totalNetWeightKg)} Kg</td>
                    </tr>
                  );
                }

                if (vRow.type === "subtotal") {
                  return (
                    <tr key={vIndex} className="subtotal-row">
                      <td colSpan={3} className="text-right">ยอดรวม</td>
                      <td>{vRow.qty}</td>
                      <td>{formatWeightDisplay(vRow.weight)} Kg</td>
                    </tr>
                  );
                }

                return null;
              })}
              <tr className="grand-total-row">
                <td colSpan={3} className="text-right uppercase tracking-wider">สรุปรวมทั้งรายงาน</td>
                <td>{summary.totalQuantity}</td>
                <td>{formatWeightDisplay(summary.totalNetWeightKg)} Kg</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
