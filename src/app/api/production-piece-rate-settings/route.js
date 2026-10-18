import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";

const PROFILE_TABLE = "production_piece_rate_profiles";
const WEIGHT_TABLE = "production_piece_rate_profile_weights";
const MAPPING_TABLE = "production_piece_rate_product_mappings";
const PRODUCTS_TABLE = "products_cache";
const ALLOWED_PRODUCT_CATEGORY_CODES = ["03", "04", "04-1", "04-2"];
const PIECE_RATE_MAPPING_CHUNK_SIZE = 200;
const PIECE_RATE_MAPPING_CONCURRENCY = 4;
const INPUT_MODES = new Set(["kg", "pail"]);
const WAGE_BASES = new Set(["kg", "count"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value, fieldName) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `${fieldName} must be a valid UUID`);
  }
  return normalized;
}

function normalizeSkuCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeGoodsCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeProfileName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new ApiError(400, "Profile name is required");
  }
  if (normalized.length > 120) {
    throw new ApiError(400, "Profile name must be 120 characters or fewer");
  }
  return normalized;
}

function normalizeInputMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!INPUT_MODES.has(normalized)) {
    throw new ApiError(400, "inputMode must be kg or pail");
  }
  return normalized;
}

function normalizeWageBasis(value) {
  const normalized = String(value || "kg").trim().toLowerCase();
  if (!WAGE_BASES.has(normalized)) {
    throw new ApiError(400, "wageBasis must be kg or count");
  }
  return normalized;
}

function normalizePayRatePerKg(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, `${fieldName} must be a number greater than or equal to 0`);
  }
  return Number(parsed.toFixed(4));
}

function normalizePayRatePerUnit(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, `${fieldName} must be a number greater than or equal to 0`);
  }
  return Number(parsed.toFixed(4));
}

function normalizeWeightOptionLabel(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new ApiError(400, `${fieldName} is required`);
  }
  if (normalized.length > 80) {
    throw new ApiError(400, `${fieldName} must be 80 characters or fewer`);
  }
  return normalized;
}

