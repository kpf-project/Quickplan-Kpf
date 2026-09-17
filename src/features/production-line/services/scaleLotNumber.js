function toBangkokDate(timestamp = new Date()) {
  const sourceDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return new Date(sourceDate.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}

export function getScaleShiftNumber(timestamp = new Date()) {
  const bangkokDate = toBangkokDate(timestamp);
  const minutes = bangkokDate.getHours() * 60 + bangkokDate.getMinutes();
  return minutes >= 7 * 60 && minutes <= 19 * 60 ? 1 : 2;
}

export function buildScaleProductionDateCode(timestamp = new Date()) {
  const bangkokDate = toBangkokDate(timestamp);
  const shift = getScaleShiftNumber(timestamp);

  if (shift === 2 && bangkokDate.getHours() < 7) {
    bangkokDate.setDate(bangkokDate.getDate() - 1);
  }

  return [
    padTwo(bangkokDate.getDate()),
    padTwo(bangkokDate.getMonth() + 1),
    padTwo(bangkokDate.getFullYear() % 100),
  ].join("");
}

export function getScaleProductLotDigits(productCode) {
  const matchedDigits = String(productCode || "").match(/(\d+)(?!.*\d)/);
  if (!matchedDigits) {
    return "";
  }

  return matchedDigits[1].padStart(4, "0");
}

export function buildAutoScaleLotNo(productCode, timestamp = new Date()) {
  const productDigits = getScaleProductLotDigits(productCode);
  if (!productDigits) {
    return "";
  }

  return `${buildScaleProductionDateCode(timestamp)}${productDigits}-${getScaleShiftNumber(timestamp)}`;
}

export function resolveAutoScaleLot({
  productCode,
  currentLotNo,
  timestamp = new Date(),
} = {}) {
  const expectedLotNo = buildAutoScaleLotNo(productCode, timestamp);
  const normalizedCurrentLotNo = String(currentLotNo || "").trim();
  const productDigits = getScaleProductLotDigits(productCode);
  const generatedLotPattern = productDigits
    ? new RegExp(`^\\d{6}${productDigits}-[12]$`)
    : null;

  return {
    expectedLotNo,
    currentLotNo: normalizedCurrentLotNo,
    shouldRotate: Boolean(
      expectedLotNo
      && normalizedCurrentLotNo
      && generatedLotPattern?.test(normalizedCurrentLotNo)
      && normalizedCurrentLotNo !== expectedLotNo
    ),
  };
}
