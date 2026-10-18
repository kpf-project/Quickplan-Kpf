import { fetchSupabaseRowsByChunks } from "./supabaseRangeFetch";
import { loadProductsMetaBySkus } from "./wipPlanning";
import { wipPlanWeightVersion, wipPlanKgPerBatch } from "../features/production-planning/services/wipPlanDisplayWeight";

// Display metadata only: never rebind saved lines to a newer BOM.
export async function enrichWipPlanDisplayWeights(db, lines) {
  const skus = [...new Set(lines.map(line => line.skuCode).filter(Boolean))];
  if (!skus.length) return lines;
  const ids = [...new Set(lines.map(line => line.bomVersionId).filter(Boolean))];
  const [products, boms, bound] = await Promise.all([
    loadProductsMetaBySkus(db, skus),
    fetchSupabaseRowsByChunks(skus, chunk => db.from("production_boms").select("id,sku_code").in("sku_code", chunk)),
    fetchSupabaseRowsByChunks(ids, chunk => db.from("production_bom_versions").select("id,bom_id,base_batch,base_output_boxes,wip_qty_input_mode").in("id", chunk)),
  ]);
  const legacy = new Set(lines.filter(line => !line.bomVersionId).map(line => line.skuCode));
  const approved = await fetchSupabaseRowsByChunks(boms.filter(bom => legacy.has(bom.sku_code)).map(bom => bom.id), chunk => db.from("production_bom_versions").select("id,bom_id,formula_code,status,version_no,base_batch,base_output_boxes,wip_qty_input_mode").in("bom_id", chunk).eq("status", "approved"));
  return lines.map(line => {
    const version = wipPlanWeightVersion(line, [...bound, ...approved], boms);
    const unit = products.get(line.skuCode)?.uom_name;
    return { ...line,
      planningUnit: line.planningUnit || line.unit || line.uom || (version ? (version.wip_qty_input_mode === "batch" ? "batch" : unit) : "") || "",
      kgPerBatch: wipPlanKgPerBatch(version, line.skuCode, boms.find(bom => bom.id === version?.bom_id)?.sku_code, unit),
    };
  });
}