function normalizeWeightOptionWeight(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} must be a number greater than 0`);
  }
  return Number(parsed.toFixed(4));
}

function normalizeProfiles(rawProfiles = []) {
  const source = Array.isArray(rawProfiles) ? rawProfiles : [];
  const profileMap = new Map();
  const usedNames = new Set();

  source.forEach((entry, index) => {
    const id = normalizeUuid(entry?.id, `profiles[${index}].id`);
    const name = normalizeProfileName(entry?.name);
    const nameKey = name.toLowerCase();
    if (usedNames.has(nameKey)) {
      throw new ApiError(400, `Duplicate profile name: ${name}`);
    }
    usedNames.add(nameKey);

    const inputMode = normalizeInputMode(entry?.inputMode || entry?.input_mode);
    const wageBasis = normalizeWageBasis(entry?.wageBasis || entry?.wage_basis || "kg");
    const payRatePerKg = normalizePayRatePerKg(
      entry?.payRatePerKg ?? entry?.pay_rate_per_kg ?? 0,
      `profiles[${index}].payRatePerKg`
    );
    const payRatePerUnit = normalizePayRatePerUnit(
      entry?.payRatePerUnit ?? entry?.pay_rate_per_unit ?? 0,
      `profiles[${index}].payRatePerUnit`
    );
    const weightOptionsSource = Array.isArray(entry?.weightOptions)
      ? entry.weightOptions
      : Array.isArray(entry?.weight_options)
        ? entry.weight_options
        : [];
    const weightOptions = inputMode === "pail"
      ? weightOptionsSource.map((weightEntry, weightIndex) => ({
        id: weightEntry?.id
          ? normalizeUuid(weightEntry.id, `profiles[${index}].weightOptions[${weightIndex}].id`)
          : globalThis.crypto.randomUUID(),
        label: normalizeWeightOptionLabel(
          weightEntry?.label ?? weightEntry?.name ?? weightEntry?.title,
          `profiles[${index}].weightOptions[${weightIndex}].label`
        ),
        weightKg: normalizeWeightOptionWeight(
          weightEntry?.weightKg ?? weightEntry?.weight_kg ?? weightEntry?.kg ?? weightEntry?.value,
          `profiles[${index}].weightOptions[${weightIndex}].weightKg`
        ),
        isActive: weightEntry?.isActive !== false,
        sortOrder: Number.isFinite(Number(weightEntry?.sortOrder))
          ? Math.max(0, Math.trunc(Number(weightEntry.sortOrder)))
          : weightIndex,
      }))
      : [];

    let kgPerPail = null;
    if (inputMode === "pail") {
      const explicitKgPerPail = Number(entry?.kgPerPail ?? entry?.kg_per_pail ?? null);
      if (Number.isFinite(explicitKgPerPail) && explicitKgPerPail > 0) {
        kgPerPail = Number(explicitKgPerPail.toFixed(4));
      } else if (weightOptions.length > 0) {
        kgPerPail = weightOptions[0].weightKg;
      }
    }

    if (inputMode === "pail" && weightOptions.length === 0 && kgPerPail !== null) {
      weightOptions.push({
        id: null,
        label: `${kgPerPail} กก.`,
        weightKg: kgPerPail,
        isActive: true,
        sortOrder: 0,
      });
    }

    if (inputMode === "pail" && weightOptions.length === 0) {
      throw new ApiError(400, `profiles[${index}].weightOptions must contain at least one option for pail input mode`);
    }

    profileMap.set(id, {
      id,
      name,
      inputMode,
      wageBasis,
      payRatePerKg,
      payRatePerUnit,
      kgPerPail,
      weightOptions,
      isActive: entry?.isActive !== false,
      sortOrder: Number.isFinite(Number(entry?.sortOrder))
        ? Math.max(0, Math.trunc(Number(entry.sortOrder)))
        : index,
    });
  });

  return Array.from(profileMap.values());
}

function normalizeMappings(rawMappings = []) {
  const source = Array.isArray(rawMappings) ? rawMappings : [];
  const mappingByCode = new Map();

  source.forEach((entry, index) => {
    const productCode = normalizeGoodsCode(
      entry?.productCode
      || entry?.product_code
      || entry?.goodsCode
      || entry?.skuCode
      || entry?.code
    );
    const skuCode = normalizeSkuCode(entry?.skuCode || entry?.sku_code || entry?.productSkuCode);
    if (!productCode) {
      return;
    }

    const rawProfileId = entry?.profileId ?? entry?.profile_id ?? null;
    const profileId = rawProfileId ? normalizeUuid(rawProfileId, `mappings[${index}].profileId`) : null;
    const rawWeightOptionId = entry?.weightOptionId ?? entry?.weight_option_id ?? null;
    const weightOptionId = rawWeightOptionId
      ? normalizeUuid(rawWeightOptionId, `mappings[${index}].weightOptionId`)
      : null;
    mappingByCode.set(productCode, {
      productCode,
      skuCode,
      profileId,
      weightOptionId,
    });
  });

  return Array.from(mappingByCode.values());
}

function escapeForIlike(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "");
}

async function buildPieceRateSettingsPayload(supabaseAdmin, options = {}) {
  const search = normalizeParam(options.search);
  const params = new URLSearchParams({
    page: "1",
    pageSize: "5000",
    iccatCodes: ALLOWED_PRODUCT_CATEGORY_CODES.join(","),
  });
  if (search) {
    params.set("search", search);
  }

  const [profilesResult, weightsResult, productsResult, cachedWipResult] = await Promise.all([
    supabaseAdmin
      .from(PROFILE_TABLE)
      .select("id,name,input_mode,wage_basis,pay_rate_per_kg,pay_rate_per_unit,kg_per_pail,is_active,sort_order,updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from(WEIGHT_TABLE)
      .select("id,profile_id,label,weight_kg,sort_order,is_active,updated_at")
      .order("profile_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    fetchGatewayJson("/api/trade-codes", params, "production"),
    supabaseAdmin
      .from(PRODUCTS_TABLE)
      .select("sku_code,sku_name,iccat_code,iccat_name,brand_code,brand_name,uom_name,is_active")
      .eq("iccat_code", "03")
      .eq("is_active", true)
      .order("sku_code", { ascending: true }),
  ]);

  if (profilesResult.error) {
    throw new ApiError(500, "Failed to load piece-rate profiles", profilesResult.error.message);
  }
  if (weightsResult.error) {
    throw new ApiError(500, "Failed to load piece-rate weight options", weightsResult.error.message);
  }
  if (!productsResult.ok) {
    throw new ApiError(
      productsResult.status || 500,
      productsResult.error?.message || "Failed to load trade codes for piece-rate settings",
      productsResult.error?.details || null
    );
  }
  if (cachedWipResult.error) {
    throw new ApiError(500, "Failed to load WIP products for piece-rate settings", cachedWipResult.error.message);
  }

  const profiles = profilesResult.data ?? [];
  const weightRows = weightsResult.data ?? [];
  const productsByGoodsCode = new Map(
    (Array.isArray(productsResult.data?.data) ? productsResult.data.data : [])
      .map((row) => [normalizeGoodsCode(row.GOODS_CODE), row])
      .filter(([goodsCode]) => Boolean(goodsCode))
  );
  const productSkuCodes = new Set(
    Array.from(productsByGoodsCode.values())
      .map((row) => normalizeSkuCode(row.SKU_CODE))
      .filter(Boolean)
  );

  // WIP03 may be created locally and therefore not exist in ERP trade codes yet.
  // Include those cached WIP records so they can be assigned a piece-rate profile.
  (cachedWipResult.data ?? []).forEach((row) => {
    const skuCode = normalizeSkuCode(row.sku_code);
    if (!skuCode || productSkuCodes.has(skuCode)) {
      return;
    }
    productsByGoodsCode.set(skuCode, {
      GOODS_CODE: skuCode,
      SKU_CODE: skuCode,
      SKU_NAME: row.sku_name || skuCode,
      BRN_CODE: row.brand_code || "",
      BRN_NAME: row.brand_name || "",
      UTQ_NAME: row.uom_name || "",
      UTQ_NAME_2: row.uom_name || "",
      ICCAT_CODE: "03",
      ICCAT_NAME: row.iccat_name || "WIP",
    });
  });

  const products = Array.from(productsByGoodsCode.values());
  const productCodes = products
    .map((item) => normalizeGoodsCode(item.GOODS_CODE))
    .filter(Boolean);

  const mappingRows = [];
  for (let index = 0; index < productCodes.length; index += PIECE_RATE_MAPPING_CHUNK_SIZE) {
    const productCodeChunk = productCodes.slice(index, index + PIECE_RATE_MAPPING_CHUNK_SIZE);
    const batchChunks = [productCodeChunk];
    for (
      let batchIndex = index + PIECE_RATE_MAPPING_CHUNK_SIZE;
      batchIndex < productCodes.length && batchChunks.length < PIECE_RATE_MAPPING_CONCURRENCY;
      batchIndex += PIECE_RATE_MAPPING_CHUNK_SIZE
    ) {
      batchChunks.push(productCodes.slice(batchIndex, batchIndex + PIECE_RATE_MAPPING_CHUNK_SIZE));
    }

    const mappingResults = await Promise.all(
      batchChunks.map((codes) => supabaseAdmin
        .from(MAPPING_TABLE)
        .select("product_code,sku_code,profile_id,weight_option_id")
        .in("product_code", codes))
    );
    const failedResult = mappingResults.find((result) => result.error);
    if (failedResult?.error) {
      throw new ApiError(
        500,
        "Failed to load product piece-rate mappings",
        failedResult.error.message
      );
    }
    mappingResults.forEach((result) => {
      mappingRows.push(...(result.data ?? []));
    });

    index += PIECE_RATE_MAPPING_CHUNK_SIZE * (batchChunks.length - 1);
  }

  const mappingByProductCode = new Map();
  const assignedCountByProfileId = new Map();
  mappingRows.forEach((row) => {
    const productCode = normalizeSkuCode(row.product_code);
    const profileId = row.profile_id || null;
    if (!productCode || !profileId) {
      return;
    }
    mappingByProductCode.set(productCode, {
      skuCode: normalizeSkuCode(row.sku_code) || null,
      profileId,
      weightOptionId: row.weight_option_id || null,
    });
    assignedCountByProfileId.set(
      profileId,
      (assignedCountByProfileId.get(profileId) || 0) + 1
    );
  });

  const weightOptionsByProfileId = new Map();
  weightRows.forEach((row) => {
    const profileId = row.profile_id || null;
    if (!profileId) return;
    const list = weightOptionsByProfileId.get(profileId) || [];
    list.push({
      id: row.id,
      label: row.label || "",
      weightKg: Number(Number(row.weight_kg || 0).toFixed(4)),
      isActive: row.is_active !== false,
      sortOrder: Number(row.sort_order || 0),
      updatedAt: row.updated_at || null,
    });
    weightOptionsByProfileId.set(profileId, list);
  });

  const profilePayload = profiles.map((row) => ({
    id: row.id,
    name: row.name || "",
    inputMode: normalizeInputMode(row.input_mode),
    wageBasis: normalizeWageBasis(row.wage_basis || "kg"),
    payRatePerKg: Number(Number(row.pay_rate_per_kg || 0).toFixed(4)),
    payRatePerUnit: Number(Number(row.pay_rate_per_unit || 0).toFixed(4)),
    kgPerPail: row.kg_per_pail === null ? null : Number(Number(row.kg_per_pail).toFixed(4)),
    weightOptions: weightOptionsByProfileId.get(row.id) || [],
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order || 0),
    assignedCount: assignedCountByProfileId.get(row.id) || 0,
    updatedAt: row.updated_at || null,
  }));

  const productPayload = products.map((row) => {
    const code = normalizeGoodsCode(row.GOODS_CODE) || "";
    return {
      goodsCode: code,
      skuCode: normalizeSkuCode(row.SKU_CODE) || "",
      code,
      name: row.SKU_NAME || "",
      brandCode: row.BRN_CODE || "",
      brandName: row.BRN_NAME || "",
      unit: row.UTQ_NAME_2 || row.UTQ_NAME || "",
      profileId: mappingByProductCode.get(code)?.profileId || null,
      weightOptionId: mappingByProductCode.get(code)?.weightOptionId || null,
    };
  });

  const mappedCount = productPayload.filter((item) => item.profileId).length;
  const activeProfileCount = profilePayload.filter((item) => item.isActive).length;

  return {
    data: {
      profiles: profilePayload,
      products: productPayload,
      summary: {
        totalProducts: productPayload.length,
        mappedProducts: mappedCount,
        unmappedProducts: Math.max(0, productPayload.length - mappedCount),
        totalProfiles: profilePayload.length,
        activeProfiles: activeProfileCount,
      },
    },
  };
}

async function listPieceRateSettings(request) {
  await requireTaskPermission(request, "production-settings-piece-rate-view");
  const supabaseAdmin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  return buildPieceRateSettingsPayload(supabaseAdmin, {
    search: searchParams.get("search"),
  });
}

async function savePieceRateSettings(request) {
  const { userId } = await requireTaskPermission(request, "production-settings-piece-rate-rate-edit");
  const body = await readJson(request);
  const profiles = normalizeProfiles(body.profiles);
  const mappings = normalizeMappings(body.mappings);
  const nowIso = new Date().toISOString();
  const profileIdSet = new Set(profiles.map((item) => item.id));
  const profileById = new Map(profiles.map((item) => [item.id, item]));
  const resolvedMappings = mappings.map((item) => {
    if (!item.profileId) {
      return {
        ...item,
        weightOptionId: null,
      };
    }

    const profile = profileById.get(item.profileId);
    if (!profile) {
      return item;
    }

    if (profile.inputMode !== "pail") {
      return {
        ...item,
        weightOptionId: null,
      };
    }

    const activeWeightOptions = Array.isArray(profile.weightOptions)
      ? profile.weightOptions.filter((weightOption) => weightOption.isActive !== false)
      : [];
    if (item.weightOptionId || activeWeightOptions.length !== 1) {
      return item;
    }

    return {
      ...item,
      weightOptionId: activeWeightOptions[0].id,
    };
  });
  const touchedProductCodes = resolvedMappings.map((item) => item.productCode);
  const weightRowsToUpsert = profiles.flatMap((profile) => (
    Array.isArray(profile.weightOptions)
      ? profile.weightOptions.map((weightOption) => ({
        id: weightOption.id,
        profile_id: profile.id,
        label: weightOption.label,
        weight_kg: weightOption.weightKg,
        sort_order: weightOption.sortOrder,
        is_active: weightOption.isActive !== false,
        created_by: userId,
        updated_by: userId,
        updated_at: nowIso,
      }))
      : []
  ));
  const weightOptionIdSet = new Set(weightRowsToUpsert.map((item) => item.id));
  const weightOptionProfileById = new Map(
    weightRowsToUpsert.map((item) => [item.id, item.profile_id])
  );

  const supabaseAdmin = getSupabaseAdmin();
  const [existingProfilesResult, existingWeightsResult, validProductsResult] = await Promise.all([
    supabaseAdmin
      .from(PROFILE_TABLE)
      .select("id"),
    supabaseAdmin
      .from(WEIGHT_TABLE)
      .select("id,profile_id"),
    touchedProductCodes.length > 0
      ? Promise.resolve({ data: touchedProductCodes.map((code) => ({ product_code: code })), error: null })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingProfilesResult.error) {
    throw new ApiError(500, "Failed to load existing piece-rate profiles", existingProfilesResult.error.message);
  }
  if (existingWeightsResult.error) {
    throw new ApiError(500, "Failed to load existing piece-rate weight options", existingWeightsResult.error.message);
  }
  if (validProductsResult.error) {
    throw new ApiError(500, "Failed to validate piece-rate product mappings", validProductsResult.error.message);
  }

  const validProductCodeSet = new Set(
    (validProductsResult.data ?? []).map((row) => normalizeGoodsCode(row.product_code)).filter(Boolean)
  );
  const invalidCodes = touchedProductCodes.filter((code) => !validProductCodeSet.has(code));
  if (invalidCodes.length > 0) {
    throw new ApiError(400, `Invalid product code(s): ${invalidCodes.join(", ")}`);
  }

  const invalidProfileIds = resolvedMappings
    .filter((item) => item.profileId && !profileIdSet.has(item.profileId))
    .map((item) => item.profileId);
  if (invalidProfileIds.length > 0) {
    throw new ApiError(400, "Mappings reference unknown piece-rate profiles");
  }

  const invalidWeightOptionRefs = resolvedMappings.filter((item) => {
    if (!item.profileId) {
      return Boolean(item.weightOptionId);
    }
    const profile = profileById.get(item.profileId);
    if (!profile) return true;
    if (profile.inputMode !== "pail") {
      return Boolean(item.weightOptionId);
    }
    if (!item.weightOptionId) {
      return true;
    }
    return weightOptionProfileById.get(item.weightOptionId) !== item.profileId;
  });
  if (invalidWeightOptionRefs.length > 0) {
    throw new ApiError(400, "Mappings reference invalid weight options");
  }

  if (profiles.length > 0) {
    const rowsToUpsert = profiles.map((item) => ({
      id: item.id,
      name: item.name,
      input_mode: item.inputMode,
      wage_basis: item.wageBasis,
      pay_rate_per_kg: item.payRatePerKg,
      pay_rate_per_unit: item.payRatePerUnit,
      kg_per_pail: item.kgPerPail,
      is_active: item.isActive,
      sort_order: item.sortOrder,
      created_by: userId,
      updated_by: userId,
      updated_at: nowIso,
    }));
    const { error: upsertProfilesError } = await supabaseAdmin
      .from(PROFILE_TABLE)
      .upsert(rowsToUpsert, { onConflict: "id" });
    if (upsertProfilesError) {
      throw new ApiError(500, "Failed to save piece-rate profiles", upsertProfilesError.message);
    }
  }

  if (weightRowsToUpsert.length > 0) {
    const { error: upsertWeightsError } = await supabaseAdmin
      .from(WEIGHT_TABLE)
      .upsert(weightRowsToUpsert, { onConflict: "id" });
    if (upsertWeightsError) {
      throw new ApiError(500, "Failed to save piece-rate weight options", upsertWeightsError.message);
    }
  }

  const existingProfileIds = (existingProfilesResult.data ?? [])
    .map((row) => row.id)
    .filter(Boolean);
  const existingWeightRows = (existingWeightsResult.data ?? []);
  const deletedWeightIds = existingWeightRows
    .filter((row) => profileIdSet.has(row.profile_id) && !weightOptionIdSet.has(row.id))
    .map((row) => row.id);
  const deletedProfileIds = existingProfileIds.filter((id) => !profileIdSet.has(id));
  if (deletedWeightIds.length > 0) {
    const { error: clearDeletedWeightRefsError } = await supabaseAdmin
      .from(MAPPING_TABLE)
      .update({ weight_option_id: null, updated_by: userId, updated_at: nowIso })
      .in("weight_option_id", deletedWeightIds);
    if (clearDeletedWeightRefsError) {
      throw new ApiError(500, "Failed to clear removed piece-rate weight option references", clearDeletedWeightRefsError.message);
    }

    const { error: deleteWeightsError } = await supabaseAdmin
      .from(WEIGHT_TABLE)
      .delete()
      .in("id", deletedWeightIds);
    if (deleteWeightsError) {
      throw new ApiError(500, "Failed to delete removed piece-rate weight options", deleteWeightsError.message);
    }
  }
  if (deletedProfileIds.length > 0) {
    const { error: deleteProfilesError } = await supabaseAdmin
      .from(PROFILE_TABLE)
      .delete()
      .in("id", deletedProfileIds);
    if (deleteProfilesError) {
      throw new ApiError(500, "Failed to delete removed piece-rate profiles", deleteProfilesError.message);
    }
  }

  const rowsToUpsert = resolvedMappings
    .filter((item) => item.profileId)
    .map((item) => ({
      product_code: item.productCode,
      sku_code: item.skuCode || item.productCode,
      profile_id: item.profileId,
      weight_option_id: item.weightOptionId,
      created_by: userId,
      updated_by: userId,
      updated_at: nowIso,
    }));
  const rowsToDelete = resolvedMappings
    .filter((item) => !item.profileId)
    .map((item) => item.productCode);

  for (let index = 0; index < rowsToDelete.length; index += PIECE_RATE_MAPPING_CHUNK_SIZE) {
    const productCodeChunk = rowsToDelete.slice(index, index + PIECE_RATE_MAPPING_CHUNK_SIZE);
    const { error: deleteMappingsError } = await supabaseAdmin
      .from(MAPPING_TABLE)
      .delete()
      .in("product_code", productCodeChunk);
    if (deleteMappingsError) {
      throw new ApiError(500, "Failed to clear piece-rate product mappings", deleteMappingsError.message);
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertMappingsError } = await supabaseAdmin
      .from(MAPPING_TABLE)
      .upsert(rowsToUpsert, { onConflict: "product_code" });
    if (upsertMappingsError) {
      throw new ApiError(500, "Failed to save piece-rate product mappings", upsertMappingsError.message);
    }
  }

  return buildPieceRateSettingsPayload(supabaseAdmin);
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listPieceRateSettings(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request) {
  try {
    const result = await savePieceRateSettings(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
