import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { fetchTradeCodesWithGatewayFallback } from "@/lib/erpTradeCodes";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";

const ALLOWED_ICCAT_CODES = ["03", "04", "04-1", "04-2"];

const PRODUCT_BARCODE_REGEX = /^[A-Z0-9\-._:/]{2,80}$/;

function normalizeSkuCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeGoodsCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeIccatCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeProductBarcode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!normalized) {
    return null;
  }
  if (!PRODUCT_BARCODE_REGEX.test(normalized)) {
    throw new ApiError(
      400,
      "productBarcode must be 2-80 chars using A-Z, 0-9, -, ., _, :, /"
    );
  }
  return normalized;
}

function parsePositiveInteger(value, fieldName = "value") {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function buildQtyBarcodeValue(displayQty) {
  const asString = String(displayQty);
  const padLength = Math.max(3, asString.length);
  return `QTY:${asString.padStart(padLength, "0")}`;
}

function isInvalidRegexConstraintError(error) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return message.includes("invalid regular expression")
    || details.includes("invalid regular expression")
    || details.includes("invalid character range");
}

async function ensureQtyBarcodeExists(supabaseAdmin, qtyBarcodeId) {
  const { data, error } = await supabaseAdmin
    .from("pallet_qty_barcodes")
    .select("id,is_active")
    .eq("id", qtyBarcodeId)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, "Failed to validate quantity barcode", error.message);
  }
  if (!data || !data.is_active) {
    throw new ApiError(404, "Quantity barcode not found");
  }
}

async function ensureProductExists(supabaseAdmin, skuCode) {
  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code")
    .eq("sku_code", skuCode)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, "Failed to validate SKU", error.message);
  }
  if (!data) {
    throw new ApiError(404, `SKU ${skuCode} not found`);
  }
}

async function fetchTradeCodeRows({ page, pageSize, search, iccatCode, cursor }) {
  const result = await fetchTradeCodesWithGatewayFallback({
    page,
    pageSize,
    search,
    iccatCodes: iccatCode ? [iccatCode] : ALLOWED_ICCAT_CODES,
    cursor,
  });

  return result || {};
}

async function fetchAllTradeCodeRowsByIccat(iccatCode) {
  const rows = [];
  let page = 1;
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const payload = await fetchTradeCodeRows({
      page,
      pageSize: 100,
      search: "",
      iccatCode,
      cursor,
    });
    const pageRows = Array.isArray(payload?.data) ? payload.data : [];
    rows.push(...pageRows);
    hasMore = Boolean(payload?.cursor?.hasMore);
    cursor = payload?.cursor?.next || null;
    page += 1;
    if (hasMore && !cursor) {
      throw new ApiError(500, "Trade-code pagination returned no next cursor");
    }
  }

  return Array.from(
    new Map(
      rows
        .map((row) => [normalizeGoodsCode(row?.GOODS_CODE), row])
        .filter(([goodsCode]) => Boolean(goodsCode))
    ).values()
  );
}

async function ensureProductsExist(supabaseAdmin, skuCodes) {
  const normalizedCodes = Array.from(new Set(
    (Array.isArray(skuCodes) ? skuCodes : [])
      .map((item) => normalizeSkuCode(item))
      .filter(Boolean)
  ));
  if (!normalizedCodes.length) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code")
    .in("sku_code", normalizedCodes);
  if (error) {
    throw new ApiError(500, "Failed to validate SKU list", error.message);
  }

  const existingCodes = new Set(
    (data ?? [])
      .map((item) => normalizeSkuCode(item.sku_code))
      .filter(Boolean)
  );
  const missingCodes = normalizedCodes.filter((code) => !existingCodes.has(code));
  if (missingCodes.length) {
    const preview = missingCodes.slice(0, 5).join(", ");
    const suffix = missingCodes.length > 5 ? "..." : "";
    throw new ApiError(404, `SKU not found: ${preview}${suffix}`);
  }
}

