import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const { createCentralCaptureIssuer } = createRequire(import.meta.url)("../local-scale-agent/central-capture.js");
const settings = { signingKeyHex: "ab".repeat(32), maxKg: 60, resolutionKg: 0.001, readingMode: "gross" };
const point = "00000000-0000-4000-8000-000000000001";
const cycle = "00000000-0000-4000-8000-000000000002";
const start = Date.parse("2026-10-11T12:00:00+07:00");
const reading = (weightKg, ms, extra = {}) => ({ weightKg, at: new Date(start + ms).toISOString(), stable: null, raw: "GS 19.020 kg", cycleId: cycle, workstation: { id: point }, ...extra });
function steady(issuer, extra = {}) { let token; for (let i = 0; i < 5; i++) token = issuer(reading(19.02, 100 + i * 400, extra)); return token; }
test("agent is disabled without explicitly provisioned gross-reading equipment profile", () => {
  assert.equal(steady(createCentralCaptureIssuer()), null);
  assert.equal(steady(createCentralCaptureIssuer({ ...settings, readingMode: "net" })), null);
});
test("startup with an existing load cannot mint a new receipt cycle", () => {
  const issuer = createCentralCaptureIssuer(settings);
  assert.equal(steady(issuer), null);
  issuer(reading(0, 0, { cycleId: null }));
  const token = steady(issuer);
  assert.ok(token);
  const [body, signature] = token.split(".");
  assert.equal(signature, createHmac("sha256", Buffer.from(settings.signingKeyHex, "hex")).update(body).digest("hex"));
  assert.equal(JSON.parse(Buffer.from(body, "base64url").toString()).grossKg, "19.020");
});
test("net frames, unstable readings and overload never produce signed gross evidence", () => {
  for (const extra of [{ raw: "ST,NT,19.020 kg" }, { raw: "19.020 N" }, { stable: false }, { weightKg: 61 }]) {
    const issuer = createCentralCaptureIssuer(settings);
    issuer(reading(0, 0));
    assert.equal(steady(issuer, extra), null);
  }
});
