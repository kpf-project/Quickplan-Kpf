import { fetchAllSupabaseRows } from "./supabaseRangeFetch.js";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function appendCandidate(map, key, row) {
  const list = map.get(key) || [];
  list.push(row);
  map.set(key, list);
}

function routingSignature(row) {
  return [
    normalizeId(row?.work_center_id),
    normalizeId(row?.issue_owner_department_id),
    normalizeCode(row?.component_type),
    normalizeCode(row?.dispatch_split_mode),
  ].join("|");
}

function selectConsensusRouting(rows = [], { requireRoom = false } = {}) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => !requireRoom || normalizeId(row?.work_center_id))
    .sort((left, right) => normalizeId(left?.id).localeCompare(normalizeId(right?.id)));
  if (!candidates.length) return null;

  const signatures = new Set(candidates.map(routingSignature));
  return signatures.size === 1 ? candidates[0] : null;
}

function selectExactRouting(rows = []) {
  const candidates = Array.isArray(rows) ? rows : [];
  const directPlanCandidates = candidates.filter((row) => {
    const fgSku = normalizeCode(row?.fg_sku_code);
    const parentSku = normalizeCode(row?.parent_sku_code);
    return fgSku && parentSku && fgSku === parentSku;
  });
  return selectConsensusRouting(
    directPlanCandidates.length ? directPlanCandidates : candidates
  );
}

export function buildRequisitionRoutingMap(rows = []) {
  const exactCandidates = new Map();
  const fallbackCandidates = new Map();
  const explicitFallbackCandidates = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const departmentId = normalizeId(row?.department_id);
    const parentSku = normalizeCode(row?.parent_sku_code);
    const componentSku = normalizeCode(row?.component_sku_code);
    if (!departmentId || !componentSku) return;

    const fallbackKey = `${departmentId}|*|${componentSku}`;
    appendCandidate(fallbackCandidates, fallbackKey, row);

    if (!parentSku || parentSku === "*") {
      appendCandidate(explicitFallbackCandidates, fallbackKey, row);
      return;
    }

    appendCandidate(exactCandidates, `${departmentId}|${parentSku}|${componentSku}`, row);
  });

  const routingByKey = new Map();
  exactCandidates.forEach((candidates, key) => {
    const routing = selectExactRouting(candidates);
    if (routing) routingByKey.set(key, routing);
  });

  fallbackCandidates.forEach((candidates, key) => {
    const explicitCandidates = explicitFallbackCandidates.get(key);
    const routing = selectConsensusRouting(
      explicitCandidates?.length ? explicitCandidates : candidates,
      { requireRoom: true }
    );
    if (routing) routingByKey.set(key, routing);
  });

  return routingByKey;
}

export async function loadRequisitionRoutingRows(supabaseAdmin, departmentIds = []) {
  const ids = Array.from(new Set(departmentIds.map(normalizeId).filter(Boolean)));
  if (!ids.length) return [];

  return fetchAllSupabaseRows(
    () => supabaseAdmin
      .from("production_routing_components")
      .select("id,department_id,fg_sku_code,parent_sku_code,component_sku_code,component_type,dispatch_split_mode,usage_type,issue_owner_department_id,work_center_id")
      .in("department_id", ids)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("id", { ascending: true }),
    { chunkSize: 1000 }
  );
}
