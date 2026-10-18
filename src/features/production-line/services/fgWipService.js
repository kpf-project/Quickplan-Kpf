import "server-only";

import crypto from "crypto";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { toBangkokDateKey } from "@/lib/bangkokDate";
import { buildFgPackingReportRows } from "@/features/production-line/utils/buildFgPackingReportRows";

const FG_DEPARTMENT_CODE = "KP13";
const FG_CATEGORY_CODES = ["04", "04-1", "04-2"];
const TRADE_CODE_PAGE_SIZE = 500;
const TRADE_CODE_MAX_PAGES = 10;
const WIP_ISSUE_PURPOSES = new Set([
  "production_use",
  "customer_sample",
  "quality_test",
  "internal_use",
  "other",
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, `${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function parsePositiveWeight(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} must be greater than zero`);
  }
  return Math.round(parsed * 1000) / 1000;
}

function parseDdMmYyLot(value) {
  const lotNo = normalizeText(value);
  if (!/^\d{6}$/.test(lotNo)) {
    throw new ApiError(400, "LOT ต้องเป็นตัวเลข 6 หลัก รูปแบบ DDMMYY");
  }
  const day = Number(lotNo.slice(0, 2));
  const month = Number(lotNo.slice(2, 4));
  const year = 2000 + Number(lotNo.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ApiError(400, `LOT ${lotNo} ไม่ใช่วันที่จริงในรูปแบบ DDMMYY`);
  }
  return lotNo;
}

function normalizeUuidList(value) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => normalizeText(item))
      .filter((item) => uuidPattern.test(item))
  ));
}

function isMissingTargetDocumentColumnError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error?.details || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("target_document_id");
}

function isMissingOptionalTableError(error, tableName) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error?.details || "").toLowerCase();
  const normalizedTable = String(tableName || "").toLowerCase();
  return (
    code === "42P01"
    || code === "PGRST205"
    || (normalizedTable && message.includes(normalizedTable) && message.includes("schema cache"))
  );
}

async function loadPackingCarryoverMovements(supabaseAdmin, productionDate) {
  const buildQuery = (columns) => supabaseAdmin
    .from("production_wip_can_movements")
    .select(columns)
    .eq("movement_date", productionDate)
    .eq("movement_type", "issue")
    .gt("quantity_out", 0);
  const result = await buildQuery("id,document_id,target_document_id,quantity_out");
  if (!result.error || !isMissingTargetDocumentColumnError(result.error)) return result;
  const fallback = await buildQuery("id,document_id,quantity_out");
  return {
    ...fallback,
    data: (fallback.data ?? []).map((row) => ({ ...row, target_document_id: null })),
  };
}

async function fetchRowsByValueChunks(values, buildQuery, { chunkSize = 50, concurrency = 4 } = {}) {
  const uniqueValues = Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
  if (!uniqueValues.length) return { data: [], error: null };
  const chunks = [];
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    chunks.push(uniqueValues.slice(index, index + chunkSize));
  }

  const rows = [];
  for (let index = 0; index < chunks.length; index += concurrency) {
    const results = await Promise.all(chunks.slice(index, index + concurrency).map(buildQuery));
    const failed = results.find((result) => result.error);
    if (failed) return { data: [], error: failed.error };
    results.forEach((result) => rows.push(...(result.data ?? [])));
  }
  return { data: rows, error: null };
}

function mapTradeCode(row) {
  const productCode = normalizeText(row?.SKU_CODE || row?.GOODS_CODE).toUpperCase();
  const barcode = normalizeText(row?.GOODS_CODE).toUpperCase();
  const tinsPerCase = Number.parseInt(String(row?.UTQ_QTY_2 ?? row?.UTQ_QTY ?? ""), 10);
  return {
    productCode,
    productName: normalizeText(row?.SKU_NAME || row?.GOODS_ALIAS || productCode),
    barcode,
    unitName: normalizeText(row?.UTQ_NAME_2 || row?.UTQ_NAME || "กล่อง"),
    subUnitName: normalizeText(row?.UTQ_NAME || row?.UTQ_NAME_1 || "ปี๊บ"),
    tinsPerCase: Number.isFinite(tinsPerCase) && tinsPerCase > 0 ? tinsPerCase : 1,
    categoryCode: normalizeText(row?.ICCAT_CODE).toUpperCase(),
  };
}

