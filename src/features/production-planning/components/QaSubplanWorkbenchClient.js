"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Beef,
  Beaker,
  CalendarDays,
  Check,
  ClipboardList,
  Cookie,
  Drumstick,
  Factory,
  Landmark,
  Package2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  UserRound,
  Users,
  Warehouse,
  Boxes,
  Search,
  X,
} from "lucide-react";
import GenericScheduleTable from "./GenericScheduleTable";
import { fetchJson, fetcher } from "@/lib/clientFetch";
import { useUserProfile } from "@/lib/useUserProfile";

const WIP_SUPPLY_MODE_LABEL = Object.freeze({
  stock: "ใช้สต็อก",
  make_to_order: "ผลิตสด",
  hybrid: "ผสม",
});

const QA_FG_SECTION = Object.freeze({
  id: "qa-fg-readonly-section",
  name: "FG ที่แผนกนี้แก้ไขได้",
  production_schedule_column_defs: [
    { id: "qa-col-time", key: "work_time", label: "เวลาทำงาน", col_type: "text" },
    { id: "qa-col-sku", key: "sku_code", label: "รหัส FG", col_type: "text" },
    { id: "qa-col-brand", key: "brand_name", label: "แบรนด์", col_type: "text" },
    { id: "qa-col-name", key: "sku_name", label: "ชื่อสินค้า", col_type: "text" },
    { id: "qa-col-qty", key: "planned_qty", label: "จำนวน", col_type: "number" },
    { id: "qa-col-unit", key: "unit", label: "หน่วย", col_type: "text" },
    { id: "qa-col-staff", key: "line_staff", label: "คน", col_type: "number" },
    { id: "qa-col-machine", key: "line_machine", label: "เครื่อง", col_type: "text" },
    { id: "qa-col-note", key: "item_note", label: "หมายเหตุ", col_type: "text" },
  ],
});

const THAI_WEEKDAY_SHORT = Object.freeze(["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."]);
const DAY_KEY_LABEL_TH = Object.freeze({
  mon: "จ.",
  tue: "อ.",
  wed: "พ.",
  thu: "พฤ.",
  fri: "ศ.",
  sat: "ส.",
  sun: "อา.",
});
const DAY_KEY_ORDER = Object.freeze({
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
});

const DEPARTMENT_ICON_BY_NAME = Object.freeze([
  { match: ["บิสกิต"], Icon: Cookie },
  { match: ["ขาไก่"], Icon: Drumstick },
  { match: ["นมแท่ง"], Icon: Beaker },
  { match: ["ข้าวเกรียบ"], Icon: Beef },
  { match: ["กลาง"], Icon: Landmark },
]);

function resolveDepartmentIcon(name) {
  const normalized = String(name || "").trim();
  const found = DEPARTMENT_ICON_BY_NAME.find((item) =>
    item.match.some((token) => normalized.includes(token))
  );
  return found?.Icon || Factory;
}

function isCentralDepartmentRecord(row) {
  if (row?.is_central_department === true) return true;
  const code = String(row?.code || "").trim().toUpperCase();
  const name = String(row?.name || "").trim();
  return code.includes("CENTER")
    || code.includes("CENTRAL")
    || code.includes("MID")
    || name.includes("แผนกกลาง")
    || name.includes("ส่วนกลาง")
    || name.includes("กลาง");
}

function normalizeWipSupplyMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "make_to_order") return "make_to_order";
  if (normalized === "hybrid") return "hybrid";
  return "stock";
}

function wipSupplyModeLabel(value) {
  const normalized = normalizeWipSupplyMode(value);
  return WIP_SUPPLY_MODE_LABEL[normalized] || WIP_SUPPLY_MODE_LABEL.stock;
}

function wipSupplyModeToneClass(value) {
  const normalized = normalizeWipSupplyMode(value);
  if (normalized === "make_to_order") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized === "hybrid") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Number(toNumber(value, 0).toFixed(3));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatThaiDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatThaiSlashDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const buddhistYear = date.getUTCFullYear() + 543;
  return `${day}/${month}/${buddhistYear}`;
}

function thaiWeekdayShort(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return THAI_WEEKDAY_SHORT[date.getUTCDay()] || "-";
}

function emptyLine(defaultDate, sectionModel = null, defaultShift = null) {
  const sectionId = String(sectionModel?.section?.id || sectionModel?.id || "").trim() || null;
  const sectionName = String(sectionModel?.section?.name || "").trim() || null;
  return {
    id: `${Date.now()}-${Math.random()}`,
    workDate: defaultDate || todayDate(),
    skuCode: "",
    skuName: "",
    shiftId: defaultShift?.shiftId || null,
    shiftCode: defaultShift?.shiftCode || null,
    shiftName: defaultShift?.shiftName || null,
    displayFactor: 0,
    displayUnit: "",
    planningUnit: "",
    plannedQty: "",
    sourceSectionDefId: sectionId,
    sourceSectionName: sectionName,
    workstreamCode: sectionId,
    mergePolicy: "strict_separate",
  };
}

function resolveSectionKey(row, fallbackSectionId = "") {
  return String(
    row?.sourceSectionDefId
    || row?.scheduleSectionDefId
    || row?.schedule_section_def_id
    || row?.workstreamCode
    || row?.workstream_code
    || fallbackSectionId
    || ""
  ).trim();
}

function replaceLinesForSection(prevLines = [], nextSectionLines = [], activeSectionId = "") {
  const targetSectionId = String(activeSectionId || "").trim();
  const otherLines = (Array.isArray(prevLines) ? prevLines : []).filter(
    (line) => {
      const key = resolveSectionKey(line);
      return key !== targetSectionId && key !== "";
    }
  );
  return [...otherLines, ...(Array.isArray(nextSectionLines) ? nextSectionLines : [])];
}

function filterRowsForSection(rows = [], activeSectionId = "") {
  const targetSectionId = String(activeSectionId || "").trim();
  if (!targetSectionId) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const key = resolveSectionKey(row);
    return key === targetSectionId || key === "";
  });
}

function resolveAutoDraftQty(row) {
  const explicitPlannedQty = roundQty(row?.plannedQty);
  if (explicitPlannedQty > 0) return explicitPlannedQty;

  const remainingShortageQty = roundQty(row?.remainingShortageQty);
  if (remainingShortageQty > 0) return remainingShortageQty;

  const suggestedProduceQty = roundQty(row?.suggestedProduceQty);
  if (suggestedProduceQty > 0) return suggestedProduceQty;

  return 0;
}

function hasWipShortageRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).some((row) => {
    const remainingShortageQty = toNumber(row?.remainingShortageQty, 0);
    const shortageQty = toNumber(row?.shortageQty, 0);
    const suggestedProduceQty = toNumber(row?.suggestedProduceQty, 0);
    return remainingShortageQty > 0 || shortageQty > 0 || suggestedProduceQty > 0;
  });
}

function toValidDraftRequestLines(draftLines = [], activeDepartmentId = null) {
  return (Array.isArray(draftLines) ? draftLines : [])
    .map((line) => ({
      planId: line.id || line.planId || null,
      workDate: line.workDate,
      skuCode: String(line.skuCode || "").trim().toUpperCase(),
      plannedQty: toNumber(line.plannedQty, 0),
      departmentId: activeDepartmentId || null,
      shiftId: line.shiftId || null,
      shiftCode: String(line.shiftCode || "").trim().toUpperCase() || null,
      shiftName: String(line.shiftName || "").trim() || null,
      sourceSectionDefId: String(line.sourceSectionDefId || "").trim() || null,
      sourceSectionName: String(line.sourceSectionName || "").trim() || null,
      workstreamCode: String(line.workstreamCode || line.sourceSectionDefId || "").trim() || null,
      mergePolicy: String(line.mergePolicy || "strict_separate").trim().toLowerCase() || "strict_separate",
    }))
    .filter((line) => line.workDate && line.skuCode && line.plannedQty > 0);
}

function mapAutoDraftRowsToDraftLines(rows = [], defaultDraftDate) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const plannedQty = resolveAutoDraftQty(row);
      const displayQty = roundQty(row?.displayQty);
      const sectionKey = String(
        row?.workstreamCode
        || row?.sourceSectionDefId
        || row?.scheduleSectionDefId
        || ""
      ).trim();
      return {
        id: row?.id || `${String(row?.skuCode || "").trim().toUpperCase()}-${String(row?.workDate || defaultDraftDate).slice(0, 10)}-${String(row?.shiftCode || row?.shiftId || "").trim().toUpperCase() || "default"}-${sectionKey || "default"}`,
        workDate: String(row?.workDate || defaultDraftDate).slice(0, 10),
        skuCode: String(row?.skuCode || "").trim().toUpperCase(),
        skuName: String(row?.skuName || "").trim(),
        formulaCode: String(row?.formulaCode || row?.formula_code || "").trim().toUpperCase() || null,
        bomVersionId: row?.bomVersionId || row?.bom_version_id || null,
        shiftId: String(row?.shiftId || "").trim() || null,
        shiftCode: String(row?.shiftCode || "").trim().toUpperCase() || null,
        shiftName: String(row?.shiftName || "").trim() || null,
        displayFactor:
          plannedQty > 0 && displayQty > 0
            ? displayQty / plannedQty
            : toNumber(row?.displayFactor, 0),
        displayUnit: String(row?.displayUom || row?.uom || "").trim(),
        planningUnit: String(row?.planningUnit || row?.uom || "").trim(),
        plannedQty,
        sourceSectionDefId: String(row?.sourceSectionDefId || row?.scheduleSectionDefId || "").trim() || null,
        sourceSectionName: String(row?.sourceSectionName || row?.scheduleSectionName || "").trim() || null,
        workstreamCode: String(
          row?.workstreamCode
          || row?.sourceSectionDefId
          || row?.scheduleSectionDefId
          || ""
        ).trim() || null,
        mergePolicy: String(row?.mergePolicy || "strict_separate").trim().toLowerCase() || "strict_separate",
      };
    })
    .filter((line) => line.workDate && line.skuCode && line.plannedQty > 0);
}

function mapPersistedDraftLinesToDraftLines(rows = [], defaultDraftDate) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const plannedQty = toNumber(row?.plannedQty, 0);
      const displayQty = roundQty(row?.displayQty);
      return {
        id: row?.id || row?.planId || `${String(row?.workDate || defaultDraftDate).slice(0, 10)}-${String(row?.shiftCode || row?.shiftId || "").trim().toUpperCase() || "default"}-${String(row?.skuCode || "").trim().toUpperCase()}`,
        workDate: String(row?.workDate || defaultDraftDate).slice(0, 10),
        skuCode: String(row?.skuCode || "").trim().toUpperCase(),
        skuName: String(row?.skuName || "").trim(),
        formulaCode: String(row?.formulaCode || row?.formula_code || "").trim().toUpperCase() || null,
        bomVersionId: row?.bomVersionId || row?.bom_version_id || null,
        shiftId: String(row?.shiftId || row?.shift_id || "").trim() || null,
        shiftCode: String(row?.shiftCode || row?.shift_code || "").trim().toUpperCase() || null,
        shiftName: String(row?.shiftName || row?.shift_name || "").trim() || null,
        displayFactor:
          plannedQty > 0 && displayQty > 0
            ? displayQty / plannedQty
            : toNumber(row?.displayFactor, 0),
        displayUnit: String(row?.displayUom || row?.displayUnit || row?.uom || "").trim(),
        planningUnit: String(row?.planningUnit || row?.uom || "").trim(),
        plannedQty,
        sourceSectionDefId: String(row?.sourceSectionDefId || row?.schedule_section_def_id || "").trim() || null,
        sourceSectionName: String(row?.sourceSectionName || row?.schedule_section_name || "").trim() || null,
        workstreamCode: String(
          row?.workstreamCode
          || row?.sourceSectionDefId
          || row?.schedule_section_def_id
          || ""
        ).trim() || null,
        mergePolicy: String(row?.mergePolicy || row?.merge_policy || "strict_separate").trim().toLowerCase() || "strict_separate",
      };
    })
    .filter((line) => line.workDate && line.skuCode && line.plannedQty > 0);
}

