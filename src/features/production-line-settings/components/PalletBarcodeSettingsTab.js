"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Barcode from "react-barcode";
import { Download, Plus, Printer, RefreshCw, Save, Search, Trash2, Upload, WandSparkles } from "lucide-react";
import {
  bulkUpsertPalletTradeCodeBarcodes,
  fetchPalletBarcodeSettings,
  mutatePalletBarcodeSettings,
} from "@/features/production-line-settings/services/productionLineSettingsClient";
import {
  downloadPalletBarcodeWorkbook,
  parsePalletBarcodeImportFile,
} from "@/features/production-line-settings/utils/palletBarcodeExcel";
import { printQtyBarcodeDirect } from "@/features/printing/sunmiDirectPrintClient";

function compressAndConvertToWebp(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 400;
        const maxH = 400;
        let w = img.width;
        let h = img.height;

        if (w > h) {
          if (w > maxW) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          }
        } else {
          if (h > maxH) {
            w = Math.round((w * maxH) / h);
            h = maxH;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        try {
          const webpDataUrl = canvas.toDataURL("image/webp", 0.75);
          resolve(webpDataUrl);
        } catch (e) {
          const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.75);
          resolve(jpegDataUrl);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

const PAGE_SIZE = 30;
const PRODUCT_BARCODE_REGEX = /^[A-Z0-9\-._:/]{2,80}$/;
const DEFAULT_PAGINATION = {
  page: 1,
  pageSize: PAGE_SIZE,
  totalRecords: 0,
  totalPages: 1,
};
const DEFAULT_CURSOR_INFO = {
  next: null,
  hasMore: false,
};

function toErrorMessage(result, fallback) {
  return result?.error?.message || fallback;
}

function formatSource(source) {
  if (source === "sku") return "SKU";
  if (source === "category") return "ICDEPT";
  return "-";
}

function normalizeProductBarcodeInput(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeMappingCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function buildPrintPayload(item) {
  return {
    type: "qty_barcode_label",
    paperWidthMm: 58,
    barcodeType: "CODE128",
    barcodeValue: item.barcodeValue,
    displayQty: item.displayQty,
    label: item.label || `พาเลท ${item.displayQty}`,
    humanText: `จำนวน ${item.displayQty} กล่อง`,
  };
}

export default function PalletBarcodeSettingsTab({ canManage = false }) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [toast, setToast] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [selectedIccat, setSelectedIccat] = useState("");
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [cursorInfo, setCursorInfo] = useState(DEFAULT_CURSOR_INFO);
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const cursorMapRef = useRef({ 1: null });

  const [qtyBarcodes, setQtyBarcodes] = useState([]);
  const [categoryMappings, setCategoryMappings] = useState([]);
  const [icdeptOptions, setIcdeptOptions] = useState([]);
  const [iccatOptions, setIccatOptions] = useState([]);
  const [products, setProducts] = useState([]);
  const [productBarcodeDrafts, setProductBarcodeDrafts] = useState({});
  const [skuMappingDrafts, setSkuMappingDrafts] = useState({});

  const [newQtyInput, setNewQtyInput] = useState("");
  const [newQtyLabel, setNewQtyLabel] = useState("");

  const [mappingIccatCode, setMappingIccatCode] = useState("");
  const [categoryQtyDrafts, setCategoryQtyDrafts] = useState({});

  const [printLabel, setPrintLabel] = useState(null);
  const [isPrintingDesktop, setIsPrintingDesktop] = useState(false);
  const [hasSunmiBridge] = useState(() => {
    if (typeof window === "undefined") return false;
    const bridge = window.AndroidPrinter;
    return Boolean(
      bridge
      && (typeof bridge.printBarcodeLabel === "function" || typeof bridge.printBarcode === "function")
    );
  });
  const [printMode, setPrintMode] = useState(hasSunmiBridge ? "sunmi" : "desktop");
  const showToast = useCallback((type, message) => {
    const normalizedType = type === "success" ? "success" : "error";
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return;
    setToast({ id: Date.now(), type: normalizedType, message: normalizedMessage });
  }, []);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const canGoPrev = pagination.page > 1;
  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);
  const qtyBarcodeById = useMemo(
    () => new Map(qtyBarcodes.map((item) => [item.id, item])),
    [qtyBarcodes]
  );
  const categoryMappingByCode = useMemo(
    () => new Map(
      categoryMappings
        .map((item) => [normalizeMappingCode(item.icdeptCode || item.iccatCode), item])
        .filter(([code]) => Boolean(code))
    ),
    [categoryMappings]
  );

  const resolvedMappingIccatCode = useMemo(() => {
    if (mappingIccatCode) return normalizeMappingCode(mappingIccatCode);
    return normalizeMappingCode(icdeptOptions[0]?.icdeptCode || icdeptOptions[0]?.iccatCode || "");
  }, [icdeptOptions, mappingIccatCode]);

  const resolvedCategoryMapping = useMemo(
    () => categoryMappings.find(
      (item) => normalizeMappingCode(item.icdeptCode || item.iccatCode) === resolvedMappingIccatCode
    ) || null,
    [categoryMappings, resolvedMappingIccatCode]
  );

  const resolvedCategoryQtyBarcodeId = useMemo(
    () => categoryQtyDrafts[resolvedMappingIccatCode] ?? resolvedCategoryMapping?.qtyBarcodeId ?? "",
    [categoryQtyDrafts, resolvedCategoryMapping?.qtyBarcodeId, resolvedMappingIccatCode]
  );

  const selectedCategoryName = useMemo(() => {
    if (!resolvedMappingIccatCode) return "-";
    const found = icdeptOptions.find(
      (item) => normalizeMappingCode(item.icdeptCode || item.iccatCode) === resolvedMappingIccatCode
    );
    return found?.icdeptName || found?.iccatName || resolvedMappingIccatCode;
  }, [icdeptOptions, resolvedMappingIccatCode]);

  const buildListParams = useCallback(({ page = 1, pageSize = PAGE_SIZE, search = "", iccatCode = "" } = {}) => {
    const params = {
      page: String(page),
      pageSize: String(pageSize),
    };
    const normalizedSearch = String(search || "").trim();
    const normalizedIccat = String(iccatCode || "").trim().toUpperCase();
    if (normalizedSearch) {
      params.search = normalizedSearch;
    }
    if (normalizedIccat) {
      params.iccatCode = normalizedIccat;
    }
    return params;
  }, []);

  useEffect(() => {
    cursorMapRef.current = cursorMap;
  }, [cursorMap]);

  const loadData = useCallback(async ({
    page = 1,
    search = "",
    iccatCode = "",
    cursor,
    resetCursors = false,
  } = {}) => {
    setLoading(true);
    const params = buildListParams({ page, pageSize: PAGE_SIZE, search, iccatCode });
    const resolvedCursor = cursor !== undefined ? cursor : cursorMapRef.current[page];
    if (resolvedCursor) {
      params.cursor = resolvedCursor;
    }
    const result = await fetchPalletBarcodeSettings(params);
    if (!result.ok) {
      setLoading(false);
      showToast("error", toErrorMessage(result, "โหลดข้อมูลบาร์โค้ดไม่สำเร็จ"));
      return;
    }

    const payload = result.data?.data || {};
    const nextQtyBarcodes = Array.isArray(payload.qtyBarcodes) ? payload.qtyBarcodes : [];
    const nextCategoryMappings = Array.isArray(payload.categoryMappings) ? payload.categoryMappings : [];
    const nextProducts = Array.isArray(payload.tradeCodes)
      ? payload.tradeCodes
      : (Array.isArray(payload.products) ? payload.products : []);
    const nextIcdeptOptions = Array.isArray(payload.icdeptOptions) ? payload.icdeptOptions : [];
    const nextIccatOptions = Array.isArray(payload.iccatOptions) ? payload.iccatOptions : [];
    const nextPagination = payload.pagination || DEFAULT_PAGINATION;
    const nextCursorInfo = payload.cursor || DEFAULT_CURSOR_INFO;

    setQtyBarcodes(nextQtyBarcodes);
    setCategoryMappings(nextCategoryMappings);
    setIcdeptOptions(nextIcdeptOptions);
    setIccatOptions(nextIccatOptions);
    setProducts(nextProducts);
    setCursorInfo({
      next: nextCursorInfo.next || null,
      hasMore: Boolean(nextCursorInfo.hasMore),
    });
    setPagination({
      page: nextPagination.page || 1,
      pageSize: nextPagination.pageSize || PAGE_SIZE,
      totalRecords: nextPagination.totalRecords || 0,
      totalPages: Math.max(1, nextPagination.totalPages || 1),
    });
    setCursorMap((prev) => {
      const base = resetCursors ? { 1: null } : { ...prev };
      base[page] = resolvedCursor ?? null;
      base[page + 1] = nextCursorInfo.next ?? null;
      return base;
    });

    setSelectedIccat((prev) => {
      if (!prev) return prev;
      const stillExists = nextIccatOptions.some(
        (item) => normalizeMappingCode(item.iccatCode || item.icdeptCode) === normalizeMappingCode(prev)
      );
      return stillExists ? prev : "";
    });

    setProductBarcodeDrafts((prev) => {
      const next = { ...prev };
      nextProducts.forEach((row) => {
        if (!Object.prototype.hasOwnProperty.call(next, row.goodsCode)) {
          next[row.goodsCode] = row.productBarcode || "";
        }
      });
      return next;
    });

    setSkuMappingDrafts((prev) => {
      const next = { ...prev };
      nextProducts.forEach((row) => {
        if (!Object.prototype.hasOwnProperty.call(next, row.skuCode)) {
          next[row.skuCode] = row.skuQtyBarcodeId || "";
        }
      });
      return next;
    });

    setLoading(false);
  }, [buildListParams, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData({ page: 1, cursor: null, resetCursors: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadData]);

  useEffect(() => {
    if (!isPrintingDesktop || !printLabel || typeof window === "undefined") {
      return;
    }
    const timer = window.setTimeout(() => {
      document.body.classList.add("qty-barcode-printing");
      window.print();
    }, 120);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isPrintingDesktop, printLabel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleAfterPrint = () => {
      document.body.classList.remove("qty-barcode-printing");
      setIsPrintingDesktop(false);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("qty-barcode-printing");
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 3000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  const reloadCurrent = useCallback(async () => {
    await loadData({
      page: pagination.page,
      search: searchText,
      iccatCode: selectedIccat,
      cursor: cursorMapRef.current[pagination.page],
    });
  }, [loadData, pagination.page, searchText, selectedIccat]);

  const fetchAllProductsForExport = useCallback(async () => {
    const exportPageSize = 100;
    let currentPage = 1;
    let currentCursor = null;
    let hasMore = true;
    const allRows = [];

    while (hasMore || currentPage === 1) {
      const params = buildListParams({
        page: currentPage,
        pageSize: exportPageSize,
        search: searchText,
        iccatCode: selectedIccat,
      });
      if (currentCursor) {
        params.cursor = currentCursor;
      }
      const result = await fetchPalletBarcodeSettings(params);
      if (!result.ok) {
        throw new Error(toErrorMessage(result, "โหลดข้อมูลสำหรับ Export ไม่สำเร็จ"));
      }

      const payload = result.data?.data || {};
      const nextRows = Array.isArray(payload.tradeCodes)
        ? payload.tradeCodes
        : (Array.isArray(payload.products) ? payload.products : []);
      const nextCursorInfo = payload.cursor || DEFAULT_CURSOR_INFO;
      allRows.push(...nextRows);
      hasMore = Boolean(nextCursorInfo.hasMore);
      currentCursor = nextCursorInfo.next || null;
      currentPage += 1;
    }

    return allRows;
  }, [buildListParams, searchText, selectedIccat]);

  const handleExportExcel = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const rows = await fetchAllProductsForExport();
      const filenameDate = new Date().toISOString().slice(0, 10);
      await downloadPalletBarcodeWorkbook({
        rows,
        filename: `pallet-trade-code-barcodes_${filenameDate}.xlsx`,
      });
      showToast("success", `Export Excel สำเร็จ ${rows.length.toLocaleString()} รหัสซื้อขาย`);
    } catch (error) {
      showToast("error", error?.message || "Export Excel ไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  }, [fetchAllProductsForExport, isExporting, showToast]);

  const openImportPicker = useCallback(() => {
    if (!canManage || isImporting) return;
    fileInputRef.current?.click();
  }, [canManage, isImporting]);

  const handleImportFile = useCallback(async (event) => {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    try {
      const rows = await parsePalletBarcodeImportFile(file);
      if (!rows.length) {
        throw new Error("ไม่พบข้อมูลสำหรับนำเข้า");
      }

      const result = await bulkUpsertPalletTradeCodeBarcodes(rows);
      if (!result.ok) {
        throw new Error(toErrorMessage(result, "นำเข้าบาร์โค้ดสินค้าไม่สำเร็จ"));
      }

      const payload = result.data?.data || {};
      const updatedCount = Number(payload.updatedCount || 0);
      const clearedCount = Number(payload.clearedCount || 0);
      showToast(
        "success",
        `นำเข้า Excel สำเร็จ: อัปเดต ${updatedCount.toLocaleString()} รหัสซื้อขาย, ล้าง ${clearedCount.toLocaleString()} รหัสซื้อขาย`
      );
      await loadData({
        page: 1,
        search: searchText,
        iccatCode: selectedIccat,
        cursor: null,
        resetCursors: true,
      });
    } catch (error) {
      showToast("error", error?.message || "นำเข้า Excel ไม่สำเร็จ");
    } finally {
      if (input) {
        input.value = "";
      }
      setIsImporting(false);
    }
  }, [loadData, searchText, selectedIccat, showToast]);

  const runMutation = useCallback(async (key, payload, successText, pageOverride = null) => {
    setSavingKey(key);
    const result = await mutatePalletBarcodeSettings(payload);
    setSavingKey("");
    if (!result.ok) {
      showToast("error", toErrorMessage(result, "บันทึกข้อมูลไม่สำเร็จ"));
      return false;
    }
    if (successText) {
      showToast("success", successText);
    }
    await loadData({
      page: pageOverride ?? pagination.page,
      search: searchText,
      iccatCode: selectedIccat,
      cursor: pageOverride ? null : cursorMapRef.current[pagination.page],
      resetCursors: Boolean(pageOverride && pageOverride === 1),
    });
    return true;
  }, [loadData, pagination.page, searchText, selectedIccat, showToast]);

  const handleUploadProductImage = async (skuCode, file) => {
    if (!file) return;
    const key = `product_image:${skuCode}`;
    try {
      setSavingKey(key);
      const base64Data = await compressAndConvertToWebp(file);
      await runMutation(
        key,
        {
          action: "set_product_image",
          skuCode,
          imageUrl: base64Data,
        },
        `อัปโหลดรูปสินค้า ${skuCode} สำเร็จ`
      );
    } catch (err) {
      console.error(err);
      showToast("error", "การประมวลผลรูปภาพล้มเหลว");
    } finally {
      setSavingKey("");
    }
  };

  const handleClearProductImage = async (skuCode) => {
    if (!window.confirm("คุณต้องการลบรูปภาพสินค้านี้ใช่หรือไม่?")) return;
    const key = `product_image:${skuCode}`;
    await runMutation(
      key,
      {
        action: "set_product_image",
        skuCode,
        imageUrl: null,
      },
      `ลบรูปสินค้า ${skuCode} สำเร็จ`
    );
  };

  const handleSearch = async () => {
    await loadData({ page: 1, search: searchText, iccatCode: selectedIccat, cursor: null, resetCursors: true });
  };

  const handleResetFilters = async () => {
    setSearchText("");
    setSelectedIccat("");
    await loadData({ page: 1, search: "", iccatCode: "", cursor: null, resetCursors: true });
  };

  const handlePrev = async () => {
    if (!canGoPrev || loading) return;
    await loadData({
      page: pagination.page - 1,
      search: searchText,
      iccatCode: selectedIccat,
      cursor: cursorMapRef.current[pagination.page - 1],
    });
  };

  const handleNext = async () => {
    if (!canGoNext || loading) return;
    await loadData({
      page: pagination.page + 1,
      search: searchText,
      iccatCode: selectedIccat,
      cursor: cursorMapRef.current[pagination.page + 1],
    });
  };

  const handleCreateQtyBarcode = async () => {
    if (!canManage) return;
    const displayQty = Number.parseInt(String(newQtyInput || ""), 10);
    if (!Number.isFinite(displayQty) || displayQty < 1 || displayQty > 99999) {
      showToast("error", "กรุณาระบุจำนวน 1 - 99999");
      return;
    }
    const ok = await runMutation(
      "create_qty_barcode",
      {
        action: "create_qty_barcode",
        displayQty,
        label: String(newQtyLabel || "").trim() || null,
      },
      "สร้างบาร์โค้ดจำนวนสำเร็จ",
      1
    );
    if (ok) {
      setNewQtyInput("");
      setNewQtyLabel("");
    }
  };

  const handleSaveCategoryMapping = async () => {
    if (!canManage) return;
    if (!resolvedMappingIccatCode) {
      showToast("error", "Please select ICDEPT");
      return;
    }
    if (!resolvedCategoryQtyBarcodeId) {
      const ok = await runMutation(
        `clear_category_mapping:${resolvedMappingIccatCode}`,
        {
          action: "clear_category_mapping",
          icdeptCode: resolvedMappingIccatCode,
        },
        "Cleared ICDEPT mapping"
      );
      if (ok) {
        setCategoryQtyDrafts((prev) => ({
          ...prev,
          [resolvedMappingIccatCode]: "",
        }));
        setCategoryMappings((prev) =>
          prev.filter(
            (item) => normalizeMappingCode(item.icdeptCode || item.iccatCode) !== resolvedMappingIccatCode
          )
        );
      }
      return;
    }

    const ok = await runMutation(
      `set_category_mapping:${resolvedMappingIccatCode}`,
      {
        action: "set_category_mapping",
        icdeptCode: resolvedMappingIccatCode,
        qtyBarcodeId: resolvedCategoryQtyBarcodeId,
      },
      "Saved ICDEPT mapping"
    );

    if (ok) {
      setCategoryQtyDrafts((prev) => ({
        ...prev,
        [resolvedMappingIccatCode]: resolvedCategoryQtyBarcodeId,
      }));

      const mappedQty = qtyBarcodeById.get(resolvedCategoryQtyBarcodeId);
      setCategoryMappings((prev) => {
        const nextItem = {
          icdeptCode: resolvedMappingIccatCode,
          icdeptName: selectedCategoryName,
          iccatCode: resolvedMappingIccatCode,
          iccatName: selectedCategoryName,
          qtyBarcodeId: resolvedCategoryQtyBarcodeId,
          qtyDisplayQty: mappedQty?.displayQty ?? null,
          qtyBarcodeValue: mappedQty?.barcodeValue || null,
          qtyLabel: mappedQty?.label || null,
          updatedAt: new Date().toISOString(),
        };
        const index = prev.findIndex(
          (item) => normalizeMappingCode(item.icdeptCode || item.iccatCode) === resolvedMappingIccatCode
        );
        if (index === -1) {
          return [...prev, nextItem];
        }
        const clone = [...prev];
        clone[index] = nextItem;
        return clone;
      });
    }
  };

  const handleSaveProductBarcode = async (row) => {
    if (!canManage) return;
    const key = `product_barcode:${row.goodsCode}`;
    const normalized = normalizeProductBarcodeInput(productBarcodeDrafts[row.goodsCode]);
    if (!normalized) {
      await runMutation(
        key,
        {
          action: "clear_trade_code_barcode",
          goodsCode: row.goodsCode,
        },
        `ล้างบาร์โค้ดสินค้า ${row.skuCode} สำเร็จ`
      );
      return;
    }
    if (!PRODUCT_BARCODE_REGEX.test(normalized)) {
      showToast("error", `รูปแบบบาร์โค้ดสินค้าไม่ถูกต้อง (${row.skuCode})`);
      return;
    }
    const ok = await runMutation(
      key,
      {
        action: "set_trade_code_barcode",
        goodsCode: row.goodsCode,
        skuCode: row.skuCode,
        productBarcode: normalized,
      },
      `บันทึกบาร์โค้ดสินค้า ${row.skuCode} สำเร็จ`
    );
    if (ok) {
      setProductBarcodeDrafts((prev) => ({ ...prev, [row.goodsCode]: normalized }));
    }
  };

  const handleGenerateWip03Barcodes = async () => {
    if (!canManage || savingKey) return;
    if (!window.confirm("สร้างบาร์โค้ด RCN-13 อัตโนมัติให้เฉพาะสินค้า WIP 03 ที่ยังไม่มีบาร์โค้ดใช่หรือไม่?")) {
      return;
    }

    const key = "generate_wip03_rcn13_barcodes";
    setSavingKey(key);
    try {
      const result = await mutatePalletBarcodeSettings({ action: "generate_wip03_rcn13_barcodes" });
      if (!result.ok) {
        throw new Error(toErrorMessage(result, "สร้างบาร์โค้ด WIP 03 ไม่สำเร็จ"));
      }
      const payload = result.data?.data || {};
      const generatedRows = Array.isArray(payload.rows) ? payload.rows : [];
      setProductBarcodeDrafts((prev) => {
        const next = { ...prev };
        generatedRows.forEach((item) => {
          next[item.goodsCode] = item.productBarcode;
        });
        return next;
      });
      showToast(
        "success",
        `สร้างบาร์โค้ด WIP 03 สำเร็จ ${Number(payload.createdCount || 0).toLocaleString()} รายการ (มีอยู่แล้ว ${Number(payload.skippedCount || 0).toLocaleString()} รายการ)`
      );
      await reloadCurrent();
    } catch (error) {
      showToast("error", error?.message || "สร้างบาร์โค้ด WIP 03 ไม่สำเร็จ");
    } finally {
      setSavingKey("");
    }
  };

  const handleSaveSkuMapping = async (row) => {
    if (!canManage) return;
    const key = `sku_mapping:${row.skuCode}`;
    const hasDraft = Object.prototype.hasOwnProperty.call(skuMappingDrafts, row.skuCode);
    const nextQtyBarcodeId = String(
      hasDraft ? (skuMappingDrafts[row.skuCode] || "") : (row.skuQtyBarcodeId || "")
    ).trim();
    if (!nextQtyBarcodeId) {
      await runMutation(
        key,
        {
          action: "clear_sku_mapping",
          skuCode: row.skuCode,
        },
        `ล้างการผูก SKU ${row.skuCode} สำเร็จ`
      );
      return;
    }
    await runMutation(
      key,
      {
        action: "set_sku_mapping",
        skuCode: row.skuCode,
        qtyBarcodeId: nextQtyBarcodeId,
        allowReplace: true,
      },
      `บันทึกการผูก SKU ${row.skuCode} สำเร็จ`
    );
  };

  const handlePrintQtyBarcode = async (item) => {
    const payload = buildPrintPayload(item);
    if (printMode === "sunmi") {
      const result = await printQtyBarcodeDirect(payload);
      if (result.ok) {
        showToast("success", `พิมพ์ผ่าน SUNMI สำเร็จ (${payload.barcodeValue})`);
        return;
      }
      const fallback = window.confirm(
        "พิมพ์ผ่าน SUNMI ไม่สำเร็จ ต้องการพิมพ์ผ่านเครื่องพิมพ์คอมพิวเตอร์แทนหรือไม่?"
      );
      if (!fallback) {
        showToast("error", "พิมพ์ผ่าน SUNMI ไม่สำเร็จ กรุณาตรวจสอบ wrapper และเครื่องพิมพ์");
        return;
      }
    }
    setPrintLabel(payload);
    setIsPrintingDesktop(true);
  };

  return (
    <div className="mx-auto w-[calc(100%-1rem)] max-w-[1920px] py-3 space-y-0">
      {printLabel ? (
        <section
          id="qty-barcode-print-label"
          aria-hidden="true"
          className="fixed -left-[9999px] top-0 bg-white text-black"
        >
          <div
            style={{
              width: "56mm",
              minHeight: "30mm",
              padding: "2mm",
              border: "1px solid #000",
              fontFamily: "Tahoma, Noto Sans Thai, sans-serif",
            }}
          >
            <div style={{ textAlign: "center", fontSize: "12px", fontWeight: 700 }}>
              {printLabel.label}
            </div>
            <div style={{ marginTop: "1.2mm", textAlign: "center", display: "flex", justifyContent: "center" }}>
              <Barcode
                value={printLabel.barcodeValue}
                format="CODE128"
                width={1.5}
                height={44}
                fontSize={12}
                margin={0}
                displayValue
                background="#ffffff"
                lineColor="#000000"
              />
            </div>
            <div style={{ marginTop: "1mm", fontSize: "11px", textAlign: "center", fontWeight: 700 }}>
              {printLabel.humanText}
            </div>
          </div>
        </section>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleImportFile}
      />

      <style jsx global>{`
        @page {
          size: 58mm auto;
          margin: 2mm;
        }

        @media print {
          body.qty-barcode-printing * {
            visibility: hidden !important;
          }

          body.qty-barcode-printing #qty-barcode-print-label,
          body.qty-barcode-printing #qty-barcode-print-label * {
            visibility: visible !important;
          }

          body.qty-barcode-printing #qty-barcode-print-label {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            z-index: 2147483647 !important;
            background: #fff !important;
          }
        }
      `}</style>

      {toast ? (
        <div className="fixed right-4 top-4 z-[90] w-[min(92vw,420px)]">
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border px-4 py-3 shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{toast.message}</p>
              <button
                type="button"
                onClick={dismissToast}
                className="text-xs font-bold opacity-70 hover:opacity-100"
                aria-label="Close notification"
              >
                x
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="border border-[#163b6b] bg-[#163b6b] px-4 py-3 text-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">จัดการบาร์โค้ดพาเลท</h2>
            <p className="sr-only">
              รูปแบบพิมพ์: CODE128, กระดาษ 58mm, ค่าในบาร์โค้ดเป็น QTY:NNN
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-white/80">โหมดพิมพ์</label>
            <select
              value={printMode}
              onChange={(event) => setPrintMode(event.target.value)}
              className="h-9 rounded-sm border border-white/50 bg-white px-3 text-xs text-[#163b6b]"
            >
              {hasSunmiBridge ? <option value="sunmi">SUNMI Wrapper</option> : null}
              <option value="desktop">Desktop Printer</option>
            </select>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || isExporting}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/70 bg-transparent px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <Download size={14} />
              {isExporting ? "กำลัง Export..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={openImportPicker}
              disabled={!canManage || isImporting}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-[#c99b2e] bg-[#c99b2e] px-3 text-xs font-semibold text-[#163b6b] hover:bg-[#b98d28] disabled:opacity-50"
            >
              <Upload size={14} />
              {isImporting ? "กำลัง Import..." : "Import Excel"}
            </button>
            <button
              type="button"
              onClick={reloadCurrent}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/70 bg-transparent px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={14} />
              รีโหลด
            </button>
          </div>
        </div>

      </section>

      <section className="overflow-hidden border-x border-b border-slate-300 bg-[#fcfbf8]">
        <div className="grid lg:grid-cols-[0.78fr_1.2fr_1.18fr]">
          <div className="border-b border-slate-300 px-4 py-3 lg:border-b-0 lg:border-r">
            <h3 className="text-xs font-bold text-[#102C57]">1. เพิ่มบาร์โค้ดตามจำนวน</h3>
            <div className="mt-3 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-2">
              <label className="min-w-0 text-[11px] font-medium text-slate-700">
                จำนวน
                <input
                  value={newQtyInput}
                  onChange={(event) => setNewQtyInput(event.target.value)}
                  placeholder="เช่น 30"
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 bg-white px-2 text-xs font-mono outline-none focus:border-[#102C57]"
                  disabled={!canManage || Boolean(savingKey)}
                />
              </label>
              <label className="min-w-0 text-[11px] font-medium text-slate-700">
                ชื่อป้าย
                <input
                  value={newQtyLabel}
                  onChange={(event) => setNewQtyLabel(event.target.value)}
                  placeholder="ไม่บังคับ"
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 bg-white px-2 text-xs outline-none focus:border-[#102C57]"
                  disabled={!canManage || Boolean(savingKey)}
                />
              </label>
              <button
                type="button"
                onClick={handleCreateQtyBarcode}
                disabled={!canManage || Boolean(savingKey)}
                className="mt-[22px] inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#c99b2e] px-3 text-[11px] font-bold text-[#163b6b] hover:bg-[#b98d28] disabled:opacity-50"
              >
                <Plus size={13} />
                เพิ่ม
              </button>
            </div>
          </div>

          <div className="border-b border-slate-300 px-4 py-3 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[#102C57]">2. บาร์โค้ดตามจำนวน</h3>
              <span className="text-[10px] text-slate-500">{qtyBarcodes.length.toLocaleString()} รายการ</span>
            </div>
            <div className="mt-2 max-h-[118px] overflow-y-auto border border-slate-200 bg-white">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[#102C57] text-white">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">จำนวน</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Barcode Value</th>
                    <th className="px-2 py-1.5 text-left font-semibold">ชื่อป้าย</th>
                    <th className="px-2 py-1.5 text-center font-semibold">พิมพ์</th>
                  </tr>
                </thead>
                <tbody>
                  {qtyBarcodes.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-2 py-1 font-semibold text-[#102C57]">{item.displayQty}</td>
                      <td className="px-2 py-1 font-mono text-[#102C57]">{item.barcodeValue}</td>
                      <td className="px-2 py-1">{item.label || "-"}</td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handlePrintQtyBarcode(item)}
                          title="พิมพ์"
                          aria-label={`พิมพ์บาร์โค้ดจำนวน ${item.displayQty}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-[#102C57] bg-white text-[#102C57] hover:bg-[#fff7db]"
                        >
                          <Printer size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!qtyBarcodes.length ? (
                    <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-400">ยังไม่มีบาร์โค้ดจำนวน</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-4 py-3">
            <h3 className="text-xs font-bold text-[#102C57]">3. ผูกบาร์โค้ดตามจำนวนเข้ากับ ICDEPT</h3>
            <div className="mt-3 grid grid-cols-[minmax(0,0.76fr)_minmax(0,1.14fr)_auto] gap-2">
              <label className="min-w-0 text-[11px] font-medium text-slate-700">
                ICDEPT
                <select
                  value={resolvedMappingIccatCode}
                  onChange={(event) => setMappingIccatCode(event.target.value)}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 bg-white px-2 text-xs outline-none focus:border-[#102C57]"
                >
                  <option value="">เลือก ICDEPT</option>
                  {icdeptOptions.map((item) => (
                    <option key={item.iccatCode || item.icdeptCode} value={item.iccatCode || item.icdeptCode}>
                      {(item.iccatCode || item.icdeptCode)} - {(item.iccatName || item.icdeptName)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-[11px] font-medium text-slate-700">
                บาร์โค้ดตามจำนวน
                <select
                  value={resolvedCategoryQtyBarcodeId}
                  onChange={(event) => setCategoryQtyDrafts((prev) => ({ ...prev, [resolvedMappingIccatCode]: event.target.value }))}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 bg-white px-2 text-xs outline-none focus:border-[#102C57]"
                  disabled={!canManage}
                >
                  <option value="">ไม่ผูก (ใช้ SKU override เท่านั้น)</option>
                  {qtyBarcodes.map((item) => <option key={item.id} value={item.id}>{item.displayQty} ({item.barcodeValue})</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={handleSaveCategoryMapping}
                disabled={!canManage || !resolvedMappingIccatCode || Boolean(savingKey)}
                className="mt-[22px] inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#163b6b] px-3 text-[11px] font-bold text-white hover:bg-[#102C57] disabled:opacity-50"
              >
                <Save size={13} />
                บันทึก ICDEPT
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-600">
              การผูกปัจจุบัน: <span className="font-semibold text-[#102C57]">{selectedCategoryName}</span> → <span className="font-mono text-[#102C57]">{resolvedCategoryMapping?.qtyBarcodeValue || "-"}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 overflow-hidden border border-slate-300 bg-white">
        <div className="border-b border-slate-300 bg-[#fcfbf8] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-2 shrink-0 text-xs font-bold text-[#102C57]">ผูกบาร์โค้ดรหัสซื้อขาย + SKU Override</h3>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="ค้นหา SKU / ชื่อสินค้า"
            className="h-8 min-w-[230px] flex-1 rounded-sm border border-slate-300 bg-white px-2 text-xs outline-none focus:border-[#102C57]"
          />
          <select
            value={selectedIccat}
            onChange={(event) => setSelectedIccat(event.target.value)}
            className="h-8 w-[150px] rounded-sm border border-slate-300 bg-white px-2 text-xs outline-none focus:border-[#102C57]"
          >
            <option value="">ทุก ICCAT</option>
            {iccatOptions.map((item) => (
              <option
                key={item.icdeptCode || item.iccatCode}
                value={item.icdeptCode || item.iccatCode}
              >
                {(item.icdeptCode || item.iccatCode)} - {(item.icdeptName || item.iccatName)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-[#163b6b] px-3 text-[11px] font-bold text-white hover:bg-[#102C57] disabled:opacity-50"
          >
            <Search size={14} />
            ค้นหา
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            รีเซ็ต
          </button>
          <button
            type="button"
            onClick={handleGenerateWip03Barcodes}
            disabled={!canManage || Boolean(savingKey)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-[#c99b2e] px-3 text-[10px] font-bold text-[#163b6b] hover:bg-[#b98d28] disabled:opacity-50"
          >
            <WandSparkles size={13} />
            สร้างบาร์โค้ด WIP 03 อัตโนมัติ
          </button>
          <span className="ml-auto shrink-0 text-[10px] text-slate-500">
            หน้า {pagination.page.toLocaleString()} / {pagination.totalPages.toLocaleString()} | ทั้งหมด {pagination.totalRecords.toLocaleString()} รหัสซื้อขาย
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev || loading}
              className="h-7 rounded-sm border border-slate-300 bg-white px-2.5 text-[10px] font-semibold text-slate-700 disabled:opacity-50"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || loading}
              className="h-7 rounded-sm bg-[#163b6b] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
          </div>
          <p className="sr-only">WIP 03 ที่ยังไม่มีบาร์โค้ด: สร้างเป็น RCN-13 (`04` + running number + check digit)</p>

          <div className="mt-2 overflow-hidden border-t border-slate-300">
          <table className="w-full table-fixed border-collapse border border-slate-300 bg-white text-xs [&_td]:whitespace-nowrap [&_td]:border-r [&_td]:border-slate-200 [&_th]:whitespace-nowrap [&_th]:border-r [&_th]:border-white/25">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[18%]" />
              <col className="w-[5%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-[#102C57] text-white">
              <tr>
                <th className="px-2 py-2.5 text-left font-semibold">Trade Code</th>
                <th className="px-2 py-2.5 text-left font-semibold">SKU</th>
                <th className="px-2 py-2.5 text-left font-semibold">ชื่อสินค้า</th>
                <th className="px-2 py-2.5 text-left font-semibold">รูปสินค้า</th>
                <th className="px-2 py-2.5 text-left font-semibold">ICDEPT</th>
                <th className="px-2 py-2.5 text-left font-semibold">Brand</th>
                <th className="px-2 py-2.5 text-left font-semibold">หน่วย</th>
                <th className="px-2 py-2.5 text-left font-semibold">บาร์โค้ดสินค้า</th>
                <th className="px-2 py-2.5 text-left font-semibold">SKU Override</th>
                <th className="px-2 py-2.5 text-left font-semibold">ผลลัพธ์ที่ใช้จริง</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => {
                const productBarcodeValue = productBarcodeDrafts[row.goodsCode] ?? row.productBarcode ?? "";
                const hasSkuMappingDraft = Object.prototype.hasOwnProperty.call(skuMappingDrafts, row.skuCode);
                const explicitSkuMappingValue = hasSkuMappingDraft
                  ? (skuMappingDrafts[row.skuCode] ?? "")
                  : (row.skuQtyBarcodeId ?? "");
                const isSavingBarcode = savingKey === `product_barcode:${row.goodsCode}`;
                const isSavingSkuMap = savingKey === `sku_mapping:${row.skuCode}`;
                const categoryCode = normalizeMappingCode(row.icdeptCode || row.iccatCode || "");
                const categoryMapping = categoryMappingByCode.get(categoryCode) || null;
                const categoryQtyBarcodeId = categoryMapping?.qtyBarcodeId || "";
                const skuMappingDisplayValue = explicitSkuMappingValue || categoryQtyBarcodeId || "";
                const skuQty = explicitSkuMappingValue
                  ? (qtyBarcodeById.get(explicitSkuMappingValue) || null)
                  : null;
                const categoryQty = categoryQtyBarcodeId
                  ? (qtyBarcodeById.get(categoryQtyBarcodeId) || null)
                  : null;
                const effectiveQtyBarcodeValue = skuQty?.barcodeValue
                  || categoryQty?.barcodeValue
                  || row.effectiveQtyBarcodeValue
                  || "-";
                const effectiveSource = skuQty
                  ? "sku"
                  : (categoryQty ? "category" : row.effectiveSource);
                return (
                  <tr key={`${row.goodsCode}:${row.skuCode}`} className="h-12 border-b border-slate-200 hover:bg-[#fffaf0]">
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-[#102C57]">{row.goodsCode || "-"}</td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-[#102C57]">{row.skuCode}</td>
                    <td className="!whitespace-normal px-2 py-1 align-middle">
                      <div className="max-h-10 overflow-hidden leading-5" title={row.skuName}>{row.skuName}</div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        {row.imageUrl ? (
                          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-slate-300 bg-slate-50 group rounded-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.imageUrl}
                              alt="Product"
                              className="h-full w-full object-contain"
                            />
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleClearProductImage(row.skuCode)}
                              className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                title="ลบรูปสินค้า"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <label className={`flex h-8 w-8 shrink-0 items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-slate-400 rounded-sm ${canManage ? "cursor-pointer hover:border-[#102C57] hover:text-[#102C57]" : ""}`}>
                            <Upload size={12} />
                            {canManage && (
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleUploadProductImage(row.skuCode, file);
                                  }
                                }}
                              />
                            )}
                          </label>
                        )}
                        {savingKey === `product_image:${row.skuCode}` && (
                          <span className="text-[9px] text-slate-400 animate-pulse">...</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1" title={`${row.icdeptCode || row.iccatCode} ${row.icdeptName || row.iccatName || ""}`}>
                      {(row.icdeptCode || row.iccatCode)} {(row.icdeptName || row.iccatName) ? `- ${row.icdeptName || row.iccatName}` : ""}
                    </td>
                    <td className="px-2 py-1" title={row.brandName || row.brandCode || "-"}>{row.brandName || row.brandCode || "-"}</td>
                    <td className="px-2 py-1" title={row.unitName || "-"}>{row.unitName || "-"}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={productBarcodeValue}
                          onChange={(event) => setProductBarcodeDrafts((prev) => ({
                            ...prev,
                            [row.goodsCode]: event.target.value,
                          }))}
                          placeholder="เช่น 8851234567890"
                          className="h-8 min-w-0 flex-1 rounded-sm border border-slate-300 px-1.5 font-mono text-xs outline-none focus:border-[#102C57]"
                          disabled={!canManage}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveProductBarcode(row)}
                          disabled={!canManage || isSavingBarcode}
                          title="บันทึกบาร์โค้ดสินค้า"
                          aria-label={`บันทึกบาร์โค้ดสินค้า ${row.skuCode}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[#102C57] bg-white text-[#102C57] disabled:opacity-50"
                        >
                          <Save size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <select
                          value={skuMappingDisplayValue}
                          onChange={(event) => setSkuMappingDrafts((prev) => ({
                            ...prev,
                            [row.skuCode]: event.target.value,
                          }))}
                          className="h-8 min-w-0 flex-1 rounded-sm border border-slate-300 px-1.5 text-xs outline-none focus:border-[#102C57]"
                          disabled={!canManage}
                        >
                          <option value="">ใช้ค่าหมวด/ไม่กำหนด</option>
                          {qtyBarcodes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.displayQty} ({item.barcodeValue})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSaveSkuMapping(row)}
                          disabled={!canManage || isSavingSkuMap}
                          title="บันทึก SKU Override"
                          aria-label={`บันทึก SKU Override ${row.skuCode}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[#102C57] bg-white text-[#102C57] disabled:opacity-50"
                        >
                          <Save size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSkuMappingDrafts((prev) => ({
                            ...prev,
                            [row.skuCode]: "",
                          }))}
                          disabled={!canManage}
                          title="ล้าง SKU Override"
                          aria-label={`ล้าง SKU Override ${row.skuCode}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-mono text-[#102C57]" title={`${effectiveQtyBarcodeValue} (${formatSource(effectiveSource)})`}>
                        {effectiveQtyBarcodeValue} <span className="font-sans text-[11px] text-slate-500">({formatSource(effectiveSource)})</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!products.length ? (
                <tr>
                  <td colSpan={10} className="px-2 py-5 text-center text-gray-400">
                    ไม่พบสินค้า
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  );
}

