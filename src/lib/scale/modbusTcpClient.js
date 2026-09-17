import "server-only";

import ModbusSerialPackage from "modbus-serial";
import {
  logScaleDiagnostic,
  registerScaleAttempt,
  releaseScaleAttempt,
  toErrorMetadata,
  updateScaleAttemptPhase,
} from "@/lib/scale/diagnostics";

const ModbusRTU = ModbusSerialPackage?.default ?? ModbusSerialPackage;
const SCALE_ATTEMPT_META = Symbol("scaleAttemptMeta");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function destroyClient(client) {
  return new Promise((resolve, reject) => {
    if (!client || typeof client.destroy !== "function") {
      resolve();
      return;
    }

    try {
      client.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function closeClient(client) {
  return new Promise((resolve, reject) => {
    if (!client || typeof client.close !== "function") {
      resolve();
      return;
    }

    try {
      client.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function isRetryableConnectError(error) {
  const errorMessage = String(error?.message || "").toLowerCase();
  const errorCode = String(error?.code || error?.errno || "").toUpperCase();

  return (
    errorMessage.includes("timed out")
    || errorCode === "ETIMEDOUT"
    || errorCode === "ECONNREFUSED"
    || errorCode === "ECONNRESET"
    || errorCode === "EHOSTUNREACH"
    || errorCode === "ENETUNREACH"
  );
}

function roundWeight(value) {
  return Number(Number(value).toFixed(2));
}

function formatDisplayText(weightKg, unitLabel) {
  return `${weightKg.toFixed(2)} ${unitLabel}`;
}

function summarizeSamples(samples = []) {
  if (!samples.length) {
    return {
      sampleCount: 0,
      minWeightKg: null,
      maxWeightKg: null,
      averageWeightKg: null,
    };
  }

  const weights = samples.map((sample) => sample.weightKg);
  const total = weights.reduce((sum, current) => sum + current, 0);

  return {
    sampleCount: samples.length,
    minWeightKg: roundWeight(Math.min(...weights)),
    maxWeightKg: roundWeight(Math.max(...weights)),
    averageWeightKg: roundWeight(total / samples.length),
  };
}

function buildWeightPayload(config, registers) {
  const normalizedRegisters = Array.isArray(registers) ? registers : [];
  if (normalizedRegisters.length === 0) {
    throw new Error("The scale returned an empty register response.");
  }

  let rawValue = Number(normalizedRegisters[0]);
  if (!Number.isFinite(rawValue)) {
    throw new Error("The scale returned a non-numeric register value.");
  }

  // Convert 16-bit unsigned integer to signed integer (e.g. 65530 -> -6)
  if (rawValue >= 32768) {
    rawValue -= 65536;
  }

  const weightKg = roundWeight(rawValue / config.divisor);

  return {
    connected: true,
    host: config.host,
    port: config.port,
    unitId: config.unitId,
    registerAddress: config.registerAddress,
    registerCount: config.registerCount,
    rawValue,
    registers: normalizedRegisters,
    divisor: config.divisor,
    weightKg,
    unitLabel: config.unitLabel,
    displayText: formatDisplayText(weightKg, config.unitLabel),
    readAt: new Date().toISOString(),
  };
}

function resolveStableSamples(samples, stableConfig) {
  if (!Array.isArray(samples) || samples.length < stableConfig.minSamples) {
    return null;
  }

  const latestSample = samples[samples.length - 1];
  const relevantSamples = samples.filter((sample) => (
    latestSample.measuredAt - sample.measuredAt <= stableConfig.windowMs
  ));

  if (relevantSamples.length < stableConfig.minSamples) {
    return null;
  }

  const weights = relevantSamples.map((sample) => sample.weightKg);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  if ((maxWeight - minWeight) > stableConfig.toleranceKg) {
    return null;
  }

  return {
    samples: relevantSamples,
    ...summarizeSamples(relevantSamples),
    stableWeightKg: roundWeight(weights.reduce((sum, current) => sum + current, 0) / weights.length),
  };
}

export async function createScaleClient(config, context = {}, hooks = {}) {
  const maxAttempts = Number(config.connectRetryCount || 0) + 1;
  const retryDelayMs = Number(config.connectRetryDelayMs || 0);
  let lastError = null;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const client = new ModbusRTU();
    const startedAt = Date.now();
    const attemptMeta = registerScaleAttempt({
      ...context,
      connectAttemptNumber: attemptNumber,
      connectAttemptMax: maxAttempts,
    });
    client[SCALE_ATTEMPT_META] = attemptMeta;

    logScaleDiagnostic("log", "scale.connect.start", {
      ...context,
      attemptId: attemptMeta.attemptId,
      connectionKey: attemptMeta.connectionKey,
      timeoutMs: config.timeoutMs,
      connectAttemptNumber: attemptNumber,
      connectAttemptMax: maxAttempts,
    });

    try {
      client.setTimeout(config.timeoutMs);
      await client.connectTCP(config.host, { port: config.port });
      client.setID(config.unitId);
      updateScaleAttemptPhase(
        attemptMeta.connectionKey,
        attemptMeta.attemptId,
        "connected",
        {
          ...context,
          connectAttemptNumber: attemptNumber,
          connectAttemptMax: maxAttempts,
        }
      );

      logScaleDiagnostic("log", "scale.connect.success", {
        ...context,
        attemptId: attemptMeta.attemptId,
        connectionKey: attemptMeta.connectionKey,
        durationMs: Date.now() - startedAt,
        timeoutMs: config.timeoutMs,
        connectAttemptNumber: attemptNumber,
        connectAttemptMax: maxAttempts,
      });

      return client;
    } catch (error) {
      lastError = error;
      updateScaleAttemptPhase(
        attemptMeta.connectionKey,
        attemptMeta.attemptId,
        "connect-error",
        {
          ...context,
          connectAttemptNumber: attemptNumber,
          connectAttemptMax: maxAttempts,
        }
      );
      logScaleDiagnostic("error", "scale.connect.error", {
        ...context,
        attemptId: attemptMeta.attemptId,
        connectionKey: attemptMeta.connectionKey,
        durationMs: Date.now() - startedAt,
        timeoutMs: config.timeoutMs,
        connectAttemptNumber: attemptNumber,
        connectAttemptMax: maxAttempts,
        ...toErrorMetadata(error),
      });

      await disconnectScaleClient(client, {
        ...context,
        connectAttemptNumber: attemptNumber,
        connectAttemptMax: maxAttempts,
      }, { forceDestroy: true });

      const shouldRetry =
        attemptNumber < maxAttempts && isRetryableConnectError(error);

      if (!shouldRetry) {
        throw error;
      }

      hooks.onRetryScheduled?.({
        error,
        retryDelayMs,
        attemptNumber,
        maxAttempts,
      });

      logScaleDiagnostic("warn", "scale.connect.retry_scheduled", {
        ...context,
        retryDelayMs,
        connectAttemptNumber: attemptNumber,
        connectAttemptMax: maxAttempts,
        ...toErrorMetadata(error),
      });
      await sleep(retryDelayMs);
    }
  }

  throw lastError || new Error("Failed to connect to the scale.");
}

export async function disconnectScaleClient(
  client,
  context = {},
  { forceDestroy = false } = {}
) {
  if (!client) {
    return;
  }
  const attemptMeta = client[SCALE_ATTEMPT_META] || null;
  let closeError = null;
  let destroyError = null;

  try {
    if (forceDestroy) {
      await destroyClient(client);
      return;
    }

    await closeClient(client);
  } catch (error) {
    closeError = error;
    try {
      await destroyClient(client);
    } catch (errorFromDestroy) {
      destroyError = errorFromDestroy;
      logScaleDiagnostic("warn", "scale.disconnect.error", {
        ...context,
        closeError: toErrorMetadata(closeError),
        destroyError: toErrorMetadata(errorFromDestroy),
      });
    }
  } finally {
    if (forceDestroy && destroyError) {
      logScaleDiagnostic("warn", "scale.disconnect.force_destroy_failed", {
        ...context,
        destroyError: toErrorMetadata(destroyError),
      });
    }
    if (attemptMeta?.connectionKey && attemptMeta?.attemptId) {
      releaseScaleAttempt(
        attemptMeta.connectionKey,
        attemptMeta.attemptId,
        context
      );
    }
  }
}

export async function readScaleWeightOnce(config, existingClient = null, context = {}) {
  const ownsClient = !existingClient;
  const client =
    existingClient || await createScaleClient(config, context);
  const startedAt = Date.now();
  const attemptMeta = client[SCALE_ATTEMPT_META] || null;

  if (attemptMeta?.connectionKey && attemptMeta?.attemptId) {
    updateScaleAttemptPhase(
      attemptMeta.connectionKey,
      attemptMeta.attemptId,
      "reading",
      context
    );
  }

  logScaleDiagnostic("log", "scale.read.start", {
    ...context,
    attemptId: attemptMeta?.attemptId || null,
    connectionKey: attemptMeta?.connectionKey || null,
    ownsClient,
    registerAddress: config.registerAddress,
    registerCount: config.registerCount,
  });

  try {
    const response = await client.readInputRegisters(
      config.registerAddress,
      config.registerCount
    );
    const reading = buildWeightPayload(config, response?.data);

    if (context.logSuccessfulReads) {
      logScaleDiagnostic("log", "scale.read.success", {
        ...context,
        attemptId: attemptMeta?.attemptId || null,
        connectionKey: attemptMeta?.connectionKey || null,
        ownsClient,
        durationMs: Date.now() - startedAt,
        rawValue: reading.rawValue,
        weightKg: reading.weightKg,
      });
    }

    if (attemptMeta?.connectionKey && attemptMeta?.attemptId) {
      updateScaleAttemptPhase(
        attemptMeta.connectionKey,
        attemptMeta.attemptId,
        ownsClient ? "read-complete" : "connected",
        context
      );
    }

    return reading;
  } catch (error) {
    if (attemptMeta?.connectionKey && attemptMeta?.attemptId) {
      updateScaleAttemptPhase(
        attemptMeta.connectionKey,
        attemptMeta.attemptId,
        "read-error",
        context
      );
    }

    logScaleDiagnostic("error", "scale.read.error", {
      ...context,
      attemptId: attemptMeta?.attemptId || null,
      connectionKey: attemptMeta?.connectionKey || null,
      ownsClient,
      durationMs: Date.now() - startedAt,
      registerAddress: config.registerAddress,
      registerCount: config.registerCount,
      ...toErrorMetadata(error),
    });
    throw error;
  } finally {
    if (ownsClient) {
      await disconnectScaleClient(client, context);
    }
  }
}

export async function readStableScaleWeight(config, stableConfig, context = {}) {
  const client = await createScaleClient(config, context);
  const startedAt = Date.now();
  let samples = [];

  logScaleDiagnostic("log", "scale.stable.start", {
    ...context,
    stableTimeoutMs: stableConfig.timeoutMs,
    stableWindowMs: stableConfig.windowMs,
    stableToleranceKg: stableConfig.toleranceKg,
    minSamples: stableConfig.minSamples,
    sampleIntervalMs: stableConfig.sampleIntervalMs,
  });

  try {
    while ((Date.now() - startedAt) < stableConfig.timeoutMs) {
      const attempt = samples.length + 1;
      const reading = await readScaleWeightOnce(config, client, {
        ...context,
        stage: "stable-read",
        attempt,
      });
      const measuredAt = Date.now();
      samples = [
        ...samples,
        { weightKg: reading.weightKg, rawValue: reading.rawValue, measuredAt },
      ].filter((sample) => (measuredAt - sample.measuredAt) <= stableConfig.windowMs);

      const stable = resolveStableSamples(samples, stableConfig);
      if (stable) {
        logScaleDiagnostic("log", "scale.stable.success", {
          ...context,
          durationMs: measuredAt - startedAt,
          sampleCount: stable.sampleCount,
          stableWeightKg: stable.stableWeightKg,
          minWeightKg: stable.minWeightKg,
          maxWeightKg: stable.maxWeightKg,
          averageWeightKg: stable.averageWeightKg,
        });

        return {
          ...reading,
          stable: true,
          stableAt: new Date().toISOString(),
          stableDurationMs: measuredAt - startedAt,
          samples: stable.samples.map((sample) => ({
            weightKg: sample.weightKg,
            rawValue: sample.rawValue,
            measuredAt: new Date(sample.measuredAt).toISOString(),
          })),
          stableWeightKg: stable.stableWeightKg,
          minWeightKg: stable.minWeightKg,
          maxWeightKg: stable.maxWeightKg,
          averageWeightKg: stable.averageWeightKg,
          sampleCount: stable.sampleCount,
        };
      }

      await sleep(stableConfig.sampleIntervalMs);
    }
  } finally {
    await disconnectScaleClient(client, context);
  }

  const lastReading = samples[samples.length - 1] || null;
  logScaleDiagnostic("warn", "scale.stable.timeout", {
    ...context,
    durationMs: Date.now() - startedAt,
    sampleCount: samples.length,
    lastRawValue: lastReading?.rawValue ?? null,
    lastWeightKg: lastReading?.weightKg ?? null,
    stableTimeoutMs: stableConfig.timeoutMs,
  });

  throw new Error(
    lastReading
      ? `The scale did not stabilize within ${stableConfig.timeoutMs} ms. Last reading was ${lastReading.weightKg.toFixed(2)} ${config.unitLabel}.`
      : `The scale did not return a stable reading within ${stableConfig.timeoutMs} ms.`
  );
}
