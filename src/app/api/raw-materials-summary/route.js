import { jsonError } from "@/lib/adminApi";
import { toJsonResponse, ok } from "@/lib/result";
import { listRawMaterialsSummary } from "@/features/raw-materials/services/rawMaterialsService";
import { applyStockDeduction } from "@/lib/stockDeduction";
import { recordApiCall } from "@/lib/performanceMonitor";
export const dynamic = "force-dynamic";

const SUMMARY_FIELDS = [
  "SKU_CODE",
  "SKU_NAME",
  "UTQ_NAME",
  "STOCK_UNIT_NAME",
  "STOCK_UNIT_FACTOR",
  "BASE_UNIT_NAME",
  "ICCAT_CODE",
  "ICCAT_NAME",
  "QTY",
  "QTY_BASE",
];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const trimPayloadData = (payload, fields) => {
  if (!payload || !Array.isArray(payload.data)) {
    return payload;
  }
  const trimmedData = payload.data.map((row) => {
    const next = {};
    fields.forEach((field) => {
      if (hasOwn(row, field)) {
        next[field] = row[field];
      }
    });
    return next;
  });
  return { ...payload, data: trimmedData };
};

export async function GET(request) {
  const start = performance.now();
  let response;
  try {
    const { searchParams } = new URL(request.url);
    const skipDeduction = searchParams.get("skipDeduction") === "true";

    const result = await listRawMaterialsSummary(request);

    if (!result.ok) {
      response = toJsonResponse(result);
      return response;
    }

    // Skip deduction for stock inventory page
    if (skipDeduction) {
      const trimmedPayload = trimPayloadData(result.data, SUMMARY_FIELDS);
      response = toJsonResponse(ok(trimmedPayload, { status: result.status }));
      return response;
    }

    // Apply FIFO stock deduction transparently
    const deductionStart = performance.now();
    const deductedData = await applyStockDeduction(
      result.data,
      "summary",
      request
    );
    const deductionDuration = performance.now() - deductionStart;
    recordApiCall("raw-materials:deduction", deductionDuration, false, {
      source: "next-api",
    });

    const trimmedPayload = trimPayloadData(deductedData, SUMMARY_FIELDS);
    response = toJsonResponse(ok(trimmedPayload, { status: result.status }));
    return response;
  } catch (error) {
    response = jsonError(error);
    return response;
  } finally {
    const duration = performance.now() - start;
    recordApiCall("api:raw-materials-summary", duration, false, {
      status: response?.status ?? 500,
      source: "next-api",
    });
  }
}
