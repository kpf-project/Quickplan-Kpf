import {
  getJamReportDateForRequisitionDate,
  isSundayIsoDate,
} from "./production-input-output-dates.js";

export const JAM_GOODS_CODES = Object.freeze(["M04-0088", "M04-0126-1", "M04-0127-1"]);

const JAM_CODE_SET = new Set(JAM_GOODS_CODES);
const JAM_REQUISITION_REF_PATTERN = /^[XT]\d{4}\/\d{4,5}$/;
const JAM_SUPPLEMENTAL_REF_PATTERN = /^T\d{4}\/\d{4,5}$/;
const JAM_RETURN_REMARK_REF_PATTERN = /อ้างถึงใบเบิก#([XT]\d{4}\/\d{4,5})(?=:)/i;
const SHELL_REPORT_OVERRIDES = Object.freeze({
  "2026-09-28::B06-0006": "WKB-0052",
  "2026-10-13::BL0-1104": null,
});
const JAM_REPORT_ALLOCATION_OVERRIDES = Object.freeze({
  // Operator-confirmed split from the signed production sheet; total remains 550 kg.
  "2026-10-08::M04-0088": Object.freeze({
    "WKB-0002-1": 296.91,
    "WKB-0065": 253.09,
  }),
  // Operator-confirmed split; the recorded jam usage remains 760 kg.
  "2026-10-09::M04-0088": Object.freeze({
    "WKB-0002-1": 260,
    "WKB-0065": 500,
  }),
  // Operator-confirmed split from production sheet; total remains 368.79 kg (lot 261003).
  "2026-10-13::M04-0088": Object.freeze({
    "WKB-0002-1": 30.05,
    "WKB-0064": 338.74,
  }),
  // Operator-confirmed split; the recorded jam usage remains 430 kg.
  "2026-10-14::M04-0088": Object.freeze({
    "WKB-0064": 200,
    "WKB-0065": 230,
  }),
});
const BISCUIT_PACKING_ROOM = "BISCUIT_PACKING";
const PACKING_400_ROOM = "PACKING_400";
export const SHELL_POOL_EFFECTIVE_DATE = "2026-10-06";
const BOTAN_SHELL_CODES = new Set(["WKB-0002", "WKB-0068"]);
const SPECIAL_RATIO_FG_CODES = new Set(["WKB-0064", "B03-0012", "BI3-0012"]);
const SPECIAL_SHELL_RATIO = 0.60;
const DEFAULT_SHELL_RATIO = 0.52;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

export function selectPrimaryBomFormulaVersions(versionRows = []) {
  const formulaCodesByBom = new Map();
  for (const row of versionRows) {
    const bomId = normalizeText(row?.bom_id);
    if (!bomId) continue;
    if (!formulaCodesByBom.has(bomId)) formulaCodesByBom.set(bomId, new Set());
    formulaCodesByBom.get(bomId).add(normalizeCode(row?.formula_code) || "DEFAULT");
  }

  const primaryFormulaByBom = new Map(
    Array.from(formulaCodesByBom, ([bomId, codes]) => {
      const sortedCodes = Array.from(codes).sort((a, b) => {
        if (a === "DEFAULT") return -1;
        if (b === "DEFAULT") return 1;
        return a.localeCompare(b);
      });
      return [bomId, sortedCodes[0]];
    })
  );

  return versionRows.filter((row) => {
    const bomId = normalizeText(row?.bom_id);
    return (normalizeCode(row?.formula_code) || "DEFAULT") === primaryFormulaByBom.get(bomId);
  });
}

export function isProductionJamRequisitionRef(value) {
  return JAM_REQUISITION_REF_PATTERN.test(normalizeCode(value));
}

