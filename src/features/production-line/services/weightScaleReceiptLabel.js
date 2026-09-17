const LABEL_WIDTH_MM = 80;
const LABEL_HEIGHT_MM = 50;
const LABEL_SYMBOLOGY = "CODE128";

function parseFiniteNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUnitLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.toLowerCase() === "kg") {
    return "กก.";
  }
  return normalized;
}

export function buildWeightScaleReceiptPrintLabel({
  receipt,
  selectedProduct,
  unitLabel,
}) {
  const barcode = String(receipt?.barcode || "").trim();
  if (!barcode) {
    return null;
  }

  return {
    barcodeValue: barcode,
    barcodeText: barcode,
    productName:
      String(receipt?.productName || selectedProduct?.name || "").trim() || "-",
    productCode:
      String(receipt?.productCode || selectedProduct?.code || "").trim() || "-",
    lotNo: String(receipt?.lotNo || "").trim() || "-",
    tareWeightKg: parseFiniteNumber(receipt?.tareWeightKg, 0),
    netWeightKg: parseFiniteNumber(receipt?.netWeightKg, 0),
    weighedAt: receipt?.weighedAt || new Date().toISOString(),
    unitLabel: normalizeUnitLabel(unitLabel),
    printer: {
      labelWidthMm: LABEL_WIDTH_MM,
      labelHeightMm: LABEL_HEIGHT_MM,
      symbology: LABEL_SYMBOLOGY,
    },
  };
}
