import useSWR from "swr";
import { useCallback, useState } from "react";
import { fetchJson, fetcher } from "@/lib/clientFetch";

const BASE = "/api/production-planning/schedule";

// ── Read ───────────────────────────────────────────────────────────────────────

/** Load plan + all rows for a given planId */
export function useSchedulePlan(planId) {
  const { data, error, isLoading, mutate } = useSWR(
    planId ? `${BASE}/plans/${planId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  return {
    plan: data?.data?.plan ?? null,
    rows: data?.data?.rows ?? [],
    isLoading,
    error,
    mutate,
  };
}

/** Find plan by dept + date range, returns planId or null */
export function useFindPlan(deptId, weekStartDate, periodEnd) {
  const key =
    deptId && weekStartDate && periodEnd
      ? `${BASE}/plans?deptId=${deptId}&weekStartDate=${weekStartDate}&periodEnd=${periodEnd}`
      : null;
  const { data, isLoading, mutate } = useSWR(key, fetcher, { revalidateOnFocus: false });
  const plans = data?.data ?? [];
  return { planId: plans[0]?.id ?? null, isLoading, mutate };
}

// ── Optimistic local state hook ────────────────────────────────────────────────
/**
 * Manages local row state with optimistic updates.
 * Defers API calls so rapid edits don't flood the server.
 * Uses functional setState (rerender-functional-setstate rule).
 */
export function useScheduleRows(initialRows = []) {
  const [rows, setRows] = useState(initialRows);

  // Update a single field in a row — functional setState for stable reference
  const updateCell = useCallback((rowId, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, row_data: { ...r.row_data, [field]: value } } : r))
    );
  }, []);

  // Update multiple fields at once (e.g. sku + brand auto-fill)
  const updateCells = useCallback((rowId, patch) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, row_data: { ...r.row_data, ...patch } } : r
      )
    );
  }, []);

  const deleteRow = useCallback((rowId) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const addRow = useCallback((newRow) => {
    setRows((prev) => {
      // Insert after last row of same section+day
      const lastIdx = prev.reduce(
        (acc, r, i) =>
          r.section_def_id === newRow.section_def_id && r.day_key === newRow.day_key ? i : acc,
        -1
      );
      const next = [...prev];
      next.splice(lastIdx === -1 ? next.length : lastIdx + 1, 0, newRow);
      return next;
    });
  }, []);

  const resetRows = useCallback((nextRows) => {
    setRows(nextRows);
  }, []);

  return { rows, updateCell, updateCells, deleteRow, addRow, resetRows };
}

// ── Write ──────────────────────────────────────────────────────────────────────

export async function upsertPlan(payload) {
  return fetchJson(`${BASE}/plans`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updatePlan(planId, patch) {
  return fetchJson(`${BASE}/plans/${planId}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function saveRow(planId, row) {
  if (row.id && !row._isNew) {
    return fetchJson(`${BASE}/rows/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ rowData: row.row_data, subPlanId: row.sub_plan_id ?? null }),
    });
  }
  return fetchJson(`${BASE}/plans/${planId}/rows`, {
    method: "POST",
    body: JSON.stringify({
      sectionDefId: row.section_def_id,
      dayKey:       row.day_key,
      rowData:      row.row_data,
      subPlanId:    row.sub_plan_id ?? null,
      visionImport: row._visionImport === true,
    }),
  });
}

export async function saveRows(planId, rows) {
  if (!rows.length) return { ok: true, data: [] };
  return fetchJson(`${BASE}/plans/${planId}/rows`, {
    method: "POST",
    body: JSON.stringify({
      rows: rows.map((row) => ({
        sectionDefId: row.section_def_id,
        dayKey: row.day_key,
        rowData: row.row_data,
        subPlanId: row.sub_plan_id ?? null,
        visionImport: row._visionImport === true,
      })),
    }),
  });
}

export async function deleteRowApi(rowId) {
  return fetchJson(`${BASE}/rows/${rowId}`, { method: "DELETE" });
}

export async function bulkDeleteRows(planId, rowIds) {
  return fetchJson(`${BASE}/plans/${planId}/rows`, {
    method: "DELETE",
    body: JSON.stringify({ rowIds }),
  });
}
