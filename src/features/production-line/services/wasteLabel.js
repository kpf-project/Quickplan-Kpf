const LABEL_WIDTH_MM = 80;
const LABEL_HEIGHT_MM = 50;

export function buildWastePrintLabel(row = {}) {
  const isWeight = row.waste_type === "filling_scrap" || row.wasteType === "filling_scrap";
  const barcodeValue = String(row.waste_barcode || row.wasteBarcode || "").trim();
  if (!barcodeValue) throw new Error("ไม่พบรหัสบาร์โค้ดของเสีย");

  return {
    title: "ของเสีย",
    barcodeValue,
    barcodeText: barcodeValue,
    productCode: String(row.product_code || row.productCode || "-").trim() || "-",
    productName: String(row.product_name_snapshot || row.productName || "-").trim() || "-",
    wasteTypeLabel: isWeight ? "เศษหัก" : "ปี๊บเสีย",
    quantityText: isWeight
      ? `NET ${Number(row.net_weight_kg ?? row.netWeightKg ?? 0).toFixed(3)} กก.`
      : `QTY ${Number(row.rejected_can_qty ?? row.rejectedCanQty ?? 0).toLocaleString("th-TH")} ปี๊บ`,
    recordedAt: row.created_at || row.createdAt || new Date().toISOString(),
    printer: {
      labelWidthMm: LABEL_WIDTH_MM,
      labelHeightMm: LABEL_HEIGHT_MM,
      symbology: "CODE128",
    },
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
  };
}
