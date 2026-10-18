"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Barcode,
  CheckCircle2,
  ChevronDown,
  Database,
  FileSearch,
  Loader2,
  Minus,
  PackageCheck,
  PackageMinus,
  Plus,
  Save,
  Search,
  Scale,
  ShoppingCart,
  X,
} from "lucide-react";
import { useUserProfile } from "@/lib/useUserProfile";
import WasteWeighTab from "./WasteWeighTab";
import FgWipReportTab from "./FgWipReportTab";
import WipOtherIssueTab from "./WipOtherIssueTab";
import WipOpeningStockPanel from "@/features/inventory/components/WipOpeningStockPanel";
import FgWipSuccessToast from "./FgWipSuccessToast";

function bangkokDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildLotNo(date) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}${month}${String(year).slice(-2)}`;
}

function QuantityControl({ label, value, onChange, unit }) {
  const update = (next) => onChange(Math.max(0, Number.parseInt(String(next), 10) || 0));
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[#061f43]">{label}</label>
      <div className="grid grid-cols-[52px_1fr_52px_auto] items-stretch border border-[#aebbc9] bg-white">
        <button type="button" onClick={() => update(value - 1)} className="grid min-h-16 place-items-center border-r border-[#aebbc9] text-[#061f43] hover:bg-[#edf2f7]" aria-label={`ลด${label}`}>
          <Minus size={22} />
        </button>
        <input value={value} onChange={(event) => update(event.target.value)} inputMode="numeric" className="min-w-0 px-4 text-center text-4xl font-bold tabular-nums text-[#061f43] outline-none" aria-label={label} />
        <button type="button" onClick={() => update(value + 1)} className="grid min-h-16 place-items-center border-l border-[#aebbc9] text-[#061f43] hover:bg-[#edf2f7]" aria-label={`เพิ่ม${label}`}>
          <Plus size={22} />
        </button>
        <span className="grid min-w-20 place-items-center border-l border-[#aebbc9] px-4 font-semibold text-[#061f43]">{unit}</span>
      </div>
    </div>
  );
}

export default function FgWipEndOfDayPageClient({ initialReportTab = null }) {
  const profile = useUserProfile();
  const searchParams = useSearchParams();
  const isReportCenter = searchParams?.get("reportCenter") === "1";
  const [activeTab, setActiveTab] = useState(initialReportTab ? "report" : searchParams?.get("tab") === "opening" ? "opening" : "receipt");
  const [openingDirty, setOpeningDirty] = useState(false);
  const openingActive = activeTab === "opening";
  function switchTab(tab) {
    if (tab === activeTab) return;
    if (activeTab === "opening" && openingDirty && !window.confirm("มีรายการยอดตั้งต้นที่ยังไม่บันทึกหรือยังไม่ยืนยันผล ต้องการออกจากส่วนนี้?")) return;
    setActiveTab(tab);
  }
  const [productionDate, setProductionDate] = useState(bangkokDateKey);
  const [shiftName, setShiftName] = useState("");
  const [product, setProduct] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [fgCaseQty, setFgCaseQty] = useState(0);
  const [wipTinQty, setWipTinQty] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cachedProducts, setCachedProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // New states for integrated WIP issues
  const [selectedWipIssues, setSelectedWipIssues] = useState([]);
  const [wipPickerOpen, setWipPickerOpen] = useState(false);
  const [cachedWipIssues, setCachedWipIssues] = useState([]);
  const [wipPickerSearch, setWipPickerSearch] = useState("");
  const [loadingWipPicker, setLoadingWipPicker] = useState(false);

  const fgTinQty = fgCaseQty * (product?.tinsPerCase || 0);
  const totalIssuedWipTins = useMemo(() => {
    return selectedWipIssues.reduce((sum, item) => sum + (item.quantityToIssue || 0), 0);
  }, [selectedWipIssues]);

  const freshMixedTins = Math.max(0, (fgTinQty + wipTinQty) - totalIssuedWipTins);

  // Client-side filtering of products
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cachedProducts;
    return cachedProducts.filter((p) =>
      p.barcode?.toLowerCase().includes(q) ||
      p.productName?.toLowerCase().includes(q) ||
      p.productCode?.toLowerCase().includes(q)
    );
  }, [cachedProducts, search]);

  // Client-side filtering of WIP issues
  const filteredWipIssues = useMemo(() => {
    const q = wipPickerSearch.trim().toLowerCase();
    if (!q) return cachedWipIssues;
    return cachedWipIssues.filter((w) =>
      w.barcode?.toLowerCase().includes(q) ||
      w.productName?.toLowerCase().includes(q) ||
      w.lotNo?.toLowerCase().includes(q)
    );
  }, [cachedWipIssues, wipPickerSearch]);

  // Pre-fetch all products and available WIP cans on date changes
  useEffect(() => {
    if (openingActive) return;
    let cancelled = false;
    const preFetchAll = async () => {
      setLoadingProducts(true);
      setLoadingWipPicker(true);
      try {
        const [prodRes, wipRes] = await Promise.all([
          fetch("/api/production-line/fg-wip/products", { cache: "no-store" }),
          fetch("/api/production-line/fg-wip/issues", { cache: "no-store" })
        ]);
        if (cancelled) return;
        if (prodRes.ok) {
          const prodPayload = await prodRes.json();
          if (!cancelled && prodPayload?.data) {
            setCachedProducts(prodPayload.data);
          }
        }
        if (wipRes.ok) {
          const wipPayload = await wipRes.json();
          if (!cancelled && wipPayload?.data) {
            setCachedWipIssues(wipPayload.data);
          }
        }
      } catch (err) {
        // Mute
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
          setLoadingWipPicker(false);
        }
      }
    };
    preFetchAll();
    return () => { cancelled = true; };
  }, [productionDate, openingActive]);


  const totalInputTins = freshMixedTins + totalIssuedWipTins;
  const totalOutputTins = fgTinQty + wipTinQty;
  const varianceTins = totalInputTins - totalOutputTins;

  const lotNo = useMemo(() => buildLotNo(productionDate), [productionDate]);

  const loadProducts = async (query = "") => {
    setLoadingProducts(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/production-line/fg-wip/products?search=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลดรายการสินค้าไม่สำเร็จ");
      setCachedProducts(payload?.data || []);
      return payload?.data || [];
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      return [];
    } finally {
      setLoadingProducts(false);
    }
  };

  const selectProduct = (nextProduct) => {
    setProduct(nextProduct);
    setBarcodeInput(nextProduct.realBarcode || nextProduct.barcode || "");
    setPickerOpen(false);
  };

  const scanFg = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const rows = await loadProducts(barcodeInput.trim());
    const normalized = barcodeInput.trim().toUpperCase();
    const exact = rows.find((row) =>
      row.barcode === normalized
      || row.productCode === normalized
      || row.realBarcode === normalized
    );
    if (exact) selectProduct(exact);
    else setMessage({ type: "error", text: "ไม่พบสินค้าจากรหัสซื้อขายหรือบาร์โค้ดนี้" });
  };

  const loadWipPickerRows = async (query = "") => {
    setLoadingWipPicker(true);
    try {
      const response = await fetch(`/api/production-line/fg-wip/issues?search=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลดรายการ WIP ค้างไลน์ไม่สำเร็จ");
      setCachedWipIssues(payload?.data || []);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoadingWipPicker(false);
    }
  };

  const selectWipIssue = (row) => {
    const exists = selectedWipIssues.some(
      (item) => (item.sourceDocumentId || item.sourceMovementId) === (row.sourceDocumentId || row.sourceMovementId) && item.lotNo === row.lotNo
    );
    if (!exists) {
      setSelectedWipIssues([
        ...selectedWipIssues,
        {
          sourceDocumentId: row.sourceDocumentId,
          sourceMovementId: row.sourceMovementId,
          productCode: row.productCode,
          productName: row.productName,
          barcode: row.barcode,
          lotNo: row.lotNo,
          remainingQty: row.remainingQty,
          quantityToIssue: Math.min(1, row.remainingQty)
        }
      ]);
    }
    setWipPickerOpen(false);
  };

  const updateWipIssueQty = (index, nextQty) => {
    setSelectedWipIssues((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const max = Number(item.remainingQty || 0);
      return {
        ...item,
        quantityToIssue: Math.min(max, Math.max(0, Number.parseInt(String(nextQty), 10) || 0)),
      };
    }));
  };

  const removeWipIssue = (index) => {
    setSelectedWipIssues((current) => current.filter((_, idx) => idx !== index));
  };

  const clearForm = () => {
    setProduct(null);
    setBarcodeInput("");
    setFgCaseQty(0);
    setWipTinQty(0);
    setSelectedWipIssues([]);
    setMessage(null);
  };

  const submit = async () => {
    if (!product || fgCaseQty <= 0) {
      setMessage({ type: "error", text: "กรุณาเลือกสินค้าและระบุจำนวน FG ที่ผลิตได้" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      // 1. Submit selected WIP issues first
      const carriedWipMovementIds = [];
      for (const item of selectedWipIssues) {
        if (item.quantityToIssue <= 0) continue;
        const res = await fetch("/api/production-line/fg-wip/issues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: globalThis.crypto?.randomUUID?.() || `wip-issue-${Date.now()}-${item.lotNo}`,
            issueDate: productionDate,
            sourceDocumentId: item.sourceDocumentId,
            sourceMovementId: item.sourceMovementId,
            barcode: item.barcode,
            lotNo: item.lotNo,
            quantity: item.quantityToIssue,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || `เบิก WIP LOT ${item.lotNo} ไม่สำเร็จ`);
        const movementId = payload?.data?.movementId;
        if (movementId) carriedWipMovementIds.push(movementId);
      }

      // 2. Submit FG document
      const requestId = globalThis.crypto?.randomUUID?.() || `fg-wip-${Date.now()}`;
      const response = await fetch("/api/production-line/fg-wip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          productionDate,
          shiftName,
          product,
          fgCaseQty,
          wipTinQty,
          carriedWipMovementIds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "บันทึกข้อมูลไม่สำเร็จ");
      
      setMessage({ type: "success", text: `บันทึกสำเร็จ เลขที่ ${payload.documentNo} · LOT ${payload.lotNo}` });
      setFgCaseQty(0);
      setWipTinQty(0);
      setSelectedWipIssues([]);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen bg-[#f4f6f8] text-[#061f43] ${isReportCenter ? "pt-1" : ""}`}>
      {!isReportCenter && (
        <>
          <header className="bg-[var(--surface-navy,#061f43)] text-white">
            <div className="flex min-h-[60px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
              <div className="flex items-center gap-3 sm:gap-5"><span className="border-r border-white/60 pr-3 text-3xl font-black tracking-wide sm:pr-5 sm:text-4xl">KPF</span><h1 className="text-base font-semibold sm:text-xl">จัดการผลผลิตและ WIP</h1></div>
              <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 text-xs text-white/80 sm:w-auto sm:gap-3 sm:pb-0 sm:text-sm">
                {activeTab !== "opening" && <input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} className="h-10 border border-white/30 bg-transparent px-3 text-white [color-scheme:dark]" />}

                <span className="shrink-0 border-l border-white/30 pl-3">{profile.username || "ผู้ใช้งาน"}</span>
              </div>
            </div>
          </header>

          <nav className="flex overflow-x-auto border-b border-[#061f43] bg-white print-hidden" aria-label="เมนูผลผลิตและ WIP">
            <button type="button" onClick={() => switchTab("receipt")} className={`flex h-[56px] min-w-[210px] flex-1 items-center justify-center gap-2 border-r border-[#aebbc9] px-3 text-sm font-bold sm:gap-3 sm:text-lg ${activeTab === "receipt" ? "bg-[#d9a514] text-[#061f43]" : "text-[#061f43] hover:bg-[#edf2f7]"}`}><FileSearch size={22} />บันทึกผลผลิตและ WIP</button>
            <button type="button" onClick={() => switchTab("opening")} className={`flex h-[56px] min-w-[190px] flex-1 items-center justify-center gap-2 border-r border-[#aebbc9] px-3 text-sm font-bold sm:text-lg ${activeTab === "opening" ? "bg-[#d9a514] text-[#061f43]" : "text-[#061f43] hover:bg-[#edf2f7]"}`}><Database size={21} />ตั้งต้นสต็อก WIP</button>
            <button type="button" onClick={() => switchTab("other-issue")} className={`flex h-[56px] min-w-[190px] flex-1 items-center justify-center gap-2 border-r border-[#aebbc9] px-3 text-sm font-bold sm:text-lg ${activeTab === "other-issue" ? "bg-[#d9a514] text-[#061f43]" : "text-[#061f43] hover:bg-[#edf2f7]"}`}><PackageMinus size={21} />เบิก WIP กรณีอื่น</button>
            <button type="button" onClick={() => switchTab("waste")} className={`flex h-[56px] min-w-[150px] flex-1 items-center justify-center gap-2 border-r border-[#aebbc9] px-3 text-sm font-bold sm:text-lg ${activeTab === "waste" ? "bg-[#d9a514] text-[#061f43]" : "text-[#061f43] hover:bg-[#edf2f7]"}`}><Scale size={21} />ชั่งของเสีย</button>
            <button type="button" onClick={() => switchTab("report")} className={`flex h-[56px] min-w-[180px] flex-1 items-center justify-center gap-2 px-3 text-sm font-bold sm:text-lg ${activeTab === "report" ? "bg-[#d9a514] text-[#061f43]" : "text-[#061f43] hover:bg-[#edf2f7]"}`}><FileSearch size={22} />รายงาน</button>
          </nav>
        </>
      )}

      {activeTab === "waste" ? (
        <WasteWeighTab productionDate={productionDate} operatorName={profile.username} />
      ) : activeTab === "opening" ? (
        <WipOpeningStockPanel openingDate={productionDate} onDirtyChange={setOpeningDirty} />
      ) : activeTab === "report" ? (
        <FgWipReportTab productionDate={productionDate} initialSubTab={initialReportTab || "daily"} />
      ) : activeTab === "other-issue" ? (
        <WipOtherIssueTab issueDate={productionDate} operatorName={profile.username} />
      ) : (
        <main className="mx-auto min-w-0 max-w-[1500px] overflow-x-hidden p-3 sm:p-4 lg:p-6">
        <FgWipSuccessToast message={message?.type === "success" ? message.text : ""} onClose={() => setMessage(null)} />
        {message?.type === "error" ? <div className="mb-4 flex items-center gap-2 border border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700"><X size={18} />{message.text}</div> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Left Column: Inputs */}
          <div className="space-y-4">
            <section className="min-w-0 border border-[#aebbc9] bg-white p-3 sm:p-5">
              <h2 className="mb-5 flex items-center gap-3 text-lg font-bold"><span className="grid h-8 w-8 place-items-center bg-[var(--surface-navy,#061f43)] text-white">1</span>ผลผลิตสำเร็จรูป (FG) ที่ผลิต</h2>
              <label className="mb-2 block text-sm font-semibold">สแกนบาร์โค้ดสินค้า FG / รหัสซื้อขาย</label>
              <div className="mb-1 flex min-w-0 flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative"><Barcode className="absolute left-3 top-3 text-[#67778a]" size={20} /><input value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} onKeyDown={scanFg} placeholder="สแกนแล้วกด Enter" className="h-12 w-full border border-[#aebbc9] pl-11 pr-3 outline-none focus:border-[#d9a514]" /></div>
                <button type="button" onClick={() => { setPickerOpen(true); loadProducts(""); }} className="flex h-12 items-center justify-center gap-2 border border-t-0 border-[#061f43] px-4 font-semibold hover:bg-[#edf2f7] sm:border-l-0 sm:border-t"><Search size={18} />เลือกจากรายการ</button>
              </div>
              <p className="mb-5 text-xs text-[#67778a]">เฉพาะสินค้าที่ตั้งค่าให้ KP13 และอยู่ในหมวด 04, 04-1, 04-2</p>
              {product ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3">
                    <div>
                      <p className="font-bold">{product.barcode} · {product.productName}</p>
                      <p className="text-xs text-[#526477]">
                        {product.realBarcode ? (
                          <>บาร์โค้ดพาเลท: <span className="font-mono font-bold text-gray-700">{product.realBarcode}</span></>
                        ) : (
                          <span className="text-gray-400">ยังไม่ตั้งค่าบาร์โค้ดพาเลท</span>
                        )}
                      </p>
                    </div>
                    <CheckCircle2 className="text-emerald-600" />
                  </div>

                  <QuantityControl label={`จำนวน${product?.unitName || "กล่อง"}ที่ผลิตได้`} value={fgCaseQty} onChange={setFgCaseQty} unit={product?.unitName || "กล่อง"} />
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center border border-[#ccd4dd] bg-[#f8fafc] px-4 py-3 text-center"><span>{fgCaseQty} {product?.unitName || "กล่อง"} × {product?.tinsPerCase || 0} {product?.subUnitName || "ปี๊บ"}</span><span className="px-4 text-[#67778a]">เท่ากับ</span><strong className="text-2xl tabular-nums">{fgTinQty} <small className="text-sm font-semibold">{product?.subUnitName || "ปี๊บ"} FG</small></strong></div>
                </div>
              ) : null}
            </section>

            <section className="min-w-0 overflow-hidden rounded-xl border border-[#c8d2df] bg-white shadow-[0_5px_18px_rgba(6,31,67,0.06)] sm:rounded-none sm:border-[#aebbc9] sm:p-5 sm:shadow-none">
              <div className="border-b border-[#dce3eb] bg-gradient-to-r from-[#f8fafc] to-white p-4 sm:mb-5 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:border-0 sm:bg-none sm:p-0">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-navy,#061f43)] text-lg font-black text-white shadow-sm sm:h-8 sm:w-8 sm:rounded-none">2</span>
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-black leading-tight text-[#061f43] sm:text-lg">WIP ยกยอดมาใช้ผลิต</h2>
                    <p className="mt-0.5 text-xs font-medium text-[#67778a]">เลือกยอดคงเหลือเพื่อนำกลับมาใช้ผลิต</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setWipPickerOpen(true); loadWipPickerRows(""); }} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--surface-navy,#061f43)] px-4 text-sm font-bold text-white shadow-[0_4px_12px_rgba(6,31,67,0.18)] transition-[transform,background-color,box-shadow] duration-200 hover:bg-[#0b3268] active:scale-[0.985] motion-reduce:transition-none sm:mt-0 sm:h-11 sm:w-auto sm:rounded-none sm:border-2 sm:border-[#061f43] sm:bg-white sm:text-[#061f43] sm:shadow-none sm:hover:bg-[#edf2f7]"><Plus size={17} strokeWidth={2.5} />เลือก WIP ยกยอดมา</button>
              </div>
              {selectedWipIssues.length === 0 ? (
                <div className="m-4 grid min-h-[140px] place-items-center rounded-lg border border-dashed border-[#9aabba] bg-[#f8fafc] p-4 text-center text-[#526477] sm:m-0 sm:rounded-none">
                  <div>
                    <p className="font-semibold text-sm">ไม่มีการเบิก WIP ยกยอดมาใช้วันนี้</p>
                    <p className="text-xs text-[#67778a] mt-1">(ผลิตขึ้นใหม่ทั้งหมด)</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3 sm:hidden p-3">
                    {selectedWipIssues.map((item, idx) => (
                      <article key={`${item.sourceDocumentId || item.sourceMovementId}-${item.lotNo}`} className="min-w-0 overflow-hidden rounded-xl border border-[#d2dae5] bg-white shadow-[0_4px_14px_rgba(6,31,67,0.07)] transition-[border-color,box-shadow] duration-200 hover:border-[#aebdcd] hover:shadow-[0_6px_18px_rgba(6,31,67,0.1)] motion-reduce:transition-none">
                        <div className="flex min-w-0 items-start gap-3 p-4 pb-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf3f8] text-[#0b3268]"><PackageMinus size={21} strokeWidth={1.8} /></span>
                          <div className="min-w-0">
                            <p className="break-words text-[15px] font-black leading-snug text-[#061f43]">{item.productName}</p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#617287]">
                              <span className="font-bold">LOT <span className="font-mono text-[#061f43]">{item.lotNo}</span></span>
                              <span className="break-all">{item.barcode}</span>
                            </div>
                          </div>
                          <button type="button" onClick={() => removeWipIssue(idx)} className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#b42318] transition-colors duration-200 hover:bg-[#fff0ee] active:bg-[#fee4e2]" aria-label="ลบรายการ"><X size={20} /></button>
                        </div>
                        <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 border-t border-[#e4e9ef] bg-[#f8fafc] p-3">
                          <div className="grid place-items-center rounded-lg border border-[#efd287] bg-[#fff7dc] px-2 py-2 text-center text-[#594100]">
                            <span><span className="block text-[11px] font-bold">คงเหลือ</span><strong className="block text-2xl font-black leading-tight tabular-nums">{item.remainingQty}</strong><span className="text-[11px] font-bold">ปี๊บ</span></span>
                          </div>
                          <div className="min-w-0">
                            <span className="mb-1.5 block text-[11px] font-bold text-[#526477]">จำนวนที่เบิกใช้</span>
                            <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-lg border border-[#9eacbc] bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#d9a900]/35">
                              <button type="button" onClick={() => updateWipIssueQty(idx, item.quantityToIssue - 1)} className="grid h-12 place-items-center border-r border-[#c4ced9] text-[#061f43] transition-colors hover:bg-[#eaf0f6] active:bg-[#dce6f0]" aria-label="ลด"><Minus size={17} /></button>
                              <input value={item.quantityToIssue} onChange={(event) => updateWipIssueQty(idx, event.target.value)} inputMode="numeric" className="h-12 min-w-0 bg-transparent text-center text-2xl font-black tabular-nums text-[#061f43] outline-none" aria-label="จำนวนที่เบิกใช้" />
                              <button type="button" onClick={() => updateWipIssueQty(idx, item.quantityToIssue + 1)} className="grid h-12 place-items-center border-l border-[#c4ced9] text-[#061f43] transition-colors hover:bg-[#eaf0f6] active:bg-[#dce6f0]" aria-label="เพิ่ม"><Plus size={17} /></button>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto border border-[#ccd4dd] sm:block">
                  <table className="w-full min-w-[500px] border-collapse text-sm">
                    <thead className="bg-[#f8f9fa] text-[#1a1c1e] border-b-2 border-[#1a1c1e]">
                      <tr>
                        <th className="border-r border-[#ccd4dd] px-3 py-2 font-semibold text-left">รายละเอียด WIP / LOT</th>
                        <th className="border-r border-[#ccd4dd] px-3 py-2 font-semibold text-center w-[110px]">คงเหลือ</th>
                        <th className="border-r border-[#ccd4dd] px-3 py-2 font-semibold text-center w-[140px]">จำนวนที่เบิกใช้</th>
                        <th className="px-3 py-2 font-semibold text-center w-[50px]">ลบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWipIssues.map((item, idx) => (
                        <tr key={idx} className="border-t border-[#ccd4dd] hover:bg-[#f8fafc]">
                          <td className="px-3 py-2 text-left border-r border-[#ccd4dd]">
                            <div className="font-bold text-[#061f43]">{item.productName}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">LOT: {item.lotNo} ({item.barcode})</div>
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-gray-600 border-r border-[#ccd4dd]">
                            {item.remainingQty} ปี๊บ
                          </td>
                          <td className="px-3 py-2 text-center border-r border-[#ccd4dd]">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => updateWipIssueQty(idx, item.quantityToIssue - 1)} className="grid h-8 w-8 place-items-center border border-[#061f43] bg-white hover:bg-[#edf2f7]" aria-label="ลด"><Minus size={12} /></button>
                              <input value={item.quantityToIssue} onChange={(e) => updateWipIssueQty(idx, e.target.value)} inputMode="numeric" className="h-8 w-12 text-center border border-[#8393a7] font-bold outline-none" />
                              <button type="button" onClick={() => updateWipIssueQty(idx, item.quantityToIssue + 1)} className="grid h-8 w-8 place-items-center border border-[#061f43] bg-white hover:bg-[#edf2f7]" aria-label="เพิ่ม"><Plus size={12} /></button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button" onClick={() => removeWipIssue(idx)} className="text-red-600 hover:text-red-800" aria-label="ลบ"><X size={18} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Right Column: Outputs */}
          <div>
            <section className="min-w-0 border border-[#aebbc9] bg-white p-3 sm:p-5">
              <h2 className="mb-2 flex items-center gap-3 text-lg font-bold"><span className="grid h-8 w-8 place-items-center bg-[var(--surface-navy,#061f43)] text-white">3</span>WIP ค้างไลน์ (เศษเหลือสิ้นวัน - ไม่บังคับ)</h2>
              <div className="mb-5 flex items-center gap-3 border-l-4 border-[#d9a514] bg-[#fff8df] px-4 py-3">
                <Database className="shrink-0 text-[#9a6f00]" size={22} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#6c5a24]">ระบบเลือก Trade Code หน่วย{product?.subUnitName || "ปี๊บ"}อัตโนมัติ</p>
                  <p className="truncate font-bold text-[#061f43]">{product ? `${product.productCode} · ${product.productName}` : "เลือกสินค้า FG ในขั้นตอนที่ 1"}</p>
                </div>
              </div>
              <QuantityControl
                label="จำนวนค้างไลน์"
                value={wipTinQty}
                onChange={setWipTinQty}
                unit={product?.subUnitName || "ปี๊บ"}
              />
              <div className="mt-5 border border-[#061f43] px-4 py-4">
                <p className="font-semibold">บันทึกเป็นจำนวน{product?.subUnitName || "ปี๊บ"} ไม่ต้องชั่งน้ำหนัก</p>
                <p className="mt-1 text-xs text-[#526477]">อ้างอิง LOT <span className="font-mono font-bold text-[#061f43]">{lotNo}</span> และนำไปสแกนเบิกใช้วันถัดไป</p>
              </div>
            </section>
          </div>
        </div>

        <section className="mt-4 border border-[#aebbc9] bg-white">
          <div className="border-b border-[#ccd4dd] px-5 py-3 font-bold bg-[#f8fafc]">สรุปการกระทบยอดวัตถุดิบและผลผลิตประจำวัน</div>
          <div className="grid grid-cols-2 divide-x divide-y divide-[#ccd4dd] lg:grid-cols-4 lg:divide-y-0 border-b border-[#ccd4dd]">
            {[
              [`จำนวน${product?.subUnitName || "ปี๊บ"}วันนี้ (Input)`, `${freshMixedTins.toLocaleString()} ${product?.subUnitName || "ปี๊บ"}`],
              [`WIP ยกยอดเบิกใช้ (Input)`, `${totalIssuedWipTins.toLocaleString()} ${product?.subUnitName || "ปี๊บ"}`],
              [`สินค้าสำเร็จรูป FG (Output)`, `${fgTinQty.toLocaleString()} ${product?.subUnitName || "ปี๊บ"}`],
              [`เศษ WIP ค้างไลน์ (Output)`, `${wipTinQty.toLocaleString()} ${product?.subUnitName || "ปี๊บ"}`]
            ].map(([label, value]) => (
              <div key={label} className="p-4 text-center">
                <p className="text-xs text-[#67778a] font-semibold">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#123c6c]">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-[#fff7df] border-b border-[#ccd4dd] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm font-bold text-[#061f43]">
            <div className="flex gap-6 flex-wrap">
              <span>รวมขาเข้า (Input): <strong className="text-lg text-[#102C57]">{totalInputTins.toLocaleString()} {product?.subUnitName || "ปี๊บ"}</strong></span>
              <span className="border-l border-[#ccd4dd] pl-6">รวมขาออก (Output): <strong className="text-lg text-[#102C57]">{totalOutputTins.toLocaleString()} {product?.subUnitName || "ปี๊บ"}</strong></span>
            </div>
            {varianceTins === 0 ? (
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={18} />
                <span>สถานะกระทบยอด: ถูกต้อง 100% (Balanced)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-rose-700 bg-rose-50 px-3 py-1 border border-rose-200">
                <X size={18} />
                <span>
                  สถานะกระทบยอด: คลาดเคลื่อน (
                  {varianceTins > 0
                    ? `สูญหาย/ขาออกขาด ${varianceTins.toLocaleString()} ${product?.subUnitName || "ปี๊บ"}`
                    : `ขาออกเกิน ${Math.abs(varianceTins).toLocaleString()} ${product?.subUnitName || "ปี๊บ"}`}
                  )
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-stretch justify-between gap-3 p-4 sm:flex-row sm:items-center bg-white">
            <button type="button" onClick={clearForm} className="h-12 border border-[#061f43] px-6 font-semibold hover:bg-[#edf2f7]">ล้างข้อมูล</button>
            <button type="button" onClick={submit} disabled={submitting} className="flex h-12 min-w-80 items-center justify-center gap-2 bg-[#d9a514] px-8 font-bold text-[#061f43] hover:bg-[#c29410] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}บันทึกผลผลิตและ WIP</button>
          </div>
        </section>
      </main>)}

      {pickerOpen ? <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="เลือกสินค้า FG"><div className="flex max-h-[82vh] w-full max-w-4xl flex-col bg-white">
        <div className="flex items-center justify-between bg-[var(--surface-navy,#061f43)] px-5 py-4 text-white"><div><h2 className="text-lg font-bold">เลือกสินค้า FG</h2><p className="text-xs text-white/70">KP13 · หมวด 04, 04-1, 04-2 · ข้อมูลบาร์โค้ดจาก Trade Code</p></div><button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center border border-white/40"><X /></button></div>
        <div className="flex gap-2 border-b border-[#ccd4dd] p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหารหัสสินค้า ชื่อสินค้า หรือบาร์โค้ด" className="h-11 flex-1 border border-[#aebbc9] px-3 outline-none focus:border-[#d9a514]" /><div className="flex h-11 items-center gap-2 bg-[var(--surface-navy,#061f43)]/10 px-5 font-bold text-[#061f43]"><Search size={18} />กรองด่วน</div></div>
        <div className="overflow-auto p-4">{loadingProducts ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin" /></div> : filteredProducts.length ? (
          <div className="divide-y divide-[#d6dde5] border border-[#aebbc9]">
            {filteredProducts.map((row) => (
              <button
                type="button"
                key={`${row.productCode}-${row.barcode}-${row.tinsPerCase}`}
                onClick={() => selectProduct(row)}
                className="grid w-full grid-cols-[1fr_auto] gap-4 p-4 text-left hover:bg-[#fff8df]"
              >
                <div>
                  <p className="font-bold">{row.barcode} · {row.productName}</p>
                  <p className="mt-1 font-mono text-xs text-[#67778a]">
                    {row.realBarcode ? (
                      <>บาร์โค้ดพาเลท: <span className="font-bold">{row.realBarcode}</span></>
                    ) : (
                      <span className="text-gray-400">ยังไม่ตั้งค่าบาร์โค้ดพาเลท</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{row.tinsPerCase} {row.subUnitName || "ปี๊บ"}</p>
                  <p className="text-xs text-[#67778a]">{row.unitName}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid h-48 place-items-center text-[#67778a]">
            <PackageCheck size={34} />
            <p>ไม่พบสินค้า</p>
          </div>
        )}</div>
      </div></div> : null}

      {wipPickerOpen ? (
        <div className="fixed inset-0 z-[100] bg-black/55 sm:grid sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label="เลือก WIP ค้างไลน์">
          <div className="flex h-[100dvh] w-full flex-col bg-white sm:h-auto sm:max-h-[88vh] sm:max-w-4xl sm:shadow-2xl">
            <div className="flex min-h-[88px] shrink-0 items-center justify-between bg-[var(--surface-navy,#061f43)] px-4 py-4 text-white sm:min-h-0 sm:px-5">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">เลือก WIP ค้างไลน์</h2>
                <p className="mt-1 text-sm text-white/75">แสดงเฉพาะรายการที่ยังมียอดคงเหลือ</p>
              </div>
              <button type="button" onClick={() => setWipPickerOpen(false)} className="grid h-12 w-12 place-items-center border border-white/40" aria-label="ปิดหน้าต่าง"><X size={27} /></button>
            </div>
            <div className="shrink-0 border-b border-[#ccd4dd] bg-white p-4 sm:px-5">
              <label className="relative block">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#526477]" size={22} />
              <input
                value={wipPickerSearch}
                onChange={(event) => setWipPickerSearch(event.target.value)}
                  placeholder="ค้นหารหัสสินค้า ชื่อสินค้า บาร์โค้ด หรือ LOT"
                  className="h-14 w-full border border-[#aebbc9] pl-12 pr-4 text-base outline-none focus:border-2 focus:border-[#d9a514]"
              />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              {loadingWipPicker ? (
                <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin" size={36} /></div>
              ) : filteredWipIssues.length ? (
                <div className="space-y-3">
                  {filteredWipIssues.map((row) => (
                    <button
                      type="button"
                      key={`${row.sourceDocumentId || row.sourceMovementId}-${row.lotNo}`}
                      onClick={() => selectWipIssue(row)}
                      className="grid min-h-[128px] w-full grid-cols-[minmax(0,1fr)_92px] items-center gap-3 border border-[#aebbc9] bg-white p-3 text-left hover:border-[#d9a514] hover:bg-[#fff8df] sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:gap-4 sm:p-4"
                    >
                      <div className="min-w-0">
                        <strong className="block text-lg font-black leading-tight text-[#061f43] sm:text-xl">{row.productCode}</strong>
                        <span className="mt-1 block text-sm font-semibold leading-snug text-[#24364a] sm:text-base">{row.productName}</span>
                        <span className="mt-2 block font-mono text-sm font-bold text-[#34475c] sm:hidden">LOT {row.lotNo}</span>
                        <span className="mt-1 block break-all text-xs text-[#637286] sm:hidden">บาร์โค้ด {row.barcode}</span>
                      </div>
                      <div className="hidden sm:block">
                        <span className="text-xs text-[#526477]">LOT</span>
                        <p className="font-mono font-bold">{row.lotNo}</p>
                        <p className="mt-1 break-all text-xs text-[#637286]">{row.barcode}</p>
                      </div>
                      <span className="grid min-h-[82px] place-items-center border border-[#f0d28a] bg-[#fff4cf] px-2 text-center text-[#061f43]"><span><span className="block text-xs font-bold">คงเหลือ</span><strong className="block text-2xl font-black tabular-nums">{row.remainingQty}</strong><span className="block text-sm font-bold">ปี๊บ</span></span></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center text-center text-[#67778a]">
                  <div><PackageCheck className="mx-auto mb-3" size={38} /><p className="text-lg font-bold">ไม่พบ WIP คงเหลือ</p></div>
                </div>
              )}
              <p className="mt-4 text-sm text-[#637286]">แสดงเฉพาะ LOT ที่ยังมียอดคงเหลือมากกว่า 0</p>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
