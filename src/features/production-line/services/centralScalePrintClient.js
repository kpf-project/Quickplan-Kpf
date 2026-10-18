"use client";

import { createWeightScaleLabelBitmapPayload } from "./weightScaleLabelBitmap";
import { fetchCentralInboundPrintReceipt } from "./weightScaleLiveClient";

const AGENT = "http://127.0.0.1:41951";
const PRINTER_KEY = "kpf.central-scale.printer.v1";

async function agentRequest(path, body) {
  const response = await fetch(`${AGENT}${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(15000),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.error || "ส่งงานไปเครื่องพิมพ์ไม่สำเร็จ");
  return result.data ?? result;
}

export async function fetchCentralPrintAgentHealth() {
  return agentRequest("/health");
}

export async function fetchCentralPrinters() {
  const result = await agentRequest("/printers");
  return { printers: result.printers, selectedPrinterName: window.localStorage.getItem(PRINTER_KEY) || "" };
}

export async function saveCentralPrinterSelection({ printerName }) {
  const { printers } = await fetchCentralPrinters();
  if (!printers.some(printer => printer.name === printerName)) throw new Error("ไม่พบเครื่องพิมพ์ที่เลือกในคอมนี้");
  window.localStorage.setItem(PRINTER_KEY, printerName);
  return { printerName };
}

// Read the committed receipt again; no receive/write API is called when printing or reprinting.
export async function printCentralReceipt({ requestId, pointId, departmentId, productName }) {
  const receipt = await fetchCentralInboundPrintReceipt({ requestId, pointId, departmentId });
  if (receipt.request_id !== requestId || receipt.point_id !== pointId || receipt.department_id !== departmentId
    || !/^\d{14}$/.test(receipt.barcode) || !receipt.lot_no || !receipt.product_code
    || !Number.isFinite(Number(receipt.net_kg)) || Number(receipt.net_kg) <= 0) {
    throw new Error("ใบรับไม่ตรงกับคำขอ แผนก หรือจุดชั่งนี้ ห้ามพิมพ์");
  }
  const printerName = window.localStorage.getItem(PRINTER_KEY);
  if (!printerName) throw new Error("กรุณาเลือกเครื่องพิมพ์ของหน้าชั่งกลางก่อน");
  const payload = createWeightScaleLabelBitmapPayload({
    barcodeValue: receipt.barcode, productCode: receipt.product_code,
    productName: productName || receipt.product_code, lotNo: receipt.lot_no,
    tareWeightKg: receipt.tare_kg, netWeightKg: receipt.net_kg, weighedAt: receipt.created_at, unitLabel: "kg", weightDecimals: 3, timeZone: "Asia/Bangkok",
  }, { useNativeBarcode: true });
  return agentRequest("/central-scale/print", { ...payload, printerName });
}
