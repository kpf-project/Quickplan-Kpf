"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function ReportSearchStatus({ loading, error, hasPrevious = false, onRetry }) {
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "kpf-report-search-state", loading: Boolean(loading) }, window.location.origin);
    return () => window.parent.postMessage({ type: "kpf-report-search-state", loading: false }, window.location.origin);
  }, [loading]);
  return <div className="print:hidden" aria-live="polite" aria-atomic="true">
    {loading ? <p role="status" className="flex items-center gap-2 px-4 py-2 text-sm text-[#102c57]"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{hasPrevious ? "กำลังอัปเดตรายงาน… ข้อมูลที่แสดงยังเป็นผลการค้นหาก่อนหน้า" : "กำลังโหลดรายงาน…"}</p> : error ? <p role="alert" className="px-4 py-2 text-sm text-red-700">{error} · กรุณาลองใหม่ {onRetry && <button type="button" onClick={onRetry} className="ml-2 underline">ลองใหม่</button>}</p> : null}
  </div>;
}
