"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  Scan,
  SwitchCamera,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { submitAttendanceScanEvent } from "@/features/attendance/services/attendanceScanClient";
import "./scanner.css";

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ScannerPage() {
  const [scanMode, setScanMode] = useState(null); // IN | OUT | null
  const [pendingScan, setPendingScan] = useState(null); // { decodedText, source } | null
  const [showModeModal, setShowModeModal] = useState(false);
  const [scanResult, setScanResult] = useState(null); // success flag/value
  const [scanEvent, setScanEvent] = useState(null); // response payload from API
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);

  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanModeRef = useRef(null);
  const hasResultRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const keyboardBufferRef = useRef("");
  const keyboardClearTimerRef = useRef(null);
  const initScannerRef = useRef(null);

  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);
  useEffect(() => {
    hasResultRef.current = Boolean(scanResult || pendingScan);
  }, [scanResult, pendingScan]);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  const isModeSelected = scanMode !== null;
  const modeLabel = scanMode === "IN" ? "เข้างาน" : scanMode === "OUT" ? "ออกงาน" : "";

  const clearKeyboardBuffer = useCallback(() => {
    keyboardBufferRef.current = "";
    if (keyboardClearTimerRef.current) {
      clearTimeout(keyboardClearTimerRef.current);
      keyboardClearTimerRef.current = null;
    }
  }, []);

  const persistScanEvent = useCallback(async (decodedText, source = "camera", force = false) => {
    if (!scanModeRef.current || isSubmittingRef.current) return;
    setIsSubmitting(true);
    setError(null);
    setConfirmDialog(null);

    try {
      const normalizedSource = source === "scanner" ? "camera" : source;
      const result = await submitAttendanceScanEvent({
        requestId: createRequestId(),
        employeeCode: decodedText,
        eventType: scanModeRef.current,
        source: normalizedSource,
        rawQrPayload: decodedText,
        clientScannedAt: new Date().toISOString(),
        metadata: source === "scanner" ? { inputMethod: "barcode_scanner" } : undefined,
        force,
      });

      if (!result.ok || !result.data?.ok) {
        const errDetails = result.error?.details || result.data?.details || {};
        if (errDetails.errorType === "missing_check_in") {
          setIsSubmitting(false);
          setConfirmDialog({
            title: "ยังไม่ได้สแกนเข้างานนะ",
            message: "พนักงานรายนี้ยังไม่มีประวัติการลงเวลาเข้างานในวันนี้ ต้องการบันทึกเวลาออกงานเลยใช่ไหม?",
            onConfirm: () => {
              setConfirmDialog(null);
              persistScanEvent(decodedText, source, true);
            },
            onCancel: () => {
              setConfirmDialog(null);
              setScanResult(null);
              setScanEvent(null);
              setPendingScan(null);
              setError(null);
              setIsSubmitting(false);
              clearKeyboardBuffer();
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
              setTimeout(() => {
                if (scannerRef.current && !scannerRef.current.isScanning) {
                  initScannerRef.current?.(currentCameraId);
                }
              }, 100);
            }
          });
          return;
        }

        throw new Error(result.error?.message || result.data?.error || "ไม่สามารถบันทึกข้อมูลได้");
      }

      const saved = result.data.data || null;
      setScanEvent(saved);
      setScanResult(saved?.employeeCode || decodedText);
    } catch (err) {
      console.error("Attendance scan save failed:", err);
      setError(err?.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  }, [clearKeyboardBuffer, currentCameraId]);

  const handleScanDetected = useCallback(
    (decodedText, source = "camera") => {
      if (hasResultRef.current || isSubmittingRef.current) return;
      const normalizedText = String(decodedText || "").trim();
      if (!normalizedText) return;
      if (scanModeRef.current) {
        persistScanEvent(normalizedText, source);
        return;
      }
      setPendingScan({ decodedText: normalizedText, source });
      setShowModeModal(true);
    },
    [persistScanEvent]
  );

  const scheduleKeyboardBufferClear = useCallback(() => {
    if (keyboardClearTimerRef.current) {
      clearTimeout(keyboardClearTimerRef.current);
    }
    keyboardClearTimerRef.current = setTimeout(() => {
      keyboardBufferRef.current = "";
      keyboardClearTimerRef.current = null;
    }, 800);
  }, []);

  useEffect(() => {
    const handleKeyboardScan = (event) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement
        && (
          target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.isContentEditable
        );
      if (isTypingTarget) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Escape") {
        clearKeyboardBuffer();
        return;
      }

      if (event.key === "Backspace") {
        keyboardBufferRef.current = keyboardBufferRef.current.slice(0, -1);
        scheduleKeyboardBufferClear();
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const scannedText = keyboardBufferRef.current.trim();
        clearKeyboardBuffer();
        if (!scannedText) return;
        event.preventDefault();
        handleScanDetected(scannedText, "scanner");
        return;
      }

      if (event.key.length !== 1) return;

      keyboardBufferRef.current += event.key;
      scheduleKeyboardBufferClear();
    };

    window.addEventListener("keydown", handleKeyboardScan);
    return () => {
      window.removeEventListener("keydown", handleKeyboardScan);
      clearKeyboardBuffer();
    };
  }, [clearKeyboardBuffer, handleScanDetected, scheduleKeyboardBufferClear]);

  const initScanner = useCallback(
    async (cameraId) => {
      try {
        if (!document.getElementById("reader")) return;
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode("reader");
        }
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          await scanner.stop();
        }

        await scanner.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" },
          { fps: 10, aspectRatio: 1.0 },
          (decodedText) => handleScanDetected(decodedText, "camera"),
          () => {}
        );
      } catch (err) {
        console.error("Unable to start scanner:", err);
        setError("ไม่สามารถเปิดกล้องได้");
      }
    },
    [handleScanDetected]
  );

  useEffect(() => {
    initScannerRef.current = initScanner;
  }, [initScanner]);

  useEffect(() => {
    let mounted = true;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (mounted && devices?.length) {
          setCameras(devices);
        }
      })
      .catch((err) => {
        console.error("Camera list failed:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      initScanner(currentCameraId);
    }, 100);
    return () => clearTimeout(timer);
  }, [currentCameraId, initScanner]);

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (scanResult) {
      const autoResetTimer = setTimeout(() => {
        handleReset();
      }, 2000);
      return () => clearTimeout(autoResetTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanResult]);

  const handleSwitchCamera = async () => {
    if (cameras.length < 2) return;
    const currentIndex = currentCameraId
      ? cameras.findIndex((camera) => camera.id === currentCameraId)
      : 0;
    const nextIndex = (currentIndex + 1) % cameras.length;
    setCurrentCameraId(cameras[nextIndex].id);
  };

  const handleReset = () => {
    setScanResult(null);
    setScanEvent(null);
    setPendingScan(null);
    setConfirmDialog(null);
    setShowModeModal(false);
    setError(null);
    setIsSubmitting(false);
    clearKeyboardBuffer();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setTimeout(() => {
      initScanner(currentCameraId);
    }, 100);
  };

  const selectMode = (mode) => {
    setScanMode(mode);
    if (pendingScan?.decodedText) {
      persistScanEvent(pendingScan.decodedText, pendingScan.source || "camera");
      setPendingScan(null);
      setShowModeModal(false);
    }
  };

  const handleFileUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("reader");
      }
      const result = await scannerRef.current.scanFileV2(file, true);
      if (result?.decodedText) {
        handleScanDetected(result.decodedText, "upload");
      }
    } catch (err) {
      console.error("Image scan failed:", err);
      setError("ไม่พบ QR Code ในรูปภาพนี้ หรือไฟล์ไม่ถูกต้อง");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#f8f8f5] dark:bg-[#221e10] overflow-hidden transition-colors duration-300 relative font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#1c2541_0%,#0a1128_100%)] silk-texture"></div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vh] h-[120vh] opacity-[0.03] pointer-events-none select-none z-0">
        <svg className="w-full h-full stroke-[#f4c025] fill-none" strokeWidth="0.5" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="98"></circle>
          <path d="M100 15 V25 M100 175 V185 M15 100 H25 M175 100 H185" strokeWidth="2"></path>
          <text fill="#f4c025" fontFamily="serif" fontSize="12" stroke="none" x="95" y="40">
            XII
          </text>
        </svg>
      </div>

      <div className="absolute top-4 left-4 z-[60]">
        <Link
          href="/production-line/attendance"
          className="flex items-center gap-2 text-white/60 hover:text-[#f4c025] transition-colors bg-[#0a1128]/50 px-3 py-1.5 rounded-full backdrop-blur-md border border-[#f4c025]/20"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium uppercase tracking-widest hidden sm:inline">ย้อนกลับ</span>
        </Link>
      </div>

      {showModeModal && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface-navy,#102C57)] border border-[#f4c025]/50 rounded-2xl p-8 max-w-sm w-full shadow-2xl transform scale-100 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[#f4c025]/20 flex items-center justify-center shadow-[0_0_15px_rgba(244,192,37,0.2)]">
              <AlertCircle size={32} className="text-[#f4c025]" />
            </div>
            <div className="text-center">
              <h3 className="text-white text-xl font-bold mb-2">ระบุประเภทการลงเวลา</h3>
              <p className="text-white/60 text-sm">เลือกว่าจะ เข้างาน หรือ ออกงาน</p>
            </div>
            <div className="flex gap-4 w-full">
              <button
                onClick={() => selectMode("IN")}
                className="flex-1 py-4 rounded-xl bg-[#f4c025] text-[#0a1128] font-bold hover:scale-105 transition-transform shadow-[0_4px_14px_rgba(244,192,37,0.4)]"
              >
                เข้างาน
              </button>
              <button
                onClick={() => selectMode("OUT")}
                className="flex-1 py-4 rounded-xl bg-transparent border-2 border-[#f4c025] text-[#f4c025] font-bold hover:bg-[#f4c025]/10 transition-all"
              >
                ออกงาน
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface-navy,#102C57)] border border-[#f4c025]/50 rounded-2xl p-8 max-w-sm w-full shadow-2xl transform scale-100 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[#f4c025]/20 flex items-center justify-center shadow-[0_0_15px_rgba(244,192,37,0.2)]">
              <AlertCircle size={32} className="text-[#f4c025]" />
            </div>
            <div className="text-center">
              <h3 className="text-white text-xl font-bold mb-2">{confirmDialog.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-4 w-full">
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 py-4 rounded-xl bg-[#f4c025] text-[#0a1128] font-bold hover:scale-105 transition-transform shadow-[0_4px_14px_rgba(244,192,37,0.4)]"
              >
                ใช่
              </button>
              <button
                onClick={confirmDialog.onCancel}
                className="flex-1 py-4 rounded-xl bg-transparent border-2 border-slate-500 text-white font-bold hover:bg-white/10 transition-all"
              >
                ไม่
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full grow layout-container min-h-[100dvh]">
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 w-full max-w-4xl mx-auto overflow-y-auto min-h-0">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

          <header className="flex flex-col items-center justify-center mb-2 md:mb-6 shrink-0 transition-all duration-300">
            <div className={`flex items-center gap-3 mb-1 transition-colors duration-300 ${isModeSelected ? "text-[#f4c025]" : "text-slate-500"}`}>
              <Scan size={36} strokeWidth={1} />
            </div>
            <h2 className="text-[#f4c025] text-sm sm:text-xl md:text-2xl uppercase tracking-[0.2em] font-medium opacity-80">
              {isModeSelected ? (scanMode === "IN" ? "CHECK-IN MODE" : "CHECK-OUT MODE") : "STANDBY MODE"}
            </h2>
            <h1 className="text-white text-4xl sm:text-6xl md:text-7xl font-normal italic tracking-wide mt-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              {isModeSelected ? `ลงเวลา${modeLabel}` : "กรุณาเลือกโหมด"}
            </h1>
          </header>

          <div
            className={`relative group w-full max-w-full md:max-w-md aspect-square md:aspect-[4/3] rounded-md overflow-hidden bg-black/40 shadow-2xl shrink-0 transition-all duration-500 border-2 ${
              isModeSelected ? "border-[#f4c025] shadow-[0_0_30px_rgba(244,192,37,0.2)]" : "border-slate-700"
            }`}
          >
            <div id="reader" className="w-full h-full bg-cover bg-center opacity-90"></div>

            {scanResult && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 text-center p-4 animate-in fade-in duration-300">
                <CheckCircle2 size={64} className="text-[#f4c025] mb-4 drop-shadow-[0_0_10px_rgba(244,192,37,0.5)]" />
                <h3 className="text-white text-2xl font-bold mb-2">บันทึกสำเร็จ!</h3>
                <div className="bg-[var(--surface-navy,#102C57)] px-6 py-2 rounded-lg border border-[#f4c025]/30 mb-4">
                  <span className="text-xl font-bold text-[#f4c025]">{scanMode === "IN" ? "เข้างาน" : "ออกงาน"}</span>
                </div>
                <div className="text-white/80 text-sm space-y-1 mb-6">
                  <p className="font-mono break-all">{scanEvent?.employeeCode || scanResult}</p>
                  <p>{scanEvent?.snapshot?.name || "-"}</p>
                  <p>
                    {scanEvent?.snapshot?.department || "-"} / {scanEvent?.snapshot?.branch || "-"}
                  </p>
                  <p className="font-mono text-xs">
                    IN {scanEvent?.snapshot?.checkIn || "-"} | OUT {scanEvent?.snapshot?.checkOut || "-"}
                  </p>
                  <p className="text-xs">ผู้สแกน: {scanEvent?.scannedBy?.username || "-"}</p>
                  <p className="font-mono text-[10px] text-white/50">{scanEvent?.scannedAt || "-"}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-8 py-3 bg-[#f4c025] text-[#0a1128] font-bold rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(244,192,37,0.4)]"
                  autoFocus
                >
                  สแกนคนต่อไป
                </button>
              </div>
            )}

            {isSubmitting && !scanResult && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 text-center p-4">
                <Loader2 size={44} className="text-[#f4c025] mb-4 animate-spin" />
                <p className="text-white text-lg font-semibold">กำลังบันทึกข้อมูล...</p>
                <p className="text-white/60 text-xs mt-1">กำลังดึงข้อมูลพนักงานและบันทึกลงระบบ</p>
              </div>
            )}

            {!scanResult && (
              <div className="absolute top-4 right-4 z-40 flex flex-col gap-3">
                {cameras.length > 1 && (
                  <button
                    onClick={handleSwitchCamera}
                    className="p-2 bg-black/50 text-[#f4c025] rounded-full hover:bg-[#f4c025] hover:text-[#0a1128] transition-colors border border-[#f4c025]/30"
                  >
                    <SwitchCamera size={20} />
                  </button>
                )}
                <button
                  onClick={handleFileUploadClick}
                  className="p-2 bg-black/50 text-[#f4c025] rounded-full hover:bg-[#f4c025] hover:text-[#0a1128] transition-colors border border-[#f4c025]/30"
                  title="อัปโหลดรูปภาพ"
                >
                  <ImageIcon size={20} />
                </button>
              </div>
            )}

            {isModeSelected && !scanResult && (
              <div className="absolute left-4 right-4 h-[2px] bg-[#f4c025] shadow-[0_0_15px_#f4c025] animate-scan z-10 rounded-full pointer-events-none"></div>
            )}

            {!isModeSelected && !scanResult && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                <span className="text-white/50 text-sm uppercase tracking-widest font-light">รอเลือกโหมด...</span>
              </div>
            )}

            <div className={`absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 rounded-tl-sm z-20 transition-colors ${isModeSelected ? "border-[#f4c025]" : "border-slate-600"}`}></div>
            <div className={`absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 rounded-tr-sm z-20 transition-colors ${isModeSelected ? "border-[#f4c025]" : "border-slate-600"}`}></div>
            <div className={`absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 rounded-bl-sm z-20 transition-colors ${isModeSelected ? "border-[#f4c025]" : "border-slate-600"}`}></div>
            <div className={`absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 rounded-br-sm z-20 transition-colors ${isModeSelected ? "border-[#f4c025]" : "border-slate-600"}`}></div>
          </div>

          <div className="mt-8 text-center space-y-2 px-4 md:px-0 h-16">
            {!scanResult && (
              <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
                <h3 className={`text-2xl font-light tracking-wide ${isModeSelected ? "text-white" : "text-slate-400"}`}>
                  {isModeSelected ? "พร้อมสแกน QR Code / เครื่องยิงบาร์โค้ด" : "กรุณาเลือกปุ่ม เข้างาน หรือ ออกงาน"}
                </h3>
                <p className="text-sm text-slate-500">
                  {isModeSelected ? "ใช้กล้องสแกน หรือยิงจากเครื่องสแกนบาร์โค้ดแล้วกด Enter" : "เพื่อเริ่มดำเนินการสแกน"}
                </p>
                {error && <p className="text-red-300 text-xs mt-1">{error}</p>}
              </div>
            )}
          </div>

          <div className="mt-4 md:mt-8 flex flex-row gap-5 w-full justify-center max-w-lg shrink-0 px-4 md:px-0">
            <button
              onClick={() => selectMode("IN")}
              className={`relative overflow-hidden group flex-1 h-16 rounded-md shadow-[0_4px_14px_0_rgba(244,192,37,0.39)] transition-all duration-300 transform 
              ${
                scanMode === "IN"
                  ? "opacity-100 scale-105 ring-2 ring-white ring-offset-2 ring-offset-[#0a1128] shadow-[0_0_20px_rgba(244,192,37,0.5)]"
                  : scanMode === "OUT"
                    ? "opacity-30 grayscale scale-95"
                    : "opacity-60 hover:opacity-100 hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(244,192,37,0.23)] active:scale-[0.98]"
              }`}
            >
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#f9d45e_0%,#f4c025_50%,#d4a017_100%)] opacity-90 transition-opacity group-hover:opacity-100"></div>
              <div className="absolute inset-0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"></div>
              <div className="relative flex items-center justify-center gap-2 text-[#0a1128] font-bold text-lg md:text-xl tracking-wide w-full h-full">
                <LogIn size={24} className="w-6 h-6 md:w-7 md:h-7" />
                <span className="truncate">เข้างาน</span>
              </div>
            </button>

            <button
              onClick={() => selectMode("OUT")}
              className={`flex-1 h-16 rounded-md border border-[#f4c025]/50 text-[#f4c025] bg-transparent hover:bg-[#f4c025]/10 hover:border-[#f4c025] transition-all duration-300 transform flex items-center justify-center gap-2 font-medium text-lg md:text-xl tracking-wide backdrop-blur-sm
              ${
                scanMode === "OUT"
                  ? "bg-[#f4c025]/20 border-[#f4c025] shadow-[0_0_15px_rgba(244,192,37,0.3)] opacity-100 scale-105 ring-1 ring-[#f4c025] text-white"
                  : scanMode === "IN"
                    ? "opacity-30 scale-95"
                    : "opacity-60 hover:opacity-100 hover:scale-[1.02] active:scale-[0.98]"
              }`}
            >
              <LogOut size={24} className="w-6 h-6 md:w-7 md:h-7" />
              <span className="truncate">ออกงาน</span>
            </button>
          </div>
        </div>

        <div className="text-center py-6 text-[#f4c025]/30 text-xs tracking-widest uppercase mt-auto">
          Secure Terminal • ID: PROD-LINE-001
        </div>
      </div>
    </div>
  );
}
