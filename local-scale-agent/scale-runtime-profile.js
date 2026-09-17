const path = require("node:path");

function buildScaleRuntimeProfile({ baseDir, profile = "weight-scale" } = {}) {
  const normalizedProfile = profile === "piece-rate" ? "piece-rate" : "weight-scale";
  return {
    profile: normalizedProfile,
    port: normalizedProfile === "piece-rate" ? 41953 : 41952,
    configPath: path.join(baseDir, normalizedProfile === "piece-rate" ? "config.piece-rate.json" : "config.json"),
  };
}

module.exports = { buildScaleRuntimeProfile };
