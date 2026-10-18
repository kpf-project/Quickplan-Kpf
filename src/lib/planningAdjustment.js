const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateOnly(value) {
  const date = String(value || "").slice(0, 10);
  return DATE_ONLY.test(date) ? date : null;
}

export function getBangkokDateOnly(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isPlanningDateEditable(workDate, today = getBangkokDateOnly()) {
  const date = normalizeDateOnly(workDate);
  const boundary = normalizeDateOnly(today);
  return Boolean(date && boundary && date >= boundary);
}

export function resolveScheduleWorkDate(weekStartDate, dayKey) {
  const explicitDate = normalizeDateOnly(dayKey);
  if (explicitDate) return explicitDate;
  const start = normalizeDateOnly(weekStartDate);
  if (!start) return null;
  const offset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }[
    String(dayKey || "").trim().toLowerCase()
  ];
  if (!Number.isFinite(offset)) return start;
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function buildPlanningStatusRecord(input = {}) {
  const masterPlanNo = String(input.masterPlanNo || "").trim().toUpperCase();
  const workDate = normalizeDateOnly(input.workDate);
  const plannedQty = Number(input.plannedQty);
  return {
    plan_id: String(input.planId || "").trim(),
    master_plan_no: masterPlanNo,
    plan_group_id: masterPlanNo,
    plan_kind: "main",
    sku_code: String(input.skuCode || "").trim().toUpperCase(),
    sku_name: String(input.skuName || "").trim(),
    planned_qty: Number.isFinite(plannedQty) ? plannedQty : 0,
    unit: String(input.unit || "").trim() || null,
    period_start: workDate,
    period_end: workDate,
    status: "ready",
    confirmed_at: input.confirmedAt || new Date().toISOString(),
    owner_department_id: String(input.departmentId || "").trim() || null,
    schedule_section_def_id: String(input.sectionId || "").trim() || null,
    schedule_section_name: String(input.sectionName || "").trim() || null,
    shift_id: String(input.shiftId || "").trim() || null,
    shift_code: String(input.shiftCode || "").trim().toUpperCase() || null,
    shift_name: String(input.shiftName || "").trim() || null,
    formula_code: String(input.formulaCode || "").trim().toUpperCase() || null,
    bom_version_id: String(input.bomVersionId || "").trim() || null,
  };
}

export function buildPlanningSectionViews({ sections = [], rows = [], deletedIds = new Set(), search = "" } = {}) {
  const term = String(search || "").trim().toLocaleLowerCase("th");
  const visibleRows = rows.filter((row) => {
    if (deletedIds.has(row?.plan_id)) return false;
    if (!term) return true;
    const rowData = Object.values(row?.row_data || {}).filter(Boolean).join(" ");
    return `${row?.sku_code || ""} ${row?.sku_name || ""} ${rowData}`
      .toLocaleLowerCase("th")
      .includes(term);
  });

  return [...sections]
    .sort((a, b) => Number(a?.display_order || 0) - Number(b?.display_order || 0))
    .map((section) => ({
      id: String(section?.id || ""),
      name: String(section?.name || "Section"),
      shifts: Array.isArray(section?.shifts) ? section.shifts : [],
      columns: [...(section?.production_schedule_column_defs || [])]
        .sort((a, b) => Number(a?.display_order || 0) - Number(b?.display_order || 0)),
      rows: visibleRows.filter(
        (row) => String(row?.schedule_section_def_id || "") === String(section?.id || "")
      ),
    }));
}

export function resolvePlanningScheduleSkuKey(rowData = {}, detectedKeys = {}) {
  const candidates = [
    ...(detectedKeys.skuKeys || []),
    ...Object.keys(rowData).filter((key) => /sku|product.*name|สินค้า|ผลิตภัณฑ์/i.test(key)),
  ];
  return candidates.find((key) => String(rowData[key] || "").trim()) || candidates[0] || null;
}

export function getLinkedPlanningWipLines(selectedRow, lines = []) {
  if (!selectedRow) return [];
  const workDate = String(selectedRow?.period_start || "").slice(0, 10);
  const sectionId = String(selectedRow?.schedule_section_def_id || "");
  return lines.filter((line) => (
    String(line?.workDate || "").slice(0, 10) === workDate
    && String(line?.sourceSectionDefId || "") === sectionId
  ));
}

export function filterPlanningProducts(products = [], search = "", { requireBom = false } = {}) {
  const term = String(search || "").trim().toLocaleLowerCase("th");
  return products.filter((product) => {
    if (requireBom && !product?.hasBom) return false;
    if (!term) return true;
    return `${product?.skuCode || ""} ${product?.name || product?.skuName || ""} ${product?.brand || ""}`
      .toLocaleLowerCase("th")
      .includes(term);
  });
}

export function buildPlanningShiftOptions(sectionShifts = [], masterShifts = []) {
  const assigned = sectionShifts.filter((shift) => shift.isActive !== false);
  const rows = assigned.length ? assigned : masterShifts.filter((shift) => shift.isActive !== false);
  const options = new Map();
  rows.forEach((shift) => {
    const id = shift.shiftId || shift.id;
    const code = shift.shiftCode || shift.code || "";
    const name = shift.shiftName || shift.name || code;
    if (!id || !name) return;
    const time = shift.startTime && shift.endTime
      ? ` (${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)})` : "";
    options.set(id, { id, code, name, label: `${name}${time}` });
  });
  return [...options.values()];
}

export async function publishAdjustedSchedulePlans(planIds, publishPlan) {
  for (const id of new Set(planIds.filter(Boolean))) {
    const result = await publishPlan(id);
    if (!result.ok) throw new Error(result.error?.message || "อัปเดตฉบับแผนสำหรับ Preview ไม่สำเร็จ");
  }
}

export function updatePlanningRowField(row, key, value, { numeric = false, shift } = {}) {
  const nextValue = numeric ? Math.max(0, Number(value || 0)) : value;
  const isShift = /shift|กะ/i.test(key);
  return {
    ...row,
    ...(isShift ? { shift_name: String(nextValue || "").trim() } : {}),
    ...(shift ? { shift_id: shift.id, shift_code: shift.code, shift_name: shift.name } : {}),
    row_data: {
      ...(row?.row_data || {}), [key]: shift ? shift.label : nextValue,
      ...(shift ? { shiftId: shift.id, shiftCode: shift.code, shiftName: shift.name } : {}),
    },
  };
}

export function applyPlanningProductSelection(row, product, { productKey, brandKey } = {}) {
  const formula = product?.formulaOptions?.[0] || null;
  const formulaCode = formula?.formula_code || null;
  const formulaName = formula?.formula_name || null;
  const bomVersionId = formula?.bom_version_id || null;
  return {
    ...row,
    sku_code: String(product?.skuCode || "").trim().toUpperCase(),
    sku_name: String(product?.name || "").trim(),
    unit: String(product?.unit || "").trim(),
    row_data: {
      ...(row?.row_data || {}),
      ...(productKey ? { [productKey]: String(product?.name || "").trim() } : {}),
      ...(brandKey ? { [brandKey]: String(product?.brand || "").trim() } : {}),
      formulaCode,
      formulaName,
      bomVersionId,
      formula_code: formulaCode,
      formula_name: formulaName,
      bom_version_id: bomVersionId,
    },
  };
}

export function preferPlanningScheduleRows(scheduleRows = [], publishedRows = []) {
  return scheduleRows.length ? scheduleRows : publishedRows;
}
