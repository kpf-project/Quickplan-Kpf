"use client";

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Live scale request failed.");
  }
  return payload?.data ?? payload;
}

export async function saveWeightScaleLiveReceipt(payload) {
  const response = await fetch("/api/scale/live/receipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  return parseJsonResponse(response);
}

export async function recoverWeightScaleLiveReceipt(requestId) {
  return parseJsonResponse(await fetch(`/api/scale/live/receipts?${new URLSearchParams({ requestId })}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }));
}

export async function fetchCentralInboundHistory(params) {
  return parseJsonResponse(await fetch(`/api/scale/live/history?${new URLSearchParams(params)}`, {
    cache: "no-store", signal: AbortSignal.timeout(15000),
  }));
}

export async function fetchCentralInboundPrintReceipt(params) {
  return parseJsonResponse(await fetch(`/api/scale/live/receipts/print?${new URLSearchParams(params)}`, {
    cache: "no-store", signal: AbortSignal.timeout(15000),
  }));
}

export async function fetchCentralInboundReadiness(params) {
  return parseJsonResponse(await fetch(`/api/scale/live/readiness?${new URLSearchParams(params)}`, {
    cache: "no-store", signal: AbortSignal.timeout(15000),
  }));
}

export async function resolveCentralInboundPending({ requestId, departmentId, pointId, productCode }) {
  return parseJsonResponse(await fetch("/api/scale/live/receipts/resolve", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ requestId, departmentId, pointId, productCode }), signal: AbortSignal.timeout(15000),
  }));
}

export async function fetchWeightScaleLiveOperation(payload) {
  const response = await fetch(`/api/scale/live/operations?${new URLSearchParams(payload)}`, { cache: "no-store" });
  return parseJsonResponse(response);
}

export async function requestWeightScaleLiveIssue(payload, write = false) {
  const response = await fetch(write ? "/api/scale/live/issues" : `/api/scale/live/issues?${new URLSearchParams(payload)}`, {
    method: write ? "POST" : "GET", cache: "no-store",
    ...(write ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
  });
  return parseJsonResponse(response);
}

export async function submitWeightScaleLiveOperation(payload) {
  const response = await fetch("/api/scale/live/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

// shortcut: setup and reprint stay unavailable until an independent live store exists.
async function unavailableLiveSetup() {
  throw new Error("ยังไม่เปิดตั้งค่า LOT หรือทำรายการ ระบบข้อมูลหน้ากลางต้องแยกจากระบบชั่งเดิมก่อน");
}


export const fetchLocalPrintAgentHealth = unavailableLiveSetup;
export const fetchLocalPrinters = unavailableLiveSetup;
export const saveLocalPrinterSelection = unavailableLiveSetup;
export const saveScaleAgentSerialConfig = unavailableLiveSetup;



