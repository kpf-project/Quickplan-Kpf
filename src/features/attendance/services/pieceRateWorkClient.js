import { fetchJson } from "@/lib/clientFetch";

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const normalized = String(item || "").trim();
        if (normalized) {
          query.append(key, normalized);
        }
      });
      return;
    }

    const normalized = String(value).trim();
    if (!normalized) return;
    query.set(key, normalized);
  });

  return query.toString();
}

export async function fetchPieceRateProductLookup(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/attendance/piece-rate/product?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateEmployeeLookup(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/attendance/piece-rate/employee?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateOfflineMaster(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.set(key, String(value));
  });

  return fetchJson(`/api/attendance/piece-rate/offline-master?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function submitPieceRateLog(payload) {
  return fetchJson("/api/attendance/piece-rate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateReport(params = {}) {
  const query = buildQueryString(params);
  return fetchJson(`/api/attendance/piece-rate?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function updatePieceRateReportItem(id, payload) {
  return fetchJson(`/api/attendance/piece-rate/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}

export async function cancelPieceRateReportItem(id, payload) {
  return fetchJson(`/api/attendance/piece-rate/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateGroupDocuments(params = {}) {
  const query = buildQueryString(params);
  return fetchJson(`/api/attendance/piece-rate/group-documents?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateEmployeeSummary(params = {}) {
  const query = buildQueryString(params);
  return fetchJson(`/api/attendance/piece-rate/employee-summary?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateReportProducts(params = {}) {
  const query = buildQueryString(params);
  return fetchJson(`/api/attendance/piece-rate/products?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function fetchEditablePieceRateProducts(params = {}) {
  const query = buildQueryString({
    ...params,
    scope: "editable",
  });
  return fetchJson(`/api/attendance/piece-rate/products?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function issuePieceRateReportPrintDocument(payload) {
  return fetchJson("/api/attendance/piece-rate/print-document", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateReportRevisions(id) {
  return fetchJson(`/api/attendance/piece-rate/${id}/revisions`, {
    cacheStrategy: "realtime",
  });
}

export async function downloadPieceRateReportExcel(params = {}) {
  const query = buildQueryString(params);
  const response = await fetch(`/api/attendance/piece-rate/export?${query}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Export failed");
  }

  const disposition = response.headers.get("content-disposition") || "";
  const matched = disposition.match(/filename="?([^"]+)"?/i);

  return {
    blob: await response.blob(),
    filename: matched?.[1] || "piece-rate-report.xlsx",
  };
}

export async function importPieceRateLogs(payload) {
  return fetchJson("/api/attendance/piece-rate/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}
