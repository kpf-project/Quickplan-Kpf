"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Printer, Search } from "lucide-react";
import { useUserProfile } from "@/lib/useUserProfile";
import { calculateAverageWeightPerTin } from "@/features/production-line/utils/buildFgPackingReportRows";

function formatNumber(value, maximumFractionDigits = 3) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits });
}

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

function formatAverageWeight(row) {
  const average = calculateAverageWeightPerTin(row.actualWeightKg, row.producedTins);
  return average === null ? "—" : (average * 1000).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFgQuantity(groups = []) {
  if (!groups.length) return "-";
  return groups
    .map((row) => `${formatNumber(row.quantity)} ${row.unitName}`)
    .join(" + ");
}

export default function FgPackingReportClient({ productionDate }) {
  const { profile } = useUserProfile();
  const [searchDate, setSearchDate] = useState(productionDate);
  const [reportDate, setReportDate] = useState(productionDate);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarnings([]);
    try {
      const response = await fetch(`/api/production-line/fg-wip/packing-report?productionDate=${encodeURIComponent(reportDate)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลดรายงานการบรรจุไม่สำเร็จ");
      setRows(Array.isArray(payload?.data) ? payload.data : []);
      setWarnings(Array.isArray(payload?.warnings) ? payload.warnings : []);
    } catch (err) {
      setRows([]);
      setWarnings([]);
      setError(err?.message || "โหลดรายงานการบรรจุไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    setSearchDate(productionDate);
    setReportDate(productionDate);
  }, [productionDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleSearch = (event) => {
    event.preventDefault();
    if (!searchDate || loading) return;
    if (searchDate === reportDate) {
      void loadReport();
      return;
    }
    setReportDate(searchDate);
  };

  const printedAt = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  return (
    <section className="packing-report mx-auto w-full max-w-[1550px]">
      <style dangerouslySetInnerHTML={{ __html: `
        .packing-report { --navy: #123c6c; --navy-dark: #0b2d55; --gold: #d7a21f; --line: #c9d5e4; }
        .packing-report-shell { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: #fff; box-shadow: 0 4px 18px rgba(11, 45, 85, 0.08); }
        .packing-screen-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px; color: #fff; background: linear-gradient(135deg, var(--navy-dark), var(--navy)); }
        .packing-screen-kicker { color: var(--gold); font-size: 11px; font-weight: 900; letter-spacing: 0.18em; }
        .packing-screen-header h2 { margin: 2px 0 0; font-size: 26px; font-weight: 900; }
        .packing-screen-header p { margin: 2px 0 0; color: #dbeafe; font-size: 13px; }
        .packing-print-action { display: inline-flex; height: 40px; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(255,255,255,.35); border-radius: 8px; padding: 0 14px; background: rgba(255,255,255,.06); color: #fff; font-size: 13px; font-weight: 900; transition: 120ms ease; }
        .packing-print-action:hover { background: rgba(255,255,255,.12); }
        .packing-filter-panel { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: #f8fafc; }
        .packing-filter-panel label { display: grid; gap: 5px; color: var(--navy-dark); font-size: 12px; font-weight: 900; }
        .packing-date-input { height: 40px; min-width: 180px; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: #fff; color: #0f172a; font-size: 14px; font-weight: 700; outline: none; }
        .packing-date-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(215,162,31,.14); }
        .packing-search-action { display: inline-flex; height: 40px; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--navy-dark); border-radius: 8px; padding: 0 16px; background: var(--navy-dark); color: #fff; font-size: 13px; font-weight: 900; }
        .packing-filter-summary { margin-left: auto; align-self: center; text-align: right; color: #64748b; font-size: 11px; }
        .packing-filter-summary strong { display: block; color: var(--navy-dark); font-size: 20px; line-height: 1.1; }
        .packing-report-sheet { width: 100%; background: #fff; padding: 16px; }
        .packing-report-table { width: 100%; table-layout: fixed; border-collapse: collapse; color: #071e3d; font-size: 11.5px; line-height: 15px; }
        .packing-report-table th, .packing-report-table td { border: 1px solid #aeb9c6; padding: 5px 4px; vertical-align: middle; overflow-wrap: anywhere; }
        .packing-report-table thead tr:first-child th { background: #f1f3f5; color: #071e3d; border-color: #9eabb9; font-weight: 900; }
        .packing-report-table thead tr:nth-child(2) th { background: #f1f3f5; color: #071e3d; border-color: #9eabb9; font-weight: 900; }
        .packing-report-table tbody td { color: #050f1d; font-size: 11.5px; font-weight: 700; }
        .packing-report-table tbody tr:nth-child(even) { background: #f8fafc; }
        .packing-report-table tbody tr:hover { background: #fff8e5; }
        .packing-center-cell { text-align: center; }
        .packing-lot-line { display: flex; align-items: baseline; justify-content: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .packing-lot-line + .packing-lot-line { margin-top: 2px; }
        .packing-report-row { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          @page { size: A4 landscape; margin: 7mm; }
          body * { visibility: hidden !important; }
          .packing-report, .packing-report * { visibility: visible !important; }
          .packing-report { position: absolute; inset: 0; width: 100%; max-width: none !important; margin: 0; padding: 0; }
          .packing-report .print-hidden { display: none !important; }
          .packing-report-shell { overflow: visible; border: 0; border-radius: 0; box-shadow: none; }
          .packing-report-sheet { width: 100%; border: 0; padding: 0; box-shadow: none; }
          .packing-report-table { font-size: 9.5px; line-height: 12px; }
          .packing-report-table th, .packing-report-table td { padding: 3px 2px; }
          .packing-report-table thead { display: table-header-group; }
        }
      ` }} />

      <div className="packing-report-shell">
        <header className="packing-screen-header print-hidden">
          <div>
            <div className="packing-screen-kicker">PACKING CONTROL</div>
            <h2>รายงานการบรรจุ</h2>
            <p>ยอดยกมา · เนื้อขนม · ของเสีย · ผลผลิต · ยอดค้างไลน์ แยกตามสินค้า FG</p>
          </div>
          <button type="button" onClick={() => window.print()} disabled={loading || rows.length === 0} className="packing-print-action disabled:opacity-50">
            <Printer size={17} className="text-[#f5c84b]" />พิมพ์รายงาน A4 แนวนอน
          </button>
        </header>

        <form onSubmit={handleSearch} className="packing-filter-panel print-hidden">
          <label>
            <span className="flex items-center gap-1.5"><CalendarDays size={14} className="text-[#d7a21f]" />วันที่ผลิต</span>
            <input
              type="date"
              value={searchDate}
              onChange={(event) => setSearchDate(event.target.value)}
              className="packing-date-input"
              required
            />
          </label>
          <button type="submit" disabled={loading || !searchDate} className="packing-search-action disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}ค้นหา
          </button>
          <div className="packing-filter-summary"><span>รายการในรายงาน</span><strong>{rows.length.toLocaleString("th-TH")}</strong></div>
        </form>

        {error ? <div className="print-hidden m-4 border border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {warnings.length > 0 ? (
          <div className="print-hidden m-4 border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {warnings.join(" · ")}
          </div>
        ) : null}

        <div className="packing-report-sheet">
        <header className="mb-3 flex items-start justify-between border-b-2 border-black pb-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/LOGO-KPF1.png" alt="KPF" className="h-10 w-auto object-contain" />
            <div><strong className="block text-sm text-black">บริษัท เคพีฟู้ดส์ จำกัด</strong><span className="text-[9px] font-bold text-black">K.P. foods Co.,Ltd.</span></div>
          </div>
          <div className="text-center text-black">
            <h1 className="text-xl font-black leading-none">รายงานการบรรจุ</h1>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em]">Packing Production Report</p>
          </div>
          <div className="text-right text-[9px] leading-tight text-black">
            <div><strong>วันที่พิมพ์:</strong> {printedAt}</div>
            <div><strong>ผู้ออกรายงาน:</strong> {profile?.username || profile?.name || "System"}</div>
            <div><strong>หน้ากระดาษ:</strong> A4 แนวนอน</div>
          </div>
        </header>

        <div className="mb-3 grid grid-cols-3 border-t border-dashed border-black pt-2 text-[10px] text-black">
          <div><strong>แผนก:</strong> ฝ่ายผลิต KP13</div>
          <div className="text-center"><strong>วันที่ผลิต:</strong> {formatDate(reportDate)}</div>
          <div className="text-right"><strong>จำนวนสินค้า:</strong> {rows.length.toLocaleString("th-TH")} รายการ</div>
        </div>

        <table className="packing-report-table" aria-label="รายงานการบรรจุ">
          <colgroup>
            <col style={{ width: "8%" }} /><col style={{ width: "15%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "10%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} /><col style={{ width: "5%" }} /><col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>รหัสสินค้า FG</th><th rowSpan={2}>ชื่อสินค้าสำเร็จรูป FG</th><th rowSpan={2}>ยอดยกมา<br />(ปี๊บ)</th>
              <th colSpan={2}>เนื้อขนมเบิกมาใช้</th><th rowSpan={2}>เนื้อขนม<br />ใช้จริง (กก.)</th>
              <th colSpan={2}>ของเสีย</th><th colSpan={4}>ผลิตงานได้</th><th rowSpan={2}>ยอดค้างไลน์<br />ผลิต (ปี๊บ)</th>
            </tr>
            <tr>
              <th>LOT</th><th>น้ำหนัก (กก.)</th><th>เศษหัก (กก.)</th><th>ปี๊บเสีย</th>
              <th>ปี๊บที่ผลิตได้</th><th>จำนวน FG</th><th>น้ำหนัก (กก.)</th>
              <th>เฉลี่ยต่อปี๊บ<br />(กรัม)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={22} />กำลังโหลดรายงาน...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="py-12 text-center font-bold text-slate-400">ไม่มีข้อมูลการบรรจุวันที่ {formatDate(reportDate)}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.fgCode} className="packing-report-row">
                <td className="font-mono font-black">{row.fgCode}</td>
                <td className="font-bold leading-tight">{row.fgName}</td>
                <td className="text-center font-bold">{formatNumber(row.carriedOverTins)}</td>
                <td className="packing-center-cell">{row.lotWeights.length ? row.lotWeights.map((lot) => <div key={lot.lotNo} className="font-mono font-bold">{lot.lotNo}</div>) : "-"}</td>
                <td className="packing-center-cell">{row.lotWeights.length ? row.lotWeights.map((lot) => <div key={lot.lotNo} className="packing-lot-line"><span>{formatWeight(lot.weightKg)}</span></div>) : "-"}</td>
                <td className="text-center font-black">{formatWeight(row.actualWeightKg)}</td>
                <td className="text-center font-bold">{formatWeight(row.scrapWeightKg)}</td>
                <td className="text-center font-bold">{formatNumber(row.rejectedCanQty)}</td>
                <td className="text-center font-black">{formatNumber(row.producedTins)}</td>
                <td className="text-center font-bold leading-tight">{formatFgQuantity(row.fgQuantities)}</td>
                <td className="text-center font-black">{formatWeight(row.producedWeightKg)}</td>
                <td className="text-center font-black">{formatAverageWeight(row)}</td>
                <td className="text-center font-black">{formatNumber(row.remainingWipTins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
