import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";

const PRODUCT_CODE = "WKB-0002-2";
const RECEIPT_TABLE = "production_piece_rate_prison_receipts";
const ITEM_TABLE = "production_piece_rate_prison_receipt_items";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "กรุณาระบุรายการรับเข้าอย่างน้อย 1 LOT");
  }
  if (items.length > 50) {
    throw new ApiError(400, "บันทึกได้ไม่เกิน 50 LOT ต่อเอกสาร");
  }

  return items.map((item) => {
    const lotNo = normalizeText(item?.lotNo);
    const quantity = Number(item?.quantity);
    const weightKg = Number(item?.weightKg);
    if (!lotNo) throw new ApiError(400, "กรุณาระบุหมายเลข LOT ให้ครบทุกแถว");
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiError(400, "จำนวนกระบะต้องเป็นจำนวนเต็มมากกว่า 0");
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new ApiError(400, "น้ำหนักต้องมากกว่า 0 กก.");
    }
    return {
      lotNo,
      quantity,
      weightKg: Number(weightKg.toFixed(3)),
      remark: normalizeText(item?.remark) || null,
    };
  });
}

function mapReceipt(row) {
  return {
    id: row.id,
    documentNo: row.document_no,
    receiptDate: row.receipt_date,
    productCode: row.product_code,
    productName: row.product_name_snapshot,
    weightUnit: row.weight_uom_snapshot,
    totalQuantity: Number(row.total_tray_quantity || 0),
    totalWeightKg: Number(row.total_weight_kg || 0),
    itemCount: Number(row.item_count || 0),
    createdAt: row.created_at,
    items: (row.production_piece_rate_prison_receipt_items || []).map((item) => ({
      id: item.id,
      lineNo: item.line_no,
      lotNo: item.lot_no,
      quantity: Number(item.tray_quantity || 0),
      weightKg: Number(item.weight_kg || 0),
      remark: item.remark || "",
    })),
  };
}

export async function loadPieceRatePrisonReceiptProduct(supabaseAdmin = getSupabaseAdmin()) {
  const result = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,uom_name,iccat_code")
    .eq("sku_code", PRODUCT_CODE)
    .maybeSingle();
  if (result.error) {
    throw new ApiError(500, "โหลดข้อมูลสินค้าเรือนจำไม่สำเร็จ", result.error.message);
  }
  if (!result.data) {
    throw new ApiError(404, `ไม่พบสินค้า ${PRODUCT_CODE}`);
  }
  return {
    code: result.data.sku_code,
    name: result.data.sku_name || PRODUCT_CODE,
    weightUnit: result.data.uom_name || "KG",
    quantityUnit: "กระบะ",
  };
}

export async function listPieceRatePrisonReceipts(supabaseAdmin = getSupabaseAdmin()) {
  const [product, receiptResult] = await Promise.all([
    loadPieceRatePrisonReceiptProduct(supabaseAdmin),
    supabaseAdmin
      .from(RECEIPT_TABLE)
      .select(`*,${ITEM_TABLE}(id,line_no,lot_no,tray_quantity,weight_kg,remark)`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (receiptResult.error) {
    throw new ApiError(500, "โหลดรายการรับเข้าเรือนจำไม่สำเร็จ", receiptResult.error.message);
  }
  return { product, receipts: (receiptResult.data || []).map(mapReceipt) };
}

export async function createPieceRatePrisonReceipt(permission, body = {}, supabaseAdmin = getSupabaseAdmin()) {
  const items = normalizeItems(body.items);
  const result = await supabaseAdmin.rpc("create_piece_rate_prison_receipt_atomic", {
    p_items: items,
    p_actor_user_id: permission?.userId || null,
    p_metadata: {
      source: "piece_rate_prison_manual_receipt",
      requestId: normalizeText(body.requestId) || crypto.randomUUID(),
    },
  });
  if (result.error) {
    throw new ApiError(500, "บันทึกรับเข้าเรือนจำไม่สำเร็จ", result.error.message);
  }
  const payload = result.data || {};
  if (!String(payload.documentNo || "").startsWith("PRW-")) {
    throw new ApiError(500, "ฐานข้อมูลไม่ได้ส่งเลขเอกสาร PRW กลับมา");
  }
  return payload;
}
