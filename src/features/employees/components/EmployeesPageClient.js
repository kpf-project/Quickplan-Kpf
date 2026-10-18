"use client";

import { useMemo, useState } from "react";
import NextImage from "next/image";
import Barcode from "react-barcode";
import QRCode from "react-qr-code";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { Camera, FileSpreadsheet, FileText, Download, Loader2, Search, Trash2, UserRound } from "lucide-react";
import { createRoot } from "react-dom/client";
import PermissionGate from "@/components/PermissionGate";
import { useEmployeesPage } from "@/features/employees/hooks/useEmployeesPage";

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "-";
}

function toEmployeeView(row) {
  const employeeCode = String(row?.PRS_NO ?? row?.EMP_INTL ?? "").trim();
  const firstName = String(row?.EMP_NAME ?? "").trim();
  const lastName = String(row?.EMP_SURNME ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || String(row?.Name ?? "-");
  const department = firstText(
    row?.DEPT_THAIDESC,
    row?.departmentName,
    row?.department_name,
    row?.department,
    row?.DEPTNAME
  );
  const branch = firstText(row?.BR_THAIDESC, row?.branchName, row?.branch_name, row?.branch);

  // Use EMP_KEY as the primary unique ID if available, otherwise fallback to combinations
  const uniqueId = row?.EMP_KEY ? String(row.EMP_KEY) : String(row?.EMP_INTL || row?.PRS_NO || fullName);

  return {
    id: uniqueId,
    employeeCode: employeeCode || "-",
    fullName: fullName || "-",
    department,
    branch,
    barcodeValue: employeeCode || "",
    imageUrl: String(row?.imageUrl || row?.photoUrl || "").trim(),
  };
}

function compressEmployeePhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const size = 360;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("ไม่สามารถเตรียมรูปได้"));
        return;
      }
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      context.fillStyle = "#eef2f7";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/webp", 0.78));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("ไฟล์รูปไม่ถูกต้อง"));
    };
    image.src = objectUrl;
  });
}

function sanitizeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function waitForRender() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function renderCodeSvgMarkup({ type, value }) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = createRoot(container);
  const node = type === "qr"
    ? <QRCode value={value} size={512} />
    : (
      <Barcode
        value={value}
        width={2}
        height={100}
        displayValue={false}
        background="transparent"
        margin={0}
      />
    );

  try {
    root.render(node);
    await waitForRender();
    const svg = container.querySelector("svg");
    if (!svg) {
      throw new Error("Failed to render code image");
    }
    return new XMLSerializer().serializeToString(svg);
  } finally {
    root.unmount();
    container.remove();
  }
}

