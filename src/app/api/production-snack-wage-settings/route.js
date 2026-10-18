import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";

const SNACK_WAGE_CONFIG_TABLE = "production_snack_wage_config";
const SNACK_WAGE_MAPPING_TABLE = "production_snack_wage_product_mappings";
const PRODUCTS_TABLE = "products_cache";
const SNACK_PRODUCT_CATEGORY_CODE = "KB8";
const SNACK_WAGE_MODE_ARRANGED = "arranged";
const SNACK_WAGE_MODE_NOT_ARRANGED = "not_arranged";
const SNACK_WAGE_MODES = new Set([
  SNACK_WAGE_MODE_ARRANGED,
  SNACK_WAGE_MODE_NOT_ARRANGED,
]);

function normalizeSkuCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeSnackWageMode(value, fallback = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SNACK_WAGE_MODES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeRate(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, `${fieldName} must be a number greater than or equal to 0`);
  }
  return Number(parsed.toFixed(4));
}

function normalizeMappings(rawMappings = []) {
  const source = Array.isArray(rawMappings) ? rawMappings : [];
  const mappingByCode = new Map();

  for (const entry of source) {
    const productCode = normalizeSkuCode(
      entry?.productCode
      || entry?.product_code
      || entry?.skuCode
      || entry?.code
    );
    if (!productCode) {
      continue;
    }
    const wageMode = normalizeSnackWageMode(
      entry?.wageMode
      || entry?.wage_mode
      || entry?.mode,
      null
    );
    mappingByCode.set(productCode, wageMode);
  }

  return Array.from(mappingByCode.entries()).map(([productCode, wageMode]) => ({
    productCode,
    wageMode,
  }));
}

function escapeForIlike(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "");
}

async function buildSnackWageSettingsPayload(supabaseAdmin, options = {}) {
  const search = normalizeParam(options.search);
  let productsQuery = supabaseAdmin
    .from(PRODUCTS_TABLE)
    .select("sku_code,sku_name,uom_name")
    .eq("icdept_code", SNACK_PRODUCT_CATEGORY_CODE)
    .order("sku_code", { ascending: true })
    .limit(5000);

  if (search) {
    const escaped = escapeForIlike(search);
    productsQuery = productsQuery.or(`sku_code.ilike.%${escaped}%,sku_name.ilike.%${escaped}%`);
  }

  const [configResult, productsResult] = await Promise.all([
    supabaseAdmin
      .from(SNACK_WAGE_CONFIG_TABLE)
      .select("arranged_rate_per_kg,not_arranged_rate_per_kg")
      .eq("id", 1)
      .maybeSingle(),
    productsQuery,
  ]);

  if (configResult.error) {
    throw new ApiError(500, "Failed to load snack wage config", configResult.error.message);
  }
  if (productsResult.error) {
    throw new ApiError(500, "Failed to load KB8 products", productsResult.error.message);
  }

  const products = productsResult.data ?? [];
  const productCodes = products
    .map((item) => normalizeSkuCode(item.sku_code))
    .filter(Boolean);

  let mappingRows = [];
  if (productCodes.length > 0) {
    const mappingResult = await supabaseAdmin
      .from(SNACK_WAGE_MAPPING_TABLE)
      .select("product_code,wage_mode")
      .in("product_code", productCodes);
    if (mappingResult.error) {
      throw new ApiError(500, "Failed to load snack wage mappings", mappingResult.error.message);
    }
    mappingRows = mappingResult.data ?? [];
  }

  const mappingByProductCode = new Map();
  mappingRows.forEach((row) => {
    const code = normalizeSkuCode(row.product_code);
    const mode = normalizeSnackWageMode(row.wage_mode, null);
    if (!code) return;
    mappingByProductCode.set(code, mode);
  });

  const arrangedRatePerKg = Number(configResult.data?.arranged_rate_per_kg || 0);
  const notArrangedRatePerKg = Number(configResult.data?.not_arranged_rate_per_kg || 0);

  let mappedArranged = 0;
  let mappedNotArranged = 0;
  let unmapped = 0;

  const productPayload = products.map((item) => {
    const code = normalizeSkuCode(item.sku_code) || "";
    const mode = mappingByProductCode.get(code) || null;
    if (mode === SNACK_WAGE_MODE_ARRANGED) mappedArranged += 1;
    else if (mode === SNACK_WAGE_MODE_NOT_ARRANGED) mappedNotArranged += 1;
    else unmapped += 1;

    return {
      code,
      name: item.sku_name || "",
      unit: item.uom_name || "",
      wageMode: mode,
    };
  });

  return {
    data: {
      rates: {
        arrangedRatePerKg: Number(arrangedRatePerKg.toFixed(4)),
        notArrangedRatePerKg: Number(notArrangedRatePerKg.toFixed(4)),
      },
      products: productPayload,
      summary: {
        totalProducts: productPayload.length,
        mappedArranged,
        mappedNotArranged,
        unmapped,
      },
    },
  };
}

