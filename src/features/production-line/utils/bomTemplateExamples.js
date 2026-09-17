const WIP_CATEGORY_CODE = "03";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveCalculation(item) {
  const calculationBasis = String(
    item?.calculation_basis || "JOB_QTY"
  ).trim().toUpperCase();

  if (calculationBasis === "HEADCOUNT") {
    return {
      calculationBasis,
      calculationBase: Number(item?.headcount_base) || 1,
      roundMode: String(item?.headcount_round_mode || "NONE").toUpperCase(),
    };
  }
  if (calculationBasis === "MACHINE_COUNT") {
    return {
      calculationBasis,
      calculationBase: Number(item?.machine_base) || 1,
      roundMode: String(item?.machine_round_mode || "NONE").toUpperCase(),
    };
  }
  if (calculationBasis === "DOUGH_SET_COUNT") {
    return {
      calculationBasis,
      calculationBase: Number(item?.dough_set_base) || 1,
      roundMode: String(item?.dough_set_round_mode || "NONE").toUpperCase(),
    };
  }
  return {
    calculationBasis: "JOB_QTY",
    calculationBase: 1,
    roundMode: "NONE",
  };
}

function selectActiveVersion(payload) {
  const versions = Array.isArray(payload?.versions) ? payload.versions : [];
  const activeVersionId = String(payload?.activeVersionId || "").trim();
  return versions.find((version) => version?.id === activeVersionId) ||
    versions[0] ||
    null;
}

export async function loadBomTemplateExampleRows({
  rootSkuCode = "BL0-5001",
  fetchBom,
  maxDepth = 12,
}) {
  if (typeof fetchBom !== "function") {
    throw new TypeError("fetchBom is required");
  }

  const rootCode = normalizeCode(rootSkuCode);
  const visited = new Set();
  const rows = [];

  const visit = async (skuCode, level) => {
    const normalizedSku = normalizeCode(skuCode);
    if (!normalizedSku || visited.has(normalizedSku) || level > maxDepth) {
      return;
    }
    visited.add(normalizedSku);

    const payload = await fetchBom(normalizedSku);
    const selectedFormulaCode = normalizeCode(payload?.selectedFormulaCode);
    if (selectedFormulaCode && selectedFormulaCode !== "DEFAULT") {
      return;
    }
    const version = selectActiveVersion(payload);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!version || items.length === 0) return;

    const baseBatch = Number(version.base_batch) || 1;
    const baseOutputBoxes = Number(version.base_output_boxes) || 1;
    const wipQtyInputMode = String(
      version.wip_qty_input_mode || "unit"
    ).trim().toLowerCase();
    const childWipCodes = [];

    items.forEach((item) => {
      const calculation = resolveCalculation(item);
      const existingNote = String(item?.notes || "").trim();
      const levelNote = `ตัวอย่าง ${rootCode} Level ${level}`;
      rows.push({
        parentSkuCode: normalizedSku,
        wipQtyInputMode,
        baseBatch,
        baseOutputBoxes,
        materialGoodsCode: normalizeCode(
          item?.material_goods_code || item?.material_sku_code
        ),
        materialSkuCode: normalizeCode(item?.material_sku_code),
        qty: Number(item?.qty) || 0,
        ...calculation,
        planningOffsetDays: Number(item?.planning_offset_days) || 0,
        notes: existingNote ? `${existingNote} | ${levelNote}` : levelNote,
      });

      if (normalizeCode(item?.iccat_code) === WIP_CATEGORY_CODE) {
        childWipCodes.push(normalizeCode(item?.material_sku_code));
      }
    });

    for (const childSkuCode of childWipCodes) {
      await visit(childSkuCode, level + 1);
    }
  };

  await visit(rootCode, 1);
  return rows;
}
