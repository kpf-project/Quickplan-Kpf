import { createHash, timingSafeEqual } from "node:crypto";

export function verifyInboundExcelToken(token, expectedHash, reportType, format) {
  if (reportType !== "inbound" || format !== "csv" || !token || token.length < 32 || token.length > 256 || !/^[a-f0-9]{64}$/i.test(expectedHash || "")) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}
