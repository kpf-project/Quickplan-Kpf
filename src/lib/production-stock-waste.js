import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { findIssuedItemByBarcode } from "@/lib/production-stock-returns";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpperText(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeDecimal(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

export async function findWasteSourceItemByBarcode(
  barcode,
  supabaseAdmin = getSupabaseAdmin()
) {
  return findIssuedItemByBarcode(barcode, supabaseAdmin);
}

export async function createStockWaste(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const sourceBarcode = normalizeUpperText(input?.sourceBarcode);
  const wasteWeightKg = normalizeDecimal(input?.wasteWeightKg);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const remark = normalizeText(input?.remark) || "ชั่งของเสียผลิตภัณฑ์";

  if (!sourceBarcode) {
    throw new ApiError(400, "กรุณาระบุบาร์โค้ดที่ต้องการบันทึกของเสีย");
  }

  if (wasteWeightKg <= 0) {
    throw new ApiError(400, "น้ำหนักของเสียต้องมากกว่า 0");
  }

  const rpcResult = await supabaseAdmin.rpc("create_production_stock_waste", {
    p_source_barcode: sourceBarcode,
    p_waste_weight_kg: wasteWeightKg,
    p_actor_user_id: actorUserId,
    p_remark: remark,
  });

  if (rpcResult.error) {
    throw new ApiError(
      400,
      rpcResult.error.message || "ไม่สามารถบันทึกรายการของเสียได้"
    );
  }

  return rpcResult.data || null;
}
