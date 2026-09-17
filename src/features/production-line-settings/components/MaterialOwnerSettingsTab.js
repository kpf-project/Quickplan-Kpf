"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  fetchMaterialOwners,
  assignMaterialOwner,
  removeMaterialOwner,
  fetchProductsCache,
  fetchProductionDepartments,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const RAW_ICCAT_CODES = "01,02,05,08,10";

const ICCAT_LABELS = {
  "01": "หมวด 01",
  "02": "หมวด 02",
  "05": "หมวด 05",
  "08": "หมวด 08",
  "10": "หมวด 10",
};

export default function MaterialOwnerSettingsTab({ canManage = false }) {
  const [materials, setMaterials] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assignmentMap, setAssignmentMap] = useState(new Map());
  const [usedRoutingSet, setUsedRoutingSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [iccatFilter, setIccatFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [showOnlyUsedInRouting, setShowOnlyUsedInRouting] = useState(true);
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingMap, setSavingMap] = useState(new Map());
  const feedbackTimers = useRef({});

  useEffect(() => {
    let active = true;

    async function loadAll() {
      const allMaterials = [];
      let cursor = null;
      do {
        const params = { iccatCodes: RAW_ICCAT_CODES, pageSize: "500", page: "1" };
        if (cursor) params.cursor = cursor;
        const result = await fetchProductsCache(params);
        if (!result.ok) {
          if (active) setErrorMessage(result.error?.message || "โหลดวัตถุดิบไม่สำเร็จ");
          return;
        }
        allMaterials.push(...(Array.isArray(result.data?.data) ? result.data.data : []));
        cursor = result.data?.cursor?.hasMore ? result.data.cursor.next : null;
      } while (cursor);

      const [ownerResult, deptResult] = await Promise.all([
        fetchMaterialOwners({ includeUsedRouting: "1" }),
        fetchProductionDepartments({ pageSize: "500" }),
      ]);

      if (!active) return;

      setMaterials(allMaterials);
      setLoading(false);

      if (ownerResult.ok) {
        const map = new Map();
        (Array.isArray(ownerResult.data?.data) ? ownerResult.data.data : []).forEach((row) => {
          map.set(String(row.materialSkuCode || "").toUpperCase(), row.departmentId);
        });
        setAssignmentMap(map);

        const usedCodes = Array.isArray(ownerResult.data?.meta?.usedMaterialSkuCodes)
          ? ownerResult.data.meta.usedMaterialSkuCodes
          : [];
        setUsedRoutingSet(new Set(usedCodes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)));
      }

      if (deptResult.ok) {
        setDepartments(Array.isArray(deptResult.data?.data) ? deptResult.data.data : []);
      }
    }

    loadAll().catch((error) => {
      if (!active) return;
      setLoading(false);
      setErrorMessage(error?.message || "โหลดข้อมูลไม่สำเร็จ");
    });

    const timers = feedbackTimers.current;
    return () => {
      active = false;
      Object.values(timers).forEach((timerId) => clearTimeout(timerId));
    };
  }, []);

  const activeDepts = useMemo(
    () => departments.filter((row) => row.is_active && !row.deleted_at),
    [departments]
  );

  const presentIccats = useMemo(
    () => [...new Set(materials.map((item) => item.iccat_code).filter(Boolean))].sort(),
    [materials]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter((item) => {
      const skuCode = String(item.sku_code || "").trim().toUpperCase();
      const skuName = String(item.sku_name || "").trim();
      const assignedDeptId = assignmentMap.get(skuCode) || "";

      if (showOnlyUsedInRouting && !usedRoutingSet.has(skuCode)) return false;
      if (showOnlyUnassigned && assignedDeptId) return false;
      if (iccatFilter !== "all" && item.iccat_code !== iccatFilter) return false;
      if (deptFilter !== "all" && String(assignedDeptId) !== String(deptFilter)) return false;
      if (!term) return true;
      return skuCode.toLowerCase().includes(term) || skuName.toLowerCase().includes(term);
    });
  }, [materials, search, showOnlyUsedInRouting, usedRoutingSet, showOnlyUnassigned, iccatFilter, deptFilter, assignmentMap]);

  const assignedCount = useMemo(
    () => filtered.reduce((sum, item) => (assignmentMap.get(String(item.sku_code || "").toUpperCase()) ? sum + 1 : sum), 0),
    [filtered, assignmentMap]
  );

  const unassignedCount = filtered.length - assignedCount;

  const setRowFeedback = useCallback((skuCode, state) => {
    setSavingMap((prev) => new Map(prev).set(skuCode, state));
    if (state === "saved" || state === "error") {
      clearTimeout(feedbackTimers.current[skuCode]);
      feedbackTimers.current[skuCode] = setTimeout(() => {
        setSavingMap((prev) => {
          const next = new Map(prev);
          next.delete(skuCode);
          return next;
        });
      }, 2000);
    }
  }, []);

  const handleDeptChange = useCallback(async (skuCode, deptId) => {
    const key = String(skuCode || "").trim().toUpperCase();
    const prevDeptId = assignmentMap.get(key);

    setAssignmentMap((prev) => {
      const next = new Map(prev);
      if (deptId) next.set(key, deptId);
      else next.delete(key);
      return next;
    });
    setRowFeedback(key, "saving");

    const result = deptId
      ? await assignMaterialOwner(key, deptId)
      : await removeMaterialOwner(key);

    if (!result.ok) {
      setAssignmentMap((prev) => {
        const next = new Map(prev);
        if (prevDeptId) next.set(key, prevDeptId);
        else next.delete(key);
        return next;
      });
      setErrorMessage(result.error?.message || "บันทึกไม่สำเร็จ");
      setRowFeedback(key, "error");
      return;
    }

    setRowFeedback(key, "saved");
  }, [assignmentMap, setRowFeedback]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#102C57]/20 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#102C57]/50" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหารหัส/ชื่อวัตถุดิบ"
              className="h-9 w-64 rounded-md border border-[#102C57]/20 bg-white pl-9 pr-3 text-sm text-[#102C57] focus:border-[#D4AF37] focus:outline-none"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(event) => setDeptFilter(event.target.value)}
            className="h-9 rounded-md border border-[#102C57]/20 bg-white px-3 text-sm text-[#102C57] focus:border-[#D4AF37] focus:outline-none"
          >
            <option value="all">ทุกแผนกเจ้าของ</option>
            {activeDepts.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.code ? `[${dept.code}] ` : ""}{dept.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-[#102C57]">
            <input
              type="checkbox"
              checked={showOnlyUsedInRouting}
              onChange={(event) => setShowOnlyUsedInRouting(event.target.checked)}
              className="h-4 w-4 rounded border-[#102C57]/40 text-[#102C57] focus:ring-[#D4AF37]"
            />
            แสดงเฉพาะที่ใช้ใน Routing
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-[#102C57]">
            <input
              type="checkbox"
              checked={showOnlyUnassigned}
              onChange={(event) => setShowOnlyUnassigned(event.target.checked)}
              className="h-4 w-4 rounded border-[#102C57]/40 text-[#102C57] focus:ring-[#D4AF37]"
            />
            เฉพาะที่ยังไม่กำหนดเจ้าของ
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIccatFilter("all")}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              iccatFilter === "all"
                ? "border-[#D4AF37] bg-[#D4AF37] text-[#102C57]"
                : "border-[#102C57]/20 text-[#102C57]"
            }`}
          >
            ทั้งหมด
          </button>
          {presentIccats.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setIccatFilter(code)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                iccatFilter === code
                  ? "border-[#D4AF37] bg-[#D4AF37] text-[#102C57]"
                  : "border-[#102C57]/20 text-[#102C57]"
              }`}
            >
              {ICCAT_LABELS[code] || code}
            </button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-[#102C57]/20 bg-white">
        <div className="grid grid-cols-3 border-b border-[#102C57]/10 text-sm">
          <div className="px-4 py-2 text-[#102C57]">รายการที่แสดง: <span className="font-semibold">{filtered.length}</span></div>
          <div className="px-4 py-2 text-[#102C57]">กำหนดเจ้าของแล้ว: <span className="font-semibold text-emerald-700">{assignedCount}</span></div>
          <div className="px-4 py-2 text-[#102C57]">ยังไม่กำหนด: <span className="font-semibold text-amber-700">{unassignedCount}</span></div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-[#102C57]/5 text-[#102C57]">
            <tr>
              <th className="px-4 py-3 text-left">รหัส</th>
              <th className="px-4 py-3 text-left">ชื่อวัตถุดิบ</th>
              <th className="px-4 py-3 text-left">หมวด</th>
              <th className="px-4 py-3 text-left">แผนกเจ้าของวัตถุดิบ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#102C57]/60">กำลังโหลดข้อมูล...</td>
              </tr>
            ) : null}

            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#102C57]/60">ไม่พบรายการ</td>
              </tr>
            ) : null}

            {!loading ? filtered.map((item) => {
              const skuCode = String(item.sku_code || "").trim().toUpperCase();
              const assignedDeptId = assignmentMap.get(skuCode) || "";
              const feedback = savingMap.get(skuCode) || "";
              return (
                <tr key={skuCode} className="border-t border-[#102C57]/10">
                  <td className="px-4 py-2 font-mono text-xs text-[#102C57]">{skuCode}</td>
                  <td className="px-4 py-2 font-medium text-[#102C57]">{item.sku_name || skuCode}</td>
                  <td className="px-4 py-2 text-[#102C57]">{item.iccat_code || "-"}</td>
                  <td className="px-4 py-2">
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={assignedDeptId}
                          onChange={(event) => handleDeptChange(skuCode, event.target.value)}
                          disabled={feedback === "saving"}
                          className="h-8 rounded-md border border-[#102C57]/20 bg-white px-2 text-xs text-[#102C57] focus:border-[#D4AF37] focus:outline-none"
                        >
                          <option value="">ยังไม่กำหนด</option>
                          {activeDepts.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                            </option>
                          ))}
                        </select>
                        {feedback === "saving" ? <span className="text-xs text-[#102C57]/60">กำลังบันทึก...</span> : null}
                        {feedback === "saved" ? <span className="text-xs text-emerald-700">บันทึกแล้ว</span> : null}
                        {feedback === "error" ? <span className="text-xs text-red-700">บันทึกไม่สำเร็จ</span> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[#102C57]">
                        {assignedDeptId
                          ? `${activeDepts.find((dept) => dept.id === assignedDeptId)?.code ? `[${activeDepts.find((dept) => dept.id === assignedDeptId)?.code}] ` : ""}${activeDepts.find((dept) => dept.id === assignedDeptId)?.name || assignedDeptId}`
                          : "ยังไม่กำหนด"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            }) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
