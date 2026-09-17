import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { resolvePieceRateProductByBarcode } from "@/features/attendance/services/pieceRateWorkService";
import {
  normalizePositiveWasteWeight,
  normalizeWasteMachineCode,
} from "@/lib/pieceRateWasteValidation";

const WASTE_LOG_TABLE = "production_piece_rate_waste_logs";
const WASTE_CATEGORIES = new Set(["label_scrap", "broken_scrap", "burnt_scrap"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeBarcode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeCapturedAt(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "เวลาที่ชั่งไม่ถูกต้อง");
  }
  return parsed.toISOString();
}

function mapWasteLog(row, duplicated = false) {
  return {
    duplicated,
    data: {
      id: row.id,
      requestId: row.request_id,
      productBarcode: row.product_barcode_snapshot,
      productCode: row.product_goods_code_snapshot || row.product_code_snapshot,
      productSkuCode: row.product_sku_code_snapshot,
      productName: row.product_name_snapshot,
      productBrandName: row.product_brand_name_snapshot,
      wasteCategory: row.waste_category,
      wasteWeightKg: Number(row.waste_weight_kg || 0),
      machineCode: row.machine_code,
      actualWeighedAt: row.actual_weighed_at,
      loggedAt: row.logged_at,
    },
  };
}

async function findWasteLogByRequestId(supabaseAdmin, requestId) {
  const result = await supabaseAdmin
    .from(WASTE_LOG_TABLE)
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();

  if (result.error) {
    throw new ApiError(500, "ไม่สามารถตรวจสอบรายการของเสียซ้ำได้", result.error.message);
  }
  return result.data || null;
}

export async function createPieceRateWasteLog(permission, body = {}, supabaseAdmin = getSupabaseAdmin()) {
  const requestId = normalizeText(body.requestId || body.idempotencyKey || crypto.randomUUID());
  if (!requestId) {
    throw new ApiError(400, "requestId is required");
  }

  const existing = await findWasteLogByRequestId(supabaseAdmin, requestId);
  if (existing) {
    return mapWasteLog(existing, true);
  }

  const productBarcode = normalizeBarcode(body.productBarcode || body.product_barcode);
  if (!productBarcode) {
    throw new ApiError(400, "กรุณาสแกนบาร์โค้ดสินค้า");
  }

  const wasteCategory = normalizeText(body.wasteCategory || body.waste_category).toLowerCase();
  if (!WASTE_CATEGORIES.has(wasteCategory)) {
    throw new ApiError(400, "กรุณาเลือกประเภทของเสีย");
  }

  let wasteWeightKg;
  try {
    wasteWeightKg = normalizePositiveWasteWeight(
      body.wasteWeightKg ?? body.waste_weight_kg ?? body.weightKg
    );
  } catch (error) {
    throw new ApiError(400, error.message);
  }
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? body.metadata
    : {};
  const machineCode = normalizeWasteMachineCode(
    body.machineCode || body.machine_code || metadata.machineCode || metadata.machine_code
  );
  if (!machineCode) {
    throw new ApiError(400, "machineCode ต้องเป็นตัวอักษรหรือตัวเลข 2-8 ตัว");
  }

  const actualWeighedAt = normalizeCapturedAt(
    body.actualWeighedAt || body.actual_weighed_at || metadata?.scaleAudit?.capturedAt
  );
  const resolved = await resolvePieceRateProductByBarcode(supabaseAdmin, productBarcode);
  const productCode = resolved.product.goodsCode || resolved.product.code;

  const payload = {
    request_id: requestId,
    product_barcode_snapshot: resolved.barcode,
    product_code_snapshot: resolved.product.skuCode || productCode,
    product_goods_code_snapshot: productCode,
    product_sku_code_snapshot: resolved.product.skuCode || null,
    product_name_snapshot: resolved.product.name || productCode,
    product_brand_code_snapshot: resolved.product.brandCode || null,
    product_brand_name_snapshot: resolved.product.brandName || null,
    product_unit_snapshot: resolved.product.unitName || null,
    waste_category: wasteCategory,
    waste_weight_kg: wasteWeightKg,
    machine_code: machineCode,
    raw_product_barcode_payload: normalizeText(
      body.rawProductBarcodePayload || body.raw_product_barcode_payload || productBarcode
    ),
    actual_weighed_at: actualWeighedAt,
    operator_user_id: permission?.userId || null,
    metadata: {
      ...metadata,
      source: "piece_rate_waste_scan",
      machineCode,
      scaleAudit: metadata.scaleAudit || null,
    },
  };

  const insertResult = await supabaseAdmin
    .from(WASTE_LOG_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (insertResult.error?.code === "23505") {
    const duplicate = await findWasteLogByRequestId(supabaseAdmin, requestId);
    if (duplicate) {
      return mapWasteLog(duplicate, true);
    }
  }
  if (insertResult.error) {
    throw new ApiError(500, "บันทึกของเสียไม่สำเร็จ", insertResult.error.message);
  }

  return mapWasteLog(insertResult.data, false);
}
