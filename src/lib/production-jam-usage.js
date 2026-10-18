import "server-only";

import { createHash } from "node:crypto";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";

export const PRODUCTION_JAM_PRODUCTS = Object.freeze([
  { code: "M04-0088", name: "สับปะรดกวน" },
  { code: "M04-0126-1", name: "แยมสตรอเบอรี่ PJST3" },
  { code: "M04-0127-1", name: "แยม M04-0127-1" },
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeRow(row) {
  return {
    id: normalizeText(row?.id),
    usageDate: normalizeText(row?.usage_date),
    goodsCode: normalizeCode(row?.goods_code),
    goodsName: normalizeText(row?.goods_name_snapshot),
    lotNo: normalizeText(row?.lot_no),
    weightKg: Number(row?.weight_kg || 0),
    createdAt: row?.created_at || null,
    targetProductCode: normalizeCode(row?.target_product_code),
    targetProductName: normalizeText(row?.target_product_name_snapshot),
    requestId: row?.request_id || null,
    status: row?.status || "confirmed",
    voidedAt: row?.voided_at || null,
  };
}

export async function loadProductionJamProducts(supabaseAdmin = getSupabaseAdmin()) {
  const codes = PRODUCTION_JAM_PRODUCTS.map((product) => product.code);
  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name")
    .in("sku_code", codes);

  if (error) return PRODUCTION_JAM_PRODUCTS;
  const names = new Map((data || []).map((row) => [normalizeCode(row.sku_code), normalizeText(row.sku_name)]));
  return PRODUCTION_JAM_PRODUCTS.map((product) => ({
    ...product,
    name: names.get(product.code) || product.name,
  }));
}

export async function loadProductionJamUsageRows(
  supabaseAdmin = getSupabaseAdmin(),
  { dateFrom = null, dateTo = null, limit = 50, includeVoided = false } = {}
) {
  let query = supabaseAdmin
    .from("production_jam_usage_entries")
    .select("*")
    .order("usage_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (!includeVoided) query = query.eq("status", "confirmed");
  if (dateFrom) query = query.gte("usage_date", dateFrom);
  if (dateTo) query = query.lte("usage_date", dateTo);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    if (["42P01", "PGRST204"].includes(error.code)) return [];
    throw new Error(`Failed to load production jam usage: ${error.message}`);
  }
  return (data || []).map(normalizeRow);
}

export async function createProductionJamUsage(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const usageDate = normalizeText(input?.usageDate);
  const goodsCode = normalizeCode(input?.goodsCode);
  const lotNo = normalizeText(input?.lotNo);
  const weightKg = Number(input?.weightKg);
  const product = (await loadProductionJamProducts(supabaseAdmin)).find((row) => row.code === goodsCode);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate)) throw new ApiError(400, "กรุณาเลือกวันที่ใช้แยม");
  if (!product) throw new ApiError(400, "กรุณาเลือกแยมจากรายการที่กำหนด");
  if (!lotNo) throw new ApiError(400, "กรุณากรอก LOT แยม");
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new ApiError(400, "น้ำหนักใช้จริงต้องมากกว่า 0 กก.");

  const { data, error } = await supabaseAdmin
    .from("production_jam_usage_entries")
    .insert({
      usage_date: usageDate,
      goods_code: goodsCode,
      goods_name_snapshot: product.name,
      lot_no: lotNo,
      weight_kg: Number(weightKg.toFixed(3)),
      created_by: input?.actorUserId || null,
    })
    .select("*")
    .single();
  if (error) throw new ApiError(400, error.message || "ไม่สามารถบันทึกยอดใช้แยมได้");
  return normalizeRow(data);
}

