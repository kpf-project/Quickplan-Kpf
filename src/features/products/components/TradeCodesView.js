"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import ProductsShell from "./ProductsShell";
import { fetchIccatTypes, fetchTradeCodes } from "@/features/products/services/productsClient";
import PermissionGate from "@/components/PermissionGate";

const DESIRED_COLUMNS = [
  { key: "SKU_CODE", label: "รหัสสินค้า" },
  { key: "GOODS_CODE", label: "รหัสซื้อขาย" },
  { key: "SKU_NAME", label: "ชื่อสินค้า" },
  {
    key: "UTQ_NAME_2",
    label: "หน่วย",
    accessor: (record) => record.UTQ_NAME_2 ?? record.UTQ_NAME ?? "-",
  },
  {
    key: "UTQ_QTY_2",
    label: "บรรจุ",
    accessor: (record) => record.UTQ_QTY_2 ?? record.UTQ_QTY ?? "-",
  },
  {
    key: "BRAND_DISPLAY",
    label: "ชื่อแบรนด์",
    accessor: (record) => {
      const codePart = record.BRN_CODE ? `${record.BRN_CODE} ` : "";
      const namePart = record.BRN_NAME ?? "";
      return `${codePart}${namePart}`.trim() || "-";
    },
  },
];

function normalizeCompareValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function collapseRepeatedCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length % 2 !== 0) {
    return raw;
  }
  const half = raw.length / 2;
  const first = raw.slice(0, half);
  const second = raw.slice(half);
  return normalizeCompareValue(first) === normalizeCompareValue(second)
    ? first.trim()
    : raw;
}

function normalizeGoodsCodeDisplay(value) {
  const raw = collapseRepeatedCode(value);
  if (!raw) {
    return "";
  }
  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) {
    return raw;
  }
  const unique = [];
  const seen = new Set();
  parts.forEach((item) => {
    const normalized = normalizeCompareValue(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(item);
  });
  return unique.join(", ");
}

