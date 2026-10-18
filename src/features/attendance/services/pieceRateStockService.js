import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";
import { fetchAllSupabaseRows, fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";

const LOG_TABLE = "production_piece_rate_logs";
const ISSUE_TABLE = "production_piece_rate_stock_issues";
const RETURN_TABLE = "production_piece_rate_stock_returns";


function normalizeText(value) {
  const normalized = normalizeParam(value);
  return normalized ?? null;
}

function normalizeLookupCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePositiveWeight(value, fieldName = "weightKg") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} must be greater than 0`);
  }
  return Number(parsed.toFixed(3));
}

function normalizeBusinessDate(value, fieldLabel = "วันที่") {
  const normalized = normalizeText(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ApiError(400, `กรุณาระบุ${fieldLabel}ให้ถูกต้อง`);
  }
  return normalized;
}

function isMissingLifecycleTableError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error?.details || "").toLowerCase();
  return (
    code === "42P01"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_piece_rate_stock_issues")
    || message.includes("production_piece_rate_stock_returns")
  );
}

function mapLogRow(row) {
  return {
    id: row.id,
    docNo: row.doc_no || null,
    barcode: row.doc_no || null,
    lotNo: row.lot_no || null,
    docStatus: row.doc_status || "active",
    productCode: row.product_goods_code_snapshot || row.product_code_snapshot || null,
    productSkuCode: row.product_sku_code_snapshot || null,
    productBarcode: row.product_barcode_snapshot || null,
    productName: row.product_name_snapshot || null,
    employeeCode: row.employee_code || null,
    employeeName: row.employee_name_snapshot || null,
    weightKg: Number(row.normalized_kg_amount_snapshot || row.input_value || 0),
    countValue: Number(row.count_value_snapshot || 1),
    loggedAt: row.actual_weighed_at || row.logged_at || null,
  };
}

function mapIssueRow(row, returns = []) {
  const activeReturns = returns.filter((item) => item.return_status === "confirmed");
  const returnedWeightKg = Number(
    activeReturns.reduce((sum, item) => sum + Number(item.return_weight_kg || 0), 0).toFixed(3)
  );
  const issueWeightKg = Number(row.issue_weight_kg || 0);
  return {
    id: row.id,
    issueNo: row.issue_no,
    pieceRateLogId: row.piece_rate_log_id,
    pieceRateDocNo: row.piece_rate_doc_no,
    barcode: row.piece_rate_barcode,
    lotNo: row.lot_no || null,
    productCode: row.product_code,
    productName: row.product_name_snapshot,
    issueType: row.issue_type,
    issueWeightKg,
    issueStatus: row.issue_status,
    issueDate: row.issue_date || null,
    issuedAt: row.issued_at,
    issuedBy: row.issued_by || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || null,
    remark: row.remark || null,
    returnedWeightKg,
    remainingWeightKg: Number(Math.max(issueWeightKg - returnedWeightKg, 0).toFixed(3)),
    returns: activeReturns.map(mapReturnRow),
  };
}

function mapReturnRow(row) {
  return {
    id: row.id,
    returnNo: row.return_no,
    pieceRateIssueId: row.piece_rate_issue_id,
    pieceRateLogId: row.piece_rate_log_id,
    pieceRateDocNo: row.piece_rate_doc_no,
    barcode: row.return_barcode || row.piece_rate_barcode,
    sourceBarcode: row.piece_rate_barcode,
    returnDate: row.return_date || null,
    lotNo: row.lot_no || null,
    productCode: row.product_code,
    productName: row.product_name_snapshot,
    returnWeightKg: Number(row.return_weight_kg || 0),
    returnStatus: row.return_status,
    returnedAt: row.returned_at,
    returnedBy: row.returned_by || null,
    remark: row.remark || null,
  };
}

function throwStockRpcError(error, fallbackMessage) {
  const message = String(error?.message || error?.details || fallbackMessage);
  const status = String(error?.code || "").toUpperCase() === "P0001" ? 409 : 500;
  throw new ApiError(status, message, error?.details || null);
}

async function loadPieceRateLogByBarcode(supabaseAdmin, barcode) {
  const normalized = normalizeLookupCode(barcode);
  if (!normalized) {
    throw new ApiError(400, "กรุณาสแกนบาร์โค้ดป้ายแยม");
  }

  const { data, error } = await supabaseAdmin
    .from(LOG_TABLE)
    .select(
      [
        "id",
        "doc_no",
        "lot_no",
        "doc_status",
        "logged_at",
        "actual_weighed_at",
        "product_barcode_snapshot",
        "product_code_snapshot",
        "product_goods_code_snapshot",
        "product_sku_code_snapshot",
        "product_name_snapshot",
        "employee_code",
        "employee_name_snapshot",
        "input_value",
        "count_value_snapshot",
        "normalized_kg_amount_snapshot",
      ].join(",")
    )
    .eq("doc_no", normalized)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Failed to load piece-rate document", error.message);
  }

  if (!data) {
    throw new ApiError(404, `ไม่พบป้ายแยม ${normalized}`);
  }

  const log = mapLogRow(data);
  if (log.docStatus !== "active") {
    throw new ApiError(409, `เอกสาร ${normalized} ไม่อยู่ในสถานะใช้งาน`);
  }
  if (!log.productCode) {
    throw new ApiError(409, `เอกสาร ${normalized} ไม่มีรหัสสินค้า`);
  }
  if (log.weightKg <= 0) {
    throw new ApiError(409, `เอกสาร ${normalized} ไม่มีน้ำหนักสำหรับเบิก`);
  }

  return log;
}

async function loadIssueByLogId(supabaseAdmin, logId) {
  const { data, error } = await supabaseAdmin
    .from(ISSUE_TABLE)
    .select("*")
    .eq("piece_rate_log_id", logId)
    .eq("issue_status", "confirmed")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingLifecycleTableError(error)) {
      return null;
    }
    throw new ApiError(500, "Failed to load piece-rate stock issue", error.message);
  }

  return data || null;
}

async function loadIssueByBarcode(supabaseAdmin, barcode) {
  const { data, error } = await supabaseAdmin
    .from(ISSUE_TABLE)
    .select("*")
    .eq("piece_rate_barcode", normalizeLookupCode(barcode))
    .eq("issue_status", "confirmed")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError(500, "Failed to load piece-rate stock issue", error.message);
  return data || null;
}

async function loadStockLabelByBarcode(supabaseAdmin, barcode) {
  const normalized = normalizeLookupCode(barcode);
  const { data: returnRow, error: returnError } = await supabaseAdmin
    .from(RETURN_TABLE)
    .select("*")
    .eq("return_barcode", normalized)
    .eq("return_status", "confirmed")
    .maybeSingle();
  if (returnError && !isMissingLifecycleTableError(returnError)) {
    throw new ApiError(500, "Failed to load piece-rate return label", returnError.message);
  }
  const log = await loadPieceRateLogByBarcode(
    supabaseAdmin,
    returnRow?.piece_rate_doc_no || normalized
  );
  if (!returnRow) return { log, sourceReturn: null };
  return {
    sourceReturn: returnRow,
    log: {
      ...log,
      barcode: returnRow.return_barcode,
      weightKg: Number(returnRow.return_weight_kg || 0),
      lotNo: returnRow.lot_no || log.lotNo,
      productCode: returnRow.product_code || log.productCode,
      productSkuCode: returnRow.product_sku_code || log.productSkuCode,
      productName: returnRow.product_name_snapshot || log.productName,
      loggedAt: returnRow.returned_at || log.loggedAt,
    },
  };
}

async function loadReturnsByIssueId(supabaseAdmin, issueId) {
  if (!issueId) return [];
  const { data, error } = await supabaseAdmin
    .from(RETURN_TABLE)
    .select("*")
    .eq("piece_rate_issue_id", issueId)
    .order("returned_at", { ascending: true });

  if (error) {
    if (isMissingLifecycleTableError(error)) {
      return [];
    }
    throw new ApiError(500, "Failed to load piece-rate stock returns", error.message);
  }
  return data || [];
}

export async function lookupPieceRateStockDocument(request, barcode) {
  await requireTaskPermission(request, "production-piece-rate-stock-view");
  const supabaseAdmin = getSupabaseAdmin();
  const { log } = await loadStockLabelByBarcode(supabaseAdmin, barcode);
  const issueRow = await loadIssueByBarcode(supabaseAdmin, log.barcode);
  const returns = issueRow ? await loadReturnsByIssueId(supabaseAdmin, issueRow.id) : [];

  return {
    ok: true,
    data: {
      log,
      issue: issueRow ? mapIssueRow(issueRow, returns) : null,
      lifecycleStatus: issueRow ? "issued" : "weighed",
    },
  };
}

export async function listAvailablePieceRateStockLabels(request, productCode) {
  await requireTaskPermission(request, "production-piece-rate-stock-view");
  const normalizedProductCode = normalizeLookupCode(productCode);
  const supabaseAdmin = getSupabaseAdmin();
  const buildLogsQuery = () => {
    let query = supabaseAdmin
      .from(LOG_TABLE)
      .select("id,doc_no,lot_no,actual_weighed_at,logged_at,product_goods_code_snapshot,product_code_snapshot,product_sku_code_snapshot,product_name_snapshot,normalized_kg_amount_snapshot,input_value")
      .eq("doc_status", "active")
      .order("actual_weighed_at", { ascending: true, nullsFirst: false });
    if (normalizedProductCode) {
      query = query.or(`product_goods_code_snapshot.eq.${normalizedProductCode},product_code_snapshot.eq.${normalizedProductCode},product_sku_code_snapshot.eq.${normalizedProductCode}`);
    }
    return query;
  };
  const buildReturnsQuery = () => {
    let query = supabaseAdmin
      .from(RETURN_TABLE)
      .select("id,return_barcode,return_no,return_date,returned_at,lot_no,product_code,product_sku_code,product_name_snapshot,return_weight_kg,piece_rate_doc_no")
      .eq("return_status", "confirmed")
      .order("returned_at", { ascending: true });
    if (normalizedProductCode) {
      query = query.or(`product_code.eq.${normalizedProductCode},product_sku_code.eq.${normalizedProductCode}`);
    }
    return query;
  };
  const [logs, returns] = await Promise.all([
    fetchAllSupabaseRows(buildLogsQuery, {
      onError: (error) => {
        throw new ApiError(500, "Failed to load available piece-rate labels", error.message);
      },
    }),
    fetchAllSupabaseRows(buildReturnsQuery, {
      onError: (error) => {
        if (isMissingLifecycleTableError(error)) return [];
        throw new ApiError(500, "Failed to load available return labels", error.message);
      },
    }),
  ]);

  const candidates = [
    ...logs.map((row) => ({
      id: `log:${row.id}`,
      barcode: row.doc_no,
      labelType: "weigh",
      productCode: row.product_goods_code_snapshot || row.product_code_snapshot || row.product_sku_code_snapshot,
      productName: row.product_name_snapshot,
      lotNo: row.lot_no,
      weightKg: Number(row.normalized_kg_amount_snapshot || row.input_value || 0),
      recordedAt: row.actual_weighed_at || row.logged_at,
    })),
    ...returns.map((row) => ({
      id: `return:${row.id}`,
      barcode: row.return_barcode,
      labelType: "return",
      productCode: row.product_code || row.product_sku_code,
      productName: row.product_name_snapshot,
      lotNo: row.lot_no,
      weightKg: Number(row.return_weight_kg || 0),
      recordedAt: row.returned_at,
      businessDate: row.return_date,
    })),
  ].filter((row) => row.barcode && row.weightKg > 0);

  if (!candidates.length) return { ok: true, data: [] };
  const issuedRows = await fetchSupabaseRowsByChunks(
    candidates.map((row) => row.barcode),
    (chunk) => supabaseAdmin
      .from(ISSUE_TABLE)
      .select("piece_rate_barcode")
      .eq("issue_status", "confirmed")
      .in("piece_rate_barcode", chunk),
    { onError: (error) => {
      if (isMissingLifecycleTableError(error)) return [];
      throw new ApiError(500, "Failed to verify available piece-rate labels", error.message);
    } }
  );
  const issuedBarcodes = new Set((issuedRows || []).map((row) => normalizeLookupCode(row.piece_rate_barcode)));
  return {
    ok: true,
    data: candidates.filter((row) => !issuedBarcodes.has(normalizeLookupCode(row.barcode))),
  };
}

export async function createPieceRateStockIssue(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-stock-issue-write");
  const supabaseAdmin = getSupabaseAdmin();
  const barcode = body.barcode || body.pieceRateBarcode || body.docNo;
  const { log } = await loadStockLabelByBarcode(supabaseAdmin, barcode);
  const issueWeightKg = normalizePositiveWeight(body.issueWeightKg ?? log.weightKg, "issueWeightKg");
  const issueType = normalizeLookupCode(body.issueType || "KPF") || "KPF";
  const remark = normalizeText(body.remark) || "เบิกจากป้ายแยม";
  const issueDate = normalizeBusinessDate(body.issueDate || body.businessDate, "วันที่เบิก");

  const rpcResult = await supabaseAdmin.rpc("create_piece_rate_stock_issue_atomic", {
    p_piece_rate_doc_no: log.barcode,
    p_issue_weight_kg: issueWeightKg,
    p_issue_type: issueType,
    p_remark: remark,
    p_actor_user_id: permission.userId,
    p_issue_date: issueDate,
  });
  if (rpcResult.error) {
    throwStockRpcError(rpcResult.error, "Failed to create piece-rate stock issue");
  }

  const issueRow = await loadIssueByBarcode(supabaseAdmin, log.barcode);
  if (!issueRow) {
    throw new ApiError(500, "สร้างรายการเบิกแล้ว แต่ไม่สามารถโหลดเอกสารกลับมาได้");
  }

  const fgProductCode = normalizeParam(body.fgProductCode);
  const fgProductName = normalizeParam(body.fgProductName);
  const issueEmployeeCode = normalizeParam(body.issueEmployeeCode);
  const issueEmployeeName = normalizeParam(body.issueEmployeeName);

  // Update metadata in production_piece_rate_stock_issues table
  const currentMetadata = issueRow.metadata && typeof issueRow.metadata === "object" ? issueRow.metadata : {};
  const updatedMetadata = {
    ...currentMetadata,
    fgProductCode,
    fgProductName,
    issueDate,
    issueEmployeeCode,
    issueEmployeeName,
  };

  await supabaseAdmin
    .from(ISSUE_TABLE)
    .update({ metadata: updatedMetadata })
    .eq("id", issueRow.id);

  // Update metadata in production_stock_movements table
  if (issueRow.stock_movement_id) {
    const { data: movementRow } = await supabaseAdmin
      .from("production_stock_movements")
      .select("metadata")
      .eq("id", issueRow.stock_movement_id)
      .maybeSingle();

    const movementMetadata = movementRow?.metadata && typeof movementRow.metadata === "object" ? movementRow.metadata : {};
    const updatedMovementMetadata = {
      ...movementMetadata,
      employeeCode: issueEmployeeCode, // matches report column name
      employeeName: issueEmployeeName, // matches report column name
      fgProductCode,
      fgProductName,
      issueDate,
    };

    await supabaseAdmin
      .from("production_stock_movements")
      .update({ metadata: updatedMovementMetadata })
      .eq("id", issueRow.stock_movement_id);
  }

  // Reload the updated issue row
  const finalIssueRow = await loadIssueByBarcode(supabaseAdmin, log.barcode);

  return {
    ok: true,
    data: {
      log,
      issue: mapIssueRow(finalIssueRow || issueRow, []),
      lifecycleStatus: "issued",
    },
  };
}

export async function createPieceRateStockIssueBatch(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-stock-issue-write");
  const supabaseAdmin = getSupabaseAdmin();
  const barcodes = Array.from(new Set(
    (Array.isArray(body.barcodes) ? body.barcodes : [])
      .map(normalizeLookupCode)
      .filter(Boolean)
  ));
  if (!barcodes.length) throw new ApiError(400, "กรุณาเลือกรายการที่ต้องการเบิก");
  if (barcodes.length > 50) throw new ApiError(400, "เลือกเบิกได้ไม่เกิน 50 รายการต่อครั้ง");
  const issueDate = normalizeBusinessDate(body.issueDate || body.businessDate, "วันที่เบิก");

  const rpcResult = await supabaseAdmin.rpc("create_piece_rate_stock_issue_batch_atomic", {
    p_barcodes: barcodes,
    p_issue_type: normalizeLookupCode(body.issueType || "KPF") || "KPF",
    p_remark: normalizeText(body.remark) || "เบิกสินค้าจากรายการป้ายแยม",
    p_actor_user_id: permission.userId,
    p_issue_date: issueDate,
    p_metadata: {
      fgProductCode: normalizeParam(body.fgProductCode),
      fgProductName: normalizeParam(body.fgProductName),
      issueEmployeeCode: normalizeParam(body.issueEmployeeCode),
      issueEmployeeName: normalizeParam(body.issueEmployeeName),
      issueDate,
    },
  });
  if (rpcResult.error) {
    throwStockRpcError(rpcResult.error, "Failed to create piece-rate stock issue batch");
  }

  return {
    ok: true,
    data: rpcResult.data,
  };
}

export async function createPieceRateStockReturn(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-stock-return-write");
  const supabaseAdmin = getSupabaseAdmin();
  const barcode = body.barcode || body.pieceRateBarcode || body.docNo;
  const { log } = await loadStockLabelByBarcode(supabaseAdmin, barcode);
  const issueRow = await loadIssueByBarcode(supabaseAdmin, log.barcode);
  if (!issueRow) {
    throw new ApiError(409, `ป้ายแยม ${log.docNo} ยังไม่มีรายการเบิก`);
  }

  const returnWeightKg = normalizePositiveWeight(body.returnWeightKg ?? body.weightKg, "returnWeightKg");
  const returnDate = normalizeBusinessDate(body.returnDate || body.businessDate, "วันที่ชั่งคืน");
  const rpcResult = await supabaseAdmin.rpc("create_piece_rate_stock_return_atomic", {
    p_piece_rate_doc_no: log.barcode,
    p_return_weight_kg: returnWeightKg,
    p_remark: normalizeText(body.remark) || "ชั่งคืนจากป้ายแยม",
    p_actor_user_id: permission.userId,
    p_return_date: returnDate,
  });
  if (rpcResult.error) {
    throwStockRpcError(rpcResult.error, "Failed to create piece-rate stock return");
  }

  const updatedIssueRow = await loadIssueByBarcode(supabaseAdmin, log.barcode);
  const updatedReturns = await loadReturnsByIssueId(supabaseAdmin, issueRow.id);
  const createdReturnId = rpcResult.data?.returnId || rpcResult.data?.return_id || null;
  const createdReturn = updatedReturns.find((row) => row.id === createdReturnId)
    || updatedReturns.at(-1);
  const mappedIssue = mapIssueRow(updatedIssueRow || issueRow, updatedReturns);
  return {
    ok: true,
    data: {
      log,
      issue: mappedIssue,
      return: createdReturn ? mapReturnRow(createdReturn) : null,
      lifecycleStatus: mappedIssue.remainingWeightKg <= 0 ? "returned" : "partially_returned",
    },
  };
}

export async function cancelPieceRateStockIssue(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-stock-issue-cancel");
  const supabaseAdmin = getSupabaseAdmin();
  const barcode = body.barcode || body.pieceRateBarcode || body.docNo;
  const log = await loadPieceRateLogByBarcode(supabaseAdmin, barcode);
  const issueRow = await loadIssueByLogId(supabaseAdmin, log.id);
  if (!issueRow) {
    throw new ApiError(404, `ป้ายแยม ${log.docNo} ยังไม่มีรายการเบิกที่ยกเลิกได้`);
  }

  const cancelReason = normalizeText(body.cancelReason || body.voidReason)
    || "ยกเลิกจากหน้าสแกนป้ายแยม";

  const rpcResult = await supabaseAdmin.rpc("cancel_piece_rate_stock_issue_atomic", {
    p_piece_rate_doc_no: log.docNo,
    p_cancel_reason: cancelReason,
    p_actor_user_id: permission.userId,
  });
  if (rpcResult.error) {
    throwStockRpcError(rpcResult.error, "Failed to cancel piece-rate stock issue");
  }

  const { data: cancelledIssue, error: cancelledIssueError } = await supabaseAdmin
    .from(ISSUE_TABLE)
    .select("*")
    .eq("id", issueRow.id)
    .single();
  if (cancelledIssueError || !cancelledIssue) {
    throw new ApiError(500, "ยกเลิกเบิกแล้ว แต่ไม่สามารถโหลดเอกสารกลับมาได้", cancelledIssueError?.message);
  }

  return {
    ok: true,
    data: {
      log,
      issue: mapIssueRow(cancelledIssue, []),
      lifecycleStatus: "weighed",
    },
  };
}

export async function cancelPieceRateWeigh(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-weigh-cancel");
  const supabaseAdmin = getSupabaseAdmin();
  const barcode = body.barcode || body.pieceRateBarcode || body.docNo;
  const log = await loadPieceRateLogByBarcode(supabaseAdmin, barcode);
  const cancelReason = normalizeText(body.cancelReason || body.cancel_reason || body.voidReason)
    || "ยกเลิกชั่งจากหน้าสแกนป้ายแยม";

  const rpcResult = await supabaseAdmin.rpc("cancel_piece_rate_weigh_atomic", {
    p_piece_rate_doc_no: log.docNo,
    p_cancel_reason: cancelReason,
    p_actor_user_id: permission.userId,
  });
  if (rpcResult.error) {
    throwStockRpcError(rpcResult.error, "Failed to cancel piece-rate weigh document");
  }

  return {
    ok: true,
    data: {
      ...log,
      docStatus: "cancelled",
      lifecycleStatus: "cancelled",
    },
  };
}

export async function assertPieceRateLogHasNoActiveStockIssue(supabaseAdmin, logId) {
  const issue = await loadIssueByLogId(supabaseAdmin, logId);
  if (issue) {
    throw new ApiError(409, "เอกสารนี้มีรายการเบิกแล้ว ต้องยกเลิกเบิกก่อนยกเลิกชั่ง");
  }
}

export async function getBiscuitFgProducts(request) {
  await requireTaskPermission(request, "production-piece-rate-stock-view");
  const supabaseAdmin = getSupabaseAdmin();

  // Find Biscuit department (KP13)
  const { data: deptRow, error: deptError } = await supabaseAdmin
    .from("production_departments")
    .select("id")
    .eq("code", "KP13")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (deptError || !deptRow) {
    throw new ApiError(500, "ไม่พบรหัสแผนกบิสกิต KP13 ในระบบ");
  }

  // Load all products mapped to department KP13
  const { data: mappedRows, error: mappingsError } = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code")
    .eq("department_id", deptRow.id);

  if (mappingsError) {
    throw new ApiError(500, "โหลดความเชื่อมโยงแผนกและสินค้าไม่สำเร็จ", mappingsError.message);
  }

  const skuCodes = (mappedRows || []).map((row) => row.sku_code).filter(Boolean);
  if (!skuCodes.length) {
    return { ok: true, data: [] };
  }

  // Load details from products_cache where category is FG (04, 04-1, 04-2)
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code,uom_name,image_url")
    .in("sku_code", skuCodes)
    .in("iccat_code", ["04", "04-1", "04-2"])
    .eq("is_active", true)
    .order("sku_code", { ascending: true });

  if (productsError) {
    throw new ApiError(500, "โหลดรายละเอียดสินค้าจาก cache ไม่สำเร็จ", productsError.message);
  }

  const mappedProducts = (products || []).map((row) => ({
    code: row.sku_code,
    goodsCode: row.sku_code,
    skuCode: row.sku_code,
    name: row.sku_name,
    unitName: row.uom_name,
    iccatCode: row.iccat_code,
    imageUrl: row.image_url,
  }));

  return { ok: true, data: mappedProducts };
}
