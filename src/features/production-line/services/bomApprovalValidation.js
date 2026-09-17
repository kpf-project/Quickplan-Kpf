import "server-only";

import { ApiError } from "@/lib/adminApi";
import { resolveItemTypeByCategory, validateBomMatrix } from "@/lib/bomMatrix";

const PLANNING_READY_VERSION_STATUSES = new Set(["pending_review", "approved"]);
const REQUIRED_VERSION_FIELDS = [
  "status",
  "base_batch",
  "base_output_boxes",
  "formula_code",
  "formula_name",
];

function normalizePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function buildChecklist({ versionStatus, baseBatch, baseOutputBoxes }) {
  return {
    formula_planning_ready: PLANNING_READY_VERSION_STATUSES.has(String(versionStatus || "").trim().toLowerCase()),
    base_batch_ready: normalizePositiveNumber(baseBatch) > 0,
    base_output_boxes_ready: normalizePositiveNumber(baseOutputBoxes) > 0,
    material_matrix_ready: true,
  };
}

function toValidationError({ stage, skuCode, checklist, violations }) {
  return new ApiError(422, "BOM ไม่ผ่านเกณฑ์ก่อนอนุมัติ", {
    code: "BOM_PRE_APPROVAL_POLICY_FAILED",
    stage,
    sku_code: skuCode || "",
    checklist,
    violations,
  });
}

function hasRequiredVersionFields(versionRow) {
  if (!versionRow || typeof versionRow !== "object") {
    return false;
  }
  return REQUIRED_VERSION_FIELDS.every((field) =>
    Object.prototype.hasOwnProperty.call(versionRow, field)
  );
}

export async function assertBomApprovalPolicyReady({
  supabaseAdmin,
  bomId,
  versionId,
  stage = "request",
  bomRow = null,
  versionRow = null,
}) {
  if (!supabaseAdmin) {
    throw new ApiError(500, "Supabase admin client is required");
  }
  if (!bomId || !versionId) {
    throw new ApiError(400, "bomId and versionId are required");
  }

  const [bomResult, versionResult] = await Promise.all([
    bomRow
      ? Promise.resolve({ data: bomRow, error: null })
      : supabaseAdmin
        .from("production_boms")
        .select("id,sku_code,status")
        .eq("id", bomId)
        .maybeSingle(),
    hasRequiredVersionFields(versionRow)
      ? Promise.resolve({ data: versionRow, error: null })
      : supabaseAdmin
        .from("production_bom_versions")
        .select("id,bom_id,status,base_batch,base_output_boxes,formula_code,formula_name")
        .eq("id", versionId)
        .maybeSingle(),
  ]);

  if (bomResult.error) {
    throw new ApiError(500, "Failed to load BOM", bomResult.error.message);
  }
  if (versionResult.error) {
    throw new ApiError(500, "Failed to load BOM version", versionResult.error.message);
  }

  const resolvedBomRow = bomResult.data;
  const resolvedVersionRow = versionResult.data;
  if (!resolvedBomRow) {
    throw new ApiError(404, "BOM not found");
  }
  if (!resolvedVersionRow) {
    throw new ApiError(404, "BOM version not found");
  }

  const checklist = buildChecklist({
    versionStatus: resolvedVersionRow.status,
    baseBatch: resolvedVersionRow.base_batch,
    baseOutputBoxes: resolvedVersionRow.base_output_boxes,
  });
  const violations = [];

  if (!checklist.formula_planning_ready) {
    violations.push({
      code: "FORMULA_NOT_PLANNING_READY",
      field: "status",
      message: "สูตรยังไม่อยู่สถานะพร้อมใช้งานสำหรับ planning",
      current_value: resolvedVersionRow.status || null,
      expected: "pending_review หรือ approved",
    });
  }
  if (!checklist.base_batch_ready) {
    violations.push({
      code: "BASE_BATCH_REQUIRED",
      field: "base_batch",
      message: "ต้องกำหนด base_batch มากกว่า 0",
      current_value: resolvedVersionRow.base_batch ?? null,
      expected: "> 0",
    });
  }
  if (!checklist.base_output_boxes_ready) {
    violations.push({
      code: "BASE_OUTPUT_BOXES_REQUIRED",
      field: "base_output_boxes",
      message: "ต้องกำหนด base_output_boxes มากกว่า 0",
      current_value: resolvedVersionRow.base_output_boxes ?? null,
      expected: "> 0",
    });
  }

  const { data: parentProduct, error: parentProductError } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,iccat_code")
    .eq("sku_code", resolvedBomRow.sku_code)
    .maybeSingle();
  if (parentProductError) {
    throw new ApiError(500, "Failed to load parent product category", parentProductError.message);
  }
  if (!parentProduct) {
    violations.push({
      code: "PARENT_PRODUCT_NOT_FOUND",
      field: "sku_code",
      message: "ไม่พบสินค้า parent ใน products_cache",
      current_value: resolvedBomRow.sku_code,
      expected: "ต้องมีข้อมูล category ใน products_cache",
    });
  }

  const { data: bomItems, error: bomItemsError } = await supabaseAdmin
    .from("production_bom_items")
    .select("material_sku_code")
    .eq("version_id", resolvedVersionRow.id);
  if (bomItemsError) {
    throw new ApiError(500, "Failed to load BOM items", bomItemsError.message);
  }

  const componentCodes = Array.from(
    new Set((bomItems || []).map((item) => String(item?.material_sku_code || "").trim()).filter(Boolean))
  );
  let matrixResult = { ok: true, details: [] };

  if (parentProduct) {
    const parentType = resolveItemTypeByCategory(parentProduct.iccat_code);
    let childEntries = [];
    if (componentCodes.length) {
      const { data: componentRows, error: componentError } = await supabaseAdmin
        .from("products_cache")
        .select("sku_code,iccat_code")
        .in("sku_code", componentCodes);
      if (componentError) {
        throw new ApiError(500, "Failed to validate BOM matrix", componentError.message);
      }

      const categoryBySku = new Map((componentRows || []).map((row) => [row.sku_code, row.iccat_code]));
      componentCodes.forEach((sku, index) => {
        if (!categoryBySku.has(sku)) {
          violations.push({
            code: "UNKNOWN_COMPONENT_SKU",
            field: "material_sku_code",
            message: "ไม่พบ component SKU ใน products_cache",
            current_value: sku,
            expected: "ต้องมีข้อมูล category ใน products_cache",
            row_number: index + 1,
          });
        }
      });

      childEntries = componentCodes.map((sku, index) => ({
        rowNumber: index + 1,
        materialCode: sku,
        itemType: resolveItemTypeByCategory(categoryBySku.get(sku)),
      }));
    }

    matrixResult = validateBomMatrix({
      parentType,
      childTypes: childEntries.map((entry) => entry.itemType),
      childEntries,
    });
    if (!matrixResult.ok) {
      checklist.material_matrix_ready = false;
      violations.push({
        code: "MATERIAL_MATRIX_INVALID",
        field: "material_type_matrix",
        message: matrixResult.message || "โครงสร้างประเภทวัตถุดิบไม่ผ่าน matrix",
        details: matrixResult.details || [],
      });
    }
  }

  if (!violations.length) {
    return {
      ok: true,
      stage,
      checklist,
      skuCode: resolvedBomRow.sku_code || "",
      versionId: resolvedVersionRow.id,
      matrixDetails: matrixResult.details || [],
    };
  }

  throw toValidationError({
    stage,
    skuCode: resolvedBomRow.sku_code || "",
    checklist,
    violations,
  });
}
