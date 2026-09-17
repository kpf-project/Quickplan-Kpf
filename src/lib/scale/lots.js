import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";
import {
  loadScaleLotsForConfigs,
  normalizeScaleSkuCode,
} from "@/lib/scale/catalog";
import { loadScaleProductsData } from "@/lib/scale/products";

function sortLotOptions(left, right) {
  if (left.isCurrent !== right.isCurrent) {
    return left.isCurrent ? -1 : 1;
  }

  if (left.isOwner !== right.isOwner) {
    return left.isOwner ? -1 : 1;
  }

  if (left.status !== right.status) {
    if (left.status === "active") {
      return -1;
    }
    if (right.status === "active") {
      return 1;
    }
  }

  const leftName = String(left.name || "").trim();
  const rightName = String(right.name || "").trim();
  const nameCompare = leftName.localeCompare(rightName, "th");
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return String(right.openedAt || "").localeCompare(String(left.openedAt || ""));
}

function buildAllowedProductsMap(products = []) {
  return new Map(
    products
      .map((product) => {
        const code = normalizeScaleSkuCode(product?.code);
        if (!code || !product?.configId) {
          return null;
        }

        return [
          product.configId,
          {
            code,
            name: String(product?.name || "").trim(),
            unit: String(product?.unit || "").trim(),
            categoryCode: String(product?.categoryCode || "").trim(),
            categoryName: String(product?.categoryName || "").trim(),
            isOwner: Boolean(product?.isOwner),
            currentLotId: String(product?.currentLotId || "").trim() || null,
          },
        ];
      })
      .filter(Boolean)
  );
}

function mapLotRows(lots, allowedProductsMap) {
  return lots
    .map((lot) => {
      const product = allowedProductsMap.get(lot?.productConfigId);
      if (!product || !lot?.lotNo) {
        return null;
      }

      return {
        selectionKey: `${product.code}::${lot.lotNo}`,
        code: product.code,
        name: product.name,
        unit: product.unit,
        categoryCode: product.categoryCode,
        categoryName: product.categoryName,
        productConfigId: lot.productConfigId,
        lotId: lot.id,
        lotNo: lot.lotNo,
        status: lot.status,
        openedAt: lot.openedAt,
        closedAt: lot.closedAt,
        isCurrent: product.currentLotId === lot.id,
        isOwner: product.isOwner,
      };
    })
    .filter(Boolean)
    .sort(sortLotOptions);
}

export async function loadScaleLotsData(options = {}) {
  const supabaseAdmin = options?.supabaseAdmin || getSupabaseAdmin();
  const productPayload =
    Array.isArray(options?.products) && options.products.length
      ? {
          products: options.products,
        }
      : await loadScaleProductsData(supabaseAdmin);

  const products = Array.isArray(productPayload?.products)
    ? productPayload.products
    : [];
  const allowedProductsMap = buildAllowedProductsMap(products);

  if (!allowedProductsMap.size) {
    return {
      lots: [],
      source: "internal-lot",
      fetchedAt: new Date().toISOString(),
    };
  }

  const lotResult = await loadScaleLotsForConfigs(supabaseAdmin, {
    productConfigIds: [...allowedProductsMap.keys()],
  });

  return {
    lots: mapLotRows(lotResult.lots, allowedProductsMap),
    source: lotResult.available ? "internal-lot" : "fallback",
    fetchedAt: new Date().toISOString(),
  };
}
