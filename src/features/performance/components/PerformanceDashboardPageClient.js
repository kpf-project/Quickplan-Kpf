"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, RotateCcw } from "lucide-react";
import PermissionGate from "@/components/PermissionGate";
import { adminFetch } from "@/lib/adminClient";

function MetricCard({ label, value, hint = "" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#102C57]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH");
}

function RatingPill({ rating }) {
  const key = String(rating || "unknown").toLowerCase();
  const classes = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "needs-improvement": "border-amber-200 bg-amber-50 text-amber-700",
    poor: "border-rose-200 bg-rose-50 text-rose-700",
    unknown: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classes[key] || classes.unknown}`}>
      {key}
    </span>
  );
}

function PerformanceDashboardContent() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const loadData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await adminFetch("/api/admin/performance?includeGateway=1");
      setPayload(response);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const apiStats = payload?.stats || {};
  const gatewayStats = payload?.gateway || {};
  const webVitalsStats = payload?.webVitals || {};
  const hasGatewayError = typeof gatewayStats?.error === "string";

  const webVitalsRows = (webVitalsStats?.byMetric || []).slice(0, 10);
  const endpointRows = (payload?.endpoints || []).slice(0, 15);
  const gatewayRows = (gatewayStats?.endpoints || []).slice(0, 15);

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await adminFetch("/api/admin/performance", { method: "POST" });
      await loadData();
    } catch (err) {
      setError(err?.message || "รีเซ็ตข้อมูลไม่สำเร็จ");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-[#102C57] to-[#1a3f78] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#d4af37] p-2 text-[#102C57]">
                <Activity size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Performance Dashboard</h1>
                <p className="text-sm text-white/80">ติดตามความเร็วระบบแบบรวม Frontend + Next API + Gateway</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[11px] text-white/70">
                อัปเดตล่าสุด {lastRefreshedAt ? formatDateTime(lastRefreshedAt) : "-"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  รีเฟรชข้อมูล
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isResetting}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#d4af37] bg-[#d4af37] px-3 py-2 text-xs font-semibold text-[#102C57] hover:bg-[#e8c95b] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={14} className={isResetting ? "animate-spin" : ""} />
                  Reset Metrics
                </button>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Next API Calls" value={apiStats?.totalApiCalls ?? 0} hint="In-memory metrics" />
          <MetricCard label="Next Avg Response" value={apiStats?.averageResponseTime || "0ms"} />
          <MetricCard label="Web Vitals Samples" value={webVitalsStats?.totalSamples ?? 0} />
          <MetricCard
            label="Gateway Avg Response"
            value={hasGatewayError ? "-" : `${gatewayStats?.averageResponseTimeMs ?? 0}ms`}
            hint={hasGatewayError ? gatewayStats.error : ""}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[#102C57]">Web Vitals</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-2">Metric</th>
                  <th className="px-2 py-2">Count</th>
                  <th className="px-2 py-2">Avg</th>
                  <th className="px-2 py-2">P75</th>
                  <th className="px-2 py-2">P95</th>
                  <th className="px-2 py-2">Ratings</th>
                </tr>
              </thead>
              <tbody>
                {webVitalsRows.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-500" colSpan={6}>ยังไม่มีข้อมูล Web Vitals</td>
                  </tr>
                ) : webVitalsRows.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-semibold text-[#102C57]">{row.name}</td>
                    <td className="px-2 py-2">{row.count}</td>
                    <td className="px-2 py-2">{row.average}</td>
                    <td className="px-2 py-2">{row.p75}</td>
                    <td className="px-2 py-2">{row.p95}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(row.ratingCounts || {}).map(([rating, count]) => (
                          <span key={`${row.name}-${rating}`} className="inline-flex items-center gap-1">
                            <RatingPill rating={rating} />
                            <span className="text-xs text-slate-500">{count}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-[#102C57]">Next API Endpoints</h2>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Endpoint</th>
                    <th className="px-2 py-2">Count</th>
                    <th className="px-2 py-2">Avg</th>
                    <th className="px-2 py-2">P95</th>
                    <th className="px-2 py-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointRows.length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-slate-500" colSpan={5}>ยังไม่มีการเรียก API</td>
                    </tr>
                  ) : endpointRows.map((row) => (
                    <tr key={row.endpoint} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-xs text-[#102C57]">{row.endpoint}</td>
                      <td className="px-2 py-2">{row.count}</td>
                      <td className="px-2 py-2">{row.avgDurationMs}ms</td>
                      <td className="px-2 py-2">{row.p95DurationMs}ms</td>
                      <td className="px-2 py-2">{row.errorCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-[#102C57]">Gateway Endpoints</h2>
            {hasGatewayError ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {gatewayStats.error}
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Endpoint</th>
                      <th className="px-2 py-2">Count</th>
                      <th className="px-2 py-2">Avg</th>
                      <th className="px-2 py-2">P95</th>
                      <th className="px-2 py-2">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gatewayRows.length === 0 ? (
                      <tr>
                        <td className="px-2 py-4 text-slate-500" colSpan={5}>ยังไม่มีข้อมูล gateway</td>
                      </tr>
                    ) : gatewayRows.map((row) => (
                      <tr key={row.endpoint} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-xs text-[#102C57]">{row.endpoint}</td>
                        <td className="px-2 py-2">{row.count}</td>
                        <td className="px-2 py-2">{row.avgDurationMs}ms</td>
                        <td className="px-2 py-2">{row.p95DurationMs}ms</td>
                        <td className="px-2 py-2">{row.errorCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[#102C57]">Recent Web Vitals Events</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Path</th>
                  <th className="px-2 py-2">Metric</th>
                  <th className="px-2 py-2">Value</th>
                  <th className="px-2 py-2">Rating</th>
                </tr>
              </thead>
              <tbody>
                {(webVitalsStats?.recent || []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-500" colSpan={5}>ยังไม่มี event</td>
                  </tr>
                ) : (webVitalsStats.recent || []).slice().reverse().slice(0, 20).map((entry, index) => (
                  <tr key={`${entry.id || "metric"}-${index}`} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-xs">{formatDateTime(entry.timestamp)}</td>
                    <td className="px-2 py-2 text-xs text-[#102C57]">{entry.path || "-"}</td>
                    <td className="px-2 py-2">{entry.name}</td>
                    <td className="px-2 py-2">{entry.value}</td>
                    <td className="px-2 py-2"><RatingPill rating={entry.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PerformanceDashboardPageClient() {
  return (
    <PermissionGate requireAdmin>
      <PerformanceDashboardContent />
    </PermissionGate>
  );
}
