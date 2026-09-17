import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { resolvePrinterForJob } = require("../local-print-agent/printer-profile.js");
const { buildScaleRuntimeProfile } = require("../local-scale-agent/scale-runtime-profile.js");

test("piece-rate printing uses its own printer without changing the weight-scale printer", () => {
  const config = {
    printerName: "TSC Weight Scale",
    pieceRatePrinterName: "TSC Piece Rate",
  };

  assert.equal(resolvePrinterForJob(config, "weight-scale"), "TSC Weight Scale");
  assert.equal(resolvePrinterForJob(config, "piece-rate"), "TSC Piece Rate");
});

test("piece-rate scale runtime uses a separate config file and local port", () => {
  const baseDir = path.resolve("local-scale-agent");
  const standard = buildScaleRuntimeProfile({ baseDir, profile: "weight-scale" });
  const pieceRate = buildScaleRuntimeProfile({ baseDir, profile: "piece-rate" });

  assert.equal(standard.port, 41952);
  assert.equal(standard.configPath, path.join(baseDir, "config.json"));
  assert.equal(pieceRate.port, 41953);
  assert.equal(pieceRate.configPath, path.join(baseDir, "config.piece-rate.json"));
  assert.notEqual(pieceRate.configPath, standard.configPath);
});
