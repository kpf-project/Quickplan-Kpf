/**
 * Performance monitoring utilities
 * Tracks API response times, cache hits, and database performance
 */

/**
 * Simple in-memory performance metrics store
 */
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            apiCalls: [],
            cacheHits: 0,
            cacheMisses: 0,
            slowQueries: [],
            endpointStats: new Map(),
            webVitals: [],
            webVitalsByMetric: new Map(),
            webVitalsByPath: new Map(),
        };
        this.maxStoredMetrics = 100; // Keep last 100 metrics
        this.maxEndpointSamples = 50; // Keep last 50 samples per endpoint
        this.maxWebVitalSamples = 200; // Keep last 200 web-vital samples
    }

    /**
     * Record API call performance
     * @param {string} endpoint - API endpoint
     * @param {number} duration - Duration in milliseconds
     * @param {boolean} fromCache - Whether response was from cache
     */
    recordApiCall(endpoint, duration, fromCache = false, meta = {}) {
        this.metrics.apiCalls.push({
            endpoint,
            duration,
            fromCache,
            timestamp: Date.now(),
            ...meta,
        });

        // Keep only recent metrics
        if (this.metrics.apiCalls.length > this.maxStoredMetrics) {
            this.metrics.apiCalls.shift();
        }

        // Track cache performance
        if (fromCache) {
            this.metrics.cacheHits++;
        } else {
            this.metrics.cacheMisses++;
        }

        // Aggregate endpoint stats
        const existingStats = this.metrics.endpointStats.get(endpoint) || {
            count: 0,
            totalDuration: 0,
            minDuration: null,
            maxDuration: 0,
            errorCount: 0,
            statusCounts: {},
            lastSeen: null,
            recentDurations: [],
        };
        existingStats.count += 1;
        existingStats.totalDuration += duration;
        existingStats.minDuration =
            existingStats.minDuration === null
                ? duration
                : Math.min(existingStats.minDuration, duration);
        existingStats.maxDuration = Math.max(existingStats.maxDuration, duration);
        existingStats.lastSeen = Date.now();

        const status = meta?.status;
        if (typeof status === "number") {
            const statusGroup = `${Math.floor(status / 100)}xx`;
            existingStats.statusCounts[statusGroup] =
                (existingStats.statusCounts[statusGroup] || 0) + 1;
            if (status >= 400) {
                existingStats.errorCount += 1;
            }
        }

        existingStats.recentDurations.push(duration);
        if (existingStats.recentDurations.length > this.maxEndpointSamples) {
            existingStats.recentDurations.shift();
        }
        this.metrics.endpointStats.set(endpoint, existingStats);

        // Log slow queries (> 2 seconds)
        if (duration > 2000 && !fromCache) {
            this.recordSlowQuery(endpoint, duration);
        }
    }

    /**
     * Record slow query for monitoring
     * @param {string} endpoint - API endpoint
     * @param {number} duration - Duration in milliseconds
     */
    recordSlowQuery(endpoint, duration) {
        this.metrics.slowQueries.push({
            endpoint,
            duration,
            timestamp: Date.now(),
        });

        // Keep only last 50 slow queries
        if (this.metrics.slowQueries.length > 50) {
            this.metrics.slowQueries.shift();
        }

        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.warn(`⚠️ Slow query detected: ${endpoint} took ${duration}ms`);
        }
    }

    /**
     * Get performance statistics
     * @returns {Object} Performance stats
     */
    getStats() {
        const totalCalls = this.metrics.cacheHits + this.metrics.cacheMisses;
        const cacheHitRate = totalCalls > 0
            ? ((this.metrics.cacheHits / totalCalls) * 100).toFixed(2)
            : 0;

        const recentCalls = this.metrics.apiCalls.slice(-20);
        const avgDuration = recentCalls.length > 0
            ? (recentCalls.reduce((sum, call) => sum + call.duration, 0) / recentCalls.length).toFixed(2)
            : 0;

        return {
            totalApiCalls: totalCalls,
            cacheHitRate: `${cacheHitRate}%`,
            averageResponseTime: `${avgDuration}ms`,
            slowQueriesCount: this.metrics.slowQueries.length,
            recentSlowQueries: this.metrics.slowQueries.slice(-5),
            recentCalls: this.metrics.apiCalls.slice(-20),
        };
    }

    getEndpointStats(filterPrefix = null) {
        const stats = [];
        for (const [endpoint, data] of this.metrics.endpointStats.entries()) {
            if (filterPrefix && !endpoint.includes(filterPrefix)) {
                continue;
            }
            const samples = [...data.recentDurations].sort((a, b) => a - b);
            const p95Index = samples.length
                ? Math.min(samples.length - 1, Math.floor(samples.length * 0.95))
                : 0;
            const avgDuration = data.count
                ? Number((data.totalDuration / data.count).toFixed(2))
                : 0;
            stats.push({
                endpoint,
                count: data.count,
                avgDurationMs: avgDuration,
                p95DurationMs: samples.length ? Number(samples[p95Index].toFixed(2)) : 0,
                minDurationMs: data.minDuration === null ? 0 : Number(data.minDuration.toFixed(2)),
                maxDurationMs: Number(data.maxDuration.toFixed(2)),
                errorCount: data.errorCount,
                statusCounts: data.statusCounts,
                lastSeen: data.lastSeen,
            });
        }

        stats.sort((a, b) => b.count - a.count);
        return stats;
    }

    recordWebVital(metric) {
        if (!metric || typeof metric !== "object") {
            return;
        }

        const sample = {
            id: String(metric.id || ""),
            name: String(metric.name || "unknown"),
            value: Number(metric.value || 0),
            rating: String(metric.rating || "unknown"),
            delta: Number(metric.delta || 0),
            navigationType: String(metric.navigationType || "unknown"),
            path: String(metric.path || "/"),
            effectiveType: String(metric.effectiveType || "unknown"),
            timestamp: Date.now(),
        };

        this.metrics.webVitals.push(sample);
        if (this.metrics.webVitals.length > this.maxWebVitalSamples) {
            this.metrics.webVitals.shift();
        }

        const metricSamples = this.metrics.webVitalsByMetric.get(sample.name) || [];
        metricSamples.push(sample);
        if (metricSamples.length > this.maxWebVitalSamples) {
            metricSamples.shift();
        }
        this.metrics.webVitalsByMetric.set(sample.name, metricSamples);

        const pathSamples = this.metrics.webVitalsByPath.get(sample.path) || [];
        pathSamples.push(sample);
        if (pathSamples.length > this.maxWebVitalSamples) {
            pathSamples.shift();
        }
        this.metrics.webVitalsByPath.set(sample.path, pathSamples);
    }

    getWebVitalsStats() {
        const byMetric = [];
        for (const [metricName, samples] of this.metrics.webVitalsByMetric.entries()) {
            const sortedValues = samples
                .map((sample) => sample.value)
                .filter((value) => Number.isFinite(value))
                .sort((a, b) => a - b);
            const count = sortedValues.length;
            if (count === 0) {
                continue;
            }
            const total = sortedValues.reduce((sum, value) => sum + value, 0);
            const average = Number((total / count).toFixed(2));
            const p75 = percentile(sortedValues, 0.75);
            const p95 = percentile(sortedValues, 0.95);
            const ratingCounts = samples.reduce((acc, sample) => {
                const key = sample.rating || "unknown";
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            byMetric.push({
                name: metricName,
                count,
                average,
                p75,
                p95,
                ratingCounts,
            });
        }
        byMetric.sort((a, b) => b.count - a.count);

        const byPath = [];
        for (const [path, samples] of this.metrics.webVitalsByPath.entries()) {
            byPath.push({
                path,
                count: samples.length,
                latest: samples[samples.length - 1] || null,
            });
        }
        byPath.sort((a, b) => b.count - a.count);

        return {
            totalSamples: this.metrics.webVitals.length,
            byMetric,
            byPath: byPath.slice(0, 20),
            recent: this.metrics.webVitals.slice(-50),
        };
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            apiCalls: [],
            cacheHits: 0,
            cacheMisses: 0,
            slowQueries: [],
            endpointStats: new Map(),
            webVitals: [],
            webVitalsByMetric: new Map(),
            webVitalsByPath: new Map(),
        };
    }
}

