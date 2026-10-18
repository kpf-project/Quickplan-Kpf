"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { User, Lock, Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { login } from "@/features/auth/services/authClient";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (retryAfterSeconds <= 0) {
      return undefined;
    }
    const timer = setInterval(() => {
      setRetryAfterSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  const formatRetryAfter = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")} นาที`;
  };

  const handlePasswordKeyState = (event) => {
    setIsCapsLockOn(Boolean(event.getModifierState?.("CapsLock")));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (retryAfterSeconds > 0) {
      setErrorMessage(`พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่อีก ${formatRetryAfter(retryAfterSeconds)}`);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const trimmed = username.trim();
    if (!trimmed) {
      setErrorMessage("กรุณาระบุชื่อผู้ใช้หรืออีเมล");
      setLoading(false);
      return;
    }

    const response = await login({
      username: trimmed,
      password,
      rememberDevice,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) {
        const retrySeconds = Number(
          payload?.details?.retryAfterSeconds ??
          payload?.retryAfterSeconds ??
          0
        );
        const normalizedRetry = Number.isFinite(retrySeconds) && retrySeconds > 0
          ? Math.ceil(retrySeconds)
          : 60;
        setRetryAfterSeconds(normalizedRetry);
        setErrorMessage(`พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่อีก ${formatRetryAfter(normalizedRetry)}`);
        setLoading(false);
        return;
      }
      setErrorMessage(payload?.error || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      setLoading(false);
      return;
    }

    setRetryAfterSeconds(0);
    setLoading(false);
    const paramNext =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("next");

    const defaultNext = payload?.redirect_to || "/production-line/planning/schedule";
    const nextPath = paramNext && paramNext !== "/" ? paramNext : defaultNext;
    router.replace(nextPath);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#eef2f7] font-sans">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(16,44,87,0.08),transparent_44%),radial-gradient(circle_at_88%_84%,rgba(212,175,55,0.12),transparent_40%),linear-gradient(180deg,#f6f8fc_0%,#eef2f7_100%)]" />
        <div className="absolute left-[-8%] top-[-18%] h-[280px] w-[280px] rounded-full bg-[var(--surface-navy,#102C57)]/10 blur-3xl" />
        <div className="absolute bottom-[-18%] right-[-8%] h-[260px] w-[260px] rounded-full bg-[#d4af37]/12 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] px-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_20px_45px_rgba(2,6,23,0.12)]">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#102C57] via-[#d4af37] to-[#102C57]" />

          <div className="p-8 sm:p-10">
            <div className="mb-9 flex flex-col items-center text-center">
              <div className="relative mb-4 w-[130px] sm:w-[150px] md:w-[170px] aspect-[3/2]">
                <Image
                  src="/brand/LOGO-KPF1.png"
                  alt="KPF"
                  fill
                  priority
                  sizes="(max-width: 640px) 130px, (max-width: 768px) 150px, 170px"
                  className="object-contain"
                />
              </div>
              <h1 className="mb-1 text-2xl font-semibold uppercase tracking-[0.14em] text-[#102C57] [font-family:var(--font-geist-sans)]">
                QUICKPLAN
              </h1>
              <div className="flex items-center space-x-2">
                <div className="h-px w-8 bg-[var(--surface-navy,#102C57)]/20" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#102C57]/75">ระบบเข้าสู่ระบบ</p>
                <div className="h-px w-8 bg-[var(--surface-navy,#102C57)]/20" />
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-5">
                <div className="group">
                  <label className="ml-1 mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    รหัสพนักงาน / ชื่อผู้ใช้
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className="h-4 w-4 text-slate-400 transition-colors group-focus-within:text-[#102C57]" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="block w-full rounded border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-700 placeholder-slate-400 transition-all duration-200 focus:border-[#102C57] focus:outline-none focus:ring-2 focus:ring-[#102C57]/20"
                      placeholder="กรอกรหัสพนักงาน"
                      required
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="ml-1 mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    รหัสผ่าน
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-4 w-4 text-slate-400 transition-colors group-focus-within:text-[#102C57]" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={handlePasswordKeyState}
                      onKeyUp={handlePasswordKeyState}
                      onBlur={() => setIsCapsLockOn(false)}
                      className="block w-full rounded border border-slate-300 bg-white py-3 pl-10 pr-11 text-sm text-slate-700 placeholder-slate-400 transition-all duration-200 focus:border-[#102C57] focus:outline-none focus:ring-2 focus:ring-[#102C57]/20"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-[#102C57]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isCapsLockOn && (
                    <p className="ml-1 mt-1 text-[11px] text-amber-600">Caps Lock เปิดอยู่</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="group flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(event) => setRememberDevice(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#102C57] focus:ring-2 focus:ring-[#102C57]/20 focus:ring-offset-0"
                  />
                  <span className="ml-2 text-slate-500 transition-colors group-hover:text-slate-700">จดจำอุปกรณ์นี้</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || retryAfterSeconds > 0}
                className="relative flex w-full items-center justify-center rounded bg-[var(--surface-navy,#102C57)] py-3 text-sm font-bold tracking-wide text-white shadow-sm transition-all duration-200 hover:bg-[#0B2343] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : retryAfterSeconds > 0 ? (
                  <span>ลองใหม่ใน {formatRetryAfter(retryAfterSeconds)}</span>
                ) : (
                  <>
                    <span className="mr-2">เข้าสู่ระบบ</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {retryAfterSeconds > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  ระบบพักการลองเข้าสู่ระบบชั่วคราว กรุณาลองใหม่อีก {formatRetryAfter(retryAfterSeconds)}
                </div>
              )}

              {errorMessage && (
                <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {errorMessage}
                </div>
              )}
            </form>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-8 py-3 font-mono text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              ระบบพร้อมใช้งาน
            </span>
          </div>
        </div>

        <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest text-slate-500">
          KPF Quickplan • สำหรับผู้มีสิทธิ์เท่านั้น
        </p>
      </div>
    </div>
  );
}
