// Lazy load exceljs only when needed to keep bundle small
import {
  BOM_IMPORT_HEADER_ALIASES,
  normalizeBomImportRow,
  sanitizeExcelText,
} from "./bomImportContract.js";

async function loadExcel() {
  const ExcelJS = await import("exceljs");
  return ExcelJS.default ?? ExcelJS;
}

function normalizeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

const FG_CODES = new Set(["04", "04-1", "04-2"]);
const WIP_CODES = new Set(["03"]);
const RAW_CODES = new Set(["01", "02", "05", "08", "10"]);

const CALCULATION_BASIS_THAI = Object.freeze({
  JOB_QTY: "อิงจำนวนงาน",
  HEADCOUNT: "อิงจำนวนคน",
  MACHINE_COUNT: "อิงจำนวนเครื่อง",
  DOUGH_SET_COUNT: "อิงจำนวนชุดแป้ง",
});

const ROUND_MODE_THAI = Object.freeze({
  NONE: "ไม่ปัด",
  UP: "ปัดขึ้น",
  DOWN: "ปัดลง",
  NEAREST: "ปัดปกติ",
});

const WIP_MODE_THAI = Object.freeze({
  unit: "หน่วย",
  batch: "แบทช์",
  UNIT: "หน่วย",
  BATCH: "แบทช์",
});

function normalizeCategory(value) {
  return String(value || "").trim().toUpperCase();
}

function toSkuCode(record) {
  return String(record?.code || record?.sku_code || "").trim();
}

function toSkuName(record) {
  return String(record?.name || record?.sku_name || "").trim();
}

function toSkuUnit(record) {
  return String(record?.unit || record?.uom || record?.uom_name || "").trim();
}

function buildLookupRows(records = []) {
  const dedupe = new Set();
  return records
    .map((record) => ({
      code: toSkuCode(record),
      name: toSkuName(record),
      unit: toSkuUnit(record),
      category: normalizeCategory(record?.category || record?.iccat_code),
    }))
    .filter((row) => {
      if (!row.code || !row.name) return false;
      if (dedupe.has(row.code)) return false;
      dedupe.add(row.code);
      return true;
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

function styleCatalogSheet(sheet, { NAVY, GOLD, LIGHT }) {
  sheet.getRow(1).font = { bold: true, color: { argb: GOLD } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  sheet.getRow(1).height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:C1";
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
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
          fgColor: { argb: rowNumber % 2 === 0 ? "FFFFFF" : LIGHT },
        };
      }
    });
  });
}

