export const PIECE_RATE_PRODUCT_PICKER_PAGE_SIZE = 15;

function normalizePickerProduct(item) {
  const source = item?.payload || item || {};
  const product = source?.product || {};
  return {
    goodsCode: source.productGoodsCode || source.productCode || product.goodsCode || product.code || item?.productCode || "",
    skuCode: source.productSkuCode || product.skuCode || "",
    skuName: source.productName || product.name || "",
    brandName: source.brandName || product.brandName || "",
    unitName: source.unitName || product.unitName || "",
    productBarcode: source.productBarcode || item?.productBarcode || "",
    imageUrl: source.imageUrl || product.imageUrl || product.image_url || null,
  };
}

export function buildPieceRateProductPickerPage(products, requestedPage = 1, search = "") {
  const normalizedSearch = String(search || "").trim().toLocaleLowerCase("th-TH");
  const selectableProducts = (Array.isArray(products) ? products : [])
    .map(normalizePickerProduct)
    .filter((item) => String(item.productBarcode || "").trim().length > 0)
    .filter((item) => {
      if (!normalizedSearch) return true;
      return [item.goodsCode, item.skuCode, item.skuName, item.brandName]
        .some((value) => String(value || "").toLocaleLowerCase("th-TH").includes(normalizedSearch));
    });
  const totalPages = Math.max(
    1,
    Math.ceil(selectableProducts.length / PIECE_RATE_PRODUCT_PICKER_PAGE_SIZE)
  );
  const page = Math.min(Math.max(Number(requestedPage) || 1, 1), totalPages);
  const start = (page - 1) * PIECE_RATE_PRODUCT_PICKER_PAGE_SIZE;

  return {
    items: selectableProducts.slice(start, start + PIECE_RATE_PRODUCT_PICKER_PAGE_SIZE),
    page,
    totalPages,
    totalRecords: selectableProducts.length,
  };
}
