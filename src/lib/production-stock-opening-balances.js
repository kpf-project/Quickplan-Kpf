import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import {
  loadScaleProductsData,
  SCALE_CATEGORY_CODE,
  SCALE_DEPARTMENT_CODE,
} from "@/lib/scale/products";

const IMPORT_SOURCE = "erp_opening_balance";
const IMPORT_BATCH_PREFIX = "OB";
const DEFAULT_RECENT_BATCH_LIMIT = 8;
const UPSERT_CHUNK_SIZE = 200;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeProductCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeLotNo(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeRemark(value) {
  return normalizeText(value).slice(0, 500);
}

function parseDecimal(value) {
  const normalized = normalizeText(value).replaceAll(",", "");
  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : Number.NaN;
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

function ensureIsoDate(value, fieldName = "balanceDate") {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  const [yearText, monthText, dayText] = normalized.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  return normalized;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function createImportBatchNo(balanceDate) {
  const datePart = balanceDate.replaceAll("-", "");
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${IMPORT_BATCH_PREFIX}-${datePart}-${timestamp}-${randomPart}`;
}

function buildScopePayload(scopeData) {
  const products = Array.isArray(scopeData?.products) ? scopeData.products : [];
  const departmentId = scopeData?.preset?.departmentId ?? null;

  return {
    departmentId,
    departmentCode: scopeData?.preset?.departmentCode || SCALE_DEPARTMENT_CODE,
    departmentName: scopeData?.preset?.departmentName || "",
    categoryCode: scopeData?.preset?.categoryCode || SCALE_CATEGORY_CODE,
    source: scopeData?.source || "fallback",
    products: products.map((product) => ({
      code: normalizeProductCode(product.code),
      name: normalizeText(product.name),
      unit: normalizeText(product.unit),
    })),
  };
}

function buildProductLookup(products) {
  return new Map(
    products.map((product) => [
      normalizeProductCode(product.code),
      {
        code: normalizeProductCode(product.code),
        name: normalizeText(product.name),
        unit: normalizeText(product.unit),
      },
    ])
  );
}

function normalizeImportRows(rows, productLookup) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, "Opening balance rows are required");
  }

  const normalizedRows = [];
  const duplicateKeys = new Set();
  const seenKeys = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const productCode = normalizeProductCode(row?.productCode);
    const lotNo = normalizeLotNo(row?.lotNo);
    const quantity = parseDecimal(row?.quantity);
    const weightKg = parseDecimal(row?.weightKg);
    const remark = normalizeRemark(row?.remark);
    const product = productLookup.get(productCode);

    if (!productCode) {
      throw new ApiError(400, `Row ${rowNumber}: product code is required`);
    }
    if (!product) {
      throw new ApiError(
        400,
        `Row ${rowNumber}: product ${productCode} is outside ${SCALE_DEPARTMENT_CODE} / category ${SCALE_CATEGORY_CODE} scope`
      );
    }
    if (!lotNo) {
      throw new ApiError(400, `Row ${rowNumber}: lot number is required`);
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new ApiError(400, `Row ${rowNumber}: quantity must be a non-negative number`);
    }
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      throw new ApiError(400, `Row ${rowNumber}: weight must be a non-negative number`);
    }
    if (quantity === 0 && weightKg === 0) {
      throw new ApiError(400, `Row ${rowNumber}: quantity or weight must be greater than zero`);
    }

    const scopeKey = `${productCode}::${lotNo}`;
    if (seenKeys.has(scopeKey)) {
      duplicateKeys.add(scopeKey);
    }
    seenKeys.add(scopeKey);

    normalizedRows.push({
      rowNumber,
      productCode,
      productName: product.name,
      uomName: product.unit || null,
      lotNo,
      quantity,
      weightKg,
      remark,
    });
  });

  if (duplicateKeys.size > 0) {
    throw new ApiError(
      400,
      `Duplicate product and lot combinations found: ${Array.from(duplicateKeys).join(", ")}`
    );
  }

  return normalizedRows;
}

function buildRecentImportBatches(rows, limit = DEFAULT_RECENT_BATCH_LIMIT) {
  const batches = [];
  const batchMap = new Map();

  rows.forEach((row) => {
    const batchNo = normalizeText(row?.import_batch_no) || "-";
    if (!batchMap.has(batchNo)) {
      const batch = {
        importBatchNo: batchNo,
        balanceDate: normalizeText(row?.balance_date),
        source: normalizeText(row?.source) || IMPORT_SOURCE,
        rowCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
        createdAt: row?.created_at ?? null,
      };
      batchMap.set(batchNo, batch);
      batches.push(batch);
    }

    const batch = batchMap.get(batchNo);
    batch.rowCount += 1;
    batch.totalQuantity = Number((batch.totalQuantity + Number(row?.quantity || 0)).toFixed(3));
    batch.totalWeightKg = Number((batch.totalWeightKg + Number(row?.weight_kg || 0)).toFixed(3));
    if (!batch.createdAt && row?.created_at) {
      batch.createdAt = row.created_at;
    }
  });

  return batches.slice(0, limit);
}

export async function loadProductionStockOpeningBalancePageData(
  supabaseAdmin = getSupabaseAdmin()
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);

  if (!scope.departmentId) {
    return {
      scope,
      recentImportBatches: [],
      latestOpeningBalances: [],
    };
  }

  const openingBalancesResult = await supabaseAdmin
    .from("production_stock_opening_balances")
    .select(
      "id,balance_date,product_code,product_name_snapshot,lot_no,quantity,weight_kg,import_batch_no,source,created_at"
    )
    .eq("department_id", scope.departmentId)
    .eq("category_code", scope.categoryCode)
    .order("created_at", { ascending: false })
    .limit(80);

  if (openingBalancesResult.error) {
    const message = String(openingBalancesResult.error.message || "");
    if (message.includes("production_stock_opening_balances")) {
      return {
        scope,
        recentImportBatches: [],
        latestOpeningBalances: [],
      };
    }
    throw new Error("Failed to load opening balance import page data");
  }

  const latestOpeningBalances = (openingBalancesResult.data ?? []).slice(0, 12).map((row) => ({
    id: row.id,
    balanceDate: normalizeText(row.balance_date),
    productCode: normalizeProductCode(row.product_code),
    productName: normalizeText(row.product_name_snapshot),
    lotNo: normalizeLotNo(row.lot_no),
    quantity: Number(row.quantity || 0),
    weightKg: Number(row.weight_kg || 0),
    importBatchNo: normalizeText(row.import_batch_no),
    source: normalizeText(row.source),
    createdAt: row.created_at ?? null,
  }));

  return {
    scope,
    recentImportBatches: buildRecentImportBatches(openingBalancesResult.data ?? []),
    latestOpeningBalances,
  };
}

export async function importProductionStockOpeningBalances(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const balanceDate = ensureIsoDate(input?.balanceDate);
  const replaceForDate = parseBoolean(input?.replaceForDate);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);

  if (!scope.departmentId) {
    throw new ApiError(400, "Scale department is not configured");
  }

  const productLookup = buildProductLookup(scope.products);
  const normalizedRows = normalizeImportRows(input?.rows, productLookup);
  const importBatchNo = createImportBatchNo(balanceDate);

  if (replaceForDate) {
    const deleteResult = await supabaseAdmin
      .from("production_stock_opening_balances")
      .delete()
      .eq("department_id", scope.departmentId)
      .eq("category_code", scope.categoryCode)
      .eq("balance_date", balanceDate);

    if (deleteResult.error) {
      throw new Error("Failed to clear existing opening balances");
    }
  }

  const baseMetadata = {
    importStrategy: replaceForDate ? "replace-date" : "upsert-scope",
    importedAt: new Date().toISOString(),
  };

  const payload = normalizedRows.map((row) => ({
    balance_date: balanceDate,
    department_id: scope.departmentId,
    department_code: scope.departmentCode,
    product_code: row.productCode,
    product_name_snapshot: row.productName,
    category_code: scope.categoryCode,
    lot_no: row.lotNo,
    uom_name: row.uomName,
    quantity: row.quantity,
    weight_kg: row.weightKg,
    source: IMPORT_SOURCE,
    import_batch_no: importBatchNo,
    remark: row.remark || null,
    metadata: {
      ...baseMetadata,
      rowNumber: row.rowNumber,
    },
    created_by: actorUserId,
  }));

  const payloadChunks = chunkArray(payload, UPSERT_CHUNK_SIZE);
  for (const chunk of payloadChunks) {
    const upsertResult = await supabaseAdmin
      .from("production_stock_opening_balances")
      .upsert(chunk, {
        onConflict: "balance_date,department_id,product_code,lot_no",
      });

    if (upsertResult.error) {
      throw new Error("Failed to import opening balances");
    }
  }

  return {
    importBatchNo,
    balanceDate,
    replaceForDate,
    scope: {
      departmentCode: scope.departmentCode,
      departmentName: scope.departmentName,
      categoryCode: scope.categoryCode,
    },
    summary: {
      rowCount: normalizedRows.length,
      totalQuantity: Number(
        normalizedRows.reduce((sum, row) => sum + row.quantity, 0).toFixed(3)
      ),
      totalWeightKg: Number(
        normalizedRows.reduce((sum, row) => sum + row.weightKg, 0).toFixed(3)
      ),
    },
    rows: normalizedRows.map((row) => ({
      productCode: row.productCode,
      productName: row.productName,
      lotNo: row.lotNo,
      quantity: row.quantity,
      weightKg: row.weightKg,
      remark: row.remark,
    })),
  };
}
