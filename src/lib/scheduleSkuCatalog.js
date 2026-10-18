import "server-only";
import { fetchAllSupabaseRows } from "@/lib/supabaseRangeFetch";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "PGRST204"
    || message.includes(String(columnName || "").toLowerCase());
}

async function loadMasterPlanWipProducts(db) {
  const policyResult = await db
    .from("production_wip_policies")
    .select("sku_code,allow_master_plan,is_active")
    .eq("allow_master_plan", true);

  if (policyResult.error) {
    if (isMissingColumnError(policyResult.error, "allow_master_plan")) return [];
    throw policyResult.error;
  }

  const skuCodes = [...new Set(
    (policyResult.data ?? [])
      .filter((row) => row?.is_active !== false)
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  )];
  if (!skuCodes.length) return [];

  const productResult = await db
    .from("products_cache")
    .select("sku_code,sku_name,brand_name,uom_name,iccat_code")
    .eq("iccat_code", "03")
    .limit(5000);
  if (productResult.error) throw productResult.error;
  const skuSet = new Set(skuCodes);
  return (productResult.data ?? []).filter((row) => skuSet.has(normalizeSku(row?.sku_code)));
}

async function loadApprovedFormulas(db, skuCodes) {
  const formulaOptionsBySku = new Map();
  if (!skuCodes.length) return formulaOptionsBySku;

  const { data: boms, error: bomsError } = await db
    .from("production_boms")
    .select("id,sku_code")
    .in("sku_code", skuCodes);
  if (bomsError) throw bomsError;

  const bomIds = (boms ?? []).map((bom) => bom.id).filter(Boolean);
  const skuByBomId = new Map((boms ?? []).map((bom) => [bom.id, normalizeSku(bom.sku_code)]));
  if (!bomIds.length) return formulaOptionsBySku;

  const { data: versions, error: versionsError } = await db
    .from("production_bom_versions")
    .select("id,bom_id,formula_code,formula_name,version_no")
    .in("bom_id", bomIds)
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("version_no", { ascending: false });
  if (versionsError) throw versionsError;

  (versions ?? []).forEach((version) => {
    const skuCode = skuByBomId.get(version.bom_id);
    if (!skuCode) return;
    const list = formulaOptionsBySku.get(skuCode) ?? [];
    const code = String(version.formula_code || "DEFAULT").trim().toUpperCase();
    if (!list.some((formula) => formula.formula_code === code)) {
      list.push({
        formula_code: code,
        formula_name: String(version.formula_name || "Default BOM").trim(),
        bom_version_id: version.id,
      });
    }
    formulaOptionsBySku.set(skuCode, list);
  });
  return formulaOptionsBySku;
}

export async function loadScheduleSkuCatalog(db, iccatCodes = ["04", "04-1", "04-2"], departmentId = null) {
  let departmentSkus = null;
  const subcategoryBySku = new Map();
  if (departmentId !== null && departmentId !== undefined) {
    const id = String(departmentId).trim();
    if (!id) return [];
    const mappings = await fetchAllSupabaseRows(() => db
      .from("production_department_products")
      .select("sku_code,subcategory_id")
      .eq("department_id", id)
      .order("sku_code", { ascending: true }));
    departmentSkus = new Set(mappings.map(row => normalizeSku(row.sku_code)).filter(Boolean));
    mappings.forEach(row => subcategoryBySku.set(normalizeSku(row.sku_code), row.subcategory_id ?? null));
    if (!departmentSkus.size) return [];
  }
  const baseQuery = () => db
    .from("products_cache")
    .select("sku_code,sku_name,brand_name,uom_name,iccat_code")
    .in("iccat_code", iccatCodes)
    .eq("is_active", true)
    .order("sku_name", { ascending: true });
  const { data: baseProducts, error } = departmentSkus
    ? { data: await fetchAllSupabaseRows(() => baseQuery().order("sku_code", { ascending: true })) }
    : await baseQuery().limit(2000);
  if (error) throw error;

  const productBySku = new Map();
  [...(baseProducts ?? []), ...(await loadMasterPlanWipProducts(db))].forEach((row) => {
    const skuCode = normalizeSku(row?.sku_code);
    if (skuCode) productBySku.set(skuCode, row);
  });

  const products = [...productBySku.values()].filter(row => !departmentSkus || departmentSkus.has(normalizeSku(row.sku_code)));
  const formulasBySku = await loadApprovedFormulas(
    db,
    products.map((row) => normalizeSku(row.sku_code)).filter(Boolean)
  );

  return products
    .map((row) => {
      const skuCode = String(row.sku_code || "").trim();
      const formulas = formulasBySku.get(normalizeSku(skuCode)) ?? [];
      return {
        skuCode,
        subcategoryId: subcategoryBySku.get(normalizeSku(skuCode)) ?? null,
        name: String(row.sku_name || "").trim(),
        brand: String(row.brand_name || "").trim(),
        unit: String(row.uom_name || "").trim(),
        hasBom: formulas.length > 0,
        formulaOptions: formulas,
        itemType: normalizeSku(row.iccat_code) === "03" ? "WIP" : "FG",
      };
    })
    .filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}
