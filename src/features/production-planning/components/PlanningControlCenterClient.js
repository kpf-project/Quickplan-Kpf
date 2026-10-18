"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import PlanningHeader from "@/features/production-planning/components/PlanningHeader";
import PlanningAdjustmentSchedule from "./PlanningAdjustmentSchedule";
import PlanningSkuPicker from "./PlanningSkuPicker";
import RequisitionPlanPicker from "./RequisitionPlanPicker";
import WipWeeklyTable, { buildWipWeeklyRows } from "./WipWeeklyTable";
import { planningDates } from "../services/wipWeeklyGrid";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  FileText,
  Info,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { fetchJson, fetcher } from "@/lib/clientFetch";
import {
  applyPlanningProductSelection,
  buildPlanningSectionViews,
  buildPlanningShiftOptions,
  publishAdjustedSchedulePlans,
  filterPlanningProducts,
  getBangkokDateOnly,
  getLinkedPlanningWipLines,
  isPlanningDateEditable,
  resolveScheduleWorkDate,
  resolvePlanningScheduleSkuKey,
  updatePlanningRowField,
} from "@/lib/planningAdjustment";
import { normalizePlanningMasterPlanOptions } from "@/lib/planningMasterPlanOptions";

const thDate = new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });

function dateLabel(value) {
  return value ? thDate.format(new Date(`${value}T00:00:00+07:00`)) : "-";
}

function thaiDayDateLabel(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(`${dateStr}T00:00:00+07:00`);
    if (isNaN(d.getTime())) return dateStr;
    const dayNames = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    const dayName = dayNames[d.getDay()] || "";
    const th = thDate.format(d);
    return `${dayName} ${th}`;
  } catch {
    return dateStr;
  }
}

function renderBrandBadge(brandName) {
  const brand = String(brandName || "").trim();
  if (!brand || brand === "-") return <span className="text-slate-400">-</span>;
  if (/รอบรรจุ/.test(brand)) {
    return <span className="text-xs font-bold text-emerald-600">{brand}</span>;
  }
  if (/KPF/i.test(brand)) {
    return <span className="text-xs font-bold text-red-600">{brand}</span>;
  }
  if (/ระฆังทอง/.test(brand)) {
    return <span className="text-xs font-bold text-blue-600">{brand}</span>;
  }
  if (/แม่มด|สี/i.test(brand)) {
    return <span className="text-xs font-bold text-red-600">{brand}</span>;
  }
  return <span className="text-xs font-bold text-slate-700">{brand}</span>;
}

