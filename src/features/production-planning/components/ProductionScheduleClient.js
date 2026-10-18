"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer, Settings2, AlertCircle, Save, Sparkles, Warehouse } from "lucide-react";
import GenericScheduleTable from "./GenericScheduleTable";
import styles from "./ProductionSchedulePresentation.module.css";
import PlanningHeader from "./PlanningHeader";
import MaterialVerifyModal from "./MaterialVerifyModal";
import ScheduleVisionImportModal from "./ScheduleVisionImportModal";
import { useUnsavedChanges } from "@/lib/tabState";
import {
  useScheduleTemplate,
  useScheduleTemplates,
} from "@/features/production-planning/hooks/useScheduleConfig";
import {
  useSchedulePlan,
  useFindPlan,
  useScheduleRows,
  upsertPlan,
  updatePlan,
  saveRow,
  saveRows,
  deleteRowApi,
} from "@/features/production-planning/hooks/useSchedulePlan";
import useSWR, { mutate as globalMutate } from "swr";
import { fetchJson, fetcher } from "@/lib/clientFetch";

// Constants

const SKU_CATALOG_URL = "/api/production-planning/schedule/sku-catalog?includeMasterPlanWip=1";
const VISION_ALIAS_URL = "/api/production-planning/schedule/vision-import/aliases";

// Week helpers

