import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";

export function normalizeScaleSkuCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeOptionalText(value) {
  const nextValue = String(value || "").trim();
  return nextValue || null;
}

function normalizeOptionalNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isMissingScaleCatalogError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_weight_scale_products")
    || message.includes("production_weight_scale_lots")
    || message.includes("production_weight_receipts")
  );
}

export async function loadScaleProductConfigs(
  supabaseAdmin = getSupabaseAdmin(),
  { departmentId, skuCodes = [] } = {}
) {
  if (!departmentId) {
    return {
      available: true,
      configs: [],
    };
  }

  let query = supabaseAdmin
    .from("production_weight_scale_products")
    .select(
      "id,department_id,sku_code,lot_format,pass_weight_kg,tare_weight_kg,amount_per_pallet,is_active,current_lot_id"
    )
    .eq("department_id", departmentId);

  const normalizedSkuCodes = skuCodes
    .map((skuCode) => normalizeScaleSkuCode(skuCode))
    .filter(Boolean);

  if (normalizedSkuCodes.length) {
    query = query.in("sku_code", normalizedSkuCodes);
  }

  const result = await query;

  if (result.error) {
    if (isMissingScaleCatalogError(result.error)) {
      return {
        available: false,
        configs: [],
      };
    }

    throw new Error("Failed to load weight scale product configs");
  }

  return {
    available: true,
    configs: (result.data ?? []).map((row) => ({
      id: row.id,
      departmentId: row.department_id,
      skuCode: normalizeScaleSkuCode(row.sku_code),
      lotFormat: normalizeOptionalText(row.lot_format),
      passWeightKg: normalizeOptionalNumber(row.pass_weight_kg),
      tareWeightKg: normalizeOptionalNumber(row.tare_weight_kg),
      amountPerPallet: Number.isFinite(Number(row.amount_per_pallet))
        ? Number(row.amount_per_pallet)
        : null,
      isActive: row.is_active !== false,
      currentLotId: row.current_lot_id || null,
    })),
  };
}

export async function loadScaleLotsForConfigs(
  supabaseAdmin = getSupabaseAdmin(),
  { productConfigIds = [] } = {}
) {
  const normalizedConfigIds = productConfigIds
    .map((productConfigId) => String(productConfigId || "").trim())
    .filter(Boolean);

  if (!normalizedConfigIds.length) {
    return {
      available: true,
      lots: [],
    };
  }

  const result = await supabaseAdmin
    .from("production_weight_scale_lots")
    .select(
      "id,product_config_id,lot_code,status,opened_at,closed_at,created_at"
    )
    .in("product_config_id", normalizedConfigIds)
    .neq("status", "archived")
    .order("opened_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (result.error) {
    if (isMissingScaleCatalogError(result.error)) {
      return {
        available: false,
        lots: [],
      };
    }

    throw new Error("Failed to load weight scale lots");
  }

  return {
    available: true,
    lots: (result.data ?? []).map((row) => ({
      id: row.id,
      productConfigId: row.product_config_id,
      lotNo: String(row.lot_code || "").trim(),
      status: String(row.status || "").trim().toLowerCase() || "active",
      openedAt: row.opened_at || null,
      closedAt: row.closed_at || null,
      createdAt: row.created_at || null,
    })),
  };
}

export function buildScaleLotStatusLabel({ isActive = true } = {}) {
  if (!isActive) {
    return "ปิดใช้งาน";
  }

  return "พร้อมใช้งาน";
}