async function listPalletBarcodeSettings(request) {
  await requireTaskPermission(request, "production-settings-pallet-barcodes-view");
  const supabaseAdmin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const { page, pageSize: rawPageSize } = parsePaginationParams(searchParams, {
    page: 1,
    pageSize: 30,
  });
  const pageSize = Math.max(1, Math.min(rawPageSize, 1000));
  const search = normalizeParam(searchParams.get("search"));
  const iccatCode = normalizeIccatCode(searchParams.get("iccatCode"));
  const cursor = normalizeParam(searchParams.get("cursor"));
  const tradeCodePayload = await fetchTradeCodeRows({
    page,
    pageSize,
    search,
    iccatCode,
    cursor,
  });
  const tradeCodeRows = Array.isArray(tradeCodePayload?.data) ? tradeCodePayload.data : [];
  
  // Also query products_cache for internal WIP/products (like WKB-0041 แป้งหมัก) so they can be configured for pallet barcodes
  let cacheProducts = [];
  try {
    let cacheQuery = supabaseAdmin
      .from("products_cache")
      .select("sku_code, sku_name, iccat_code, iccat_name, icdept_code, icdept_name, uom_name, brand_code, brand_name")
      .in("iccat_code", iccatCode ? [iccatCode] : ALLOWED_ICCAT_CODES);

    if (search) {
      cacheQuery = cacheQuery.or(`sku_code.ilike.%${search}%,sku_name.ilike.%${search}%`);
    }

    const { data: cacheData } = await cacheQuery.limit(50);
    if (Array.isArray(cacheData)) {
      cacheProducts = cacheData;
    }
  } catch (err) {
    console.warn("Failed to query products_cache fallback in pallet-barcodes:", err?.message || err);
  }

  // Combine Trade Codes from ERP with internal products_cache items
  const combinedRows = [...tradeCodeRows];
  const existingSkuCodes = new Set(
    tradeCodeRows.map((r) => normalizeSkuCode(r.SKU_CODE || r.sku_code)).filter(Boolean)
  );

  for (const cp of cacheProducts) {
    const normSku = normalizeSkuCode(cp.sku_code);
    if (normSku && !existingSkuCodes.has(normSku)) {
      combinedRows.push({
        GOODS_CODE: normSku,
        SKU_CODE: normSku,
        SKU_NAME: cp.sku_name || normSku,
        ICCAT_CODE: cp.iccat_code || "03",
        ICCAT_NAME: cp.iccat_name || "งานระหว่างทำ",
        ICDEPT_CODE: cp.icdept_code || "",
        ICDEPT_THAIDESC: cp.icdept_name || "",
        UTQ_NAME: cp.uom_name || "ชุด",
        UTQ_NAME_2: cp.uom_name || "ชุด",
        BRN_CODE: cp.brand_code || "",
        BRN_NAME: cp.brand_name || "",
      });
      existingSkuCodes.add(normSku);
    }
  }

  const dedupedTradeCodes = Array.from(
    new Map(
      combinedRows
        .map((row) => [normalizeGoodsCode(row?.GOODS_CODE), row])
        .filter(([goodsCode]) => Boolean(goodsCode))
    ).values()
  );

  const skuCodes = dedupedTradeCodes
    .map((item) => normalizeSkuCode(item.SKU_CODE))
    .filter(Boolean);
  const goodsCodes = dedupedTradeCodes
    .map((item) => normalizeGoodsCode(item.GOODS_CODE))
    .filter(Boolean);

  const [qtyResult, categoryResult, skuMapResult, tradeBarcodeResult, iccatOptionsResult, icdeptOptionsResult, productsCacheResult] = await Promise.all([
    supabaseAdmin
      .from("pallet_qty_barcodes")
      .select("id,barcode_value,display_qty,label,is_active,updated_at")
      .eq("is_active", true)
      .order("display_qty", { ascending: true }),
    supabaseAdmin
      .from("pallet_qty_category_mappings")
      .select("iccat_code,qty_barcode_id,updated_at")
      .order("iccat_code", { ascending: true }),
    skuCodes.length
      ? supabaseAdmin
        .from("pallet_qty_sku_mappings")
        .select("sku_code,qty_barcode_id,updated_at")
        .in("sku_code", skuCodes)
      : Promise.resolve({ data: [], error: null }),
    goodsCodes.length
      ? supabaseAdmin
        .from("pallet_trade_code_barcodes")
        .select("goods_code,sku_code,product_barcode,updated_at")
        .in("goods_code", goodsCodes)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("products_cache")
      .select("iccat_code,iccat_name")
      .in("iccat_code", ALLOWED_ICCAT_CODES)
      .not("iccat_code", "is", null)
      .order("iccat_code", { ascending: true })
      .limit(5000),
    supabaseAdmin
      .from("products_cache")
      .select("icdept_code,icdept_name")
      .in("iccat_code", ALLOWED_ICCAT_CODES)
      .not("icdept_code", "is", null)
      .order("icdept_code", { ascending: true })
      .limit(5000),
    skuCodes.length
      ? supabaseAdmin
        .from("products_cache")
        .select("sku_code,image_url")
        .in("sku_code", skuCodes)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (qtyResult.error) {
    throw new ApiError(500, "Failed to load quantity barcodes", qtyResult.error.message);
  }
  if (categoryResult.error) {
    throw new ApiError(500, "Failed to load category mappings", categoryResult.error.message);
  }
  if (skuMapResult.error) {
    throw new ApiError(500, "Failed to load SKU mappings", skuMapResult.error.message);
  }
  if (tradeBarcodeResult.error) {
    throw new ApiError(500, "Failed to load trade code barcodes", tradeBarcodeResult.error.message);
  }
  if (iccatOptionsResult.error) {
    throw new ApiError(500, "Failed to load ICCAT options", iccatOptionsResult.error.message);
  }
  if (icdeptOptionsResult.error) {
    throw new ApiError(500, "Failed to load ICDEPT options", icdeptOptionsResult.error.message);
  }
  if (productsCacheResult?.error) {
    throw new ApiError(500, "Failed to load products cache details", productsCacheResult.error.message);
  }

  const qtyBarcodes = qtyResult.data ?? [];
  const categoryMappingsRaw = categoryResult.data ?? [];
  const skuMappingsRaw = skuMapResult.data ?? [];
  const tradeBarcodeRaw = tradeBarcodeResult.data ?? [];
  const iccatOptionRows = iccatOptionsResult.data ?? [];
  const icdeptOptionRows = icdeptOptionsResult.data ?? [];
  const productsCacheRows = productsCacheResult?.data ?? [];

  const imageUrlBySku = new Map(
    productsCacheRows.map((item) => [normalizeSkuCode(item.sku_code), item.image_url])
  );

  const qtyById = new Map(qtyBarcodes.map((item) => [item.id, item]));
  const skuMapByCode = new Map(
    skuMappingsRaw
      .map((item) => [normalizeSkuCode(item.sku_code), item])
      .filter(([code]) => Boolean(code))
  );
  const tradeBarcodeByGoodsCode = new Map(
    tradeBarcodeRaw
      .map((item) => [normalizeGoodsCode(item.goods_code), item])
      .filter(([code]) => Boolean(code))
  );
  const categoryMapByCode = new Map(
    categoryMappingsRaw
      .map((item) => [normalizeIccatCode(item.iccat_code), item])
      .filter(([code]) => Boolean(code))
  );

  const icdeptCodes = Array.from(new Set(categoryMappingsRaw.map((item) => item.iccat_code).filter(Boolean)));
  let categoryNames = new Map();
  if (icdeptCodes.length) {
    const { data: categoryNameRows, error: categoryNameError } = await supabaseAdmin
      .from("products_cache")
      .select("icdept_code,icdept_name")
      .in("icdept_code", icdeptCodes);
    if (categoryNameError) {
      throw new ApiError(500, "Failed to resolve category names", categoryNameError.message);
    }
    categoryNames = new Map();
    (categoryNameRows ?? []).forEach((row) => {
      const normalizedCode = normalizeIccatCode(row.icdept_code);
      if (normalizedCode && !categoryNames.has(normalizedCode)) {
        categoryNames.set(normalizedCode, row.icdept_name || normalizedCode);
      }
    });
  }

  const tradeCodeListPayload = dedupedTradeCodes.map((row) => {
    const skuCode = normalizeSkuCode(row.SKU_CODE) || "";
    const goodsCode = normalizeGoodsCode(row.GOODS_CODE) || "";
    const normalizedIccatCode = normalizeIccatCode(row.ICCAT_CODE);
    const normalizedIcdeptCode = normalizeIccatCode(row.ICDEPT_CODE);
    const skuMap = skuMapByCode.get(skuCode) || null;
    const categoryMap = categoryMapByCode.get(normalizedIcdeptCode || normalizedIccatCode) || null;
    const productBarcode = tradeBarcodeByGoodsCode.get(goodsCode)?.product_barcode || null;
    const skuQty = skuMap ? qtyById.get(skuMap.qty_barcode_id) || null : null;
    const categoryQty = categoryMap ? qtyById.get(categoryMap.qty_barcode_id) || null : null;
    const effectiveQty = skuQty || categoryQty;
    const effectiveSource = skuQty ? "sku" : (categoryQty ? "category" : null);

    return {
      goodsCode,
      skuCode,
      skuName: row.SKU_NAME || "",
      brandCode: row.BRN_CODE || "",
      brandName: row.BRN_NAME || "",
      iccatCode: normalizedIccatCode || "",
      iccatName: row.ICCAT_NAME || "",
      icdeptCode: normalizedIcdeptCode || "",
      icdeptName: row.ICDEPT_THAIDESC || "",
      unitName: row.UTQ_NAME_2 || row.UTQ_NAME || "",
      productBarcode,
      imageUrl: imageUrlBySku.get(skuCode) || null,
      skuQtyBarcodeId: skuQty?.id || null,
      skuQtyDisplayQty: skuQty?.display_qty ?? null,
      effectiveQtyBarcodeId: effectiveQty?.id || null,
      effectiveQtyDisplayQty: effectiveQty?.display_qty ?? null,
      effectiveQtyBarcodeValue: effectiveQty?.barcode_value || null,
      effectiveSource,
    };
  });

  const categoryPayload = categoryMappingsRaw.map((item) => {
    const normalizedCode = normalizeIccatCode(item.iccat_code);
    const qty = qtyById.get(item.qty_barcode_id) || null;
    return {
      icdeptCode: normalizedCode || "",
      icdeptName: categoryNames.get(normalizedCode) || normalizedCode || "",
      iccatCode: normalizedCode || "",
      iccatName: categoryNames.get(normalizedCode) || normalizedCode || "",
      qtyBarcodeId: item.qty_barcode_id,
      qtyDisplayQty: qty?.display_qty ?? null,
      qtyBarcodeValue: qty?.barcode_value || null,
      qtyLabel: qty?.label || null,
      updatedAt: item.updated_at || null,
    };
  });

  const totalRecords = Number(tradeCodePayload?.pagination?.totalRecords || tradeCodeListPayload.length || 0);
  const totalPages = Math.max(1, Number(tradeCodePayload?.pagination?.totalPages || 1));
  const iccatOptions = [];
  const seenIccatCodes = new Set();
  iccatOptionRows.forEach((row) => {
    const code = normalizeIccatCode(row.iccat_code);
    if (!code || seenIccatCodes.has(code)) {
      return;
    }
    seenIccatCodes.add(code);
    iccatOptions.push({
      iccatCode: code,
      iccatName: row.iccat_name || code,
    });
  });

  const icdeptOptions = [];
  const seenIcdeptCodes = new Set();
  icdeptOptionRows.forEach((row) => {
    const code = normalizeIccatCode(row.icdept_code);
    if (!code || seenIcdeptCodes.has(code)) {
      return;
    }
    seenIcdeptCodes.add(code);
    icdeptOptions.push({
      icdeptCode: code,
      icdeptName: row.icdept_name || code,
      iccatCode: code,
      iccatName: row.icdept_name || code,
    });
  });

  return {
    data: {
      qtyBarcodes: qtyBarcodes.map((item) => ({
        id: item.id,
        barcodeValue: item.barcode_value,
        displayQty: item.display_qty,
        label: item.label || null,
        updatedAt: item.updated_at || null,
      })),
      categoryMappings: categoryPayload,
      icdeptOptions,
      iccatOptions,
      tradeCodes: tradeCodeListPayload,
      products: tradeCodeListPayload,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages,
      },
      cursor: {
        next: tradeCodePayload?.cursor?.next || null,
        hasMore: Boolean(tradeCodePayload?.cursor?.hasMore),
      },
    },
  };
}

async function handleCreateQtyBarcode(supabaseAdmin, userId, body) {
  const displayQty = parsePositiveInteger(body.displayQty, "displayQty");
  if (displayQty > 99999) {
    throw new ApiError(400, "displayQty must not exceed 99999");
  }
  const label = normalizeParam(body.label);
  const barcodeValue = buildQtyBarcodeValue(displayQty);
  const { data, error } = await supabaseAdmin
    .from("pallet_qty_barcodes")
    .insert({
      barcode_value: barcodeValue,
      display_qty: displayQty,
      label: label || null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id,barcode_value,display_qty,label,updated_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, `Quantity barcode ${displayQty} already exists`);
    }
    throw new ApiError(500, "Failed to create quantity barcode", error.message);
  }
  return {
    data: {
      qtyBarcode: {
        id: data.id,
        barcodeValue: data.barcode_value,
        displayQty: data.display_qty,
        label: data.label || null,
        updatedAt: data.updated_at || null,
      },
    },
  };
}

