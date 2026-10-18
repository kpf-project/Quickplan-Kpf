"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { importProductionStockOpeningBalancesRequest } from "@/features/production-line/services/productionStockClient";

const TEMPLATE_HEADERS = ["product_code", "lot_no", "quantity", "weight_kg", "remark"];

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function buildTodayInputValue() {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (insideQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === delimiter && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function resolveHeaderMap(headers) {
  return headers.map((header) => {
    const key = normalizeHeaderKey(header);

    if (["product_code", "sku_code", "สินค้า", "รหัสสินค้า"].includes(key)) {
      return "productCode";
    }
    if (["lot_no", "lot", "ล็อต", "lotnumber"].includes(key)) {
      return "lotNo";
    }
    if (["quantity", "qty", "จำนวน"].includes(key)) {
      return "quantity";
    }
    if (["weight_kg", "weight", "น้ำหนัก", "น้ำหนักกก"].includes(key)) {
      return "weightKg";
    }
    if (["remark", "หมายเหตุ", "note"].includes(key)) {
      return "remark";
    }

    return null;
  });
}

function parseOpeningBalanceText(input, productMap) {
  const text = String(input || "").replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { rows: [], errors: ["ยังไม่มีข้อมูลสำหรับ preview"] };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ["ไฟล์ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว"] };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const rawHeaders = parseDelimitedLine(lines[0], delimiter);
  const headerMap = resolveHeaderMap(rawHeaders);
  const requiredFields = ["productCode", "lotNo", "quantity", "weightKg"];
  const missingFields = requiredFields.filter((field) => !headerMap.includes(field));

  if (missingFields.length > 0) {
    return {
      rows: [],
      errors: [`หัวตารางไม่ครบ: ${missingFields.join(", ")}`],
    };
  }

  const rows = [];
  const errors = [];
  const duplicateScopeKeys = new Set();
  const seenScopeKeys = new Set();

  lines.slice(1).forEach((line, lineIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    const draftRow = {
      rowNumber: lineIndex + 2,
      productCode: "",
      productName: "",
      lotNo: "",
      quantity: 0,
      weightKg: 0,
      remark: "",
      errors: [],
    };

    headerMap.forEach((field, index) => {
      if (!field) {
        return;
      }
      draftRow[field] = cells[index] ?? "";
    });

    draftRow.productCode = String(draftRow.productCode || "").trim().toUpperCase();
    draftRow.productName = productMap.get(draftRow.productCode)?.name || "";
    draftRow.lotNo = String(draftRow.lotNo || "").trim().toUpperCase();
    draftRow.remark = String(draftRow.remark || "").trim();

    const quantity = Number.parseFloat(
      String(draftRow.quantity || "").replaceAll(",", "").trim()
    );
    const weightKg = Number.parseFloat(
      String(draftRow.weightKg || "").replaceAll(",", "").trim()
    );

    draftRow.quantity = Number.isFinite(quantity) ? Number(quantity.toFixed(3)) : Number.NaN;
    draftRow.weightKg = Number.isFinite(weightKg) ? Number(weightKg.toFixed(3)) : Number.NaN;

    if (!draftRow.productCode) {
      draftRow.errors.push("รหัสสินค้าไม่ถูกต้อง");
    } else if (!productMap.has(draftRow.productCode)) {
      draftRow.errors.push("สินค้าอยู่นอก scope KP13 / หมวด 03");
    }

    if (!draftRow.lotNo) {
      draftRow.errors.push("LOT ไม่ถูกต้อง");
    }
    if (!Number.isFinite(draftRow.quantity) || draftRow.quantity < 0) {
      draftRow.errors.push("จำนวนต้องเป็นตัวเลขไม่ติดลบ");
    }
    if (!Number.isFinite(draftRow.weightKg) || draftRow.weightKg < 0) {
      draftRow.errors.push("น้ำหนักต้องเป็นตัวเลขไม่ติดลบ");
    }
    if (
      Number.isFinite(draftRow.quantity)
      && Number.isFinite(draftRow.weightKg)
      && draftRow.quantity === 0
      && draftRow.weightKg === 0
    ) {
      draftRow.errors.push("จำนวนหรือน้ำหนักต้องมากกว่า 0");
    }

    const scopeKey = `${draftRow.productCode}::${draftRow.lotNo}`;
    if (seenScopeKeys.has(scopeKey)) {
      duplicateScopeKeys.add(scopeKey);
      draftRow.errors.push("มีรหัสสินค้าและ LOT ซ้ำในไฟล์เดียวกัน");
    }
    seenScopeKeys.add(scopeKey);

    rows.push(draftRow);
  });

  if (duplicateScopeKeys.size > 0) {
    errors.push(
      `พบสินค้าและ LOT ซ้ำในไฟล์เดียวกัน: ${Array.from(duplicateScopeKeys).join(", ")}`
    );
  }

  return { rows, errors };
}

function buildTemplateCsv() {
  const exampleRows = [
    ["WKB-0030", "20260417", "12", "420.50", "ยอดยกมาต้นรอบ"],
    ["WKB-0031", "20260418", "8", "285.00", ""],
  ];

  return `\uFEFF${[TEMPLATE_HEADERS, ...exampleRows]
    .map((row) => row.join(","))
    .join("\r\n")}`;
}

export default function ProductionStockOpeningBalanceImportClient({
  scope,
  recentImportBatches = [],
  latestOpeningBalances = [],
}) {
  const [balanceDate, setBalanceDate] = useState(buildTodayInputValue());
  const [replaceForDate, setReplaceForDate] = useState(false);
  const [rawText, setRawText] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [resultMessage, setResultMessage] = useState(null);
  const [isPending, startTransition] = useTransition();

  const productMap = useMemo(() => {
    const map = new Map();
    (scope?.products || []).forEach((product) => {
      map.set(String(product.code || "").trim().toUpperCase(), {
        name: String(product.name || "").trim(),
      });
    });
    return map;
  }, [scope]);

  const hasPreviewErrors = useMemo(
    () => previewErrors.length > 0 || previewRows.some((row) => row.errors.length > 0),
    [previewErrors, previewRows]
  );

  const previewSummary = useMemo(() => {
    return previewRows.reduce(
      (accumulator, row) => ({
        rowCount: accumulator.rowCount + 1,
        totalQuantity:
          accumulator.totalQuantity + (Number.isFinite(row.quantity) ? row.quantity : 0),
        totalWeightKg:
          accumulator.totalWeightKg + (Number.isFinite(row.weightKg) ? row.weightKg : 0),
      }),
      {
        rowCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      }
    );
  }, [previewRows]);

  const handleDownloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "opening-balance-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handlePreview = () => {
    const parsed = parseOpeningBalanceText(rawText, productMap);
    setPreviewRows(parsed.rows);
    setPreviewErrors(parsed.errors);
    setResultMessage(null);
  };

  const handleReset = () => {
    setRawText("");
    setPreviewRows([]);
    setPreviewErrors([]);
    setResultMessage(null);
    setReplaceForDate(false);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    setRawText(text);
    const parsed = parseOpeningBalanceText(text, productMap);
    setPreviewRows(parsed.rows);
    setPreviewErrors(parsed.errors);
    setResultMessage(null);
    event.target.value = "";
  };

  const handleImport = () => {
    if (!balanceDate) {
      setResultMessage({
        type: "error",
        text: "กรุณาเลือกวันที่ยอดยกมา",
      });
      return;
    }
    if (!previewRows.length) {
      setResultMessage({
        type: "error",
        text: "กรุณา preview ข้อมูลก่อนนำเข้า",
      });
      return;
    }
    if (hasPreviewErrors) {
      setResultMessage({
        type: "error",
        text: "ยังมีข้อมูลไม่ถูกต้องใน preview กรุณาแก้ก่อนนำเข้า",
      });
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          balanceDate,
          replaceForDate,
          rows: previewRows.map((row) => ({
            productCode: row.productCode,
            lotNo: row.lotNo,
            quantity: row.quantity,
            weightKg: row.weightKg,
            remark: row.remark,
          })),
        };

        const imported = await importProductionStockOpeningBalancesRequest(payload);

        setResultMessage({
          type: "success",
          text: `นำเข้ายอดยกมาสำเร็จ ${imported?.summary?.rowCount || 0} รายการ`,
          detail: imported?.importBatchNo || "",
        });
      } catch (error) {
        setResultMessage({
          type: "error",
          text: error instanceof Error ? error.message : "ไม่สามารถนำเข้ายอดยกมาได้",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="border border-[#d7dde5] border-t-2 border-t-[#d4af37] bg-white">
        <div className="border-b border-[#d7dde5] bg-[#fcfbf7] px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
            Opening Balance Import
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#102C57]">
            นำเข้ายอดยกมาเริ่มต้น
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#546274]">
            ใช้สำหรับตั้งต้น stock ของสินค้าในหมวด 03 ที่ผูกกับ KP13 ก่อนเริ่ม cutover
            จริง โดยระบบจะตรวจสอบสินค้าให้อยู่ใน scope เดียวกับหน้าชั่งเสมอ
          </p>
        </div>

        <div className="grid gap-6 px-5 py-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-[#102C57]">
                  วันที่ยอดยกมา
                </span>
                <input
                  type="date"
                  value={balanceDate}
                  onChange={(event) => setBalanceDate(event.target.value)}
                  className="h-12 w-full border border-[#d7dde5] px-3 text-sm font-semibold text-[#102C57] outline-none transition focus:border-[#102C57]"
                />
              </label>

              <div className="space-y-3">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-[#102C57]">
                  วิธีนำเข้า
                </span>
                <label className="flex items-start gap-3 border border-[#d7dde5] px-4 py-3 text-sm text-[#102C57]">
                  <input
                    type="checkbox"
                    checked={replaceForDate}
                    onChange={(event) => setReplaceForDate(event.target.checked)}
                    className="mt-1 h-4 w-4 border-[#102C57] text-[#102C57] focus:ring-[#102C57]"
                  />
                  <span className="leading-6">
                    แทนที่ข้อมูล opening balance ของวันเดียวกันทั้งหมดก่อนนำเข้า
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex h-11 items-center justify-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#0c2141]"
              >
                <Download size={16} />
                ดาวน์โหลด Template
              </button>

              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 border border-[#d7dde5] bg-white px-4 text-sm font-black uppercase tracking-[0.12em] text-[#102C57] transition hover:border-[#102C57]">
                <Upload size={16} />
                อัปโหลด CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handlePreview}
                className="inline-flex h-11 items-center justify-center gap-2 border border-[#d7dde5] bg-[#fff8df] px-4 text-sm font-black uppercase tracking-[0.12em] text-[#7f5d00] transition hover:border-[#d4af37]"
              >
                <FileUp size={16} />
                Preview
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-11 items-center justify-center gap-2 border border-[#d7dde5] bg-white px-4 text-sm font-black uppercase tracking-[0.12em] text-[#546274] transition hover:border-[#102C57] hover:text-[#102C57]"
              >
                <RefreshCw size={16} />
                ล้างข้อมูล
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#102C57]">
                วางข้อมูล CSV หรือ TSV
              </span>
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="product_code,lot_no,quantity,weight_kg,remark"
                className="mt-2 min-h-[220px] w-full border border-[#d7dde5] px-4 py-3 font-mono text-sm leading-6 text-[#102C57] outline-none transition focus:border-[#102C57]"
              />
            </label>
          </div>

          <div className="space-y-4">
            <article className="border border-[#d7dde5] bg-[#fbfcfd] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                ขอบเขตสินค้า
              </p>
              <div className="mt-3 space-y-2 text-sm text-[#102C57]">
                <p>
                  แผนก: <span className="font-semibold">{scope.departmentCode || "-"}</span>
                </p>
                <p>
                  หมวด: <span className="font-semibold">{scope.categoryCode || "-"}</span>
                </p>
                <p>
                  จำนวนสินค้าใน scope:{" "}
                  <span className="font-semibold">{scope.products?.length || 0}</span>
                </p>
              </div>
            </article>

            <article className="border border-[#d7dde5] bg-[#fbfcfd] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                Preview Summary
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="border border-[#d7dde5] bg-white px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                    รายการ
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#102C57]">
                    {formatQuantity(previewSummary.rowCount)}
                  </p>
                </div>
                <div className="border border-[#d7dde5] bg-white px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                    จำนวนรวม
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#102C57]">
                    {formatQuantity(previewSummary.totalQuantity)}
                  </p>
                </div>
                <div className="border border-[#d7dde5] bg-white px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                    น้ำหนักรวม
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#102C57]">
                    {formatWeight(previewSummary.totalWeightKg)}
                  </p>
                </div>
              </div>
            </article>

            {resultMessage ? (
              <article
                className={`border px-4 py-4 ${
                  resultMessage.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  {resultMessage.type === "success" ? (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">{resultMessage.text}</p>
                    {resultMessage.detail ? (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em]">
                        Batch: {resultMessage.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ) : null}

            <button
              type="button"
              onClick={handleImport}
              disabled={isPending || !previewRows.length}
              className="inline-flex h-12 w-full items-center justify-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0c2141] disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              ยืนยันนำเข้ายอดยกมา
            </button>
          </div>
        </div>
      </section>

      {(previewErrors.length > 0 || previewRows.length > 0) && (
        <section className="border border-[#d7dde5] bg-white">
          <div className="border-b border-[#d7dde5] bg-[#fcfbf7] px-5 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
              Preview Rows
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#102C57]">
              ตรวจสอบรายการก่อนบันทึก
            </h2>
          </div>

          {previewErrors.length > 0 ? (
            <div className="border-b border-[#f1d2d2] bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {previewErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className="border-b border-[#d7dde5] text-[12px] font-black uppercase tracking-[0.12em] text-[#102C57]">
                  <th className="px-4 py-3 text-left">แถว</th>
                  <th className="px-4 py-3 text-left">สินค้า</th>
                  <th className="px-4 py-3 text-left">LOT</th>
                  <th className="px-4 py-3 text-right">จำนวน</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbfcfd]">
                {previewRows.map((row) => (
                  <tr
                    key={`${row.rowNumber}-${row.productCode}-${row.lotNo}`}
                    className="border-b border-[#e5ebf1] text-[13px] text-[#102C57] last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.rowNumber}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {row.productCode} - {row.productName || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.lotNo || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {Number.isFinite(row.quantity) ? formatQuantity(row.quantity) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {Number.isFinite(row.weightKg) ? formatWeight(row.weightKg) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.errors.length > 0 ? (
                        <div className="space-y-1 text-xs font-semibold text-rose-700">
                          {row.errors.map((error) => (
                            <p key={error}>{error}</p>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                          <CheckCircle2 size={14} />
                          พร้อมนำเข้า
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="border border-[#d7dde5] bg-white">
          <div className="border-b border-[#d7dde5] bg-[#fcfbf7] px-5 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
              Recent Batches
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#102C57]">
              รอบนำเข้าล่าสุด
            </h2>
          </div>

          <div className="overflow-hidden">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className="border-b border-[#d7dde5] text-[12px] font-black uppercase tracking-[0.12em] text-[#102C57]">
                  <th className="px-4 py-3 text-left">วันที่</th>
                  <th className="px-4 py-3 text-right">รายการ</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbfcfd]">
                {recentImportBatches.length ? (
                  recentImportBatches.map((batch) => (
                    <tr
                      key={batch.importBatchNo}
                      className="border-b border-[#e5ebf1] text-[13px] text-[#102C57] last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold">{batch.balanceDate || "-"}</p>
                        <p className="mt-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#7d8795]">
                          {batch.importBatchNo}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                        {formatQuantity(batch.rowCount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                        {formatWeight(batch.totalWeightKg)} Kg
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-[#546274]">
                      ยังไม่พบประวัติการนำเข้ายอดยกมา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="border border-[#d7dde5] bg-white">
          <div className="border-b border-[#d7dde5] bg-[#fcfbf7] px-5 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
              Latest Opening Rows
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#102C57]">
              ยอดยกมาล่าสุดในระบบ
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-white">
                <tr className="border-b border-[#d7dde5] text-[12px] font-black uppercase tracking-[0.12em] text-[#102C57]">
                  <th className="px-4 py-3 text-left">วันที่</th>
                  <th className="px-4 py-3 text-left">สินค้า</th>
                  <th className="px-4 py-3 text-left">LOT</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbfcfd]">
                {latestOpeningBalances.length ? (
                  latestOpeningBalances.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#e5ebf1] text-[13px] text-[#102C57] last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        {row.balanceDate || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        {row.productCode} - {row.productName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.lotNo || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                        {formatWeight(row.weightKg)} Kg
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-[#546274]">
                      ยังไม่พบ opening balance ในระบบ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
