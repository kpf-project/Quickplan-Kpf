"use client";

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportProductsToExcel(rows = []) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule?.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("สินค้า");

  worksheet.columns = [
    { header: "รหัสสินค้า", key: "skuCode", width: 20 },
    { header: "ชื่อสินค้า", key: "skuName", width: 36 },
    { header: "ประเภทสินค้า", key: "iccatName", width: 24 },
    { header: "หน่วยหลัก", key: "mainUnit", width: 16 },
    { header: "หน่วยย่อย", key: "subUnit", width: 16 },
    { header: "แบรนด์", key: "brandName", width: 20 },
    { header: "รหัสหมวด", key: "departmentCode", width: 16 },
    { header: "ชื่อหมวด", key: "departmentName", width: 28 },
    { header: "คลัง", key: "warehouseName", width: 24 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  rows.forEach((row) => {
    worksheet.addRow({
      skuCode: row?.SKU_CODE || "-",
      skuName: row?.SKU_NAME || "-",
      iccatName: row?.ICCAT_NAME || "-",
      mainUnit: row?.UTQ_NAME || "-",
      subUnit: row?.UTQ_NAME_1 || "-",
      brandName: row?.BRN_NAME || "-",
      departmentCode: row?.ICDEPT_CODE || "-",
      departmentName: row?.ICDEPT_THAIDESC || "-",
      warehouseName: row?.WL_NAME || "-",
    });
  });

  worksheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 1) {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    }
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `products_${formatTimestamp()}.xlsx`;
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}