export async function createProductionJamUsageBatch(input, eligibleProducts, supabaseAdmin = getSupabaseAdmin()) {
  const usageDate = normalizeText(input?.usageDate);
  const goodsCode = normalizeCode(input?.goodsCode);
  const lotNo = normalizeText(input?.lotNo);
  const requestId = normalizeText(input?.requestId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate) || !Number.isFinite(Date.parse(`${usageDate}T00:00:00Z`)) || new Date(`${usageDate}T00:00:00Z`).toISOString().slice(0, 10) !== usageDate) throw new ApiError(400, "กรุณาเลือกวันที่ใช้แยมให้ถูกต้อง");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new ApiError(400, "รหัสคำขอบันทึกไม่ถูกต้อง");
  if (!lotNo || lotNo.length > 100) throw new ApiError(400, "กรุณากรอก LOT แยมไม่เกิน 100 ตัวอักษร");
  const product = (await loadProductionJamProducts(supabaseAdmin)).find((row) => row.code === goodsCode);
  if (!product) throw new ApiError(400, "กรุณาเลือกแยมจากรายการที่กำหนด");
  if (!Array.isArray(input?.allocations) || !input.allocations.length || input.allocations.length > 100) throw new ApiError(400, "กรุณาเลือกผลผลิต 1–100 รายการ");
  const selected = new Set();
  const records = input.allocations.map((allocation) => {
    const code = normalizeCode(allocation?.targetProductCode);
    const target = eligibleProducts.find((row) => row.code === code && row.jamCodes.includes(goodsCode));
    const weightKg = Number(allocation?.weightKg);
    if (!target || selected.has(code)) throw new ApiError(400, "ผลผลิตต้องไม่ซ้ำและต้องใช้แยมชนิดนี้ในวันที่เลือก");
    if (!Number.isFinite(weightKg) || weightKg < 0.001 || weightKg > 999999.999) throw new ApiError(400, "น้ำหนักแยมต้องอยู่ระหว่าง 0.001–999,999.999 กก.");
    selected.add(code);
    return {
      usage_date: usageDate, goods_code: goodsCode, goods_name_snapshot: product.name,
      lot_no: lotNo, weight_kg: Number(weightKg.toFixed(3)), created_by: input.actorUserId,
      request_id: requestId, target_product_code: code, target_product_name_snapshot: target.name,
    };
  });
  const fingerprint = createHash("sha256").update(JSON.stringify({
    usageDate, goodsCode, lotNo, actor: input.actorUserId,
    allocations: records.map((row) => [row.target_product_code, row.weight_kg]).sort((a, b) => a[0].localeCompare(b[0])),
  })).digest("hex");
  for (const record of records) record.request_fingerprint = fingerprint;
  const fields = "id,usage_date,goods_code,goods_name_snapshot,lot_no,weight_kg,created_at,target_product_code,target_product_name_snapshot,request_id,created_by,status";
  const { data, error } = await supabaseAdmin.from("production_jam_usage_entries").insert(records).select(fields);
  if (!error) return { entries: data.map(normalizeRow), replayed: false };
  if (["42703", "PGRST204"].includes(error.code)) throw new ApiError(503, "ต้องติดตั้ง SQL สำหรับเบิกแยมตามผลผลิตก่อนใช้งาน");
  if (error.code !== "23505") throw new ApiError(400, error.message || "ไม่สามารถบันทึกยอดใช้แยมได้");
  const replay = await supabaseAdmin.from("production_jam_usage_entries").select(fields).eq("request_id", requestId);
  if (replay.error) throw new ApiError(500, "ไม่สามารถตรวจสอบรายการที่บันทึกแล้วได้");
  const matches = replay.data?.length === records.length && records.every((record) => replay.data.some((row) => (
    row.target_product_code === record.target_product_code && row.usage_date === record.usage_date
    && row.goods_code === record.goods_code && row.lot_no === record.lot_no
    && Number(row.weight_kg) === record.weight_kg && row.created_by === record.created_by && row.status === "confirmed"
  )));
  if (!matches) throw new ApiError(409, "คำขอนี้ถูกบันทึกด้วยข้อมูลอื่นแล้ว กรุณาโหลดรายการใหม่");
  return { entries: replay.data.map(normalizeRow), replayed: true };
}

export async function cancelProductionJamUsage(input, supabaseAdmin = getSupabaseAdmin()) {
  const id = normalizeText(input?.entryId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, "รหัสรายการแยมไม่ถูกต้อง");
  if (!input?.actorUserId) throw new ApiError(401, "Unauthorized");
  const { data, error } = await supabaseAdmin.from("production_jam_usage_entries")
    .update({ status: "voided", voided_by: input.actorUserId, voided_at: new Date().toISOString() })
    .eq("id", id).eq("status", "confirmed").select("*").maybeSingle();
  if (error) throw new ApiError(400, error.message || "ไม่สามารถยกเลิกรายการแยมได้");
  if (data) return { entry: normalizeRow(data), alreadyVoided: false };
  const existing = await supabaseAdmin.from("production_jam_usage_entries").select("*").eq("id", id).maybeSingle();
  if (existing.error) throw new ApiError(500, "ไม่สามารถตรวจสอบรายการแยมได้");
  if (existing.data?.status === "voided") return { entry: normalizeRow(existing.data), alreadyVoided: true };
  throw new ApiError(404, "ไม่พบรายการแยมที่ต้องการยกเลิก");
}
