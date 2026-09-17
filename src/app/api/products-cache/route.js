import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { normalizeCsvParam, normalizeParam, parsePaginationParams } from "@/lib/validation";
import { fetchTradeCodesWithGatewayFallback } from "@/lib/erpTradeCodes";

const DEFAULT_ICCAT_CODES = ["03", "04", "04-1", "04-2"];

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePaginationParams(searchParams, {
      page: 1,
      pageSize: 50,
    });
    if (!page || !pageSize) {
      return Response.json({ error: "Invalid pagination values" }, { status: 400 });
    }
    const search = normalizeParam(searchParams.get("search")) ?? "";
    const cursor = normalizeParam(searchParams.get("cursor"));
    const iccatCodesParam = normalizeCsvParam(searchParams.get("iccatCodes"));
    const iccatCodes = iccatCodesParam
      ? iccatCodesParam.split(",").map((value) => value.trim()).filter(Boolean)
      : DEFAULT_ICCAT_CODES;

    // 1. Fetch Trade Codes directly via Gateway with instant ERP MSSQL fallback
    try {
      const tradeResult = await fetchTradeCodesWithGatewayFallback({
        page,
        pageSize,
        search,
        cursor,
        iccatCodes,
      });

      if (tradeResult && Array.isArray(tradeResult.data) && tradeResult.data.length > 0) {
        const rawRows = tradeResult.data;
        const dedupedRows = Array.from(
          new Map(
            rawRows
              .map((row) => [String(row.goods_code || row.sku_code || "").trim().toUpperCase(), row])
              .filter(([code]) => Boolean(code))
          ).values()
        );

        const mappedData = dedupedRows.map((row) => ({
          sku_code: String(row.sku_code || "").trim(),
          trade_code: String(row.goods_code || row.sku_code || "").trim(),
          sku_name: row.sku_name || "",
          iccat_code: row.iccat_code || "",
          iccat_name: row.iccat_name || "",
          icdept_code: row.icdept_code || "",
          icdept_name: row.icdept_name || "",
          uom_name: row.uom_name || "",
          brand_code: row.brand_code || "",
          brand_name: row.brand_name || "",
          is_active: true,
        }));

        return Response.json({
          data: mappedData,
          pagination: {
            page: Number(tradeResult.pagination?.page || page),
            pageSize: Number(tradeResult.pagination?.pageSize || pageSize),
            totalRecords: Number(tradeResult.pagination?.totalRecords || dedupedRows.length),
            totalPages: Math.max(1, Number(tradeResult.pagination?.totalPages || 1)),
          },
          cursor: {
            next: tradeResult.cursor?.next || null,
            hasMore: Boolean(tradeResult.cursor?.hasMore),
          },
        });
      }
    } catch {
      // Fall back to local products_cache if both ERP gateway and direct MSSQL are offline
    }

    // 2. Fallback to Supabase products_cache + pallet_trade_code_barcodes mapping
    const supabaseAdmin = getSupabaseAdmin();
    let tradeSkuCodes = [];
    if (search) {
      const { data: tradeMatches } = await supabaseAdmin
        .from("pallet_trade_code_barcodes")
        .select("sku_code")
        .ilike("goods_code", `%${search}%`)
        .limit(500);
      tradeSkuCodes = Array.from(new Set(
        (tradeMatches ?? []).map((row) => String(row.sku_code || "").trim()).filter(Boolean)
      ));
    }
    let query = supabaseAdmin
      .from("products_cache")
      .select(
        "sku_code,sku_name,iccat_code,iccat_name,icdept_code,icdept_name,brand_code,brand_name,uom_name,is_active,updated_at",
        { count: "exact" }
      )
      .order("sku_code", { ascending: true });

    if (iccatCodes.length) {
      query = query.in("iccat_code", iccatCodes);
    }

    if (search) {
      const tradeFilter = tradeSkuCodes.length
        ? `,sku_code.in.(${tradeSkuCodes.join(",")})`
        : "";
      query = query.or(`sku_code.ilike.%${search}%,sku_name.ilike.%${search}%${tradeFilter}`);
    }

    if (cursor) {
      query = query.gt("sku_code", cursor);
    }

    const { data: rawData, error, count } = await query.limit(pageSize + 1);
    if (error) {
      return Response.json({ error: "Failed to load products" }, { status: 500 });
    }

    let data = rawData ?? [];
    let hasMore = false;
    if (data.length > pageSize) {
      hasMore = true;
      data = data.slice(0, pageSize);
    }
    const nextCursor = hasMore ? data[data.length - 1]?.sku_code ?? null : null;

    const skuCodes = data.map((row) => row.sku_code).filter(Boolean);
    const { data: tradeRows } = skuCodes.length
      ? await supabaseAdmin
        .from("pallet_trade_code_barcodes")
        .select("goods_code,sku_code")
        .in("sku_code", skuCodes)
        .order("goods_code", { ascending: true })
      : { data: [] };
    const tradeCodeBySku = new Map();
    (tradeRows ?? []).forEach((row) => {
      if (!tradeCodeBySku.has(row.sku_code)) tradeCodeBySku.set(row.sku_code, row.goods_code);
    });

    return Response.json({
      data: data.map((row) => ({
        ...row,
        trade_code: tradeCodeBySku.get(row.sku_code) || row.sku_code,
      })),
      pagination: {
        page,
        pageSize,
        totalRecords: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
