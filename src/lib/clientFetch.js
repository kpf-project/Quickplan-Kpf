import { createAppError, fail, ok } from "@/lib/result";

// Cache configuration for different data types
const CACHE_CONFIG = {
  // Always fetch latest on refresh (no caching)
  static: { cache: "no-store" },
  user: { cache: "no-store" },
  realtime: { cache: "no-store" },
  default: { cache: "no-store" },
};

const inFlightRequests = new Map();
const getDedupKey = (url, options) => {
  const method = (options?.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (options?.signal) return null;
  const cacheStrategy = options?.cacheStrategy || "default";
  return `${method}:${cacheStrategy}:${url}`;
};

export async function fetchJson(url, options = {}) {
  const dedupKey = getDedupKey(url, options);
  if (dedupKey && inFlightRequests.has(dedupKey)) {
    return inFlightRequests.get(dedupKey);
  }

  const requestPromise = (async () => {
    try {
      // Determine cache strategy based on URL or options
      const cacheStrategy = options.cacheStrategy || "default";
      const cacheConfig = CACHE_CONFIG[cacheStrategy] || CACHE_CONFIG.default;

      const response = await fetch(url, {
        ...cacheConfig,
        ...options,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return fail(createAppError("http", payload?.error ?? "Request failed", payload?.details), {
          status: response.status,
          data: payload,
        });
      }
      return ok(payload, { status: response.status });
    } catch (error) {
      return fail(createAppError("network", "Request failed", error?.message), {
        status: 0,
      });
    } finally {
      if (dedupKey) {
        inFlightRequests.delete(dedupKey);
      }
    }
  })();

  if (dedupKey) {
    inFlightRequests.set(dedupKey, requestPromise);
  }

  return requestPromise;
}

// Parallel fetch helper for multiple requests
export async function fetchParallel(requests) {
  try {
    const results = await Promise.allSettled(
      requests.map(({ url, options }) => fetchJson(url, options))
    );
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { status: 'success', data: result.value, index };
      } else {
        return { status: 'error', error: result.reason, index };
      }
    });
  } catch (error) {
    throw new Error(`Parallel fetch failed: ${error.message}`);
  }
}

// SWR-compatible fetcher
export async function fetcher(url) {
  const result = await fetchJson(url);
  if (!result.ok) {
    const error = new Error(result.error?.message || "An error occurred while fetching the data.");
    error.info = result.error;
    error.status = result.status;
    throw error;
  }
  return result.data;
}
