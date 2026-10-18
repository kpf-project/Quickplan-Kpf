import "server-only";
import { createHash } from "node:crypto";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { loadWeightScaleLiveDepartmentScope } from "@/lib/scale/live-access";
import { buildPackingUnits, quantityInBase, supplementPackingUnits } from "@/lib/packingUnits";
import { readPackingUnitSetting } from "@/lib/packingUnitSettings";
import { lotFromWorkDate } from "@/lib/nonWagePackingOutput";
import { validatePieceRateWorkDate } from "@/lib/piece-rate-work-date";
import { loadPackingProductPage } from "@/lib/packing-product-page";
import { fetchAllSupabaseRows } from "@/lib/supabaseRangeFetch";
import { legacyPackingHistory } from "@/lib/packingHistory";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Installing tables alone must not open writes before legacy balances are reconciled.
const workspaceEnabled = () => process.env.PACKING_WORKSPACE_ENABLED === "true";

async function context(request, departmentId, write = false) {
  const permission = await requireTaskPermission(request, write ? "production-packing-output-write" : "production-packing-output-view");
  const db = getSupabaseAdmin();
  const scope = await loadWeightScaleLiveDepartmentScope(db, permission);
  const department = scope.departments.find(item => item.id === departmentId);
  if (departmentId && (!department || (write && department.role !== "editor" && !permission.isAdmin))) throw new ApiError(403, "ไม่มีสิทธิ์ในแผนกนี้");
  return { db, permission, department, departments: scope.departments };
}

export async function productProfile(db, departmentId, code) {
  const { data: mapping, error: mappingError } = await db.from("production_department_products").select("sku_code")
    .eq("department_id", departmentId).eq("sku_code", code).maybeSingle();
  if (mappingError) throw new ApiError(500, "ตรวจขอบเขตสินค้าไม่สำเร็จ");
  if (!mapping) throw new ApiError(403, "สินค้านี้ยังไม่ได้มอบหมายให้แผนก");
  const { data: product, error } = await db.from("products_cache").select("sku_code,sku_name,iccat_code,uom_name,image_url")
    .eq("sku_code", code).in("iccat_code", ["04", "04-1", "04-2"]).eq("is_active", true).maybeSingle();
  if (error || !product) throw new ApiError(422, "ไม่พบสินค้าสำเร็จรูปที่เปิดใช้งาน");
  const rows = [];
  let cursor;
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({ skuCodes: code, page: String(page), pageSize: "100", iccatCodes: "04,04-1,04-2" });
    if (cursor) params.set("cursor", cursor);
    const result = await fetchGatewayJson("/api/trade-codes", params, "production");
    if (!result.ok || !Array.isArray(result.data?.data)) throw new ApiError(503, "โหลด Trade Code ไม่สำเร็จ ยังไม่อนุญาตให้เดาหน่วย");
    rows.push(...result.data.data);
    const cursorInfo = result.data.cursor;
    if (cursorInfo?.hasMore === false || (!cursorInfo && page >= result.data.pagination?.totalPages) || (!cursorInfo && result.data.data.length < 100)) break;
    if (cursorInfo?.next) cursor = cursorInfo.next;
    else if (cursorInfo?.hasMore) throw new ApiError(503, "โหลด Trade Code ไม่ครบ กรุณาลองใหม่");
    if (page === 20) throw new ApiError(422, "รายการ Trade Code เกินขอบเขต กรุณาตรวจข้อมูลสินค้า");
  }
  let units;
  const unitSupplement = await readPackingUnitSetting(db, code);
  try { units = supplementPackingUnits(buildPackingUnits(code, rows), unitSupplement); } catch (error) { throw new ApiError(422, error.message); }
  const unitVersion = createHash("sha256").update(JSON.stringify(units)).digest("hex");
  return { code, name: product.sku_name, imageUrl: product.image_url, units, unitVersion, unitSupplement };
}

function storageError(error) {
  if (["42P01", "PGRST205", "PGRST202", "42883"].includes(error?.code)) throw new ApiError(503, "ยังไม่ติดตั้งระบบบันทึกหลายหน่วย กรุณาติดต่อผู้ดูแล ไม่ได้บันทึกข้อมูล");
  if (error?.code === "42501") throw new ApiError(403, "ไม่มีสิทธิ์ทำรายการนี้");
  throw new ApiError(["23505", "P0001"].includes(error?.code) ? 409 : error?.code === "22023" ? 400 : 500,
    ["22023", "P0001"].includes(error?.code) ? "ยอดต้นทางเปลี่ยนแล้ว หรือจำนวน/หน่วยไม่ถูกต้อง กรุณาโหลดยอดใหม่" : "ทำรายการไม่สำเร็จ กรุณาตรวจสอบหรือส่งคำขอเดิมอีกครั้ง");
}

