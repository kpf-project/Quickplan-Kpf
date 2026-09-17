"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle, Info, RefreshCw, Smartphone } from "lucide-react";
import PlanningHeader from "./PlanningHeader";
import {
  getBrowserPushState,
  isStandalonePwa,
  subscribeToPlanningPush,
  unsubscribeFromPlanningPush,
} from "@/lib/pushNotificationsClient";

function getStatusLabel(state) {
  if (!state.supported) return "อุปกรณ์นี้ยังไม่รองรับ Web Push";
  if (state.permission === "denied") return "ถูกบล็อกใน browser settings";
  if (state.subscribed) return "เปิดแจ้งเตือนแล้ว";
  if (state.permission === "granted") return "อนุญาตแล้ว แต่ยังไม่ได้สมัครรับแจ้งเตือน";
  return "ยังไม่ได้เปิดแจ้งเตือน";
}

export default function PlanningNotificationsClient() {
  const [state, setState] = useState({
    supported: true,
    standalone: false,
    permission: "default",
    subscribed: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  const refreshState = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      const nextState = await getBrowserPushState();
      setState({
        standalone: isStandalonePwa(),
        ...nextState,
      });
    } catch (error) {
      setErrorText(error?.message || "ตรวจสอบสถานะแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const enablePush = useCallback(async () => {
    setBusy(true);
    setMessage("");
    setErrorText("");
    try {
      const nextState = await subscribeToPlanningPush();
      setState({
        standalone: isStandalonePwa(),
        ...nextState,
      });
      setMessage("เปิดแจ้งเตือนแผนการผลิตแล้ว");
    } catch (error) {
      setErrorText(error?.message || "เปิดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  const disablePush = useCallback(async () => {
    setBusy(true);
    setMessage("");
    setErrorText("");
    try {
      const nextState = await unsubscribeFromPlanningPush();
      setState({
        standalone: isStandalonePwa(),
        ...nextState,
      });
      setMessage("ปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว");
    } catch (error) {
      setErrorText(error?.message || "ปิดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-[#102C57]">
      <PlanningHeader activeTab="notifications" maxWidth="max-w-4xl" />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${state.subscribed ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                {state.subscribed ? <Bell size={22} /> : <BellOff size={22} />}
              </div>
              <div>
                <h2 className="text-lg font-bold">{loading ? "กำลังตรวจสอบ..." : getStatusLabel(state)}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  สิทธิ์ browser: <span className="font-semibold text-slate-700">{state.permission}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  โหมด PWA: <span className="font-semibold text-slate-700">{state.standalone ? "ติดตั้งแล้ว" : "ยังไม่ได้เปิดจาก Home Screen"}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={refreshState}
                disabled={loading || busy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={14} /> รีเฟรช
              </button>
              {state.subscribed ? (
                <button
                  type="button"
                  onClick={disablePush}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <BellOff size={14} /> ปิดแจ้งเตือน
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enablePush}
                  disabled={busy || loading || !state.supported || state.permission === "denied"}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Bell size={14} /> เปิดแจ้งเตือน
                </button>
              )}
            </div>
          </div>

          {message ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}

          {errorText ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorText}</span>
            </div>
          ) : null}
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Smartphone size={16} className="text-[#d4af37]" />
              iPhone / iPad
            </div>
            <p className="mt-2 text-sm text-slate-500">
              iOS ต้องติดตั้งเว็บลง Home Screen และเปิดจากไอคอน PWA ก่อน จึงจะรับ Web Push ได้ตามข้อจำกัดของ Safari/WebKit
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Bell size={16} className="text-[#d4af37]" />
              เหตุการณ์ที่แจ้งเตือน
            </div>
            <p className="mt-2 text-sm text-slate-500">
              ระบบจะส่งเมื่อแผนหลักถูกเผยแพร่จากหน้าวางแผน และเมื่อแผนย่อยถูกยืนยันจากหน้างานแผนก
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