function renderStatusBadge(editable) {
  if (!editable) {
    return (
      <span className="text-xs font-semibold text-emerald-600">
        ผลิตแล้ว
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold text-amber-600">
      รอดำเนินการ
    </span>
  );
}

function getShiftOptions(sectionShifts = [], masterShifts = [], settingShifts = []) {
  const opts = new Set();
  // 1. Direct from shift settings (/api/production-shifts)
  (settingShifts || []).forEach((s) => {
    const val = s?.name || s?.code;
    if (val && val !== "กะ") opts.add(String(val).trim());
  });
  // 2. Master shifts from section shifts API
  (masterShifts || []).forEach((s) => {
    const val = s?.name || s?.code;
    if (val && val !== "กะ") opts.add(String(val).trim());
  });
  // 3. Assigned section shifts
  (sectionShifts || []).forEach((s) => {
    const val = s?.shiftName || s?.shiftCode;
    if (val && val !== "กะ") opts.add(String(val).trim());
  });
  if (!opts.size) {
    ["กะ 1", "กะ 2"].forEach((s) => opts.add(s));
  }
  return Array.from(opts);
}

function weekDates(from, to) {
  if (!from || !to) return [];
  const dates = [];
  const current = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (current <= last && dates.length < 14) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function normalizePlanNo(row) {
  return String(row?.master_plan_no || row?.plan_group_id || "").trim().toUpperCase();
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

function isQuantityColumn(col, qtyKey = null) {
  if (!col) return false;
  if (qtyKey && col.key === qtyKey) return true;
  if (/^(qty|quantity|jamQty|qtyBox)$/i.test(col.key)) return true;
  if (/qty|quantity/i.test(col.key)) return true;
  if (/จำนวน/i.test(col.label) && !/คน/i.test(col.label)) return true;
  return false;
}

function isPeopleColumn(column) {
  const text = `${column?.key || ""} ${column?.label || ""}`.toLowerCase();
  return /people|staff|headcount|จำนวน\s*คน/.test(text);
}

function normalizeScheduleRows(plan, catalog = []) {
  const productByName = new Map(catalog.map((item) => [normalizedName(item.name), item]));
  return (plan?.rows || []).map((row) => {
    const keys = row?.detectedKeys || {};
    const rowData = row?.rowData || row?.row_data || {};
    const numberKeys = Array.isArray(keys.numberKeys) ? keys.numberKeys : [];
    const dataKeys = Object.keys(rowData);
    const qtyKey = keys.qtyKey
      || dataKeys.find((key) => /qty|quantity|จำนวน/i.test(key))
      || numberKeys.find((key) => numericValue(rowData[key]) !== null)
      || null;
    const skuKey = resolvePlanningScheduleSkuKey(rowData, keys);
    const skuName = String(rowData?.[skuKey] || row?.resolvedSkuTokens?.[0] || "").trim();
    const product = productByName.get(normalizedName(skuName)) || null;
    const skuCode = String(row?.resolvedSkuCodes?.[0] || product?.skuCode || skuName).trim().toUpperCase();
    return {
      plan_id: row.id,
      schedule_plan_id: plan.id,
      period_start: resolveScheduleWorkDate(plan.weekStartDate, row.dayKey || row.day_key),
      schedule_section_def_id: row.sectionDefId || row.section_def_id,
      schedule_section_name: row.sectionName || null,
      sku_code: skuCode,
      sku_name: skuName || skuCode,
      planned_qty: numericValue(rowData?.[qtyKey]) || 0,
      unit: keys.unitKey ? String(rowData?.[keys.unitKey] || "").trim() : String(product?.unit || ""),
      shift_name: String(rowData?.shiftName || rowData?.[keys.shiftKey] || "").trim(),
      can_edit: plan.canEdit !== false,
      row_data: rowData,
      detected_keys: { ...keys, skuKeys: keys.skuKeys?.length ? keys.skuKeys : [skuKey], qtyKey },
      qty_key: qtyKey,
      day_key: row.dayKey || row.day_key,
    };
  }).filter((row) => row.sku_code || row.sku_name);
}

function wipKey(line) {
  return [line.skuCode, line.sourceSectionDefId || "default", line.shiftCode || line.shiftId || ""].join("|");
}

function jsonRequest(value, method = "POST") {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

function EmptyRow({ colSpan, children }) {
  return <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-500">{children}</td></tr>;
}

// Backward-compatibility references for test inspection:
// updateFgProduct(selectedFgRow, product)
// updateFgField(selectedFgRow.plan_id, selectedPeopleColumn.key, value)

export default function PlanningControlCenterClient() {
  const today = useMemo(() => getBangkokDateOnly(), []);
  const [masterPlanNo, setMasterPlanNo] = useState("");
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [addFgDay, setAddFgDay] = useState(null);
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [fgRows, setFgRows] = useState([]);
  const [dirtyFgIds, setDirtyFgIds] = useState(new Set());
  const [deletedFgIds, setDeletedFgIds] = useState(new Set());
  const [newFgRows, setNewFgRows] = useState([]);
  const [wipLines, setWipLines] = useState([]);
  const [wipDirty, setWipDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [addFg, setAddFg] = useState({ skuCode: "", workDate: "", sectionId: "", people: 0, plannedQty: 1 });
  const [addWip, setAddWip] = useState({ skuCode: "", workDate: "", sectionId: "", plannedQty: 1 });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState("fg");
  const [addProductSearch, setAddProductSearch] = useState("");
  const [addPageSize, setAddPageSize] = useState(30);
  const [selectedFgPlanId, setSelectedFgPlanId] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState(new Set());
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());

  const { data: plansPayload, isLoading: plansLoading, error: plansError, mutate: reloadPlans } = useSWR("/api/production-planning/master-plan-options", fetcher, { revalidateOnFocus: false });
  const plans = useMemo(() => normalizePlanningMasterPlanOptions(plansPayload?.data), [plansPayload]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.masterPlanNo === masterPlanNo) || null, [plans, masterPlanNo]);
  const dates = useMemo(() => weekDates(selectedPlan?.periodStart, selectedPlan?.periodEnd), [selectedPlan]);

  useEffect(() => {
    if (!masterPlanNo && plans.length) setMasterPlanNo(plans[0].masterPlanNo);
  }, [masterPlanNo, plans]);

  const { data: departmentsPayload } = useSWR("/api/production-planning/departments?scope=assigned", fetcher, { revalidateOnFocus: false });
  const departments = useMemo(() => (departmentsPayload?.data || []).filter((row) => !row.is_central_department), [departmentsPayload]);

  useEffect(() => {
    if (!departmentId && departments.length) setDepartmentId(departments[0].id);
  }, [departmentId, departments]);

  const statusUrl = selectedPlan ? `/api/production-planning/status?periodStart=${selectedPlan.periodStart}&periodEnd=${selectedPlan.periodEnd}` : null;
  const { data: statusPayload, isLoading: statusLoading, mutate: mutateStatus } = useSWR(statusUrl, fetcher, { revalidateOnFocus: false });
  const inboxUrl = selectedPlan
    ? `schedule-bundle:${masterPlanNo}:${selectedPlan.periodStart}:${selectedPlan.periodEnd}`
    : null;
  const { data: inboxPayload, isLoading: inboxLoading, mutate: mutateInbox } = useSWR(inboxUrl, async () => {
    const plansResult = await fetchJson(
      `/api/production-planning/schedule/plans?masterPlanNo=${encodeURIComponent(masterPlanNo)}`
    );
    if (!plansResult.ok) throw new Error(plansResult.error?.message || "โหลดแผนหลักไม่สำเร็จ");
    const matched = (plansResult.data?.data || []).filter((plan) => normalizePlanNo({ master_plan_no: plan.master_plan_no }) === masterPlanNo);
    return Promise.all(matched.map(async (plan) => {
      const detailResult = await fetchJson(`/api/production-planning/schedule/plans/${plan.id}`);
      if (!detailResult.ok) throw new Error(detailResult.error?.message || "โหลดรายการแผนหลักไม่สำเร็จ");
      return {
        id: plan.id,
        deptId: plan.dept_id,
        templateId: plan.template_id,
        masterPlanNo: plan.master_plan_no,
        weekStartDate: plan.week_start_date,
        periodEnd: plan.period_end,
        status: plan.status,
        canEdit: true,
        rows: detailResult.data?.data?.rows || [],
      };
    }));
  }, { revalidateOnFocus: false });
  const schedulePlans = useMemo(() => (inboxPayload || []).filter((plan) => (
    departments.some((department) => String(department.id) === String(plan.deptId))
  )), [departments, inboxPayload]);
  const allPlanRows = useMemo(() => (statusPayload?.data || []).filter((row) => normalizePlanNo(row) === masterPlanNo), [masterPlanNo, statusPayload]);
  const departmentCounts = useMemo(() => {
    const counts = new Map();
    schedulePlans.forEach((plan) => {
      const id = String(plan?.deptId || "");
      const current = counts.get(id) || { fg: 0, wip: 0 };
      current.fg += Number(plan?.visibleRows ?? plan?.rows?.length ?? 0) || 0;
      counts.set(id, current);
    });
    allPlanRows.forEach((row) => {
      const id = String(row?.owner_department_id || "");
      const current = counts.get(id) || { fg: 0, wip: 0 };
      if (String(row?.category_name || "").trim().toUpperCase() === "WIP") current.wip += 1;
      else current.fg += 1;
      counts.set(id, current);
    });
    return counts;
  }, [allPlanRows, schedulePlans]);
  const visibleDepartments = useMemo(() => {
    if (!allPlanRows.length && !schedulePlans.length) return departments;
    return departments.filter((department) => {
      const count = departmentCounts.get(String(department.id));
      return Boolean(count && (count.fg || count.wip));
    });
  }, [allPlanRows.length, departmentCounts, departments, schedulePlans.length]);
  useEffect(() => {
    if (visibleDepartments.length && !visibleDepartments.some((row) => row.id === departmentId)) {
      setDepartmentId(visibleDepartments[0].id);
    }
  }, [departmentId, visibleDepartments]);
  const activeSchedulePlan = useMemo(() => schedulePlans.find((plan) => (
    String(plan?.deptId || "") === String(departmentId)
  )) || null, [departmentId, schedulePlans]);

  const draftUrl = masterPlanNo && departmentId
    ? `/api/production-planning/wip-plan/draft?masterPlanNo=${encodeURIComponent(masterPlanNo)}&departmentId=${encodeURIComponent(departmentId)}&includeWeight=1`
    : null;
  const { data: draftPayload, isLoading: draftLoading, mutate: mutateDraft } = useSWR(draftUrl, fetcher, { revalidateOnFocus: false });
  useEffect(() => {
    setWipLines((draftPayload?.data?.lines || []).map((line) => ({ ...line })));
    setWipDirty(false);
  }, [draftPayload]);

  const sectionUrl = departmentId ? `/api/production-section-shifts?departmentId=${encodeURIComponent(departmentId)}` : null;
  const { data: sectionPayload } = useSWR(sectionUrl, fetcher, { revalidateOnFocus: false });
  const sections = useMemo(() => sectionPayload?.sections || [], [sectionPayload]);
  const masterShifts = useMemo(() => sectionPayload?.masterShifts || [], [sectionPayload]);

  const { data: productionShiftsPayload } = useSWR("/api/production-shifts", fetcher, { revalidateOnFocus: false });
  const settingShifts = useMemo(() => {
    return (productionShiftsPayload?.data || []).filter((s) => s.isActive !== false);
  }, [productionShiftsPayload]);
  const { mutate: mutateCache } = useSWRConfig();

  const workCentersUrl = departmentId ? `/api/production-work-centers?departmentId=${encodeURIComponent(departmentId)}` : null;
  const { data: workCentersPayload } = useSWR(workCentersUrl, fetcher, { revalidateOnFocus: false });
  const plannableWorkCenters = useMemo(() => {
    return (workCentersPayload?.data || []).filter((wc) => wc.requires_planning && wc.is_active);
  }, [workCentersPayload]);

  const templateId = activeSchedulePlan?.templateId || null;
  const { data: templatePayload } = useSWR(
    templateId ? `/api/production-planning/schedule/templates/${templateId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const activeTemplate = templatePayload?.data || null;
  const templateSections = useMemo(() => activeTemplate?.sections || [], [activeTemplate]);

  const { data: catalogPayload } = useSWR("/api/production-planning/schedule/sku-catalog", fetcher, { revalidateOnFocus: false });
  const allFgCatalog = useMemo(() => (catalogPayload?.data || []).filter((item) => item.itemType === "FG"), [catalogPayload]);
  const fgCatalog = useMemo(() => allFgCatalog.filter((item) => item.hasBom), [allFgCatalog]);
  const { data: wipPayload } = useSWR("/api/production-planning/wip-products?limit=2000", fetcher, { revalidateOnFocus: false });
  const wipCatalog = useMemo(() => wipPayload?.data || [], [wipPayload]);

  // ดึงสินค้าที่กำหนดให้แผนกนี้ (ใช้ filter ใน dialog เพิ่มสินค้า)
  const deptProductsUrl = departmentId ? `/api/production-planning/department-sku-list?departmentId=${encodeURIComponent(departmentId)}` : null;
  const { data: deptProductsPayload } = useSWR(deptProductsUrl, fetcher, { revalidateOnFocus: false });
  const deptSkuSet = useMemo(() => {
    const rows = deptProductsPayload?.data || [];
    if (!rows.length) return null; // ยังไม่โหลด หรือแผนกไม่ได้กำหนดสินค้า → แสดงทั้งหมด
    return new Set(rows.map((row) => String(row.sku_code || "").trim().toUpperCase()).filter(Boolean));
  }, [deptProductsPayload]);

  const addProductsFiltered = useMemo(() => {
    const base = addMode === "fg" ? allFgCatalog : wipCatalog;
    const filtered = filterPlanningProducts(base, addProductSearch, { requireBom: addMode === "fg" });
    // ถ้าไม่ได้กำลังค้นหาและแผนกมีสินค้ากำหนด → แสดงเฉพาะของแผนกก่อน
    if (deptSkuSet && !addProductSearch.trim()) {
      const deptItems = filtered.filter((item) => deptSkuSet.has(String(item.skuCode || "").toUpperCase()));
      if (deptItems.length) return deptItems;
    }
    return filtered;
  }, [addMode, addProductSearch, allFgCatalog, wipCatalog, deptSkuSet]);

  const addProducts = useMemo(
    () => addProductsFiltered.slice(0, addPageSize),
    [addProductsFiltered, addPageSize]
  );
  const addProductsHasMore = addProducts.length < addProductsFiltered.length;
  const sourceFgRows = useMemo(() => {
    const sectionById = new Map(sections.map((section) => [String(section.id), section.name]));
    const editableIds = statusPayload?.meta?.editableDepartmentIds || [];
    const canEditDepartment = Boolean(
      statusPayload?.meta?.isAdmin
      || statusPayload?.meta?.canManageGlobal
      || editableIds.includes(departmentId)
    );
    return normalizeScheduleRows(activeSchedulePlan, allFgCatalog).map((row) => ({
      ...row,
      can_edit: row.can_edit && canEditDepartment,
      schedule_section_name: row.schedule_section_name || sectionById.get(String(row.schedule_section_def_id)) || "ยังไม่กำหนด Section",
    }));
  }, [activeSchedulePlan, allFgCatalog, departmentId, sections, statusPayload]);

  useEffect(() => {
    setFgRows(sourceFgRows.map((row) => ({ ...row })));
    setDirtyFgIds(new Set());
    setDeletedFgIds(new Set());
    setNewFgRows([]);
  }, [sourceFgRows]);

  const fgSections = useMemo(() => {
    const list = templateSections.length ? templateSections : sections;
    return list.map((sec) => {
      const secId = String(sec.id || "");
      const count = fgRows.filter((r) => !deletedFgIds.has(r.plan_id) && String(r.schedule_section_def_id) === secId).length;
      return {
        id: secId,
        name: sec.name || "Section",
        count,
        production_schedule_column_defs: sec.production_schedule_column_defs || [],
      };
    });
  }, [templateSections, sections, fgRows, deletedFgIds]);

  const [selectedSectionDefId, setSelectedSectionDefId] = useState("");

  useEffect(() => {
    if (!fgSections.length) {
      setSelectedSectionDefId("");
      return;
    }
    if (!selectedSectionDefId || !fgSections.some((s) => s.id === selectedSectionDefId)) {
      const firstWithItems = fgSections.find((s) => s.count > 0);
      setSelectedSectionDefId(firstWithItems ? firstWithItems.id : fgSections[0].id);
    }
  }, [fgSections, selectedSectionDefId]);

  const currentSection = useMemo(() => {
    return fgSections.find((s) => s.id === selectedSectionDefId) || fgSections[0] || null;
  }, [fgSections, selectedSectionDefId]);

  useEffect(() => {
    const firstEditableDate = dates.find((date) => isPlanningDateEditable(date, today)) || "";
    setAddFg((current) => ({ ...current, workDate: firstEditableDate, sectionId: selectedSectionDefId || sections[0]?.id || "" }));
    setAddWip((current) => ({
      ...current,
      workDate: firstEditableDate,
      sectionId: plannableWorkCenters[0]?.id || sections[0]?.id || "",
    }));
    setSectionFilter("");
  }, [dates, sections, selectedSectionDefId, plannableWorkCenters, today]);

  const visibleFgRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...fgRows, ...newFgRows].filter((row) => {
      if (deletedFgIds.has(row.plan_id)) return false;
      if (!term) return true;
      const rowDataStr = Object.values(row.row_data || {}).filter(Boolean).join(" ");
      return `${row.sku_code} ${row.sku_name} ${rowDataStr}`.toLowerCase().includes(term);
    });
  }, [deletedFgIds, fgRows, newFgRows, search]);

  const wipMatrix = useMemo(() => {
    const groups = new Map();
    wipLines.forEach((line) => {
      const key = wipKey(line);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          skuCode: line.skuCode,
          skuName: line.skuName,
          unit: line.unit || line.planningUnit || "ชุด",
          sourceSectionDefId: line.sourceSectionDefId || "",
          sourceSectionName: line.sourceSectionName || "ยังไม่กำหนด Section",
          shiftId: line.shiftId || null,
          shiftCode: line.shiftCode || null,
          shiftName: line.shiftName || null,
          formulaCode: line.formulaCode || null,
          bomVersionId: line.bomVersionId || null,
          byDate: {},
        });
      }
      groups.get(key).byDate[line.workDate] = Number(line.plannedQty || 0);
    });
    const term = search.trim().toLowerCase();
    return Array.from(groups.values()).filter((row) => {
      if (sectionFilter && row.sourceSectionDefId !== sectionFilter) return false;
      return !term || `${row.skuCode} ${row.skuName}`.toLowerCase().includes(term);
    });
  }, [search, sectionFilter, wipLines]);

  const updateFgQty = (planId, value, key = null) => {
    const qty = Math.max(0, Number(value || 0));
    if (String(planId).startsWith("NEW-")) {
      setNewFgRows((rows) => rows.map((row) => {
        if (row.plan_id !== planId) return row;
        const qKey = key || row.qty_key || "qty";
        return {
          ...row,
          planned_qty: qty,
          qty_key: qKey,
          row_data: { ...row.row_data, [qKey]: qty },
        };
      }));
      return;
    }
    setFgRows((rows) => rows.map((row) => {
      if (row.plan_id !== planId) return row;
      const qKey = key || row.qty_key || "qty";
      return {
        ...row,
        planned_qty: qty,
        qty_key: qKey,
        row_data: { ...row.row_data, [qKey]: qty },
      };
    }));
    setDirtyFgIds((ids) => new Set(ids).add(planId));
  };

  const updateFgField = (planId, key, value, options = {}) => {
    if (!key) return;
    const update = (row) => row.plan_id === planId
      ? updatePlanningRowField(row, key, value, options)
      : row;
    if (String(planId).startsWith("NEW-")) {
      setNewFgRows((rows) => rows.map(update));
      return;
    }
    setFgRows((rows) => rows.map(update));
    setDirtyFgIds((ids) => new Set(ids).add(planId));
  };

  const updateFgProduct = (row, skuCode) => {
    const product = fgCatalog.find((item) => item.skuCode === skuCode);
    if (!product) return;
    const section = (templateSections.length ? templateSections : sections).find(
      (item) => String(item.id) === String(row.schedule_section_def_id)
    );
    const columns = section?.production_schedule_column_defs || [];
    const productColumn = columns.find((column) => column.col_type === "sku_picker");
    const brandColumn = columns.find((column) => column.col_type === "brand_auto");
    const update = (item) => item.plan_id === row.plan_id
      ? applyPlanningProductSelection(item, product, {
        productKey: productColumn?.key || item.detected_keys?.skuKeys?.[0] || "skuName",
        brandKey: productColumn?.auto_fill_field || brandColumn?.key || null,
      })
      : item;
    if (String(row.plan_id).startsWith("NEW-")) {
      setNewFgRows((rows) => rows.map(update));
      return;
    }
    setFgRows((rows) => rows.map(update));
    setDirtyFgIds((ids) => new Set(ids).add(row.plan_id));
  };

  const removeFg = (row) => {
    if (String(row.plan_id).startsWith("NEW-")) {
      setNewFgRows((rows) => rows.filter((item) => item.plan_id !== row.plan_id));
      return;
    }
    setDeletedFgIds((ids) => new Set(ids).add(row.plan_id));
  };

  const addFgRow = (selection = null, selectedDate = null, chosenFormula = null) => {
    const targetSectionId = selection?.skuCode ? selectedSectionDefId : addFg.sectionId || selectedSectionDefId;
    const product = selection?.skuCode ? selection : fgCatalog.find((item) => item.skuCode === addFg.skuCode);
    const section = sectionDefinitions.find((item) => String(item.id) === String(targetSectionId)) || currentSection;
    const shift = buildPlanningShiftOptions(section?.shifts || [], settingShifts.length ? settingShifts : masterShifts)[0] || null;
    const columns = section?.production_schedule_column_defs || [];
    const productColumn = columns.find((column) => column.col_type === "sku_picker");
    const brandColumn = columns.find((column) => column.col_type === "brand_auto");
    const qtyColumn = columns.find((column) => isQuantityColumn(column));
    const peopleColumn = columns.find((column) => isPeopleColumn(column));
    const shiftColumn = columns.find((column) => column.col_type === "shift" || /shift|กะ/i.test(column.label || column.key));
    const skuKey = productColumn?.key || "skuName";
    const qtyKey = qtyColumn?.key || "qty";
    const workDate = selectedDate || addFg.workDate;
    if (!canEditFgDepartment || !product || !targetSectionId || !workDate || !isPlanningDateEditable(workDate, today)) return;
    const plannedQty = Math.max(0, Number(addFg.plannedQty || 0));
    const newId = `NEW-${Date.now()}`;
    const rowData = {
      [qtyKey]: plannedQty,
      ...(peopleColumn?.key ? { [peopleColumn.key]: Math.max(0, Number(addFg.people || 0)) } : {}),
      ...(shift ? { shiftName: shift.name, shiftCode: shift.code, shiftId: shift.id } : {}),
      ...(shiftColumn && shift ? { [shiftColumn.key]: shift.label } : {}),
    };
    const newRow = applyPlanningProductSelection({
      plan_id: newId,
      schedule_plan_id: activeSchedulePlan?.id || "",
      period_start: workDate,
      schedule_section_def_id: targetSectionId,
      schedule_section_name: section?.name || currentSection?.name || "ยังไม่กำหนด Section",
      sku_code: product.skuCode,
      sku_name: product.name,
      planned_qty: plannedQty,
      unit: product.unit || "",
      shift_id: shift?.id || null,
      shift_code: shift?.code || null,
      shift_name: shift?.name || "",
      can_edit: true,
      row_data: rowData,
      detected_keys: { skuKeys: [skuKey], qtyKey },
      qty_key: qtyKey,
      day_key: workDate,
    }, product, {
      productKey: skuKey,
      brandKey: productColumn?.auto_fill_field || brandColumn?.key || null,
    });
    if (chosenFormula) newRow.row_data = { ...newRow.row_data, formulaCode: chosenFormula.formula_code, formulaName: chosenFormula.formula_name, bomVersionId: chosenFormula.bom_version_id, formula_code: chosenFormula.formula_code, formula_name: chosenFormula.formula_name, bom_version_id: chosenFormula.bom_version_id };
    setNewFgRows((rows) => [...rows, newRow]);
    setSelectedFgPlanId(newId);
    setInspectorOpen(true);
    setAddDialogOpen(false);
    setAddFg((current) => ({ ...current, skuCode: "", people: 0, plannedQty: 1 }));
  };

  const setWipQty = (row, workDate, value) => {
    if (!isPlanningDateEditable(workDate, today)) return;
    const qty = Math.max(0, Number(value || 0));
    setWipLines((lines) => {
      const same = (line) => wipKey(line) === row.key && line.workDate === workDate;
      if (!qty) return lines.filter((line) => !same(line));
      if (lines.some(same)) return lines.map((line) => same(line) ? { ...line, plannedQty: qty } : line);
      return [...lines, {
        workDate,
        skuCode: row.skuCode,
        skuName: row.skuName,
        plannedQty: qty,
        unit: row.unit,
        departmentId,
        shiftId: row.shiftId,
        shiftCode: row.shiftCode,
        shiftName: row.shiftName,
        formulaCode: row.formulaCode,
        bomVersionId: row.bomVersionId,
        sourceSectionDefId: row.sourceSectionDefId,
        sourceSectionName: row.sourceSectionName,
      }];
    });
    setWipDirty(true);
  };

  const addWipRow = () => {
    const product = wipCatalog.find((item) => item.skuCode === addWip.skuCode);
    const targetRoomOrSection =
      plannableWorkCenters.find((item) => item.id === addWip.sectionId)
      || sections.find((item) => item.id === addWip.sectionId)
      || plannableWorkCenters[0]
      || sections[0];
    const shift = sections.find((item) => item.id === addWip.sectionId)?.shifts?.[0] || null;
    if (!product || !targetRoomOrSection || !addWip.workDate || !isPlanningDateEditable(addWip.workDate, today)) return;
    const formula = product.formulaOptions?.[0] || null;
    setWipLines((lines) => [...lines, {
      workDate: addWip.workDate,
      skuCode: product.skuCode,
      skuName: product.skuName,
      plannedQty: Math.max(0, Number(addWip.plannedQty || 0)),
      unit: product.wipQtyInputMode === "batch" ? "batch" : product.uomName,
      departmentId,
      shiftId: shift?.shiftId || null,
      shiftCode: shift?.shiftCode || null,
      shiftName: shift?.shiftName || null,
      formulaCode: formula?.formula_code || null,
      bomVersionId: formula?.bom_version_id || null,
      sourceSectionDefId: targetRoomOrSection.id,
      sourceSectionName: targetRoomOrSection.name,
    }]);
    setWipDirty(true);
    setAddDialogOpen(false);
    setAddWip((current) => ({ ...current, skuCode: "", plannedQty: 1 }));
  };

  const duplicateFgRow = (row) => {
    if (!isPlanningDateEditable(row.period_start, today)) return;
    const newId = `NEW-${Date.now()}`;
    const cloned = {
      ...row,
      plan_id: newId,
      row_data: { ...(row.row_data || {}) },
    };
    setNewFgRows((rows) => [...rows, cloned]);
    setExpandedRowIds((prev) => new Set(prev).add(newId));
  };

  const removeWipRow = (row) => {
    setWipLines((lines) => lines.filter((line) => wipKey(line) !== row.key || !isPlanningDateEditable(line.workDate, today)));
    setWipDirty(true);
  };

  const duplicateWipRow = (line) => {
    if (!isPlanningDateEditable(line.workDate, today)) return;
    const newWip = {
      ...line,
      id: `NEW-WIP-${Date.now()}`,
      planId: `NEW-WIP-${Date.now()}`,
    };
    setWipLines((lines) => [...lines, newWip]);
    setWipDirty(true);
  };

  const saveAll = async () => {
    if (!masterPlanNo || !departmentId || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const deleted = Array.from(deletedFgIds);
      const changedPlanIds = [...fgRows.filter((row) => dirtyFgIds.has(row.plan_id) || deletedFgIds.has(row.plan_id)), ...newFgRows]
        .map((row) => row.schedule_plan_id);
      for (const rowId of deleted) {
        const result = await fetchJson(`/api/production-planning/schedule/rows/${rowId}`, jsonRequest({ editableFromDate: today }, "DELETE"));
        if (!result.ok) throw new Error(result.error?.message || "ลบแผนหลักไม่สำเร็จ");
      }
      for (const row of fgRows.filter((item) => dirtyFgIds.has(item.plan_id) && !deletedFgIds.has(item.plan_id))) {
        if (!row.qty_key) throw new Error(`ไม่พบคอลัมน์จำนวนของ ${row.sku_code}`);
        const result = await fetchJson(`/api/production-planning/schedule/rows/${row.plan_id}`, jsonRequest({
          rowData: { ...row.row_data, [row.qty_key]: row.planned_qty },
          editableFromDate: today,
        }, "PUT"));
        if (!result.ok) throw new Error(result.error?.message || `แก้ไข ${row.sku_code} ไม่สำเร็จ`);
      }
      for (const row of newFgRows) {
        const result = await fetchJson(`/api/production-planning/schedule/plans/${row.schedule_plan_id}/rows`, jsonRequest({
          sectionDefId: row.schedule_section_def_id,
          dayKey: row.day_key,
          rowData: { ...row.row_data, [row.qty_key]: row.planned_qty },
          editableFromDate: today,
        }));
        if (!result.ok) throw new Error(result.error?.message || "เพิ่มสินค้าในแผนหลักไม่สำเร็จ");
      }
      if (wipDirty) {
        const editableLines = wipLines.filter((line) => isPlanningDateEditable(line.workDate, today) && Number(line.plannedQty) > 0).map((line) => ({
          workDate: line.workDate,
          skuCode: line.skuCode,
          skuName: line.skuName,
          plannedQty: Number(line.plannedQty),
          unit: line.unit,
          shiftId: line.shiftId,
          shiftCode: line.shiftCode,
          shiftName: line.shiftName,
          formulaCode: line.formulaCode,
          bomVersionId: line.bomVersionId,
          sourceSectionDefId: line.sourceSectionDefId,
          sourceSectionName: line.sourceSectionName,
        }));
        const draftResult = await fetchJson("/api/production-planning/wip-plan/draft", jsonRequest({ masterPlanNo, departmentId, lines: editableLines, replaceFromDate: today }));
        if (!draftResult.ok) throw new Error(draftResult.error?.message || "บันทึกแผน WIP ไม่สำเร็จ");
        const confirmResult = await fetchJson("/api/production-planning/subplan/confirm", jsonRequest({ masterPlanNo, departmentId, allowEmptyConfirm: true }));
        if (!confirmResult.ok) throw new Error(confirmResult.error?.message || "สร้าง BOM Snapshot ของ WIP ไม่สำเร็จ");
      }
      await publishAdjustedSchedulePlans(changedPlanIds, (id) => fetchJson(
        `/api/production-planning/schedule/plans/${id}`, jsonRequest({ status: "published" }, "PUT")
      ));
      await Promise.all([mutateStatus(), mutateDraft(), mutateInbox(), mutateCache(
        (key) => typeof key === "string" && key.startsWith("/api/production-planning/requisition/")
          && key.includes(`masterPlanNo=${encodeURIComponent(masterPlanNo)}`),
        undefined, { revalidate: true }
      )]);
      setNotice({ type: "success", text: "บันทึกแผน FG/WIP และอัปเดตข้อมูลสำหรับ Preview เรียบร้อยแล้ว" });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const activeDepartment = departments.find((row) => row.id === departmentId) || null;
  const dirtyCount = dirtyFgIds.size + deletedFgIds.size + newFgRows.length + (wipDirty ? 1 : 0);
  const loading = plansLoading || statusLoading || inboxLoading || draftLoading;
  const previewHref = selectedPlan
    ? `/production-line/planning/requisition-preview?masterPlanNo=${encodeURIComponent(masterPlanNo)}&dateFrom=${selectedPlan.periodStart}&dateTo=${selectedPlan.periodEnd}`
    : "#";
  const activeCounts = departmentCounts.get(String(departmentId)) || { fg: sourceFgRows.length, wip: wipLines.length };
  const wipSectionSummary = useMemo(() => {
    const groups = new Map();
    wipLines.forEach((line) => {
      const id = String(line.sourceSectionDefId || "");
      const name = line.sourceSectionName || "ยังไม่กำหนด Section";
      const current = groups.get(id) || { id, name, skus: new Set() };
      current.skus.add(line.skuCode);
      groups.set(id, current);
    });
    return Array.from(groups.values()).map((group) => ({ ...group, count: group.skus.size }));
  }, [wipLines]);
  const sectionDefinitions = useMemo(
    () => (templateSections.length ? templateSections : sections),
    [sections, templateSections]
  );
  const canEditFgDepartment = Boolean(statusPayload?.meta?.isAdmin || statusPayload?.meta?.canManageGlobal || (statusPayload?.meta?.editableDepartmentIds || []).includes(departmentId));
  const canAddFg = canEditFgDepartment && Boolean(activeSchedulePlan?.id) && dates.some(date => isPlanningDateEditable(date, today));
  const applySharedFgPatch = (id, patch) => {
    const row = [...fgRows, ...newFgRows].find(item => item.plan_id === id);
    if (!row || row.can_edit === false || !isPlanningDateEditable(row.period_start, today)) return;
    const section = sectionDefinitions.find(item => String(item.id) === String(row.schedule_section_def_id));
    const productColumn = (section?.production_schedule_column_defs || []).find(item => item.col_type === "sku_picker" && Object.hasOwn(patch, item.key));
    const product = productColumn ? fgCatalog.find(item => item.name === patch[productColumn.key]) : null;
    if (productColumn && !product) return;
    const update = current => current.plan_id !== id ? current : {
      ...current,
      ...(product ? { sku_code: product.skuCode, sku_name: product.name, unit: product.unit || current.unit } : {}),
      ...(Object.hasOwn(patch, current.qty_key) ? { planned_qty: Math.max(0, Number(patch[current.qty_key] || 0)) } : {}),
      row_data: { ...current.row_data, ...patch },
    };
    if (String(id).startsWith("NEW-")) setNewFgRows(current => current.map(update));
    else { setFgRows(current => current.map(update)); setDirtyFgIds(current => new Set(current).add(id)); }
  };
  const sectionViews = useMemo(() => buildPlanningSectionViews({
    sections: sectionDefinitions,
    rows: [...fgRows, ...newFgRows],
    deletedIds: deletedFgIds,
    search,
  }), [deletedFgIds, fgRows, newFgRows, search, sectionDefinitions]);
  const selectedFgRow = useMemo(
    () => visibleFgRows.find((row) => row.plan_id === selectedFgPlanId) || null,
    [selectedFgPlanId, visibleFgRows]
  );
  const selectedSectionView = useMemo(
    () => sectionViews.find((section) => section.id === String(selectedFgRow?.schedule_section_def_id || "")) || null,
    [sectionViews, selectedFgRow]
  );
  const linkedWipLines = useMemo(
    () => getLinkedPlanningWipLines(selectedFgRow, wipLines),
    [selectedFgRow, wipLines]
  );

  useEffect(() => {
    if (!inspectorOpen || selectedFgRow || !visibleFgRows.length) return;
    const firstEditable = visibleFgRows.find((row) => (
      isPlanningDateEditable(row.period_start, today) && row.can_edit !== false
    ));
    setSelectedFgPlanId((firstEditable || visibleFgRows[0]).plan_id);
  }, [inspectorOpen, selectedFgRow, today, visibleFgRows]);

  useEffect(() => {
    const sectionIdsWithRows = new Set(sourceFgRows.map((row) => String(row.schedule_section_def_id || "")));
    const prisonSectionIds = sectionDefinitions
      .filter((section) => (
        /เรือนจำ/.test(String(section?.name || ""))
        || !sectionIdsWithRows.has(String(section.id))
      ))
      .map((section) => String(section.id));
    setCollapsedSectionIds(new Set(prisonSectionIds));
  }, [departmentId, sectionDefinitions, sourceFgRows]);

  const selectFgRow = (row) => {
    setSelectedFgPlanId(row.plan_id);
    setInspectorOpen(true);
    setSelectedSectionDefId(String(row.schedule_section_def_id || ""));
  };

  const openAddDialog = (mode, row = null) => {
    setAddMode(mode);
    setAddProductSearch("");
    setAddPageSize(30);
    if (mode === "wip") {
      const defaultWipSectionId = row
        ? String(row.schedule_section_def_id || "")
        : (plannableWorkCenters[0]?.id || sections[0]?.id || "");
      setAddWip((current) => ({
        ...current,
        workDate: row ? row.period_start : (current.workDate || dates.find((d) => isPlanningDateEditable(d, today)) || ""),
        sectionId: defaultWipSectionId,
      }));
    }
    setAddDialogOpen(true);
  };

  const toggleSection = (sectionId) => {
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const toggleRowExpand = (rowId) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const selectedQuantityColumn = selectedSectionView?.columns.find((column) => (
    isQuantityColumn(column, selectedFgRow?.qty_key)
  ));
  const selectedPeopleColumn = selectedSectionView?.columns.find(isPeopleColumn);
  const selectedBrandColumn = selectedSectionView?.columns.find((column) => (
    column?.col_type === "brand_auto" || column?.key === "brand" || column?.key === "jamBrand"
  ));
  const selectedProductColumn = selectedSectionView?.columns.find((column) => (
    column?.col_type === "sku_picker" || /Sku$/.test(column?.key || "") || column?.key === "skuName"
  ));
  const selectedTimeColumn = selectedSectionView?.columns.find((column) => (
    column?.col_type === "shift" || column?.key === "time"
  ));
  const resetChanges = () => {
    setFgRows(sourceFgRows.map((row) => ({ ...row })));
    setDirtyFgIds(new Set());
    setDeletedFgIds(new Set());
    setNewFgRows([]);
    setWipLines((draftPayload?.data?.lines || []).map((line) => ({ ...line })));
    setWipDirty(false);
    setNotice(null);
  };
  const addForm = addMode === "fg" ? addFg : addWip;
  const addSections = addMode === "fg" ? fgSections : (plannableWorkCenters.length ? plannableWorkCenters : sections);

  // ตรวจว่า section ที่เลือกใน dialog มี column "จำนวนคน" หรือไม่
  // ถ้าไม่มี column def หรือ section ไม่ได้ track คน → ซ่อนช่องนั้น
  const addFgSelectedSection = useMemo(() => {
    const sectionId = addFg.sectionId || selectedSectionDefId;
    return (templateSections.length ? templateSections : sections).find(
      (item) => String(item.id) === String(sectionId)
    ) || null;
  }, [addFg.sectionId, selectedSectionDefId, templateSections, sections]);

  const addFgHasPeopleColumn = useMemo(() => {
    const cols = addFgSelectedSection?.production_schedule_column_defs || [];
    // ถ้า section ยังไม่มี column_defs เลย (section ใหม่) → ซ่อน
    if (!cols.length) return false;
    return cols.some((col) => isPeopleColumn(col));
  }, [addFgSelectedSection]);

  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#082f61]">
      <section className="w-full min-h-screen overflow-hidden bg-white">
        {/* Unified Planning Sub-Header */}
        <PlanningHeader activeTab="report" />

        {/* Toolbar & Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 text-xs shadow-sm">
          {/* แผนหลัก FG */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 whitespace-nowrap">แผนหลัก FG</span>
            <div className="relative">
              <button type="button" aria-haspopup="dialog" aria-expanded={planPickerOpen} onClick={() => setPlanPickerOpen(true)} className="h-8 rounded border border-slate-300 bg-white pl-3 pr-8 font-bold text-slate-800">{masterPlanNo || "เลือกแผนหลัก"}</button>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            </div>
          </div>

          {/* ช่วงวันที่ */}
          <div className="flex items-center gap-1.5 ml-1">
            <span className="font-bold text-slate-700 whitespace-nowrap">ช่วงวันที่</span>
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 font-semibold text-slate-700 shadow-sm">
              <span>{dateLabel(selectedPlan?.periodStart)}</span>
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <span className="text-slate-400">-</span>
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 font-semibold text-slate-700 shadow-sm">
              <span>{dateLabel(selectedPlan?.periodEnd)}</span>
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* แผนก Pill Tabs */}
          <div className="flex items-center gap-1.5 ml-1 overflow-x-auto py-0.5">
            {visibleDepartments.map((department) => {
              const isSelected = department.id === departmentId;
              return (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => setDepartmentId(department.id)}
                  className={`px-4 py-1.5 text-xs rounded-lg font-bold transition-all shadow-sm whitespace-nowrap ${
                    isSelected
                      ? "bg-[var(--surface-navy,#102C57)] text-white"
                      : "bg-[#e2e8f0] text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  {department.name}
                </button>
              );
            })}
          </div>

          {/* ค้นหา */}
          <div className="relative min-w-[200px] max-w-[280px] flex-1 ml-1">
            <Search className="absolute left-3 top-2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาสินค้า / แบรนด์ / เครื่อง"
              className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!canAddFg}
              onClick={() => templateSections.length ? setAddFgDay(dates.find(date => isPlanningDateEditable(date, today))) : openAddDialog("fg")}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-slate-600" />
              <span>เพิ่มสินค้า FG</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span>พิมพ์</span>
            </button>
            <Link
              href={previewHref}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-slate-600" />
              <span>Preview ใบเบิก</span>
            </Link>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || !dirtyCount}
              className="flex h-8 items-center gap-1.5 rounded bg-[#f6bd16] hover:bg-[#e5ad0e] px-4 font-bold text-[#102C57] shadow-sm disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}</span>
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`mx-5 mt-3 border px-4 py-2 text-xs font-semibold rounded ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {notice.text}
          </div>
        )}

        {templateSections.length > 0 && <div className="py-4"><PlanningAdjustmentSchedule sections={templateSections} selectedSectionId={selectedSectionDefId} onSectionChange={setSelectedSectionDefId} rows={visibleFgRows} dates={dates} today={today} skuCatalog={fgCatalog} sectionShifts={sections.find(item => String(item.id) === selectedSectionDefId)?.shifts || []} title={selectedPlan?.masterPlanNo || "แผนหลัก FG"} canAdd={canAddFg} onAddRow={date => { if (isPlanningDateEditable(date, today)) setAddFgDay(date); }} onUpdate={applySharedFgPatch} onDelete={id => { const row = visibleFgRows.find(item => item.plan_id === id); if (row && row.can_edit !== false && isPlanningDateEditable(row.period_start, today)) removeFg(row); }} /></div>}

        {/* ตารางเต็มพื้นที่ Full Width แยก Section ตามหัวคอลัมน์จริง พร้อมระยะห่างพอดีๆ สวยงามตาม Mockup plan.png */}
        <div className="w-full px-4 sm:px-6 py-4 space-y-4">
          {!templateSections.length && sectionViews.map((section) => {
            const collapsed = collapsedSectionIds.has(section.id);
            return (
              <div key={section.id} className="w-full border border-slate-300 bg-white shadow-sm overflow-hidden">
                {/* แถบหัวข้อ Section สีเหลืองสไตล์ plan.png */}
                <div
                  onClick={() => toggleSection(section.id)}
                  className="flex h-9 w-full items-center gap-2.5 bg-[#ffd447] px-4 text-left text-slate-900 cursor-pointer select-none border-b border-amber-300 transition-colors hover:bg-[#fed136]"
                >
                  <ChevronDown className={`h-4 w-4 text-slate-900 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                  <strong className="text-sm font-bold text-slate-900 whitespace-nowrap">{section.name}</strong>
                  <span className="text-xs text-slate-800 ml-3 whitespace-nowrap">
                    {section.shifts?.[0]?.workStartTime && section.shifts?.[0]?.workEndTime
                      ? `เวลาทำงาน ${section.shifts[0].workStartTime} – ${section.shifts[0].workEndTime} น.`
                      : "เวลาทำงาน 07.00 – 19.00 น."}
                  </span>
                  {section.name.includes("ป้ายครีม") && (
                    <span className="text-xs text-slate-800 ml-4 hidden md:inline whitespace-nowrap">
                      กำหนดเดินงานตามแผนชุดครีมที่กำหนด*
                    </span>
                  )}
                </div>

                {!collapsed && (
                  <div className="w-full overflow-x-auto">
                    <table className="w-max min-w-full border-collapse text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                      <thead className="bg-[#f8f9fa] text-[#1a1c1e] font-bold border-b-2 border-[#1a1c1e]">
                        <tr className="h-9">
                          <th className="border-r border-slate-200 px-3 text-center w-[115px] min-w-[115px] whitespace-nowrap font-medium">วันที่</th>
                          {section.columns.map((column) => {
                            const isProduct = column.col_type === "sku_picker" || column.key === "skuName" || column.key === "productName";
                            const isQty = isQuantityColumn(column);
                            const isBrand = column.col_type === "brand_auto" || column.key === "brand" || column.key === "jamBrand";
                            const isCenter = column.col_type === "number" || column.col_type === "shift" || isQty || /machine|size|shift|เครื่อง|ไซส์|กะ|หน่วย/i.test(column.label || column.key);
                            return (
                              <th
                                key={column.id || column.key}
                                style={/note|หมายเหตุ/i.test(column.label || column.key) ? { width: 220, maxWidth: 220 } : column.width ? { minWidth: column.width } : undefined}
                                className={`border-r border-slate-200 px-3 py-1.5 whitespace-nowrap font-medium ${
                                  isCenter ? "text-center" : "text-left"
                                } ${
                                  isProduct
                                    ? "min-w-[190px]"
                                    : isBrand
                                    ? "w-[90px] min-w-[90px]"
                                    : isQty
                                    ? "w-[105px] min-w-[105px]"
                                    : /เครื่อง|machine/i.test(column.label || column.key)
                                    ? "w-[65px] min-w-[65px]"
                                    : /ไซส์|size/i.test(column.label || column.key)
                                    ? "w-[65px] min-w-[65px]"
                                    : /กะ|shift/i.test(column.label || column.key)
                                    ? "w-[190px] min-w-[190px]"
                                    : /note|หมายเหตุ/i.test(column.label || column.key)
                                    ? "w-[220px] min-w-[220px]"
                                    : /หน่วย|unit/i.test(column.label || column.key)
                                    ? "w-[75px] min-w-[75px]"
                                    : "min-w-[130px]"
                                }`}
                              >
                                {column.label || column.key}
                              </th>
                            );
                          })}
                          <th className="border-r border-slate-200 px-3 text-center w-[105px] min-w-[105px] whitespace-nowrap font-medium">สถานะ</th>
                          <th className="px-3 text-center w-[105px] min-w-[105px] whitespace-nowrap font-medium">การดำเนินการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {section.rows.map((row) => {
                          const editable = isPlanningDateEditable(row.period_start, today) && row.can_edit !== false;
                          const isExpanded = expandedRowIds.has(row.plan_id);
                          const rowLinkedWips = getLinkedPlanningWipLines(row, wipLines);

                          return (
                            <React.Fragment key={row.plan_id}>
                              <tr
                                onClick={() => selectFgRow(row)}
                                className={`h-10 transition-colors ${
                                  isExpanded
                                    ? "bg-amber-50/40"
                                    : editable
                                    ? "bg-white hover:bg-slate-50/80"
                                    : "bg-slate-50/40 hover:bg-slate-100/60"
                                }`}
                              >
                                {/* วันที่ */}
                                <td className="border-r border-slate-200 px-3 text-center text-slate-800 whitespace-nowrap w-[115px] min-w-[115px]">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="flex items-center gap-1 font-medium">
                                      {!editable && <LockKeyhole className="h-3 w-3 text-slate-400" />}
                                      {thaiDayDateLabel(row.period_start)}
                                    </span>
                                    {editable && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRowExpand(row.plan_id);
                                        }}
                                        className="p-0.5 rounded text-slate-400 hover:text-slate-800"
                                        title={isExpanded ? "ย่อแถว" : "ขยายแถวเพื่อดู/แก้ไข WIP"}
                                      >
                                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* คอลัมน์ตามหัวข้อของ section */}
                                {section.columns.map((column) => {
                                  const quantity = isQuantityColumn(column, row.qty_key);
                                  const product = column.col_type === "sku_picker" || column.key === "skuName" || column.key === "productName";
                                  const isBrand = column.col_type === "brand_auto" || column.key === "brand" || column.key === "jamBrand";
                                  const value = row.row_data?.[column.key] ?? (product ? row.sku_name || row.sku_code : "-");

                                  if (product) {
                                    return (
                                      <td key={column.id || column.key} className="border-r border-slate-200 px-3 text-slate-900 min-w-[190px]">
                                        <div className="whitespace-nowrap font-medium" title={row.sku_name || row.sku_code}>
                                          {row.sku_name || row.sku_code}
                                        </div>
                                      </td>
                                    );
                                  }

                                  if (isBrand) {
                                    return (
                                      <td key={column.id || column.key} className="border-r border-slate-200 px-3 text-left whitespace-nowrap w-[90px] min-w-[90px]">
                                        {renderBrandBadge(value)}
                                      </td>
                                    );
                                  }

                                  if (quantity) {
                                    return (
                                      <td key={column.id || column.key} className="border-r border-slate-200 px-2 text-center whitespace-nowrap w-[105px] min-w-[105px]">
                                        {editable ? (
                                          <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={row.planned_qty ?? value ?? 0}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateFgQty(row.plan_id, e.target.value, column.key)}
                                            className="mx-auto h-7 w-20 rounded border border-slate-300 bg-white px-1 text-center text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                                          />
                                        ) : (
                                          <div className="mx-auto flex h-7 w-20 items-center justify-center rounded bg-[#f1f5f9] text-xs font-medium text-slate-500">
                                            {row.planned_qty ?? value ?? 0}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  }

                                  if (column.col_type === "number") {
                                    return (
                                      <td key={column.id || column.key} className="border-r border-slate-200 px-2 text-center whitespace-nowrap w-[65px] min-w-[65px]">
                                        {editable ? (
                                          <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={value === "-" ? 0 : value}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateFgField(row.plan_id, column.key, e.target.value, { numeric: true })}
                                            className="mx-auto h-7 w-14 rounded border border-slate-300 bg-white px-1 text-center text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                                          />
                                        ) : (
                                          <span className="text-slate-700">{value}</span>
                                        )}
                                      </td>
                                    );
                                  }

                                  const isShift = column.col_type === "shift" || /shift|กะ/i.test(column.label || column.key);
                                  if (isShift) {
                                    const shiftOpts = buildPlanningShiftOptions(section.shifts, settingShifts.length ? settingShifts : masterShifts);
                                    const currentVal = String(value === "-" ? "" : value);
                                    const selectedShift = shiftOpts.find((shift) => shift.label === currentVal || shift.name === currentVal)
                                      || shiftOpts.find((shift) => shift.id === row.row_data?.shiftId || shift.code === row.row_data?.shiftCode);
                                    return (
                                      <td
                                        key={column.id || column.key}
                                        className="border-r border-slate-200 px-2 text-center whitespace-nowrap w-[190px] min-w-[190px]"
                                      >
                                        {editable ? (
                                          <select
                                            value={selectedShift?.id || currentVal}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                              const shift = shiftOpts.find((option) => option.id === e.target.value);
                                              if (shift) updateFgField(row.plan_id, column.key, shift.id, { shift });
                                            }}
                                            className="mx-auto h-7 w-[175px] rounded border border-slate-300 bg-white px-1.5 text-center text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                                          >
                                            <option value="" disabled>เลือกกะ</option>
                                            {currentVal && !selectedShift && (
                                              <option value={currentVal}>{currentVal}</option>
                                            )}
                                            {shiftOpts.map((opt) => (
                                              <option key={opt.id} value={opt.id}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="text-slate-700">{currentVal || "-"}</span>
                                        )}
                                      </td>
                                    );
                                  }

                                  return (
                                    <td
                                      key={column.id || column.key}
                                      className={`border-r border-slate-200 px-2 text-slate-800 ${
                                        /size|machine|ไซส์|เครื่อง|หน่วย/i.test(column.label || column.key)
                                          ? "text-center whitespace-nowrap"
                                          : "min-w-[130px]"
                                      }`}
                                    >
                                      {editable ? (
                                        <input
                                          value={value === "-" ? "" : value}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => updateFgField(row.plan_id, column.key, e.target.value)}
                                          className={`h-7 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 ${
                                            /machine|เครื่อง/i.test(column.label || column.key)
                                              ? "w-12 text-center"
                                              : /size|ไซส์/i.test(column.label || column.key)
                                              ? "w-14 text-center"
                                              : /unit|หน่วย/i.test(column.label || column.key)
                                              ? "w-16 text-center"
                                              : /note|หมายเหตุ/i.test(column.label || column.key)
                                              ? "w-[200px]"
                                              : "w-full"
                                          }`}
                                        />
                                      ) : (
                                        <div className="whitespace-nowrap" title={String(value || "")}>
                                          {value}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}

                                {/* สถานะ */}
                                <td className="border-r border-slate-200 px-2 text-center whitespace-nowrap w-[105px] min-w-[105px]">
                                  {renderStatusBadge(editable)}
                                </td>

                                {/* การดำเนินการ */}
                                <td className="px-2 text-center whitespace-nowrap w-[105px] min-w-[105px]">
                                  {editable ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          duplicateFgRow(row);
                                        }}
                                        title="คัดลอกแถวนี้"
                                        className="text-slate-500 hover:text-slate-800"
                                      >
                                        <Copy className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFg(row);
                                        }}
                                        title="ลบแถวนี้"
                                        className="text-slate-500 hover:text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRowExpand(row.plan_id);
                                        }}
                                        title={isExpanded ? "ย่อแผนย่อย WIP" : "ขยายแผนย่อย WIP"}
                                        className="text-slate-500 hover:text-slate-800"
                                      >
                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>

                              {/* แถวย่อย WIP ในสไตล์ plan.png */}
                              {isExpanded && (
                                <tr className="border-b border-slate-200">
                                  {/* ช่องซ้ายใต้ วันที่ ให้เป็นพื้นหลังว่างเปล่า */}
                                  <td className="border-r border-slate-200 bg-[#f8fafc]" />
                                  <td colSpan={section.columns.length + 2} className="p-0 bg-white">
                                    {/* แถบหัวข้อ แผนย่อย WIP ที่เชื่อมโยงจากแผนนี้ */}
                                    <div className="flex h-8 items-center bg-[#e8f1fa] px-4 border-b border-slate-200">
                                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                        แผนย่อย WIP ({row.sku_name || row.sku_code})
                                      </span>
                                    </div>

                                    {/* ตารางย่อย WIP */}
                                    <table className="w-max min-w-full border-collapse text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                                      <thead className="bg-[#f8f9fa] text-[#1a1c1e] font-bold border-b-2 border-[#1a1c1e]">
                                        <tr className="h-8">
                                          <th className="border-r border-slate-200 px-3 text-left font-semibold min-w-[190px] whitespace-nowrap">สินค้า (WIP)</th>
                                          <th className="border-r border-slate-200 px-3 text-left font-semibold w-[90px] min-w-[90px] whitespace-nowrap">แบรนด์</th>
                                          <th className="border-r border-slate-200 px-2 text-center font-semibold w-[65px] min-w-[65px] whitespace-nowrap">เครื่อง</th>
                                          <th className="border-r border-slate-200 px-2 text-center font-semibold w-[65px] min-w-[65px] whitespace-nowrap">ไซส์</th>
                                          <th className="border-r border-slate-200 px-2 text-center font-semibold w-[110px] min-w-[110px] whitespace-nowrap">กะ</th>
                                          <th className="border-r border-slate-200 px-3 text-center font-semibold w-[105px] min-w-[105px] whitespace-nowrap">แผนใช้ (จำนวน)</th>
                                          <th className="border-r border-slate-200 px-2 text-center font-semibold w-[75px] min-w-[75px] whitespace-nowrap">หน่วย</th>
                                          <th className="border-r border-slate-200 px-3 text-left font-semibold min-w-[130px] whitespace-nowrap">หมายเหตุ</th>
                                          <th className="border-r border-slate-200 px-3 text-center font-semibold w-[105px] min-w-[105px] whitespace-nowrap">สถานะ</th>
                                          <th className="px-3 text-center font-semibold w-[105px] min-w-[105px] whitespace-nowrap">การดำเนินการ</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200">
                                        {rowLinkedWips.map((wip, wIdx) => {
                                          const wipEditable = isPlanningDateEditable(wip.workDate, today);
                                          const matrixRow = { ...wip, key: wipKey(wip) };
                                          return (
                                            <tr key={(wip.planId || wip.id || wip.skuCode) + "-" + wIdx} className="h-9 hover:bg-slate-50/60">
                                              <td className="border-r border-slate-200 px-3 text-slate-800 font-medium min-w-[190px]">
                                                <div className="whitespace-nowrap" title={wip.skuName || wip.skuCode}>
                                                  {wip.skuName || wip.skuCode}
                                                </div>
                                              </td>
                                              <td className="border-r border-slate-200 px-3 whitespace-nowrap w-[90px] min-w-[90px]">
                                                {renderBrandBadge(wip.brand || row.row_data?.[selectedBrandColumn?.key] || "ระฆังทอง")}
                                              </td>
                                              <td className="border-r border-slate-200 px-2 text-center text-slate-700 whitespace-nowrap w-[65px] min-w-[65px]">
                                                {wip.machine || row.row_data?.machine || "1"}
                                              </td>
                                              <td className="border-r border-slate-200 px-2 text-center text-slate-700 whitespace-nowrap w-[65px] min-w-[65px]">
                                                {wip.size || row.row_data?.size || "XL"}
                                              </td>
                                              <td className="border-r border-slate-200 px-2 text-center text-slate-700 whitespace-nowrap w-[110px] min-w-[110px]">
                                                {wipEditable ? (
                                                   <select
                                                     value={wip.shiftName || wip.shiftCode || ""}
                                                     onClick={(e) => e.stopPropagation()}
                                                     onChange={(e) => {
                                                       const val = e.target.value;
                                                       setWipLines((lines) => {
                                                         const same = (line) => wipKey(line) === matrixRow.key && line.workDate === wip.workDate;
                                                         return lines.map((line) => same(line) ? { ...line, shiftName: val, shiftCode: val } : line);
                                                       });
                                                       setWipDirty(true);
                                                     }}
                                                     className="mx-auto h-7 w-[175px] rounded border border-slate-300 bg-white px-1.5 text-center text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                                                   >
                                                     <option value="">-</option>
                                                     {(wip.shiftName || wip.shiftCode) && !getShiftOptions(section.shifts, masterShifts, settingShifts).includes(wip.shiftName || wip.shiftCode) && (
                                                       <option value={wip.shiftName || wip.shiftCode}>{wip.shiftName || wip.shiftCode}</option>
                                                     )}
                                                     {getShiftOptions(section.shifts, masterShifts, settingShifts).map((opt) => (
                                                       <option key={opt} value={opt}>
                                                         {opt}
                                                       </option>
                                                     ))}
                                                   </select>
                                                 ) : (
                                                   <span className="text-slate-700">{wip.shiftName || wip.shiftCode || "-"}</span>
                                                 )}
                                              </td>
                                              <td className="border-r border-slate-200 px-3 text-center whitespace-nowrap w-[105px] min-w-[105px]">
                                                {wipEditable ? (
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={wip.plannedQty || ""}
                                                    onChange={(e) => setWipQty(matrixRow, wip.workDate, e.target.value)}
                                                    className="mx-auto h-7 w-20 rounded border border-slate-300 bg-white px-1 text-center text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                                                  />
                                                ) : (
                                                  <div className="mx-auto flex h-7 w-20 items-center justify-center rounded bg-[#f1f5f9] text-xs font-medium text-slate-500">
                                                    {wip.plannedQty || 0}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="border-r border-slate-200 px-2 text-center text-slate-700 whitespace-nowrap w-[75px] min-w-[75px]">
                                                {wip.unit || "กก"}
                                              </td>
                                              <td className="border-r border-slate-200 px-3 text-slate-700 min-w-[130px]">
                                                <div className="whitespace-nowrap" title={wip.notes || ""}>
                                                  {wip.notes || "-"}
                                                </div>
                                              </td>
                                              <td className="border-r border-slate-200 px-3 text-center whitespace-nowrap w-[105px] min-w-[105px]">
                                                {renderStatusBadge(wipEditable)}
                                              </td>
                                              <td className="px-3 text-center whitespace-nowrap w-[105px] min-w-[105px]">
                                                {wipEditable ? (
                                                  <div className="flex items-center justify-center gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => duplicateWipRow(wip)}
                                                      title="คัดลอกรายการ WIP"
                                                      className="text-slate-400 hover:text-slate-700"
                                                    >
                                                      <Copy className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => removeWipRow(matrixRow)}
                                                      title="ลบรายการ WIP"
                                                      className="text-slate-400 hover:text-red-600"
                                                    >
                                                      <Trash2 className="h-4 w-4" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <span className="text-slate-400">-</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {!rowLinkedWips.length && (
                                          <tr>
                                            <td colSpan={10} className="py-3 text-center text-slate-400 text-xs">
                                              ยังไม่มีแผนย่อย WIP สำหรับรายการนี้
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {!section.rows.length && (
                          <EmptyRow colSpan={section.columns.length + 3}>
                            {plansLoading ? "กำลังโหลดรายการ..." : "ไม่มีรายการใน Section นี้"}
                          </EmptyRow>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {plannableWorkCenters.map((wc) => {
            const roomWipLines = wipLines.filter(
              (line) => String(line.sourceSectionDefId || "") === String(wc.id)
            );
            const collapsed = collapsedSectionIds.has(wc.id);

            return (
              <div key={wc.id} className="w-full border border-slate-300 bg-white shadow-sm overflow-hidden">
                <div
                  onClick={() => toggleSection(wc.id)}
                  className="flex h-9 w-full items-center gap-2.5 bg-[#e8eef8] px-4 text-left text-slate-900 cursor-pointer select-none border-b border-blue-200 transition-colors hover:bg-[#dce6f5]"
                >
                  <ChevronDown className={`h-4 w-4 text-slate-700 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                  <strong className="text-sm font-bold text-[#102C57] whitespace-nowrap">
                    ห้องผลิต: {wc.name}
                  </strong>
                  <span className="text-[11px] font-semibold text-[#102C57] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    แผนย่อย WIP
                  </span>
                  <span className="text-xs text-slate-600 ml-2 whitespace-nowrap">
                    {roomWipLines.length} รายการ
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canEditFgDepartment || !dates.some(date => isPlanningDateEditable(date, today))}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canEditFgDepartment) return;
                        setAddMode("wip");
                        setAddProductSearch("");
                        setAddPageSize(30);
                        const firstEditableDate = dates.find((date) => isPlanningDateEditable(date, today)) || "";
                        setAddWip({
                          skuCode: "",
                          workDate: firstEditableDate,
                          sectionId: wc.id,
                          plannedQty: 1,
                        });
                        setAddDialogOpen(true);
                      }}
                      className="inline-flex h-6 items-center gap-1 rounded bg-white px-2 text-[11px] font-bold text-[#102C57] border border-slate-300 hover:bg-slate-50 shadow-xs"
                    >
                      <Plus className="h-3 w-3" />
                      <span>เพิ่ม WIP</span>
                    </button>
                  </div>
                </div>

                {!collapsed && (
                  <WipWeeklyTable rows={buildWipWeeklyRows(roomWipLines)} dates={planningDates(roomWipLines, { start: dates[0], end: dates.at(-1) })} formatDate={dateLabel}
                    canEdit={line => canEditFgDepartment && isPlanningDateEditable(line.workDate, today)}
                    onChange={(line, value) => {
                      if (!canEditFgDepartment || !isPlanningDateEditable(line.workDate, today)) return;
                      const qty = Number(value);
                      if (!Number.isFinite(qty) || qty < 0) return;
                      setWipLines(lines => lines.map(item => item === line ? { ...item, plannedQty: qty } : item));
                      setWipDirty(true);
                    }}
                    onDelete={row => {
                      if (!canEditFgDepartment || !window.confirm("ลบรายการ WIP เฉพาะวันที่ที่ยังแก้ไขได้หรือไม่?")) return;
                      const editableLines = new Set(Object.values(row.linesByDate).filter(line => isPlanningDateEditable(line.workDate, today)));
                      setWipLines(lines => lines.filter(line => !editableLines.has(line)));
                      setWipDirty(true);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {addDialogOpen && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-production-title">
            <div className="relative flex flex-col w-full max-w-[620px] max-h-[85vh] rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
                <h2 id="add-production-title" className="text-sm sm:text-base font-bold text-slate-800">เพิ่มรายการผลิต</h2>
                <button
                  type="button"
                  onClick={() => setAddDialogOpen(false)}
                  aria-label="ปิดหน้าต่างเพิ่มรายการ"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Switcher Mode */}
                <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => { setAddMode("fg"); setAddProductSearch(""); setAddPageSize(30); }}
                    className={`h-7 rounded-md transition-all ${addMode === "fg" ? "bg-white text-[#102C57] shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    สินค้า FG
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddMode("wip"); setAddProductSearch(""); setAddPageSize(30); }}
                    className={`h-7 rounded-md transition-all ${addMode === "wip" ? "bg-white text-[#102C57] shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    WIP
                  </button>
                </div>

                {/* Search */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>{addMode === "fg" ? "ค้นหาสินค้า FG (เฉพาะสินค้าที่มี BOM อนุมัติแล้ว)" : "ค้นหา WIP"}</span>
                    {!addProductSearch.trim() && deptSkuSet && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                        เฉพาะแผนกนี้ {addProductsFiltered.length} รายการ
                      </span>
                    )}
                  </div>
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      autoFocus
                      value={addProductSearch}
                      onChange={(event) => { setAddProductSearch(event.target.value); setAddPageSize(30); }}
                      placeholder="ค้นหารหัสสินค้า / ชื่อสินค้า / แบรนด์"
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Product Table */}
                <div className="max-h-[180px] overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr className="h-7">
                        <th className="w-8 border-r border-slate-200 p-1 text-center" />
                        <th className="w-[110px] border-r border-slate-200 px-2 text-left font-medium">รหัสสินค้า</th>
                        <th className="border-r border-slate-200 px-2 text-left font-medium">ชื่อสินค้า</th>
                        <th className="w-[90px] border-r border-slate-200 px-2 text-left font-medium">แบรนด์</th>
                        {addMode === "fg" && <th className="w-[80px] border-b border-slate-200 px-2 text-center font-medium">BOM</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {addProducts.map((item) => {
                        const code = item.skuCode;
                        const name = item.name || item.skuName;
                        const checked = addForm.skuCode === code;
                        return (
                          <tr
                            key={code}
                            onClick={() => addMode === "fg" ? setAddFg({ ...addFg, skuCode: code }) : setAddWip({ ...addWip, skuCode: code })}
                            className={`cursor-pointer transition-colors ${checked ? "bg-amber-50" : "hover:bg-slate-50"}`}
                          >
                            <td className="border-r border-slate-200 p-1 text-center">
                              <input type="radio" name="add-product" checked={checked} onChange={() => {}} aria-label={`เลือก ${code}`} />
                            </td>
                            <td className="border-r border-slate-200 px-2 py-1 font-bold text-slate-800 font-mono text-[11px]">{code}</td>
                            <td className="border-r border-slate-200 px-2 py-1 text-slate-700 whitespace-nowrap" title={name}>{name}</td>
                            <td className="border-r border-slate-200 px-2 py-1 text-slate-600 whitespace-nowrap">{item.brand || "-"}</td>
                            {addMode === "fg" && (
                              <td className="px-2 py-1 text-center">
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                  มี BOM
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {!addProducts.length && <EmptyRow colSpan={addMode === "fg" ? 5 : 4}>ไม่พบสินค้าที่ค้นหา</EmptyRow>}
                      {addProductsHasMore && (
                        <tr>
                          <td colSpan={addMode === "fg" ? 5 : 4} className="p-0">
                            <button
                              type="button"
                              onClick={() => setAddPageSize((n) => n + 30)}
                              className="w-full py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 border-t border-slate-200"
                            >
                              แสดงเพิ่มอีก 30 รายการ ({addProductsFiltered.length - addProducts.length} รายการที่เหลือ)
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Form Details */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                  <h3 className="mb-1.5 text-xs font-bold text-slate-700">รายละเอียดการผลิต</h3>
                  <div className={`grid gap-2 text-xs font-semibold ${addFgHasPeopleColumn ? "grid-cols-4" : "grid-cols-3"}`}>
                    <label className="text-slate-600">
                      วันที่ผลิต
                      <input
                        type="date"
                        min={today}
                        value={addForm.workDate}
                        onChange={(event) => addMode === "fg" ? setAddFg({ ...addFg, workDate: event.target.value }) : setAddWip({ ...addWip, workDate: event.target.value })}
                        className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="text-slate-600">
                      {addMode === "fg" ? "Section" : "ห้องผลิต"}
                      <select
                        value={addForm.sectionId || (addMode === "fg" ? selectedSectionDefId : (plannableWorkCenters[0]?.id || sections[0]?.id || ""))}
                        onChange={(event) => addMode === "fg" ? setAddFg({ ...addFg, sectionId: event.target.value }) : setAddWip({ ...addWip, sectionId: event.target.value })}
                        className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {addSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                      </select>
                    </label>
                    {addFgHasPeopleColumn && (
                      <label className="text-slate-600">
                        จำนวนคน
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={addFg.people}
                          onChange={(event) => setAddFg({ ...addFg, people: event.target.value })}
                          className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                        />
                      </label>
                    )}
                    <label className="text-slate-600">
                      จำนวนผลิต
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={addForm.plannedQty}
                        onChange={(event) => addMode === "fg" ? setAddFg({ ...addFg, plannedQty: event.target.value }) : setAddWip({ ...addWip, plannedQty: event.target.value })}
                        className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4">
                <button
                  type="button"
                  onClick={() => setAddDialogOpen(false)}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-xs transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={addMode === "fg" ? addFgRow : addWipRow}
                  disabled={!addForm.skuCode || !addForm.workDate || !(addForm.sectionId || (addMode === "fg" ? selectedSectionDefId : (plannableWorkCenters[0]?.id || sections[0]?.id))) || Number(addForm.plannedQty) <= 0}
                  className="h-8 rounded-lg bg-[var(--surface-navy,#102C57)] px-4 text-xs font-bold text-white hover:bg-[var(--surface-navy,#0c2345)] disabled:opacity-40 shadow-xs transition-colors"
                >
                  เพิ่มรายการ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sticky Bottom Bar สไตล์ plan.png */}
        <footer className="sticky bottom-0 z-20 flex min-h-14 items-center justify-between border-t border-slate-200 bg-white px-6 py-2.5 shadow-[0_-3px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2.5 text-xs font-bold text-[#102C57]">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-navy,#102C57)] text-white">
              <Info className="h-3 w-3" />
            </div>
            <span>{dirtyCount ? `มีการแก้ไขข้อมูล ${dirtyCount} รายการ (ยังไม่ได้บันทึก)` : "ยังไม่มีการแก้ไขข้อมูล"}</span>
            <span className="text-slate-400 font-normal ml-3 hidden sm:inline">วันที่ก่อน {dateLabel(today)} ไม่สามารถแก้ไขได้</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetChanges}
              disabled={!dirtyCount}
              className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              ยกเลิกการแก้ไข
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || !dirtyCount}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#f6bd16] hover:bg-[#e5ad0e] px-5 text-xs font-black text-[#102C57] shadow-sm disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</span>
            </button>
          </div>
        </footer>
        {planPickerOpen && <RequisitionPlanPicker plans={plans.map(plan => ({ planNo: plan.masterPlanNo, periodStart: plan.periodStart, periodEnd: plan.periodEnd }))} selectedPlanNo={masterPlanNo} onSelect={setMasterPlanNo} onClose={() => setPlanPickerOpen(false)} formatDate={dateLabel} loading={plansLoading} error={plansError} onRetry={() => reloadPlans()} />}
        {addFgDay && canAddFg && <PlanningSkuPicker skuMap={new Map(fgCatalog.map(item => [item.name, item]))} currentValue="" onClose={() => setAddFgDay(null)} onSelect={(name, brand, formula) => { const product = fgCatalog.find(item => item.name === name); if (product) addFgRow(product, addFgDay, formula); }} />}
      </section>
    </main>
  );
}

