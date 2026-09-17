"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Download,
  FileSpreadsheet,
  Info,
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
  resolveRequisitionPreviewCellQty,
  upsertRequisitionSourceLineQty,
} from "@/lib/requisitionPreviewDisplay";
import { usePersistentRouteState } from "@/lib/usePersistentRouteState";
import PlanningHeader from "@/features/production-planning/components/PlanningHeader";
import ProductionScheduleClient from "./ProductionScheduleClient";
import RequisitionSequenceSettingsPanel from "./RequisitionSequenceSettingsPanel";

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
  const year = String(date.getUTCFullYear() + 543).slice(-2);
  return `${day}/${month}/${year}`;
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
        });
      }
      const target = lineMap.get(lineKey);
      if (!target.itemType && line.itemType) target.itemType = line.itemType;
      Object.entries(line.qtyByDate || {}).forEach(([dateValue, qty]) => {
        target.qtyByDate[dateValue] = roundQty(toNumber(target.qtyByDate[dateValue]) + toNumber(qty));
      });
      target.totalQty = roundQty(target.totalQty + toNumber(line.totalQty));
    });
  });

  const workNamesByDate = {};
  const documentNoByDate = {};
  const exportedByDate = {};
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
    lines: normalizeLines(Array.from(lineMap.values())),
  };
}

function EditableQtyCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0b1220]/50 px-4">
        <div className="w-full max-w-sm rounded-[2px] border border-[#102C57] bg-white shadow-[0_24px_80px_rgba(16,44,87,0.24)]">
          <div className="border-b border-[#102C57] bg-[#102C57] px-5 py-4 text-white">
            <div className="text-sm font-black tracking-[0.2px]">แก้ไขจำนวน</div>
          </div>
          <div className="p-5">
            <input
              autoFocus
              type="number"
              min="0"
              step="0.001"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-11 w-full rounded-[2px] border-2 border-[#102C57] bg-white px-3 text-right text-sm font-bold text-black outline-none focus:border-[#DA291C] focus:ring-0"
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e4e7ec] px-5 py-4">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-[2px] border border-[#CCCCCC] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.5px] text-black transition hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(roundQty(draft));
                setEditing(false);
              }}
              className="rounded-[2px] border border-[#102C57] bg-[#102C57] px-4 py-2 text-xs font-black uppercase tracking-[0.5px] text-white transition hover:bg-[#0c2345]"
            >
              ยืนยัน
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex h-6 w-full items-center justify-end gap-1">
      <span className="min-w-0 flex-1 text-right font-bold">{formatQty(value)}</span>
      <button
        type="button"
        onClick={() => {
          setDraft(value > 0 ? String(value) : "");
          setEditing(true);
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] border border-[#CCCCCC] bg-white text-black opacity-0 transition-colors group-hover:opacity-100 hover:border-[#102C57] hover:bg-[#fff8e2] focus-visible:opacity-100"
        title="แก้ไขจำนวน"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function RequisitionItemsDrawer({
  open,
  document,
  documentActionKeys = [],
  addMode = false,
  existingLineKeys,
  onClose,
  onOpenAddMode,
  onCloseAddMode,
  onConfirmAddMaterial,
  onRequestDeleteLine,
}) {
  const [searchText, setSearchText] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const effectiveDocumentActionKeys = normalizeDocumentKeys(
    documentActionKeys.length ? documentActionKeys : document?.documentKey
  );

  const getMaterialPageKey = useCallback((pageIndex, previousPageData) => {
    if (!open || !addMode) return null;
    if (previousPageData && previousPageData?.meta?.hasMore !== true) return null;
    const query = new URLSearchParams({ page: String(pageIndex + 1), pageSize: "300" });
    if (deferredSearchText) query.set("search", deferredSearchText);
    if (previousPageData?.meta?.nextCursor) query.set("cursor", previousPageData.meta.nextCursor);
    return `/api/production-planning/material-verify/material-options?${query.toString()}`;
  }, [addMode, deferredSearchText, open]);

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

  const { options, existingOptions } = useMemo(() => {
    const available = [];
    const existing = [];
    materialOptions.forEach((row) => {
      const key = `${normalizeTextKey(row?.goodsCode || row?.skuCode)}|${normalizeTextKey(row?.unit)}`;
      (existingLineKeys.has(key) ? existing : available).push(row);
    });
    return { options: available, existingOptions: existing };
  }, [existingLineKeys, materialOptions]);
  const loadedOptionCount = materialOptions.length;
  const lastMaterialPage = materialPages[materialPages.length - 1] || null;
  const hasMoreMaterials = Boolean(lastMaterialPage?.meta?.hasMore);

  const selectedOption = useMemo(() => {
    return options.find((option) => `${option.skuCode}::${option.goodsCode}` === selectedKey) || null;
  }, [options, selectedKey]);

  if (!open || !document) return null;

  return (
    <div className="fixed inset-0 z-[130] flex justify-end bg-[#102C57]/40">
      <aside className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l-2 border-[#102C57] bg-white shadow-none">
        {/* Drawer Header */}
        <div className="border-b-2 border-[#102C57] bg-[#102C57] px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[2px] text-[#f6e7a8]">
                Requisition Draft (จัดการรายการวัตถุดิบ)
              </div>
              <h3 className="mt-1 text-lg font-black uppercase tracking-[0.5px] text-white">จัดการรายการวัตถุดิบ</h3>
              <p className="mt-1 text-xs text-[#8F8F8F] uppercase tracking-[0.5px]">
                แก้ไขจำนวนรายวันในตารางหลัก หรือเพิ่ม/ลบรายการจากแถบด้านข้างนี้
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-white/20 bg-white/5 text-white transition hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Room & Dept banner */}
        <div className="border-b-2 border-[#102C57] bg-[#fff8e2] px-5 py-3 text-xs font-bold text-black uppercase tracking-[0.5px]">
          <div>ห้องจัดเตรียม: <span className="font-extrabold font-mono">{formatRoomName(document.roomLabel, document.roomId)}</span></div>
          <div className="mt-0.5 text-black/75">
            แผนกเจ้าของ: {document.ownerDepartmentName || document.ownerDepartmentCode || "-"}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-[#CCCCCC] bg-white px-5 py-3">
          <button
            type="button"
            onClick={addMode ? onCloseAddMode : onOpenAddMode}
            className={`inline-flex items-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[#102C57] text-white hover:bg-[#fff8e2] hover:text-black hover:border-[#F6E500] px-4 py-2 text-xs font-black uppercase tracking-[1px] transition cursor-pointer`}
          >
            {addMode ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {addMode ? "กลับไปดูรายการ" : "เพิ่มวัตถุดิบใหม่"}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Main Document Lines */}
          <section className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-[1px] text-black">รายการที่อยู่ในใบนี้</div>
              <div className="text-xs font-mono font-bold text-[#667085]">
                {(document.lines || []).length.toLocaleString("th-TH")} รายการ
              </div>
            </div>

            <div className="space-y-2.5">
              {(document.lines || []).map((line) => {
                const lineKey = buildLineKey(line);
                const activeDays = Object.keys(line.qtyByDate || {}).length;
                return (
                  <div
                    key={`${document.documentKey}-${lineKey}`}
                    className="rounded-[2px] border border-[#CCCCCC] bg-[#FCFCF9] px-4 py-4 transition hover:border-[#102C57]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-bold text-[#667085]">
                          {line.materialGoodsCode || line.materialSkuCode || "-"}
                        </div>
                        <div className="mt-1 text-sm font-bold text-black leading-tight">
                          {line.materialName || "-"}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-black uppercase tracking-[0.5px]">
                          <span className="rounded-[2px] border border-[#CCCCCC] bg-white px-2 py-1">
                            หน่วย: {line.unit || "-"}
                          </span>
                          <span className="rounded-[2px] border border-[#CCCCCC] bg-white px-2 py-1">
                            ใช้งาน: {activeDays.toLocaleString("th-TH")} วัน
                          </span>
                          <span className="rounded-[2px] border border-[#102C57] bg-[#FCF5F5] text-[#8a6a00] px-2 py-1 font-black">
                            รวมเบิก: {formatQty(line.totalQty)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onRequestDeleteLine(document.documentKey, {
                            docKeys: effectiveDocumentActionKeys,
                            lineKey,
                            materialSkuCode: line.materialSkuCode,
                            materialGoodsCode: line.materialGoodsCode,
                            materialName: line.materialName,
                            unit: line.unit,
                          })
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border-2 border-[#102C57] bg-white hover:bg-[#0c2345] hover:text-white transition cursor-pointer"
                        title="ลบรายการ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {!document.lines?.length ? (
                <div className="rounded-[2px] border-2 border-dashed border-[#CCCCCC] bg-white px-4 py-10 text-center text-xs font-bold uppercase tracking-[1px] text-[#8F8F8F]">
                  ยังไม่มีรายการวัตถุดิบในเอกสารนี้
                </div>
              ) : null}
            </div>
          </section>

          {/* Add Mode Options List */}
          {addMode ? (
            <section className="border-t-2 border-[#102C57] px-5 py-5 bg-[#FCFCF9]">
              <div className="mb-3 text-xs font-black uppercase tracking-[1px] text-black">ค้นหาเพื่อเพิ่มวัตถุดิบ</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8F8F8F]" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="ค้นหารหัสหรือชื่อวัตถุดิบ..."
                  className="h-10 w-full rounded-[2px] border-2 border-[#102C57] bg-white pl-10 pr-3 text-xs font-bold text-black placeholder-[#98a2b3] outline-none focus:border-[#DA291C] transition"
                />
              </div>

              <div className="mt-4 overflow-hidden rounded-[2px] border border-[#102C57] bg-white">
                <div className="border-b border-[#CCCCCC] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[1px] text-[#667085]">
                  โหลดจาก catalog {loadedOptionCount.toLocaleString("th-TH")} รายการ
                  {deferredSearchText ? " จากผลค้นหา" : ""}
                </div>
                <table className="w-full border-collapse text-left text-xs text-black">
                  <thead className="bg-[#102C57] text-white">
                    <tr className="border-b border-[#102C57] text-[10px] font-bold uppercase tracking-[1px]">
                      <th className="w-12 px-3 py-3" />
                      <th className="w-[150px] px-3 py-3">รหัส</th>
                      <th className="px-3 py-3">รายการวัตถุดิบ</th>
                      <th className="w-[92px] px-3 py-3">หน่วย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.map((option) => {
                      const optionKey = `${option.skuCode}::${option.goodsCode}`;
                      const isSelected = optionKey === selectedKey;
                      return (
                        <tr
                          key={optionKey}
                          onClick={() => setSelectedKey(optionKey)}
                          className={`cursor-pointer border-b border-[#CCCCCC] transition ${
                            isSelected ? "bg-[#FFF9E6]" : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-3 py-3.5">
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-[2px] border-2 ${
                                isSelected
                                  ? "border-[#102C57] bg-[#102C57] text-white"
                                  : "border-[#CCCCCC] bg-white"
                              }`}
                            >
                              {isSelected ? <Plus className="h-3 w-3" /> : null}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 align-top">
                            <div className="font-mono text-xs font-bold tracking-[0.5px]">{option.goodsCode}</div>
                            {option.skuCode && option.skuCode !== option.goodsCode ? (
                              <div className="mt-0.5 font-mono text-[9px] text-[#667085]">SKU: {option.skuCode}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3.5 font-bold text-black leading-snug">{option.name}</td>
                          <td className="px-3 py-3.5 font-bold text-[#667085]">{option.unit || "-"}</td>
                        </tr>
                      );
                    })}

                    {existingOptions.length > 0 ? (
                      <tr>
                        <td colSpan={4} className="bg-[#F5F7FA] px-3 py-2 text-[10px] font-black uppercase tracking-[1px] text-[#8F8F8F]">
                          มีในเอกสารนี้แล้ว — เพิ่มซ้ำไม่ได้
                        </td>
                      </tr>
                    ) : null}
                    {existingOptions.map((option) => {
                      const optionKey = `${option.skuCode}::${option.goodsCode}`;
                      return (
                        <tr
                          key={`existing-${optionKey}`}
                          className="cursor-not-allowed border-b border-[#CCCCCC] bg-[#FCFCF9] opacity-60"
                          title="มีในเอกสารแล้ว"
                        >
                          <td className="px-3 py-3.5">
                            <div className="flex h-5 w-5 items-center justify-center rounded-[2px] border-2 border-[#CCCCCC] bg-[#E5E7EB]" />
                          </td>
                          <td className="px-3 py-3.5 align-top">
                            <div className="font-mono text-xs font-bold tracking-[0.5px] text-[#667085]">{option.goodsCode}</div>
                            {option.skuCode && option.skuCode !== option.goodsCode ? (
                              <div className="mt-0.5 font-mono text-[9px] text-[#667085]">SKU: {option.skuCode}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3.5 font-bold leading-snug text-[#667085]">
                            <div>{option.name}</div>
                            <span className="mt-1 inline-flex rounded-[2px] border border-[#d4af37] bg-[#fff8e2] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.5px] text-[#8a6a00]">
                              มีในเอกสารแล้ว
                            </span>
                          </td>
                          <td className="px-3 py-3.5 font-bold text-[#667085]">{option.unit || "-"}</td>
                        </tr>
                      );
                    })}

                    {!isLoading && !error && options.length === 0 && existingOptions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-xs font-bold uppercase tracking-[1px] text-[#8F8F8F]">
                          ไม่พบวัตถุดิบที่พร้อมเพิ่มในเอกสารนี้
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>

                {isLoading ? (
                  <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">กำลังโหลดรายการวัตถุดิบ...</div>
                ) : null}
                {hasMoreMaterials ? (
                  <div className="border-t border-[#CCCCCC] bg-white px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setMaterialPageCount(materialPageCount + 1)}
                      disabled={isLoading || isValidating}
                      className="rounded-[2px] border-2 border-[#102C57] bg-white px-4 py-2 text-xs font-black uppercase tracking-[1px] text-[#102C57] transition hover:bg-[#fff8e2] disabled:opacity-50"
                    >
                      โหลดเพิ่ม
                    </button>
                  </div>
                ) : null}
                {error ? (
                  <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-red-600">
                    {String(error?.message || "โหลดรายการวัตถุดิบไม่สำเร็จ")}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="border-t-2 border-[#102C57] bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-[#667085] uppercase tracking-[0.5px]">
              {addMode ? (
                selectedOption ? (
                  <span>
                    พร้อมเพิ่ม: <span className="font-extrabold text-black">{selectedOption.name}</span>
                  </span>
                ) : (
                  "กรุณาเลือกวัตถุดิบ 1 รายการก่อน"
                )
              ) : (
                "แก้ไขจำนวนรายวันโดยกดที่ตัวเลขในตารางหลัก"
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[2px] border-2 border-[#102C57] bg-white hover:bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-[1.28px] transition cursor-pointer"
              >
                ปิด
              </button>
              {addMode ? (
                <button
                  type="button"
                  disabled={!selectedOption}
                  onClick={() => {
                    if (!selectedOption) return;
                    onConfirmAddMaterial(selectedOption);
                  }}
                  className="rounded-[2px] border-2 border-[#102C57] bg-[#102C57] hover:bg-[#0c2345] hover:border-[#0c2345] disabled:bg-[#CCCCCC] disabled:border-[#CCCCCC] disabled:text-[#8F8F8F] px-4 py-2 text-xs font-black uppercase tracking-[1.28px] text-white transition cursor-pointer"
                >
                  เพิ่มเข้าเอกสาร
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
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
    <div className="fixed inset-0 z-[130] flex justify-end bg-[#102C57]/45">
      <aside className="flex h-full w-full max-w-[calc(100vw-24px)] flex-col overflow-hidden border-l-2 border-[#102C57] bg-white shadow-none">
        <div className="border-b-2 border-[#102C57] bg-[#102C57] px-5 py-4 text-white">
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
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[#102C57] px-3 py-2 text-xs font-black uppercase tracking-[1px] text-white transition hover:bg-[#0c2345] disabled:cursor-not-allowed disabled:border-[#CCCCCC] disabled:bg-[#CCCCCC] disabled:text-[#8F8F8F]"
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
                  <thead className="sticky top-0 z-10 bg-[#102C57] text-white">
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
                            active ? "bg-[#102C57] text-white" : "bg-white hover:bg-[#F5F7FA]"
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
                <span className="rounded-[2px] border border-[#102C57] bg-[#102C57] px-3 py-1 text-[10px] font-black uppercase tracking-[1px] text-white">
                  Supplemental Draft
                </span>
                <span className="rounded-[2px] border border-[#d4af37] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[1px] text-[#8a6a00]">
                  ใบหลัก Export แล้ว {selectedDateOption?.documentNo || ""}
                </span>
              </div>

              <div className="min-h-[520px] overflow-hidden rounded-[2px] border-2 border-[#102C57] bg-white shadow-none">
                <div className="flex items-start justify-between gap-4 bg-[#102C57] px-5 py-4 text-white">
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
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[#102C57] text-[#102C57] hover:bg-[#102C57] hover:text-white"
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
              className="inline-flex items-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[#102C57] px-4 py-2 text-xs font-black uppercase tracking-[1.2px] text-white transition hover:bg-[#0c2345] disabled:cursor-not-allowed disabled:border-[#CCCCCC] disabled:bg-[#CCCCCC] disabled:text-[#8F8F8F]"
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

function DeleteConfirmModal({ state, onCancel, onConfirm }) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#102C57]/45 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-[2px] border border-[#102C57]/15 bg-white shadow-[0_24px_60px_rgba(16,44,87,0.2)]">
        <div className="border-b border-[#102C57]/10 bg-[#102C57] px-5 py-4 text-white">
          <div className="text-[10px] font-black uppercase tracking-[2px] text-[#d4af37]">ยืนยันการลบ</div>
          <h3 className="mt-1 text-lg font-black tracking-[0.2px] text-white">ต้องการลบรายการนี้ใช่ไหม</h3>
        </div>

        <div className="bg-[#fcfcf9] px-5 py-5">
          <div className="rounded-[2px] border border-[#102C57]/12 bg-white px-4 py-4">
            <div className="text-[10px] font-extrabold uppercase tracking-[1px] text-[#b42318]">รายการที่จะถูกลบ</div>
            <div className="mt-3 text-[#102C57]">
              <div className="font-mono text-xs font-bold text-[#667085]">{state.materialGoodsCode || state.materialSkuCode}</div>
              <div className="mt-1 text-sm font-black leading-tight text-[#102C57]">{state.materialName || "-"}</div>
              <div className="mt-2 text-xs font-bold uppercase tracking-[0.5px] text-[#667085]">หน่วย: {state.unit || "-"}</div>
            </div>
          </div>
          <p className="mt-4 text-xs font-bold leading-relaxed uppercase tracking-[0.5px] text-[#667085]">
            หากลบแล้ว รายการนี้จะหายออกจากใบเบิกฉบับร่างทันที
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e4e7ec] bg-white px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[2px] border border-[#d0d5dd] bg-white px-4 py-2 text-xs font-black uppercase tracking-[1.28px] text-[#102C57] transition hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[2px] border border-[#b42318] bg-[#b42318] px-4 py-2 text-xs font-black uppercase tracking-[1.28px] text-white transition hover:bg-[#912018]"
          >
            ลบรายการ
          </button>
        </div>
      </div>
    </div>
  );
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

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0b1220]/55 px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-[2px] border border-[#102C57] bg-white shadow-[0_30px_80px_rgba(16,44,87,0.24)]">
        <div className="flex items-center justify-between border-b border-[#102C57] bg-[#102C57] px-5 py-4 text-white">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[1.6px] text-[#d4af37]">
              Export Excel
            </div>
            <h3 className="mt-1 text-lg font-black tracking-[0.2px]">
              เลือกแผนกสำหรับรายวันและรายสัปดาห์
            </h3>
            <p className="mt-1 text-xs font-bold text-white/75">
              1 แผนกจะอยู่ได้ทั้ง 2 กลุ่ม ถ้าต้องการออกทั้งรายวันและรายสัปดาห์ในรอบเดียว
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-white/30 text-white transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
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
                          ? "border-[#d4af37] bg-[#fff8e2] text-[#102C57]"
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
              <div className="mb-3 rounded-[2px] border border-[#d4af37] bg-[#fff8e2] px-3 py-2 text-xs font-bold text-[#8a6a00]">
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
                          ? "border-[#d4af37] bg-[#fff8e2] text-[#102C57]"
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

        <div className="flex items-center justify-end gap-2 border-t border-[#e4e7ec] bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[2px] border border-[#d0d5dd] bg-white px-4 py-2 text-xs font-black uppercase tracking-[1.2px] text-[#102C57] transition hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-[2px] border border-[#102C57] bg-[#102C57] px-4 py-2 text-xs font-black uppercase tracking-[1.2px] text-white transition hover:bg-[#0c2345] disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:border-[#94a3b8]"
          >
            <Download className="h-4 w-4" />
            {submitting ? "กำลัง Export..." : "Export Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportErrorPopup({ message, onClose }) {
  if (!message) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-[#071426]/70 px-4 py-8"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="export-error-title"
      aria-describedby="export-error-message"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[2px] border-2 border-[#b42318] bg-white shadow-[0_32px_90px_rgba(7,20,38,0.42)]">
        <div className="flex items-center justify-between border-b border-[#d4af37] bg-[#102C57] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fff4ed] text-[#b42318]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[1.6px] text-[#d4af37]">
                Export Excel
              </div>
              <h3 id="export-error-title" className="mt-0.5 text-lg font-black">
                ส่งออกไฟล์ไม่สำเร็จ
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดข้อความแจ้งเตือน"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-white/30 text-white transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p id="export-error-message" className="break-words text-sm font-bold leading-6 text-[#344054]">
            {message}
          </p>
          <div className="mt-4 border-l-4 border-[#d4af37] bg-[#fff8e2] px-3 py-2 text-xs font-bold leading-5 text-[#6b5200]">
            กรุณาตรวจสอบข้อมูลตามข้อความข้างต้น แล้วลอง Export ใหม่อีกครั้ง
          </div>
        </div>

        <div className="flex justify-end border-t border-[#e4e7ec] bg-[#f8fafc] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-[2px] border border-[#102C57] bg-[#102C57] px-5 py-2.5 text-xs font-black uppercase tracking-[1.2px] text-white transition hover:bg-[#0c2345]"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}

function RequisitionDocument({
  doc,
  pageColumns,
  editable = false,
  showExportState = true,
  onOpenManager,
  onOpenAddMaterial,
  onOpenSupplemental,
  onResetDocument,
  onUpdateQty,
  onHideDocument,
}) {
  const [breakdownState, setBreakdownState] = useState(null);
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
  const actionColspan = 4 + displayColumns.length;
  const shiftLabel = formatShiftName(doc);
  const actionDocumentKeys = normalizeDocumentKeys(
    doc?.sourceDocumentKeys?.length ? doc.sourceDocumentKeys : doc.documentKey
  );
  const actionDocumentKey = actionDocumentKeys[0] || doc.documentKey;
  const isColumnExported = (column) => showExportState && column?.exported === true;
  const exportedDateOptions = getExportedDateOptions(doc, pageColumns);
  const tableMinWidth = Math.max(1040, 545 + (displayColumns.length * 88));

  return (
    <article className="bg-white">
      <div className="w-full">
        <div className="w-full bg-white">
          <header className="border-b border-[#102C57] bg-gradient-to-r from-[#082b5e] to-[#0d3975] px-4 py-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-black tracking-[0.5px]">ใบสั่งงาน / ใบขอเบิกวัตถุดิบ (Preview)</h2>
                <p className="mt-1 text-sm font-bold text-[#f6e7a8]">
                  แผนก : {doc.ownerDepartmentName || doc.ownerDepartmentCode || "-"}
                </p>
                {doc.previewProductCount > 1 ? (
                  <p className="mt-1 text-sm font-bold text-[#f6e7a8]">
                    สินค้า : {doc.previewProductCount.toLocaleString("th-TH")} รายการ · แยกตามวันที่ผลิต
                  </p>
                ) : doc.parentSku ? (
                  <p className="mt-1 text-sm font-bold text-[#f6e7a8]">
                    สินค้า : {doc.parentSkuName && doc.parentSkuName !== doc.parentSku ? `${doc.parentSkuName} (${doc.parentSku})` : doc.parentSku}
                  </p>
                ) : null}
              </div>
              {editable ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onResetDocument(actionDocumentKeys)}
                    className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/30 bg-transparent px-3.5 py-2 text-xs font-black tracking-[0.5px] text-white transition hover:bg-white/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    รีเซ็ตใบนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenManager(actionDocumentKeys)}
                    className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#d4af37] bg-[#fff8e2] px-3.5 py-2 text-xs font-black tracking-[0.5px] text-[#8a6a00] transition hover:bg-[#f6e7a8]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    จัดการรายการ
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAddMaterial(actionDocumentKeys)}
                    className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#d4af37] bg-[#d4af37] px-3.5 py-2 text-xs font-black tracking-[0.5px] text-[#102C57] transition hover:bg-[#c39b22]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    เพิ่มวัตถุดิบ
                  </button>
                  {exportedDateOptions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenSupplemental(actionDocumentKey)}
                      className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#f6e7a8] bg-white px-3.5 py-2 text-xs font-black tracking-[0.5px] text-[#102C57] transition hover:bg-[#fff8e2]"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      ใบเบิกเพิ่มเติม
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onHideDocument && onHideDocument(actionDocumentKeys)}
                    className="inline-flex items-center gap-1.5 rounded-[2px] border border-red-500/30 bg-red-50 px-3.5 py-2 text-xs font-black tracking-[0.5px] text-red-600 transition hover:bg-red-100 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ซ่อนใบนี้
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <div className="grid grid-cols-4 border-b border-black bg-white text-sm font-bold text-black">
            <div className="border-r border-black p-3">
              <div className="text-[11px] font-black uppercase tracking-[1px] text-[#667085]">วันที่</div>
              <div className="mt-1 font-black text-[#8f2d1f]">
                {formatDate(pageColumns[0])} ถึง {formatDate(pageColumns[pageColumns.length - 1])}
              </div>
            </div>
            <div className="border-r border-black p-3">
              <div className="text-[11px] font-black uppercase tracking-[1px] text-[#667085]">ผู้จัดทำ</div>
              <div className="mt-1 inline-flex items-center gap-2 font-black text-black">
                <User className="h-4 w-4" />
                <span>{doc.qaDepartmentName || doc.qaDepartmentCode || "-"}</span>
              </div>
            </div>
            <div className="border-r border-black p-3">
              <div className="text-[11px] font-black uppercase tracking-[1px] text-[#667085]">เดินงาน (Area)</div>
              <div className="mt-1 inline-flex items-center gap-2 font-black text-black">
                <MapPin className="h-4 w-4" />
                <span>{formatRoomName(doc.roomLabel, doc.roomId)}</span>
              </div>
            </div>
            <div className="p-3">
              <div className="text-[11px] font-black uppercase tracking-[1px] text-[#667085]">กะ (Shift)</div>
              <div className="mt-1 inline-flex items-center gap-2 font-black text-black">
                <Clock3 className="h-4 w-4" />
                <span>{shiftLabel}</span>
              </div>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-xs text-black" style={{ minWidth: `${tableMinWidth}px` }}>
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "290px" }} />
              <col style={{ width: "70px" }} />
              {displayColumns.map((column) => <col key={`${doc.documentKey}-col-${column.key}`} style={{ width: "88px" }} />)}
              <col style={{ width: "75px" }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={3} className="sticky left-0 z-30 border-r border-b border-black bg-[#f8f4d8] px-2 py-2 text-center text-xs font-black text-black shadow-[2px_0_0_#000]">
                  รหัส
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
                    className={`border-r border-b border-black px-1.5 py-1.5 text-center text-[10px] font-black text-black ${
                      columns.every(isColumnExported) ? "bg-[#d1d5db]" : DAY_TONE_CLASSES[index % DAY_TONE_CLASSES.length]
                    }`}
                  >
                    {formatDate(dateValue)}
                  </th>
                ))}
                <th rowSpan={3} className="w-[6%] border-b border-black bg-[#f1d4d0] px-2 py-3 text-center text-xs font-black text-[#8f2d1f]">
                  ยอดรวม
                </th>
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
                      {productLabel ? (
                        <div className="break-words text-black">
                          <div>{productLabel}</div>
                          {column.productCode ? <div className="mt-0.5 text-[8px] font-black">{column.productCode}</div> : null}
                        </div>
                      ) : (
                        <span className="font-mono text-[#98a2b3]">-</span>
                      )}
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
              {(doc.lines || []).map((line) => {
                const lineKey = buildLineKey(line);
                return (
                  <tr key={`${doc.documentKey}-${lineKey}`} className="transition-colors hover:bg-slate-50">
                    <td className="sticky left-0 z-10 border-r border-b border-black bg-white px-2 py-2 font-mono text-xs font-bold tracking-[0.2px] text-black shadow-[2px_0_0_#000]">
                      {line.materialGoodsCode || line.materialSkuCode}
                    </td>
                    <td className="sticky left-[110px] z-10 border-r border-b border-black bg-white px-2 py-2 text-xs font-bold leading-[1.2] text-black shadow-[2px_0_0_#000]">
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
                      return (
                        <td
                          key={`${doc.documentKey}-${lineKey}-${column.key}`}
                          className={`border-r border-b border-black px-1.5 py-2 text-center text-xs font-semibold ${
                            isColumnExported(column)
                              ? qty > 0
                                ? "bg-[#e5e7eb] font-black text-black"
                                : "bg-[#f3f4f6] text-[#6b7280]"
                              : qty > 0
                                ? "bg-[#fff8e2] font-black text-[#8a6a00]"
                                : "text-[#98a2b3]"
                          }`}
                        >
                          {column.isDailyRoomConsolidated && (breakdown.length > 1 || (editable && breakdown.length > 0)) ? (
                            <button
                              type="button"
                              onClick={() => setBreakdownState({
                                materialCode: line.materialGoodsCode || line.materialSkuCode,
                                materialName: line.materialName,
                                unit: line.unit,
                                dateValue: column.dateValue,
                                totalQty: qty,
                                lineKey,
                                breakdown,
                              })}
                              className="inline-flex items-center justify-center gap-1 rounded-sm px-1 py-0.5 font-black text-[#8a6a00] hover:bg-[#f6e7a8] focus:outline-none focus:ring-2 focus:ring-[#102C57]"
                              title={`รวมจากสินค้า ${breakdown.length} รายการ — กดดูรายละเอียด`}
                              aria-label={`ดูที่มายอดรวม ${formatQty(qty)} ${line.unit || ""} ของ ${line.materialName}`}
                            >
                              <span>{formatQty(qty)}</span>
                              {breakdown.length > 1 ? (
                                <Info className="h-3.5 w-3.5 text-[#102C57]" aria-hidden="true" />
                              ) : null}
                            </button>
                          ) : editable && !column.isDailyRoomConsolidated ? (
                            <EditableQtyCell
                              value={qty}
                              onSave={(nextQty) => onUpdateQty(
                                column.sourceDocumentKey || actionDocumentKey,
                                lineKey,
                                column.dateValue,
                                nextQty
                              )}
                            />
                          ) : (
                            formatQty(qty)
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-black bg-[#fef3f2] px-2 py-2 text-right text-xs font-black text-[#8f2d1f]">
                      {formatQty(line.totalQty)}
                    </td>
                  </tr>
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
                  <td colSpan={3} className="border-r border-t border-black px-3 py-2 text-right text-[11px] font-black text-black">
                    เลขเอกสารใบเบิก
                  </td>
                  {displayColumns.map((column) => (
                    <td
                      key={`${doc.documentKey}-document-no-${column.key}`}
                      className={`border-r border-t border-black px-2 py-2 text-center text-[10px] font-bold ${
                        isColumnExported(column) ? "bg-[#e5e7eb] text-black" : "text-[#8a6a00]"
                      }`}
                    >
                      {column.documentNo || "-"}
                    </td>
                  ))}
                  <td className="border-t border-black px-3 py-2 text-center text-[10px] font-bold text-[#98a2b3]">
                    -
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {breakdownState ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#102C57]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="requisition-breakdown-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBreakdownState(null);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden border border-[#102C57] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[#102C57] px-5 py-4 text-white">
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
                      {editable ? (
                        <EditableQtyCell
                          value={item.qty}
                          onSave={(nextQty) => {
                            const result = onUpdateQty(
                              item.sourceDocumentKey,
                              breakdownState.lineKey,
                              breakdownState.dateValue,
                              nextQty
                            );
                            setBreakdownState(null);
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
    </article>
  );
}

export function RequisitionPreviewGeneratorClient({
  initialMasterPlanNo = "",
  initialDateFrom = "",
  initialDateTo = "",
}) {
  const pathname = usePathname();
  const [masterPlanNo, setMasterPlanNo] = useState(String(initialMasterPlanNo || "").trim().toUpperCase());
  const [dateFrom, setDateFrom] = useState(String(initialDateFrom || "").trim());
  const [dateTo, setDateTo] = useState(String(initialDateTo || "").trim());
  const [planSearch, setPlanSearch] = usePersistentRouteState("requisition-preview.planSearch", "");
  const [activeTab, setActiveTab] = usePersistentRouteState("requisition-preview.activeTab", "overview");
  const [activeCentralTab, setActiveCentralTab] = usePersistentRouteState("requisition-preview.activeCentralTab", "all");
  const [itemManagerState, setItemManagerState] = useState(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState("idle");
  const [draftSaveMessage, setDraftSaveMessage] = useState("");
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportErrorMessage, setExportErrorMessage] = useState("");
  const [exportSelectedDate, setExportSelectedDate] = useState("");
  const [selectedDepartmentIdsDaily, setSelectedDepartmentIdsDaily] = useState([]);
  const [selectedDepartmentIdsWeekly, setSelectedDepartmentIdsWeekly] = useState([]);
  const [activeEmbeddedSection, setActiveEmbeddedSection] = useState(null);
  const [supplementalState, setSupplementalState] = useState(null);
  const [supplementalExporting, setSupplementalExporting] = useState(false);
  const [hiddenDocKeys, setHiddenDocKeys] = useState([]);
  const [isHiddenDocsModalOpen, setIsHiddenDocsModalOpen] = useState(false);
  const [hideConfirmDocKey, setHideConfirmDocKey] = useState(null);

  useEffect(() => {
    setHiddenDocKeys([]);
  }, [dateFrom, dateTo, masterPlanNo]);

  const { data: planPayload } = useSWR("/api/production-planning/master-plan-options", fetcher, {
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

  const filteredPlanOptions = useMemo(() => {
    const term = String(planSearch || "").trim().toUpperCase();
    if (!term) return planOptions;
    return planOptions.filter((item) => item.planNo.includes(term));
  }, [planOptions, planSearch]);

  const previewUrl = useMemo(() => {
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (!normalizedPlanNo) return null;
    const query = new URLSearchParams();
    query.set("masterPlanNo", normalizedPlanNo);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
    return `/api/production-planning/requisition/preview?${query.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const { data, error, isLoading } = useSWR(previewUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const draftUrl = useMemo(() => {
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (!normalizedPlanNo) return null;
    const query = new URLSearchParams();
    query.set("masterPlanNo", normalizedPlanNo);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
    return `/api/production-planning/requisition/draft?${query.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const { data: draftPayload, mutate: mutateDraft } = useSWR(draftUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: departmentsPayload } = useSWR("/api/production-planning/departments?scope=all", fetcher, {
    revalidateOnFocus: false,
  });

  const { data: sequencesPayload, mutate: mutateSequences, isLoading: loadingSequences } = useSWR(
    activeTab === "sequences" ? "/api/production-planning/requisition/sequences" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const embeddedSubplanUrl = useMemo(() => {
    const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
    if (!normalizedPlanNo || !isScheduleExpanded) return null;
    return `/api/production-planning/schedule/master-report-detail?masterPlanNo=${encodeURIComponent(normalizedPlanNo)}`;
  }, [isScheduleExpanded, masterPlanNo]);

  const { data: embeddedSubplanPayload, error: embeddedSubplanError, isLoading: embeddedSubplanLoading } = useSWR(
    embeddedSubplanUrl,
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
          ? draftOverridesByDocKey[doc.documentKey]
          : doc.lines
      ),
    }));
  }, [draftOverridesByDocKey, sourceDocuments]);

  const dateColumns = useMemo(() => {
    const values = new Set(Array.isArray(data?.meta?.dateColumns) ? data.meta.dateColumns : []);
    workingDocuments.forEach((doc) => {
      if (doc.workDate) values.add(doc.workDate);
      (doc.lines || []).forEach((line) => {
        Object.keys(line.qtyByDate || {}).forEach((dateValue) => values.add(dateValue));
      });
    });
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [data, workingDocuments]);

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

  useEffect(() => {
    setActiveEmbeddedSection(null);
  }, [dateFrom, dateTo, masterPlanNo, scheduleDeptId]);

  const canShowEmbeddedSchedule = Boolean(masterPlanNo && scheduleDeptId);
  const scheduleDeptLabel = useMemo(() => {
    if (safeActiveTab === "central") {
      return String(
        centralDepartmentTabs.find((tab) => tab.key === safeCentralTab)?.label || "ไม่ระบุแผนก"
      ).trim();
    }
    return String(activeTabEntry?.label || "ไม่ระบุแผนก").trim();
  }, [activeTabEntry, centralDepartmentTabs, safeActiveTab, safeCentralTab]);
  const activeEmbeddedSectionId = String(activeEmbeddedSection?.id || "").trim();
  const activeEmbeddedSectionLabel = String(activeEmbeddedSection?.label || activeEmbeddedSection?.name || "").trim();
  const embeddedSubplanItems = useMemo(() => {
    const detail = embeddedSubplanPayload?.data;
    const rows = Array.isArray(detail?.dailyRows) ? detail.dailyRows : [];
    if (!scheduleDeptId) return [];
    return rows.flatMap((dayRow) =>
      (Array.isArray(dayRow?.subPlanItems) ? dayRow.subPlanItems : [])
        .filter((item) => String(item?.departmentId || "").trim() === scheduleDeptId)
        .filter((item) => !activeEmbeddedSectionId || String(item?.sectionId || "").trim() === activeEmbeddedSectionId)
        .map((item, index) => ({
          key: `${String(dayRow?.date || "")}-${String(item?.subPlanNo || "")}-${String(item?.skuCode || "")}-${index}`,
          date: String(dayRow?.date || "").trim(),
          subPlanNo: String(item?.subPlanNo || "").trim() || "-",
          sectionId: String(item?.sectionId || "").trim(),
          sectionName: String(item?.sectionName || "").trim(),
          skuCode: String(item?.skuCode || "").trim() || "-",
          skuName: String(item?.skuName || "").trim() || "-",
          batchQty: item?.batchQty == null ? null : toNumber(item?.batchQty),
          displayQty: toNumber(item?.displayQty ?? item?.plannedQty),
          displayUnit: String(item?.displayUnit || item?.unit || "").trim() || "-",
          workTime:
            item?.workStartTime || item?.workEndTime
              ? `${String(item?.workStartTime || "-").trim()} - ${String(item?.workEndTime || "-").trim()}`
              : "-",
          confirmed: Boolean(item?.confirmedAt),
        }))
    );
  }, [activeEmbeddedSectionId, embeddedSubplanPayload, scheduleDeptId]);
  const embeddedSubplanMatrixRows = useMemo(() => {
    const map = new Map();
    embeddedSubplanItems.forEach((item) => {
      const rowKey = `${normalizeTextKey(item.skuCode)}|${normalizeTextKey(item.displayUnit)}`;
      if (!map.has(rowKey)) {
        map.set(rowKey, {
          key: rowKey,
          skuCode: item.skuCode,
          skuName: item.skuName,
          displayUnit: item.displayUnit,
          qtyByDate: {},
          batchQtyByDate: {},
          totalQty: 0,
          totalBatchQty: 0,
        });
      }
      const target = map.get(rowKey);
      const dateValue = String(item.date || "").trim();
      if (!dateValue) return;
      const displayQty = roundQty(item.displayQty);
      target.qtyByDate[dateValue] = roundQty(toNumber(target.qtyByDate[dateValue]) + displayQty);
      target.totalQty = roundQty(target.totalQty + displayQty);
      if (item.batchQty != null) {
        const batchQty = roundQty(item.batchQty);
        target.batchQtyByDate[dateValue] = roundQty(toNumber(target.batchQtyByDate[dateValue]) + batchQty);
        target.totalBatchQty = roundQty(target.totalBatchQty + batchQty);
      }
    });
    return Array.from(map.values()).sort((left, right) => {
      const codeCompare = String(left.skuCode || "").localeCompare(String(right.skuCode || ""));
      if (codeCompare !== 0) return codeCompare;
      return String(left.displayUnit || "").localeCompare(String(right.displayUnit || ""));
    });
  }, [embeddedSubplanItems]);

  const handleEmbeddedSectionChange = useCallback((sectionIndex, section) => {
    setActiveEmbeddedSection({
      id: String(section?.id || "").trim(),
      label: String(section?.name || section?.label || `Section ${sectionIndex + 1}`).trim(),
    });
  }, []);

  const workingTotalLines = useMemo(() => {
    return workingDocuments.reduce((sum, doc) => sum + (Array.isArray(doc.lines) ? doc.lines.length : 0), 0);
  }, [workingDocuments]);

  const commitDrafts = async (nextDrafts) => {
    if (!draftUrl || !masterPlanNo) return;
    const normalizedDrafts = normalizeDraftMap(nextDrafts);
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
        }),
        {
          optimisticData: buildDraftCachePayload({
            masterPlanNo,
            dateFrom,
            dateTo,
            drafts: normalizedDrafts,
            updatedAt: draftPayload?.data?.updatedAt || null,
          }),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      );
      setDraftSaveStatus("saved");
      setDraftSaveMessage("บันทึกแบบร่างแล้ว");
    } catch (saveError) {
      setDraftSaveStatus("error");
      setDraftSaveMessage(String(saveError?.message || "บันทึกแบบร่างไม่สำเร็จ"));
      if (saveError?.status === 409) {
        void mutateDraft();
      }
    }
  };

  const resetAllDrafts = () => {
    void commitDrafts({});
  };

  const resetDocument = (docKey) => {
    const docKeys = normalizeDocumentKeys(docKey);
    const next = { ...draftOverridesByDocKey };
    docKeys.forEach((key) => {
      delete next[key];
    });
    void commitDrafts(next);
  };

  const updateQty = (docKey, lineKey, dateValue, nextQty) => {
    const workingDocument = workingDocuments.find((doc) => doc.documentKey === docKey);
    const lines = normalizeLines(workingDocument?.lines || []);
    const referenceLine = lines.find((line) => buildLineKey(line) === lineKey)
      || workingDocuments
        .flatMap((doc) => doc.lines || [])
        .find((line) => buildLineKey(line) === lineKey);
    if (!workingDocument || !referenceLine) return false;
    const updatedLines = upsertRequisitionSourceLineQty(
      lines,
      referenceLine,
      dateValue,
      nextQty
    );
    void commitDrafts(
      mergeDraftDocument(draftOverridesByDocKey, sourceDocuments, docKey, updatedLines)
    );
    return true;
  };

  const deleteLine = (docKey, lineKey) => {
    const docKeys = normalizeDocumentKeys(docKey);
    let nextDrafts = normalizeDraftMap(draftOverridesByDocKey);
    docKeys.forEach((key) => {
      const workingDocument = workingDocuments.find((doc) => doc.documentKey === key);
      if (!workingDocument) return;
      const lines = normalizeLines(workingDocument?.lines || []).filter(
        (line) => buildLineKey(line) !== lineKey
      );
      nextDrafts = mergeDraftDocument(nextDrafts, sourceDocuments, key, lines);
    });
    void commitDrafts(nextDrafts);
  };

  const requestDeleteLine = (docKey, lineMeta) => {
    setDeleteConfirmState({
      docKey,
      docKeys: normalizeDocumentKeys(lineMeta?.docKeys || docKey),
      ...lineMeta,
    });
  };

  const addMaterialToDocument = (docKey, option) => {
    const docKeys = normalizeDocumentKeys(docKey);
    const newLine = {
      materialSkuCode: String(option?.skuCode || "").trim(),
      materialGoodsCode: String(option?.goodsCode || option?.skuCode || "").trim(),
      materialName: String(option?.name || "").trim(),
      unit: String(option?.unit || "").trim() || "-",
      itemType: inferMaterialItemType(option),
      qtyByDate: {},
      totalQty: 0,
      isManual: true,
    };
    const newLineKey = buildLineKey(newLine);
    let nextDrafts = normalizeDraftMap(draftOverridesByDocKey);
    docKeys.forEach((key) => {
      const workingDocument = workingDocuments.find((doc) => doc.documentKey === key);
      if (!workingDocument) return;
      const lines = normalizeLines(workingDocument?.lines || []);
      if (lines.some((line) => buildLineKey(line) === newLineKey)) return;
      nextDrafts = mergeDraftDocument(nextDrafts, sourceDocuments, key, [...lines, newLine]);
    });
    void commitDrafts(nextDrafts);
    setItemManagerState((current) => (
      current?.docKeys?.some((key) => docKeys.includes(key))
        ? { ...current, mode: "list" }
        : current
    ));
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
    <main className="min-h-screen bg-[#FCFCF9] pb-12 text-black font-sans">
      <PlanningHeader
        activeTab="requisition-preview"
        title="Preview Demand → ใบเบิก"
        description="แสดงและตรวจสอบรายการใบเบิกก่อน Export Excel และก่อนสร้างเอกสารเบิกจริง"
        eyebrow="Production Planning"
        maxWidth="max-w-[1800px]"
      />

      <div className="mx-auto mt-6 w-full max-w-[1800px] space-y-6 px-3 sm:px-4 lg:px-6">
        {/* Search Panel (Ferrari Design System) */}
        <section className="rounded-[2px] border-2 border-[#102C57] bg-white p-6 shadow-none">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[1.5px] text-[#667085]">เลขแผนหลัก</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={planSearch}
                  onChange={(event) => setPlanSearch(String(event.target.value || ""))}
                  placeholder="ค้นหาเลขแผน..."
                  className="h-10 w-full rounded-[2px] border-2 border-[#CCCCCC] bg-white px-3 text-xs font-bold text-black placeholder-[#98a2b3] outline-none focus:border-[#102C57] transition"
                />
                <select
                  value={masterPlanNo}
                  onChange={(event) => {
                    const selected = String(event.target.value || "").trim().toUpperCase();
                    setMasterPlanNo(selected);
                    const option = planOptions.find((item) => item.planNo === selected);
                    setDateFrom(option?.periodStart || "");
                    setDateTo(option?.periodEnd || "");
                  }}
                  className="h-10 w-full rounded-[2px] border-2 border-[#CCCCCC] bg-white px-3 text-xs font-bold text-black outline-none focus:border-[#102C57] transition cursor-pointer font-mono"
                >
                  <option value="">เลือกเลขแผนหลัก...</option>
                  {filteredPlanOptions.map((item) => (
                    <option key={item.planNo} value={item.planNo}>
                      {item.planNo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[1.5px] text-[#667085]">เริ่มวันที่</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-10 w-full rounded-[2px] border-2 border-[#CCCCCC] bg-white px-3 text-xs font-bold text-black outline-none focus:border-[#102C57] transition"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[1.5px] text-[#667085]">ถึงวันที่</label>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-10 w-full rounded-[2px] border-2 border-[#CCCCCC] bg-white px-3 text-xs font-bold text-black outline-none focus:border-[#102C57] transition"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[#102C57]/10 pt-4">
            <button
              type="button"
              onClick={openExportModal}
              disabled={!masterPlanNo || exportingExcel}
              className="inline-flex items-center gap-2 rounded-[2px] border border-[#102C57] bg-[#102C57] px-4 py-2 text-xs font-black uppercase tracking-[1.2px] text-white transition hover:bg-[#0c2345] disabled:cursor-not-allowed disabled:border-[#cbd5e1] disabled:bg-[#e2e8f0] disabled:text-[#94a3b8]"
            >
              <Download className="h-4 w-4" />
              {exportingExcel ? "กำลัง Export..." : "Export Excel"}
            </button>
          </div>
        </section>

        {/* Collapsible MPS Panel (Ferrari Design System - Lazy Loaded) */}
        {masterPlanNo && (
          <section className="overflow-hidden rounded-[2px] border border-[#102C57]/15 bg-white shadow-[0_18px_40px_rgba(16,44,87,0.08)]">
            <div className="flex flex-col gap-4 bg-[#102C57] p-5 text-white transition duration-200 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 bg-[#fff8e2]" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[1.5px] text-white">ตารางวางแผนผลิตหลัก (Master Production Schedule)</h3>
                  <p className="text-[11px] font-bold text-[#8F8F8F] uppercase tracking-[1px] mt-0.5">
                    แผนหลักเลขที่: <span className="text-[#f6e7a8] font-mono">{masterPlanNo}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleExpanded(!isScheduleExpanded)}
                className="inline-flex items-center gap-2 bg-white hover:bg-[#1EAEDB] text-black hover:text-white font-extrabold text-[11px] tracking-[1.28px] uppercase py-2 px-4 rounded-[2px] border border-transparent transition duration-200 cursor-pointer"
              >
                {isScheduleExpanded ? "ซ่อนแผนหลัก" : "แสดงแผนหลัก"}
              </button>
            </div>
            
            {isScheduleExpanded && (
              <div className="border-t border-[#CCCCCC] bg-[#FCFCF9] p-3 transition duration-300">
                {canShowEmbeddedSchedule ? (
                  <div className="space-y-3">
                    <ProductionScheduleClient
                      key={`${masterPlanNo}-${scheduleDeptId}-${dateFrom}-${dateTo}`}
                      masterPlanNo={masterPlanNo}
                      deptId={scheduleDeptId}
                      dateFrom={dateFrom}
                      dateTo={dateTo}
                      embedded={true}
                      readOnly={true}
                      onSectionChange={handleEmbeddedSectionChange}
                    />

                    <section className="rounded-[2px] border border-[#102C57]/15 bg-white shadow-[0_8px_24px_rgba(16,44,87,0.06)]">
                      <div className="flex flex-col gap-3 border-b border-[#102C57]/10 bg-[#fff8e2] px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[1.4px] text-[#8a6a00]">
                            WIP Subplan
                          </div>
                          <div className="mt-1 text-sm font-black text-[#102C57]">
                            แผนย่อย WIP ของแผนนี้
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-black/70">
                            แสดงเฉพาะแผนก {scheduleDeptLabel}
                            {activeEmbeddedSectionLabel ? ` / ${activeEmbeddedSectionLabel}` : ""}
                          </div>
                        </div>
                        <div className="text-[11px] font-black text-[#102C57]">
                          {embeddedSubplanMatrixRows.length.toLocaleString("th-TH")} รายการ
                        </div>
                      </div>

                      {embeddedSubplanLoading ? (
                        <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                          กำลังโหลดแผนย่อย WIP...
                        </div>
                      ) : embeddedSubplanError ? (
                        <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#8a6a00]">
                          โหลดแผนย่อย WIP ไม่สำเร็จ
                        </div>
                      ) : embeddedSubplanMatrixRows.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                          ยังไม่มีแผนย่อย WIP ของแผนกนี้ในเลขแผนที่เลือก
                        </div>
                      ) : (
                        <div>
                          <table className="w-full table-fixed border-collapse text-[11px] text-black">
                            <thead>
                              <tr>
                                <th rowSpan={2} className="w-[14%] border-r border-b border-black bg-[#f8f4d8] px-3 py-3 text-center text-sm font-black text-black">
                                  รหัส WIP
                                </th>
                                <th rowSpan={2} className="w-[34%] border-r border-b border-black bg-[#f8f4d8] px-3 py-3 text-center text-sm font-black text-black">
                                  ชื่อ WIP
                                </th>
                                {dateColumns.map((dateValue, index) => (
                                  <th
                                    key={`wip-matrix-date-${dateValue}`}
                                    className={`border-r border-b border-black px-3 py-2 text-center text-xs font-black text-black ${DAY_TONE_CLASSES[index % DAY_TONE_CLASSES.length]}`}
                                  >
                                    {formatDate(dateValue)}
                                  </th>
                                ))}
                                <th rowSpan={2} className="w-[8%] border-b border-black bg-[#f1d4d0] px-2 py-3 text-center text-xs font-black text-[#8f2d1f]">
                                  ยอดรวม
                                </th>
                              </tr>
                              <tr>
                                {dateColumns.map((dateValue) => (
                                  <th
                                    key={`wip-matrix-qty-${dateValue}`}
                                    className="border-r border-b border-black bg-[#fff4cc] px-3 py-1.5 text-center text-sm font-black text-black"
                                  >
                                    จำนวน
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {embeddedSubplanMatrixRows.map((row) => (
                                <tr key={row.key} className="bg-white transition-colors hover:bg-slate-50">
                                  <td className="border-r border-b border-black px-3 py-3 font-mono text-sm font-bold tracking-[0.5px] text-black">
                                    {row.skuCode}
                                  </td>
                                  <td className="border-r border-b border-black px-3 py-3 text-sm font-bold leading-snug text-black">
                                    {row.skuName}
                                  </td>
                                  {dateColumns.map((dateValue) => {
                                    const qty = toNumber(row.qtyByDate?.[dateValue]);
                                    const batchQty = row.batchQtyByDate?.[dateValue];
                                    return (
                                      <td
                                        key={`${row.key}-${dateValue}`}
                                        className={`border-r border-b border-black px-3 py-2 text-center text-sm font-semibold ${
                                          qty > 0 ? "bg-[#fff8e2] font-black text-[#8a6a00]" : "text-[#98a2b3]"
                                        }`}
                                      >
                                        {qty > 0 ? (
                                          <div className="leading-tight">
                                            {batchQty != null ? (
                                              <div className="text-sm font-black text-[#8a6a00]">
                                                {formatQty(batchQty)} ชุด
                                              </div>
                                            ) : null}
                                            <div className={batchQty != null ? "mt-0.5 text-[10px] font-bold text-black" : ""}>
                                              {formatQty(qty)}
                                            </div>
                                          </div>
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="border-b border-black bg-[#fef3f2] px-3 py-3 text-center text-sm font-black text-[#8f2d1f]">
                                    {row.totalBatchQty > 0 ? (
                                      <div className="text-sm font-black text-[#8f2d1f]">
                                        {formatQty(row.totalBatchQty)} ชุด
                                      </div>
                                    ) : null}
                                    <div className={row.totalBatchQty > 0 ? "mt-0.5 text-[10px] font-bold text-black" : ""}>
                                      {formatQty(row.totalQty)}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="rounded-[2px] border-2 border-[#102C57] bg-white px-4 py-8 text-center text-xs font-bold uppercase tracking-[1px] text-[#667085]">
                    เลือกแท็บแผนกก่อนเพื่อแสดงแผนหลักของแผนกนั้น
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Draft Workspace Status Banner */}
        {workingDocuments.length > 0 ? (
          <section className="rounded-[2px] border-2 border-[#102C57] bg-[#fff8e2] p-4 shadow-none">
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
                  {draftSaveMessage || "ยังไม่มีการแก้ไขล่าสุด"}
                </span>
                <button
                  type="button"
                  onClick={resetAllDrafts}
                  className="inline-flex items-center gap-2 rounded-[2px] border-2 border-[#102C57] bg-[#102C57] hover:bg-[#0c2345] hover:border-[#0c2345] text-white hover:text-white px-4 py-2 text-xs font-black uppercase tracking-[1.5px] transition cursor-pointer"
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
        <section className="grid gap-4 sm:grid-cols-3">
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
          <section className="rounded-[2px] border-2 border-[#102C57] bg-white p-4 shadow-none">
            <div className="flex flex-wrap gap-2">
              {tabItems.map((tab) => {
                const isActive = tab.key === safeActiveTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-[2px] border-2 px-4 py-2 text-xs font-black uppercase tracking-[1.28px] transition cursor-pointer ${
                      isActive
                        ? "border-[#102C57] bg-[#102C57] text-white"
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

        {hiddenDocKeys.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-[2px] border border-red-200 bg-red-50 p-4 md:flex-row md:items-center md:justify-between text-xs font-bold text-red-700">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] font-black">!</span>
              <div>
                <span className="font-extrabold block md:inline">มีใบเบิกที่ถูกซ่อนอยู่ ${hiddenDocKeys.length} ใบ</span>
                <span className="text-red-600/80 md:ml-2">(ใบเบิกที่ถูกซ่อนจะไม่แสดงผลและจะไม่รวมอยู่ในไฟล์ Excel ที่กำลังจะออก)</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsHiddenDocsModalOpen(true)}
                className="underline hover:text-red-900 cursor-pointer font-black decoration-dotted underline-offset-4"
              >
                ดูรายการ / กู้คืนบางใบ
              </button>
              <span className="text-red-300">|</span>
              <button
                type="button"
                onClick={() => setHiddenDocKeys([])}
                className="underline hover:text-red-900 cursor-pointer font-black decoration-dotted underline-offset-4"
              >
                กู้คืนทั้งหมด
              </button>
            </div>
          </div>
        ) : null}

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

            {/* Requisition Documents List */}
            {visibleDocuments.map((doc) => {
              const pageColumns = dateColumns.length ? dateColumns : [doc.workDate].filter(Boolean);
              const isEditable = safeActiveTab !== "overview";
              return (
                <RequisitionDocument
                  key={doc.documentKey}
                  doc={doc}
                  pageColumns={pageColumns}
                  editable={isEditable}
                  showExportState={safeActiveTab !== "overview"}
                  onOpenManager={(docKey) => openItemManager(docKey, "list")}
                  onOpenAddMaterial={(docKey) => openItemManager(docKey, "add")}
                  onOpenSupplemental={openSupplementalDrawer}
                  onResetDocument={resetDocument}
                  onUpdateQty={updateQty}
                  onHideDocument={(docKey) => {
                    setHideConfirmDocKey(docKey);
                  }}
                />
              );
            })}
          </>
        )}
      </div>

      <RequisitionItemsDrawer
        key={activeManagerDocument?.documentKey || "closed"}
        open={Boolean(activeManagerDocument)}
        document={activeManagerDocument}
        documentActionKeys={activeManagerDocumentKeys}
        addMode={itemManagerState?.mode === "add"}
        existingLineKeys={managerLineKeys}
        onClose={closeItemManager}
        onOpenAddMode={() => setItemManagerState((current) => (current ? { ...current, mode: "add" } : current))}
        onCloseAddMode={() => setItemManagerState((current) => (current ? { ...current, mode: "list" } : current))}
        onConfirmAddMaterial={(option) => {
          if (!activeManagerDocumentKeys.length) return;
          addMaterialToDocument(activeManagerDocumentKeys, option);
        }}
        onRequestDeleteLine={requestDeleteLine}
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
        onCancel={() => setDeleteConfirmState(null)}
        onConfirm={() => {
          if ((deleteConfirmState?.docKeys?.length || deleteConfirmState?.docKey) && deleteConfirmState?.lineKey) {
            deleteLine(deleteConfirmState.docKeys || deleteConfirmState.docKey, deleteConfirmState.lineKey);
          }
          setDeleteConfirmState(null);
        }}
      />

      <HideDocumentConfirmModal
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

      <HiddenDocumentsModal
        open={isHiddenDocsModalOpen}
        hiddenKeys={hiddenDocKeys}
        allDocuments={workingDocuments}
        onClose={() => setIsHiddenDocsModalOpen(false)}
        onRestore={(docKey) => {
          setHiddenDocKeys((current) => current.filter((key) => key !== docKey));
        }}
        onRestoreAll={() => {
          setHiddenDocKeys([]);
          setIsHiddenDocsModalOpen(false);
        }}
      />
    </main>
  );
}

function HiddenDocumentsModal({
  open,
  hiddenKeys,
  allDocuments,
  onClose,
  onRestore,
  onRestoreAll,
}) {
  if (!open) return null;

  const hiddenDocs = allDocuments.filter((doc) => hiddenKeys.includes(doc.documentKey));

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0b1220]/55 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-[2px] border border-red-600 bg-white shadow-[0_30px_80px_rgba(16,44,87,0.24)]">
        <div className="flex items-center justify-between border-b border-red-600 bg-red-600 px-5 py-4 text-white">
          <div>
            <h3 className="text-lg font-black tracking-[0.2px]">
              ใบเบิกที่ถูกซ่อนอยู่ ({hiddenDocs.length} ใบ)
            </h3>
            <p className="mt-1 text-xs font-bold text-white/75">
              รายการด้านล่างนี้ถูกยกเว้นชั่วคราวและจะไม่รวมอยู่ในไฟล์ Excel ที่กำลังจะออก
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-white/30 text-white transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-5 space-y-3">
          {hiddenDocs.length === 0 ? (
            <p className="text-center text-xs font-bold text-[#667085] py-8">ไม่มีใบเบิกที่ถูกซ่อนอยู่</p>
          ) : (
            hiddenDocs.map((doc) => {
              const shiftLabel = formatShiftName(doc);
              return (
                <div
                  key={doc.documentKey}
                  className="flex items-center justify-between gap-4 border border-[#e4e7ec] bg-slate-50 p-3 rounded-[2px]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-black">
                      แผนก: {doc.ownerDepartmentName || doc.ownerDepartmentCode}
                    </p>
                    <p className="text-xs text-[#475467] font-bold mt-0.5">
                      Area: {formatRoomName(doc.roomLabel, doc.roomId)} | กะ: {shiftLabel}
                    </p>
                    {doc.parentSku ? (
                      <p className="text-xs text-[#8a6a00] font-bold mt-0.5">
                        สินค้า: {doc.parentSkuName || doc.parentSku}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(doc.documentKey)}
                    className="shrink-0 rounded-[2px] border border-[#CCCCCC] bg-white px-3 py-1.5 text-xs font-black text-black transition hover:bg-slate-100 cursor-pointer"
                  >
                    กู้คืนใบนี้
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#e4e7ec] bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onRestoreAll}
            disabled={hiddenDocs.length === 0}
            className="rounded-[2px] border border-red-600 bg-transparent px-4 py-2 text-xs font-black tracking-[0.5px] text-red-600 transition hover:bg-red-50 disabled:opacity-50 cursor-pointer"
          >
            กู้คืนทั้งหมด
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[2px] border border-[#102C57] bg-[#102C57] px-4 py-2 text-xs font-black tracking-[0.5px] text-white transition hover:bg-[#0c2345] cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}

function HideDocumentConfirmModal({ open, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0b1220]/55 px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-[2px] border border-red-600 bg-white shadow-[0_30px_80px_rgba(16,44,87,0.24)]">
        <div className="border-b border-red-600 bg-red-600 px-5 py-4 text-white">
          <h3 className="text-lg font-black tracking-[0.2px]">ยืนยันการซ่อนใบเบิก</h3>
        </div>
        <div className="p-5">
          <p className="text-sm font-bold text-black">คุณต้องการซ่อนใบเบิกใบนี้ใช่หรือไม่?</p>
          <p className="mt-2 text-xs font-bold text-[#667085]">
            * ใบเบิกที่ซ่อนไว้จะไม่แสดงผลในหน้าจอ Preview และจะไม่ถูกนำไปออกไฟล์ Excel (คุณสามารถแสดงรายการและกู้คืนกลับมาได้ภายหลัง)
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#e4e7ec] bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[2px] border border-[#CCCCCC] bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-slate-50 cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[2px] border border-red-600 bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-700 cursor-pointer"
          >
            ยืนยันซ่อนใบเบิก
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequisitionPreviewGeneratorClient;




