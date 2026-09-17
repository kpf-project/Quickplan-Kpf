import {
  getJamReportDateForRequisitionDate,
  isSundayIsoDate,
} from "./production-input-output-dates.js";

export const JAM_GOODS_CODES = Object.freeze(["M04-0088", "M04-0126-1"]);

const JAM_CODE_SET = new Set(JAM_GOODS_CODES);
const JAM_REQUISITION_REF_PATTERN = /^X\d{4}\/\d{4}$/;
const JAM_RETURN_REMARK_REF_PATTERN = /อ้างถึงใบเบิก#(X\d{4}\/\d{4})(?=:)/i;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

export function isProductionJamRequisitionRef(value) {
  return JAM_REQUISITION_REF_PATTERN.test(normalizeCode(value));
}

export function isProductionJamPlanForReportDate(row, reportDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(reportDate));
  if (!match) return false;

  const [, year, month, day] = match;
  const plannedDate = `${day}/${month}/${Number(year) + 543}`;
  const remark = normalizeText(row?.DI_REMARK);

  return remark.includes("ป้ายแยม")
    && remark.includes("แผนการผลิต")
    && remark.includes(plannedDate)
    && !remark.includes("เรือนจำ");
}

export function isActiveErpDocument(row) {
  const value = row?.DI_ACTIVE;
  return value === undefined || value === null || value === "" || Number(value) === 0;
}

export function getReferencedJamIssueRef(row) {
  const structuredCandidates = [
    row?.TRD_REFER_REF,
    row?.TRH_REFER_IREF,
    row?.TRH_REFER_XREF,
  ];
  for (const candidate of structuredCandidates) {
    const normalized = normalizeCode(candidate);
    if (isProductionJamRequisitionRef(normalized)) return normalized;
  }

  const remarkMatch = JAM_RETURN_REMARK_REF_PATTERN.exec(normalizeText(row?.DI_REMARK));
  return remarkMatch ? normalizeCode(remarkMatch[1]) : "";
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 3) {
  return Number(normalizeNumber(value).toFixed(digits));
}

function toBangkokDateKey(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized.slice(0, 10);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(parsed)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toErpRequisitionDateKey(value) {
  const erpDocumentDate = toBangkokDateKey(value);
  return erpDocumentDate
    ? getJamReportDateForRequisitionDate(erpDocumentDate)
    : "";
}

function getJamWeightKg(row) {
  const unit = normalizeCode(row?.TRD_UTQNAME);
  if (unit === "KG" || unit === "KGS" || unit === "กก." || unit === "กก") {
    const baseQuantity = Math.abs(normalizeNumber(row?.TRD_QTY));
    const unitFactor = Math.abs(normalizeNumber(row?.TRD_UTQQTY)) || 1;
    if (baseQuantity > 0) return baseQuantity * unitFactor;
  }

  return Math.abs(normalizeNumber(row?.TRD_WEIGHT));
}

function aggregateJamReturns(rows) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const code = normalizeCode(row?.TRD_SH_CODE);
    const issueRef = getReferencedJamIssueRef(row);
    if (!isActiveErpDocument(row) || !JAM_CODE_SET.has(code) || !issueRef) continue;

    const key = `${issueRef}::${code}`;
    const current = grouped.get(key) || { weightKg: 0, returnCount: 0, lots: new Map() };
    const weightKg = getJamWeightKg(row);
    const lotNo = normalizeText(row?.TRD_LOT_NO) || "-";
    const lot = current.lots.get(lotNo) || { lotNo, weightKg: 0 };
    current.weightKg += weightKg;
    current.returnCount += 1;
    lot.weightKg += weightKg;
    current.lots.set(lotNo, lot);
    grouped.set(key, current);
  }
  return grouped;
}

function aggregateJams(rows, returnRows) {
  const issues = new Map();
  const returns = aggregateJamReturns(returnRows);

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = normalizeCode(row?.TRD_SH_CODE);
    const issueRef = normalizeCode(row?.DI_REF);
    const date = row?.reportDate
      ? toBangkokDateKey(row.reportDate)
      : toErpRequisitionDateKey(row?.DI_DATE);
    if (
      !isActiveErpDocument(row)
      || !date
      || isSundayIsoDate(date)
      || !JAM_CODE_SET.has(code)
      || !isProductionJamRequisitionRef(issueRef)
    ) continue;

    const key = `${issueRef}::${code}`;
    const current = issues.get(key) || {
      date,
      issueRef,
      code,
      name: normalizeText(row?.TRD_SH_NAME) || code,
      unit: normalizeCode(row?.TRD_UTQNAME) || "-",
      issuedWeightKg: 0,
      requisitionCount: 0,
      lots: new Map(),
    };
    const weightKg = getJamWeightKg(row);
    const lotNo = normalizeText(row?.TRD_LOT_NO) || "-";
    const lot = current.lots.get(lotNo) || { lotNo, weightKg: 0 };
    current.issuedWeightKg += weightKg;
    current.requisitionCount += 1;
    lot.weightKg += weightKg;
    current.lots.set(lotNo, lot);
    issues.set(key, current);
  }

  const grouped = new Map();
  const warnings = [];
  for (const [key, issue] of issues) {
    if (issue.issuedWeightKg <= 0) continue;
    const returned = returns.get(key) || { weightKg: 0, returnCount: 0, lots: new Map() };
    const netWeightKg = issue.issuedWeightKg - returned.weightKg;
    if (returned.weightKg > issue.issuedWeightKg) {
      warnings.push({
        source: "แยมใช้จริง",
        message: `ใบเบิก ${issue.issueRef} รหัส ${issue.code} คืน ${round(returned.weightKg)} กก. เกินยอดเบิก ${round(issue.issuedWeightKg)} กก.`,
      });
    }

    const dayKey = `${issue.date}::${issue.code}`;
    const current = grouped.get(dayKey) || {
      date: issue.date,
      code: issue.code,
      name: issue.name,
      unit: issue.unit,
      issuedWeightKg: 0,
      returnedWeightKg: 0,
      weightKg: 0,
      requisitionCount: 0,
      returnCount: 0,
      lots: new Map(),
    };
    current.issuedWeightKg += issue.issuedWeightKg;
    current.returnedWeightKg += returned.weightKg;
    current.weightKg += netWeightKg;
    current.requisitionCount += issue.requisitionCount;
    current.returnCount += returned.returnCount;
    const lotNos = new Set([...issue.lots.keys(), ...returned.lots.keys()]);
    for (const lotNo of lotNos) {
      const lot = current.lots.get(lotNo) || { lotNo, issuedWeightKg: 0, returnedWeightKg: 0 };
      lot.issuedWeightKg += issue.lots.get(lotNo)?.weightKg || 0;
      lot.returnedWeightKg += returned.lots.get(lotNo)?.weightKg || 0;
      current.lots.set(lotNo, lot);
    }
    grouped.set(dayKey, current);
  }

  return {
    rows: Array.from(grouped.values()).map((row) => ({
      ...row,
      issuedQuantity: round(row.issuedWeightKg / 10),
      returnedQuantity: round(row.returnedWeightKg / 10),
      quantity: round(row.weightKg / 10),
      issuedWeightKg: round(row.issuedWeightKg),
      returnedWeightKg: round(row.returnedWeightKg),
      weightKg: round(row.weightKg),
      lots: Array.from(row.lots.values())
        .map((lot) => {
          const weightKg = round(lot.issuedWeightKg - lot.returnedWeightKg);
          return { lotNo: lot.lotNo, quantity: round(weightKg / 10), weightKg };
        })
        .filter((lot) => lot.weightKg !== 0)
        .sort((left, right) => left.lotNo.localeCompare(right.lotNo)),
    })),
    warnings,
  };
}

function aggregateShells(rows) {
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const date = toBangkokDateKey(row?.issueDate);
    const code = normalizeCode(row?.productCode);
    if (!date || !code) continue;

    const key = `${date}::${code}`;
    const current = grouped.get(key) || {
      date,
      code,
      name: normalizeText(row?.productName) || code,
      quantity: 0,
      weightKg: 0,
      lots: new Map(),
    };
    const quantity = normalizeNumber(row?.actualQuantity);
    const weightKg = normalizeNumber(row?.actualWeightKg);
    const lotNo = normalizeText(row?.lotNo) || "-";
    const lot = current.lots.get(lotNo) || { lotNo, quantity: 0, weightKg: 0 };
    current.quantity += quantity;
    current.weightKg += weightKg;
    lot.quantity += quantity;
    lot.weightKg += weightKg;
    current.lots.set(lotNo, lot);
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      quantity: round(row.quantity),
      weightKg: round(row.weightKg),
      lots: Array.from(row.lots.values())
        .map((lot) => ({
          ...lot,
          quantity: round(lot.quantity),
          weightKg: round(lot.weightKg),
        }))
        .filter((lot) => lot.quantity !== 0 || lot.weightKg !== 0)
        .sort((left, right) => left.lotNo.localeCompare(right.lotNo)),
    }))
    .filter((row) => row.quantity !== 0 || row.weightKg !== 0);
}

function aggregateFinishedGoods(rows) {
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const date = toBangkokDateKey(
      row?.actualWeighedAt || row?.loggedAt || row?.dayKey
    );
    const code = normalizeCode(
      row?.productGoodsCode || row?.productCode || row?.productSkuCode
    );
    if (!date || !code) continue;

    const key = `${date}::${code}`;
    const current = grouped.get(key) || {
      date,
      code,
      name: normalizeText(row?.productName) || code,
      quantity: 0,
      weightKg: 0,
    };
    current.quantity += normalizeNumber(row?.countValue);
    current.weightKg += normalizeNumber(row?.normalizedKgAmount);
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    quantity: round(row.quantity),
    weightKg: round(row.weightKg),
  }));
}

function aggregateWaste(rows) {
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = normalizeText(row?.status || "confirmed").toLowerCase();
    if (status !== "confirmed") continue;

    const date = toBangkokDateKey(row?.actualWeighedAt || row?.loggedAt);
    const code = normalizeCode(
      row?.productGoodsCode || row?.productCode || row?.productSkuCode
    );
    if (!date || !code) continue;

    const key = `${date}::${code}`;
    const current = grouped.get(key) || {
      date,
      code,
      name: normalizeText(row?.productName) || code,
      quantity: 0,
      weightKg: 0,
      labelScrapWeightKg: 0,
      brokenScrapWeightKg: 0,
      burntScrapWeightKg: 0,
    };
    const wasteCategory = normalizeText(row?.wasteCategory).toLowerCase();
    const wasteWeightKg = normalizeNumber(row?.wasteWeightKg);
    current.quantity += 1;
    current.weightKg += wasteWeightKg;
    // Older waste scans predate category selection; retain them under label scrap.
    if (!wasteCategory || wasteCategory === "label_scrap") current.labelScrapWeightKg += wasteWeightKg;
    if (wasteCategory === "broken_scrap") current.brokenScrapWeightKg += wasteWeightKg;
    if (wasteCategory === "burnt_scrap") current.burntScrapWeightKg += wasteWeightKg;
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    quantity: round(row.quantity),
    weightKg: round(row.weightKg),
    labelScrapWeightKg: round(row.labelScrapWeightKg),
    brokenScrapWeightKg: round(row.brokenScrapWeightKg),
    burntScrapWeightKg: round(row.burntScrapWeightKg),
  }));
}

function normalizeMappings(rows) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const fgCode = normalizeCode(row?.fgCode);
    const shellCode = normalizeCode(row?.shellCode);
    if (!fgCode || !shellCode) continue;
    const key = `${fgCode}::${shellCode}`;
    unique.set(key, {
      fgCode,
      fgName: normalizeText(row?.fgName),
      shellCode,
      shellName: normalizeText(row?.shellName),
    });
  }
  return Array.from(unique.values());
}

function indexByDateAndCode(rows) {
  return new Map(rows.map((row) => [`${row.date}::${row.code}`, row]));
}

