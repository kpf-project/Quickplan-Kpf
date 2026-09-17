"use client";

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "ไม่สามารถทำรายการเบิกได้ในขณะนี้");
  }
  return payload?.data ?? payload;
}

function buildSearchParams(config = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(config).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams;
}

export async function fetchProductionStockIssuePageData() {
  const response = await fetch("/api/production-stock/issues", {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function createProductionStockIssueRequest(payload) {
  const response = await fetch("/api/production-stock/issues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function createProductionStockIssuesBatchRequest(payload) {
  const response = await fetch("/api/production-stock/issues/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function cancelProductionStockIssueRequest(issueItemId, payload = {}) {
  const response = await fetch(`/api/production-stock/issues/${issueItemId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

function normalizeIssueTypeQuery(issueTypes, issueType) {
  if (Array.isArray(issueTypes) && issueTypes.length > 0) {
    return issueTypes.join(",");
  }

  if (issueType) {
    return issueType;
  }

  return undefined;
}

export async function fetchProductionStockIssueReport({
  dateFrom,
  dateTo,
  issueType,
  issueTypes,
  issueStatuses,
  productCodes,
  lotNos,
  page = 1,
  limit = 20,
  includeAll = false,
} = {}) {
  const searchParams = buildSearchParams({
    dateFrom,
    dateTo,
    issueTypes: normalizeIssueTypeQuery(issueTypes, issueType),
    issueStatuses: Array.isArray(issueStatuses) ? issueStatuses.join(",") : issueStatuses,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    lotNos: Array.isArray(lotNos) ? lotNos.join(",") : lotNos,
    page,
    limit,
    includeAll: includeAll ? "1" : undefined,
  });

  const response = await fetch(
    `/api/production-stock/issues/report?${searchParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseJsonResponse(response);
}

export async function fetchProductionStockIssueSummaryReport({
  dateFrom,
  dateTo,
  issueType,
  issueTypes,
  issueStatuses,
  productCodes,
  page = 1,
  limit = 20,
  includeAll = false,
} = {}) {
  const searchParams = buildSearchParams({
    dateFrom,
    dateTo,
    issueTypes: normalizeIssueTypeQuery(issueTypes, issueType),
    issueStatuses: Array.isArray(issueStatuses) ? issueStatuses.join(",") : issueStatuses,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    page,
    limit,
    includeAll: includeAll ? "1" : undefined,
  });

  const response = await fetch(
    `/api/production-stock/issues/report-summary?${searchParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseJsonResponse(response);
}

export async function fetchProductionStockMovementSummaryReport({
  dateFrom,
  dateTo,
  productCodes,
  lotNos,
  page = 1,
  limit = 20,
  includeAll = false,
} = {}) {
  const searchParams = buildSearchParams({
    dateFrom,
    dateTo,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    lotNos: Array.isArray(lotNos) ? lotNos.join(",") : lotNos,
    page,
    limit,
    includeAll: includeAll ? "1" : undefined,
  });

  const response = await fetch(
    `/api/production-stock/balance/summary?${searchParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseJsonResponse(response);
}

export async function fetchProductionStockLotBalanceSummaryReport({
  productCodes,
  page = 1,
  limit = 20,
  includeAll = false,
} = {}) {
  const searchParams = buildSearchParams({
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    page,
    limit,
    includeAll: includeAll ? "1" : undefined,
  });

  const response = await fetch(
    `/api/production-stock/balance?${searchParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseJsonResponse(response);
}

export async function fetchCancelableProductionStockIssues({
  dateFrom,
  dateTo,
  issueType,
  productCodes,
  barcode,
  page = 1,
  limit = 50,
} = {}) {
  const searchParams = buildSearchParams({
    dateFrom,
    dateTo,
    issueType,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    barcode,
    page,
    limit,
  });

  const response = await fetch(
    `/api/production-stock/issues/cancelable?${searchParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseJsonResponse(response);
}

export async function fetchProductionStockIssueAvailableReceipts({
  dateFrom,
  dateTo,
  search,
  productCodes,
  page = 1,
  limit = 50,
} = {}) {
  const searchParams = buildSearchParams({
    dateFrom,
    dateTo,
    search,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    page,
    limit,
  });

  const response = await fetch(
    `/api/production-stock/issues/available?${searchParams.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseJsonResponse(response);
}