async function loadSharedSources(db, departmentId, code, date, profile) {
  const { data, error } = await db.rpc("packing_workspace_sources", { p_department_id: departmentId, p_product_code: code, p_date: date });
  if (error) storageError(error);
  if (data.length > 500) throw new ApiError(422, "ยอดค้างเกิน 500 LOT กรุณาติดต่อผู้ดูแล ไม่แสดงยอดแบบตัดรายการ");
  return data.filter(row => row.source_kind === "packing" || profile.units.some(unit => unit.code === row.unit_code))
    .map(row => ({ ...row, unit_version: row.source_kind === "packing" ? row.unit_version : profile.unitVersion }));
}

export async function readPackingWorkspace(request, params) {
  const view = params.get("view") || "records";
  const departmentId = params.get("departmentId");
  const ctx = await context(request, departmentId);
  if (view === "context") {
    const check = await ctx.db.from("production_packing_documents").select("id").limit(0);
    const ready = !check.error && workspaceEnabled();
    return Response.json({ departments: ctx.departments, userId: ctx.permission.userId, ready,
      readinessMessage: check.error ? "ยังไม่พร้อมบันทึกหลายหน่วย ต้องติดตั้ง SQL และตรวจยอดเดิมก่อน" : !ready ? "ยังไม่เปิดใช้งาน อยู่ระหว่างตรวจยอดค้างเดิมก่อนเชื่อมระบบใหม่" : null });
  }
  if (!ctx.department) throw new ApiError(400, "กรุณาเลือกแผนก");
  if (view === "product-page") {
    const mappings = await fetchAllSupabaseRows(() => ctx.db.from("production_department_products").select("sku_code").eq("department_id", departmentId).order("sku_code"));
    if (mappings.length > 1000) throw new ApiError(422, "สินค้าที่มอบหมายเกินขอบเขต กรุณาติดต่อผู้ดูแลก่อนเลือก");
    return Response.json(await loadPackingProductPage(ctx.db, { page: params.get("page") || "1", search: params.get("search") || "", allowedCodes: mappings.map(row => row.sku_code) }));
  }
  const code = String(params.get("skuCode") || "").trim().toUpperCase();
  if (view === "profile") return Response.json({ data: await productProfile(ctx.db, departmentId, code) });
  if (view === "sources") {
    const profile = await productProfile(ctx.db, departmentId, code);
    const date = validatePieceRateWorkDate(params.get("dateFrom"));
    return Response.json({ data: await loadSharedSources(ctx.db, departmentId, code, date, profile) });
  }
  const date = validatePieceRateWorkDate(params.get("dateFrom"));
  const { data, error } = await ctx.db.from("production_packing_documents").select("id,work_date,lot_no,product_code,product_name,image_url,payload,created_at")
    .eq("department_id", departmentId).eq("work_date", date).order("created_at", { ascending: false }).limit(501);
  if (error) storageError(error);
  if (data.length > 500) throw new ApiError(422, "รายการเกิน 500 รายการ กรุณาตรวจสอบช่วงรายงาน");
  let oldRecords = [];
  if (ctx.department.code === "KP13") {
    const old = await ctx.db.from("production_fg_wip_documents").select("id,production_date,lot_no,fg_product_code,fg_product_name_snapshot,fg_unit_snapshot,tins_per_case_snapshot,fg_case_qty,fg_tin_qty,wip_tin_qty,created_at")
      .eq("production_date", date).order("created_at", { ascending: false }).limit(501);
    if (old.error) storageError(old.error);
    if (old.data.length > 500) throw new ApiError(422, "ประวัติเดิมเกินขอบเขต กรุณาติดต่อผู้ดูแล");
    oldRecords = legacyPackingHistory(old.data);
  }
  return Response.json({ data: [...data, ...oldRecords].sort((a, b) => b.created_at.localeCompare(a.created_at)) });
}

