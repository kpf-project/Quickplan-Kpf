import "server-only";
import { getSupabaseAdmin } from "@/lib/adminApi";

const normalizeScaleSkuCode = (value) => String(value || "").trim().toUpperCase();
const buildScaleLotStatusLabel = () => "ยังไม่ตั้งค่า";
import {
  LIVE_SCALE_WIP_CATEGORY_CODE,
  loadWeightScaleLiveDepartmentScope,
  loadWeightScaleLiveExcludedProductCodes,
} from "@/lib/scale/live-access";


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
    .select("department_id,sku_code,is_owner,subcategory_id")
    .in("department_id", departmentIds);

  if (mappingResult.error) {
    throw new Error("Failed to load live scale department products");
  }

  const excludedCodes = await loadWeightScaleLiveExcludedProductCodes(supabaseAdmin);
  const skuCodes = Array.from(
    new Set(
      (mappingResult.data ?? [])
        .map((row) => normalizeScaleSkuCode(row?.sku_code))
        .filter(code => code && !excludedCodes.has(code))
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
    .select("sku_code,sku_name,uom_name,iccat_code,iccat_name,image_url")
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
        imageUrl: row?.image_url || null,
        unit: String(row?.uom_name || "").trim(),
        categoryCode: String(row?.iccat_code || "").trim(),
        categoryName: String(row?.iccat_name || "").trim(),
      },
    ])
  );

  const subcategoryIds = Array.from(
    new Set((mappingResult.data ?? []).map((row) => row?.subcategory_id).filter(Boolean))
  );
  let subcategoryById = new Map();
  if (subcategoryIds.length) {
    const subcategoryResult = await supabaseAdmin
      .from("production_department_product_subcategories")
      .select("id,name")
      .in("id", subcategoryIds);
    if (subcategoryResult.error) {
      throw new Error("Failed to load live scale product subcategories");
    }
    subcategoryById = new Map(
      (subcategoryResult.data ?? []).map((row) => [row.id, row.name])
    );
  }

  const candidates = (mappingResult.data ?? [])
    .map((row) => {
      const departmentId = String(row?.department_id || "").trim();
      const department = departmentById.get(departmentId);
      const product = productByCode.get(normalizeScaleSkuCode(row?.sku_code));
      if (!department || !product || !["KG", "KGS", "กก.", "กก", "กิโลกรัม"].includes(product.unit.toUpperCase())) {
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
        subcategoryName: String(subcategoryById.get(row?.subcategory_id) || "").trim(),
      };
    })
    .filter(Boolean)
    .sort(sortCandidates);

  const chosenBySku = new Map();
  candidates.forEach((candidate) => {
    const key = buildProductKey(candidate.departmentId, candidate.code);
    if (!chosenBySku.has(key)) {
      chosenBySku.set(key, candidate);
    }
  });
  const chosenProducts = Array.from(chosenBySku.values());
  const chosenDepartmentIds = Array.from(
    new Set(chosenProducts.map((product) => product.departmentId))
  );
  const chosenSkuCodes = chosenProducts.map((product) => product.code);

  const configByProductKey = new Map();
  const lotById = new Map();

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

export async function loadWeightScaleLiveRecentReceiptsData() {
  return {
    available: false,
    receipts: [],
    summary: { totalCount: 0, actualCount: 0, testCount: 0, totalNetWeightKg: 0 },
  };
}