async function handleSetCategoryMapping(supabaseAdmin, userId, body) {
  const iccatCode = normalizeIccatCode(body.icdeptCode || body.iccatCode);
  const qtyBarcodeId = normalizeParam(body.qtyBarcodeId);
  if (!iccatCode || !qtyBarcodeId) {
    throw new ApiError(400, "icdeptCode and qtyBarcodeId are required");
  }
  await ensureQtyBarcodeExists(supabaseAdmin, qtyBarcodeId);

  const { error } = await supabaseAdmin
    .from("pallet_qty_category_mappings")
    .upsert({
      iccat_code: iccatCode,
      qty_barcode_id: qtyBarcodeId,
      created_by: userId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "iccat_code" });
  if (error) {
    throw new ApiError(500, "Failed to save category mapping", error.message);
  }
  return { data: { ok: true } };
}

async function handleClearCategoryMapping(supabaseAdmin, body) {
  const iccatCode = normalizeIccatCode(body.icdeptCode || body.iccatCode);
  if (!iccatCode) {
    throw new ApiError(400, "icdeptCode is required");
  }
  const { error } = await supabaseAdmin
    .from("pallet_qty_category_mappings")
    .delete()
    .eq("iccat_code", iccatCode);
  if (error) {
    throw new ApiError(500, "Failed to clear category mapping", error.message);
  }
  return { data: { ok: true } };
}