export function isProductionJamPlanForReportDate(row, reportDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(reportDate));
  if (!match) return false;

  const [, year, month, day] = match;
  const plannedDate = `${day}/${month}/${Number(year) + 543}`;
  const issueRef = normalizeCode(row?.DI_REF);
  const remark = normalizeText(row?.DI_REMARK);

  if (JAM_SUPPLEMENTAL_REF_PATTERN.test(issueRef)) {
    return remark.includes("แผนกบิสกิต")
      && remark.includes(plannedDate)
      && !remark.includes("เรือนจำ");
  }

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

export function mergeManualJamUsageRows(jamPayload = {}, manualRows = []) {
  const manualKeys = new Set(manualRows.map((row) => `${row.usageDate}::${normalizeCode(row.goodsCode)}`));
  const issueRows = (jamPayload.issueRows || []).filter((row) => (
    !manualKeys.has(`${row.reportDate}::${normalizeCode(row.TRD_SH_CODE)}`)
  ));
  const retainedIssueRefs = new Set(issueRows.map((row) => normalizeCode(row.DI_REF)));

  return {
    issueRows: issueRows.concat(manualRows.filter((row) => row.status !== "voided").map((row) => ({
      source: "APP",
      targetProductCode: row.targetProductCode,
      targetProductName: row.targetProductName,
      reportDate: row.usageDate,
      DI_DATE: row.usageDate,
      DI_REF: `APP:${row.id}`,
      TRD_SH_CODE: row.goodsCode,
      TRD_SH_NAME: row.goodsName,
      TRD_LOT_NO: row.lotNo,
      TRD_QTY: row.weightKg,
      TRD_UTQQTY: 1,
      TRD_UTQNAME: "KG",
    }))),
    returnRows: (jamPayload.returnRows || []).filter((row) => (
      retainedIssueRefs.has(getReferencedJamIssueRef(row))
    )),
  };
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 3) {
  return Number(normalizeNumber(value).toFixed(digits));
}

