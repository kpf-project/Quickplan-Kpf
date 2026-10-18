const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function getBangkokParts(date, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BANGKOK_TIME_ZONE,
      ...options,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function getBangkokWorkDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("วันที่ไม่ถูกต้อง");
  const parts = getBangkokParts(date, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validatePieceRateWorkDate(value, now = new Date()) {
  const normalized = String(value || "").trim();
  const match = DATE_PATTERN.exec(normalized);
  if (!match) throw new RangeError("วันที่ทำงานไม่ถูกต้อง");

  const [, year, month, day] = match;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)
  ) {
    throw new RangeError("วันที่ทำงานไม่ถูกต้อง");
  }
  if (normalized > getBangkokWorkDate(now)) {
    throw new RangeError("ไม่สามารถเลือกวันที่ในอนาคตได้");
  }
  return normalized;
}

export function resolvePieceRateWorkTimestamp({ workDate, capturedAt = new Date(), now = new Date() }) {
  const normalizedWorkDate = validatePieceRateWorkDate(workDate, now);
  const captured = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) throw new RangeError("เวลาบันทึกไม่ถูกต้อง");

  const time = getBangkokParts(captured, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const milliseconds = String(captured.getUTCMilliseconds()).padStart(3, "0");
  return new Date(
    `${normalizedWorkDate}T${time.hour}:${time.minute}:${time.second}.${milliseconds}+07:00`
  ).toISOString();
}

export function alignPieceRateMetadataToWorkDate(metadata, workTimestamp) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const scaleAudit = source.scaleAudit;
  if (!scaleAudit || typeof scaleAudit !== "object") return source;

  return {
    ...source,
    scaleAudit: {
      ...scaleAudit,
      physicalCapturedAt: scaleAudit.physicalCapturedAt || scaleAudit.capturedAt || null,
      capturedAt: workTimestamp,
    },
  };
}