async function handleSetSkuMapping(supabaseAdmin, userId, body) {
  const skuCode = normalizeSkuCode(body.skuCode);
  const qtyBarcodeId = normalizeParam(body.qtyBarcodeId);
  const allowReplace = Boolean(body.allowReplace);
  if (!skuCode || !qtyBarcodeId) {
    throw new ApiError(400, "skuCode and qtyBarcodeId are required");
  }
  await ensureQtyBarcodeExists(supabaseAdmin, qtyBarcodeId);
  await ensureProductExists(supabaseAdmin, skuCode);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("pallet_qty_sku_mappings")
    .select("sku_code,qty_barcode_id")
    .eq("sku_code", skuCode)
    .maybeSingle();
  if (existingError) {
    throw new ApiError(500, "Failed to validate SKU mapping", existingError.message);
  }
  if (existing && existing.qty_barcode_id !== qtyBarcodeId && !allowReplace) {
    throw new ApiError(
      409,
      `SKU ${skuCode} is already mapped to another quantity barcode. Clear existing mapping first.`
    );
  }

  const { error } = await supabaseAdmin
    .from("pallet_qty_sku_mappings")
    .upsert({
      sku_code: skuCode,
      qty_barcode_id: qtyBarcodeId,
      created_by: userId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "sku_code" });
  if (error) {
    throw new ApiError(500, "Failed to save SKU mapping", error.message);
  }
  return { data: { ok: true } };
}