export async function upsertScaleProductConfig(
  supabaseAdmin = getSupabaseAdmin(),
  {
    departmentId,
    skuCode,
    lotFormat = null,
    passWeightKg = null,
    tareWeightKg = null,
    amountPerPallet = null,
    isActive = true,
  } = {}
) {
  const normalizedSkuCode = normalizeScaleSkuCode(skuCode);
  if (!departmentId || !normalizedSkuCode) {
    throw new Error("departmentId and skuCode are required");
  }

  const payload = {
    department_id: departmentId,
    sku_code: normalizedSkuCode,
    lot_format: normalizeOptionalText(lotFormat),
    pass_weight_kg: normalizeOptionalNumber(passWeightKg),
    tare_weight_kg: normalizeOptionalNumber(tareWeightKg),
    amount_per_pallet: Number.isFinite(Number(amountPerPallet))
      ? Number(amountPerPallet)
      : null,
    is_active: isActive !== false,
  };

  const result = await supabaseAdmin
    .from("production_weight_scale_products")
    .upsert(payload, {
      onConflict: "department_id,sku_code",
    })
    .select(
      "id,department_id,sku_code,lot_format,pass_weight_kg,tare_weight_kg,amount_per_pallet,is_active,current_lot_id"
    )
    .single();

  if (result.error) {
    throw new Error("Failed to save weight scale product config");
  }

  const row = result.data;
  return {
    id: row.id,
    departmentId: row.department_id,
    skuCode: normalizeScaleSkuCode(row.sku_code),
    lotFormat: normalizeOptionalText(row.lot_format),
    passWeightKg: normalizeOptionalNumber(row.pass_weight_kg),
    tareWeightKg: normalizeOptionalNumber(row.tare_weight_kg),
    amountPerPallet: Number.isFinite(Number(row.amount_per_pallet))
      ? Number(row.amount_per_pallet)
      : null,
    isActive: row.is_active !== false,
    currentLotId: row.current_lot_id || null,
  };
}

export async function createScaleLot(
  supabaseAdmin = getSupabaseAdmin(),
  {
    productConfigId,
    lotNo,
    status = "active",
    setAsCurrent = true,
  } = {}
) {
  const normalizedProductConfigId = String(productConfigId || "").trim();
  const normalizedLotNo = String(lotNo || "").trim();

  if (!normalizedProductConfigId || !normalizedLotNo) {
    throw new Error("productConfigId and lotNo are required");
  }

  const safeStatus = ["active", "closed", "archived"].includes(
    String(status || "").trim().toLowerCase()
  )
    ? String(status || "").trim().toLowerCase()
    : "active";

  const insertResult = await supabaseAdmin
    .from("production_weight_scale_lots")
    .insert({
      product_config_id: normalizedProductConfigId,
      lot_code: normalizedLotNo,
      status: safeStatus,
    })
    .select(
      "id,product_config_id,lot_code,status,opened_at,closed_at,created_at"
    )
    .single();

  if (insertResult.error) {
    throw new Error("Failed to create weight scale lot");
  }

  if (setAsCurrent) {
    const setCurrentResult = await supabaseAdmin
      .from("production_weight_scale_products")
      .update({
        current_lot_id: insertResult.data.id,
      })
      .eq("id", normalizedProductConfigId);

    if (setCurrentResult.error) {
      throw new Error("Failed to assign current lot");
    }
  }

  return {
    id: insertResult.data.id,
    productConfigId: insertResult.data.product_config_id,
    lotNo: String(insertResult.data.lot_code || "").trim(),
    status: String(insertResult.data.status || "").trim().toLowerCase(),
    openedAt: insertResult.data.opened_at || null,
    closedAt: insertResult.data.closed_at || null,
    createdAt: insertResult.data.created_at || null,
  };
}

export async function setScaleCurrentLot(
  supabaseAdmin = getSupabaseAdmin(),
  { productConfigId, lotId } = {}
) {
  const normalizedProductConfigId = String(productConfigId || "").trim();
  const normalizedLotId = String(lotId || "").trim();

  if (!normalizedProductConfigId || !normalizedLotId) {
    throw new Error("productConfigId and lotId are required");
  }

  const updateResult = await supabaseAdmin
    .from("production_weight_scale_products")
    .update({
      current_lot_id: normalizedLotId,
    })
    .eq("id", normalizedProductConfigId)
    .select(
      "id,department_id,sku_code,lot_format,pass_weight_kg,tare_weight_kg,amount_per_pallet,is_active,current_lot_id"
    )
    .single();

  if (updateResult.error) {
    throw new Error("Failed to set current lot");
  }

  const row = updateResult.data;
  return {
    id: row.id,
    departmentId: row.department_id,
    skuCode: normalizeScaleSkuCode(row.sku_code),
    lotFormat: normalizeOptionalText(row.lot_format),
    passWeightKg: normalizeOptionalNumber(row.pass_weight_kg),
    tareWeightKg: normalizeOptionalNumber(row.tare_weight_kg),
    amountPerPallet: Number.isFinite(Number(row.amount_per_pallet))
      ? Number(row.amount_per_pallet)
      : null,
    isActive: row.is_active !== false,
    currentLotId: row.current_lot_id || null,
  };
}
