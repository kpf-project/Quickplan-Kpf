"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardX,
  FileWarning,
  Filter,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

const fetcher = async (url) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "โหลดข้อมูลไม่สำเร็จ");
  }
  return payload;
};

const STATUS_LABELS = {
  draft: "ร่าง",
  pending_verify: "รอตรวจ",
  published: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  closed: "ปิดแผน",
  cancelled: "ยกเลิก",
};

function formatQty(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDate(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
  return raw.split("-").reverse().join("/");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function buildWarehouseMaterialRows(rows = []) {
  const rowMap = new Map();

  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const materialCode = String(item?.materialCode || "").trim();
    const materialGoodsCode = String(item?.materialGoodsCode || materialCode).trim();
    const stockSkuCode = String(item?.stockSkuCode || materialCode).trim();
    const unit = String(item?.unit || "").trim();
    const key = `${stockSkuCode || materialCode}::${materialGoodsCode || materialCode}::${unit}`;

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        ...item,
        materialCode,
        materialGoodsCode: materialGoodsCode || materialCode,
        stockSkuCode: stockSkuCode || materialCode,
        requiredQty: 0,
        originalRequiredQty: 0,
        stockQty: Number(item?.stockQty || 0),
        shortageQty: 0,
      });
    }

    const current = rowMap.get(key);
    current.requiredQty += Number(item?.requiredQty || 0);
    current.originalRequiredQty += Number(item?.originalRequiredQty ?? item?.requiredQty ?? 0);

    const stockQty = Number(item?.stockQty || 0);
    if (stockQty > current.stockQty) {
      current.stockQty = stockQty;
    }
  });

  return Array.from(rowMap.values()).map((item) => {
    const requiredQty = Number(item.requiredQty || 0);
    const stockQty = Number(item.stockQty || 0);
    const shortageQty = Math.max(0, requiredQty - stockQty);
    return {
      ...item,
      requiredQty,
      originalRequiredQty: Number(item.originalRequiredQty || requiredQty),
      stockQty,
      shortageQty,
      status: shortageQty > 0 ? "shortage" : "sufficient",
    };
  });
}

function StatusBadge({ status }) {
  const normalized = String(status || "draft").trim();
  const label = STATUS_LABELS[normalized] || normalized || "-";
  const style = normalized === "pending_verify"
    ? "border-amber-300 bg-amber-50 text-amber-800"
    : normalized === "published"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : normalized === "rejected"
        ? "border-red-300 bg-red-50 text-red-800"
        : "border-slate-300 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center border px-2 py-1 text-[11px] font-bold ${style}`}>
      {label}
    </span>
  );
}

function KpiTile({ icon: Icon, label, value, tone = "navy" }) {
  const tones = {
    navy: "border-[#102C57]/20 bg-white text-[#102C57]",
    gold: "border-[#d4af37]/50 bg-[#fff8dd] text-[#6b4f13]",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className={`flex min-h-[74px] items-center justify-between border px-4 py-3 ${tones[tone] || tones.navy}`}>
      <div>
        <div className="text-[11px] font-semibold text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-extrabold">{value}</div>
      </div>
      <Icon size={24} strokeWidth={1.8} />
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center border border-dashed border-slate-300 bg-white px-4 text-center">
      <FileWarning className="text-slate-400" size={34} strokeWidth={1.7} />
      <div className="mt-3 text-sm font-bold text-[#102C57]">{title}</div>
      <div className="mt-1 max-w-lg text-xs text-slate-500">{detail}</div>
    </div>
  );
}

