export const BOM_PLANNING_OFFSET_MIN = -30;
export const BOM_PLANNING_OFFSET_MAX = 30;

export function normalizePlanningOffsetDays(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  return Math.max(BOM_PLANNING_OFFSET_MIN, Math.min(BOM_PLANNING_OFFSET_MAX, rounded));
}

export function getPlanningOffsetLabel(offsetDays) {
  const normalized = normalizePlanningOffsetDays(offsetDays, 0);
  if (normalized === 0) return "วันเดียวกับตัวแม่";
  if (normalized < 0) return `ก่อนตัวแม่ ${Math.abs(normalized)} วัน`;
  return `หลังตัวแม่ ${normalized} วัน`;
}

export function getRawPlanningDateLabel(parentType) {
  return parentType === "FG" ? "ใช้วันที่แผนหลัก" : "ใช้วันที่ WIP";
}

export function getPlanningOffsetOptions() {
  return [
    { value: -3, label: "ก่อนตัวแม่ 3 วัน" },
    { value: -2, label: "ก่อนตัวแม่ 2 วัน" },
    { value: -1, label: "ก่อนตัวแม่ 1 วัน" },
    { value: 0, label: "วันเดียวกับตัวแม่" },
    { value: 1, label: "หลังตัวแม่ 1 วัน" },
    { value: 2, label: "หลังตัวแม่ 2 วัน" },
    { value: 3, label: "หลังตัวแม่ 3 วัน" },
  ];
}