function TradeCodesViewContent() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    totalRecords: 0,
    pageSize: 100,
  });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [searchText, setSearchText] = useState("");
  const [selectedIccat, setSelectedIccat] = useState([]);
  const [isIccatOpen, setIsIccatOpen] = useState(false);
  const [iccatOptions, setIccatOptions] = useState([]);
  const cursorMapRef = useRef(cursorMap);
  const hasCustomIccatSelection = useRef(false);

  useEffect(() => {
    cursorMapRef.current = cursorMap;
  }, [cursorMap]);

  const fetchItems = useCallback(
    async (page = 1, options = {}) => {
      const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
        ? options.cursor
        : undefined;
      const resetCursors = Boolean(options.resetCursors);
      setLoading(true);
      setErrorMessage("");
      try {
        const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMapRef.current[page];
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("pageSize", pagination.pageSize.toString());
        if (searchText.trim()) {
          params.set("search", searchText.trim());
        }
        if (selectedIccat.length) {
          params.set("iccatCodes", selectedIccat.join(","));
        }
        if (cursorValue) {
          params.set("cursor", cursorValue);
        }

        const result = await fetchTradeCodes(params);
        if (!result.ok) {
          throw new Error("ไม่สามารถโหลดข้อมูลรหัสซื้อขายได้");
        }
        const payload = result.data;
        setRecords(payload?.data ?? []);
        setPagination(payload?.pagination ?? {
          page: 1,
          totalPages: 1,
          totalRecords: 0,
          pageSize: 100,
        });
        setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
        const nextCursor = payload?.cursor?.next ?? null;
        setCursorMap((prev) => {
          const base = resetCursors ? { 1: null } : { ...prev };
          base[page] = cursorValue ?? null;
          base[page + 1] = nextCursor;
          return base;
        });
      } catch (error) {
        setErrorMessage(error?.message || "ไม่สามารถโหลดข้อมูลได้");
      } finally {
        setLoading(false);
      }
    },
    [pagination.pageSize, searchText, selectedIccat]
  );

  useEffect(() => {
    fetchItems(1, { cursor: null, resetCursors: true });
  }, [fetchItems]);

  useEffect(() => {
    const loadIccatOptions = async () => {
      try {
        const result = await fetchIccatTypes({ group: "products" });
        if (!result.ok) {
          throw new Error("ไม่สามารถโหลดหมวดหมู่ได้");
        }
        const payload = result.data;
        const options = (payload?.data ?? []).map((item) => ({
          code: item.ICCAT_CODE,
          name: item.ICCAT_NAME,
        }));
        setIccatOptions(options);
        if (!hasCustomIccatSelection.current && options.length) {
          setSelectedIccat(options.map((item) => item.code));
        }
      } catch (error) {
        setIccatOptions([]);
      }
    };
    loadIccatOptions();
  }, []);

  const handleSearch = () => {
    fetchItems(1, { cursor: null, resetCursors: true });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

  const toggleIccat = (code) => {
    hasCustomIccatSelection.current = true;
    setSelectedIccat((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
  };

  const rows = useMemo(() => {
    const grouped = new Map();
    const qtyValue = (record) => {
      const raw = record.UTQ_QTY_2 ?? record.UTQ_QTY;
      const num = parseFloat(String(raw || "0").replace(/,/g, ""));
      return Number.isFinite(num) ? num : 0;
    };

    records.forEach((record) => {
      const skuKey = record.SKU_CODE ?? "";
      if (!grouped.has(skuKey)) {
        grouped.set(skuKey, {
          summary: record,
          detailSet: new Set(),
          details: [],
        });
      }
      const group = grouped.get(skuKey);
      const goodsCode = normalizeGoodsCodeDisplay(record?.GOODS_CODE);
      const detailKey = [
        normalizeCompareValue(goodsCode),
        normalizeCompareValue(record?.SKU_NAME),
        normalizeCompareValue(record?.UTQ_NAME_2 ?? record?.UTQ_NAME),
        String(qtyValue(record)),
      ].join("::");
      if (group.detailSet.has(detailKey)) {
        return;
      }
      group.detailSet.add(detailKey);
      group.details.push({
        ...record,
        GOODS_CODE: goodsCode,
      });
    });

    const output = [];
    let counter = 0;
    const sortedGroups = Array.from(grouped.values());

    sortedGroups.forEach((group) => {
      group.details.sort((a, b) => qtyValue(a) - qtyValue(b));

      output.push({
        id: `${group.summary.SKU_CODE || "sku"}-summary-${counter++}`,
        type: "summary",
        record: group.summary,
      });
      group.details.forEach((detail) => {
        output.push({
          id: `${group.summary.SKU_CODE || "sku"}-detail-${counter++}`,
          type: "detail",
          record: detail,
        });
      });
    });

    return output;
  }, [records]);
  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);

  const columnsWithLabels = DESIRED_COLUMNS;
  const formatValue = (value) => {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return value;
  };
  const getSummaryLabel = (record) => {
    const skuCode = String(record?.SKU_CODE ?? "").trim();
    const skuName = String(record?.SKU_NAME ?? "").trim();
    if (!skuCode && !skuName) {
      return "-";
    }
    if (!skuName || normalizeCompareValue(skuName) === normalizeCompareValue(skuCode)) {
      return skuCode || skuName || "-";
    }
    return `${skuCode} ${skuName}`.trim();
  };
  const getCellValue = (column, groupedRow) => {
    const record = groupedRow.record ?? {};
    const normalizedSkuCode = normalizeCompareValue(record?.SKU_CODE);
    const normalizedGoodsCodeValue = normalizeGoodsCodeDisplay(record?.GOODS_CODE);
    const normalizedGoodsCode = normalizeCompareValue(normalizedGoodsCodeValue);
    const normalizedSkuName = normalizeCompareValue(record?.SKU_NAME);
    if (groupedRow.type === "detail" && column.key === "SKU_CODE") {
      return "-";
    }
    if (groupedRow.type === "summary" && column.key === "GOODS_CODE") {
      return "-";
    }
    if (
      column.key === "SKU_NAME" &&
      normalizedSkuName &&
      (normalizedSkuName === normalizedSkuCode || normalizedSkuName === normalizedGoodsCode)
    ) {
      return "-";
    }
    if (typeof column.accessor === "function") {
      return column.accessor(record);
    }
    if (column.key === "GOODS_CODE") {
      return normalizedGoodsCodeValue || "-";
    }
    return record[column.key];
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10">
      <div className="flex-1 min-w-[190px]">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ค้นหา SKU/AP/คำสำคัญ..."
          className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
        />
      </div>
      <div className="relative min-w-[140px]">
        <button
          onClick={() => setIsIccatOpen((prev) => !prev)}
          className="w-full h-9 px-3 rounded-lg bg-black/20 border border-white/10 text-white text-xs flex items-center justify-between hover:bg-black/30 transition-colors"
        >
          <span className="truncate">{selectedIccat.length > 0 ? `${selectedIccat.length} หมวดหมู่` : "เลือกหมวดหมู่"}</span>
          <span className="opacity-50 text-[10px]">▼</span>
        </button>
        {isIccatOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-2xl p-2 z-50 border border-gray-100">
            <div className="flex justify-between items-center p-2 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 mb-1">
              <span>หมวดหมู่</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    hasCustomIccatSelection.current = true;
                    setSelectedIccat(iccatOptions.map((item) => item.code));
                  }}
                  className="text-[#102C57] hover:underline"
                >
                  เลือกทั้งหมด
                </button>
                <button
                  onClick={() => {
                    hasCustomIccatSelection.current = true;
                    setSelectedIccat([]);
                  }}
                  className="text-red-500 hover:underline"
                >
                  ล้าง
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
              {iccatOptions.map((option) => (
                <label key={option.code} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIccat.includes(option.code)}
                    onChange={() => toggleIccat(option.code)}
                    className="rounded w-3 h-3 text-[#102C57] border-gray-300"
                  />
                  <span className="text-xs text-gray-700 truncate">{option.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        onClick={handleSearch}
        disabled={loading}
        className="h-9 px-5 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Search size={14} />
        {loading ? "..." : "ค้นหา"}
      </button>
      <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
        <button
          onClick={() => fetchItems(pagination.page - 1)}
          disabled={pagination.page <= 1 || loading}
          className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
        >
          <ChevronLeft size={14} />
          ก่อนหน้า
        </button>
        <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
          หน้า {pagination.page} / {pagination.totalPages}
        </span>
        <button
          onClick={() => fetchItems(pagination.page + 1)}
          disabled={!canGoNext || loading}
          className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
        >
          ถัดไป
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <ProductsShell
      title="รหัสซื้อขาย"
      description="ข้อมูลรหัสซื้อขาย"
      totalRecords={pagination.totalRecords}
      badgeText="รายการ"
      toolbar={toolbar}
    >
      <>
        {errorMessage && (
          <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded">
            {errorMessage}
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible mt-4">
          <div className="hidden lg:block overflow-x-auto table-scroll">
            <table className="w-full table-auto border-collapse text-left text-[10px] xl:text-xs table-bordered">
              <thead className="bg-[#0f172a] text-white sticky top-0 z-20">
                <tr>
                  {columnsWithLabels.map((column) => (
                    <th
                      key={column.key}
                      className="px-3 py-3 border-b border-[#111b2b] text-sm uppercase tracking-wide"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-gray-900">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={columnsWithLabels.length} className="px-6 py-12 text-center text-gray-500">
                      กำลังโหลดข้อมูลรหัสซื้อขาย...
                    </td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map((row) =>
                    row.type === "summary" ? (
                      <tr key={row.id}>
                        <td
                          colSpan={columnsWithLabels.length}
                          className="px-3 py-3 text-sm font-semibold text-[#102C57]"
                          style={{ border: 0 }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span>{getSummaryLabel(row.record)}</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.id} className="hover:bg-blue-50/60 transition-colors">
                        {columnsWithLabels.map((column) => (
                          <td
                            key={`${row.id}-${column.key}`}
                            className="px-3 py-3 align-top text-sm font-mono"
                          >
                            {formatValue(getCellValue(column, row))}
                          </td>
                        ))}
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td colSpan={columnsWithLabels.length} className="px-6 py-12 text-center text-gray-500">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
          <div className="lg:hidden flex flex-col gap-3 p-4">
            {loading && rows.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">กำลังโหลด...</div>
            ) : rows.length > 0 ? (
              rows.map((row) =>
                row.type === "summary" ? (
                  <div
                    key={`mobile-${row.id}`}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                  >
                    <p className="text-sm font-semibold text-[#102C57]">
                      {getSummaryLabel(row.record)}
                    </p>
                  </div>
                ) : (
                  <div
                    key={`mobile-${row.id}`}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3"
                  >
                    {columnsWithLabels.map((column) => (
                      <div key={`${row.id}-${column.key}`} className="text-[10px] text-gray-500">
                        <div className="text-white/80 text-xs uppercase tracking-wider">{column.label}</div>
                        <div className="font-mono text-sm text-[#102C57]">{formatValue(getCellValue(column, row))}</div>
                      </div>
                    ))}
                  </div>
                )
              )
            ) : (
              <div className="text-center py-12 text-gray-500 text-sm">ไม่มีข้อมูล</div>
            )}
          </div>
        </div>
      </>
    </ProductsShell>
  );
}

export default function TradeCodesView() {
  return (
    <PermissionGate permissionsAny={["admin-products"]}>
      <TradeCodesViewContent />
    </PermissionGate>
  );
}



