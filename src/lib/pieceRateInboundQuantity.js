export function resolvePieceRateInboundQuantity(log, fallbackQuantity) {
  const fallback = Number(fallbackQuantity);
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;

  if (String(log?.input_mode_snapshot || "").trim().toLowerCase() !== "pail") {
    return safeFallback;
  }

  const enteredQuantity = Number(log?.input_value);
  return Number.isFinite(enteredQuantity) && enteredQuantity > 0
    ? enteredQuantity
    : safeFallback;
}
