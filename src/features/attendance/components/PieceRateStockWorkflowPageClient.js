"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Ban,
  CheckCircle2,
  Loader2,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  ScanLine,
  Scale,
  Undo2,
  X,
} from "lucide-react";
import usePieceRateDesktopScale from "@/app/production-line/attendance/piece-rate-scan/usePieceRateDesktopScale";
import {
  fetchPieceRateStockDocument,
  submitPieceRateStockIssue,
  submitPieceRateStockIssueBatch,
  submitPieceRateStockIssueCancellation,
  submitPieceRateStockReturn,
  submitPieceRateWeighCancellation,
  fetchBiscuitFgProducts,
  fetchAvailablePieceRateStockLabels,
} from "@/features/attendance/services/pieceRateStockClient";
import {
  getCachedPieceRateEmployeeLookup,
  getCachedPieceRateProductLookup,
  getAllCachedPieceRateProducts,
  getAllCachedPieceRateEmployees,
} from "@/lib/offline/pieceRateOffline";
import {
  fetchPieceRateEmployeeLookup,
  fetchPieceRateProductLookup,
} from "@/features/attendance/services/pieceRateWorkClient";
import styles from "./PieceRateStockWorkflowPageClient.module.css";
import PieceRateWorkflowTabs from "./PieceRateWorkflowTabs";
import PieceRatePrisonIssueModal from "./PieceRatePrisonIssueModal";
import { createBarcodeScanQueue } from "@/features/production-line/lib/barcodeScanQueue";
import { printPieceRateLabelViaAgent } from "@/features/production-line/services/localPrintAgentClient";
import { buildPieceRateDesktopLabel } from "@/lib/piece-rate-desktop-label";
import { toBangkokDateKey } from "@/lib/bangkokDate";
import { validatePieceRateIssueProductRoles } from "@/features/attendance/utils/pieceRateIssueProductRoles";
import { buildAvailableLabelProductOptions } from "@/features/attendance/utils/pieceRateAvailableLabelProducts";

const LABEL_PAGE_SIZE = 50;

function getBangkokDate() {
  return toBangkokDateKey(new Date());
}

const MODE_CONFIG = Object.freeze({
  issue: {
    eyebrow: "STOCK ISSUE",
    title: "เบิกเนื้อขนมป้ายแยม",
    description: "สแกนบาร์โค้ดจากป้ายแยมเพื่อเบิกออกจากรายการชั่งเข้า",
    actionLabel: "ยืนยันการเบิก",
    actionIcon: ArrowDownToLine,
    hint: "สแกนป้ายแล้วระบบเบิกออกทันที",
    tone: "issue",
  },
  return: {
    eyebrow: "WEIGH RETURN",
    title: "ชั่งคืนเนื้อขนมป้ายแยม",
    description: "สแกนป้ายที่เบิกแล้ว และชั่งน้ำหนักคืนผ่าน Scale Agent",
    actionLabel: "บันทึกน้ำหนักคืน",
    actionIcon: RotateCcw,
    hint: "อ่านน้ำหนักคืนจาก Scale Agent",
    tone: "return",
  },
  "cancel-issue": {
    eyebrow: "CANCEL ISSUE",
    title: "ยกเลิกเบิกป้ายแยม",
    description: "ยกเลิกรายการเบิกที่ยังไม่มีการชั่งคืน",
    actionLabel: "ยืนยันยกเลิกเบิก",
    actionIcon: Undo2,
    hint: "คืนสถานะป้ายกลับเป็นพร้อมเบิก",
    tone: "cancel",
  },
  "cancel-weigh": {
    eyebrow: "CANCEL WEIGH",
    title: "ยกเลิกชั่งเข้าป้ายแยม",
    description: "ยกเลิกเอกสารชั่งเข้าที่ยังไม่ถูกนำไปเบิก",
    actionLabel: "ยืนยันยกเลิกชั่ง",
    actionIcon: Ban,
    hint: "ยกเลิกเอกสารชั่งเข้าที่ยังไม่ถูกเบิก",
    tone: "cancel",
  },
});

const WORKFLOW_TABS = Object.freeze([
  { href: "/production-line/attendance/piece-rate-stock/issue", label: "เบิก", mode: "issue" },
  { href: "/production-line/attendance/piece-rate-stock/return", label: "ชั่งคืน", mode: "return" },
  { href: "/production-line/attendance/piece-rate-stock/cancel-issue", label: "ยกเลิกเบิก", mode: "cancel-issue" },
  { href: "/production-line/attendance/piece-rate-stock/cancel-weigh", label: "ยกเลิกชั่ง", mode: "cancel-weigh" },
]);

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function getErrorMessage(result, fallback) {
  return String(result?.error?.message || result?.error || fallback || "เกิดข้อผิดพลาด");
}

function validateDocumentForMode(mode, payload) {
  const log = payload?.log || null;
  const issue = payload?.issue || null;

  if (log && log.docStatus !== "active") {
    return `เอกสาร ${log.docNo} ไม่อยู่ในสถานะใช้งาน (สถานะปัจจุบัน: ${log.docStatus})`;
  }

  if (mode === "issue" && issue) {
    return `ป้ายนี้เบิกแล้ว เลขที่ ${issue.issueNo}`;
  }
  if ((mode === "return" || mode === "cancel-issue") && !issue) {
    return "ป้ายนี้ยังไม่มีรายการเบิก";
  }
  if (mode === "cancel-issue" && Number(issue?.returnedWeightKg || 0) > 0) {
    return "รายการนี้มีการชั่งคืนแล้ว ไม่สามารถยกเลิกเบิกได้";
  }
  if (mode === "cancel-weigh" && issue) {
    return "เอกสารนี้ถูกเบิกแล้ว ต้องยกเลิกเบิกก่อนยกเลิกชั่ง";
  }
  if (mode === "return" && Number(issue?.remainingWeightKg || 0) <= 0) {
    return "รายการนี้ชั่งคืนครบแล้ว";
  }
  return "";
}

