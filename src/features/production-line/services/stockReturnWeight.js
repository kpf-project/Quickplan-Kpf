function normalizeWeight(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

export function calculateStockReturnWeights({
  grossWeightKg,
  tareWeightKg,
} = {}) {
  const gross = normalizeWeight(grossWeightKg);
  const tare = normalizeWeight(tareWeightKg);
  const net = Number((gross - tare).toFixed(3));

  let error = "";
  if (gross <= 0) {
    error = "น้ำหนักรวมต้องมากกว่า 0";
  } else if (tare < 0) {
    error = "น้ำหนักภาชนะต้องไม่ติดลบ";
  } else if (tare >= gross) {
    error = "น้ำหนักภาชนะต้องน้อยกว่าน้ำหนักรวม";
  }

  return {
    grossWeightKg: gross,
    tareWeightKg: tare,
    netWeightKg: net,
    isValid: !error,
    error,
  };
}
