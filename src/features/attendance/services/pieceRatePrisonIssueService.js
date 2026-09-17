import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";

function text(value) {
  return String(value ?? "").trim();
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "กรุณาเลือก LOT อย่างน้อย 1 รายการ");
  }
  if (items.length > 50) throw new ApiError(400, "เบิกได้ไม่เกิน 50 LOT ต่อเอกสาร");
  return items.map((item) => {
    const lotNo = text(item?.lotNo);
    const weightKg = Number(item?.weightKg);
    if (!lotNo) throw new ApiError(400, "กรุณาระบุ LOT ให้ครบ");
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new ApiError(400, "น้ำหนักที่เบิกต้องมากกว่า 0 กก.");
    }
    return { lotNo, weightKg: Number(weightKg.toFixed(3)) };
  });
}

export async function listPieceRatePrisonIssueLots(supabaseAdmin = getSupabaseAdmin()) {
  const result = await supabaseAdmin.rpc("list_piece_rate_prison_issue_lots");
  if (result.error) {
    throw new ApiError(500, "โหลดสต็อกเนื้อขนมเรือนจำไม่สำเร็จ", result.error.message);
  }
  return {
    product: { code: "WKB-0002-2", quantityUnit: "กระบะ", weightUnit: "กก." },
    lots: (result.data || []).map((row, index) => ({
      lotNo: row.lot_no,
      receiptDate: row.receipt_date,
      receivedAt: row.received_at,
      availableQuantity: Number(row.available_tray_quantity || 0),
      availableWeightKg: Number(row.available_weight_kg || 0),
      fifoOrder: index + 1,
    })),
  };
}

export async function createPieceRatePrisonIssue(permission, body = {}, supabaseAdmin = getSupabaseAdmin()) {
  const fgProductCode = text(body.fgProductCode).toUpperCase();
  if (!fgProductCode) throw new ApiError(400, "กรุณาเลือกสินค้า FG ปลายทาง");
  const issueDate = text(body.issueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new ApiError(400, "วันที่เบิกไม่ถูกต้อง");
  }
  const fgProductResult = await supabaseAdmin
    .from("products_cache")
    .select("sku_name")
    .eq("sku_code", fgProductCode)
    .maybeSingle();
  if (fgProductResult.error) {
    throw new ApiError(500, "โหลดชื่อสินค้า FG ปลายทางไม่สำเร็จ", fgProductResult.error.message);
  }

  const result = await supabaseAdmin.rpc("create_piece_rate_prison_issue_atomic", {
    p_fg_product_code: fgProductCode,
    p_issue_date: issueDate,
    p_items: normalizeItems(body.items),
    p_actor_user_id: permission?.userId || null,
    p_metadata: {
      source: "piece_rate_prison_manual_issue",
      requestId: text(body.requestId) || crypto.randomUUID(),
      fgProductName: text(fgProductResult.data?.sku_name) || fgProductCode,
    },
  });
  if (result.error) {
    throw new ApiError(500, "บันทึกเบิกเนื้อขนมเรือนจำไม่สำเร็จ", result.error.message);
  }
  return result.data || {};
}
