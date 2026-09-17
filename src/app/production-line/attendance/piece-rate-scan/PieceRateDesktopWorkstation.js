"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, Package, RotateCcw, Scale, ScanBarcode, Settings, UserRound } from "lucide-react";
import { fetchPieceRateReport } from "@/features/attendance/services/pieceRateWorkClient";
import {
  fetchPieceRatePrintAgentHealth,
  printPieceRateLabelViaAgent,
  fetchPieceRatePrinters,
} from "@/features/production-line/services/localPrintAgentClient";
import { buildPieceRateDesktopLabel } from "@/lib/piece-rate-desktop-label";
import {
  getCachedPieceRateProductLookup,
  getRecentPieceRateOutboxEntries,
  PIECE_RATE_OUTBOX_CHANGE_EVENT,
} from "@/lib/offline/pieceRateOffline";
import PieceRateWorkflowTabs from "@/features/attendance/components/PieceRateWorkflowTabs";
import styles from "./PieceRateDesktopWorkstation.module.css";
import PieceRateDeviceSettingsDialog from "./PieceRateDeviceSettingsDialog";
import PieceRateEmployeeSummaryModal from "./PieceRateEmployeeSummaryModal";

function formatNumber(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "-";
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const partMap = {};
  parts.forEach((p) => {
    partMap[p.type] = p.value;
  });

  const day = partMap.day;
  const month = partMap.month;
  const yearAD = Number(partMap.year);
  const yearBE = yearAD + 543;
  const yearTwoDigits = String(yearBE).slice(-2);

  let rawHour = Number(partMap.hour);
  if (rawHour === 24) rawHour = 0;
  const hours = String(rawHour).padStart(2, "0");
  const minutes = String(partMap.minute).padStart(2, "0");
  const seconds = String(partMap.second).padStart(2, "0");

  return `${day}/${month}/${yearTwoDigits} ${hours}:${minutes}:${seconds}`;
}

function getOutboxDisplayStatus(entry) {
  if (entry?.status === "failed" || entry?.status === "needs_review") {
    return "failed";
  }
  if (entry?.syncedAt || entry?.status === "ready_to_print") {
    return "synced";
  }
  return "pending";
}

function mapOutboxEntryToRow(entry) {
  const payload = entry?.payload || {};
  const syncedData = entry?.syncedData || {};

  return {
    id: `outbox:${entry.id}`,
    requestId: entry.requestId || payload.requestId || entry.id,
    docNo: syncedData.docNo || payload.docNo || "-",
    lotNo: syncedData.lotNo || payload.lotNo || "-",
    loggedAt: syncedData.loggedAt || payload.loggedAt || entry.createdAt,
    employeeCode: syncedData.employeeCode || payload.employeeCode || "-",
    employeeName: syncedData.employeeName || payload.employeeSnapshot?.name || "-",
    productBarcode: syncedData.productBarcode || payload.productBarcode || "-",
    productCode: syncedData.productCode || payload.productCode || "-",
    productGoodsCode: syncedData.productGoodsCode || payload.productGoodsCode || payload.productCode || "-",
    productName: syncedData.productName || payload.productName || "-",
    normalizedKgAmount: syncedData.normalizedKgAmount ?? payload.inputValue ?? 0,
    inputValue: syncedData.inputValue ?? payload.inputValue ?? 0,
    countValue: syncedData.countValue ?? payload.countValue ?? 1,
    syncStatus: getOutboxDisplayStatus(entry),
  };
}

function mergeRecentRows(serverRows, outboxEntries) {
  const merged = new Map();

  serverRows.forEach((row) => {
    const key = row.requestId || row.docNo || row.id;
    merged.set(String(key), { ...row, syncStatus: "synced" });
  });

  outboxEntries.forEach((entry) => {
    const row = mapOutboxEntryToRow(entry);
    const key = row.requestId || row.docNo || row.id;
    if (!merged.has(String(key))) {
      merged.set(String(key), row);
    }
  });

  return Array.from(merged.values())
    .sort((left, right) => Date.parse(right.loggedAt || 0) - Date.parse(left.loggedAt || 0))
    .slice(0, 20);
}

