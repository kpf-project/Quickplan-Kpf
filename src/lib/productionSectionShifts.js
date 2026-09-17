import {
  buildShiftLabel,
  inferCrossesMidnight,
  mapShiftRow,
  normalizeShiftSortOrder,
  normalizeShiftTime,
} from "@/lib/productionShifts";

export function normalizeSectionShiftInput(body = {}) {
  const sectionDefId = String(body?.sectionDefId ?? body?.section_def_id ?? "").trim() || null;
  const shiftId = String(body?.shiftId ?? body?.shift_id ?? "").trim() || null;
  const startTime = normalizeShiftTime(body?.startTime ?? body?.start_time);
  const endTime = normalizeShiftTime(body?.endTime ?? body?.end_time);
  const sortOrder = normalizeShiftSortOrder(body?.sortOrder ?? body?.sort_order, 0);
  const isActive = body?.isActive !== false && body?.is_active !== false;
  const explicitCrossesMidnight = body?.crossesMidnight ?? body?.crosses_midnight;
  const crossesMidnight =
    typeof explicitCrossesMidnight === "boolean"
      ? explicitCrossesMidnight
      : inferCrossesMidnight(startTime, endTime);

  const errors = [];
  if (!sectionDefId) errors.push("Section is required");
  if (!shiftId) errors.push("Shift is required");
  if (!startTime) errors.push("Shift start time is required");
  if (!endTime) errors.push("Shift end time is required");

  return {
    sectionDefId,
    shiftId,
    startTime,
    endTime,
    crossesMidnight,
    sortOrder,
    isActive,
    errors,
  };
}

export function mapSectionShiftRow(row = {}) {
  if (row && typeof row === "object" && "sectionDefId" in row && "shiftId" in row) {
    return row;
  }
  const rawShifts = row?.production_shifts || row?.productionShifts || row?.shift || row;
  const rawShift = Array.isArray(rawShifts) ? rawShifts[0] : rawShifts;
  const shift = mapShiftRow(rawShift);
  const startTime = normalizeShiftTime(row?.start_time || row?.startTime || shift.startTime);
  const endTime = normalizeShiftTime(row?.end_time || row?.endTime || shift.endTime);
  const sectionDefId = String(row?.section_def_id || row?.sectionDefId || row?.section?.id || "").trim() || null;
  const sectionName = String(row?.section_name || row?.sectionName || row?.section?.name || "").trim() || null;
  const departmentId = String(row?.department_id || row?.departmentId || row?.department?.id || "").trim() || null;
  const departmentCode = String(row?.department_code || row?.departmentCode || row?.department?.code || "").trim().toUpperCase() || null;
  const departmentName = String(row?.department_name || row?.departmentName || row?.department?.name || "").trim() || null;

  return {
    id: row?.id || null,
    sectionDefId,
    sectionName,
    departmentId,
    departmentCode,
    departmentName,
    shiftId: shift.id,
    shiftCode: shift.code,
    shiftName: shift.name,
    shiftLabel: buildShiftLabel({ code: shift.code, name: shift.name }),
    startTime,
    endTime,
    crossesMidnight:
      row?.crosses_midnight === true
      || row?.crossesMidnight === true
      || inferCrossesMidnight(startTime, endTime),
    sortOrder: normalizeShiftSortOrder(row?.sort_order ?? row?.sortOrder, shift.sortOrder || 0),
    isActive: row?.is_active !== false && row?.isActive !== false,
  };
}

export function buildSectionShiftLabel(row = {}) {
  const mapped = mapSectionShiftRow(row);
  const timeLabel = mapped.startTime && mapped.endTime
    ? `${mapped.startTime} - ${mapped.endTime}`
    : "-";
  return `${mapped.shiftLabel} - ${timeLabel}`;
}

export function buildSectionShiftGroups(sectionCatalog = [], assignmentRows = []) {
  const sectionById = new Map(
    (Array.isArray(sectionCatalog) ? sectionCatalog : []).map((section) => [
      String(section?.id || "").trim(),
      {
        id: String(section?.id || "").trim() || null,
        name: String(section?.name || "").trim() || null,
        displayOrder: Number(section?.display_order ?? section?.displayOrder ?? 0) || 0,
        templateId: String(section?.template_id || section?.templateId || "").trim() || null,
        departmentId: String(section?.department_id || section?.departmentId || "").trim() || null,
        departmentCode: String(section?.department_code || section?.departmentCode || "").trim().toUpperCase() || null,
        departmentName: String(section?.department_name || section?.departmentName || "").trim() || null,
        shifts: [],
      },
    ])
  );

  (Array.isArray(assignmentRows) ? assignmentRows : []).forEach((row) => {
    const mapped = mapSectionShiftRow(row);
    const key = String(mapped.sectionDefId || "").trim();
    if (!key || !sectionById.has(key)) return;
    sectionById.get(key).shifts.push({
      ...mapped,
      label: buildSectionShiftLabel(mapped),
    });
  });

  return Array.from(sectionById.values())
    .map((section) => ({
      ...section,
      shifts: section.shifts
        .filter((shift) => shift.isActive !== false)
        .sort(
          (a, b) =>
            Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
            || String(a.shiftCode || "").localeCompare(String(b.shiftCode || ""))
        ),
    }))
    .sort((a, b) => {
      const deptCmp = String(a.departmentCode || "").localeCompare(String(b.departmentCode || ""));
      if (deptCmp !== 0) return deptCmp;
      const orderCmp = Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
      if (orderCmp !== 0) return orderCmp;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}
