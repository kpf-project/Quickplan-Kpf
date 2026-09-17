import "server-only";

function fallbackTraceId() {
  return `scale-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

const activeScaleAttempts = new Map();

export function createScaleTraceId() {
  return globalThis.crypto?.randomUUID?.() || fallbackTraceId();
}

export function buildScaleDiagnosticContext({
  traceId = createScaleTraceId(),
  source = "unknown",
  request = null,
  config = null,
  stableConfig = null,
} = {}) {
  return {
    traceId,
    source,
    requestPath: request ? new URL(request.url).pathname : null,
    method: request?.method || null,
    host: config?.host ?? null,
    port: config?.port ?? null,
    unitId: config?.unitId ?? null,
    registerAddress: config?.registerAddress ?? null,
    registerCount: config?.registerCount ?? null,
    timeoutMs: config?.timeoutMs ?? null,
    pollIntervalMs: config?.pollIntervalMs ?? null,
    stableTimeoutMs: stableConfig?.timeoutMs ?? null,
    stableWindowMs: stableConfig?.windowMs ?? null,
    stableToleranceKg: stableConfig?.toleranceKg ?? null,
    requestedAt: new Date().toISOString(),
  };
}

export function toErrorMetadata(error) {
  if (!error) {
    return {
      errorName: null,
      errorMessage: null,
      errorCode: null,
      errorErrno: null,
      errorStack: null,
    };
  }

  return {
    errorName: error?.name || null,
    errorMessage: error?.message || String(error),
    errorCode: error?.code || null,
    errorErrno: error?.errno || null,
    errorStack: typeof error?.stack === "string" ? error.stack : null,
  };
}

export function logScaleDiagnostic(level, event, details = {}) {
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  logger("[scale-diagnostic]", {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  });
}

function buildConnectionKey(host, port) {
  return `${host || "unknown"}:${port || "unknown"}`;
}

export function getActiveScaleAttempts(host, port) {
  const connectionKey = buildConnectionKey(host, port);
  return (activeScaleAttempts.get(connectionKey) || []).map((attempt) => ({
    attemptId: attempt.attemptId,
    traceId: attempt.traceId,
    source: attempt.source,
    requestPath: attempt.requestPath,
    method: attempt.method,
    phase: attempt.phase,
    startedAt: attempt.startedAt,
  }));
}

export function registerScaleAttempt(context = {}) {
  const connectionKey = buildConnectionKey(context.host, context.port);
  const attemptId = createScaleTraceId();
  const entry = {
    attemptId,
    traceId: context.traceId || null,
    source: context.source || "unknown",
    requestPath: context.requestPath || null,
    method: context.method || null,
    host: context.host || null,
    port: context.port || null,
    phase: "connect-start",
    startedAt: new Date().toISOString(),
  };

  const currentAttempts = activeScaleAttempts.get(connectionKey) || [];
  const nextAttempts = [...currentAttempts, entry];
  activeScaleAttempts.set(connectionKey, nextAttempts);

  if (currentAttempts.length > 0) {
    logScaleDiagnostic("warn", "scale.connection.contention", {
      ...context,
      connectionKey,
      attemptId,
      activeAttemptCount: nextAttempts.length,
      otherAttempts: currentAttempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        traceId: attempt.traceId,
        source: attempt.source,
        requestPath: attempt.requestPath,
        method: attempt.method,
        phase: attempt.phase,
        startedAt: attempt.startedAt,
      })),
    });
  } else {
    logScaleDiagnostic("log", "scale.connection.registered", {
      ...context,
      connectionKey,
      attemptId,
      activeAttemptCount: nextAttempts.length,
    });
  }

  return {
    attemptId,
    connectionKey,
    activeAttemptCount: nextAttempts.length,
  };
}

export function updateScaleAttemptPhase(connectionKey, attemptId, phase, context = {}) {
  const attempts = activeScaleAttempts.get(connectionKey) || [];
  const nextAttempts = attempts.map((attempt) =>
    attempt.attemptId === attemptId
      ? {
          ...attempt,
          phase,
        }
      : attempt
  );

  if (nextAttempts.length > 0) {
    activeScaleAttempts.set(connectionKey, nextAttempts);
  }

  logScaleDiagnostic("log", "scale.connection.phase", {
    ...context,
    connectionKey,
    attemptId,
    phase,
    activeAttemptCount: nextAttempts.length,
  });
}

export function releaseScaleAttempt(connectionKey, attemptId, context = {}) {
  const attempts = activeScaleAttempts.get(connectionKey) || [];
  const releasedAttempt = attempts.find((attempt) => attempt.attemptId === attemptId) || null;
  const nextAttempts = attempts.filter((attempt) => attempt.attemptId !== attemptId);

  if (nextAttempts.length > 0) {
    activeScaleAttempts.set(connectionKey, nextAttempts);
  } else {
    activeScaleAttempts.delete(connectionKey);
  }

  logScaleDiagnostic("log", "scale.connection.released", {
    ...context,
    connectionKey,
    attemptId,
    releasedPhase: releasedAttempt?.phase || null,
    remainingAttemptCount: nextAttempts.length,
    remainingAttempts: nextAttempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      traceId: attempt.traceId,
      source: attempt.source,
      requestPath: attempt.requestPath,
      method: attempt.method,
      phase: attempt.phase,
      startedAt: attempt.startedAt,
    })),
  });
}
