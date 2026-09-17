"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Search,
  X,
} from "lucide-react";
import {
  fetchRawMaterialReceipts,
  fetchProductionReceipts,
} from "@/features/raw-materials/services/rawMaterialsClient";

const PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 5000;
const RAW_CATEGORIES = ["01", "02", "03", "05", "08", "10"];
const WAREHOUSES = ["02", "04", "05", "08", "10"];
const EMPTY_FILTERS = {
  search: "",
  dateFrom: "",
  dateTo: "",
  warehouseCode: "",
  costStatus: "",
};
const EMPTY_SUMMARY = {
  total: 0,
  invoices: null,
  lots: null,
  totalAmountInclVat: 0,
  review: 0,
};

function formatNumber(value, digits = 2, maxDigits = digits) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: maxDigits,
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("th-TH-u-ca-gregory", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function rowKey(row) {
  return String(row.TRD_KEY);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function CostStatus({ status }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-emerald-700">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        ข้อมูลครบ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-amber-700">
      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
      รอตรวจสอบ
    </span>
  );
}

export default function RawMaterialReceiptsPageClient() {
  const [activeTab, setActiveTab] = useState("vendor"); // "vendor" | "production"
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [asOf, setAsOf] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [categories, setCategories] = useState(RAW_CATEGORIES);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState("");
  const [exportedRows, setExportedRows] = useState(0);
  const [exportError, setExportError] = useState("");
  const requestIdRef = useRef(0);

  const isProduction = activeTab === "production";

  const loadPage = useCallback(
    async (page, cursor) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError("");
      try {
        const fetcher =
          activeTab === "production"
            ? fetchProductionReceipts
            : fetchRawMaterialReceipts;
        const queryParams = {
          page: String(page),
          pageSize: String(PAGE_SIZE),
          cursor: cursor || "",
          ...filters,
        };
        if (activeTab === "vendor") {
          queryParams.iccatCodes = categories.join(",");
        }

        const result = await fetcher(queryParams);
        if (!result.ok) {
          throw new Error(
            result.status === 404
              ? "API Gateway ยังไม่มีรายการรับเข้านี้ ต้องอัปเดต Gateway ก่อน"
              : result.error?.message || "ไม่สามารถโหลดประวัติรับเข้าได้"
          );
        }
        if (requestId !== requestIdRef.current) return;

        const payload = result.data || {};
        const nextRows = Array.isArray(payload.data) ? payload.data : [];
        setRows(nextRows);
        setSelected(null);
        setSummary({ ...EMPTY_SUMMARY, ...(payload.summary || {}) });
        setAsOf(
          payload.asOf
            ? new Date(payload.asOf).toLocaleString("th-TH-u-ca-gregory", {
                dateStyle: "short",
                timeStyle: "short",
              })
            : ""
        );
        setPagination({
          page,
          totalPages: Number(payload.pagination?.totalPages || 1),
        });
        if (payload.cursor?.next) {
          setCursorMap((current) => ({
            ...current,
            [page + 1]: payload.cursor.next,
          }));
        }
      } catch (loadError) {
        if (requestId === requestIdRef.current) {
          setRows([]);
          setSelected(null);
          setError(loadError.message || "ไม่สามารถโหลดประวัติรับเข้าได้");
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [activeTab, categories, filters]
  );

  useEffect(() => {
    setCursorMap({ 1: null });
    loadPage(1, null);
  }, [loadPage]);

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return;
    setActiveTab(nextTab);
    setSelected(null);
    setCursorMap({ 1: null });
  };

  const submitFilters = (event) => {
    event.preventDefault();
    setFilters({ ...draftFilters, search: draftFilters.search.trim() });
  };

  const toggleCategory = (code) => {
    setCategories((current) => {
      if (current.includes(code)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== code);
      }
      return RAW_CATEGORIES.filter((item) => [...current, code].includes(item));
    });
  };

  const changePage = (page) => {
    if (page < 1 || page > pagination.totalPages || loading) return;
    loadPage(page, cursorMap[page] || null);
  };

  const copyDocRef = async () => {
    if (!selected?.DI_REF) return;
    await navigator.clipboard.writeText(selected.DI_REF);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const fetchExportRows = async () => {
    const allRows = [];
    let page = 1;
    let cursor = "";
    const fetcher =
      activeTab === "production"
        ? fetchProductionReceipts
        : fetchRawMaterialReceipts;

    while (true) {
      const queryParams = {
        page: String(page),
        pageSize: String(EXPORT_PAGE_SIZE),
        cursor,
        export: "1",
        noCache: "1",
        ...filters,
      };
      if (activeTab === "vendor") {
        queryParams.iccatCodes = categories.join(",");
      }

      const result = await fetcher(queryParams);
      if (!result.ok) {
        throw new Error(
          result.error?.message || "ไม่สามารถโหลดข้อมูลส่งออกได้"
        );
      }

      const payload = result.data || {};
      allRows.push(...(Array.isArray(payload.data) ? payload.data : []));
      setExportedRows(allRows.length);
      if (!payload.cursor?.hasMore || !payload.cursor?.next) break;
      cursor = payload.cursor.next;
      page += 1;
    }

    return allRows;
  };

  const exportRows = async (format) => {
    setExporting(format);
    setExportedRows(0);
    setExportError("");
    try {
      const exportRowsData = await fetchExportRows();
      const stamp = new Date().toISOString().slice(0, 10);
      const headers = isProduction
        ? [
            "วันที่รับเข้า",
            "เลขที่เอกสาร",
            "ประเภท",
            "รหัสสินค้า",
            "ชื่อสินค้า",
            "LOT",
            "คลัง",
            "ปริมาณสุทธิ",
            "หน่วย",
            "ราคา/หน่วยรวม VAT",
            "มูลค่าสุทธิรวม VAT",
            "รหัสแผนก",
            "ชื่อแผนก",
            "สถานะ",
            "เหตุผลที่ต้องตรวจสอบ",
          ]
        : [
            "วันที่รับเข้า",
            "เลขที่ INV",
            "ประเภท",
            "รหัสสินค้า",
            "ชื่อสินค้า",
            "LOT",
            "คลัง",
            "ปริมาณสุทธิ",
            "หน่วย",
            "ราคา/หน่วยรวม VAT",
            "มูลค่าสุทธิรวม VAT",
            "รหัสผู้ขาย",
            "ผู้ขาย",
            "สถานะ",
            "เหตุผลที่ต้องตรวจสอบ",
          ];

      const values = exportRowsData.map((row) => [
        exportDate(row.DI_DATE),
        row.DI_REF,
        row.ICCAT_CODE,
        row.SKU_CODE,
        row.SKU_NAME,
        row.LOT_NO,
        row.WL_CODE,
        Number(row.NET_BASE_QTY),
        row.BASE_UNIT_NAME,
        row.UNIT_PRICE_INCL_VAT == null ? "" : Number(row.UNIT_PRICE_INCL_VAT),
        row.NET_AMOUNT_INCL_VAT == null ? "" : Number(row.NET_AMOUNT_INCL_VAT),
        isProduction ? row.DEPT_CODE || "" : row.AP_CODE,
        isProduction ? row.DEPT_THAIDESC || "" : row.AP_NAME,
        row.COST_STATUS === "ready" ? "ข้อมูลครบ" : "รอตรวจสอบ",
        row.REVIEW_REASON || "",
      ]);

      const filePrefix = isProduction
        ? "production-receipts"
        : "raw-material-receipts";
      const sheetTitle = isProduction
        ? "รับสินค้าจากการผลิต"
        : "ประวัติรับเข้าวัตถุดิบ";

      if (format === "csv") {
        const content = `\uFEFF${[headers, ...values]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n")}`;
        downloadBlob(
          new Blob([content], { type: "text/csv;charset=utf-8" }),
          `${filePrefix}-${stamp}.csv`
        );
      } else {
        const excelModule = await import("exceljs/dist/exceljs.min.js");
        const ExcelJS = excelModule.default || excelModule;
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "KPF Quickplan";
        const worksheet = workbook.addWorksheet(sheetTitle);
        worksheet.addRow(headers);
        values.forEach((row) => worksheet.addRow(row));
        worksheet.views = [{ state: "frozen", ySplit: 1 }];
        worksheet.autoFilter = {
          from: "A1",
          to: `O${Math.max(1, values.length + 1)}`,
        };
        worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        worksheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF102C57" },
        };
        worksheet.columns = [
          12, 16, 10, 16, 42, 18, 8, 16, 12, 20, 20, 15, 34, 14, 34,
        ].map((width) => ({ width }));
        worksheet.getColumn(8).numFmt = "#,##0.########";
        worksheet.getColumn(10).numFmt = "#,##0.0000";
        worksheet.getColumn(11).numFmt = "#,##0.00";
        worksheet.getColumn(5).alignment = { wrapText: true, vertical: "top" };
        const buffer = await workbook.xlsx.writeBuffer();
        downloadBlob(
          new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `${filePrefix}-${stamp}.xlsx`
        );
      }
    } catch (exportFailure) {
      setExportError(exportFailure.message || "ส่งออกข้อมูลไม่สำเร็จ");
    } finally {
      setExporting("");
    }
  };

  return (
    <div className="min-h-[calc(100vh-49px)] bg-white text-[#082b59]">
      {/* Tab Navigation */}
      <nav className="flex items-center gap-1 border-b border-slate-200 bg-slate-100/75 px-4 pt-2.5">
        <button
          type="button"
          onClick={() => handleTabChange("vendor")}
          className={`rounded-t px-4 py-2 text-xs font-bold transition-all border-b-2 ${
            activeTab === "vendor"
              ? "border-[#102C57] bg-white text-[#102C57] shadow-sm"
              : "border-transparent text-slate-500 hover:bg-slate-200/50 hover:text-slate-800"
          }`}
        >
          ประวัติรับเข้าวัตถุดิบแยก LOT
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("production")}
          className={`rounded-t px-4 py-2 text-xs font-bold transition-all border-b-2 ${
            activeTab === "production"
              ? "border-[#102C57] bg-white text-[#102C57] shadow-sm"
              : "border-transparent text-slate-500 hover:bg-slate-200/50 hover:text-slate-800"
          }`}
        >
          รับสินค้าจากการผลิต
        </button>
      </nav>

      <header className="border-b-2 border-[#d8ad24] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-[24px] font-bold leading-tight">
              {isProduction
                ? "รับสินค้าจากการผลิต · แยก LOT"
                : "ประวัติรับเข้าวัตถุดิบ · แยก LOT"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {isProduction
                ? "รายการรับเข้าจากการผลิต (DT 305) ประเภทงานระหว่างทำ (03) แสดงยอดสุทธิรวม VAT"
                : "รายการรับเข้าตามใบกำกับสินค้า แสดงยอดสุทธิรวม VAT"}
            </p>
          </div>
          <p className="text-xs text-blue-700">
            {asOf ? `ข้อมูล ณ ${asOf}` : "ข้อมูลย้อนหลังจาก ERP"}
          </p>
        </div>

        <form
          onSubmit={submitFilters}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="relative min-w-[270px] flex-1">
            <span className="sr-only">ค้นหา</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={draftFilters.search}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder={
                isProduction
                  ? "ค้นหา เลขที่เอกสาร รหัสสินค้า ชื่อสินค้า หรือ LOT..."
                  : "ค้นหา INV รหัสสินค้า ชื่อสินค้า หรือ LOT..."
              }
              className="h-10 w-full rounded border border-slate-300 pl-9 pr-3 text-xs outline-none focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57]"
            />
          </label>

          {isProduction ? (
            <div className="flex h-10 items-center rounded border border-[#102C57] bg-[#edf3fb] px-3 text-xs font-bold text-[#102C57]">
              <span>ประเภท: 03 (งานระหว่างทำ)</span>
            </div>
          ) : (
            <fieldset className="flex items-center gap-1">
              <legend className="sr-only">ประเภทสินค้า</legend>
              <span className="mr-1 text-xs font-bold">ประเภท</span>
              {RAW_CATEGORIES.map((code) => {
                const active = categories.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCategory(code)}
                    className={`h-10 min-w-9 rounded border px-2 text-xs font-bold ${
                      active
                        ? "border-[#102C57] bg-[#edf3fb] text-[#102C57]"
                        : "border-slate-300 bg-white text-slate-400"
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </fieldset>
          )}

          <label className="text-[10px] font-semibold text-slate-500">
            จากวันที่
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
              className="mt-0.5 block h-10 rounded border border-slate-300 px-2 text-xs text-slate-700"
            />
          </label>
          <label className="text-[10px] font-semibold text-slate-500">
            ถึงวันที่
            <input
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
              className="mt-0.5 block h-10 rounded border border-slate-300 px-2 text-xs text-slate-700"
            />
          </label>
          <label>
            <span className="sr-only">คลัง</span>
            <select
              value={draftFilters.warehouseCode}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  warehouseCode: event.target.value,
                }))
              }
              className="h-10 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">ทุกคลัง</option>
              {WAREHOUSES.map((code) => (
                <option key={code} value={code}>
                  คลัง {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">สถานะ</span>
            <select
              value={draftFilters.costStatus}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  costStatus: event.target.value,
                }))
              }
              className="h-10 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">ทุกสถานะ</option>
              <option value="ready">ข้อมูลครบ</option>
              <option value="review">รอตรวจสอบ</option>
            </select>
          </label>
          <button
            type="submit"
            className="h-10 rounded bg-[#d8ad24] px-5 text-xs font-bold text-[#082b59] hover:bg-[#c89e17]"
          >
            ค้นหา
          </button>
          <button
            type="button"
            onClick={() => exportRows("csv")}
            disabled={Boolean(exporting)}
            className="h-10 rounded border border-[#102C57] bg-white px-3 text-xs font-bold disabled:opacity-50"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportRows("xlsx")}
            disabled={Boolean(exporting)}
            className="h-10 rounded border border-[#102C57] bg-white px-3 text-xs font-bold disabled:opacity-50"
          >
            Excel
          </button>
        </form>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs">
          <span>
            รับเข้า{" "}
            <strong className="tabular-nums">
              {summary.total.toLocaleString("th-TH")}
            </strong>{" "}
            รายการ
          </span>
          {summary.invoices != null ? (
            <span>
              ·{" "}
              <strong className="tabular-nums">
                {Number(summary.invoices).toLocaleString("th-TH")}
              </strong>{" "}
              {isProduction ? "เอกสาร" : "INV"}
            </span>
          ) : null}
          {summary.lots != null ? (
            <span>
              ·{" "}
              <strong className="tabular-nums">
                {Number(summary.lots).toLocaleString("th-TH")}
              </strong>{" "}
              LOT
            </span>
          ) : null}
          <span className="text-slate-300">|</span>
          <span>
            มูลค่าสุทธิรวม VAT{" "}
            <strong className="tabular-nums">
              {formatNumber(summary.totalAmountInclVat)}
            </strong>{" "}
            บาท
          </span>
          {summary.review > 0 ? (
            <span className="font-semibold text-amber-700">
              รอตรวจสอบ {summary.review.toLocaleString("th-TH")}
            </span>
          ) : null}
          {exporting ? (
            <span className="font-semibold text-blue-700">
              กำลังสร้าง {exporting === "csv" ? "CSV" : "Excel"} ·{" "}
              {exportedRows.toLocaleString("th-TH")} รายการ
            </span>
          ) : null}
          {exportError ? (
            <span className="font-semibold text-red-600">{exportError}</span>
          ) : null}
          <span className="ml-auto text-[10px] text-slate-500">
            ไม่เลือกวันที่ = ตั้งแต่เริ่มมีข้อมูลใน ERP
          </span>
        </div>
      </header>

      <div className="min-w-0">
        <section className="min-w-0">
          <div className="max-h-[calc(100vh-270px)] overflow-auto">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-[12px]">
              <thead className="sticky top-0 z-20 bg-[#102C57] text-white">
                <tr className="border-b border-white/40">
                  <th className="w-[85px] border-r border-white/25 px-2 py-2 text-left">วันที่รับเข้า</th>
                  {isProduction ? (
                    <th className="w-[100px] border-r border-white/25 px-2 py-2 text-left">เลขที่เอกสาร</th>
                  ) : (
                    <th className="w-[100px] border-r border-white/25 px-2 py-2 text-left">เลขที่ INV</th>
                  )}
                  <th className="w-[95px] border-r border-white/25 px-2 py-2 text-left">รหัสสินค้า</th>
                  <th className="w-[260px] border-r border-white/25 px-2 py-2 text-left">ชื่อสินค้า</th>
                  <th className="w-[78px] border-r border-white/25 px-2 py-2 text-center">LOT</th>
                  <th className="w-[44px] border-r border-white/25 px-2 py-2 text-center">คลัง</th>
                  <th className="w-[94px] border-r border-white/25 px-2 py-2 text-right">ปริมาณสุทธิ</th>
                  <th className="w-[50px] border-r border-white/25 px-2 py-2 text-left">หน่วย</th>
                  <th className="w-[100px] border-r border-white/25 px-2 py-2 text-right leading-tight">ราคา/หน่วย<br />รวม VAT</th>
                  <th className="w-[105px] border-r border-white/25 px-2 py-2 text-right leading-tight">มูลค่าสุทธิ<br />รวม VAT</th>
                  <th className="w-[100px] px-2 py-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="h-40 text-center text-slate-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={11} className="h-40 text-center text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="h-40 text-center text-slate-500">
                      ไม่พบรายการรับเข้า
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => {
                    const active = selected && rowKey(selected) === rowKey(row);
                    return (
                      <tr
                        key={rowKey(row)}
                        onClick={() => setSelected(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(row);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`ดูรายละเอียด ${row.SKU_CODE || "สินค้า"} LOT ${row.LOT_NO || "ไม่ระบุ"}`}
                        className={`cursor-pointer border-b border-slate-200 hover:bg-amber-50 ${
                          index > 0 && rows[index - 1].SKU_CODE !== row.SKU_CODE
                            ? "border-t-2 border-t-[#d8ad24]"
                            : ""
                        } ${active ? "bg-amber-50" : index % 2 ? "bg-slate-50/70" : "bg-white"}`}
                      >
                        <td className="whitespace-nowrap border-r border-slate-200 px-2 py-2">{formatDate(row.DI_DATE)}</td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-2 py-2 font-semibold">{row.DI_REF || "—"}</td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-2 py-2 font-bold">{row.SKU_CODE || "—"}</td>
                        <td className="whitespace-normal break-words border-r border-slate-200 px-2 py-2 font-semibold leading-4 text-slate-900">{row.SKU_NAME || "—"}</td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-2 py-2 text-center">{row.LOT_NO || "—"}</td>
                        <td className="border-r border-slate-200 px-2 py-2 text-center font-bold">{row.WL_CODE || "—"}</td>
                        <td className="border-r border-slate-200 px-2 py-2 text-right font-semibold tabular-nums">{formatNumber(row.NET_BASE_QTY, 2, 8)}</td>
                        <td className="border-r border-slate-200 px-2 py-2 font-semibold">{row.BASE_UNIT_NAME || "—"}</td>
                        <td className="border-r border-slate-200 px-2 py-2 text-right font-semibold tabular-nums">{formatNumber(row.UNIT_PRICE_INCL_VAT, 4)}</td>
                        <td className="border-r border-slate-200 px-2 py-2 text-right font-bold tabular-nums">{formatNumber(row.NET_AMOUNT_INCL_VAT)}</td>
                        <td className="px-2 py-2 text-center"><CostStatus status={row.COST_STATUS} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex h-11 items-center justify-between border-t border-slate-200 bg-white px-3 text-xs">
            <span>{PAGE_SIZE} รายการต่อหน้า</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changePage(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="rounded border border-slate-300 p-1.5 disabled:opacity-40"
                aria-label="หน้าก่อนหน้า"
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                หน้า <strong>{pagination.page.toLocaleString("th-TH")}</strong> /{" "}
                {pagination.totalPages.toLocaleString("th-TH")}
              </span>
              <button
                type="button"
                onClick={() => changePage(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="rounded border border-slate-300 p-1.5 disabled:opacity-40"
                aria-label="หน้าถัดไป"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </footer>
        </section>

        {selected ? (
          <aside className="fixed bottom-0 right-0 top-[49px] z-40 w-[min(380px,100vw)] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-[-10px_0_30px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {isProduction
                  ? "รายละเอียดรับสินค้าจากการผลิต"
                  : "รายละเอียดรับเข้า LOT"}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded p-1 hover:bg-slate-100"
                aria-label="ปิดรายละเอียด"
              >
                <X size={18} />
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-4 text-xs">
              <div>
                <dt className="text-slate-500">
                  {isProduction ? "เลขที่เอกสาร" : "เลขที่ INV"}
                </dt>
                <dd className="mt-1 font-bold">{selected.DI_REF || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">รหัสสินค้า</dt>
                <dd className="mt-1 font-bold">{selected.SKU_CODE || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">ชื่อสินค้า</dt>
                <dd className="mt-1 font-bold text-slate-900">
                  {selected.SKU_NAME || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">LOT</dt>
                <dd className="mt-1 font-bold">{selected.LOT_NO || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">คลัง</dt>
                <dd className="mt-1 font-bold">{selected.WL_CODE || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">สถานะ</dt>
                <dd className="mt-1">
                  <CostStatus status={selected.COST_STATUS} />
                </dd>
              </div>
            </dl>

            <dl className="space-y-4 border-b border-slate-200 py-4 text-xs">
              <div>
                <dt className="text-slate-500">วันที่รับเข้า</dt>
                <dd className="mt-1 text-base font-bold">
                  {formatDate(selected.DI_DATE)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">ปริมาณสุทธิ</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums">
                  {formatNumber(selected.NET_BASE_QTY, 2, 8)}{" "}
                  {selected.BASE_UNIT_NAME || ""}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">ราคา/หน่วยรวม VAT</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums">
                  {formatNumber(selected.UNIT_PRICE_INCL_VAT, 4)} บาท/
                  {selected.BASE_UNIT_NAME || "หน่วย"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">มูลค่าสุทธิรวม VAT</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums">
                  {formatNumber(selected.NET_AMOUNT_INCL_VAT)} บาท
                </dd>
              </div>
            </dl>

            {selected.UNIT_PRICE_INCL_VAT != null ? (
              <div className="mt-4 rounded bg-slate-100 p-3 text-xs leading-6">
                <p>ราคา/หน่วยรวม VAT = มูลค่าสุทธิรวม VAT ÷ ปริมาณสุทธิ</p>
                <p className="font-bold tabular-nums">
                  {formatNumber(selected.NET_AMOUNT_INCL_VAT)} ÷{" "}
                  {formatNumber(selected.NET_BASE_QTY, 2, 8)} ={" "}
                  {formatNumber(selected.UNIT_PRICE_INCL_VAT, 4)} บาท/
                  {selected.BASE_UNIT_NAME || "หน่วย"}
                </p>
              </div>
            ) : null}

            <div className="mt-4 text-xs space-y-2">
              {isProduction ? (
                <>
                  <div>
                    <p className="text-slate-500">แผนก</p>
                    <p className="mt-1 font-bold text-slate-900">
                      {selected.DEPT_CODE
                        ? `${selected.DEPT_CODE} - ${selected.DEPT_THAIDESC || ""}`
                        : "—"}
                    </p>
                  </div>
                  {selected.PRJ_NAME ? (
                    <div>
                      <p className="text-slate-500">โครงการ/งาน</p>
                      <p className="mt-0.5 font-semibold text-slate-800">
                        {selected.PRJ_NAME}
                      </p>
                    </div>
                  ) : null}
                  {selected.DI_CRE_BY ? (
                    <div>
                      <p className="text-slate-500">ผู้บันทึก</p>
                      <p className="mt-0.5 text-slate-700">
                        {selected.DI_CRE_BY}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <p className="text-slate-500">ผู้ขาย</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {selected.AP_NAME || "—"}
                  </p>
                </div>
              )}
              {selected.REVIEW_REASON ? (
                <p className="mt-3 rounded bg-amber-100 px-3 py-2 font-semibold text-amber-800">
                  {selected.REVIEW_REASON}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={copyDocRef}
              className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded border border-[#102C57] text-xs font-bold hover:bg-slate-50"
            >
              <Clipboard size={15} />
              {copied
                ? isProduction
                  ? "คัดลอกเลขที่เอกสารแล้ว"
                  : "คัดลอกเลข INV แล้ว"
                : isProduction
                ? "คัดลอกเลขที่เอกสาร"
                : "คัดลอกเลข INV"}
            </button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
