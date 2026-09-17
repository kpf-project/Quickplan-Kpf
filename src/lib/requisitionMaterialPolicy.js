function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractSnapshotMaterials(planRow) {
  const root = Array.isArray(planRow?.bom_snapshot) ? planRow.bom_snapshot[0] : null;
  return Array.isArray(root?.materials) ? root.materials : [];
}

function isMissingRequisitionPolicySchema(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return (
    code === "PGRST204"
    || code === "42703"
    || code === "42P01"
    || message.includes("requires_requisition")
    || message.includes("production_wip_policies") && message.includes("does not exist")
  );
}

function chunkValues(values, size = 40) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function collectSnapshotWipSkuCodes(planRows = []) {
  const codes = new Set();
  (Array.isArray(planRows) ? planRows : []).forEach((planRow) => {
    extractSnapshotMaterials(planRow).forEach((material) => {
      const itemType = String(material?.itemType || material?.item_type || "").trim().toUpperCase();
      const issueQty = toNumber(material?.issueQty ?? material?.issuedQty ?? material?.requiredQty, 0);
      if (itemType !== "WIP" || issueQty <= 0) return;
      const skuCode = normalizeSku(material?.skuCode || material?.material_sku_code);
      if (skuCode) codes.add(skuCode);
    });
  });
  return Array.from(codes).sort((left, right) => left.localeCompare(right));
}

export async function loadRequiredRequisitionWipSkuSet(supabaseAdmin, skuCodes = []) {
  const normalizedCodes = Array.from(new Set(
    (Array.isArray(skuCodes) ? skuCodes : []).map(normalizeSku).filter(Boolean)
  ));
  if (!normalizedCodes.length) return new Set();

  const requiredCodes = new Set();
  for (const chunk of chunkValues(normalizedCodes)) {
    const result = await supabaseAdmin
      .from("production_wip_policies")
      .select("sku_code,is_active,requires_requisition")
      .in("sku_code", chunk)
      .eq("is_active", true)
      .eq("requires_requisition", true);

    if (result.error) {
      if (isMissingRequisitionPolicySchema(result.error)) return new Set();
      throw result.error;
    }

    (result.data || []).forEach((row) => {
      if (row?.is_active !== true || row?.requires_requisition !== true) return;
      const skuCode = normalizeSku(row?.sku_code);
      if (skuCode) requiredCodes.add(skuCode);
    });
  }
  return requiredCodes;
}

export function mapRequisitionSnapshotMaterials(planRow, requiredWipSkuSet = new Set()) {
  return extractSnapshotMaterials(planRow)
    .map((material) => {
      const materialSkuCode = normalizeSku(material?.skuCode || material?.material_sku_code);
      const materialGoodsCode = normalizeSku(
        material?.goodsCode || material?.material_goods_code || materialSkuCode
      );
      const issueQty = toNumber(material?.issueQty ?? material?.issuedQty ?? material?.requiredQty, 0);
      const itemType = String(material?.itemType || material?.item_type || "").trim().toUpperCase();
      return {
        materialSkuCode,
        materialGoodsCode,
        materialName: String(material?.name || material?.skuName || "").trim()
          || materialGoodsCode
          || materialSkuCode,
        unit: String(material?.unit || material?.uom || "").trim() || "unit",
        issueQty,
        itemType,
      };
    })
    .filter((material) => {
      if (!material.materialSkuCode || material.issueQty <= 0) return false;
      if (material.itemType !== "WIP") return true;
      return requiredWipSkuSet.has(material.materialSkuCode);
    });
}
