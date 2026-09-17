"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Database,
  Loader2,
  RefreshCw,
  ScanLine,
  SwitchCamera,
  Wifi,
  WifiOff,
  Package,
  Scale,
  User,
  ShieldCheck,
  X,
  Search,
  UserRound,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  fetchEditablePieceRateProducts,
  fetchPieceRateEmployeeLookup,
  fetchPieceRateProductLookup,
} from "@/features/attendance/services/pieceRateWorkClient";
import { buildPieceRateProductPickerPage } from "@/features/attendance/utils/pieceRateProductPickerPagination";
import {
  cachePieceRateEmployeeLookup,
  cachePieceRateProductLookup,
  getCachedPieceRateEmployeeLookup,
  getCachedPieceRateProductLookup,
  getAllCachedPieceRateProducts,
  getAllCachedPieceRateEmployees,
  getPieceRateOutboxSummary,
  getPieceRateMasterSummary,
  PIECE_RATE_MASTER_CHANGE_EVENT,
  PIECE_RATE_OUTBOX_CHANGE_EVENT,
} from "@/lib/offline/pieceRateOffline";
import { syncPendingPieceRateOutbox } from "@/lib/offline/pieceRateSync";
import {
  shouldSyncPieceRateMaster,
  syncPieceRateOfflineMaster,
} from "@/lib/offline/pieceRateMasterSync";
import { refreshAuthSession } from "@/lib/auth/sessionRefreshClient";
import {
  getConnectivitySnapshot,
  isAppOnline,
  WRAPPER_NETWORK_CHANGE_EVENT,
} from "@/lib/offline/networkStatus";
import "../scan/scanner.css";
import PieceRateWorkForm from "./PieceRateWorkForm";
import PieceRateDesktopWorkstation from "./PieceRateDesktopWorkstation";
import PieceRateWasteProductPicker from "./PieceRateWasteProductPicker";
import PieceRatePrisonReceiptForm from "./PieceRatePrisonReceiptForm";
import usePieceRateDesktopScale from "./usePieceRateDesktopScale";
import PieceRateStockWorkflowPageClient from "@/features/attendance/components/PieceRateStockWorkflowPageClient";
import PieceRateWorkflowTabs, { normalizePieceRateWorkflowMode } from "@/features/attendance/components/PieceRateWorkflowTabs";

const MACHINE_CODE_REGEX = /^[A-Z0-9]{2,8}$/;
const MACHINE_STORAGE_KEY = "daily_work_machine_code";

function isDesktopPieceRateRuntime() {
  if (typeof window === "undefined") return false;
  return !window.AndroidPrinter;
}

function normalizeMachineCode(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return MACHINE_CODE_REGEX.test(normalized) ? normalized : null;
}

async function resolveMachineCode() {
  if (typeof window === "undefined") return null;
  const bridge = window.AndroidPrinter;
  if (bridge && typeof bridge.getMachineCode === "function") {
    try {
      const bridgeResult = bridge.getMachineCode();
      const machineCode = normalizeMachineCode(
        bridgeResult && typeof bridgeResult.then === "function" ? await bridgeResult : bridgeResult
      );
      if (machineCode) {
        window.localStorage?.setItem(MACHINE_STORAGE_KEY, machineCode);
        return machineCode;
      }
    } catch {
      // Fall back
    }
  }
  return normalizeMachineCode(window.localStorage?.getItem(MACHINE_STORAGE_KEY));
}

const PieceRateWasteForm = dynamic(() => import("./PieceRateWasteForm"), {
  ssr: false,
});

const BACK_CAMERA_PATTERN = /(back|rear|environment)/i;
const DEFAULT_CONNECTIVITY = Object.freeze({
  online: true,
  source: "initial",
});
const PREVIEW_PRODUCT_PAYLOAD = Object.freeze({
  product: {
    goodsCode: "PROD-SAMPLE-001",
    name: "ทุเรียนกวนเกรด A (สินค้าจำลอง)",
    brandName: "KPF Premium",
    skuCode: "SKU-TEST-999",
  },
  pieceRate: {
    inputLabel: "น้ำหนัก",
    inputUnitLabel: "Kg",
    inputMode: "kg",
    profileName: "งานบันทึกรายชิ้นมาตรฐาน",
    wageBasis: "kg",
  },
});
const PREVIEW_EMPLOYEE_PAYLOAD = Object.freeze({
  employeeCode: "EMP-9999",
  name: "นายสมชาย ใจดี (พนักงานจำลอง)",
  departmentName: "ฝ่ายผลิต/บรรจุ",
  branch: "สำนักงานใหญ่",
});

function isTransitionStateError(error) {
  const message = String(
    typeof error === "string" ? error : (error?.message || error || "")
  ).toLowerCase();
  return (
    message.includes("already under transition")
    || message.includes("cannot transition to a new state")
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopScannerInstance(scanner) {
  if (!scanner?.isScanning) return;

  try {
    await scanner.stop();
    return;
  } catch (error) {
    if (!isTransitionStateError(error)) {
      throw error;
    }
  }

  await delay(120);
  if (!scanner?.isScanning) return;

  try {
    await scanner.stop();
  } catch {
    // Ignore transition noise while stopping.
  }
}

async function clearScannerInstance(scanner) {
  if (!scanner) return;
  await stopScannerInstance(scanner);
  try {
    await scanner.clear();
  } catch {
    // Html5Qrcode may already be cleared during fast stage changes.
  }
}

function pickDefaultCameraId(devices = []) {
  if (!Array.isArray(devices) || devices.length === 0) return null;
  const backCamera = devices.find((camera) => BACK_CAMERA_PATTERN.test(String(camera?.label || "")));
  return backCamera?.id || devices[0].id || null;
}

function buildScannerSetup(stage) {
  if (stage === "employee") {
    return {
      initOptions: {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      },
      config: {
        fps: 12,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(220, Math.floor(minEdge * 0.82));
          return { width: size, height: size };
        },
        disableFlip: true,
        rememberLastUsedCamera: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      },
    };
  }

  return {
    initOptions: {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
      ],
    },
    config: {
      fps: 14,
      qrbox: {
        width: 380,
        height: 150,
      },
      aspectRatio: 1.777778,
      disableFlip: true,
      rememberLastUsedCamera: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
    },
  };
}

function buildCameraConfig(cameraId) {
  if (cameraId) {
    return {
      deviceId: { exact: cameraId },
    };
  }

  return {
    facingMode: "environment",
  };
}

