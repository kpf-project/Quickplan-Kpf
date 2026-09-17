function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function buildQueryString(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || fallbackMessage);
  }
  return payload?.data ?? payload;
}

function appendCommonFilters(params, filters = {}) {
  return {
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    productCodes: normalizeStringArray(filters.productCodes).join(",") || undefined,
    barcode: filters.barcode || undefined,
    issueStatuses: normalizeStringArray(filters.issueStatuses).join(",") || undefined,
    page: filters.page || undefined,
    limit: filters.limit || undefined,
    ...params,
  };
}

export async function createProductionPrisonIssueRequest(input) {
  const response = await fetch("/api/production-stock/prison/issues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      barcode: String(input?.barcode || "").trim(),
      issuedAt: input?.issuedAt,
    }),
  });

  return parseJsonResponse(response, "ไม่สามารถบันทึกรายการเบิกเรือนจำได้");
}

export async function createProductionPrisonIssuesBatchRequest(input) {
  const response = await fetch("/api/production-stock/prison/issues/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      barcodes: normalizeStringArray(input?.barcodes),
      issuedAt: input?.issuedAt,
    }),
  });

  return parseJsonResponse(response, "ไม่สามารถบันทึกรายการเบิกเรือนจำที่เลือกได้");
}

export async function cancelProductionPrisonIssueRequest(issueItemId) {
  const response = await fetch(`/api/production-stock/prison/issues/${issueItemId}/cancel`, {
    method: "POST",
  });

  return parseJsonResponse(response, "ไม่สามารถยกเลิกรายการเบิกเรือนจำได้");
}

export async function cancelProductionPrisonInboundRequest(inboundItemId) {
  const response = await fetch(`/api/production-stock/prison/inbound/${inboundItemId}/cancel`, {
    method: "POST",
  });

  return parseJsonResponse(response, "ไม่สามารถยกเลิกชั่งเรือนจำได้");
}

export async function fetchProductionPrisonIssueCancelable(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({}, filters));
  const response = await fetch(`/api/production-stock/prison/issues/cancelable${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายการเบิกเรือนจำที่ยกเลิกได้");
}

export async function fetchProductionPrisonIssueAvailable(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({
    search: filters.search || undefined,
  }, filters));
  const response = await fetch(`/api/production-stock/prison/issues/available${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายการที่พร้อมเบิกออกเรือนจำได้");
}

export async function fetchProductionPrisonInboundCancelable(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({}, filters));
  const response = await fetch(`/api/production-stock/prison/inbound/cancelable${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายการรับเข้าเรือนจำที่ยกเลิกได้");
}

export async function fetchProductionPrisonIssueReport(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({}, filters));
  const response = await fetch(`/api/production-stock/prison/issues/report${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายงานเบิกเรือนจำได้");
}

export async function fetchProductionPrisonIssueSummaryReport(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({}, filters));
  const response = await fetch(`/api/production-stock/prison/issues/report-summary${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายงานสรุปเบิกเรือนจำได้");
}

export async function fetchProductionPrisonLotBalanceReport(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({}, filters));
  const response = await fetch(`/api/production-stock/prison/balance/lot${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายงาน Lot คงค้างเรือนจำได้");
}

export async function fetchProductionPrisonMovementSummaryReport(filters = {}) {
  const queryString = buildQueryString(appendCommonFilters({}, filters));
  const response = await fetch(`/api/production-stock/prison/balance/summary${queryString}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response, "ไม่สามารถโหลดรายงานสรุปชั่ง-เบิกเรือนจำได้");
}
