const cache = new Map();

export function getCachedValue(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedValue(key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}
