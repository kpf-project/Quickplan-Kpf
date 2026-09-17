import {
  buildDiff,
  mergeItems,
  normalizeItems,
  normalizeMode,
  normalizeStrategy,
  validatePreparedBomImportProduct,
} from "./bomImportHelpers.js";
import {
  resolveItemTypeByCategory,
  validateBomMatrix,
} from "./bomMatrix.js";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeWipMode(value, parentType) {
  if (parentType !== "WIP") return "unit";
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "unit" || normalized === "batch" ? normalized : "batch";
}

function toCatalog(catalog = {}) {
  const parentBySku = new Map();
  const materialByGoods = new Map();
  const materialsBySku = new Map();

  (catalog.parents || []).forEach((row) => {
    const skuCode = normalizeCode(row.sku_code);
    if (skuCode) parentBySku.set(skuCode, row);
  });
  (catalog.materials || []).forEach((row) => {
    const skuCode = normalizeCode(row.sku_code);
    const goodsCode = normalizeCode(row.goods_code || row.sku_code);
    if (!skuCode || !goodsCode) return;
    const normalized = { ...row, sku_code: skuCode, goods_code: goodsCode };
    materialByGoods.set(goodsCode, normalized);
    if (!materialsBySku.has(skuCode)) materialsBySku.set(skuCode, []);
    materialsBySku.get(skuCode).push(normalized);
  });

  return { parentBySku, materialByGoods, materialsBySku };
}

function findMaterial(raw, indexes) {
  const goodsCode = normalizeCode(
    raw.material_goods_code || raw.materialGoodsCode || raw.code
  );
  const suppliedSku = normalizeCode(
    raw.material_sku_code || raw.materialSkuCode
  );

  if (suppliedSku) {
    const exact = indexes.materialByGoods.get(goodsCode || suppliedSku);
    if (exact && exact.sku_code === suppliedSku) {
      return { material: exact, goodsCode: exact.goods_code };
    }
    const variants = indexes.materialsBySku.get(suppliedSku) || [];
    if (!goodsCode && variants.length === 1) {
      return { material: variants[0], goodsCode: variants[0].goods_code };
    }
    return { material: null, goodsCode: goodsCode || suppliedSku };
  }

  const skuVariants = indexes.materialsBySku.get(goodsCode) || [];
  if (skuVariants.length > 1) {
    return {
      material: null,
      goodsCode,
      ambiguousGoodsCodes: skuVariants.map((row) => row.goods_code),
    };
  }
  const exact = indexes.materialByGoods.get(goodsCode);
  const material = exact || skuVariants[0] || null;
  return { material, goodsCode };
}

function buildGraph(currentBoms = [], preparedProducts = []) {
  const graph = new Map();
  currentBoms.forEach((bom) => {
    const parent = normalizeCode(bom.parent_sku_code || bom.sku);
    if (!parent) return;
    graph.set(
      parent,
      new Set((bom.items || []).map((item) => normalizeCode(
        item.material_sku_code || item.materialSkuCode
      )).filter(Boolean))
    );
  });
  preparedProducts.forEach((product) => {
    graph.set(
      product.sku,
      new Set(product.items.map((item) => item.material_sku_code).filter(Boolean))
    );
  });
  return graph;
}