function mergeAllRows(serverRows, outboxEntries) {
  const merged = new Map();

  serverRows.forEach((row) => {
    const key = row.requestId || row.docNo || row.id;
    merged.set(String(key), { ...row, syncStatus: "synced" });
  });

  outboxEntries.forEach((entry) => {
    const row = mapOutboxEntryToRow(entry);
    const key = row.requestId || row.docNo || row.id;
    if (!merged.has(String(key))) {
      merged.set(String(key), row);
    }
  });

  return Array.from(merged.values())
    .sort((left, right) => Date.parse(right.loggedAt || 0) - Date.parse(left.loggedAt || 0));
}

function EmployeeAvatar({ employeeCode }) {
  const [src, setSrc] = useState(`/api/employees/photos/${encodeURIComponent(employeeCode)}`);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <UserRound size={32} className="text-slate-400" style={{ opacity: 0.6 }} />;
  }

  return (
    <Image
      src={src}
      alt=""
      width={60}
      height={60}
      unoptimized
      onError={() => setFailed(true)}
      style={{ objectFit: "cover", width: "100%", height: "100%" }}
    />
  );
}

export default function PieceRateDesktopWorkstation({
  productLookup,
  employee,
  scale,
  onSave,
  onChangeProduct,
  onOpenProductPicker,
  onOpenEmployeePicker,
  inputValue = "",
  setInputValue,
  isSubmitting = false,
  submitError = "",
  refreshKey = 0,
  onReprint,
  workflowMode = "weigh-in",
  onWorkflowModeChange,
}) {
  const [now, setNow] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [printerReady, setPrinterReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outboxRefreshKey, setOutboxRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("latest");
  const [todayRows, setTodayRows] = useState([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const product = productLookup?.product || null;

  useEffect(() => {
    const refreshFromOutbox = () => setOutboxRefreshKey((value) => value + 1);
    window.addEventListener(PIECE_RATE_OUTBOX_CHANGE_EVENT, refreshFromOutbox);
    return () => window.removeEventListener(PIECE_RATE_OUTBOX_CHANGE_EVENT, refreshFromOutbox);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchPieceRateReport({ viewMode: "detail", page: 1, pageSize: 20, hideCancelled: true, hideReplaced: true })
        .catch(() => null),
      getRecentPieceRateOutboxEntries(50).catch(() => []),
    ])
      .then(async ([result, outboxEntries]) => {
        if (cancelled) return;
        const reportRows = result?.ok ? (result.data?.data?.data || []) : [];
        const mergedRows = mergeRecentRows(reportRows, outboxEntries);
        const productBarcodes = Array.from(new Set(
          mergedRows.map((row) => row.productBarcode).filter((value) => value && value !== "-")
        ));
        const imagePairs = await Promise.all(productBarcodes.map(async (productBarcode) => {
          const lookup = await getCachedPieceRateProductLookup(productBarcode).catch(() => null);
          return [productBarcode, lookup?.product?.imageUrl || lookup?.product?.image_url || ""];
        }));
        const imageMap = new Map(imagePairs);
        if (!cancelled) {
          setRows(mergedRows.map((row) => ({
            ...row,
            imageUrl: imageMap.get(row.productBarcode) || "",
          })));
        }
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [outboxRefreshKey, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    // Show loading spinner only on the very first mount if data is empty
    if (todayRows.length === 0) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoadingToday(true);
      });
    }

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    Promise.all([
      fetchPieceRateReport({
        viewMode: "detail",
        dateFrom: todayStr,
        dateTo: todayStr,
        // The daily employee summary must include every document for the day.
        // `printAll` uses the report service's chunked fetch path (1,000 rows per
        // query) instead of the paginated detail path, which is capped at 50.
        printAll: true,
        hideCancelled: true,
        hideReplaced: true,
      }).catch(() => null),
      getRecentPieceRateOutboxEntries(100).catch(() => []),
    ])
      .then(async ([result, outboxEntries]) => {
        if (cancelled) return;
        const reportRows = result?.ok ? (result.data?.data?.data || []) : [];

        // Filter outbox entries to only include today's entries
        const todayOutbox = outboxEntries.filter((entry) => {
          const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();
          const entryYear = createdAt.getFullYear();
          const entryMonth = String(createdAt.getMonth() + 1).padStart(2, "0");
          const entryDay = String(createdAt.getDate()).padStart(2, "0");
          return `${entryYear}-${entryMonth}-${entryDay}` === todayStr;
        });

        const mergedRows = mergeAllRows(reportRows, todayOutbox);
        const productBarcodes = Array.from(new Set(
          mergedRows.map((row) => row.productBarcode).filter((value) => value && value !== "-")
        ));
        const imagePairs = await Promise.all(productBarcodes.map(async (productBarcode) => {
          const lookup = await getCachedPieceRateProductLookup(productBarcode).catch(() => null);
          return [productBarcode, lookup?.product?.imageUrl || lookup?.product?.image_url || ""];
        }));
        const imageMap = new Map(imagePairs);
        if (!cancelled) {
          setTodayRows(mergedRows.map((row) => ({
            ...row,
            imageUrl: imageMap.get(row.productBarcode) || "",
          })));
          setLoadingToday(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingToday(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outboxRefreshKey, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    fetchPieceRatePrinters()
      .then((data) => { if (!cancelled) setPrinterReady(Boolean(data?.selectedPrinterName)); })
      .catch(() => { if (!cancelled) setPrinterReady(false); });
    return () => { cancelled = true; };
  }, []);

  const groupedByEmployee = useMemo(() => {
    const map = new Map();

    // todayRows is sorted newest first.
    todayRows.forEach((row) => {
      const code = row.employeeCode;
      if (!code || code === "-") return;
      if (!map.has(code)) {
        map.set(code, {
          employeeCode: code,
          employeeName: row.employeeName || "-",
          weights: [],
          totalCount: 0,
        });
      }
      const empData = map.get(code);
      empData.totalCount += 1;
      if (empData.weights.length < 30) {
        empData.weights.push(row.normalizedKgAmount ?? row.inputValue);
      }
    });
    return Array.from(map.values());
  }, [todayRows]);

  const statusClass = !scale?.agentConnected ? styles.offline : scale?.isStable ? styles.stable : styles.live;
  const statusText = !scale?.agentConnected ? "OFFLINE" : scale?.isStable ? "STABLE" : "LIVE";
  const imageUrl = product?.imageUrl || product?.image_url || "";
  const employeeImage = employee?.imageUrl || employee?.image_url || employee?.photoUrl || "";
  const hasProduct = Boolean(product);
  const hasEmployee = Boolean(employee?.employeeCode);
  const isWeightReady = hasEmployee && (productLookup?.pieceRate?.inputMode === "pail"
    ? (Boolean(inputValue) && Number(inputValue) > 0)
    : Boolean(scale?.canSave));
  const canSubmit = productLookup?.pieceRate?.inputMode === "pail"
    ? (Boolean(inputValue) && Number(inputValue) > 0)
    : Boolean(scale?.canSave);
  const handleReprint = async (row) => {
    if (onReprint) {
      await onReprint(row);
      return;
    }
    await printPieceRateLabelViaAgent(buildPieceRateDesktopLabel({
      docNo: row.docNo,
      productCode: row.productGoodsCode || row.productCode,
      productName: row.productName,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      weightKg: row.normalizedKgAmount ?? row.inputValue,
      lotNo: row.lotNo,
      countValue: row.countValue,
      wageAmount: row.wageAmount,
      recordedAt: row.loggedAt,
    })).catch(() => null);
  };

  return (
    <main className={styles.root}>
      <PieceRateWorkflowTabs
        activeMode={workflowMode}
        onChange={onWorkflowModeChange}
      />
      <section className={styles.hero}>
        <div className={styles.topbar}>
          <div className={styles.title}>ระบบบันทึกเนื้อขนมป้ายแยม</div>
          <div className={styles.workflowSteps} aria-label="ลำดับการทำงาน">
            <div className={`${styles.workflowStep} ${hasProduct ? styles.workflowStepDone : styles.workflowStepActive}`}>
              <span className={styles.stepCircle}>{hasProduct ? <Check /> : <ScanBarcode />}<b>1</b></span>
              <span>สแกนสินค้า</span>
            </div>
            <span className={`${styles.stepLine} ${hasEmployee ? styles.stepLineDone : ""}`} />
            <div className={`${styles.workflowStep} ${hasEmployee ? styles.workflowStepDone : hasProduct ? styles.workflowStepActive : ""}`}>
              <span className={styles.stepCircle}>{hasEmployee ? <Check /> : <UserRound />}<b>2</b></span>
              <span>สแกนพนักงาน</span>
            </div>
            <span className={`${styles.stepLine} ${isWeightReady ? styles.stepLineDone : ""}`} />
            <div className={`${styles.workflowStep} ${isWeightReady ? styles.workflowStepDone : hasEmployee ? styles.workflowStepActive : ""}`}>
              <span className={styles.stepCircle}>{isWeightReady ? <Check /> : <Scale />}<b>3</b></span>
              <span>ชั่งและบันทึก</span>
            </div>
          </div>
          <div className={styles.topbarTools}><div className={styles.clock}>{now.toLocaleTimeString("th-TH", { hour12: false })} &nbsp; | &nbsp; {now.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })}</div><button type="button" className={styles.settingsButton} onClick={() => setSettingsOpen(true)} aria-label="ตั้งค่าเครื่องชั่งและเครื่องพิมพ์"><Settings /></button></div>
        </div>
        <div className={styles.dashboard}>
          <div className={styles.productColumn}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>สินค้าปัจจุบัน</h2>
              <div className={styles.productBody}>
                <div className={styles.imageBox}>{imageUrl ? <Image src={imageUrl} alt={product?.name || "สินค้า"} width={220} height={190} unoptimized /> : <Package className={styles.placeholderIcon} />}</div>
                <div>
                  <div className={styles.label}>รหัสสินค้า</div><div className={styles.value}>{product?.goodsCode || product?.code || "รอสแกนสินค้า"}</div>
                  <div className={styles.label}>ชื่อสินค้า</div><div className={styles.value}>{product?.name || "-"}</div>
                  <div className={styles.label}>บาร์โค้ด (สินค้า)</div>{productLookup?.productBarcode ? <><div className={styles.barcodeVisual} /><div className={styles.value}>{productLookup.productBarcode}</div></> : <div className={styles.value}>-</div>}
                </div>
              </div>
            </article>
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              {hasProduct && onChangeProduct ? (
                <button type="button" className={styles.changeProductButton} style={{ flex: 1 }} onClick={onChangeProduct}>
                  <RotateCcw />เปลี่ยนสินค้า
                </button>
              ) : null}
              {onOpenProductPicker ? (
                <button type="button" className={styles.changeProductButton} style={{ flex: 1 }} onClick={onOpenProductPicker}>
                  <ScanBarcode />เลือกสินค้า
                </button>
              ) : null}
            </div>
          </div>
          {productLookup?.pieceRate?.inputMode === "pail" ? (
            <article className={styles.scale}>
              <div className={styles.scaleLabel} style={{ color: "#f2c94c" }}>ป้อนจำนวนปี๊บ</div>
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <input
                  type="number"
                  placeholder="0"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  style={{
                    width: "192px",
                    height: "80px",
                    textAlign: "center",
                    fontSize: "48px",
                    fontWeight: 900,
                    color: "#ffffff",
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    border: "2px solid #e4b625",
                    borderRadius: "12px",
                    outline: "none",
                  }}
                  autoFocus
                />
                <span style={{ fontSize: "14px", fontWeight: 900, color: "#cbd5e1" }}>
                  หน่วย: ปี๊บ
                </span>
                {inputValue && Number(inputValue) > 0 ? (
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#10b981", marginTop: "4px" }}>
                    คำนวณน้ำหนัก: {formatNumber(Number(inputValue) * Number(productLookup?.pieceRate?.kg_per_pail || productLookup?.pieceRate?.weightKg || 0), 3)} kg
                  </span>
                ) : null}
              </div>
            </article>
          ) : (
            <article className={styles.scale}>
              <div className={styles.scaleLabel}>น้ำหนักรวม (สุทธิ)</div>
              <div className={styles.weight}>{formatNumber(scale?.weightKg || 0, 3)}<span className={styles.unit}>kg</span></div>
              <div className={statusClass}>{statusText}</div>
              <div className={styles.agent}>Scale Agent <span className={scale?.agentConnected ? styles.dot : styles.dotOff} />{scale?.portOpen ? "เชื่อมต่อ" : "รอพอร์ต"}</div>
            </article>
          )}
          <div className={styles.productColumn}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>พนักงานปัจจุบัน</h2>
              <div className={styles.employeeBody}>
                <div
                  onClick={() => employeeImage && setPreviewPhoto({
                    src: employeeImage,
                    title: `${employee?.name || "พนักงาน"} (รหัส: ${employee?.employeeCode || "-"})`
                  })}
                  title={employeeImage ? "คลิกเพื่อขยายรูป" : undefined}
                  className={styles.employeePhoto}
                  style={employeeImage ? { cursor: "pointer" } : undefined}
                >
                  {employeeImage ? <Image src={employeeImage} alt={employee?.name || "พนักงาน"} width={210} height={190} unoptimized /> : <UserRound size={86} />}
                </div>
                <div><div className={styles.label}>รหัสพนักงาน</div><div className={styles.value}>{employee?.employeeCode || "รอสแกนพนักงาน"}</div><div className={styles.label}>ชื่อ-สกุล</div><div className={styles.value}>{employee?.name || "-"}</div><div className={styles.label}>แผนก</div><div className={styles.value}>{employee?.departmentName || "-"}</div></div>
              </div>
            </article>
            {onOpenEmployeePicker ? (
              <button type="button" className={styles.changeProductButton} onClick={onOpenEmployeePicker}>
                <UserRound />เลือกพนักงาน
              </button>
            ) : null}
          </div>
        </div>
        <div className={styles.saveBar}><button type="button" className={styles.saveButton} onClick={onSave} disabled={!canSubmit || isSubmitting}>{isSubmitting ? "กำลังบันทึก..." : "▣  บันทึกและพิมพ์"}</button></div>
        {submitError ? <div className={styles.error}>{submitError}</div> : null}
      </section>
      <div className={styles.deviceStrip}><strong>สถานะอุปกรณ์:</strong><span><i className={scale?.agentConnected ? styles.dot : styles.dotOff} />เครื่องชั่ง {scale?.agentConnected ? "เชื่อมต่อ" : "ออฟไลน์"}</span><span><i className={printerReady ? styles.dot : styles.dotOff} />เครื่องพิมพ์ {printerReady ? "พร้อมใช้งาน" : "ออฟไลน์"}</span><span><i className={styles.dot} />เครื่องสแกน พร้อมใช้งาน</span><span><i className={isOnline ? styles.dot : styles.dotOff} />เครือข่าย {isOnline ? "เชื่อมต่อ" : "ออฟไลน์"}</span></div>
      <section className={styles.tableWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #d5dee9", padding: "8px 12px", background: "#f8fafc" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0, color: "#1e293b" }}>
            {activeTab === "latest" ? "บันทึกล่าสุด 20 รายการ" : "สรุปตามกลุ่มพนักงาน (วันนี้)"}
          </h2>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("latest")}
              style={{
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: "bold",
                border: "1px solid",
                borderColor: activeTab === "latest" ? "#102C57" : "#cbd5e1",
                backgroundColor: activeTab === "latest" ? "#102C57" : "#ffffff",
                color: activeTab === "latest" ? "#ffffff" : "#475569",
                borderRadius: "2px",
                cursor: "pointer"
              }}
            >
              ตารางบันทึก
            </button>
            <button
              type="button"
              onClick={() => setIsSummaryModalOpen(true)}
              style={{
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: "bold",
                border: "1px solid #d4af37",
                backgroundColor: "#fefce8",
                color: "#854d0e",
                borderRadius: "2px",
                cursor: "pointer"
              }}
              title="เปิดสรุปผลรายคนประจำวันนี้แบบเต็มหน้าจอ"
            >
              สรุปรายคน (วันนี้)
            </button>
          </div>
        </div>

        {activeTab === "summary" ? (
          loadingToday ? (
            <div style={{ padding: "35px", textAlign: "center", color: "#788aa0", fontSize: "12px", fontWeight: "bold" }}>
              กำลังโหลดข้อมูล...
            </div>
          ) : groupedByEmployee.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(540px, 1fr))", gap: "10px", padding: "12px", maxHeight: "420px", overflowY: "auto" }}>
              {groupedByEmployee.map((emp) => {
                const chronologicalWeights = [...emp.weights].reverse();
                const row1 = Array.from({ length: 12 }, (_, i) => ({
                  slotNo: i + 1,
                  val: chronologicalWeights[i] !== undefined ? chronologicalWeights[i] : null,
                }));
                const row2 = Array.from({ length: 12 }, (_, i) => ({
                  slotNo: i + 13,
                  val: chronologicalWeights[i + 12] !== undefined ? chronologicalWeights[i + 12] : null,
                }));
                const totalWeight = emp.weights.reduce((sum, w) => sum + (Number(w) || 0), 0);

                return (
                  <div
                    key={emp.employeeCode}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      border: "1px solid #ced9e7",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      backgroundColor: "#ffffff",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    }}
                  >
                    {/* Left part: Employee info */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "210px", flexShrink: 0, borderRight: "1px solid #edf2f7", paddingRight: "10px" }}>
                      <div
                        onClick={() => setPreviewPhoto({
                          src: `/api/employees/photos/${encodeURIComponent(emp.employeeCode)}`,
                          title: `${emp.employeeName} (รหัส: ${emp.employeeCode})`
                        })}
                        title="คลิกเพื่อขยายรูป"
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "50%",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#edf1f6",
                          flexShrink: 0,
                          border: "2px solid #ca8a04",
                          cursor: "pointer",
                        }}
                      >
                        <EmployeeAvatar employeeCode={emp.employeeCode} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: "900",
                            fontSize: "13px",
                            color: "#102C57",
                            lineHeight: "1.2",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={emp.employeeName}
                        >
                          {emp.employeeName}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginTop: "1px" }}>
                          รหัส: {emp.employeeCode}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                          <span style={{ fontSize: "10px", color: "#ffffff", backgroundColor: "#102C57", fontWeight: "900", padding: "1px 6px", borderRadius: "4px" }}>
                            {emp.totalCount} รายการ
                          </span>
                          <span style={{ fontSize: "11px", color: "#0f2747", fontWeight: "900" }}>
                            {formatNumber(totalWeight, 3)} กก.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right part: 2-Row Matrix (12 on Row 1, 12 on Row 2) */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "3px" }}>
                        {row1.map(({ slotNo, val }) => (
                          <div
                            key={slotNo}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "36px",
                              borderRadius: "4px",
                              border: val !== null ? "1px solid #cbd5e1" : "1px dashed #e2e8f0",
                              backgroundColor: val !== null ? "#f8fafc" : "transparent",
                              textAlign: "center",
                            }}
                          >
                            <span style={{ fontSize: "7.5px", color: val !== null ? "#94a3b8" : "#cbd5e1", fontWeight: "bold", lineHeight: "1" }}>{slotNo}</span>
                            <span style={{ fontSize: "9.5px", color: val !== null ? "#102C57" : "transparent", fontWeight: "900", lineHeight: "1", marginTop: "2px" }}>
                              {val !== null ? formatNumber(val, 2) : "-"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "3px" }}>
                        {row2.map(({ slotNo, val }) => (
                          <div
                            key={slotNo}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "36px",
                              borderRadius: "4px",
                              border: val !== null ? "1px solid #cbd5e1" : "1px dashed #e2e8f0",
                              backgroundColor: val !== null ? "#f8fafc" : "transparent",
                              textAlign: "center",
                            }}
                          >
                            <span style={{ fontSize: "7.5px", color: val !== null ? "#94a3b8" : "#cbd5e1", fontWeight: "bold", lineHeight: "1" }}>{slotNo}</span>
                            <span style={{ fontSize: "9.5px", color: val !== null ? "#102C57" : "transparent", fontWeight: "900", lineHeight: "1", marginTop: "2px" }}>
                              {val !== null ? formatNumber(val, 2) : "-"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "35px", textAlign: "center", color: "#788aa0" }}>ยังไม่มีรายการบันทึกของวันนี้</div>
          )
        ) : rows.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: "3%" }}>ลำดับ</th>
                <th style={{ width: "11%" }}>บาร์โค้ด</th>
                <th style={{ width: "10%" }}>LOT</th>
                <th style={{ width: "11%" }}>เวลา</th>
                <th style={{ width: "20%" }}>พนักงาน</th>
                <th style={{ width: "29%" }}>สินค้า</th>
                <th style={{ width: "6%" }}>น้ำหนัก</th>
                <th style={{ width: "4%" }}>จำนวน</th>
                <th style={{ width: "6%" }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || row.docNo || index}>
                  <td>{rows.length - index}</td>
                  <td>{row.docNo || "-"}</td>
                  <td>{row.lotNo || "-"}</td>
                  <td>{formatTime(row.loggedAt)}</td>
                  <td style={{ whiteSpace: "normal", wordBreak: "break-word", textAlign: "left", padding: "4px 6px" }}>
                    <div style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      lineHeight: "1.2",
                      maxHeight: "2.4em"
                    }}>
                      <span style={{ fontWeight: "bold", color: "#0f172a" }}>{row.employeeCode || "-"}</span>
                      {" - "}
                      <span style={{ color: "#334155" }}>{row.employeeName || "-"}</span>
                    </div>
                  </td>
                  <td style={{ whiteSpace: "normal", wordBreak: "break-word", textAlign: "left", padding: "4px 6px" }}>
                    <div className={styles.productCell}>
                      {row.imageUrl ? (
                        <Image className={styles.thumb} src={row.imageUrl} alt="" width={30} height={30} unoptimized />
                      ) : (
                        <Package className={styles.thumb} />
                      )}
                      <div style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: "1.2",
                        maxHeight: "2.4em",
                        flex: 1
                      }}>
                        <span style={{ fontWeight: "bold", color: "#0f172a" }}>{row.productGoodsCode || row.productCode || "-"}</span>
                        {" - "}
                        <span style={{ color: "#334155" }}>{row.productName || "-"}</span>
                      </div>
                    </div>
                  </td>
                  <td>{formatNumber(row.normalizedKgAmount ?? row.inputValue, 3)}</td>
                  <td>{formatNumber(row.countValue, 0)}</td>
                  <td style={{ backgroundColor: "#15803d", textAlign: "center", verticalAlign: "middle" }}>
                    <span className={`${styles.syncBadge} ${
                      row.syncStatus === "failed"
                        ? styles.syncFailed
                        : row.syncStatus === "pending"
                          ? styles.syncPending
                          : styles.syncSuccess
                    }`} style={{
                      borderRadius: "0px",
                      ...((row.syncStatus !== "failed" && row.syncStatus !== "pending") ? {
                        backgroundColor: "transparent",
                        color: "#ffffff",
                        borderColor: "transparent"
                      } : {})
                    }}>
                      {row.syncStatus === "failed"
                        ? "ส่งไม่สำเร็จ"
                        : row.syncStatus === "pending"
                          ? "รอส่งเข้าระบบ"
                          : "เข้าระบบแล้ว"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>ยังไม่มีรายการบันทึก</div>
        )}
      </section>
      <PieceRateDeviceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPrinterSaved={(printerName) => setPrinterReady(Boolean(printerName))}
        scale={scale}
      />
      {previewPhoto ? (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(1, 15, 35, 0.85)",
            backdropFilter: "blur(6px)",
            cursor: "zoom-out",
            padding: "20px"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              border: "2px solid #ca8a04",
              borderRadius: "2px",
              backgroundColor: "#ffffff",
              padding: "8px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              style={{
                position: "absolute",
                top: "-40px",
                right: "0px",
                background: "none",
                border: "none",
                color: "#ffffff",
                fontSize: "24px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
              aria-label="ปิด"
            >
              ✕
            </button>
            <div style={{ width: "min(400px, 80vw)", height: "min(400px, 80vw)", backgroundColor: "#edf1f6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: "2px" }}>
              <Image
                src={previewPhoto.src}
                alt={previewPhoto.title}
                width={400}
                height={400}
                unoptimized
                style={{ objectFit: "cover", width: "100%", height: "100%" }}
              />
            </div>
            <div style={{ marginTop: "10px", fontWeight: "bold", fontSize: "14px", color: "#102C57", textAlign: "center" }}>
              {previewPhoto.title}
            </div>
          </div>
        </div>
      ) : null}

      <PieceRateEmployeeSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        todayRows={todayRows}
        onPreviewPhoto={setPreviewPhoto}
      />
    </main>
  );
}
