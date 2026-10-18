"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/clientFetch";
import PlanningSkuPicker from "./PlanningSkuPicker";

export default function DepartmentWipPicker({ activeDeptId, activeDeptName, onSelect, onClose }) {
  const { data, error, isLoading, mutate } = useSWR(activeDeptId ? `/api/production-planning/wip-options?departmentId=${encodeURIComponent(activeDeptId)}` : null, fetcher, { revalidateOnFocus: false });
  const products = useMemo(() => new Map((data?.data || []).map(item => [item.skuCode, { ...item, itemType: "WIP" }])), [data]);
  return <PlanningSkuPicker key={activeDeptId} title="เลือก WIP" description={`สำหรับ ${activeDeptName || "แผนกปัจจุบัน"} · เฉพาะ WIP ที่เชื่อมกับ FG ผ่าน BOM`} skuMap={products} requireBom={false}
    loading={isLoading} error={!activeDeptId ? "กรุณาเลือกแผนกก่อน" : error ? "โหลด WIP ไม่สำเร็จ กรุณาลองใหม่" : ""} onRetry={mutate} onClose={onClose}
    onSelect={skuCode => { const item = (data?.data || []).find(row => row.skuCode === skuCode); if (item) onSelect(item); }} />;
}