async function loadKp13FgSkuCodes(supabaseAdmin) {
  const departmentResult = await supabaseAdmin
    .from("production_departments")
    .select("id")
    .eq("code", FG_DEPARTMENT_CODE)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (departmentResult.error) {
    throw new ApiError(500, "โหลดแผนก KP13 ไม่สำเร็จ", departmentResult.error.message);
  }
  if (!departmentResult.data) {
    throw new ApiError(500, "ไม่พบแผนก KP13 ที่เปิดใช้งาน");
  }

  const mappingResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code,products_cache!inner(iccat_code,is_active)")
    .eq("department_id", departmentResult.data.id)
    .in("products_cache.iccat_code", FG_CATEGORY_CODES)
    .eq("products_cache.is_active", true);
  if (mappingResult.error) {
    throw new ApiError(500, "โหลดสินค้าที่ตั้งค่าให้ KP13 ไม่สำเร็จ", mappingResult.error.message);
  }

  return new Set(
    (mappingResult.data ?? [])
      .map((row) => normalizeText(row?.sku_code).toUpperCase())
      .filter(Boolean)
  );
}

async function loadTradeCodes(search, allowedSkuCodes) {
  if (!allowedSkuCodes?.size) return [];
  const rows = [];
  let cursor = null;
  for (let page = 1; page <= TRADE_CODE_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(TRADE_CODE_PAGE_SIZE),
      iccatCodes: FG_CATEGORY_CODES.join(","),
    });
    if (search) params.set("search", search);
    if (cursor) params.set("cursor", cursor);
    const result = await fetchGatewayJson("/api/trade-codes", params, "production");
    if (!result.ok) {
      throw new ApiError(result.status || 502, "Failed to load FG products", result.error?.message);
    }
    const pageRows = result.data?.data ?? [];
    if (Array.isArray(pageRows)) rows.push(...pageRows);
    const nextCursor = result.data?.cursor?.next || null;
    if (!result.data?.cursor?.hasMore || !nextCursor) break;
    cursor = nextCursor;
  }

  return rows
    .map(mapTradeCode)
    .filter((row) =>
      row.productCode
      && allowedSkuCodes.has(row.productCode)
      && FG_CATEGORY_CODES.includes(row.categoryCode)
    );
}

export async function listFgProducts(request) {
  await requireTaskPermission(request, "production-fg-wip-view");
  const search = normalizeText(new URL(request.url).searchParams.get("search"));
  const supabaseAdmin = getSupabaseAdmin();

  let resolvedSearch = search;
  if (search) {
    const { data: barcodeRow } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code")
      .eq("product_barcode", search.toUpperCase())
      .maybeSingle();
    if (barcodeRow?.goods_code) {
      resolvedSearch = barcodeRow.goods_code;
    }
  }

  const allowedSkuCodes = await loadKp13FgSkuCodes(supabaseAdmin);
  const rows = await loadTradeCodes(resolvedSearch, allowedSkuCodes);

  // Load mapped product barcodes
  const goodsCodes = rows.map((r) => r.barcode).filter(Boolean);
  const barcodeMap = new Map();
  if (goodsCodes.length > 0) {
    const { data: barcodeRows } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code, product_barcode")
      .in("goods_code", goodsCodes);
    (barcodeRows ?? []).forEach((b) => {
      barcodeMap.set(b.goods_code.toUpperCase(), b.product_barcode);
    });
  }

  const unique = new Map();
  rows.forEach((row) => {
    const key = `${row.productCode}::${row.barcode}::${row.tinsPerCase}`;
    if (!unique.has(key)) {
      unique.set(key, {
        ...row,
        realBarcode: barcodeMap.get(row.barcode.toUpperCase()) || null,
      });
    }
  });
  return { data: Array.from(unique.values()) };
}

function buildLotNo(productionDate) {
  const [year, month, day] = productionDate.split("-");
  return `${day}${month}${String(year).slice(-2)}`;
}

function buildDocumentNo(productionDate) {
  const compactDate = productionDate.replaceAll("-", "").slice(2);
  return `FWO-${compactDate}-${Date.now().toString(36).toUpperCase()}`;
}

async function resolveSelectedProduct(selection) {
  const productCode = normalizeText(selection?.productCode).toUpperCase();
  const barcode = normalizeText(selection?.barcode).toUpperCase();
  const searchCandidates = [productCode, barcode];
  if (!searchCandidates.some(Boolean)) throw new ApiError(400, "FG product is required");
  const supabaseAdmin = getSupabaseAdmin();

  let mappedGoodsCode = "";
  if (barcode) {
    const { data: barcodeRow } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code")
      .eq("product_barcode", barcode)
      .maybeSingle();
    mappedGoodsCode = normalizeText(barcodeRow?.goods_code).toUpperCase();
    if (mappedGoodsCode) searchCandidates.push(mappedGoodsCode);
  }

  const allowedSkuCodes = await loadKp13FgSkuCodes(supabaseAdmin);
  for (const search of new Set(searchCandidates.filter(Boolean))) {
    const rows = await loadTradeCodes(search, allowedSkuCodes);
    const exact = rows.find((row) => (
      productCode
        ? (row.productCode === productCode && (!barcode || row.barcode === barcode))
          || (row.productCode === productCode && Boolean(mappedGoodsCode) && row.barcode === mappedGoodsCode)
        : row.barcode === barcode || row.barcode === mappedGoodsCode
    ));
    if (exact) return exact;
  }

  throw new ApiError(404, "FG product was not found in Trade Code");
}

