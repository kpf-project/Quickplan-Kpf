import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizePackingOutput } from "@/lib/nonWagePackingOutput";
import { loadPackingProductPage } from "@/lib/packing-product-page";
import { validatePieceRateWorkDate } from "@/lib/piece-rate-work-date";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { readPackingWorkspace, savePackingWorkspace } from "@/lib/packing-workspace-service";

export const dynamic = "force-dynamic";

const FG_CATEGORIES = ["04", "04-1", "04-2"];

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function totalSachetsFromName(name) {
  const match = String(name || "").match(/([\d,]+)\s*ซอง/i);
  return match ? numberValue(match[1].replaceAll(",", "")) : null;
}

async function loadTradeProfile(skuCode) {
  try {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "100",
      search: skuCode,
      iccatCodes: FG_CATEGORIES.join(","),
    });
    const result = await fetchGatewayJson("/api/trade-codes", params, "production");
    if (!result.ok) return [];
    return Array.isArray(result.data?.data) ? result.data.data : [];
  } catch {
    return [];
  }
}

function parsePackagingDetails(product, tradeRows) {
  const parenMatch = String(product?.sku_name || "").match(/\(([^)]+)\)/);
  let innerUnit = "";
  let innerQtyFromName = null;

  if (parenMatch) {
    const text = parenMatch[1].trim();
    const qtyMatch = text.match(/^(\d+)\s*(.+)$/);
    if (qtyMatch) {
      innerQtyFromName = Number(qtyMatch[1]);
      innerUnit = qtyMatch[2].trim().replace(/\.$/, "");
      if (innerUnit === "กป") innerUnit = "กระปุก";
    }
  }

  const baseUtq = tradeRows[0]?.UTQ_NAME || "";
  if (!innerUnit && baseUtq) {
    innerUnit = baseUtq;
  }
  if (!innerUnit) innerUnit = "ชิ้น";

  let outerUnit = "ลัง";
  if (/^ปี๊บ/i.test(product?.uom_name) && (!innerQtyFromName || innerQtyFromName === 1)) {
    outerUnit = "ปี๊บ";
  } else if (/^กล่อง/i.test(product?.uom_name)) {
    outerUnit = "ลัง";
  }

  const cartonRow = tradeRows
    .map((row) => ({
      row,
      qty: Number(row?.UTQ_QTY_2 ?? row?.utq_qty_2 ?? row?.UTQ_QTY_1 ?? row?.utq_qty_1 ?? row?.UTQ_QTY ?? row?.goods_qty),
      uom: String(row?.UTQ_NAME_2 || row?.goods_uom_name || row?.UTQ_NAME_1 || row?.UTQ_NAME || row?.uom_name || ""),
    }))
    .filter((entry) => entry.qty > 0 && /กล่อง|ลัง/i.test(entry.uom))
    .sort((a, b) => b.qty - a.qty)[0];

  const totalInnerQty = cartonRow?.qty || innerQtyFromName || 1;

  const midRow = tradeRows.find((r) => {
    const q = Number(r.UTQ_QTY_2);
    return q > 1 && q < totalInnerQty;
  });

  let packUnit = "แพ็ค";
  let unitsPerPack = 1;
  let packsPerCarton = totalInnerQty;

  if (midRow) {
    unitsPerPack = Number(midRow.UTQ_QTY_2);
    packsPerCarton = totalInnerQty / unitsPerPack;
    const midMatch = String(midRow.UTQ_NAME_2 || "").match(/(แพ็ค|ห่อ|ชุด)/i);
    if (midMatch) packUnit = midMatch[1];
  }

  return {
    outerUnit,
    packUnit,
    innerUnit,
    packsPerCarton: packsPerCarton || 1,
    sachetsPerPack: unitsPerPack || 1,
    hasMidPack: Boolean(midRow),
  };
}

async function loadProductProfile(db, skuCode) {
  const normalizedCode = String(skuCode || "").trim().toUpperCase();
  const { data: product, error } = await db
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code,uom_name,image_url")
    .eq("sku_code", normalizedCode)
    .in("iccat_code", FG_CATEGORIES)
    .maybeSingle();
  if (error) throw new ApiError(500, "ไม่สามารถโหลดข้อมูลสินค้าได้", error.message);
  if (!product) throw new ApiError(404, "ไม่พบสินค้า");

  const tradeRows = await loadTradeProfile(normalizedCode);
  const sameSkuRows = tradeRows.filter((row) =>
    String(row?.SKU_CODE || row?.sku_code || "").trim().toUpperCase() === normalizedCode
  );

  const packaging = parsePackagingDetails(product, sameSkuRows);

  return {
    code: product.sku_code,
    name: product.sku_name,
    categoryCode: product.iccat_code,
    uomName: product.uom_name,
    imageUrl: product.image_url,
    outerUnit: packaging.outerUnit,
    packUnit: packaging.packUnit,
    innerUnit: packaging.innerUnit,
    packsPerCarton: packaging.packsPerCarton,
    sachetsPerPack: packaging.sachetsPerPack,
    hasMidPack: packaging.hasMidPack,
  };
}

