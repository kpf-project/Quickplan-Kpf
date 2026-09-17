const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const bangkokDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BANGKOK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("th-TH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "-";
}

function getBangkokDateTimeParts(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid recorded time for the piece-rate LOT.");
  }

  return Object.fromEntries(
    bangkokDateTimeFormatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, Number(partValue)])
  );
}

function getLotProductDigits(productCode) {
  const normalizedCode = String(productCode || "").trim();
  const lastSegment = normalizedCode.split("-").at(-1) || normalizedCode;
  const segmentDigits = lastSegment.replace(/\D/g, "");
  const fallbackDigits = normalizedCode.match(/\d+/g)?.at(-1) || "0";
  return (segmentDigits || fallbackDigits).padStart(4, "0");
}

export function buildPieceRateLotNo({ productCode, recordedAt } = {}) {
  let { year, month, day, hour, minute } = getBangkokDateTimeParts(recordedAt);
  const isNightShift = hour < 7 || hour > 19 || (hour === 19 && minute >= 1);

  if (isNightShift && hour < 7) {
    const previousDate = new Date(Date.UTC(year, month - 1, day - 1));
    year = previousDate.getUTCFullYear();
    month = previousDate.getUTCMonth() + 1;
    day = previousDate.getUTCDate();
  }

  const productionDate = [
    String(day).padStart(2, "0"),
    String(month).padStart(2, "0"),
    String(year).slice(-2),
  ].join("");

  return `${productionDate}${getLotProductDigits(productCode)}-${isNightShift ? 2 : 1}`;
}

export function buildPieceRateDesktopLabel(payload = {}) {
  const documentNo = String(payload.docNo || "").trim();
  if (!documentNo) {
    throw new Error("Document number is required for the piece-rate barcode.");
  }

  const recordedAt = payload.recordedAt || new Date().toISOString();
  const productCode = String(payload.productCode || "-").trim() || "-";
  const lotNo = String(payload.lotNo || "").trim()
    || buildPieceRateLotNo({ productCode, recordedAt });

  return {
    widthMm: 80,
    heightMm: 50,
    title: "ป้ายแยม",
    documentNo,
    barcode: {
      type: "CODE128",
      value: documentNo,
    },
    productCode,
    productName: String(payload.productName || "-").trim() || "-",
    lotNo,
    employeeCode: String(payload.employeeCode || "-").trim() || "-",
    employeeName: String(payload.employeeName || "-").trim() || "-",
    weightText: `${formatNumber(payload.weightKg, 3)} kg`,
    recordedAt,
  };
}
