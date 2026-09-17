"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, startTransition, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Edit3,
  Eye,
  History,
  LayoutGrid,
  MoreVertical,
  Printer,
  Search,
  XCircle,
  Plus,
} from "lucide-react";
import {
  cancelPieceRateReportItem,
  fetchEditablePieceRateProducts,
  fetchPieceRateEmployeeSummary,
  fetchPieceRateReportProducts,
  downloadPieceRateReportExcel,
  fetchPieceRateGroupDocuments,
  issuePieceRateReportPrintDocument,
  fetchPieceRateReport,
  fetchPieceRateReportRevisions,
  updatePieceRateReportItem,
  submitPieceRateLog,
  fetchPieceRateEmployeeLookup,
  importPieceRateLogs,
} from "@/features/attendance/services/pieceRateWorkClient";
import { startPieceRateReportRealtimeSync } from "@/features/attendance/services/pieceRateReportRealtime";
import { supabase } from "@/lib/supabaseClient";
import { useUserProfile } from "@/lib/useUserProfile";
const EMPTY_PAGINATION = { page: 1, pageSize: 20, totalPages: 1, totalRecords: 0 };
const EMPTY_SUMMARY = { totalInput: "0.00", totalCount: "0.00", totalKg: "0.00", totalWage: null };
const DEFAULT_CAPABILITIES = {
  canViewReport: false,
  canViewMoney: false,
  canEdit: false,
};
const DEFAULT_VIEW_MODE = "grouped";
const VIEW_MODE_LABELS = {
  grouped: "กลุ่ม",
  detail: "รายการ",
  employee: "พนักงาน",
  product: "สินค้า",
};
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}
function formatTimePair(row) {
  return {
    actual: formatDateTime(row?.loggedAt),
  };
}