function normalizeScanValue(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

const KEYBOARD_SCAN_CODE_MAP = Object.freeze({
  Minus: "-",
  Equal: "=",
  Slash: "/",
  Backslash: "\\",
  Period: ".",
  Comma: ",",
});

function resolveKeyboardScanChar(event) {
  const code = String(event?.code || "");
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad\d$/.test(code)) {
    return code.slice(6);
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (KEYBOARD_SCAN_CODE_MAP[code]) {
    return KEYBOARD_SCAN_CODE_MAP[code];
  }

  const rawKey = String(event?.key || "");
  if (/^[0-9A-Z./\\,\-=]$/i.test(rawKey)) {
    return rawKey.toUpperCase();
  }

  return null;
}

function isValidPieceRateProductPayload(payload) {
  return Boolean(payload?.product?.code && payload?.pieceRate?.inputMode);
}

function isValidPieceRateEmployeePayload(payload) {
  return Boolean(payload?.employee?.employeeCode);
}

function formatSyncDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function resolveOfflineMasterStatus(summary, connectivity) {
  if (summary?.syncing) {
    return {
      tone: "bg-amber-50 text-amber-700 border-amber-100",
      label: "Syncing Data...",
      icon: <RefreshCw size={14} className="animate-spin" />,
    };
  }

  if (summary?.ready && !summary?.stale) {
    return {
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
      label: "Ready Offline",
      icon: <ShieldCheck size={14} />,
    };
  }

  if (summary?.ready && summary?.stale) {
    return {
      tone: "bg-amber-50 text-amber-700 border-amber-100",
      label: "Ready (Stale)",
      icon: <AlertTriangle size={14} />,
    };
  }

  return {
    tone: "bg-rose-50 text-rose-700 border-rose-100",
    label: "Needs Sync",
    icon: <Database size={14} />,
  };
}

export default function PieceRateScanPageClient() {
  const searchParams = useSearchParams();
  const isPreviewMode = searchParams.get("preview") === "true";
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [desktopWorkflowMode, setDesktopWorkflowMode] = useState(() =>
    normalizePieceRateWorkflowMode(searchParams.get("tab"))
  );

  const [stage, setStage] = useState(() => (isPreviewMode ? "form" : "product"));
  const [scanMode, setScanMode] = useState(() => (isPreviewMode ? "multi" : null));
  const [lockedProduct, setLockedProduct] = useState(() => (isPreviewMode ? PREVIEW_PRODUCT_PAYLOAD : null));
  const [resolvedProduct, setResolvedProduct] = useState(() => (isPreviewMode ? PREVIEW_PRODUCT_PAYLOAD : null));
  const [resolvedEmployee, setResolvedEmployee] = useState(() => (isPreviewMode ? PREVIEW_EMPLOYEE_PAYLOAD : null));
  const [productScanValue, setProductScanValue] = useState(() => (isPreviewMode ? "PROD-SAMPLE-001" : ""));
  const [employeeScanValue, setEmployeeScanValue] = useState(() => (isPreviewMode ? "EMP-9999" : ""));
  const [statusMessage, setStatusMessage] = useState("พร้อมสแกนบาร์โค้ดสินค้า");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const desktopRuntime = isDesktopPieceRateRuntime();
      setIsDesktopRuntime(desktopRuntime);
      if (desktopRuntime) setScanMode("multi");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (searchParams.get("preview") === "true") {
      const previewTimer = window.setTimeout(() => {
      setStage("form");
      setScanMode("multi");
      setLockedProduct(PREVIEW_PRODUCT_PAYLOAD);
      setResolvedProduct({
        product: { 
          goodsCode: "PROD-SAMPLE-001", 
          name: "ทุเรียนกวนเกรด A (สินค้าจำลอง)", 
          brandName: "KPF Premium",
          skuCode: "SKU-TEST-999"
        },
        pieceRate: { 
          inputLabel: "น้ำหนัก", 
          inputUnitLabel: "Kg", 
          inputMode: "kg", 
          profileName: "งานบันทึกรายชิ้นมาตรฐาน",
          wageBasis: "kg"
        }      });
      setResolvedEmployee({
        employeeCode: "EMP-9999",
        name: "นายสมชาย ใจดี (พนักงานจำลอง)",
        departmentName: "ฝ่ายผลิต/บรรจุ",
        branch: "สำนักงานใหญ่"
      });
      setProductScanValue("PROD-SAMPLE-001");
      setEmployeeScanValue("EMP-9999");
      setStatusMessage("PREVIEW MODE");
      }, 0);
      return () => window.clearTimeout(previewTimer);
    }
  }, [searchParams]);

  const [errorMessage, setErrorMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [connectivity, setConnectivity] = useState(DEFAULT_CONNECTIVITY);
  const [masterSummary, setMasterSummary] = useState(() => ({
    ready: false,
    syncing: false,
    stale: true,
    hasSeedData: false,
    lastSuccessfulSyncAt: null,
    lastAttemptedSyncAt: null,
    lastError: null,
    productCount: 0,
    employeeCount: 0,
  }));
  const [isSyncingMaster, setIsSyncingMaster] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [lastSessionRefreshAt, setLastSessionRefreshAt] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isStagePending, startStageTransition] = useTransition();
  const [machineCode, setMachineCode] = useState(null);
  const [desktopRefreshKey, setDesktopRefreshKey] = useState(0);
  const [wasteProductOptions, setWasteProductOptions] = useState([]);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isEmployeePickerOpen, setIsEmployeePickerOpen] = useState(false);
  const [pickerProducts, setPickerProducts] = useState([]);
  const [pickerEmployees, setPickerEmployees] = useState([]);
  const [searchProductQuery, setSearchProductQuery] = useState("");
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState("");
  const [loadingPickerProducts, setLoadingPickerProducts] = useState(false);
  const [loadingPickerEmployees, setLoadingPickerEmployees] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeTotalPages, setEmployeeTotalPages] = useState(1);
  const productPickerMasterRef = useRef(null);
  const productPickerLoadPromiseRef = useRef(null);
  const employeePickerCursorMapRef = useRef({ 1: null });

  const loadPickerProducts = async (search = "", pageNum = 1) => {
    const hasLoadedMaster = Array.isArray(productPickerMasterRef.current);
    if (!hasLoadedMaster) setLoadingPickerProducts(true);
    try {
      if (!productPickerLoadPromiseRef.current && !hasLoadedMaster) {
        productPickerLoadPromiseRef.current = (async () => {
          const cached = await getAllCachedPieceRateProducts();
          if (cached.length > 0) return cached;

          if (getConnectivitySnapshot().online) {
            const result = await fetchEditablePieceRateProducts();
            const products = result.data?.data?.data;
            if (result.ok && Array.isArray(products)) return products;
          }
          return [];
        })();
      }

      if (!hasLoadedMaster) {
        productPickerMasterRef.current = await productPickerLoadPromiseRef.current;
      }
      const pickerPage = buildPieceRateProductPickerPage(
        productPickerMasterRef.current,
        pageNum,
        search
      );
      setProductTotalPages(pickerPage.totalPages);
      setProductPage(pickerPage.page);
      setPickerProducts(pickerPage.items);
    } catch (error) {
      console.error("Failed to load products for picker", error);
    } finally {
      setLoadingPickerProducts(false);
    }
  };

  const loadPickerEmployees = async (search = "", pageNum = 1) => {
    setLoadingPickerEmployees(true);
    try {
      let fetched = false;
      if (getConnectivitySnapshot().online) {
        try {
          if (pageNum === 1) {
            employeePickerCursorMapRef.current = { 1: null };
          }
          const params = new URLSearchParams({ search, status: "active", page: String(pageNum), pageSize: "30" });
          const cursor = employeePickerCursorMapRef.current[pageNum];
          if (cursor) {
            params.set("cursor", cursor);
          }
          const response = await fetch(`/api/employees?${params.toString()}`);
          if (response.ok) {
            const payload = await response.json();
            if (Array.isArray(payload?.data)) {
              setPickerEmployees(payload.data.map((row) => {
                const firstName = String(row?.EMP_NAME ?? "").trim();
                const lastName = String(row?.EMP_SURNME ?? "").trim();
                const fullName = [firstName, lastName].filter(Boolean).join(" ") || String(row?.Name ?? "-");
                const department = row?.DEPT_THAIDESC || row?.departmentName || row?.department_name || "-";
                return {
                  employeeCode: String(row?.PRS_NO ?? row?.EMP_INTL ?? "").trim(),
                  fullName,
                  department,
                  imageUrl: row?.imageUrl || null,
                };
              }));
              setEmployeeTotalPages(payload?.pagination?.totalPages || 1);
              setEmployeePage(pageNum);
              employeePickerCursorMapRef.current[pageNum + 1] = payload?.cursor?.next || null;
              fetched = true;
            }
          }
        } catch (e) {
          console.warn("Failed to fetch employees from API, falling back to local DB", e);
        }
      }
      
      if (!fetched) {
        const cached = await getAllCachedPieceRateEmployees();
        const filtered = cached.filter((item) => {
          const query = search.trim().toLowerCase();
          if (!query) return true;
          const name = String(item.name || "").toLowerCase();
          const code = String(item.employeeCode || "").toLowerCase();
          return name.includes(query) || code.includes(query);
        });

        const itemsPerPage = 30;
        const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
        setEmployeeTotalPages(totalPages);
        setEmployeePage(pageNum);

        const startIdx = (pageNum - 1) * itemsPerPage;
        const pageItems = filtered.slice(startIdx, startIdx + itemsPerPage);

        setPickerEmployees(pageItems.map((item) => ({
          employeeCode: item.employeeCode,
          fullName: item.name || "",
          department: item.departmentName || "-",
          imageUrl: item.imageUrl || null,
        })));
      }
    } catch (error) {
      console.error("Failed to load employees for picker", error);
    } finally {
      setLoadingPickerEmployees(false);
    }
  }

  const handleSelectProduct = async (product) => {
    const barcode = product.productBarcode || product.goodsCode;
    if (!barcode) return;
    
    setIsProductPickerOpen(false);
    
    isProcessingScanRef.current = true;
    setErrorMessage("");
    setIsLookingUp(true);
    setStatusMessage("กำลังตรวจสอบข้อมูลสินค้า...");
    
    try {
      let payload = await getCachedPieceRateProductLookup(barcode);
      if (!isValidPieceRateProductPayload(payload)) {
        const result = await fetchPieceRateProductLookup({ barcode });
        if (result.ok && result.data?.data) {
          payload = result.data.data;
          await cachePieceRateProductLookup(barcode, payload);
        } else {
          await handleLookupFailure(result.error?.message || "ไม่พบบาร์โค้ดสินค้าในระบบ");
          return;
        }
      }
      
      if (isValidPieceRateProductPayload(payload)) {
        await stopScanner();
        startStageTransition(() => {
          setProductScanValue(barcode);
          setResolvedProduct(payload);
          if (scanMode === "single") {
            setLockedProduct(payload);
          }
          setResolvedEmployee(null);
          setEmployeeScanValue("");
          if (scanMode === "waste") {
            setStage("form");
            setStatusMessage("เลือกสินค้าแล้ว พร้อมชั่งและบันทึกของเสีย");
          } else {
            setStage("employee");
            setStatusMessage("เลือกสินค้าแล้ว กรุณาสแกนหรือเลือกพนักงาน");
          }
        });
      } else {
        await handleLookupFailure("สินค้าที่เลือกไม่มีการผูกอัตราค่าแรงงาน");
      }
    } catch (err) {
      await handleLookupFailure("เกิดข้อผิดพลาดในการโหลดข้อมูลสินค้า");
    } finally {
      setIsLookingUp(false);
      isProcessingScanRef.current = false;
    }
  };

  const handleSelectEmployee = async (emp) => {
    const employeeCode = emp.employeeCode;
    if (!employeeCode) return;
    
    setIsEmployeePickerOpen(false);
    
    isProcessingScanRef.current = true;
    setErrorMessage("");
    setIsLookingUp(true);
    setStatusMessage("กำลังตรวจสอบข้อมูลพนักงาน...");
    
    try {
      let cachedEmployee = await getCachedPieceRateEmployeeLookup(employeeCode);
      let employeeData = cachedEmployee?.employee || null;
      
      if (!employeeData) {
        const empResult = await fetchPieceRateEmployeeLookup({ employeeCode });
        if (empResult.ok && empResult.data?.data?.employee?.employeeCode) {
          employeeData = empResult.data.data.employee;
          await cachePieceRateEmployeeLookup(employeeCode, { employee: employeeData });
        }
      }
      
      if (employeeData) {
        if (scanMode === "multi") {
          let savedInfo = null;
          try {
            const key = `piece_rate_last_prod_${employeeData.employeeCode}`;
            const stored = localStorage.getItem(key);
            if (stored) {
              savedInfo = JSON.parse(stored);
            }
          } catch (e) {
            console.error("Failed to parse saved product", e);
          }

          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

          if (savedInfo && savedInfo.barcode && savedInfo.date === today) {
            const productBarcode = savedInfo.barcode;
            let productPayload = await getCachedPieceRateProductLookup(productBarcode);

            if (!isValidPieceRateProductPayload(productPayload)) {
              const prodResult = await fetchPieceRateProductLookup({ barcode: productBarcode });
              if (prodResult.ok && prodResult.data?.data) {
                productPayload = prodResult.data.data;
                await cachePieceRateProductLookup(productBarcode, productPayload);
              }
            }

            if (isValidPieceRateProductPayload(productPayload)) {
              await stopScanner();
              startStageTransition(() => {
                setProductScanValue(productBarcode);
                setResolvedProduct(productPayload);
                setEmployeeScanValue(employeeCode);
                setResolvedEmployee(employeeData);
                setStage("form");
                setStatusMessage("ใช้ข้อมูลสินค้าล่าสุดของพนักงาน: " + (productPayload.product?.name || ""));
              });
              return;
            }
          }
          
          if (resolvedProduct) {
            await stopScanner();
            startStageTransition(() => {
              setEmployeeScanValue(employeeCode);
              setResolvedEmployee(employeeData);
              setStage("form");
              setStatusMessage("เลือกพนักงานและสินค้าพร้อมเริ่มงาน");
            });
            return;
          }

          await handleLookupFailure("พนักงานคนนี้ยังไม่มีการทำงานชิ้นแรกในวันนี้ กรุณาสแกนหรือเลือกสินค้าก่อน");
          return;
        } else {
          if (resolvedProduct) {
            await stopScanner();
            startStageTransition(() => {
              setEmployeeScanValue(employeeCode);
              setResolvedEmployee(employeeData);
              setStage("form");
              setStatusMessage("เลือกพนักงานและสินค้าพร้อมเริ่มงาน");
            });
            return;
          }
          await handleLookupFailure("กรุณาสแกนหรือเลือกสินค้าของรอบนี้ก่อน");
        }
      } else {
        await handleLookupFailure("ไม่พบข้อมูลพนักงาน");
      }
    } catch (err) {
      await handleLookupFailure("เกิดข้อผิดพลาดในการโหลดข้อมูลพนักงาน");
    } finally {
      setIsLookingUp(false);
      isProcessingScanRef.current = false;
    }
  };

  useEffect(() => {
    if (!isProductPickerOpen) return;
    const timer = setTimeout(() => {
      void loadPickerProducts(searchProductQuery, 1);
    }, 200);
    return () => clearTimeout(timer);
  }, [isProductPickerOpen, searchProductQuery]);

  useEffect(() => {
    if (!isEmployeePickerOpen) return;
    const timer = setTimeout(() => {
      void loadPickerEmployees(searchEmployeeQuery, 1);
    }, 200);
    return () => clearTimeout(timer);
  }, [isEmployeePickerOpen, searchEmployeeQuery]);

  const desktopScale = usePieceRateDesktopScale({
    enabled: isDesktopRuntime && (desktopWorkflowMode === "weigh-in" || desktopWorkflowMode === "waste"),
    hasProduct: Boolean(resolvedProduct),
    hasEmployee: desktopWorkflowMode === "waste" || Boolean(resolvedEmployee),
  });

  useEffect(() => {
    if (!isDesktopRuntime || desktopWorkflowMode !== "waste") return;
    void getAllCachedPieceRateProducts().then((records) => {
      setWasteProductOptions((records || []).filter((record) => record?.payload?.product));
    });
  }, [desktopWorkflowMode, isDesktopRuntime, masterSummary.productCount]);

  const handleDesktopWorkflowModeChange = useCallback((nextMode) => {
    setDesktopWorkflowMode(nextMode);
    setErrorMessage("");
    setResolvedProduct(null);
    setResolvedEmployee(null);
    setProductScanValue("");
    setEmployeeScanValue("");
    setStage("product");
    setScanMode(nextMode === "waste" ? "waste" : "multi");
    setStatusMessage(nextMode === "waste" ? "เลือกหรือสแกนสินค้าเพื่อชั่งของเสีย" : "พร้อมสแกนบาร์โค้ดสินค้า");
  }, []);

  const handleWasteProductSelection = useCallback((productBarcode) => {
    const record = wasteProductOptions.find((item) => item.productBarcode === productBarcode);
    if (!record?.payload) return;
    setProductScanValue(record.productBarcode);
    setResolvedProduct(record.payload);
    setResolvedEmployee(null);
    setStage("form");
    setStatusMessage("เลือกสินค้าแล้ว พร้อมชั่งและบันทึกของเสีย");
  }, [wasteProductOptions]);

  useEffect(() => {
    let mounted = true;
    void resolveMachineCode().then((code) => {
      if (mounted) setMachineCode(code);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const [outboxSummary, setOutboxSummary] = useState(() => ({
    pendingCount: 0,
    failedCount: 0,
    needsReviewCount: 0,
    readyToPrintCount: 0,
    printedCount: 0,
  }));

  const refreshOutboxState = useCallback(async () => {
    try {
      const summary = await getPieceRateOutboxSummary();
      setOutboxSummary(summary);
    } catch (e) {
      console.error("Failed to get outbox summary", e);
    }
  }, []);

  const scannerRef = useRef(null);
  const scannerTaskRef = useRef(Promise.resolve());
  const scannerStageRef = useRef("product");
  const activeStageRef = useRef("product");
  const cameraIdRef = useRef(null);
  const isProcessingScanRef = useRef(false);
  const handleScanRef = useRef(null);
  const keyboardBufferRef = useRef("");
  const keyboardClearTimerRef = useRef(null);

  const runScannerTask = useCallback((task) => {
    scannerTaskRef.current = scannerTaskRef.current
      .then(() => task())
      .catch((error) => {
        if (!isTransitionStateError(error)) {
          console.error("Scanner task failed:", error);
        }
      });
    return scannerTaskRef.current;
  }, []);

  const stopScanner = useCallback(() => {
    return runScannerTask(async () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      await stopScannerInstance(scanner);
    });
  }, [runScannerTask]);

  const disposeScanner = useCallback(() => {
    return runScannerTask(async () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      await clearScannerInstance(scanner);
      scannerRef.current = null;
      scannerStageRef.current = "";
    });
  }, [runScannerTask]);

  const refreshOfflineMasterState = useCallback(async () => {
    const [summary, snapshot] = await Promise.all([
      getPieceRateMasterSummary().catch(() => ({
        ready: false,
        syncing: false,
        stale: true,
        hasSeedData: false,
        lastSuccessfulSyncAt: null,
        lastAttemptedSyncAt: null,
        lastError: null,
        productCount: 0,
        employeeCount: 0,
      })),
      Promise.resolve(getConnectivitySnapshot()),
    ]);

    setMasterSummary(summary);
    setConnectivity(snapshot);
    return summary;
  }, []);

  const handleSyncOfflineMaster = useCallback(async ({ silent = false } = {}) => {
    setIsSyncingMaster(true);
    if (!silent) {
      setErrorMessage("");
      setStatusMessage("กำลังซิงค์ข้อมูลสินค้าและพนักงาน...");
    }

    const result = await syncPieceRateOfflineMaster();
    const summary = await refreshOfflineMasterState();
    setIsSyncingMaster(false);

    if (!result.ok && result.skipped !== "offline") {
      setErrorMessage(result.error || summary.lastError || "ซิงค์ข้อมูลไม่สำเร็จ");
      setStatusMessage("ยังไม่พร้อมใช้งานออฟไลน์");
      return result;
    }

    if (summary.ready) {
      setStatusMessage("พร้อมสแกนบาร์โค้ดสินค้า");
    }

    return result;
  }, [refreshOfflineMasterState]);

  const handleRefreshSession = useCallback(async () => {
    setIsRefreshingSession(true);
    const result = await refreshAuthSession();
    if (result.ok) {
      setLastSessionRefreshAt(new Date().toISOString());
    } else {
      setErrorMessage("ต่ออายุ session ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
    }
    setIsRefreshingSession(false);
    return result;
  }, []);

  const initScanner = useCallback((nextCameraId, nextStage) => {
    return runScannerTask(async () => {
      if (typeof document === "undefined" || !document.getElementById("piece-rate-reader")) {
        return;
      }

      try {
        if (scannerRef.current && scannerStageRef.current !== nextStage) {
          await clearScannerInstance(scannerRef.current);
          scannerRef.current = null;
          scannerStageRef.current = "";
        }

        if (!scannerRef.current) {
          const { initOptions } = buildScannerSetup(nextStage);
          scannerRef.current = new Html5Qrcode("piece-rate-reader", initOptions);
          scannerStageRef.current = nextStage;
        }

        const scanner = scannerRef.current;
        if (!scanner) return;

        await stopScannerInstance(scanner);
        const { config } = buildScannerSetup(nextStage);
        await scanner.start(
          buildCameraConfig(nextCameraId),
          config,
          (decodedText) => {
            const scanHandler = handleScanRef.current;
            if (typeof scanHandler === "function") {
              void scanHandler(decodedText);
            }
          },
          () => {
            // Ignore frame parse errors.
          }
        );

        if (typeof scanner.applyVideoConstraints === "function") {
          try {
            await scanner.applyVideoConstraints({
              advanced: [{ focusMode: "continuous" }],
            });
          } catch {
            // Some devices do not support focus constraints.
          }
        }

        setIsCameraReady(true);
      } catch (error) {
        if (isTransitionStateError(error)) {
          return;
        }

        console.error("Error starting scanner:", error);
      }
    });
  }, [runScannerTask]);

  const handleLookupFailure = useCallback(async (message) => {
    setErrorMessage(message);
    setStatusMessage("พร้อมสแกนอีกครั้ง");
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
  }, []);

  const handleScan = useCallback(async (decodedText) => {
    if (isProcessingScanRef.current || isLookingUp) {
      return;
    }

    if (!masterSummary.ready) {
      setErrorMessage(
        isAppOnline()
          ? "เครื่องนี้ยังไม่พร้อมใช้งานออฟไลน์ กรุณาซิงค์ข้อมูลสินค้าและพนักงานก่อน"
          : "เครื่องนี้ยังไม่มี master data ครบ จึงไม่สามารถทำงานออฟไลน์ได้"
      );
      setStatusMessage("รอซิงค์ข้อมูลออฟไลน์ก่อนเริ่มงาน");
      return;
    }

    const normalizedValue = normalizeScanValue(decodedText);
    if (!normalizedValue) {
      return;
    }

    isProcessingScanRef.current = true;
    setErrorMessage("");
    setIsLookingUp(true);
    setStatusMessage("กำลังตรวจสอบข้อมูล...");

    if (activeStageRef.current === "product" && scanMode === "waste") {
      const cachedPayload = await getCachedPieceRateProductLookup(normalizedValue);
      if (isValidPieceRateProductPayload(cachedPayload)) {
        await stopScanner();
        startStageTransition(() => {
          setProductScanValue(normalizedValue);
          setResolvedProduct(cachedPayload);
          setResolvedEmployee(null);
          setEmployeeScanValue("");
          setStage("form");
          setStatusMessage("พบสินค้าแล้ว พร้อมชั่งและบันทึกของเสีย");
        });
        setIsLookingUp(false);
        isProcessingScanRef.current = false;

        void fetchPieceRateProductLookup({ barcode: normalizedValue })
          .then(async (result) => {
            const refreshedPayload = result.ok ? (result.data?.data || null) : null;
            if (isValidPieceRateProductPayload(refreshedPayload)) {
              await cachePieceRateProductLookup(normalizedValue, refreshedPayload);
            }
          })
          .catch(() => null);
        return;
      }

      const result = await fetchPieceRateProductLookup({ barcode: normalizedValue });
      let payload = result.ok ? (result.data?.data || null) : null;
      if (!result.ok && result.status === 0) {
        payload = await getCachedPieceRateProductLookup(normalizedValue);
      }
      if (!isValidPieceRateProductPayload(payload)) {
        await handleLookupFailure(result.error?.message || "ไม่พบบาร์โค้ดสินค้าในระบบ");
        return;
      }
      if (result.ok) {
        await cachePieceRateProductLookup(normalizedValue, payload);
      }

      await stopScanner();
      startStageTransition(() => {
        setProductScanValue(normalizedValue);
        setResolvedProduct(payload);
        setResolvedEmployee(null);
        setEmployeeScanValue("");
        setStage("form");
        setStatusMessage("พบสินค้าแล้ว พร้อมชั่งและบันทึกของเสีย");
      });
      setIsLookingUp(false);
      isProcessingScanRef.current = false;
      return;
    }

    if (activeStageRef.current === "product") {
      // Intercept employee scans during the product stage
      const cachedEmployee = await getCachedPieceRateEmployeeLookup(normalizedValue);
      let isEmployee = isValidPieceRateEmployeePayload(cachedEmployee);
      let employeeData = cachedEmployee?.employee || null;

      if (!isEmployee) {
        try {
          const empResult = await fetchPieceRateEmployeeLookup({ employeeCode: normalizedValue });
          if (empResult.ok && empResult.data?.data?.employee?.employeeCode) {
            isEmployee = true;
            employeeData = empResult.data.data.employee;
            await cachePieceRateEmployeeLookup(normalizedValue, { employee: employeeData });
          }
        } catch {
          // Ignore lookup failures during employee detection
        }
      }

      if (isEmployee && employeeData) {
        if (scanMode === "multi") {
          let savedInfo = null;
          try {
            const key = `piece_rate_last_prod_${employeeData.employeeCode}`;
            const stored = localStorage.getItem(key);
            if (stored) {
              savedInfo = JSON.parse(stored);
            }
          } catch (e) {
            console.error("Failed to parse saved product", e);
          }

          const d = new Date();
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const today = `${year}-${month}-${day}`;

          if (savedInfo && savedInfo.barcode && savedInfo.date === today) {
            const productBarcode = savedInfo.barcode;
            const cachedProduct = await getCachedPieceRateProductLookup(productBarcode);
            let productPayload = cachedProduct;

            if (!isValidPieceRateProductPayload(productPayload)) {
              const prodResult = await fetchPieceRateProductLookup({ barcode: productBarcode });
              if (prodResult.ok && prodResult.data?.data) {
                productPayload = prodResult.data.data;
                await cachePieceRateProductLookup(productBarcode, productPayload);
              }
            }

            if (isValidPieceRateProductPayload(productPayload)) {
              await stopScanner();
              startStageTransition(() => {
                setProductScanValue(productBarcode);
                setResolvedProduct(productPayload);
                setEmployeeScanValue(normalizedValue);
                setResolvedEmployee(employeeData);
                setStage("form");
                setStatusMessage("ใช้ข้อมูลสินค้าล่าสุดของพนักงาน: " + (productPayload.product?.name || ""));
              });
              setIsLookingUp(false);
              isProcessingScanRef.current = false;
              return;
            }
          }
          await handleLookupFailure("พนักงานคนนี้ยังไม่มีการทำงานชิ้นแรกในวันนี้ กรุณาสแกนรหัสสินค้าก่อน");
          return;
        } else {
          await handleLookupFailure("กรุณาสแกนรหัสสินค้าหลักของรอบนี้ก่อน");
          return;
        }
      }

      const cachedPayload = await getCachedPieceRateProductLookup(normalizedValue);
      if (isValidPieceRateProductPayload(cachedPayload)) {
        await stopScanner();
        startStageTransition(() => {
          setProductScanValue(normalizedValue);
          setResolvedProduct(cachedPayload);
          if (scanMode === "single") {
            setLockedProduct(cachedPayload);
          }
          setResolvedEmployee(null);
          setEmployeeScanValue("");
          setStage("employee");
          setStatusMessage("พบสินค้าแล้ว กรุณาสแกน QR พนักงาน");
        });
        setIsLookingUp(false);
        isProcessingScanRef.current = false;

        void fetchPieceRateProductLookup({ barcode: normalizedValue })
          .then(async (result) => {
            const refreshedPayload = result.ok ? (result.data?.data || null) : null;
            if (isValidPieceRateProductPayload(refreshedPayload)) {
              await cachePieceRateProductLookup(normalizedValue, refreshedPayload);
            }
          })
          .catch(() => null);
        return;
      }

      const result = await fetchPieceRateProductLookup({
        barcode: normalizedValue,
      });

      let payload = result.ok ? (result.data?.data || null) : null;
      if (!result.ok && result.status === 0) {
        payload = await getCachedPieceRateProductLookup(normalizedValue);
      }

      if (!isValidPieceRateProductPayload(payload)) {
        await handleLookupFailure(result.error?.message || "ไม่พบบาร์โค้ดสินค้าในระบบ");
        return;
      }

      if (result.ok) {
        await cachePieceRateProductLookup(normalizedValue, payload);
      }

      await stopScanner();
      startStageTransition(() => {
        setProductScanValue(normalizedValue);
        setResolvedProduct(payload);
        if (scanMode === "single") {
          setLockedProduct(payload);
        }
        setResolvedEmployee(null);
        setEmployeeScanValue("");
        setStage("employee");
        setStatusMessage("พบสินค้าแล้ว กรุณาสแกน QR พนักงาน");
      });
      setIsLookingUp(false);
      isProcessingScanRef.current = false;
      return;
    }

    const cachedEmployeePayload = await getCachedPieceRateEmployeeLookup(normalizedValue);
    if (isValidPieceRateEmployeePayload(cachedEmployeePayload)) {
      await stopScanner();
      startStageTransition(() => {
        setEmployeeScanValue(normalizedValue);
        setResolvedEmployee(cachedEmployeePayload.employee);
        setStage("form");
        setStatusMessage("พร้อมกรอกข้อมูลและบันทึก");
      });
      setIsLookingUp(false);
      isProcessingScanRef.current = false;

      void fetchPieceRateEmployeeLookup({
        employeeCode: normalizedValue,
      })
        .then(async (result) => {
          const refreshedEmployee = result.ok ? (result.data?.data?.employee || null) : null;
          if (refreshedEmployee?.employeeCode) {
            await cachePieceRateEmployeeLookup(normalizedValue, {
              employee: refreshedEmployee,
            });
          }
        })
        .catch(() => null);
      return;
    }

    const result = await fetchPieceRateEmployeeLookup({
      employeeCode: normalizedValue,
    });

    let employee = result.ok ? (result.data?.data?.employee || null) : null;
    if (!result.ok && result.status === 0) {
      const cachedPayload = await getCachedPieceRateEmployeeLookup(normalizedValue);
      employee = cachedPayload?.employee || null;
    }

    if (!employee?.employeeCode) {
      await handleLookupFailure(result.error?.message || "ไม่พบข้อมูลพนักงานตามรหัสที่สแกน");
      return;
    }

    if (result.ok) {
      await cachePieceRateEmployeeLookup(normalizedValue, {
        employee,
      });
    }

    await stopScanner();
    startStageTransition(() => {
      setEmployeeScanValue(normalizedValue);
      setResolvedEmployee(employee);
      setStage("form");
      setStatusMessage("พร้อมกรอกข้อมูลและบันทึก");
    });
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
  }, [handleLookupFailure, isLookingUp, masterSummary.ready, scanMode, startStageTransition, stopScanner]);

  const handleSwitchCamera = useCallback(() => {
    if (cameras.length < 2) return;

    const currentIndex = currentCameraId
      ? cameras.findIndex((camera) => camera.id === currentCameraId)
      : 0;
    const nextIndex = (currentIndex + 1) % cameras.length;
    setCurrentCameraId(cameras[nextIndex].id);
  }, [cameras, currentCameraId]);

  const clearKeyboardBuffer = useCallback(() => {
    keyboardBufferRef.current = "";
    if (keyboardClearTimerRef.current) {
      clearTimeout(keyboardClearTimerRef.current);
      keyboardClearTimerRef.current = null;
    }
  }, []);

  const scheduleKeyboardBufferClear = useCallback(() => {
    if (keyboardClearTimerRef.current) {
      clearTimeout(keyboardClearTimerRef.current);
    }
    keyboardClearTimerRef.current = setTimeout(() => {
      keyboardBufferRef.current = "";
      keyboardClearTimerRef.current = null;
    }, 800);
  }, []);

  const handleResetAll = useCallback(() => {
    setScanMode(isDesktopRuntime && desktopWorkflowMode === "waste" ? "waste" : null);
    setLockedProduct(null);
    setResolvedProduct(null);
    setResolvedEmployee(null);
    setProductScanValue("");
    setEmployeeScanValue("");
    setErrorMessage("");
    setStatusMessage(isDesktopRuntime && desktopWorkflowMode === "waste"
      ? "เลือกหรือสแกนสินค้าเพื่อชั่งของเสีย"
      : "พร้อมเลือกโหมดการสแกน");
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
    clearKeyboardBuffer();
    startStageTransition(() => {
      setStage("product");
    });
  }, [clearKeyboardBuffer, desktopWorkflowMode, isDesktopRuntime, startStageTransition]);

  const handleBackToEmployee = useCallback(() => {
    setResolvedEmployee(null);
    setEmployeeScanValue("");
    setErrorMessage("");
    setStatusMessage("กรุณาสแกน QR พนักงานอีกครั้ง");
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
    clearKeyboardBuffer();
    startStageTransition(() => {
      setStage("employee");
    });
  }, [clearKeyboardBuffer, startStageTransition]);

  const handleSelectMode = useCallback((mode) => {
    setScanMode(mode);
    setLockedProduct(null);
    setResolvedProduct(null);
    setResolvedEmployee(null);
    setProductScanValue("");
    setEmployeeScanValue("");
    setErrorMessage("");
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
    clearKeyboardBuffer();
    startStageTransition(() => {
      setStage("product");
      setStatusMessage(mode === "single" ? "เริ่มต้นด้วยการสแกนสินค้าหลักของวันนี้" : "พร้อมสแกนบาร์โค้ดสินค้า");
    });
  }, [clearKeyboardBuffer, startStageTransition]);

  const handleChangeLockedProduct = useCallback(() => {
    setLockedProduct(null);
    setResolvedProduct(null);
    setResolvedEmployee(null);
    setProductScanValue("");
    setEmployeeScanValue("");
    setErrorMessage("");
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
    clearKeyboardBuffer();
    startStageTransition(() => {
      setStage("product");
      setStatusMessage("สแกนสินค้าใหม่สำหรับรอบนี้");
    });
  }, [clearKeyboardBuffer, startStageTransition]);

  const handleNextAssignment = useCallback(() => {
    setResolvedEmployee(null);
    setEmployeeScanValue("");
    setErrorMessage("");
    setIsLookingUp(false);
    isProcessingScanRef.current = false;
    clearKeyboardBuffer();

    if (scanMode === "single" && lockedProduct) {
      setResolvedProduct(lockedProduct);
      startStageTransition(() => {
        setStage("employee");
        setStatusMessage("สแกนพนักงานคนถัดไปได้เลย");
      });
      return;
    }

    setResolvedProduct(null);
    setProductScanValue("");
    startStageTransition(() => {
      setStage("product");
      setStatusMessage("พร้อมสแกนบาร์โค้ดสินค้า");
    });
  }, [clearKeyboardBuffer, lockedProduct, scanMode, startStageTransition]);

  useEffect(() => {
    activeStageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  useEffect(() => {
    cameraIdRef.current = currentCameraId;
  }, [currentCameraId]);

  useEffect(() => {
    let cancelled = false;

    const refreshAll = async () => {
      const summary = await refreshOfflineMasterState();
      await refreshOutboxState();
      if (cancelled) return;

      if (getConnectivitySnapshot().online) {
        const sessionResult = await refreshAuthSession().catch(() => ({ ok: false }));
        if (!cancelled && sessionResult?.ok) {
          setLastSessionRefreshAt(new Date().toISOString());
        }
      }

      if (getConnectivitySnapshot().online) {
        await syncPendingPieceRateOutbox({ includeFailed: true }).catch(() => null);
        await refreshOutboxState();
        if (await shouldSyncPieceRateMaster().catch(() => true)) {
          await handleSyncOfflineMaster({ silent: summary.ready });
        }
      }
    };

    const handleConnectivityChange = async () => {
      setConnectivity(getConnectivitySnapshot());
      await refreshOutboxState();
      if (!cancelled && getConnectivitySnapshot().online) {
        await refreshAll();
      } else {
        await refreshOfflineMasterState();
      }
    };

    void refreshAll();
    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);
    window.addEventListener(WRAPPER_NETWORK_CHANGE_EVENT, handleConnectivityChange);
    window.addEventListener(PIECE_RATE_MASTER_CHANGE_EVENT, refreshOfflineMasterState);
    window.addEventListener(PIECE_RATE_OUTBOX_CHANGE_EVENT, refreshOutboxState);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleConnectivityChange);
      window.removeEventListener("offline", handleConnectivityChange);
      window.removeEventListener(WRAPPER_NETWORK_CHANGE_EVENT, handleConnectivityChange);
      window.removeEventListener(PIECE_RATE_MASTER_CHANGE_EVENT, refreshOfflineMasterState);
      window.removeEventListener(PIECE_RATE_OUTBOX_CHANGE_EVENT, refreshOutboxState);
    };
  }, [handleSyncOfflineMaster, refreshOfflineMasterState, refreshOutboxState]);

  useEffect(() => {
    if (isDesktopRuntime || isDesktopPieceRateRuntime()) return undefined;
    let mounted = true;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!mounted || !Array.isArray(devices) || devices.length === 0) {
          return;
        }
        setCameras(devices);
        setCurrentCameraId((previousValue) => previousValue || pickDefaultCameraId(devices));
      })
      .catch((error) => {
        console.error("Error loading cameras", error);
        if (mounted) {
          setErrorMessage("ไม่พบอุปกรณ์กล้องสำหรับสแกน");
        }
      });

    return () => {
      mounted = false;
    };
  }, [isDesktopRuntime]);

  useEffect(() => {
    if (isDesktopRuntime || isDesktopPieceRateRuntime()) {
      void disposeScanner();
      return undefined;
    }
    if (stage === "form") {
      void disposeScanner();
      return;
    }

    if (!masterSummary.ready) {
      void disposeScanner();
      return;
    }

    const timer = window.setTimeout(() => {
      void initScanner(currentCameraId, stage);
    }, 30);

    return () => {
      window.clearTimeout(timer);
      void stopScanner();
    };
  }, [currentCameraId, disposeScanner, initScanner, isDesktopRuntime, masterSummary.ready, stage, stopScanner]);

  useEffect(() => {
    return () => {
      void disposeScanner();
    };
  }, [disposeScanner]);

  useEffect(() => {
    if (isDesktopRuntime && desktopWorkflowMode !== "weigh-in" && desktopWorkflowMode !== "waste") {
      clearKeyboardBuffer();
      return undefined;
    }
    const handleKeyboardScan = (event) => {
      const code = String(event?.code || "");
      if (code === "Enter") {
        const scannedText = keyboardBufferRef.current.trim();
        clearKeyboardBuffer();
        if (!scannedText || activeStageRef.current === "form") return;
        event.preventDefault();
        const scanHandler = handleScanRef.current;
        if (typeof scanHandler === "function") {
          void scanHandler(scannedText);
        }
        return;
      }

      if (activeStageRef.current === "form") return;

      const nextChar = resolveKeyboardScanChar(event);
      if (!nextChar) return;

      keyboardBufferRef.current += nextChar;
      scheduleKeyboardBufferClear();
    };

    window.addEventListener("keydown", handleKeyboardScan);
    return () => {
      window.removeEventListener("keydown", handleKeyboardScan);
      clearKeyboardBuffer();
    };
  }, [clearKeyboardBuffer, desktopWorkflowMode, isDesktopRuntime, scheduleKeyboardBufferClear]);

  const renderModals = () => {
  return (
    <>
    {/* Product Picker Modal */}
    {isProductPickerOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-2xl bg-white border border-slate-200 shadow-2xl rounded-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#0f2747]">เลือกสินค้าจากรายการ</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">ค้นหารายการสินค้าเพื่อกำหนดโหมดคิดค่าแรงงาน</p>
              </div>
              <button
                onClick={() => setIsProductPickerOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="relative mt-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="พิมพ์ชื่อสินค้า รหัส หรือ Trade Code..."
                value={searchProductQuery}
                onChange={(e) => setSearchProductQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-[#b68a12] focus:ring-1 focus:ring-[#b68a12] transition-all"
                autoFocus
              />
              {searchProductQuery && (
                <button
                  onClick={() => setSearchProductQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0 no-scrollbar">
            {loadingPickerProducts ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="animate-spin text-[#b68a12]" size={36} />
                <span className="text-xs font-bold uppercase tracking-widest">กำลังค้นหาข้อมูล...</span>
              </div>
            ) : pickerProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Package size={48} className="stroke-1 opacity-55 mb-2" />
                <span className="text-xs font-bold uppercase tracking-widest">ไม่พบสินค้าที่ต้องการ</span>
              </div>
            ) : (
              pickerProducts.map((item, index) => (
                  <div
                    key={`${item.goodsCode || ""}-${item.skuCode || ""}-${index}`}
                    onClick={() => void handleSelectProduct(item)}
                    className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:bg-slate-50 active:scale-[0.99]"
                  >
                    {/* Image */}
                    <div className="w-14 h-14 bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center border border-slate-100 shrink-0">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <Package size={20} className="text-slate-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[#0f2747] tracking-tight">{item.goodsCode}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-700 truncate mt-0.5">{item.skuName || item.name}</h4>
                      {item.unitName && (
                        <span className="inline-block text-[10px] font-semibold text-slate-400 mt-0.5">
                          หน่วย: {item.unitName}
                        </span>
                      )}
                    </div>
                  </div>
              ))
            )}
            </div>
            {/* Pagination Footer */}
            {productTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/50">
                <button
                  disabled={productPage <= 1}
                  onClick={() => void loadPickerProducts(searchProductQuery, productPage - 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
                >
                  ก่อนหน้า
                </button>
                <span className="text-xs font-black text-slate-500">
                  หน้า {productPage} จาก {productTotalPages}
                </span>
                <button
                  disabled={productPage >= productTotalPages}
                  onClick={() => void loadPickerProducts(searchProductQuery, productPage + 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
                >
                  ถัดไป
                </button>
              </div>
            )}       </div>
      </div>
    )}

    {/* Employee Picker Modal */}
    {isEmployeePickerOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-2xl bg-white border border-slate-200 shadow-2xl rounded-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#0f2747]">เลือกพนักงานจากรายการ</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">ค้นหารายชื่อพนักงานในแผนกเพื่อเริ่มงานคิดรายชิ้น</p>
              </div>
              <button
                onClick={() => setIsEmployeePickerOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="relative mt-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="พิมพ์ชื่อพนักงาน หรือรหัสพนักงาน..."
                value={searchEmployeeQuery}
                onChange={(e) => setSearchEmployeeQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:bg-white focus:border-[#b68a12] focus:ring-1 focus:ring-[#b68a12] transition-all"
                autoFocus
              />
              {searchEmployeeQuery && (
                <button
                  onClick={() => setSearchEmployeeQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 no-scrollbar">
            {loadingPickerEmployees ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="animate-spin text-[#b68a12]" size={36} />
                <span className="text-xs font-bold uppercase tracking-widest">กำลังค้นหาข้อมูล...</span>
              </div>
            ) : pickerEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <UserRound size={48} className="stroke-1 opacity-55 mb-2" />
                <span className="text-xs font-bold uppercase tracking-widest">ไม่พบรายชื่อพนักงาน</span>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/75 border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center w-16">ลำดับ</th>
                      <th className="py-3.5 px-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center w-20">รูป</th>
                      <th className="py-3.5 px-4 text-xs font-black text-slate-400 uppercase tracking-wider w-36">รหัสพนักงาน</th>
                      <th className="py-3.5 px-4 text-xs font-black text-slate-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                      <th className="py-3.5 px-4 text-xs font-black text-slate-400 uppercase tracking-wider w-48">แผนก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pickerEmployees.map((item, index) => {
                      const seq = (employeePage - 1) * 30 + index + 1;
                      return (
                        <tr
                          key={`${item.employeeCode || ""}-${index}`}
                          onClick={() => void handleSelectEmployee(item)}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors active:bg-slate-100"
                        >
                          {/* Sequence */}
                          <td className="py-3.5 px-4 text-base font-bold text-slate-400 text-center">{seq}</td>
                          
                          {/* Avatar */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="w-12 h-12 bg-slate-100 rounded-full overflow-hidden flex items-center justify-center border border-slate-200 mx-auto shrink-0">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <UserRound size={18} />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Employee Code */}
                          <td className="py-3.5 px-4 text-sm font-black text-[#b68a12] tracking-tight">{item.employeeCode}</td>

                          {/* Full Name */}
                          <td className="py-3.5 px-4 text-base font-bold text-slate-800">{item.fullName || item.name}</td>

                          {/* Department */}
                          <td className="py-3.5 px-4 text-sm font-semibold text-slate-500">{item.department}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            {/* Pagination Footer */}
            {employeeTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/50">
                <button
                  disabled={employeePage <= 1}
                  onClick={() => void loadPickerEmployees(searchEmployeeQuery, employeePage - 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
                >
                  ก่อนหน้า
                </button>
                <span className="text-xs font-black text-slate-500">
                  หน้า {employeePage} จาก {employeeTotalPages}
                </span>
                <button
                  disabled={employeePage >= employeeTotalPages}
                  onClick={() => void loadPickerEmployees(searchEmployeeQuery, employeePage + 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
                >
                  ถัดไป
                </button>
              </div>
            )}       </div>
      </div>
    )}

    </>
  );
  }

  const isBusy = isLookingUp || isStagePending;
  const isProductStage = stage === "product";
  const scannerTitle = isProductStage ? "สแกนสินค้า" : "สแกนพนักงาน";
  const masterStatus = resolveOfflineMasterStatus(masterSummary, connectivity);
  const canScan = masterSummary.ready && !isSyncingMaster;

  if (isDesktopRuntime && desktopWorkflowMode === "prison-receipt") {
    return <PieceRatePrisonReceiptForm onModeChange={handleDesktopWorkflowModeChange} />;
  }

  if (isDesktopRuntime && desktopWorkflowMode === "prison-issue") {
    return (
      <PieceRateStockWorkflowPageClient
        mode="issue"
        workflowActiveMode="prison-issue"
        issueSource="prison"
        embedded
        onModeChange={handleDesktopWorkflowModeChange}
      />
    );
  }

  if (isDesktopRuntime && desktopWorkflowMode !== "weigh-in" && desktopWorkflowMode !== "waste") {
    return (
      <PieceRateStockWorkflowPageClient
        mode={desktopWorkflowMode}
        embedded
        onModeChange={handleDesktopWorkflowModeChange}
      />
    );
  }

  if (isDesktopRuntime && desktopWorkflowMode === "waste" && stage === "product") {
    return (
      <PieceRateWasteProductPicker
        products={wasteProductOptions}
        onSelect={handleWasteProductSelection}
        workflowMode={desktopWorkflowMode}
        onWorkflowModeChange={handleDesktopWorkflowModeChange}
      />
    );
  }

  if (stage === "form" && scanMode === "waste" && resolvedProduct) {
    return (
      <PieceRateWasteForm
        productLookup={resolvedProduct}
        productScanValue={productScanValue}
        onChangeProduct={handleChangeLockedProduct}
        onNextAssignment={handleNextAssignment}
        onResetAll={handleResetAll}
        desktopMode={isDesktopRuntime}
        desktopScale={desktopScale}
        machineCode={machineCode}
        workflowMode={desktopWorkflowMode}
        onWorkflowModeChange={handleDesktopWorkflowModeChange}
      />
    );
  }

  if (stage === "form" && resolvedProduct && resolvedEmployee) {
    return (
      <>
        <PieceRateWorkForm
          scanMode={scanMode}
          lockedProduct={lockedProduct}
          productLookup={resolvedProduct}
          employee={resolvedEmployee}
          productScanValue={productScanValue}
          employeeScanValue={employeeScanValue}
          machineCode={machineCode}
          onChangeProduct={handleChangeLockedProduct}
          onNextAssignment={handleNextAssignment}
          onResetAll={handleResetAll}
          onRescanEmployee={handleBackToEmployee}
          onOpenProductPicker={() => {
            setIsProductPickerOpen(true);
          }}
          onOpenEmployeePicker={() => {
            setIsEmployeePickerOpen(true);
            void loadPickerEmployees("");
          }}
          desktopMode={isDesktopRuntime}
          desktopScale={desktopScale}
          desktopRefreshKey={desktopRefreshKey}
          onDesktopRecordSaved={() => setDesktopRefreshKey((value) => value + 1)}
          workflowMode={desktopWorkflowMode}
          onWorkflowModeChange={setDesktopWorkflowMode}
        />
        {renderModals()}
      </>
    );
  }

  if (isDesktopRuntime && desktopWorkflowMode !== "waste") {
    return (
      <>
        <PieceRateDesktopWorkstation
          productLookup={resolvedProduct}
          employee={resolvedEmployee}
          scale={desktopScale}
          onChangeProduct={handleChangeLockedProduct}
          onOpenProductPicker={() => {
            setIsProductPickerOpen(true);
          }}
          onOpenEmployeePicker={() => {
            setIsEmployeePickerOpen(true);
            void loadPickerEmployees("");
          }}
          refreshKey={desktopRefreshKey}
          workflowMode={desktopWorkflowMode}
          onWorkflowModeChange={handleDesktopWorkflowModeChange}
        />
        {renderModals()}
      </>
    );
  }

  if (!scanMode) {
    return (
      <div className="h-[100dvh] w-full overflow-hidden bg-[#f8fafc] font-sans text-slate-900">
        <header className="sticky top-0 z-40 w-full border-b border-[#d4af37]/20 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
            <Link href="/production-line/attendance" className="rounded-full p-2 text-slate-500 active:bg-slate-100">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex flex-col">
              <h1 className="text-sm font-black tracking-tight text-[#0f2747]">สแกนคิดค่าแรง</h1>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b68a12]">เลือกโหมดเริ่มงาน</span>
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-start overflow-y-auto px-4 py-5 sm:items-center sm:py-8">
          <div className="piece-rate-mode-picker mx-auto flex w-full max-w-md flex-col gap-4 sm:gap-6">
            <section className="hidden overflow-hidden rounded-[2rem] border border-[#d4af37]/30 bg-[#0f2747] shadow-[0_24px_80px_rgba(15,39,71,0.18)]">
              <div className="bg-[linear-gradient(135deg,rgba(212,175,55,0.16),transparent_55%)] px-5 py-5">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d4af37]">Piece Rate Mode</p>
                <h2 className="mt-2 text-2xl font-black leading-tight text-white">เลือกวิธีสแกนก่อนเริ่มรอบงาน</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-200">
                  ถ้าวันนี้ทำสินค้าเดียวทั้งวัน ให้สแกนสินค้าครั้งเดียว แล้วสแกนพนักงานต่อได้เลย
                </p>
              </div>
            </section>

            <button
              type="button"
              onClick={() => handleSelectMode("single")}
              className="w-full border border-[#d4af37]/40 bg-[#0f2747] p-6 text-left shadow-[0_24px_64px_rgba(15,39,71,0.22)] transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-[#d4af37]/45 bg-[#16345d] text-[#f3d36b]">
                  <Package size={30} strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b68a12]">โหมดแนะนำสำหรับงานทั้งวัน</p>
                  <h3 className="mt-1 text-xl font-black text-[#0f2747]">ผลิตภัณฑ์เดียว</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    สแกนสินค้า 1 ครั้ง จากนั้นสแกนเฉพาะพนักงานและบันทึกน้ำหนักต่อเนื่องได้
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0f2747] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#f3d36b]">
                  เร็ว
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectMode("multi")}
              className="w-full border border-[#d4af37]/35 bg-white p-6 text-left shadow-[0_18px_48px_rgba(15,39,71,0.08)] transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-[#d4af37]/30 bg-[#fff8e5] text-[#0f2747]">
                  <Boxes size={30} strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">โหมดมาตรฐาน</p>
                  <h3 className="mt-1 text-xl font-black text-[#0f2747]">หลายผลิตภัณฑ์</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    ใช้แบบเดิม สแกนสินค้าและสแกนพนักงานทุกครั้ง เหมาะกับวันที่มีหลายสินค้า
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                  เดิม
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectMode("waste")}
              className="w-full border border-rose-200 bg-rose-50 p-6 text-left shadow-[0_18px_48px_rgba(190,24,93,0.08)] transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-rose-200 bg-white text-rose-700">
                  <Scale size={30} strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-500">บันทึกแยกจากค่าแรง</p>
                  <h3 className="mt-1 text-xl font-black text-[#0f2747]">ชั่งของเสีย</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    สแกนสินค้า อ่านน้ำหนักจากเครื่องชั่งแบบ realtime และกดบันทึกของเสีย
                  </p>
                </div>
                <div className="rounded-2xl bg-rose-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">
                  ใหม่
                </div>
              </div>
            </button>
          </div>
        </main>
        <style>{`
          .piece-rate-mode-picker section {
            display: none;
          }

          .piece-rate-mode-picker button > div {
            align-items: center;
          }

          .piece-rate-mode-picker button > div > div:first-child {
            height: 84px;
            width: 84px;
            flex-shrink: 0;
          }

          .piece-rate-mode-picker button > div > div:nth-child(2) > p:first-child,
          .piece-rate-mode-picker button > div > div:nth-child(2) > h3 + p,
          .piece-rate-mode-picker button > div > div:last-child {
            display: none;
          }

          .piece-rate-mode-picker button > div > div:nth-child(2) > h3 {
            margin-top: 0;
            font-size: 42px;
            line-height: 1;
          }

          .piece-rate-mode-picker button:first-of-type > div > div:nth-child(2) > h3 {
            color: #ffffff;
          }

          .piece-rate-mode-picker button:last-of-type > div > div:nth-child(2) > h3 {
            color: #0f2747;
          }

          @media (max-height: 760px) {
            .piece-rate-mode-picker {
              gap: 1rem;
            }

            .piece-rate-mode-picker button {
              padding: 1.25rem;
            }

            .piece-rate-mode-picker button > div > div:first-child {
              height: 72px;
              width: 72px;
            }

            .piece-rate-mode-picker button > div > div:nth-child(2) > h3 {
              font-size: 2rem;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#f8fafc] text-slate-900 font-sans flex flex-col overflow-hidden">
      {isDesktopRuntime ? (
        <PieceRateWorkflowTabs activeMode={desktopWorkflowMode} onChange={handleDesktopWorkflowModeChange} />
      ) : null}
      {/* Professional Header */}
      <header className="sticky top-0 z-40 w-full border-b border-[#d4af37]/20 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/production-line/attendance" className="p-2 -ml-2 text-slate-400 active:bg-slate-100 rounded-full">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex flex-col -gap-0.5">
            <h1 className="text-sm font-black text-[#0f2747] leading-none tracking-tight">สแกนคิดค่าแรง</h1>
            <span className="text-[10px] font-bold text-[#b68a12] uppercase tracking-[0.2em]">
              {scanMode === "single"
                ? "โหมดผลิตภัณฑ์เดียว"
                : scanMode === "waste"
                  ? "โหมดชั่งของเสีย"
                  : "โหมดหลายผลิตภัณฑ์"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {outboxSummary.pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-amber-500 text-white px-2.5 py-1 rounded-full text-[9px] font-black animate-pulse border border-amber-400">
              <RefreshCw size={10} className="animate-spin" />
              รอซิงค์ {outboxSummary.pendingCount}
            </div>
          )}
          {outboxSummary.failedCount > 0 && (
            <div className="flex items-center gap-1 bg-rose-500 text-white px-2.5 py-1 rounded-full text-[9px] font-black border border-rose-400">
              <AlertTriangle size={10} />
              ซิงค์ล้มเหลว {outboxSummary.failedCount}
            </div>
          )}
          {outboxSummary.needsReviewCount > 0 && (
            <div className="flex items-center gap-1 bg-violet-600 text-white px-2.5 py-1 rounded-full text-[9px] font-black border border-violet-500">
              <ShieldCheck size={10} />
              รอตรวจสอบ {outboxSummary.needsReviewCount}
            </div>
          )}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider transition-all ${masterStatus.tone}`}>
            {masterStatus.icon}
            {masterStatus.label}
          </div>
          <div className={`h-2.5 w-2.5 rounded-full ${connectivity.online ? "bg-emerald-500" : "bg-rose-500 animate-pulse"}`} />
        </div>
      </header>

      {/* Step Indicator (Sticks directly under Header) */}
      <div className="w-full bg-white border-b border-slate-100 px-4 py-2 flex justify-center z-30">
        <div className="w-full max-w-2xl bg-slate-50 rounded-[1.5rem] p-1 flex items-center">
          <div className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[1.25rem] transition-all ${isProductStage ? "bg-slate-900 text-white shadow-sm" : "bg-transparent text-slate-400"}`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black ${isProductStage ? "bg-[#d4af37] text-[#0f2747]" : "bg-slate-200 text-slate-400"}`}>1</span>
            <span className="text-[10px] font-black tracking-widest">สินค้า</span>
          </div>
          <div className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[1.25rem] transition-all ${!isProductStage ? "bg-slate-900 text-white shadow-sm" : "bg-transparent text-slate-400"}`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black ${!isProductStage ? "bg-[#d4af37] text-[#0f2747]" : "bg-slate-200 text-slate-400"}`}>2</span>
            <span className="text-[10px] font-black tracking-widest">
              {scanMode === "waste" ? "น้ำหนัก" : "พนักงาน"}
            </span>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-10">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 flex flex-col gap-5">

          {isDesktopRuntime && scanMode === "waste" && isProductStage ? (
            <section className="border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-xs font-black text-[#0f2747]">
                เลือกสินค้า
                <select
                  className="mt-2 h-12 w-full border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-[#b68a12]"
                  value=""
                  onChange={(event) => handleWasteProductSelection(event.target.value)}
                >
                  <option value="">เลือกจากรายการ หรือยิงบาร์โค้ดสินค้า</option>
                  {wasteProductOptions.map((record) => (
                    <option key={record.productBarcode} value={record.productBarcode}>
                      {record.payload.product.goodsCode || record.payload.product.code} - {record.payload.product.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 flex items-center gap-3 border border-dashed border-[#b68a12]/50 bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#0f2747]">
                <ScanLine className="text-[#b68a12]" />
                ยิงบาร์โค้ดสินค้าได้ทันที โดยไม่ต้องคลิกช่องกรอก
              </div>
            </section>
          ) : null}

          {resolvedProduct ? (
            <section className="px-2 py-1 text-slate-900 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b68a12]">
                  {scanMode === "single" ? "สินค้าที่ล็อกไว้" : "สินค้าที่สแกนแล้ว"}
                </span>
                <button
                  type="button"
                  onClick={handleChangeLockedProduct}
                  className="shrink-0 rounded-xl border border-[#d4af37]/35 bg-white px-3 py-1.5 text-[10px] font-black tracking-wide text-[#b68a12] shadow-sm hover:bg-[#fffcf0] active:scale-[0.98]"
                >
                  เปลี่ยนสินค้า
                </button>
              </div>
              <div className="min-w-0 flex flex-col border border-slate-200 bg-transparent p-4 rounded-none gap-3 items-center text-center">
                {/* Product Image Thumbnail if present - Prominent and Centered */}
                {resolvedProduct.product?.imageUrl || resolvedProduct.product?.image_url ? (
                  <div className="relative h-44 w-44 shrink-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedProduct.product?.imageUrl || resolvedProduct.product?.image_url}
                      alt="Product"
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex flex-col items-center">
                  {/* Highlighted Product Code */}
                  <span className="text-xl sm:text-2xl font-black text-[#0f2747] tracking-tight">
                    {resolvedProduct.product?.goodsCode || resolvedProduct.product?.code || "-"}
                  </span>
                  {/* Subtitle Product Name - wraps up to 2 lines */}
                  <span className="text-sm sm:text-base font-semibold text-slate-600 leading-snug line-clamp-2 mt-0.5">
                    {resolvedProduct.product?.name || "-"}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          {/* Scanner Viewport Section */}
          <section className={`${isDesktopRuntime && scanMode === "waste" ? "hidden" : ""} bg-white rounded-[2.5rem] border border-slate-200 p-3 shadow-sm relative`}>
            <div className="relative aspect-[4/5] sm:aspect-[4/3] rounded-[2rem] overflow-hidden bg-[#020617] border-4 border-slate-50">
              <div id="piece-rate-reader" className="absolute inset-0" />
              
              {/* Animated Corner Overlays */}
              <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
                <div className="flex justify-between">
                  <div className="w-10 h-10 border-t-4 border-l-4 border-white/20 rounded-tl-xl" />
                  <div className="w-10 h-10 border-t-4 border-r-4 border-white/20 rounded-tr-xl" />
                </div>
                <div className="flex justify-between">
                  <div className="w-10 h-10 border-b-4 border-l-4 border-white/20 rounded-bl-xl" />
                  <div className="w-10 h-10 border-b-4 border-r-4 border-white/20 rounded-br-xl" />
                </div>
              </div>

              {/* Scanning Ray Effect */}
              {isCameraReady && !isBusy && (
                <div className="absolute inset-x-0 h-0.5 bg-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.8)] animate-[scan_3s_ease-in-out_infinite] z-10 opacity-50" />
              )}

              {/* Loading/Busy Overlay */}
              {isBusy && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-20 animate-in fade-in duration-300">
                  <div className="relative">
                    <Loader2 size={48} className="text-white animate-spin" />
                    <div className="absolute inset-0 bg-[#d4af37] blur-2xl opacity-20 animate-pulse" />
                  </div>
                  <p className="text-white text-xs font-black tracking-[0.2em] animate-pulse">กำลังประมวลผล...</p>
                </div>
              )}

              {/* Error/Status Messages within Scanner */}
              {!canScan && (
                <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center gap-4 z-30 animate-in fade-in duration-500">
                  <div className="h-16 w-16 rounded-3xl bg-rose-500/20 flex items-center justify-center mb-2 border border-rose-500/30">
                    <Database size={32} className="text-rose-500" />
                  </div>
                  <h3 className="text-white text-lg font-black tracking-tight leading-none">ยังไม่มีข้อมูลพร้อมใช้งาน</h3>
                  <p className="text-slate-400 text-[11px] font-bold leading-relaxed max-w-[200px]">
                    {connectivity.online 
                      ? "ต้องซิงก์ข้อมูลสินค้าและพนักงานก่อนเริ่มสแกนคิดค่าแรง"
                      : "กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อดาวน์โหลดข้อมูลสินค้าและพนักงาน"}
                  </p>
                  <button onClick={() => void handleSyncOfflineMaster()} className="mt-4 px-6 py-3 bg-[#d4af37] text-[#0f2747] rounded-2xl text-[10px] font-black tracking-widest active:scale-95 transition-all">
                    ซิงก์ตอนนี้
                  </button>
                </div>
              )}

              {/* Viewfinder Label */}
              {!isBusy && canScan && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 z-20">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <ScanLine size={12} className="text-[#f3d36b]" />
                    {scannerTitle}
                  </span>
                </div>
              )}
            </div>

            {/* Viewfinder Actions */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30">
              <button 
                onClick={handleSwitchCamera} 
                disabled={cameras.length < 2 || isBusy || !canScan}
                className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white text-slate-900 shadow-xl border border-slate-200 active:bg-slate-50 disabled:opacity-50 transition-all"
              >
                <SwitchCamera size={20} />
              </button>
              <button 
                onClick={() => {
                  if (isProductStage) {
                    setIsProductPickerOpen(true);
                  } else {
                    setIsEmployeePickerOpen(true);
                    void loadPickerEmployees("");
                  }
                }}
                disabled={!canScan}
                className="px-4 h-12 flex items-center justify-center gap-2 rounded-2xl bg-white text-[#0f2747] shadow-xl border border-slate-200 active:bg-slate-50 disabled:opacity-50 transition-all font-black text-xs whitespace-nowrap animate-in zoom-in-95"
              >
                {isProductStage ? <Package size={16} className="text-[#b68a12]" /> : <UserRound size={16} className="text-[#b68a12]" />}
                เลือกจากรายการ
              </button>
              <button 
                onClick={handleResetAll}
                className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white text-slate-900 shadow-xl border border-slate-200 active:bg-slate-50 transition-all"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </section>

          {/* Detailed Info Cards */}
          <div className="grid gap-4 mt-2">
            
            {/* Machine Code Missing Warning */}
            {machineCode === null && (
              <div className="p-4 rounded-3xl border bg-rose-50 border-rose-100 flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} />
                </div>
                <p className="text-rose-700 text-xs font-black tracking-tight">ยังไม่ได้ตั้งค่ารหัสเครื่อง ไม่สามารถบันทึก/พิมพ์ได้</p>
              </div>
            )}

            {/* Real-time feedback bar */}
            <div className={`p-4 rounded-3xl border transition-all flex items-center gap-3 ${errorMessage ? "bg-rose-50 border-rose-100" : "bg-white border-slate-200"}`}>
              {errorMessage ? (
                <>
                  <div className="h-8 w-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} />
                  </div>
                  <p className="text-rose-700 text-xs font-black uppercase tracking-tight line-clamp-2">{errorMessage}</p>
                </>
              ) : (
                <>
                  <div className="h-8 w-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    {isProductStage ? <Package size={16} /> : <User size={16} />}
                  </div>
                  <p className="text-slate-900 text-xs font-black uppercase tracking-widest">{statusMessage}</p>
                </>
              )}
            </div>

            {/* Offline Readiness Card */}
            <section className="bg-white rounded-[2rem] p-6 border border-slate-200/60 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-400 tracking-widest">สถานะข้อมูลหลัก</h3>
                {connectivity.online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-rose-500" />}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-slate-400">สินค้า</span>
                  <span className="text-sm font-black text-slate-900">{masterSummary.productCount || 0} รายการ</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-slate-400">พนักงาน</span>
                  <span className="text-sm font-black text-slate-900">{masterSummary.employeeCount || 0} คน</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <span>ซิงค์ล่าสุด</span>
                  <span className="text-slate-900">{formatSyncDateTime(masterSummary.lastSuccessfulSyncAt)}</span>
                </div>
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <span>เซสชัน</span>
                  <span className="text-slate-900">{lastSessionRefreshAt ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button 
                  onClick={() => void handleRefreshSession()}
                  disabled={!connectivity.online || isRefreshingSession}
                  className="py-3 bg-slate-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-600 active:bg-slate-200 disabled:opacity-40 transition-colors"
                >
                  รีเฟรชเซสชัน
                </button>
                <button 
                  onClick={() => void handleSyncOfflineMaster()}
                  disabled={!connectivity.online || isSyncingMaster}
                  className="py-3 bg-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white active:bg-black disabled:opacity-40 transition-colors"
                >
                  ซิงค์ทันที
                </button>
              </div>
            </section>

            {/* Scanned Summary (only visible if some data is present) */}
            {(resolvedProduct || resolvedEmployee) && (
              <section className="bg-white rounded-[2rem] p-6 border-2 border-[#d4af37]/20 shadow-lg shadow-[#d4af37]/10 space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <h3 className="text-[10px] font-black text-[#b68a12] uppercase tracking-[0.2em]">ข้อมูลรอบงานล่าสุด</h3>
                <div className="space-y-3">
                  {resolvedProduct && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-[#fff7df] rounded-xl flex items-center justify-center text-[#b68a12]"><Package size={18} /></div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">สินค้า</span>
                        <span className="text-xs font-black text-slate-900 truncate max-w-[200px]">{resolvedProduct.product.name}</span>
                      </div>
                    </div>
                  )}
                  {resolvedEmployee && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-[#fff7df] rounded-xl flex items-center justify-center text-[#b68a12]"><User size={18} /></div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">พนักงาน</span>
                        <span className="text-xs font-black text-slate-900 truncate max-w-[200px]">{resolvedEmployee.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>



      {renderModals()}
    </div>
  );
}
