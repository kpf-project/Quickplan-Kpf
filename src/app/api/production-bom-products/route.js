import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeCsvParam, normalizeParam } from "@/lib/validation";
import { BOM_PARENT_CATEGORY_OPTIONS, RAW_CATEGORY_OPTIONS, WIP_CATEGORY_OPTIONS } from "@/lib/bomMatrix";

export const dynamic = 'force-dynamic';

const DEFAULT_PARENT_CATEGORIES = BOM_PARENT_CATEGORY_OPTIONS;
const DEFAULT_FORMULA_CODE = "DEFAULT";
const TRADE_CODE_PAGE_SIZE = 500;
const MAX_TRADE_CODE_ROWS = 100000;
const DEFAULT_FORMULA_NAME = "สูตรหลัก";
const ALLOWED_EXPAND_CATEGORIES = new Set([
  ...RAW_CATEGORY_OPTIONS.map((value) => String(value).trim().toUpperCase()),
  ...WIP_CATEGORY_OPTIONS.map((value) => String(value).trim().toUpperCase())
]);

function normalizeStatus(value) {
  if (!value) return "all";
  const lowered = String(value).toLowerCase();
  if (["draft", "pending_review", "approved", "rejected"].includes(lowered)) {
    return lowered;
  }
  return "all";
}

function normalizeFormulaCode(value) {
  const normalized = normalizeParam(value);
  if (!normalized) return DEFAULT_FORMULA_CODE;
  return normalized.toUpperCase();
}

function normalizeFormulaName(value) {
  return normalizeParam(value) ?? DEFAULT_FORMULA_NAME;
}

function isMissingFormulaColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("formula_code") || message.includes("formula_name");
}

function normalizeBooleanFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

