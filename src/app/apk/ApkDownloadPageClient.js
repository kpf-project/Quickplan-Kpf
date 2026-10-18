"use client";

import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, Copy, Download, ShieldCheck, Smartphone } from "lucide-react";

export default function ApkDownloadPageClient({ release, baseUrl }) {
  const [copied, setCopied] = useState(false);

  const downloadPath = useMemo(() => {
    return `/apk/${release.fileName}`;
  }, [release.fileName]);

  const downloadUrl = useMemo(() => {
    const normalizedBase = (baseUrl || "").replace(/\/$/, "");
    if (!normalizedBase) {
      return downloadPath;
    }
    return `${normalizedBase}${downloadPath}`;
  }, [baseUrl, downloadPath]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f1f5f9] text-[#102C57]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(212,175,55,0.16),transparent_42%),radial-gradient(circle_at_85%_12%,rgba(16,44,87,0.12),transparent_42%)]" />
        <div className="absolute -left-28 top-28 h-64 w-64 rounded-full bg-[#d4af37]/15 blur-3xl" />
        <div className="absolute -right-24 bottom-16 h-64 w-64 rounded-full bg-[var(--surface-navy,#102C57)]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-[#102C57]/15 bg-white/85 p-6 shadow-[0_20px_50px_rgba(16,44,87,0.12)] backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-[#d4af37]/50 bg-[#fdf7e6] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-[#8a6b10]">
              KPF Production Line
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Ready To Install
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102C57] sm:text-4xl">
            ติดตั้ง SUNMI V3 Wrapper
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#334155] sm:text-base">
            ดาวน์โหลดเวอร์ชันล่าสุดและติดตั้งบนเครื่อง POS SUNMI V3 ได้ทันทีผ่านลิงก์หรือ QR
            โดยไม่ต้องใช้ PowerShell ที่เครื่องปลายทาง
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border border-[#102C57]/10 bg-gradient-to-br from-[#102C57] to-[#1d3f75] p-5 text-white shadow-xl sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f2d68a]">Latest Release</p>
              <p className="mt-2 text-2xl font-black">v{release.version}</p>
              <p className="mt-1 text-xs text-white/80">Released: {release.releaseDate}</p>

              <div className="mt-4 rounded-xl border border-white/15 bg-black/15 px-4 py-3 text-xs text-white/90">
                <p>Package: {release.packageName}</p>
                <p className="mt-1">ขั้นต่ำ: {release.minAndroid}</p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a
                  href={downloadPath}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[#d4af37] px-5 text-sm font-bold text-[#102C57] shadow-[0_12px_24px_rgba(212,175,55,0.35)] transition hover:bg-[#c39a21] motion-safe:hover:-translate-y-0.5"
                >
                  <Download className="mr-2 h-4 w-4" />
                  ดาวน์โหลด APK ล่าสุด
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#102C57]/10 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#102C57]/70">Install By QR</p>
              <div className="mt-3 flex justify-center rounded-2xl border border-[#102C57]/10 bg-[#f8fafc] p-4">
                <QRCode value={downloadUrl} size={170} />
              </div>
              <p className="mt-3 text-center text-[11px] text-[#64748b]">สแกน QR นี้จากเครื่อง SUNMI เพื่อดาวน์โหลดได้ทันที</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#102C57]/10 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#102C57]/70">Quick Steps</p>
            <ol className="mt-4 space-y-3 text-sm text-[#334155]">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-navy,#102C57)] text-[11px] font-bold text-white">1</span>
                เปิดสิทธิ์{" "}
                <span className="font-semibold">Install unknown apps</span>{" "}
                ให้ Browser หรือ File Manager
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-navy,#102C57)] text-[11px] font-bold text-white">2</span>
                กดปุ่มดาวน์โหลด หรือสแกน QR เพื่อโหลดไฟล์ APK
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-navy,#102C57)] text-[11px] font-bold text-white">3</span>
                กด Install และเปิดแอป จากนั้นทดสอบพิมพ์ 1 ใบ
              </li>
            </ol>
          </div>

          <div className="rounded-2xl border border-[#d4af37]/35 bg-[#fdf7e6] p-6 shadow-sm">
            <p className="inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a6b10]">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Important Rules
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[#7c5e0d]">
              <li>ใช้ไฟล์ที่เซ็นด้วย keystore เดิมเท่านั้น เพื่อให้อัปเดตทับได้</li>
              <li>ปล่อยเวอร์ชันใหม่ต้องเพิ่ม versionCode ทุกครั้ง</li>
              <li>แนะนำติดตั้งผ่าน Wi-Fi ที่เสถียรเพื่อลดไฟล์โหลดเสียหาย</li>
            </ul>

            <div className="mt-5 rounded-xl border border-[#d4af37]/35 bg-white/70 px-4 py-3 text-xs text-[#7c5e0d]">
              <p className="flex items-center font-semibold">
                <Smartphone className="mr-1.5 h-4 w-4" />
                Direct APK Link
              </p>
              <p className="mt-1 break-all font-mono">{downloadUrl}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
