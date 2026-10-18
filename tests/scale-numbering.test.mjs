import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("src/lib/scale/numbering.js", "utf8").replace(/export function /g, "function ");
const api = vm.createContext({});
vm.runInContext(source, api);

test("business day and shift use Bangkok, including midnight and 07:00 rollover", () => {
  for (const [timestamp, code, shift] of [
    ["2026-10-10T06:59:59+07:00", "091026", 2],
    ["2026-10-10T07:00:00+07:00", "101026", 1],
    ["2026-10-10T19:00:59+07:00", "101026", 1],
    ["2026-10-10T19:01:00+07:00", "101026", 2],
    ["2026-10-11T00:00:00+07:00", "101026", 2],
    ["2027-01-01T06:00:00+07:00", "311226", 2],
    ["2024-03-01T06:00:00+07:00", "290224", 2],
  ]) {
    const result = api.getScaleNumberingContext(timestamp);
    assert.equal(result.dateCode, code);
    assert.equal(result.shift, shift);
  }
});

test("barcode and LOT have different identities and share the production date", () => {
  const timestamp = "2026-10-10T12:00:00+07:00";
  assert.equal(api.formatScaleBarcode({ timestamp, productDigits: "0002", runNumber: 1 }), "10102600020001");
  assert.equal(api.formatScaleBarcode({ timestamp, productDigits: "0002", runNumber: 9999 }), "10102600029999");
  assert.equal(api.formatScaleLot({ timestamp, productDigits: "0002" }), "1010260002-1");
  const identifiers = Array.from({ length: 9999 }, (_, index) => api.formatScaleBarcode({ timestamp, productDigits: "0002", runNumber: index + 1 }));
  assert.equal(new Set(identifiers).size, 9999);
  assert.ok(identifiers.every(value => /^\d{14}$/.test(value)));
});

test("invalid dates, ambiguous timezone, product codes and overflow fail closed", () => {
  for (const timestamp of ["not-a-date", "2026-10-10T10:00:00", "2026-02-30T10:00:00Z", "2100-01-01T12:00:00Z"]) {
    assert.throws(() => api.getScaleNumberingContext(timestamp));
  }
  for (const productDigits of ["2", "00002", "WKB-0002", "00A2", "0000", null]) {
    assert.throws(() => api.formatScaleLot({ timestamp: "2026-10-10T12:00:00Z", productDigits }));
  }
  for (const runNumber of [0, -1, 10000, 1.5, "1", NaN]) {
    assert.throws(() => api.formatScaleBarcode({ timestamp: "2026-10-10T12:00:00Z", productDigits: "0002", runNumber }));
  }
});

test("new contract does not replace production allocation before database verification", () => {
  assert.doesNotMatch(readFileSync("src/lib/scale/receipts.js", "utf8"), /from "@\/lib\/scale\/numbering"/);
});
