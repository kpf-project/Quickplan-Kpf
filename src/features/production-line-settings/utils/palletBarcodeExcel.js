"use client";

const PRODUCT_BARCODE_REGEX = /^[A-Z0-9\-._:/]{2,80}$/;

const HEADER_KEYS = {
  goodsCode: new Set(["goodscode", "tradecode", "trade", "รหัสซื้อขาย"]),
  skuCode: new Set(["sku", "skucode", "รหัสสินค้า"]),
  productBarcode: new Set(["barcode", "productbarcode", "บาร์โค้ด", "บาร์โค้ดสินค้า"]),
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, "");
}

function normalizeSkuCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeProductBarcode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!normalized) {
    return "";
  }
  if (!PRODUCT_BARCODE_REGEX.test(normalized)) {
    throw new Error(`รูปแบบบาร์โค้ดสินค้าไม่ถูกต้อง: ${normalized}`);
  }
  return normalized;
}

function extractCellValue(cell) {
  const rawValue = cell?.value;
  if (rawValue == null) {
    return "";
  }
  if (typeof rawValue === "object") {
    if (typeof rawValue.text === "string") {
      return rawValue.text;
    }
    if (rawValue.richText) {
      return rawValue.richText.map((item) => item?.text || "").join("");
    }
    if (rawValue.result != null) {
      return String(rawValue.result);
    }
    if (rawValue.hyperlink) {
      return String(rawValue.text || rawValue.hyperlink);
    }
  }
  return String(rawValue);
}

async function loadExcel() {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  return excelModule.default ?? excelModule;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadPalletBarcodeWorkbook({ rows = [], filename }) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Pallet Barcodes");
  sheet.columns = [
    { header: "Trade Code", key: "goodsCode", width: 18 },
    { header: "SKU", key: "skuCode", width: 18 },
    { header: "ชื่อสินค้า", key: "skuName", width: 34 },
    { header: "ICDEPT", key: "icdeptCode", width: 14 },
    { header: "ชื่อ ICDEPT", key: "icdeptName", width: 24 },
    { header: "Brand", key: "brandName", width: 18 },
    { header: "หน่วย", key: "unitName", width: 12 },
    { header: "บาร์โค้ดสินค้า", key: "productBarcode", width: 24 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "102C57" },
  };
  headerRow.height = 22;

  rows.forEach((row) => {
    sheet.addRow({
      goodsCode: row.goodsCode || "",
      skuCode: row.skuCode || "",
      skuName: row.skuName || "",
      icdeptCode: row.icdeptCode || row.iccatCode || "",
      icdeptName: row.icdeptName || row.iccatName || "",
      brandName: row.brandName || row.brandCode || "",
      unitName: row.unitName || "",
      productBarcode: row.productBarcode || "",
    });
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:H1";
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "E2E8F0" } },
        left: { style: "thin", color: { argb: "E2E8F0" } },
        bottom: { style: "thin", color: { argb: "E2E8F0" } },
        right: { style: "thin", color: { argb: "E2E8F0" } },
      };
      if (rowNumber > 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: rowNumber % 2 === 0 ? "FFFFFF" : "F8FAFC" },
        };
      }
    });
  });

  const guideSheet = workbook.addWorksheet("วิธีใช้");
  guideSheet.columns = [
    { header: "หัวข้อ", key: "topic", width: 24 },
    { header: "รายละเอียด", key: "detail", width: 96 },
  ];
  guideSheet.getRow(1).font = { bold: true };
  guideSheet.addRows([
    {
      topic: "วิธีนำเข้า",
      detail: "แก้ไขเฉพาะคอลัมน์ 'บาร์โค้ดสินค้า' แล้วนำไฟล์นี้กลับมา Import ได้ทันที",
    },
    {
      topic: "ล้างบาร์โค้ด",
      detail: "หากต้องการล้างบาร์โค้ดของ SKU ใด ให้เว้นคอลัมน์ 'บาร์โค้ดสินค้า' ว่างไว้",
    },
    {
      topic: "รูปแบบบาร์โค้ด",
      detail: "รองรับ A-Z, 0-9 และอักขระ - . _ : / ความยาว 2-80 ตัวอักษร",
    },
    {
      topic: "หมายเหตุ",
      detail: "ระบบใช้คอลัมน์ SKU เป็นตัวอ้างอิงหลัก โดยหากมี SKU ซ้ำ ระบบจะใช้ค่าบรรทัดสุดท้าย",
    },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename);
}

export async function parsePalletBarcodeImportFile(file) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();

  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("ไม่พบชีตข้อมูลในไฟล์ Excel");
  }

  const headerMap = new Map();
  const headerRow = sheet.getRow(1);
  for (let columnIndex = 1; columnIndex <= Math.max(sheet.columnCount, headerRow.cellCount); columnIndex += 1) {
    const normalizedHeader = normalizeHeader(extractCellValue(headerRow.getCell(columnIndex)));
    if (!normalizedHeader) continue;
    if (HEADER_KEYS.goodsCode.has(normalizedHeader) && !headerMap.has("goodsCode")) {
      headerMap.set("goodsCode", columnIndex);
    }
    if (HEADER_KEYS.skuCode.has(normalizedHeader) && !headerMap.has("skuCode")) {
      headerMap.set("skuCode", columnIndex);
    }
    if (HEADER_KEYS.productBarcode.has(normalizedHeader) && !headerMap.has("productBarcode")) {
      headerMap.set("productBarcode", columnIndex);
    }
  }

  if (!headerMap.has("goodsCode") || !headerMap.has("skuCode") || !headerMap.has("productBarcode")) {
    throw new Error("ไฟล์ Excel ต้องมีคอลัมน์ SKU และ บาร์โค้ดสินค้า");
  }

  const rowsByGoodsCode = new Map();
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const goodsCode = normalizeSkuCode(extractCellValue(row.getCell(headerMap.get("goodsCode"))));
    const skuCode = normalizeSkuCode(extractCellValue(row.getCell(headerMap.get("skuCode"))));
    const productBarcode = normalizeProductBarcode(
      extractCellValue(row.getCell(headerMap.get("productBarcode")))
    );

    if (!goodsCode && !skuCode && !productBarcode) {
      continue;
    }
    if (!goodsCode) {
      throw new Error(`แถวที่ ${rowIndex} ไม่มี Trade Code`);
    }
    if (!skuCode) {
      throw new Error(`แถวที่ ${rowIndex} ไม่มี SKU`);
    }

    rowsByGoodsCode.set(goodsCode, {
      goodsCode,
      skuCode,
      productBarcode: productBarcode || null,
    });
  }

  return Array.from(rowsByGoodsCode.values());
}