async function handleClearSkuMapping(supabaseAdmin, body) {
  const skuCode = normalizeSkuCode(body.skuCode);
  if (!skuCode) {
    throw new ApiError(400, "skuCode is required");
  }
  const { error } = await supabaseAdmin
    .from("pallet_qty_sku_mappings")
    .delete()
    .eq("sku_code", skuCode);
  if (error) {
    throw new ApiError(500, "Failed to clear SKU mapping", error.message);
  }
  return { data: { ok: true } };
}

async function handleSetProductBarcode(supabaseAdmin, userId, body) {
  const goodsCode = normalizeGoodsCode(body.goodsCode || body.tradeCode);
  const skuCode = normalizeSkuCode(body.skuCode);
  const productBarcode = normalizeProductBarcode(body.productBarcode);
  if (!goodsCode || !skuCode || !productBarcode) {
    throw new ApiError(400, "goodsCode, skuCode, and productBarcode are required");
  }
  await ensureProductExists(supabaseAdmin, skuCode);

  const { error } = await supabaseAdmin
    .from("pallet_trade_code_barcodes")
    .upsert({
      goods_code: goodsCode,
      sku_code: skuCode,
      product_barcode: productBarcode,
      created_by: userId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "goods_code" });
  if (error) {
    if (isInvalidRegexConstraintError(error)) {
      throw new ApiError(
        500,
        "Database constraint for product barcode format is invalid. Apply latest migration and retry.",
        error.details || error.message
      );
    }
    if (error.code === "23505") {
      throw new ApiError(409, `Product barcode ${productBarcode} is already assigned to another trade code`);
    }
    throw new ApiError(500, "Failed to save trade code barcode", error.message);
  }
  return { data: { ok: true } };
}