function formatDateToDDMMYYYY(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matched) {
    return `${matched[3]}/${matched[2]}/${matched[1]}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB");
}

function formatNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSignedPercentage(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  const prefix = parsed > 0 ? "+" : "";
  return `${prefix}${formatNumber(parsed, digits)}%`;
}

function getComparisonTone(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "neutral";
  if (parsed > 0) return "positive";
  if (parsed < 0) return "negative";
  return "neutral";
}

function getComparisonCellClassName(value) {
  const tone = getComparisonTone(value);
  if (tone === "positive") {
    return "piece-rate-compare-positive bg-emerald-50 text-emerald-700";
  }
  if (tone === "negative") {
    return "piece-rate-compare-negative bg-rose-50 text-rose-700";
  }
  return "piece-rate-compare-neutral bg-slate-50 text-slate-700";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&#39;";
  });
}

function getMergedCount(row) {
  return Math.max(1, Number(row?.mergedRowCount || 1));
}

function getDocSummary(row) {
  const mergedCount = getMergedCount(row);
  const docNo = row?.docNo || "-";
  if (mergedCount <= 1) {
    return docNo;
  }
  return `${docNo} (${mergedCount} รายการ)`;
}

function getSummaryLabel(pagination, viewMode) {
  const suffix = VIEW_MODE_LABELS[viewMode] || VIEW_MODE_LABELS.grouped;
  return `${pagination.totalRecords.toLocaleString("th-TH")} ${suffix}`;
}

function normalizeViewMode(value) {
  if (value === "detail" || value === "employee" || value === "product") {
    return value;
  }
  return "grouped";
}

function getProductCodeLabel(row) {
  const goodsCode = String(row?.productGoodsCode || row?.productCode || "").trim();
  const skuCode = String(row?.productSkuCode || "").trim();

  if (goodsCode && skuCode && goodsCode !== "-" && skuCode !== "-" && goodsCode !== skuCode) {
    return `${goodsCode} | SKU ${skuCode}`;
  }

  if (goodsCode && goodsCode !== "-") {
    return goodsCode;
  }

  if (skuCode && skuCode !== "-") {
    return `SKU ${skuCode}`;
  }

  return "-";
}

function getDocStatusConfig(status) {
  if (status === "replaced") {
    return {
      label: "ยกเลิกแล้ว",
      className: "bg-amber-100 text-amber-700",
    };
  }
  if (status === "cancelled") {
    return {
      label: "ยกเลิก",
      className: "bg-rose-100 text-rose-700",
    };
  }
  return {
    label: "ใช้งาน",
    className: "bg-emerald-100 text-emerald-700",
  };
}

function getRevisionBadgeConfig(type) {
  if (type === "replacedBy") {
    return {
      label: "แทนที่โดย",
      className: "piece-rate-replaced-badge border border-sky-200 bg-sky-100 text-sky-800",
    };
  }

  return {
    label: "แก้จาก",
    className: "piece-rate-revised-badge border border-amber-200 bg-amber-100 text-amber-800",
  };
}

function getDocumentSurfaceConfig(status) {
  if (status === "replaced") {
    return {
      rowClassName: "bg-amber-50 hover:bg-amber-100/80",
      cardClassName: "border-amber-200 bg-amber-50",
      printRowClassName: "piece-rate-row-replaced",
    };
  }

  if (status === "cancelled") {
    return {
      rowClassName: "bg-rose-50 hover:bg-rose-100/80",
      cardClassName: "border-rose-200 bg-rose-50",
      printRowClassName: "piece-rate-row-cancelled",
    };
  }

  return {
    rowClassName: "hover:bg-slate-50",
    cardClassName: "border-slate-200 bg-white",
    printRowClassName: "",
  };
}

function MetricPill({ label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function ModeButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-[11px] font-bold transition ${active
        ? "bg-[#102C57] text-white"
        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
    >
      {children}
    </button>
  );
}

const MobileReportCard = memo(function MobileReportCard({ row, canViewMoney, canEdit, onEdit, onCancel, isGroupedView, onOpenGroupDocuments, onOpenHistory }) {
  const mergedCount = getMergedCount(row);
  const status = getDocStatusConfig(row.docStatus);
  const surface = isGroupedView ? getDocumentSurfaceConfig("active") : getDocumentSurfaceConfig(row.docStatus);
  const revisedBadge = getRevisionBadgeConfig("revisedFrom");
  const replacedBadge = getRevisionBadgeConfig("replacedBy");
  const timePair = formatTimePair(row);

  return (
    <article className={`rounded-lg border p-3 shadow-sm ${surface.cardClassName}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">เวลาชั่งจริง</p>
          <p className="text-xs font-semibold text-slate-900">{timePair.actual}</p>
          {row.source === "manual" && (
            <span className="mt-1 inline-flex rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
              Manual
            </span>
          )}
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status.className}`}>
          {row.docStatus && row.docStatus !== "active"
            ? status.label
            : (mergedCount > 1 ? `รวม ${mergedCount} ครั้ง` : "1 ครั้ง")}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-slate-500">ผู้บันทึก</dt>
        <dd>{row.operatorUsername || "-"}</dd>

        <dt className="text-slate-500">เอกสาร</dt>
        <dd className="font-mono font-semibold text-[#102C57]">
          {isGroupedView ? (
            <button
              type="button"
              onClick={() => onOpenGroupDocuments(row)}
              className="piece-rate-no-print rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-[#102C57] hover:bg-slate-200"
            >
              ดูเอกสาร {getMergedCount(row)} ใบ
            </button>
          ) : (
            getDocSummary(row)
          )}
        </dd>

        <dt className="text-slate-500">รหัสเครื่อง</dt>
        <dd className="font-mono">{row.machineCode || "-"}</dd>

        {row.revisedFromDocNo ? (
          <>
            <dt className="text-slate-500">แก้จาก</dt>
            <dd>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${revisedBadge.className}`}>
                {revisedBadge.label}: <span className="ml-1 font-mono">{row.revisedFromDocNo}</span>
              </span>
            </dd>
          </>
        ) : null}

        {row.replacedByDocNo ? (
          <>
            <dt className="text-slate-500">แทนที่โดย</dt>
            <dd>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${replacedBadge.className}`}>
                {replacedBadge.label}: <span className="ml-1 font-mono">{row.replacedByDocNo}</span>
              </span>
            </dd>
          </>
        ) : null}

        <dt className="text-slate-500">พนักงาน</dt>
        <dd className="font-mono">{row.employeeCode}</dd>

        <dt className="text-slate-500">ชื่อพนักงาน</dt>
        <dd>{row.employeeName}</dd>

        <dt className="text-slate-500">รหัสสินค้า</dt>
        <dd className="font-mono">{getProductCodeLabel(row)}</dd>

        <dt className="text-slate-500">ชื่อสินค้า</dt>
        <dd className="font-semibold">{row.productName}</dd>

        <dt className="text-slate-500">น้ำหนัก</dt>
        <dd className="text-right font-semibold tabular-nums">
          {formatNumber(row.normalizedKgAmount, 3)} กก.
        </dd>

        <dt className="text-slate-500">จำนวน</dt>
        <dd className="text-right font-semibold tabular-nums">{formatNumber(row.countValue, 0)}</dd>

        {canViewMoney ? (
          <>
            <dt className="text-slate-500">ค่าแรง</dt>
            <dd className="text-right font-semibold tabular-nums">{formatNumber(row.wageAmount, 2)}</dd>
          </>
        ) : null}

        {row.cancelReason ? (
          <>
            <dt className="text-slate-500">เหตุผล</dt>
            <dd>{row.cancelReason}</dd>
          </>
        ) : null}
      </dl>

      {canEdit && !isGroupedView ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => onOpenHistory(row)}
              className="piece-rate-no-print inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <History size={12} /> ดูประวัติ
            </button>
            {row.docStatus === "active" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 size={12} /> ออกเอกสารแก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => onCancel(row)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <XCircle size={12} /> ยกเลิกเอกสาร
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">{row.cancelReason || row.editReason || "-"}</div>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
});

export default function PieceRateReportPageClient({ initialViewMode = DEFAULT_VIEW_MODE }) {
  const { username } = useUserProfile();
  const today = todayISO();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);
  const [searchInput, setSearchInput] = useState("");
  const [dateFromInput, setDateFromInput] = useState(today);
  const [dateToInput, setDateToInput] = useState(today);
  const [hideCancelledInput, setHideCancelledInput] = useState(true);
  const [hideReplacedInput, setHideReplacedInput] = useState(true);
  const [selectedProductKeysInput, setSelectedProductKeysInput] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    dateFrom: today,
    dateTo: today,
    hideCancelled: true,
    hideReplaced: true,
    productKeys: [],
  });
  const [viewMode, setViewMode] = useState(normalizeViewMode(initialViewMode));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({
    productBarcode: "",
    inputValue: "",
    countValue: "",
    editReason: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editableProductOptions, setEditableProductOptions] = useState([]);
  const [editableProductOptionsLoading, setEditableProductOptionsLoading] = useState(false);
  const [editableProductOptionsError, setEditableProductOptionsError] = useState("");
  const [cancellingRow, setCancellingRow] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [savingCancel, setSavingCancel] = useState(false);
  const [groupDocumentsRow, setGroupDocumentsRow] = useState(null);
  const [groupDocumentsData, setGroupDocumentsData] = useState([]);
  const [groupDocumentsSummary, setGroupDocumentsSummary] = useState(EMPTY_SUMMARY);
  const [groupDocumentsLoading, setGroupDocumentsLoading] = useState(false);
  const [groupDocumentsError, setGroupDocumentsError] = useState("");
  const [exportingExcel, setExportingExcel] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importingExcelFile, setImportingExcelFile] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccessMsg, setImportSuccessMsg] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [printingReport, setPrintingReport] = useState(false);
  const [historyRow, setHistoryRow] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [actionMenuRowId, setActionMenuRowId] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [productOptionsError, setProductOptionsError] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [employeeSummaryRow, setEmployeeSummaryRow] = useState(null);
  const [employeeSummaryData, setEmployeeSummaryData] = useState(null);
  const [employeeSummaryLoading, setEmployeeSummaryLoading] = useState(false);
  const [employeeSummaryError, setEmployeeSummaryError] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    loggedAtDate: today,
    loggedAtTime: "12:00",
    employeeCode: "",
    employeeName: "",
    employeeDepartment: "",
    employeeBranch: "",
    employeeCheckIn: "",
    employeeCheckOut: "",
    productBarcode: "",
    inputValue: "",
    countValue: "1",
    remark: "",
  });
  const [employeeLookupLoading, setEmployeeLookupLoading] = useState(false);
  const [employeeLookupError, setEmployeeLookupError] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [manualFormError, setManualFormError] = useState("");


  const visibleGroupDocuments = useMemo(
    () => groupDocumentsData.filter((row) => row?.docStatus === "active"),
    [groupDocumentsData]
  );
  const visibleGroupDocumentsSummary = useMemo(() => {
    const totals = visibleGroupDocuments.reduce((accumulator, row) => ({
      totalInput: accumulator.totalInput + Number(row?.inputValue || 0),
      totalCount: accumulator.totalCount + Number(row?.countValue || 0),
      totalKg: accumulator.totalKg + Number(row?.normalizedKgAmount || 0),
      totalWage: accumulator.totalWage + Number(row?.wageAmount || 0),
    }), {
      totalInput: 0,
      totalCount: 0,
      totalKg: 0,
      totalWage: 0,
    });

    return {
      totalInput: totals.totalInput.toFixed(2),
      totalCount: totals.totalCount.toFixed(2),
      totalKg: totals.totalKg.toFixed(2),
      totalWage: totals.totalWage.toFixed(2),
    };
  }, [visibleGroupDocuments]);

  const tableWrapRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const initialFiltersRef = useRef({
    search: "",
    dateFrom: today,
    dateTo: today,
    hideCancelled: true,
    hideReplaced: true,
    productKeys: [],
  });
  const latestReportStateRef = useRef({
    page: 1,
    filters: initialFiltersRef.current,
    viewMode: normalizeViewMode(initialViewMode),
  });
  const saveEditLockRef = useRef(false);
  const saveCancelLockRef = useRef(false);

  latestReportStateRef.current = {
    page: pagination.page,
    filters,
    viewMode,
  };

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest("[data-piece-rate-action-menu]")) {
        return;
      }
      setActionMenuRowId(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const loadData = useCallback(async (nextPage = 1, nextFilters, nextViewMode = DEFAULT_VIEW_MODE) => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    const activeFilters = nextFilters || {
      search: "",
      dateFrom: todayISO(),
      dateTo: todayISO(),
      hideCancelled: true,
      hideReplaced: true,
    };
    const activeViewMode = normalizeViewMode(nextViewMode);

    setIsLoading(true);
    setErrorMessage("");

    const result = await fetchPieceRateReport({
      page: nextPage,
      pageSize: 20,
      search: activeFilters.search,
      dateFrom: activeFilters.dateFrom,
      dateTo: activeFilters.dateTo,
      hideCancelled: activeFilters.hideCancelled,
      hideReplaced: activeFilters.hideReplaced,
      productKeys: activeFilters.productKeys,
      viewMode: activeViewMode,
    });

    if (requestSequenceRef.current !== requestId) {
      return;
    }

    setIsLoading(false);

    if (!result.ok) {
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setPagination((previousValue) => ({
        ...previousValue,
        page: nextPage,
      }));
      setCapabilities(DEFAULT_CAPABILITIES);
      setErrorMessage(result.error?.message || "ไม่สามารถโหลดรายงานสแกนคิดค่าแรงได้");
      return;
    }

    const payload = result.data?.data || {};
    setRows(Array.isArray(payload.data) ? payload.data : []);
    setSummary(payload.summary || EMPTY_SUMMARY);
    setPagination(payload.pagination || EMPTY_PAGINATION);
    setCapabilities(payload.capabilities || DEFAULT_CAPABILITIES);
    setViewMode(activeViewMode);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(1, initialFiltersRef.current, initialViewMode);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [initialViewMode, loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let hasLoggedRealtimeError = false;
    const logRealtimeErrorOnce = (message, error = null) => {
      if (hasLoggedRealtimeError) return;
      hasLoggedRealtimeError = true;
      console.warn(message, error || "");
    };
    const realtimeSync = startPieceRateReportRealtimeSync({
      supabaseClient: supabase,
      onRefresh: () => {
        const latest = latestReportStateRef.current;
        void loadData(latest.page, latest.filters, latest.viewMode);
      },
      onRealtimeStatus: (status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logRealtimeErrorOnce(`Piece-rate report Realtime status: ${status}`);
        }
      },
      onRealtimeError: (error) => {
        logRealtimeErrorOnce("Failed to initialize piece-rate Realtime", error);
      },
      onBroadcastError: (error) => {
        console.warn("Failed to initialize piece-rate BroadcastChannel", error);
      },
    });

    return () => {
      void realtimeSync.dispose().catch((error) => {
        logRealtimeErrorOnce("Failed to dispose piece-rate Realtime", error);
      });
    };
  }, [loadData]);

  useEffect(() => {
    if (viewMode !== "product") {
      setProductDropdownOpen(false);
      return;
    }

    let cancelled = false;

    const loadProductOptions = async () => {
      setProductOptionsLoading(true);
      setProductOptionsError("");
      const result = await fetchPieceRateReportProducts({
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        hideCancelled: filters.hideCancelled,
        hideReplaced: filters.hideReplaced,
      });

      if (cancelled) return;

      setProductOptionsLoading(false);
      if (!result.ok) {
        setProductOptions([]);
        setProductOptionsError(result.error?.message || "ไม่สามารถโหลดรายการสินค้าได้");
        return;
      }

      const options = Array.isArray(result.data?.data?.data) ? result.data.data.data : [];
      setProductOptions(options);
      setSelectedProductKeysInput((current) => current.filter((value) => options.some((option) => option.value === value)));
    };

    void loadProductOptions();

    return () => {
      cancelled = true;
    };
  }, [filters.dateFrom, filters.dateTo, filters.hideCancelled, filters.hideReplaced, filters.search, viewMode]);

  const runSearch = useCallback(() => {
    const nextFilters = {
      search: String(searchInput || "").trim(),
      dateFrom: dateFromInput,
      dateTo: dateToInput,
      hideCancelled: hideCancelledInput,
      hideReplaced: hideReplacedInput,
      productKeys: selectedProductKeysInput,
    };
    setProductDropdownOpen(false);
    setFilters(nextFilters);
    void loadData(1, nextFilters, viewMode);
  }, [dateFromInput, dateToInput, hideCancelledInput, hideReplacedInput, loadData, searchInput, selectedProductKeysInput, viewMode]);

  const handleToggleProductSelection = useCallback((productKey) => {
    setSelectedProductKeysInput((current) => {
      if (current.includes(productKey)) {
        return current.filter((value) => value !== productKey);
      }
      if (current.length >= 2) {
        setErrorMessage("เลือกสินค้าได้สูงสุด 2 รายการ");
        return current;
      }
      setErrorMessage("");
      return [...current, productKey];
    });
  }, []);

  const runReset = useCallback(() => {
    const nextToday = todayISO();
    setSearchInput("");
    setDateFromInput(nextToday);
    setDateToInput(nextToday);
    setHideCancelledInput(true);
    setHideReplacedInput(true);
    setSelectedProductKeysInput([]);
    const nextFilters = {
      search: "",
      dateFrom: nextToday,
      dateTo: nextToday,
      hideCancelled: true,
      hideReplaced: true,
      productKeys: [],
    };
    setProductDropdownOpen(false);
    setFilters(nextFilters);
    void loadData(1, nextFilters, viewMode);
  }, [loadData, viewMode]);

  const handleViewModeChange = useCallback((nextMode) => {
    const resolvedMode = normalizeViewMode(nextMode);
    const nextQuery = new URLSearchParams(searchParams?.toString() || "");
    nextQuery.set("viewMode", resolvedMode);
    router.replace(`${pathname}?${nextQuery.toString()}`, { scroll: false });
    setProductDropdownOpen(false);
    setViewMode(resolvedMode);
    void loadData(1, filters, resolvedMode);
  }, [filters, loadData, pathname, router, searchParams]);

  const handleToggleHideCancelled = useCallback((checked) => {
    startTransition(() => {
      setHideCancelledInput(checked);
    });
    const nextFilters = {
      ...filters,
      hideCancelled: checked,
    };
    setFilters(nextFilters);
    void loadData(1, nextFilters, viewMode);
  }, [filters, loadData, viewMode]);

  const handleToggleHideReplaced = useCallback((checked) => {
    startTransition(() => {
      setHideReplacedInput(checked);
    });
    const nextFilters = {
      ...filters,
      hideReplaced: checked,
    };
    setFilters(nextFilters);
    void loadData(1, nextFilters, viewMode);
  }, [filters, loadData, viewMode]);

  const canGoPrev = pagination.page > 1 && !isLoading;
  const canGoNext = pagination.page < pagination.totalPages && !isLoading;
  const summaryLabel = useMemo(() => getSummaryLabel(pagination, viewMode), [pagination, viewMode]);

  const goPrev = useCallback(() => {
    if (!canGoPrev) return;
    void loadData(pagination.page - 1, filters, viewMode);
  }, [canGoPrev, filters, loadData, pagination.page, viewMode]);

  const goNext = useCallback(() => {
    if (!canGoNext) return;
    void loadData(pagination.page + 1, filters, viewMode);
  }, [canGoNext, filters, loadData, pagination.page, viewMode]);

  const detailCanEdit = capabilities.canEdit && viewMode === "detail";

  const loadEditableProductOptions = useCallback(async () => {
    if (!capabilities.canEdit) {
      return;
    }

    setEditableProductOptionsLoading(true);
    setEditableProductOptionsError("");
    const result = await fetchEditablePieceRateProducts();

    setEditableProductOptionsLoading(false);
    if (!result.ok) {
      setEditableProductOptions([]);
      setEditableProductOptionsError(result.error?.message || "ไม่สามารถโหลดรายการสินค้าเพื่อแก้ไขได้");
      return;
    }

    const options = Array.isArray(result.data?.data?.data) ? result.data.data.data : [];
    setEditableProductOptions(options);
  }, [capabilities.canEdit]);

  useEffect(() => {
    if (!detailCanEdit) {
      return;
    }

    void loadEditableProductOptions();
  }, [detailCanEdit, loadEditableProductOptions]);

  useEffect(() => {
    if (!manualModalOpen || !capabilities.canEdit || editableProductOptions.length > 0) {
      return;
    }

    void loadEditableProductOptions();
  }, [
    capabilities.canEdit,
    editableProductOptions.length,
    loadEditableProductOptions,
    manualModalOpen,
  ]);

  const activeEditProductOption = useMemo(() => {
    if (!editingRow) {
      return null;
    }

    const selectedBarcode = String(editForm.productBarcode || "").trim();
    const matchedOption = editableProductOptions.find((option) => (
      String(option?.productBarcode || option?.value || "").trim() === selectedBarcode
    ));
    if (matchedOption) {
      return matchedOption;
    }

    const fallbackBarcode = String(editingRow.productBarcode || "").trim();
    if (!fallbackBarcode || fallbackBarcode === "-") {
      return null;
    }

    return {
      value: fallbackBarcode,
      productBarcode: fallbackBarcode,
      productCode: editingRow.productGoodsCode || editingRow.productCode || "-",
      productGoodsCode: editingRow.productGoodsCode || editingRow.productCode || "-",
      productSkuCode: editingRow.productSkuCode || "",
      productName: editingRow.productName || "-",
      label: editingRow.productName || "-",
      profileName: editingRow.pieceRateProfileName || "-",
      inputMode: editingRow.inputMode || "kg",
      inputLabel: editingRow.inputLabel || "น้ำหนัก",
      inputUnitLabel: editingRow.inputUnitLabel || "กก.",
      weightOptionLabel: editingRow.weightOptionLabel || null,
      isLegacy: true,
    };
  }, [editForm.productBarcode, editableProductOptions, editingRow]);

  const activeEditInputMode = activeEditProductOption?.inputMode || editingRow?.inputMode || "kg";
  const activeEditInputLabel = activeEditProductOption?.inputLabel || editingRow?.inputLabel || "น้ำหนัก";
  const activeEditInputUnitLabel = activeEditProductOption?.inputUnitLabel || editingRow?.inputUnitLabel || "กก.";

  const openManualModal = useCallback(() => {
    setManualModalOpen(true);
    setManualForm({
      loggedAtDate: todayISO(),
      loggedAtTime: "12:00",
      employeeCode: "",
      employeeName: "",
      employeeDepartment: "",
      employeeBranch: "",
      employeeCheckIn: "",
      employeeCheckOut: "",
      productBarcode: "",
      inputValue: "",
      countValue: "1",
      remark: "",
    });
    setEmployeeLookupError("");
    setManualFormError("");
  }, []);

  const closeManualModal = useCallback(() => {
    setManualModalOpen(false);
  }, []);

  const handleManualEmployeeLookup = useCallback(async () => {
    const code = String(manualForm.employeeCode || "").trim();
    if (!code) {
      setEmployeeLookupError("กรุณาระบุรหัสพนักงาน");
      return;
    }

    setEmployeeLookupLoading(true);
    setEmployeeLookupError("");

    try {
      const result = await fetchPieceRateEmployeeLookup({
        employeeCode: code,
        date: manualForm.loggedAtDate,
      });

      if (!result.ok) {
        setEmployeeLookupError(result.error?.message || "ไม่พบข้อมูลพนักงาน");
        setManualForm((curr) => ({
          ...curr,
          employeeName: "",
          employeeDepartment: "",
          employeeBranch: "",
          employeeCheckIn: "",
          employeeCheckOut: "",
        }));
        return;
      }

      const emp = result.data?.data?.employee;
      if (!emp) {
        setEmployeeLookupError("ไม่พบข้อมูลพนักงานสำหรับรหัสนี้");
        setManualForm((curr) => ({
          ...curr,
          employeeName: "",
          employeeDepartment: "",
          employeeBranch: "",
          employeeCheckIn: "",
          employeeCheckOut: "",
        }));
      } else {
        setManualForm((curr) => ({
          ...curr,
          employeeName: emp.name || "-",
          employeeDepartment: emp.departmentName || "-",
          employeeBranch: emp.branch || "-",
          employeeCheckIn: emp.checkIn || "",
          employeeCheckOut: emp.checkOut || "",
        }));
      }
    } catch (err) {
      setEmployeeLookupError(err.message || "เกิดข้อผิดพลาดในการตรวจสอบพนักงาน");
    } finally {
      setEmployeeLookupLoading(false);
    }
  }, [manualForm.employeeCode, manualForm.loggedAtDate]);

  const handleSaveManual = useCallback(async () => {
    setManualFormError("");

    const code = String(manualForm.employeeCode || "").trim();
    if (!code) {
      setManualFormError("กรุณาระบุรหัสพนักงาน");
      return;
    }
    if (!manualForm.employeeName) {
      setManualFormError("กรุณาตรวจสอบข้อมูลพนักงานก่อนบันทึก");
      return;
    }
    const barcode = String(manualForm.productBarcode || "").trim();
    if (!barcode) {
      setManualFormError("กรุณาเลือกสินค้า");
      return;
    }
    const inputValue = Number(manualForm.inputValue);
    if (!Number.isFinite(inputValue) || inputValue <= 0) {
      setManualFormError("กรุณากรอกค่าน้ำหนักให้ถูกต้อง");
      return;
    }
    const countValue = Number(manualForm.countValue);
    if (!Number.isFinite(countValue) || countValue <= 0) {
      setManualFormError("กรุณากรอกจำนวนให้ถูกต้อง");
      return;
    }

    setSavingManual(true);

    try {
      const loggedAt = new Date(`${manualForm.loggedAtDate}T${manualForm.loggedAtTime}:00+07:00`).toISOString();

      const payload = {
        employeeCode: code,
        employeeName: manualForm.employeeName,
        employeeDepartment: manualForm.employeeDepartment,
        employeeBranch: manualForm.employeeBranch,
        employeeSnapshot: {
          name: manualForm.employeeName,
          departmentName: manualForm.employeeDepartment,
          branch: manualForm.employeeBranch,
          checkIn: manualForm.employeeCheckIn || null,
          checkOut: manualForm.employeeCheckOut || null,
        },
        productBarcode: barcode,
        inputValue,
        countValue,
        source: "manual",
        loggedAt,
        machineCode: "manual",
        metadata: {
          remark: manualForm.remark || "เครื่องชั่งขัดข้อง/บันทึกแมนวล",
        },
      };

      const result = await submitPieceRateLog(payload);

      if (!result.ok) {
        setManualFormError(result.error?.message || "ไม่สามารถบันทึกข้อมูลได้");
        return;
      }

      setManualModalOpen(false);
      void loadData(1, filters, viewMode);
    } catch (err) {
      setManualFormError(err.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSavingManual(false);
    }
  }, [manualForm, filters, viewMode, loadData]);

  
  const openEditModal = useCallback((row) => {
    if (row.docStatus !== "active") {
      setErrorMessage("สามารถออกเอกสารแก้ไขได้เฉพาะเอกสารที่สถานะใช้งานเท่านั้น");
      return;
    }

    setActionMenuRowId(null);
    setEditingRow(row);
    setEditForm({
      productBarcode: String(row.productBarcode ?? ""),
      inputValue: String(row.inputValue ?? ""),
      countValue: String(row.entryCountValue ?? row.countValue ?? 1),
      editReason: "",
    });
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingRow(null);
    setEditForm({
      productBarcode: "",
      inputValue: "",
      countValue: "",
      editReason: "",
    });
  }, []);

  const openCancelModal = useCallback((row) => {
    if (row.docStatus !== "active") {
      setErrorMessage("สามารถยกเลิกได้เฉพาะเอกสารที่สถานะใช้งานเท่านั้น");
      return;
    }

    setActionMenuRowId(null);
    setCancellingRow(row);
    setCancelReason("");
  }, []);

  const closeCancelModal = useCallback(() => {
    setCancellingRow(null);
    setCancelReason("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRow) return;
    if (saveEditLockRef.current) return;

    const productBarcode = String(editForm.productBarcode || "").trim();
    const inputValue = Number(editForm.inputValue);
    const countValue = Number(editForm.countValue);
    const reason = String(editForm.editReason || "").trim();
    if (!productBarcode) {
      setErrorMessage("กรุณาเลือกสินค้า");
      return;
    }
    if (!Number.isFinite(inputValue) || inputValue <= 0) {
      setErrorMessage("กรุณาระบุน้ำหนักหรือค่าที่กรอกให้ถูกต้อง");
      return;
    }
    if (!Number.isFinite(countValue) || countValue <= 0) {
      setErrorMessage("กรุณาระบุจำนวนให้ถูกต้อง");
      return;
    }
    if (!reason) {
      setErrorMessage("กรุณาระบุเหตุผลการแก้ไข");
      return;
    }

    saveEditLockRef.current = true;
    setSavingEdit(true);
    try {
      const result = await updatePieceRateReportItem(editingRow.id, {
        productBarcode,
        inputValue,
        countValue,
        editReason: reason,
      });
      if (!result.ok) {
        setErrorMessage(result.error?.message || "ไม่สามารถออกเอกสารแก้ไขได้");
        return;
      }

      closeEditModal();
      void loadData(pagination.page, filters, viewMode);
    } finally {
      setSavingEdit(false);
      saveEditLockRef.current = false;
    }
  }, [closeEditModal, editForm.countValue, editForm.editReason, editForm.inputValue, editForm.productBarcode, editingRow, filters, loadData, pagination.page, viewMode]);

  const handleCancelDocument = useCallback(async () => {
    if (!cancellingRow) return;
    if (saveCancelLockRef.current) return;

    const reason = String(cancelReason || "").trim();
    if (!reason) {
      setErrorMessage("กรุณาระบุเหตุผลการยกเลิกเอกสาร");
      return;
    }

    saveCancelLockRef.current = true;
    setSavingCancel(true);
    try {
      const result = await cancelPieceRateReportItem(cancellingRow.id, {
        cancelReason: reason,
      });
      if (!result.ok) {
        setErrorMessage(result.error?.message || "ไม่สามารถยกเลิกเอกสารได้");
        return;
      }

      closeCancelModal();
      void loadData(pagination.page, filters, viewMode);
    } finally {
      setSavingCancel(false);
      saveCancelLockRef.current = false;
    }
  }, [cancelReason, cancellingRow, closeCancelModal, filters, loadData, pagination.page, viewMode]);

  const closeGroupDocumentsModal = useCallback(() => {
    setGroupDocumentsRow(null);
    setGroupDocumentsData([]);
    setGroupDocumentsSummary(EMPTY_SUMMARY);
    setGroupDocumentsError("");
    setGroupDocumentsLoading(false);
  }, []);

  const openGroupDocumentsModal = useCallback(async (row) => {
    setGroupDocumentsRow(row);
    setGroupDocumentsData([]);
    setGroupDocumentsSummary(EMPTY_SUMMARY);
    setGroupDocumentsError("");
    setGroupDocumentsLoading(true);

    const result = await fetchPieceRateGroupDocuments({
      day: row.groupDayKey,
      employeeCode: row.employeeCode,
      productKey: row.groupProductKey,
      hideCancelled: filters.hideCancelled,
      hideReplaced: filters.hideReplaced,
    });

    setGroupDocumentsLoading(false);

    if (!result.ok) {
      setGroupDocumentsError(result.error?.message || "ไม่สามารถโหลดรายละเอียดเอกสารได้");
      return;
    }

    const payload = result.data?.data || {};
    setGroupDocumentsData(Array.isArray(payload.data) ? payload.data : []);
    setGroupDocumentsSummary(payload.summary || EMPTY_SUMMARY);
  }, [filters.hideCancelled, filters.hideReplaced]);

  const closeHistoryModal = useCallback(() => {
    setHistoryRow(null);
    setHistoryData([]);
    setHistoryError("");
    setHistoryLoading(false);
  }, []);

  const closeEmployeeSummaryModal = useCallback(() => {
    setEmployeeSummaryRow(null);
    setEmployeeSummaryData(null);
    setEmployeeSummaryError("");
    setEmployeeSummaryLoading(false);
  }, []);

  const selectedProductLabel = useMemo(() => {
    if (selectedProductKeysInput.length === 0) return "เลือกสินค้า";
    const labels = productOptions
      .filter((option) => selectedProductKeysInput.includes(option.value))
      .map((option) => option.label);
    return labels.length > 0 ? labels.join(", ") : `เลือกแล้ว ${selectedProductKeysInput.length} รายการ`;
  }, [productOptions, selectedProductKeysInput]);

  const employeeWorkTypeLabel = useMemo(() => {
    if (viewMode !== "employee") return "-";

    const uniqueWorkTypes = Array.from(new Set(
      rows
        .map((row) => String(row?.workTypeName || "").trim())
        .filter(Boolean)
    ));

    if (uniqueWorkTypes.length === 0) return "-";
    if (uniqueWorkTypes.length === 1) return uniqueWorkTypes[0];
    if (uniqueWorkTypes.length <= 3) return uniqueWorkTypes.join(", ");

    return `${uniqueWorkTypes.slice(0, 3).join(", ")} และอีก ${uniqueWorkTypes.length - 3} ประเภท`;
  }, [rows, viewMode]);

  const openEmployeeSummaryModal = useCallback(async (row) => {
    setEmployeeSummaryRow(row);
    setEmployeeSummaryData(null);
    setEmployeeSummaryError("");
    setEmployeeSummaryLoading(true);

    const result = await fetchPieceRateEmployeeSummary({
      employeeCode: row.employeeCode,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      hideCancelled: filters.hideCancelled,
      hideReplaced: filters.hideReplaced,
    });

    setEmployeeSummaryLoading(false);

    if (!result.ok) {
      setEmployeeSummaryError(result.error?.message || "ไม่สามารถโหลดสรุปรายละเอียดพนักงานได้");
      return;
    }

    setEmployeeSummaryData(result.data?.data || null);
  }, [filters.dateFrom, filters.dateTo, filters.hideCancelled, filters.hideReplaced]);

  const openHistoryModal = useCallback(async (row) => {
    setActionMenuRowId(null);
    setHistoryRow(row);
    setHistoryData([]);
    setHistoryError("");
    setHistoryLoading(true);

    const result = await fetchPieceRateReportRevisions(row.id);
    setHistoryLoading(false);

    if (!result.ok) {
      setHistoryError(result.error?.message || "ไม่สามารถโหลดประวัติเอกสารได้");
      return;
    }

    const payload = result.data?.data || {};
    setHistoryData(Array.isArray(payload.data) ? payload.data : []);
  }, []);

  const desktopRows = useMemo(() => {
    const baseRows = rows.map((row) => {
      const status = getDocStatusConfig(row.docStatus);
      return {
        ...row,
        rowKind: "data",
        mergedCount: getMergedCount(row),
        status,
      };
    });

    if (viewMode !== "grouped") {
      return baseRows;
    }

    const sortedRows = [...baseRows].sort((left, right) => {
      const leftDay = String(left.groupDayKey || left.loggedAt || "").slice(0, 10);
      const rightDay = String(right.groupDayKey || right.loggedAt || "").slice(0, 10);
      const dayCompare = leftDay.localeCompare(rightDay);
      if (dayCompare !== 0) return dayCompare;

      const productCompare = String(left.productName || "").localeCompare(String(right.productName || ""), "th-TH");
      if (productCompare !== 0) return productCompare;

      const productCodeCompare = String(left.productCode || left.productSkuCode || "").localeCompare(
        String(right.productCode || right.productSkuCode || ""),
        "th-TH"
      );
      if (productCodeCompare !== 0) return productCodeCompare;

      const employeeCompare = String(left.employeeName || "").localeCompare(String(right.employeeName || ""), "th-TH");
      if (employeeCompare !== 0) return employeeCompare;

      const leftTime = Date.parse(left.loggedAt || "") || 0;
      const rightTime = Date.parse(right.loggedAt || "") || 0;
      return rightTime - leftTime;
    });

    const displayRows = [];

    sortedRows.forEach((row) => {
      displayRows.push(row);

      if (!row.isGroupedProductTail) {
        return;
      }

      const currentDay = String(row.groupDayKey || row.loggedAt || "").slice(0, 10);
      const currentProductKey = `${row.productCode || row.productSkuCode || "-"}::${row.productName || "-"}`;

      displayRows.push({
        ...row,
        id: `subtotal:${currentDay}:${currentProductKey}`,
        rowKind: "subtotal",
        dayKey: currentDay,
        productCode: row.productCode || row.productSkuCode || "-",
        productName: row.productName || "-",
        employeeCode: "",
        employeeName: "",
        employeeDepartment: "",
        operatorUsername: "",
        machineCode: "",
        docNo: "",
        mergedCount: 0,
        inputValue: Number(row.groupSubtotalNormalizedKgAmount || 0),
        inputUnitLabel: "kg",
        countValue: Number(row.groupSubtotalCountValue || 0),
        normalizedKgAmount: Number(row.groupSubtotalNormalizedKgAmount || 0),
        wageAmount: Number(row.groupSubtotalWageAmount || 0),
      });

    });

    return displayRows;
  }, [rows, viewMode]);

  const handleExportExcel = useCallback(async () => {
    if (exportingExcel) return;

    setExportingExcel(true);
    setErrorMessage("");

    try {
      const { blob, filename } = await downloadPieceRateReportExcel({
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        hideCancelled: filters.hideCancelled,
        hideReplaced: filters.hideReplaced,
        productKeys: filters.productKeys,
        viewMode,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setErrorMessage(error?.message || "ไม่สามารถส่งออก Excel ได้");
    } finally {
      setExportingExcel(false);
    }
  }, [exportingExcel, filters.dateFrom, filters.dateTo, filters.hideCancelled, filters.hideReplaced, filters.productKeys, filters.search, viewMode]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("PieceRateImportTemplate");

      sheet.columns = [
        { header: "วันเวลาบันทึก (ค.ศ. เท่านั้น รูปแบบ YYYY-MM-DD HH:mm:ss)", key: "loggedAt", width: 45 },
        { header: "รหัสพนักงาน", key: "employeeCode", width: 15 },
        { header: "บาร์โค้ดสินค้า", key: "productBarcode", width: 20 },
        { header: "น้ำหนัก / ปริมาณ", key: "inputValue", width: 15 },
        { header: "จำนวนชิ้น (default = 1)", key: "countValue", width: 22 },
        { header: "รหัสเครื่องชั่ง", key: "machineCode", width: 15 },
        { header: "เลขที่เอกสาร (ว่างไว้ให้ระบบรัน)", key: "docNo", width: 25 },
        { header: "Lot No (ว่างไว้ให้ระบบคำนวณ)", key: "lotNo", width: 25 }
      ];

      // Add sample rows
      sheet.addRow({
        loggedAt: "2026-08-05 14:30:00",
        employeeCode: "EMP-0001",
        productBarcode: "WKB-0002",
        inputValue: 15.5,
        countValue: 1,
        machineCode: "MC01",
        docNo: "",
        lotNo: ""
      });

      sheet.addRow({
        loggedAt: "2026-08-05 15:45:00",
        employeeCode: "EMP-0002",
        productBarcode: "WKB-0002",
        inputValue: 12.35,
        countValue: 1,
        machineCode: "MC01",
        docNo: "",
        lotNo: ""
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kpf-piece-rate-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setImportError("ไม่สามารถสร้างเทมเพลต Excel ได้: " + (err?.message || err));
    }
  }, []);

  const handleImportFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingExcelFile(true);
    setImportError("");
    setImportSuccessMsg("");
    setImportResults(null);
    setPreviewRows([]);

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        throw new Error("ไม่พบหน้างานในไฟล์ Excel");
      }

      const parsed = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        // Parse cells correctly
        const loggedAtRaw = row.getCell(1).value;
        let loggedAtVal = "";
        if (loggedAtRaw instanceof Date) {
          const pad = (num) => String(num).padStart(2, "0");
          const year = loggedAtRaw.getUTCFullYear();
          const month = pad(loggedAtRaw.getUTCMonth() + 1);
          const date = pad(loggedAtRaw.getUTCDate());
          const hours = pad(loggedAtRaw.getUTCHours());
          const minutes = pad(loggedAtRaw.getUTCMinutes());
          const seconds = pad(loggedAtRaw.getUTCSeconds());
          loggedAtVal = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
        } else {
          loggedAtVal = row.getCell(1).text || String(loggedAtRaw || "");
        }

        const employeeCodeVal = row.getCell(2).text || String(row.getCell(2).value || "");
        const productBarcodeVal = row.getCell(3).text || String(row.getCell(3).value || "");
        const inputValueVal = row.getCell(4).value;
        const countValueVal = row.getCell(5).value;
        const machineCodeVal = row.getCell(6).text || String(row.getCell(6).value || "");
        const docNoVal = row.getCell(7).text || String(row.getCell(7).value || "");
        const lotNoVal = row.getCell(8).text || String(row.getCell(8).value || "");

        // Skip empty rows
        if (!loggedAtVal.trim() && !employeeCodeVal.trim() && !productBarcodeVal.trim()) {
          return;
        }

        parsed.push({
          loggedAt: loggedAtVal.trim(),
          employeeCode: employeeCodeVal.trim(),
          productBarcode: productBarcodeVal.trim(),
          inputValue: Number(inputValueVal ?? 0),
          countValue: Number(countValueVal ?? 1),
          machineCode: machineCodeVal.trim(),
          docNo: docNoVal.trim() || undefined,
          lotNo: lotNoVal.trim() || undefined,
          rowNum: rowNumber,
        });
      });

      if (parsed.length === 0) {
        throw new Error("ไม่พบข้อมูลสำหรับการนำเข้าในไฟล์ Excel");
      }

      // Pre-validate rows
      const validated = parsed.map((item) => {
        const errors = [];
        if (!item.loggedAt || isNaN(Date.parse(item.loggedAt))) {
          errors.push("วันเวลาบันทึกไม่ถูกต้อง (ควรเป็น YYYY-MM-DD HH:mm:ss)");
        }
        if (!item.employeeCode) {
          errors.push("รหัสพนักงานห้ามว่าง");
        }
        if (!item.productBarcode) {
          errors.push("บาร์โค้ดสินค้าห้ามว่าง");
        }
        if (isNaN(item.inputValue) || item.inputValue <= 0) {
          errors.push("น้ำหนัก/ปริมาณ ต้องเป็นตัวเลขมากกว่า 0");
        }
        if (!item.machineCode) {
          errors.push("รหัสเครื่องชั่งห้ามว่าง");
        }
        return {
          ...item,
          errors,
          isValid: errors.length === 0,
        };
      });

      setPreviewRows(validated);
    } catch (error) {
      setImportError(error?.message || "ไม่สามารถอ่านไฟล์ Excel ได้");
    } finally {
      setImportingExcelFile(false);
      e.target.value = "";
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (isSubmittingImport || previewRows.length === 0) return;

    const invalidRowsCount = previewRows.filter((r) => !r.isValid).length;
    if (invalidRowsCount > 0) {
      setImportError(`พบข้อมูลไม่ถูกต้องจำนวน ${invalidRowsCount} รายการ กรุณาแก้ไขก่อนนำเข้า`);
      return;
    }

    setIsSubmittingImport(true);
    setImportError("");
    setImportResults(null);

    try {
      const payload = {
        items: previewRows.map((row) => ({
          loggedAt: row.loggedAt,
          employeeCode: row.employeeCode,
          productBarcode: row.productBarcode,
          inputValue: row.inputValue,
          countValue: row.countValue,
          machineCode: row.machineCode,
          docNo: row.docNo,
          lotNo: row.lotNo,
          source: "import",
        })),
      };

      const res = await importPieceRateLogs(payload);
      if (res?.ok) {
        const apiRes = res.data || {};
        setImportResults({
          total: apiRes.total ?? 0,
          successCount: apiRes.successCount ?? 0,
          failureCount: apiRes.failureCount ?? 0,
          results: apiRes.results || [],
        });
        if ((apiRes.successCount ?? 0) > 0) {
          setImportSuccessMsg(`นำเข้าข้อมูลสำเร็จทั้งหมด ${apiRes.successCount} รายการ`);
        }
        if ((apiRes.failureCount ?? 0) > 0) {
          setImportError(`พบบันทึกผิดพลาดจำนวน ${apiRes.failureCount} รายการ`);
        }
        
        // Refresh table data
        loadData(1, filters, viewMode);
      } else {
        throw new Error(res?.error || "เกิดข้อผิดพลาดในการอัปโหลดข้อมูล");
      }
    } catch (error) {
      setImportError(error?.message || "ไม่สามารถเชื่อมต่อระบบเซิร์ฟเวอร์เพื่อนำเข้าได้");
    } finally {
      setIsSubmittingImport(false);
    }
  }, [isSubmittingImport, previewRows, filters, viewMode, loadData]);

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    setImportError("");
    setImportSuccessMsg("");
    setPreviewRows([]);
    setImportResults(null);
  }, []);

  const handlePrintTable = useCallback(async () => {
    if (typeof window === "undefined" || printingReport) return;

    const tableWrap = tableWrapRef.current;
    const tableElement = tableWrap?.querySelector("table");
    if (!tableElement) {
      setErrorMessage("ไม่พบตารางสำหรับพิมพ์");
      return;
    }

    const logoUrl = new URL("/brand/LOGO-KPF1.png", window.location.origin).href;
    const totalRecordsLabel = pagination.totalRecords.toLocaleString("th-TH");
    const dateRangeLabel = `${formatDateToDDMMYYYY(filters.dateFrom)} ถึง ${formatDateToDDMMYYYY(filters.dateTo)}`;
    const searchLabel = String(filters.search || "").trim() || "-";
    const isPortraitReport = false;
    const paperLabel = isPortraitReport ? "A4 แนวตั้ง" : "A4 แนวนอน";
    const printTitle = viewMode === "product"
      ? "รายงานสรุปผลิตภัณฑ์"
      : viewMode === "employee"
        ? "รายงานสรุปค่าแรง"
        : "รายงานสแกนคิดค่าแรง";
    const printColumnStyles = viewMode === "product"
      ? `
    .table-shell colgroup col:nth-child(1) { width: 6%; }
    .table-shell colgroup col:nth-child(2) { width: 12%; }
    .table-shell colgroup col:nth-child(3) { width: 10%; }
    .table-shell colgroup col:nth-child(4) { width: 10%; }
    .table-shell colgroup col:nth-child(5) { width: 38%; }
    .table-shell colgroup col:nth-child(6) { width: 11%; }
    .table-shell colgroup col:nth-child(7) { width: 13%; }
      `
    : viewMode === "employee"
      ? (capabilities.canViewMoney
        ? `
    .table-shell colgroup col:nth-child(1) { width: 8%; }
    .table-shell colgroup col:nth-child(2) { width: 21%; }
    .table-shell colgroup col:nth-child(3) { width: 9%; }
    .table-shell colgroup col:nth-child(4) { width: 9%; }
    .table-shell colgroup col:nth-child(5) { width: 8%; }
    .table-shell colgroup col:nth-child(6) { width: 11%; }
    .table-shell colgroup col:nth-child(7) { width: 10%; }
    .table-shell colgroup col:nth-child(8) { width: 10%; }
    .table-shell colgroup col:nth-child(9) { width: 10%; }
    .table-shell colgroup col:nth-child(10) { width: 4%; }
        `
        : `
    .table-shell colgroup col:nth-child(1) { width: 9%; }
    .table-shell colgroup col:nth-child(2) { width: 23%; }
    .table-shell colgroup col:nth-child(3) { width: 10%; }
    .table-shell colgroup col:nth-child(4) { width: 10%; }
    .table-shell colgroup col:nth-child(5) { width: 9%; }
    .table-shell colgroup col:nth-child(6) { width: 12%; }
    .table-shell colgroup col:nth-child(7) { width: 11%; }
    .table-shell colgroup col:nth-child(8) { width: 12%; }
    .table-shell colgroup col:nth-child(9) { width: 4%; }
        `)
        : capabilities.canViewMoney
          ? `
    .table-shell colgroup col:nth-child(1) { width: 12%; }
    .table-shell colgroup col:nth-child(2) { width: 10%; }
    .table-shell colgroup col:nth-child(3) { width: 20%; }
    .table-shell colgroup col:nth-child(4) { width: 8%; }
    .table-shell colgroup col:nth-child(5) { width: 26%; }
    .table-shell colgroup col:nth-child(6) { width: 11%; }
    .table-shell colgroup col:nth-child(7) { width: 5%; }
    .table-shell colgroup col:nth-child(8) { width: 8%; }
      `
          : `
    .table-shell colgroup col:nth-child(1) { width: 13%; }
    .table-shell colgroup col:nth-child(2) { width: 11%; }
    .table-shell colgroup col:nth-child(3) { width: 23%; }
    .table-shell colgroup col:nth-child(4) { width: 9%; }
    .table-shell colgroup col:nth-child(5) { width: 30%; }
    .table-shell colgroup col:nth-child(6) { width: 9%; }
    .table-shell colgroup col:nth-child(7) { width: 5%; }
      `;
        const modeLabel = viewMode === "grouped"
      ? "รวมยอดรายวัน"
      : viewMode === "product"
        ? "สรุปรายสินค้า"
        : viewMode === "employee"
          ? "สรุปรายบุคคล"
          : "รายละเอียดสแกน";



    const employeeWorkTypePrintLabel = viewMode === "employee"
      ? ` | ประเภทงาน: ${employeeWorkTypeLabel}`
      : "";

    const printWindow = window.open("", "_blank", "width=1400,height=900");
    if (!printWindow) {
      setErrorMessage("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้");
      return;
    }

    const checkClosedInterval = setInterval(() => {
      if (!printWindow || printWindow.closed) {
        setPrintingReport(false);
        clearInterval(checkClosedInterval);
      }
    }, 1000);

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8" /><title>${escapeHtml(printTitle)}</title></head><body style="font-family: Sarabun, sans-serif; padding: 24px;">Preparing print document...</body></html>`);
    printWindow.document.close();

    setPrintingReport(true);
    setErrorMessage("");

    let documentNo = null;
    let printCountLabel = "1/0";
    let printedAt = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

    try {
      const printIssueResult = await issuePieceRateReportPrintDocument({
        requestId: window.crypto?.randomUUID?.() || `${Date.now()}`,
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        hideCancelled: filters.hideCancelled,
        hideReplaced: filters.hideReplaced,
        productKeys: filters.productKeys,
        viewMode,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      if (!printIssueResult.ok) {
        throw new Error(printIssueResult.error?.message || "Unable to issue a print document number");
      }

      const issuedDocument = printIssueResult.data?.data?.document || null;
      documentNo = issuedDocument?.docNo || null;
      printCountLabel = `${Math.max(1, Number(issuedDocument?.printCount || 1))}/${Math.max(0, Number(issuedDocument?.revisionNo || 0))}`;
      if (!documentNo) {
        throw new Error("Print document number was not returned");
      }

      if (issuedDocument?.issuedAt) {
        printedAt = new Date(issuedDocument.issuedAt).toLocaleString("th-TH", {
          dateStyle: "medium",
          timeStyle: "short",
        });
      }
    } catch (error) {
      printWindow.close();
      setErrorMessage(error?.message || "Unable to issue a print document number");
      setPrintingReport(false);
      return;
    }

    const notesMarkup = viewMode === "employee"
      ? `
    <section class="print-notes">
      <div class="print-notes-title">หมายเหตุ</div>
      <div>- กก.รวม: คนนี้ทำได้รวมทั้งหมดกี่กิโลในช่วงวันที่เลือก</div>
      <div>- กก./วัน: คนนี้ทำได้เฉลี่ยกี่กิโลต่อวัน</div>
      <div>- เฉลี่ยงาน: คนทั้งกลุ่มงานเดียวกันทำได้เฉลี่ยกี่กิโลต่อวัน</div>
      <div>- เทียบเฉลี่ย %: คนนี้ดีกว่าหรือต่ำกว่าค่าเฉลี่ยกี่เปอร์เซ็นต์</div>
    </section>
      `
      : "";

    // If there are multiple pages, fetch ALL rows and temporarily render them into the DOM
    // so we can clone a complete table. flushSync forces synchronous React re-render.
    // The browser won't repaint until this entire synchronous block finishes, so no visual flash.
    if (pagination.totalPages > 1) {
      const allDataResult = await fetchPieceRateReport({
        page: 1,
        printAll: true,
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        hideCancelled: filters.hideCancelled,
        hideReplaced: filters.hideReplaced,
        productKeys: filters.productKeys,
        viewMode,
      });

      if (allDataResult.ok) {
        const allPayload = allDataResult.data?.data || {};
        const allRows = Array.isArray(allPayload.data) ? allPayload.data : [];
        const allSummary = allPayload.summary || EMPTY_SUMMARY;
        const allPagination = allPayload.pagination || pagination;

        const savedRows = rows;
        const savedSummary = summary;
        const savedPagination = pagination;

        flushSync(() => {
          setRows(allRows);
          setSummary(allSummary);
          setPagination(allPagination);
        });

        // Clone now — DOM has all rows rendered
        const printTable = tableElement.cloneNode(true);

        // Restore state immediately; browser still hasn't repainted
        flushSync(() => {
          setRows(savedRows);
          setSummary(savedSummary);
          setPagination(savedPagination);
        });

        printTable.querySelectorAll(".print-piece-rate-hide-col, .piece-rate-no-print, col.piece-rate-action-col").forEach((element) => {
          element.remove();
        });
        const colgroupMarkup = printTable.querySelector("colgroup")?.outerHTML || "";
        const theadMarkup = printTable.querySelector("thead")?.outerHTML || "";
        const tbodyRows = Array.from(printTable.querySelectorAll("tbody > tr")).map((row, idx) => {
          if ((idx + 1) % 20 === 0 && idx < printTable.querySelectorAll("tbody > tr").length - 1) {
            row.classList.add("page-break-row");
          }
          return row.outerHTML;
        });
        const theadInnerHtml = theadMarkup.replace(/^<thead\b[^>]*>/i, "").replace(/<\/thead>$/i, "");
        const fullThead = `<thead>
          <tr><td class="report-header-cell" colspan="99">
            <div class="report-header">
              <div class="logo-wrap"><img src="${logoUrl}" alt="KPF Logo" /></div>
              <div class="head-main">
                <h1>${escapeHtml(printTitle)}</h1>
                <p>ช่วงวันที่: ${escapeHtml(dateRangeLabel)} | ค้นหา: ${escapeHtml(searchLabel)} | โหมด: ${escapeHtml(modeLabel)}${escapeHtml(employeeWorkTypePrintLabel)} | จำนวน: ${escapeHtml(totalRecordsLabel)}</p>
              </div>
              <div class="head-meta">
                <div class="meta-row"><span class="label">เลขที่เอกสาร</span><span class="value">${escapeHtml(documentNo)}</span></div>
                <div class="meta-row"><span class="label">ครั้งที่พิมพ์/แก้ไข</span><span class="value">${escapeHtml(printCountLabel)}</span></div>
                <div class="meta-row"><span class="label">พิมพ์เมื่อ</span><span class="value">${escapeHtml(printedAt)}</span></div>
              </div>
            </div>
          </td></tr>
          ${theadInnerHtml}
        </thead>`;
        const tableMarkup = `<div class="table-shell${viewMode === "employee" ? " employee-print" : ""}">
          <table>
            ${colgroupMarkup}
            ${fullThead}
            <tbody>${tbodyRows.join("")}</tbody>
          </table>
        </div>`;
        const printHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(printTitle)}</title>
  <style>
    @page { size: ${isPortraitReport ? "A4 portrait" : "A4 landscape"}; margin: 2mm; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: auto !important;
      overflow: visible !important;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: "Noto Sans Thai", "Sarabun", "Segoe UI", Tahoma, sans-serif; color: #000; }
    .sheet {
      width: 100%;
      height: auto !important;
      overflow: visible !important;
    }
    .report-header-cell {
      padding: 0 !important;
      border: none !important;
      background: #fff !important;
    }
    .report-header {
      display: grid;
      grid-template-columns: 75px 1fr 200px;
      gap: 6px;
      align-items: center;
      border: 1px solid #000;
      border-radius: 5px;
      padding: 3px 6px;
      margin-bottom: 2px;
    }
    .logo-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid #000;
      min-height: 40px;
      padding-right: 6px;
    }
    .logo-wrap img {
      width: 30px;
      height: auto;
      object-fit: contain;
    }
    .head-main h1 {
      margin: 0;
      font-size: 12px;
      color: #000;
      font-weight: 800;
    }
    .head-main p {
      margin: 1px 0 0;
      font-size: 8.5px;
      color: #000;
      line-height: 1.2;
    }
    .head-meta {
      border-left: 1px solid #000;
      padding-left: 8px;
      font-size: 8px;
      line-height: 1.25;
    }
    .head-meta .meta-row { display: flex; justify-content: space-between; gap: 8px; }
    .head-meta .label { color: #000; font-weight: 700; }
    .head-meta .value { color: #000; font-weight: 700; }
    .table-shell {
      border: 1px solid #000;
      height: auto !important;
      overflow: visible !important;
    }
    .print-notes {
      margin-top: 2mm;
      border: 1px dashed #94a3b8;
      background: #f8fafc;
      padding: 2mm 3mm;
      font-size: 8.5px;
      line-height: 1.35;
      color: #0f172a;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-notes-title {
      margin-bottom: 1.5mm;
      font-weight: 800;
    }
    .piece-rate-compare-positive {
      background: #dcfce7 !important;
      color: #166534 !important;
    }
    .piece-rate-compare-negative {
      background: #ffe4e6 !important;
      color: #be123c !important;
    }
    .piece-rate-compare-neutral {
      background: #f8fafc !important;
      color: #334155 !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .table-shell.employee-print table {
      table-layout: auto;
    }
    ${printColumnStyles}
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    thead th {
      background: #102C57 !important;
      color: #fff !important;
      border: 1px solid #000;
      font-weight: 700;
      font-size: 10.5px;
      text-transform: none;
      text-align: center;
      white-space: nowrap;
      letter-spacing: normal !important;
      overflow: visible;
      text-overflow: clip;
      word-break: break-word;
      padding: 3.0px 3px;
      line-height: 1.2;
      vertical-align: middle;
    }
    tbody td {
      border: 1px solid #000;
      font-size: 10.5px;
      padding: 3.0px 5px;
      line-height: 1.2;
      color: #000 !important;
      text-align: center;
      vertical-align: middle;
      white-space: normal;
      word-break: break-word;
      overflow: visible;
    }
    tbody td > div {
      line-height: inherit;
    }
    tbody td > div + div {
      margin-top: 2px;
    }
    tbody td.cell-left {
      text-align: left;
    }
    tbody td.cell-employee > div {
      white-space: nowrap !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }
    .table-shell.employee-print tbody td {
      font-size: 9px;
      white-space: nowrap;
      overflow: visible;
      text-overflow: clip;
      word-break: normal;
      padding: 3px 4px;
      line-height: 1.2;
    }
    tbody tr,
    tbody td,
    tbody th {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    tbody tr.piece-rate-row-replaced td {
      background: #e0f2fe !important;
      color: #075985 !important;
    }
    tbody tr.piece-rate-row-cancelled td {
      background: #ffe4e6 !important;
      color: #be123c !important;
      text-decoration: line-through;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6mm;
      margin-top: 3mm;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      border: 1px solid #000;
      border-radius: 3px;
      padding: 2.5mm;
      text-align: center;
    }
    .sig-title {
      font-weight: 700;
      font-size: 9.5px;
      margin-bottom: 1.5mm;
    }
    .sig-line {
      font-size: 8.5px;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      gap: 1mm;
    }
    .sig-date {
      font-size: 8.5px;
      margin-top: 1mm;
      display: block;
    }
    .report-footer-note {
      margin-top: 1.5mm;
      font-size: 7.5px;
      color: #000;
      text-align: right;
    }
    .piece-rate-revised-badge,
    .piece-rate-replaced-badge {
      display: inline-flex !important;
      align-items: center !important;
      border-radius: 9999px !important;
      border-width: 1px !important;
      border-style: solid !important;
      padding: 2px 8px !important;
      font-size: 8px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .piece-rate-revised-badge {
      background: #fef3c7 !important;
      border-color: #f59e0b !important;
      color: #92400e !important;
    }
    .piece-rate-replaced-badge {
      background: #e0f2fe !important;
      border-color: #38bdf8 !important;
      color: #075985 !important;
    }
    .print-piece-rate-hide-col {
      display: none !important;
    }
    @media print {
      html, body, .sheet, .table-shell {
        overflow: visible !important;
        height: auto !important;
      }
    }
    .page-break-row {
      page-break-after: always !important;
      break-after: page !important;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${tableMarkup}
    ${notesMarkup}
    <section class="signatures">
      <div class="sig-box">
        <div class="sig-title">ผู้จัดทำ</div>
        <div class="sig-line">ลงชื่อ ........................................<span class="sig-date">วันที่ ........../........../..........</span></div>
      </div>
      <div class="sig-box">
        <div class="sig-title">ผู้ตรวจสอบ</div>
        <div class="sig-line">ลงชื่อ ........................................<span class="sig-date">วันที่ ........../........../..........</span></div>
      </div>
      <div class="sig-box">
        <div class="sig-title">ผู้อนุมัติ</div>
        <div class="sig-line">ลงชื่อ ........................................<span class="sig-date">วันที่ ........../........../..........</span></div>
      </div>
    </section>
    <div class="report-footer-note">เอกสารรายงานฝ่ายผลิต KPF</div>
  </div>
</body>
</html>`;
        const printBlob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
        const printBlobUrl = URL.createObjectURL(printBlob);
        printWindow.location.replace(printBlobUrl);

        const runPrint = () => {
          printWindow.focus();
          printWindow.print();
        };

        printWindow.addEventListener("afterprint", () => {
          URL.revokeObjectURL(printBlobUrl);
          setPrintingReport(false);
          printWindow.close();
        }, { once: true });

        if (printWindow.document.readyState === "complete") {
          setTimeout(runPrint, 120);
        } else {
          printWindow.addEventListener("load", () => setTimeout(runPrint, 120), { once: true });
        }
        return;
      }
    }

    const printTable = tableElement.cloneNode(true);
    printTable.querySelectorAll(".print-piece-rate-hide-col, .piece-rate-no-print, col.piece-rate-action-col").forEach((element) => {
      element.remove();
    });
    const colgroupMarkup = printTable.querySelector("colgroup")?.outerHTML || "";
    const theadMarkup = printTable.querySelector("thead")?.outerHTML || "";
    const tbodyRows = Array.from(printTable.querySelectorAll("tbody > tr")).map((row, idx) => {
      if ((idx + 1) % 20 === 0 && idx < printTable.querySelectorAll("tbody > tr").length - 1) {
        row.classList.add("page-break-row");
      }
      return row.outerHTML;
    });
    const theadInnerHtml = theadMarkup.replace(/^<thead\b[^>]*>/i, "").replace(/<\/thead>$/i, "");
    const fullThead = `<thead>
      <tr><td class="report-header-cell" colspan="99">
        <div class="report-header">
          <div class="logo-wrap"><img src="${logoUrl}" alt="KPF Logo" /></div>
          <div class="head-main">
            <h1>${escapeHtml(printTitle)}</h1>
            <p>ช่วงวันที่: ${escapeHtml(dateRangeLabel)} | ค้นหา: ${escapeHtml(searchLabel)} | โหมด: ${escapeHtml(modeLabel)}${escapeHtml(employeeWorkTypePrintLabel)} | จำนวน: ${escapeHtml(totalRecordsLabel)}</p>
          </div>
          <div class="head-meta">
            <div class="meta-row"><span class="label">เลขที่เอกสาร</span><span class="value">${escapeHtml(documentNo)}</span></div>
            <div class="meta-row"><span class="label">ครั้งที่พิมพ์/แก้ไข</span><span class="value">${escapeHtml(printCountLabel)}</span></div>
            <div class="meta-row"><span class="label">พิมพ์เมื่อ</span><span class="value">${escapeHtml(printedAt)}</span></div>
          </div>
        </div>
      </td></tr>
      ${theadInnerHtml}
    </thead>`;
    const tableMarkup = `<div class="table-shell${viewMode === "employee" ? " employee-print" : ""}">
      <table>
        ${colgroupMarkup}
        ${fullThead}
        <tbody>${tbodyRows.join("")}</tbody>
      </table>
    </div>`;

    const printHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(printTitle)}</title>
  <style>
    @page { size: ${isPortraitReport ? "A4 portrait" : "A4 landscape"}; margin: 2mm; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: auto !important;
      overflow: visible !important;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: "Noto Sans Thai", "Sarabun", "Segoe UI", Tahoma, sans-serif; color: #000; }
    .sheet {
      width: 100%;
      height: auto !important;
      overflow: visible !important;
    }
    .report-header-cell {
      padding: 0 !important;
      border: none !important;
      background: #fff !important;
    }
    .report-header {
      display: grid;
      grid-template-columns: 75px 1fr 200px;
      gap: 6px;
      align-items: center;
      border: 1px solid #000;
      border-radius: 5px;
      padding: 3px 6px;
      margin-bottom: 2px;
    }
    .logo-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid #000;
      min-height: 40px;
      padding-right: 6px;
    }
    .logo-wrap img {
      width: 30px;
      height: auto;
      object-fit: contain;
    }
    .head-main h1 {
      margin: 0;
      font-size: 12px;
      color: #000;
      font-weight: 800;
    }
    .head-main p {
      margin: 1px 0 0;
      font-size: 8.5px;
      color: #000;
      line-height: 1.2;
    }
    .head-meta {
      border-left: 1px solid #000;
      padding-left: 8px;
      font-size: 8px;
      line-height: 1.25;
    }
    .head-meta .meta-row { display: flex; justify-content: space-between; gap: 8px; }
    .head-meta .label { color: #000; font-weight: 700; }
    .head-meta .value { color: #000; font-weight: 700; }
    .table-shell {
      border: 1px solid #000;
      height: auto !important;
      overflow: visible !important;
    }
    .print-notes {
      margin-top: 2mm;
      border: 1px dashed #94a3b8;
      background: #f8fafc;
      padding: 2mm 3mm;
      font-size: 8.5px;
      line-height: 1.35;
      color: #0f172a;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-notes-title {
      margin-bottom: 1.5mm;
      font-weight: 800;
    }
    .piece-rate-compare-positive {
      background: #dcfce7 !important;
      color: #166534 !important;
    }
    .piece-rate-compare-negative {
      background: #ffe4e6 !important;
      color: #be123c !important;
    }
    .piece-rate-compare-neutral {
      background: #f8fafc !important;
      color: #334155 !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .table-shell.employee-print table {
      table-layout: auto;
    }
    ${printColumnStyles}
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    thead th {
      background: #102C57 !important;
      color: #fff !important;
      border: 1px solid #000;
      font-weight: 700;
      font-size: 10.5px;
      text-transform: none;
      text-align: center;
      white-space: nowrap;
      letter-spacing: normal !important;
      overflow: visible;
      text-overflow: clip;
      word-break: break-word;
      padding: 3.0px 3px;
      line-height: 1.2;
      vertical-align: middle;
    }
    tbody td {
      border: 1px solid #000;
      font-size: 10.5px;
      padding: 3.0px 5px;
      line-height: 1.2;
      color: #000 !important;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      word-break: break-word;
      vertical-align: middle;
      text-align: center;
    }
    tbody td > div {
      line-height: inherit;
    }
    tbody td > div + div {
      margin-top: 2px;
    }
    tbody td.cell-left {
      text-align: left;
    }
    .table-shell.employee-print thead th {
      font-size: 10px;
      white-space: nowrap;
      overflow: visible;
      text-overflow: clip;
      word-break: normal;
    }
    .table-shell.employee-print tbody td {
      font-size: 9px;
      white-space: nowrap;
      overflow: visible;
      text-overflow: clip;
      word-break: normal;
      padding: 3px 4px;
      line-height: 1.2;
    }
    tbody tr,
    tbody td,
    tbody th {
      page-break-inside: avoid;
      break-inside: avoid-page;
    }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    tbody tr.piece-rate-row-replaced td {
      background: #fffbeb !important;
    }
    tbody tr.piece-rate-row-cancelled td {
      background: #fff1f2 !important;
    }
    .signatures {
      margin-top: 7mm;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10mm;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      border-top: 1.8px solid #0f172a;
      padding-top: 5mm;
      text-align: center;
      min-height: 28mm;
    }
    .sig-title {
      font-size: 10.5px;
      font-weight: 800;
      color: #000;
    }
    .sig-line {
      margin-top: 8mm;
      font-size: 9.5px;
      color: #000;
      line-height: 1.4;
    }
    .sig-date {
      display: block;
      margin-top: 3mm;
    }
    .report-footer-note {
      margin-top: 1.5mm;
      font-size: 7.5px;
      color: #000;
      text-align: right;
    }
    .piece-rate-revised-badge,
    .piece-rate-replaced-badge {
      display: inline-flex !important;
      align-items: center !important;
      border-radius: 9999px !important;
      border-width: 1px !important;
      border-style: solid !important;
      padding: 2px 8px !important;
      font-size: 8px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .piece-rate-revised-badge {
      background: #fef3c7 !important;
      border-color: #f59e0b !important;
      color: #92400e !important;
    }
    .piece-rate-replaced-badge {
      background: #e0f2fe !important;
      border-color: #38bdf8 !important;
      color: #075985 !important;
    }
    .print-piece-rate-hide-col {
      display: none !important;
    }
    @media print {
      html, body, .sheet, .table-shell {
        overflow: visible !important;
        height: auto !important;
      }
    }
    .page-break-row {
      page-break-after: always !important;
      break-after: page !important;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${tableMarkup}
    ${notesMarkup}
    <section class="signatures">
      <div class="sig-box">
        <div class="sig-title">ผู้จัดทำ</div>
        <div class="sig-line">ลงชื่อ ........................................<span class="sig-date">วันที่ ........../........../..........</span></div>
      </div>
      <div class="sig-box">
        <div class="sig-title">ผู้ตรวจสอบ</div>
        <div class="sig-line">ลงชื่อ ........................................<span class="sig-date">วันที่ ........../........../..........</span></div>
      </div>
      <div class="sig-box">
        <div class="sig-title">ผู้อนุมัติ</div>
        <div class="sig-line">ลงชื่อ ........................................<span class="sig-date">วันที่ ........../........../..........</span></div>
      </div>
    </section>
    <div class="report-footer-note">เอกสารรายงานฝ่ายผลิต KPF</div>
  </div>
</body>
</html>`;
    const printBlob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
    const printBlobUrl = URL.createObjectURL(printBlob);
    printWindow.location.replace(printBlobUrl);

    const runPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    printWindow.addEventListener("afterprint", () => {
      URL.revokeObjectURL(printBlobUrl);
      setPrintingReport(false);
      printWindow.close();
    }, { once: true });

    if (printWindow.document.readyState === "complete") {
      setTimeout(runPrint, 120);
    } else {
      printWindow.addEventListener("load", () => setTimeout(runPrint, 120), { once: true });
    }
  }, [
    capabilities.canViewMoney,
    filters.dateFrom,
    filters.dateTo,
    filters.hideCancelled,
    filters.hideReplaced,
    filters.productKeys,
    filters.search,
    employeeWorkTypeLabel,
    pagination,
    printingReport,
    rows,
    summary,
    viewMode,
  ]);

  return (
    <div className="piece-rate-report-page flex min-h-screen flex-col bg-[#f8f9fa] font-sans text-slate-900">

      <div className="piece-rate-topbar z-40 shrink-0 bg-gradient-to-r from-[#102C57] to-[#0f172a] text-white shadow-xl">
        <div className="mx-auto max-w-[95%] py-4">
          <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h6 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">Production Line</h6>
                <span className="rounded-full bg-[#d4af37] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#102C57]">
                  {summaryLabel}
                </span>
              </div>
              <h1 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl md:text-2xl">
                <BarChart3 size={24} className="text-[#d4af37]" />
                <span className="min-w-0 leading-tight text-balance">รายงานสแกนคิดค่าแรง</span>
              </h1>
            </div>

            <div className="hidden rounded-lg bg-black/20 p-1 sm:flex">
              <Link
                href="/production-line/attendance"
                className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:bg-white/5 hover:text-white"
              >
                <LayoutGrid size={14} />
                ลงเวลาบันทึกงาน
              </Link>
              <Link
                href="/production-line/attendance/report/piece-rate"
                className="flex items-center gap-1.5 rounded-md bg-[#d4af37] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#102C57] shadow-sm"
              >
                <BarChart3 size={14} />
                รายงานคิดค่าแรง
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col px-4 py-6 md:px-6">
        <section className="piece-rate-print-sheet w-full rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-4">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_auto]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && runSearch()}
                  placeholder="ค้นหาเอกสาร / พนักงาน / สินค้า / แบรนด์"
                  className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="relative">
                <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateFromInput}
                  onChange={(event) => setDateFromInput(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="relative">
                <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateToInput}
                  onChange={(event) => setDateToInput(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={runSearch}
                  className="h-9 rounded-md bg-[#102C57] px-4 text-xs font-bold text-white"
                >
                  ค้นหา
                </button>
                <button
                  type="button"
                  onClick={runReset}
                  className="h-9 rounded-md border border-slate-200 px-4 text-xs font-bold text-slate-700"
                >
                  ล้างค่า
                </button>
                <Link
                  href="/production-line/attendance/piece-rate-scan"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft size={14} />
                  หน้าสแกน
                </Link>
                {capabilities.canEdit && username === "apexechelon" && (
                  <button
                    type="button"
                    onClick={openManualModal}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#102C57] px-3 text-xs font-semibold text-white hover:bg-[#102C57]/90 transition"
                  >
                    <Plus size={14} />
                    บันทึกแมนวลย้อนหลัง
                  </button>
                )}
                {capabilities.canEdit && username === "apexechelon" && (
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                  >
                    <Download size={14} className="rotate-180" />
                    นำเข้า Excel
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrintTable}
                  disabled={printingReport}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#102C57] text-[#102C57] hover:bg-[#102C57] hover:text-white disabled:cursor-wait disabled:opacity-60"
                  title={viewMode === "product" ? "พิมพ์รายงาน A4 แนวตั้ง" : "พิมพ์รายงาน A4 แนวนอน"}
                  aria-label={viewMode === "product" ? "พิมพ์รายงาน A4 แนวตั้ง" : "พิมพ์รายงาน A4 แนวนอน"}
                >
                  <Printer size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exportingExcel}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                >
                  <Download size={14} />
                  {exportingExcel ? "กำลังส่งออก..." : "Excel"}
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <MetricPill label="น้ำหนักรวม (กก.)" value={summary.totalKg || "0.00"} />
                <MetricPill label="รวมจำนวน" value={summary.totalCount || "0.00"} />
                {capabilities.canViewMoney ? <MetricPill label="รวมค่าแรง" value={summary.totalWage || "0.00"} /> : null}
                {viewMode === "employee" ? <MetricPill label="รวมพนักงาน" value={summary.totalEmployees || "0"} /> : null}
                {viewMode === "employee" ? <MetricPill label="รวมวันทำงาน" value={summary.totalWorkDays || "0"} /> : null}
                {viewMode === "employee" ? <MetricPill label="รวมเอกสาร" value={summary.totalDocuments || "0"} /> : null}
                {viewMode === "product" ? <MetricPill label="รวมรายการสินค้า-วัน" value={summary.totalProducts || "0"} /> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <ModeButton active={viewMode === "grouped"} onClick={() => handleViewModeChange("grouped")}>
                  รวมยอดรายวัน
                </ModeButton>
                <ModeButton active={viewMode === "product"} onClick={() => handleViewModeChange("product")}>
                  สรุปผลิตภัณฑ์
                </ModeButton>
                <ModeButton active={viewMode === "employee"} onClick={() => handleViewModeChange("employee")}>
                  สรุปค่าแรง
                </ModeButton>
                <ModeButton active={viewMode === "detail"} onClick={() => handleViewModeChange("detail")}>
                  ทุกรายการ
                </ModeButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={hideCancelledInput}
                  onChange={(event) => handleToggleHideCancelled(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                ซ่อนเอกสารยกเลิก
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={hideReplacedInput}
                  onChange={(event) => handleToggleHideReplaced(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                ซ่อนเอกสารแก้ไข
              </label>
              {viewMode === "product" ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProductDropdownOpen((current) => !current)}
                    className="inline-flex min-w-[240px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                  >
                    <span className="truncate">{selectedProductLabel}</span>
                    <ChevronDown size={14} className={`transition-transform ${productDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {productDropdownOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-2 w-[320px] rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                      <div className="mb-2 px-2 text-[11px] text-slate-500">เลือกสินค้าได้สูงสุด 2 รายการ</div>
                      {productOptionsLoading ? (
                        <div className="px-2 py-3 text-xs text-slate-500">กำลังโหลดสินค้า...</div>
                      ) : productOptionsError ? (
                        <div className="px-2 py-3 text-xs text-rose-600">{productOptionsError}</div>
                      ) : productOptions.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-slate-500">ไม่พบสินค้าในช่วงวันที่ที่เลือก</div>
                      ) : (
                        <div className="max-h-64 space-y-1 overflow-auto">
                          {productOptions.map((option) => {
                            const checked = selectedProductKeysInput.includes(option.value);
                            const disabled = !checked && selectedProductKeysInput.length >= 2;
                            return (
                              <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-xs ${disabled ? "opacity-50" : "hover:bg-slate-50"}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => handleToggleProductSelection(option.value)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold text-slate-800">{option.label}</span>
                                  <span className="block text-slate-500">{option.goodsCode}{option.skuCode ? ` | SKU ${option.skuCode}` : ""}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {errorMessage ? (
            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {errorMessage}
            </div>
          ) : null}

          <div className="p-3 pt-0 md:p-4 md:pt-0">
            <div className="mt-4 border-b border-slate-200 pb-4 hidden">
              {viewMode === "employee" ? (
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">ประเภทงาน:</span> {employeeWorkTypeLabel}
                </div>
              ) : null}
              <div className="grid gap-3">
                {isLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    กำลังโหลดข้อมูล...
                  </div>
                ) : rows.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    ไม่พบข้อมูลในช่วงที่เลือก
                  </div>
                ) : viewMode === "product" ? (
                  <>
                    {rows.map((row, index) => (
                      <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-[#102C57]">ลำดับ {((pagination.page - 1) * pagination.pageSize) + index + 1}</p>
                            <h3 className="mt-1 text-sm font-semibold text-slate-900">{row.productName || "-"}</h3>
                            <p className="mt-1 text-xs text-slate-500">{row.dayKey || "-"} • {row.productCode || row.productSkuCode || "-"}</p>
                          </div>
                        </div>

                        <dl className="mt-3 grid grid-cols-[104px_1fr] gap-x-2 gap-y-1 text-xs">
                          <dt className="text-slate-500">จำนวนรวม</dt>
                          <dd className="text-right font-semibold tabular-nums">{formatNumber(row.countValue, 0)}</dd>
                          <dt className="text-slate-500">น้ำหนักรวม</dt>
                          <dd className="text-right font-semibold tabular-nums">{formatNumber(row.normalizedKgAmount, 3)} กก.</dd>
                        </dl>
                      </article>
                    ))}
                    {rows.length > 0 ? (
                      <article className="rounded-lg border border-slate-300 bg-slate-50 p-3 shadow-sm">
                        <div className="text-sm font-semibold text-slate-900">รวมทั้งหมด</div>
                        <dl className="mt-3 grid grid-cols-[104px_1fr] gap-x-2 gap-y-1 text-xs">
                          <dt className="text-slate-500">จำนวนรวม</dt>
                          <dd className="text-right font-semibold tabular-nums">{summary.totalCount || "0.00"}</dd>
                          <dt className="text-slate-500">น้ำหนักรวม</dt>
                          <dd className="text-right font-semibold tabular-nums">{summary.totalKg || "0.00"} กก.</dd>
                        </dl>
                      </article>
                    ) : null}
                  </>
                ) : viewMode === "employee" ? (
                  rows.map((row) => (
                    <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-xs font-semibold text-[#102C57]">{row.employeeCode || "-"}</p>
                          <h3 className="mt-1 text-sm font-semibold text-slate-900">{row.employeeName || "-"}</h3>
                          <p className="mt-1 text-xs text-slate-500">{row.employeeDepartment || "-"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEmployeeSummaryModal(row)}
                          className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-[#102C57] hover:bg-slate-200"
                        >
                          ดูรายละเอียด
                        </button>
                      </div>

                      <dl className="mt-3 grid grid-cols-[104px_1fr] gap-x-2 gap-y-1 text-xs">
                        <dt className="text-slate-500">จำนวนวันทำงาน</dt>
                        <dd className="text-right font-semibold tabular-nums">{formatNumber(row.workDayCount, 0)}</dd>
                        <dt className="text-slate-500">กก.รวม</dt>
                        <dd className="text-right font-semibold tabular-nums">{formatNumber(row.normalizedKgAmount, 3)}</dd>
                        <dt className="text-slate-500">กก./วัน</dt>
                        <dd className="text-right font-semibold tabular-nums">{formatNumber(row.kgPerDay, 2)}</dd>
                        <dt className="text-slate-500">เฉลี่ยงาน</dt>
                        <dd className="text-right font-semibold tabular-nums">{formatNumber(row.typeAverageKgPerDay, 2)}</dd>
                        <dt className="text-slate-500">เทียบเฉลี่ย %</dt>
                        <dd className={`rounded px-2 py-0.5 text-right font-semibold tabular-nums ${getComparisonCellClassName(row.vsTypeAveragePct)}`}>{formatSignedPercentage(row.vsTypeAveragePct, 2)}</dd>
                        {capabilities.canViewMoney ? (
                          <>
                            <dt className="text-slate-500">ค่าแรงรวม</dt>
                            <dd className="text-right font-semibold tabular-nums">{formatNumber(row.wageAmount, 2)}</dd>
                          </>
                        ) : null}
                      </dl>
                    </article>
                  ))
                ) : (
                  (() => {
                    let lastDate = null;
                    return rows.map((row) => {
                      const dateStr = viewMode === "grouped"
                        ? (row.groupDayKey || String(row.loggedAt || "").slice(0, 10))
                        : null;
                      const showSeparator = dateStr && dateStr !== lastDate;
                      if (showSeparator) {
                        lastDate = dateStr;
                      }
                      return (
                        <Fragment key={row.id}>
                          {showSeparator && (
                            <div className="piece-rate-no-print text-[#102C57] font-bold text-xs bg-slate-50 border-l-4 border-[#102C57] px-3 py-2 mt-4 mb-2 rounded-r-md shadow-sm flex items-center gap-1.5">
                              <CalendarDays size={14} className="text-[#102C57]" />
                              วันที่ {formatDateToDDMMYYYY(dateStr)}
                            </div>
                          )}
                          <MobileReportCard
                            row={row}
                            canViewMoney={capabilities.canViewMoney}
                            canEdit={detailCanEdit}
                            onEdit={openEditModal}
                            onCancel={openCancelModal}
                            isGroupedView={viewMode === "grouped"}
                            onOpenGroupDocuments={openGroupDocumentsModal}
                            onOpenHistory={openHistoryModal}
                          />
                        </Fragment>
                      );
                    });
                  })()
                )}
              </div>
            </div>

            {viewMode === "product" ? (
              <div className="mt-4 overflow-x-auto pb-4">
                <div className="mx-auto w-full max-w-[210mm] border border-slate-300 bg-white shadow-[0_18px_45px_rgba(2,6,23,0.08)]">
                  <div className="mb-3 flex items-start justify-between gap-4 border-b border-dashed border-slate-300 px-5 pb-3 pt-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-14 w-14 items-center justify-center">
                        <Image
                          src="/brand/LOGO-KPF1.png"
                          alt="KPF Logo"
                          width={56}
                          height={56}
                          className="h-14 w-14 object-contain"
                        />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">รายงานสรุปผลิตภัณฑ์</h3>
                        <p className="mt-1 text-[11px] text-slate-500">
                          ช่วงวันที่ {formatDateToDDMMYYYY(filters.dateFrom)} ถึง {formatDateToDDMMYYYY(filters.dateTo)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[11px] text-slate-500">พิมพ์เมื่อ {new Date().toLocaleDateString("en-GB")}</p>
                      <p className="text-[11px] font-semibold text-slate-600">หน้า 1</p>
                    </div>
                  </div>
                  <div ref={tableWrapRef} className="overflow-hidden border border-slate-300 bg-white">
                    <table className="w-full table-fixed text-[12px] text-slate-900 text-center">
                      <colgroup>
                        <col className="w-[6%]" />
                        <col className="w-[12%]" />
                        <col className="w-[8%]" />
                        <col className="w-[10%]" />
                        <col className="w-[40%]" />
                        <col className="w-[11%]" />
                        <col className="w-[13%]" />
                      </colgroup>
                      <thead className="bg-[#102C57] text-[11px] uppercase tracking-[0.14em] text-white">
                        <tr>
                          <th className="border-r border-[#0f1c36] px-2.5 py-2 text-center leading-tight whitespace-nowrap">ลำดับ</th>
                          <th className="border-r border-[#0f1c36] px-2.5 py-2 text-center leading-tight whitespace-nowrap">วันที่</th>
                          <th className="border-r border-[#0f1c36] px-2.5 py-2 text-center leading-tight whitespace-nowrap">รหัสสินค้า</th>
                          <th className="border-r border-[#0f1c36] px-2.5 py-2 text-center leading-tight whitespace-nowrap">แบรนด์</th>
                          <th className="border-r border-[#0f1c36] px-2.5 py-2 text-center leading-tight whitespace-nowrap">ชื่อสินค้า</th>
                          <th className="border-r border-[#0f1c36] px-2.5 py-2 text-center leading-tight whitespace-nowrap">จำนวนรวม</th>
                          <th className="px-2.5 py-2 text-center leading-tight whitespace-nowrap">น้ำหนักรวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {isLoading ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                              กำลังโหลดข้อมูล...
                            </td>
                          </tr>
                        ) : rows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                              {"ไม่มีข้อมูลในช่วงที่เลือก"}
                            </td>
                          </tr>
                        ) : (
                          <>
                            {rows.map((row, index) => {
                              const dayLabel = row.dayKey ? formatDateToDDMMYYYY(row.dayKey) : "-";
                              return (
                                <tr key={row.id} className="hover:bg-slate-50">
                                  <td className="border-r border-slate-200 px-3 py-3 text-center font-mono text-[11px] font-semibold text-[#102C57]">
                                    <span className="block whitespace-nowrap">{((pagination.page - 1) * pagination.pageSize) + index + 1}</span>
                                  </td>
                                  <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold text-slate-900 whitespace-nowrap">
                                    {dayLabel}
                                  </td>
                                  <td className="border-r border-slate-200 px-2 py-3 text-center text-[10px] text-slate-500 whitespace-normal break-all leading-tight">
                                    {row.productCode || row.productSkuCode || "-"}
                                  </td>
                                  <td className="border-r border-slate-200 px-2 py-3 text-center text-[11px] whitespace-normal break-words leading-tight">
                                    {row.productBrandName || "-"}
                                  </td>
                                  <td className="cell-left border-r border-slate-200 px-2 py-3 font-semibold text-slate-900 whitespace-normal break-words leading-tight">
                                    {row.productName || "-"}
                                  </td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums">
                                  {formatNumber(row.countValue, 0)}
                                </td>
                                <td className="px-3 py-3 text-center font-semibold tabular-nums">
                                  {formatNumber(row.normalizedKgAmount, 3)}
                                </td>
                                </tr>
                              );
                            })}
                            <tr className="bg-[#e2e8f0] font-semibold">
                              <td className="border border-slate-200 px-3 py-3 text-center" colSpan={5}>
                                สรุปทั้งหมด
                              </td>
                              <td className="border border-slate-200 px-3 py-3 text-center tabular-nums">
                                {summary.totalCount || "0.00"}
                              </td>
                              <td className="border border-slate-200 px-3 py-3 text-center tabular-nums">
                                {summary.totalKg || "0.00"}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : viewMode === "employee" ? (
              <div className="mt-4 overflow-x-auto pb-4">
                <div className="mx-auto w-full max-w-[297mm] border border-slate-300 bg-white shadow-[0_18px_45px_rgba(2,6,23,0.08)]">
                  <div className="mb-3 flex items-start justify-between gap-4 border-b border-dashed border-slate-300 px-5 pb-3 pt-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-14 w-14 items-center justify-center">
                        <Image
                          src="/brand/LOGO-KPF1.png"
                          alt="KPF Logo"
                          width={56}
                          height={56}
                          className="h-14 w-14 object-contain"
                        />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{"\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e2a\u0e23\u0e38\u0e1b\u0e04\u0e48\u0e32\u0e41\u0e23\u0e07"}</h3>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {`\u0e0a\u0e48\u0e27\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 ${formatDateToDDMMYYYY(filters.dateFrom)} \u0e16\u0e36\u0e07 ${formatDateToDDMMYYYY(filters.dateTo)}`}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {`\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17\u0e07\u0e32\u0e19: ${employeeWorkTypeLabel}`}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[11px] text-slate-500">{`\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e40\u0e21\u0e37\u0e48\u0e2d ${new Date().toLocaleDateString("en-GB")}`}</p>
                      <p className="text-[11px] font-semibold text-slate-600">{"A4 \u0e41\u0e19\u0e27\u0e19\u0e2d\u0e19"}</p>
                    </div>
                  </div>
                    <div ref={tableWrapRef} className="overflow-x-auto border border-slate-300 bg-white">
                      <table className="w-full text-[12px] text-slate-900">
                        <colgroup>
                          <col className="w-[8%]" />
                          <col className="w-[24%]" />
                          <col className="w-[8%]" />
                          <col className="w-[8%]" />
                          <col className="w-[10%]" />
                          <col className="w-[9%]" />
                          <col className="w-[9%]" />
                          <col className="w-[10%]" />
                          {capabilities.canViewMoney ? <col className="w-[8%]" /> : null}
                          <col className="print-piece-rate-hide-col w-[6%]" />
                        </colgroup>
                      <thead className="bg-[#102C57] text-[11px] uppercase tracking-[0.14em] text-white">
                        <tr>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">รหัส</th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">ชื่อพนักงาน</th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">แผนก</th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">
                            <span className="inline-block whitespace-nowrap text-[11px] uppercase tracking-[0.14em]">
                              วันทำงาน
                            </span>
                          </th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">กก.รวม</th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">กก./วัน</th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">เฉลี่ยงาน</th>
                          <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">เทียบเฉลี่ย %</th>
                          {capabilities.canViewMoney ? (
                            <th className="border-r border-[#0f1c36] px-3 py-2 text-center leading-tight">ค่าแรง</th>
                          ) : null}
                          <th className="print-piece-rate-hide-col px-3 py-2 text-center leading-tight">รายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {isLoading ? (
                          <tr>
                            <td colSpan={capabilities.canViewMoney ? 10 : 9} className="px-4 py-10 text-center text-slate-500">
                              {"\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25..."}
                            </td>
                          </tr>
                        ) : rows.length === 0 ? (
                          <tr>
                            <td colSpan={capabilities.canViewMoney ? 10 : 9} className="px-4 py-10 text-center text-slate-500">
                              {"ไม่มีข้อมูลในช่วงที่เลือก"}
                            </td>
                          </tr>
                        ) : (
                          <>
                            {rows.map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50">
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-mono text-[11px] font-semibold text-[#102C57]">
                                  <span className="block whitespace-nowrap">{row.employeeCode || "-"}</span>
                                </td>
                                <td className="cell-left border-r border-slate-200 px-3 py-3 text-left font-semibold text-slate-900 whitespace-nowrap">
                                  {row.employeeName || "-"}
                                </td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center whitespace-nowrap">
                                  {row.employeeDepartment || "-"}
                                </td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums whitespace-nowrap">
                                  {formatNumber(row.workDayCount, 0)}
                                </td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums whitespace-nowrap">
                                  {formatNumber(row.normalizedKgAmount, 3)}
                                </td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums whitespace-nowrap">
                                  {formatNumber(row.kgPerDay, 2)}
                                </td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums whitespace-nowrap">
                                  {formatNumber(row.typeAverageKgPerDay, 2)}
                                </td>
                                <td className={`border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums whitespace-nowrap ${getComparisonCellClassName(row.vsTypeAveragePct)}`}>
                                  {formatSignedPercentage(row.vsTypeAveragePct, 2)}
                                </td>
                                {capabilities.canViewMoney ? (
                                  <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums">
                                    {formatNumber(row.wageAmount, 2)}
                                  </td>
                                ) : null}
                                <td className="print-piece-rate-hide-col px-3 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => openEmployeeSummaryModal(row)}
                                    aria-label="รายละเอียด"
                                    className="piece-rate-no-print inline-flex items-center justify-center rounded-md bg-slate-100 p-2 text-[#102C57] hover:bg-slate-200"
                                  >
                                    <Eye size={16} />
                                    <span className="sr-only">รายละเอียด</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-[#e2e8f0] font-semibold">
                              <td className="border border-slate-200 px-3 py-3 text-center" colSpan={3}>
                                สรุปทั้งหมด
                              </td>
                              <td className="border border-slate-200 px-3 py-3 text-center tabular-nums">
                                {summary.totalWorkDays || "0"}
                              </td>
                              <td className="border border-slate-200 px-3 py-3 text-center tabular-nums">
                                {summary.totalKg || "0.00"}
                              </td>
                              <td className="border border-slate-200 px-3 py-3 text-center">-</td>
                              <td className="border border-slate-200 px-3 py-3 text-center">-</td>
                              <td className="border border-slate-200 px-3 py-3 text-center">-</td>
                              {capabilities.canViewMoney ? (
                                <td className="border border-slate-200 px-3 py-3 text-center tabular-nums">
                                  {summary.totalWage || "0.00"}
                                </td>
                              ) : null}
                              <td className="print-piece-rate-hide-col border border-slate-200 px-3 py-3 text-center">
                                -
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                    </div>
                    <div className="border-t border-dashed border-slate-300 bg-slate-50 px-5 py-3 text-[11px] text-slate-600">
                      <p className="font-semibold text-slate-800">หมายเหตุ</p>
                      <p className="mt-1">- กก.รวม: คนนี้ทำได้รวมทั้งหมดกี่กิโลในช่วงวันที่เลือก</p>
                      <p>- กก./วัน: คนนี้ทำได้เฉลี่ยกี่กิโลต่อวัน</p>
                      <p>- เฉลี่ยงาน: คนทั้งกลุ่มงานเดียวกันทำได้เฉลี่ยกี่กิโลต่อวัน</p>
                      <p>- เทียบเฉลี่ย %: คนนี้ดีกว่าหรือต่ำกว่าค่าเฉลี่ยกี่เปอร์เซ็นต์</p>
                    </div>
                </div>
              </div>
            ) : (
              <div ref={tableWrapRef} className="mt-4 overflow-x-auto rounded-[2px] border border-slate-200">
                <table className="w-full table-fixed text-[12px] text-slate-900 border-collapse">
                  <colgroup>
                    <col className={capabilities.canViewMoney ? (detailCanEdit ? "w-[9%]" : "w-[10%]") : (detailCanEdit ? "w-[10%]" : "w-[11%]")} />
                    <col className={`print-piece-rate-hide-col ${capabilities.canViewMoney ? (detailCanEdit ? "w-[10%]" : "w-[10%]") : (detailCanEdit ? "w-[10%]" : "w-[10%]")}`} />
                    <col className={capabilities.canViewMoney ? (detailCanEdit ? "w-[9%]" : "w-[10%]") : (detailCanEdit ? "w-[11%]" : "w-[12%]")} />
                    <col className={capabilities.canViewMoney ? (detailCanEdit ? "w-[17%]" : "w-[19%]") : (detailCanEdit ? "w-[20%]" : "w-[23%]")} />
                    <col className={capabilities.canViewMoney ? "w-[8%]" : (detailCanEdit ? "w-[8%]" : "w-[9%]")} />
                    <col className={capabilities.canViewMoney ? (detailCanEdit ? "w-[22%]" : "w-[24%]") : (detailCanEdit ? "w-[24%]" : "w-[27%]")} />
                    <col className="w-[8%]" />
                    <col className="w-[5%]" />
                    {capabilities.canViewMoney ? <col className="w-[8%]" /> : null}
                    {detailCanEdit ? <col className="piece-rate-action-col w-[6%]" /> : null}
                  </colgroup>
                  <thead className="bg-[#102C57] text-[12px] uppercase tracking-wide text-white">
                    <tr>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">
                        {viewMode === "grouped" ? "วันที่" : "เวลาชั่งจริง / ผู้บันทึก"}
                      </th>
                      <th className="print-piece-rate-hide-col border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">เลขเอกสาร</th>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">รหัสพนักงาน</th>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-left leading-tight">ชื่อพนักงาน</th>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">รหัสสินค้า</th>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">ชื่อสินค้า</th>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">น้ำหนัก</th>
                      <th className="border-r border-[#0f1c36] px-2 py-2 text-center leading-tight">จำนวน</th>
                      {capabilities.canViewMoney ? <th className={`${detailCanEdit ? "border-r border-[#0f1c36] " : ""}px-2 py-2 text-center leading-tight`}>ค่าแรง</th> : null}
                      {detailCanEdit ? <th className="print-piece-rate-hide-col px-1 py-2 text-center leading-tight">{"\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23"}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan={(capabilities.canViewMoney ? 9 : 8) + (detailCanEdit ? 1 : 0)} className="px-4 py-10 text-center text-slate-500">
                          กำลังโหลดข้อมูล...
                        </td>
                      </tr>
                    ) : desktopRows.length === 0 ? (
                      <tr>
                        <td colSpan={(capabilities.canViewMoney ? 9 : 8) + (detailCanEdit ? 1 : 0)} className="px-4 py-10 text-center text-slate-500">
                          ไม่พบข้อมูลในช่วงที่เลือก
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let lastDate = null;
                        return desktopRows.map((row) => {
                          const dateStr = viewMode === "grouped"
                            ? (row.groupDayKey || String(row.loggedAt || "").slice(0, 10))
                            : null;
                          const showSeparator = row.rowKind !== "subtotal" && dateStr && dateStr !== lastDate;
                          if (showSeparator) {
                            lastDate = dateStr;
                          }
                          return (
                            <Fragment key={row.id}>
                              {showSeparator && (
                                <tr className="piece-rate-no-print bg-slate-100 text-slate-700 font-bold border-y border-slate-200">
                                  <td
                                    colSpan={(capabilities.canViewMoney ? 9 : 8) + (detailCanEdit ? 1 : 0)}
                                    className="px-4 py-2 text-left text-xs font-bold text-[#102C57] bg-slate-100"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <CalendarDays size={14} className="text-[#102C57]" />
                                      วันที่ {formatDateToDDMMYYYY(dateStr)}
                                    </span>
                                  </td>
                                </tr>
                              )}
                              <tr
                                className={`align-middle border-b border-slate-200 ${row.rowKind === "subtotal"
                                  ? "bg-[#FFF8E1] text-[#102C57]"
                                  : viewMode !== "grouped"
                                    ? `${getDocumentSurfaceConfig(row.docStatus).rowClassName} ${getDocumentSurfaceConfig(row.docStatus).printRowClassName}`
                                    : "hover:bg-slate-50"
                                  }`.trim()}
                              >
                          <td className="border-r border-slate-200 px-2 py-1.5 text-center text-[12px] leading-tight">
                            <div className="font-semibold text-slate-900">
                              {row.rowKind === "subtotal"
                                ? "รวม"
                                : viewMode === "grouped"
                                ? formatDateToDDMMYYYY(row.groupDayKey || row.loggedAt)
                                : formatDateTime(row.loggedAt)
                              }
                            </div>
                            <div className="text-[11px] text-slate-500">{row.rowKind === "subtotal" ? "" : (row.operatorUsername || "-")}</div>
                          </td>
                          <td className="print-piece-rate-hide-col border-r border-slate-200 px-2 py-1.5 text-[12px] leading-tight">
                            {row.rowKind === "subtotal" ? (
                              <div className="text-center text-[11px] font-bold text-[#102C57]">รวมสินค้า</div>
                            ) : viewMode === "grouped" ? (
                              <div className="space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => openGroupDocumentsModal(row)}
                                  className="piece-rate-no-print rounded-[2px] bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-[#102C57] hover:bg-slate-200"
                                >
                                  ดูเอกสาร {getMergedCount(row)} ใบ
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                <span className="font-mono font-semibold text-[#102C57]">{getDocSummary(row)}</span>
                                <span className={`inline-flex rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${row.status.className}`}>
                                  {row.status.label}
                                </span>
                                {row.source === "manual" && (
                                  <span className="inline-flex rounded-[2px] bg-amber-100 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    Manual
                                  </span>
                                )}
                              </div>
                            )}
                            {viewMode !== "grouped" && row.revisedFromDocNo ? (
                              <div className="mt-0.5 text-center">
                                <span className="piece-rate-revised-badge inline-flex items-center rounded-[2px] border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  แก้จาก: <span className="ml-1 font-mono">{row.revisedFromDocNo}</span>
                                </span>
                              </div>
                            ) : null}
                            {viewMode !== "grouped" && row.replacedByDocNo ? (
                              <div className="mt-0.5 text-center">
                                <span className="piece-rate-replaced-badge inline-flex items-center rounded-[2px] border border-sky-200 bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                                  แทนที่โดย: <span className="ml-1 font-mono">{row.replacedByDocNo}</span>
                                </span>
                              </div>
                            ) : null}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1.5 text-center text-[12px] font-mono font-semibold text-slate-700 whitespace-nowrap">
                            {row.rowKind === "subtotal" ? "-" : row.employeeCode}
                          </td>
                          <td className="cell-left cell-employee border-r border-slate-200 px-2 py-1.5 text-left text-[12px] leading-tight">
                            <div className="font-medium text-slate-900 whitespace-nowrap">{row.rowKind === "subtotal" ? "" : row.employeeName}</div>
                            <div className="text-[11px] text-slate-500 whitespace-nowrap">{row.rowKind === "subtotal" ? "" : row.employeeDepartment}</div>
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1.5 text-center text-[12px] font-mono font-bold text-black whitespace-nowrap">
                            {getProductCodeLabel(row)}
                          </td>
                          <td className="cell-left border-r border-slate-200 px-2 py-1.5 text-[12px] leading-tight">
                            <div className="font-semibold text-slate-900">{row.productName}</div>
                            {row.weightOptionLabel ? (
                              <div className="text-[11px] text-slate-500">
                                {row.weightOptionLabel}{row.weightKg ? ` | ${formatNumber(row.weightKg, 3)} กก.` : ""}
                              </div>
                            ) : null}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1.5 text-center text-[12px] font-semibold tabular-nums whitespace-nowrap">
                            {formatNumber(row.normalizedKgAmount, 3)} กก.
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1.5 text-center text-[12px] font-semibold tabular-nums whitespace-nowrap">
                            {formatNumber(row.countValue, 0)}
                          </td>
                          {capabilities.canViewMoney ? (
                            <td className={`${detailCanEdit ? "border-r border-slate-200 " : ""}px-2 py-1.5 text-center text-[12px] font-semibold tabular-nums whitespace-nowrap`}>
                              {formatNumber(row.wageAmount, 2)}
                            </td>
                          ) : null}
                          {detailCanEdit ? (
                            <td className="print-piece-rate-hide-col px-1 py-1.5 text-center align-middle">
                              {row.rowKind === "subtotal" ? (
                                <span className="text-[11px] font-bold text-[#102C57]">-</span>
                              ) : (
                                <div className="relative inline-flex items-center justify-center" data-piece-rate-action-menu>
                                  <button
                                    type="button"
                                    onClick={() => setActionMenuRowId((currentValue) => currentValue === row.id ? null : row.id)}
                                    aria-label={"\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23"}
                                    aria-expanded={actionMenuRowId === row.id}
                                    className="piece-rate-no-print inline-flex h-7 w-7 items-center justify-center rounded-[2px] bg-white text-slate-600 transition-all hover:bg-slate-100 hover:text-[#102C57]"
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                  {actionMenuRowId === row.id ? (
                                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[132px] overflow-hidden rounded-[2px] border border-slate-200 bg-white text-left shadow-lg">
                                      <button
                                        type="button"
                                        onClick={() => openHistoryModal(row)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#102C57]"
                                      >
                                        <History size={14} />
                                        <span>{"\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34"}</span>
                                      </button>
                                      {row.docStatus === "active" ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openEditModal(row)}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                                          >
                                            <Edit3 size={14} />
                                            <span>{"\u0e41\u0e01\u0e49\u0e44\u0e02"}</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openCancelModal(row)}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                                          >
                                            <XCircle size={14} />
                                            <span>{"\u0e25\u0e1a"}</span>
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          ) : null}
                        </tr>
                            </Fragment>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              หน้า {pagination.page} / {pagination.totalPages} • ทั้งหมด {pagination.totalRecords.toLocaleString("th-TH")} {VIEW_MODE_LABELS[viewMode] || VIEW_MODE_LABELS.grouped}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoPrev}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                <ChevronLeft size={14} />
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                ถัดไป
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">ออกเอกสารแก้ไข</h2>
              <p className="mt-1 text-xs text-slate-500">
                เอกสาร {editingRow.docNo || "-"} • {editingRow.productName || "-"} • {editingRow.employeeCode || "-"}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-2xl border border-[#C9A227] bg-[#102C57] px-4 py-4 text-white">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-semibold tracking-[0.08em] text-[#F3D27A]">สินค้า</span>
                  <select
                    value={editForm.productBarcode}
                    onChange={(event) => setEditForm((previousValue) => ({
                      ...previousValue,
                      productBarcode: event.target.value,
                    }))}
                    className="h-11 rounded-lg border border-[#C9A227] bg-white px-3 text-sm font-semibold text-slate-900 outline-none"
                  >
                    {activeEditProductOption?.isLegacy ? (
                      <option value={activeEditProductOption.productBarcode}>
                        {activeEditProductOption.productName || "-"}{activeEditProductOption.productCode ? ` (${activeEditProductOption.productCode})` : ""}
                      </option>
                    ) : null}
                    {editableProductOptions.map((option) => (
                      <option key={option.productBarcode || option.value} value={option.productBarcode || option.value}>
                        {option.productName || option.label || "-"}{option.productCode ? ` (${option.productCode})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 grid gap-2 text-xs text-white/85 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[#F3D27A]">รหัสสินค้า</div>
                    <div className="mt-1 font-mono font-semibold text-white">
                      {activeEditProductOption?.productCode || "-"}
                      {activeEditProductOption?.productSkuCode ? ` • SKU ${activeEditProductOption.productSkuCode}` : ""}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[#F3D27A]">หัวข้อค่าแรง</div>
                    <div className="mt-1 font-semibold text-white">
                      {activeEditProductOption?.profileName || "-"}
                      {activeEditProductOption?.weightOptionLabel ? ` • ${activeEditProductOption.weightOptionLabel}` : ""}
                    </div>
                  </div>
                </div>

                {editableProductOptionsLoading ? (
                  <p className="mt-3 text-xs text-white/70">กำลังโหลดรายการสินค้าที่พร้อมแก้ไข...</p>
                ) : null}
                {editableProductOptionsError ? (
                  <p className="mt-3 text-xs font-medium text-amber-200">{editableProductOptionsError}</p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">{editingRow.inputLabel || "น้ำหนัก"}</span>
                  <input
                    type="number"
                    min="0"
                    step={activeEditInputMode === "kg" ? "0.001" : "1"}
                    value={editForm.inputValue}
                    onChange={(event) => setEditForm((previousValue) => ({
                      ...previousValue,
                      inputValue: event.target.value,
                    }))}
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">จำนวน</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editForm.countValue}
                    onChange={(event) => setEditForm((previousValue) => ({
                      ...previousValue,
                      countValue: event.target.value,
                    }))}
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                หน่วยที่ใช้บันทึกสำหรับสินค้านี้: <span className="font-semibold text-slate-900">{activeEditInputUnitLabel}</span>
              </div>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold text-slate-700">เหตุผลการแก้ไข</span>
                <textarea
                  rows={4}
                  value={editForm.editReason}
                  onChange={(event) => setEditForm((previousValue) => ({
                    ...previousValue,
                    editReason: event.target.value,
                  }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="ระบุสาเหตุที่ต้องออกเอกสารแก้ไข"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="rounded-xl bg-[#102C57] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingEdit ? "กำลังดำเนินการ..." : "ยืนยันออกเอกสารใหม่"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {manualModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl my-8">
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">บันทึกแมนวลย้อนหลัง</h2>
                <p className="mt-1 text-xs text-slate-500">คีย์งานคิดค่าแรงย้อนหลังด้วยมือ</p>
              </div>
              <button
                type="button"
                onClick={closeManualModal}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-5 py-4 max-h-[70vh] overflow-y-auto">
              {manualFormError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-700 font-semibold">
                  ⚠️ {manualFormError}
                </div>
              )}

              {/* Date/Time Row */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">วันที่ทำงานจริง</span>
                  <input
                    type="date"
                    value={manualForm.loggedAtDate}
                    onChange={(event) => setManualForm((curr) => ({
                      ...curr,
                      loggedAtDate: event.target.value,
                    }))}
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#102C57]"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">เวลาที่ทำงานจริง</span>
                  <input
                    type="time"
                    value={manualForm.loggedAtTime}
                    onChange={(event) => setManualForm((curr) => ({
                      ...curr,
                      loggedAtTime: event.target.value,
                    }))}
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#102C57]"
                  />
                </label>
              </div>

              {/* Employee Selection */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
                <div className="flex gap-2 items-end">
                  <label className="flex-1 flex flex-col gap-1.5 text-sm">
                    <span className="font-semibold text-slate-700">รหัสพนักงาน</span>
                    <input
                      type="text"
                      placeholder="เช่น KPF001"
                      value={manualForm.employeeCode}
                      onChange={(event) => setManualForm((curr) => ({
                        ...curr,
                        employeeCode: event.target.value.toUpperCase(),
                      }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleManualEmployeeLookup();
                        }
                      }}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:border-[#102C57]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleManualEmployeeLookup}
                    disabled={employeeLookupLoading}
                    className="h-10 rounded-xl bg-[#102C57] text-white hover:bg-[#102C57]/90 text-xs font-semibold px-4 transition disabled:opacity-60"
                  >
                    {employeeLookupLoading ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
                  </button>
                </div>

                {employeeLookupError && (
                  <p className="text-xs font-medium text-rose-600">{employeeLookupError}</p>
                )}

                {manualForm.employeeName ? (
                  <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-[10px] text-slate-400 font-medium">ชื่อพนักงาน</span>
                      <div className="font-bold text-slate-900">{manualForm.employeeName}</div>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-[10px] text-slate-400 font-medium">แผนก / สาขา</span>
                      <div className="font-bold text-slate-900">
                        {manualForm.employeeDepartment} / {manualForm.employeeBranch}
                      </div>
                    </div>
                    {manualForm.employeeCheckIn && (
                      <div className="col-span-2 bg-white rounded-lg border border-slate-200 px-3 py-1.5 text-[11px]">
                        🟢 เวลาสแกนเข้ากะ: <span className="font-semibold">{manualForm.employeeCheckIn}</span>
                        {manualForm.employeeCheckOut ? ` | สแกนออก: ${manualForm.employeeCheckOut}` : ""}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Product Selection */}
              <div className="rounded-xl border border-[#C9A227] bg-[#102C57] px-4 py-4 text-white space-y-3">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-semibold tracking-[0.08em] text-[#F3D27A]">ค้นหา/เลือกสินค้า</span>
                  <select
                    value={manualForm.productBarcode}
                    onChange={(event) => setManualForm((curr) => ({
                      ...curr,
                      productBarcode: event.target.value,
                    }))}
                    className="h-11 rounded-lg border border-[#C9A227] bg-white px-3 text-sm font-semibold text-slate-900 outline-none"
                  >
                    <option value="">-- กรุณาเลือกสินค้า --</option>
                    {editableProductOptions.map((option) => (
                      <option key={option.productBarcode || option.value} value={option.productBarcode || option.value}>
                        {option.productName || option.label || "-"}{option.productCode ? ` (${option.productCode})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {manualForm.productBarcode && (() => {
                  const selectedOpt = editableProductOptions.find(o => (o.productBarcode || o.value) === manualForm.productBarcode);
                  if (!selectedOpt) return null;
                  return (
                    <div className="grid gap-2 text-xs text-white/85 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[#F3D27A]">รหัสสินค้า</div>
                        <div className="mt-1 font-mono font-semibold text-white">
                          {selectedOpt.productCode || "-"}
                          {selectedOpt.productSkuCode ? ` • SKU ${selectedOpt.productSkuCode}` : ""}
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[#F3D27A]">หัวข้อค่าแรง</div>
                        <div className="mt-1 font-semibold text-white">
                          {selectedOpt.profileName || "-"}
                          {selectedOpt.weightOptionLabel ? ` • ${selectedOpt.weightOptionLabel}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {editableProductOptionsLoading ? (
                  <p className="text-xs text-white/70">กำลังโหลดรายการสินค้า...</p>
                ) : null}
              </div>

              {/* Input Value and Qty */}
              {manualForm.productBarcode && (() => {
                const selectedOpt = editableProductOptions.find(o => (o.productBarcode || o.value) === manualForm.productBarcode);
                const inputMode = selectedOpt?.inputMode || "kg";
                const inputLabel = selectedOpt?.inputLabel || "น้ำหนัก";
                const inputUnitLabel = selectedOpt?.inputUnitLabel || "กก.";
                return (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold text-slate-700">{inputLabel} ({inputUnitLabel})</span>
                        <input
                          type="number"
                          min="0"
                          step={inputMode === "kg" ? "0.001" : "1"}
                          value={manualForm.inputValue}
                          onChange={(event) => setManualForm((curr) => ({
                            ...curr,
                            inputValue: event.target.value,
                          }))}
                          className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#102C57]"
                          placeholder="กรอกค่าน้ำหนักจริง"
                        />
                      </label>

                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="font-semibold text-slate-700">จำนวน (ชิ้น/ครั้ง)</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={manualForm.countValue}
                          onChange={(event) => setManualForm((curr) => ({
                            ...curr,
                            countValue: event.target.value,
                          }))}
                          className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#102C57]"
                        />
                      </label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      หน่วยที่ใช้บันทึกสำหรับสินค้านี้: <span className="font-semibold text-slate-900">{inputUnitLabel}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Remark */}
              <label className="flex flex-col gap-1.5 text-sm font-bold text-rose-700">
                <span>ระบุหมายเหตุ / เหตุผลประกอบ (จำเป็น)</span>
                <textarea
                  rows={3}
                  value={manualForm.remark}
                  onChange={(event) => setManualForm((curr) => ({
                    ...curr,
                    remark: event.target.value,
                  }))}
                  required
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#102C57] text-slate-900 font-normal"
                  placeholder="กรุณาระบุเหตุผล เช่น เครื่องชั่งขัดข้อง เลยต้องจดบันทึกมือ"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeManualModal}
                className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveManual}
                disabled={savingManual}
                className="h-10 rounded-xl bg-[#102C57] px-5 text-xs font-bold text-white hover:bg-[#102C57]/90 disabled:opacity-60 transition"
              >
                {savingManual ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl my-8 flex flex-col max-h-[90vh]">
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">นำเข้าข้อมูลคิดค่าแรงจาก Excel</h2>
                <p className="mt-1 text-xs text-slate-500">อัปโหลดไฟล์สเปรดชีตเพื่อนำเข้าข้อมูลย้อนหลัง</p>
              </div>
              <button
                type="button"
                onClick={closeImportModal}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {importError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-700 font-semibold font-normal">
                  ⚠️ {importError}
                </div>
              )}
              {importSuccessMsg && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-700 font-semibold font-normal">
                  ✅ {importSuccessMsg}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-xs font-semibold text-slate-700">เทมเพลตสำหรับนำเข้าข้อมูล</div>
                  <div className="text-[11px] text-slate-500">กรุณาจัดเตรียมข้อมูลให้ตรงกับหัวข้อในไฟล์ตัวอย่าง</div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Download size={14} />
                  ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)
                </button>
              </div>

              {!importResults && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 bg-slate-50 hover:bg-slate-100/50 transition relative">
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={handleImportFileChange}
                    disabled={importingExcelFile || isSubmittingImport}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-2 pointer-events-none">
                    <div className="p-3 bg-emerald-100 rounded-full text-emerald-800">
                      <Download size={24} className="rotate-180" />
                    </div>
                    <div className="text-sm font-semibold text-slate-700">
                      {importingExcelFile ? "กำลังวิเคราะห์ไฟล์..." : "คลิกเพื่อเลือกไฟล์ Excel หรือลากไฟล์มาวาง"}
                    </div>
                    <div className="text-[11px] text-slate-400">รองรับเฉพาะไฟล์ .xlsx เท่านั้น</div>
                  </div>
                </div>
              )}

              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-bold text-slate-700">รายการพรีวิวข้อมูล ({previewRows.length} รายการ)</div>
                    <div className="text-xs font-bold text-rose-600">
                      {previewRows.filter(r => !r.isValid).length > 0
                        ? `พบบรรทัดมีข้อผิดพลาด ${previewRows.filter(r => !r.isValid).length} รายการ`
                        : "ข้อมูลทั้งหมดถูกต้อง พร้อมนำเข้า"}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full border-collapse text-left text-xs bg-white">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 border-r border-slate-200">แถว</th>
                          <th className="px-3 py-2 border-r border-slate-200">วันเวลาทำงาน</th>
                          <th className="px-3 py-2 border-r border-slate-200">รหัสพนักงาน</th>
                          <th className="px-3 py-2 border-r border-slate-200">บาร์โค้ด</th>
                          <th className="px-3 py-2 border-r border-slate-200">น้ำหนัก / จำนวน</th>
                          <th className="px-3 py-2 border-r border-slate-200">รหัสเครื่องชั่ง</th>
                          <th className="px-3 py-2">สถานะ / ข้อผิดพลาด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className={row.isValid ? "hover:bg-slate-50/50" : "bg-rose-50/40 hover:bg-rose-50/60"}>
                            <td className="px-3 py-2 border-r border-slate-200 font-mono text-center text-slate-400">{row.rowNum}</td>
                            <td className="px-3 py-2 border-r border-slate-200 font-mono text-slate-900">{row.loggedAt}</td>
                            <td className="px-3 py-2 border-r border-slate-200 font-mono font-bold text-slate-800">{row.employeeCode}</td>
                            <td className="px-3 py-2 border-r border-slate-200 font-mono text-slate-800">{row.productBarcode}</td>
                            <td className="px-3 py-2 border-r border-slate-200 font-mono text-right">{row.inputValue} กก. (x{row.countValue})</td>
                            <td className="px-3 py-2 border-r border-slate-200 font-mono">{row.machineCode}</td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                  ถูกต้อง
                                </span>
                              ) : (
                                <div className="text-[10px] text-rose-600 font-semibold space-y-0.5">
                                  {row.errors.map((err, errIdx) => (
                                    <div key={errIdx}>• {err}</div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResults && (
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 space-y-3">
                  <div className="text-xs font-bold text-slate-800">สรุปการอัปโหลดข้อมูล</div>
                  <div className="grid grid-cols-3 gap-2 text-center col-span-3">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">ทั้งหมด</div>
                      <div className="text-lg font-bold text-slate-800">{importResults.total}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-emerald-500 font-semibold uppercase">สำเร็จ</div>
                      <div className="text-lg font-bold text-emerald-600">{importResults.successCount}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                      <div className="text-[10px] text-rose-500 font-semibold uppercase">ล้มเหลว</div>
                      <div className="text-lg font-bold text-rose-600">{importResults.failureCount}</div>
                    </div>
                  </div>
                  
                  {importResults.failureCount > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="text-xs font-bold text-slate-700">รายการที่พบปัญหา:</div>
                      <div className="border border-slate-200 rounded-lg max-h-[150px] overflow-y-auto bg-white p-2 text-[11px] text-rose-600 space-y-1 font-mono">
                        {importResults.results.filter(r => !r.ok).map((err, idx) => (
                          <div key={idx}>
                            แถว {previewRows[err.index]?.rowNum || (err.index + 2)}: {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={closeImportModal}
                className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition"
              >
                {importResults ? "ปิด" : "ยกเลิก"}
              </button>
              {!importResults && (
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isSubmittingImport || previewRows.length === 0 || previewRows.some(r => !r.isValid)}
                  className="h-10 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {isSubmittingImport ? "กำลังนำเข้าข้อมูล..." : "ยืนยันนำเข้าข้อมูล"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}


      {cancellingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">ยกเลิกเอกสาร</h2>
              <p className="mt-1 text-xs text-slate-500">
                เอกสาร {cancellingRow.docNo || "-"} • {cancellingRow.productName || "-"} • {cancellingRow.employeeCode || "-"}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold text-slate-700">เหตุผลการยกเลิก</span>
                <textarea
                  rows={4}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="ระบุสาเหตุที่ต้องยกเลิกเอกสาร"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeCancelModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleCancelDocument}
                disabled={savingCancel}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingCancel ? "กำลังยกเลิก..." : "ยืนยันยกเลิกเอกสาร"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {employeeSummaryRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">สรุปรายละเอียดพนักงาน</h2>
              <p className="mt-1 text-xs text-slate-500">
                {employeeSummaryRow.employeeCode || "-"} • {employeeSummaryRow.employeeName || "-"} • ช่วงวันที่ {filters.dateFrom} ถึง {filters.dateTo}
              </p>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4">
              {employeeSummaryLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  กำลังโหลดสรุปรายละเอียดพนักงาน...
                </div>
              ) : employeeSummaryError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-600">
                  {employeeSummaryError}
                </div>
              ) : !employeeSummaryData?.employee ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  ไม่พบรายละเอียดของพนักงานในช่วงที่เลือก
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <MetricPill label="จำนวนเอกสาร" value={String(employeeSummaryData.employee.docCount || "0")} />
                    <MetricPill label="จำนวนวันทำงาน" value={String(employeeSummaryData.employee.workDayCount || "0")} />
                    <MetricPill label="จำนวนสินค้า" value={String(employeeSummaryData.employee.productCount || "0")} />
                    <MetricPill label="น้ำหนักรวม (กก.)" value={formatNumber(employeeSummaryData.employee.normalizedKgAmount, 3)} />
                    <MetricPill label="จำนวนรวม" value={formatNumber(employeeSummaryData.employee.countValue, 0)} />
                    {capabilities.canViewMoney ? <MetricPill label="ค่าแรงรวม" value={formatNumber(employeeSummaryData.employee.wageAmount, 2)} /> : null}
                  </div>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">สรุปรายวัน</h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full table-fixed text-[12px] text-slate-900">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                          <tr>
                            <th className="border-r border-slate-200 px-3 py-2 text-left">วันที่</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-right">เอกสาร</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-right">สินค้า</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-right">น้ำหนักรวม</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-right">จำนวนรวม</th>
                            {capabilities.canViewMoney ? <th className="px-3 py-2 text-right">ค่าแรงรวม</th> : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {(employeeSummaryData.dailyBreakdown || []).map((item) => (
                            <tr key={item.dayKey}>
                              <td className="border-r border-slate-200 px-3 py-2">{item.dayKey || "-"}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(item.docCount, 0)}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(item.productCount, 0)}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(item.normalizedKgAmount, 3)}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(item.countValue, 0)}</td>
                              {capabilities.canViewMoney ? <td className="px-3 py-2 text-right tabular-nums">{formatNumber(item.wageAmount, 2)}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">สรุปรายสินค้า</h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full table-fixed text-[12px] text-slate-900">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                          <tr>
                            <th className="border-r border-slate-200 px-3 py-2 text-left">สินค้า</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-left">รหัส</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-right">เอกสาร</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-right">วันทำงาน</th>
                            {capabilities.canViewMoney ? <th className="px-3 py-2 text-right">ค่าแรงรวม</th> : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {(employeeSummaryData.productBreakdown || []).map((item) => (
                            <tr key={item.productKey}>
                              <td className="border-r border-slate-200 px-3 py-2">{item.productName || "-"}</td>
                              <td className="border-r border-slate-200 px-3 py-2 font-mono text-[11px]">{item.productCode || "-"}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(item.docCount, 0)}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(item.workDayCount, 0)}</td>
                              {capabilities.canViewMoney ? <td className="px-3 py-2 text-right tabular-nums">{formatNumber(item.wageAmount, 2)}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">เอกสารทั้งหมด</h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full table-fixed text-[12px] text-slate-900">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                          <tr>
                            <th className="border-r border-slate-200 px-3 py-2 text-left">เลขเอกสาร</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-left">เวลาชั่งจริง</th>
                            <th className="border-r border-slate-200 px-3 py-2 text-left">สินค้า</th>
                            {capabilities.canViewMoney ? <th className="border-r border-slate-200 px-3 py-2 text-right">ค่าแรง</th> : null}
                            <th className="px-3 py-2 text-left">สถานะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {(employeeSummaryData.documents || []).map((row) => {
                            const status = getDocStatusConfig(row.docStatus);
                            return (
                              <tr key={row.id}>
                                <td className="border-r border-slate-200 px-3 py-2 font-mono text-[11px]">{row.docNo || "-"}</td>
                                <td className="border-r border-slate-200 px-3 py-2 text-[11px]">{formatDateTime(row.loggedAt)}</td>
                                <td className="border-r border-slate-200 px-3 py-2 text-[11px]">{row.productName || "-"}</td>
                                {capabilities.canViewMoney ? <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(row.wageAmount, 2)}</td> : null}
                                <td className="px-3 py-2 text-[11px]">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                                    {status.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeEmployeeSummaryModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">ประวัติเอกสาร</h2>
              <p className="mt-1 text-xs text-slate-500">
                เอกสาร {historyRow.docNo || "-"} • {historyRow.employeeCode || "-"} • {historyRow.productName || "-"}
              </p>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4">
              {historyLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  กำลังโหลดประวัติเอกสาร...
                </div>
              ) : historyError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-600">
                  {historyError}
                </div>
              ) : historyData.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  ยังไม่มีประวัติการแก้ไขหรือยกเลิกเอกสารนี้
                </div>
              ) : (
                <div className="space-y-3">
                  {historyData.map((item) => {
                    const badgeClassName = item.action === "cancel"
                      ? "bg-rose-100 text-rose-700"
                      : item.action === "replace"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-sky-100 text-sky-700";

                    return (
                      <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${badgeClassName}`}>
                                {item.actionLabel}
                              </span>
                              {item.isLinkedRevision ? (
                                <span className="inline-flex rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                  อ้างอิงจากเอกสารก่อนหน้า
                                </span>
                              ) : null}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {item.beforeDocNo || "-"} {item.afterDocNo && item.afterDocNo !== item.beforeDocNo ? `→ ${item.afterDocNo}` : ""}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatDateTime(item.editedAt)} • โดย {item.editedByLabel || "-"}
                            </div>
                          </div>
                          <div className="grid min-w-[180px] grid-cols-2 gap-2 text-[11px] text-slate-600">
                            <div className="rounded-lg bg-white px-3 py-2">
                              <div className="font-semibold text-slate-500">น้ำหนัก</div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {formatNumber(item.beforeInputValue, 3)} → {formatNumber(item.afterInputValue, 3)}
                              </div>
                            </div>
                            <div className="rounded-lg bg-white px-3 py-2">
                              <div className="font-semibold text-slate-500">จำนวน</div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {formatNumber(item.beforeCountValue, 0)} → {formatNumber(item.afterCountValue, 0)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">เหตุผล</div>
                          <div className="mt-1">{item.reason || "-"}</div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeHistoryModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {groupDocumentsRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">รายละเอียดเอกสารในกลุ่ม</h2>
              <p className="mt-1 text-xs text-slate-500">
                {groupDocumentsRow.groupDayKey || "-"} • {groupDocumentsRow.employeeCode || "-"} • {groupDocumentsRow.productName || "-"}
              </p>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4">
              {groupDocumentsLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  กำลังโหลดรายละเอียดเอกสาร...
                </div>
              ) : groupDocumentsError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-600">
                  {groupDocumentsError}
                </div>
              ) : visibleGroupDocuments.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  ไม่พบเอกสารที่ใช้งานในกลุ่มนี้
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 hidden">
                    {visibleGroupDocuments.map((row) => {
                      const status = getDocStatusConfig(row.docStatus);
                      return (
                        <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-mono text-[11px] font-semibold text-[#102C57]">{row.docNo || "-"}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{formatDateTime(row.loggedAt)}</div>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                              {status.label}
                            </span>
                          </div>

                          <dl className="mt-3 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-[11px]">
                            <dt className="text-slate-500">รหัสพนักงาน</dt>
                            <dd className="font-mono">{row.employeeCode}</dd>

                            <dt className="text-slate-500">ชื่อพนักงาน</dt>
                            <dd>{row.employeeName}</dd>

                            <dt className="text-slate-500">น้ำหนัก</dt>
                            <dd className="text-right font-semibold tabular-nums">
                              {formatNumber(row.normalizedKgAmount, 3)} กก.
                            </dd>

                            <dt className="text-slate-500">จำนวน</dt>
                            <dd className="text-right font-semibold tabular-nums">{formatNumber(row.countValue, 0)}</dd>

                            {capabilities.canViewMoney ? (
                              <>
                                <dt className="text-slate-500">ค่าแรง</dt>
                                <dd className="text-right font-semibold tabular-nums">{formatNumber(row.wageAmount, 2)}</dd>
                              </>
                            ) : null}
                          </dl>
                        </article>
                      );
                    })}
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full table-fixed text-[12px] text-slate-900">
                      <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                        <tr>
                          <th className="border-r border-slate-200 px-3 py-2 text-left">เลขเอกสาร</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-left">เวลาชั่งจริง</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-left">รหัสพนักงาน</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-left">ชื่อพนักงาน</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-right">น้ำหนัก</th>
                          <th className="border-r border-slate-200 px-3 py-2 text-right">จำนวน</th>
                          {capabilities.canViewMoney ? <th className="border-r border-slate-200 px-3 py-2 text-right">ค่าแรง</th> : null}
                          <th className="px-3 py-2 text-left">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {visibleGroupDocuments.map((row) => {
                          const status = getDocStatusConfig(row.docStatus);
                          return (
                            <tr key={row.id}>
                              <td className="border-r border-slate-200 px-3 py-2 font-mono text-[11px]">{row.docNo || "-"}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-[11px]">{formatDateTime(row.loggedAt)}</td>
                              <td className="border-r border-slate-200 px-3 py-2 font-mono text-[11px]">{row.employeeCode}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-[11px]">{row.employeeName}</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(row.normalizedKgAmount, 3)} กก.</td>
                              <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(row.countValue, 0)}</td>
                              {capabilities.canViewMoney ? <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums">{formatNumber(row.wageAmount, 2)}</td> : null}
                              <td className="px-3 py-2 text-[11px]">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricPill label="น้ำหนักรวม (กก.)" value={String(visibleGroupDocumentsSummary.totalKg || "0.00")} />
                    <MetricPill label="รวมจำนวน" value={String(visibleGroupDocumentsSummary.totalCount || "0.00")} />
                    {capabilities.canViewMoney ? <MetricPill label="รวมค่าแรง" value={String(visibleGroupDocumentsSummary.totalWage || "0.00")} /> : null}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeGroupDocumentsModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}






