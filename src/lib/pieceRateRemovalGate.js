function parseRemovalWeightValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsedTextWeight = Number(match[0]);
  return Number.isFinite(parsedTextWeight) ? parsedTextWeight : null;
}

export function resolvePieceRateRemovalWeightKg(detail) {
  if (!detail || typeof detail !== "object") {
    return null;
  }

  const candidates = [
    detail.weightKg,
    detail.displayWeight,
    detail.displayText,
    detail.latestWeightKg,
    detail.latestDisplayText,
  ];

  for (const value of candidates) {
    const parsedWeightKg = parseRemovalWeightValue(value);
    if (parsedWeightKg !== null) {
      return parsedWeightKg;
    }
  }

  return null;
}

export function createPieceRateRemovalGate({
  zeroThresholdKg = 0.02,
  holdDurationMs = 1000,
} = {}) {
  let armed = false;
  let zeroStartedAt = null;

  return {
    arm() {
      armed = true;
      zeroStartedAt = null;
    },
    reset() {
      armed = false;
      zeroStartedAt = null;
    },
    observe(weightKg, observedAt = Date.now()) {
      if (!armed) {
        return { ready: false, zeroStartedAt: null };
      }

      if (weightKg === null || weightKg === undefined || weightKg === "") {
        return { ready: false, zeroStartedAt };
      }

      const parsedWeightKg = Number(weightKg);
      const parsedObservedAt = Number(observedAt);
      if (!Number.isFinite(parsedWeightKg) || !Number.isFinite(parsedObservedAt)) {
        return { ready: false, zeroStartedAt };
      }

      if (parsedWeightKg > zeroThresholdKg) {
        zeroStartedAt = null;
        return { ready: false, zeroStartedAt };
      }

      if (zeroStartedAt === null) {
        zeroStartedAt = parsedObservedAt;
      }

      const ready = parsedObservedAt - zeroStartedAt >= holdDurationMs;
      if (ready) {
        armed = false;
      }

      return { ready, zeroStartedAt };
    },
  };
}