function svgMarkupToPngBlob(svgMarkup) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      const width = Math.max(1, img.width);
      const height = Math.max(1, img.height);
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to create canvas context"));
        return;
      }
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to generate PNG"));
          return;
        }
        resolve(blob);
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to load SVG image"));
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgMarkup)))}`;
  });
}

function EmployeesPageContent() {
  const {
    employees,
    filterText,
    setFilterText,
    statusFilter,
    setStatusFilter,
    departmentFilter,
    setDepartmentFilter,
    departments,
    pagination,
    loading,
    errorMessage,
    supabaseReady,
    loadEmployees,
    canGoNext,
    canGoBack,
  } = useEmployeesPage();

  const rows = useMemo(() => employees.map(toEmployeeView), [employees]);
  const [bulkCodeType, setBulkCodeType] = useState("qr");
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [savingPhotoCode, setSavingPhotoCode] = useState("");
  const [photoVersions, setPhotoVersions] = useState({});

  const saveEmployeePhoto = async (employeeCode, file) => {
    if (!file) return;
    setSavingPhotoCode(employeeCode);
    try {
      const imageData = await compressEmployeePhoto(file);
      const response = await fetch(`/api/employees/photos/${encodeURIComponent(employeeCode)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "บันทึกรูปไม่สำเร็จ");
      setPhotoVersions((current) => ({ ...current, [employeeCode]: Date.now() }));
      await loadEmployees(0);
    } catch (error) {
      window.alert(error?.message || "บันทึกรูปไม่สำเร็จ");
    } finally {
      setSavingPhotoCode("");
    }
  };

  const removeEmployeePhoto = async (employeeCode) => {
    if (!window.confirm("ยืนยันลบรูปพนักงานคนนี้?")) return;
    setSavingPhotoCode(employeeCode);
    try {
      const response = await fetch(`/api/employees/photos/${encodeURIComponent(employeeCode)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "ลบรูปไม่สำเร็จ");
      await loadEmployees(0);
    } catch (error) {
      window.alert(error?.message || "ลบรูปไม่สำเร็จ");
    } finally {
      setSavingPhotoCode("");
    }
  };
  const selectedDepartmentLabel = useMemo(() => {
    const selected = departments.find((dept) => String(dept?.id ?? "").trim() === departmentFilter);
    if (!selected) {
      return "";
    }
    const code = String(selected?.external_code ?? "").trim();
    const name = String(selected?.name ?? "").trim();
    return code && code !== name ? `${code}-${name}` : (name || code || departmentFilter);
  }, [departments, departmentFilter]);

  const downloadSVGAsPNG = (id, filename, type = "qr") => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      const scale = type === "qr" ? 1024 / svg.clientWidth : 2048 / svg.clientWidth;
      canvas.width = svg.clientWidth * scale;
      canvas.height = svg.clientHeight * scale;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${filename}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const fetchAllEmployees = async ({ departmentId = "" } = {}) => {
    const allRows = [];
    let page = 1;
    let currentCursor = "";
    let hasMore = true;

    console.log(`Starting fetchAllEmployees: status=${statusFilter}, dept=${departmentId}, search=${filterText}`);

    while (hasMore) {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "200", // Fetch in large chunks
        status: statusFilter,
      });
      if (departmentId) {
        params.set("department", departmentId);
      }
      if (filterText) {
        params.set("search", filterText);
      }
      if (currentCursor) {
        params.set("cursor", currentCursor);
      }

      console.log(`Fetching page ${page} with cursor: ${currentCursor || "none"}`);
      
      const response = await fetch(`/api/employees?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        console.error("Fetch error:", payload);
        throw new Error(payload?.error || "Failed to load employees");
      }

      const newData = payload?.data ?? [];
      allRows.push(...newData);
      
      currentCursor = payload?.cursor?.next || "";
      hasMore = Boolean(payload?.cursor?.hasMore && currentCursor);
      
      console.log(`Page ${page} loaded ${newData.length} rows. Total so far: ${allRows.length}. HasMore: ${hasMore}`);

      page += 1;
      
      // Safety break to prevent infinite loops (max 50 pages * 200 = 10,000 records)
      if (page > 50) {
        console.warn("Safety break triggered: reached page 50");
        break;
      }
    }

    console.log(`Fetch complete. Total raw rows: ${allRows.length}`);
    
    // Final de-duplication pass on the client side using unique employee view id
    const employeeMap = new Map();
    allRows.forEach(row => {
      const view = toEmployeeView(row);
      if (!employeeMap.has(view.id)) {
        employeeMap.set(view.id, view);
      }
    });

    const finalRows = Array.from(employeeMap.values());
    console.log(`Final de-duplicated rows: ${finalRows.length}`);
    
    return finalRows;
  };

  const exportToExcel = async () => {
    setBulkDownloading(true);
    try {
      const allData = await fetchAllEmployees({ departmentId: departmentFilter });
      if (!allData.length) {
        window.alert("ไม่พบข้อมูลสำหรับส่งออก");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Employees");

      worksheet.columns = [
        { header: "รหัส", key: "employeeCode", width: 15 },
        { header: "ชื่อ-นามสกุล", key: "fullName", width: 35 },
        { header: "แผนก", key: "department", width: 30 },
        { header: "สาขา", key: "branch", width: 25 },
      ];

      // Styling header
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF102C57" },
      };
      worksheet.getRow(1).font = { color: { argb: "FFFFFFFF" }, bold: true };

      allData.forEach((row) => {
        worksheet.addRow({
          employeeCode: row.employeeCode,
          fullName: row.fullName,
          department: row.department,
          branch: row.branch,
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Employees_${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(`ดาวน์โหลด Excel ไม่สำเร็จ: ${error.message}`);
    } finally {
      setBulkDownloading(false);
    }
  };

  const exportToCSV = async () => {
    setBulkDownloading(true);
    try {
      const allData = await fetchAllEmployees({ departmentId: departmentFilter });
      if (!allData.length) {
        window.alert("ไม่พบข้อมูลสำหรับส่งออก");
        return;
      }

      const headers = ["รหัส", "ชื่อ-นามสกุล", "แผนก", "สาขา"];
      const rows = allData.map(row => [
        `"${row.employeeCode}"`,
        `"${row.fullName}"`,
        `"${row.department}"`,
        `"${row.branch}"`
      ]);
      
      const csvContent = "\ufeff" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Employees_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(`ดาวน์โหลด CSV ไม่สำเร็จ: ${error.message}`);
    } finally {
      setBulkDownloading(false);
    }
  };

  const downloadDepartmentCodes = async () => {
    setBulkDownloading(true);
    try {
      const employeeRows = await fetchAllEmployees({ departmentId: departmentFilter });
      if (!employeeRows.length) {
        window.alert(departmentFilter ? "ไม่พบข้อมูลพนักงานในแผนกที่เลือก" : "ไม่พบข้อมูลพนักงาน");
        return;
      }

      const zip = new JSZip();
      const typePrefix = bulkCodeType === "qr" ? "QRCode" : "Barcode";
      const today = new Date().toISOString().slice(0, 10);
      const zipName = sanitizeFileName(
        departmentFilter
          ? `${typePrefix}_${selectedDepartmentLabel || departmentFilter}_${today}`
          : `${typePrefix}_All_Departments_${today}`
      );
      const folderByDepartment = new Map();

      for (const row of employeeRows) {
        const codeValue = String(row.barcodeValue || "").trim();
        if (!codeValue) {
          continue;
        }
        const departmentName = row.department && row.department !== "-" ? row.department : "ไม่ระบุแผนก";
        const folderName = departmentFilter
          ? zipName
          : sanitizeFileName(departmentName) || "Unknown_Department";
        let folder = folderByDepartment.get(folderName);
        if (!folder) {
          folder = zip.folder(folderName) || zip;
          folderByDepartment.set(folderName, folder);
        }
        const svgMarkup = await renderCodeSvgMarkup({ type: bulkCodeType, value: codeValue });
        const pngBlob = await svgMarkupToPngBlob(svgMarkup);
        const safeCode = sanitizeFileName(codeValue);
        folder.file(`${typePrefix}_${safeCode}.png`, pngBlob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadLink = document.createElement("a");
      const blobUrl = URL.createObjectURL(zipBlob);
      downloadLink.href = blobUrl;
      downloadLink.download = `${zipName}.zip`;
      downloadLink.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      window.alert(
        departmentFilter
          ? `ดาวน์โหลดสำเร็จ ${employeeRows.length} รายการ`
          : `ดาวน์โหลดสำเร็จ ${employeeRows.length} รายการ แยก ${folderByDepartment.size} แผนก`
      );
    } catch (error) {
      window.alert(`ดาวน์โหลดไม่สำเร็จ: ${error?.message || "Unknown error"}`);
    } finally {
      setBulkDownloading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#f8f9fb] text-[#102C57]">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[98%] mx-auto py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase">HR Console</h6>
                <h1 className="text-xl md:text-2xl font-bold">Employee Card Registry</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-bold tracking-wider">
                  TOTAL {pagination.totalRecords.toLocaleString()}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider ${
                  supabaseReady ? "bg-emerald-400/20 text-emerald-200 border border-emerald-300/30" : "bg-red-400/20 text-red-200 border border-red-300/30"
                }`}>
                  SUPABASE {supabaseReady ? "READY" : "MISSING"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:flex lg:flex-row items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10 w-full">
              <div className="relative col-span-2 lg:w-72">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40">
                  <Search size={14} />
                </div>
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadEmployees(1)}
                  placeholder="ค้นหารหัส / ชื่อ / แผนก"
                  className="w-full h-9 pl-8 pr-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/40 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="col-span-1 h-9 rounded-lg bg-black/20 border border-white/10 text-white text-[10px] px-2 outline-none w-full lg:w-36 [&>option]:text-black"
              >
                <option value="active">พนักงานปัจจุบัน</option>
                <option value="resigned">พนักงานลาออก</option>
                <option value="all">พนักงานทั้งหมด</option>
              </select>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="col-span-1 h-9 rounded-lg bg-black/20 border border-white/10 text-white text-[10px] px-2 outline-none w-full lg:w-48 [&>option]:text-black"
              >
                <option value="">ทุกแผนก</option>
                {departments.map((dept) => {
                  const id = String(dept?.id ?? "").trim();
                  const code = String(dept?.external_code ?? "").trim();
                  const name = String(dept?.name ?? "").trim();
                  const label = code && code !== name ? `${code} - ${name}` : (name || code || id);
                  return (
                    <option key={id || label} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>

              <select
                value={bulkCodeType}
                onChange={(e) => setBulkCodeType(e.target.value)}
                className="col-span-1 h-9 rounded-lg bg-black/20 border border-white/10 text-white text-[10px] px-2 outline-none w-full lg:w-36 [&>option]:text-black"
              >
                <option value="qr">ดาวน์โหลด QRCode</option>
                <option value="barcode">ดาวน์โหลด Barcode</option>
              </select>

              <button
                type="button"
                onClick={downloadDepartmentCodes}
                disabled={bulkDownloading || loading}
                className="col-span-1 h-9 px-3 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="ดาวน์โหลด QR/Barcode ทั้งหมด (ไฟล์ ZIP)"
              >
                <Download size={14} />
                <span className="hidden xl:inline">
                  {bulkDownloading ? "กำลังจัดไฟล์..." : (departmentFilter ? "โหลดทั้งแผนก" : "โหลดทุกแผนก")}
                </span>
                <span className="xl:hidden">โหลด ZIP</span>
              </button>

              <div className="col-span-2 lg:flex gap-1.5 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={exportToExcel}
                  disabled={bulkDownloading || loading}
                  className="flex-1 lg:flex-none h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="ส่งออกไฟล์ Excel"
                >
                  <FileSpreadsheet size={14} />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  onClick={exportToCSV}
                  disabled={bulkDownloading || loading}
                  className="flex-1 lg:flex-none h-9 px-3 bg-slate-600 hover:bg-slate-700 text-white text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="ส่งออกไฟล์ CSV"
                >
                  <FileText size={14} />
                  <span>CSV</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => loadEmployees(0)}
                disabled={loading}
                className="col-span-2 lg:col-span-1 h-9 px-6 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? "..." : <Search size={16} />}
                <span>ค้นหา</span>
              </button>

              <div className="col-span-2 lg:col-span-1 lg:ml-auto flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20">
                <button
                  type="button"
                  onClick={() => loadEmployees(pagination.page - 1)}
                  disabled={!canGoBack || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                >
                  ก่อนหน้า
                </button>
                <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide min-w-[80px] text-center">
                  หน้า {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => loadEmployees(pagination.page + 1)}
                  disabled={!canGoNext || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-[98%] mx-auto w-full px-0 pb-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-4">
          {errorMessage ? (
            <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left border-collapse">
              <thead className="bg-[var(--surface-navy,#102C57)] text-white sticky top-0 z-20 shadow-md">
                <tr>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] text-center w-[130px]">รูปพนักงาน</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] w-[140px]">รหัส</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a]">ชื่อ-นามสกุล</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] w-[260px]">แผนก</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] w-[220px]">สาขา</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] text-center w-[220px]">Barcode</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] text-center w-[140px]">QRCode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map((row, idx) => {
                    const safeCode = row.employeeCode === "-" ? `row-${idx}` : row.employeeCode;
                    const barcodeId = `emp-bc-${safeCode}-${idx}`;
                    const qrId = `emp-qr-${safeCode}-${idx}`;

                    return (
                      <tr key={`${row.id}-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                              {row.imageUrl ? <NextImage src={`${row.imageUrl}?v=${photoVersions[row.employeeCode] || 0}`} alt={row.fullName} fill sizes="56px" className="object-cover" unoptimized /> : <UserRound size={28} />}
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="grid h-7 w-8 cursor-pointer place-items-center rounded border border-[#d4af37] text-[#102C57] hover:bg-[#fff8df]" title={row.imageUrl ? "เปลี่ยนรูป" : "เพิ่มรูป"}>
                                {savingPhotoCode === row.employeeCode ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={Boolean(savingPhotoCode)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void saveEmployeePhoto(row.employeeCode, file); }} />
                              </label>
                              {row.imageUrl ? <button type="button" onClick={() => void removeEmployeePhoto(row.employeeCode)} disabled={Boolean(savingPhotoCode)} className="grid h-7 w-8 place-items-center rounded border border-red-200 text-red-600 hover:bg-red-50" title="ลบรูป"><Trash2 size={13} /></button> : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-semibold text-[#102C57] font-mono">{row.employeeCode}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 font-medium">{row.fullName}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{row.department}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{row.branch}</td>
                        <td className="py-3 px-4">
                          <div className="flex justify-center bg-white p-1 rounded">
                            {row.barcodeValue ? (
                              <div
                                className="cursor-pointer hover:scale-110 transition-transform bg-white p-1 rounded"
                                title="Click to download Barcode"
                                onClick={() => downloadSVGAsPNG(barcodeId, `Barcode_${row.barcodeValue}`, "barcode")}
                              >
                                <Barcode
                                  id={barcodeId}
                                  value={row.barcodeValue}
                                  width={1.2}
                                  height={44}
                                  displayValue={false}
                                  background="transparent"
                                  margin={0}
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-center">
                            {row.barcodeValue ? (
                              <div
                                className="cursor-pointer hover:scale-110 transition-transform rounded bg-white p-1 border border-gray-200"
                                title="Click to download QR Code"
                                onClick={() => downloadSVGAsPNG(qrId, `QRCode_${row.barcodeValue}`, "qr")}
                              >
                                <QRCode id={qrId} value={row.barcodeValue} size={56} />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-sm text-[#6b5e52] border-t border-gray-100 bg-[#fcfaf7]">
            แสดง {rows.length} จาก {pagination.totalRecords.toLocaleString()} รายการ
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmployeesPageClient() {
  return (
    <PermissionGate permissionsAny={["admin-employees", "hr-employees-view", "hr-departments-view"]}>
      <EmployeesPageContent />
    </PermissionGate>
  );
}
