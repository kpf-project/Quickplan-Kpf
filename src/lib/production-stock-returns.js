import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { calculateStockReturnWeights } from "@/features/production-line/services/stockReturnWeight";
import { buildReturnableIssuePickerData } from "@/features/production-line/services/stockReturnPicker";
import {
  fetchAllSupabaseRows,
  fetchSupabaseRowsByChunks,
} from "@/lib/supabaseRangeFetch";

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

function normalizeOptionalIsoDate(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new ApiError(400, "วันที่ค้นหาไม่ถูกต้อง");
  }
  return normalizedValue;
}

function normalizeDateStartIso(value) {
  const normalizedValue = normalizeOptionalIsoDate(value);
  return normalizedValue
    ? new Date(`${normalizedValue}T00:00:00+07:00`).toISOString()
    : null;
}

function normalizeDateEndIso(value) {
  const normalizedValue = normalizeOptionalIsoDate(value);
  if (!normalizedValue) {
    return null;
  }
  const date = new Date(`${normalizedValue}T00:00:00+07:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function normalizeProductCodes(values) {
  const normalizedValues = Array.isArray(values) ? values : [values];
  return Array.from(
    new Set(normalizedValues.map((value) => normalizeUpperText(value)).filter(Boolean))
  );
}

function isMissingUsageProgressError(error) {
  const code = normalizeUpperText(error?.code);
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_stock_issue_usage_progress")
  );
}

async function loadUsageProgressByIssueItemId(
  issueItemId,
  supabaseAdmin = getSupabaseAdmin()
) {
  if (!issueItemId) {
    return {
      returnCount: 0,
      returnedWeightKg: 0,
      returnedQuantity: 0,
      wasteCount: 0,
      wastedWeightKg: 0,
      wastedQuantity: 0,
      remainingWeightKg: 0,
      lastReturnedAt: null,
      lastWastedAt: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("production_stock_issue_usage_progress_v")
    .select(
      "return_count,returned_quantity,returned_weight_kg,last_returned_at,waste_count,wasted_quantity,wasted_weight_kg,last_wasted_at,remaining_weight_kg"
    )
    .eq("source_issue_item_id", issueItemId)
    .maybeSingle();

  if (error) {
    if (isMissingUsageProgressError(error)) {
      return {
        returnCount: 0,
        returnedWeightKg: 0,
        returnedQuantity: 0,
        wasteCount: 0,
        wastedWeightKg: 0,
        wastedQuantity: 0,
        remainingWeightKg: 0,
        lastReturnedAt: null,
        lastWastedAt: null,
      };
    }

    throw new Error("ไม่สามารถตรวจสอบประวัติการคืนและของเสียได้");
  }

  return {
    returnCount: Number.parseInt(String(data?.return_count ?? 0), 10) || 0,
    returnedQuantity: normalizeDecimal(data?.returned_quantity),
    returnedWeightKg: normalizeDecimal(data?.returned_weight_kg),
    wasteCount: Number.parseInt(String(data?.waste_count ?? 0), 10) || 0,
    wastedQuantity: normalizeDecimal(data?.wasted_quantity),
    wastedWeightKg: normalizeDecimal(data?.wasted_weight_kg),
    remainingWeightKg: normalizeDecimal(data?.remaining_weight_kg),
    lastReturnedAt: data?.last_returned_at || null,
    lastWastedAt: data?.last_wasted_at || null,
  };
}

async function loadUsageProgressRows(
  supabaseAdmin,
  issueItemIds
) {
  const normalizedIssueItemIds = Array.from(
    new Set((Array.isArray(issueItemIds) ? issueItemIds : []).map(normalizeText).filter(Boolean))
  );
  if (!normalizedIssueItemIds.length) {
    return [];
  }

  return fetchSupabaseRowsByChunks(
    normalizedIssueItemIds,
    (chunk) => supabaseAdmin
      .from("production_stock_issue_usage_progress_v")
      .select(
        "source_issue_item_id,return_count,returned_weight_kg,waste_count,wasted_weight_kg,remaining_weight_kg"
      )
      .in("source_issue_item_id", chunk),
    {
      chunkSize: 80,
      onError: (error) => {
        if (isMissingUsageProgressError(error)) {
          throw new Error("ไม่สามารถยืนยันยอดคงเหลือที่ชั่งคืนได้");
        }
        throw new Error("ไม่สามารถโหลดประวัติการคืนและของเสียได้");
      },
    }
  );
}

export async function loadReturnableIssuedItems(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    search = "",
    productCodes = [],
    page = 1,
    limit = 50,
  } = {}
) {
  const normalizedDateFrom = normalizeOptionalIsoDate(dateFrom);
  const normalizedDateTo = normalizeOptionalIsoDate(dateTo);
  const normalizedProductCodes = normalizeProductCodes(productCodes);

  const issueRows = await fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_stock_issue_report_lines_v")
        .select(
          "issue_item_id,issue_document_id,source_receipt_id,barcode,product_code,product_name_snapshot,lot_no,weight_kg,item_status,document_status,issued_at,target_product_code,target_product_name_snapshot,target_product_category_code"
        )
        .eq("item_status", "confirmed")
        .eq("document_status", "confirmed")
        .order("issued_at", { ascending: false });

      const startIso = normalizeDateStartIso(normalizedDateFrom);
      const endIso = normalizeDateEndIso(normalizedDateTo || normalizedDateFrom);
      if (startIso) {
        query = query.gte("issued_at", startIso);
      }
      if (endIso) {
        query = query.lt("issued_at", endIso);
      }
      if (normalizedProductCodes.length) {
        query = query.in("product_code", normalizedProductCodes);
      }
      return query;
    },
    {
      onError: (error) => {
        console.error("loadReturnableIssuedItems issue query error:", error);
        throw new Error("ไม่สามารถโหลดรายการที่ชั่งคืนได้");
      },
    }
  );
  const progressRows = await loadUsageProgressRows(
    supabaseAdmin,
    issueRows.map((row) => row.issue_item_id)
  );
  const payload = buildReturnableIssuePickerData({
    issueRows,
    progressRows,
    search,
    page,
    limit,
  });

  return {
    ...payload,
    filters: {
      dateFrom: normalizedDateFrom || "",
      dateTo: normalizedDateTo || "",
      search: normalizeText(search),
      productCodes: normalizedProductCodes,
    },
  };
}

export async function findIssuedItemByBarcode(
  barcode,
  supabaseAdmin = getSupabaseAdmin()
) {
  const normalizedBarcode = normalizeUpperText(barcode);
  if (!normalizedBarcode) {
    throw new ApiError(400, "กรุณากรอกหรือสแกนรหัสบาร์โค้ด");
  }

  const { data, error } = await supabaseAdmin
    .from("production_stock_issue_report_lines_v")
    .select("*")
    .eq("barcode", normalizedBarcode)
    .eq("item_status", "confirmed")
    .eq("document_status", "confirmed")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("ไม่สามารถตรวจสอบข้อมูลบาร์โค้ดได้");
  }

  if (!data) {
    throw new ApiError(
      404,
      `ไม่พบบาร์โค้ด ${normalizedBarcode} ในรายการเบิกที่ยังใช้งานอยู่`
    );
  }

  const { data: sourceReceipt, error: sourceReceiptError } = await supabaseAdmin
    .from("production_weight_receipts")
    .select("tare_weight_kg")
    .eq("id", data.source_receipt_id)
    .maybeSingle();

  if (sourceReceiptError) {
    throw new Error("ไม่สามารถอ่านน้ำหนักภาชนะจากใบรับเข้าได้");
  }

  const progress = await loadUsageProgressByIssueItemId(
    data.issue_item_id,
    supabaseAdmin
  );
  const originalWeightKg = normalizeDecimal(data.weight_kg);
  const remainingWeightKg = progress.remainingWeightKg
    || Number(
      Math.max(
        originalWeightKg - progress.returnedWeightKg - progress.wastedWeightKg,
        0
      ).toFixed(3)
    );

  if (remainingWeightKg <= 0) {
    throw new ApiError(
      409,
      `บาร์โค้ด ${normalizedBarcode} ถูกคืนครบแล้ว ไม่สามารถคืนซ้ำได้`
    );
  }

  return {
    issueItemId: normalizeText(data.issue_item_id),
    issueDocumentId: normalizeText(data.issue_document_id),
    barcode: normalizeText(data.barcode),
    productCode: normalizeUpperText(data.product_code),
    productName: normalizeText(data.product_name_snapshot),
    targetProductCode: normalizeUpperText(data.target_product_code),
    targetProductName: normalizeText(data.target_product_name_snapshot),
    targetProductCategoryCode: normalizeUpperText(data.target_product_category_code),
    lotNo: normalizeText(data.lot_no),
    categoryCode: normalizeText(data.category_code),
    uomName: normalizeText(data.uom_name),
    quantity: normalizeDecimal(data.quantity) || 1,
    originalWeightKg,
    sourceTareWeightKg: normalizeDecimal(sourceReceipt?.tare_weight_kg),
    returnedWeightKg: progress.returnedWeightKg,
    wastedWeightKg: progress.wastedWeightKg,
    remainingWeightKg,
    returnCount: progress.returnCount,
    wasteCount: progress.wasteCount,
    lastReturnedAt: progress.lastReturnedAt,
    lastWastedAt: progress.lastWastedAt,
    issuedAt: data.issued_at,
    departmentId: normalizeText(data.department_id),
    departmentCode: normalizeText(data.department_code),
    sourceReceiptId: normalizeText(data.source_receipt_id),
  };
}

export async function createStockReturn(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const sourceBarcode = normalizeUpperText(input?.sourceBarcode);
  const weights = calculateStockReturnWeights({
    grossWeightKg: input?.grossWeightKg,
    tareWeightKg: input?.tareWeightKg,
  });
  const tareSource = normalizeText(input?.tareSource) === "manual"
    ? "manual"
    : "source_receipt";
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const remark = normalizeText(input?.remark) || "ชั่งคืนผลิตภัณฑ์";
  const returnDate = normalizeOptionalIsoDate(input?.returnDate);

  if (!sourceBarcode) {
    throw new ApiError(400, "กรุณาระบุบาร์โค้ดที่ต้องการคืน");
  }

  if (!weights.isValid) {
    throw new ApiError(400, weights.error);
  }

  const rpcResult = await supabaseAdmin.rpc("create_production_stock_return", {
    p_source_barcode: sourceBarcode,
    p_gross_weight_kg: weights.grossWeightKg,
    p_tare_weight_kg: weights.tareWeightKg,
    p_tare_source: tareSource,
    p_actor_user_id: actorUserId,
    p_remark: remark,
  });

  if (rpcResult.error) {
    throw new ApiError(
      400,
      rpcResult.error.message || "ไม่สามารถบันทึกรายการคืนสินค้าได้"
    );
  }

  const returnData = rpcResult.data;

  // Align business date if a backdated/custom date is specified
  if (returnDate && returnData?.id) {
    const returnBangkokTimestamp = `${returnDate}T12:00:00+07:00`;

    if (returnData.movementNo) {
      await supabaseAdmin
        .from("production_stock_movements")
        .update({
          movement_date: returnDate,
        })
        .eq("movement_no", returnData.movementNo);
    }

    await supabaseAdmin
      .from("production_weight_receipts")
      .update({
        weighed_at: returnBangkokTimestamp,
      })
      .eq("id", returnData.id);

    returnData.returnDate = returnDate;
  }

  return returnData || null;
}
