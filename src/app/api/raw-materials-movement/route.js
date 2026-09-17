import { jsonError } from "@/lib/adminApi";
import { ok, toJsonResponse } from "@/lib/result";
import { listRawMaterialsMovement } from "@/features/raw-materials/services/rawMaterialsService";
import { recordApiCall } from "@/lib/performanceMonitor";

export const dynamic = "force-dynamic";

const MOVEMENT_FIELDS = [
  "SKU_CODE",
  "SKU_NAME",
  "UTQ_NAME",
  "OPENING_QTY",
  "IN_PURCHASE_QTY",
  "IN_RETURN_QTY",
  "OUT_QTY",
  "ENDING_QTY",
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
    const result = await listRawMaterialsMovement(request);
    if (!result.ok) {
      response = toJsonResponse(result);
      return response;
    }

    const trimmedPayload = trimPayloadData(result.data, MOVEMENT_FIELDS);
    response = toJsonResponse(ok(trimmedPayload, { status: result.status }));
    return response;
  } catch (error) {
    response = jsonError(error);
    return response;
  } finally {
    const duration = performance.now() - start;
    recordApiCall("api:raw-materials-movement", duration, false, {
      status: response?.status ?? 500,
      source: "next-api",
    });
  }
}
