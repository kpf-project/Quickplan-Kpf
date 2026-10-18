import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";
import { fetchTradeCodesWithGatewayFallback } from "@/lib/erpTradeCodes";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-category-products-view");
    const { searchParams } = new URL(request.url);
    const categoryId = normalizeParam(searchParams.get("categoryId"));
    if (!categoryId) {
      return Response.json({ error: "categoryId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_category_products")
      .select("sku_code, products_cache(sku_name, iccat_code, iccat_name,uom_name)")
      .eq("category_id", categoryId)
      .order("sku_code", { ascending: true });

    if (error) {
      return Response.json({ error: "Failed to load category products" }, { status: 500 });
    }

    const skuCodes = (data ?? []).map((row) => row.sku_code).filter(Boolean);
    if (!skuCodes.length) {
      return Response.json({ data: [] });
    }

    // Try fetching full Trade Codes from ERP directly for all assigned SKUs
    let erpRows = [];
    try {
      const tradeResult = await fetchTradeCodesWithGatewayFallback({
        skuCodes,
        pageSize: Math.max(500, skuCodes.length * 3),
      });
      erpRows = Array.isArray(tradeResult?.data) ? tradeResult.data : [];
    } catch {
      erpRows = [];
    }

    if (erpRows.length > 0) {
      const payload = erpRows.map((row) => ({
        sku_code: row.sku_code,
        trade_code: row.goods_code || row.sku_code,
        sku_name: row.sku_name || "",
        iccat_code: row.iccat_code || "",
        iccat_name: row.iccat_name || "",
        icdept_code: row.icdept_code || "",
        icdept_name: row.icdept_name || "",
        uom_name: row.uom_name || "",
      }));

      return Response.json({ data: payload });
    }

    // Fallback: use local products_cache and pallet_trade_code_barcodes mapping
    const { data: tradeRows } = await supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code,sku_code")
      .in("sku_code", skuCodes)
      .order("goods_code", { ascending: true });

    const tradeCodeBySku = new Map();
    (tradeRows ?? []).forEach((row) => {
      if (!tradeCodeBySku.has(row.sku_code)) tradeCodeBySku.set(row.sku_code, row.goods_code);
    });

    const payload = (data ?? []).map((row) => ({
      sku_code: row.sku_code,
      trade_code: tradeCodeBySku.get(row.sku_code) || row.sku_code,
      sku_name: row.products_cache?.sku_name ?? "",
      iccat_code: row.products_cache?.iccat_code ?? "",
      iccat_name: row.products_cache?.iccat_name ?? "",
      uom_name: row.products_cache?.uom_name ?? "",
    }));

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    await requireTaskPermission(request, "production-settings-category-products-create");
    const body = await readJson(request);
    const categoryId = normalizeParam(body.categoryId);
    const skuCodes = Array.isArray(body.skuCodes)
      ? body.skuCodes.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (!categoryId || !skuCodes.length) {
      return Response.json({ error: "categoryId and skuCodes are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const rows = skuCodes.map((skuCode) => ({
      category_id: categoryId,
      sku_code: skuCode,
    }));
    const { error } = await supabaseAdmin
      .from("production_category_products")
      .upsert(rows, { onConflict: "category_id,sku_code" });
    if (error) {
      return Response.json({ error: "Failed to assign products" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    await requireTaskPermission(request, "production-settings-category-products-delete");
    const body = await readJson(request);
    const categoryId = normalizeParam(body.categoryId);
    const skuCodes = Array.isArray(body.skuCodes)
      ? body.skuCodes.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (!categoryId || !skuCodes.length) {
      return Response.json({ error: "categoryId and skuCodes are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("production_category_products")
      .delete()
      .eq("category_id", categoryId)
      .in("sku_code", skuCodes);
    if (error) {
      return Response.json({ error: "Failed to remove products" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
