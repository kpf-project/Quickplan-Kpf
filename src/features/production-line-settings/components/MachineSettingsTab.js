"use client";

import { useMemo, useState } from "react";
import { Printer, RefreshCw, Save } from "lucide-react";

const STORAGE_KEY = "daily_work_machine_code";
const DEFAULT_MACHINE_CODE = "P00";
const MACHINE_CODE_REGEX = /^[A-Z0-9]{2,8}$/;

function normalizeMachineCode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!MACHINE_CODE_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function getBangkokYearBE() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
    }).formatToParts(new Date());
    const yearPart = parts.find((part) => part.type === "year")?.value;
    const gregorianYear = Number.parseInt(yearPart || "", 10);
    if (Number.isFinite(gregorianYear)) {
      return gregorianYear + 543;
    }
  } catch {
    // fallback below
  }
  return new Date().getFullYear() + 543;
}

function readMachineCodeFromBridge() {
  if (typeof window === "undefined") {
    return null;
  }
  const bridge = window.AndroidPrinter;
  if (!bridge || typeof bridge.getMachineCode !== "function") {
    return null;
  }
  try {
    return normalizeMachineCode(bridge.getMachineCode());
  } catch {
    return null;
  }
}

function loadMachineCodeFromClient() {
  if (typeof window === "undefined") {
    return {
      machineCode: DEFAULT_MACHINE_CODE,
      hasBridge: false,
    };
  }

  const hasBridge = Boolean(window.AndroidPrinter);
  const fromBridge = readMachineCodeFromBridge();
  const fromStorage = normalizeMachineCode(window.localStorage?.getItem(STORAGE_KEY));
  const machineCode = fromBridge || fromStorage || DEFAULT_MACHINE_CODE;
  return { machineCode, hasBridge };
}

async function writeMachineCodeToBridge(machineCode) {
  if (typeof window === "undefined") {
    return { status: "no-bridge" };
  }
  const bridge = window.AndroidPrinter;
  if (!bridge || typeof bridge.setMachineCode !== "function") {
    return { status: "no-bridge" };
  }
  const result = bridge.setMachineCode(machineCode);
  const value = result && typeof result.then === "function" ? await result : result;
  const normalized = normalizeMachineCode(value);
  if (typeof value === "string" && value.startsWith("error:")) {
    return { status: "error", reason: value };
  }
  if (!normalized) {
    return { status: "error", reason: "invalid_result" };
  }
  return { status: "ok", machineCode: normalized };
}

export default function MachineSettingsTab({ canManage = false }) {
  const initialClientState = useMemo(() => loadMachineCodeFromClient(), []);
  const [machineCode, setMachineCode] = useState(initialClientState.machineCode);
  const [inputValue, setInputValue] = useState(initialClientState.machineCode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [bridgeAvailable, setBridgeAvailable] = useState(initialClientState.hasBridge);

  const yearTwoDigits = useMemo(() => {
    const yearBE = getBangkokYearBE();
    return String(yearBE % 100).padStart(2, "0");
  }, []);

  const sampleDocNo = useMemo(() => {
    const candidate = normalizeMachineCode(inputValue) || machineCode || DEFAULT_MACHINE_CODE;
    return `${candidate}${yearTwoDigits}000001`;
  }, [inputValue, machineCode, yearTwoDigits]);

  const loadMachineCode = () => {
    setLoading(true);
    setStatusMessage("");
    setErrorMessage("");

    const currentClientState = loadMachineCodeFromClient();
    const resolvedMachineCode = currentClientState.machineCode || DEFAULT_MACHINE_CODE;
    setBridgeAvailable(currentClientState.hasBridge);
    setMachineCode(resolvedMachineCode);
    setInputValue(resolvedMachineCode);
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(STORAGE_KEY, resolvedMachineCode);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setStatusMessage("");
    setErrorMessage("");

    if (!canManage) {
      setErrorMessage("บัญชีนี้เป็นโหมดดูอย่างเดียว ยังไม่สามารถบันทึกรหัสเครื่องได้");
      return;
    }

    const normalized = normalizeMachineCode(inputValue);
    if (!normalized) {
      setErrorMessage("Machine Code ต้องเป็น A-Z หรือ 0-9 ความยาว 2-8 ตัวอักษร");
      return;
    }

    setSaving(true);
    const bridgeResult = await writeMachineCodeToBridge(normalized);
    if (bridgeResult.status === "error") {
      setSaving(false);
      setErrorMessage("บันทึกลง wrapper ไม่สำเร็จ กรุณาตรวจสอบแอป Sunmi Wrapper และลองใหม่");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage?.setItem(STORAGE_KEY, normalized);
    }
    setMachineCode(normalized);
    setInputValue(normalized);
    setSaving(false);
    setStatusMessage(
      bridgeResult.status === "ok"
        ? "บันทึกสำเร็จ: รหัสเครื่องถูกเก็บในเครื่องนี้แล้ว และจะใช้แยกเลขเอกสารทันที"
        : "บันทึกในเบราว์เซอร์สำเร็จ (ไม่พบ Native Wrapper)"
    );
  };

  return (
    <div className="max-w-[95%] mx-auto py-4">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--surface-navy,#102C57)]/10 flex items-center justify-center text-[#102C57]">
            <Printer size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-[#102C57]">ตั้งค่าเครื่องพิมพ์ใบงาน</h2>
            <p className="text-xs text-gray-500 mt-1">
              กำหนดรหัสเครื่องให้ไม่ซ้ำกัน เช่น P01, P02, P10 เพื่อให้เลขเอกสารแยกตามแต่ละเครื่องอัตโนมัติ
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-[#f8fafc] p-3">
            <div className="text-[11px] text-gray-500">รหัสเครื่องที่ใช้งานอยู่</div>
            <div className="text-xl font-bold tracking-wider text-[#102C57] font-mono mt-1">{machineCode}</div>
            <div className="text-[11px] text-gray-500 mt-2">
              โหมดเชื่อมต่อ: {bridgeAvailable ? "Sunmi Native Wrapper" : "Web Browser"}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-[#f8fafc] p-3">
            <div className="text-[11px] text-gray-500">ตัวอย่างเลขเอกสารปีนี้</div>
            <div className="text-xl font-bold tracking-wider text-[#102C57] font-mono mt-1">{sampleDocNo}</div>
            <div className="text-[11px] text-gray-500 mt-2">
              โครงสร้าง: [Machine Code] + [ปี พ.ศ. 2 หลัก] + [Running อย่างน้อย 6 หลัก]
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-gray-600 mb-1">Machine Code (2-8 ตัวอักษร)</label>
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            maxLength={8}
            placeholder="เช่น P01"
            className="w-full md:max-w-xs h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tracking-wider uppercase focus:ring-1 focus:ring-[#d4af37] outline-none"
            disabled={loading || saving || !canManage}
          />
          <p className="text-[11px] text-gray-500 mt-2">
            แนะนำให้ตั้งให้ตรงสติ๊กเกอร์เครื่องจริง เพื่อไม่ให้ซ้ำกันตอนใช้ 50-100 เครื่อง
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={loading || saving || !canManage}
            className="h-9 px-4 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "กำลังบันทึก..." : "บันทึกรหัสเครื่อง"}
          </button>
          <button
            onClick={loadMachineCode}
            disabled={loading || saving}
            className="h-9 px-4 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            โหลดค่าปัจจุบัน
          </button>
        </div>

        {statusMessage && (
          <div className="mt-3 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
