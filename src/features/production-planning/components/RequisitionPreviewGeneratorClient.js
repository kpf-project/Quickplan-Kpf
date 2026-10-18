"use client";

import WipWeeklyTable from "./WipWeeklyTable";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import useSWR, { mutate as mutateSWR } from "swr";
import useSWRInfinite from "swr/infinite";
import { fetchJson, fetcher } from "@/lib/clientFetch";
import {
  buildRequisitionPreviewDocuments,
  buildPlannedWipPreviewRows,
  mergeRequisitionDraftLines,
  resolveRequisitionPreviewCellQty,
  resolveRequisitionEditableDocumentKey,
  upsertRequisitionSourceLineQty,
} from "@/lib/requisitionPreviewDisplay";
import { usePersistentRouteState } from "@/lib/usePersistentRouteState";
import PlanningHeader from "@/features/production-planning/components/PlanningHeader";
import ProductionScheduleClient from "./ProductionScheduleClient";
import RequisitionSequenceSettingsPanel from "./RequisitionSequenceSettingsPanel";
import RequisitionDocumentToolbar, { RequisitionDocumentActions, requisitionDocumentId } from "./RequisitionDocumentToolbar";
import presentation from "./RequisitionPreviewPresentation.module.css";
import EditableQtyCell from "./EditableRequisitionQtyCell";
import PlanningReferencePaper from "./PlanningReferencePaper";
import RequisitionMaterialPicker from "./RequisitionMaterialPicker";
import RequisitionDialog from "./RequisitionDialog";
import RequisitionPlanPicker from "./RequisitionPlanPicker";
import RequisitionPaper, { RequisitionPaperTable, RequisitionWorkLabel } from "./RequisitionPaper";
import RequisitionLotDialog from "./RequisitionLotDialog";
import dialogStyles from "./RequisitionDialog.module.css";
import { isRequisitionLineExportLocked } from "@/lib/requisitionMaterialPicker";

const DAY_TONE_CLASSES = [
  "bg-[#f4e8b5]",
  "bg-[#ead5f1]",
  "bg-[#cdeed3]",
  "bg-[#f8d8b6]",
  "bg-[#cdebf0]",
  "bg-[#d9d3f6]",
  "bg-[#f8d0d0]",
];

function formatDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear() + 543);
  return `${day}/${month}/${year}`;
}