export default function WarehouseMaterialVerificationClient({
  initialMasterPlanNo = "",
  initialDateFrom = "",
  initialDateTo = "",
  planOptions = [],
}) {
  const [masterPlanNo, setMasterPlanNo] = useState(initialMasterPlanNo);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("shortage");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const summaryUrl = masterPlanNo
    ? `/api/production-planning/material-verify/summary?masterPlanNo=${encodeURIComponent(masterPlanNo)}`
    : null;

  const detailUrl = useMemo(() => {
    if (!masterPlanNo) return null;
    const params = new URLSearchParams({
      masterPlanNo,
      grain: "daily",
      dateFrom,
      dateTo,
    });
    return `/api/production-planning/material-verify?${params.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const {
    data: summaryData,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR(summaryUrl, fetcher, { revalidateOnFocus: false });

  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR(detailUrl, fetcher, { revalidateOnFocus: false });

  const consolidated = useMemo(
    () => (Array.isArray(summaryData?.consolidated) ? summaryData.consolidated : []),
    [summaryData?.consolidated]
  );
  const warehouseRows = useMemo(() => buildWarehouseMaterialRows(consolidated), [consolidated]);
  const breakdown = useMemo(
    () => (Array.isArray(summaryData?.breakdown) ? summaryData.breakdown : []),
    [summaryData?.breakdown]
  );
  const status = summaryData?.status || "draft";
  const isPending = status === "pending_verify";
  const shortageRows = warehouseRows.filter((item) => Number(item?.shortageQty || 0) > 0);
  const enoughRows = warehouseRows.filter((item) => Number(item?.shortageQty || 0) <= 0);
  const shortageQty = shortageRows.reduce((sum, item) => sum + Number(item?.shortageQty || 0), 0);
  const sourcePlans = breakdown.reduce((sum, dept) => {
    const sections = Array.isArray(dept?.sections) ? dept.sections : [];
    return sum + sections.reduce((sectionSum, section) => {
      const dates = Array.isArray(section?.dates) ? section.dates : [];
      return sectionSum + dates.reduce((dateSum, date) => (
        dateSum + (Array.isArray(date?.products) ? date.products.length : 0)
      ), 0);
    }, 0);
  }, 0);

  const filteredRows = useMemo(() => {
    const text = normalizeText(query);
    return warehouseRows
      .filter((item) => {
        if (viewMode === "shortage" && Number(item?.shortageQty || 0) <= 0) return false;
        if (viewMode === "enough" && Number(item?.shortageQty || 0) > 0) return false;
        if (!text) return true;
        return [
          item?.materialCode,
          item?.materialGoodsCode,
          item?.stockSkuCode,
          item?.materialName,
          item?.unit,
        ].some((value) => normalizeText(value).includes(text));
      })
      .sort((left, right) => {
        const leftShort = Number(left?.shortageQty || 0);
        const rightShort = Number(right?.shortageQty || 0);
        if (rightShort !== leftShort) return rightShort - leftShort;
        return String(left?.materialCode || "").localeCompare(String(right?.materialCode || ""));
      });
  }, [query, viewMode, warehouseRows]);

  const materialView = detailData?.materialView || {};
  const dates = Array.isArray(detailData?.dates) ? detailData.dates : [];
  const ownerMaterials = Array.isArray(materialView?.materials) ? materialView.materials : [];
  const ownerPendingCells = ownerMaterials.reduce((sum, material) => {
    return sum + dates.reduce((dateSum, date) => {
      const cell = material?.byDate?.[date];
      if (!cell) return dateSum;
      return dateSum + Number(cell.unclaimedRows || 0);
    }, 0);
  }, 0);

  const refresh = useCallback(async () => {
    setMessage("");
    setError("");
    await Promise.all([mutateSummary(), mutateDetail()]);
  }, [mutateDetail, mutateSummary]);

  const submitAction = useCallback(async (action) => {
    if (!masterPlanNo || isSubmitting) return;
    if (action === "reject" && !reason.trim()) {
      setError("กรุณาระบุเหตุผลก่อนปฏิเสธแผน");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/production-planning/material-verify/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          action,
          reason: reason.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "ทำรายการไม่สำเร็จ");
      }
      setReason("");
      setMessage(action === "accept" ? "อนุมัติวัตถุดิบและเผยแพร่แผนแล้ว" : "ส่งกลับให้ไลน์ผลิตแก้ไขแผนแล้ว");
      await Promise.all([mutateSummary(), mutateDetail()]);
    } catch (err) {
      setError(err?.message || "ทำรายการไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, masterPlanNo, mutateDetail, mutateSummary, reason]);

  const isLoading = summaryLoading || detailLoading;
  const loadError = summaryError?.message || detailError?.message || "";
  const canAccept = isPending && warehouseRows.length > 0 && shortageRows.length === 0;
  const canReject = isPending && warehouseRows.length > 0;

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#102C57]">
      <section className="border-b border-[#102C57]/15 bg-[#071b35] px-4 py-4 text-white lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border border-[#d4af37]/70 bg-[#102C57] text-[#d4af37]">
              <Warehouse size={24} strokeWidth={1.8} />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#d4af37]">RAW MATERIAL CONTROL</div>
              <h1 className="text-xl font-extrabold text-white">ตรวจสอบวัตถุดิบก่อนยืนยันแผน</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <button
              type="button"
              onClick={refresh}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-2 border border-white/25 px-3 text-xs font-bold text-white transition hover:border-[#d4af37] hover:text-[#d4af37] disabled:opacity-50"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
              รีเฟรช
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-3 px-4 py-4 lg:px-6">
        <section className="border border-slate-200 bg-white p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_160px_160px_minmax(220px,1fr)]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">แผนหลัก</span>
              <select
                value={masterPlanNo}
                onChange={(event) => setMasterPlanNo(event.target.value)}
                className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-[#102C57] outline-none transition focus:border-[#d4af37]"
              >
                <option value="">เลือกแผนที่ต้องตรวจ</option>
                {planOptions.map((planNo) => (
                  <option key={planNo} value={planNo}>{planNo}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">ตั้งแต่วันที่</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-10 w-full border border-slate-300 px-3 text-sm outline-none transition focus:border-[#d4af37]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">ถึงวันที่</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-10 w-full border border-slate-300 px-3 text-sm outline-none transition focus:border-[#d4af37]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">ค้นหาวัตถุดิบ</span>
              <div className="flex h-10 items-center border border-slate-300 px-3 focus-within:border-[#d4af37]">
                <Search size={16} className="mr-2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="รหัส, ชื่อ, หน่วย"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>
          </div>
        </section>

        {message ? (
          <div className="border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error || loadError ? (
          <div className="border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">
            {error || loadError}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiTile icon={ClipboardCheck} label="รายการทั้งหมด" value={formatQty(warehouseRows.length, 0)} />
          <KpiTile icon={CheckCircle2} label="เพียงพอ" value={formatQty(enoughRows.length, 0)} tone="green" />
          <KpiTile icon={AlertTriangle} label="ขาดแคลน" value={formatQty(shortageRows.length, 0)} tone="red" />
          <KpiTile icon={PackageCheck} label="ยอดขาดรวม" value={formatQty(shortageQty)} tone="gold" />
          <KpiTile icon={CalendarDays} label="แผนต้นทาง" value={formatQty(sourcePlans, 0)} />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-[#d4af37]" />
                <h2 className="text-sm font-extrabold text-[#102C57]">รายการวัตถุดิบที่คลังต้องตรวจ</h2>
              </div>
              <div className="flex gap-1">
                {[
                  ["shortage", "เฉพาะขาด"],
                  ["all", "ทั้งหมด"],
                  ["enough", "เฉพาะพอ"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`h-8 border px-3 text-[11px] font-bold transition ${
                      viewMode === mode
                        ? "border-[#102C57] bg-[#102C57] text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-[#d4af37]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!masterPlanNo ? (
              <EmptyState title="เลือกแผนหลักก่อน" detail="เลือกเลขแผนด้านบนเพื่อโหลดรายการวัตถุดิบที่รอคลังตรวจ" />
            ) : filteredRows.length === 0 && !isLoading ? (
              <EmptyState title="ไม่พบรายการตามตัวกรอง" detail="ลองเปลี่ยนตัวกรองหรือคำค้นหา หากแผนยังไม่ถูกส่งตรวจ สถานะจะยังไม่เป็นรอตรวจ" />
            ) : (
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[#102C57] text-left text-[11px] font-bold text-white">
                    <tr>
                      <th className="px-3 py-3">รหัสวัตถุดิบ</th>
                      <th className="px-3 py-3">ชื่อวัตถุดิบ</th>
                      <th className="px-3 py-3 text-right">ต้องใช้</th>
                      <th className="px-3 py-3 text-right">สต็อคคลัง</th>
                      <th className="px-3 py-3 text-right">ยอดขาด</th>
                      <th className="px-3 py-3 text-center">หน่วย</th>
                      <th className="px-3 py-3 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((item, index) => {
                      const shortage = Number(item?.shortageQty || 0);
                      const materialCode = item?.materialGoodsCode && item.materialGoodsCode !== item.materialCode
                        ? item.materialGoodsCode
                        : item.materialCode;
                      return (
                        <tr key={`${item?.materialCode || "material"}-${item?.materialGoodsCode || index}`} className={shortage > 0 ? "bg-red-50/35" : "hover:bg-slate-50"}>
                          <td className="px-3 py-3 align-top">
                            <div className="font-mono text-sm font-extrabold text-[#102C57]">{materialCode || "-"}</div>
                            {item?.stockSkuCode && item.stockSkuCode !== materialCode ? (
                              <div className="mt-0.5 text-[10px] font-semibold text-slate-400">stock {item.stockSkuCode}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="max-w-[340px] font-semibold text-slate-800">{item?.materialName || "-"}</div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono align-top text-slate-800">{formatQty(item?.requiredQty)}</td>
                          <td className="px-3 py-3 text-right font-mono align-top text-slate-800">{formatQty(item?.stockQty)}</td>
                          <td className={`px-3 py-3 text-right font-mono align-top font-extrabold ${shortage > 0 ? "text-red-700" : "text-slate-400"}`}>
                            {shortage > 0 ? formatQty(shortage) : "-"}
                          </td>
                          <td className="px-3 py-3 text-center align-top text-xs font-bold text-slate-600">{item?.unit || "-"}</td>
                          <td className="px-3 py-3 text-center align-top">
                            <span className={`inline-flex min-w-[72px] justify-center border px-2 py-1 text-[11px] font-bold ${
                              shortage > 0
                                ? "border-red-200 bg-red-100 text-red-800"
                                : "border-emerald-200 bg-emerald-100 text-emerald-800"
                            }`}
                            >
                              {shortage > 0 ? "ไม่พอ" : "เพียงพอ"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <section className="border border-[#102C57]/20 bg-white">
              <div className="border-b border-slate-200 px-3 py-2">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#102C57]">
                  <ShieldCheck size={17} className="text-[#d4af37]" />
                  การตัดสินใจของคลัง
                </h2>
              </div>
              <div className="space-y-3 p-3">
                <div className="text-xs leading-5 text-slate-600">
                  อนุมัติได้เมื่อระบบไม่พบยอดขาด หากปฏิเสธ ไลน์ผลิตต้องแก้แผนแล้วส่งตรวจใหม่เพื่อสร้าง snapshot รอบใหม่
                </div>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  placeholder="เหตุผลเมื่อปฏิเสธ เช่น ของไม่พอ, LOT ใช้ไม่ได้, รอของเข้า"
                  className="w-full resize-none border border-slate-300 p-3 text-sm outline-none transition focus:border-[#d4af37]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => submitAction("reject")}
                    disabled={!canReject || isSubmitting}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-red-300 bg-white text-xs font-extrabold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ClipboardX size={15} />
                    ปฏิเสธ
                  </button>
                  <button
                    type="button"
                    onClick={() => submitAction("accept")}
                    disabled={!canAccept || isSubmitting}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-[#d4af37] bg-[#102C57] text-xs font-extrabold text-white transition hover:bg-[#0b2142] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ClipboardCheck size={15} />
                    อนุมัติ
                  </button>
                </div>
                {!isPending ? (
                  <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                    แผนนี้ไม่ได้อยู่ในสถานะรอตรวจ
                  </div>
                ) : shortageRows.length > 0 ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                    ยังมีรายการขาด {formatQty(shortageRows.length, 0)} รายการ ระบบจึงปิดปุ่มอนุมัติไว้
                  </div>
                ) : null}
              </div>
            </section>

            <section className="border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2">
                <h2 className="text-sm font-extrabold text-[#102C57]">แหล่งที่มาของ demand</h2>
              </div>
              <div className="max-h-[300px] overflow-auto p-3">
                {breakdown.length === 0 ? (
                  <div className="text-xs text-slate-500">ยังไม่มีรายละเอียดแผนต้นทาง</div>
                ) : (
                  <div className="space-y-2">
                    {breakdown.slice(0, 8).map((dept) => (
                      <div key={dept?.id || dept?.name} className="border border-slate-200 p-2">
                        <div className="text-xs font-extrabold text-[#102C57]">{dept?.name || "ไม่ระบุแผนก"}</div>
                        {(dept?.sections || []).slice(0, 3).map((section) => (
                          <div key={section?.id || section?.name} className="mt-2 border-t border-slate-100 pt-2">
                            <div className="text-[11px] font-bold text-slate-500">{section?.name || "ไม่ระบุ section"}</div>
                            {(section?.dates || []).slice(0, 3).map((date) => (
                              <div key={date?.date} className="mt-1 text-[11px] text-slate-600">
                                <span className="font-bold text-[#6b4f13]">{formatDate(date?.date)}</span>
                                <span> · </span>
                                <span>{formatQty((date?.products || []).length, 0)} แผน</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold text-slate-500">งานที่ยังไม่ถูกเบิกในช่วงวันที่เลือก</div>
              <div className="mt-1 text-2xl font-extrabold text-[#102C57]">{formatQty(ownerPendingCells, 0)}</div>
              <div className="mt-1 text-xs text-slate-500">ใช้ดูภาระงานหลังอนุมัติ ก่อนเข้า flow ใบเบิก</div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