export default function QaSubplanWorkbenchClient({
  statusRows = [],
  scopeMeta = null,
  initialMasterPlanNo = "",
  initialDepartmentsPayload = null,
  onSubplanConfirmed = null,
}) {
  const router = useRouter();
  const profile = useUserProfile();
  const planOptions = useMemo(() => {
    const rows = Array.isArray(statusRows) ? statusRows : [];
    const hasPublishedMain = rows.some(
      (row) =>
        String(row?.plan_kind || "").trim().toLowerCase() === "main"
        && Boolean(row?.master_published_at)
    );
    const byPlan = new Map();
    rows.forEach((row) => {
      const planKind = String(row?.plan_kind || "").trim().toLowerCase();
      const planNo = String(row?.master_plan_no || "").trim().toUpperCase();
      if (planKind !== "main" || !planNo) return;
      if (hasPublishedMain && !row?.master_published_at) return;
      if (!byPlan.has(planNo)) {
        byPlan.set(planNo, { planNo, total: 0, editable: 0 });
      }
      const target = byPlan.get(planNo);
      target.total += 1;
      if (row?.can_edit === true) target.editable += 1;
    });
    return Array.from(byPlan.values()).sort((a, b) => b.planNo.localeCompare(a.planNo));
  }, [statusRows]);

  const initialPlanNo = useMemo(() => {
    const normalized = String(initialMasterPlanNo || "").trim().toUpperCase();
    if (normalized) return normalized;
    return planOptions[0]?.planNo || "";
  }, [initialMasterPlanNo, planOptions]);

  const editableDepartmentIds = useMemo(() => {
    if (!Array.isArray(scopeMeta?.editableDepartmentIds)) return [];
    return scopeMeta.editableDepartmentIds
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }, [scopeMeta]);
  const isAdminScope = Boolean(scopeMeta?.isAdmin);
  const canManageGlobal = Boolean(scopeMeta?.canManageGlobal);
  const isApexUser = useMemo(() => {
    const normalizedUsername = String(profile?.username || "").trim().toLowerCase();
    return normalizedUsername === "apex" || normalizedUsername === "apexechelon";
  }, [profile?.username]);
  const canAutoResolveDepartmentFromFg = isAdminScope || isApexUser;

  const { data: departmentsPayload, isLoading: departmentsLoading } = useSWR(
    "/api/production-planning/departments",
    fetcher,
    {
      revalidateOnFocus: false,
      fallbackData: initialDepartmentsPayload,
    }
  );
  const { data: wipProductsPayload } = useSWR(
    "/api/production-planning/wip-products?limit=1000",
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
  const departmentOptions = useMemo(() => {
    const rows = Array.isArray(departmentsPayload?.data) ? departmentsPayload.data : [];
    if (!canManageGlobal && editableDepartmentIds.length === 0) {
      return [];
    }
    const editableSet = new Set(editableDepartmentIds);
    const scopedRows = editableSet.size > 0
      ? rows.filter((row) => editableSet.has(String(row?.id || "").trim()))
      : rows;

    const normalizedRows = scopedRows
      .map((row) => {
        const id = String(row?.id || "").trim();
        if (!id) return null;
        return {
          id,
          code: String(row?.code || "").trim().toUpperCase() || null,
          name: String(row?.name || "").trim() || null,
          is_central_department: row?.is_central_department === true,
        };
      })
      .filter(Boolean);

    if (normalizedRows.length > 0) return normalizedRows;

    return editableDepartmentIds.map((id) => ({
      id,
      code: null,
      name: null,
    }));
  }, [canManageGlobal, departmentsPayload, editableDepartmentIds]);

  const [masterPlanNo, setMasterPlanNo] = useState(initialPlanNo);
  const [draftLines, setDraftLines] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [showWipEditor, setShowWipEditor] = useState(false);
  const [wipPickerLineId, setWipPickerLineId] = useState(null);
  const [editingWipIds, setEditingWipIds] = useState(() => new Set());
  const localDraftStateRef = useRef({
    draftUrl: null,
    dirty: false,
  });
  const autoPreviewKeyRef = useRef("");
  const autoBomCalculationKeyRef = useRef("");

  const selectedMasterPlanNo = String(masterPlanNo || "").trim().toUpperCase();
  const fgDepartmentOptions = useMemo(() => {
    const byId = new Map();
    (Array.isArray(statusRows) ? statusRows : [])
      .filter((row) => String(row?.plan_kind || "").trim().toLowerCase() === "main")
      .filter((row) => String(row?.master_plan_no || "").trim().toUpperCase() === selectedMasterPlanNo)
      .forEach((row) => {
        const departmentId = String(row?.owner_department_id || "").trim();
        if (!departmentId || byId.has(departmentId)) return;
        byId.set(departmentId, {
          id: departmentId,
          code: String(row?.owner_department_code || "").trim().toUpperCase() || null,
          name: String(row?.owner_department_name || "").trim() || null,
        });
      });
    return Array.from(byId.values());
  }, [selectedMasterPlanNo, statusRows]);
  const autoDepartmentIdFromFg = useMemo(() => {
    if (!canAutoResolveDepartmentFromFg) return "";
    return fgDepartmentOptions.length === 1 ? fgDepartmentOptions[0]?.id || "" : "";
  }, [canAutoResolveDepartmentFromFg, fgDepartmentOptions]);
  const fallbackDepartmentId = String(
    (departmentOptions.length === 1 && !isCentralDepartmentRecord(departmentOptions[0]) ? departmentOptions[0]?.id : "")
    || (autoDepartmentIdFromFg && !isCentralDepartmentRecord(fgDepartmentOptions.find((row) => row.id === autoDepartmentIdFromFg)) ? autoDepartmentIdFromFg : "")
    || (editableDepartmentIds.length === 1 && !isCentralDepartmentRecord(departmentOptions.find((row) => row.id === editableDepartmentIds[0])) ? editableDepartmentIds[0] : "")
    || ""
  ).trim();
  const activeDepartmentId = String(selectedDepartmentId || fallbackDepartmentId || "").trim();
  const activeDepartment = activeDepartmentId
    ? (
      departmentOptions.find((dept) => dept.id === activeDepartmentId)
      || fgDepartmentOptions.find((dept) => dept.id === activeDepartmentId)
      || null
    )
    : null;
  const confirmedSubplansUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activeDepartmentId) params.set("departmentId", activeDepartmentId);
    return `/api/production-planning/wip-plan/confirmed-subplans?${params.toString()}`;
  }, [activeDepartmentId]);
  const { data: confirmedSubplansPayload, isLoading: confirmedSubplansLoading } = useSWR(
    confirmedSubplansUrl,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: sectionShiftsData } = useSWR(
    activeDepartmentId ? `/api/production-section-shifts?departmentId=${encodeURIComponent(activeDepartmentId)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const confirmedSubplanKeySet = useMemo(() => {
    const rows = Array.isArray(confirmedSubplansPayload?.data) ? confirmedSubplansPayload.data : [];
    return new Set(
      rows
        .map((row) => {
          const planNo = String(row?.masterPlanNo || "").trim().toUpperCase();
          const departmentId = String(row?.departmentId || "").trim();
          return planNo && departmentId ? `${planNo}|${departmentId}` : "";
        })
        .filter(Boolean)
    );
  }, [confirmedSubplansPayload]);
  const selectablePlanOptions = useMemo(() => {
    if (!activeDepartmentId) return planOptions;
    return planOptions.filter((plan) =>
      !confirmedSubplanKeySet.has(`${String(plan?.planNo || "").trim().toUpperCase()}|${activeDepartmentId}`)
    );
  }, [activeDepartmentId, confirmedSubplanKeySet, planOptions]);
  const activeMasterPlanNo = useMemo(() => {
    if (!selectedMasterPlanNo) return "";
    return selectablePlanOptions.some((plan) => plan.planNo === selectedMasterPlanNo)
      ? selectedMasterPlanNo
      : "";
  }, [selectablePlanOptions, selectedMasterPlanNo]);
  const resetWorkspace = useCallback(() => {
    setPreviewData(null);
    setPreviewMeta(null);
    setConfirmedResult(null);
    setMessage("");
    setErrorText("");
  }, []);

  const draftUrl = useMemo(() => {
    if (!activeMasterPlanNo || !activeDepartmentId) return null;
    const params = new URLSearchParams();
    params.set("masterPlanNo", activeMasterPlanNo);
    if (activeDepartmentId) params.set("departmentId", activeDepartmentId);
    return `/api/production-planning/wip-plan/draft?${params.toString()}`;
  }, [activeDepartmentId, activeMasterPlanNo]);

  useEffect(() => {
    localDraftStateRef.current = {
      draftUrl,
      dirty: false,
    };
  }, [draftUrl]);

  const { data: draftPayload, isLoading: draftLoading, mutate: mutateDraft } = useSWR(
    draftUrl,
    fetcher,
    {
      revalidateOnFocus: false,
      onSuccess: (payload) => {
        if (
          localDraftStateRef.current.draftUrl === draftUrl
          && localDraftStateRef.current.dirty
        ) {
          return;
        }
        const lines = Array.isArray(payload?.data?.lines) ? payload.data.lines : [];
        const lockedByConfirmedSubplan = Boolean(payload?.meta?.subplanLocked);
        if (lines.length) {
          setDraftLines(mapPersistedDraftLinesToDraftLines(lines, defaultDraftDate));
          setEditingWipIds(new Set());
          return;
        }
        if (lockedByConfirmedSubplan) {
          setDraftLines([]);
          setEditingWipIds(new Set());
          return;
        }
        setDraftLines([emptyLine(todayDate(), activeSectionModel)]);
        setEditingWipIds(new Set());
      },
    }
  );
  const confirmedSubplanMeta = draftPayload?.meta?.existingSubplan || null;
  const isConfirmedSubplanLocked = Boolean(draftPayload?.meta?.subplanLocked);
  const defaultDraftDate =
    previewMeta?.planRange?.start
    || draftPayload?.meta?.planRange?.start
    || todayDate();

  const fgRows = useMemo(() => {
    if (!activeMasterPlanNo) return [];
    return (Array.isArray(statusRows) ? statusRows : [])
      .filter((row) => String(row?.plan_kind || "").trim().toLowerCase() === "main")
      .filter((row) => String(row?.master_plan_no || "").trim().toUpperCase() === activeMasterPlanNo)
      .filter((row) => {
        if (!activeDepartmentId) return true;
        return String(row?.owner_department_id || "").trim() === activeDepartmentId;
      })
      .map((row) => ({
        planId: row?.plan_id || null,
        skuCode: row?.sku_code || "",
        skuName: row?.sku_name || "",
        plannedQty: toNumber(row?.planned_qty, 0),
        canEdit: row?.can_edit === true,
        ownerDepartmentId: String(row?.owner_department_id || "").trim() || null,
        ownerDepartmentCode: row?.owner_department_code || null,
        ownerDepartmentName: row?.owner_department_name || null,
      }))
      .sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  }, [activeDepartmentId, activeMasterPlanNo, statusRows]);
  const editableFgCount = useMemo(
    () => fgRows.filter((row) => row.canEdit).length,
    [fgRows]
  );
  const editablePlanRows = useMemo(() => {
    if (!activeMasterPlanNo) return [];
    return (Array.isArray(statusRows) ? statusRows : [])
      .filter((row) => String(row?.plan_kind || "").trim().toLowerCase() === "main")
      .filter((row) => String(row?.master_plan_no || "").trim().toUpperCase() === activeMasterPlanNo)
      .filter((row) => row?.can_edit === true)
      .filter((row) => {
        if (!activeDepartmentId) return true;
        return String(row?.owner_department_id || "").trim() === activeDepartmentId;
      })
      .map((row) => ({
        planId: row?.plan_id || null,
        date: String(row?.period_start || "").slice(0, 10),
        workStartTime: String(row?.work_start_time || "").trim().slice(0, 5),
        workEndTime: String(row?.work_end_time || "").trim().slice(0, 5),
        skuCode: String(row?.sku_code || "").trim().toUpperCase(),
        brandName: String(row?.brand_name || "").trim() || null,
        skuName: String(row?.sku_name || "").trim(),
        plannedQty: toNumber(row?.planned_qty, 0),
        unit: String(row?.unit || "").trim() || "unit",
        lineStaffCount: row?.line_staff_count ?? null,
        lineMachineNo: row?.line_machine_no ?? null,
        itemNote: String(row?.item_note || "").trim() || null,
      }))
      .sort((a, b) => {
        const dateDiff = String(a.date || "").localeCompare(String(b.date || ""));
        if (dateDiff !== 0) return dateDiff;
        return String(a.skuCode || "").localeCompare(String(b.skuCode || ""));
      });
  }, [activeDepartmentId, activeMasterPlanNo, statusRows]);
  const editableScheduleRows = useMemo(() => {
    if (!activeMasterPlanNo) return [];
    return (Array.isArray(statusRows) ? statusRows : [])
      .filter((row) => String(row?.plan_kind || "").trim().toLowerCase() === "main")
      .filter((row) => String(row?.master_plan_no || "").trim().toUpperCase() === activeMasterPlanNo)
      .filter((row) => row?.can_edit === true)
      .filter((row) => {
        if (!activeDepartmentId) return true;
        return String(row?.owner_department_id || "").trim() === activeDepartmentId;
      })
      .map((row, index) => {
        const rawData = row?.schedule_row_data && typeof row.schedule_row_data === "object"
          ? row.schedule_row_data
          : null;
        const normalizedDate = String(row?.period_start || "").slice(0, 10);
        const dayKey = String(row?.schedule_day_key || "").trim().toLowerCase() || normalizedDate;
        const fallbackRowData = {
          work_time:
            String(row?.work_start_time || "").trim() || String(row?.work_end_time || "").trim()
              ? `${String(row?.work_start_time || "").trim() || "-"} - ${String(row?.work_end_time || "").trim() || "-"}`
              : "-",
          sku_code: String(row?.sku_code || "").trim().toUpperCase() || "-",
          brand_name: String(row?.brand_name || "").trim() || "-",
          sku_name: String(row?.sku_name || "").trim() || "-",
          planned_qty: toNumber(row?.planned_qty, 0),
          unit: String(row?.unit || "").trim() || "unit",
          line_staff: row?.line_staff_count ?? null,
          line_machine: row?.line_machine_no ?? "-",
          item_note: String(row?.item_note || "").trim() || "-",
        };
        return {
          id: String(row?.schedule_row_id || row?.plan_id || `qa-fg-row-${index + 1}`).trim(),
          sectionDefId: String(row?.schedule_section_def_id || "").trim() || "fallback-section",
          sectionName: String(row?.schedule_section_name || "").trim() || "FG",
          templateId: String(row?.schedule_template_id || "").trim() || null,
          dayKey,
          dateValue: normalizedDate,
          displayOrder: Number(row?.schedule_display_order || 0),
          rowData: rawData || fallbackRowData,
        };
      });
  }, [activeDepartmentId, activeMasterPlanNo, statusRows]);
  const activeFgTemplateId = useMemo(() => {
    const firstWithTemplate = editableScheduleRows.find((row) => row.templateId);
    return firstWithTemplate?.templateId || null;
  }, [editableScheduleRows]);
  const { data: fgTemplateSectionsPayload } = useSWR(
    activeFgTemplateId
      ? `/api/production-planning/schedule/templates/${activeFgTemplateId}/sections`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const fgSectionDefs = useMemo(() => {
    const rows = Array.isArray(fgTemplateSectionsPayload?.data)
      ? fgTemplateSectionsPayload.data
      : [];
    return rows
      .map((section) => ({
        ...section,
        production_schedule_column_defs: Array.isArray(section?.production_schedule_column_defs)
          ? [...section.production_schedule_column_defs].sort(
            (a, b) => Number(a?.display_order || 0) - Number(b?.display_order || 0)
          )
          : [],
      }))
      .sort((a, b) => Number(a?.display_order || 0) - Number(b?.display_order || 0));
  }, [fgTemplateSectionsPayload]);
  const qaFgSectionTableModels = useMemo(() => {
    const rowsBySection = new Map();
    editableScheduleRows.forEach((row) => {
      const key = row.sectionDefId || "fallback-section";
      if (!rowsBySection.has(key)) rowsBySection.set(key, []);
      rowsBySection.get(key).push(row);
    });

    const sectionMetaById = new Map(
      fgSectionDefs.map((section) => [String(section?.id || "").trim(), section])
    );
    // Merge the department's full section master so QA can plan WIP in any
    // section, including ones that have no FG rows in the current master plan.
    const departmentSections = Array.isArray(sectionShiftsData?.sections)
      ? sectionShiftsData.sections
      : [];
    departmentSections.forEach((section) => {
      const id = String(section?.id || "").trim();
      if (!id || sectionMetaById.has(id)) return;
      sectionMetaById.set(id, section);
    });

    const orderedSectionIds = [];
    const seenSectionIds = new Set();
    Array.from(sectionMetaById.values())
      .slice()
      .sort((a, b) => Number(a?.display_order || 0) - Number(b?.display_order || 0))
      .forEach((section) => {
        const id = String(section?.id || "").trim();
        if (!id || seenSectionIds.has(id)) return;
        seenSectionIds.add(id);
        orderedSectionIds.push(id);
      });
    rowsBySection.forEach((_, key) => {
      if (seenSectionIds.has(key)) return;
      seenSectionIds.add(key);
      orderedSectionIds.push(key);
    });

    if (!orderedSectionIds.length) return [];

    return orderedSectionIds
      .map((sectionId, index) => {
        const rows = (rowsBySection.get(sectionId) || [])
          .slice()
          .sort((a, b) => {
            const dayA = String(a?.dayKey || "");
            const dayB = String(b?.dayKey || "");
            const orderA = DAY_KEY_ORDER[dayA] ?? 99;
            const orderB = DAY_KEY_ORDER[dayB] ?? 99;
            if (orderA !== orderB) return orderA - orderB;
            const dateDiff = String(a?.dateValue || "").localeCompare(String(b?.dateValue || ""));
            if (dateDiff !== 0) return dateDiff;
            const displayDiff = Number(a?.displayOrder || 0) - Number(b?.displayOrder || 0);
            if (displayDiff !== 0) return displayDiff;
            return String(a?.id || "").localeCompare(String(b?.id || ""));
          });

        const dayMeta = new Map();
        rows.forEach((row) => {
          const key = String(row?.dayKey || "");
          if (!key) return;
          if (!dayMeta.has(key)) {
            const dateValue = String(row?.dateValue || "").slice(0, 10);
            dayMeta.set(key, {
              key,
              label: DAY_KEY_LABEL_TH[key] || thaiWeekdayShort(dateValue),
              date: /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? formatThaiSlashDate(dateValue) : "-",
              full:
                /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
                  ? `${DAY_KEY_LABEL_TH[key] || thaiWeekdayShort(dateValue)} ${formatThaiSlashDate(dateValue)}`
                  : key,
              sortOrder: DAY_KEY_ORDER[key] ?? 99,
            });
          }
        });
        const days = Array.from(dayMeta.values()).sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return String(a.key || "").localeCompare(String(b.key || ""));
        });

        const sectionDef = sectionMetaById.get(sectionId);
        const fallbackColumns = (() => {
          const firstRowData = rows[0]?.rowData && typeof rows[0].rowData === "object" ? rows[0].rowData : {};
          const keys = Object.keys(firstRowData);
          if (!keys.length) return QA_FG_SECTION.production_schedule_column_defs;
          return keys.map((key, keyIndex) => {
            const value = firstRowData[key];
            return {
              id: `${sectionId || "fallback"}-${key}`,
              key,
              label: key,
              col_type: typeof value === "number" ? "number" : "text",
              display_order: keyIndex,
            };
          });
        })();

        return {
          id: sectionId || `fallback-section-${index + 1}`,
          section: sectionDef
            ? {
              ...sectionDef,
              production_schedule_column_defs:
                Array.isArray(sectionDef.production_schedule_column_defs)
                  && sectionDef.production_schedule_column_defs.length
                  ? sectionDef.production_schedule_column_defs
                  : fallbackColumns,
            }
            : {
              id: sectionId || `fallback-section-${index + 1}`,
              name: rows[0]?.sectionName || "FG",
              display_order: 999,
              production_schedule_column_defs: fallbackColumns,
            },
          days,
          rows: rows.map((row, rowIndex) => ({
            id: row.id || `${sectionId || "fallback"}-${rowIndex + 1}`,
            day_key: row.dayKey,
            row_data: row.rowData || {},
          })),
        };
      })
      .sort((a, b) => Number(a?.section?.display_order || 999) - Number(b?.section?.display_order || 999));
  }, [editableScheduleRows, fgSectionDefs, sectionShiftsData]);
  const noopScheduleAction = useCallback(() => {}, []);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const sectionTabs = qaFgSectionTableModels;
  const activeSectionModel =
    sectionTabs.find((item) => item.id === selectedSectionId) || sectionTabs[0] || null;
  const activeSectionId = String(activeSectionModel?.id || "").trim();
  const activeSectionShifts = useMemo(() => {
    if (!sectionShiftsData?.sections || !activeSectionId) return [];
    const sec = sectionShiftsData.sections.find((s) => String(s.id).trim() === activeSectionId);
    return Array.isArray(sec?.shifts) ? sec.shifts : [];
  }, [sectionShiftsData, activeSectionId]);
  const activeSectionDraftLines = useMemo(
    () => filterRowsForSection(draftLines, activeSectionId),
    [activeSectionId, draftLines]
  );

  const wipProductRows = useMemo(
    () => (Array.isArray(wipProductsPayload?.data) ? wipProductsPayload.data : []),
    [wipProductsPayload]
  );
  const wipSkuOptions = useMemo(() => {
    const bySku = new Map();
    const selectableRows = Array.isArray(previewData?.wipSelectableOptions)
      ? previewData.wipSelectableOptions
      : [];
    selectableRows.forEach((row) => {
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      if (!skuCode) return;
      bySku.set(skuCode, {
        skuCode,
        skuName: String(row?.skuName || "").trim(),
        uom: String(row?.uom || "").trim() || "unit",
        planningUnit: String(row?.planningUnit || row?.uom || "").trim() || "unit",
      });
    });
    draftLines.forEach((line) => {
      const skuCode = String(line?.skuCode || "").trim().toUpperCase();
      if (!skuCode || bySku.has(skuCode)) return;
      const catalogRow = wipProductRows.find(
        (row) => String(row?.skuCode || "").trim().toUpperCase() === skuCode
      );
      bySku.set(skuCode, {
        skuCode,
        skuName:
          String(line?.skuName || "").trim()
          || String(catalogRow?.skuName || "").trim(),
        uom: String(catalogRow?.uomName || "").trim() || "unit",
        planningUnit:
          String(catalogRow?.wipQtyInputMode || "").trim().toLowerCase() === "batch"
            ? "batch"
            : (String(catalogRow?.uomName || "").trim() || "unit"),
      });
    });
    return Array.from(bySku.values()).sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  }, [draftLines, previewData, wipProductRows]);
  const wipSkuNameBySku = useMemo(() => {
    const map = new Map();
    wipProductRows.forEach((row) => {
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      if (!skuCode) return;
      const skuName = String(row?.skuName || "").trim();
      if (!skuName) return;
      map.set(skuCode, skuName);
    });
    wipSkuOptions.forEach((row) => {
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      const skuName = String(row?.skuName || "").trim();
      if (!skuCode || !skuName) return;
      map.set(skuCode, skuName);
    });
    return map;
  }, [wipProductRows, wipSkuOptions]);
  const wipCatalogMetaBySku = useMemo(() => {
    const map = new Map();
    wipProductRows.forEach((row) => {
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      if (!skuCode) return;
      const unitsPerBatch = toNumber(row?.unitsPerBatch, 0);
      const batchMode = String(row?.wipQtyInputMode || "").trim().toLowerCase() === "batch";
      map.set(skuCode, {
        factor: batchMode && unitsPerBatch > 0 ? unitsPerBatch : 1,
        displayUnit: String(row?.uomName || "").trim() || "หน่วย",
        planningUnit: batchMode ? "batch" : (String(row?.uomName || "").trim() || "หน่วย"),
      });
    });
    return map;
  }, [wipProductRows]);
  const previewAutoDraftLines = useMemo(() => {
    const rows = filterRowsForSection(previewData?.autoDraftLines, activeSectionId);
    return rows
      .map((row) => ({
        id: row?.id || `${String(row?.workDate || "").slice(0, 10)}-${String(row?.shiftCode || row?.shiftId || "").trim().toUpperCase() || "default"}-${String(row?.skuCode || "").trim().toUpperCase()}-${String(row?.workstreamCode || row?.sourceSectionDefId || "").trim() || "default"}`,
        workDate: String(row?.workDate || "").slice(0, 10),
        skuCode: String(row?.skuCode || "").trim().toUpperCase(),
        skuName: String(row?.skuName || "").trim(),
        shiftId: String(row?.shiftId || "").trim() || null,
        shiftCode: String(row?.shiftCode || "").trim().toUpperCase() || null,
        shiftName: String(row?.shiftName || "").trim() || null,
        plannedQty: roundQty(row?.plannedQty),
        displayQty: roundQty(row?.displayQty),
        displayUom: String(row?.displayUom || "").trim(),
        planningUom: String(row?.uom || "").trim(),
        sourceSectionDefId: String(row?.sourceSectionDefId || row?.scheduleSectionDefId || "").trim() || null,
        sourceSectionName: String(row?.sourceSectionName || row?.scheduleSectionName || "").trim() || null,
        workstreamCode: String(row?.workstreamCode || row?.sourceSectionDefId || row?.scheduleSectionDefId || "").trim() || null,
        mergePolicy: String(row?.mergePolicy || "strict_separate").trim().toLowerCase() || "strict_separate",
      }))
      .filter((line) => line.workDate && line.skuCode && line.plannedQty > 0);
  }, [activeSectionId, previewData]);
  const previewAutoDraftQtyBySku = useMemo(() => {
    const map = new Map();
    previewAutoDraftLines.forEach((line) => {
      map.set(
        line.skuCode,
        roundQty(toNumber(map.get(line.skuCode), 0) + toNumber(line.plannedQty, 0))
      );
    });
    return map;
  }, [previewAutoDraftLines]);
  const hasWipShortage = useMemo(() => {
    const rows = Array.isArray(previewData?.wipSummary) ? previewData.wipSummary : [];
    return hasWipShortageRows(rows);
  }, [previewData]);
  const canConfirmWithoutWipLines = useMemo(
    () => Array.isArray(previewData?.wipSummary) && !hasWipShortage,
    [hasWipShortage, previewData]
  );
  const wipDisplayMetaBySku = useMemo(() => {
    const map = new Map();

    previewAutoDraftLines.forEach((line) => {
      const skuCode = String(line?.skuCode || "").trim().toUpperCase();
      const plannedQty = toNumber(line?.plannedQty, 0);
      const displayQty = toNumber(line?.displayQty, 0);
      if (!skuCode || plannedQty <= 0 || displayQty <= 0) return;
      map.set(skuCode, {
        factor: displayQty / plannedQty,
        displayUnit: String(line?.displayUom || "").trim() || "หน่วย",
        planningUnit: String(line?.planningUom || "").trim() || "หน่วย",
      });
    });

    (Array.isArray(previewData?.wipSummary) ? previewData.wipSummary : []).forEach((row) => {
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      if (!skuCode || map.has(skuCode)) return;
      const remainingShortageQty = toNumber(row?.remainingShortageQty, 0);
      const suggestedProduceQty = toNumber(row?.suggestedProduceQty, 0);
      const factor =
        remainingShortageQty > 0 && suggestedProduceQty > 0
          ? suggestedProduceQty / remainingShortageQty
          : 1;
      map.set(skuCode, {
        factor,
        displayUnit: String(row?.uom || "").trim() || "หน่วย",
        planningUnit: String(row?.planningUnit || row?.uom || "").trim() || "หน่วย",
      });
    });

    wipCatalogMetaBySku.forEach((value, key) => {
      if (!map.has(key)) {
        map.set(key, value);
      }
    });

    return map;
  }, [previewAutoDraftLines, previewData, wipCatalogMetaBySku]);
  const previewRawClaimRows = useMemo(() => {
    const rows = Array.isArray(previewData?.rawPreview) ? previewData.rawPreview : [];
    return rows
      .map((row) => {
        const materialSkuCode = String(row?.materialSkuCode || row?.skuCode || "").trim().toUpperCase();
        const materialGoodsCode = String(
          row?.materialGoodsCode || row?.goodsCode || row?.skuCode || ""
        ).trim().toUpperCase();
        return {
          materialSkuCode,
          materialGoodsCode,
          materialName: String(row?.materialName || row?.skuName || "").trim(),
          issueQty: roundQty(row?.issueQty),
          requiredQty: roundQty(row?.requiredQty),
          unit: String(row?.unit || row?.uom || "").trim() || "หน่วย",
        };
      })
      .filter((row) => row.materialGoodsCode && (row.issueQty > 0 || row.requiredQty > 0));
  }, [previewData]);
  const departmentScopeErrorText = useMemo(() => {
    if (!activeMasterPlanNo) {
      return "กรุณาเลือกเลขแผนหลักก่อน";
    }
    if (canAutoResolveDepartmentFromFg) {
      if (!fgRows.length) {
        return "ไม่พบรายการ FG ในแผนหลักที่เลือก";
      }
      if (!fgDepartmentOptions.length) {
        return "ไม่พบแผนกของ FG ในแผนหลักที่เลือก";
      }
      if (fgDepartmentOptions.length > 1) {
        return "แผนหลักนี้มี FG หลายแผนก ระบบเลือกแผนกอัตโนมัติไม่ได้";
      }
      return "ยังไม่สามารถระบุแผนกจาก FG ในแผนหลักได้";
    }
    return canManageGlobal
      ? "บัญชีนี้มีสิทธิ์หลายแผนก กรุณาใช้บัญชีที่ผูก 1 แผนกสำหรับหน้าวางแผนย่อย QA"
      : "ยังไม่พบแผนกที่ผูกกับผู้ใช้นี้ กรุณาตรวจสอบสิทธิ์ก่อนใช้งานหน้าวางแผนย่อย QA";
  }, [
    activeMasterPlanNo,
    canAutoResolveDepartmentFromFg,
    canManageGlobal,
    fgDepartmentOptions,
    fgRows.length,
  ]);
  const showDepartmentScopeWarning =
    !departmentsLoading
    && !activeDepartmentId
    && (!canAutoResolveDepartmentFromFg || Boolean(activeMasterPlanNo));
  const reportHref = useMemo(() => {
    const params = new URLSearchParams();
    const targetPlanNo = String(
      confirmedResult?.masterPlanNo
      || activeMasterPlanNo
      || ""
    ).trim().toUpperCase();
    const targetDepartmentCode = String(
      confirmedResult?.departmentCode
      || activeDepartment?.code
      || ""
    ).trim().toUpperCase();
    const dateFrom = String(confirmedResult?.periodStart || "").slice(0, 10);
    const dateTo = String(confirmedResult?.periodEnd || "").slice(0, 10);

    if (targetPlanNo) params.set("reportPlanNo", targetPlanNo);
    if (targetDepartmentCode) params.set("reportDepartment", targetDepartmentCode);
    if (dateFrom) params.set("reportStartDate", dateFrom);
    if (dateTo) params.set("reportEndDate", dateTo);

    const query = params.toString();
    return query ? `/production-line/planning/report?${query}` : "/production-line/planning/report";
  }, [activeDepartment?.code, activeMasterPlanNo, confirmedResult]);
  const wipSummaryRows = useMemo(
    () => filterRowsForSection(previewData?.wipSummary, activeSectionId),
    [activeSectionId, previewData]
  );
  const totalWipDraftQty = useMemo(
    () => activeSectionDraftLines.reduce((sum, line) => sum + toNumber(line?.plannedQty, 0), 0),
    [activeSectionDraftLines]
  );
  const shortageCount = useMemo(
    () => wipSummaryRows.filter((row) => toNumber(row?.shortageQty, 0) > 0).length,
    [wipSummaryRows]
  );
  const readyWipCount = useMemo(
    () => wipSummaryRows.filter((row) => toNumber(row?.shortageQty, 0) <= 0).length,
    [wipSummaryRows]
  );
  const unresolvedWarnings = useMemo(
    () => [
      shortageCount > 0 ? `สต็อก WIP ไม่พอ ${shortageCount} รายการ` : "",
      hasWipShortage ? "ยังมี WIP ขาด ต้องเติมแผนย่อยก่อนยืนยัน" : "",
    ].filter(Boolean),
    [hasWipShortage, shortageCount]
  );
  const departmentTabs = useMemo(() => {
    const rows = (departmentOptions.length ? departmentOptions : fgDepartmentOptions).map((row) => ({
      id: String(row?.id || "").trim(),
      code: String(row?.code || "").trim().toUpperCase(),
      name: String(row?.name || "").trim() || "ไม่ระบุชื่อแผนก",
      is_central_department: row?.is_central_department === true,
    }));
    const seen = new Set();
    return rows.filter((row) => {
      if (!row.id || seen.has(row.id)) return false;
      if (isCentralDepartmentRecord(row)) return false;
      seen.add(row.id);
      return true;
    });
  }, [departmentOptions, fgDepartmentOptions]);

  const handleMasterPlanChange = useCallback(
    (value) => {
      setMasterPlanNo(value);
      setSelectedSectionId("");
      resetWorkspace();
      setDraftLines([]);
    },
    [resetWorkspace, setSelectedSectionId]
  );

  const runPreview = useCallback(async () => {
    if (!activeMasterPlanNo || !activeDepartmentId) return;
    setPreviewing(true);
    setErrorText("");
    setMessage("");
    const result = await fetchJson("/api/production-planning/explosion/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPlanNo: activeMasterPlanNo,
        departmentId: activeDepartmentId || null,
        wipDraftLines: [],
        ignorePersistedDraft: true,
      }),
    });
    if (!result.ok) {
      setErrorText(result.error?.message || "รีเจน WIP จากแผนใหญ่ไม่สำเร็จ");
      setPreviewing(false);
      return;
    }
    const nextPreviewData = result.data?.data || null;
    const nextPreviewLines = mapAutoDraftRowsToDraftLines(nextPreviewData?.autoDraftLines, defaultDraftDate);
    startTransition(() => {
      setPreviewData(nextPreviewData);
      setPreviewMeta(result.data?.meta || null);
      setDraftLines(nextPreviewLines);
    });
    localDraftStateRef.current = {
      draftUrl,
      dirty: true,
    };
    setConfirmedResult(null);
    setErrorText("");
    setMessage(
      nextPreviewLines.length
        ? "รีเจน WIP ทั้งแผนกจากแผนใหญ่ให้แล้ว กรุณาตรวจสอบก่อนยืนยันแผนย่อย"
        : "แผนนี้ยังไม่มี WIP ที่ต้องผลิตเพิ่ม"
    );
    setPreviewing(false);
  }, [activeDepartmentId, activeMasterPlanNo, defaultDraftDate, draftUrl]);

  const regenerateSectionFromBom = useCallback(async ({ preserveDraftLines = false } = {}) => {
    if (!activeMasterPlanNo || !activeDepartmentId || !activeSectionId) return;
    setPreviewing(true);
    setErrorText("");
    setMessage("");
    const requestDraftLines = toValidDraftRequestLines(draftLines, activeDepartmentId);
    const result = await fetchJson("/api/production-planning/explosion/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPlanNo: activeMasterPlanNo,
        departmentId: activeDepartmentId || null,
        wipDraftLines: requestDraftLines,
        ignorePersistedDraft: true,
      }),
    });
    if (!result.ok) {
      setErrorText(result.error?.message || "รีเจน WIP จาก BOM ไม่สำเร็จ");
      setPreviewing(false);
      return;
    }
    const nextPreviewData = result.data?.data || null;
    const nextPreviewMeta = result.data?.meta || null;
    startTransition(() => {
      setPreviewData(nextPreviewData);
      setPreviewMeta(nextPreviewMeta);
    });
    if (!preserveDraftLines) {
      const nextRows = filterRowsForSection(nextPreviewData?.autoDraftLines, activeSectionId);
      const fallbackRows = filterRowsForSection(nextPreviewData?.wipSummary, activeSectionId);
      const nextSectionLines = mapAutoDraftRowsToDraftLines(
        nextRows.length ? nextRows : fallbackRows,
        defaultDraftDate
      );
      startTransition(() => {
        setDraftLines((prev) => replaceLinesForSection(prev, nextSectionLines, activeSectionId));
      });
      localDraftStateRef.current = {
        draftUrl,
        dirty: true,
      };
      setConfirmedResult(null);
      setMessage(
        nextSectionLines.length
          ? "รีเจน WIP ของ Section นี้จาก BOM ให้แล้ว กรุณาตรวจสอบก่อนยืนยันแผนย่อย"
          : "Section นี้ไม่ต้องผลิต WIP เพิ่ม"
      );
    }
    setErrorText("");
    setPreviewing(false);
  }, [
    activeDepartmentId,
    activeMasterPlanNo,
    activeSectionId,
    defaultDraftDate,
    draftLines,
    draftUrl,
  ]);

  useEffect(() => {
    const validLines = activeSectionDraftLines.filter(
      (line) => line.workDate && line.skuCode && toNumber(line.plannedQty, 0) > 0
    );
    if (!activeMasterPlanNo || !activeDepartmentId || !activeSectionId || previewing || editingWipIds.size || !validLines.length) {
      return undefined;
    }
    const calculationKey = `${activeMasterPlanNo}|${activeDepartmentId}|${activeSectionId}|${validLines.map((line) => `${line.id}:${line.workDate}:${line.shiftId || line.shiftCode || ""}:${line.skuCode}:${line.plannedQty}`).join(",")}`;
    if (autoBomCalculationKeyRef.current === calculationKey) {
      return undefined;
    }
    autoBomCalculationKeyRef.current = calculationKey;
    const timer = setTimeout(() => {
      regenerateSectionFromBom({ preserveDraftLines: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [
    activeDepartmentId,
    activeMasterPlanNo,
    activeSectionDraftLines,
    activeSectionId,
    editingWipIds,
    previewing,
    regenerateSectionFromBom,
  ]);

  useEffect(() => {
    if (!activeMasterPlanNo || !activeDepartmentId || previewing) {
      return undefined;
    }
    if (localDraftStateRef.current.dirty) {
      return undefined;
    }

    const nextKey = `${activeMasterPlanNo}|${activeDepartmentId}|${activeSectionId || "all"}`;
    if (autoPreviewKeyRef.current === nextKey) {
      return undefined;
    }
    autoPreviewKeyRef.current = nextKey;

    let ignore = false;
    (async () => {
      const result = await fetchJson("/api/production-planning/explosion/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: activeMasterPlanNo,
          departmentId: activeDepartmentId || null,
          wipDraftLines: toValidDraftRequestLines(draftLines, activeDepartmentId),
        }),
      });
      if (ignore) return;
      if (!result.ok) {
        setErrorText(result.error?.message || "คำนวณตัวอย่างไม่สำเร็จ");
        return;
      }
      const nextPreviewData = result.data?.data || null;
      startTransition(() => {
        setPreviewData(nextPreviewData);
        setPreviewMeta(result.data?.meta || null);
        if (!localDraftStateRef.current.dirty) {
          const persistedLines = mapPersistedDraftLinesToDraftLines(
            nextPreviewData?.draftLines,
            defaultDraftDate
          );
          const nextLines = persistedLines.length
            ? persistedLines
            : mapAutoDraftRowsToDraftLines(nextPreviewData?.autoDraftLines, defaultDraftDate);
          if (nextLines.length) {
            setDraftLines(nextLines);
          }
        }
      });
    })();

    return () => {
      ignore = true;
    };
  }, [
    activeDepartmentId,
    activeMasterPlanNo,
    activeSectionId,
    defaultDraftDate,
    draftLines,
    previewing,
  ]);

  const autofillDraftFromShortage = useCallback(() => {
    const rows = filterRowsForSection(previewData?.autoDraftLines, activeSectionId);
    const fallbackRows = filterRowsForSection(previewData?.wipSummary, activeSectionId);
    const nextLines = mapAutoDraftRowsToDraftLines(
      rows.length ? rows : fallbackRows,
      defaultDraftDate
    );

    if (!nextLines.length) {
      localDraftStateRef.current = {
        draftUrl,
        dirty: true,
      };
      setDraftLines((prev) => replaceLinesForSection(prev, [], activeSectionId));
      setErrorText("");
      setConfirmedResult(null);
      setMessage("Section นี้ไม่ต้องผลิต WIP เพิ่ม");
      return;
    }

    localDraftStateRef.current = {
      draftUrl,
      dirty: true,
    };
    setDraftLines((prev) => replaceLinesForSection(prev, nextLines, activeSectionId));
    setErrorText("");
    setConfirmedResult(null);
    setMessage("ระบบเติมร่างจาก WIP ที่ขาดให้แล้วสำหรับ Section นี้ กรุณาตรวจสอบก่อนยืนยันแผนย่อย");
  }, [activeSectionId, defaultDraftDate, draftUrl, previewData]);

  const ensurePreviewForEmptyConfirm = useCallback(async () => {
    if (Array.isArray(previewData?.wipSummary)) {
      return {
        ok: true,
        canConfirmWithoutWipLines,
        hasWipShortage,
      };
    }
    if (!activeMasterPlanNo) {
      setErrorText("กรุณาเลือกเลขแผนหลักก่อน");
      return { ok: false };
    }
    if (!activeDepartmentId) {
      setErrorText(departmentScopeErrorText);
      return { ok: false };
    }

    setPreviewing(true);
    setErrorText("");
    setMessage("");
    const result = await fetchJson("/api/production-planning/explosion/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPlanNo: activeMasterPlanNo,
        departmentId: activeDepartmentId || null,
        wipDraftLines: toValidDraftRequestLines(draftLines, activeDepartmentId),
      }),
    });
    setPreviewing(false);

    if (!result.ok) {
      setErrorText(result.error?.message || "คำนวณตัวอย่างไม่สำเร็จ");
      return { ok: false };
    }

    const nextPreviewData = result.data?.data || null;
    const nextPreviewMeta = result.data?.meta || null;
    const nextWipSummary = Array.isArray(nextPreviewData?.wipSummary) ? nextPreviewData.wipSummary : [];
    const nextHasWipShortage = hasWipShortageRows(nextWipSummary);
    startTransition(() => {
      setPreviewData(nextPreviewData);
      setPreviewMeta(nextPreviewMeta);
    });

    return {
      ok: true,
      canConfirmWithoutWipLines: Array.isArray(nextPreviewData?.wipSummary) && !nextHasWipShortage,
      hasWipShortage: nextHasWipShortage,
    };
  }, [
    activeDepartmentId,
    activeMasterPlanNo,
    canConfirmWithoutWipLines,
    departmentScopeErrorText,
    draftLines,
    hasWipShortage,
    previewData,
  ]);

  const saveDraft = useCallback(async ({
    silent = false,
    allowEmptyConfirm = false,
    emptyConfirmAllowedOverride = null,
    emptyConfirmHasShortageOverride = null,
  } = {}) => {
    if (!activeMasterPlanNo) {
      setErrorText("กรุณาเลือกเลขแผนหลักก่อน");
      return { ok: false };
    }
    if (!activeDepartmentId) {
      setErrorText(departmentScopeErrorText);
      return { ok: false };
    }
    setSaving(true);
    setErrorText("");
    setMessage("");
    const lines = toValidDraftRequestLines(draftLines, activeDepartmentId);
    if (!lines.length) {
      setSaving(false);
      const emptyConfirmAllowed = emptyConfirmAllowedOverride ?? canConfirmWithoutWipLines;
      const emptyConfirmHasShortage = emptyConfirmHasShortageOverride ?? hasWipShortage;
      if (allowEmptyConfirm && emptyConfirmAllowed) {
        setErrorText("");
        return { ok: true, skippedDraft: true };
      }
      if (allowEmptyConfirm && !emptyConfirmAllowed) {
        setErrorText(
          emptyConfirmHasShortage
            ? "ยังมี WIP ขาด ต้องมีอย่างน้อย 1 บรรทัด WIP ก่อนยืนยันแผนย่อย"
            : "กรุณาคำนวณโครงสร้างก่อนยืนยันแบบไม่มีบรรทัด WIP"
        );
        return { ok: false };
      }
      setErrorText("กรุณากรอกอย่างน้อย 1 บรรทัด WIP ที่ถูกต้อง");
      return { ok: false };
    }
    const result = await fetchJson("/api/production-planning/wip-plan/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPlanNo: activeMasterPlanNo,
        departmentId: activeDepartmentId,
        lines,
      }),
    });
    setSaving(false);
    if (!result.ok) {
      setErrorText(result.error?.message || "ไม่สามารถบันทึกร่างได้");
      return { ok: false };
    }
    if (!silent) {
      setMessage("บันทึกร่างเรียบร้อย");
    }
    localDraftStateRef.current = {
      draftUrl,
      dirty: false,
    };
    await mutateDraft();
    return { ok: true };
  }, [
    activeDepartmentId,
    activeMasterPlanNo,
    canConfirmWithoutWipLines,
    departmentScopeErrorText,
    draftLines,
    draftUrl,
    hasWipShortage,
    mutateDraft,
  ]);

  const confirmSubplan = useCallback(async () => {
    if (isConfirmedSubplanLocked) {
      setErrorText("แผนย่อยนี้ยืนยันแล้ว ไม่สามารถยืนยันซ้ำได้");
      return;
    }
    let emptyConfirmAllowedOverride = null;
    let emptyConfirmHasShortageOverride = null;
    const lines = toValidDraftRequestLines(draftLines, activeDepartmentId);
    if (!lines.length && !Array.isArray(previewData?.wipSummary)) {
      const previewResult = await ensurePreviewForEmptyConfirm();
      if (!previewResult.ok) return;
      emptyConfirmAllowedOverride = previewResult.canConfirmWithoutWipLines;
      emptyConfirmHasShortageOverride = previewResult.hasWipShortage;
    }

    const saveResult = await saveDraft({
      silent: true,
      allowEmptyConfirm: true,
      emptyConfirmAllowedOverride,
      emptyConfirmHasShortageOverride,
    });
    if (!saveResult.ok) return;
    const allowEmptyConfirm = Boolean(saveResult?.skippedDraft);
    setConfirming(true);
    setErrorText("");
    setMessage("");
    const result = await fetchJson("/api/production-planning/subplan/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPlanNo: activeMasterPlanNo,
        departmentId: activeDepartmentId,
        allowEmptyConfirm,
      }),
    });
    setConfirming(false);
    if (!result.ok) {
      setErrorText(result.error?.message || "ไม่สามารถยืนยันแผนย่อยได้");
      return;
    }
    const confirmedPayload = result.data?.data || null;
    localDraftStateRef.current = {
      draftUrl,
      dirty: false,
    };
    setDraftLines([emptyLine(String(confirmedPayload?.periodStart || defaultDraftDate || todayDate()).slice(0, 10), activeSectionModel)]);
    setPreviewData(null);
    setPreviewMeta(null);
    await mutateDraft();
    setConfirmedResult(confirmedPayload);
    setMessage("ยืนยันแผนย่อยสำเร็จ กำลังพาไปหน้า Report...");
    if (typeof onSubplanConfirmed === "function") {
      await onSubplanConfirmed(confirmedPayload);
    }
    const redirectHref = (() => {
      const payload = confirmedPayload || {};
      const params = new URLSearchParams();
      const targetPlanNo = String(payload?.masterPlanNo || activeMasterPlanNo || "").trim().toUpperCase();
      const targetDepartmentCode = String(payload?.departmentCode || activeDepartment?.code || "").trim().toUpperCase();
      const dateFrom = String(payload?.periodStart || "").slice(0, 10);
      const dateTo = String(payload?.periodEnd || "").slice(0, 10);
      if (targetPlanNo) {
        params.set("masterPlanNo", targetPlanNo);
        params.set("reportPlanNo", targetPlanNo);
      }
      if (dateFrom) params.set("reportStartDate", dateFrom);
      if (dateTo) params.set("reportEndDate", dateTo);
      if (targetDepartmentCode) params.set("reportDepartment", targetDepartmentCode);
      const query = params.toString();
      return query ? `/production-line/planning/report?${query}` : "/production-line/planning/report";
    })();
    router.push(redirectHref);
  }, [
    activeDepartment?.code,
    activeDepartmentId,
    activeMasterPlanNo,
    activeSectionModel,
    defaultDraftDate,
    draftLines,
    draftUrl,
    ensurePreviewForEmptyConfirm,
    isConfirmedSubplanLocked,
    mutateDraft,
    onSubplanConfirmed,
    previewData,
    router,
    saveDraft,
  ]);

  const updateLine = useCallback((lineId, key, value) => {
    localDraftStateRef.current = {
      draftUrl,
      dirty: true,
    };
    setDraftLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const nextLine = { ...line, [key]: value };
        if (key === "skuCode") {
          const normalizedSku = String(value || "").trim().toUpperCase();
          const catalogMeta = wipCatalogMetaBySku.get(normalizedSku) || null;
          nextLine.skuName = wipSkuNameBySku.get(normalizedSku) || "";
          nextLine.displayFactor = catalogMeta ? toNumber(catalogMeta.factor, 1) : 0;
          nextLine.displayUnit = catalogMeta?.displayUnit || "";
          nextLine.planningUnit = catalogMeta?.planningUnit || "";
        }
        return nextLine;
      })
    );
  }, [draftUrl, wipCatalogMetaBySku, wipSkuNameBySku]);

  const handleSelectWipFromPicker = useCallback((selectedWip) => {
    if (!wipPickerLineId) return;
    updateLine(wipPickerLineId, "skuCode", selectedWip.skuCode);
    if (selectedWip.name) {
      updateLine(wipPickerLineId, "skuName", selectedWip.name);
    }
    setWipPickerLineId(null);
  }, [wipPickerLineId, updateLine]);

  const addLine = useCallback(() => {
    localDraftStateRef.current = {
      draftUrl,
      dirty: true,
    };
    const defaultShift = activeSectionShifts[0] || null;
    const newLine = emptyLine(defaultDraftDate, activeSectionModel, defaultShift);
    setDraftLines((prev) => [...prev, newLine]);
    setEditingWipIds((prev) => new Set([...prev, newLine.id]));
  }, [activeSectionModel, defaultDraftDate, draftUrl, activeSectionShifts]);

  const duplicateLine = useCallback((lineId) => {
    localDraftStateRef.current = {
      draftUrl,
      dirty: true,
    };
    setDraftLines((prev) => {
      const source = prev.find((line) => line.id === lineId);
      if (!source) return prev;
      const duplicate = {
        ...source,
        id: `${Date.now()}-${Math.random()}`,
      };
      return [...prev, duplicate];
    });
  }, [draftUrl]);

  const recalculatePreview = useCallback(async (linesToUse = draftLines) => {
    if (!activeMasterPlanNo || !activeDepartmentId) return;
    const requestDraftLines = toValidDraftRequestLines(linesToUse, activeDepartmentId);
    if (!requestDraftLines.length) {
      setPreviewData(null);
      return;
    }
    setPreviewing(true);
    try {
      const result = await fetchJson("/api/production-planning/explosion/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: activeMasterPlanNo,
          departmentId: activeDepartmentId || null,
          wipDraftLines: requestDraftLines,
          ignorePersistedDraft: true,
        }),
      });
      if (result.ok) {
        setPreviewData(result.data?.data || null);
        setPreviewMeta(result.data?.meta || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewing(false);
    }
  }, [activeDepartmentId, activeMasterPlanNo, draftLines]);

  const confirmWipLine = useCallback((lineId) => {
    const line = draftLines.find((item) => item.id === lineId);
    if (!line || !line.workDate || (!line.shiftId && !line.shiftCode) || !line.skuCode || toNumber(line.plannedQty, 0) <= 0) {
      setErrorText("กรุณาเลือกวันที่ กะ WIP และจำนวนให้ครบก่อนกดตกลง");
      return;
    }
    setEditingWipIds((prev) => {
      const next = new Set(prev);
      next.delete(lineId);
      return next;
    });
    setErrorText("");
    recalculatePreview(draftLines);
  }, [draftLines, recalculatePreview]);

  const editWipLine = useCallback((lineId) => {
    setEditingWipIds((prev) => new Set([...prev, lineId]));
  }, []);

  const removeLine = useCallback((lineId) => {
    localDraftStateRef.current = {
      draftUrl,
      dirty: true,
    };
    const nextLines = draftLines.filter((line) => line.id !== lineId);
    setDraftLines(nextLines);
    setEditingWipIds((prev) => {
      const next = new Set(prev);
      next.delete(lineId);
      return next;
    });
    recalculatePreview(nextLines);
  }, [draftLines, draftUrl, recalculatePreview]);

  const matrixColumns = useMemo(() => activeSectionDraftLines
    .filter((line) => editingWipIds.has(line.id) || (String(line.skuCode || "").trim() && toNumber(line.plannedQty, 0) > 0))
    .map((line, index) => ({
      ...line,
      planId: line.id || line.planId || `LINE-${index + 1}`,
      key: `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}|${index}`,
      lookupKey: `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}`,
    })), [activeSectionDraftLines, editingWipIds]);

  const materialRows = useMemo(() => {
    const traceLines = Array.isArray(previewData?.rawPreviewByLine) ? previewData.rawPreviewByLine : [];
    const rowMap = new Map();
    matrixColumns.forEach((column) => {
      const trace = traceLines.find((line) => String(line.planId || "") === String(column.planId || ""))
        || traceLines.find((line) => (
          `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}` === column.lookupKey
        ));
      (trace?.materials || []).forEach((material) => {
        const key = `${material.materialSkuCode}|${material.materialGoodsCode || ""}`;
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            code: material.materialGoodsCode || material.materialSkuCode,
            name: material.materialName || material.materialSkuCode,
            unit: material.unit || "unit",
            values: {},
          });
        }
        rowMap.get(key).values[column.key] = toNumber(material.requiredQty, 0);
      });
    });
    if (!rowMap.size && Array.isArray(previewData?.rawPreview)) {
      previewData.rawPreview.forEach((material) => {
        rowMap.set(`${material.materialSkuCode}|${material.materialGoodsCode || ""}`, {
          code: material.materialGoodsCode || material.materialSkuCode,
          name: material.materialName || material.materialSkuCode,
          unit: material.unit || "unit",
          values: {},
          aggregate: toNumber(material.requiredQty, 0),
        });
      });
    }
    return Array.from(rowMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  }, [matrixColumns, previewData]);

  const matrixPlannedTotal = useMemo(
    () => matrixColumns.reduce((sum, line) => sum + toNumber(line.plannedQty, 0), 0),
    [matrixColumns]
  );

  return (
    <QaDepartmentMatrixView
      activeMasterPlanNo={activeMasterPlanNo}
      selectablePlanOptions={selectablePlanOptions}
      setMasterPlanNo={setMasterPlanNo}
      departmentTabs={departmentTabs}
      activeDepartmentId={activeDepartmentId}
      activeDepartment={activeDepartment}
      setSelectedDepartmentId={setSelectedDepartmentId}
      sectionTabs={sectionTabs}
      selectedSectionId={selectedSectionId}
      setSelectedSectionId={setSelectedSectionId}
      activeSectionModel={activeSectionModel}
      activeSectionShifts={activeSectionShifts}
      previewMeta={previewMeta}
      matrixColumns={matrixColumns}
      materialRows={materialRows}
      matrixPlannedTotal={matrixPlannedTotal}
      showWipEditor={showWipEditor}
      setShowWipEditor={setShowWipEditor}
      wipPickerLineId={wipPickerLineId}
      setWipPickerLineId={setWipPickerLineId}
      handleSelectWipFromPicker={handleSelectWipFromPicker}
      draftLoading={draftLoading}
      previewing={previewing}
      saving={saving}
      confirming={confirming}
      isConfirmedSubplanLocked={isConfirmedSubplanLocked}
      confirmedSubplanMeta={confirmedSubplanMeta}
      activeSectionDraftLines={activeSectionDraftLines}
      editingWipIds={editingWipIds}
      activeSectionId={activeSectionId}
      wipSkuOptions={wipSkuOptions}
      wipSkuNameBySku={wipSkuNameBySku}
      wipDisplayMetaBySku={wipDisplayMetaBySku}
      updateLine={updateLine}
      addLine={addLine}
      duplicateLine={duplicateLine}
      confirmWipLine={confirmWipLine}
      editWipLine={editWipLine}
      removeLine={removeLine}
      saveDraft={saveDraft}
      confirmSubplan={confirmSubplan}
      regenerateSectionFromBom={regenerateSectionFromBom}
      autofillDraftFromShortage={autofillDraftFromShortage}
      message={message}
      errorText={errorText}
      confirmedResult={confirmedResult}
      fgRows={activeSectionModel?.rows || []}
    />
  );
  if (false) {
  return (
    <section id="qa-subplan-workbench" className="mb-3 overflow-hidden rounded-none border-0 bg-transparent shadow-none">
      <div className="bg-[#0b2a57] px-5 py-3 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-white/10 p-2">
              <ClipboardList className="h-5 w-5 text-[#d4af37]" />
            </div>
            <div>
              <h3 className="text-[34px] leading-none font-bold tracking-tight">งานแผนก <span className="text-[#d4af37]">·</span> วางแผนย่อย WIP</h3>
              <p className="mt-1 text-sm font-semibold text-[#d4af37]">อ้างอิงจากแผนใหญ่ (ไม่เกี่ยวกับห้องในหน้านี้)</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveDraft({})}
              disabled={!activeMasterPlanNo || !activeDepartmentId || saving || isConfirmedSubplanLocked}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/70 bg-transparent px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              บันทึกร่าง
            </button>
            <button
              type="button"
              onClick={confirmSubplan}
              disabled={!activeMasterPlanNo || !activeDepartmentId || confirming || saving || isConfirmedSubplanLocked}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d4af37]/80 bg-[#d4af37] px-4 text-sm font-bold text-[#102C57] disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {confirming || saving ? "กำลังยืนยัน..." : "ยืนยันแผนย่อย"}
            </button>
            <button
              type="button"
              onClick={runPreview}
              disabled={!activeMasterPlanNo || !activeDepartmentId || previewing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/70 bg-transparent px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              {previewing ? "กำลังรีเจน..." : "รีเจนจากแผนใหญ่"}
            </button>
          </div>
        </div>
      </div>

      <div className="px-0 pb-3">
      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <select
          value={activeMasterPlanNo}
          onChange={(e) => handleMasterPlanChange(String(e.target.value || "").trim().toUpperCase())}
          className="h-10 rounded-lg border border-[#102C57]/20 bg-white px-3 text-sm text-[#102C57]"
        >
          <option value="">เลือกเลขแผนหลัก</option>
          {selectablePlanOptions.map((plan) => (
            <option key={plan.planNo} value={plan.planNo}>
              {plan.planNo} ({plan.editable}/{plan.total} รายการที่แก้ไขได้)
            </option>
          ))}
        </select>
        <div className="flex min-h-10 items-center rounded-lg border border-[#102C57]/20 bg-[#f8fbff] px-3 text-sm text-[#102C57]">
          {departmentsLoading
            ? "กำลังโหลดสิทธิ์แผนก..."
            : (
              activeDepartment
                ? `${activeDepartment.name || activeDepartment.id}`
                : canAutoResolveDepartmentFromFg
                  ? (!activeMasterPlanNo ? (confirmedSubplansLoading ? "กำลังตรวจแผนที่ยืนยันแล้ว..." : "เลือกเลขแผนหลักก่อน") : "ยังไม่พบแผนกของ FG ในแผนหลัก")
                  : "ยังไม่พบแผนกที่ผูกไว้"
            )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(departmentTabs.length ? departmentTabs : [{ id: "current", code: activeDepartment?.code || "", name: activeDepartment?.name || "แผนก" }]).map((dept) => {
          const active = String(dept.id || "").trim() === String(activeDepartmentId || "").trim();
          const Icon = resolveDepartmentIcon(dept.name);
          return (
            <button
              type="button"
              onClick={() => {
                const nextDeptId = String(dept.id || "").trim();
                if (!nextDeptId || nextDeptId === String(activeDepartmentId || "").trim()) return;
                setSelectedDepartmentId(nextDeptId);
                resetWorkspace();
                localDraftStateRef.current = {
                  draftUrl: null,
                  dirty: false,
                };
                setDraftLines([emptyLine(todayDate(), activeSectionModel)]);
              }}
              key={dept.id || dept.code || dept.name}
              className={`inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-base font-bold ${
                active
                  ? "border-[#102C57] bg-[#102C57] text-white"
                  : "border-[#cfd8e6] bg-white text-[#102C57]"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[#d4af37]" : "text-[#102C57]"}`} />
              {dept.name}
            </button>
          );
        })}
      </div>

      {sectionTabs.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {sectionTabs.map((section) => {
            const isActive = section.id === (activeSectionModel?.id || "");
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(section.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-base font-semibold transition-colors ${
                  isActive
                    ? "border-[#102C57] bg-[#102C57] text-white"
                    : "border-[#cfd8e6] bg-white text-[#102C57]"
                }`}
              >
                {section.section?.name || "Section"}
                {isActive ? <span className="text-[#d4af37]">▾</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {errorText ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorText}</div>
      ) : null}
      {message ? (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>
      ) : null}
      {isConfirmedSubplanLocked ? (
        <div className="mt-2 rounded-lg border border-[#d4af37]/40 bg-[#fff8e1] px-3 py-2 text-xs text-[#8a6d1f]">
          แผนย่อยนี้ยืนยันแล้ว
          {confirmedSubplanMeta?.subPlanNo ? ` (${confirmedSubplanMeta.subPlanNo})` : ""}
          {confirmedSubplanMeta?.confirmedAt ? ` เมื่อ ${formatThaiSlashDate(confirmedSubplanMeta.confirmedAt)}` : ""}{" "}
          จึงไม่เปิดให้กดยืนยันซ้ำ
        </div>
      ) : null}
      {showDepartmentScopeWarning ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{departmentScopeErrorText}</div>
      ) : null}

      <div className="mt-3 space-y-3">
        <div className="space-y-3">
          <div className="rounded-xl border border-[#d7dfeb] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="inline-flex items-center gap-2 text-[34px] leading-none font-bold text-[#102C57]"><CalendarDays className="h-5 w-5" /> แผนใหญ่ของ Section นี้</h4>
              <span className="text-[11px] font-semibold text-[#102C57]">{editablePlanRows.length.toLocaleString()} รายการ</span>
            </div>
            <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="rounded-xl border border-[#cdd8ea] bg-[#fbfdff] px-3 py-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#102C57]"><ClipboardList className="h-4 w-4" /> แผนแผนหลัก</div>
                <div className="text-xl font-bold text-[#102C57]">{activeMasterPlanNo || "-"}</div>
              </div>
              <div className="rounded-xl border border-[#cdd8ea] bg-[#fbfdff] px-3 py-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#102C57]"><CalendarDays className="h-4 w-4" /> ช่วงวันที่</div>
                <div className="text-sm font-bold text-[#102C57]">{previewMeta?.planRange?.start ? `${formatThaiSlashDate(previewMeta.planRange.start)} - ${formatThaiSlashDate(previewMeta.planRange.end)}` : "-"}</div>
              </div>
              <div className="rounded-xl border border-[#cdd8ea] bg-[#fbfdff] px-3 py-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#102C57]"><Package2 className="h-4 w-4" /> FG ใน section</div>
                <div className="text-xl font-bold text-[#102C57]">{editablePlanRows.length.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-[#cdd8ea] bg-[#fbfdff] px-3 py-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#102C57]"><UserRound className="h-4 w-4" /> จำนวนคนรวม</div>
                <div className="text-xl font-bold text-[#102C57]">{editablePlanRows.reduce((sum, row) => sum + toNumber(row.lineStaffCount, 0), 0).toLocaleString()}</div>
              </div>
            </div>
            {!activeMasterPlanNo ? (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">กรุณาเลือกเลขแผนหลักก่อน</div>
            ) : activeSectionModel ? (
              <div className="overflow-hidden rounded-lg bg-white">
                <GenericScheduleTable
                  section={activeSectionModel.section || QA_FG_SECTION}
                  rows={activeSectionModel.rows}
                  days={activeSectionModel.days}
                  skuCatalog={[]}
                  readOnly
                  hideDayGroupHeader
                  headerVariant="navy"
                  onUpdate={noopScheduleAction}
                  onDelete={noopScheduleAction}
                  onAddRow={noopScheduleAction}
                />
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">ไม่พบ Section ในแผนหลักที่เลือก</div>
            )}
          </div>

          <div className="rounded-xl border border-[#d7dfeb] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="inline-flex items-center gap-2 text-[34px] leading-none font-bold text-[#102C57]"><Settings2 className="h-5 w-5" /> WIP แผนย่อย (Auto-Gen)</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addLine}
                  disabled={!activeSectionModel}
                  className="inline-flex rounded-lg border border-[#102C57]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#102C57] disabled:opacity-50"
                >
                  <Package2 className="mr-1 h-4 w-4" />
                  เพิ่มบรรทัด WIP
                </button>
                <button
                  type="button"
                  onClick={autofillDraftFromShortage}
                  disabled={!wipSummaryRows.length}
                  className="inline-flex rounded-lg border border-[#d4af37]/60 bg-[#fff8e1] px-3 py-1.5 text-xs font-semibold text-[#8a6d1f] disabled:opacity-50"
                >
                  <Package2 className="mr-1 h-4 w-4" />
                  เลือกวัตถุดิบ
                </button>
                <button
                  type="button"
                  onClick={regenerateSectionFromBom}
                  disabled={!activeMasterPlanNo || !activeDepartmentId || previewing}
                  className="inline-flex rounded-lg border border-[#102C57]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#102C57] disabled:opacity-50"
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  รีเจนจาก BOM
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-[#102C57]/20">
              <table className="w-full min-w-[820px] border-collapse text-[12px]">
                <thead className="bg-[#102C57] text-white">
                  <tr>
                    <th className="w-[140px] border border-[#0b2040] px-2 py-2 text-left font-semibold">วันที่ผลิต</th>
                    <th className="w-[155px] border border-[#0b2040] px-2 py-2 text-left font-semibold">กะ</th>
                    <th className="w-[130px] border border-[#0b2040] px-2 py-2 text-left font-semibold">รหัส WIP</th>
                    <th className="border border-[#0b2040] px-2 py-2 text-left font-semibold">ชื่อสินค้า</th>
                    <th className="w-[120px] border border-[#0b2040] px-2 py-2 text-right font-semibold">จำนวนที่วาง</th>
                    <th className="w-[120px] border border-[#0b2040] px-2 py-2 text-right font-semibold">จำนวนหน่วยจริง</th>
                    <th className="w-[100px] border border-[#0b2040] px-2 py-2 text-center font-semibold">สถานะ</th>
                    <th className="border border-[#0b2040] px-2 py-2 text-center font-semibold">หมายเหตุ</th>
                    <th className="w-[80px] border border-[#0b2040] px-2 py-2 text-center font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSectionDraftLines.map((line) => (
                    <tr key={line.id} className="odd:bg-white even:bg-slate-50/40">
                      <td className="border border-slate-300 px-2 py-2">
                        <input
                          type="date"
                          value={String(line.workDate || "").slice(0, 10)}
                          onChange={(e) => updateLine(line.id, "workDate", e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center text-sm font-semibold text-[#102C57]">
                        {activeSectionShifts.length > 0 ? (
                          <select
                            value={line.shiftId || line.shiftCode || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              const matched = activeSectionShifts.find(s => s.shiftId === val || s.shiftCode === val);
                              if (matched) {
                                updateLine(line.id, "shiftId", matched.shiftId);
                                updateLine(line.id, "shiftCode", matched.shiftCode);
                                updateLine(line.id, "shiftName", matched.shiftName);
                              } else {
                                updateLine(line.id, "shiftId", null);
                                updateLine(line.id, "shiftCode", null);
                                updateLine(line.id, "shiftName", null);
                              }
                            }}
                            className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm font-bold text-[#102C57] focus:outline-none"
                          >
                            <option value="" className="text-slate-900 bg-white">-</option>
                            {activeSectionShifts.map((s) => (
                              <option 
                                key={s.id || s.shiftId} 
                                value={s.shiftId || s.shiftCode}
                                className="text-slate-900 bg-white"
                              >
                                {s.shiftName || (s.shiftCode ? `${s.shiftCode} (${s.startTime || ""}-${s.endTime || ""})` : `${s.startTime || ""}-${s.endTime || ""}`) || "-"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm font-bold">{String(line.shiftName || line.shiftCode || "").trim() || "-"}</span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setWipPickerLineId(line.id)}
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-left font-mono text-xs hover:border-[#102C57] flex items-center justify-between gap-1 text-slate-800 shadow-sm transition-all"
                        >
                          <span className={line.skuCode ? "font-bold text-[#102C57] font-mono truncate" : "text-slate-400 font-sans font-normal"}>
                            {line.skuCode
                              ? `${line.skuCode} : ${line.skuName || wipSkuNameBySku.get(String(line.skuCode || "").trim().toUpperCase()) || ""}`
                              : "ค้นหาและเลือกรหัส WIP..."}
                          </span>
                          <Search size={13} className="text-slate-400 shrink-0" />
                        </button>
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-sm text-gray-700">
                        {String(line.skuName || "").trim()
                          || wipSkuNameBySku.get(String(line.skuCode || "").trim().toUpperCase())
                          || "-"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={line.plannedQty}
                          onChange={(e) => updateLine(line.id, "plannedQty", e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-sm font-semibold"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-right text-sm font-semibold">
                        {(() => {
                          const skuCode = String(line.skuCode || "").trim().toUpperCase();
                          const meta = wipDisplayMetaBySku.get(skuCode) || null;
                          const planningQty = toNumber(line.plannedQty, 0);
                          const lineFactor = toNumber(line.displayFactor, 0);
                          const displayFactor = lineFactor > 0 ? lineFactor : toNumber(meta?.factor, 1);
                          const displayQty = meta || lineFactor > 0
                            ? roundQty(planningQty * displayFactor)
                            : roundQty(planningQty);
                          return (
                            <>
                              <div>{displayQty.toLocaleString()}</div>
                              <div className="text-[10px] text-gray-500 font-normal">{meta?.displayUnit || "หน่วย"}</div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          พร้อมยืนยัน
                        </span>
                      </td>
                      <td className="border border-slate-300 px-2 py-2">
                        <input
                          value={String(line.remark || "")}
                          onChange={(e) => updateLine(line.id, "remark", e.target.value)}
                          placeholder="หมายเหตุ"
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!activeSectionDraftLines.length ? (
                    <tr>
                      <td colSpan={9} className="border border-slate-300 px-2 py-5 text-center text-gray-500">
                        <div>ยังไม่มีบรรทัดร่างของ Section นี้</div>
                        <button
                          type="button"
                          onClick={addLine}
                          disabled={!activeSectionModel}
                          className="mt-3 inline-flex rounded-lg border border-[#102C57]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#102C57] disabled:opacity-50"
                        >
                          <Package2 className="mr-1 h-4 w-4" />
                          เพิ่มบรรทัด WIP
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <datalist id="qa-wip-sku-options">
                {wipSkuOptions.map((row, index) => (
                  <option key={`${row.skuCode}-${index}`} value={row.skuCode}>{row.skuName}</option>
                ))}
              </datalist>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Card 1: สรุปความพร้อม WIP */}
          <div className="rounded-xl border border-[#d7dfeb] bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="inline-flex items-center gap-2 text-xl font-bold text-[#102C57]">
              <SlidersHorizontal className="h-5 w-5 text-[#d4af37]" /> สรุปความพร้อม WIP
            </h4>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-[#102C57]/15 bg-[#102C57] px-2 py-3 text-white">
                <div className="text-3xl font-extrabold text-white">{wipSummaryRows.length.toLocaleString()}</div>
                <div className="text-[10px] text-white/80 font-medium">WIP ในแผน</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-3">
                <div className="text-3xl font-extrabold text-emerald-700">{readyWipCount.toLocaleString()}</div>
                <div className="text-[10px] text-emerald-700 font-medium">พร้อมผลิต</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-3">
                <div className="text-3xl font-extrabold text-amber-700">{shortageCount.toLocaleString()}</div>
                <div className="text-[10px] text-amber-700 font-medium">คงค้าง</div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#d4af37]/40 bg-[#fff8e1] px-3 py-2 text-xs font-bold text-[#8a6d1f]">
              ปริมาณร่างที่วาง: {roundQty(totalWipDraftQty).toLocaleString()} หน่วยวางแผน
            </div>
          </div>

          {/* Card 2: สต็อก WIP ปัจจุบัน */}
          <div className="rounded-xl border border-[#d7dfeb] bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="mb-3 inline-flex items-center gap-2 text-xl font-bold text-[#102C57]">
              <Warehouse className="h-5 w-5 text-[#d4af37]" /> สต็อก WIP ปัจจุบัน
            </h4>
            <div className="max-h-[220px] overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#f8fbff] text-[#102C57] shadow-sm z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">รหัส</th>
                    <th className="px-2 py-2 text-left font-semibold">ชื่อ WIP</th>
                    <th className="px-2 py-2 text-right font-semibold">คงเหลือ</th>
                    <th className="px-2 py-2 text-right font-semibold">ต้องใช้</th>
                    <th className="px-2 py-2 text-right font-semibold">ส่วนต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {wipSummaryRows.slice(0, 8).map((row, index) => {
                    const diff = roundQty(toNumber(row?.availableQty, 0) - toNumber(row?.requiredQty, 0));
                    return (
                      <tr key={`${row.skuCode}-${index}`} className="border-t border-gray-100 hover:bg-slate-50/50">
                        <td className="px-2 py-2 font-mono text-[#102C57] font-semibold">{row.skuCode}</td>
                        <td className="px-2 py-2 text-[#102C57] truncate max-w-[100px]">{String(row?.skuName || "-").trim() || "-"}</td>
                        <td className="px-2 py-2 text-right">{roundQty(row.availableQty).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right">{roundQty(row.requiredQty).toLocaleString()}</td>
                        <td className={`px-2 py-2 text-right font-bold ${diff < 0 ? "text-red-700" : "text-emerald-700"}`}>
                          {diff.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {!wipSummaryRows.length ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-gray-500">กดคำนวณโครงสร้างเพื่อดูข้อมูล</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card 3: วัตถุดิบที่เกี่ยวข้อง (รวม) */}
          <div className="rounded-xl border border-[#d7dfeb] bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="mb-3 inline-flex items-center gap-2 text-xl font-bold text-[#102C57]">
              <Users className="h-5 w-5 text-[#d4af37]" /> วัตถุดิบที่เกี่ยวข้อง (รวม)
            </h4>
            <div className="max-h-[220px] overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#102C57] text-white shadow-sm z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">รหัส</th>
                    <th className="px-2 py-2 text-right font-semibold">ต้องใช้รวม</th>
                    <th className="px-2 py-2 text-center font-semibold">หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRawClaimRows.slice(0, 10).map((row, index) => (
                    <tr key={`${row.materialGoodsCode}-${index}`} className="border-t border-gray-100 hover:bg-slate-50/50">
                      <td className="px-2 py-2">
                        <div className="font-mono text-[#102C57] font-semibold">{row.materialGoodsCode}</div>
                        <div className="text-[11px] text-gray-600 line-clamp-2">{row.materialName || "-"}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{roundQty(row.issueQty).toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-500">{row.unit || "หน่วย"}</td>
                    </tr>
                  ))}
                  {!previewRawClaimRows.length ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-4 text-center text-gray-500">ยังไม่มีข้อมูลวัตถุดิบ</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[#d4af37]/40 bg-[#fffaf0] px-3 py-2 text-xs text-[#8a6d1f]">
        {unresolvedWarnings.length
          ? unresolvedWarnings.join(" • ")
          : "พร้อมยืนยันแผนย่อย: ไม่พบคำเตือนสำคัญ"}
      </div>

      {confirmedResult ? (
        <div className="mt-3 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2 text-xs text-[#8a6d1f]">
          <div>
            ยืนยันแผนย่อยแล้ว {confirmedResult.confirmedLines || 0} บรรทัด สำหรับ{" "}
            <span className="font-mono">{confirmedResult.subPlanNo || "-"}</span>.
          </div>
          <div className="mt-1">
            ระบบพาไปหน้า{" "}
            <Link href={reportHref} className="underline">
              Report
            </Link>{" "}
            อัตโนมัติแล้ว (ถ้าไม่ไปอัตโนมัติ กดลิงก์นี้ได้)
          </div>
        </div>
      ) : null}
      </div>
    </section>
  );
  }
}

function MatrixField({ label, children }) {
  return (
    <label className="block text-xs font-bold text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function MatrixLegend({ color, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-4 w-4 ${color}`} />{label}</span>;
}

function WipHeaderEditor({
  columns,
  editingWipIds,
  activeSectionShifts,
  isLocked,
  updateLine,
  confirmWipLine,
  removeLine,
  wipSkuOptions,
  onOpenWipPicker,
  onEditWipLine,
}) {
  return (
    <div className="overflow-x-auto border-b border-slate-300 bg-[#102C57]">
      <div className="grid min-w-[1120px] text-xs text-white" style={{ gridTemplateColumns: `10.1% 17.2% 5.6% repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr)) 12.4%` }}>
        <div className="sticky left-0 z-10 border-r border-white/30 px-3 py-2 font-bold">วัตถุดิบ</div>
        <div className="sticky left-[135px] z-10 border-r border-white/30 px-3 py-2 font-bold">รายการ</div>
        <div className="border-r border-white/30 px-2 py-2 text-center font-bold">หน่วย</div>
        {columns.map((column) => {
          const isEditing = editingWipIds.has(column.id);
          return (
            <div key={column.key} className="border-r border-white/30 px-2 py-2 text-center align-top">
              {isEditing ? (
                <div className="space-y-1 text-left">
                  <input type="date" disabled={isLocked} value={String(column.workDate || "").slice(0, 10)} onChange={(event) => updateLine(column.id, "workDate", event.target.value)} className="h-7 w-full border border-white/50 bg-white px-1 text-[11px] text-[#102C57]" />
                  <select disabled={isLocked} value={column.shiftId || column.shiftCode || ""} onChange={(event) => { const matched = activeSectionShifts.find((shift) => (shift.shiftId || shift.shiftCode) === event.target.value || shift.shiftCode === event.target.value); if (matched) { updateLine(column.id, "shiftId", matched.shiftId); updateLine(column.id, "shiftCode", matched.shiftCode); updateLine(column.id, "shiftName", matched.shiftName); } }} className="h-7 w-full border border-white/50 bg-white px-1 text-[11px] text-[#102C57]"><option value="">เลือกกะ</option>{activeSectionShifts.map((shift) => <option key={shift.id || shift.shiftId} value={shift.shiftId || shift.shiftCode}>{shift.shiftName || shift.shiftCode}</option>)}</select>
                  <button type="button" disabled={isLocked} onClick={() => onOpenWipPicker?.(column.id)} className="h-7 w-full rounded border border-white/50 bg-white px-1.5 text-left font-mono text-[11px] hover:border-[#d4af37] flex items-center justify-between gap-1 text-[#102C57]"><span className={column.skuCode ? "font-bold truncate" : "text-slate-400 font-sans font-normal"}>{column.skuCode ? `${column.skuCode} : ${column.skuName || ""}` : "ค้นหา WIP..."}</span><Search size={11} className="text-slate-400 shrink-0" /></button>
                  <input type="number" min="0" step="0.001" disabled={isLocked} value={column.plannedQty || ""} onChange={(event) => updateLine(column.id, "plannedQty", event.target.value)} placeholder="จำนวน" className="h-7 w-full border border-white/50 bg-white px-1 text-right text-[11px] text-[#102C57]" />
                  <div className="flex gap-1 pt-1"><button type="button" disabled={isLocked} onClick={() => confirmWipLine(column.id)} className="h-7 flex-1 bg-[#d4af37] px-1 text-[11px] font-extrabold text-[#102C57]">ตกลง</button><button type="button" disabled={isLocked} onClick={() => removeLine(column.id)} className="h-7 border border-white/60 px-2 text-[11px] font-bold text-white">ลบ</button></div>
                </div>
              ) : (
                <div>
                  <div className="font-bold truncate" title={column.skuName || column.skuCode}>{column.skuName || column.skuCode || "-"}</div>
                  <div className="mt-1 text-[11px] text-white/80">{formatThaiSlashDate(column.workDate).slice(0, 5)} · {column.shiftName || column.shiftCode || "-"}</div>
                  <div className="mt-1 text-[11px] text-[#d4af37]">จำนวน {toNumber(column.plannedQty, 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} {column.planningUnit || "หน่วย"}</div>
                  {!isLocked && (
                    <div className="mt-1.5 flex justify-center gap-1">
                      <button type="button" onClick={() => onEditWipLine?.(column.id)} className="h-5 px-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-semibold transition-colors">แก้ไข</button>
                      <button type="button" onClick={() => removeLine(column.id)} className="h-5 px-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded text-[10px] font-semibold transition-colors">ลบ</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="px-2 py-2 text-center font-bold">รวม</div>
      </div>
      <datalist id="qa-wip-sku-options">{wipSkuOptions.map((option) => <option key={option.skuCode} value={option.skuCode}>{option.skuName}</option>)}</datalist>
    </div>
  );
}

function QaDepartmentMatrixView({
  activeMasterPlanNo,
  selectablePlanOptions,
  setMasterPlanNo,
  departmentTabs,
  activeDepartmentId,
  activeDepartment,
  setSelectedDepartmentId,
  sectionTabs,
  selectedSectionId,
  setSelectedSectionId,
  activeSectionModel,
  activeSectionShifts,
  previewMeta,
  matrixColumns: sourceMatrixColumns,
  materialRows: sourceMaterialRows,
  matrixPlannedTotal,
  showWipEditor,
  setShowWipEditor,
  wipPickerLineId,
  setWipPickerLineId,
  handleSelectWipFromPicker,
  draftLoading,
  previewing,
  saving,
  confirming,
  isConfirmedSubplanLocked,
  confirmedSubplanMeta,
  activeSectionDraftLines,
  editingWipIds,
  wipSkuOptions,
  wipSkuNameBySku,
  wipDisplayMetaBySku,
  updateLine,
  addLine,
  duplicateLine,
  confirmWipLine,
  editWipLine,
  removeLine,
  saveDraft,
  confirmSubplan,
  regenerateSectionFromBom,
  autofillDraftFromShortage,
  message,
  errorText,
  confirmedResult,
  fgRows,
}) {
  const selectedSectionName = activeSectionModel?.section?.name || "ทุก Section";
  const [matrixDayView, setMatrixDayView] = useState(7);
  const [wipEditorMode, setWipEditorMode] = useState("add");
  const [collapsedMatrixDates, setCollapsedMatrixDates] = useState(() => new Set());
  const [matrixSearch, setMatrixSearch] = useState("");
  const groupedMatrixColumns = useMemo(() => {
    const groups = new Map();
    sourceMatrixColumns.forEach((column) => {
      const dateKey = String(column.workDate || "").slice(0, 10) || "ไม่ระบุวันที่";
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(column);
    });
    return Array.from(groups, ([date, columns]) => ({ date, columns }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, matrixDayView);
  }, [sourceMatrixColumns, matrixDayView]);
  const matrixColumns = useMemo(
    () => groupedMatrixColumns.flatMap((group) => group.columns),
    [groupedMatrixColumns]
  );
  const materialRows = useMemo(() => {
    const keyword = matrixSearch.trim().toLowerCase();
    if (!keyword) return sourceMaterialRows;
    return sourceMaterialRows.filter((row) => `${row.code} ${row.name} ${row.unit}`.toLowerCase().includes(keyword));
  }, [matrixSearch, sourceMaterialRows]);
  const totalMaterials = materialRows.length;

  return (
    <section id="qa-subplan-workbench" className="-mx-3 mb-3 w-full bg-[#f7f8fa] text-[#132238]">
      <header className="bg-[#102C57] text-white border-b-2 border-[#d4af37]">
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-xl font-extrabold tracking-tight">ตารางวัตถุดิบตามแผน WIP</h3>
          <div className="flex items-center gap-2"><button type="button" onClick={regenerateSectionFromBom} disabled={previewing || isConfirmedSubplanLocked || !activeSectionModel} className="inline-flex h-9 items-center gap-2 border border-[#d4af37] px-4 text-xs font-bold text-[#d4af37] rounded-[2px] hover:bg-white/10 disabled:opacity-40"><RefreshCw size={14} /> คำนวณ BOM</button><button type="button" onClick={() => { if (!activeSectionDraftLines.length) addLine(); setWipEditorMode("add"); setShowWipEditor(true); }} disabled={isConfirmedSubplanLocked} className="inline-flex h-9 items-center gap-2 border border-white/70 px-4 text-xs font-bold rounded-[2px] hover:bg-white/10 disabled:opacity-40"><Package2 size={14} /> เพิ่ม WIP</button></div>
        </div>
      </header>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_1.15fr_1.35fr_1.55fr_auto] items-end">
          <MatrixField label="แผนหลัก"><select value={activeMasterPlanNo} onChange={(event) => setMasterPlanNo(event.target.value)} className="h-9 w-full border border-slate-300 bg-white px-3 text-xs font-semibold"><option value="">เลือกแผนหลัก</option>{selectablePlanOptions.map((plan) => <option key={plan.planNo} value={plan.planNo}>{plan.planNo}</option>)}</select></MatrixField>
          <MatrixField label="แผนก"><div className="h-9 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">{activeDepartment?.name || "-"}</div></MatrixField>
          <MatrixField label="Section"><select value={selectedSectionId || ""} onChange={(event) => setSelectedSectionId(event.target.value)} className="h-9 w-full border border-slate-300 bg-white px-3 text-xs font-semibold"><option value="">ทุก Section</option>{sectionTabs.map((section) => <option key={section.id} value={section.id}>{section.section?.name || section.name}</option>)}</select></MatrixField>
          <MatrixField label="ช่วงวันที่"><div className="h-9 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">{previewMeta?.planRange?.start ? `${formatThaiSlashDate(previewMeta.planRange.start)} - ${formatThaiSlashDate(previewMeta.planRange.end)}` : "-"}</div></MatrixField>
          <div className="flex gap-2 xl:justify-end"><button type="button" onClick={() => saveDraft({})} disabled={saving || isConfirmedSubplanLocked} className="h-9 border border-slate-300 bg-white px-3 text-xs font-bold disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button><button type="button" onClick={confirmSubplan} disabled={confirming || saving || isConfirmedSubplanLocked} className="h-9 bg-[#d4af37] px-4 text-xs font-extrabold text-[#102C57] disabled:opacity-50">{confirming ? "กำลังยืนยัน..." : "ยืนยันแผน"}</button></div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border border-slate-300 bg-white px-4 py-3 text-xs font-bold">
          <span>WIP ที่วางแผน <strong className="ml-2 text-lg text-[#102C57]">{matrixColumns.length}</strong> รายการ</span><span className="h-6 w-px bg-slate-300" /><span>รวมปริมาณแผน <strong className="ml-2 text-lg text-[#102C57]">{matrixPlannedTotal.toLocaleString("th-TH", { maximumFractionDigits: 3 })}</strong> หน่วย</span><span className="ml-auto flex flex-wrap gap-4 font-normal text-slate-600"><MatrixLegend color="bg-[#f7cdd2]" label="มีแผน (Planned)" /><MatrixLegend color="bg-[#ef6c6c]" label="ขาดแคลน (Shortage)" /><MatrixLegend color="bg-[#b9dfc2]" label="เพียงพอ (Sufficient)" /><MatrixLegend color="border border-slate-300 bg-white" label="ไม่มีความต้องการ" /></span>
        </div>

        <div className="flex min-w-0 items-end gap-6 overflow-x-auto border-b border-slate-200"><span className="shrink-0 px-1 py-3 text-xs font-bold text-slate-600">แผนก</span>{departmentTabs.map((dept) => <button type="button" key={dept.id} onClick={() => setSelectedDepartmentId(dept.id)} className={`shrink-0 border-b-2 px-1 py-3 text-xs font-bold whitespace-nowrap ${String(dept.id) === String(activeDepartmentId) ? "border-[#d4af37] text-[#102C57]" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-[#102C57]"}`}>{dept.name || dept.code || dept.id}</button>)}</div>
        <div className="flex min-w-0 items-end gap-6 overflow-x-auto border-b border-slate-200"><span className="shrink-0 px-1 py-3 text-xs font-bold text-slate-600">Section</span>{sectionTabs.map((section) => <button type="button" key={section.id} onClick={() => setSelectedSectionId(section.id)} className={`shrink-0 border-b-2 px-1 py-3 text-xs font-bold whitespace-nowrap ${String(section.id) === String(selectedSectionId) ? "border-[#d4af37] text-[#102C57]" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-[#102C57]"}`}>{section.section?.name || section.name}</button>)}</div>

        {isConfirmedSubplanLocked && <div className="border border-[#d4af37] bg-[#fff9e6] px-4 py-3 text-xs font-bold text-[#8a6d1c]">แผนย่อยนี้ยืนยันแล้ว {confirmedSubplanMeta?.subPlanNo ? `(${confirmedSubplanMeta.subPlanNo})` : ""} จึงไม่สามารถแก้ไขได้</div>}
        {errorText && <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{errorText}</div>}
        {message && <div className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}

        <div className="border border-slate-300 bg-white [&>div.overflow-x-auto:not(.wip-modern-matrix)]:hidden">
          
          <div className="flex items-center justify-between bg-[#d4af37] px-4 py-2 text-xs font-extrabold text-[#102C57]"><span>Section: {selectedSectionName}</span><span>แผนก: {activeDepartment?.name || "-"}</span></div>
          <MatrixViewToolbar
            groups={groupedMatrixColumns}
            dayView={matrixDayView}
            setDayView={setMatrixDayView}
            search={matrixSearch}
            setSearch={setMatrixSearch}
            collapsedDates={collapsedMatrixDates}
            setCollapsedDates={setCollapsedMatrixDates}
          />
          <WipMaterialMatrix groups={groupedMatrixColumns} rows={materialRows} loading={draftLoading} collapsedDates={collapsedMatrixDates} onEditWip={() => { setWipEditorMode("edit"); setShowWipEditor(true); }} />
          <div className="hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-[#102C57]">WIP ที่วางแผนใน Section นี้</span>
              <button type="button" onClick={addLine} disabled={isConfirmedSubplanLocked} className="inline-flex h-8 items-center gap-1 border border-[#102C57] bg-white px-3 text-xs font-bold text-[#102C57] disabled:opacity-40"><Plus size={13} /> เพิ่ม WIP</button>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2">
                {activeSectionDraftLines.map((line) => (
                  <div key={line.id} className="grid w-[290px] shrink-0 grid-cols-[1fr_1fr] gap-2 border border-slate-300 bg-white p-2">
                    <input type="date" disabled={isConfirmedSubplanLocked} value={String(line.workDate || "").slice(0, 10)} onChange={(event) => updateLine(line.id, "workDate", event.target.value)} className="h-8 border border-slate-300 px-2 text-xs" />
                    <select disabled={isConfirmedSubplanLocked} value={line.shiftId || line.shiftCode || ""} onChange={(event) => { const matched = activeSectionShifts.find((shift) => (shift.shiftId || shift.shiftCode) === event.target.value || shift.shiftCode === event.target.value); if (matched) { updateLine(line.id, "shiftId", matched.shiftId); updateLine(line.id, "shiftCode", matched.shiftCode); updateLine(line.id, "shiftName", matched.shiftName); } }} className="h-8 border border-slate-300 px-2 text-xs"><option value="">เลือกกะ</option>{activeSectionShifts.map((shift) => <option key={shift.id || shift.shiftId} value={shift.shiftId || shift.shiftCode}>{shift.shiftName || shift.shiftCode}</option>)}</select>
                    <button type="button" disabled={isConfirmedSubplanLocked} onClick={() => setWipPickerLineId(line.id)} className="h-8 border border-slate-300 bg-white px-2 text-left font-mono text-xs hover:border-[#102C57] flex items-center justify-between gap-1 text-slate-800 disabled:bg-slate-100 rounded-[2px] shadow-sm transition-all"><span className={line.skuCode ? "font-bold text-[#102C57]" : "text-slate-400 font-sans font-normal"}>{line.skuCode || "ค้นหา WIP..."}</span><Search size={12} className="text-slate-400 shrink-0" /></button>
                    <input type="number" min="0" step="0.001" disabled={isConfirmedSubplanLocked} value={line.plannedQty || ""} onChange={(event) => updateLine(line.id, "plannedQty", event.target.value)} placeholder="จำนวน" className="h-8 border border-slate-300 px-2 text-right text-xs" />
                    <span className="col-span-2 truncate text-[11px] font-semibold text-slate-600">{line.skuName || wipSkuNameBySku.get(String(line.skuCode || "").trim().toUpperCase()) || "ยังไม่ได้เลือก WIP"}</span>
                    <button type="button" disabled={isConfirmedSubplanLocked} onClick={() => removeLine(line.id)} className="col-span-2 text-right text-[11px] font-bold text-red-700 disabled:opacity-30">ลบรายการนี้</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto"><table className="min-w-[1120px] w-full border-collapse text-xs"><thead><tr className="bg-[#102C57] text-white"><th rowSpan={3} className="sticky left-0 z-20 min-w-[135px] border-r border-white/30 px-3 py-2 text-left">รหัสวัตถุดิบ</th><th rowSpan={3} className="sticky left-[135px] z-20 min-w-[230px] border-r border-white/30 px-3 py-2 text-left">รายการวัตถุดิบ</th><th rowSpan={3} className="min-w-[70px] border-r border-white/30 px-2 py-2">หน่วย</th>{matrixColumns.map((column) => <th key={column.key} className="min-w-[110px] border-r border-white/30 px-2 py-2 text-center">{column.skuName || column.skuCode}</th>)}<th rowSpan={3} className="min-w-[85px] px-2 py-2">รวม</th></tr><tr className="bg-[#193d70] text-white">{matrixColumns.map((column) => <th key={`${column.key}-date`} className="border-r border-white/20 px-2 py-1 text-center">{formatThaiSlashDate(column.workDate).slice(0, 5)}</th>)}</tr><tr className="bg-[#244b7e] text-white">{matrixColumns.map((column) => <th key={`${column.key}-shift`} className="border-r border-white/20 px-2 py-1 text-center">{column.shiftName || column.shiftCode || "-"}</th>)}</tr></thead><tbody>{draftLoading ? <tr><td colSpan={matrixColumns.length + 4} className="py-12 text-center font-bold text-slate-500"><RefreshCw size={15} className="mr-2 inline animate-spin" />กำลังโหลดข้อมูล</td></tr> : !materialRows.length ? <tr><td colSpan={matrixColumns.length + 4} className="py-12 text-center font-bold text-slate-500">ยังไม่มีข้อมูลวัตถุดิบสำหรับ Section และ WIP ที่เลือก</td></tr> : materialRows.map((row) => { const total = matrixColumns.reduce((sum, column) => sum + toNumber(row.values[column.key], 0), 0) || toNumber(row.aggregate, 0); return <tr key={row.code} className="border-b border-slate-200"><td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-mono font-bold">{row.code}</td><td className="sticky left-[135px] z-10 border-r border-slate-200 bg-white px-3 py-2 font-semibold">{row.name}</td><td className="border-r border-slate-200 px-2 py-2 text-center">{row.unit}</td>{matrixColumns.map((column) => <td key={column.key} className={`border-r border-slate-200 px-2 py-2 text-center tabular-nums ${row.values[column.key] ? "bg-[#f7cdd2] font-bold" : "text-slate-400"}`}>{row.values[column.key] ? toNumber(row.values[column.key], 0).toLocaleString("th-TH", { maximumFractionDigits: 4 }) : "-"}</td>)}<td className="bg-[#e6f0ff] px-2 py-2 text-center font-extrabold">{total.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td></tr>; })}{materialRows.length > 0 && <tr className="bg-[#d4af37] font-extrabold text-[#102C57]"><td colSpan={3} className="px-3 py-2 text-right">รวม</td>{matrixColumns.map((column) => <td key={`total-${column.key}`} className="border-r border-[#b6911e] px-2 py-2 text-center">{materialRows.reduce((sum, row) => sum + toNumber(row.values[column.key], 0), 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td>)}<td className="px-2 py-2 text-center">{materialRows.reduce((sum, row) => sum + matrixColumns.reduce((columnSum, column) => columnSum + toNumber(row.values[column.key], 0), 0), 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td></tr>}</tbody></table></div>
        </div>

        <footer className="flex flex-wrap items-center gap-5 border border-slate-300 bg-white px-4 py-3 text-xs font-bold"><span className="text-[#102C57]">{activeDepartment?.name || "-"} / Section {selectedSectionName}</span><span className="h-5 w-px bg-slate-300" /><span>วัตถุดิบ {totalMaterials} รายการ</span><span className="h-5 w-px bg-slate-300" /><span>สถานะ: <span className="text-emerald-700">{previewing ? "กำลังคำนวณ" : "พร้อมคำนวณ"}</span></span></footer>
        <div className="border border-[#d4af37] bg-[#fff9e6] px-4 py-2 text-xs font-semibold text-[#8a6d1c]">ยอดวัตถุดิบคำนวณจาก BOM ของ WIP ตามจำนวนที่วางแผนใน Section และกะที่เลือก</div>
      </div>

      {showWipEditor && (
        <BulkWipEditorModal
          mode={wipEditorMode}
          lines={activeSectionDraftLines}
          shifts={activeSectionShifts}
          sectionName={selectedSectionName}
          locked={isConfirmedSubplanLocked}
          saving={saving}
          updateLine={updateLine}
          addLine={addLine}
          duplicateLine={duplicateLine}
          removeLine={removeLine}
          onOpenPicker={setWipPickerLineId}
          onClose={() => setShowWipEditor(false)}
          onSave={async () => { await saveDraft({}); setShowWipEditor(false); }}
        />
      )}

      {wipPickerLineId && (
        <WipPickerModal
          activeDeptId={activeDepartmentId || activeDepartment?.id || ""}
          activeDeptName={activeDepartment?.name}
          onSelect={handleSelectWipFromPicker}
          onClose={() => setWipPickerLineId(null)}
        />
      )}
    </section>
  );
}

function WipMaterialMatrix({ groups, rows, loading, collapsedDates, onEditWip }) {
  const displayGroups = groups.map((group) => {
    if (!collapsedDates.has(group.date)) return group;
    return {
      ...group,
      columns: [{
        key: `summary-${group.date}`,
        skuCode: `รวม ${group.columns.length} WIP`,
        skuName: "สรุปประจำวัน",
        shiftName: "ทุกกะ",
        plannedQty: group.columns.reduce((sum, column) => sum + toNumber(column.plannedQty, 0), 0),
        planningUnit: "หน่วย",
        sourceColumns: group.columns,
      }],
    };
  });
  const columns = displayGroups.flatMap((group) => group.columns);
  const cellValue = (row, column) => {
    if (column.sourceColumns) {
      return column.sourceColumns.reduce((sum, source) => sum + toNumber(row.values[source.key], 0), 0);
    }
    return toNumber(row.values[column.key], 0);
  };

  return (
    <div className="wip-modern-matrix max-w-full overflow-x-auto border-t border-slate-300 bg-white pb-3">
      <table className="w-max min-w-full border-collapse text-[11px] text-[#102C57]">
        <thead className="bg-[#102C57] text-white">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-30 w-[135px] min-w-[135px] border-r border-white/25 bg-[#102C57] px-3 py-3 text-left">วัตถุดิบ</th>
            <th rowSpan={2} className="sticky left-[135px] z-30 w-[230px] min-w-[230px] border-r border-white/25 bg-[#102C57] px-3 py-3 text-left">รายการ</th>
            <th rowSpan={2} className="sticky left-[365px] z-30 w-[70px] min-w-[70px] border-r border-white/25 bg-[#102C57] px-2 py-3 text-center">หน่วย</th>
            {displayGroups.map((group) => <th key={group.date} colSpan={group.columns.length} className="border-r border-b border-white/30 px-3 py-2 text-center text-xs font-extrabold">{formatThaiSlashDate(group.date)} <span className="ml-1 text-white/70">⌄</span></th>)}
            <th rowSpan={2} className="sticky right-0 z-30 w-[85px] min-w-[85px] bg-[#102C57] px-2 py-3 text-center">รวม</th>
          </tr>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="w-[110px] min-w-[110px] max-w-[110px] border-r border-white/25 bg-[#173b6b] px-2 py-2 text-center align-top">
                <div className="truncate font-mono font-extrabold" title={column.skuName || column.skuCode}>{column.skuCode || "-"}</div>
                <div className="mt-1 line-clamp-2 min-h-7 text-[10px] font-semibold leading-tight text-white" title={column.skuName || ""}>{column.skuName || "ไม่ระบุชื่อ WIP"}</div>
                <div className="mt-1 truncate text-[10px] font-semibold text-white/85">{column.shiftName || column.shiftCode || "-"} · {toNumber(column.plannedQty, 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} {column.planningUnit || "หน่วย"}</div>
                <button type="button" onClick={() => onEditWip(column.id)} aria-label={`แก้ไข WIP ${column.skuCode || ""}`} className="mt-1 w-full rounded py-1 text-base leading-none tracking-[3px] text-white/80 transition-colors hover:bg-white/15 hover:text-white">•••</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={columns.length + 4} className="py-14 text-center font-bold text-slate-500"><RefreshCw size={16} className="mr-2 inline animate-spin" />กำลังโหลดข้อมูล</td></tr> : null}
          {!loading && !rows.length ? <tr><td colSpan={columns.length + 4} className="py-14 text-center font-bold text-slate-500">ยังไม่มีข้อมูลวัตถุดิบสำหรับ Section และ WIP ที่เลือก</td></tr> : null}
          {!loading && rows.map((row) => {
            const total = columns.reduce((sum, column) => sum + cellValue(row, column), 0) || toNumber(row.aggregate, 0);
            return (
              <tr key={`${row.code}-${row.unit}`} className="border-b border-slate-200">
                <td className="sticky left-0 z-20 border-r border-slate-200 bg-white px-3 py-2 font-mono font-extrabold">{row.code}</td>
                <td className="sticky left-[135px] z-20 border-r border-slate-200 bg-white px-3 py-2 font-semibold leading-tight">{row.name}</td>
                <td className="sticky left-[365px] z-20 border-r border-slate-200 bg-white px-2 py-2 text-center font-semibold">{row.unit}</td>
                {columns.map((column) => { const value = cellValue(row, column); return <td key={column.key} className={`border-r border-slate-200 px-2 py-2 text-center font-bold tabular-nums ${value ? "bg-[#f9e6e8]" : "text-slate-400"}`}>{value ? value.toLocaleString("th-TH", { maximumFractionDigits: 4 }) : "-"}</td>; })}
                <td className="sticky right-0 z-20 bg-[#e8f1ff] px-2 py-2 text-center font-extrabold">{total.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixViewToolbar({ groups, dayView, setDayView, search, setSearch, collapsedDates, setCollapsedDates }) {
  const allDates = groups.map((group) => group.date);
  const dayOptions = [{ days: 1, label: "1 วัน" }, { days: 3, label: "3 วัน" }, { days: 7, label: "7 วัน" }];
  const rangeLabel = groups.length
    ? `${formatThaiSlashDate(groups[0].date)} – ${formatThaiSlashDate(groups[groups.length - 1].date)}`
    : "ยังไม่มีช่วงวันที่";

  return (
    <div className="border-b border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-9 min-w-[250px] items-center gap-3 rounded border border-slate-300 px-3 text-xs font-bold text-[#102C57]">
          <CalendarDays size={16} /> {rangeLabel}
        </div>
        <div className="inline-flex h-9 overflow-hidden rounded border border-slate-300">
          {dayOptions.map((option) => (
            <button key={option.days} type="button" onClick={() => setDayView(option.days)} className={`min-w-20 border-r border-slate-200 px-4 text-xs font-bold last:border-r-0 ${dayView === option.days ? "bg-[#102C57] text-white" : "bg-white text-[#102C57]"}`}>{option.label}</button>
          ))}
        </div>
        <label className="flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded border border-slate-300 px-3 text-slate-500">
          <Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหา วัตถุดิบ, รายการ, หน่วย..." className="w-full bg-transparent text-xs outline-none" />
        </label>
        <button type="button" onClick={() => setCollapsedDates(new Set())} className="h-9 rounded bg-[#102C57] px-4 text-xs font-bold text-white">เปิดทั้งหมด</button>
        <button type="button" onClick={() => setCollapsedDates(new Set(allDates))} className="h-9 rounded border border-slate-300 bg-white px-4 text-xs font-bold text-[#102C57]">ยุบทั้งหมด</button>
      </div>
      <div className="mt-3 flex overflow-x-auto rounded border border-slate-200 bg-slate-50">
        {groups.map((group) => {
          const collapsed = collapsedDates.has(group.date);
          return (
            <button key={group.date} type="button" onClick={() => setCollapsedDates((current) => { const next = new Set(current); if (next.has(group.date)) next.delete(group.date); else next.add(group.date); return next; })} className="min-w-[180px] flex-1 border-r border-slate-200 px-4 py-2 text-center text-xs font-bold text-[#102C57] last:border-r-0">
              {formatThaiSlashDate(group.date).slice(0, 5)} · {group.columns.length} WIP {collapsed ? "＋" : "⌄"}
            </button>
          );
        })}
      </div>
      <table className="hidden"><thead><tr>{groups.map((group) => <th key={group.date} colSpan={group.columns.length}>{group.date}</th>)}</tr></thead></table>
    </div>
  );
}

function BulkWipEditorModal({ mode, lines, shifts, sectionName, locked, saving, updateLine, addLine, duplicateLine, removeLine, onOpenPicker, onClose, onSave }) {
  const [bulkDate, setBulkDate] = useState("");
  const [bulkShift, setBulkShift] = useState("");
  const validCount = lines.filter((line) => line.workDate && line.skuCode && toNumber(line.plannedQty, 0) > 0).length;
  const invalidCount = lines.length - validCount;

  const applyDate = (value) => {
    setBulkDate(value);
    if (value) lines.forEach((line) => updateLine(line.id, "workDate", value));
  };
  const applyShift = (value) => {
    setBulkShift(value);
    const matched = shifts.find((shift) => (shift.shiftId || shift.shiftCode) === value);
    if (!matched) return;
    lines.forEach((line) => {
      updateLine(line.id, "shiftId", matched.shiftId);
      updateLine(line.id, "shiftCode", matched.shiftCode);
      updateLine(line.id, "shiftName", matched.shiftName);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="flex max-h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-sm border border-slate-400 bg-white shadow-2xl">
        <header className="flex items-start justify-between bg-gradient-to-r from-[#102C57] to-[#173f78] px-7 py-5 text-white">
          <div><h3 className="text-2xl font-extrabold">{mode === "edit" ? "แก้ไข WIP หลายรายการ" : "เพิ่ม WIP หลายรายการ"}</h3><p className="mt-1 text-xs font-semibold text-white/80">ระบุวันที่ กะ สินค้า WIP และจำนวน แล้วบันทึกพร้อมกัน</p></div>
          <button type="button" onClick={onClose} className="p-1 text-white"><X size={24} /></button>
        </header>
        <div className="flex flex-wrap gap-5 border-b border-slate-200 px-7 py-5">
          <label className="grid min-w-[320px] grid-cols-[180px_1fr] border border-slate-300"><span className="px-4 py-3 text-xs font-bold text-[#102C57]">กำหนดวันที่ทั้งหมด</span><input type="date" value={bulkDate} onChange={(event) => applyDate(event.target.value)} className="border-l border-slate-300 px-3 text-xs" /></label>
          <label className="grid min-w-[320px] grid-cols-[170px_1fr] border border-slate-300"><span className="px-4 py-3 text-xs font-bold text-[#102C57]">กำหนดกะทั้งหมด</span><select value={bulkShift} onChange={(event) => applyShift(event.target.value)} className="border-l border-slate-300 px-3 text-xs"><option value="">เลือกกะ</option>{shifts.map((shift) => <option key={shift.id || shift.shiftId} value={shift.shiftId || shift.shiftCode}>{shift.shiftName || shift.shiftCode}</option>)}</select></label>
          <div className="grid min-w-[320px] grid-cols-[190px_1fr] border border-slate-300"><span className="px-4 py-3 text-xs font-bold text-[#102C57]">กำหนด Section ทั้งหมด</span><span className="border-l border-slate-300 px-3 py-3 text-xs font-semibold">{sectionName}</span></div>
          <button type="button" onClick={addLine} className="ml-auto bg-[#102C57] px-5 py-3 text-xs font-bold text-white"><Plus size={15} className="mr-2 inline" />เลือก WIP หลายรายการ</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-7 py-4">
          <table className="w-full min-w-[1050px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#102C57] text-white"><tr><th className="w-14 px-3 py-3">ลำดับ</th><th className="px-3 py-3 text-left">วันที่</th><th className="px-3 py-3 text-left">กะ</th><th className="px-3 py-3 text-left">สินค้า WIP</th><th className="px-3 py-3 text-right">จำนวน</th><th className="px-3 py-3">หน่วย</th><th className="px-3 py-3">Section</th><th className="w-28 px-3 py-3">จัดการ</th></tr></thead>
            <tbody>{lines.map((line, index) => <tr key={line.id} className="border-b border-slate-200 even:bg-slate-50"><td className="px-3 py-3 text-center font-bold">{index + 1}</td><td className="px-3 py-3"><input type="date" disabled={locked} value={String(line.workDate || "").slice(0, 10)} onChange={(event) => updateLine(line.id, "workDate", event.target.value)} className="h-10 w-full border border-slate-300 px-3" /></td><td className="px-3 py-3"><select disabled={locked} value={line.shiftId || line.shiftCode || ""} onChange={(event) => { const matched = shifts.find((shift) => (shift.shiftId || shift.shiftCode) === event.target.value); if (matched) { updateLine(line.id, "shiftId", matched.shiftId); updateLine(line.id, "shiftCode", matched.shiftCode); updateLine(line.id, "shiftName", matched.shiftName); } }} className="h-10 w-full border border-slate-300 px-3"><option value="">เลือกกะ</option>{shifts.map((shift) => <option key={shift.id || shift.shiftId} value={shift.shiftId || shift.shiftCode}>{shift.shiftName || shift.shiftCode}</option>)}</select></td><td className="px-3 py-3"><button type="button" onClick={() => onOpenPicker(line.id)} className={`flex h-10 w-full min-w-[310px] items-center justify-between border px-3 text-left ${line.skuCode ? "border-slate-300 text-[#102C57]" : "border-red-400 text-slate-400"}`}><span className="truncate font-bold">{line.skuCode ? `${line.skuCode}  ${line.skuName || ""}` : "เลือกสินค้า WIP"}</span><Search size={15} /></button></td><td className="px-3 py-3"><input type="number" min="0" step="0.001" disabled={locked} value={line.plannedQty || ""} onChange={(event) => updateLine(line.id, "plannedQty", event.target.value)} placeholder="ระบุจำนวน" className="h-10 w-full border border-slate-300 px-3 text-right" /></td><td className="px-3 py-3 text-center font-semibold">{line.planningUnit || "หน่วย"}</td><td className="px-3 py-3 text-center font-semibold">{sectionName}</td><td className="px-3 py-3 text-center"><button type="button" onClick={() => duplicateLine(line.id)} className="px-2 text-[#102C57]">คัดลอก</button><button type="button" disabled={locked} onClick={() => removeLine(line.id)} className="px-2 font-bold text-red-600">ลบ</button></td></tr>)}</tbody>
          </table>
          <button type="button" onClick={addLine} className="mt-3 h-11 w-full border border-dashed border-[#102C57] text-xs font-bold text-[#102C57]"><Plus size={15} className="mr-2 inline" />เพิ่มรายการ</button>
        </div>
        <footer className="flex items-center border-t border-slate-200 bg-slate-50 px-7 py-4"><div className="text-sm font-bold text-[#102C57]">{lines.length} รายการ <span className="mx-2">•</span> <span className="text-emerald-700">กรอกครบ {validCount}</span> <span className="mx-2">•</span> <span className="text-red-600">ต้องตรวจสอบ {invalidCount}</span></div><div className="ml-auto flex gap-4"><button type="button" onClick={onClose} className="h-11 min-w-36 border border-[#102C57] px-5 text-xs font-bold text-[#102C57]">ยกเลิก</button><button type="button" onClick={onSave} disabled={saving || invalidCount > 0 || !lines.length} className="h-11 min-w-64 bg-[#d4af37] px-6 text-xs font-extrabold text-[#102C57] disabled:opacity-40">{saving ? "กำลังบันทึก..." : `บันทึก WIP ${lines.length} รายการ`}</button></div></footer>
      </div>
    </div>
  );
}

function WipPickerModal({ activeDeptId, activeDeptName, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const { data, error, isLoading } = useSWR(
    activeDeptId ? `/api/production-planning/wip-options?departmentId=${activeDeptId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const wipList = useMemo(() => data?.data || [], [data]);
  const meta = data?.meta;

  const filteredList = useMemo(() => {
    if (!search.trim()) return wipList;
    const q = search.trim().toLowerCase();
    return wipList.filter((item) => {
      const codeMatch = (item.skuCode || "").toLowerCase().includes(q);
      const nameMatch = (item.name || "").toLowerCase().includes(q);
      const fgMatch = (item.fgSkus || []).some((fg) => fg.toLowerCase().includes(q));
      return codeMatch || nameMatch || fgMatch;
    });
  }, [wipList, search]);

  return (
    <div className="fixed inset-0 z-[60] bg-[#102C57]/60 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center animate-in fade-in duration-150">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#102C57] px-5 py-3.5 text-white">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Boxes size={18} className="text-[#d4af37]" />
              เลือก WIP สำหรับ {activeDeptName || "แผนกปัจจุบัน"}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              แสดงเฉพาะ WIP ที่เชื่อมโยงกับ FG ของแผนกผ่าน BOM (ผูกกับ FG {meta?.fgCount || 0} รายการ)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Stats */}
        <div className="border-b border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              placeholder="ค้นหารหัส WIP, ชื่อ WIP หรือรหัส FG..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-xs focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium self-end sm:self-center">
            พบ {filteredList.length} รายการจากทั้งหมด {wipList.length} WIP
          </div>
        </div>

        {/* Content list */}
        <div className="overflow-auto p-4 flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
              <RefreshCw size={24} className="animate-spin text-[#102C57]" />
              <span className="text-xs font-semibold">กำลังโหลดรายการ WIP ของแผนก...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-xs text-red-600 font-semibold">
              เกิดข้อผิดพลาดในการโหลดข้อมูล: {error.message || "กรุณาลองใหม่อีกครั้ง"}
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium">
              {search ? "ไม่พบรายการ WIP ที่ตรงกับการค้นหา" : "ไม่มีรายการ WIP ที่ผูกกับ FG ของแผนกนี้ในระบบ"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredList.map((item) => (
                <button
                  key={item.skuCode}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition-all hover:border-[#102C57] hover:bg-slate-50 hover:shadow-sm focus:outline-none"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#102C57] group-hover:underline">
                        {item.skuCode}
                      </span>
                      {item.unit && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          หน่วย: {item.unit}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 mt-1 truncate">
                      {item.name || "-"}
                    </div>
                  </div>

                  {/* FG references */}
                  {item.fgSkus && item.fgSkus.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 sm:max-w-xs justify-start sm:justify-end">
                      <span className="text-[10px] text-slate-400 font-medium">ใช้สำหรับ FG:</span>
                      {item.fgSkus.slice(0, 3).map((fg) => (
                        <span
                          key={fg}
                          className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-mono text-blue-700"
                        >
                          {fg}
                        </span>
                      ))}
                      {item.fgSkus.length > 3 && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          +{item.fgSkus.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
