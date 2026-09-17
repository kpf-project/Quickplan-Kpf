export const WEIGHT_SCALE_INPUT_MODES = Object.freeze({
  IP: "ip",
  SERIAL: "serial",
});

const SERIAL_BAUD_RATES = new Set([9600, 19200, 38400, 57600, 115200]);
const SERIAL_DATA_BITS = new Set([7, 8]);
const SERIAL_PARITIES = new Set(["none", "even", "odd"]);
const SERIAL_STOP_BITS = new Set([1, 1.5, 2]);

export function normalizeWeightScaleSerialConfig(value = {}) {
  const baudRate = Number(value?.baudRate);
  const dataBits = Number(value?.dataBits);
  const parity = String(value?.parity || "").trim().toLowerCase();
  const stopBits = Number(value?.stopBits);

  return {
    path: String(value?.path || "").trim(),
    baudRate: SERIAL_BAUD_RATES.has(baudRate) ? baudRate : 9600,
    dataBits: SERIAL_DATA_BITS.has(dataBits) ? dataBits : 8,
    parity: SERIAL_PARITIES.has(parity) ? parity : "none",
    stopBits: SERIAL_STOP_BITS.has(stopBits) ? stopBits : 1,
  };
}

export function normalizeWeightScaleInputMode(value) {
  return value === WEIGHT_SCALE_INPUT_MODES.SERIAL
    ? WEIGHT_SCALE_INPUT_MODES.SERIAL
    : WEIGHT_SCALE_INPUT_MODES.IP;
}

export function resolveWeightScaleReading({ mode, ipReading, serialReading } = {}) {
  if (normalizeWeightScaleInputMode(mode) === WEIGHT_SCALE_INPUT_MODES.IP) {
    return ipReading ?? null;
  }

  const weightKg = Number(serialReading?.weightKg);
  if (!Number.isFinite(weightKg)) {
    return null;
  }

  return {
    weightKg,
    unitLabel: String(serialReading?.unit || "kg"),
    readAt: serialReading?.at || null,
    raw: String(serialReading?.raw || ""),
  };
}

export function resolveWeightScaleSourceMetadata({
  mode,
  ipConfig,
  serialConfig,
} = {}) {
  if (normalizeWeightScaleInputMode(mode) === WEIGHT_SCALE_INPUT_MODES.SERIAL) {
    return {
      scaleHost: "local-scale-agent",
      scalePort: serialConfig?.path || null,
      weightSource: "serial_agent",
    };
  }

  return {
    scaleHost: ipConfig?.host || null,
    scalePort: ipConfig?.port || null,
    weightSource: "scale_stream",
  };
}
