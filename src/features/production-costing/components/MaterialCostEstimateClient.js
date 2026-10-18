"use client";

import { useEffect, useMemo, useState } from "react";
import MaterialCostEstimateReport from "./MaterialCostEstimateReport";
import { useReportSearch } from "@/components/reporting/useReportSearch";

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const money = (value, digits = 2) => new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number(value || 0));

const quantity = (value) => new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
}).format(Number(value || 0));

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`))
  : "—";

const statusMap = {
  ready: { label: "ข้อมูลครบ", className: "text-[#159447]", dot: "bg-[#1aa34a]" },
  stale: { label: "ราคาเก่า", className: "text-[#ee8b00]", dot: "bg-[#f29a00]" },
  review: { label: "ต้องตรวจ", className: "text-[#ee8b00]", dot: "bg-[#f29a00]" },
  missing: { label: "ไม่พบราคา", className: "text-[#e51f3e]", dot: "bg-[#e51f3e]" },
};

export default function MaterialCostEstimateClient() {
  const [products, setProducts] = useState([]);
  const [skuCode, setSkuCode] = useState("");
  const [plannedQty, setPlannedQty] = useState("500");
  const [estimateDate, setEstimateDate] = useState(today);
  const [preparedBy, setPreparedBy] = useState("—");
  const [result, setResult] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/production-costing/estimate", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "โหลดรายการสินค้าไม่สำเร็จ");
        setProducts(json.data || []);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoadingProducts(false));

    fetch("/api/auth/profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => setPreparedBy(json?.profile?.username || "—"))
      .catch(() => {});
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.sku_code === skuCode.trim().toUpperCase()),
    [products, skuCode]
  );

  const calculate = async () => {
    setError("");
    setCalculating(true);
    try {
      const response = await fetch("/api/production-costing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuCode: selectedProduct?.sku_code, plannedQty, estimateDate }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "คำนวณต้นทุนไม่สำเร็จ");
      setResult(json.data);
    } catch (reason) {
      setResult(null);
      setError(reason.message);
    } finally {
      setCalculating(false);
    }
  };
  const { searching, search } = useReportSearch(calculating, calculate);

  return (
    <MaterialCostEstimateReport
      products={products} skuCode={skuCode} plannedQty={plannedQty}
      estimateDate={estimateDate} preparedBy={preparedBy} result={result}
      selectedProduct={selectedProduct}
      loadingProducts={loadingProducts} calculating={searching} error={error}
      onSkuChange={(value) => { setSkuCode(value); setResult(null); }}
      onQuantityChange={(value) => { setPlannedQty(value); setResult(null); }}
      onDateChange={(value) => { setEstimateDate(value); setResult(null); }}
      onCalculate={(event) => { event.preventDefault(); void search(); }} onReset={() => setResult(null)}
      money={money} quantity={quantity} dateLabel={dateLabel} statusMap={statusMap}
    />
  );
}
