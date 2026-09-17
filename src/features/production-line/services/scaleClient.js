"use client";

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

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Scale request failed.");
  }
  return payload?.data ?? payload;
}

export async function fetchScaleCurrent(config) {
  const searchParams = buildSearchParams(config);
  const response = await fetch(`/api/scale/current?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return parseJsonResponse(response);
}

export async function fetchScaleProducts() {
  const response = await fetch("/api/scale/products", {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function fetchScaleLots() {
  const response = await fetch("/api/scale/lots", {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function saveScaleProductConfig(payload) {
  const response = await fetch("/api/scale/product-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function createScaleLot(payload) {
  const response = await fetch("/api/scale/lots", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function setScaleCurrentLot(payload) {
  const response = await fetch("/api/scale/lots", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function fetchScaleRecentReceipts({
  departmentId,
  limit = 20,
  weightSource,
} = {}) {
  const searchParams = buildSearchParams({
    departmentId,
    limit,
    weightSource,
  });
  const response = await fetch(`/api/scale/receipts?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function fetchScaleReceiptReport({
  departmentId,
  limit = 50,
  page = 1,
  dateFrom,
  dateTo,
  search,
  lotNo,
  isTest,
  itemStatus,
  productCodes,
  includeAll,
  recordType,
} = {}) {
  const searchParams = buildSearchParams({
    departmentId,
    limit,
    page,
    dateFrom,
    dateTo,
    search,
    lotNo,
    isTest,
    itemStatus,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    includeAll: includeAll ? "1" : undefined,
    recordType,
  });

  const response = await fetch(`/api/scale/receipts/report?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export function logScaleReceiptReportPrint(payload) {
  return fetch("/api/scale/receipts/report/print-log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify(payload),
  }).then(parseJsonResponse);
}

export async function previewScaleReceiptErpExport(filters = {}) {
  const response = await fetch("/api/scale/receipts/erp-export/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ filters }),
  });

  return parseJsonResponse(response);
}

export async function exportScaleReceiptErpExcel(filters = {}) {
  const response = await fetch("/api/scale/receipts/erp-export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ filters }),
  });
  const payload = await response.blob();

  if (!response.ok) {
    let message = "Export ERP ไม่สำเร็จ";
    try {
      const text = await payload.text();
      const parsed = JSON.parse(text);
      message = parsed?.error || message;
    } catch (error) {
      // Keep default message when the server did not return JSON.
    }
    throw new Error(message);
  }

  return {
    blob: payload,
    fileName:
      response.headers
        .get("Content-Disposition")
        ?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
        ?.slice(1)
        .find(Boolean)
        ? decodeURIComponent(
            response.headers
              .get("Content-Disposition")
              .match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
              .slice(1)
              .find(Boolean)
          )
        : "erp-wip-receipt.xlsx",
    batchId: response.headers.get("X-Erp-Export-Batch-Id") || "",
    documentCount: Number(response.headers.get("X-Erp-Export-Document-Count") || 0),
    rowCount: Number(response.headers.get("X-Erp-Export-Row-Count") || 0),
  };
}

export async function fetchScaleReceiptSummaryReport({
  departmentId,
  limit = 50,
  page = 1,
  dateFrom,
  dateTo,
  productCodes,
  itemStatus,
  includeAll,
} = {}) {
  const searchParams = buildSearchParams({
    departmentId,
    limit,
    page,
    dateFrom,
    dateTo,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    itemStatus,
    includeAll: includeAll ? "1" : undefined,
  });

  const response = await fetch(`/api/scale/receipts/report-summary?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function saveScaleReceipt(payload) {
  const response = await fetch("/api/scale/receipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function fetchCancelableScaleReceipts({
  departmentId,
  limit = 50,
  page = 1,
  dateFrom,
  dateTo,
  barcode,
  productCodes,
  status,
} = {}) {
  const searchParams = buildSearchParams({
    departmentId,
    limit,
    page,
    dateFrom,
    dateTo,
    barcode,
    productCodes: Array.isArray(productCodes) ? productCodes.join(",") : productCodes,
    status,
  });

  const response = await fetch(`/api/scale/receipts/cancelable?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function cancelScaleReceiptRequest(receiptId, payload = {}) {
  const normalizedReceiptId = String(receiptId || "").trim();
  if (!normalizedReceiptId) {
    throw new Error("ไม่พบรายการชั่งที่ต้องการยกเลิก");
  }

  const response = await fetch(`/api/scale/receipts/${normalizedReceiptId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function fetchStableScale(config, stableConfig) {
  const response = await fetch("/api/scale/stable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      config,
      stableConfig,
    }),
  });

  return parseJsonResponse(response);
}

export function createScaleStream(config, handlers = {}) {
  const searchParams = buildSearchParams(config);
  const eventSource = new EventSource(`/api/scale/stream?${searchParams.toString()}`);

  eventSource.addEventListener("status", (event) => {
    const payload = JSON.parse(event.data);
    handlers.onStatus?.(payload);
  });

  eventSource.addEventListener("weight", (event) => {
    const payload = JSON.parse(event.data);
    handlers.onWeight?.(payload);
  });

  eventSource.addEventListener("device-error", (event) => {
    const payload = JSON.parse(event.data);
    handlers.onDeviceError?.(payload);
  });

  eventSource.onerror = () => {
    handlers.onTransportError?.();
  };

  return eventSource;
}