function normalizeDateOnly(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function toUtcDate(dateInput) {
  const normalized = normalizeDateOnly(dateInput);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date, n) {
  const base = typeof date === "string" ? toUtcDate(date) : new Date(date);
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function todayDateOnly() {
  return toDateStr(new Date());
}

function buildShiftCellLabel(shift) {
  const name = String(shift?.shiftName || shift?.name || shift?.shiftCode || shift?.code || "").trim();
  const startTime = String(shift?.startTime || shift?.shiftStartTime || "").trim();
  const endTime = String(shift?.endTime || shift?.shiftEndTime || "").trim();
  const timeLabel = startTime && endTime ? ` (${startTime}-${endTime})` : "";
  return `${name || "กะ"}${timeLabel}`;
}

function buildDefaultShiftRowData(shiftColumnKey, shift) {
  if (!shiftColumnKey || !shift) return {};
  const shiftId = String(shift?.shiftId || shift?.id || "").trim() || null;
  const shiftCode = String(shift?.shiftCode || shift?.code || "").trim().toUpperCase() || null;
  const shiftName = String(shift?.shiftName || shift?.name || "").trim() || shiftCode || null;
  const startTime = String(shift?.startTime || shift?.shiftStartTime || "").trim() || null;
  const endTime = String(shift?.endTime || shift?.shiftEndTime || "").trim() || null;

  return {
    [shiftColumnKey]: buildShiftCellLabel(shift),
    shiftId,
    shiftCode,
    shiftName,
    workStartTime: startTime,
    workEndTime: endTime,
  };
}

function thaiDate(date) {
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
}

function thaiDateSlash(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const buddhistYear = date.getFullYear() + 543;
  return `${day}/${month}/${buddhistYear}`;
}

function buildWeekDays(monday) {
  const labels = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  const keys   = ["mon", "tue", "wed", "thu", "fri", "sat"];
  return keys.map((key, i) => {
    const d = addDays(monday, i);
    return {
      key,
      label: labels[i],
      date: thaiDateSlash(d),
      isoDate: toDateStr(d),
      full: d.toLocaleDateString("th-TH", { weekday: "long", day: "2-digit", month: "long" }),
    };
  });
}

function weekLabel(monday) {
  const sat = addDays(monday, 5);
  return `${thaiDate(monday)} - ${thaiDate(sat)}`;
}

// Section tabs

function getLegacyDayKey(date) {
  const day = date.getUTCDay();
  if (day === 1) return "mon";
  if (day === 2) return "tue";
  if (day === 3) return "wed";
  if (day === 4) return "thu";
  if (day === 5) return "fri";
  if (day === 6) return "sat";
  if (day === 0) return "sun";
  return null;
}

function buildRangeDays(dateFrom, dateTo) {
  const start = toUtcDate(dateFrom);
  const end = toUtcDate(dateTo);
  if (!start || !end || start > end) return [];

  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);
  const isLegacyWeekRange = diffDays === 5 && start.getUTCDay() === 1;

  return Array.from({ length: diffDays + 1 }, (_, index) => {
    const current = addDays(start, index);
    const isoDate = toDateStr(current);
    const legacyKey = isLegacyWeekRange ? getLegacyDayKey(current) : null;
    return {
      key: isoDate,
      altKeys: legacyKey ? [legacyKey] : [],
      label: current.toLocaleDateString("th-TH", { weekday: "short" }),
      date: thaiDateSlash(current),
      isoDate,
      full: current.toLocaleDateString("th-TH", { weekday: "long", day: "2-digit", month: "long" }),
    };
  });
}

function rangeLabel(dateFrom, dateTo) {
  const start = toUtcDate(dateFrom);
  const end = toUtcDate(dateTo);
  if (!start || !end) return "-";
  return `${thaiDate(start)} - ${thaiDate(end)}`;
}

function shiftDateRange(dateFrom, dateTo, deltaDays) {
  const start = toUtcDate(dateFrom);
  const end = toUtcDate(dateTo);
  if (!start || !end) {
    return { nextDateFrom: todayDateOnly(), nextDateTo: todayDateOnly() };
  }

  return {
    nextDateFrom: toDateStr(addDays(start, deltaDays)),
    nextDateTo: toDateStr(addDays(end, deltaDays)),
  };
}

function SectionTabs({ sections, activeIdx, onChange }) {
  return (
    <div className="flex flex-wrap items-stretch border-b border-slate-200 bg-white">
      {sections.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onChange(i)}
          className={`px-5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
            i === activeIdx
              ? "border-slate-700 text-slate-800 bg-white"
              : "border-transparent text-slate-950 font-bold hover:text-black hover:bg-slate-50"
          }`}
        >
          {s.name}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1 px-3 border-l border-slate-100 shrink-0">
        <button
          onClick={() => onChange(Math.max(0, activeIdx - 1))}
          disabled={activeIdx === 0}
          className="p-1 rounded text-slate-950 font-bold hover:text-black disabled:opacity-25"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[11px] text-slate-950 font-bold min-w-[32px] text-center">
          {activeIdx + 1}/{sections.length}
        </span>
        <button
          onClick={() => onChange(Math.min(sections.length - 1, activeIdx + 1))}
          disabled={activeIdx === sections.length - 1}
          className="p-1 rounded text-slate-950 font-bold hover:text-black disabled:opacity-25"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// Footer notes

function FooterNotes({ notes, onChange, readOnly = false }) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <label className="block text-[11px] font-bold text-slate-950 uppercase tracking-wide mb-1.5">
        หมายเหตุ
      </label>
      <textarea
        className={`w-full text-xs border border-slate-200 rounded px-2.5 py-2 resize-y min-h-[56px] text-slate-950 font-bold placeholder-slate-950 placeholder:font-bold ${
          readOnly
            ? "bg-slate-50 cursor-default"
            : "focus:outline-none focus:ring-1 focus:ring-slate-400"
        }`}
        placeholder="หมายเหตุเพิ่มเติม..."
        value={notes}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Main component
/**
 * Props:
 *   templateId - uuid of schedule template (optional; resolved from deptId if omitted)
 *   deptId - uuid of department (optional; shows dept-picker if omitted)
 *   masterPlanNo - optional link to master plan
 */
export default function ProductionScheduleClient({
  templateId: tplProp,
  deptId: deptProp,
  masterPlanNo,
  dateFrom: dateFromProp,
  dateTo: dateToProp,
  embedded = false,
  readOnly = false,
  onSectionChange,
}) {
  const initialDateFrom = normalizeDateOnly(dateFromProp) || todayDateOnly();
  const initialDateTo = normalizeDateOnly(dateToProp) || initialDateFrom;
  const normalizedInitialDateTo = initialDateTo < initialDateFrom ? initialDateFrom : initialDateTo;
  const [dateFrom, setDateFrom]       = useState(() => initialDateFrom);
  const [dateTo, setDateTo]           = useState(() => normalizedInitialDateTo);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [footerNotes, setFooterNotes] = useState("");
  const [saving, setSaving]           = useState(false);
  const [publishing, setPublishing]   = useState(false);
  const [dirty, setDirty]             = useState(false);
  useUnsavedChanges(dirty, "คุณมีข้อมูลตารางวางแผนผลิตที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?");
  const [activeDeptId, setActiveDeptId] = useState(deptProp ?? null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isVisionImportOpen, setIsVisionImportOpen] = useState(false);
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);
  const [localMasterPlanNo, setLocalMasterPlanNo] = useState(null);
  const newRowSeqRef = useRef(0);
  const pendingVisionAliasesRef = useRef([]);

  const rangeDays = useMemo(() => buildRangeDays(dateFrom, dateTo), [dateFrom, dateTo]);
  const planStartDate = dateFrom;
  const rangeDisplayLabel = useMemo(() => rangeLabel(dateFrom, dateTo), [dateFrom, dateTo]);

  // Dept picker
  const { data: deptsData, isLoading: deptsLoading } = useSWR(
    "/api/production-planning/departments?scope=assigned",
    fetcher,
    { revalidateOnFocus: false }
  );
  const assignedDepts = useMemo(() => deptsData?.data ?? [], [deptsData]);
  
  const { templates: allTemplates, isLoading: allTemplatesLoading } = useScheduleTemplates();
  const tplListLoading = allTemplatesLoading;
  
  const templateDeptIds = useMemo(
    () => new Set((allTemplates || []).map((item) => String(item?.dept_id || "").trim()).filter(Boolean)),
    [allTemplates]
  );
  
  const templateAssignedDepts = useMemo(
    () => assignedDepts.filter((dept) => templateDeptIds.has(String(dept?.id || "").trim())),
    [assignedDepts, templateDeptIds]
  );

  // SKU catalog
  const { data: skuCatalogData } = useSWR(SKU_CATALOG_URL, fetcher, { revalidateOnFocus: false, revalidateOnMount: true });
  const skuCatalog = skuCatalogData?.data ?? [];
  
  const sectionShiftKey = activeDeptId
    ? `/api/production-section-shifts?departmentId=${encodeURIComponent(activeDeptId)}`
    : null;
    
  const { data: sectionShiftsData } = useSWR(sectionShiftKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
  });
  
  const sectionShiftMap = useMemo(() => {
    const map = new Map();
    const sectionsWithShifts = Array.isArray(sectionShiftsData?.sections) ? sectionShiftsData.sections : [];
    sectionsWithShifts.forEach((section) => {
      const sectionId = String(section?.id || section?.sectionDefId || "").trim();
      if (!sectionId) return;
      map.set(sectionId, Array.isArray(section?.shifts) ? section.shifts : []);
    });
    return map;
  }, [sectionShiftsData]);

  // Sync prop changes
  useEffect(() => {
    if (deptProp) {
      setActiveDeptId(deptProp);
    }
  }, [deptProp]);

  useEffect(() => {
    if (!activeDeptId && templateAssignedDepts.length > 0) {
      setActiveDeptId(templateAssignedDepts[0].id);
    }
  }, [activeDeptId, templateAssignedDepts]);

  useEffect(() => {
    if (!activeDeptId) return;
    const exists = templateAssignedDepts.some((dept) => dept.id === activeDeptId);
    if (!exists && templateAssignedDepts.length > 0) {
      setActiveDeptId(templateAssignedDepts[0].id);
    }
  }, [activeDeptId, templateAssignedDepts]);

  useEffect(() => {
    const nextDateFrom = normalizeDateOnly(dateFromProp);
    const nextDateTo = normalizeDateOnly(dateToProp);
    if (!nextDateFrom && !nextDateTo) return;
    const resolvedDateFrom = nextDateFrom || todayDateOnly();
    const resolvedDateTo = nextDateTo && nextDateTo >= resolvedDateFrom ? nextDateTo : resolvedDateFrom;
    setDateFrom(resolvedDateFrom);
    setDateTo(resolvedDateTo);
  }, [dateFromProp, dateToProp]);

  const templates = useMemo(() => {
    if (!activeDeptId || !allTemplates) return [];
    return allTemplates.filter(
      (t) => String(t?.dept_id || "").trim() === String(activeDeptId).trim()
    );
  }, [activeDeptId, allTemplates]);

  const resolvedTemplateId = tplProp ?? (templates[0]?.id ?? null);
  
  const { template, isLoading: tplLoading } = useScheduleTemplate(resolvedTemplateId);
  
  const activeDeptName = useMemo(
    () => templateAssignedDepts.find((dept) => dept.id === activeDeptId)?.name || template?.production_departments?.name || "",
    [activeDeptId, templateAssignedDepts, template]
  );
  
  const isMockup = !resolvedTemplateId || !activeDeptId;

  // Plan
  const { planId, isLoading: planFinding, mutate: mutateFindPlan } = useFindPlan(
    activeDeptId,
    activeDeptId ? planStartDate : null,
    activeDeptId ? dateTo : null
  );
  
  const { plan, rows: serverRows, mutate: mutatePlan } = useSchedulePlan(planId);
  const effectiveMasterPlanNo = plan?.master_plan_no ?? localMasterPlanNo ?? masterPlanNo ?? null;
  const planStatus = String(plan?.status || "draft").trim().toLowerCase();
  const isPublished = planStatus === "published";
  const isReportMode = Boolean(readOnly); // explicitly opened as report (read-only view)
  const isReadOnly = isReportMode || (isPublished && !embedded);

  const { data: verifySummaryData, mutate: mutateVerifySummary } = useSWR(
    effectiveMasterPlanNo
      ? `/api/production-planning/material-verify/summary?masterPlanNo=${encodeURIComponent(effectiveMasterPlanNo)}`
      : null,
    fetcher
  );



  const handleVerifySubmit = useCallback(async () => {
    setIsSubmittingVerify(true);
    try {
      const response = await fetch("/api/production-planning/material-verify/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: effectiveMasterPlanNo,
          action: "request_verify",
          consolidated: verifySummaryData?.consolidated || [],
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "ส่งตรวจวัตถุดิบไม่สำเร็จ");
      }
      setIsVerifyModalOpen(false);
      alert("ส่งตรวจวัตถุดิบเรียบร้อยแล้ว");
      await Promise.all([
        mutateVerifySummary(),
        mutateFindPlan(),
        mutatePlan(),
      ]);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingVerify(false);
    }
  }, [effectiveMasterPlanNo, verifySummaryData, mutateVerifySummary, mutateFindPlan, mutatePlan]);

  // Local row state
  const { rows, updateCells, deleteRow, addRow, resetRows } = useScheduleRows([]);

  useEffect(() => {
    if (serverRows.length > 0 || plan) {
      resetRows(serverRows);
      if (plan?.notes) setFooterNotes(plan.notes);
    }
  }, [serverRows, plan, resetRows]);

  const sections = useMemo(
    () => (template?.sections ?? []).slice().sort((a, b) => a.display_order - b.display_order),
    [template]
  );

  const activeSection = sections[activeSectionIdx] ?? null;

  // Notify parent of section changes
  useEffect(() => {
    if (onSectionChange) {
      onSectionChange(activeSectionIdx, activeSection);
    }
  }, [activeSectionIdx, activeSection, onSectionChange]);

  // Reset section index when template changes
  useEffect(() => { setActiveSectionIdx(0); }, [resolvedTemplateId]);

  // Callbacks

  const handleUpdate = useCallback((rowId, patch) => {
    if (isReadOnly) return;
    updateCells(rowId, patch);
    setDirty(true);
  }, [isReadOnly, updateCells]);

  const handleDelete = useCallback(async (rowId) => {
    if (isReadOnly) return;
    deleteRow(rowId);
    setDirty(true);
    if (!isMockup && rowId && !rowId.startsWith("new-")) {
      await deleteRowApi(rowId);
    }
  }, [deleteRow, isMockup, isReadOnly]);

  const handleAddRow = useCallback((sectionId, dayKey) => {
    if (isReadOnly) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const columns = section.production_schedule_column_defs ?? section.columns ?? [];
    const sectionShifts = sectionShiftMap.get(String(sectionId || "").trim()) ?? [];
    const defaultShift = sectionShifts[0] || null;
    const rowData = Object.fromEntries(
      columns.map((c) => [c.key, c.col_type === "time" ? "07:00-17:00" : null])
    );
    columns
      .filter((column) => column.col_type === "shift")
      .forEach((column) => {
        Object.assign(rowData, buildDefaultShiftRowData(column.key, defaultShift));
      });
    addRow({
      id:             `new-${Date.now()}-${++newRowSeqRef.current}`,
      _isNew:         true,
      plan_id:        planId ?? null,
      section_def_id: sectionId,
      day_key:        dayKey,
      display_order:  999,
      row_data:       rowData,
      sub_plan_id:    null,
    });
    setDirty(true);
  }, [isReadOnly, sections, sectionShiftMap, planId, addRow]);

  const handleVisionImportConfirm = useCallback(({ rows: importedRows, aliases, dateRange }) => {
    if (isReadOnly) return;
    // Maintain the user's active date range. Never shrink.
    // Only expand if imported rows fall strictly outside the current range.
    if (dateRange?.dateFrom && dateRange.dateFrom < dateFrom) {
      setDateFrom(dateRange.dateFrom);
    }
    if (dateRange?.dateTo && dateRange.dateTo > dateTo) {
      setDateTo(dateRange.dateTo);
    }
    (importedRows ?? []).forEach((row) => {
      addRow({
        id: `new-vision-${Date.now()}-${++newRowSeqRef.current}`,
        _isNew: true,
        _visionImport: true,
        plan_id: planId ?? null,
        section_def_id: row.sectionDefId,
        day_key: row.dayKey,
        display_order: 999,
        row_data: row.rowData,
        sub_plan_id: null,
      });
    });
    pendingVisionAliasesRef.current.push(...(aliases ?? []));
    setDirty(true);
  }, [addRow, isReadOnly, planId, dateFrom, dateTo, setDateFrom, setDateTo]);

  const handleDateFromChange = useCallback((value) => {
    if (dirty && typeof window !== "undefined" && !window.confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก หากเปลี่ยนช่วงวันที่ ข้อมูลที่แก้ไขอาจสูญหาย ต้องการเปลี่ยนหรือไม่?")) {
      return;
    }
    const normalized = normalizeDateOnly(value) || todayDateOnly();
    setDateFrom(normalized);
    setDateTo((current) => {
      const normalizedCurrent = normalizeDateOnly(current) || normalized;
      return normalizedCurrent < normalized ? normalized : normalizedCurrent;
    });
  }, [dirty]);

  const handleDateToChange = useCallback((value) => {
    if (dirty && typeof window !== "undefined" && !window.confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก หากเปลี่ยนช่วงวันที่ ข้อมูลที่แก้ไขอาจสูญหาย ต้องการเปลี่ยนหรือไม่?")) {
      return;
    }
    const normalized = normalizeDateOnly(value) || dateFrom;
    setDateTo(normalized < dateFrom ? dateFrom : normalized);
  }, [dirty, dateFrom]);

  const handleShiftRange = useCallback((direction) => {
    if (dirty && typeof window !== "undefined" && !window.confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก หากเปลี่ยนช่วงวันที่ ข้อมูลที่แก้ไขอาจสูญหาย ต้องการเปลี่ยนหรือไม่?")) {
      return;
    }
    const spanDays = Math.max(1, rangeDays.length || 1);
    const { nextDateFrom, nextDateTo } = shiftDateRange(dateFrom, dateTo, direction * spanDays);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
  }, [dirty, dateFrom, dateTo, rangeDays.length]);

  const persistPlan = useCallback(async () => {
    let activePlanId = planId;
    let resolvedMasterPlanNo = effectiveMasterPlanNo;

    if (!activePlanId) {
      const upsertPayload = {
        deptId: activeDeptId,
        weekStartDate: planStartDate,
        periodEnd: dateTo,
        templateId: resolvedTemplateId,
        notes: footerNotes,
      };
      if (effectiveMasterPlanNo) upsertPayload.masterPlanNo = effectiveMasterPlanNo;
      const res = await upsertPlan(upsertPayload);
      if (!res?.ok) {
        throw new Error(res?.error?.message || "Unable to create schedule plan");
      }
      activePlanId = res?.data?.data?.id ?? null;
      resolvedMasterPlanNo = res?.data?.data?.master_plan_no ?? null;
      if (!activePlanId) {
        throw new Error("Unable to create schedule plan");
      }
      await mutateFindPlan();
    } else {
      await updatePlan(activePlanId, { weekStartDate: planStartDate, periodEnd: dateTo, notes: footerNotes });
    }

    if (pendingVisionAliasesRef.current.length) {
      const aliasMap = new Map();
      pendingVisionAliasesRef.current.forEach((a) => {
        const key = `${a.sectionDefId}::${a.productColumnKey}::${String(a.sourceBrand || "").trim()}::${String(a.sourceProduct || "").trim()}::${String(a.sourceSize || "").trim()}`;
        aliasMap.set(key, a);
      });
      const uniquePendingAliases = Array.from(aliasMap.values());

      const aliasResult = await fetchJson(VISION_ALIAS_URL, {
        method: "POST",
        body: JSON.stringify({
          deptId: activeDeptId,
          templateId: resolvedTemplateId,
          aliases: uniquePendingAliases,
        }),
      });
      if (!aliasResult.ok) {
        throw new Error(aliasResult.error?.message || "บันทึกคำจับคู่สินค้าไม่สำเร็จ");
      }
      pendingVisionAliasesRef.current = [];
    }
    const newRows = rows.filter((row) => row._isNew);
    const existingRows = rows.filter((row) => !row._isNew);
    const rowResults = await Promise.all([
      saveRows(activePlanId, newRows),
      ...existingRows.map((row) => saveRow(activePlanId, row)),
    ]);
    const failedRowSave = rowResults.find((result) => !result.ok);
    if (failedRowSave) {
      throw new Error(failedRowSave.error?.message || "บันทึกแผนการผลิตไม่สำเร็จ");
    }
    await mutatePlan();
    return { planId: activePlanId, masterPlanNo: resolvedMasterPlanNo };
  }, [
    planId,
    activeDeptId,
    planStartDate,
    dateTo,
    resolvedTemplateId,
    effectiveMasterPlanNo,
    footerNotes,
    rows,
    mutateFindPlan,
    mutatePlan,
  ]);

  // Save
  const handleSave = useCallback(async () => {
    if (isMockup) { alert("Mockup mode - ยังไม่เชื่อมต่อ API"); return; }
    setSaving(true);
    try {
      await persistPlan();
      setDirty(false);
    } catch (error) {
      alert(error?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [isMockup, persistPlan]);

  const handleRequestVerifyClick = useCallback(async () => {
    if (isMockup) {
      alert("โหมดจำลอง (Mockup Mode) - ไม่สามารถทำรายการได้");
      return;
    }
    setIsSubmittingVerify(true);
    try {
      // บันทึกแผนและแถวข้อมูลทั้งหมดลงฐานข้อมูลก่อนดึงยอดสรุป
      const { masterPlanNo: resolvedMasterPlanNo } = await persistPlan();
      setDirty(false);

      const targetMasterPlanNo = resolvedMasterPlanNo || effectiveMasterPlanNo;
      if (!targetMasterPlanNo) {
        throw new Error("ไม่พบเลขแผนหลักสำหรับการตรวจสอบ");
      }

      if (resolvedMasterPlanNo) {
        setLocalMasterPlanNo(resolvedMasterPlanNo);
      }

      // ดึงข้อมูลและคำนวณความพอเพียงวัตถุดิบล่าสุด
      await globalMutate(`/api/production-planning/material-verify/summary?masterPlanNo=${encodeURIComponent(targetMasterPlanNo)}`);
      setIsVerifyModalOpen(true);
    } catch (error) {
      alert(error?.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลและส่งตรวจวัตถุดิบ");
    } finally {
      setIsSubmittingVerify(false);
    }
  }, [isMockup, effectiveMasterPlanNo, persistPlan, setDirty]);

  const handlePublish = useCallback(async () => {
    if (isMockup) { alert("Mockup mode - ยังไม่เชื่อมต่อ API"); return; }
    setPublishing(true);
    try {
      const { planId: activePlanId } = await persistPlan();
      await updatePlan(activePlanId, {
        weekStartDate: planStartDate,
        periodEnd: dateTo,
        status: "published",
        notes: footerNotes,
      });
      await Promise.all([mutateFindPlan(), mutatePlan()]);
      setDirty(false);
    } catch (error) {
      alert(error?.message || "เผยแพร่แผนไม่สำเร็จ");
    } finally {
      setPublishing(false);
    }
  }, [isMockup, persistPlan, footerNotes, mutateFindPlan, mutatePlan, planStartDate, dateTo]);

  // Rows per section
  const rowsBySection = useMemo(() => {
    const m = new Map();
    for (const row of rows) {
      const arr = m.get(row.section_def_id);
      if (arr) arr.push(row);
      else m.set(row.section_def_id, [row]);
    }
    return m;
  }, [rows]);

  const isLoading = deptsLoading || tplListLoading || tplLoading || planFinding;
  
  // Dept picker screen
  if (!activeDeptId && !deptsLoading && !allTemplatesLoading && templateAssignedDepts.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 text-sm text-slate-950 font-bold ${embedded ? "min-h-[220px]" : "min-h-[60vh]"}`}>
        <AlertCircle size={22} className="text-amber-400" />
        <p>ยังไม่พบแผนกที่มีการตั้งค่าเทมเพลตสำหรับคุณ</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-slate-100/50" : "min-h-screen bg-slate-100"}>

      {/* No-template banner */}
      {!isLoading && isMockup && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-amber-700 text-xs">
          <AlertCircle size={12} />
          ยังไม่มีเทมเพลตสำหรับแผนกนี้ กรุณาตั้งค่าที่{" "}
          <a href="/admin/schedule-config" className="underline font-semibold">Admin &gt; ตั้งค่าเทมเพลต</a>
        </div>
      )}

      {/* Planning Sub-Header (Clean, fixed 42px) */}
      {!embedded ? <PlanningHeader activeTab="master" /> : null}

      {/* Schedule Page Toolbar & Actions Bar */}
      {!embedded ? (
        <div className={`${styles.toolbar} border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm print:hidden`}>
          <div className="mx-auto max-w-[1760px] flex flex-wrap items-center justify-between gap-3">
            {/* Left: Info / Dates status */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#102C57]">
                {activeDeptName ? `แผนก ${activeDeptName} · ` : ""}ช่วงวันที่ {rangeDisplayLabel}
                {effectiveMasterPlanNo ? ` · แผนหลัก ${effectiveMasterPlanNo}` : ""}
              </span>
              <span className={`px-2 py-0.5 rounded-[2px] font-bold text-[11px] ${isPublished ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                สถานะ: {isPublished ? "published" : "draft"}{dirty ? " · ยังไม่บันทึก" : ""}
              </span>
            </div>

            {/* Right: Date controls & Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-[2px] border border-slate-300 bg-slate-50 p-1.5 text-slate-700 transition hover:bg-slate-100"
                  onClick={() => handleShiftRange(-1)}
                  title="เลื่อนช่วงวันที่ย้อนกลับ"
                >
                  <ChevronLeft size={14} />
                </button>
                <label className="flex items-center gap-1.5 rounded-[2px] border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                  <span className="text-slate-500 text-[11px]">จาก</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => handleDateFromChange(event.target.value)}
                    className="border-0 bg-transparent text-xs font-semibold text-slate-900 outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 rounded-[2px] border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                  <span className="text-slate-500 text-[11px]">ถึง</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={(event) => handleDateToChange(event.target.value)}
                    className="border-0 bg-transparent text-xs font-semibold text-slate-900 outline-none"
                  />
                </label>
                <button
                  type="button"
                  className="rounded-[2px] border border-slate-300 bg-slate-50 p-1.5 text-slate-700 transition hover:bg-slate-100"
                  onClick={() => handleShiftRange(1)}
                  title="เลื่อนช่วงวันที่ถัดไป"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[2px] border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => window.print()}
                >
                  <Printer size={12} /> พิมพ์
                </button>
                {!isReportMode ? (
                  <>
                    <button
                      type="button"
                      disabled={isReadOnly || isMockup || saving || publishing}
                      onClick={() => setIsVisionImportOpen(true)}
                      className="inline-flex items-center gap-1 rounded-[2px] border border-[#d4af37] bg-[#d4af37]/15 px-2.5 py-1.5 font-bold text-[#b38f22] transition hover:bg-[#d4af37]/25 disabled:opacity-40"
                    >
                      <Sparkles size={12} /> นำเข้าจากรูป/PDF
                    </button>
                    <a
                      href="/admin/schedule-config"
                      className="inline-flex items-center gap-1 rounded-[2px] border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Settings2 size={12} /> ตั้งค่า
                    </a>
                    {planStatus === "published" ? (
                      <span className="inline-flex items-center gap-1 rounded-[2px] bg-emerald-100 px-3 py-1.5 font-bold text-emerald-800">
                        เผยแพร่แผนหลักแล้ว
                      </span>
                    ) : planStatus === "pending_verify" ? (
                      <span className="inline-flex items-center gap-1 rounded-[2px] bg-slate-200 px-3 py-1.5 font-bold text-slate-600">
                        รอการตรวจสอบวัตถุดิบ...
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={saving || publishing || isSubmittingVerify}
                          onClick={handleRequestVerifyClick}
                          className="inline-flex items-center gap-1 rounded-[2px] bg-[#d4af37] px-3 py-1.5 font-bold text-[#102C57] transition hover:bg-[#e0bd45] disabled:opacity-40"
                        >
                          <Warehouse size={12} /> {isSubmittingVerify ? "กำลังส่งตรวจ..." : "บันทึกและส่งตรวจวัตถุดิบ"}
                        </button>
                        <button
                          type="button"
                          disabled={publishing || isPublished}
                          onClick={handlePublish}
                          className="inline-flex items-center gap-1 rounded-[2px] border border-emerald-600 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-40"
                        >
                          {publishing ? "กำลังเผยแพร่..." : "เผยแพร่แผน (Bypass)"}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={saving || publishing || isSubmittingVerify || (!dirty && !isMockup)}
                      onClick={handleSave}
                      className="inline-flex items-center gap-1 rounded-[2px] bg-[var(--surface-navy,#102C57)] px-3 py-1.5 font-bold text-white transition hover:bg-[#1a3c75] disabled:opacity-40"
                    >
                      <Save size={12} /> {saving ? "กำลังบันทึก..." : "บันทึกร่าง"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* A4 canvas */}
      <div className={embedded ? "py-3" : "py-6"}>
        <div className={embedded ? "max-w-none mx-auto" : styles.canvas}>

          {/* Dept switcher */}
          {templateAssignedDepts.length > 1 && !embedded && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-955">แผนก:</span>
              {templateAssignedDepts.map((dept) => {
                const isActiveDept = dept.id === activeDeptId;
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setActiveDeptId(dept.id)}
                    className={styles.departmentTab}
                    aria-pressed={isActiveDept}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="bg-white rounded border border-slate-200 shadow-sm flex items-center justify-center py-24 text-sm text-slate-950 font-bold">
              กำลังโหลด...
            </div>
          )}

          {/* Published state: hide table, show card with link to report */}
          {!isLoading && isPublished && !isReportMode && !embedded && (
            <div className="bg-white rounded border border-emerald-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#0a1f45] bg-[#0f2a5a]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-blue-100/80 uppercase tracking-widest mb-0.5">ใบแผนการผลิต</p>
                    <h2 className="text-base font-bold text-white">{template?.name ?? "-"}</h2>
                    <p className="text-sm text-blue-100 mt-0.5">
                      ช่วงวันที่ {rangeDisplayLabel}
                      {effectiveMasterPlanNo && ` · แผนหลัก ${effectiveMasterPlanNo}`}
                    </p>
                  </div>
                  <div className="text-right text-xs text-blue-100/80">
                    <p>แผนก: {activeDeptName || "ไม่ระบุ"}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-bold text-slate-800">เผยแพร่แผนแล้ว</p>
                  <p className="mt-1 text-sm text-slate-955 font-bold">
                    {effectiveMasterPlanNo ? `แผน ${effectiveMasterPlanNo} · ` : ""}ช่วงวันที่ {rangeDisplayLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-955 font-bold">QA สามารถนำแผนนี้ไปวางแผนย่อยต่อได้แล้ว</p>
                </div>
              </div>
            </div>
          )}

          {/* Section navigation outside the document */}
          {!isLoading && (!isPublished || isReportMode || embedded) && sections.length > 0 && <div className={styles.sectionNav}><SectionTabs sections={sections} activeIdx={activeSectionIdx} onChange={setActiveSectionIdx} /></div>}

          {/* Document card */}
          {!isLoading && (!isPublished || isReportMode || embedded) && (
            <div className={styles.paper}>

              {/* Document header */}
              <div className={styles.paperHeader}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-blue-100/80 uppercase tracking-widest mb-0.5">
                      ใบแผนการผลิต
                    </p>
                    <h2 className="text-base font-bold text-white">
                      {template?.name ?? "-"}
                    </h2>
                    {effectiveMasterPlanNo ? (
                      <p className="text-sm text-blue-100 mt-0.5">แผนหลัก {effectiveMasterPlanNo}</p>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-blue-100/80 space-y-0.5">
                    <p>แผนก: {activeDeptName || "ไม่ระบุ"}</p>
                    <p>{rangeDisplayLabel}</p>
                  </div>
                </div>
              </div>

              {/* Status Banners */}
              {verifySummaryData?.status === "pending_verify" && (
                <div className="px-6 py-3 border-b border-[#d4af37]/35 bg-[#fffde7] text-xs font-semibold text-[#8a6d1f] flex items-center gap-2">
                  <AlertCircle size={14} className="text-[#8a6d1f]" />
                  <span>แผนหลักนี้อยู่ในระหว่าง <strong>รอการตรวจสอบวัตถุดิบ</strong> จากหัวหน้าคลังสินค้า</span>
                </div>
              )}
              {verifySummaryData?.status === "rejected" && (
                <div className="px-6 py-3 border-b border-red-200 bg-red-50 text-xs font-semibold text-red-800 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-700" />
                    <span>แผนหลักนี้ถูก <strong>ปฏิเสธการอนุมัติวัตถุดิบ</strong> จากคลังสินค้า</span>
                  </div>
                  {verifySummaryData.rejectReason && (
                    <div className="pl-6 font-normal text-slate-600">
                      เหตุผล: <span className="font-semibold">{verifySummaryData.rejectReason}</span>
                    </div>
                  )}
                </div>
              )}
              {verifySummaryData?.status === "published" && (
                <div className="px-6 py-3 border-b border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <AlertCircle size={14} className="text-emerald-700" />
                  <span>แผนหลักนี้ <strong>ได้รับการอนุมัติวัตถุดิบและเผยแพร่แล้ว</strong></span>
                </div>
              )}

              {/* No sections */}
              {sections.length === 0 && (
                <div className="py-20 text-center text-slate-955 font-bold text-sm">
                  {isMockup
                    ? "ไม่มีเทมเพลต กรุณาตั้งค่าที่ /admin/schedule-config"
                    : "เทมเพลตนี้ยังไม่มี section"}
                </div>
              )}

              {/* Active section table */}
              {activeSection && (
                <div className={styles.tableViewport}>
                  <GenericScheduleTable
                     section={activeSection}
                     rows={rowsBySection.get(activeSection.id) ?? []}
                     days={rangeDays}
                     skuCatalog={skuCatalog}
                     sectionShifts={sectionShiftMap.get(String(activeSection.id || "").trim()) ?? []}
                     readOnly={isReadOnly}
                     hideDayGroupHeader={embedded && isReadOnly}
                     onUpdate={(rowId, patch) => handleUpdate(rowId, patch)}
                     onDelete={(rowId) => handleDelete(rowId)}
                     onAddRow={(dayKey) => handleAddRow(activeSection.id, dayKey)}
                  />
                </div>
              )}

              {/* Footer notes */}
              {sections.length > 0 && (
                <div className="px-6 pb-5">
                  <FooterNotes notes={footerNotes} onChange={setFooterNotes} readOnly={isReadOnly} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <MaterialVerifyModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        masterPlanNo={effectiveMasterPlanNo}
        consolidated={verifySummaryData?.consolidated || []}
        breakdown={verifySummaryData?.breakdown || []}
        onSubmit={handleVerifySubmit}
        isSubmitting={isSubmittingVerify}
      />
      <ScheduleVisionImportModal
        isOpen={isVisionImportOpen}
        onClose={() => setIsVisionImportOpen(false)}
        deptId={activeDeptId}
        templateId={resolvedTemplateId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onConfirm={handleVisionImportConfirm}
      />
    </div>
  );
}
