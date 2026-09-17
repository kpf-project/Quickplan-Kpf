"use client";

import { useEffect, useState } from "react";
import { reportClientDiagnostic } from "@/lib/clientDiagnostics";
import { createIncidentId } from "@/lib/clientDiagnosticsShared";
import { cleanupWrapperPwaCaches } from "@/lib/wrapperPwaCache";
import { attemptRuntimeRecovery } from "@/lib/wrapperRuntimeRecovery";
import { getConnectivitySnapshot, WRAPPER_NETWORK_CHANGE_EVENT } from "@/lib/offline/networkStatus";

const CURRENT_DEPLOYMENT_ID = process.env.NEXT_PUBLIC_DEPLOYMENT_ID || "development";

export default function Error({ error }) {
  const [incidentId] = useState(createIncidentId);
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    reportClientDiagnostic(error, {
      incidentId,
      eventType: "next-error-boundary",
    });
    void attemptRuntimeRecovery(window, {
      error,
      deploymentId: CURRENT_DEPLOYMENT_ID,
      reason: "next-error-boundary",
      cleanup: cleanupWrapperPwaCaches,
    });
  }, [error, incidentId]);

  useEffect(() => {
    const handleNetworkChange = () => {
      const snap = getConnectivitySnapshot();
      setIsOnline(snap.online);
      if (!snap.online) {
        setWasOffline(true);
      }
    };

    window.addEventListener("online", handleNetworkChange);
    window.addEventListener("offline", handleNetworkChange);
    window.addEventListener(WRAPPER_NETWORK_CHANGE_EVENT, handleNetworkChange);

    // Defer initial check to avoid synchronous state update in effect
    const timer = setTimeout(handleNetworkChange, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", handleNetworkChange);
      window.removeEventListener("offline", handleNetworkChange);
      window.removeEventListener(WRAPPER_NETWORK_CHANGE_EVENT, handleNetworkChange);
    };
  }, []);

  useEffect(() => {
    if (isOnline && wasOffline) {
      window.location.reload();
    }
  }, [isOnline, wasOffline]);

  if (!isOnline) {
    return (
      <main className="min-h-screen bg-[#102C57] px-6 py-10 text-white flex items-center justify-center">
        <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-[2rem] border border-[#d4af37]/35 bg-white/10 p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.25)] backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#f4c025]">Offline Mode</p>
          <h1 className="mt-4 text-3xl font-bold">ยังไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1>
          <p className="mt-4 text-sm text-white/80">
            สัญญาณอินเทอร์เน็ตขาดหายชั่วคราว คุณยังสามารถบันทึกงานสแกนออฟไลน์ได้ตามปกติ
          </p>
          <p className="mt-3 text-sm text-white/80">
            ระบบจะพยายามเชื่อมต่อและโหลดหน้าใหม่อัตโนมัติเมื่อตรวจพบสัญญาณอีกครั้ง
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-white/50">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span>กำลังรอสัญญาณเครือข่าย...</span>
          </div>
          <p className="mt-4 font-mono text-xs text-white/60">Incident: {incidentId}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <section className="max-w-lg">
        <h1 className="text-xl font-bold text-[#102C57]">ไม่สามารถโหลดหน้านี้ได้</h1>
        <p className="mt-3 text-sm text-slate-600">
          กรุณาลองโหลดหน้าอีกครั้ง หากยังไม่สำเร็จให้ปิดแล้วเปิดแอปใหม่
        </p>
        <p className="mt-3 font-mono text-xs text-slate-500">Incident: {incidentId}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-md bg-[#102C57] px-4 py-2 text-sm font-bold text-white"
        >
          โหลดหน้าอีกครั้ง
        </button>
        {process.env.NODE_ENV !== "production" && error?.message ? (
          <pre className="mt-5 overflow-auto text-left text-xs text-slate-500">{error.message}</pre>
        ) : null}
      </section>
    </main>
  );
}
