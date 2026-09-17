import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";
import {
  buildScaleLotStatusLabel,
  loadScaleLotsForConfigs,
  normalizeScaleSkuCode,
} from "@/lib/scale/catalog";
import {
  LIVE_SCALE_WEIGHT_SOURCE,
  LIVE_SCALE_WIP_CATEGORY_CODE,
  loadWeightScaleLiveDepartmentScope,
} from "@/lib/scale/live-access";
import { loadScaleRecentReceiptsData } from "@/lib/scale/receipts";

function buildProductKey(departmentId, skuCode) {
  return `${String(departmentId || "").trim()}::${normalizeScaleSkuCode(skuCode)}`;
}

function sortCandidates(left, right) {
  if (left.isOwner !== right.isOwner) {
    return left.isOwner ? -1 : 1;
  }
  if (left.canOperate !== right.canOperate) {
    return left.canOperate ? -1 : 1;
  }
  const departmentCompare = left.departmentCode.localeCompare(
    right.departmentCode,
    "en",
    { numeric: true }
  );
  if (departmentCompare !== 0) {
    return departmentCompare;
  }
  return left.code.localeCompare(right.code, "en", { numeric: true });
}

function sortProducts(left, right) {
  const departmentCompare = left.departmentCode.localeCompare(
    right.departmentCode,
    "en",
    { numeric: true }
  );
  if (departmentCompare !== 0) {
    return departmentCompare;
  }
  const nameCompare = left.name.localeCompare(right.name, "th");
  return nameCompare || left.code.localeCompare(right.code, "en", { numeric: true });
}

function buildDefaultProfile(config, currentLot) {
  return {
    lotNo: currentLot?.lotNo || "",
    passWeightKg:
      typeof config?.passWeightKg === "number"
        ? String(config.passWeightKg)
        : "",
    tareWeightKg:
      typeof config?.tareWeightKg === "number"
        ? String(config.tareWeightKg)
        : "",
    status: buildScaleLotStatusLabel({ isActive: config?.isActive !== false }),
  };
}

