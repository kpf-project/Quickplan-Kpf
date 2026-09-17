import "server-only";

import { fetchGatewayJson } from "@/lib/gatewayClient";

const TRADE_CATEGORY_CODES = ["01", "02", "03", "05", "08", "10"];

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

async function loadTradeCodeRows(codes) {
  const uniqueCodes = Array.from(new Set(codes.map(normalizeCode).filter(Boolean)));
  const rows = [];

  for (let index = 0; index < uniqueCodes.length; index += 5) {
    const chunk = uniqueCodes.slice(index, index + 5);
    const results = await Promise.all(chunk.map(async (code) => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");
      params.set("search", code);
      params.set("iccatCodes", TRADE_CATEGORY_CODES.join(","));
      const result = await fetchGatewayJson("/api/trade-codes", params, "production");
      if (!result.ok) {
        throw new Error(`โหลดรหัสการค้า ${code} ไม่สำเร็จ`);
      }
      return Array.isArray(result.data?.data) ? result.data.data : [];
    }));
    rows.push(...results.flat());
  }

  return rows.filter((row) => (
    uniqueCodes.includes(normalizeCode(row?.GOODS_CODE)) ||
    uniqueCodes.includes(normalizeCode(row?.SKU_CODE))
  ));
}

async function loadCurrentBoms(supabaseAdmin, seedSkuCodes) {
  const pending = new Set(seedSkuCodes.map(normalizeCode).filter(Boolean));
  const visited = new Set();
  const currentBoms = [];

  for (let depth = 0; depth < 12 && pending.size > 0; depth += 1) {
    const skuCodes = Array.from(pending).filter((code) => !visited.has(code));
    skuCodes.forEach((code) => {
      pending.delete(code);
      visited.add(code);
    });
    if (!skuCodes.length) break;

    const { data: bomRows, error: bomError } = await supabaseAdmin
      .from("production_boms")
      .select("id,sku_code")
      .in("sku_code", skuCodes);
    if (bomError) throw new Error("โหลด BOM ปัจจุบันไม่สำเร็จ");
    if (!bomRows?.length) continue;

    const bomIds = bomRows.map((row) => row.id);
    const { data: versionRows, error: versionError } = await supabaseAdmin
      .from("production_bom_versions")
      .select("id,bom_id,version_no,base_batch,base_output_boxes,wip_qty_input_mode")
      .in("bom_id", bomIds)
      .eq("formula_code", "DEFAULT")
      .is("deleted_at", null)
      .order("version_no", { ascending: false });
    if (versionError) throw new Error("โหลดเวอร์ชัน BOM ปัจจุบันไม่สำเร็จ");

    const latestVersionByBom = new Map();
    (versionRows || []).forEach((row) => {
      if (!latestVersionByBom.has(row.bom_id)) {
        latestVersionByBom.set(row.bom_id, row);
      }
    });
    const versionIds = Array.from(latestVersionByBom.values()).map((row) => row.id);
    let itemRows = [];
    if (versionIds.length) {
      const { data, error } = await supabaseAdmin
        .from("production_bom_items")
        .select(
          "version_id,material_sku_code,material_goods_code,qty,uom_name,notes,planning_offset_days,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode"
        )
        .in("version_id", versionIds);
      if (error) throw new Error("โหลดรายการ BOM ปัจจุบันไม่สำเร็จ");
      itemRows = data || [];
    }

    bomRows.forEach((bom) => {
      const version = latestVersionByBom.get(bom.id);
      if (!version) return;
      const items = itemRows.filter((item) => item.version_id === version.id);
      items.forEach((item) => pending.add(normalizeCode(item.material_sku_code)));
      currentBoms.push({
        parent_sku_code: normalizeCode(bom.sku_code),
        base_batch: version.base_batch,
        base_output_boxes: version.base_output_boxes,
        wip_qty_input_mode: version.wip_qty_input_mode,
        items,
      });
    });
  }

  return currentBoms;
}

export async function loadBomImportCatalog({ supabaseAdmin, products }) {
  const parentSkuCodes = Array.from(new Set(
    products.map((product) => normalizeCode(
      product.sku || product.productCode || product.code
    )).filter(Boolean)
  ));
  const suppliedSkuCodes = [];
  const suppliedGoodsCodes = [];
  products.forEach((product) => {
    (product.items || []).forEach((item) => {
      const skuCode = normalizeCode(item.material_sku_code || item.materialSkuCode);
      const goodsCode = normalizeCode(
        item.material_goods_code || item.materialGoodsCode || item.code
      );
      if (skuCode) suppliedSkuCodes.push(skuCode);
      if (goodsCode) suppliedGoodsCodes.push(goodsCode);
    });
  });

  const productCodes = Array.from(new Set([
    ...parentSkuCodes,
    ...suppliedSkuCodes,
    ...suppliedGoodsCodes,
  ]));
  const { data: productRows, error: productError } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code,uom_name")
    .in("sku_code", productCodes);
  if (productError) throw new Error("โหลดข้อมูลสินค้าไม่สำเร็จ");

  const tradeRows = await loadTradeCodeRows(suppliedGoodsCodes);
  const materialRows = tradeRows.map((row) => ({
    goods_code: normalizeCode(row.GOODS_CODE),
    sku_code: normalizeCode(row.SKU_CODE),
    sku_name: String(row.GOODS_ALIAS || row.SKU_NAME || "").trim(),
    iccat_code: normalizeCode(row.ICCAT_CODE),
    uom_name: String(row.UTQ_NAME_2 || row.UTQ_NAME || "").trim(),
  }));
  (productRows || []).forEach((row) => {
    const skuCode = normalizeCode(row.sku_code);
    if (!TRADE_CATEGORY_CODES.includes(normalizeCode(row.iccat_code))) return;
    if (materialRows.some((material) => (
      material.goods_code === skuCode && material.sku_code === skuCode
    ))) return;
    materialRows.push({
      goods_code: skuCode,
      sku_code: skuCode,
      sku_name: row.sku_name,
      iccat_code: row.iccat_code,
      uom_name: row.uom_name,
    });
  });

  const materialSkuCodes = materialRows.map((row) => row.sku_code);
  const currentBoms = await loadCurrentBoms(
    supabaseAdmin,
    [...parentSkuCodes, ...materialSkuCodes]
  );

  return {
    parents: (productRows || []).filter((row) => (
      parentSkuCodes.includes(normalizeCode(row.sku_code))
    )),
    materials: materialRows,
    currentBoms,
  };
}
