"use client";

import { createWeightScaleLabelBitmapPayload } from "@/features/production-line/services/weightScaleLabelBitmap";
import { createPieceRateLabelBitmapPayload } from "@/features/attendance/services/pieceRateLabelBitmap";
import { createWasteLabelBitmapPayload } from "@/features/production-line/services/wasteLabelBitmap";

const DEFAULT_PRINT_AGENT_URL = "http://127.0.0.1:41951";

function resolveBaseUrl() {
  if (typeof window !== "undefined") {
    const configured = window.localStorage.getItem(
      "kpf-weight-scale-print-agent-url-v1"
    );
    const normalizedConfigured = String(configured || "").trim();
    if (normalizedConfigured) {
      return normalizedConfigured.replace(/\/+$/, "");
    }
  }

  return DEFAULT_PRINT_AGENT_URL;
}

async function parseAgentResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Local print agent request failed.");
  }

  return payload?.data ?? payload;
}

export async function printWeightScaleLabelViaAgent(payload) {
  const baseUrl = resolveBaseUrl();
  const printPayload = createWeightScaleLabelBitmapPayload(payload);
  const response = await fetch(`${baseUrl}/print/weight-scale-label`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(printPayload),
  });

  return parseAgentResponse(response);
}

export async function printPieceRateLabelViaAgent(payload) {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/print/piece-rate-label`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(createPieceRateLabelBitmapPayload(payload)),
  });
  return parseAgentResponse(response);
}

export async function printWasteLabelViaAgent(payload) {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/print/piece-rate-label`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(createWasteLabelBitmapPayload(payload)),
  });
  return parseAgentResponse(response);
}

export function getDefaultPrintAgentUrl() {
  return DEFAULT_PRINT_AGENT_URL;
}

export async function fetchLocalPrintAgentHealth() {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/health`, {
    method: "GET",
    cache: "no-store",
  });

  return parseAgentResponse(response);
}

export async function fetchPieceRatePrintAgentHealth() {
  return fetchLocalPrintAgentHealth();
}

export async function fetchPieceRatePrinters() {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/piece-rate/printers`, { method: "GET", cache: "no-store" });
  return parseAgentResponse(response);
}

export async function savePieceRatePrinterSelection(payload) {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/piece-rate/config/printer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  return parseAgentResponse(response);
}

export async function fetchLocalPrinters() {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/printers`, {
    method: "GET",
    cache: "no-store",
  });

  return parseAgentResponse(response);
}

export async function saveLocalPrinterSelection(payload) {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/config/printer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseAgentResponse(response);
}