async function searchProducts(db, search) {
  const term = String(search || "").trim();
  let query = db.from("products_cache")
    .select("sku_code,sku_name,iccat_code,uom_name,image_url")
    .in("iccat_code", FG_CATEGORIES)
    .order("sku_code")
    .limit(100);

  if (term.length > 0) {
    const [codeResult, nameResult] = await Promise.all([
      db.from("products_cache")
        .select("sku_code,sku_name,iccat_code,uom_name,image_url")
        .in("iccat_code", FG_CATEGORIES)
        .ilike("sku_code", `%${term}%`)
        .order("sku_code")
        .limit(60),
      db.from("products_cache")
        .select("sku_code,sku_name,iccat_code,uom_name,image_url")
        .in("iccat_code", FG_CATEGORIES)
        .ilike("sku_name", `%${term}%`)
        .order("sku_code")
        .limit(60),
    ]);
    if (codeResult.error || nameResult.error) {
      throw new ApiError(500, "ไม่สามารถค้นหาสินค้าได้");
    }
    return Array.from(new Map(
      [...(codeResult.data || []), ...(nameResult.data || [])]
        .map((row) => {
          const parenMatch = String(row.sku_name || "").match(/\(([^)]+)\)/);
          let innerUnit = "";
          let innerQty = null;
          if (parenMatch) {
            const qtyMatch = parenMatch[1].trim().match(/^(\d+)\s*(.+)$/);
            if (qtyMatch) {
              innerQty = Number(qtyMatch[1]);
              innerUnit = qtyMatch[2].trim().replace(/\.$/, "");
              if (innerUnit === "กป") innerUnit = "กระปุก";
            }
          }
          let outerUnit = "ลัง";
          if (/^ปี๊บ/i.test(row.uom_name) && (!innerQty || innerQty === 1)) {
            outerUnit = "ปี๊บ";
          }
          return [row.sku_code, {
            code: row.sku_code,
            name: row.sku_name,
            categoryCode: row.iccat_code,
            uomName: row.uom_name,
            imageUrl: row.image_url,
            outerUnit,
            innerUnit: innerUnit || "ชิ้น",
          }];
        })
    ).values()).slice(0, 80);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "ไม่สามารถโหลดรายการสินค้าได้");
  }
  return (data || []).map((row) => {
    const parenMatch = String(row.sku_name || "").match(/\(([^)]+)\)/);
    let innerUnit = "";
    let innerQty = null;
    if (parenMatch) {
      const qtyMatch = parenMatch[1].trim().match(/^(\d+)\s*(.+)$/);
      if (qtyMatch) {
        innerQty = Number(qtyMatch[1]);
        innerUnit = qtyMatch[2].trim().replace(/\.$/, "");
        if (innerUnit === "กป") innerUnit = "กระปุก";
      }
    }
    let outerUnit = "ลัง";
    if (/^ปี๊บ/i.test(row.uom_name) && (!innerQty || innerQty === 1)) {
      outerUnit = "ปี๊บ";
    }
    return {
      code: row.sku_code,
      name: row.sku_name,
      categoryCode: row.iccat_code,
      uomName: row.uom_name,
      imageUrl: row.image_url,
      outerUnit,
      innerUnit: innerUnit || "ชิ้น",
    };
  });
}

export async function GET(request) {
  try {
    const workspaceParams = new URL(request.url).searchParams;
    if (workspaceParams.get("version") === "2") return await readPackingWorkspace(request, workspaceParams);
    await requireTaskPermission(request, "production-packing-output-view");
    const db = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "records";

    if (view === "product-page") {
      return Response.json(await loadPackingProductPage(db, { page: searchParams.get("page") || "1", search: searchParams.get("search") || "" }), { headers: { "Cache-Control": "no-store" } });
    }
    if (view === "products") {
      return Response.json({ data: await searchProducts(db, searchParams.get("search")) });
    }
    if (view === "profile") {
      return Response.json({ data: await loadProductProfile(db, searchParams.get("skuCode")) });
    }

    const dateFrom = validatePieceRateWorkDate(searchParams.get("dateFrom"));
    const dateTo = validatePieceRateWorkDate(searchParams.get("dateTo") || dateFrom);
    if (dateFrom > dateTo) throw new ApiError(400, "ช่วงวันที่ไม่ถูกต้อง");
    const { data, error } = await db
      .from("production_non_wage_packing_outputs")
      .select(`
        id,request_id,work_date,lot_no,product_code,product_name_snapshot,
        product_image_url_snapshot,category_code,cartons,packs,sachets,
        packs_per_carton,sachets_per_pack,closing_packs,closing_sachets,created_at,
        production_non_wage_packing_carryovers(id,source_lot_no,packs,sachets)
      `)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new ApiError(500, "ไม่สามารถโหลดรายงานได้", error.message);
    return Response.json({ data: data || [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    if (body.version === 2) return await savePackingWorkspace(request, body);
    const permission = await requireTaskPermission(request, "production-packing-output-write");
    const input = normalizePackingOutput(body);
    validatePieceRateWorkDate(input.workDate);
    if (!input.requestId) throw new ApiError(400, "requestId is required");

    const db = getSupabaseAdmin();
    const profile = await loadProductProfile(db, input.productCode);

    const { data, error } = await db.rpc("create_non_wage_packing_output", {
      p_output: {
        request_id: input.requestId,
        work_date: input.workDate,
        lot_no: input.lotNo,
        product_code: input.productCode,
        product_name: profile.name,
        product_image_url: profile.imageUrl,
        category_code: profile.categoryCode,
        cartons: input.cartons,
        packs: input.packs,
        sachets: input.sachets,
        packs_per_carton: input.packsPerCarton,
        sachets_per_pack: input.sachetsPerPack,
        closing_packs: input.closingPacks,
        closing_sachets: input.closingSachets,
        created_by: permission.userId,
      },
      p_carryovers: input.carryovers.map((row) => ({
        lot_no: row.lotNo,
        packs: row.packs,
        sachets: row.sachets,
      })),
    });
    if (error) throw new ApiError(500, "ไม่สามารถบันทึกผลผลิตได้", error.message);
    return Response.json({ data: { id: data, lotNo: input.lotNo } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