export async function createLegacyMultiProductTemplate({ products = [], materials = [] } = {}) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("BOM-Input");
  const guideSheet = workbook.addWorksheet("วิธีกรอก");
  const fgSheet = workbook.addWorksheet("รายการ FG");
  const wipSheet = workbook.addWorksheet("รายการ WIP");
  const rawSheet = workbook.addWorksheet("รายการ RAW");
  const lookupSheet = workbook.addWorksheet("รายการ WIP_RAW");
  const lookupByNameSheet = workbook.addWorksheet("รายการ WIP_RAW_ค้นชื่อ");
  const NAVY = "102C57";
  const NAVY_DARK = "0B2141";
  const GOLD = "D4AF37";
  const LIGHT = "F7F8FA";

  sheet.columns = [
    { header: "รหัสสินค้า", key: "productCode", width: 18 },
    { header: "ชื่อสินค้า (AUTO)", key: "productNameAuto", width: 30 },
    { header: "base_batch", key: "baseBatch", width: 16 },
    { header: "base_output_boxes", key: "baseOutputBoxes", width: 20 },
    { header: "รหัสวัตถุดิบ", key: "code", width: 16 },
    { header: "ชื่อวัตถุดิบ/WIP (AUTO)", key: "materialNameAuto", width: 34 },
    { header: "จำนวน", key: "qty", width: 10 },
    { header: "หมายเหตุ", key: "note", width: 28 },
    { header: "", key: "blankI", width: 4 },
    { header: "ค้นหา WIP/RAW (ชื่อ)", key: "lookupName", width: 32 },
    { header: "รหัสจากการค้นหา", key: "lookupCode", width: 24 },
    { header: "ชื่อจากการค้นหา", key: "lookupResolvedName", width: 34 },
    { header: "หน่วยจากการค้นหา", key: "lookupResolvedUnit", width: 18 },
  ];

  sheet.addRows([
    {
      productCode: "FG-1001",
      baseBatch: 16,
      baseOutputBoxes: 280,
      code: "RM-001",
      materialNameAuto: "",
      qty: 1.5,
      note: "สูตรหลัก",
    },
    {
      productCode: "FG-1001",
      baseBatch: 16,
      baseOutputBoxes: 280,
      code: "RM-017",
      materialNameAuto: "",
      qty: 0.25,
      note: "สีเข้ม",
    },
    {
      productCode: "FG-2002",
      baseBatch: 20,
      baseOutputBoxes: 320,
      code: "RM-099",
      materialNameAuto: "",
      qty: 12,
      note: "บรรจุภัณฑ์/ลังละ 12",
    },
  ]);

  sheet.getRow(1).font = { bold: true, color: { argb: GOLD } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  sheet.getRow(1).height = 24;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:H1";
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
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
          fgColor: { argb: rowNumber % 2 === 0 ? "FFFFFF" : LIGHT },
        };
      }
    });
  });

  sheet.getColumn("productNameAuto").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("productCode").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("baseBatch").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getColumn("baseOutputBoxes").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getColumn("code").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("materialNameAuto").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("qty").alignment = { vertical: "middle", horizontal: "right" };
  sheet.getColumn("note").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("lookupName").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("lookupCode").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("lookupResolvedName").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getColumn("lookupResolvedUnit").alignment = { vertical: "middle", horizontal: "left" };

  sheet.getCell("J1").font = { bold: true, color: { argb: GOLD } };
  sheet.getCell("K1").font = { bold: true, color: { argb: GOLD } };
  sheet.getCell("L1").font = { bold: true, color: { argb: GOLD } };
  sheet.getCell("M1").font = { bold: true, color: { argb: GOLD } };
  sheet.getCell("J1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_DARK } };
  sheet.getCell("K1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_DARK } };
  sheet.getCell("L1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_DARK } };
  sheet.getCell("M1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_DARK } };

  for (let row = 2; row <= 500; row += 1) {
    sheet.getCell(`B${row}`).value = {
      formula:
        `IF($A${row}="","",IFERROR(VLOOKUP($A${row},'รายการ FG'!$A:$B,2,FALSE),IFERROR(VLOOKUP($A${row},'รายการ WIP'!$A:$B,2,FALSE),"")))`,
    };
    sheet.getCell(`F${row}`).value = {
      formula: `IF($E${row}="","",IFERROR(VLOOKUP($E${row},'รายการ WIP_RAW'!$A:$B,2,FALSE),""))`,
    };
    sheet.getCell(`K${row}`).value = {
      formula:
        `IF($J$2="","",IFERROR(INDEX('รายการ WIP_RAW_ค้นชื่อ'!$B$2:$B$4000,MATCH(ROW(A${row - 1}),'รายการ WIP_RAW_ค้นชื่อ'!$E$2:$E$4000,0)),""))`,
    };
    sheet.getCell(`L${row}`).value = {
      formula:
        `IF($J$2="","",IFERROR(INDEX('รายการ WIP_RAW_ค้นชื่อ'!$C$2:$C$4000,MATCH(ROW(A${row - 1}),'รายการ WIP_RAW_ค้นชื่อ'!$E$2:$E$4000,0)),""))`,
    };
    sheet.getCell(`M${row}`).value = {
      formula:
        `IF($J$2="","",IFERROR(INDEX('รายการ WIP_RAW_ค้นชื่อ'!$D$2:$D$4000,MATCH(ROW(A${row - 1}),'รายการ WIP_RAW_ค้นชื่อ'!$E$2:$E$4000,0)),""))`,
    };
    sheet.getCell(`A${row}`).protection = { locked: false };
    sheet.getCell(`C${row}`).protection = { locked: false };
    sheet.getCell(`D${row}`).protection = { locked: false };
    sheet.getCell(`E${row}`).protection = { locked: false };
    sheet.getCell(`G${row}`).protection = { locked: false };
    sheet.getCell(`H${row}`).protection = { locked: false };
    sheet.getCell(`J${row}`).protection = { locked: false };
    sheet.getCell(`J${row}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4CC" },
    };
    sheet.getCell(`J${row}`).border = {
      top: { style: "thin", color: { argb: "D4AF37" } },
      left: { style: "thin", color: { argb: "D4AF37" } },
      bottom: { style: "thin", color: { argb: "D4AF37" } },
      right: { style: "thin", color: { argb: "D4AF37" } },
    };
  }
  await sheet.protect("kpf-bom", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: true,
    pivotTables: false,
  });

  // Guide sheet: detailed instructions in Thai with examples
  guideSheet.columns = [
    { header: "หัวข้อ", key: "topic", width: 28 },
    { header: "รายละเอียด", key: "detail", width: 90 },
  ];
  guideSheet.mergeCells("A1:B1");
  guideSheet.getCell("A1").value = "คู่มือการกรอกเทมเพลต BOM";
  guideSheet.getCell("A1").font = { bold: true, size: 16, color: { argb: GOLD } };
  guideSheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  guideSheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY_DARK },
  };
  guideSheet.getRow(1).height = 28;

  guideSheet.getRow(2).values = ["หัวข้อ", "รายละเอียด"];
  guideSheet.getRow(2).font = { bold: true, color: { argb: GOLD } };
  guideSheet.getRow(2).alignment = { vertical: "middle", horizontal: "center" };
  guideSheet.getRow(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  guideSheet.getRow(2).height = 22;

  guideSheet.addRows([
    {
      topic: "ภาพรวม",
      detail:
        "ชีท BOM-Input ใช้กรอกสูตรผลิตสินค้า แต่ละแถวคือ 1 รายการวัตถุดิบหรือ WIP ที่ใช้ในสูตร",
    },
    {
      topic: "ต้องกรอกช่องไหน",
      detail:
        "กรอกเฉพาะคอลัมน์ A,C,D,E,G,H เท่านั้น (A=รหัสสินค้า, C=base_batch, D=base_output_boxes, E=รหัสวัตถุดิบ/WIP, G=จำนวน, H=หมายเหตุ)",
    },
    {
      topic: "base_batch / base_output_boxes",
      detail:
        "สองค่านี้คือฐานสูตร: base_batch = จำนวน batch ตั้งต้น, base_output_boxes = จำนวนลังที่ได้จาก batch ตั้งต้น (ตัวอย่าง 16 batch ได้ 280 ลัง) ถ้าเป็นสินค้าเดียวกันต้องใส่สองค่านี้ให้ตรงกันทุกแถว",
    },
    {
      topic: "รหัสวัตถุดิบ",
      detail:
        "คอลัมน์ E ใส่รหัสวัตถุดิบหรือ WIP ที่มีในระบบเท่านั้น ถ้าไม่พบรหัส ระบบจะไม่นำเข้าแถวนั้น",
    },
    {
      topic: "ชื่อสินค้า/ชื่อวัตถุดิบ",
      detail:
        "คอลัมน์ B (ชื่อสินค้า) และ F (ชื่อวัตถุดิบ/WIP) จะขึ้นให้อัตโนมัติจากรหัส และล็อกไว้ แก้เองไม่ได้",
    },
    {
      topic: "ตัวช่วยค้นหา J-K-L",
      detail:
        "ถ้าไม่รู้รหัส ให้พิมพ์คำค้นที่ J2 (เช่น น้ำตาล) ระบบจะแสดงรายการที่ตรงทั้งหมดลงใน K:L:M (K=รหัส, L=ชื่อ, M=หน่วย) จากนั้นคัดลอกรหัสที่ต้องการจาก K ไปใส่คอลัมน์ E",
    },
    {
      topic: "จำนวน",
      detail:
        "คอลัมน์ G เป็นจำนวนที่ใช้ต่อฐานสูตร ต้องมากกว่า 0 และใส่ทศนิยมได้",
    },
    {
      topic: "หมายเหตุ",
      detail:
        "คอลัมน์ H ไม่บังคับ ใส่ไว้เตือนความจำ เช่น สูตรหลัก, สีเข้ม",
    },
    {
      topic: "ตัวอย่างกรอกจริง",
      detail:
        "แถวที่ 1: FG-1001 | [AUTO] | 16 | 280 | WIP-001 | [AUTO] | 60 | สูตร FG\nแถวที่ 2: FG-1001 | [AUTO] | 16 | 280 | RM-017 | [AUTO] | 0.25 | สูตร FG\nแถวที่ 3: WIP-001 | [AUTO] | 10 | 120 | RM-050 | [AUTO] | 8 | สูตร WIP\nสรุป: ระบบจะนำเข้าเฉพาะคอลัมน์ A,C,D,E,G,H",
    },
  ]);

  guideSheet.views = [{ state: "frozen", ySplit: 2 }];
  guideSheet.autoFilter = "A2:B2";
  guideSheet.getColumn("topic").alignment = { vertical: "top", wrapText: true };
  guideSheet.getColumn("detail").alignment = { vertical: "top", wrapText: true };
  guideSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber <= 2) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "E2E8F0" } },
        left: { style: "thin", color: { argb: "E2E8F0" } },
        bottom: { style: "thin", color: { argb: "E2E8F0" } },
        right: { style: "thin", color: { argb: "E2E8F0" } },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowNumber % 2 === 0 ? "FFFFFF" : LIGHT },
      };
    });
  });
  guideSheet.getCell("A3").font = { bold: true, color: { argb: GOLD } };

  const productRows = buildLookupRows(products || []);
  const materialRows = buildLookupRows(materials || []);
  const fgRows = productRows.filter((row) => FG_CODES.has(row.category));
  const wipRows = productRows.filter((row) => WIP_CODES.has(row.category));
  const rawRows = materialRows.filter((row) => RAW_CODES.has(row.category));
  const wipRawRows = [...wipRows, ...rawRows]
    .sort((a, b) => a.code.localeCompare(b.code))
    .filter((row, index, arr) => index === arr.findIndex((x) => x.code === row.code));
  const wipRawLookupByNameRows = [...wipRawRows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({
      queryName: row.name,
      code: row.code,
      name: row.name,
      unit: row.unit,
    }));

  const setupCatalogSheet = (catalogSheet, titleName, rows) => {
    catalogSheet.columns = [
      { header: "รหัส", key: "code", width: 18 },
      { header: titleName, key: "name", width: 42 },
      { header: "หน่วย", key: "unit", width: 14 },
    ];
    catalogSheet.addRows(rows.map((row) => ({ code: row.code, name: row.name, unit: row.unit })));
    styleCatalogSheet(catalogSheet, { NAVY, GOLD, LIGHT });
  };

  setupCatalogSheet(fgSheet, "ชื่อ FG", fgRows);
  setupCatalogSheet(wipSheet, "ชื่อ WIP", wipRows);
  setupCatalogSheet(rawSheet, "ชื่อ RAW", rawRows);
  setupCatalogSheet(lookupSheet, "ชื่อ WIP/RAW", wipRawRows);
  lookupSheet.state = "veryHidden";
  lookupByNameSheet.columns = [
    { header: "คำค้นชื่อ", key: "queryName", width: 42 },
    { header: "รหัส", key: "code", width: 18 },
    { header: "ชื่อ", key: "name", width: 42 },
    { header: "หน่วย", key: "unit", width: 14 },
    { header: "_rank", key: "rank", width: 10 },
  ];
  lookupByNameSheet.addRows(wipRawLookupByNameRows);
  for (let row = 2; row <= 4000; row += 1) {
    lookupByNameSheet.getCell(`E${row}`).value = {
      formula: `IF(ISNUMBER(SEARCH('BOM-Input'!$J$2,A${row})),COUNTIF($E$1:E${row - 1},">0")+1,"")`,
    };
  }
  styleCatalogSheet(lookupByNameSheet, { NAVY, GOLD, LIGHT });
  lookupByNameSheet.state = "veryHidden";

  return workbook.xlsx.writeBuffer();
}

export async function createMultiProductTemplate({
  products = [],
  materials = [],
  exampleRows = [],
} = {}) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.calcProperties.fullCalcOnLoad = true;

  const inputSheet = workbook.addWorksheet("BOM-Input");
  const guideSheet = workbook.addWorksheet("วิธีกรอก");
  const productSheet = workbook.addWorksheet("รายการสินค้า");
  const materialSheet = workbook.addWorksheet("รายการวัตถุดิบ");
  const NAVY = "102C57";
  const NAVY_DARK = "0B2141";
  const GOLD = "D4AF37";
  const INPUT_FILL = "FFF7DB";
  const AUTO_FILL = "F3F4F6";
  const BORDER = "D9E0E8";

  const productRows = buildLookupRows(products)
    .filter((row) => FG_CODES.has(row.category) || WIP_CODES.has(row.category))
    .map((row) => ({
      skuCode: row.code,
      name: row.name,
      itemType: WIP_CODES.has(row.category) ? "WIP" : "FG",
      unit: row.unit,
    }));

  const materialRows = materials
    .map((record) => {
      const skuCode = toSkuCode(record).toUpperCase();
      const goodsCode = String(record?.goodsCode || record?.goods_code || skuCode)
        .trim()
        .toUpperCase();
      const category = normalizeCategory(record?.category || record?.iccat_code);
      return {
        goodsCode,
        skuCode,
        name: toSkuName(record),
        itemType: WIP_CODES.has(category) ? "WIP" : RAW_CODES.has(category) ? "RAW" : "",
        unit: toSkuUnit(record),
      };
    })
    .filter((row) => row.goodsCode && row.skuCode && row.name && row.itemType)
    .filter((row, index, rows) => {
      const key = `${row.skuCode}::${row.goodsCode}`;
      return index === rows.findIndex((candidate) => (
        `${candidate.skuCode}::${candidate.goodsCode}` === key
      ));
    })
    .sort((left, right) => (
      left.goodsCode.localeCompare(right.goodsCode) ||
      left.skuCode.localeCompare(right.skuCode)
    ));

  if (productRows.length > 0) {
    workbook.definedNames.add(
      `'รายการสินค้า'!$A$2:$A$${productRows.length + 1}`,
      "ParentSkuList"
    );
  }
  if (materialRows.length > 0) {
    workbook.definedNames.add(
      `'รายการวัตถุดิบ'!$A$2:$A$${materialRows.length + 1}`,
      "MaterialGoodsList"
    );
  }

  inputSheet.columns = [
    { header: "รหัสสินค้าตัวแม่", key: "parentSkuCode", width: 20 },
    { header: "ชื่อสินค้าตัวแม่ (AUTO)", key: "parentName", width: 34 },
    { header: "ประเภทตัวแม่ (AUTO)", key: "parentType", width: 18 },
    { header: "โหมดปริมาณ WIP", key: "wipQtyInputMode", width: 18 },
    { header: "base_batch", key: "baseBatch", width: 14 },
    { header: "base_output_boxes", key: "baseOutputBoxes", width: 20 },
    { header: "รหัสวัตถุดิบที่ใช้จริง", key: "materialGoodsCode", width: 24 },
    { header: "SKU ภายใน (AUTO)", key: "materialSkuCode", width: 19 },
    { header: "ชื่อวัตถุดิบ/WIP (AUTO)", key: "materialName", width: 38 },
    { header: "ประเภทลูก (AUTO)", key: "materialType", width: 17 },
    { header: "จำนวน", key: "qty", width: 13 },
    { header: "หน่วย (AUTO)", key: "uomName", width: 16 },
    { header: "ฐานคำนวณ", key: "calculationBasis", width: 22 },
    { header: "ค่าฐาน", key: "calculationBase", width: 13 },
    { header: "วิธีปัดเศษ", key: "roundMode", width: 16 },
    { header: "วันเหลื่อมแผน", key: "planningOffsetDays", width: 16 },
    { header: "หมายเหตุ", key: "notes", width: 30 },
  ];

  const header = inputSheet.getRow(1);
  header.height = 32;
  header.font = { bold: true, color: { argb: GOLD }, size: 11 };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  inputSheet.views = [{ state: "frozen", ySplit: 1 }];
  inputSheet.autoFilter = "A1:Q1";

  exampleRows.slice(0, 499).forEach((example, index) => {
    const rowNumber = index + 2;
    inputSheet.getCell(`A${rowNumber}`).value = example.parentSkuCode || "";
    inputSheet.getCell(`D${rowNumber}`).value = WIP_MODE_THAI[String(example.wipQtyInputMode || "unit").toUpperCase()] || "หน่วย";
    inputSheet.getCell(`E${rowNumber}`).value = example.baseBatch ?? 1;
    inputSheet.getCell(`F${rowNumber}`).value = example.baseOutputBoxes ?? 1;
    inputSheet.getCell(`G${rowNumber}`).value = example.materialGoodsCode || "";
    inputSheet.getCell(`K${rowNumber}`).value = example.qty ?? "";
    inputSheet.getCell(`M${rowNumber}`).value =
      CALCULATION_BASIS_THAI[String(example.calculationBasis || "JOB_QTY").toUpperCase()] || "อิงจำนวนงาน";
    inputSheet.getCell(`N${rowNumber}`).value = example.calculationBase ?? 1;
    inputSheet.getCell(`O${rowNumber}`).value = ROUND_MODE_THAI[String(example.roundMode || "NONE").toUpperCase()] || "ไม่ปัด";
    inputSheet.getCell(`P${rowNumber}`).value =
      example.planningOffsetDays ?? 0;
    inputSheet.getCell(`Q${rowNumber}`).value = sanitizeExcelText(
      example.notes || ""
    );
  });

  for (let rowNumber = 2; rowNumber <= 500; rowNumber += 1) {
    const row = inputSheet.getRow(rowNumber);
    row.height = 23;
    inputSheet.getCell(`B${rowNumber}`).value = {
      formula: `IF($A${rowNumber}="","",IFERROR(VLOOKUP($A${rowNumber},'รายการสินค้า'!$A:$D,2,FALSE),""))`,
    };
    inputSheet.getCell(`C${rowNumber}`).value = {
      formula: `IF($A${rowNumber}="","",IFERROR(VLOOKUP($A${rowNumber},'รายการสินค้า'!$A:$D,3,FALSE),""))`,
    };
    inputSheet.getCell(`H${rowNumber}`).value = {
      formula: `IF($G${rowNumber}="","",IFERROR(VLOOKUP($G${rowNumber},'รายการวัตถุดิบ'!$A:$E,2,FALSE),""))`,
    };
    inputSheet.getCell(`I${rowNumber}`).value = {
      formula: `IF($G${rowNumber}="","",IFERROR(VLOOKUP($G${rowNumber},'รายการวัตถุดิบ'!$A:$E,3,FALSE),""))`,
    };
    inputSheet.getCell(`J${rowNumber}`).value = {
      formula: `IF($G${rowNumber}="","",IFERROR(VLOOKUP($G${rowNumber},'รายการวัตถุดิบ'!$A:$E,4,FALSE),""))`,
    };
    inputSheet.getCell(`L${rowNumber}`).value = {
      formula: `IF($G${rowNumber}="","",IFERROR(VLOOKUP($G${rowNumber},'รายการวัตถุดิบ'!$A:$E,5,FALSE),""))`,
    };

    inputSheet.getCell(`D${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"หน่วย,แบทช์"'],
    };
    if (productRows.length > 0) {
      inputSheet.getCell(`A${rowNumber}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ["ParentSkuList"],
      };
    }
    if (materialRows.length > 0) {
      inputSheet.getCell(`G${rowNumber}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ["MaterialGoodsList"],
      };
    }
    inputSheet.getCell(`M${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"อิงจำนวนงาน,อิงจำนวนคน,อิงจำนวนเครื่อง,อิงจำนวนชุดแป้ง"'],
    };
    inputSheet.getCell(`O${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"ไม่ปัด,ปัดขึ้น,ปัดลง,ปัดปกติ"'],
    };
    inputSheet.getCell(`P${rowNumber}`).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [-30, 30],
      showErrorMessage: true,
      errorTitle: "วันเหลื่อมไม่ถูกต้อง",
      error: "กรอกจำนวนเต็มตั้งแต่ -30 ถึง 30",
    };

    ["A", "D", "E", "F", "G", "K", "M", "N", "O", "P", "Q"].forEach((column) => {
      const cell = inputSheet.getCell(`${column}${rowNumber}`);
      cell.protection = { locked: false };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
    });
    ["B", "C", "H", "I", "J", "L"].forEach((column) => {
      inputSheet.getCell(`${column}${rowNumber}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: AUTO_FILL },
      };
    });
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: BORDER } },
        left: { style: "thin", color: { argb: BORDER } },
        bottom: { style: "thin", color: { argb: BORDER } },
        right: { style: "thin", color: { argb: BORDER } },
      };
      cell.alignment = { vertical: "middle", wrapText: false };
    });
  }

  await inputSheet.protect("kpf-bom", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: true,
    deleteColumns: false,
    deleteRows: true,
    sort: false,
    autoFilter: true,
    pivotTables: false,
  });

  guideSheet.columns = [
    { header: "หัวข้อ", key: "topic", width: 28 },
    { header: "รายละเอียด", key: "detail", width: 100 },
  ];
  guideSheet.mergeCells("A1:B1");
  guideSheet.getCell("A1").value = "คู่มือเทมเพลต BOM ไลน์การผลิต";
  guideSheet.getCell("A1").font = { bold: true, size: 16, color: { argb: GOLD } };
  guideSheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  guideSheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY_DARK },
  };
  guideSheet.getRow(2).values = ["หัวข้อ", "รายละเอียด"];
  guideSheet.addRows([
    ["ขอบเขต", "ไฟล์เดียวรองรับหลายสินค้า รวมทั้ง BOM ของ FG และ BOM ของ WIP โดยใช้สูตรหลัก DEFAULT เท่านั้น"],
    ["ตัวอย่างในไฟล์", "ชีต BOM-Input ใส่ BOM จริงของ BL0-5001 และ WIP ย่อยทุกระดับเป็นตัวอย่าง โดยระบุ Level ไว้ในหมายเหตุ"],
    ["หนึ่งแถว", "หนึ่งแถวคือวัตถุดิบหรือ WIP หนึ่งรายการของสินค้าตัวแม่ในคอลัมน์ A"],
    ["รหัสที่ใช้จริง", "คอลัมน์ G ใช้รหัสการค้า หากไม่มีรหัสการค้าให้ใช้ SKU"],
    ["WIP", "กรอกสินค้าตัวแม่เป็น WIP ในแถวใหม่เพื่อระบุวัตถุดิบของ WIP นั้น"],
    ["ฐานคำนวณ", "JOB_QTY ใช้ตามจำนวนงาน ส่วน HEADCOUNT, MACHINE_COUNT และ DOUGH_SET_COUNT ต้องกรอกค่าฐานและวิธีปัดเศษ"],
    ["วันเหลื่อมแผน", "ใช้กับรายการลูกประเภท WIP เท่านั้น กรอกจำนวนเต็มตั้งแต่ -30 ถึง 30"],
    ["ไฟล์เก่า", "ระบบยังอ่านหัวคอลัมน์รุ่นเก่าได้ แต่ควรใช้เทมเพลตนี้เพื่อเก็บรหัสการค้าและเงื่อนไขการคำนวณครบ"],
  ]);
  guideSheet.getRow(2).font = { bold: true, color: { argb: GOLD } };
  guideSheet.getRow(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  guideSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });

  productSheet.columns = [
    { header: "รหัสสินค้า", key: "skuCode", width: 20 },
    { header: "ชื่อสินค้า", key: "name", width: 42 },
    { header: "ประเภท", key: "itemType", width: 14 },
    { header: "หน่วย", key: "unit", width: 16 },
  ];
  productSheet.addRows(productRows.map((row) => ({
    skuCode: sanitizeExcelText(row.skuCode),
    name: sanitizeExcelText(row.name),
    itemType: row.itemType,
    unit: sanitizeExcelText(row.unit),
  })));

  materialSheet.columns = [
    { header: "รหัสที่ใช้จริง", key: "goodsCode", width: 22 },
    { header: "SKU ภายใน", key: "skuCode", width: 20 },
    { header: "ชื่อวัตถุดิบ/WIP", key: "name", width: 42 },
    { header: "ประเภท", key: "itemType", width: 14 },
    { header: "หน่วย", key: "unit", width: 18 },
  ];
  materialSheet.addRows(materialRows.map((row) => ({
    goodsCode: sanitizeExcelText(row.goodsCode),
    skuCode: sanitizeExcelText(row.skuCode),
    name: sanitizeExcelText(row.name),
    itemType: row.itemType,
    unit: sanitizeExcelText(row.unit),
  })));

  [productSheet, materialSheet].forEach((sheet) => {
    const lastColumn = sheet === productSheet ? "D" : "E";
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = `A1:${lastColumn}1`;
    sheet.getRow(1).height = 26;
    sheet.getRow(1).font = { bold: true, color: { argb: GOLD } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: NAVY },
    };
  });

  return workbook.xlsx.writeBuffer();
}

export async function exportLegacySingleProductWorkbook({
  productCode,
  productName,
  baseBatch,
  baseOutputBoxes,
  items = [],
}) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet(productCode || "BOM");
  const materialLookupSheet = workbook.addWorksheet("lookup_materials");

  sheet.columns = [
    { header: "รหัสสินค้า", key: "productCode", width: 18 },
    { header: "ชื่อสินค้า (AUTO)", key: "productNameAuto", width: 30 },
    { header: "base_batch", key: "baseBatch", width: 16 },
    { header: "base_output_boxes", key: "baseOutputBoxes", width: 20 },
    { header: "รหัสวัตถุดิบ", key: "code", width: 16 },
    { header: "ชื่อวัตถุดิบ/WIP (AUTO)", key: "materialNameAuto", width: 34 },
    { header: "จำนวน", key: "qty", width: 12 },
    { header: "หมายเหตุ", key: "note", width: 30 },
  ];

  const rows = items.map((item) => ({
    productCode,
    productNameAuto: "",
    baseBatch: baseBatch ?? item.baseBatch ?? "",
    baseOutputBoxes: baseOutputBoxes ?? item.baseOutputBoxes ?? "",
    code: item.materialCode || item.material_sku_code,
    materialNameAuto: "",
    qty: item.qty,
    note: item.note || item.notes || "",
  }));

  sheet.addRows(rows);
  sheet.autoFilter = "A1:H1";
  sheet.getRow(1).font = { bold: true };

  const materialRows = buildLookupRows(
    items.map((item) => ({
      code: item.materialCode || item.material_sku_code,
      name: item.materialName || item.material_name || "",
      unit: item.unit || item.uom_name || "",
    }))
  );
  materialLookupSheet.columns = [
    { header: "code", key: "code", width: 18 },
    { header: "name", key: "name", width: 36 },
  ];
  materialLookupSheet.addRows(materialRows.map((row) => ({ code: row.code, name: row.name })));
  materialLookupSheet.state = "veryHidden";

  const maxEditableRows = Math.max(rows.length + 20, 200);
  for (let row = 2; row <= maxEditableRows; row += 1) {
    sheet.getCell(`B${row}`).value = {
      formula: `IF($A${row}="","",${JSON.stringify(String(productName || ""))})`,
    };
    sheet.getCell(`F${row}`).value = {
      formula: `IF($E${row}="","",IFERROR(XLOOKUP($E${row},'lookup_materials'!$A:$A,'lookup_materials'!$B:$B,""),""))`,
    };
    sheet.getCell(`A${row}`).protection = { locked: false };
    sheet.getCell(`C${row}`).protection = { locked: false };
    sheet.getCell(`D${row}`).protection = { locked: false };
    sheet.getCell(`E${row}`).protection = { locked: false };
    sheet.getCell(`G${row}`).protection = { locked: false };
    sheet.getCell(`H${row}`).protection = { locked: false };
  }
  await sheet.protect("kpf-bom", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: true,
    pivotTables: false,
  });

  return workbook.xlsx.writeBuffer();
}

export async function exportSingleProductWorkbook({
  productCode,
  productName,
  wipQtyInputMode = "unit",
  baseBatch,
  baseOutputBoxes,
  items = [],
}) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOM-Input");
  const NAVY = "102C57";
  const GOLD = "D4AF37";

  sheet.columns = [
    { header: "รหัสสินค้าตัวแม่", key: "parentSkuCode", width: 20 },
    { header: "ชื่อสินค้าตัวแม่ (AUTO)", key: "parentName", width: 34 },
    { header: "ประเภทตัวแม่ (AUTO)", key: "parentType", width: 18 },
    { header: "โหมดปริมาณ WIP", key: "wipQtyInputMode", width: 18 },
    { header: "base_batch", key: "baseBatch", width: 14 },
    { header: "base_output_boxes", key: "baseOutputBoxes", width: 20 },
    { header: "รหัสวัตถุดิบที่ใช้จริง", key: "materialGoodsCode", width: 24 },
    { header: "SKU ภายใน (AUTO)", key: "materialSkuCode", width: 19 },
    { header: "ชื่อวัตถุดิบ/WIP (AUTO)", key: "materialName", width: 38 },
    { header: "ประเภทลูก (AUTO)", key: "materialType", width: 17 },
    { header: "จำนวน", key: "qty", width: 13 },
    { header: "หน่วย (AUTO)", key: "uomName", width: 16 },
    { header: "ฐานคำนวณ", key: "calculationBasis", width: 22 },
    { header: "ค่าฐาน", key: "calculationBase", width: 13 },
    { header: "วิธีปัดเศษ", key: "roundMode", width: 16 },
    { header: "วันเหลื่อมแผน", key: "planningOffsetDays", width: 16 },
    { header: "หมายเหตุ", key: "notes", width: 30 },
  ];

  sheet.addRows(items.map((item) => {
    const calculationBasis = String(
      item.calculationBasis || item.calculation_basis || "JOB_QTY"
    ).toUpperCase();
    const calculationBase = calculationBasis === "HEADCOUNT"
      ? item.headcountBase ?? item.headcount_base ?? 1
      : calculationBasis === "MACHINE_COUNT"
        ? item.machineBase ?? item.machine_base ?? 1
        : calculationBasis === "DOUGH_SET_COUNT"
          ? item.doughSetBase ?? item.dough_set_base ?? 1
          : 1;
    const roundMode = calculationBasis === "HEADCOUNT"
      ? item.headcountRoundMode ?? item.headcount_round_mode ?? "NONE"
      : calculationBasis === "MACHINE_COUNT"
        ? item.machineRoundMode ?? item.machine_round_mode ?? "NONE"
        : calculationBasis === "DOUGH_SET_COUNT"
          ? item.doughSetRoundMode ?? item.dough_set_round_mode ?? "NONE"
          : "NONE";
    return {
      parentSkuCode: productCode,
      parentName: sanitizeExcelText(productName),
      parentType: "",
      wipQtyInputMode: WIP_MODE_THAI[String(wipQtyInputMode || "unit").toUpperCase()] || wipQtyInputMode,
      baseBatch,
      baseOutputBoxes,
      materialGoodsCode:
        item.materialGoodsCode ||
        item.material_goods_code ||
        item.materialCode ||
        item.material_sku_code,
      materialSkuCode: item.materialCode || item.material_sku_code,
      materialName: sanitizeExcelText(item.materialName || item.material_name || ""),
      materialType: item.itemType || "",
      qty: item.qty,
      uomName: item.unit || item.uom_name || "",
      calculationBasis: CALCULATION_BASIS_THAI[calculationBasis] || calculationBasis,
      calculationBase,
      roundMode: ROUND_MODE_THAI[String(roundMode).toUpperCase()] || roundMode,
      planningOffsetDays:
        item.planningOffsetDays ?? item.planning_offset_days ?? 0,
      notes: sanitizeExcelText(item.note || item.notes || ""),
    };
  }));

  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { bold: true, color: { argb: GOLD } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:Q1";

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    ["A", "D", "E", "F", "G", "K", "M", "N", "O", "P", "Q"].forEach((column) => {
      sheet.getCell(`${column}${rowNumber}`).protection = { locked: false };
    });
  });
  await sheet.protect("kpf-bom", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: true,
    deleteColumns: false,
    deleteRows: true,
    sort: false,
    autoFilter: true,
    pivotTables: false,
  });

  return workbook.xlsx.writeBuffer();
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function readCellValue(cell) {
  const value = cell?.value;
  if (value && typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }
    if (Object.hasOwn(value, "result")) {
      return value.result ?? "";
    }
    if (Object.hasOwn(value, "text")) {
      return value.text ?? "";
    }
  }
  return value ?? "";
}

function createHeaderReader(sheet) {
  const headerMap = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = normalizeHeader(readCellValue(cell));
    if (header) headerMap.set(header, columnNumber);
  });

  return (row, field) => {
    const aliases = BOM_IMPORT_HEADER_ALIASES[field] || [];
    const columnNumber = aliases
      .map((alias) => headerMap.get(normalizeHeader(alias)))
      .find(Boolean);
    return columnNumber ? readCellValue(row.getCell(columnNumber)) : "";
  };
}

export async function parseMultiProductWorkbookBuffer(buffer) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("BOM-Input") || workbook.worksheets[0];
  if (!sheet) {
    throw new Error("ไม่พบชีต BOM-Input");
  }

  const get = createHeaderReader(sheet);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const raw = {
      rowNumber,
      parentSkuCode: get(row, "parentSkuCode"),
      wipQtyInputMode: get(row, "wipQtyInputMode"),
      baseBatch: get(row, "baseBatch"),
      baseOutputBoxes: get(row, "baseOutputBoxes"),
      materialGoodsCode: get(row, "materialGoodsCode"),
      materialSkuCode: get(row, "materialSkuCode"),
      qty: get(row, "qty"),
      calculationBasis: get(row, "calculationBasis"),
      calculationBase: get(row, "calculationBase"),
      roundMode: get(row, "roundMode"),
      planningOffsetDays: get(row, "planningOffsetDays"),
      notes: get(row, "notes"),
    };
    const isEmptyRow = Object.entries(raw).every(([key, value]) => {
      if (key === "rowNumber") return true;
      return value === null || value === undefined || String(value).trim() === "";
    });
    if (isEmptyRow) return;

    rows.push(normalizeBomImportRow(raw));
  });

  return rows;
}

// Parse Excel file into plain rows (validation is done at caller level)
export async function parseMultiProductWorkbook(file) {
  return {
    rows: await parseMultiProductWorkbookBuffer(await file.arrayBuffer()),
  };
}
