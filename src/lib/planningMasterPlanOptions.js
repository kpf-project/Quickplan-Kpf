function normalizePlanNo(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizePlanningMasterPlanOptions(rows = []) {
  const optionByPlanNo = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const masterPlanNo = normalizePlanNo(row?.master_plan_no ?? row?.masterPlanNo);
    if (!masterPlanNo) return;

    const start = String(row?.period_start ?? row?.periodStart ?? row?.weekStartDate ?? "").slice(0, 10) || null;
    const end = String(row?.period_end ?? row?.periodEnd ?? start ?? "").slice(0, 10) || start;
    const current = optionByPlanNo.get(masterPlanNo) || {
      masterPlanNo,
      periodStart: start,
      periodEnd: end,
    };

    if (start && (!current.periodStart || start < current.periodStart)) {
      current.periodStart = start;
    }
    if (end && (!current.periodEnd || end > current.periodEnd)) {
      current.periodEnd = end;
    }
    optionByPlanNo.set(masterPlanNo, current);
  });

  return Array.from(optionByPlanNo.values()).sort((left, right) =>
    String(right.periodStart || "").localeCompare(String(left.periodStart || ""))
  );
}