export function toBangkokDateKey(value) {
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
    const current = grouped.get(key) || {
      weightKg: 0,
      returnCount: 0,
      returnDocRefs: new Set(),
      lots: new Map(),
    };
    const weightKg = getJamWeightKg(row);
    const lotNo = normalizeText(row?.TRD_LOT_NO) || "-";
    const returnDocRef = normalizeCode(row?.DI_REF);
    const lot = current.lots.get(lotNo) || { lotNo, weightKg: 0, returnDocRefs: new Set() };
    current.weightKg += weightKg;
    current.returnCount += 1;
    if (returnDocRef) current.returnDocRefs.add(returnDocRef);
    lot.weightKg += weightKg;
    if (returnDocRef) lot.returnDocRefs.add(returnDocRef);
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
    const isManualEntry = row?.source === "APP";
    const date = row?.reportDate
      ? toBangkokDateKey(row.reportDate)
      : toErpRequisitionDateKey(row?.DI_DATE);
    if (
      !isActiveErpDocument(row)
      || !date
      || (!isManualEntry && isSundayIsoDate(date))
      || !JAM_CODE_SET.has(code)
      || (!isManualEntry && !isProductionJamRequisitionRef(issueRef))
    ) continue;

    const key = `${issueRef}::${code}`;
    const current = issues.get(key) || {
      date,
      issueRef,
      targetProductCode: isManualEntry ? normalizeCode(row.targetProductCode) : "",
      targetProductName: isManualEntry ? normalizeText(row.targetProductName) : "",
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
    const returned = returns.get(key) || {
      weightKg: 0,
      returnCount: 0,
      returnDocRefs: new Set(),
      lots: new Map(),
    };
    const netWeightKg = issue.issuedWeightKg - returned.weightKg;
    if (returned.weightKg > issue.issuedWeightKg) {
      warnings.push({
        source: "แยมใช้จริง",
        message: `ใบเบิก ${issue.issueRef} รหัส ${issue.code} คืน ${round(returned.weightKg)} กก. เกินยอดเบิก ${round(issue.issuedWeightKg)} กก.`,
      });
    }

    const dayKey = `${issue.date}::${issue.code}::${issue.targetProductCode}`;
    const current = grouped.get(dayKey) || {
      date: issue.date,
      targetProductCode: issue.targetProductCode,
      targetProductName: issue.targetProductName,
      code: issue.code,
      name: issue.name,
      unit: issue.unit,
      issuedWeightKg: 0,
      returnedWeightKg: 0,
      weightKg: 0,
      requisitionCount: 0,
      returnCount: 0,
      issueRefs: new Set(),
      returnDocRefs: new Set(),
      lots: new Map(),
    };
    current.issuedWeightKg += issue.issuedWeightKg;
    current.returnedWeightKg += returned.weightKg;
    current.weightKg += netWeightKg;
    current.requisitionCount += issue.requisitionCount;
    current.returnCount += returned.returnCount;
    current.issueRefs.add(issue.issueRef);
    for (const returnDocRef of returned.returnDocRefs) current.returnDocRefs.add(returnDocRef);
    const lotNos = new Set([...issue.lots.keys(), ...returned.lots.keys()]);
    for (const lotNo of lotNos) {
      const lot = current.lots.get(lotNo) || {
        lotNo,
        issuedWeightKg: 0,
        returnedWeightKg: 0,
        issueRefs: new Set(),
        returnDocRefs: new Set(),
      };
      lot.issuedWeightKg += issue.lots.get(lotNo)?.weightKg || 0;
      lot.returnedWeightKg += returned.lots.get(lotNo)?.weightKg || 0;
      if (issue.lots.has(lotNo)) lot.issueRefs.add(issue.issueRef);
      for (const returnDocRef of returned.lots.get(lotNo)?.returnDocRefs || []) {
        lot.returnDocRefs.add(returnDocRef);
      }
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
      issueRefs: Array.from(row.issueRefs).sort(),
      returnDocRefs: Array.from(row.returnDocRefs).sort(),
      lots: Array.from(row.lots.values())
        .map((lot) => {
          const issuedWeightKg = round(lot.issuedWeightKg);
          const returnedWeightKg = round(lot.returnedWeightKg);
          const weightKg = round(lot.issuedWeightKg - lot.returnedWeightKg);
          return {
            lotNo: lot.lotNo,
            quantity: round(weightKg / 10),
            issuedWeightKg,
            returnedWeightKg,
            weightKg,
            issueRefs: Array.from(lot.issueRefs).sort(),
            returnDocRefs: Array.from(lot.returnDocRefs).sort(),
          };
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

    const destinationRoomCode = normalizeCode(row?.destinationRoomCode) || BISCUIT_PACKING_ROOM;
    const destinationRoomName = normalizeText(row?.destinationRoomName)
      || (destinationRoomCode === PACKING_400_ROOM ? "ห้องบรรจุ 400" : "ห้องบรรจุบิสกิต");
    const key = `${date}::${code}::${destinationRoomCode}`;
    const current = grouped.get(key) || {
      date,
      code,
      name: normalizeText(row?.productName) || code,
      destinationRoomCode,
      destinationRoomName,
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
    const jamCode = normalizeCode(row?.jamCode);
    if (!fgCode || (!shellCode && !jamCode)) continue;
    const key = `${fgCode}::${shellCode}::${jamCode}`;
    unique.set(key, {
      fgCode,
      fgName: normalizeText(row?.fgName),
      shellCode,
      shellName: normalizeText(row?.shellName),
      jamCode,
      jamQty: normalizeNumber(row?.jamQty),
      baseBatch: normalizeNumber(row?.baseBatch),
    });
  }
  return Array.from(unique.values());
}

function poolDayShells(dayShells, date) {
  if (date < SHELL_POOL_EFFECTIVE_DATE) return dayShells;

  const nonBotan = [];
  const botanByRoom = new Map();

  for (const shell of dayShells) {
    if (BOTAN_SHELL_CODES.has(shell.code)) {
      const room = shell.destinationRoomCode || BISCUIT_PACKING_ROOM;
      const existing = botanByRoom.get(room);
      if (!existing) {
        botanByRoom.set(room, {
          ...shell,
          code: "WKB-0002",
          name: "แผ่นแครกเกอร์โบตั๋น",
          quantity: shell.quantity,
          weightKg: shell.weightKg,
          lots: [...(shell.lots || [])],
        });
      } else {
        existing.quantity = round(existing.quantity + shell.quantity);
        existing.weightKg = round(existing.weightKg + shell.weightKg);
        existing.lots = [...existing.lots, ...(shell.lots || [])];
      }
    } else {
      nonBotan.push(shell);
    }
  }

  return [...nonBotan, ...botanByRoom.values()];
}

function buildDayRows(date, shells, finishedGoods, waste, mappings) {
  const dayShells = poolDayShells(shells.filter((row) => row.date === date), date);
  const effectiveMappings = date >= SHELL_POOL_EFFECTIVE_DATE
    ? mappings.map((m) => (BOTAN_SHELL_CODES.has(m.shellCode) ? { ...m, shellCode: "WKB-0002" } : m))
    : mappings;
  const fgByCode = new Map(
    finishedGoods.filter((row) => row.date === date).map((row) => [row.code, row])
  );
  const wasteByCode = new Map(
    waste.filter((row) => row.date === date).map((row) => [row.code, row])
  );
  const activeFgCodes = new Set([...fgByCode.keys(), ...wasteByCode.keys()]);
  const shellToFgCodes = new Map();

  for (const mapping of effectiveMappings) {
    const override = SHELL_REPORT_OVERRIDES[`${date}::${mapping.fgCode}`];
    const shellCode = override !== undefined ? override : mapping.shellCode;
    if (!shellCode) continue;
    if (!activeFgCodes.has(mapping.fgCode)) continue;
    if (!shellToFgCodes.has(shellCode)) {
      shellToFgCodes.set(shellCode, []);
    }
    shellToFgCodes.get(shellCode).push(mapping.fgCode);
  }

  const shellQuantityByCode = new Map();
  for (const shell of dayShells) {
    if (shell.destinationRoomCode === PACKING_400_ROOM) continue;
    shellQuantityByCode.set(
      shell.code,
      normalizeNumber(shellQuantityByCode.get(shell.code)) + normalizeNumber(shell.quantity)
    );
  }

  for (const [fgCode, fg] of fgByCode) {
    const candidateShellCodes = Array.from(shellToFgCodes)
      .filter(([shellCode, fgCodes]) => (
        shellQuantityByCode.has(shellCode) && fgCodes.includes(fgCode)
      ))
      .map(([shellCode]) => shellCode);
    if (candidateShellCodes.length < 2 || normalizeNumber(fg?.quantity) <= 0) continue;

    const exactMatches = candidateShellCodes.filter((shellCode) => (
      Math.abs(normalizeNumber(shellQuantityByCode.get(shellCode)) - normalizeNumber(fg.quantity)) < 0.001
    ));
    if (exactMatches.length !== 1) continue;

    const selectedShellCode = exactMatches[0];
    for (const shellCode of candidateShellCodes) {
      if (shellCode === selectedShellCode) continue;
      shellToFgCodes.set(
        shellCode,
        shellToFgCodes.get(shellCode).filter((candidateFgCode) => candidateFgCode !== fgCode)
      );
    }
  }

  const rows = [];
  const displayedFgMetrics = new Set();

  for (const shell of dayShells.sort((left, right) => (
    left.code.localeCompare(right.code) || left.destinationRoomCode.localeCompare(right.destinationRoomCode)
  ))) {
    const shellCode = shell.code;
    const mapping = effectiveMappings.find((row) => row.shellCode === shellCode) || null;
    if (shell.destinationRoomCode === PACKING_400_ROOM) {
      rows.push({
        shellCode,
        shellName: shell.name || mapping?.shellName || shellCode,
        destinationRoomCode: shell.destinationRoomCode,
        destinationRoomName: shell.destinationRoomName,
        shellQuantity: shell.quantity,
        shellWeightKg: shell.weightKg,
        shellLots: shell.lots,
        fgCode: "",
        fgName: "",
        wasteQuantity: null,
        wasteWeightKg: null,
        labelScrapWeightKg: null,
        brokenScrapWeightKg: null,
        burntScrapWeightKg: null,
        fgQuantity: null,
        fgWeightKg: null,
      });
      continue;
    }
    const relatedFgCodes = Array.from(new Set(shellToFgCodes.get(shellCode) || [])).sort();
    const rowFgCodes = relatedFgCodes.length ? relatedFgCodes : [null];

    const shouldAllocateShell = date >= SHELL_POOL_EFFECTIVE_DATE && rowFgCodes.length > 1;
    let allocatedQuantities = null;
    let allocatedWeights = null;
    let allocatedLotsByIndex = null;

    if (shouldAllocateShell) {
      const weights = rowFgCodes.map((code) => {
        const fg = code ? fgByCode.get(code) : null;
        const fgWeight = normalizeNumber(fg?.weightKg);
        if (fgWeight > 0) {
          const ratio = SPECIAL_RATIO_FG_CODES.has(code) ? SPECIAL_SHELL_RATIO : DEFAULT_SHELL_RATIO;
          return fgWeight * ratio;
        }
        return 1;
      });
      allocatedQuantities = splitAmount(shell.quantity, weights);
      allocatedWeights = splitAmount(shell.weightKg, weights);
      const lotSplits = shell.lots.map((lot) => ({
        lotNo: lot.lotNo,
        quantities: splitAmount(lot.quantity, weights),
        weights: splitAmount(lot.weightKg, weights),
      }));
      allocatedLotsByIndex = rowFgCodes.map((_, i) => (
        lotSplits.map((split) => ({
          lotNo: split.lotNo,
          quantity: split.quantities[i],
          weightKg: split.weights[i],
        })).filter((l) => l.quantity !== 0 || l.weightKg !== 0)
      ));
    }

    rowFgCodes.forEach((fgCode, shellRowIndex) => {
      const fg = fgCode ? fgByCode.get(fgCode) || null : null;
      const wasteRow = fgCode ? wasteByCode.get(fgCode) || null : null;
      const showFgMetrics = Boolean(fgCode && !displayedFgMetrics.has(fgCode));
      if (showFgMetrics) displayedFgMetrics.add(fgCode);

      const rowShellQuantity = shouldAllocateShell
        ? allocatedQuantities[shellRowIndex]
        : (shellRowIndex === 0 ? shell.quantity : null);
      const rowShellWeightKg = shouldAllocateShell
        ? allocatedWeights[shellRowIndex]
        : (shellRowIndex === 0 ? shell.weightKg : null);
      const rowShellLots = shouldAllocateShell
        ? allocatedLotsByIndex[shellRowIndex]
        : (shellRowIndex === 0 ? shell.lots : []);

      rows.push({
        shellCode,
        shellName: shell.name || mapping?.shellName || shellCode,
        destinationRoomCode: shell.destinationRoomCode,
        destinationRoomName: shell.destinationRoomName,
        shellQuantity: rowShellQuantity,
        shellWeightKg: rowShellWeightKg,
        shellLots: rowShellLots,
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
      destinationRoomCode: "",
      destinationRoomName: "",
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

function splitAmount(total, weights) {
  const roundedTotal = round(total);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;

  return weights.map((weight, index) => {
    const value = index === weights.length - 1
      ? round(roundedTotal - allocated)
      : round(roundedTotal * weight / weightTotal);
    allocated += value;
    return value;
  });
}

function combineJamAllocations(previous, next) {
  if (!previous) return next;
  const lots = new Map(previous.lots.map((lot) => [lot.lotNo, { ...lot }]));
  for (const lot of next.lots) {
    const current = lots.get(lot.lotNo);
    lots.set(lot.lotNo, current ? { ...current, weightKg: round(current.weightKg + lot.weightKg), quantity: round(current.quantity + lot.quantity), issuedWeightKg: round(current.issuedWeightKg + lot.issuedWeightKg), returnedWeightKg: round(current.returnedWeightKg + lot.returnedWeightKg), issueRefs: [...new Set([...(current.issueRefs || []), ...(lot.issueRefs || [])])], returnDocRefs: [...new Set([...(current.returnDocRefs || []), ...(lot.returnDocRefs || [])])] } : { ...lot });
  }
  return {
    ...next,
    weightKg: round(previous.weightKg + next.weightKg),
    quantity: round(previous.quantity + next.quantity),
    issuedQuantity: round(previous.issuedQuantity + next.issuedQuantity),
    returnedQuantity: round(previous.returnedQuantity + next.returnedQuantity),
    issuedWeightKg: round(previous.issuedWeightKg + next.issuedWeightKg),
    returnedWeightKg: round(previous.returnedWeightKg + next.returnedWeightKg),
    issueRefs: [...new Set([...previous.issueRefs, ...next.issueRefs])],
    lots: [...lots.values()],
  };
}

function allocateJamsToRows(rows, jams, mappings, reportDate, wipFgCodes = new Set()) {
  const allocatedRows = rows.map((row) => ({ ...row, jam: null }));

  for (const jam of jams) {
    if (jam.targetProductCode) {
      let targetIndex = allocatedRows.findIndex((row) => row.fgCode === jam.targetProductCode && row.destinationRoomCode !== PACKING_400_ROOM);
      if (targetIndex < 0) {
        allocatedRows.push({ shellCode: "", shellName: "", shellLots: [], fgCode: jam.targetProductCode, fgName: jam.targetProductName, jam: null });
        targetIndex = allocatedRows.length - 1;
      }
      const target = allocatedRows[targetIndex];
      // Preserve each explicit allocation even if the BOM or output is later corrected.
      if (target.jam && target.jam.code !== jam.code) {
        allocatedRows.push({ ...target, shellQuantity: null, shellWeightKg: null, shellLots: [], fgQuantity: null, fgWeightKg: null, wasteQuantity: null, wasteWeightKg: null, labelScrapWeightKg: null, brokenScrapWeightKg: null, burntScrapWeightKg: null, jam });
      } else {
        target.jam = combineJamAllocations(target.jam, jam);
      }
      continue;
    }
    const rawCandidates = allocatedRows
      .map((row, index) => {
        if (!row.shellCode && wipFgCodes.has(row.fgCode)) return null;
        const mapping = mappings.find((item) =>
          item.fgCode === row.fgCode
          && item.jamCode === jam.code
          && item.jamQty > 0
          && item.baseBatch > 0
        );
        if (!mapping) return null;

        const hasShell = Boolean(row.shellCode) && (Number(row.shellWeightKg) > 0 || Number(row.shellQuantity) > 0);
        const jamRatio = SPECIAL_RATIO_FG_CODES.has(row.fgCode)
          ? (1 - SPECIAL_SHELL_RATIO)
          : (1 - DEFAULT_SHELL_RATIO);
        const theoreticalWeight = Number(row.fgWeightKg) > 0
          ? Number(row.fgWeightKg) * jamRatio
          : (mapping.jamQty / mapping.baseBatch);

        if (theoreticalWeight <= 0) return null;
        return { index, theoreticalWeight, hasShell };
      })
      .filter(Boolean);

    // If at least one matching candidate has an issued shell on this day,
    // only allocate jam to candidates with an issued shell.
    // Finished goods with output but no shell issued on that day (such as packing pre-made WIP like BL0-1104 without shell issue)
    // did not use fresh jam and must not be allocated jam.
    const hasAnyShellCandidates = rawCandidates.some((c) => c.hasShell);
    const candidates = hasAnyShellCandidates
      ? rawCandidates.filter((c) => c.hasShell)
      : rawCandidates;

    if (!candidates.length) {
      allocatedRows.push({
        shellCode: "",
        shellName: "",
        destinationRoomCode: "",
        destinationRoomName: "",
        shellQuantity: null,
        shellWeightKg: null,
        shellLots: [],
        fgCode: "",
        fgName: "",
        wasteQuantity: null,
        wasteWeightKg: null,
        labelScrapWeightKg: null,
        brokenScrapWeightKg: null,
        burntScrapWeightKg: null,
        fgQuantity: null,
        fgWeightKg: null,
        jam,
      });
      continue;
    }

    const allocationOverride = JAM_REPORT_ALLOCATION_OVERRIDES[`${reportDate}::${jam.code}`];
    const overrideWeights = allocationOverride
      ? candidates.map((candidate) => allocationOverride[allocatedRows[candidate.index].fgCode])
      : [];
    const useOverride = overrideWeights.length === candidates.length
      && overrideWeights.every((weight) => Number.isFinite(weight) && weight >= 0)
      && round(overrideWeights.reduce((sum, weight) => sum + weight, 0)) === round(jam.weightKg);
    const weights = useOverride
      ? overrideWeights
      : candidates.map((candidate) => candidate.theoreticalWeight);
    const netWeights = splitAmount(jam.weightKg, weights);
    const issuedWeights = splitAmount(jam.issuedWeightKg, weights);
    const returnedWeights = splitAmount(jam.returnedWeightKg, weights);
    const lotWeights = jam.lots.map((lot) => splitAmount(lot.weightKg, weights));

    candidates.forEach((candidate, allocationIndex) => {
      const weightKg = netWeights[allocationIndex];
      allocatedRows[candidate.index].jam = combineJamAllocations(allocatedRows[candidate.index].jam, {
        ...jam,
        issuedWeightKg: issuedWeights[allocationIndex],
        returnedWeightKg: returnedWeights[allocationIndex],
        weightKg,
        quantity: round(weightKg / 10),
        lots: jam.lots
          .map((lot, lotIndex) => {
            const lotWeightKg = lotWeights[lotIndex][allocationIndex];
            return {
              lotNo: lot.lotNo,
              quantity: round(lotWeightKg / 10),
              weightKg: lotWeightKg,
            };
          })
          .filter((lot) => lot.weightKg !== 0),
      });
    });
  }

  return allocatedRows.map((row, index) => ({ ...row, sequence: index + 1 }));
}

function sumRows(rows, field) {
  return round(rows.reduce((total, row) => total + normalizeNumber(row?.[field]), 0));
}

function aggregateWipIssues(rows) {
  const reversed = new Set(rows.filter((row) => row.source_document_type === "piece_rate_issue_void")
    .map((row) => normalizeCode(row.source_document_no || row.reference_no)));
  const grouped = new Map();
  let unlinkedCount = 0;
  for (const row of rows) {
    const fgCode = normalizeCode(row.metadata?.fgProductCode);
    const code = normalizeCode(row.product_code);
    const date = toBangkokDateKey(row.movement_date);
    if (!["piece_rate_issue", "piece_rate_prison_issue"].includes(row.source_document_type) || reversed.has(normalizeCode(row.source_document_no))
      || !code || !date || normalizeNumber(row.weight_out_kg) <= 0
      || (row.source_document_type === "piece_rate_issue" && row.metadata?.issueType && normalizeCode(row.metadata.issueType) !== "KPF")) continue;
    if (!fgCode) { unlinkedCount += 1; continue; }
    const unit = normalizeText(row.uom_name);
    const key = `${date}::${fgCode}::${code}::${unit}`;
    const entry = grouped.get(key) || { date, fgCode, fgName: normalizeText(row.metadata?.fgProductName), code, name: normalizeText(row.product_name_snapshot) || code, unit, quantity: 0, weightKg: 0, lots: new Map() };
    entry.quantity += normalizeNumber(row.quantity_out);
    entry.weightKg += normalizeNumber(row.weight_out_kg);
    const lotNo = normalizeText(row.lot_no);
    const lot = entry.lots.get(lotNo) || { lotNo, quantity: 0, weightKg: 0 };
    lot.quantity = round(lot.quantity + normalizeNumber(row.quantity_out));
    lot.weightKg = round(lot.weightKg + normalizeNumber(row.weight_out_kg));
    entry.lots.set(lotNo, lot);
    grouped.set(key, entry);
  }
  return { rows: [...grouped.values()].map((row) => ({ ...row, quantity: round(row.quantity), weightKg: round(row.weightKg), lots: [...row.lots.values()] })), warnings: unlinkedCount ? [{ source: "WIP", message: `ใบเบิกเนื้อขนม ${unlinkedCount} รายการยังไม่ระบุสินค้า FG ปลายทาง` }] : [] };
}

function appendWipInputs(rows, issues) {
  if (!issues.length) return rows;
  const result = rows.map((row) => ({ ...row }));
  for (const issue of issues) {
    const input = { inputKind: "wip", inputUnit: issue.unit, shellCode: issue.code, shellName: issue.name, shellLots: issue.lots, shellQuantity: issue.quantity, shellWeightKg: issue.weightKg };
    const empty = result.find((row) => row.fgCode === issue.fgCode && !row.shellCode && !row.jam);
    if (empty) Object.assign(empty, input);
    else result.push({ ...input, fgCode: issue.fgCode, fgName: issue.fgName, jam: null, fgQuantity: null, fgWeightKg: null });
  }
  // Keep all input rows for one FG adjacent; its recorded output remains on one row.
  const groups = new Map();
  result.forEach((row, index) => {
    const key = row.fgCode || `unlinked-${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.values()].flat().map((row, index) => ({ ...row, sequence: index + 1 }));
}

export function buildProductionInputOutputReport({
  stockRows = [],
  pieceRateRows = [],
  wasteRows = [],
  bomMappings = [],
  jamRows = [],
  jamReturnRows = [],
  wipIssueRows = [],
} = {}) {
  const shells = aggregateShells(stockRows);
  const finishedGoods = aggregateFinishedGoods(pieceRateRows);
  const waste = aggregateWaste(wasteRows);
  const { rows: jams, warnings: jamWarnings } = aggregateJams(jamRows, jamReturnRows);
  const mappings = normalizeMappings(bomMappings);
  const { rows: wipIssues, warnings: wipWarnings } = aggregateWipIssues(wipIssueRows);
  const dateKeys = new Set([
    ...shells.map((row) => row.date),
    ...finishedGoods.map((row) => row.date),
    ...waste.map((row) => row.date),
    ...jams.map((row) => row.date),
    ...wipIssues.map((row) => row.date),
  ]);


  const days = Array.from(dateKeys)
    .filter(Boolean)
    .sort()
    .map((date) => {
      const dayShells = shells.filter((row) => row.date === date);
      const dayFg = finishedGoods.filter((row) => row.date === date);
      const dayWaste = waste.filter((row) => row.date === date);
      const dayJams = jams.filter((jam) => jam.date === date)
        .sort((a, b) => Number(Boolean(a.targetProductCode)) - Number(Boolean(b.targetProductCode)));

      const rows = buildDayRows(date, shells, finishedGoods, waste, mappings);
      const dayWip = wipIssues.filter((row) => row.date === date);
      return {
        date,
        jams: dayJams,
        rows: appendWipInputs(allocateJamsToRows(rows, dayJams, mappings, date, new Set(dayWip.map((row) => row.fgCode))), dayWip),
        totals: {
          shellQuantity: sumRows(dayShells, "quantity"),
          shellWeightKg: sumRows(dayShells, "weightKg"),
          ...(dayWip.length ? { wipWeightKg: sumRows(dayWip, "weightKg") } : {}),
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

  return { days, warnings: [...jamWarnings, ...wipWarnings] };
}