function buildDayRows(date, shells, finishedGoods, waste, mappings) {
  const shellByCode = new Map(
    shells.filter((row) => row.date === date).map((row) => [row.code, row])
  );
  const fgByCode = new Map(
    finishedGoods.filter((row) => row.date === date).map((row) => [row.code, row])
  );
  const wasteByCode = new Map(
    waste.filter((row) => row.date === date).map((row) => [row.code, row])
  );
  const activeFgCodes = new Set([...fgByCode.keys(), ...wasteByCode.keys()]);
  const shellToFgCodes = new Map();

  for (const mapping of mappings) {
    if (!activeFgCodes.has(mapping.fgCode)) continue;
    if (!shellToFgCodes.has(mapping.shellCode)) {
      shellToFgCodes.set(mapping.shellCode, []);
    }
    shellToFgCodes.get(mapping.shellCode).push(mapping.fgCode);
  }

  const candidateShellCodes = new Set(shellByCode.keys());
  const rows = [];
  const displayedFgMetrics = new Set();

  for (const shellCode of Array.from(candidateShellCodes).sort()) {
    const shell = shellByCode.get(shellCode) || null;
    const mapping = mappings.find((row) => row.shellCode === shellCode) || null;
    const relatedFgCodes = Array.from(
      new Set(shellToFgCodes.get(shellCode) || [])
    ).sort();
    const rowFgCodes = relatedFgCodes.length ? relatedFgCodes : [null];

    rowFgCodes.forEach((fgCode, shellRowIndex) => {
      const fg = fgCode ? fgByCode.get(fgCode) || null : null;
      const wasteRow = fgCode ? wasteByCode.get(fgCode) || null : null;
      const showFgMetrics = Boolean(fgCode && !displayedFgMetrics.has(fgCode));
      if (showFgMetrics) displayedFgMetrics.add(fgCode);

      rows.push({
        shellCode,
        shellName: shell?.name || mapping?.shellName || shellCode,
        shellQuantity: shellRowIndex === 0 && shell ? shell.quantity : null,
        shellWeightKg: shellRowIndex === 0 && shell ? shell.weightKg : null,
        shellLots: shellRowIndex === 0 && shell ? shell.lots : [],
        fgCode: fgCode || "",
        fgName: fg?.name || wasteRow?.name || "",
        wasteQuantity: showFgMetrics ? wasteRow?.quantity || 0 : null,
        wasteWeightKg: showFgMetrics ? wasteRow?.weightKg || 0 : null,
        labelScrapWeightKg: showFgMetrics ? wasteRow?.labelScrapWeightKg || 0 : null,
        brokenScrapWeightKg: showFgMetrics ? wasteRow?.brokenScrapWeightKg || 0 : null,
        burntScrapWeightKg: showFgMetrics ? wasteRow?.burntScrapWeightKg || 0 : null,
        fgQuantity: showFgMetrics ? fg?.quantity || 0 : null,
        fgWeightKg: showFgMetrics ? fg?.weightKg || 0 : null,
      });
    });
  }

  for (const fgCode of Array.from(activeFgCodes).sort()) {
    if (displayedFgMetrics.has(fgCode)) continue;
    const fg = fgByCode.get(fgCode) || null;
    const wasteRow = wasteByCode.get(fgCode) || null;
    rows.push({
      shellCode: "",
      shellName: "",
      shellQuantity: null,
      shellWeightKg: null,
      shellLots: [],
      fgCode,
      fgName: fg?.name || wasteRow?.name || fgCode,
      wasteQuantity: wasteRow?.quantity || 0,
      wasteWeightKg: wasteRow?.weightKg || 0,
      labelScrapWeightKg: wasteRow?.labelScrapWeightKg || 0,
      brokenScrapWeightKg: wasteRow?.brokenScrapWeightKg || 0,
      burntScrapWeightKg: wasteRow?.burntScrapWeightKg || 0,
      fgQuantity: fg?.quantity || 0,
      fgWeightKg: fg?.weightKg || 0,
    });
  }

  return rows.map((row, index) => ({ ...row, sequence: index + 1 }));
}

function sumRows(rows, field) {
  return round(rows.reduce((total, row) => total + normalizeNumber(row?.[field]), 0));
}

export function buildProductionInputOutputReport({
  stockRows = [],
  pieceRateRows = [],
  wasteRows = [],
  bomMappings = [],
  jamRows = [],
  jamReturnRows = [],
} = {}) {
  const shells = aggregateShells(stockRows);
  const finishedGoods = aggregateFinishedGoods(pieceRateRows);
  const waste = aggregateWaste(wasteRows);
  const { rows: jams, warnings: jamWarnings } = aggregateJams(jamRows, jamReturnRows);
  const mappings = normalizeMappings(bomMappings);
  const dateKeys = new Set([
    ...shells.map((row) => row.date),
    ...finishedGoods.map((row) => row.date),
    ...waste.map((row) => row.date),
    ...jams.map((row) => row.date),
  ]);
  const jamIndex = indexByDateAndCode(jams);

  const days = Array.from(dateKeys)
    .filter(Boolean)
    .sort()
    .map((date) => {
      const dayShells = shells.filter((row) => row.date === date);
      const dayFg = finishedGoods.filter((row) => row.date === date);
      const dayWaste = waste.filter((row) => row.date === date);
      const dayJams = JAM_GOODS_CODES
        .map((code) => jamIndex.get(`${date}::${code}`))
        .filter(Boolean);

      return {
        date,
        jams: dayJams,
        rows: buildDayRows(date, shells, finishedGoods, waste, mappings),
        totals: {
          shellQuantity: sumRows(dayShells, "quantity"),
          shellWeightKg: sumRows(dayShells, "weightKg"),
          wasteQuantity: sumRows(dayWaste, "quantity"),
          wasteWeightKg: sumRows(dayWaste, "weightKg"),
          labelScrapWeightKg: sumRows(dayWaste, "labelScrapWeightKg"),
          brokenScrapWeightKg: sumRows(dayWaste, "brokenScrapWeightKg"),
          burntScrapWeightKg: sumRows(dayWaste, "burntScrapWeightKg"),
          fgQuantity: sumRows(dayFg, "quantity"),
          fgWeightKg: sumRows(dayFg, "weightKg"),
        },
      };
    });

  return { days, warnings: jamWarnings };
}
