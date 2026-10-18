import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/adminApi";
import {
  buildScaleLotStatusLabel,
  loadScaleLotsForConfigs,
  loadScaleProductConfigs,
  normalizeScaleSkuCode,
} from "@/lib/scale/catalog";

export const SCALE_DEPARTMENT_CODE = "KP13";
export const SCALE_CATEGORY_CODE = "03";

function normalizeSkuCode(value) {
  return normalizeScaleSkuCode(value);
}

function sortProducts(left, right) {
  if (left.isOwner !== right.isOwner) {
    return left.isOwner ? -1 : 1;
  }

  const leftName = String(left.name || "").trim();
  const rightName = String(right.name || "").trim();
  const nameCompare = leftName.localeCompare(rightName, "th");
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return String(left.code || "").localeCompare(String(right.code || ""));
}

async function loadScalePresetUncached(supabaseAdmin) {
  const departmentResult = await supabaseAdmin
    .from("production_departments")
    .select("id,code,name")
    .eq("code", SCALE_DEPARTMENT_CODE)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (departmentResult.error) {
    throw new Error("Failed to load scale department");
  }

  return {
    department: departmentResult.data ?? null,
  };
}

const loadScalePresetCached = unstable_cache(
  async () => loadScalePresetUncached(getSupabaseAdmin()),
  ["scale-products-preset-v1"],
  { revalidate: 60 }
);

function buildDefaultProductProfile(config, currentLot) {
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

async function loadWeightScaleContext(supabaseAdmin, departmentId, products) {
  const configResult = await loadScaleProductConfigs(supabaseAdmin, {
    departmentId,
    skuCodes: products.map((product) => product.code),
  });

  if (!configResult.available || !configResult.configs.length) {
    return {
      available: configResult.available,
      configBySkuCode: new Map(),
      lotById: new Map(),
    };
  }

  const lotResult = await loadScaleLotsForConfigs(supabaseAdmin, {
    productConfigIds: configResult.configs.map((config) => config.id),
  });

  return {
    available: configResult.available && lotResult.available,
    configBySkuCode: new Map(
      configResult.configs.map((config) => [config.skuCode, config])
    ),
    lotById: new Map(lotResult.lots.map((lot) => [lot.id, lot])),
  };
}

async function loadMatchedProductRowsUncached(supabaseAdmin, departmentId) {
  const subcategoryResult = await supabaseAdmin
    .from("production_department_product_subcategories")
    .select("id")
    .eq("department_id", departmentId)
    .eq("name", "เปลือก")
    .maybeSingle();

  if (subcategoryResult.error) {
    throw new Error("Failed to load department subcategory 'เปลือก'");
  }

  const shellSubcategoryId = subcategoryResult.data?.id;
  if (!shellSubcategoryId) {
    return [];
  }

  const departmentProductsResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code,is_owner,subcategory_id")
    .eq("department_id", departmentId)
    .eq("subcategory_id", shellSubcategoryId);

  if (departmentProductsResult.error) {
    throw new Error("Failed to load department products");
  }

  const matchedDepartmentProducts = (departmentProductsResult.data ?? [])
    .map((row) => ({
      skuCode: normalizeSkuCode(row?.sku_code),
      isOwner: Boolean(row?.is_owner),
    }))
    .filter((row) => row.skuCode);

  if (!matchedDepartmentProducts.length) {
    return [];
  }

  const skuCodes = matchedDepartmentProducts.map((row) => row.skuCode);
  const productResult = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,uom_name,iccat_code,iccat_name")
    .in("sku_code", skuCodes);

  if (productResult.error) {
    throw new Error("Failed to load product details");
  }

  const productByCode = new Map(
    (productResult.data ?? []).map((row) => [
      normalizeSkuCode(row?.sku_code),
      {
        code: normalizeSkuCode(row?.sku_code),
        name: String(row?.sku_name || "").trim(),
        unit: String(row?.uom_name || "").trim(),
        categoryCode: String(row?.iccat_code || "").trim(),
        categoryName: String(row?.iccat_name || "").trim(),
      },
    ])
  );

  return matchedDepartmentProducts
    .map((row) => {
      const product = productByCode.get(row.skuCode);
      if (!product) {
        return null;
      }

      if (product.categoryCode !== SCALE_CATEGORY_CODE) {
        return null;
      }

      return {
        ...product,
        isOwner: row.isOwner,
      };
    })
    .filter(Boolean)
    .sort(sortProducts);
}

const loadMatchedProductRowsCached = unstable_cache(
  async (departmentId) => loadMatchedProductRowsUncached(getSupabaseAdmin(), departmentId),
  ["scale-products-master-rows-v2-shell-only"],
  { revalidate: 60 }
);

export const loadScaleProductsData = cache(async function loadScaleProductsData(
  supabaseAdmin = null
) {
  const hasCustomClient = Boolean(supabaseAdmin);
  const resolvedSupabaseAdmin = supabaseAdmin || getSupabaseAdmin();
  const { department } = hasCustomClient
    ? await loadScalePresetUncached(resolvedSupabaseAdmin)
    : await loadScalePresetCached();

  if (!department) {
    return {
      products: [],
      preset: {
        departmentId: null,
        departmentCode: SCALE_DEPARTMENT_CODE,
        categoryCode: SCALE_CATEGORY_CODE,
      },
      source: "fallback",
    };
  }

  const products = hasCustomClient
    ? await loadMatchedProductRowsUncached(resolvedSupabaseAdmin, department.id)
    : await loadMatchedProductRowsCached(department.id);
  const weightScaleContext = await loadWeightScaleContext(
    resolvedSupabaseAdmin,
    department.id,
    products
  );
  const productsWithConfig = products.map((product) => {
    const config = weightScaleContext.configBySkuCode.get(product.code) ?? null;
    const currentLot = config?.currentLotId
      ? weightScaleContext.lotById.get(config.currentLotId) ?? null
      : null;

    return {
      ...product,
      configId: config?.id ?? null,
      lotFormat: config?.lotFormat ?? "",
      amountPerPallet: config?.amountPerPallet ?? null,
      currentLotId: config?.currentLotId ?? null,
      currentLot: currentLot
        ? {
            id: currentLot.id,
            lotNo: currentLot.lotNo,
            status: currentLot.status,
            openedAt: currentLot.openedAt,
            closedAt: currentLot.closedAt,
          }
        : null,
      defaultProfile: buildDefaultProductProfile(config, currentLot),
    };
  });

  return {
    products: productsWithConfig,
    preset: {
      departmentId: department.id,
      departmentCode: department.code,
      departmentName: department.name,
      categoryCode: SCALE_CATEGORY_CODE,
    },
    source: weightScaleContext.available ? "internal-lot" : "fallback",
  };
});
