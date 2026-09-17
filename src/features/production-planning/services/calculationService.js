import { fetchJson } from "@/lib/clientFetch";

function resolveMasterPlanNo(plannedItems = []) {
  const rows = Array.isArray(plannedItems) ? plannedItems : [];
  for (const item of rows) {
    const candidate = String(
      item?.masterPlanNo
      || item?.master_plan_no
      || item?.planGroupId
      || item?.plan_group_id
      || item?.planNo
      || item?.plan_no
      || ""
    ).trim().toUpperCase();
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

export async function fetchCalculation(plannedItems, stockData = {}) {
  const masterPlanNo = resolveMasterPlanNo(plannedItems);

  return fetchJson("/api/production-planning/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      masterPlanNo: masterPlanNo || null,
      plannedItems,
      ...stockData // Include stockData and minMaxData
    }),
  });
}