async function handleClearProductBarcode(supabaseAdmin, body) {
  const goodsCode = normalizeGoodsCode(body.goodsCode || body.tradeCode);
  if (!goodsCode) {
    throw new ApiError(400, "goodsCode is required");
  }
  const { error } = await supabaseAdmin
    .from("pallet_trade_code_barcodes")
    .delete()
    .eq("goods_code", goodsCode);
  if (error) {
    throw new ApiError(500, "Failed to clear trade code barcode", error.message);
  }
  return { data: { ok: true } };
}

async function handleBulkUpsertProductBarcodes(supabaseAdmin, userId, body) {
  const sourceRows = Array.isArray(body.rows) ? body.rows : [];
  if (!sourceRows.length) {
    throw new ApiError(400, "rows is required");
  }
  if (sourceRows.length > 1000) {
    throw new ApiError(400, "rows must not exceed 1000 items");
  }

  const rowsByGoodsCode = new Map();
  const seenBarcodes = new Map();

  sourceRows.forEach((item, index) => {
    const goodsCode = normalizeGoodsCode(item?.goodsCode || item?.tradeCode);
    const skuCode = normalizeSkuCode(item?.skuCode);
    if (!goodsCode) {
      throw new ApiError(400, `rows[${index}].goodsCode is required`);
    }
    if (!skuCode) {
      throw new ApiError(400, `rows[${index}].skuCode is required`);
    }
    const productBarcode = normalizeProductBarcode(item?.productBarcode);
    if (productBarcode) {
      const existingGoodsCode = seenBarcodes.get(productBarcode);
      if (existingGoodsCode && existingGoodsCode !== goodsCode) {
        throw new ApiError(400, `Duplicate product barcode in import file: ${productBarcode}`);
      }
      seenBarcodes.set(productBarcode, goodsCode);
    }
    rowsByGoodsCode.set(goodsCode, {
      goodsCode,
      skuCode,
      productBarcode,
    });
  });

  const rows = Array.from(rowsByGoodsCode.values());
  await ensureProductsExist(
    supabaseAdmin,
    rows.map((item) => item.skuCode)
  );

  const rowsToClear = rows
    .filter((item) => !item.productBarcode)
    .map((item) => item.goodsCode);
  const rowsToUpsert = rows.filter((item) => item.productBarcode);

  if (rowsToClear.length) {
    const { error } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .delete()
      .in("goods_code", rowsToClear);
    if (error) {
      throw new ApiError(500, "Failed to clear trade code barcodes", error.message);
    }
  }

  if (rowsToUpsert.length) {
    const timestamp = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .upsert(
        rowsToUpsert.map((item) => ({
          goods_code: item.goodsCode,
          sku_code: item.skuCode,
          product_barcode: item.productBarcode,
          created_by: userId,
          updated_by: userId,
          updated_at: timestamp,
        })),
        { onConflict: "goods_code" }
      );
    if (error) {
      if (isInvalidRegexConstraintError(error)) {
        throw new ApiError(
          500,
          "Database constraint for product barcode format is invalid. Apply latest migration and retry.",
          error.details || error.message
        );
      }
      if (error.code === "23505") {
        throw new ApiError(409, "One or more product barcodes are already assigned to another trade code");
      }
      throw new ApiError(500, "Failed to import trade code barcodes", error.message);
    }
  }

  return {
    data: {
      ok: true,
      totalCount: rows.length,
      updatedCount: rowsToUpsert.length,
      clearedCount: rowsToClear.length,
    },
  };
}