export async function savePackingWorkspace(request, body) {
  if (!UUID.test(body.requestId || "") || !UUID.test(body.departmentId || "")) throw new ApiError(400, "เลขคำขอหรือแผนกไม่ถูกต้อง");
  const { db, permission, department } = await context(request, body.departmentId, true);
  if (!department) throw new ApiError(400, "กรุณาเลือกแผนก");
  const workDate = validatePieceRateWorkDate(body.workDate);
  const code = String(body.productCode || "").trim().toUpperCase();
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ departmentId: body.departmentId, workDate,
    code, unitVersion: body.unitVersion, produced: body.produced || {}, closing: body.closing || {}, sources: body.sources })).digest("hex");
  const previous = await db.from("production_packing_documents").select("id,actor_id,payload").eq("request_id", body.requestId).maybeSingle();
  if (previous.error) storageError(previous.error);
  if (previous.data) {
    if (previous.data.actor_id !== permission.userId || previous.data.payload.requestFingerprint !== requestFingerprint) throw new ApiError(409, "เลขคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาตรวจสอบ ไม่สร้างคำขอใหม่");
    return Response.json({ data: { id: previous.data.id, lotNo: lotFromWorkDate(workDate), replayed: true } });
  }
  if (!workspaceEnabled()) throw new ApiError(503, "ยังไม่เปิดบันทึกหลายหน่วย ต้องตรวจยอดค้างเดิมก่อน ไม่ได้บันทึกข้อมูล");
  const profile = await productProfile(db, body.departmentId, code);
  if (profile.unitVersion !== body.unitVersion) throw new ApiError(422, "หน่วยสินค้าเปลี่ยนแล้ว กรุณาเลือกสินค้าใหม่ก่อนบันทึก");
  let producedBase, closingBase;
  try {
    producedBase = quantityInBase(profile.units, body.produced);
    closingBase = quantityInBase(profile.units, body.closing);
  } catch (error) { throw new ApiError(400, error.message); }
  if (!Array.isArray(body.sources) || body.sources.length > 100) throw new ApiError(400, "รายการยอดยกมาไม่ถูกต้อง");
  const seen = new Set();
  const sources = body.sources.map(row => {
    if (!UUID.test(row.id || "") || seen.has(row.id)) throw new ApiError(400, "รายการต้นทางซ้ำหรือไม่ถูกต้อง");
    seen.add(row.id);
    let quantity;
    try { quantity = quantityInBase([{ code: "value", factor: 1, precision: 3 }], { value: row.quantity }); }
    catch (error) { throw new ApiError(400, error.message); }
    if (!quantity) throw new ApiError(400, "ระบุจำนวนยอดยกมาที่นำมาใช้");
    return { id: row.id, quantity };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (sources.length) {
    const available = await loadSharedSources(db, body.departmentId, code, workDate, profile);
    for (const source of sources) {
      const stock = available.find(row => row.id === source.id);
      if (!stock) throw new ApiError(400, "ยอดต้นทางไม่ตรงกับแผนกหรือสินค้า");
      if (stock.unit_version !== profile.unitVersion || source.quantity > Number(stock.remaining)
        || (stock.unit_code !== "kg" && !Number.isInteger(source.quantity))) throw new ApiError(400, "จำนวนหรือหน่วยต้นทางเปลี่ยน กรุณาเลือกยอดค้างใหม่");
      source.lotNo = stock.lot_no; source.unitCode = stock.unit_code; source.unitLabel = stock.unit_label;
      source.sourceKind = stock.source_kind;
    }
  }
  if (!producedBase && !closingBase && !sources.length) throw new ApiError(400, "กรอกจำนวนอย่างน้อยหนึ่งรายการ");
  const payload = { workDate, productCode: code, departmentId: body.departmentId, units: profile.units, unitVersion: profile.unitVersion,
    produced: body.produced || {}, closing: body.closing || {}, producedBase, closingBase, sources, requestFingerprint };
  const { data, error } = await db.rpc("record_packing_workspace", {
    p_request_id: body.requestId, p_actor_id: permission.userId, p_department_id: body.departmentId,
    p_product_code: code, p_work_date: workDate, p_lot_no: lotFromWorkDate(workDate),
    p_product_name: profile.name, p_image_url: profile.imageUrl, p_payload: payload,
  });
  if (error) storageError(error);
  return Response.json({ data: { ...data, lotNo: lotFromWorkDate(workDate) } }, { status: 201 });
}
