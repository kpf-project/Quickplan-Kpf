const LOT_PATTERN = /^\d{6}$/;

function wholeNumber(value, label, { allowZero = true } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || (!allowZero && number === 0)) {
    throw new Error(`${label} ต้องเป็นจำนวนเต็ม${allowZero ? "ตั้งแต่ 0" : "มากกว่า 0"}`);
  }
  return number;
}

export function lotFromWorkDate(workDate) {
  const match = String(workDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("วันที่ผลิตไม่ถูกต้อง");
  return `${match[3]}${match[2]}${match[1].slice(-2)}`;
}

export function calculatePackingOutput({ cartons, packsPerCarton, sachetsPerPack }) {
  const safeCartons = wholeNumber(cartons, "จำนวนลัง");
  const safePacksPerCarton = wholeNumber(packsPerCarton, "จำนวนแพ็คต่อลัง", { allowZero: false });
  const safeSachetsPerPack = wholeNumber(sachetsPerPack, "จำนวนซองต่อแพ็ค", { allowZero: false });
  const packs = safeCartons * safePacksPerCarton;
  return {
    cartons: safeCartons,
    packs,
    sachets: packs * safeSachetsPerPack,
  };
}

export function normalizeCarryoverLots(rows = []) {
  const byLot = new Map();
  rows.forEach((row) => {
    const lotNo = String(row?.lotNo || row?.lot_no || "").trim();
    const packs = wholeNumber(row?.packs ?? 0, "ยอดยกมา (แพ็ค)");
    const sachets = wholeNumber(row?.sachets ?? 0, "ยอดยกมา (ซอง)");
    if (!lotNo && packs === 0 && sachets === 0) return;
    if (!LOT_PATTERN.test(lotNo)) throw new Error("LOT ยกมาต้องเป็นรูปแบบ DDMMYY จำนวน 6 หลัก");
    if (packs === 0 && sachets === 0) throw new Error(`LOT ${lotNo} ต้องมีจำนวนแพ็คหรือซอง`);
    const current = byLot.get(lotNo) || { lotNo, packs: 0, sachets: 0 };
    current.packs += packs;
    current.sachets += sachets;
    byLot.set(lotNo, current);
  });
  return Array.from(byLot.values());
}

export function normalizePackingOutput(input = {}) {
  const workDate = String(input.workDate || input.work_date || "").trim();
  const productCode = String(input.productCode || input.product_code || "").trim().toUpperCase();
  const productName = String(input.productName || input.product_name || "").trim();
  if (!productCode || !productName) throw new Error("กรุณาเลือกสินค้า");

  const totals = calculatePackingOutput(input);
  const closingPacks = wholeNumber(input.closingPacks ?? input.closing_packs ?? 0, "ค้างปลายวัน (แพ็ค)");
  const closingSachets = wholeNumber(input.closingSachets ?? input.closing_sachets ?? 0, "ค้างปลายวัน (ซอง)");
  const carryovers = normalizeCarryoverLots(input.carryovers);

  return {
    requestId: String(input.requestId || input.request_id || "").trim(),
    workDate,
    lotNo: lotFromWorkDate(workDate),
    productCode,
    productName,
    productImageUrl: String(input.productImageUrl || input.product_image_url || "").trim() || null,
    categoryCode: String(input.categoryCode || input.category_code || "04").trim() || "04",
    packsPerCarton: wholeNumber(input.packsPerCarton, "จำนวนแพ็คต่อลัง", { allowZero: false }),
    sachetsPerPack: wholeNumber(input.sachetsPerPack, "จำนวนซองต่อแพ็ค", { allowZero: false }),
    ...totals,
    closingPacks,
    closingSachets,
    carryovers,
  };
}
