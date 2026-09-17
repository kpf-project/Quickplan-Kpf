import { jsonError } from "@/lib/adminApi";
import { toJsonResponse, ok } from "@/lib/result";
import { listRawMaterials } from "@/features/raw-materials/services/rawMaterialsService";
import { applyStockDeduction } from "@/lib/stockDeduction";
import { recordApiCall } from "@/lib/performanceMonitor";
export const dynamic = "force-dynamic";

const LOT_FIELDS = [
  "GOODS_CODE",
  "BASE_GOODS_CODE",
  "STOCK_GOODS_CODE",
  "SKU_CODE",
  "SKU_NAME",
  "WL_CODE",
  "WL_NAME",
  "UTQ_NAME",
  "STOCK_UNIT_NAME",
  "STOCK_UNIT_FACTOR",
  "BASE_UNIT_NAME",
  "SKM_LOT_NO",
  "QTY",
  "UTQ_K_NAME",
  "QTY_K",
  "QTY_BASE",
  "ICCAT_CODE",
  "ICCAT_NAME",
  "RECEIVED_BASE_QTY",
  "NET_PURCHASE_AMOUNT",
  "UNIT_COST",
  "INVENTORY_VALUE",
  "COST_STATUS",
  "COST_REVIEW_REASON",
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

const filterPositiveRows = (payload) => {
  if (!payload || !Array.isArray(payload.data)) {
    return payload;
  }
  return {
    ...payload,
    data: payload.data.filter((row) => Number(row?.QTY) > 0),
  };
};

export async function GET(request) {
  const start = performance.now();
  let response;
  try {
    const { searchParams } = new URL(request.url);
    const skipDeduction = searchParams.get("skipDeduction") === "true";
    const positiveOnly = ["true", "1"].includes(String(searchParams.get("positiveOnly") || "").toLowerCase());
    const result = await listRawMaterials(request);
    if (!result.ok) {
      response = toJsonResponse(result);
      return response;
    }

    let payload = result.data;

    if (skipDeduction) {
      payload = trimPayloadData(payload, LOT_FIELDS);
      if (positiveOnly) {
        payload = filterPositiveRows(payload);
      }
      response = toJsonResponse(ok(payload, { status: result.status }));
      return response;
    }

    const deductionStart = performance.now();
    const deductedData = await applyStockDeduction(
      payload,
      "lot",
      request
    );
    const deductionDuration = performance.now() - deductionStart;
    recordApiCall("raw-materials:deduction", deductionDuration, false, {
      source: "next-api",
    });

    payload = trimPayloadData(deductedData, LOT_FIELDS);
    if (positiveOnly) {
      payload = filterPositiveRows(payload);
    }

    response = toJsonResponse(ok(payload, { status: result.status }));
    return response;
  } catch (error) {
    response = jsonError(error);
    return response;
  } finally {
    const duration = performance.now() - start;
    recordApiCall("api:raw-materials", duration, false, {
      status: response?.status ?? 500,
      source: "next-api",
    });
  }
}