export default function PieceRateStockWorkflowPageClient({
  mode = "issue",
  workflowActiveMode = mode,
  issueSource = "label",
  embedded = false,
  onModeChange,
}) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.issue;
  const barcodeInputRef = useRef(null);
  const autoReturnDocRef = useRef(null);
  const submitLockRef = useRef(false);
  const scanQueueRef = useRef(null);
  if (!scanQueueRef.current) {
    scanQueueRef.current = createBarcodeScanQueue({ cooldownMs: 2500 });
  }
  const [barcode, setBarcode] = useState("");
  const [documentData, setDocumentData] = useState(null);
  const [issueType, setIssueType] = useState("KPF");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentActions, setRecentActions] = useState([]);
  const [returnDate, setReturnDate] = useState(getBangkokDate);
  const [issueDate, setIssueDate] = useState(getBangkokDate);

  // New states for Step-by-Step Issue Flow
  const [issueProduct, setIssueProduct] = useState(null);
  const [isPrisonIssueOpen, setIsPrisonIssueOpen] = useState(false);
  const [productBarcode, setProductBarcode] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");

  const [allProducts, setAllProducts] = useState([]);
  const [isLabelPickerOpen, setIsLabelPickerOpen] = useState(false);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [labelSearchQuery, setLabelSearchQuery] = useState("");
  const [labelDateFilter, setLabelDateFilter] = useState(getBangkokDate);
  const [selectedProductCodes, setSelectedProductCodes] = useState(() => new Set());
  const [isProductFilterOpen, setIsProductFilterOpen] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState(() => new Set());
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [isBatchIssuing, setIsBatchIssuing] = useState(false);
  const [labelPage, setLabelPage] = useState(1);

  const productInputRef = useRef(null);
  const labelProductOptions = useMemo(
    () => buildAvailableLabelProductOptions(availableLabels),
    [availableLabels]
  );

  const filteredAvailableLabels = useMemo(() => {
    const query = labelSearchQuery.trim().toLowerCase();
    return availableLabels.filter((row) => {
      if (!selectedProductCodes.has(String(row.productCode || ""))) return false;
      const rowDate = row.businessDate || toBangkokDateKey(row.recordedAt);
      if (labelDateFilter && rowDate !== labelDateFilter) return false;
      if (!query) return true;
      return [row.barcode, row.lotNo, row.productCode, row.productName]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [availableLabels, labelDateFilter, labelSearchQuery, selectedProductCodes]);

  const labelTotalPages = Math.max(1, Math.ceil(filteredAvailableLabels.length / LABEL_PAGE_SIZE));
  const pagedAvailableLabels = useMemo(() => {
    const start = (labelPage - 1) * LABEL_PAGE_SIZE;
    return filteredAvailableLabels.slice(start, start + LABEL_PAGE_SIZE);
  }, [filteredAvailableLabels, labelPage]);

  useEffect(() => {
    setLabelPage(1);
  }, [labelDateFilter, labelSearchQuery, selectedProductCodes]);

  useEffect(() => {
    if (labelPage > labelTotalPages) setLabelPage(labelTotalPages);
  }, [labelPage, labelTotalPages]);

  const closeLabelPicker = useCallback(() => {
    setIsLabelPickerOpen(false);
    setLabelSearchQuery("");
    setSelectedLabelIds(new Set());
    setIsProductFilterOpen(false);
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
  }, []);

  const loadAvailableLabels = useCallback(async () => {
    setIsLoadingLabels(true);
    setAvailableLabels([]);
    setSelectedLabelIds(new Set());
    setLabelPage(1);
    setError("");
    try {
      const result = await fetchAvailablePieceRateStockLabels();
      if (!result?.ok) {
        setError(getErrorMessage(result, "ไม่สามารถโหลดรายการที่ยังไม่เคยเบิกได้"));
        return;
      }
      const rows = Array.isArray(result.data?.data) ? result.data.data : [];
      const productOptions = buildAvailableLabelProductOptions(rows);
      setAvailableLabels(rows);
      setSelectedProductCodes(new Set(productOptions.map((product) => product.code)));
    } catch (loadError) {
      setError(String(loadError?.message || "ไม่สามารถโหลดรายการที่ยังไม่เคยเบิกได้"));
    } finally {
      setIsLoadingLabels(false);
    }
  }, []);

  const openLabelPicker = useCallback(() => {
    setSelectedProductCodes(new Set());
    setLabelDateFilter(getBangkokDate());
    setLabelPage(1);
    setIsLabelPickerOpen(true);
    void loadAvailableLabels();
  }, [loadAvailableLabels]);

  const toggleSelectedLabel = useCallback((id) => {
    setSelectedLabelIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchIssue = useCallback(async () => {
    const selectedRows = availableLabels.filter((row) => selectedLabelIds.has(row.id));
    if (!selectedRows.length || isBatchIssuing) return;
    setIsBatchIssuing(true);
    setError("");
    try {
      const result = await submitPieceRateStockIssueBatch({
        barcodes: selectedRows.map((row) => row.barcode),
        issueType: "KPF",
        remark: "เบิกสินค้า WIP จากรายการ",
        fgProductCode: issueProduct?.code || issueProduct?.goodsCode || issueProduct?.skuCode,
        fgProductName: issueProduct?.name || "",
        issueDate,
      });
      if (!result?.ok) throw new Error(getErrorMessage(result, "ไม่สามารถเบิกรายการที่เลือกได้"));
      const batch = result.data?.data;
      const succeeded = Number(batch?.succeededCount || 0);
      const failed = Number(batch?.failedCount || 0);
      if (failed > 0) {
        setError(`เบิกสำเร็จ ${succeeded} รายการ ไม่สำเร็จ ${failed} รายการ กรุณาตรวจสอบรายการคงเหลือ`);
        await loadAvailableLabels();
      } else {
        setSuccess(`เบิกสำเร็จ ${succeeded} รายการ`);
        closeLabelPicker();
      }
    } catch (batchError) {
      setError(String(batchError?.message || "ไม่สามารถเบิกรายการที่เลือกได้"));
    } finally {
      setIsBatchIssuing(false);
    }
  }, [availableLabels, closeLabelPicker, isBatchIssuing, issueDate, issueProduct, loadAvailableLabels, selectedLabelIds]);

  useEffect(() => {
    if (!isLabelPickerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeLabelPicker();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLabelPicker, isLabelPickerOpen]);

  useEffect(() => {
    if (mode === "issue") {
      fetchBiscuitFgProducts()
        .then((result) => {
          console.log("Biscuit products loaded from API:", result);
          const productsArray = result?.data?.data;
          if (result?.ok && Array.isArray(productsArray)) {
            const unique = [];
            const seen = new Set();
            productsArray.forEach((p) => {
              const code = p.code || p.goodsCode || p.skuCode;
              if (code && !seen.has(code)) {
                seen.add(code);
                unique.push(p);
              }
            });
            console.log("Unique biscuit products count:", unique.length);
            setAllProducts(unique);
          }
        })
        .catch((err) => {
          console.error("Failed to load biscuit products:", err);
        });
    }
  }, [mode]);

  const scale = usePieceRateDesktopScale({
    enabled: mode === "return",
    hasProduct: Boolean(documentData?.log),
    hasEmployee: true,
  });

  const returnWeightKg = Number(scale.weightKg || 0);
  const remainingWeightKg = Number(documentData?.issue?.remainingWeightKg || 0);
  const modeValidation = useMemo(
    () => (documentData ? validateDocumentForMode(mode, documentData) : ""),
    [documentData, mode]
  );

  useEffect(() => {
    if (mode === "issue") {
      if (!issueProduct) {
        productInputRef.current?.focus();
      } else {
        barcodeInputRef.current?.focus();
      }
    } else {
      barcodeInputRef.current?.focus();
    }
  }, [mode, issueProduct]);

  const resetForm = useCallback(() => {
    autoReturnDocRef.current = null;
    setBarcode("");
    setDocumentData(null);
    setError("");
    setSuccess("");
    if (mode === "issue") {
      setIssueProduct(null);
      setProductBarcode("");
      window.setTimeout(() => productInputRef.current?.focus(), 0);
    } else {
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  }, [mode]);

  const appendRecentAction = useCallback((sourceData, actionWeight) => {
    setRecentActions((rows) => [{
      id: `${Date.now()}-${sourceData.log.id}`,
      docNo: sourceData.log.docNo,
      lotNo: sourceData.log.lotNo,
      productCode: sourceData.log.productCode,
      productName: sourceData.log.productName,
      weightKg: actionWeight,
      action: config.title,
      recordedAt: new Date().toISOString(),
    }, ...rows].slice(0, 20));
  }, [config.title]);



  const handleProductScan = async (scannedCode) => {
    const normalized = String(scannedCode || "").trim().toUpperCase();
    if (!normalized) return;
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const cached = await getCachedPieceRateProductLookup(normalized);
      if (cached?.product) {
        setIssueProduct(cached.product);
        setProductBarcode("");
        setError("");
        return;
      }
      const result = await fetchPieceRateProductLookup({ barcode: normalized });
      if (result?.ok && result.data?.product) {
        setIssueProduct(result.data.product);
        setProductBarcode("");
        setError("");
      } else {
        setError("ไม่พบรหัสสินค้าหรือบาร์โค้ดนี้");
      }
    } catch (e) {
      setError("ไม่สามารถตรวจสอบสินค้าได้: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentScan = async (scannedBarcode) => {
    const normalized = String(scannedBarcode || "").trim().toUpperCase();
    if (!normalized) return;
    if (!issueProduct) {
      setError("กรุณาระบุสินค้าก่อนสแกนใบเบิก");
      return;
    }

    const queued = scanQueueRef.current.enqueue(normalized, async () => {
      setIsLoading(true);
      setError("");
      setSuccess("");
      setDocumentData(null);
      try {
        const result = await fetchPieceRateStockDocument(normalized);
        if (!result?.ok) {
          setError(getErrorMessage(result, "ไม่พบเอกสารจากบาร์โค้ดนี้"));
          return null;
        }
        const payload = result.data?.data;

        const productRoleError = validatePieceRateIssueProductRoles({
          fgProduct: issueProduct,
          wipLog: payload?.log,
        });
        if (productRoleError) {
          setError(productRoleError);
          return null;
        }

        const validationError = validateDocumentForMode(mode, payload);
        setDocumentData(payload);
        if (validationError) {
          setError(validationError);
          return null;
        }

        setIsSubmitting(true);
        const issueResult = await submitPieceRateStockIssue({
          barcode: payload.log.barcode,
          issueType: "KPF",
          remark: "เบิกสินค้า WIP",
          fgProductCode: issueProduct?.code || issueProduct?.goodsCode || null,
          fgProductName: issueProduct?.name || null,
          issueEmployeeCode: null,
          issueEmployeeName: null,
          issueDate,
        });
        if (!issueResult?.ok) {
          setError(getErrorMessage(issueResult, "ไม่สามารถบันทึกรายการเบิกได้"));
          return null;
        }

        appendRecentAction(payload, Number(payload.log.weightKg || 0));
        setSuccess(`เบิกสำเร็จ: ${payload.log.docNo}`);
        setDocumentData(null);
        return payload;
      } catch (e) {
        setError("ไม่สามารถประมวลผลการเบิกได้: " + e.message);
        return null;
      } finally {
        setIsLoading(false);
        setIsSubmitting(false);
        setBarcode("");
        window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
      }
    });

    if (!queued.accepted) {
      setError(`ข้ามบาร์โค้ดซ้ำ ${normalized} ระบบกำลังประมวลผลหรือเพิ่งบันทึกไปแล้ว`);
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
      return;
    }
    await queued.completion;
  };

  const processScannedBarcode = useCallback(async (normalized) => {
    setIsLoading(true);
    setError("");
    setSuccess("");
    setDocumentData(null);
    autoReturnDocRef.current = null;
    try {
      const result = await fetchPieceRateStockDocument(normalized);
      if (!result?.ok) {
        setError(getErrorMessage(result, "ไม่พบเอกสารจากบาร์โค้ดนี้"));
        return null;
      }
      const payload = result.data?.data;
      const validationError = validateDocumentForMode(mode, payload);
      setDocumentData(payload);
      if (validationError) {
        setError(validationError);
        return null;
      }
      return payload;
    } catch (lookupError) {
      setError(String(lookupError?.message || "ไม่สามารถตรวจสอบบาร์โค้ดได้"));
      return null;
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
      setBarcode("");
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  }, [mode]);

  const handleLookup = useCallback(async () => {
    const normalized = String(barcode || "").trim().toUpperCase();
    if (!normalized) return;
    if (mode === "return" && documentData?.log) {
      setError("รายการก่อนหน้ายังรอน้ำหนักนิ่ง กรุณาให้รายการเดิมบันทึกเสร็จก่อน");
      setBarcode("");
      return;
    }

    const queued = scanQueueRef.current.enqueue(normalized, processScannedBarcode);
    setBarcode("");
    if (!queued.accepted) {
      setError(`ข้ามบาร์โค้ดซ้ำ ${normalized} ระบบกำลังประมวลผลหรือเพิ่งบันทึกไปแล้ว`);
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
      return;
    }
    await queued.completion;
  }, [barcode, documentData?.log, mode, processScannedBarcode]);

  const canSubmit = useMemo(() => {
    if (!documentData?.log || modeValidation || isSubmitting) return false;
    if (mode === "return") {
      return scale.agentConnected
        && scale.portOpen
        && scale.isReadingFresh
        && scale.isStable
        && returnWeightKg > 0
        && returnWeightKg <= remainingWeightKg + 0.0001;
    }
    return true;
  }, [documentData?.log, isSubmitting, mode, modeValidation, remainingWeightKg, returnWeightKg, scale.agentConnected, scale.isReadingFresh, scale.isStable, scale.portOpen]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !documentData?.log || submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    const payload = {
      barcode: documentData.log.barcode,
      issueType,
      issueDate,
      returnWeightKg,
      returnDate,
      fgProductCode: issueProduct?.code || issueProduct?.goodsCode || null,
      fgProductName: issueProduct?.name || null,
      issueEmployeeCode: null,
      issueEmployeeName: null,
    };
    try {
      let result;
      if (mode === "return") result = await submitPieceRateStockReturn(payload);
      else if (mode === "cancel-issue") result = await submitPieceRateStockIssueCancellation(payload);
      else if (mode === "cancel-weigh") result = await submitPieceRateWeighCancellation(payload);
      else result = await submitPieceRateStockIssue(payload);

      if (!result?.ok) {
        setError(getErrorMessage(result, "ไม่สามารถบันทึกรายการได้"));
        return;
      }

      const actionWeight = mode === "return"
        ? returnWeightKg
        : Number(documentData.log.weightKg || 0);
      appendRecentAction(documentData, actionWeight);
      if (mode === "return" && result.data?.data?.return) {
        const returnedItem = result.data.data.return;
        try {
          await printPieceRateLabelViaAgent(buildPieceRateDesktopLabel({
            docNo: returnedItem.barcode,
            productCode: documentData.log.productCode,
            productName: documentData.log.productName,
            employeeCode: documentData.log.employeeCode,
            employeeName: documentData.log.employeeName,
            weightKg: returnedItem.returnWeightKg,
            lotNo: returnedItem.lotNo || documentData.log.lotNo,
            recordedAt: returnedItem.returnedAt,
          }));
          setSuccess(`บันทึกและพิมพ์ป้ายคืน ${returnedItem.barcode} สำเร็จ`);
        } catch (printError) {
          setSuccess(`บันทึกป้ายคืน ${returnedItem.barcode} สำเร็จ แต่พิมพ์ไม่สำเร็จ: ${printError?.message || "ไม่พบเครื่องพิมพ์"}`);
        }
      } else {
        setSuccess(`${config.actionLabel}สำเร็จ: ${documentData.log.docNo}`);
      }
      setDocumentData(null);
      setBarcode("");
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
    } catch (submitError) {
      setError(String(submitError?.message || "ไม่สามารถบันทึกรายการได้"));
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }, [appendRecentAction, canSubmit, config.actionLabel, documentData, issueDate, issueType, mode, returnDate, returnWeightKg, issueProduct]);

  useEffect(() => {
    if (mode !== "return" || !canSubmit || !documentData?.log?.id || isSubmitting) return;
    if (autoReturnDocRef.current === documentData.log.barcode) return;
    autoReturnDocRef.current = documentData.log.barcode;
    void handleSubmit();
  }, [canSubmit, documentData?.log?.barcode, documentData?.log?.id, handleSubmit, isSubmitting, mode]);

  const ActionIcon = config.actionIcon;
  const log = documentData?.log || null;
  const issue = documentData?.issue || null;

  return (
    <main className={styles.page} data-tone={config.tone} data-embedded={embedded}>
      {embedded ? (
        <PieceRateWorkflowTabs activeMode={workflowActiveMode} onChange={onModeChange} />
      ) : null}
      {embedded ? (
        <section className={styles.roleHeader} aria-labelledby="piece-rate-workflow-title">
          <span className={styles.roleIcon}><ActionIcon aria-hidden="true" /></span>
          <div className={styles.roleCopy}>
            <span className={styles.roleEyebrow}>{issueSource === "prison" ? "PRISON WIP ISSUE" : config.eyebrow}</span>
            <h1 id="piece-rate-workflow-title">{issueSource === "prison" ? "เบิกเนื้อขนมเรือนจำ" : config.title}</h1>
            <p>{issueSource === "prison" ? "เลือก FG ปลายทาง แล้วเลือก LOT และจำนวนกระบะที่ต้องการเบิก" : config.description}</p>
          </div>
          <div className={styles.roleHint}>
            <span>โหมดการทำงานปัจจุบัน</span>
            <strong>{issueSource === "prison" ? "เลือก LOT เอง · ระบบคำนวณน้ำหนักอัตโนมัติ" : config.hint}</strong>
          </div>
        </section>
      ) : null}
      {!embedded ? <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{config.eyebrow}</div>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <nav className={styles.tabs} aria-label="ขั้นตอนจัดการสต็อกป้ายแยม">
          {WORKFLOW_TABS.map((tab) => (
            <Link key={tab.mode} href={tab.href} data-active={tab.mode === mode}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </header> : null}

      <section className={styles.workspace} style={mode === "issue" ? { gridTemplateColumns: "1fr" } : undefined}>
        <div className={styles.scanPanel}>
          {mode === "issue" ? (
            <div className="flex flex-col md:grid md:grid-cols-2 gap-8 items-stretch">
              {/* Left Column: Product Selection */}
              <div className="flex flex-col gap-4">
                <div className={styles.sectionHeading}>
                  <span className={styles.step}>01</span>
                  <div><strong>เลือก / สแกนสินค้า</strong><small>เลือกจากรายชื่อที่ระบบกำหนด หรือสแกนรหัสสินค้า</small></div>
                </div>

                <label className={styles.returnDateField}>
                  <span>วันที่เบิก</span>
                  <input
                    type="date"
                    value={issueDate}
                    max={getBangkokDate()}
                    onChange={(event) => setIssueDate(event.target.value)}
                    disabled={isSubmitting}
                  />
                </label>

                {!issueProduct ? (
                  <div className="flex flex-col gap-2">
                    <form className={styles.scanForm} onSubmit={(event) => { event.preventDefault(); void handleProductScan(productBarcode); }}>
                      <ScanLine aria-hidden="true" />
                      <input
                        ref={productInputRef}
                        value={productBarcode}
                        onChange={(event) => setProductBarcode(event.target.value)}
                        placeholder="สแกนบาร์โค้ดสินค้า แล้วกด Enter"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="submit" disabled={!productBarcode.trim()}>
                        {isLoading ? <Loader2 className={styles.spin} /> : <ScanLine />}
                        สแกนสินค้า
                      </button>
                    </form>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsProductPickerOpen(true)}
                        className="w-full flex h-10 items-center justify-center gap-2 border border-[#d4af37]/35 bg-[#0f2747] rounded-xl text-xs font-black tracking-wider text-[#f8df8a] active:scale-[0.98] transition"
                      >
                        เลือกสินค้าจากรายชื่อ
                      </button>
                      {isProductPickerOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
                          <div className="w-full max-w-4xl bg-white rounded-none sm:rounded-3xl border-0 sm:border border-slate-200 shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto max-h-screen sm:max-h-[85dvh] animate-in fade-in zoom-in-95 duration-150">
                            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-[#b68a12]">PRODUCT SELECTION</span>
                                <h3 className="text-sm font-black text-[#0f2747]">เลือกรายการสินค้า</h3>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsProductPickerOpen(false)}
                                className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition"
                              >
                                <X size={20} />
                              </button>
                            </header>

                            <div className="p-4 border-b border-slate-100 bg-white">
                              <input
                                type="text"
                                value={productSearchQuery}
                                onChange={(e) => setProductSearchQuery(e.target.value)}
                                placeholder="พิมพ์ค้นหาชื่อ หรือ รหัสสินค้า..."
                                className="w-full h-10 border border-slate-200 rounded-xl px-3 text-xs font-semibold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition"
                                autoFocus
                              />
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 no-scrollbar bg-slate-50 sm:bg-white">
                              {(() => {
                                const filteredProducts = allProducts.filter(p => {
                                  const query = productSearchQuery.toLowerCase();
                                  return (
                                    String(p.name || "").toLowerCase().includes(query) ||
                                    String(p.code || "").toLowerCase().includes(query) ||
                                    String(p.goodsCode || "").toLowerCase().includes(query)
                                  );
                                });

                                if (filteredProducts.length === 0) {
                                  return (
                                    <p className="text-center text-xs text-slate-400 py-8 font-medium bg-white rounded-2xl border border-slate-100">
                                      ไม่พบสินค้าที่ตรงกับการค้นหา
                                    </p>
                                  );
                                }

                                return (
                                  <>
                                    {/* Mobile Card List (hidden on larger screens) */}
                                    <div className="grid grid-cols-1 gap-3 sm:hidden">
                                      {filteredProducts.map((p) => (
                                        <div
                                          key={p.code || p.goodsCode}
                                          onClick={() => {
                                            setIssueProduct(p);
                                            setIsProductPickerOpen(false);
                                            setProductSearchQuery("");
                                          }}
                                          className="flex items-center gap-3.5 p-3 border border-slate-100 rounded-2xl bg-white active:bg-amber-50 cursor-pointer shadow-sm transition"
                                        >
                                          <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
                                            {p.imageUrl ? (
                                              <Image
                                                src={p.imageUrl}
                                                alt=""
                                                width={56}
                                                height={56}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                              />
                                            ) : (
                                              <Package className="w-6 h-6 text-slate-300" />
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-black text-amber-700 tracking-wider">
                                              {p.code || p.goodsCode}
                                            </div>
                                            <div className="text-sm font-bold text-slate-800 whitespace-normal break-words leading-tight max-h-[2.5rem] overflow-hidden">
                                              {p.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                              หน่วย: {p.unitName || p.uom_name || "-"}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Desktop Table List (hidden on mobile) */}
                                    <div className="hidden sm:block border border-slate-100 rounded-xl bg-white overflow-x-auto">
                                      <table className="w-full border-collapse text-left text-xs min-w-max">
                                        <thead>
                                          <tr className="border-b border-slate-200 bg-slate-50 sticky top-0">
                                            <th className="py-2.5 px-3 text-center w-12 text-black font-black whitespace-nowrap">ลำดับ</th>
                                            <th className="py-2.5 px-3 w-16 text-center text-black font-black whitespace-nowrap">รูป</th>
                                            <th className="py-2.5 px-3 text-black font-black whitespace-nowrap">รหัสสินค้า</th>
                                            <th className="py-2.5 px-3 text-black font-black whitespace-nowrap">ชื่อสินค้า</th>
                                            <th className="py-2.5 px-3 text-center text-black font-black whitespace-nowrap">หน่วย</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {filteredProducts.map((p, idx) => (
                                            <tr
                                              key={p.code || p.goodsCode}
                                              onClick={() => {
                                                setIssueProduct(p);
                                                setIsProductPickerOpen(false);
                                                setProductSearchQuery("");
                                              }}
                                              className="border-b border-slate-100 last:border-b-0 hover:bg-amber-50/50 cursor-pointer transition group"
                                            >
                                              <td className="py-3 px-3 text-center text-black font-black whitespace-nowrap">
                                                {idx + 1}
                                              </td>
                                              <td className="py-2 px-3 text-center">
                                                <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center mx-auto">
                                                  {p.imageUrl ? (
                                                    <Image
                                                      src={p.imageUrl}
                                                      alt=""
                                                      width={40}
                                                      height={40}
                                                      className="w-full h-full object-cover"
                                                      unoptimized
                                                    />
                                                  ) : (
                                                    <Package className="w-4 h-4 text-slate-300" />
                                                  )}
                                                </div>
                                              </td>
                                              <td className="py-3 px-3 font-black text-black group-hover:text-black whitespace-nowrap">
                                                {p.code || p.goodsCode}
                                              </td>
                                              <td className="py-3 px-3 text-sm font-black text-black group-hover:text-black whitespace-nowrap leading-tight">
                                                {p.name}
                                              </td>
                                              <td className="py-3 px-3 text-center text-black font-black whitespace-nowrap">
                                                {p.unitName || p.uom_name || "-"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative flex flex-col sm:grid sm:grid-cols-2 items-center -mt-4 pt-1 pb-3 px-5 rounded-2xl border border-amber-100 bg-amber-50/30 text-amber-950 shadow-sm gap-4 sm:gap-6">
                    <button
                      type="button"
                      onClick={() => { setIssueProduct(null); setProductBarcode(""); setIsProductPickerOpen(true); }}
                      className="absolute top-4 right-4 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-black tracking-wide text-rose-600 hover:bg-rose-50 hover:border-rose-300 shadow-sm active:scale-95 transition"
                    >
                      เปลี่ยนสินค้า
                    </button>
                    {/* Left Column: Image */}
                    <div className="w-48 h-48 sm:w-full sm:h-52 flex items-center justify-center -mt-4 sm:mt-0">
                      {issueProduct.imageUrl ? (
                        <Image
                          src={issueProduct.imageUrl}
                          alt=""
                          width={192}
                          height={192}
                          className="w-full h-full object-contain"
                          unoptimized
                        />
                      ) : (
                        <Package className="w-20 h-20 text-amber-300 animate-pulse" />
                      )}
                    </div>
                    {/* Right Column: Text */}
                    <div className="flex flex-col items-center sm:items-start text-center sm:text-left -mt-2 sm:mt-0 leading-tight">
                      <span className="text-xs font-black uppercase tracking-wider text-[#b68a12] bg-amber-100/50 px-3 py-1 rounded-full mb-2">
                        สินค้าที่จะเบิก
                      </span>
                      <strong className="text-xl sm:text-2xl font-black text-black leading-none">
                        {issueProduct.code || issueProduct.goodsCode}
                      </strong>
                      <span className="text-base sm:text-lg font-black text-slate-800 mt-2 max-w-xs whitespace-normal break-words leading-tight">
                        {issueProduct.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Scan Issue Slip */}
              <div className="flex flex-col gap-4" style={{ opacity: issueProduct ? 1 : 0.4 }}>
                <div className={styles.sectionHeading}>
                  <span className={styles.step}>02</span>
                  <div>
                    <strong>{issueSource === "prison" ? "เลือก LOT ที่ต้องการเบิก" : "สแกนใบเบิก / ป้ายแยม"}</strong>
                    <small>{issueSource === "prison" ? "เลือกได้หลาย LOT และกรอกจำนวนกระบะ" : "สแกนรหัสบนป้ายเพื่อบันทึกการเบิกสต็อกเข้าระบบ"}</small>
                  </div>
                </div>
                {issueProduct ? (
                  issueSource === "prison" ? (
                    <button type="button" className={styles.openPrisonIssueButton} onClick={() => setIsPrisonIssueOpen(true)}>
                      <ArrowDownToLine aria-hidden="true" />
                      เปิดรายการ LOT เนื้อขนมเรือนจำ
                    </button>
                  ) : <div className={styles.issueInputStack}>
                  <form className={styles.scanForm} onSubmit={(event) => { event.preventDefault(); void handleDocumentScan(barcode); }}>
                    <ScanLine aria-hidden="true" />
                    <input
                      ref={barcodeInputRef}
                      value={barcode}
                      onChange={(event) => setBarcode(event.target.value)}
                      placeholder="สแกนบาร์โค้ดใบเบิก แล้วกด Enter"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="submit" disabled={!barcode.trim()}>
                      {isLoading ? <Loader2 className={styles.spin} /> : <ScanLine />}
                      ยืนยันเบิกเอกสาร
                    </button>
                  </form>
                  <button type="button" className={styles.openLabelPickerButton} onClick={() => void openLabelPicker()}>
                    <PackageCheck aria-hidden="true" />
                    เปิดรายการที่ยังไม่เคยเบิก
                  </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 bg-slate-50/50 min-h-[140px]">
                    <ScanLine className="w-8 h-8 text-slate-300 mb-2" />
                    <span className="text-xs font-bold">กรุณาเลือกสินค้าในขั้นตอนที่ 1 ก่อน</span>
                  </div>
                )}

                {/* Scanned Document details displayed below Step 2 input */}
                {issueSource !== "prison" ? <div className={styles.documentCard} data-empty={!log}>
                  {!log ? (
                    <div className={styles.emptyState}>
                      <PackageCheck />
                      <strong>รอรับบาร์โค้ด</strong>
                      <span>ข้อมูลสินค้า LOT น้ำหนัก และสถานะจะแสดงที่นี่</span>
                    </div>
                  ) : (
                    <>
                      <div className={styles.documentTopline}>
                        <span>เอกสารชั่งเข้า</span>
                        <strong>{log.docNo}</strong>
                        <span className={styles.statusPill}>{issue ? "เบิกแล้ว" : "พร้อมเบิก"}</span>
                      </div>
                      <div className={styles.productName}>{log.productCode} · {log.productName}</div>
                      <dl className={styles.detailsGrid}>
                        <div><dt>LOT</dt><dd>{log.lotNo || "-"}</dd></div>
                        <div><dt>น้ำหนักชั่งเข้า</dt><dd>{formatWeight(log.weightKg)} kg</dd></div>
                        <div><dt>พนักงาน</dt><dd>{log.employeeCode} {log.employeeName}</dd></div>
                        <div><dt>เวลาชั่ง</dt><dd>{formatDateTime(log.loggedAt)}</dd></div>
                        {issue ? <div><dt>เลขที่เบิก</dt><dd>{issue.issueNo}</dd></div> : null}
                        {issue ? <div><dt>คงเหลือให้คืน</dt><dd>{formatWeight(issue.remainingWeightKg)} kg</dd></div> : null}
                      </dl>
                    </>
                  )}
                </div> : null}
              </div>
            </div>
          ) : (
            <>
              <div className={styles.sectionHeading}>
                <span className={styles.step}>01</span>
                <div><strong>สแกนป้ายแยม</strong><small>รองรับเครื่องสแกน USB และการพิมพ์เลขเอกสาร</small></div>
              </div>
              <form className={styles.scanForm} onSubmit={(event) => { event.preventDefault(); void handleLookup(); }}>
                <ScanLine aria-hidden="true" />
                <input
                  ref={barcodeInputRef}
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder="สแกนบาร์โค้ดป้ายแยม แล้วกด Enter"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" disabled={!barcode.trim()}>
                  {isLoading ? <Loader2 className={styles.spin} /> : <ScanLine />}
                  รับบาร์โค้ด
                </button>
              </form>
            </>
          )}

          {error ? <div className={styles.alert} data-kind="error"><AlertTriangle />{error}</div> : null}
          {success ? <div className={styles.alert} data-kind="success"><CheckCircle2 />{success}</div> : null}

          {mode !== "issue" && (
            <div className={styles.documentCard} data-empty={!log}>
              {!log ? (
                <div className={styles.emptyState}>
                  <PackageCheck />
                  <strong>รอรับบาร์โค้ด</strong>
                  <span>ข้อมูลสินค้า LOT น้ำหนัก และสถานะจะแสดงที่นี่</span>
                </div>
              ) : (
                <>
                  <div className={styles.documentTopline}>
                    <span>เอกสารชั่งเข้า</span>
                    <strong>{log.docNo}</strong>
                    <span className={styles.statusPill}>{issue ? "เบิกแล้ว" : "พร้อมเบิก"}</span>
                  </div>
                  <div className={styles.productName}>{log.productCode} · {log.productName}</div>
                  <dl className={styles.detailsGrid}>
                    <div><dt>LOT</dt><dd>{log.lotNo || "-"}</dd></div>
                    <div><dt>น้ำหนักชั่งเข้า</dt><dd>{formatWeight(log.weightKg)} kg</dd></div>
                    <div><dt>พนักงาน</dt><dd>{log.employeeCode} {log.employeeName}</dd></div>
                    <div><dt>เวลาชั่ง</dt><dd>{formatDateTime(log.loggedAt)}</dd></div>
                    {issue ? <div><dt>เลขที่เบิก</dt><dd>{issue.issueNo}</dd></div> : null}
                    {issue ? <div><dt>คงเหลือให้คืน</dt><dd>{formatWeight(issue.remainingWeightKg)} kg</dd></div> : null}
                  </dl>
                </>
              )}
            </div>
          )}
        </div>

        {mode !== "issue" && (
          <aside className={styles.actionPanel}>
            {mode === "return" ? (
              <>
              <label className={styles.returnDateField}>
                <span>วันที่ชั่งคืน</span>
                <input
                  type="date"
                  value={returnDate}
                  max={getBangkokDate()}
                  onChange={(event) => setReturnDate(event.target.value)}
                  disabled={isSubmitting}
                />
                <small>รายงานและการเคลื่อนไหวสต็อกจะอิงวันที่นี้</small>
              </label>
              <div className={styles.scaleCard} data-stable={scale.isStable && scale.isReadingFresh}>
                <div className={styles.scaleStatus}>
                  <Scale />
                  <span>{scale.agentConnected ? (scale.portOpen ? "Scale Agent เชื่อมต่อ" : "รอเปิดพอร์ต") : "Scale Agent ออฟไลน์"}</span>
                  <i />
                </div>
                <div className={styles.liveWeight}>{formatWeight(returnWeightKg)}<small>kg</small></div>
                <div className={styles.stableText}>{scale.isStable && scale.isReadingFresh ? "STABLE · พร้อมบันทึก" : "รอน้ำหนักนิ่ง"}</div>
                <div className={styles.remaining}>คืนได้ไม่เกิน <strong>{formatWeight(remainingWeightKg)} kg</strong></div>
              </div>
              </>
            ) : null}

            {mode === "cancel-issue" || mode === "cancel-weigh" ? (
              <button className={styles.primaryAction} type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {isSubmitting ? <Loader2 className={styles.spin} /> : <ActionIcon />}
                {config.actionLabel}
              </button>
            ) : null}
          </aside>
        )}
      </section>

      {isLabelPickerOpen ? (
        <div className={styles.labelPickerBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeLabelPicker();
        }}>
          <section className={styles.labelPickerDialog} role="dialog" aria-modal="true" aria-labelledby="available-labels-title">
            <header className={styles.labelPickerHeader}>
              <div>
                <span>AVAILABLE JAM LABELS</span>
                <h2 id="available-labels-title">เลือกรายการที่ยังไม่เคยเบิก</h2>
                <p>{issueProduct?.code || issueProduct?.goodsCode} · {issueProduct?.name}</p>
              </div>
              <button type="button" onClick={closeLabelPicker} aria-label="ปิดหน้าต่างเลือกรายการ"><X /></button>
            </header>
            <div className={styles.labelPickerFilters}>
              <div className={styles.productMultiFilter}>
                <span>สินค้า</span>
                <button type="button" onClick={() => setIsProductFilterOpen((open) => !open)} aria-expanded={isProductFilterOpen}>
                  {selectedProductCodes.size === labelProductOptions.length ? "สินค้าทั้งหมด" : `เลือก ${selectedProductCodes.size} สินค้า`}
                </button>
                {isProductFilterOpen ? (
                  <div className={styles.productMultiMenu}>
                    <label className={styles.productSelectAll}>
                      <input type="checkbox" checked={labelProductOptions.length > 0 && selectedProductCodes.size === labelProductOptions.length} onChange={(event) => {
                        setSelectedProductCodes(event.target.checked
                          ? new Set(labelProductOptions.map((product) => product.code))
                          : new Set());
                        setSelectedLabelIds(new Set());
                      }} />
                      <strong>สินค้าทั้งหมด</strong>
                    </label>
                    {labelProductOptions.map((product) => {
                      const code = product.code;
                      return (
                        <label key={code}>
                          <input type="checkbox" checked={selectedProductCodes.has(code)} onChange={() => {
                            setSelectedProductCodes((current) => {
                              const next = new Set(current);
                              if (next.has(code)) next.delete(code); else next.add(code);
                              return next;
                            });
                            setSelectedLabelIds(new Set());
                          }} />
                          <span>{code}</span>
                          <b>{product.name}</b>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <label><span>วันที่ชั่ง</span><input type="date" value={labelDateFilter} onChange={(event) => setLabelDateFilter(event.target.value)} /></label>
              <label className={styles.labelSearchField}><span>ค้นหา</span><div><Search aria-hidden="true" /><input autoFocus value={labelSearchQuery} onChange={(event) => setLabelSearchQuery(event.target.value)} placeholder="บาร์โค้ด หรือ LOT" /></div></label>
              <span>{filteredAvailableLabels.length} รายการ</span>
            </div>
            <div className={styles.labelPickerBody}>
              {isLoadingLabels ? (
                <div className={styles.labelPickerState}><Loader2 className={styles.spin} /><strong>กำลังตรวจสอบรายการล่าสุด...</strong></div>
              ) : filteredAvailableLabels.length ? (
                <div className={styles.labelTableWrap}>
                  <table className={styles.labelTable}>
                    <thead>
                      <tr>
                        <th><input type="checkbox" aria-label="เลือกทั้งหมด" checked={pagedAvailableLabels.length > 0 && pagedAvailableLabels.every((row) => selectedLabelIds.has(row.id))} onChange={(event) => {
                          setSelectedLabelIds((current) => {
                            const next = new Set(current);
                            pagedAvailableLabels.forEach((row) => event.target.checked ? next.add(row.id) : next.delete(row.id));
                            return next;
                          });
                        }} /></th>
                        <th>ลำดับ</th>
                        <th>ประเภท</th>
                        <th>บาร์โค้ด</th>
                        <th>ชื่อสินค้า</th>
                        <th>LOT</th>
                        <th>วันที่ชั่ง</th>
                        <th>น้ำหนัก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedAvailableLabels.map((row, index) => (
                        <tr key={row.id}>
                          <td><input type="checkbox" aria-label={`เลือก ${row.barcode}`} checked={selectedLabelIds.has(row.id)} onChange={() => toggleSelectedLabel(row.id)} /></td>
                          <td>{((labelPage - 1) * LABEL_PAGE_SIZE) + index + 1}</td>
                          <td><span className={styles.labelType} data-return={row.labelType === "return"}>{row.labelType === "return" ? "ชั่งคืน" : "ชั่งเข้า"}</span></td>
                          <td className={styles.labelBarcodeCell}>{row.barcode}</td>
                          <td className={styles.labelProductNameCell}>{row.productName || "-"}</td>
                          <td>{row.lotNo || "-"}</td>
                          <td>{formatDateTime(row.recordedAt)}</td>
                          <td className={styles.labelWeightCell}>{formatWeight(row.weightKg)} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.labelPickerState}><PackageCheck /><strong>ไม่พบรายการที่ยังไม่เคยเบิก</strong><span>รายการอาจถูกเบิกไปแล้ว กรุณารีเฟรชหรือตรวจสอบสินค้า</span></div>
              )}
            </div>
            <footer className={styles.labelPickerFooter}>
              <span>เลือกแล้ว <strong>{selectedLabelIds.size}</strong> รายการ</span>
              <div className={styles.labelPagination}>
                <button type="button" onClick={() => setLabelPage((page) => Math.max(1, page - 1))} disabled={labelPage <= 1}>ก่อนหน้า</button>
                <b>หน้า {labelPage} / {labelTotalPages}</b>
                <button type="button" onClick={() => setLabelPage((page) => Math.min(labelTotalPages, page + 1))} disabled={labelPage >= labelTotalPages}>ถัดไป</button>
              </div>
              <button type="button" onClick={() => void handleBatchIssue()} disabled={!selectedLabelIds.size || isBatchIssuing}>
                {isBatchIssuing ? <Loader2 className={styles.spin} /> : <ArrowDownToLine />}
                เบิกรายการที่เลือก
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <PieceRatePrisonIssueModal
        open={isPrisonIssueOpen}
        fgProduct={issueProduct}
        issueDate={issueDate}
        onClose={() => setIsPrisonIssueOpen(false)}
        onSuccess={(result) => {
          setSuccess(`เบิกเนื้อขนมเรือนจำเรียบร้อย เลขที่ ${result.issueNo}`);
          setError("");
        }}
      />

      <section className={styles.history}>
        <div className={styles.historyHeader}><div><strong>รายการล่าสุดในรอบนี้</strong><span>{recentActions.length} รายการ</span></div></div>
        {recentActions.length ? (
          <div className={styles.tableWrap}><table><thead><tr><th>เวลา</th><th>รายการ</th><th>เลขเอกสาร</th><th>LOT</th><th>สินค้า</th><th>น้ำหนัก</th></tr></thead><tbody>
            {recentActions.map((row) => <tr key={row.id}><td>{formatDateTime(row.recordedAt)}</td><td>{row.action}</td><td>{row.docNo}</td><td>{row.lotNo || "-"}</td><td>{row.productCode} · {row.productName}</td><td>{formatWeight(row.weightKg)} kg</td></tr>)}
          </tbody></table></div>
        ) : <div className={styles.historyEmpty}>ยังไม่มีรายการที่บันทึกในรอบนี้</div>}
      </section>
    </main>
  );
}
