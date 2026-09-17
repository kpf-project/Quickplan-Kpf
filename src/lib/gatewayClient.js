import "server-only";

import { createAppError, fail, ok } from "@/lib/result";
import { recordApiCall } from "@/lib/performanceMonitor";

// Cache configuration for different data types
const GATEWAY_CACHE_CONFIG = {
  // Always fetch latest on refresh (no caching)
  static: { cache: "no-store" },
  user: { cache: "no-store" },
  production: { cache: "no-store" },
  realtime: { cache: "no-store" },
  default: { cache: "no-store" },
};

const inFlightGatewayRequests = new Map();

function getDedupKey(method, url, cacheStrategy) {
  return `${method}:${cacheStrategy || "default"}:${url}`;
}

function getGatewayConfig() {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  if (!gatewayUrl) {
    return fail(createAppError("config", "Gateway URL not configured"), {
      status: 500,
    });
  }
  return ok({ gatewayUrl, apiKey });
}

function isJsonContentType(contentType) {
  return String(contentType || "").toLowerCase().includes("application/json");
}

async function readGatewayPayload(response) {
  const contentType = response.headers.get("content-type");

  if (isJsonContentType(contentType)) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: "Invalid gateway response",
      details: text.slice(0, 500),
    };
  }
}

export async function fetchGatewayJson(
  path,
  params = new URLSearchParams(),
  cacheStrategy = "default",
  requestOptions = {}
) {
  const configResult = getGatewayConfig();
  if (!configResult.ok) {
    return configResult;
  }
  const { gatewayUrl, apiKey } = configResult.data;
  const url = `${gatewayUrl}${path}?${params.toString()}`;
  const method = String(requestOptions.method || "GET").toUpperCase();
  
  // Get cache configuration based on strategy
  const cacheConfig = GATEWAY_CACHE_CONFIG[cacheStrategy] || GATEWAY_CACHE_CONFIG.default;
  const dedupKey = getDedupKey(method, url, cacheStrategy);
  const canDedupe = method === "GET";
  if (canDedupe && inFlightGatewayRequests.has(dedupKey)) {
    return inFlightGatewayRequests.get(dedupKey);
  }

  const requestPromise = (async () => {
    const start = performance.now();
    try {
      const response = await fetch(url, {
        method,
        headers: apiKey ? { "x-api-key": apiKey } : undefined,
        ...cacheConfig,
        ...requestOptions,
      });
      const payload = await readGatewayPayload(response);
      const duration = performance.now() - start;
      recordApiCall(`gateway:${path}`, duration, false, {
        status: response.status,
        source: "gateway",
        cacheStrategy,
      });

      if (!response.ok) {
        return fail(
          createAppError(
            "gateway",
            payload?.error || `Gateway request failed with status ${response.status}`,
            payload?.details
          ),
          {
            status: response.status,
            data: payload,
          }
        );
      }

      if (!payload) {
        return fail(
          createAppError("gateway", "Invalid gateway response"),
          {
            status: 502,
          }
        );
      }

      if (payload?.error && !Array.isArray(payload?.data)) {
        return fail(
          createAppError("gateway", payload.error || "Gateway returned an error", payload?.details),
          {
            status: response.status || 502,
            data: payload,
          }
        );
      }

      return ok(payload, { status: response.status });
    } catch (error) {
      const duration = performance.now() - start;
      recordApiCall(`gateway:${path}`, duration, false, {
        status: 0,
        source: "gateway",
        cacheStrategy,
      });
      return fail(createAppError("network", "Gateway request failed", error?.message), {
        status: 502,
      });
    } finally {
      if (canDedupe) {
        inFlightGatewayRequests.delete(dedupKey);
      }
    }
  })();

  if (canDedupe) {
    inFlightGatewayRequests.set(dedupKey, requestPromise);
  }
  return requestPromise;
}

// Parallel fetch for multiple gateway requests
export async function fetchGatewayParallel(requests) {
  try {
    const results = await Promise.allSettled(
      requests.map(({ path, params, cacheStrategy }) => fetchGatewayJson(path, params, cacheStrategy))
    );
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { status: 'success', data: result.value, index };
      } else {
        return { status: 'error', error: result.reason, index };
      }
    });
  } catch (error) {
    throw new Error(`Parallel gateway fetch failed: ${error.message}`);
  }
}

// Cache revalidation helper
export async function revalidateGatewayCache(tags) {
  if (typeof window === 'undefined') {
    const { revalidateTag } = await import('next/cache');
    if (Array.isArray(tags)) {
      tags.forEach(tag => revalidateTag(tag));
    } else {
      revalidateTag(tags);
    }
  }
}