function formatDayHeader(value) {
  const raw = String(value || "").trim().slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { weekday: "", date: "-" };
  return {
    weekday: ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][date.getUTCDay()],
    date: `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQty(value) {
  return Number(toNumber(value).toFixed(3));
}

function formatQty(value) {
  const qty = toNumber(value);
  if (qty <= 0) return "-";
  return qty % 1 === 0
    ? qty.toLocaleString("th-TH")
    : qty.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function normalizeTextKey(value) {
  return String(value || "").trim().toUpperCase();
}

function formatRoomName(roomLabel, roomId) {
  const text = String(roomLabel || roomId || "").trim();
  if (!text) return "-";
  return text.replace(/^\[[^\]]+\]\s*/, "").trim() || "-";
}

function hasAssignedRoom(doc) {
  const roomId = normalizeTextKey(doc?.roomId);
  const roomLabel = String(doc?.roomLabel || "").trim();
  return Boolean(roomId && roomId !== "UNASSIGNED_ROOM" && !roomLabel.includes("ยังไม่กำหนดห้อง"));
}

function formatShiftName(doc) {
  const base = String(doc?.shiftName || doc?.shiftCode || doc?.shiftId || "").trim() || "-";
  const start = String(doc?.shiftStartTime || "").trim();
  const end = String(doc?.shiftEndTime || "").trim();
  if (start && end) {
    return `${base} ${start} - ${end}`;
  }
  return base;
}

function getDepartmentIdentity(tab) {
  const firstDoc = Array.isArray(tab?.documents) ? tab.documents[0] : null;
  return String(firstDoc?.ownerDepartmentId || tab?.key || "").trim();
}

function buildLineKey(line) {
  return `${String(line?.materialGoodsCode || line?.materialSkuCode || "").trim().toUpperCase()}|${String(line?.unit || "").trim().toUpperCase()}`;
}

function buildMaterialOptionKey(option) {
  return `${String(option?.skuCode || "").trim().toUpperCase()}::${String(option?.goodsCode || option?.skuCode || "").trim().toUpperCase()}`;
}

function buildSupplementalLineKey(line) {
  return String(line?.materialGoodsCode || line?.materialSkuCode || "").trim().toUpperCase();
}

function formatQtyOrZero(value) {
  return toNumber(value) > 0 ? formatQty(value) : "0";
}

function buildLotRequirementKey(documentKey, line, dateValue) {
  return `${String(documentKey || "").trim()}::${buildLineKey(line)}::${String(dateValue || "").trim()}`;
}

function buildDateRange(dateFrom, dateTo) {
  const start = Date.parse(`${dateFrom}T00:00:00Z`);
  const end = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const dates = [];
  for (let cursor = start; cursor <= end && dates.length < 366; cursor += 86400000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

function normalizeLotAllocationsByDate(value) {
  return Object.fromEntries(
    Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {})
      .map(([dateValue, allocations]) => {
        const rows = (Array.isArray(allocations) ? allocations : [])
          .map((item) => ({
            lotNo: String(item?.lotNo || "").trim(),
            qty: roundQty(item?.qty),
          }))
          .filter((item) => item.qty > 0);
        return rows.length ? [dateValue, rows] : null;
      })
      .filter(Boolean)
  );
}

function normalizeErpLotsByDate(value) {
  return Object.fromEntries(
    Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {})
      .map(([dateValue, allocations]) => {
        const rows = (Array.isArray(allocations) ? allocations : [])
          .map((item) => ({
            lotNo: String(item?.lotNo || "").trim(),
            warehouseCode: String(item?.warehouseCode || "").trim(),
            fifoDate: item?.fifoDate || null,
            qty: roundQty(item?.qty),
          }))
          .filter((item) => item.qty > 0);
        return rows.length ? [dateValue, rows] : null;
      })
      .filter(Boolean)
  );
}

function normalizeDocumentKeys(value) {
  return Array.from(
    new Set((Array.isArray(value) ? value : [value]).map((item) => String(item || "").trim()).filter(Boolean))
  );
}

function inferMaterialItemType(option) {
  const explicit = normalizeTextKey(option?.itemType || option?.materialType);
  if (explicit) return explicit;
  return normalizeTextKey(option?.category) === "03" ? "WIP" : "RAW";
}

function getExportedDateOptions(doc, pageColumns = []) {
  return (Array.isArray(pageColumns) ? pageColumns : [])
    .filter((dateValue) => doc?.exportedByDate?.[dateValue] === true)
    .map((dateValue) => ({
      value: dateValue,
      label: formatDate(dateValue),
      documentNo: String(doc?.documentNoByDate?.[dateValue] || "").trim(),
    }));
}

function cloneLine(line) {
  return {
    materialSkuCode: String(line?.materialSkuCode || "").trim(),
    materialGoodsCode: String(line?.materialGoodsCode || line?.materialSkuCode || "").trim(),
    materialName: String(line?.materialName || "").trim(),
    unit: String(line?.unit || "").trim(),
    itemType: String(line?.itemType || "").trim().toUpperCase(),
    qtyByDate: Object.fromEntries(
      Object.entries(line?.qtyByDate || {}).map(([dateValue, qty]) => [dateValue, roundQty(qty)])
    ),
    totalQty: roundQty(line?.totalQty),
    isManual: line?.isManual === true,
    lotAllocationsByDate: normalizeLotAllocationsByDate(line?.lotAllocationsByDate),
    erpLotsByDate: normalizeErpLotsByDate(line?.erpLotsByDate),
    exportedLotsByDate: normalizeErpLotsByDate(line?.exportedLotsByDate),
  };
}

function normalizeLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const cloned = cloneLine(line);
      const qtyByDate = Object.fromEntries(
        Object.entries(cloned.qtyByDate || {})
          .map(([dateValue, qty]) => [dateValue, roundQty(qty)])
          .filter(([, qty]) => qty > 0)
      );
      const totalQty = roundQty(
        Object.values(qtyByDate).reduce((sum, qty) => sum + toNumber(qty), 0)
      );
      return {
        ...cloned,
        qtyByDate,
        totalQty,
      };
    })
    .filter((line) => {
      if (line.totalQty > 0 || line.isManual === true) return true;
      const hasErpLots = Object.values(line.erpLotsByDate || {}).some((lots) => Array.isArray(lots) && lots.length > 0);
      const hasExportedLots = Object.values(line.exportedLotsByDate || {}).some((lots) => Array.isArray(lots) && lots.length > 0);
      return hasErpLots || hasExportedLots;
    })
    .sort((a, b) => {
      const codeA = String(a.materialGoodsCode || a.materialSkuCode || "");
      const codeB = String(b.materialGoodsCode || b.materialSkuCode || "");
      return codeA.localeCompare(codeB);
    });
}

function normalizeDraftMap(drafts) {
  return Object.fromEntries(
    Object.entries(drafts || {})
      .map(([docKey, lines]) => {
        const normalizedDocKey = String(docKey || "").trim();
        if (!normalizedDocKey) return null;
        return [normalizedDocKey, normalizeLines(lines)];
      })
      .filter(Boolean)
  );
}

function serializeLines(lines) {
  return JSON.stringify(normalizeLines(lines));
}

function mergeDraftDocument(currentDrafts, sourceDocuments, docKey, nextLines) {
  const normalizedDocKey = String(docKey || "").trim();
  const nextDrafts = { ...normalizeDraftMap(currentDrafts) };
  const normalizedNextLines = normalizeLines(nextLines);
  const sourceDocument = (Array.isArray(sourceDocuments) ? sourceDocuments : []).find(
    (doc) => String(doc?.documentKey || "").trim() === normalizedDocKey
  );
  const sourceLines = normalizeLines(sourceDocument?.lines || []);

  if (normalizedNextLines.length > 0 && serializeLines(normalizedNextLines) === serializeLines(sourceLines)) {
    delete nextDrafts[normalizedDocKey];
    return nextDrafts;
  }

  nextDrafts[normalizedDocKey] = normalizedNextLines;
  return nextDrafts;
}

function buildDraftCachePayload({
  masterPlanNo,
  dateFrom,
  dateTo,
  drafts,
  updatedAt = null,
  updatedBy = null,
  sourceRevision = "",
}) {
  return {
    data: {
      scopeKey: [String(masterPlanNo || "").trim().toUpperCase(), dateFrom || "-", dateTo || "-"].join("|"),
      masterPlanNo: String(masterPlanNo || "").trim().toUpperCase(),
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      drafts: normalizeDraftMap(drafts),
      updatedAt,
      updatedBy,
      sourceRevision,
      staleDraft: false,
    },
  };
}

async function saveDraftToServer(draftUrl, payload) {
  const result = await fetchJson(draftUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!result.ok) {
    const error = new Error(result.error?.message || "บันทึกแบบร่างไม่สำเร็จ");
    error.status = result.status;
    error.info = result.error;
    throw error;
  }
  return result.data;
}

function readDownloadFilename(response, fallback) {
  const header = String(response.headers.get("content-disposition") || "").trim();
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const basicMatch = header.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
}

function buildOverviewDocument(documents, dateColumns) {
  const lineMap = new Map();

  documents.forEach((doc) => {
    (doc.lines || []).forEach((line) => {
      const lineKey = buildLineKey(line);
      if (!lineMap.has(lineKey)) {
        lineMap.set(lineKey, {
          materialSkuCode: line.materialSkuCode || "",
          materialGoodsCode: line.materialGoodsCode || line.materialSkuCode || "",
          materialName: line.materialName || "",
          unit: line.unit || "",
          itemType: line.itemType || "",
          qtyByDate: {},
          totalQty: 0,
          erpLotsByDate: {},
          exportedLotsByDate: {},
        });
      }
      const target = lineMap.get(lineKey);
      if (!target.itemType && line.itemType) target.itemType = line.itemType;
      Object.entries(line.qtyByDate || {}).forEach(([dateValue, qty]) => {
        target.qtyByDate[dateValue] = roundQty(toNumber(target.qtyByDate[dateValue]) + toNumber(qty));
      });
      Object.entries(line.erpLotsByDate || {}).forEach(([dateValue, rows]) => {
        target.erpLotsByDate[dateValue] = [
          ...(target.erpLotsByDate[dateValue] || []),
          ...(Array.isArray(rows) ? rows : []),
        ];
      });
      Object.entries(line.exportedLotsByDate || {}).forEach(([dateValue, rows]) => {
        target.exportedLotsByDate[dateValue] = [
          ...(target.exportedLotsByDate[dateValue] || []),
          ...(Array.isArray(rows) ? rows : []),
        ];
      });
      target.totalQty = roundQty(target.totalQty + toNumber(line.totalQty));
    });
  });

  const workNamesByDate = {};
  const documentNoByDate = {};
  const exportedByDate = {};
  const erpSyncByDate = {};
  dateColumns.forEach((dateValue) => {
    const names = new Set();
    const documentNos = new Set();
    documents.forEach((doc) => {
      const workNames = Array.isArray(doc?.workNamesByDate?.[dateValue]) ? doc.workNamesByDate[dateValue] : [];
      workNames.forEach((name) => {
        const normalized = String(name || "").trim();
        if (normalized) names.add(normalized);
      });
      const docNo = String(doc?.documentNoByDate?.[dateValue] || "").trim();
      if (docNo) {
        documentNos.add(docNo);
        exportedByDate[dateValue] = true;
      }
      const sync = doc?.erpSyncByDate?.[dateValue];
      if (sync?.status === "review") erpSyncByDate[dateValue] = sync;
      else if (sync && !erpSyncByDate[dateValue]) erpSyncByDate[dateValue] = sync;
    });
    workNamesByDate[dateValue] = Array.from(names);
    if (documentNos.size > 0) {
      documentNoByDate[dateValue] = Array.from(documentNos).join(" / ");
    }
  });

  return {
    documentKey: "ALL_DEPARTMENTS_DAILY_SUMMARY",
    ownerDepartmentName: "รวมทุกแผนก",
    qaDepartmentName: "รวมทุกแผนก",
    roomLabel: "รวมทุกห้อง",
    roomId: "ALL_ROOMS",
    workDate: dateColumns[0] || "",
    workNamesByDate,
    documentNoByDate,
    exportedByDate,
    erpSyncByDate,
    lines: normalizeLines(Array.from(lineMap.values())),
  };
}



function SupplementalRequisitionDrawer({
  state,
  document,
  dateOptions = [],
  exporting = false,
  onClose,
  onChangeDate,
  onChangeReason,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onExport,
}) {
  const [searchText, setSearchText] = useState("");
  const [qtyText, setQtyText] = useState("1");
  const [selectedKey, setSelectedKey] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const supplementalDocKey = state?.docKey || "";

  const getMaterialPageKey = useCallback((pageIndex, previousPageData) => {
    if (!supplementalDocKey) return null;
    if (previousPageData && previousPageData?.meta?.hasMore !== true) return null;
    const query = new URLSearchParams({ page: String(pageIndex + 1), pageSize: "300" });
    if (deferredSearchText) query.set("search", deferredSearchText);
    if (previousPageData?.meta?.nextCursor) query.set("cursor", previousPageData.meta.nextCursor);
    return `/api/production-planning/material-verify/material-options?${query.toString()}`;
  }, [deferredSearchText, supplementalDocKey]);

  const {
    data: materialPages = [],
    error,
    isLoading,
    isValidating,
    size: materialPageCount,
    setSize: setMaterialPageCount,
  } = useSWRInfinite(getMaterialPageKey, fetcher, {
    revalidateOnFocus: false,
    revalidateFirstPage: false,
  });

  const materialOptions = useMemo(() => {
    const map = new Map();
    materialPages.forEach((page) => {
      (Array.isArray(page?.data) ? page.data : []).forEach((row) => {
        map.set(buildMaterialOptionKey(row), row);
      });
    });
    return Array.from(map.values());
  }, [materialPages]);

  const existingKeys = useMemo(() => {
    return new Set((state?.lines || []).map((line) => buildSupplementalLineKey(line)));
  }, [state]);

  const { options, existingOptions } = useMemo(() => {
    const available = [];
    const existing = [];
    materialOptions.forEach((row) => {
      const code = String(row?.goodsCode || row?.skuCode || "").trim().toUpperCase();
      if (!code) return;
      (existingKeys.has(code) ? existing : available).push(row);
    });
    return { options: available, existingOptions: existing };
  }, [existingKeys, materialOptions]);
  const loadedOptionCount = materialOptions.length;
  const lastMaterialPage = materialPages[materialPages.length - 1] || null;
  const hasMoreMaterials = Boolean(lastMaterialPage?.meta?.hasMore);

  const selectedOption = useMemo(
    () => options.find((option) => buildMaterialOptionKey(option) === selectedKey) || null,
    [options, selectedKey]
  );

  const selectedDateOption = useMemo(
    () => dateOptions.find((option) => option.value === state?.workDate) || null,
    [dateOptions, state?.workDate]
  );

  if (!state || !document) return null;

  const lines = Array.isArray(state.lines) ? state.lines : [];
  const totalQty = roundQty(lines.reduce((sum, line) => sum + toNumber(line.qty), 0));
  const canExport = Boolean(state.workDate && state.reason && lines.length > 0 && !exporting);

  return (
    <div className="fixed inset-0 z-[130] flex justify-end bg-[var(--surface-navy,#102C57)]/45">
      <aside className="flex h-full w-full max-w-[calc(100vw-24px)] flex-col overflow-hidden border-l-2 border-[#102C57] bg-white shadow-none">
        <div className="border-b-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="min-w-[240px]">
              <div className="text-[10px] font-black uppercase tracking-[2px] text-[#f6e7a8]">
                Supplemental Requisition
              </div>
              <h3 className="mt-1 text-2xl font-black tracking-[0.5px] text-white">ใบเบิกเพิ่มเติม</h3>
              <p className="mt-1 text-xs font-bold text-white/70">
                สำหรับวันที่ที่ Export ใบเบิกหลักแล้วเท่านั้น และเลขเอกสารจะรันต่อจากใบเบิกจริง
              </p>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,360px)_minmax(300px,1fr)] 2xl:max-w-[980px]">
              <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[1px] text-white/80">
                วันที่ที่ใบหลัก Export แล้ว
                <select
                  value={state.workDate || ""}
                  onChange={(event) => onChangeDate(event.target.value)}
                  className="h-10 rounded-[2px] border-2 border-white/30 bg-white px-3 text-xs font-bold text-black outline-none focus:border-[#d4af37]"
                >
                  {dateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} {option.documentNo ? `(${option.documentNo})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[1px] text-white/80">
                เหตุผลการเบิกเพิ่มเติม
                <input
                  value={state.reason || ""}
                  onChange={(event) => onChangeReason(event.target.value)}
                  placeholder="เช่น ของหน้างานไม่พอ / เสียหาย / ใช้จริงเกิน"
                  className="h-10 rounded-[2px] border-2 border-white/30 bg-white px-3 text-xs font-bold text-black placeholder-[#98a2b3] outline-none focus:border-[#d4af37]"
                />
              </label>
            </div>
            <div className="flex shrink-0 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={exporting}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[2px] border border-white/25 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden xl:grid-cols-[620px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-r-2 border-[#102C57] bg-white">
            <div className="border-b border-[#CCCCCC] px-5 py-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[1.4px] text-black">
                เพิ่มวัตถุดิบ
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8F8F8F]" />
                <input
                  value={searchText}
                  onChange={(event) => {
                    setSearchText(event.target.value);
                    setSelectedKey("");
                  }}
                  placeholder="ค้นหารหัสหรือชื่อวัตถุดิบ..."
                  className="h-10 w-full rounded-[2px] border-2 border-[#102C57] bg-white pl-10 pr-3 text-xs font-bold text-black placeholder-[#98a2b3] outline-none"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={qtyText}
                  onChange={(event) => setQtyText(event.target.value)}
                  className="h-10 w-28 rounded-[2px] border-2 border-[#CCCCCC] bg-white px-3 text-right text-xs font-black text-black outline-none focus:border-[#102C57]"
                  placeholder="จำนวน"
                />
                <button
                  type="button"
                  disabled={!selectedOption || roundQty(qtyText) <= 0}
                  onClick={() => {
                    if (!selectedOption) return;
                    onAddLine(selectedOption, roundQty(qtyText));
                    setSelectedKey("");
                    setQtyText("1");
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] px-3 py-2 text-xs font-black uppercase tracking-[1px] text-white transition hover:bg-[var(--surface-navy,#0c2345)] disabled:cursor-not-allowed disabled:border-[#CCCCCC] disabled:bg-[#CCCCCC] disabled:text-[#8F8F8F]"
                >
                  <Plus className="h-4 w-4" />
                  เพิ่มในใบ
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[1px] text-[#667085]">
                Catalog {loadedOptionCount.toLocaleString("th-TH")} รายการ
              </div>
              <div className="overflow-hidden rounded-[2px] border border-[#CCCCCC] bg-white">
                <table className="w-full table-fixed border-collapse text-xs text-black">
                  <thead className="sticky top-0 z-10 bg-[var(--surface-navy,#102C57)] text-white">
                    <tr>
                      <th className="w-[24%] border-r border-white/20 px-3 py-2 text-left font-black uppercase tracking-[0.7px]">
                        รหัส
                      </th>
                      <th className="border-r border-white/20 px-3 py-2 text-left font-black uppercase tracking-[0.7px]">
                        ชื่อวัตถุดิบ
                      </th>
                      <th className="w-[22%] px-3 py-2 text-left font-black uppercase tracking-[0.7px]">
                        หน่วย
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((option) => {
                      const optionKey = buildMaterialOptionKey(option);
                      const active = optionKey === selectedKey;
                      return (
                        <tr
                          key={optionKey}
                          onClick={() => setSelectedKey(optionKey)}
                          className={`cursor-pointer border-b border-[#E5E7EB] transition last:border-b-0 ${
                            active ? "bg-[var(--surface-navy,#102C57)] text-white" : "bg-white hover:bg-[#F5F7FA]"
                          }`}
                        >
                          <td
                            className={`px-3 py-2 align-top font-mono font-black ${
                              active ? "text-white" : "text-[#102C57]"
                            }`}
                          >
                            {option.goodsCode || option.skuCode}
                          </td>
                          <td className="px-3 py-2 align-top font-bold leading-snug">
                            <div className="line-clamp-2">{option.name}</div>
                          </td>
                          <td className="px-3 py-2 align-top font-bold text-[#667085]">
                            <span className={active ? "text-white/80" : ""}>{option.unit || "-"}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {existingOptions.length > 0 ? (
                      <tr>
                        <td colSpan={3} className="bg-[#F5F7FA] px-3 py-2 text-[10px] font-black uppercase tracking-[1px] text-[#8F8F8F]">
                          มีในเอกสารนี้แล้ว — เพิ่มซ้ำไม่ได้
                        </td>
                      </tr>
                    ) : null}
                    {existingOptions.map((option) => {
                      const optionKey = buildMaterialOptionKey(option);
                      return (
                        <tr
                          key={`existing-${optionKey}`}
                          className="cursor-not-allowed border-b border-[#E5E7EB] bg-[#FCFCF9] opacity-60"
                          title="มีในเอกสารแล้ว"
                        >
                          <td className="px-3 py-2 align-top font-mono font-black text-[#667085]">
                            {option.goodsCode || option.skuCode}
                          </td>
                          <td className="px-3 py-2 align-top font-bold leading-snug text-[#667085]">
                            <div className="line-clamp-2">{option.name}</div>
                            <span className="mt-1 inline-flex rounded-[2px] border border-[#d4af37] bg-[#fff8e2] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.5px] text-[#8a6a00]">
                              มีในเอกสารแล้ว
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top font-bold text-[#667085]">{option.unit || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!isLoading && !error && options.length === 0 && existingOptions.length === 0 ? (
                  <div className="border-t border-dashed border-[#CCCCCC] px-4 py-8 text-center text-xs font-bold text-[#8F8F8F]">
                    ไม่พบวัตถุดิบที่เลือกได้
                  </div>
                ) : null}
                {isLoading ? (
                  <div className="border-t border-[#CCCCCC] px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                    กำลังโหลดวัตถุดิบ...
                  </div>
                ) : null}
                {hasMoreMaterials ? (
                  <div className="border-t border-[#CCCCCC] bg-white px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setMaterialPageCount(materialPageCount + 1)}
                      disabled={isLoading || isValidating}
                      className="rounded-[2px] border-2 border-[#102C57] bg-white px-4 py-2 text-xs font-black uppercase tracking-[1px] text-[#102C57] transition hover:border-[#d4af37] disabled:opacity-50"
                    >
                      โหลดเพิ่ม
                    </button>
                  </div>
                ) : null}
                {error ? (
                  <div className="border-t border-[#CCCCCC] px-4 py-8 text-center text-xs font-bold text-red-600">
                    {String(error?.message || "โหลดวัตถุดิบไม่สำเร็จ")}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto overflow-x-hidden bg-[#e9edf3] p-5">
            <div className="mx-auto w-full max-w-[1040px]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-[2px] border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-3 py-1 text-[10px] font-black uppercase tracking-[1px] text-white">
                  Supplemental Draft
                </span>
                <span className="rounded-[2px] border border-[#d4af37] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[1px] text-[#8a6a00]">
                  ใบหลัก Export แล้ว {selectedDateOption?.documentNo || ""}
                </span>
              </div>

              <div className="min-h-[520px] overflow-hidden rounded-[2px] border-2 border-[#102C57] bg-white shadow-none">
                <div className="flex items-start justify-between gap-4 bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[2px] text-[#f6e7a8]">
                      A5 Landscape
                    </div>
                    <h4 className="mt-1 text-2xl font-black tracking-[0.5px]">ใบเบิกเพิ่มเติม</h4>
                    <p className="mt-1 text-xs font-bold text-white/70">สำหรับวันที่ที่ Export ใบเบิกหลักแล้ว</p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-[1px] text-[#f6e7a8]">เลขเอกสาร</div>
                    <div className="mt-1 font-mono text-sm font-black text-white">รันตอน Export</div>
                    <div className="mt-1 text-[10px] font-bold text-white/70">รันต่อจากใบเบิกหลักล่าสุด</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 border-b border-black text-xs font-bold text-black">
                  <div className="border-r border-black p-3">
                    <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">แผนหลัก</div>
                    <div className="mt-1 font-mono text-sm font-black">{document.masterPlanNo || state.masterPlanNo || "-"}</div>
                  </div>
                  <div className="border-r border-black p-3">
                    <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">วันที่เบิก</div>
                    <div className="mt-1 text-sm font-black text-[#8a6a00]">{formatDate(state.workDate)}</div>
                  </div>
                  <div className="border-r border-black p-3">
                    <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">แผนก</div>
                    <div className="mt-1 text-sm font-black">{document.ownerDepartmentName || document.ownerDepartmentCode || "-"}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">ห้องจัดเตรียม</div>
                    <div className="mt-1 text-sm font-black">{formatRoomName(document.roomLabel, document.roomId)}</div>
                  </div>
                </div>

                <div className="border-b border-black bg-white px-4 py-2 text-xs font-bold text-black">
                  เหตุผล: {state.reason || "-"}
                </div>

                <table className="w-full table-fixed border-collapse text-xs text-black">
                  <thead className="bg-[#F5F7FA]">
                    <tr>
                      <th className="w-[15%] border-r border-b border-black px-3 py-2 text-left font-black">รหัส</th>
                      <th className="border-r border-b border-black px-3 py-2 text-left font-black">รายการวัตถุดิบ</th>
                      <th className="w-[10%] border-r border-b border-black px-2 py-2 text-center font-black">หน่วย</th>
                      <th className="w-[12%] border-r border-b border-black px-2 py-2 text-right font-black">จำนวน</th>
                      <th className="w-[18%] border-b border-black px-3 py-2 text-left font-black">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={buildSupplementalLineKey(line)} className="bg-white">
                        <td className="border-r border-b border-black px-3 py-2 font-mono font-black text-[#102C57]">
                          {line.materialGoodsCode}
                        </td>
                        <td className="border-r border-b border-black px-3 py-2 font-bold leading-snug">{line.materialName}</td>
                        <td className="border-r border-b border-black px-2 py-2 text-center font-bold">{line.unit || "-"}</td>
                        <td className="border-r border-b border-black px-2 py-2 text-right">
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.qty}
                            onChange={(event) => onUpdateLine(buildSupplementalLineKey(line), { qty: event.target.value })}
                            className="h-8 w-full rounded-[2px] border border-[#CCCCCC] px-2 text-right text-xs font-black outline-none focus:border-[#102C57]"
                          />
                        </td>
                        <td className="border-b border-black px-2 py-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={line.note || ""}
                              onChange={(event) => onUpdateLine(buildSupplementalLineKey(line), { note: event.target.value })}
                              className="h-8 min-w-0 flex-1 rounded-[2px] border border-[#CCCCCC] px-2 text-xs font-bold outline-none focus:border-[#102C57]"
                              placeholder="หมายเหตุ"
                            />
                            <button
                              type="button"
                              onClick={() => onRemoveLine(buildSupplementalLineKey(line))}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[#102C57] text-[#102C57] hover:bg-[var(--surface-navy,#102C57)] hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!lines.length ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-[1px] text-[#8F8F8F]">
                          เพิ่มวัตถุดิบเพื่อสร้างใบเบิกเพิ่มเติม
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-3 rounded-[2px] border-2 border-[#102C57] bg-white p-4 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">จำนวนรายการ</div>
                  <div className="mt-1 text-xl font-black text-[#102C57]">{lines.length.toLocaleString("th-TH")}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">ยอดรวม</div>
                  <div className="mt-1 text-xl font-black text-[#8a6a00]">{formatQty(totalQty)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">Export</div>
                  <div className="mt-1 text-xs font-bold text-black">ใช้ logic เดียวกับใบเบิกจริง</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t-2 border-[#102C57] bg-white px-5 py-4">
          <div className="text-xs font-bold text-[#667085]">
            {canExport ? "พร้อม Export Excel ใบเบิกเพิ่มเติม" : "กรอกวันที่ เหตุผล และวัตถุดิบให้ครบก่อน Export"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={exporting}
              className="rounded-[2px] border-2 border-[#102C57] bg-white px-4 py-2 text-xs font-black uppercase tracking-[1.2px] text-[#102C57] transition hover:bg-slate-50 disabled:opacity-50"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!canExport}
              className="inline-flex items-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 py-2 text-xs font-black uppercase tracking-[1.2px] text-white transition hover:bg-[var(--surface-navy,#0c2345)] disabled:cursor-not-allowed disabled:border-[#CCCCCC] disabled:bg-[#CCCCCC] disabled:text-[#8F8F8F]"
            >
              <Download className="h-4 w-4" />
              {exporting ? "กำลัง Export..." : "Export Excel"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DeleteConfirmModal({ state, onCancel, onConfirm, saving, error }) {
  if (!state) return null;
  return <RequisitionDialog title="ลบรายการนี้?" onClose={onCancel} busy={saving} footer={<>
    <button type="button" onClick={onCancel} disabled={saving}>ยกเลิก</button>
    <button type="button" className={dialogStyles.danger} onClick={onConfirm} disabled={saving}>{saving ? "กำลังลบ..." : "ลบรายการ"}</button>
  </>}>
    <p>วัตถุดิบ : <span className={dialogStyles.code}>{state.materialGoodsCode || state.materialSkuCode}</span> · {state.materialName || "-"}</p>
    <p>หน่วย : {state.unit || "-"}</p>
    <p className="mt-2">ลบวัตถุดิบนี้ทั้งแถว เฉพาะแถวที่ยังไม่มีการ Export เท่านั้น โดยจะเก็บยอดและ LOT ที่ Export แล้วไว้</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </RequisitionDialog>;
}

function ExportExcelModal({
  open,
  selectedDate,
  dateColumns,
  departments,
  selectedDepartmentIdsDaily,
  selectedDepartmentIdsWeekly,
  onClose,
  onChangeDate,
  onToggleDepartment,
  onSubmit,
  submitting = false,
}) {
  if (!open) return null;

  return <RequisitionDialog title="Export Excel" wide onClose={onClose} busy={submitting} footer={<>
    <button type="button" onClick={onClose} disabled={submitting}>ยกเลิก</button>
    <button type="button" className={dialogStyles.primary} onClick={onSubmit} disabled={submitting}>{submitting ? "กำลัง Export..." : "Export Excel"}</button>
  </>}><p className="mb-3">เลือกแผนกสำหรับรายวันและรายสัปดาห์ · แผนกเดียวกันเลือกได้ทั้งสองกลุ่ม</p><div className={dialogStyles.exportBody + " space-y-4"}>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-[2px] border border-[#d0d5dd] bg-[#fcfcf9] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[1.4px] text-[#667085]">รายวัน</div>
                  <div className="mt-1 text-xs font-bold text-[#475467]">เลือกแผนกที่ต้องออกเป็นใบรายวัน</div>
                </div>
                <CalendarDays className="h-5 w-5 text-[#102C57]" />
              </div>
              <select
                value={selectedDate}
                onChange={(event) => onChangeDate(event.target.value)}
                className="mb-3 h-11 w-full rounded-[2px] border border-[#d0d5dd] bg-white px-3 text-sm font-bold text-[#102C57] outline-none focus:border-[#102C57]"
              >
                <option value="">เลือกวันที่สำหรับรายวัน</option>
                {dateColumns.map((dateValue) => (
                  <option key={dateValue} value={dateValue}>
                    {formatDate(dateValue)}
                  </option>
                ))}
              </select>
              <div className="grid max-h-[320px] gap-2 overflow-y-auto">
                {departments.map((department) => {
                  const checked = selectedDepartmentIdsDaily.includes(department.id);
                  return (
                    <label
                      key={`daily-${department.id}`}
                      className={`flex cursor-pointer items-center gap-3 rounded-[2px] border px-3 py-2 text-sm font-bold transition ${
                        checked
                          ? "border-[#9fc7f5] bg-[#eaf4ff] text-[#102C57]"
                          : "border-[#e4e7ec] bg-white text-[#344054]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleDepartment("daily", department.id)}
                        className="h-4 w-4 rounded border-[#cbd5e1] text-[#102C57] focus:ring-[#102C57]"
                      />
                      <span className="truncate">{department.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[2px] border border-[#d0d5dd] bg-[#fcfcf9] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[1.4px] text-[#667085]">รายสัปดาห์</div>
                  <div className="mt-1 text-xs font-bold text-[#475467]">เลือกแผนกที่ต้องออกเป็นใบสรุปรายสัปดาห์</div>
                </div>
                <FileSpreadsheet className="h-5 w-5 text-[#102C57]" />
              </div>
              <div className="mb-3 rounded-[2px] border border-[#9fc7f5] bg-[#eaf4ff] px-3 py-2 text-xs font-bold text-[#102C57]">
                ใช้ช่วงวันที่ของแผนที่เลือกอยู่ด้านหลังอัตโนมัติ
              </div>
              <div className="grid max-h-[320px] gap-2 overflow-y-auto">
                {departments.map((department) => {
                  const checked = selectedDepartmentIdsWeekly.includes(department.id);
                  return (
                    <label
                      key={`weekly-${department.id}`}
                      className={`flex cursor-pointer items-center gap-3 rounded-[2px] border px-3 py-2 text-sm font-bold transition ${
                        checked
                          ? "border-[#9fc7f5] bg-[#eaf4ff] text-[#102C57]"
                          : "border-[#e4e7ec] bg-white text-[#344054]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleDepartment("weekly", department.id)}
                        className="h-4 w-4 rounded border-[#cbd5e1] text-[#102C57] focus:ring-[#102C57]"
                      />
                      <span className="truncate">{department.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-3 rounded-[2px] border border-[#d0d5dd] bg-[#fcfcf9] p-4 md:grid-cols-3">
            <div className="rounded-[2px] border border-[#102C57]/15 bg-white px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">แผนกที่เลือกออกใบรายวัน</div>
              <div className="mt-1 text-lg font-black text-[#102C57]">
                {selectedDepartmentIdsDaily.length.toLocaleString("th-TH")}
              </div>
            </div>
            <div className="rounded-[2px] border border-[#102C57]/15 bg-white px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">แผนกที่เลือกออกใบรายสัปดาห์</div>
              <div className="mt-1 text-lg font-black text-[#102C57]">
                {selectedDepartmentIdsWeekly.length.toLocaleString("th-TH")}
              </div>
            </div>
            <div className="rounded-[2px] border border-[#102C57]/15 bg-white px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[1px] text-[#667085]">วันที่รายวันที่จะออก</div>
              <div className="mt-1 text-lg font-black text-[#8f2d1f]">
                {selectedDate ? formatDate(selectedDate) : "-"}
              </div>
            </div>
          </div>
        </div>
  </RequisitionDialog>;
}

function ExportErrorPopup({ message, onClose }) {
  if (!message) return null;
  return <RequisitionDialog title="ส่งออกไฟล์ไม่สำเร็จ" onClose={onClose} footer={<button type="button" className={dialogStyles.primary} onClick={onClose}>รับทราบ</button>}>
    <p role="alert" className="whitespace-pre-wrap break-words">{message}</p>
    <p className="mt-3">กรุณาตรวจสอบข้อมูลตามข้อความข้างต้น แล้วลอง Export ใหม่อีกครั้ง</p>
  </RequisitionDialog>;
}

function getLotRequirementRefs(line, column) {
  const lineKey = buildLineKey(line);
  const breakdown = Array.isArray(line?.breakdownByPreviewColumn?.[column?.key])
    ? line.breakdownByPreviewColumn[column.key]
    : [];
  if (breakdown.length) {
    return breakdown
      .filter((item) => toNumber(item?.qty) > 0 && item?.sourceDocumentKey)
      .map((item) => ({
        key: buildLotRequirementKey(item.sourceDocumentKey, line, column.dateValue),
        documentKey: item.sourceDocumentKey,
        lineKey,
        dateValue: column.dateValue,
        qty: roundQty(item.qty),
      }));
  }
  const qty = roundQty(resolveRequisitionPreviewCellQty({ line, column }));
  const documentKeys = normalizeDocumentKeys(
    column?.sourceDocumentKeys?.length ? column.sourceDocumentKeys : column?.sourceDocumentKey
  );
  if (qty <= 0 || !documentKeys.length) return [];
  return [{
    key: buildLotRequirementKey(documentKeys[0], line, column.dateValue),
    documentKey: documentKeys[0],
    lineKey,
    dateValue: column.dateValue,
    qty,
  }];
}

function aggregateLotRows(requirements, lotPreviewByKey, savedRows = [], savedSource = "ERP") {
  const map = new Map();
  (Array.isArray(savedRows) ? savedRows : []).forEach((allocation) => {
    const lotNo = String(allocation?.lotNo || "").trim();
    const warehouseCode = String(allocation?.warehouseCode || "").trim();
    const key = `${lotNo}|${warehouseCode}`;
    if (!map.has(key)) map.set(key, { lotNo, warehouseCode, fifoDate: allocation?.fifoDate || null, qty: 0, source: savedSource });
    map.get(key).qty = roundQty(map.get(key).qty + toNumber(allocation?.qty));
  });
  requirements.forEach((requirement) => {
    const preview = lotPreviewByKey?.[requirement.key];
    (preview?.allocations || []).forEach((allocation) => {
      const lotNo = String(allocation?.lotNo || "").trim();
      const key = `${lotNo}|${String(allocation?.warehouseCode || "").trim()}`;
      if (!map.has(key)) {
        map.set(key, {
          lotNo,
          warehouseCode: String(allocation?.warehouseCode || "").trim(),
          fifoDate: allocation?.fifoDate || null,
          qty: 0,
        });
      }
      map.get(key).qty = roundQty(map.get(key).qty + toNumber(allocation?.qty));
    });
  });
  return Array.from(map.values()).sort((left, right) => {
    const dateCompare = String(left.fifoDate || "").localeCompare(String(right.fifoDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(left.lotNo || "").localeCompare(String(right.lotNo || ""), "th", { numeric: true });
  });
}

function collectSavedLotRows(line) {
  const erpLotsByDate = line?.erpLotsByDate || {};
  const exportedLotsByDate = line?.exportedLotsByDate || {};
  const dates = new Set([...Object.keys(erpLotsByDate), ...Object.keys(exportedLotsByDate)]);
  return Array.from(dates).flatMap((dateValue) => {
    const erpRows = Array.isArray(erpLotsByDate[dateValue]) ? erpLotsByDate[dateValue] : [];
    const exportedRows = Array.isArray(exportedLotsByDate[dateValue]) ? exportedLotsByDate[dateValue] : [];
    return erpRows.length ? erpRows : exportedRows;
  });
}

function applyConfirmedLotAllocations(current, updates) {
  const next = { ...(current || {}) };
  (Array.isArray(updates) ? updates : []).forEach((update) => {
    const previous = next[update.key] || {};
    const allocations = (Array.isArray(update.allocations) ? update.allocations : []).map((allocation) => {
      const option = (previous.options || []).find((item) => item.lotNo === allocation.lotNo) || {};
      return { ...option, lotNo: allocation.lotNo, qty: roundQty(allocation.qty) };
    });
    const allocatedQty = roundQty(allocations.reduce((sum, item) => sum + toNumber(item.qty), 0));
    next[update.key] = {
      ...previous,
      requiredQty: roundQty(update.qty),
      allocatedQty,
      shortageQty: roundQty(Math.max(0, toNumber(update.qty) - allocatedQty)),
      complete: Math.abs(toNumber(update.qty) - allocatedQty) <= 0.001,
      allocations,
    };
  });
  return next;
}

export function RequisitionDocument({
  doc,
  masterPlanNo,
  active = false,
  pageColumns,
  editable = false,
  showExportState = true,
  onManage,
  onDeleteLine,
  onSupplemental,
  onReset,
  onHide,
  onUpdateQty,
  lotPreviewByKey,
  lotPreviewStatus,
  onSaveLotAllocations,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [breakdownState, setBreakdownState] = useState(null);
  const [expandedLineKeys, setExpandedLineKeys] = useState(() => new Set());
  const [lotEditorState, setLotEditorState] = useState(null);
  const [lotEditorDraft, setLotEditorDraft] = useState({});
  const [lotReservationDetails, setLotReservationDetails] = useState(null);
  const displayColumns = pageColumns.flatMap((dateValue) => {
    const matchingColumns = (Array.isArray(doc?.previewColumns) ? doc.previewColumns : [])
      .filter((column) => column.dateValue === dateValue);
    if (matchingColumns.length) return matchingColumns;
    return [{
      key: `${doc.documentKey}::empty::${dateValue}`,
      dateValue,
      sourceDocumentKey: doc?.sourceDocumentKeyByDate?.[dateValue] || doc.documentKey,
      productCode: "",
      productName: "",
      workNames: [],
      documentNo: String(doc?.documentNoByDate?.[dateValue] || "").trim(),
      exported: doc?.exportedByDate?.[dateValue] === true,
      isPlaceholder: true,
    }];
  });
  const dateGroups = pageColumns.map((dateValue) => ({
    dateValue,
    columns: displayColumns.filter((column) => column.dateValue === dateValue),
  }));
  const actionColspan = 6 + displayColumns.length + (editable ? 1 : 0);
  const shiftLabel = formatShiftName(doc);
  const actionDocumentKeys = normalizeDocumentKeys(
    doc?.sourceDocumentKeys?.length ? doc.sourceDocumentKeys : doc.documentKey
  );
  const actionDocumentKey = actionDocumentKeys[0] || doc.documentKey;
  const isColumnExported = (column) => showExportState && column?.exported === true;
  const tableMinWidth = Math.max(1120, 660 + (displayColumns.length * 88));
  const lotEditorRequiredQty = roundQty(
    (lotEditorState?.requirements || []).reduce((sum, item) => sum + toNumber(item?.qty), 0)
  );
  const lotEditorOptions = useMemo(() => {
    const map = new Map();
    (lotEditorState?.requirements || []).forEach((requirement) => {
      const preview = lotPreviewByKey?.[requirement.key];
      (preview?.options || []).forEach((option) => {
        const key = `${String(option?.lotNo || "").trim()}|${String(option?.warehouseCode || "").trim()}`;
        const current = map.get(key);
        if (!current || toNumber(option?.availableQty) > toNumber(current?.availableQty)) {
          map.set(key, { ...option, key });
        }
      });
    });
    return Array.from(map.values()).sort((left, right) => {
      const dateCompare = String(left?.fifoDate || "").localeCompare(String(right?.fifoDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(left?.lotNo || "").localeCompare(String(right?.lotNo || ""), "th", { numeric: true });
    });
  }, [lotEditorState, lotPreviewByKey]);
  const lotEditorAllocatedQty = roundQty(
    Object.values(lotEditorDraft).reduce((sum, qty) => sum + toNumber(qty), 0)
  );
  const openLotEditor = (state) => {
    setLotReservationDetails(null);
    const rows = aggregateLotRows(state.requirements || [], lotPreviewByKey);
    setLotEditorDraft(Object.fromEntries(rows.map((row) => [
      `${row.lotNo}|${row.warehouseCode}`,
      roundQty(row.qty),
    ])));
    setLotEditorState(state);
  };

  return (
    <RequisitionPaper id={requisitionDocumentId(doc.documentKey)} documentKey={doc.documentKey} active={active}
      department={doc.ownerDepartmentName || doc.ownerDepartmentCode} masterPlanNo={masterPlanNo}
      creator={doc.qaDepartmentName || doc.qaDepartmentCode || "-"} shift={shiftLabel}
      room={formatRoomName(doc.roomLabel, doc.roomId)} period={`${formatDate(pageColumns[0])} – ${formatDate(pageColumns[pageColumns.length - 1])}`}
      dateAction={
              <button type="button" aria-label={collapsed ? "ขยายใบเบิก" : "ย่อใบเบิก"} aria-expanded={!collapsed} aria-controls={requisitionDocumentId(doc.documentKey) + "-table"} onClick={() => setCollapsed((value) => !value)}>
                <ChevronDown className={collapsed ? "h-4 w-4" : "h-4 w-4 rotate-180"} />
              </button>
      }
      actions={editable ? <RequisitionDocumentActions document={doc} dateColumns={pageColumns} onManage={onManage} onSupplemental={onSupplemental} onReset={onReset} onHide={onHide} /> : null}>
          <RequisitionPaperTable id={requisitionDocumentId(doc.documentKey) + "-table"} hidden={collapsed} minWidth={tableMinWidth}>
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "290px" }} />
              <col style={{ width: "70px" }} />
              {displayColumns.map((column) => <col key={`${doc.documentKey}-col-${column.key}`} style={{ width: "88px" }} />)}
              <col style={{ width: "75px" }} />
              <col style={{ width: "85px" }} />
              {editable && <col style={{ width: "48px" }} />}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={3} className="border-r border-b px-1 py-2 text-center">#</th>
                <th rowSpan={3} className="sticky left-0 z-30 border-r border-b border-black bg-[#f8f4d8] px-2 py-2 text-center text-xs font-black text-black shadow-[2px_0_0_#000]">
                  รหัสวัตถุดิบ
                </th>
                <th rowSpan={3} className="sticky left-[110px] z-30 border-r border-b border-black bg-[#f8f4d8] px-2 py-2 text-center text-xs font-black text-black shadow-[2px_0_0_#000]">
                  รายการวัตถุดิบ
                </th>
                <th rowSpan={3} className="border-r border-b border-black bg-[#f8f4d8] px-1.5 py-2 text-center text-xs font-black text-black">
                  หน่วย
                </th>
                {dateGroups.map(({ dateValue, columns }, index) => (
                  <th
                    key={`${doc.documentKey}-day-${dateValue}`}
                    colSpan={columns.length}
                    data-day-tone={index % DAY_TONE_CLASSES.length}
                    data-exported={columns.every(isColumnExported)}
                    className={`border-r border-b border-black px-1.5 py-1.5 text-center text-[10px] font-black text-black ${
                      columns.every(isColumnExported) ? "bg-[#d1d5db]" : DAY_TONE_CLASSES[index % DAY_TONE_CLASSES.length]
                    }`}
                  >
                    <span className="block">{formatDayHeader(dateValue).weekday}</span>
                    <span>{formatDayHeader(dateValue).date}</span>
                    {columns.some(isColumnExported) ? (
                      <span className={presentation.exportLock} role="img" aria-label={columns.every(isColumnExported) ? "Export แล้ว แก้ไขไม่ได้" : "มีรายการที่ Export แล้ว"} title={columns.every(isColumnExported) ? "Export แล้ว แก้ไขไม่ได้" : "มีรายการที่ Export แล้ว"}>
                        <LockKeyhole size={11} aria-hidden="true" />
                      </span>
                    ) : null}
                  </th>
                ))}
                <th data-total-column rowSpan={3} className="w-[6%] border-b border-black px-2 py-3 text-center text-xs">
                  ยอดรวม
                </th>
                <th rowSpan={3} className="border-r border-b border-black bg-[#f8f4d8] px-2 py-3 text-center text-xs font-black text-black">
                  สถานะ LOT
                </th>
                {editable && <th rowSpan={3} className="border-b border-r border-black px-2 py-2 text-center text-xs">ลบ</th>}
              </tr>
              <tr>
                {displayColumns.map((column) => {
                  const workNames = Array.isArray(column.workNames) ? column.workNames : [];
                  const productLabel = column.productName || workNames.join(" / ");
                  return (
                    <th
                      key={`${doc.documentKey}-work-${column.key}`}
                      className={`min-h-[46px] border-r border-b border-black px-1 py-1.5 text-center text-[9px] font-bold leading-[1.15] text-black ${
                        isColumnExported(column) ? "bg-[#e5e7eb]" : "bg-white"
                      }`}
                    >
                      <RequisitionWorkLabel name={productLabel} code={column.productCode} />
                    </th>
                  );
                })}
              </tr>
              <tr>
                {displayColumns.map((column) => (
                  <th
                    key={`${doc.documentKey}-qty-${column.key}`}
                    className={`border-r border-b border-black px-1 py-1 text-center text-[10px] font-black text-black ${
                      isColumnExported(column) ? "bg-[#d1d5db]" : "bg-[#fff8e2]"
                    }`}
                  >
                    จำนวน
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(doc.lines || []).map((line, lineIndex) => {
                const lineKey = buildLineKey(line);
                const requirementsByColumn = new Map(
                  displayColumns.map((column) => [
                    column.key,
                    isColumnExported(column) ? [] : getLotRequirementRefs(line, column),
                  ])
                );
                const allRequirements = Array.from(requirementsByColumn.values()).flat();
                const erpLotRows = Object.values(line?.erpLotsByDate || {}).flat();
                const exportedLotRows = Object.values(line?.exportedLotsByDate || {}).flat();
                const savedLotRows = collectSavedLotRows(line);
                const savedLotSource = erpLotRows.length > 0 && exportedLotRows.length > 0
                  ? "ERP / EXPORT"
                  : erpLotRows.length > 0 ? "ERP" : "EXPORT";
                const lotRows = aggregateLotRows(allRequirements, lotPreviewByKey, savedLotRows, savedLotSource);
                const isErpActual = erpLotRows.length > 0;
                const isExportSnapshot = !isErpActual && exportedLotRows.length > 0;
                const isExpanded = expandedLineKeys.has(lineKey);
                const isLotComplete = allRequirements.length > 0
                  && allRequirements.every((requirement) => lotPreviewByKey?.[requirement.key]?.complete === true);
                const hasAllocatedLot = allRequirements.some(
                  (requirement) => toNumber(lotPreviewByKey?.[requirement.key]?.allocatedQty) > 0
                );
                return (
                  <Fragment key={`${doc.documentKey}-${lineKey}`}>
                    <tr data-lot-expanded={isExpanded} className={`transition-colors hover:bg-slate-50 ${isExpanded ? "bg-[#eef5ff]" : ""}`}>
                      <td className="border-r border-b text-center">{lineIndex + 1}</td>
                      <td className={`sticky left-0 z-10 border-r border-b border-black px-2 py-2 font-mono text-xs font-bold tracking-[0.2px] text-black shadow-[2px_0_0_#000] ${isExpanded ? "bg-[#eef5ff]" : "bg-white"}`}>
                        <button
                          type="button"
                          onClick={() => setExpandedLineKeys((current) => {
                            const next = new Set(current);
                            if (next.has(lineKey)) next.delete(lineKey);
                            else next.add(lineKey);
                            return next;
                          })}
                          className="inline-flex items-center gap-1.5 text-left font-mono font-black text-[#0866d6]"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {line.materialGoodsCode || line.materialSkuCode}
                        </button>
                      </td>
                      <td className={`sticky left-[110px] z-10 border-r border-b border-black px-2 py-2 text-xs font-bold leading-[1.2] text-black shadow-[2px_0_0_#000] ${isExpanded ? "bg-[#eef5ff]" : "bg-white"}`}>
                        {line.materialName}
                      </td>
                      <td className="border-r border-b border-black px-1.5 py-2 text-center text-xs font-bold text-black">
                        {line.unit || "-"}
                      </td>
                      {displayColumns.map((column) => {
                        const qty = resolveRequisitionPreviewCellQty({ line, column });
                        const breakdown = Array.isArray(line?.breakdownByPreviewColumn?.[column.key])
                          ? line.breakdownByPreviewColumn[column.key]
                          : [];
                        const requirements = requirementsByColumn.get(column.key) || [];
                        const canEditLot = editable && !column.exported && qty > 0 && requirements.length > 0;
                        const editableDocumentKey = resolveRequisitionEditableDocumentKey(column, actionDocumentKey);
                        const requiresSourceSelection = column.isDailyRoomConsolidated
                          && (column.sourceDocumentKeys?.length || 0) > 1;
                        const editableBreakdown = requiresSourceSelection
                          ? column.sourceDocumentKeys.map((sourceDocumentKey) => (
                            breakdown.find((item) => item.sourceDocumentKey === sourceDocumentKey)
                            || { sourceDocumentKey, productName: column.productName, qty: 0 }
                          ))
                          : breakdown;
                        return (
                          <td
                            key={`${doc.documentKey}-${lineKey}-${column.key}`}
                            data-exported={isColumnExported(column)}
                            data-quantity-cell
                            data-editable={editable && !column.exported && Boolean(editableDocumentKey || requiresSourceSelection)}
                            className="border-r border-b border-black px-1 py-1.5 text-center text-xs font-semibold"
                          >
                            {requiresSourceSelection && (breakdown.length > 1 || (editable && !column.exported)) ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setBreakdownState({
                                    materialCode: line.materialGoodsCode || line.materialSkuCode,
                                    materialName: line.materialName,
                                    unit: line.unit,
                                    dateValue: column.dateValue,
                                    totalQty: qty,
                                    lineKey,
                                    breakdown: editableBreakdown,
                                    isExported: column.exported === true,
                                  })}
                                  className="inline-flex items-center justify-center gap-1 px-1 py-0.5 font-black text-[#8a6a00] hover:bg-[#f6e7a8]"
                                  title={column.exported ? "ดูรายละเอียดยอดรวม" : "แก้ไขจำนวน"}
                                >
                                  <span>{formatQty(qty)}</span>
                                  {!column.exported && <Pencil className="h-3 w-3" aria-hidden="true" />}
                                </button>
                                {canEditLot ? (
                                  <button
                                    type="button"
                                    onClick={() => openLotEditor({ line, column, requirements })}
                                    className="border border-[#c49a00] bg-white px-1 py-0.5 text-[8px] font-black text-[#8a6a00] hover:bg-[#f6e7a8]"
                                    title={`เปลี่ยน LOT วันที่ ${formatDate(column.dateValue)}`}
                                  >
                                    LOT
                                  </button>
                                ) : null}
                              </div>
                            ) : canEditLot ? (
                              <div className="flex items-center justify-center gap-1">
                                <EditableQtyCell
                                  value={qty}
                                  onSave={(nextQty) => onUpdateQty(
                                    column.sourceDocumentKey || actionDocumentKey,
                                    lineKey,
                                    column.dateValue,
                                    nextQty
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => openLotEditor({ line, column, requirements })}
                                  className="border border-[#c49a00] bg-white px-1 py-0.5 text-[8px] font-black text-[#8a6a00] hover:bg-[#f6e7a8]"
                                  title={`เปลี่ยน LOT วันที่ ${formatDate(column.dateValue)}`}
                                >
                                  LOT
                                </button>
                              </div>
                            ) : editable && editableDocumentKey ? (
                              <EditableQtyCell
                                value={qty}
                                onSave={(nextQty) => onUpdateQty(
                                  editableDocumentKey,
                                  lineKey,
                                  column.dateValue,
                                  nextQty
                                )}
                              />
                            ) : formatQty(qty)}
                          </td>
                        );
                      })}
                      <td data-total-column className="border-b border-black px-2 py-2 text-right text-xs">
                        {formatQty(line.totalQty)}
                      </td>
                      <td className="border-r border-b border-black px-1.5 py-2 text-center text-[10px] font-black">
                        {lotPreviewStatus === "loading" ? (
                          <span className="text-[#667085]">กำลังจัด LOT</span>
                        ) : lotPreviewStatus === "error" ? (
                          <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="h-3.5 w-3.5" />โหลด LOT ไม่สำเร็จ</span>
                        ) : isErpActual ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Bplus</span>
                        ) : isExportSnapshot ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Export แล้ว</span>
                        ) : isLotComplete ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />ครบ</span>
                        ) : hasAllocatedLot ? (
                          <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />มี LOT บางส่วน</span>
                        ) : allRequirements.length ? (
                          <span className="text-[#667085]">ไม่มี LOT พร้อมใช้</span>
                        ) : <span className="text-[#98a2b3]">-</span>}
                      </td>
                      {editable && <td className="border-b border-r border-black px-2 py-2 text-center"><button type="button" className={presentation.deleteLineAction} disabled={isRequisitionLineExportLocked(doc, line)} title={isRequisitionLineExportLocked(doc, line) ? "มีการ Export แล้ว ไม่สามารถลบแถวนี้ได้" : "ลบวัตถุดิบทั้งแถว"} onClick={() => onDeleteLine?.(actionDocumentKeys, { ...line, lineKey, docKeys: actionDocumentKeys })}>ลบ</button></td>}
                    </tr>
                    {isExpanded ? lotRows.map((lotRow, lotIndex) => (
                      <tr key={`${doc.documentKey}-${lineKey}-lot-${lotRow.lotNo || "NO_LOT"}-${lotRow.warehouseCode}`} className="bg-[#f7faff] text-[10px] text-[#344054]">
                        <td className="border-r border-b" />
                        <td className="sticky left-0 z-10 border-r border-b border-[#b8c6d8] bg-[#f7faff] px-3 py-1.5 font-mono shadow-[2px_0_0_#b8c6d8]">
                          <span className="pl-5">└ LOT {lotRow.lotNo || "ไม่ระบุ"}</span>
                        </td>
                        <td className="sticky left-[110px] z-10 border-r border-b border-[#b8c6d8] bg-[#f7faff] px-2 py-1.5 shadow-[2px_0_0_#b8c6d8]">
                          คลัง {lotRow.warehouseCode || "-"}
                        </td>
                        <td className="border-r border-b border-[#b8c6d8] px-1 py-1.5 text-center">{line.unit || "-"}</td>
                        {displayColumns.map((column) => {
                          const rows = aggregateLotRows(
                            requirementsByColumn.get(column.key) || [],
                            lotPreviewByKey,
                            line?.erpLotsByDate?.[column.dateValue]?.length
                              ? line.erpLotsByDate[column.dateValue]
                              : line?.exportedLotsByDate?.[column.dateValue] || [],
                            line?.erpLotsByDate?.[column.dateValue]?.length ? "ERP" : "EXPORT"
                          );
                          const matched = rows.find((item) => item.lotNo === lotRow.lotNo && item.warehouseCode === lotRow.warehouseCode);
                          return (
                            <td key={`${lineKey}-${lotRow.lotNo}-${column.key}`} className="border-r border-b border-[#b8c6d8] px-1 py-1.5 text-center font-bold">
                              {formatQty(matched?.qty)}
                            </td>
                          );
                        })}
                        <td data-total-column className="border-b border-[#b8c6d8] px-2 py-1.5 text-right">{formatQty(lotRow.qty)}</td>
                        <td className="border-r border-b border-[#b8c6d8] px-1 py-1.5 text-center">
                          {lotRow.source ? (
                            <span className="bg-emerald-100 px-2 py-0.5 font-black text-emerald-800">{lotRow.source}</span>
                          ) : lotIndex === 0 ? (
                            <span className="bg-[#f4b400] px-2 py-0.5 font-black text-[#102C57]">FIFO</span>
                          ) : "-"}
                        </td>
                        {editable && <td className="border-b border-r" />}
                      </tr>
                    )) : null}
                  </Fragment>
                );
              })}

              {!doc.lines?.length ? (
                <tr>
                  <td colSpan={actionColspan} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-[1px] text-[#98a2b3]">
                    ยังไม่มีรายการวัตถุดิบในใบนี้
                  </td>
                </tr>
              ) : null}

              {showExportState ? (
                <tr className="bg-[#f8fafc]">
                  <td colSpan={4} className="border-r border-t border-black px-3 py-2 text-right text-[11px] font-black text-black">
                    เลขเอกสารใบเบิก
                  </td>
                  {displayColumns.map((column) => (
                    <td
                      key={`${doc.documentKey}-document-no-${column.key}`}
                      className={`border-r border-t border-black px-2 py-2 text-center text-[10px] font-bold ${
                        isColumnExported(column) ? "bg-[#e5e7eb] text-black" : "text-[#8a6a00]"
                      }`}
                    >
                      {doc?.erpSyncByDate?.[column.dateValue]?.status === "review" ? (
                        <span
                          className="inline-flex flex-col items-center gap-0.5 text-amber-700"
                          title={doc.erpSyncByDate[column.dateValue]?.reason || "ต้องตรวจสอบการจับคู่ใบเบิก ERP"}
                        >
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {column.documentNo || "-"}
                          </span>
                          <span className="text-[8px] font-black">รอตรวจสอบ</span>
                        </span>
                      ) : column.documentNo || "-"}
                    </td>
                  ))}
                  <td colSpan={2 + (editable ? 1 : 0)} className="border-t border-black px-3 py-2 text-center text-[10px] font-bold text-[#98a2b3]">
                    -
                  </td>
                </tr>
              ) : null}
            </tbody>
          </RequisitionPaperTable>

      {lotEditorState ? <RequisitionLotDialog
        document={doc} masterPlanNo={masterPlanNo} state={lotEditorState}
        options={lotEditorOptions} draft={lotEditorDraft} requiredQty={lotEditorRequiredQty} allocatedQty={lotEditorAllocatedQty}
        details={lotReservationDetails} onDetails={setLotReservationDetails} onChangeDraft={setLotEditorDraft}
        onClose={() => { setLotEditorState(null); setLotReservationDetails(null); }}
        formatDate={formatDate} formatQty={formatQty} formatQtyOrZero={formatQtyOrZero} roundQty={roundQty} toNumber={toNumber}
        onConfirm={async () => {
                  const queue = lotEditorOptions
                    .map((option) => ({
                      lotNo: String(option.lotNo || "").trim(),
                      qty: roundQty(lotEditorDraft[option.key]),
                    }))
                    .filter((item) => item.qty > 0);
                  let queueIndex = 0;
                  let queueRemaining = queue[0]?.qty || 0;
                  const updates = (lotEditorState.requirements || []).map((requirement) => {
                    let requiredRemaining = roundQty(requirement.qty);
                    const allocations = [];
                    while (requiredRemaining > 0.001 && queueIndex < queue.length) {
                      const take = roundQty(Math.min(requiredRemaining, queueRemaining));
                      if (take > 0) allocations.push({ lotNo: queue[queueIndex].lotNo, qty: take });
                      requiredRemaining = roundQty(requiredRemaining - take);
                      queueRemaining = roundQty(queueRemaining - take);
                      if (queueRemaining <= 0.001) {
                        queueIndex += 1;
                        queueRemaining = queue[queueIndex]?.qty || 0;
                      }
                    }
                    return { ...requirement, allocations };
                  });
                  if (await onSaveLotAllocations(updates)) setLotEditorState(null);
                }}
      /> : null}

      {breakdownState ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--surface-navy,#102C57)]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="requisition-breakdown-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBreakdownState(null);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden border border-[#102C57] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#f6e7a8]">ที่มาของยอดรวม</div>
                <h3 id="requisition-breakdown-title" className="mt-1 text-lg font-black">
                  {breakdownState.materialCode} · {breakdownState.materialName}
                </h3>
                <p className="mt-1 text-xs font-bold text-white/75">
                  วันที่ {formatDate(breakdownState.dateValue)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBreakdownState(null)}
                className="inline-flex h-8 w-8 items-center justify-center border border-white/30 hover:bg-white/10"
                aria-label="ปิดรายละเอียด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4">
              <div className="overflow-hidden border border-[#d0d5dd]">
                {breakdownState.breakdown.map((item, index) => (
                  <div
                    key={`${item.sourceDocumentKey}-${item.productCode}-${index}`}
                    className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 border-b border-[#e4e7ec] px-3 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-black text-[#102C57]">{item.productCode || "FG"}</div>
                      <div className="mt-0.5 text-sm font-bold leading-5 text-[#344054]">{item.productName || "-"}</div>
                    </div>
                    <div className="text-right font-black text-[#8a6a00]">
                      {editable && !breakdownState.isExported ? (
                        <EditableQtyCell
                          value={item.qty}
                          onSave={async (nextQty) => {
                            const result = await onUpdateQty(
                              item.sourceDocumentKey,
                              breakdownState.lineKey,
                              breakdownState.dateValue,
                              nextQty
                            );
                            if (result !== false) setBreakdownState(null);
                            return result;
                          }}
                        />
                      ) : (
                        <>{formatQty(item.qty)} {breakdownState.unit || ""}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[#d0d5dd] bg-[#fff8e2] px-5 py-4">
              <span className="text-sm font-black text-[#102C57]">ยอดรวม</span>
              <span className="text-lg font-black text-[#8a6a00]">
                {formatQty(breakdownState.totalQty)} {breakdownState.unit || ""}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </RequisitionPaper>
  );
}

export function RequisitionPreviewGeneratorClient({
  initialMasterPlanNo = "",
}) {
  const pathname = usePathname();
  const [masterPlanNo, setMasterPlanNo] = useState(String(initialMasterPlanNo || "").trim().toUpperCase());
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = usePersistentRouteState("requisition-preview.activeTab", "overview");
  const [activeDocumentKey, setActiveDocumentKey] = useState("");
  const draftWriteInFlight = useRef(false);
  const [activeCentralTab, setActiveCentralTab] = usePersistentRouteState("requisition-preview.activeCentralTab", "all");
  const [itemManagerState, setItemManagerState] = useState(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState("idle");
  const [draftSaveMessage, setDraftSaveMessage] = useState("");
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);
  const [isSubplanExpanded, setIsSubplanExpanded] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportErrorMessage, setExportErrorMessage] = useState("");
  const [exportSelectedDate, setExportSelectedDate] = useState("");
  const [selectedDepartmentIdsDaily, setSelectedDepartmentIdsDaily] = useState([]);
  const [selectedDepartmentIdsWeekly, setSelectedDepartmentIdsWeekly] = useState([]);
  const [supplementalState, setSupplementalState] = useState(null);
  const [supplementalExporting, setSupplementalExporting] = useState(false);
  const [hiddenDocKeys, setHiddenDocKeys] = useState([]);
  const [isHiddenDocsModalOpen, setIsHiddenDocsModalOpen] = useState(false);
  const [hideConfirmDocKey, setHideConfirmDocKey] = useState(null);
  const [resetConfirmState, setResetConfirmState] = useState(null);
  const [resetSaving, setResetSaving] = useState(false);
  const resetInFlight = useRef(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [lotPreviewByKey, setLotPreviewByKey] = useState({});
  const [lotPreviewStatus, setLotPreviewStatus] = useState("idle");

  const { data: planPayload, error: planOptionsError, mutate: reloadPlans } = useSWR("/api/production-planning/master-plan-options", fetcher, {
    revalidateOnFocus: false,
  });

  const planOptions = useMemo(() => {
    const rows = Array.isArray(planPayload?.data) ? planPayload.data : [];
    const map = new Map();
    rows.forEach((row) => {
      const planNo = String(row?.master_plan_no || "").trim().toUpperCase();
      if (!planNo || map.has(planNo)) return;
      map.set(planNo, {
        planNo,
        periodStart: String(row?.period_start || "").slice(0, 10) || "",
        periodEnd: String(row?.period_end || "").slice(0, 10) || "",
      });
    });
    return Array.from(map.values()).sort((a, b) => b.planNo.localeCompare(a.planNo));
  }, [planPayload]);

  const selectedPlan = planOptions.find((option) => option.planNo === masterPlanNo);
  const dateFrom = selectedPlan?.periodStart || "";
  const dateTo = selectedPlan?.periodEnd || "";

  useEffect(() => {
    setHiddenDocKeys([]);
  }, [dateFrom, dateTo, masterPlanNo]);


  const previewUrl = useMemo(() => {
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (!normalizedPlanNo || !dateFrom || !dateTo) return null;
    const query = new URLSearchParams();
    query.set("masterPlanNo", normalizedPlanNo);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
    return `/api/production-planning/requisition/preview?${query.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const { data, error, isLoading } = useSWR(previewUrl, fetcher, {
    revalidateOnFocus: true,
    revalidateOnMount: true,
    dedupingInterval: 0,
  });

  const draftUrl = useMemo(() => {
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (!normalizedPlanNo || !dateFrom || !dateTo) return null;
    const query = new URLSearchParams();
    query.set("masterPlanNo", normalizedPlanNo);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
    return `/api/production-planning/requisition/draft?${query.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const { data: draftPayload, mutate: mutateDraft } = useSWR(draftUrl, fetcher, {
    revalidateOnFocus: true,
    revalidateOnMount: true,
    dedupingInterval: 0,
  });

  const { data: departmentsPayload } = useSWR("/api/production-planning/departments?scope=all", fetcher, {
    revalidateOnFocus: false,
  });

  const { data: sequencesPayload, mutate: mutateSequences, isLoading: loadingSequences } = useSWR(
    activeTab === "sequences" ? "/api/production-planning/requisition/sequences" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const sourceDocuments = useMemo(() => {
    return Array.isArray(data?.data) ? data.data : [];
  }, [data]);

  const draftOverridesByDocKey = useMemo(() => {
    return normalizeDraftMap(draftPayload?.data?.drafts);
  }, [draftPayload]);

  const workingDocuments = useMemo(() => {
    return sourceDocuments.map((doc) => ({
      ...doc,
      lines: normalizeLines(
        Object.prototype.hasOwnProperty.call(draftOverridesByDocKey, doc.documentKey)
          ? mergeRequisitionDraftLines(doc.lines, draftOverridesByDocKey[doc.documentKey], doc)
          : doc.lines
      ),
    }));
  }, [draftOverridesByDocKey, sourceDocuments]);

  const dateColumns = useMemo(() => {
    const values = new Set([
      ...buildDateRange(dateFrom, dateTo),
      ...(Array.isArray(data?.meta?.dateColumns) ? data.meta.dateColumns : []),
    ]);
    workingDocuments.forEach((doc) => {
      if (doc.workDate) values.add(doc.workDate);
      (doc.lines || []).forEach((line) => {
        Object.keys(line.qtyByDate || {}).forEach((dateValue) => values.add(dateValue));
      });
    });
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [data, dateFrom, dateTo, workingDocuments]);

  const lotRequirements = useMemo(() => {
    return workingDocuments
      .filter((doc) => !hiddenDocKeys.includes(doc.documentKey) && hasAssignedRoom(doc))
      .flatMap((doc) =>
      (doc.lines || []).flatMap((line) =>
        Object.entries(line.qtyByDate || {})
          .filter(([dateValue, qty]) => toNumber(qty) > 0 && doc?.exportedByDate?.[dateValue] !== true)
          .map(([dateValue, qty]) => ({
            key: buildLotRequirementKey(doc.documentKey, line, dateValue),
            documentKey: doc.documentKey,
            lineKey: buildLineKey(line),
            dateValue,
            materialSkuCode: line.materialSkuCode,
            materialGoodsCode: line.materialGoodsCode,
            materialName: line.materialName,
            unit: line.unit,
            qty: roundQty(qty),
            departmentName: doc.ownerDepartmentName || doc.ownerDepartmentCode || "",
            roomLabel: doc.roomLabel || doc.roomId || "",
            productCode: doc.parentSku || "",
            productName: doc.parentSkuName || "",
            allocations: line.lotAllocationsByDate?.[dateValue] || [],
          }))
      )
    ).sort((left, right) => {
      const dateCompare = left.dateValue.localeCompare(right.dateValue);
      if (dateCompare !== 0) return dateCompare;
      return left.key.localeCompare(right.key);
    });
  }, [hiddenDocKeys, workingDocuments]);

  useEffect(() => {
    if (!lotRequirements.length) {
      setLotPreviewByKey({});
      setLotPreviewStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    setLotPreviewStatus("loading");
    fetch("/api/production-planning/requisition/lot-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ masterPlanNo, requirements: lotRequirements }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "โหลดข้อมูล LOT ไม่สำเร็จ");
        return payload;
      })
      .then((payload) => {
        setLotPreviewByKey(payload?.data || {});
        setLotPreviewStatus("ready");
      })
      .catch((lotError) => {
        if (lotError?.name === "AbortError") return;
        setLotPreviewByKey({});
        setLotPreviewStatus("error");
        setDraftSaveStatus("error");
        setDraftSaveMessage(String(lotError?.message || "โหลดข้อมูล LOT ไม่สำเร็จ"));
      });
    return () => controller.abort();
  }, [lotRequirements, masterPlanNo]);

  const centralDepartmentIdSet = useMemo(() => {
    const set = new Set();
    const rows = Array.isArray(departmentsPayload?.data) ? departmentsPayload.data : [];
    rows.forEach((row) => {
      if (row?.is_central_department !== true) return;
      const idKey = String(row?.id || "").trim();
      if (idKey) set.add(idKey);
      const codeKey = normalizeTextKey(row?.code);
      if (codeKey) set.add(codeKey);
    });
    return set;
  }, [departmentsPayload]);

  const departmentTabs = useMemo(() => {
    const groups = new Map();
    workingDocuments.forEach((doc) => {
      const key = String(doc.ownerDepartmentId || doc.ownerDepartmentCode || doc.ownerDepartmentName || "unknown");
      const isCentralByMaster = Boolean(
        centralDepartmentIdSet.has(String(doc.ownerDepartmentId || "").trim())
        || centralDepartmentIdSet.has(normalizeTextKey(doc.ownerDepartmentCode))
      );
      const isCentralDepartment = doc.ownerDepartmentIsCentral === true || isCentralByMaster;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: String(doc.ownerDepartmentName || doc.ownerDepartmentCode || "ไม่ระบุแผนก"),
          isCentralDepartment,
          documents: [],
        });
      }
      const group = groups.get(key);
      group.documents.push(doc);
      if (isCentralDepartment) {
        group.isCentralDepartment = true;
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [centralDepartmentIdSet, workingDocuments]);

  const centralDepartmentTabs = departmentTabs.filter((tab) => tab.isCentralDepartment === true);
  const hasCentralDepartments = centralDepartmentTabs.length > 0;
  const nonCentralDepartmentTabs = departmentTabs.filter(
    (tab) => !centralDepartmentTabs.some((centralTab) => centralTab.key === tab.key)
  );

  const tabItems = useMemo(
    () => [
      { key: "overview", label: "รวมทุกแผนก", documents: [] },
      ...(hasCentralDepartments ? [{ key: "central", label: "แผนกกลาง", documents: [] }] : []),
      ...(hasCentralDepartments ? nonCentralDepartmentTabs : departmentTabs),
      { key: "sequences", label: "ตั้งค่าเลขรันนิ่ง", documents: [] },
    ],
    [departmentTabs, hasCentralDepartments, nonCentralDepartmentTabs]
  );

  const exportDepartmentOptions = useMemo(
    () =>
      departmentTabs.map((tab) => ({
        id: getDepartmentIdentity(tab),
        label: String(tab.label || "").trim() || "-",
      })),
    [departmentTabs]
  );

  useEffect(() => {
    if (!exportDepartmentOptions.length) {
      setSelectedDepartmentIdsDaily([]);
      setSelectedDepartmentIdsWeekly([]);
      return;
    }
    const ids = exportDepartmentOptions.map((item) => item.id);
    setSelectedDepartmentIdsDaily((current) => current.filter((id) => ids.includes(id)));
    setSelectedDepartmentIdsWeekly((current) => current.filter((id) => ids.includes(id)));
  }, [exportDepartmentOptions]);

  useEffect(() => {
    setExportSelectedDate((current) => {
      if (current && dateColumns.includes(current)) return current;
      return dateColumns[0] || "";
    });
  }, [dateColumns]);

  const safeActiveTab = tabItems.some((tab) => tab.key === activeTab) ? activeTab : "overview";
  const activeTabEntry = useMemo(
    () =>
      tabItems.find((item) => item.key === safeActiveTab)
      || tabItems[0]
      || { key: "overview", label: "รวมทุกแผนก", documents: [] },
    [safeActiveTab, tabItems]
  );

  const safeCentralTab = centralDepartmentTabs.some((tab) => tab.key === activeCentralTab)
    ? activeCentralTab
    : (centralDepartmentTabs[0]?.key || "all");

  const visibleDocuments = useMemo(() => {
    const rawDocs = activeTabEntry.key === "overview"
      ? (workingDocuments.length ? [buildOverviewDocument(workingDocuments.filter((d) => !hiddenDocKeys.includes(d.documentKey)), dateColumns)] : [])
      : activeTabEntry.key === "central"
        ? (centralDepartmentTabs.find((tab) => tab.key === safeCentralTab)?.documents || [])
        : (activeTabEntry.documents || []);

    if (activeTabEntry.key === "overview") return rawDocs;
    return buildRequisitionPreviewDocuments(
      rawDocs.filter((doc) => !hiddenDocKeys.includes(doc.documentKey))
    );
  }, [activeTabEntry, workingDocuments, centralDepartmentTabs, safeCentralTab, dateColumns, hiddenDocKeys]);
  const scheduleDeptId = useMemo(() => {
    if (safeActiveTab === "overview") return "";
    if (safeActiveTab === "central") {
      const currentCentralTab = centralDepartmentTabs.find((tab) => tab.key === safeCentralTab);
      return String(currentCentralTab?.documents?.[0]?.ownerDepartmentId || "").trim();
    }
    return String(activeTabEntry?.documents?.[0]?.ownerDepartmentId || "").trim();
  }, [activeTabEntry, centralDepartmentTabs, safeActiveTab, safeCentralTab]);

  const embeddedSubplanUrl = useMemo(() => {
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (!normalizedPlanNo || !isSubplanExpanded || !scheduleDeptId) return null;
    return `/api/production-planning/wip-plan/draft?masterPlanNo=${encodeURIComponent(normalizedPlanNo)}&departmentId=${encodeURIComponent(scheduleDeptId)}&includeWeight=1`;
  }, [isSubplanExpanded, masterPlanNo, scheduleDeptId]);
  const { data: embeddedSubplanPayload, error: embeddedSubplanError, isLoading: embeddedSubplanLoading } = useSWR(
    embeddedSubplanUrl, fetcher, { revalidateOnFocus: false }
  );
  const { data: embeddedRoomsPayload, error: embeddedRoomsError, isLoading: embeddedRoomsLoading } = useSWR(
    embeddedSubplanUrl ? `/api/production-work-centers?departmentId=${encodeURIComponent(scheduleDeptId)}` : null,
    fetcher, { revalidateOnFocus: false }
  );

  const canShowEmbeddedSchedule = Boolean(masterPlanNo && scheduleDeptId);
  const scheduleDeptLabel = useMemo(() => {
    if (safeActiveTab === "central") {
      return String(
        centralDepartmentTabs.find((tab) => tab.key === safeCentralTab)?.label || "ไม่ระบุแผนก"
      ).trim();
    }
    return String(activeTabEntry?.label || "ไม่ระบุแผนก").trim();
  }, [activeTabEntry, centralDepartmentTabs, safeActiveTab, safeCentralTab]);
  const embeddedSubplanMatrixRows = useMemo(() => buildPlannedWipPreviewRows(
    embeddedSubplanPayload?.data?.lines || [], embeddedRoomsPayload?.data || [], scheduleDeptId, dateColumns
  ), [embeddedSubplanPayload, embeddedRoomsPayload, scheduleDeptId, dateColumns]);

  const workingTotalLines = useMemo(() => {
    return workingDocuments.reduce((sum, doc) => sum + (Array.isArray(doc.lines) ? doc.lines.length : 0), 0);
  }, [workingDocuments]);

  const commitDrafts = async (nextDrafts, { reviewRelease = false } = {}) => {
    if (!draftUrl || !masterPlanNo || draftWriteInFlight.current) return false;
    if (draftPayload?.data?.staleDraft && !reviewRelease) {
      setDraftSaveStatus("error");
      setDraftSaveMessage("กรุณาเลือกใช้แผนล่าสุดหรือยืนยันแบบร่างเดิมก่อนแก้ไข");
      return false;
    }
    const normalizedDrafts = normalizeDraftMap(nextDrafts);
    draftWriteInFlight.current = true;
    setDraftSaveStatus("saving");
    setDraftSaveMessage("กำลังบันทึกแบบร่าง...");
    try {
      await mutateDraft(
        saveDraftToServer(draftUrl, {
          masterPlanNo,
          dateFrom,
          dateTo,
          drafts: normalizedDrafts,
          baseUpdatedAt: draftPayload?.data?.updatedAt || null,
          sourceRevision: draftPayload?.data?.sourceRevision,
        }),
        {
          optimisticData: buildDraftCachePayload({
            masterPlanNo,
            dateFrom,
            dateTo,
            drafts: normalizedDrafts,
            updatedAt: draftPayload?.data?.updatedAt || null,
            sourceRevision: draftPayload?.data?.sourceRevision,
          }),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
      setDraftSaveStatus("saved");
      setDraftSaveMessage("บันทึกแบบร่างแล้ว");
      return true;
    } catch (saveError) {
      setDraftSaveStatus("error");
      setDraftSaveMessage(String(saveError?.message || "บันทึกแบบร่างไม่สำเร็จ"));
      if (saveError?.status === 409) {
        void mutateDraft();
      }
      return false;
    } finally {
      draftWriteInFlight.current = false;
    }
  };

  const syncLotReservations = async ({ updates = [], releaseKeys = [] }) => {
    const response = await fetch("/api/production-planning/requisition/lot-reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterPlanNo,
        requirements: lotRequirements,
        updates,
        releaseKeys,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "บันทึกการจอง LOT ไม่สำเร็จ");
    return payload;
  };

  const resetAllDrafts = () => setResetConfirmState({ all: true });
  const performResetAllDrafts = async () => {
    return (async () => {
      const previousKeys = Object.entries(draftPayload?.data?.previousDrafts || {}).flatMap(([docKey, lines]) => (
        lines.flatMap((line) => Object.keys(line.qtyByDate || {}).map((date) => buildLotRequirementKey(docKey, line, date)))
      ));
      if (await commitDrafts({}, { reviewRelease: true })) {
        await syncLotReservations({ releaseKeys: [...new Set([...lotRequirements.map((item) => item.key), ...previousKeys])] });
        return true;
      }
      return false;
    })();
  };

  const resetDocument = (docKey) => setResetConfirmState({ docKey });
  const performResetDocument = async (docKey) => {
    const docKeys = normalizeDocumentKeys(docKey);
    const next = { ...draftOverridesByDocKey };
    docKeys.forEach((key) => {
      delete next[key];
    });
    return (async () => {
      if (await commitDrafts(next)) {
        await syncLotReservations({
          releaseKeys: lotRequirements.filter((item) => docKeys.includes(item.documentKey)).map((item) => item.key),
        });
        return true;
      }
      return false;
    })();
  };

  const updateQty = async (docKey, lineKey, dateValue, nextQty) => {
    const workingDocument = workingDocuments.find((doc) => doc.documentKey === docKey);
    if (workingDocument?.exportedByDate?.[dateValue] === true) return false;
    const lines = normalizeLines(workingDocument?.lines || []);
    const referenceLine = lines.find((line) => buildLineKey(line) === lineKey)
      || workingDocuments
        .flatMap((doc) => doc.lines || [])
        .find((line) => buildLineKey(line) === lineKey);
    if (!workingDocument || !referenceLine) return false;
    setLotPreviewByKey((current) => {
      const nextPreview = { ...current };
      delete nextPreview[buildLotRequirementKey(docKey, referenceLine, dateValue)];
      return nextPreview;
    });
    const updatedLines = upsertRequisitionSourceLineQty(
      lines,
      referenceLine,
      dateValue,
      nextQty
    ).map((line) => {
      if (buildLineKey(line) !== lineKey) return line;
      const lotAllocationsByDate = { ...(line.lotAllocationsByDate || {}) };
      delete lotAllocationsByDate[dateValue];
      return { ...line, lotAllocationsByDate };
    });
    if (await commitDrafts(
      mergeDraftDocument(draftOverridesByDocKey, sourceDocuments, docKey, updatedLines)
    )) {
      await syncLotReservations({
        releaseKeys: [buildLotRequirementKey(docKey, referenceLine, dateValue)],
      });
      return true;
    }
    return false;
  };

  const saveLotAllocations = async (updates) => {
    const updatesByDocument = new Map();
    (Array.isArray(updates) ? updates : []).forEach((update) => {
      const documentKey = String(update?.documentKey || "").trim();
      if (!documentKey) return;
      const list = updatesByDocument.get(documentKey) || [];
      list.push(update);
      updatesByDocument.set(documentKey, list);
    });
    if (!updatesByDocument.size) return false;

    let nextDrafts = normalizeDraftMap(draftOverridesByDocKey);
    updatesByDocument.forEach((documentUpdates, documentKey) => {
      const document = workingDocuments.find((item) => item.documentKey === documentKey);
      if (!document) return;
      const lines = normalizeLines(document.lines || []).map((line) => {
        const lineKey = buildLineKey(line);
        const lineUpdates = documentUpdates.filter((item) => item.lineKey === lineKey);
        if (!lineUpdates.length) return line;
        const lotAllocationsByDate = { ...(line.lotAllocationsByDate || {}) };
        lineUpdates.forEach((item) => {
          const allocations = (Array.isArray(item.allocations) ? item.allocations : [])
            .map((allocation) => ({
              lotNo: String(allocation?.lotNo || "").trim(),
              qty: roundQty(allocation?.qty),
            }))
            .filter((allocation) => allocation.qty > 0);
          if (allocations.length) lotAllocationsByDate[item.dateValue] = allocations;
          else delete lotAllocationsByDate[item.dateValue];
        });
        return { ...line, lotAllocationsByDate };
      });
      nextDrafts = mergeDraftDocument(nextDrafts, sourceDocuments, documentKey, lines);
    });

    if (!await commitDrafts(nextDrafts)) return false;
    try {
      await syncLotReservations({ updates });
      setLotPreviewByKey((current) => applyConfirmedLotAllocations(current, updates));
      return true;
    } catch (reservationError) {
      setDraftSaveStatus("error");
      setDraftSaveMessage(String(reservationError?.message || "บันทึกการจอง LOT ไม่สำเร็จ"));
      return false;
    }
  };

  const deleteLine = async (docKey, lineKey) => {
    const docKeys = normalizeDocumentKeys(docKey);
    if (docKeys.some(key => {
      const doc = workingDocuments.find(item => item.documentKey === key);
      const line = doc?.lines?.find(item => buildLineKey(item) === lineKey);
      return line && isRequisitionLineExportLocked(doc, line);
    })) {
      setDraftSaveStatus("error"); setDraftSaveMessage("แถวนี้มีการ Export แล้ว ไม่สามารถลบได้"); return false;
    }
    let nextDrafts = normalizeDraftMap(draftOverridesByDocKey);
    docKeys.forEach((key) => {
      const workingDocument = workingDocuments.find((doc) => doc.documentKey === key);
      if (!workingDocument) return;
      const lines = normalizeLines(workingDocument?.lines || []).filter(
        (line) => buildLineKey(line) !== lineKey
      );
      nextDrafts = mergeDraftDocument(nextDrafts, sourceDocuments, key, lines);
    });
    if (!await commitDrafts(nextDrafts)) return false;
    await syncLotReservations({ releaseKeys: lotRequirements
      .filter((item) => docKeys.includes(item.documentKey) && item.lineKey === lineKey)
      .map((item) => item.key) });
    return true;
  };

  const requestDeleteLine = (docKey, lineMeta) => {
    const keys = normalizeDocumentKeys(lineMeta?.docKeys || docKey);
    if (keys.some(key => {
      const doc = workingDocuments.find(item => item.documentKey === key);
      const line = doc?.lines?.find(item => buildLineKey(item) === lineMeta?.lineKey);
      return line && isRequisitionLineExportLocked(doc, line);
    })) return;
    setDeleteConfirmState({
      docKey,
      docKeys: normalizeDocumentKeys(lineMeta?.docKeys || docKey),
      ...lineMeta,
    });
  };

  const addMaterialToDocument = async (docKey, options) => {
    const docKeys = normalizeDocumentKeys(docKey);
    const newLines = options.map(option => ({
      materialSkuCode: String(option?.skuCode || "").trim(),
      materialGoodsCode: String(option?.goodsCode || option?.skuCode || "").trim(),
      materialName: String(option?.name || "").trim(),
      unit: String(option?.unit || "").trim() || "-",
      itemType: inferMaterialItemType(option),
      qtyByDate: {},
      totalQty: 0,
      isManual: true,
    }));
    let nextDrafts = normalizeDraftMap(draftOverridesByDocKey);
    docKeys.forEach((key) => {
      const workingDocument = workingDocuments.find((doc) => doc.documentKey === key);
      if (!workingDocument) return;
      const lines = normalizeLines(workingDocument?.lines || []);
      const seen = new Set(lines.map(buildLineKey));
      const additions = newLines.filter(line => { const id = buildLineKey(line); if (seen.has(id)) return false; seen.add(id); return true; });
      nextDrafts = mergeDraftDocument(nextDrafts, sourceDocuments, key, [...lines, ...additions]);
    });
    if (!await commitDrafts(nextDrafts)) return false;
    setItemManagerState(null);
    return true;
  };

  const openSupplementalDrawer = (docKey) => {
    const document = workingDocuments.find((doc) => doc.documentKey === docKey);
    if (!document) return;
    const exportedDates = getExportedDateOptions(document, dateColumns);
    if (!exportedDates.length) {
      setDraftSaveStatus("error");
      setDraftSaveMessage("ต้อง Export ใบเบิกหลักของวันที่นี้ก่อน จึงจะสร้างใบเบิกเพิ่มเติมได้");
      return;
    }
    setSupplementalState({
      docKey,
      masterPlanNo,
      workDate: exportedDates[0].value,
      reason: "เบิกเพิ่มเติมหลัง Export",
      lines: [],
    });
  };

  const closeSupplementalDrawer = () => {
    if (supplementalExporting) return;
    setSupplementalState(null);
  };

  const addSupplementalLine = (option, qty) => {
    const line = {
      materialSkuCode: String(option?.skuCode || "").trim(),
      materialGoodsCode: String(option?.goodsCode || option?.skuCode || "").trim(),
      materialName: String(option?.name || "").trim(),
      unit: String(option?.unit || "").trim() || "-",
      itemType: inferMaterialItemType(option),
      qty: roundQty(qty),
      note: "",
    };
    const lineKey = buildSupplementalLineKey(line);
    if (!lineKey || line.qty <= 0) return;
    setSupplementalState((current) => {
      if (!current) return current;
      const existing = Array.isArray(current.lines) ? current.lines : [];
      if (existing.some((item) => buildSupplementalLineKey(item) === lineKey)) return current;
      return { ...current, lines: [...existing, line] };
    });
  };

  const updateSupplementalLine = (lineKey, patch) => {
    setSupplementalState((current) => {
      if (!current) return current;
      const lines = (Array.isArray(current.lines) ? current.lines : [])
        .map((line) => {
          if (buildSupplementalLineKey(line) !== lineKey) return line;
          return {
            ...line,
            ...patch,
            qty: Object.prototype.hasOwnProperty.call(patch, "qty") ? roundQty(patch.qty) : line.qty,
          };
        })
        .filter((line) => roundQty(line.qty) > 0);
      return { ...current, lines };
    });
  };

  const removeSupplementalLine = (lineKey) => {
    setSupplementalState((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: (Array.isArray(current.lines) ? current.lines : []).filter(
          (line) => buildSupplementalLineKey(line) !== lineKey
        ),
      };
    });
  };

  const handleExportSupplemental = async () => {
    if (!supplementalState || supplementalExporting) return;
    const sourceDocument = workingDocuments.find((doc) => doc.documentKey === supplementalState.docKey);
    if (!sourceDocument) return;

    setSupplementalExporting(true);
    try {
      const payload = {
        masterPlanNo,
        workDate: supplementalState.workDate,
        reason: supplementalState.reason,
        document: {
          documentKey: sourceDocument.documentKey,
          ownerDepartmentId: sourceDocument.ownerDepartmentId,
          ownerDepartmentCode: sourceDocument.ownerDepartmentCode,
          ownerDepartmentName: sourceDocument.ownerDepartmentName,
          roomId: sourceDocument.roomId,
          roomLabel: sourceDocument.roomLabel,
          shiftId: sourceDocument.shiftId,
          shiftCode: sourceDocument.shiftCode,
          shiftName: sourceDocument.shiftName,
          parentSku: sourceDocument.parentSku || "",
          workstreamCode: sourceDocument.workstreamCode || "",
          dispatchMaterialGroup: sourceDocument.dispatchMaterialGroup || "",
        },
        lines: supplementalState.lines,
      };
      const response = await fetch("/api/production-planning/requisition/supplemental/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || "Export Excel ใบเบิกเพิ่มเติมไม่สำเร็จ");
      }

      const blob = await response.blob();
      const fileName = readDownloadFilename(response, `${masterPlanNo || "requisition"}_supplemental.xlsx`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSupplementalState(null);
      await Promise.all([
        previewUrl ? mutateSWR(previewUrl) : Promise.resolve(),
        draftUrl ? mutateSWR(draftUrl) : Promise.resolve(),
      ]);
      const documentNo = response.headers.get("X-Document-No");
      setDraftSaveStatus("saved");
      setDraftSaveMessage(documentNo ? `Export ใบเบิกเพิ่มเติมสำเร็จ: ${documentNo}` : "Export ใบเบิกเพิ่มเติมสำเร็จ");
    } catch (exportError) {
      setDraftSaveStatus("error");
      setDraftSaveMessage(String(exportError?.message || "Export Excel ใบเบิกเพิ่มเติมไม่สำเร็จ"));
    } finally {
      setSupplementalExporting(false);
    }
  };

  const toggleExportDepartment = (mode, departmentId) => {
    const isDaily = mode === "daily";
    const setter = isDaily ? setSelectedDepartmentIdsDaily : setSelectedDepartmentIdsWeekly;
    const otherSetter = isDaily ? setSelectedDepartmentIdsWeekly : setSelectedDepartmentIdsDaily;
    setter((current) =>
      current.includes(departmentId)
        ? current.filter((id) => id !== departmentId)
        : [...current, departmentId]
    );
    otherSetter((current) => current.filter((id) => id !== departmentId));
  };

  const openExportModal = () => {
    setExportErrorMessage("");
    setExportSelectedDate((current) => current || dateColumns[0] || "");
    setIsExportModalOpen(true);
  };

  const handleExportExcel = async () => {
    if (!masterPlanNo || exportingExcel) return;

    const dailyIds = selectedDepartmentIdsDaily.filter(Boolean);
    const weeklyIds = selectedDepartmentIdsWeekly.filter(Boolean);
    if (!dailyIds.length && !weeklyIds.length) {
      setDraftSaveStatus("error");
      setDraftSaveMessage("กรุณาเลือกอย่างน้อย 1 แผนกสำหรับรายวันหรือรายสัปดาห์");
      setExportErrorMessage("กรุณาเลือกอย่างน้อย 1 แผนกสำหรับรายวันหรือรายสัปดาห์");
      return;
    }
    if (dailyIds.length > 0 && !exportSelectedDate) {
      setDraftSaveStatus("error");
      setDraftSaveMessage("กรุณาเลือกวันที่สำหรับ Export รายวัน");
      setExportErrorMessage("กรุณาเลือกวันที่สำหรับ Export รายวัน");
      return;
    }
    if (lotPreviewStatus !== "ready") {
      const message = lotPreviewStatus === "error"
        ? "โหลดข้อมูล LOT ไม่สำเร็จ กรุณารีเฟรชก่อน Export"
        : "กำลังคำนวณ LOT กรุณารอสักครู่";
      setDraftSaveStatus("error");
      setDraftSaveMessage(message);
      setExportErrorMessage(message);
      return;
    }

    const selectedDailySet = new Set(dailyIds);
    const selectedWeeklySet = new Set(weeklyIds);
    const hiddenSet = new Set(hiddenDocKeys);
    const lotAllocationOverrides = {};
    const lotReservationKeys = [];
    workingDocuments.forEach((doc) => {
      const departmentId = String(doc?.ownerDepartmentId || "").trim();
      if (hiddenSet.has(doc.documentKey)) return;
      const includedDates = selectedDailySet.has(departmentId)
        ? [exportSelectedDate]
        : selectedWeeklySet.has(departmentId)
          ? dateColumns.filter((dateValue) => dateValue >= dateFrom && dateValue <= dateTo)
          : [];
      if (!includedDates.length) return;
      (doc.lines || []).forEach((line) => {
        const allocations = new Map();
        includedDates.forEach((dateValue) => {
          if (toNumber(line?.qtyByDate?.[dateValue]) <= 0) return;
          lotReservationKeys.push(buildLotRequirementKey(doc.documentKey, line, dateValue));
          const preview = lotPreviewByKey[buildLotRequirementKey(doc.documentKey, line, dateValue)];
          (preview?.allocations || []).forEach((allocation) => {
            const lotNo = String(allocation?.lotNo || "").trim();
            allocations.set(lotNo, roundQty(toNumber(allocations.get(lotNo)) + toNumber(allocation?.qty)));
          });
        });
        if (allocations.size) {
          lotAllocationOverrides[`${doc.documentKey}::${buildLineKey(line)}`] = Array.from(
            allocations,
            ([lotNo, qty]) => ({ lotNo, qty })
          );
        }
      });
    });

    setExportingExcel(true);
    setExportErrorMessage("");
    try {
      const payload = {
        masterPlanNo,
        dateFrom,
        dateTo,
        exportMode: "unified",
        selectedDate: dailyIds.length > 0 ? exportSelectedDate : null,
        selectedDepartmentIdsDaily: dailyIds,
        selectedDepartmentIdsConsolidated: weeklyIds,
        excludedDocumentKeys: hiddenDocKeys,
        lotAllocationOverrides,
        lotReservationKeys,
      };
      const response = await fetch("/api/production-planning/requisition/confirm-daily", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || "Export Excel ไม่สำเร็จ");
      }

      const blob = await response.blob();
      const isPartialStock = response.headers.get("X-Partial-Stock") === "true";
      const shortageCount = Number(response.headers.get("X-Stock-Shortage-Count") || 0);
      const fileName = readDownloadFilename(response, `${masterPlanNo || "requisition"}_requisition_preview.xlsx`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setIsExportModalOpen(false);
      await Promise.all([
        previewUrl ? mutateSWR(previewUrl) : Promise.resolve(),
        draftUrl ? mutateSWR(draftUrl) : Promise.resolve(),
      ]);
      setDraftSaveStatus("saved");
      setDraftSaveMessage(
        isPartialStock
          ? `Export เท่าที่มีสำเร็จ มีวัตถุดิบขาด ${shortageCount.toLocaleString("th-TH")} รายการ`
          : "Export Excel สำเร็จ"
      );
    } catch (exportError) {
      const message = String(exportError?.message || "Export Excel ไม่สำเร็จ");
      setDraftSaveStatus("error");
      setDraftSaveMessage(message);
      setExportErrorMessage(message);
    } finally {
      setExportingExcel(false);
    }
  };

  const activeManagerDocument = useMemo(() => {
    const docKeys = normalizeDocumentKeys(itemManagerState?.docKeys || itemManagerState?.docKey);
    if (!docKeys.length) return null;
    const selectedDocs = workingDocuments.filter((item) => docKeys.includes(item.documentKey));
    if (selectedDocs.length <= 1) return selectedDocs[0] || null;
    return buildRequisitionPreviewDocuments(selectedDocs)[0] || selectedDocs[0] || null;
  }, [itemManagerState, workingDocuments]);

  const activeManagerDocumentKeys = useMemo(
    () => normalizeDocumentKeys(itemManagerState?.docKeys || itemManagerState?.docKey),
    [itemManagerState]
  );

  const supplementalDocument = useMemo(() => {
    const docKey = String(supplementalState?.docKey || "").trim();
    return workingDocuments.find((item) => item.documentKey === docKey) || null;
  }, [supplementalState?.docKey, workingDocuments]);

  const supplementalDateOptions = useMemo(() => {
    if (!supplementalDocument) return [];
    return getExportedDateOptions(supplementalDocument, dateColumns);
  }, [dateColumns, supplementalDocument]);

  const managerLineKeys = useMemo(() => {
    const doc = activeManagerDocument;
    return new Set((doc?.lines || []).map((line) => buildLineKey(line)));
  }, [activeManagerDocument]);

  const openItemManager = (docKey, mode = "list") => {
    const docKeys = normalizeDocumentKeys(docKey);
    setItemManagerState({ docKey: docKeys[0] || "", docKeys, mode });
  };

  const closeItemManager = () => {
    setItemManagerState(null);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    const query = new URLSearchParams(window.location.search);
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (normalizedPlanNo) {
      query.set("masterPlanNo", normalizedPlanNo);
    } else {
      query.delete("masterPlanNo");
    }
    if (dateFrom) {
      query.set("dateFrom", dateFrom);
    } else {
      query.delete("dateFrom");
    }
    if (dateTo) {
      query.set("dateTo", dateTo);
    } else {
      query.delete("dateTo");
    }
    query.delete("planNo");
    const nextSearch = query.toString();
    const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [dateFrom, dateTo, masterPlanNo, pathname]);

  return (
    <main className={`${presentation.workspace} ${presentation.deepTextTrial}`}>
      <PlanningHeader
        activeTab="requisition-preview"
        title="Preview Demand → ใบเบิก"
        description="แสดงและตรวจสอบรายการใบเบิกก่อน Export Excel และก่อนสร้างเอกสารเบิกจริง"
        eyebrow="Production Planning"
        maxWidth="max-w-[1800px]"
      />

      <div className={presentation.content}>
        <section className={presentation.filters} aria-label="เงื่อนไขใบเบิก">
          <div className={presentation.filterGrid}>
            <div>
              <label htmlFor="requisition-plan">เลขที่แผนการผลิต</label>
              <div className={presentation.planChoice}>
                <button id="requisition-plan" type="button" aria-haspopup="dialog" aria-expanded={planPickerOpen} onClick={() => setPlanPickerOpen(true)} className="flex h-10 w-full items-center justify-between gap-3 rounded-[3px] border border-[#c6d5e6] bg-white px-3 text-left text-sm text-[#102c57]">{masterPlanNo || "เลือกเลขแผนหลัก..."}<ChevronDown size={15} /></button>
                <button type="button" aria-label="ค้นหาเลขแผน" onClick={() => setPlanPickerOpen(true)} className="flex h-10 items-center justify-center rounded-[3px] border border-[#c6d5e6] bg-white px-3"><Search size={15} /></button>
              </div>
            </div>
            <div>
              <label id="requisition-period-label">ช่วงวันที่ตามแผนหลัก</label>
              <div className={presentation.planPeriod} aria-labelledby="requisition-period-label">
                <CalendarDays size={14} />
                <span>{dateFrom && dateTo ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}` : !masterPlanNo ? "เลือกแผนหลักก่อน" : planOptionsError ? "โหลดช่วงวันที่แผนหลักไม่สำเร็จ" : !planPayload ? "กำลังโหลดช่วงวันที่ของแผนหลัก" : "ไม่พบช่วงวันที่ของแผนหลักนี้"}</span>
              </div>
            </div>
            <div>
              <label htmlFor="requisition-department">แผนก</label>
              <select id="requisition-department" value={safeActiveTab} onChange={(event) => setActiveTab(event.target.value)}>
                {tabItems.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
              </select>
              {safeActiveTab === "central" ? <select aria-label="แผนกกลาง" value={safeCentralTab} onChange={(event) => setActiveCentralTab(event.target.value)}>
                {centralDepartmentTabs.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
              </select> : null}
            </div>
            <div className={presentation.filterStatus} aria-live="polite">
              <span>{draftPayload?.data?.staleDraft ? "แผนเปลี่ยนแล้ว: แบบร่างเดิมยังเก็บไว้" : draftSaveMessage || "ฉบับร่าง"}</span>
              <span>พบ {visibleDocuments.length.toLocaleString("th-TH")} ใบเบิก · {workingTotalLines.toLocaleString("th-TH")} รายการวัตถุดิบ</span>
            </div>
            <button type="button" onClick={openExportModal} disabled={!masterPlanNo || !dateFrom || !dateTo || exportingExcel} className={presentation.exportButton}><Download size={15} />{exportingExcel ? "กำลัง Export..." : "Export Excel"}</button>
            <div className={presentation.referenceToggles}>
              <button type="button" className={presentation.planToggle} disabled={!masterPlanNo || !scheduleDeptId} aria-expanded={isScheduleExpanded} onClick={() => setIsScheduleExpanded((value) => !value)}>แผนหลัก <ChevronDown size={14} /></button>
              <button type="button" className={presentation.planToggle} disabled={!masterPlanNo || !scheduleDeptId} aria-expanded={isSubplanExpanded} onClick={() => setIsSubplanExpanded((value) => !value)}>แผนย่อย WIP ทั้งหมด <ChevronDown size={14} /></button>
            </div>
          </div>
        </section>

        {canShowEmbeddedSchedule && isScheduleExpanded && (
          <PlanningReferencePaper title="แผนการผลิตหลัก" metadata={`${masterPlanNo} · ${scheduleDeptLabel} · ${formatDate(dateFrom)} – ${formatDate(dateTo)}`} onCollapse={() => setIsScheduleExpanded(false)}>
            {canShowEmbeddedSchedule && <div className={presentation.referenceSchedule}>
                    <ProductionScheduleClient
                      key={`${masterPlanNo}-${scheduleDeptId}-${dateFrom}-${dateTo}`}
                      masterPlanNo={masterPlanNo}
                      deptId={scheduleDeptId}
                      dateFrom={dateFrom}
                      dateTo={dateTo}
                      embedded={true}
                      readOnly={true}
                    />
            </div>}
          </PlanningReferencePaper>
        )}
        {canShowEmbeddedSchedule && isSubplanExpanded && (
          <PlanningReferencePaper title="แผนย่อย WIP · ทุกห้องผลิต" metadata={`${masterPlanNo} · ${scheduleDeptLabel} · ${formatDate(dateFrom)} – ${formatDate(dateTo)} · ${embeddedSubplanMatrixRows.length} รายการ`} onCollapse={() => setIsSubplanExpanded(false)}>
                      {embeddedSubplanLoading || embeddedRoomsLoading ? (
                        <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                          กำลังโหลดแผนย่อย WIP...
                        </div>
                      ) : embeddedSubplanError || embeddedRoomsError ? (
                        <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#8a6a00]">
                          โหลดแผนย่อย WIP ไม่สำเร็จ
                        </div>
                      ) : embeddedSubplanMatrixRows.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                          ยังไม่มีแผนย่อย WIP ของแผนกนี้ในเลขแผนที่เลือก
                        </div>
                      ) : (
                        <WipWeeklyTable rows={embeddedSubplanMatrixRows} dates={dateColumns} formatDate={formatDate} showRooms />
                      )}
          </PlanningReferencePaper>
        )}

        {/* Draft Workspace Status Banner */}
        {workingDocuments.length > 0 ? (
          <section className={presentation.status}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[1.5px] text-black">โหมดแก้ไขแบบร่างในหน้า Preview</div>
                <div className="mt-1 text-[11px] font-bold text-black/75 uppercase tracking-[0.5px]">
                  แก้ไขจำนวนรายวัน เพิ่มวัตถุดิบ หรือลบรายการได้ก่อนเริ่มการสร้างใบจริง
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex min-w-[160px] items-center justify-center rounded-[2px] border-2 border-[#102C57] bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.5px] ${
                    draftSaveStatus === "saving"
                      ? "text-[#8a6a00] border-[#DA291C]"
                      : draftSaveStatus === "error"
                        ? "text-red-600 border-red-600"
                        : draftSaveStatus === "saved"
                          ? "text-emerald-600 border-emerald-600"
                          : "text-black"
                  }`}
                >
                  {draftPayload?.data?.staleDraft ? "แผนเปลี่ยนแล้ว: แบบร่างเดิมยังเก็บไว้" : draftSaveMessage || "ยังไม่มีการแก้ไขล่าสุด"}
                </span>
                {draftPayload?.data?.staleDraft ? (
                  <>
                    <button type="button" disabled={draftSaveStatus === "saving"} onClick={resetAllDrafts} className="border border-[#102C57] bg-white px-3 py-2 text-xs font-bold">ใช้ยอดจากแผนล่าสุด</button>
                    <button type="button" disabled={draftSaveStatus === "saving"} onClick={() => {
                      if (window.confirm("ตรวจสอบแล้วและต้องการใช้จำนวนที่แก้ไว้ในแบบร่างเดิมกับแผนฉบับล่าสุดหรือไม่?")) {
                        void commitDrafts(draftPayload.data.previousDrafts || {}, { reviewRelease: true });
                      }
                    }} className="border border-[#102C57] bg-white px-3 py-2 text-xs font-bold">ยืนยันใช้แบบร่างเดิมต่อ</button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={resetAllDrafts}
                  className="inline-flex items-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] hover:bg-[var(--surface-navy,#0c2345)] hover:border-[#0c2345] text-white hover:text-white px-4 py-2 text-xs font-black uppercase tracking-[1.5px] transition cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  รีเซ็ตแบบร่างทั้งหมด
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-[2px] border-2 border-[#DA291C] bg-[#FFF9F9] px-4 py-3 text-xs font-bold uppercase tracking-[0.5px] text-[#8a6a00]">
            {String(error?.message || "โหลด preview ไม่สำเร็จ")}
          </section>
        ) : null}

        {/* Stats Section */}
        <section className={presentation.statistics}>
          <div className="rounded-[2px] border-2 border-[#102C57] bg-white p-5 shadow-none flex flex-col justify-between">
            <p className="text-[10px] font-black uppercase tracking-[1.5px] text-[#667085]">จำนวนเอกสารที่จะแสดง</p>
            <p className="text-3xl font-black text-black tracking-tight mt-2">{workingDocuments.length.toLocaleString("th-TH")} ใบ</p>
          </div>
          <div className="rounded-[2px] border-2 border-[#102C57] bg-white p-5 shadow-none flex flex-col justify-between">
            <p className="text-[10px] font-black uppercase tracking-[1.5px] text-[#667085]">จำนวนรายการวัตถุดิบรวม</p>
            <p className="text-3xl font-black text-black tracking-tight mt-2">{workingTotalLines.toLocaleString("th-TH")} รายการ</p>
          </div>
          <div className="rounded-[2px] border-2 border-[#102C57] bg-white p-5 shadow-none flex flex-col justify-between border-l-[#F6E500] border-l-4">
            <p className="text-[10px] font-black uppercase tracking-[1.5px] text-[#667085]">ช่วงวันที่ในเอกสาร</p>
            <p className="text-xs font-black text-black tracking-tight mt-3 uppercase font-mono">
              {dateColumns.length ? `${formatDate(dateColumns[0])} ถึง ${formatDate(dateColumns[dateColumns.length - 1])}` : "-"}
            </p>
          </div>
        </section>

        {/* Tabs Selectors */}
        {!isLoading && workingDocuments.length > 0 ? (
          <section className={presentation.departmentNavigation}>
            <div className="flex flex-wrap gap-2">
              {tabItems.map((tab) => {
                const isActive = tab.key === safeActiveTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    aria-pressed={isActive}
                    className={`rounded-[2px] border-2 px-4 py-2 text-xs font-black uppercase tracking-[1.28px] transition cursor-pointer ${
                      isActive
                        ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white"
                        : "border-[#CCCCCC] bg-white text-black hover:border-[#102C57] hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {safeActiveTab === "central" ? (
              <div className="mt-4 border-t-2 border-dashed border-[#102C57]/10 pt-4">
                <div className="flex flex-wrap gap-2">
                  {centralDepartmentTabs.map((tab) => {
                    const isActive = tab.key === safeCentralTab;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveCentralTab(tab.key)}
                        aria-pressed={isActive}
                        className={`rounded-[2px] border-2 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[1px] transition cursor-pointer ${
                          isActive
                            ? "border-[#102C57] bg-[#fff8e2] text-black"
                            : "border-[#CCCCCC] bg-white text-black hover:border-[#102C57] hover:bg-slate-50"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {hiddenDocKeys.length > 0 && <details className={dialogStyles.hiddenList} open>
          <summary>ใบเบิกที่ซ่อน ({hiddenDocKeys.length})</summary>
          <div className={dialogStyles.listTools}>
            <button type="button" className={dialogStyles.link} onClick={() => setIsHiddenDocsModalOpen(true)}>ดูรายการทั้งหมด</button>
            <button type="button" className={dialogStyles.link + " ml-4"} onClick={() => { setHiddenDocKeys([]); setRestoreMessage("แสดงใบเบิกทั้งหมดแล้ว"); }}>แสดงทั้งหมด</button>
          </div>
          <HiddenDocumentsTable documents={workingDocuments.filter((doc) => hiddenDocKeys.includes(doc.documentKey))} onRestore={(key) => { setHiddenDocKeys((current) => current.filter((item) => item !== key)); setRestoreMessage("แสดงใบเบิกแล้ว"); }} />
        </details>}
        {/* Loading and Empty States */}
        {safeActiveTab === "sequences" ? (
          <RequisitionSequenceSettingsPanel
            payload={sequencesPayload}
            mutate={mutateSequences}
            isLoading={loadingSequences}
          />
        ) : (
          <>
            {isLoading ? (
              <section className="rounded-[2px] border-2 border-[#102C57] bg-white px-4 py-12 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                กำลังเตรียม Preview ใบเบิก...
              </section>
            ) : null}

            {!isLoading && workingDocuments.length === 0 ? (
              <section className="rounded-[2px] border-2 border-[#102C57] bg-white px-4 py-12 text-center text-xs font-bold uppercase tracking-[1px] text-[#8F8F8F]">
                ไม่พบข้อมูลใบเบิกจากเงื่อนไขที่เลือก
              </section>
            ) : null}

            <RequisitionDocumentToolbar
              documents={visibleDocuments}
              onActiveChange={setActiveDocumentKey}
            />
            {/* Requisition Documents List */}
            {visibleDocuments.map((doc) => {
              const pageColumns = dateColumns.length ? dateColumns : [doc.workDate].filter(Boolean);
              const isEditable = safeActiveTab !== "overview";
              return (
                <RequisitionDocument
                  key={doc.documentKey}
                  doc={doc}
                  masterPlanNo={masterPlanNo}
                  active={doc.documentKey === activeDocumentKey}
                  pageColumns={pageColumns}
                  editable={isEditable}
                  showExportState={safeActiveTab !== "overview"}
                  onManage={(keys) => openItemManager(keys, "add")}
                  onDeleteLine={requestDeleteLine}
                  onSupplemental={openSupplementalDrawer}
                  onReset={resetDocument}
                  onHide={setHideConfirmDocKey}
                  onUpdateQty={updateQty}
                  lotPreviewByKey={lotPreviewByKey}
                  lotPreviewStatus={lotPreviewStatus}
                  onSaveLotAllocations={saveLotAllocations}
                />
              );
            })}
          </>
        )}
      </div>

      <RequisitionMaterialPicker
        key={activeManagerDocument?.documentKey || "closed"}
        masterPlanNo={masterPlanNo}
        periodLabel={`${formatDate(dateFrom)} – ${formatDate(dateTo)}`}
        open={Boolean(activeManagerDocument)}
        document={activeManagerDocument}
        existingLineKeys={managerLineKeys}
        onClose={closeItemManager}
        onConfirm={(options) => {
          if (!activeManagerDocumentKeys.length) return false;
          return addMaterialToDocument(activeManagerDocumentKeys, options);
        }}
      />

      <SupplementalRequisitionDrawer
        state={supplementalState}
        document={supplementalDocument}
        dateOptions={supplementalDateOptions}
        exporting={supplementalExporting}
        onClose={closeSupplementalDrawer}
        onChangeDate={(workDate) => setSupplementalState((current) => (current ? { ...current, workDate } : current))}
        onChangeReason={(reason) => setSupplementalState((current) => (current ? { ...current, reason } : current))}
        onAddLine={addSupplementalLine}
        onUpdateLine={updateSupplementalLine}
        onRemoveLine={removeSupplementalLine}
        onExport={handleExportSupplemental}
      />

      <DeleteConfirmModal
        state={deleteConfirmState}
        saving={draftSaveStatus === "saving"}
        error={draftSaveStatus === "error" ? draftSaveMessage : ""}
        onCancel={() => setDeleteConfirmState(null)}
        onConfirm={async () => {
          try {
            if ((deleteConfirmState?.docKeys?.length || deleteConfirmState?.docKey) && deleteConfirmState?.lineKey) {
              if (!await deleteLine(deleteConfirmState.docKeys || deleteConfirmState.docKey, deleteConfirmState.lineKey)) return;
            }
            setDeleteConfirmState(null);
          } catch (error) {
            setDraftSaveStatus("error");
            setDraftSaveMessage(error?.message || "ลบรายการไม่สำเร็จ");
          }
        }}
      />

      {resetConfirmState && <RequisitionDialog title="ละทิ้งการเปลี่ยนแปลง?" onClose={() => setResetConfirmState(null)} busy={resetSaving || draftSaveStatus === "saving"} footer={<>
        <button type="button" disabled={resetSaving || draftSaveStatus === "saving"} onClick={() => setResetConfirmState(null)}>กลับไปแก้ไข</button>
        <button type="button" className={dialogStyles.primary} disabled={resetSaving || draftSaveStatus === "saving"} onClick={async () => {
          if (resetInFlight.current) return;
          resetInFlight.current = true;
          setResetSaving(true);
          try {
            const ok = await (resetConfirmState.all ? performResetAllDrafts() : performResetDocument(resetConfirmState.docKey));
            if (ok) setResetConfirmState(null);
          } catch (resetError) {
            setDraftSaveStatus("error");
            setDraftSaveMessage(resetError?.message || "ละทิ้งการเปลี่ยนแปลงไม่สำเร็จ กรุณาลองใหม่");
          } finally {
            resetInFlight.current = false;
            setResetSaving(false);
          }
        }}>ละทิ้งการเปลี่ยนแปลง</button>
      </>}><p>จำนวนและ LOT ที่แก้ในแบบร่าง{resetConfirmState.all ? "ทั้งหมด" : "ใบนี้"}จะกลับไปใช้ค่าจากแผน โดยไม่ลบประวัติที่ Export แล้ว</p>{draftSaveStatus === "error" && <p role="alert" className="text-red-700">{draftSaveMessage}</p>}</RequisitionDialog>}
      <HideDocumentConfirmModal
        document={workingDocuments.find((doc) => normalizeDocumentKeys(hideConfirmDocKey).includes(doc.documentKey))}
        masterPlanNo={masterPlanNo}
        open={Boolean(hideConfirmDocKey)}
        onCancel={() => setHideConfirmDocKey(null)}
        onConfirm={() => {
          if (hideConfirmDocKey) {
            const nextKeys = normalizeDocumentKeys(hideConfirmDocKey);
            setHiddenDocKeys((current) => Array.from(new Set([...current, ...nextKeys])));
          }
          setHideConfirmDocKey(null);
        }}
      />

      <ExportExcelModal
        open={isExportModalOpen}
        selectedDate={exportSelectedDate}
        dateColumns={dateColumns}
        departments={exportDepartmentOptions}
        selectedDepartmentIdsDaily={selectedDepartmentIdsDaily}
        selectedDepartmentIdsWeekly={selectedDepartmentIdsWeekly}
        onClose={() => setIsExportModalOpen(false)}
        onChangeDate={setExportSelectedDate}
        onToggleDepartment={toggleExportDepartment}
        onSubmit={handleExportExcel}
        submitting={exportingExcel}
      />

      <ExportErrorPopup
        message={exportErrorMessage}
        onClose={() => setExportErrorMessage("")}
      />

      {planPickerOpen && <RequisitionPlanPicker plans={planOptions} selectedPlanNo={masterPlanNo} onSelect={setMasterPlanNo} onClose={() => setPlanPickerOpen(false)} formatDate={formatDate} loading={!planPayload && !planOptionsError} error={planOptionsError} onRetry={() => reloadPlans()} />}
      <HiddenDocumentsModal
        open={isHiddenDocsModalOpen}
        hiddenKeys={hiddenDocKeys}
        allDocuments={workingDocuments}
        onClose={() => setIsHiddenDocsModalOpen(false)}
        onRestore={(docKey) => {
          setHiddenDocKeys((current) => current.filter((key) => key !== docKey));
          setRestoreMessage("แสดงใบเบิกแล้ว");
        }}
        onRestoreAll={() => {
          setHiddenDocKeys([]);
          setRestoreMessage("แสดงใบเบิกทั้งหมดแล้ว");
          setIsHiddenDocsModalOpen(false);
        }}
      />
      {restoreMessage && <div role="status" className={dialogStyles.toast}><CheckCircle2 size={18} />{restoreMessage}<button type="button" aria-label="ปิดข้อความ" onClick={() => setRestoreMessage("")}><X size={16} /></button></div>}
    </main>
  );
}

function HiddenDocumentsModal({ open, hiddenKeys, allDocuments, onClose, onRestore, onRestoreAll }) {
  if (!open) return null;
  const docs = allDocuments.filter((doc) => hiddenKeys.includes(doc.documentKey));
  return <RequisitionDialog title={"ใบเบิกที่ซ่อน (" + docs.length + ")"} wide onClose={onClose} footer={<>
    <button type="button" onClick={onRestoreAll} disabled={!docs.length}>แสดงทั้งหมด</button>
    <button type="button" onClick={onClose}>ปิด</button>
  </>}>
    <p className="mb-3">ใบที่ซ่อนจะไม่แสดงใน Preview และไม่รวมในไฟล์ Excel สามารถแสดงคืนได้ภายหลัง</p>
    <HiddenDocumentsTable documents={docs} onRestore={onRestore} />
  </RequisitionDialog>;
}

function HiddenDocumentsTable({ documents, onRestore }) {
  return <div className="overflow-x-auto"><table className={dialogStyles.table}><thead><tr>
    {["#", "ห้องผลิต", "แผนก", "กะ", "จำนวนรายการ", "จัดการ"].map((label) => <th key={label}>{label}</th>)}
  </tr></thead><tbody>{documents.length ? documents.map((doc, index) => <tr key={doc.documentKey}>
    <td>{index + 1}</td><td>{formatRoomName(doc.roomLabel, doc.roomId)}</td><td>{doc.ownerDepartmentName || doc.ownerDepartmentCode || "-"}</td>
    <td>{formatShiftName(doc)}</td><td>{doc.lines?.length || 0}</td>
    <td><button type="button" className={dialogStyles.link} onClick={() => onRestore(doc.documentKey)}>แสดงใบนี้</button></td>
  </tr>) : <tr><td colSpan={6}>ไม่มีใบเบิกที่ซ่อน</td></tr>}</tbody></table></div>;
}

function HideDocumentConfirmModal({ open, document: doc, masterPlanNo, onCancel, onConfirm }) {
  if (!open) return null;
  return <RequisitionDialog title="ซ่อนใบเบิกนี้?" onClose={onCancel} footer={<>
    <button type="button" onClick={onCancel}>ไม่ซ่อน</button>
    <button type="button" className={dialogStyles.orange} onClick={onConfirm}>ซ่อนใบนี้</button>
  </>}>
    <p>{formatRoomName(doc?.roomLabel, doc?.roomId)} {masterPlanNo ? "(แผนหลัก " + masterPlanNo + ")" : ""}</p>
    <p>จะไม่แสดงใน Preview และไม่รวมในไฟล์ Excel สามารถเรียกคืนได้ภายหลัง</p>
  </RequisitionDialog>;
}

export default RequisitionPreviewGeneratorClient;




