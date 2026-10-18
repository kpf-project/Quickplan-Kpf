"use client";

import { useEffect, useState, useTransition } from "react";
import { observeReportRequest } from "@/components/reporting/reportSearch";
import { useReportRequestCache } from "./ReportRequestCacheProvider";

export function useReportRequest(key, load, initialReport = null) {
  const cache = useReportRequestCache();
  const revision = cache.revision || 0;
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [rendering, startTransition] = useTransition();
  useEffect(() => {
    const promise = initialReport && revision === 0 && attempt === 0 && !cache.get(`${key}:view`)
      ? Promise.resolve(initialReport)
      : cache.load(`${key}:view`, load);
    return observeReportRequest(promise, (report) => {
      startTransition(() => setResult({ key, revision, attempt, scope: cache.scope, report, error: "" }));
    }, (error) => {
      setResult((previous) => ({ key, revision, attempt, scope: cache.scope, report: previous?.scope === cache.scope ? previous?.report : null, error: error.message || "ไม่สามารถโหลดรายงานได้" }));
    });
  }, [cache, key, load, initialReport, revision, attempt]);
  return {
    report: cache.get(`${key}:view`) || (result?.scope === cache.scope ? result?.report : null) || initialReport,
    loading: rendering || result?.key !== key || result?.revision !== revision || result?.attempt !== attempt,
    error: result?.key === key && result?.revision === revision && result?.attempt === attempt ? result.error : "",
    retry: () => setAttempt((current) => current + 1),
  };
}
