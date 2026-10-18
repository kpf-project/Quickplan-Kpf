"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createReportRequestCache } from "./reportRequestCache";

const CacheContext = createContext(null);

export function ReportRequestCacheProvider({ scope, children }) {
  const cache = useMemo(() => ({ ...createReportRequestCache(), scope }), [scope]);
  const [revision, setRevision] = useState(0);
  const value = useMemo(() => ({ ...cache, revision }), [cache, revision]);
  useEffect(() => {
    const clear = () => cache.clear();
    const refresh = () => setRevision((current) => current + 1);
    window.addEventListener("pagehide", clear);
    window.addEventListener("kpf-report-refresh", refresh);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("kpf-report-refresh", refresh);
      clear();
    };
  }, [cache]);
  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}

export function useReportRequestCache() {
  const shared = useContext(CacheContext);
  const [fallback] = useState(() => createReportRequestCache());
  return shared || fallback;
}