async function listSnackWageSettings(request) {
  await requireTaskPermission(request, "production-settings-snack-wage-view");
  const supabaseAdmin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  return buildSnackWageSettingsPayload(supabaseAdmin, {
    search: searchParams.get("search"),
  });
}

async function saveSnackWageSettings(request) {
  const { userId } = await requireTaskPermission(request, "production-settings-snack-wage-rate-edit");
  const body = await readJson(request);
  const arrangedRatePerKg = normalizeRate(
    body.arrangedRatePerKg ?? body.arranged_rate_per_kg ?? 0,
    "arrangedRatePerKg"
  );
  const notArrangedRatePerKg = normalizeRate(
    body.notArrangedRatePerKg ?? body.not_arranged_rate_per_kg ?? 0,
    "notArrangedRatePerKg"
  );
  const normalizedMappings = normalizeMappings(body.mappings);
  const touchedProductCodes = normalizedMappings.map((item) => item.productCode);
  const nowIso = new Date().toISOString();

  const supabaseAdmin = getSupabaseAdmin();
  const { error: upsertConfigError } = await supabaseAdmin
    .from(SNACK_WAGE_CONFIG_TABLE)
    .upsert({
      id: 1,
      arranged_rate_per_kg: arrangedRatePerKg,
      not_arranged_rate_per_kg: notArrangedRatePerKg,
      is_active: true,
      updated_at: nowIso,
      updated_by: userId,
      created_by: userId,
    }, { onConflict: "id" });
  if (upsertConfigError) {
    throw new ApiError(500, "Failed to save snack wage config", upsertConfigError.message);
  }

  if (touchedProductCodes.length > 0) {
    const { data: kb8Rows, error: kb8Error } = await supabaseAdmin
      .from(PRODUCTS_TABLE)
      .select("sku_code")
      .eq("icdept_code", SNACK_PRODUCT_CATEGORY_CODE)
      .in("sku_code", touchedProductCodes);
    if (kb8Error) {
      throw new ApiError(500, "Failed to validate KB8 product mappings", kb8Error.message);
    }

    const kb8CodeSet = new Set((kb8Rows || []).map((row) => normalizeSkuCode(row.sku_code)));
    const invalidCodes = touchedProductCodes.filter((code) => !kb8CodeSet.has(code));
    if (invalidCodes.length > 0) {
      throw new ApiError(400, `Invalid KB8 product code(s): ${invalidCodes.join(", ")}`);
    }

    const rowsToUpsert = normalizedMappings
      .filter((item) => item.wageMode)
      .map((item) => ({
        product_code: item.productCode,
        wage_mode: item.wageMode,
        updated_at: nowIso,
        updated_by: userId,
        created_by: userId,
      }));
    const rowsToDelete = normalizedMappings
      .filter((item) => !item.wageMode)
      .map((item) => item.productCode);

    if (rowsToUpsert.length > 0) {
      const { error: upsertMappingsError } = await supabaseAdmin
        .from(SNACK_WAGE_MAPPING_TABLE)
        .upsert(rowsToUpsert, { onConflict: "product_code" });
      if (upsertMappingsError) {
        throw new ApiError(500, "Failed to save snack wage mappings", upsertMappingsError.message);
      }
    }

    if (rowsToDelete.length > 0) {
      const { error: deleteMappingsError } = await supabaseAdmin
        .from(SNACK_WAGE_MAPPING_TABLE)
        .delete()
        .in("product_code", rowsToDelete);
      if (deleteMappingsError) {
        throw new ApiError(500, "Failed to clear snack wage mappings", deleteMappingsError.message);
      }
    }
  }

  return buildSnackWageSettingsPayload(supabaseAdmin);
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listSnackWageSettings(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request) {
  try {
    const result = await saveSnackWageSettings(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