export async function loadWeightScaleLiveProductsData(
  supabaseAdmin = getSupabaseAdmin(),
  { userId, isAdmin = false } = {}
) {
  const scope = await loadWeightScaleLiveDepartmentScope(supabaseAdmin, {
    userId,
    isAdmin,
  });
  const departmentIds = scope.departments.map((department) => department.id);
  const departmentById = new Map(
    scope.departments.map((department) => [department.id, department])
  );

  if (!departmentIds.length) {
    return {
      products: [],
      preset: {
        departmentId: null,
        departmentIds: [],
        categoryCode: LIVE_SCALE_WIP_CATEGORY_CODE,
        itemType: "WIP",
      },
      access: {
        canView: false,
        canOperate: false,
        message:
          "บัญชีนี้ยังไม่ได้รับสิทธิ์ในแผนกผลิต กรุณาตั้งค่าที่หน้าหมวดหมู่สินค้าแผนก",
      },
      source: "department-wip",
    };
  }

  const mappingResult = await supabaseAdmin
    .from("production_department_products")
    .select("department_id,sku_code,is_owner")
    .in("department_id", departmentIds);

  if (mappingResult.error) {
    throw new Error("Failed to load live scale department products");
  }

  const skuCodes = Array.from(
    new Set(
      (mappingResult.data ?? [])
        .map((row) => normalizeScaleSkuCode(row?.sku_code))
        .filter(Boolean)
    )
  );

  if (!skuCodes.length) {
    return {
      products: [],
      preset: {
        departmentId: null,
        departmentIds,
        categoryCode: LIVE_SCALE_WIP_CATEGORY_CODE,
        itemType: "WIP",
      },
      access: {
        canView: true,
        canOperate: scope.canOperate,
        message: "ไม่พบสินค้า WIP ที่ผูกกับแผนกที่บัญชีนี้มีสิทธิ์",
      },
      source: "department-wip",
    };
  }

  const productResult = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,uom_name,iccat_code,iccat_name")
    .in("sku_code", skuCodes)
    .eq("iccat_code", LIVE_SCALE_WIP_CATEGORY_CODE);

  if (productResult.error) {
    throw new Error("Failed to load WIP product details");
  }

  const productByCode = new Map(
    (productResult.data ?? []).map((row) => [
      normalizeScaleSkuCode(row?.sku_code),
      {
        code: normalizeScaleSkuCode(row?.sku_code),
        name: String(row?.sku_name || "").trim(),
        unit: String(row?.uom_name || "").trim(),
        categoryCode: String(row?.iccat_code || "").trim(),
        categoryName: String(row?.iccat_name || "").trim(),
      },
    ])
  );

  const candidates = (mappingResult.data ?? [])
    .map((row) => {
      const departmentId = String(row?.department_id || "").trim();
      const department = departmentById.get(departmentId);
      const product = productByCode.get(normalizeScaleSkuCode(row?.sku_code));
      if (!department || !product) {
        return null;
      }

      return {
        ...product,
        departmentId,
        departmentCode: department.code,
        departmentName: department.name,
        accessRole: scope.isAdmin ? "admin" : department.role,
        canOperate: scope.isAdmin || department.role === "editor",
        isOwner: Boolean(row?.is_owner),
      };
    })
    .filter(Boolean)
    .sort(sortCandidates);

  const chosenBySku = new Map();
  candidates.forEach((candidate) => {
    if (!chosenBySku.has(candidate.code)) {
      chosenBySku.set(candidate.code, candidate);
    }
  });
  const chosenProducts = Array.from(chosenBySku.values());
  const chosenDepartmentIds = Array.from(
    new Set(chosenProducts.map((product) => product.departmentId))
  );
  const chosenSkuCodes = chosenProducts.map((product) => product.code);

  let configRows = [];
  if (chosenDepartmentIds.length && chosenSkuCodes.length) {
    const configResult = await supabaseAdmin
      .from("production_weight_scale_products")
      .select(
        "id,department_id,sku_code,lot_format,pass_weight_kg,tare_weight_kg,amount_per_pallet,is_active,current_lot_id"
      )
      .in("department_id", chosenDepartmentIds)
      .in("sku_code", chosenSkuCodes);

    if (configResult.error) {
      throw new Error("Failed to load live scale WIP configs");
    }
    configRows = configResult.data ?? [];
  }

  const configByProductKey = new Map(
    configRows.map((row) => [
      buildProductKey(row?.department_id, row?.sku_code),
      {
        id: row.id,
        lotFormat: String(row?.lot_format || "").trim(),
        passWeightKg: Number.isFinite(Number(row?.pass_weight_kg))
          ? Number(row.pass_weight_kg)
          : null,
        tareWeightKg: Number.isFinite(Number(row?.tare_weight_kg))
          ? Number(row.tare_weight_kg)
          : null,
        amountPerPallet: Number.isFinite(Number(row?.amount_per_pallet))
          ? Number(row.amount_per_pallet)
          : null,
        isActive: row?.is_active !== false,
        currentLotId: row?.current_lot_id || null,
      },
    ])
  );
  const lotResult = await loadScaleLotsForConfigs(supabaseAdmin, {
    productConfigIds: configRows.map((row) => row.id),
  });
  const lotById = new Map(lotResult.lots.map((lot) => [lot.id, lot]));

  const products = chosenProducts
    .map((product) => {
      const config =
        configByProductKey.get(buildProductKey(product.departmentId, product.code))
        || null;
      const currentLot = config?.currentLotId
        ? lotById.get(config.currentLotId) || null
        : null;

      return {
        ...product,
        configId: config?.id || null,
        lotFormat: config?.lotFormat || "",
        amountPerPallet: config?.amountPerPallet ?? null,
        currentLotId: config?.currentLotId || null,
        currentLot: currentLot
          ? {
              id: currentLot.id,
              lotNo: currentLot.lotNo,
              status: currentLot.status,
              openedAt: currentLot.openedAt,
              closedAt: currentLot.closedAt,
            }
          : null,
        defaultProfile: buildDefaultProfile(config, currentLot),
      };
    })
    .sort(sortProducts);

  return {
    products,
    preset: {
      departmentId: null,
      departmentIds: chosenDepartmentIds,
      categoryCode: LIVE_SCALE_WIP_CATEGORY_CODE,
      itemType: "WIP",
    },
    access: {
      canView: true,
      canOperate: products.some((product) => product.canOperate),
      message: products.length
        ? ""
        : "ไม่พบสินค้า WIP ที่ผูกกับแผนกที่บัญชีนี้มีสิทธิ์",
    },
    source: "department-wip",
  };
}

export async function loadWeightScaleLiveRecentReceiptsData(
  supabaseAdmin = getSupabaseAdmin(),
  { departmentIds = [], limit = 20 } = {}
) {
  const normalizedDepartmentIds = Array.from(
    new Set(departmentIds.map((value) => String(value || "").trim()).filter(Boolean))
  );

  if (!normalizedDepartmentIds.length) {
    return {
      available: true,
      receipts: [],
      summary: {
        totalCount: 0,
        actualCount: 0,
        testCount: 0,
        totalNetWeightKg: 0,
      },
    };
  }

  const payloads = await Promise.all(
    normalizedDepartmentIds.map((departmentId) =>
      loadScaleRecentReceiptsData(supabaseAdmin, {
        departmentId,
        limit,
        weightSource: LIVE_SCALE_WEIGHT_SOURCE,
      })
    )
  );
  const receipts = payloads
    .flatMap((payload) => payload.receipts || [])
    .sort((left, right) =>
      String(right?.weighedAt || "").localeCompare(String(left?.weighedAt || ""))
    )
    .slice(0, limit);

  return {
    available: payloads.every((payload) => payload.available !== false),
    receipts,
    summary: payloads.reduce(
      (summary, payload) => ({
        totalCount: summary.totalCount + Number(payload?.summary?.totalCount || 0),
        actualCount: summary.actualCount + Number(payload?.summary?.actualCount || 0),
        testCount: summary.testCount + Number(payload?.summary?.testCount || 0),
        totalNetWeightKg:
          summary.totalNetWeightKg
          + Number(payload?.summary?.totalNetWeightKg || 0),
      }),
      {
        totalCount: 0,
        actualCount: 0,
        testCount: 0,
        totalNetWeightKg: 0,
      }
    ),
  };
}