async function handleGenerateWip03Barcodes(supabaseAdmin, userId) {
  const tradeCodeRows = await fetchAllTradeCodeRowsByIccat("03");
  const candidates = tradeCodeRows
    .map((row) => ({
      goodsCode: normalizeGoodsCode(row?.GOODS_CODE),
      skuCode: normalizeSkuCode(row?.SKU_CODE),
    }))
    .filter((row) => row.goodsCode && row.skuCode);

  if (!candidates.length) {
    return { data: { ok: true, totalCount: 0, createdCount: 0, skippedCount: 0, rows: [] } };
  }

  const existingByGoodsCode = new Set();
  for (let index = 0; index < candidates.length; index += 500) {
    const goodsCodes = candidates.slice(index, index + 500).map((item) => item.goodsCode);
    const { data, error } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code")
      .in("goods_code", goodsCodes);
    if (error) {
      throw new ApiError(500, "Failed to load existing WIP barcode mappings", error.message);
    }
    (data ?? []).forEach((item) => {
      const goodsCode = normalizeGoodsCode(item.goods_code);
      if (goodsCode) existingByGoodsCode.add(goodsCode);
    });
  }

  const rowsToCreate = candidates.filter((item) => !existingByGoodsCode.has(item.goodsCode));
  const generatedRows = [];
  for (const item of rowsToCreate) {
    const { data, error } = await supabaseAdmin.rpc("create_wip03_rcn13_barcode", {
      p_goods_code: item.goodsCode,
      p_sku_code: item.skuCode,
      p_created_by: userId,
    });
    if (error) {
      throw new ApiError(500, `Failed to generate barcode for ${item.goodsCode}`, error.message);
    }
    const barcode = normalizeProductBarcode(data);
    if (!barcode) {
      throw new ApiError(500, `Generated barcode is invalid for ${item.goodsCode}`);
    }
    generatedRows.push({ goodsCode: item.goodsCode, productBarcode: barcode });
  }

  return {
    data: {
      ok: true,
      totalCount: candidates.length,
      createdCount: generatedRows.length,
      skippedCount: candidates.length - generatedRows.length,
      rows: generatedRows,
    },
  };
}

async function handleSetProductImage(supabaseAdmin, userId, body) {
  const skuCode = normalizeSkuCode(body.skuCode);
  const imageUrl = body.imageUrl;
  if (!skuCode) {
    throw new ApiError(400, "skuCode is required");
  }
  await ensureProductExists(supabaseAdmin, skuCode);

  const { error } = await supabaseAdmin
    .from("products_cache")
    .update({
      image_url: imageUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("sku_code", skuCode);

  if (error) {
    throw new ApiError(500, "Failed to save product image", error.message);
  }
  return { data: { ok: true } };
}

async function mutatePalletBarcodeSettings(request) {
  const body = await readJson(request);
  const action = String(body.action || "").trim();
  if (!action) {
    throw new ApiError(400, "action is required");
  }

  const operation = action.startsWith("clear_") ? "delete"
    : ["create_qty_barcode", "generate_wip03_rcn13_barcodes"].includes(action) ? "create" : "edit";
  const { userId } = await requireTaskPermission(request, `production-settings-pallet-barcodes-${operation}`);
  const supabaseAdmin = getSupabaseAdmin();
  if (action === "create_qty_barcode") {
    return handleCreateQtyBarcode(supabaseAdmin, userId, body);
  }
  if (action === "set_category_mapping") {
    return handleSetCategoryMapping(supabaseAdmin, userId, body);
  }
  if (action === "clear_category_mapping") {
    return handleClearCategoryMapping(supabaseAdmin, body);
  }
  if (action === "set_sku_mapping") {
    return handleSetSkuMapping(supabaseAdmin, userId, body);
  }
  if (action === "clear_sku_mapping") {
    return handleClearSkuMapping(supabaseAdmin, body);
  }
  if (action === "set_trade_code_barcode" || action === "set_product_barcode") {
    return handleSetProductBarcode(supabaseAdmin, userId, body);
  }
  if (action === "clear_trade_code_barcode" || action === "clear_product_barcode") {
    return handleClearProductBarcode(supabaseAdmin, body);
  }
  if (action === "bulk_upsert_trade_code_barcodes" || action === "bulk_upsert_product_barcodes") {
    return handleBulkUpsertProductBarcodes(supabaseAdmin, userId, body);
  }
  if (action === "generate_wip03_rcn13_barcodes") {
    return handleGenerateWip03Barcodes(supabaseAdmin, userId);
  }
  if (action === "set_product_image") {
    return handleSetProductImage(supabaseAdmin, userId, body);
  }
  throw new ApiError(400, `Unsupported action: ${action}`);
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listPalletBarcodeSettings(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const result = await mutatePalletBarcodeSettings(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
