const DEFAULT_SCALE_PORT = 502;
const DEFAULT_UNIT_ID = 1;
const DEFAULT_REGISTER_ADDRESS = 1;
const DEFAULT_REGISTER_COUNT = 1;
const DEFAULT_DIVISOR = 100;
const DEFAULT_POLL_INTERVAL_MS = 350;
const DEFAULT_TIMEOUT_MS = 5000;
const MIN_SCALE_TIMEOUT_MS = 5000;
const DEFAULT_CONNECT_RETRY_COUNT = 2;
const DEFAULT_CONNECT_RETRY_DELAY_MS = 400;
const DEFAULT_STABLE_TIMEOUT_MS = 6000;
const DEFAULT_STABLE_WINDOW_MS = 1800;
const DEFAULT_STABLE_MIN_SAMPLES = 5;
const DEFAULT_STABLE_SAMPLE_INTERVAL_MS = 200;
const DEFAULT_STABLE_TOLERANCE_KG = 0.01;

function parseInteger(value, fallback, { min, max } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (Number.isFinite(min) && parsed < min) {
    return fallback;
  }
  if (Number.isFinite(max) && parsed > max) {
    return fallback;
  }
  return parsed;
}

function parseFloatValue(value, fallback, { min, max } = {}) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (Number.isFinite(min) && parsed < min) {
    return fallback;
  }
  if (Number.isFinite(max) && parsed > max) {
    return fallback;
  }
  return parsed;
}

function parseString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export const DEFAULT_SCALE_CONFIG = Object.freeze({
  label: "Modbus TCP Scale",
  host: "",
  port: DEFAULT_SCALE_PORT,
  unitId: DEFAULT_UNIT_ID,
  registerAddress: DEFAULT_REGISTER_ADDRESS,
  registerCount: DEFAULT_REGISTER_COUNT,
  divisor: DEFAULT_DIVISOR,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  connectRetryCount: DEFAULT_CONNECT_RETRY_COUNT,
  connectRetryDelayMs: DEFAULT_CONNECT_RETRY_DELAY_MS,
  unitLabel: "kg",
});

export const DEFAULT_STABLE_READ_CONFIG = Object.freeze({
  minSamples: DEFAULT_STABLE_MIN_SAMPLES,
  sampleIntervalMs: DEFAULT_STABLE_SAMPLE_INTERVAL_MS,
  timeoutMs: DEFAULT_STABLE_TIMEOUT_MS,
  toleranceKg: DEFAULT_STABLE_TOLERANCE_KG,
  windowMs: DEFAULT_STABLE_WINDOW_MS,
});

export function normalizeScaleConfig(input = {}, baseConfig = DEFAULT_SCALE_CONFIG) {
  return {
    label: parseString(input?.label, baseConfig.label),
    host: parseString(input?.host, baseConfig.host),
    port: parseInteger(input?.port, baseConfig.port, { min: 1, max: 65535 }),
    unitId: parseInteger(input?.unitId, baseConfig.unitId, { min: 1, max: 247 }),
    registerAddress: parseInteger(input?.registerAddress, baseConfig.registerAddress, { min: 0, max: 65535 }),
    registerCount: parseInteger(input?.registerCount, baseConfig.registerCount, { min: 1, max: 32 }),
    divisor: parseFloatValue(input?.divisor, baseConfig.divisor, { min: 0.0001 }),
    pollIntervalMs: parseInteger(input?.pollIntervalMs, baseConfig.pollIntervalMs, { min: 100, max: 10000 }),
    timeoutMs: parseInteger(input?.timeoutMs, baseConfig.timeoutMs, {
      min: MIN_SCALE_TIMEOUT_MS,
      max: 30000,
    }),
    connectRetryCount: parseInteger(input?.connectRetryCount, baseConfig.connectRetryCount, {
      min: 0,
      max: 5,
    }),
    connectRetryDelayMs: parseInteger(input?.connectRetryDelayMs, baseConfig.connectRetryDelayMs, {
      min: 100,
      max: 5000,
    }),
    unitLabel: parseString(input?.unitLabel, baseConfig.unitLabel),
  };
}

export function normalizeStableReadConfig(input = {}, baseConfig = DEFAULT_STABLE_READ_CONFIG) {
  return {
    minSamples: parseInteger(input?.minSamples, baseConfig.minSamples, { min: 2, max: 60 }),
    sampleIntervalMs: parseInteger(input?.sampleIntervalMs, baseConfig.sampleIntervalMs, { min: 50, max: 5000 }),
    timeoutMs: parseInteger(input?.timeoutMs, baseConfig.timeoutMs, { min: 500, max: 60000 }),
    toleranceKg: parseFloatValue(input?.toleranceKg, baseConfig.toleranceKg, { min: 0.0001, max: 10 }),
    windowMs: parseInteger(input?.windowMs, baseConfig.windowMs, { min: 200, max: 60000 }),
  };
}

export function validateScaleConfig(config) {
  const errors = [];

  if (!config?.host) {
    errors.push("Scale host is required.");
  }

  if (!Number.isFinite(config?.port) || config.port <= 0) {
    errors.push("Scale port must be a positive integer.");
  }

  if (!Number.isFinite(config?.unitId) || config.unitId <= 0) {
    errors.push("Unit ID must be a positive integer.");
  }

  if (!Number.isFinite(config?.registerAddress) || config.registerAddress < 0) {
    errors.push("Register address must be zero or greater.");
  }

  if (!Number.isFinite(config?.registerCount) || config.registerCount <= 0) {
    errors.push("Register count must be at least 1.");
  }

  if (!Number.isFinite(config?.divisor) || config.divisor <= 0) {
    errors.push("Divisor must be greater than 0.");
  }

  return errors;
}

export function buildScaleConfigFromEnv() {
  return normalizeScaleConfig({
    label: process.env.SCALE_LABEL,
    host: process.env.SCALE_HOST,
    port: process.env.SCALE_PORT,
    unitId: process.env.SCALE_UNIT_ID,
    registerAddress: process.env.SCALE_INPUT_REGISTER_ADDRESS,
    registerCount: process.env.SCALE_INPUT_REGISTER_COUNT,
    divisor: process.env.SCALE_DIVISOR,
    pollIntervalMs: process.env.SCALE_POLL_INTERVAL_MS,
    timeoutMs: process.env.SCALE_TIMEOUT_MS,
    connectRetryCount: process.env.SCALE_CONNECT_RETRY_COUNT,
    connectRetryDelayMs: process.env.SCALE_CONNECT_RETRY_DELAY_MS,
    unitLabel: process.env.SCALE_UNIT_LABEL,
  });
}

export function buildStableReadConfigFromEnv() {
  return normalizeStableReadConfig({
    minSamples: process.env.SCALE_STABLE_MIN_SAMPLES,
    sampleIntervalMs: process.env.SCALE_STABLE_SAMPLE_INTERVAL_MS,
    timeoutMs: process.env.SCALE_STABLE_TIMEOUT_MS,
    toleranceKg: process.env.SCALE_STABLE_TOLERANCE_KG,
    windowMs: process.env.SCALE_STABLE_WINDOW_MS,
  });
}
