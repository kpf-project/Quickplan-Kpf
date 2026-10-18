const { createHmac } = require("node:crypto");

function createCentralCaptureIssuer({ signingKeyHex, maxKg, resolutionKg, readingMode } = {}) {
  const maximum = Number(maxKg);
  const resolution = Number(resolutionKg);
  const enabled = /^[0-9a-f]{64}$/i.test(signingKeyHex || "") && readingMode === "gross"
    && Number.isFinite(maximum) && maximum > 0 && maximum <= 1000000
    && Number.isFinite(resolution) && resolution >= 0.001 && resolution <= maximum
    && resolution * 1000 === Math.round(resolution * 1000);
  let observedEmpty = false;
  let samples = [];
  return reading => {
    if (!enabled) return null;
    const weight = reading?.weightKg;
    const at = Date.parse(reading?.at);
    if (!Number.isFinite(weight) || !Number.isFinite(at)) { samples = []; return null; }
    if (Math.abs(weight) <= 0.05) { observedEmpty = true; samples = []; return null; }
    if (!observedEmpty || weight <= 0 || weight > maximum || reading.stable === false
      || /(?:\bNT\b|\bN\s*$)/i.test(reading.raw || "") || !reading.cycleId || !reading.workstation?.id
      || Math.abs(weight * 1000 - Math.round(weight * 1000)) > 0.000001
      || Math.round(weight * 1000) % Math.round(resolution * 1000) !== 0) {
      samples = []; return null;
    }
    if (samples.length && (samples[0].cycleId !== reading.cycleId || at <= samples[samples.length - 1].at)) samples = [];
    samples = samples.filter(sample => at - sample.at <= 3000);
    samples.push({ at, weight, cycleId: reading.cycleId });
    if (samples.length > 256) samples = samples.slice(-256);
    if (samples.length < 5 || at - samples[0].at < 1500
      || Math.max(...samples.map(sample => sample.weight)) - Math.min(...samples.map(sample => sample.weight)) > resolution * 2) return null;
    const body = Buffer.from(JSON.stringify({ version: 1, pointId: reading.workstation.id,
      cycleId: reading.cycleId, grossKg: weight.toFixed(3), stable: true,
      capturedAt: new Date(at).toISOString() })).toString("base64url");
    return body + "." + createHmac("sha256", Buffer.from(signingKeyHex, "hex")).update(body).digest("hex");
  };
}

module.exports = { createCentralCaptureIssuer };
