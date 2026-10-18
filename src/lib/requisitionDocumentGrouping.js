import { fetchSupabaseRowsByChunks } from "./supabaseRangeFetch.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSku(value) {
  return normalizeText(value).toUpperCase();
}

export function isFgCategoryCode(value) {
  return /^04(?:-|$)/.test(normalizeText(value).toUpperCase());
}

export function resolveRequisitionDocumentParent({ skuCode, skuName, categoryCode } = {}) {
  if (!isFgCategoryCode(categoryCode)) {
    return { parentSku: null, parentSkuName: null };
  }

  const parentSku = normalizeSku(skuCode);
  return {
    parentSku: parentSku || null,
    parentSkuName: normalizeText(skuName) || parentSku || null,
  };
}

export function resolveRequisitionDocumentDiscriminator(item = {}) {
  if (item.consolidateRequisitionPreviewByDate === true) return "CONSOLIDATED";
  const parentSku = normalizeSku(item.parentSku);
  if (parentSku) return parentSku;
  const workstreamCode = normalizeText(item.workstreamCode).toUpperCase() || "DEFAULT";
  return `SECTION:${workstreamCode}`;
}

export function buildRequisitionDocumentBaseKey(item = {}) {
  return [
    normalizeText(item.ownerDepartmentId) || "UNASSIGNED_OWNER",
    normalizeText(item.roomId) || "UNASSIGNED_ROOM",
    normalizeText(item.shiftCode || item.shiftId).toUpperCase() || "UNASSIGNED_SHIFT",
    resolveRequisitionDocumentDiscriminator(item),
  ].join("|");
}

export function selectRequisitionWorkNames(directNames, inferredNames) {
  const selected = directNames?.size ? directNames : inferredNames;
  return selected?.size ? Array.from(selected).filter(Boolean) : [];
}

export function findRequisitionWorkNames(namesByKey, key, parentSku) {
  const sku = normalizeSku(parentSku);
  return namesByKey.get(sku ? `${key}|${sku}` : key);
}

export async function loadRequisitionParentCategoryMap(supabase, planRows = []) {
  const skuCodes = Array.from(new Set(
    (Array.isArray(planRows) ? planRows : [])
      .map((row) => normalizeSku(row?.sku_code || row?.skuCode))
      .filter(Boolean)
  ));
  if (!skuCodes.length) return new Map();

  const data = await fetchSupabaseRowsByChunks(
    skuCodes,
    (chunk) => supabase
      .from("products_cache")
      .select("sku_code,iccat_code")
      .in("sku_code", chunk)
  );

  return new Map(
    (Array.isArray(data) ? data : [])
      .map((row) => [normalizeSku(row?.sku_code), normalizeText(row?.iccat_code).toUpperCase()])
      .filter(([skuCode]) => Boolean(skuCode))
  );
}
