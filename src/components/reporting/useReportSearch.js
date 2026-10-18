"use client";

import { useEffect, useRef, useState } from "react";
import { afterReportPaint } from "./reportSearch";

export function useReportSearch(isLoading, onSearch) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function search() {
    if (isLoading || locked.current || !onSearch) return;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      await afterReportPaint();
      if (mounted.current) await onSearch();
    } catch (issue) {
      if (mounted.current) setError(issue.message || "ค้นหาไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { searching: isLoading || pending, search, error };
}