async function resolveBaseWipTradeCode(product) {
  const rows = await loadTradeCodes(product.productCode, new Set([product.productCode]));
  const baseTradeCode = rows.find((row) => row.barcode === product.productCode);
  if (!baseTradeCode) {
    throw new ApiError(422, `ไม่พบ Trade Code หน่วยย่อย ${product.productCode} สำหรับบันทึก WIP ค้างไลน์`);
  }
  return baseTradeCode;
}

export async function createFgWipDocument(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-fg-wip-write");
  const requestId = normalizeText(body.requestId) || crypto.randomUUID();
  const productionDate = toBangkokDateKey(body.productionDate || new Date());
  if (!productionDate) throw new ApiError(400, "productionDate is invalid");

  const product = await resolveSelectedProduct(body.product);
  const fgCaseQty = parsePositiveInteger(body.fgCaseQty, "fgCaseQty");
  const wipTinQty = parseNonNegativeInteger(body.wipTinQty, "wipTinQty");
  const wipProduct = wipTinQty > 0 ? await resolveBaseWipTradeCode(product) : null;
  const lotNo = buildLotNo(productionDate);
  const documentNo = buildDocumentNo(productionDate);
  const carriedWipMovementIds = normalizeUuidList(body.carriedWipMovementIds);

  const supabaseAdmin = getSupabaseAdmin();
  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", permission.userId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin.rpc("record_fg_wip_end_of_day", {
    p_request_id: requestId,
    p_document_no: documentNo,
    p_production_date: productionDate,
    p_shift_name: normalizeText(body.shiftName) || null,
    p_lot_no: lotNo,
    p_fg_product_code: product.productCode,
    p_fg_product_name: product.productName,
    p_fg_barcode: product.barcode,
    p_fg_unit: product.unitName,
    p_tins_per_case: product.tinsPerCase,
    p_fg_case_qty: fgCaseQty,
    p_wip_product_code: wipProduct?.productCode || null,
    p_wip_product_name: wipProduct?.productName || null,
    p_wip_barcode: wipProduct?.barcode || null,
    p_wip_tin_qty: wipTinQty,
    p_operator_user_id: permission.userId,
    p_operator_username: profileResult.data?.username || permission.user?.email || null,
    p_notes: normalizeText(body.notes) || null,
    p_metadata: {
      source: "fg_wip_end_of_day",
      lotGeneratedAutomatically: true,
      carriedWipMovementIds,
    },
  });
  if (error) throw new ApiError(500, "Failed to save FG and WIP", error.message);

  if (carriedWipMovementIds.length > 0) {
    const linkResult = await supabaseAdmin
      .from("production_wip_can_movements")
      .update({ target_document_id: data.id })
      .in("id", carriedWipMovementIds)
      .eq("movement_type", "issue")
      .is("target_document_id", null);
    if (linkResult.error) {
      if (!isMissingTargetDocumentColumnError(linkResult.error)) {
        throw new ApiError(500, "บันทึกผลผลิตแล้ว แต่ผูกยอด WIP ยกมากับ FG ไม่สำเร็จ", linkResult.error.message);
      }
    }
  }
  return { data, lotNo, documentNo };
}