function hasCycleFrom(start, graph) {
  const visiting = new Set();
  const visited = new Set();

  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of graph.get(node) || []) {
      if (graph.has(child) && visit(child)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  return visit(start);
}

function currentBomMap(currentBoms = []) {
  return new Map(
    currentBoms.map((bom) => [
      normalizeCode(bom.parent_sku_code || bom.sku),
      bom,
    ])
  );
}

export async function prepareBomImportProducts({
  products = [],
  catalog = {},
  mode = "replace",
  strategy = "overwrite",
}) {
  const normalizedMode = normalizeMode(mode);
  const normalizedStrategy = normalizeStrategy(strategy);
  const indexes = toCatalog(catalog);
  const existingByParent = currentBomMap(catalog.currentBoms || []);
  const invalidRows = [];
  const preparedProducts = [];

  for (const rawProduct of products) {
    const sku = normalizeCode(
      rawProduct.sku || rawProduct.productCode || rawProduct.code
    );
    const parent = indexes.parentBySku.get(sku);
    const parentType = resolveItemTypeByCategory(parent?.iccat_code);
    const productErrors = [];
    const resolvedItems = [];
    const baseBatchValues = new Set();
    const baseOutputValues = new Set();
    const wipModeValues = new Set();

    const addSetting = (set, value, normalize = Number) => {
      if (value === null || value === undefined || value === "") return;
      const normalized = normalize(value);
      if (normalized !== "" && !Number.isNaN(normalized)) set.add(normalized);
    };
    addSetting(
      baseBatchValues,
      rawProduct.base_batch ?? rawProduct.baseBatch
    );
    addSetting(
      baseOutputValues,
      rawProduct.base_output_boxes ?? rawProduct.baseOutputBoxes
    );
    addSetting(
      wipModeValues,
      rawProduct.wip_qty_input_mode ?? rawProduct.wipQtyInputMode,
      (value) => String(value).trim().toLowerCase()
    );

    if (!parent) {
      productErrors.push(`ไม่พบสินค้าตัวแม่ ${sku || "-"}`);
    }

    for (const rawItem of rawProduct.items || []) {
      addSetting(baseBatchValues, rawItem.parent_base_batch);
      addSetting(baseOutputValues, rawItem.parent_base_output_boxes);
      addSetting(
        wipModeValues,
        rawItem.parent_wip_qty_input_mode,
        (value) => String(value).trim().toLowerCase()
      );
      const rowNumber = Number(rawItem.rowNumber || rawItem.line_no) || null;
      const resolution = findMaterial(rawItem, indexes);
      if (!resolution.material) {
        const candidates = resolution.ambiguousGoodsCodes || [];
        const detail = candidates.length
          ? ` พบหลายรหัสการค้า: ${candidates.join(", ")}`
          : "";
        invalidRows.push({
          rowNumber,
          parentSkuCode: sku,
          materialGoodsCode: resolution.goodsCode,
          message: `แถว ${rowNumber || "-"} ไม่สามารถระบุรหัสวัตถุดิบ ${resolution.goodsCode || "-"} ได้${detail}`,
        });
        continue;
      }

      resolvedItems.push({
        ...rawItem,
        material_sku_code: resolution.material.sku_code,
        material_goods_code: resolution.material.goods_code,
        uom_name: String(resolution.material.uom_name || "").trim(),
        material_name: String(
          resolution.material.sku_name ||
          resolution.material.goods_name ||
          ""
        ).trim(),
        item_type: resolveItemTypeByCategory(resolution.material.iccat_code),
        rowNumber,
      });
    }

    if (baseBatchValues.size > 1) {
      productErrors.push("ค่า base_batch ของสินค้าตัวแม่เดียวกันไม่ตรงกัน");
    }
    if (baseOutputValues.size > 1) {
      productErrors.push("ค่า base_output_boxes ของสินค้าตัวแม่เดียวกันไม่ตรงกัน");
    }
    if (wipModeValues.size > 1) {
      productErrors.push("โหมดปริมาณ WIP ของสินค้าตัวแม่เดียวกันไม่ตรงกัน");
    }

    const previousItems = existingByParent.get(sku)?.items || [];
    const mergedItems = mergeItems({
      mode: normalizedMode,
      strategy: normalizedStrategy,
      previousItems,
      incomingItems: resolvedItems,
    });
    const items = mergedItems.map((item) => {
      const resolved = resolvedItems.find((row) => (
        row.material_goods_code === item.material_goods_code &&
        row.material_sku_code === item.material_sku_code
      ));
      return {
        ...item,
        rowNumber: resolved?.rowNumber || null,
        material_name: resolved?.material_name || "",
        item_type: resolved?.item_type || "",
      };
    });
    const wipQtyInputMode = normalizeWipMode(
      rawProduct.wip_qty_input_mode || rawProduct.wipQtyInputMode,
      parentType
    );
    const baseBatch = parentType === "FG" || wipQtyInputMode === "unit"
      ? 1
      : Number(rawProduct.base_batch ?? rawProduct.baseBatch);
    const baseOutputBoxes = Number(
      rawProduct.base_output_boxes ?? rawProduct.baseOutputBoxes
    );
    const matrixCheck = validateBomMatrix({
      parentType,
      childTypes: items.map((item) => {
        const material = indexes.materialByGoods.get(item.material_goods_code);
        return resolveItemTypeByCategory(material?.iccat_code);
      }),
      childEntries: items.map((item) => {
        const material = indexes.materialByGoods.get(item.material_goods_code);
        return {
          materialCode: item.material_goods_code,
          rowNumber: resolvedItems.find((row) => (
            row.material_goods_code === item.material_goods_code &&
            row.material_sku_code === item.material_sku_code
          ))?.rowNumber || null,
          itemType: resolveItemTypeByCategory(material?.iccat_code),
        };
      }),
    });
    if (!matrixCheck.ok) {
      productErrors.push(matrixCheck.message);
    }

    const prepared = {
      sku,
      name: String(parent?.sku_name || "").trim(),
      parentType,
      formulaCode: "DEFAULT",
      formulaName: "สูตรหลัก",
      wipQtyInputMode,
      baseBatch,
      baseOutputBoxes,
      items,
      validRows: resolvedItems,
      errors: productErrors,
    };
    prepared.errors.push(...validatePreparedBomImportProduct({
      formula_code: "DEFAULT",
      parent_type: parentType,
      wip_qty_input_mode: wipQtyInputMode,
      base_batch: baseBatch,
      base_output_boxes: baseOutputBoxes,
      items,
    }));
    const nameMap = new Map(
      items.map((item) => [item.material_sku_code, item.material_name || ""])
    );
    const diffResult = buildDiff(previousItems, items, nameMap);
    const previousBom = existingByParent.get(sku);
    const configChanged = Boolean(previousBom) && (
      Number(previousBom.base_batch) !== Number(baseBatch) ||
      Number(previousBom.base_output_boxes) !== Number(baseOutputBoxes) ||
      String(previousBom.wip_qty_input_mode || "").toLowerCase() !== wipQtyInputMode
    );
    const hasItemChanges = diffResult.changes.length > 0;
    prepared.diff = diffResult.diff;
    prepared.changes = diffResult.changes;
    prepared.status = !previousBom || previousItems.length === 0 ||
      (!hasItemChanges && !configChanged)
      ? "approved"
      : "pending_review";
    preparedProducts.push(prepared);
  }

  const graph = buildGraph(catalog.currentBoms || [], preparedProducts);
  preparedProducts.forEach((product) => {
    if (hasCycleFrom(product.sku, graph)) {
      product.errors.push(`ตรวจพบวงจร BOM ที่เชื่อมกลับมายัง ${product.sku}`);
    }
  });

  const hasErrors = invalidRows.length > 0 ||
    preparedProducts.some((product) => product.errors.length > 0);
  return {
    products: preparedProducts,
    invalidRows,
    hasErrors,
    mode: normalizedMode,
    strategy: normalizedStrategy,
  };
}

export function serializeBomImportRpcPayload(product) {
  return {
    p_parent_sku_code: normalizeCode(product.sku),
    p_formula_code: "DEFAULT",
    p_base_batch: Number(product.baseBatch),
    p_base_output_boxes: Number(product.baseOutputBoxes),
    p_wip_qty_input_mode: normalizeWipMode(
      product.wipQtyInputMode,
      product.parentType
    ),
    p_note: null,
    p_status: product.status || "approved",
    p_diff: product.diff || { added: [], updated: [], removed: [] },
    p_changes: product.changes || [],
    p_items: normalizeItems(product.items, { strategy: "overwrite" }),
  };
}
