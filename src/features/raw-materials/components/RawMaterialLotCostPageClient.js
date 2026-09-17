"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
} from "lucide-react";
import { fetchRawMaterialLotCosts } from "@/features/raw-materials/services/rawMaterialsClient";

const PAGE_SIZE = 100;
const RAW_CATEGORIES = ["01", "02", "05", "08", "10"];

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function RawMaterialLotCostPageClient() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState({ total: 0, ready: 0, review: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const requestIdRef = useRef(0);

  const loadPage = useCallback(async (page, cursor) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await fetchRawMaterialLotCosts({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search: deferredSearch,
        iccatCodes: category,
        costStatus: status,
        cursor: cursor || "",
      });
      if (!result.ok) throw new Error(result.error?.message || "ไม่สามารถโหลดข้อมูลต้นทุนได้");
      if (requestId !== requestIdRef.current) return;

      const payload = result.data || {};
      const nextRows = Array.isArray(payload.data) ? payload.data : [];
      setRows(nextRows);
      setSelected((current) => {
        const currentKey = current ? `${current.SKU_CODE}\u0000${current.LOT_NO}` : "";
        return nextRows.find((row) => `${row.SKU_CODE}\u0000${row.LOT_NO}` === currentKey) || nextRows[0] || null;
      });
      setSummary(payload.summary || { total: 0, ready: 0, review: 0 });
      setPagination({
        page,
        totalPages: Number(payload.pagination?.totalPages || 1),
      });
      if (payload.cursor?.next) {
        setCursorMap((current) => ({ ...current, [page + 1]: payload.cursor.next }));
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setRows([]);
        setSelected(null);
        setError(loadError.message || "ไม่สามารถโหลดข้อมูลต้นทุนได้");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [category, deferredSearch, status]);

  useEffect(() => {
    setCursorMap({ 1: null });
    loadPage(1, null);
  }, [loadPage]);

  const changePage = (page) => {
    if (page < 1 || page > pagination.totalPages || loading) return;
    loadPage(page, cursorMap[page] || null);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 lg:px-5">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] text-slate-500">วัตถุดิบ / ต้นทุนตาม LOT</p>
            <h1 className="text-xl font-bold tracking-tight text-[#102C57]">ต้นทุนวัตถุดิบตาม LOT</h1>
          </div>
          <p className="text-[11px] text-slate-500">ต้นทุนซื้อสุทธิจาก ERP · ไม่รวม VAT</p>
        </div>

        <section className="mb-3 grid grid-cols-3 overflow-hidden rounded-md border border-slate-200 bg-white" aria-label="สรุปสถานะต้นทุน">
          <div className="border-r border-slate-200 px-3 py-2">
            <span className="text-lg font-bold tabular-nums text-[#102C57]">{summary.total.toLocaleString("th-TH")}</span>
            <span className="ml-2 text-[11px] text-slate-500">LOT ทั้งหมด</span>
          </div>
          <div className="border-r border-slate-200 px-3 py-2">
            <span className="text-lg font-bold tabular-nums text-emerald-700">{summary.ready.toLocaleString("th-TH")}</span>
            <span className="ml-2 text-[11px] text-slate-500">ตรวจทุนได้</span>
          </div>
          <div className="px-3 py-2">
            <span className="text-lg font-bold tabular-nums text-amber-700">{summary.review.toLocaleString("th-TH")}</span>
            <span className="ml-2 text-[11px] text-slate-500">ต้องตรวจสอบ</span>
          </div>
        </section>

        <div className="mb-3 grid gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(220px,1fr)_180px_160px]">
          <label className="relative">
            <span className="sr-only">ค้นหาสินค้าหรือ LOT</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหารหัสสินค้า ชื่อสินค้า LOT หรือเลขเอกสาร"
              className="h-9 w-full rounded border border-slate-300 pl-8 pr-3 text-xs outline-none focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57]"
            />
          </label>
          <label>
            <span className="sr-only">ประเภทวัตถุดิบ</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 w-full rounded border border-slate-300 px-2 text-xs">
              <option value="">RAW: 01, 02, 05, 08, 10</option>
              {RAW_CATEGORIES.map((code) => <option key={code} value={code}>ประเภท {code}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">สถานะต้นทุน</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-full rounded border border-slate-300 px-2 text-xs">
              <option value="">ทุกสถานะ</option>
              <option value="ready">ตรวจทุนได้</option>
              <option value="review">ต้องตรวจสอบ</option>
            </select>
          </label>
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="flex h-10 items-center justify-between border-b border-slate-200 px-3">
              <h2 className="text-xs font-bold text-[#102C57]">รายการสินค้าแยก LOT</h2>
              <span className="text-[10px] text-slate-500">100 รายการต่อหน้า</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] table-fixed border-collapse text-[11px]">
                <thead className="sticky top-0 z-10 bg-[#102C57] text-white">
                  <tr>
                    <th className="w-[112px] px-2 py-2 text-left">รหัสสินค้า</th>
                    <th className="w-[215px] px-2 py-2 text-left">สินค้า</th>
                    <th className="w-[145px] px-2 py-2 text-left">LOT</th>
                    <th className="w-[58px] px-2 py-2 text-center">ประเภท</th>
                    <th className="w-[118px] px-2 py-2 text-right">รับเข้าสุทธิ</th>
                    <th className="w-[120px] px-2 py-2 text-right">ต้นทุน / หน่วย</th>
                    <th className="w-[108px] px-2 py-2 text-right">มูลค่าสุทธิ</th>
                    <th className="w-[110px] px-2 py-2 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr><td colSpan="8" className="h-48 text-center text-xs text-slate-500">กำลังโหลดข้อมูลต้นทุน…</td></tr>
                  ) : error ? (
                    <tr><td colSpan="8" className="h-48 px-4 text-center text-xs text-red-700">{error}</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan="8" className="h-48 text-center text-xs text-slate-500">ไม่พบรายการตามตัวกรอง</td></tr>
                  ) : rows.map((row) => {
                    const rowKey = `${row.SKU_CODE}\u0000${row.LOT_NO}`;
                    const selectedKey = selected ? `${selected.SKU_CODE}\u0000${selected.LOT_NO}` : "";
                    const isReady = row.COST_STATUS === "ready";
                    return (
                      <tr
                        key={rowKey}
                        onClick={() => setSelected(row)}
                        className={`cursor-pointer border-b border-slate-100 last:border-0 ${rowKey === selectedKey ? "bg-blue-50" : "hover:bg-slate-50"}`}
                      >
                        <td className="truncate px-2 py-1.5 font-mono font-semibold text-[#102C57]" title={row.SKU_CODE}>{row.SKU_CODE}</td>
                        <td className="truncate px-2 py-1.5 font-medium" title={row.SKU_NAME}>{row.SKU_NAME}</td>
                        <td className="truncate px-2 py-1.5 font-mono" title={row.LOT_NO || "ไม่มี LOT"}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(row);
                            }}
                            className="max-w-full truncate text-left underline decoration-slate-300 underline-offset-2 hover:decoration-[#102C57]"
                          >
                            {row.LOT_NO || "—"}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono">{row.ICCAT_CODE}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(row.RECEIVED_BASE_QTY)} <span className="text-slate-500">{row.BASE_UNIT_NAME || ""}</span></td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-[#102C57]">{formatNumber(row.UNIT_COST)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(row.NET_PURCHASE_AMOUNT)}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                            {isReady ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {isReady ? "ตรวจทุนได้" : "ตรวจสอบ"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex h-10 items-center justify-between border-t border-slate-200 px-3 text-[11px] text-slate-500">
              <span>จำนวนรับเข้าสุทธิจากเอกสารซื้อ · ไม่ใช่ยอดคงเหลือ</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => changePage(pagination.page - 1)} disabled={pagination.page <= 1 || loading} className="rounded border border-slate-300 p-1 disabled:opacity-40" aria-label="หน้าก่อนหน้า"><ChevronLeft className="h-4 w-4" /></button>
                <span className="tabular-nums">หน้า {pagination.page.toLocaleString("th-TH")} / {pagination.totalPages.toLocaleString("th-TH")}</span>
                <button type="button" onClick={() => changePage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages || loading} className="rounded border border-slate-300 p-1 disabled:opacity-40" aria-label="หน้าถัดไป"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </section>

          <aside className="overflow-hidden rounded-md border border-slate-200 bg-white xl:sticky xl:top-3">
            <div className="flex h-10 items-center justify-between border-b border-slate-200 px-3">
              <h2 className="text-xs font-bold text-[#102C57]">ที่มาของต้นทุน</h2>
              <span className="text-[10px] text-slate-500">อ่านอย่างเดียว</span>
            </div>
            {selected ? (
              <div className="p-4 text-xs">
                <p className="font-mono text-[10px] text-slate-500">{selected.SKU_CODE} · ประเภท {selected.ICCAT_CODE}</p>
                <h3 className="mt-1 truncate text-base font-bold text-[#102C57]" title={selected.SKU_NAME}>{selected.SKU_NAME}</h3>
                <p className="truncate font-mono text-[11px] text-slate-500" title={selected.LOT_NO}>{selected.LOT_NO || "ไม่มีเลข LOT"}</p>
                <div className="my-4 border-y border-slate-200 py-3">
                  <p className="text-[10px] text-slate-500">ต้นทุนซื้อเฉลี่ยถ่วงน้ำหนัก</p>
                  <p className="text-2xl font-bold tabular-nums text-[#102C57]">{formatNumber(selected.UNIT_COST)} <span className="text-xs font-medium">บาท / {selected.BASE_UNIT_NAME || "หน่วย"}</span></p>
                </div>
                <dl className="space-y-2">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">ปริมาณรับเข้าสุทธิ</dt><dd className="text-right tabular-nums">{formatNumber(selected.RECEIVED_BASE_QTY)} {selected.BASE_UNIT_NAME}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">มูลค่าสุทธิไม่รวม VAT</dt><dd className="text-right font-semibold tabular-nums">{formatNumber(selected.NET_PURCHASE_AMOUNT)} บาท</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">VAT ตามเอกสาร</dt><dd className="text-right tabular-nums">{formatNumber(selected.VAT_AMOUNT)} บาท</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">เอกสารต้นทาง</dt><dd>{Number(selected.SOURCE_DOCUMENT_COUNT || 0).toLocaleString("th-TH")} ฉบับ</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">รับเข้าครั้งแรก</dt><dd>{formatDate(selected.FIRST_RECEIPT_DATE)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">รับเข้าล่าสุด</dt><dd>{formatDate(selected.LAST_RECEIPT_DATE)}</dd></div>
                </dl>
                <div className="mt-4 border-l-2 border-[#d4af37] pl-3">
                  <div className="flex items-center gap-1.5 font-semibold text-[#102C57]"><FileText className="h-3.5 w-3.5" /> เอกสารล่าสุด</div>
                  <p className="mt-1 font-mono">{selected.LATEST_SOURCE_REF || "—"}</p>
                  <p className="text-[10px] text-slate-500">{formatDate(selected.LATEST_SOURCE_DATE)} · {selected.LATEST_SUPPLIER_CODE || "—"}</p>
                  <p className="truncate text-[10px] text-slate-500" title={selected.LATEST_SUPPLIER_NAME}>{selected.LATEST_SUPPLIER_NAME || "—"}</p>
                </div>
                {selected.REVIEW_REASON ? (
                  <div className="mt-4 rounded bg-amber-50 p-3 text-[11px] text-amber-900">{selected.REVIEW_REASON} ระบบจึงไม่แสดงต้นทุนต่อหน่วย</div>
                ) : null}
                <p className="mt-4 text-[10px] leading-5 text-slate-500">สูตร: มูลค่าซื้อสุทธิในสกุลเงินฐาน ÷ ปริมาณรวมในหน่วยหลัก รวมของแถม และไม่รวม VAT ที่แยกใน ERP</p>
              </div>
            ) : <div className="p-10 text-center text-xs text-slate-500">เลือกรายการเพื่อดูที่มาต้นทุน</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}
