import useSWR from "swr";
import { fetchJson, fetcher } from "@/lib/clientFetch";

const BASE = "/api/production-planning/schedule";

// ── Fetchers ───────────────────────────────────────────────────────────────────
// client-swr-dedup: use `fetcher` (throws on error, returns payload directly)
// so SWR data = raw API JSON, and data?.data matches { ok, data } response shape.

/** List all templates, optionally filtered by deptId */
export function useScheduleTemplates(deptId = null) {
  const key = deptId ? `${BASE}/templates?deptId=${deptId}` : `${BASE}/templates`;
  const { data, error, isLoading, mutate } = useSWR(key, fetcher);
  return {
    templates: data?.data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/** Load one template with its sections and columns */
export function useScheduleTemplate(templateId) {
  const { data, error, isLoading, mutate } = useSWR(
    templateId ? `${BASE}/templates/${templateId}` : null,
    fetcher
  );
  return {
    template: data?.data ?? null,
    isLoading,
    error,
    mutate,
  };
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export async function createTemplate(payload) {
  return fetchJson(`${BASE}/templates`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateTemplate(id, patch) {
  return fetchJson(`${BASE}/templates/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteTemplate(id) {
  return fetchJson(`${BASE}/templates/${id}`, { method: "DELETE" });
}

export async function createSection(templateId, payload) {
  return fetchJson(`${BASE}/templates/${templateId}/sections`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateSection(id, patch) {
  return fetchJson(`${BASE}/section-defs/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteSection(id) {
  return fetchJson(`${BASE}/section-defs/${id}`, { method: "DELETE" });
}

export async function reorderSections(templateId, order) {
  return fetchJson(`${BASE}/templates/${templateId}/sections`, { method: "PATCH", body: JSON.stringify({ order }) });
}

export async function createColumn(sectionDefId, payload) {
  return fetchJson(`${BASE}/section-defs/${sectionDefId}/columns`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateColumn(id, patch) {
  return fetchJson(`${BASE}/column-defs/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteColumn(id) {
  return fetchJson(`${BASE}/column-defs/${id}`, { method: "DELETE" });
}

export async function reorderColumns(sectionDefId, order) {
  return fetchJson(`${BASE}/section-defs/${sectionDefId}/columns`, { method: "PATCH", body: JSON.stringify({ order }) });
}
