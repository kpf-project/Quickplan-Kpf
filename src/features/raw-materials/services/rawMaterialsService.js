import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeCsvParam, normalizeParam, parsePaginationParams } from "@/lib/validation";
import { createAppError, fail, ok } from "@/lib/result";

const DEFAULT_ICCAT_CODES = "01,02,03,05,08,10";

function resolveIccatCodes(rawValue) {
  if (rawValue === null) {
    return DEFAULT_ICCAT_CODES;
  }
  const normalized = normalizeCsvParam(rawValue);
  if (normalized === null && rawValue !== null) {
    return "";
  }
  return normalized ?? DEFAULT_ICCAT_CODES;
}

function validatePagination(page, pageSize) {
  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), { status: 400 });
  }
  return ok({ page, pageSize });
}

function shouldBypassGatewayCache(request) {
  const { searchParams } = new URL(request.url);
  const bypassQuery = String(searchParams.get("noCache") || "").toLowerCase();
  const bypassHeader = String(request.headers.get("x-cache-bust") || "").toLowerCase();
  return [bypassQuery, bypassHeader].some((value) => value === "1" || value === "true");
}

function applyCacheBypass(params, request) {
  if (shouldBypassGatewayCache(request)) {
    params.set("noCache", "1");
  }
}

export async function listRawMaterials(request) {
  await requirePermissionKeys(request, ["raw-materials-lot"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) {
    return paginationCheck;
  }

  const brandCodes = normalizeCsvParam(searchParams.get("brandCodes"));
  const iccatCodes = resolveIccatCodes(searchParams.get("iccatCodes"));
  const skuName = normalizeParam(searchParams.get("skuName"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const cursor = normalizeParam(searchParams.get("cursor"));
  const positiveOnly = normalizeParam(searchParams.get("positiveOnly"));
  const warehouseCode = normalizeParam(searchParams.get("warehouseCode"));
  const costStatus = normalizeParam(searchParams.get("costStatus"));

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (brandCodes) {
    params.set("brandCodes", brandCodes);
  }
  if (iccatCodes !== null) {
    params.set("iccatCodes", iccatCodes ?? "");
  }
  if (skuName) {
    params.set("skuName", skuName);
  }
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (positiveOnly) {
    params.set("positiveOnly", positiveOnly);
  }
  if (warehouseCode) {
    params.set("warehouseCode", warehouseCode);
  }
  if (["ready", "review", "missing"].includes(costStatus)) {
    params.set("costStatus", costStatus);
  }
  params.set("unitSchema", "4");
  applyCacheBypass(params, request);

  const result = await fetchGatewayJson("/api/raw-materials", params, 'production');
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}

export async function listRawMaterialsSummary(request) {
  await requirePermissionKeys(request, ["raw-materials-summary"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) {
    return paginationCheck;
  }

  const brandCodes = normalizeCsvParam(searchParams.get("brandCodes"));
  const iccatCodes = resolveIccatCodes(searchParams.get("iccatCodes"));
  const skuName = normalizeParam(searchParams.get("skuName"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const cursor = normalizeParam(searchParams.get("cursor"));

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (brandCodes) {
    params.set("brandCodes", brandCodes);
  }
  if (iccatCodes !== null) {
    params.set("iccatCodes", iccatCodes ?? "");
  }
  if (skuName) {
    params.set("skuName", skuName);
  }
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("summaryUnitSchema", "1");
  applyCacheBypass(params, request);

  const result = await fetchGatewayJson("/api/raw-materials-summary", params, 'production');
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}

export async function listRawMaterialsMovement(request) {
  await requirePermissionKeys(request, ["raw-materials-movement"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) {
    return paginationCheck;
  }

  const brandCodes = normalizeCsvParam(searchParams.get("brandCodes"));
  const iccatCodes = resolveIccatCodes(searchParams.get("iccatCodes"));
  const skuName = normalizeParam(searchParams.get("skuName"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const cursor = normalizeParam(searchParams.get("cursor"));

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (brandCodes) {
    params.set("brandCodes", brandCodes);
  }
  if (iccatCodes !== null) {
    params.set("iccatCodes", iccatCodes ?? "");
  }
  if (skuName) {
    params.set("skuName", skuName);
  }
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  applyCacheBypass(params, request);

  const result = await fetchGatewayJson("/api/raw-materials-movement", params, 'production');
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}

export async function listRawMaterialLotCosts(request) {
  await requirePermissionKeys(request, ["raw-materials-lot"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) return paginationCheck;

  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    costSchema: "1",
  });
  for (const key of ["search", "iccatCodes", "costStatus", "cursor"]) {
    const value = normalizeParam(searchParams.get(key));
    if (value) params.set(key, value);
  }
  applyCacheBypass(params, request);

  const result = await fetchGatewayJson("/api/raw-material-lot-costs", params, "production");
  return result.ok ? ok(result.data, { status: result.status }) : result;
}

export async function listRawMaterialReceipts(request) {
  await requirePermissionKeys(request, ["raw-materials-lot"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) return paginationCheck;

  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    receiptCostSchema: "3",
  });
  for (const key of [
    "search",
    "iccatCodes",
    "warehouseCode",
    "costStatus",
    "dateFrom",
    "dateTo",
    "cursor",
    "export",
  ]) {
    const value = normalizeParam(searchParams.get(key));
    if (value) params.set(key, value);
  }
  applyCacheBypass(params, request);

  const result = await fetchGatewayJson("/api/raw-material-receipts", params, "production");
  return result.ok ? ok(result.data, { status: result.status }) : result;
}

export async function listProductionReceipts(request) {
  await requirePermissionKeys(request, ["raw-materials-lot"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) return paginationCheck;

  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    schema: "1",
  });
  for (const key of [
    "search",
    "warehouseCode",
    "costStatus",
    "dateFrom",
    "dateTo",
    "cursor",
    "export",
  ]) {
    const value = normalizeParam(searchParams.get(key));
    if (value) params.set(key, value);
  }
  applyCacheBypass(params, request);

  const result = await fetchGatewayJson("/api/production-receipts", params, "production");
  return result.ok ? ok(result.data, { status: result.status }) : result;
}

export async function listRawMaterialReturns(request) {
  await requirePermissionKeys(request, ["raw-material-returns"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) {
    return paginationCheck;
  }

  const search = normalizeParam(searchParams.get("search"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const cursor = normalizeParam(searchParams.get("cursor"));

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (search) {
    params.set("search", search);
  }
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const result = await fetchGatewayJson("/api/raw-material-returns", params, 'production');
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}

export async function listRawMaterialRequisitions(request) {
  await requirePermissionKeys(request, ["admin-requisition"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const paginationCheck = validatePagination(page, pageSize);
  if (!paginationCheck.ok) {
    return paginationCheck;
  }

  const search = normalizeParam(searchParams.get("search"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const cursor = normalizeParam(searchParams.get("cursor"));

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (search) {
    params.set("search", search);
  }
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const result = await fetchGatewayJson("/api/raw-material-requisitions", params, 'production');
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}
