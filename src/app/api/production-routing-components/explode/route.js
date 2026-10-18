import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function deriveItemType(iccatCode) {
  const normalized = normalizeCode(iccatCode);
  if (normalized === "03") return "WIP";
  if (normalized === "04" || normalized === "04-1" || normalized === "04-2") return "PACK";
  return "RAW";
}

function pickActiveVersion(versions = []) {
  if (!versions.length) return null;
  const latest = versions[0];
  if (latest.status !== "rejected") return latest;
  return versions.find((row) => row.status !== "rejected") || latest;
}

async function loadActiveVersionItems(supabaseAdmin, skuCode) {
  const { data: bomRow, error: bomError } = await supabaseAdmin
    .from("production_boms")
    .select("id")
    .eq("sku_code", skuCode)
    .maybeSingle();
  if (bomError) throw new Error("Failed to load BOM header");
  if (!bomRow) return [];

  const { data: formulas, error: formulaError } = await supabaseAdmin
    .from("production_bom_formulas")
    .select("formula_code")
    .eq("bom_id", bomRow.id)
    .eq("is_active", true);
  if (formulaError) throw new Error("Failed to load BOM formulas");

  const { data: versions, error: versionError } = await supabaseAdmin
    .from("production_bom_versions")
    .select("id,version_no,status,formula_code")
    .eq("bom_id", bomRow.id)
    .order("version_no", { ascending: false });
  if (versionError) throw new Error("Failed to load BOM version");

  const activeFormulaCodes = formulas?.length > 0
    ? formulas.map((f) => f.formula_code)
    : Array.from(new Set((versions || []).map((v) => v.formula_code).filter(Boolean)));

  if (activeFormulaCodes.length === 0) {
    activeFormulaCodes.push("DEFAULT");
  }

  const activeVersionIds = [];
  activeFormulaCodes.forEach((code) => {
    const formulaVersions = (versions || []).filter((v) => v.formula_code === code);
    const activeVersion = pickActiveVersion(formulaVersions);
    if (activeVersion?.id) {
      activeVersionIds.push(activeVersion.id);
    }
  });

  if (!activeVersionIds.length) return [];

  const { data: items, error: itemError } = await supabaseAdmin
    .from("production_bom_items")
    .select("material_sku_code,material_goods_code,qty,uom_name,notes")
    .in("version_id", activeVersionIds);
  if (itemError) throw new Error("Failed to load BOM items");
  if (!items?.length) return [];

  const uniqueItemsMap = new Map();
  items.forEach((item) => {
    const sku = normalizeCode(item.material_sku_code);
    const goods = normalizeCode(item.material_goods_code) || sku;
    const key = `${sku}|${goods}`;
    if (!uniqueItemsMap.has(key)) {
      uniqueItemsMap.set(key, item);
    }
  });
  const dedupedItems = Array.from(uniqueItemsMap.values());

  const skuCodes = Array.from(
    new Set(dedupedItems.map((row) => normalizeCode(row.material_sku_code)).filter(Boolean))
  );
  const { data: products, error: productError } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code")
    .in("sku_code", skuCodes);
  if (productError) throw new Error("Failed to load component names");

  const productMap = new Map(
    (products || []).map((row) => [normalizeCode(row.sku_code), row])
  );

  const typePriority = {
    RAW: 1,
    PACK: 2,
    WIP: 3,
  };

  return dedupedItems
    .map((row) => {
      const code = normalizeCode(row.material_sku_code);
      const product = productMap.get(code);
      return {
        sku_code: code,
        goods_code: normalizeCode(row.material_goods_code) || code,
        sku_name: product?.sku_name || code,
        iccat_code: product?.iccat_code || "",
        item_type: deriveItemType(product?.iccat_code),
        qty: Number(row.qty || 0),
        uom_name: row.uom_name || "",
        notes: row.notes || "",
      };
    })
    .sort((a, b) => {
      const pA = typePriority[a.item_type] || 99;
      const pB = typePriority[b.item_type] || 99;
      if (pA !== pB) return pA - pB;
      return a.sku_code.localeCompare(b.sku_code);
    });
}

async function explodeRecursive({
  supabaseAdmin,
  fgSkuCode,
  parentSkuCode,
  parentNodeKey,
  level,
  pathSet,
  output,
}) {
  const directItems = await loadActiveVersionItems(supabaseAdmin, parentSkuCode);
  for (let index = 0; index < directItems.length; index += 1) {
    const item = directItems[index];
    const nodeKey = `${parentNodeKey}>${item.sku_code}#${index + 1}`;
    const node = {
      node_key: nodeKey,
      fg_sku_code: fgSkuCode,
      parent_sku_code: parentSkuCode,
      parent_node_key: parentNodeKey,
      component_sku_code: item.sku_code,
      component_goods_code: item.goods_code,
      component_sku_name: item.sku_name,
      component_type: item.item_type,
      iccat_code: item.iccat_code,
      qty: item.qty,
      uom_name: item.uom_name,
      notes: item.notes,
      level,
    };
    output.push(node);

    if (item.item_type !== "WIP") {
      continue;
    }
    const cycleKey = `${parentSkuCode}->${item.sku_code}`;
    if (pathSet.has(cycleKey)) {
      continue;
    }
    pathSet.add(cycleKey);
    await explodeRecursive({
      supabaseAdmin,
      fgSkuCode,
      parentSkuCode: item.sku_code,
      parentNodeKey: nodeKey,
      level: level + 1,
      pathSet,
      output,
    });
  }
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-routing-components-explode-view");

    const { searchParams } = new URL(request.url);
    const fgSkuCode = normalizeCode(searchParams.get("fgSkuCode"));
    if (!fgSkuCode) {
      return Response.json({ error: "fgSkuCode is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const output = [];
    await explodeRecursive({
      supabaseAdmin,
      fgSkuCode,
      parentSkuCode: fgSkuCode,
      parentNodeKey: fgSkuCode,
      level: 1,
      pathSet: new Set(),
      output,
    });

    return Response.json({ data: output });
  } catch (error) {
    return jsonError(error);
  }
}
