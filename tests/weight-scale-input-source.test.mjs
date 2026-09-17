import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWeightScaleSerialConfig,
  normalizeWeightScaleInputMode,
  resolveWeightScaleReading,
  resolveWeightScaleSourceMetadata,
} from "../src/lib/weight-scale-input-source.js";

test("weight scale input defaults to the existing IP source", () => {
  assert.equal(normalizeWeightScaleInputMode(), "ip");
  assert.equal(normalizeWeightScaleInputMode("unknown"), "ip");
});

test("IP mode preserves the existing scale reading object", () => {
  const ipReading = {
    weightKg: 12.345,
    unitLabel: "KG",
    readAt: "2026-09-05T08:30:00.000Z",
  };

  assert.equal(resolveWeightScaleReading({ mode: "ip", ipReading }), ipReading);
});

test("serial mode maps the local agent reading into the existing scale shape", () => {
  assert.deepEqual(
    resolveWeightScaleReading({
      mode: "serial",
      ipReading: { weightKg: 99 },
      serialReading: {
        weightKg: 7.125,
        unit: "kg",
        at: "2026-09-05T08:31:00.000Z",
        raw: "ST,GS,7.125kg",
      },
    }),
    {
      weightKg: 7.125,
      unitLabel: "kg",
      readAt: "2026-09-05T08:31:00.000Z",
      raw: "ST,GS,7.125kg",
    }
  );
});

test("source metadata keeps IP details separate from the serial agent profile", () => {
  assert.deepEqual(
    resolveWeightScaleSourceMetadata({
      mode: "ip",
      ipConfig: { host: "192.168.211.243", port: 9761 },
    }),
    {
      scaleHost: "192.168.211.243",
      scalePort: 9761,
      weightSource: "scale_stream",
    }
  );

  assert.deepEqual(
    resolveWeightScaleSourceMetadata({
      mode: "serial",
      serialConfig: { path: "COM7" },
    }),
    {
      scaleHost: "local-scale-agent",
      scalePort: "COM7",
      weightSource: "serial_agent",
    }
  );
});

test("serial config accepts supported values and falls back safely", () => {
  assert.deepEqual(
    normalizeWeightScaleSerialConfig({
      path: " COM7 ",
      baudRate: "19200",
      dataBits: 7,
      parity: "EVEN",
      stopBits: 2,
    }),
    { path: "COM7", baudRate: 19200, dataBits: 7, parity: "even", stopBits: 2 }
  );
  assert.deepEqual(
    normalizeWeightScaleSerialConfig({ baudRate: 123, dataBits: 9, parity: "mark", stopBits: 3 }),
    { path: "", baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }
  );
});
