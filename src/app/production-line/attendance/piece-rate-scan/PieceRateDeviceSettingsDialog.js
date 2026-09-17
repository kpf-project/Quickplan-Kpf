"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer, RefreshCw, Save, Scale, X } from "lucide-react";
import {
  fetchPieceRateScaleHealth,
  fetchPieceRateScalePorts,
  fetchPieceRateScaleSerialConfig,
  savePieceRateScaleSerialConfig,
} from "@/features/attendance/services/pieceRateLocalScaleAgentClient";
import {
  fetchPieceRatePrinters,
  printPieceRateLabelViaAgent,
  savePieceRatePrinterSelection,
} from "@/features/production-line/services/localPrintAgentClient";
import { buildPieceRateDesktopLabel } from "@/lib/piece-rate-desktop-label";
import styles from "./PieceRateDesktopWorkstation.module.css";

const DEFAULT_SERIAL = { path: "", baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 };

export default function PieceRateDeviceSettingsDialog({ open, onClose, onPrinterSaved, scale }) {
  const [serial, setSerial] = useState(DEFAULT_SERIAL);
  const [ports, setPorts] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [printerName, setPrinterName] = useState("");
  const [scaleOnline, setScaleOnline] = useState(false);
  const [printOnline, setPrintOnline] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadScale = useCallback(async (options = {}) => {
    setBusy("scale-load");
    if (!options.skipMessageClear) {
      setMessage("");
    }
    try {
      const [health, portData, config] = await Promise.all([
        fetchPieceRateScaleHealth(), fetchPieceRateScalePorts(), fetchPieceRateScaleSerialConfig(),
      ]);
      setScaleOnline(Boolean(health?.ok));
      setPorts(portData?.ports || []);
      setSerial({ ...DEFAULT_SERIAL, ...(config?.config || config || {}) });
    } catch (error) {
      setScaleOnline(false); setMessage(error?.message || "ไม่พบ Piece Rate Scale Agent");
    } finally { setBusy(""); }
  }, []);

  const loadPrinters = useCallback(async (options = {}) => {
    setBusy("printer-load");
    if (!options.skipMessageClear) {
      setMessage("");
    }
    try {
      const data = await fetchPieceRatePrinters();
      setPrinters(data?.printers || []);
      setPrinterName(data?.selectedPrinterName || "");
      setPrintOnline(true);
    } catch (error) {
      setPrintOnline(false); setMessage(error?.message || "ไม่พบ Local Print Agent");
    } finally { setBusy(""); }
  }, []);

  useEffect(() => {
    if (!open) return;
    void Promise.all([loadScale(), loadPrinters()]);
  }, [loadPrinters, loadScale, open]);

  if (!open) return null;

  const saveScale = async () => {
    setBusy("scale-save"); setMessage("");
    try {
      await savePieceRateScaleSerialConfig(serial);
      await loadScale({ skipMessageClear: true });
      setMessage("บันทึกการตั้งค่าเครื่องชั่งแล้ว");
    }
    catch (error) { setMessage(error?.message || "บันทึกเครื่องชั่งไม่สำเร็จ"); }
    finally { setBusy(""); }
  };
  const savePrinter = async () => {
    setBusy("printer-save"); setMessage("");
    try {
      await savePieceRatePrinterSelection({ printerName });
      setPrintOnline(true);
      onPrinterSaved?.(printerName);
      await loadPrinters({ skipMessageClear: true });
      setMessage("บันทึกเครื่องพิมพ์ใบคิดค่าแรงแล้ว");
    }
    catch (error) { setMessage(error?.message || "บันทึกเครื่องพิมพ์ไม่สำเร็จ"); }
    finally { setBusy(""); }
  };
  const testPrint = async () => {
    setBusy("printer-test"); setMessage("");
    try {
      await printPieceRateLabelViaAgent({ ...buildPieceRateDesktopLabel({
        docNo: `TEST${Date.now()}`,
        productCode: "TEST-PIECE-RATE",
        productName: "ทดสอบเครื่องพิมพ์ใบคิดค่าแรง",
        employeeCode: "TEST",
        employeeName: "ทดสอบระบบ",
        weightKg: 1.234,
        countValue: 1,
        wageAmount: 0,
      }), printerNameOverride: printerName });
      setMessage("ส่งฉลากทดสอบไปยังเครื่องพิมพ์แล้ว");
    } catch (error) { setMessage(error?.message || "ทดสอบพิมพ์ไม่สำเร็จ"); }
    finally { setBusy(""); }
  };

  const scaleBusy = busy === "scale-load" || busy === "scale-save";
  const printerBusy = busy === "printer-load" || busy === "printer-save" || busy === "printer-test";

  return (
    <div className={styles.settingsBackdrop} role="presentation">
      <section className={styles.settingsDialog} role="dialog" aria-modal="true" aria-labelledby="piece-rate-settings-title">
        <header className={styles.settingsHeader}>
          <div><span>DEVICE CONTROL</span><h2 id="piece-rate-settings-title">ตั้งค่าจุดบันทึกเนื้อขนมป้ายแยม</h2></div>
          <button type="button" onClick={onClose} aria-label="ปิด"><X /></button>
        </header>
        <div className={styles.settingsGrid}>
          <article className={styles.settingsPanel}>
            <div className={styles.settingsPanelTitle}><Scale /><div><h3>เครื่องชั่ง</h3><p>โปรไฟล์ Piece Rate · Port 41953</p></div><b className={scaleOnline ? styles.statusGood : styles.statusBad}>{scaleOnline ? "AGENT ONLINE" : "AGENT OFFLINE"}</b></div>
            <label>พอร์ต COM<select value={serial.path} onChange={(event) => setSerial((value) => ({ ...value, path: event.target.value }))}><option value="">เลือกพอร์ต COM</option>{ports.map((port) => <option key={port.path} value={port.path}>{port.path}{port.friendlyName ? ` · ${port.friendlyName}` : ""}</option>)}</select></label>
            <div className={styles.serialGrid}>
              <label>Baud rate<select value={serial.baudRate} onChange={(event) => setSerial((value) => ({ ...value, baudRate: Number(event.target.value) }))}>{[9600,19200,38400,57600,115200].map((value)=><option key={value}>{value}</option>)}</select></label>
              <label>Data bits<select value={serial.dataBits} onChange={(event) => setSerial((value) => ({ ...value, dataBits: Number(event.target.value) }))}>{[7,8].map((value)=><option key={value}>{value}</option>)}</select></label>
              <label>Parity<select value={serial.parity} onChange={(event) => setSerial((value) => ({ ...value, parity: event.target.value }))}>{["none","even","odd"].map((value)=><option key={value}>{value}</option>)}</select></label>
              <label>Stop bits<select value={serial.stopBits} onChange={(event) => setSerial((value) => ({ ...value, stopBits: Number(event.target.value) }))}>{[1,1.5,2].map((value)=><option key={value}>{value}</option>)}</select></label>
            </div>
            <div className={styles.scaleTest}><span>น้ำหนักทดสอบ Realtime</span><strong>{Number(scale?.weightKg || 0).toFixed(3)} <small>kg</small></strong><div><i className={scale?.agentConnected ? styles.dot : styles.dotOff} />Agent {scale?.agentConnected ? "เชื่อมต่อ" : "ออฟไลน์"} · พอร์ต {scale?.portOpen ? "เปิด" : "ปิด"} · {scale?.isStable ? "STABLE" : "LIVE"}</div></div>
            <div className={styles.settingsActions}><button type="button" onClick={() => loadScale()} disabled={scaleBusy}><RefreshCw />รีเฟรชพอร์ต</button><button type="button" className={styles.primaryAction} onClick={saveScale} disabled={!serial.path || scaleBusy}>{busy === "scale-save" ? <Loader2 className="animate-spin" /> : <Save />}บันทึกเครื่องชั่ง</button></div>
          </article>
          <article className={styles.settingsPanel}>
            <div className={styles.settingsPanelTitle}><Printer /><div><h3>เครื่องพิมพ์ใบคิดค่าแรง</h3><p>โปรไฟล์แยกจาก Weight Scale</p></div><b className={printOnline ? styles.statusGood : styles.statusBad}>{printOnline ? "AGENT ONLINE" : "AGENT OFFLINE"}</b></div>
            <label>เครื่องพิมพ์ Windows<select value={printerName} onChange={(event) => setPrinterName(event.target.value)}><option value="">เลือกเครื่องพิมพ์</option>{printers.map((printer)=><option key={printer.name} value={printer.name}>{printer.name}{printer.isDefault ? " · Default" : ""}{printer.isOffline ? " · Offline" : ""}</option>)}</select></label>
            <div className={styles.paperPreview}><div><span>80</span> mm</div><strong>ใบคิดค่าแรง<br />CODE 128</strong><div><span>50</span> mm</div></div>
            <div className={styles.settingsActions}><button type="button" onClick={() => loadPrinters()} disabled={printerBusy}><RefreshCw />รีเฟรชรายชื่อ</button><button type="button" onClick={testPrint} disabled={!printerName || printerBusy}><Printer />ทดสอบพิมพ์</button><button type="button" className={styles.primaryAction} onClick={savePrinter} disabled={!printerName || printerBusy}><Save />บันทึกเครื่องพิมพ์</button></div>
          </article>
        </div>
        {message ? <footer className={styles.settingsMessage}>{message}</footer> : null}
      </section>
    </div>
  );
}