function buildWipMovementNo(issueDate) {
  return `WIP-ISS-${issueDate.replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
}

async function loadWipStockRows(supabaseAdmin) {
  const [normalResult, openingResult] = await Promise.all([
    supabaseAdmin
      .from("production_wip_can_movements")
      .select("id,document_id,movement_type,movement_date,product_code,product_name_snapshot,barcode,lot_no,quantity_in,quantity_out,created_at")
      .order("movement_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("production_wip_opening_balance_movements")
      .select("id,movement_type,movement_date,product_code,product_name_snapshot,barcode,lot_no,quantity_in,quantity_out,created_at")
      .order("movement_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (normalResult.error) {
    throw new ApiError(500, "โหลดสต็อก WIP ไม่สำเร็จ", normalResult.error.message);
  }
  if (openingResult.error) {
    throw new ApiError(500, "โหลดสต็อกตั้งต้น WIP ไม่สำเร็จ", openingResult.error.message);
  }

  const summarize = (movementRows, isOpeningBalance) => {
    const grouped = new Map();
    (movementRows ?? []).forEach((row) => {
    const key = [row.product_code, row.barcode, row.lot_no].map((value) => normalizeText(value).toUpperCase()).join("|");
    const current = grouped.get(key) || {
      sourceDocumentId: isOpeningBalance ? null : row.document_id,
      sourceMovementId: isOpeningBalance && Number(row.quantity_in || 0) > 0 ? row.id : null,
      productCode: row.product_code,
      productName: row.product_name_snapshot,
      barcode: row.barcode,
      lotNo: row.lot_no,
      receivedDate: row.movement_date,
      receivedQty: 0,
      issuedQty: 0,
      remainingQty: 0,
    };
    if (!isOpeningBalance && !current.sourceDocumentId && row.document_id) {
      current.sourceDocumentId = row.document_id;
    }
    if (isOpeningBalance && !current.sourceMovementId && Number(row.quantity_in || 0) > 0) {
      current.sourceMovementId = row.id;
    }
    current.receivedQty += Number(row.quantity_in || 0);
    current.issuedQty += Number(row.quantity_out || 0);
    current.remainingQty = current.receivedQty - current.issuedQty;
    grouped.set(key, current);
    });
    return Array.from(grouped.values()).filter((row) => row.remainingQty > 0);
  };

  return [
    ...summarize(normalResult.data, false),
    ...summarize(openingResult.data, true),
  ]
    .sort((left, right) =>
      String(left.receivedDate).localeCompare(String(right.receivedDate))
      || String(left.lotNo).localeCompare(String(right.lotNo))
    );
}

export async function listAvailableWipCans(request) {
  await requireTaskPermission(request, "production-fg-wip-view");
  const search = normalizeText(new URL(request.url).searchParams.get("search")).toUpperCase();
  const rows = await loadWipStockRows(getSupabaseAdmin());
  return {
    data: search
      ? rows.filter((row) => [row.productCode, row.productName, row.barcode, row.lotNo]
        .some((value) => normalizeText(value).toUpperCase().includes(search)))
      : rows,
  };
}

export async function issueWipCans(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-fg-wip-write");
  const requestId = normalizeText(body.requestId) || crypto.randomUUID();
  const sourceDocumentId = normalizeText(body.sourceDocumentId);
  const sourceMovementId = normalizeText(body.sourceMovementId);
  const barcode = normalizeText(body.barcode).toUpperCase();
  const lotNo = normalizeText(body.lotNo);
  const quantity = parsePositiveInteger(body.quantity, "quantity");
  const issueDate = toBangkokDateKey(body.issueDate || new Date());
  const issuePurpose = normalizeText(body.issuePurpose || "production_use").toLowerCase();
  const recipientNote = normalizeText(body.recipientNote);
  if ((!sourceDocumentId && !sourceMovementId) || !barcode || !lotNo || !issueDate) {
    throw new ApiError(400, "ข้อมูล WIP สำหรับเบิกไม่ครบ");
  }
  if (!WIP_ISSUE_PURPOSES.has(issuePurpose)) {
    throw new ApiError(400, "ประเภทการเบิก WIP ไม่ถูกต้อง");
  }

  const movementNo = buildWipMovementNo(issueDate);
  const isProductionUse = issuePurpose === "production_use";
  const isOpeningBalance = Boolean(sourceMovementId && !sourceDocumentId);
  const rpcName = isOpeningBalance
    ? "issue_wip_opening_cans_atomic"
    : isProductionUse ? "issue_wip_cans_atomic" : "issue_wip_cans_other_atomic";
  const rpcParams = {
    p_request_id: requestId,
    p_movement_no: movementNo,
    ...(isOpeningBalance
      ? { p_source_movement_id: sourceMovementId }
      : { p_source_document_id: sourceDocumentId }),
    p_barcode: barcode,
    p_lot_no: lotNo,
    p_quantity: quantity,
    p_issue_date: issueDate,
    p_actor_user_id: permission.userId,
    p_notes: normalizeText(body.notes) || (isProductionUse
      ? "เบิก WIP ค้างไลน์ไปใช้ผลิต"
      : "เบิก WIP ค้างไลน์กรณีอื่น"),
  };
  if (isOpeningBalance || !isProductionUse) {
    Object.assign(rpcParams, {
      p_issue_purpose: issuePurpose,
      p_recipient_note: recipientNote || null,
    });
  }
  const { data, error } = await getSupabaseAdmin().rpc(rpcName, rpcParams);
  if (error) {
    const status = error.code === "P0001" ? 409 : 500;
    throw new ApiError(status, error.message || "เบิก WIP ไม่สำเร็จ", error.details);
  }
  return { data, movementNo: data?.movementNo || movementNo };
}

export async function createWipOpeningBalanceBatch(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-fg-wip-opening-write");
  const requestId = normalizeText(body.requestId) || crypto.randomUUID();
  const openingDate = toBangkokDateKey(body.openingDate || new Date());
  const sourceItems = Array.isArray(body.items) ? body.items : [];
  if (!openingDate) throw new ApiError(400, "วันที่ตั้งต้นไม่ถูกต้อง");
  if (sourceItems.length < 1 || sourceItems.length > 200) {
    throw new ApiError(400, "จำนวนรายการตั้งต้นต้องอยู่ระหว่าง 1 ถึง 200 รายการ");
  }

  const productSelections = new Map();
  sourceItems.forEach((item) => {
    const productCode = normalizeText(item?.product?.productCode).toUpperCase();
    const barcode = normalizeText(item?.product?.barcode).toUpperCase();
    if (!productCode || !barcode) throw new ApiError(400, "ข้อมูลสินค้า WIP ไม่ครบ");
    productSelections.set(`${productCode}|${barcode}`, item.product);
  });

  const resolvedProducts = new Map();
  const selections = Array.from(productSelections.entries());
  for (let index = 0; index < selections.length; index += 4) {
    const chunk = selections.slice(index, index + 4);
    const resolved = await Promise.all(chunk.map(([, selection]) => resolveSelectedProduct(selection)));
    chunk.forEach(([key], itemIndex) => resolvedProducts.set(key, resolved[itemIndex]));
  }

  const uniqueRows = new Set();
  const items = sourceItems.map((item) => {
    const productCode = normalizeText(item?.product?.productCode).toUpperCase();
    const barcode = normalizeText(item?.product?.barcode).toUpperCase();
    const product = resolvedProducts.get(`${productCode}|${barcode}`);
    const lotNo = parseDdMmYyLot(item.lotNo);
    const quantity = parsePositiveInteger(item.quantity, "quantity");
    const rowKey = `${product.productCode}|${product.barcode}|${lotNo}`;
    if (uniqueRows.has(rowKey)) throw new ApiError(400, `พบรายการ WIP และ LOT ${lotNo} ซ้ำกัน`);
    uniqueRows.add(rowKey);
    return {
      productCode: product.productCode,
      productName: product.productName,
      barcode: product.barcode,
      lotNo,
      quantity,
      notes: normalizeText(item.notes).slice(0, 500) || null,
    };
  });

  const supabaseAdmin = getSupabaseAdmin();
  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", permission.userId)
    .maybeSingle();
  const actorUsername = profileResult.data?.username || permission.user?.email || null;
  const { data, error } = await supabaseAdmin.rpc("record_wip_opening_balance_batch", {
    p_request_id: requestId,
    p_opening_date: openingDate,
    p_items: items,
    p_actor_user_id: permission.userId,
    p_actor_username: actorUsername,
  });
  if (error) {
    const status = error.code === "P0001" ? 409 : 500;
    throw new ApiError(status, error.message || "บันทึกยอดตั้งต้น WIP ไม่สำเร็จ", error.details);
  }
  return { data };
}

export async function listFgWipWasteLogs(request) {
  await requireTaskPermission(request, "production-fg-wip-view");
  const url = new URL(request.url);
  const productionDate = toBangkokDateKey(url.searchParams.get("date") || new Date());
  const { data, error } = await getSupabaseAdmin()
    .from("production_fg_wip_waste_logs")
    .select("id,request_id,production_date,waste_barcode,product_code,product_name_snapshot,product_barcode,waste_type,reason,net_weight_kg,rejected_can_qty,operator_username,created_at")
    .eq("production_date", productionDate)
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new ApiError(500, "โหลดรายการของเสียไม่สำเร็จ", error.message);
  return { data: data ?? [] };
}

export async function createFgWipWasteLog(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-fg-wip-waste-write");
  const product = await resolveSelectedProduct(body.product);
  const productionDate = toBangkokDateKey(body.productionDate || new Date());
  if (!productionDate) throw new ApiError(400, "productionDate is invalid");

  const wasteType = normalizeText(body.wasteType);
  if (!['filling_scrap', 'rejected_can'].includes(wasteType)) {
    throw new ApiError(400, "ประเภทของเสียไม่ถูกต้อง");
  }
  const reason = normalizeText(body.reason);
  if (!reason) throw new ApiError(400, "กรุณาระบุสาเหตุของเสีย");

  const requestId = normalizeText(body.requestId) || crypto.randomUUID();
  const netWeightKg = wasteType === "filling_scrap"
    ? parsePositiveWeight(body.netWeightKg, "netWeightKg")
    : null;
  const rejectedCanQty = wasteType === "rejected_can"
    ? parsePositiveInteger(body.rejectedCanQty, "rejectedCanQty")
    : null;
  const supabaseAdmin = getSupabaseAdmin();
  const existingResult = await supabaseAdmin
    .from("production_fg_wip_waste_logs")
    .select("id,request_id,production_date,waste_barcode,product_code,product_name_snapshot,waste_type,reason,net_weight_kg,rejected_can_qty,operator_username,created_at")
    .eq("request_id", requestId)
    .maybeSingle();
  if (existingResult.error) {
    throw new ApiError(500, "ตรวจสอบรายการของเสียซ้ำไม่สำเร็จ", existingResult.error.message);
  }
  if (existingResult.data) return { data: existingResult.data };

  const barcodeResult = await supabaseAdmin.rpc("next_fg_wip_waste_barcode", {
    p_production_date: productionDate,
  });
  if (barcodeResult.error || !barcodeResult.data) {
    throw new ApiError(500, "สร้างรหัสบาร์โค้ดของเสียไม่สำเร็จ", barcodeResult.error?.message);
  }
  const wasteBarcode = normalizeText(barcodeResult.data);
  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", permission.userId)
    .maybeSingle();
  const operatorUsername = profileResult.data?.username || permission.user?.email || null;

  const { data, error } = await supabaseAdmin
    .from("production_fg_wip_waste_logs")
    .insert({
      request_id: requestId,
      production_date: productionDate,
      lot_no: null,
      waste_barcode: wasteBarcode,
      product_code: product.productCode,
      product_name_snapshot: product.productName,
      product_barcode: product.barcode || null,
      waste_type: wasteType,
      reason,
      net_weight_kg: netWeightKg,
      rejected_can_qty: rejectedCanQty,
      notes: normalizeText(body.notes) || null,
      operator_user_id: permission.userId,
      operator_username: operatorUsername,
      metadata: {
        source: "fg_wip_waste_tab",
        scaleConnected: Boolean(body.scaleAudit?.connected),
        scaleStable: Boolean(body.scaleAudit?.stable),
        scaleReadingAt: body.scaleAudit?.readingAt || null,
      },
    })
    .select("id,request_id,production_date,waste_barcode,product_code,product_name_snapshot,waste_type,reason,net_weight_kg,rejected_can_qty,operator_username,created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      const existing = await supabaseAdmin
        .from("production_fg_wip_waste_logs")
        .select("id,request_id,production_date,waste_barcode,product_code,product_name_snapshot,waste_type,reason,net_weight_kg,rejected_can_qty,operator_username,created_at")
        .eq("request_id", requestId)
        .maybeSingle();
      if (existing.data) return { data: existing.data };
    }
    throw new ApiError(500, "บันทึกของเสียไม่สำเร็จ", error.message);
  }
  return { data };
}

export async function cancelFgWipWasteLog(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-fg-wip-waste-cancel");
  const wasteLogId = normalizeText(body.id || body.wasteLogId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(wasteLogId)) {
    throw new ApiError(400, "รายการของเสียไม่ถูกต้อง");
  }

  const voidReason = normalizeText(body.voidReason || body.reason);
  if (!voidReason) {
    throw new ApiError(400, "กรุณาระบุเหตุผลที่ยกเลิกรายการ");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("production_fg_wip_waste_logs")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: permission.userId,
      void_reason: voidReason,
    })
    .eq("id", wasteLogId)
    .is("voided_at", null)
    .select("id,waste_barcode,product_code,product_name_snapshot,waste_type,reason,net_weight_kg,rejected_can_qty,voided_at,voided_by,void_reason")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "ยกเลิกรายการของเสียไม่สำเร็จ", error.message);
  }
  if (!data) {
    const existing = await supabaseAdmin
      .from("production_fg_wip_waste_logs")
      .select("id,voided_at")
      .eq("id", wasteLogId)
      .maybeSingle();
    if (existing.error) {
      throw new ApiError(500, "ตรวจสอบรายการของเสียไม่สำเร็จ", existing.error.message);
    }
    if (!existing.data) throw new ApiError(404, "ไม่พบรายการของเสีย");
    throw new ApiError(409, "รายการของเสียนี้ถูกยกเลิกแล้ว");
  }

  return { data };
}

export async function listFgWipDocuments(request) {
  await requireTaskPermission(request, "production-fg-wip-view");
  const productionDate = normalizeText(new URL(request.url).searchParams.get("productionDate"));
  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from("production_fg_wip_documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (productionDate) {
    query = query.eq("production_date", productionDate);
  }
  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "โหลดรายงานผลผลิต WIP ไม่สำเร็จ", error.message);
  }

  const documents = data ?? [];
  const goodsCodes = documents.map((d) => d.fg_barcode_snapshot).filter(Boolean);
  const barcodeMap = new Map();
  if (goodsCodes.length > 0) {
    const { data: barcodeRows } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code, product_barcode")
      .in("goods_code", goodsCodes);
    (barcodeRows ?? []).forEach((b) => {
      barcodeMap.set(b.goods_code.toUpperCase(), b.product_barcode);
    });
  }

  const payload = documents.map((d) => ({
    ...d,
    fg_real_barcode: d.fg_barcode_snapshot ? barcodeMap.get(d.fg_barcode_snapshot.toUpperCase()) || null : null,
  }));

  const department = await supabaseAdmin.from("production_departments").select("id").eq("code", FG_DEPARTMENT_CODE).eq("is_active", true).is("deleted_at", null).maybeSingle();
  if (department.error) throw new ApiError(500, "โหลดแผนกรายงานไม่สำเร็จ");
  let packingDocuments = [];
  if (department.data) {
    let packing = supabaseAdmin.from("production_packing_documents").select("id,work_date,lot_no,product_code,product_name,payload,created_at")
      .eq("department_id", department.data.id).order("created_at", { ascending: false }).limit(501);
    if (productionDate) packing = packing.eq("work_date", productionDate);
    const result = await packing;
    if (result.error && !isMissingOptionalTableError(result.error, "production_packing_documents")) throw new ApiError(500, "โหลดประวัติบรรจุหลายหน่วยไม่สำเร็จ", result.error.message);
    if (result.data?.length > 500) throw new ApiError(422, "รายการหลายหน่วยเกินขอบเขต กรุณาเลือกวันที่รายงาน");
    packingDocuments = result.data || [];
  }
  return { data: payload, packingDocuments };
}

export async function listFgPackingReport(request) {
  await requireTaskPermission(request, "production-fg-wip-view");
  const productionDate = toBangkokDateKey(new URL(request.url).searchParams.get("productionDate") || new Date());
  const supabaseAdmin = getSupabaseAdmin();

  const [documentsResult, issuesResult, wastesResult, movementsResult] = await Promise.all([
    supabaseAdmin
      .from("production_fg_wip_documents")
      .select("id,production_date,fg_product_code,fg_product_name_snapshot,fg_unit_snapshot,fg_case_qty,fg_tin_qty,wip_tin_qty,metadata")
      .eq("production_date", productionDate)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("production_piece_rate_stock_issues")
      .select("id,lot_no,issue_weight_kg,metadata")
      .eq("issue_date", productionDate)
      .eq("issue_status", "confirmed"),
    supabaseAdmin
      .from("production_fg_wip_waste_logs")
      .select("product_code,product_name_snapshot,waste_type,net_weight_kg,rejected_can_qty")
      .eq("production_date", productionDate)
      .is("voided_at", null),
    loadPackingCarryoverMovements(supabaseAdmin, productionDate),
  ]);

  const safeWastesResult = wastesResult.error
    && isMissingOptionalTableError(wastesResult.error, "production_fg_wip_waste_logs")
    ? { data: [], error: null, unavailable: true }
    : wastesResult;

  for (const [label, result] of [
    ["ผลผลิต FG/WIP", documentsResult],
    ["รายการเบิกเนื้อขนม", issuesResult],
    ["รายการของเสีย", safeWastesResult],
    ["ยอด WIP ยกมา", movementsResult],
  ]) {
    if (result.error) throw new ApiError(500, `โหลด${label}ไม่สำเร็จ`, result.error.message);
  }

  const documents = documentsResult.data ?? [];
  const issues = issuesResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const documentById = new Map(documents.map((row) => [row.id, row]));
  const targetDocumentByMovementId = new Map();
  documents.forEach((document) => {
    normalizeUuidList(document.metadata?.carriedWipMovementIds).forEach((movementId) => {
      targetDocumentByMovementId.set(movementId, document);
    });
  });
  const issueIds = issues.map((row) => row.id);
  const sourceDocumentIds = Array.from(new Set(movements.map((row) => row.document_id).filter(Boolean)));
  const movementIds = movements.map((row) => row.id);

  const [returnsResult, sourceDocumentsResult, otherIssueDetailsResult] = await Promise.all([
    fetchRowsByValueChunks(issueIds, (chunk) => supabaseAdmin
        .from("production_piece_rate_stock_returns")
        .select("piece_rate_issue_id,return_weight_kg")
        .in("piece_rate_issue_id", chunk)
        .eq("return_status", "confirmed")),
    fetchRowsByValueChunks(sourceDocumentIds, (chunk) => supabaseAdmin
        .from("production_fg_wip_documents")
        .select("id,fg_product_code,fg_product_name_snapshot")
        .in("id", chunk)),
    fetchRowsByValueChunks(movementIds, (chunk) => supabaseAdmin
        .from("production_wip_can_issue_details")
        .select("movement_id")
        .in("movement_id", chunk)),
  ]);

  const safeOtherIssueDetailsResult = otherIssueDetailsResult.error
    && isMissingOptionalTableError(otherIssueDetailsResult.error, "production_wip_can_issue_details")
    ? { data: [], error: null, unavailable: true }
    : otherIssueDetailsResult;

  if (returnsResult.error) throw new ApiError(500, "โหลดการชั่งคืนไม่สำเร็จ", returnsResult.error.message);
  if (sourceDocumentsResult.error) throw new ApiError(500, "โหลดเอกสาร WIP ต้นทางไม่สำเร็จ", sourceDocumentsResult.error.message);
  if (safeOtherIssueDetailsResult.error) throw new ApiError(500, "ตรวจสอบประเภทการเบิก WIP ไม่สำเร็จ", safeOtherIssueDetailsResult.error.message);

  const sourceDocumentById = new Map((sourceDocumentsResult.data ?? []).map((row) => [row.id, row]));
  const nonProductionMovementIds = new Set((safeOtherIssueDetailsResult.data ?? []).map((row) => row.movement_id));
  const rawFgCodes = Array.from(new Set([
    ...documents.map((row) => row.fg_product_code),
    ...issues.map((row) => row.metadata?.fgProductCode),
    ...(safeWastesResult.data ?? []).map((row) => row.product_code),
  ].map((value) => normalizeText(value).toUpperCase()).filter(Boolean)));

  const tradeCodeResult = await fetchRowsByValueChunks(rawFgCodes, (chunk) => supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code,sku_code")
      .in("goods_code", chunk));
  if (tradeCodeResult.error) throw new ApiError(500, "โหลดความสัมพันธ์ Trade Code ไม่สำเร็จ", tradeCodeResult.error.message);
  const canonicalCodeByAlias = new Map();
  rawFgCodes.forEach((code) => canonicalCodeByAlias.set(code, code));
  (tradeCodeResult.data ?? []).forEach((row) => {
    const goodsCode = normalizeText(row.goods_code).toUpperCase();
    const skuCode = normalizeText(row.sku_code).toUpperCase();
    if (goodsCode && skuCode) canonicalCodeByAlias.set(goodsCode, skuCode);
  });
  const canonical = (value) => canonicalCodeByAlias.get(normalizeText(value).toUpperCase()) || normalizeText(value).toUpperCase();

  const reportRows = buildFgPackingReportRows({
    documents: documents.map((row) => ({
      fgProductCode: canonical(row.fg_product_code),
      fgProductName: row.fg_product_name_snapshot,
      fgUnitName: row.fg_unit_snapshot,
      fgQuantity: row.fg_case_qty,
      fgTinQty: row.fg_tin_qty,
      wipTinQty: row.wip_tin_qty,
    })),
    issues: issues.map((row) => ({
      id: row.id,
      fgProductCode: canonical(row.metadata?.fgProductCode),
      fgProductName: row.metadata?.fgProductName,
      lotNo: row.lot_no,
      weightKg: row.issue_weight_kg,
    })),
    returns: (returnsResult.data ?? []).map((row) => ({
      issueId: row.piece_rate_issue_id,
      weightKg: row.return_weight_kg,
    })),
    wastes: (safeWastesResult.data ?? []).map((row) => ({
      fgProductCode: canonical(row.product_code),
      fgProductName: row.product_name_snapshot,
      wasteType: row.waste_type,
      weightKg: row.net_weight_kg,
      rejectedCanQty: row.rejected_can_qty,
    })),
    carryovers: movements
      .filter((row) => !nonProductionMovementIds.has(row.id))
      .map((row) => {
        const targetDocument = documentById.get(row.target_document_id) || targetDocumentByMovementId.get(row.id);
        const sourceDocument = sourceDocumentById.get(row.document_id);
        return {
          fgProductCode: canonical(targetDocument?.fg_product_code || sourceDocument?.fg_product_code),
          fgProductName: targetDocument?.fg_product_name_snapshot || sourceDocument?.fg_product_name_snapshot,
          quantity: row.quantity_out,
        };
      }),
  });

  const warnings = [];
  if (safeWastesResult.unavailable) warnings.push("ยังไม่มีตารางบันทึกของเสีย จึงแสดงของเสียเป็น 0");
  if (safeOtherIssueDetailsResult.unavailable) warnings.push("ยังไม่มีตารางจำแนกการเบิก WIP กรณีอื่น");
  return { data: reportRows, productionDate, warnings };
}