function percentile(sortedValues, p) {
    if (!sortedValues.length) {
        return 0;
    }
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * p) - 1)
    );
    return Number(sortedValues[index].toFixed(2));
}

// Singleton instance
const monitor = new PerformanceMonitor();

/**
 * Measure async function execution time
 * @param {Function} fn - Async function to measure
 * @param {string} label - Label for the measurement
 * @returns {Promise<any>} Function result
 */
export async function measurePerformance(fn, label = 'Operation') {
    const start = performance.now();
    try {
        const result = await fn();
        const duration = performance.now() - start;

        if (process.env.NODE_ENV === 'development') {
            console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
        }

        return result;
    } catch (error) {
        const duration = performance.now() - start;
        console.error(`❌ ${label} failed after ${duration.toFixed(2)}ms:`, error);
        throw error;
    }
}

/**
 * Wrapper for fetch with performance monitoring
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function monitoredFetch(url, options = {}) {
    const start = performance.now();
    const fromCache = options.cache === 'force-cache';

    try {
        const response = await fetch(url, options);
        const duration = performance.now() - start;

        monitor.recordApiCall(url, duration, fromCache);

        return response;
    } catch (error) {
        const duration = performance.now() - start;
        monitor.recordApiCall(url, duration, false);
        throw error;
    }
}

export function recordApiCall(endpoint, duration, fromCache = false, meta = {}) {
    monitor.recordApiCall(endpoint, duration, fromCache, meta);
}

/**
 * Get current performance statistics
 * @returns {Object} Performance stats
 */
export function getPerformanceStats() {
    return monitor.getStats();
}

export function getEndpointStats(filterPrefix = null) {
    return monitor.getEndpointStats(filterPrefix);
}

export function recordWebVital(metric) {
    monitor.recordWebVital(metric);
}

export function getWebVitalsStats() {
    return monitor.getWebVitalsStats();
}

/**
 * Reset performance metrics
 */
export function resetPerformanceMetrics() {
    monitor.reset();
}

const performanceMonitor = {
    measurePerformance,
    monitoredFetch,
    recordApiCall,
    recordWebVital,
    getPerformanceStats,
    getEndpointStats,
    getWebVitalsStats,
    resetPerformanceMetrics,
};

export default performanceMonitor;
