import assert from "node:assert/strict";
import test from "node:test";

import { buildPieceRateProductPickerPage } from "../src/features/attendance/utils/pieceRateProductPickerPagination.js";

function makeProduct(index) {
  const code = `FG-${String(index).padStart(3, "0")}`;
  return {
    productBarcode: `BARCODE-${index}`,
    productCode: code,
    productGoodsCode: code,
    productSkuCode: `SKU-${index}`,
    productName: `สินค้า ${index}`,
    unitName: "ปี๊บ",
    imageUrl: `/images/${index}.png`,
  };
}

test("product picker paginates selectable products in complete groups of 15", () => {
  const products = Array.from({ length: 32 }, (_, index) => makeProduct(index + 1));

  const firstPage = buildPieceRateProductPickerPage(products, 1);
  const secondPage = buildPieceRateProductPickerPage(products, 2);
  const thirdPage = buildPieceRateProductPickerPage(products, 3);

  assert.equal(firstPage.items.length, 15);
  assert.equal(secondPage.items.length, 15);
  assert.equal(thirdPage.items.length, 2);
  assert.equal(firstPage.totalPages, 3);
  assert.equal(firstPage.items[0].goodsCode, "FG-001");
  assert.equal(secondPage.items[0].goodsCode, "FG-016");
  assert.equal(thirdPage.items[1].goodsCode, "FG-032");
});

test("product picker excludes products that cannot be selected before pagination", () => {
  const products = [
    ...Array.from({ length: 15 }, (_, index) => makeProduct(index + 1)),
    { ...makeProduct(16), productBarcode: "" },
    makeProduct(17),
  ];

  const firstPage = buildPieceRateProductPickerPage(products, 1);
  const secondPage = buildPieceRateProductPickerPage(products, 2);

  assert.equal(firstPage.items.length, 15);
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0].goodsCode, "FG-017");
  assert.equal(firstPage.totalPages, 2);
});

test("product picker searches the cached selectable master without requesting another page", () => {
  const products = [
    makeProduct(1),
    { ...makeProduct(2), productName: "Alpine แยมสับปะรด", productGoodsCode: "B03-0012" },
    { ...makeProduct(3), productName: "แม่มะลิ วานิลลา" },
  ];

  const byName = buildPieceRateProductPickerPage(products, 1, "alpine");
  const byTradeCode = buildPieceRateProductPickerPage(products, 1, "b03-0012");

  assert.deepEqual(byName.items.map((item) => item.goodsCode), ["B03-0012"]);
  assert.deepEqual(byTradeCode.items.map((item) => item.goodsCode), ["B03-0012"]);
  assert.equal(byName.totalPages, 1);
});

test("product picker unwraps IndexedDB cache records with product details in payload", () => {
  const cachedRecord = {
    productBarcode: "BARCODE-CACHE-1",
    productCode: "B03-0005",
    payload: {
      productBarcode: "BARCODE-CACHE-1",
      product: {
        code: "B03-0005",
        goodsCode: "B03-0005",
        skuCode: "B03-0005-SKU",
        name: "แม่มะลิ แยมสับปะรด 1.1 กก.",
        unitName: "ปี๊บ",
        imageUrl: "/images/b03-0005.png",
      },
    },
  };

  const page = buildPieceRateProductPickerPage([cachedRecord], 1);

  assert.deepEqual(page.items, [{
    goodsCode: "B03-0005",
    skuCode: "B03-0005-SKU",
    skuName: "แม่มะลิ แยมสับปะรด 1.1 กก.",
    brandName: "",
    unitName: "ปี๊บ",
    productBarcode: "BARCODE-CACHE-1",
    imageUrl: "/images/b03-0005.png",
  }]);
});