async function listTradeCodesForBom({ iccatCodes, search }) {
  const rows = [];
  let page = 1;
  let cursor = null;

  while (rows.length < MAX_TRADE_CODE_ROWS) {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", TRADE_CODE_PAGE_SIZE.toString());
    if (search) {
      params.set("search", search);
    }
    if (iccatCodes.length) {
      params.set("iccatCodes", iccatCodes.join(","));
    }
    if (cursor) {
      params.set("cursor", cursor);
    }

    const result = await fetchGatewayJson("/api/trade-codes", params, "production");
    if (!result.ok) {
      throw new Error("Failed to load trade codes");
    }

    const payload = result.data ?? {};
    const pageRows = Array.isArray(payload.data) ? payload.data : [];
    rows.push(...pageRows);

    const nextCursor = payload.cursor?.next ?? null;
    const hasMore = Boolean(payload.cursor?.hasMore);
    if (!hasMore || !nextCursor || pageRows.length === 0) {
      break;
    }

    page += 1;
    cursor = nextCursor;
  }

  return rows.slice(0, MAX_TRADE_CODE_ROWS);
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-bom-view",
      "production-line-bom-manage",
    ]);
    const { searchParams } = new URL(request.url);
    const search = normalizeParam(searchParams.get("search")) ?? "";
    const categoryId = normalizeParam(searchParams.get("categoryId"));
    const bomFilter = normalizeParam(searchParams.get("bomFilter")) ?? "all";
    const statusFilter = normalizeStatus(searchParams.get("status"));
    const expandTradeCodes = normalizeBooleanFlag(searchParams.get("expandTradeCodes"));
    const iccatCodesParam = normalizeCsvParam(searchParams.get("iccatCodes"));
    const icdeptCodesParam = normalizeCsvParam(searchParams.get("icdeptCodes"));
    const iccatCodes = iccatCodesParam
      ? iccatCodesParam.split(",").map((value) => value.trim()).filter(Boolean)
      : DEFAULT_PARENT_CATEGORIES;

    const supabaseAdmin = getSupabaseAdmin();

    let skuCodesFilter = null;
    if (categoryId) {
      const { data: categoryProducts, error: categoryError } = await supabaseAdmin
        .from("production_category_products")
        .select("sku_code")
        .eq("category_id", categoryId);
      if (categoryError) {
        return Response.json(
          { error: "Failed to load category products" },
          { status: 500 }
        );
      }
      skuCodesFilter = (categoryProducts ?? []).map((row) => row.sku_code);
      if (!skuCodesFilter.length) {
        return Response.json({ data: [] });
      }
    }


    // Use recursive or looped fetching to bypass Supabase global row limit (often 1000)
    let allProducts = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      let query = supabaseAdmin
        .from("products_cache")
        .select(
          "sku_code,sku_name,iccat_code,iccat_name,icdept_code,icdept_name,uom_name,is_active,updated_at"
        )
        .order("sku_code", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1); // Use range pagination

      const hasAll = iccatCodes.some(c => c.toUpperCase() === 'ALL');
      if (iccatCodes.length && !hasAll) {
        query = query.in("iccat_code", iccatCodes);
      }
      if (icdeptCodesParam) {
        const icdeptCodes = icdeptCodesParam
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        if (icdeptCodes.length) {
          query = query.in("icdept_code", icdeptCodes);
        }
      }

      if (search) {
        query = query.or(`sku_code.ilike.%${search}%,sku_name.ilike.%${search}%`);
      }

      if (skuCodesFilter) {
        query = query.in("sku_code", skuCodesFilter);
      }

      const { data: products, error: productsError } = await query;

      if (productsError) {
        // If error on first page, fail. If later, maybe partial? Better fail.
        return Response.json({ error: "Failed to load products" }, { status: 500 });
      }

      if (!products || products.length === 0) {
        break;
      }

      allProducts.push(...products);

      // If we got fewer than pageSize, we are done
      if (products.length < pageSize) {
        break;
      }

      // Safety break to prevent infinite loops if something is wrong (e.g. > 100k products)
      if (allProducts.length > 50000) {
        break;
      }

      page++;
    }

    // Alias allProducts back to products for downstream logic
    const products = allProducts;

    const skuCodes = (products ?? []).map((item) => item.sku_code);
    const bomMap = new Map();
    const formulaOptionsBySku = new Map();
    if (skuCodes.length) {
      const fetchBomsChunk = async (codes) => {
        let bomQuery = supabaseAdmin
          .from("production_boms")
          .select("id,sku_code,status,updated_at")
          .in("sku_code", codes);
        if (statusFilter !== "all") {
          bomQuery = bomQuery.eq("status", statusFilter);
        }
        const { data, error } = await bomQuery;
        if (error) throw error;
        return data;
      };

      const CHUNK_SIZE = 200;
      const chunks = [];
      for (let i = 0; i < skuCodes.length; i += CHUNK_SIZE) {
        chunks.push(skuCodes.slice(i, i + CHUNK_SIZE));
      }

      try {
        const results = await runBatched(chunks, 3, fetchBomsChunk);
        const allBoms = results.flat();

        allBoms.forEach((bom) => {
          if (bom) bomMap.set(bom.sku_code, bom);
        });

        const bomIds = allBoms.map((bom) => bom?.id).filter(Boolean);
        if (bomIds.length) {
          const fetchVersionsChunk = async (ids) => {
            const baseQuery = supabaseAdmin
              .from("production_bom_versions")
              .select("id,bom_id,version_no,status,formula_code,formula_name,base_batch,base_output_boxes,wip_qty_input_mode")
              .in("bom_id", ids)
              .eq("status", "approved")
              .order("version_no", { ascending: false });
            const result = await baseQuery;
            if (result.error && isMissingFormulaColumns(result.error)) {
              const fallback = await supabaseAdmin
                .from("production_bom_versions")
                .select("id,bom_id,version_no,status,base_batch,base_output_boxes,wip_qty_input_mode")
                .in("bom_id", ids)
                .eq("status", "approved")
                .order("version_no", { ascending: false });
              return fallback;
            }
            return result;
          };
          const versionChunks = [];
          for (let i = 0; i < bomIds.length; i += CHUNK_SIZE) {
            versionChunks.push(bomIds.slice(i, i + CHUNK_SIZE));
          }
          const versionResults = await runBatched(versionChunks, 3, fetchVersionsChunk);
          const versions = versionResults.flatMap((result) => result?.data ?? []);
          const skuByBomId = new Map(allBoms.map((bom) => [bom.id, bom.sku_code]));
          versions.forEach((version) => {
            const skuCode = skuByBomId.get(version.bom_id);
            if (!skuCode) return;
            if (!formulaOptionsBySku.has(skuCode)) {
              formulaOptionsBySku.set(skuCode, new Map());
            }
            const formulaMap = formulaOptionsBySku.get(skuCode);
            const code = normalizeFormulaCode(version.formula_code);
            if (formulaMap.has(code)) return;
            const baseBatch = Number(version.base_batch);
            const baseOutputBoxes = Number(version.base_output_boxes);
            const unitsPerBatch =
              Number.isFinite(baseBatch) && baseBatch > 0 && Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0
                ? baseOutputBoxes / baseBatch
                : null;
              formulaMap.set(code, {
                formula_code: code,
                formula_name: normalizeFormulaName(version.formula_name),
                bom_version_id: version.id ?? null,
                version_no: version.version_no ?? null,
                base_batch: Number.isFinite(baseBatch) && baseBatch > 0 ? baseBatch : null,
                base_output_boxes: Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0 ? baseOutputBoxes : null,
                wip_qty_input_mode: String(version.wip_qty_input_mode || "").trim().toLowerCase() || "unit",
                units_per_batch: unitsPerBatch,
              });
          });
        }
      } catch (error) {
        return Response.json({ error: "Failed to load bom status" }, { status: 500 });
      }
    }

    const filteredProducts = (products ?? []).filter((product) => {
      const hasBom = bomMap.has(product.sku_code);
      if (bomFilter === "with") return hasBom;
      if (bomFilter === "without") return !hasBom;
      if (statusFilter !== "all") return hasBom;
      return true;
    });

    const basePayload = filteredProducts.map((product) => {
      const bom = bomMap.get(product.sku_code);
      return {
        sku_code: product.sku_code,
        sku_name: product.sku_name,
        iccat_code: product.iccat_code,
        iccat_name: product.iccat_name,
        icdept_code: product.icdept_code,
        icdept_name: product.icdept_name,
        uom_name: product.uom_name,
        bom_status: bom?.status ?? null,
        bom_updated_at: bom?.updated_at ?? null,
        bom_id: bom?.id ?? null,
        formula_options: formulaOptionsBySku.has(product.sku_code)
          ? Array.from(formulaOptionsBySku.get(product.sku_code).values()).sort((a, b) => {
            if (a.formula_code === DEFAULT_FORMULA_CODE) return -1;
            if (b.formula_code === DEFAULT_FORMULA_CODE) return 1;
            return a.formula_code.localeCompare(b.formula_code);
          })
          : [],
        formula_count: formulaOptionsBySku.has(product.sku_code)
          ? formulaOptionsBySku.get(product.sku_code).size
          : 0,
        is_active: product.is_active,
      };
    });

    let payload = basePayload;
    if (expandTradeCodes) {
      try {
        const tradeCodeRows = await listTradeCodesForBom({ iccatCodes, search });
        const productBySku = new Map(basePayload.map((product) => [normalizeCode(product.sku_code), product]));
        const rawTradeRows = [];
        const rawTradeSkuSet = new Set();
        const seenTradeKeys = new Set();

        tradeCodeRows.forEach((row) => {
          const skuCode = normalizeCode(row?.SKU_CODE);
          const goodsCode = normalizeCode(row?.GOODS_CODE);
          const iccatCode = normalizeCode(row?.ICCAT_CODE);
          if (!skuCode || !goodsCode || !ALLOWED_EXPAND_CATEGORIES.has(iccatCode)) {
            return;
          }
          const dedupeKey = `${skuCode}::${goodsCode}`;
          if (seenTradeKeys.has(dedupeKey)) {
            return;
          }
          seenTradeKeys.add(dedupeKey);
          rawTradeSkuSet.add(skuCode);

          const product = productBySku.get(skuCode);
          rawTradeRows.push({
            sku_code: product?.sku_code || skuCode,
            sku_name: String(row?.SKU_NAME || product?.sku_name || "").trim(),
            iccat_code: iccatCode || product?.iccat_code || "",
            iccat_name: String(row?.ICCAT_NAME || product?.iccat_name || "").trim(),
            icdept_code: String(row?.ICDEPT_CODE || product?.icdept_code || "").trim(),
            icdept_name: String(row?.ICDEPT_THAIDESC || product?.icdept_name || "").trim(),
            uom_name: String(row?.UTQ_NAME || product?.uom_name || "").trim(),
            bom_status: product?.bom_status ?? null,
            bom_updated_at: product?.bom_updated_at ?? null,
            bom_id: product?.bom_id ?? null,
            formula_options: product?.formula_options ?? [],
            formula_count: product?.formula_count ?? 0,
            is_active: product?.is_active ?? true,
            goods_code: goodsCode,
            goods_name: String(row?.GOODS_ALIAS || row?.SKU_NAME || product?.sku_name || "").trim(),
            goods_uom_name: String(row?.UTQ_NAME_2 || row?.UTQ_NAME || product?.uom_name || "").trim(),
            goods_qty: Number(row?.UTQ_QTY_2 ?? row?.UTQ_QTY ?? 0) || null,
          });
        });

        const fallbackRows = basePayload
          .filter((product) => {
            const normalizedSku = normalizeCode(product.sku_code);
            const normalizedCategory = normalizeCode(product.iccat_code);
            if (!ALLOWED_EXPAND_CATEGORIES.has(normalizedCategory)) {
              return true;
            }
            return !rawTradeSkuSet.has(normalizedSku);
          })
          .map((product) => ({
            ...product,
            goods_code: product.sku_code,
            goods_name: product.sku_name,
            goods_uom_name: product.uom_name,
            goods_qty: 1,
          }));

        payload = [...fallbackRows, ...rawTradeRows];
      } catch (error) {
        return Response.json({ error: "Failed to load material trade codes" }, { status: 500 });
      }
    }

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}

async function runBatched(items, limit, worker) {
  if (!items.length) {
    return [];
  }
  const results = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, runWorker);
  await Promise.all(workers);
  return results;
}
