function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpperText(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeDecimal(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function getSourceIssueItemId(row) {
  const metadata = row?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  return normalizeText(metadata.sourceIssueItemId);
}

export function filterProductionStockMovementsByActiveIssueItems(
  rows,
  activeIssueItemIds
) {
  const activeIds = activeIssueItemIds instanceof Set
    ? activeIssueItemIds
    : new Set(Array.isArray(activeIssueItemIds) ? activeIssueItemIds : []);

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const sourceIssueItemId = getSourceIssueItemId(row);
    return !sourceIssueItemId || activeIds.has(sourceIssueItemId);
  });
}

function roundDecimal(value) {
  return Number((Number(value) || 0).toFixed(3));
}

function hasNonZeroBalance(balance) {
  return normalizeDecimal(balance?.quantity) !== 0 || normalizeDecimal(balance?.weightKg) !== 0;
}

function parseIsoDate(value) {
  const [yearText, monthText, dayText] = normalizeText(value).split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(dateFrom, dateTo) {
  const start = parseIsoDate(dateFrom);
  const end = parseIsoDate(dateTo);

  if (!start || !end || start > end) {
    return [];
  }

  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatIsoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function sortAscendingMovementRows(left, right) {
  if (left.issueDate !== right.issueDate) {
    return String(left.issueDate || "").localeCompare(String(right.issueDate || ""));
  }
  if (left.productCode !== right.productCode) {
    return String(left.productCode || "").localeCompare(String(right.productCode || ""));
  }
  return String(left.lotNo || "").localeCompare(String(right.lotNo || ""));
}

export function sortMovementRows(left, right) {
  if (left.issueDate !== right.issueDate) {
    return String(right.issueDate || "").localeCompare(String(left.issueDate || ""));
  }
  if (left.lotNo !== right.lotNo) {
    return String(left.lotNo || "").localeCompare(String(right.lotNo || ""));
  }
  return String(left.productCode || "").localeCompare(String(right.productCode || ""));
}

function movementDelta(row) {
  return {
    quantity: roundDecimal(
      normalizeDecimal(row?.inboundQuantity)
      + normalizeDecimal(row?.returnQuantity)
      - normalizeDecimal(row?.issueQuantity)
      - normalizeDecimal(row?.wasteQuantity)
    ),
    weightKg: roundDecimal(
      normalizeDecimal(row?.inboundWeightKg)
      + normalizeDecimal(row?.returnWeightKg)
      - normalizeDecimal(row?.issueWeightKg)
      - normalizeDecimal(row?.wasteWeightKg)
    ),
  };
}

function normalizeOpeningBalanceMap(rows, openingBalancesByLot) {
  if (openingBalancesByLot instanceof Map) {
    return openingBalancesByLot;
  }

  const balances = new Map();
  [...(Array.isArray(rows) ? rows : [])]
    .sort(sortAscendingMovementRows)
    .forEach((row) => {
      const balanceKey = [row.productCode, row.lotNo].join("|");
      if (balances.has(balanceKey)) {
        return;
      }

      balances.set(balanceKey, {
        quantity: normalizeDecimal(row?.openingQuantity),
        weightKg: normalizeDecimal(row?.openingWeightKg),
      });
    });

  return balances;
}

export function recalculateProductionStockMovementBalances(rows, openingBalancesByLot = null) {
  const balancesByLot = new Map();
  const initialBalancesByLot = normalizeOpeningBalanceMap(rows, openingBalancesByLot);

  const recalculated = [...(Array.isArray(rows) ? rows : [])]
    .sort(sortAscendingMovementRows)
    .map((row) => {
      const balanceKey = [row.productCode, row.lotNo].join("|");
      const previous = balancesByLot.get(balanceKey)
        || initialBalancesByLot.get(balanceKey)
        || { quantity: 0, weightKg: 0 };
      const delta = movementDelta(row);
      const next = {
        quantity: roundDecimal(previous.quantity + delta.quantity),
        weightKg: roundDecimal(previous.weightKg + delta.weightKg),
      };

      balancesByLot.set(balanceKey, next);

      const actualQuantity = roundDecimal(
        normalizeDecimal(row.issueQuantity)
        - normalizeDecimal(row.returnQuantity)
        + normalizeDecimal(row.wasteQuantity)
      );
      const actualWeightKg = roundDecimal(
        normalizeDecimal(row.issueWeightKg)
        - normalizeDecimal(row.returnWeightKg)
        + normalizeDecimal(row.wasteWeightKg)
      );

      return {
        ...row,
        openingQuantity: previous.quantity,
        openingWeightKg: previous.weightKg,
        actualQuantity: actualQuantity > 0 ? actualQuantity : 0,
        actualWeightKg: actualWeightKg > 0 ? actualWeightKg : 0,
        balanceQuantity: next.quantity,
        balanceWeightKg: next.weightKg,
      };
    });

  return recalculated.sort(sortMovementRows);
}

export function expandProductionStockMovementRowsWithDailyBalances(
  rows,
  { dateFrom, dateTo, openingBalancesByLot, lotMetaMap } = {}
) {
  const dateRange = buildDateRange(dateFrom, dateTo);
  if (!dateRange.length) {
    return Array.isArray(rows) ? [...rows].sort(sortMovementRows) : [];
  }

  const ascendingRows = [...(rows || [])].sort(sortAscendingMovementRows);
  const rowsByDate = new Map();
  const metaByLot = new Map(lotMetaMap || []);
  const initialBalanceByLot = new Map(openingBalancesByLot || []);

  ascendingRows.forEach((row) => {
    const dateKey = normalizeText(row?.issueDate);
    const productCode = normalizeUpperText(row?.productCode) || "-";
    const lotNo = normalizeText(row?.lotNo) || "-";
    const lotKey = [productCode, lotNo].join("|");

    if (!rowsByDate.has(dateKey)) {
      rowsByDate.set(dateKey, []);
    }
    rowsByDate.get(dateKey).push({ ...row, productCode, lotNo });

    if (!metaByLot.has(lotKey)) {
      metaByLot.set(lotKey, {
        productCode,
        productName: normalizeText(row?.productName) || "-",
        lotNo,
      });
    }
    if (!initialBalanceByLot.has(lotKey)) {
      initialBalanceByLot.set(lotKey, {
        quantity: normalizeDecimal(row?.openingQuantity),
        weightKg: normalizeDecimal(row?.openingWeightKg),
      });
    }
  });

  const activeBalanceByLot = new Map(
    Array.from(initialBalanceByLot.entries()).filter(([, balance]) => hasNonZeroBalance(balance))
  );
  const expandedRows = [];

  dateRange.forEach((dateKey) => {
    const actualRows = [...(rowsByDate.get(dateKey) || [])].sort((left, right) => {
      const productCompare = String(left.productCode || "").localeCompare(String(right.productCode || ""));
      if (productCompare !== 0) return productCompare;
      return String(left.lotNo || "").localeCompare(String(right.lotNo || ""));
    });
    const actualKeys = new Set(
      actualRows.map((row) => [row.productCode, row.lotNo].join("|"))
    );

    Array.from(activeBalanceByLot.entries())
      .filter(([lotKey, balance]) => !actualKeys.has(lotKey) && hasNonZeroBalance(balance))
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .forEach(([lotKey, balance]) => {
        const meta = metaByLot.get(lotKey);
        if (!meta) {
          return;
        }

        expandedRows.push({
          issueDate: dateKey,
          lotNo: meta.lotNo,
          productCode: meta.productCode,
          productName: meta.productName,
          openingQuantity: balance.quantity,
          openingWeightKg: balance.weightKg,
          inboundQuantity: 0,
          inboundWeightKg: 0,
          issueQuantity: 0,
          issueWeightKg: 0,
          returnQuantity: 0,
          returnWeightKg: 0,
          wasteQuantity: 0,
          wasteWeightKg: 0,
          actualQuantity: 0,
          actualWeightKg: 0,
          balanceQuantity: balance.quantity,
          balanceWeightKg: balance.weightKg,
          isCarryForward: true,
        });
      });

    actualRows.forEach((row) => {
      const lotKey = [row.productCode, row.lotNo].join("|");
      const nextBalance = {
        quantity: normalizeDecimal(row?.balanceQuantity),
        weightKg: normalizeDecimal(row?.balanceWeightKg),
      };

      expandedRows.push({ ...row, isCarryForward: false });

      if (hasNonZeroBalance(nextBalance)) {
        activeBalanceByLot.set(lotKey, nextBalance);
      } else {
        activeBalanceByLot.delete(lotKey);
      }
    });
  });

  return expandedRows.sort(sortMovementRows);
}

export function buildProductionStockMovementSummary(rows) {
  const finalBalancesByLot = new Map();
  const openingBalancesByLot = new Map();
  const recalculatedRows = recalculateProductionStockMovementBalances(rows)
    .sort(sortAscendingMovementRows);

  return recalculatedRows.reduce(
    (summary, row) => {
      const balanceKey = [row.productCode, row.lotNo].join("|");
      if (!openingBalancesByLot.has(balanceKey)) {
        openingBalancesByLot.set(balanceKey, {
          quantity: normalizeDecimal(row?.openingQuantity),
          weightKg: normalizeDecimal(row?.openingWeightKg),
        });
      }
      finalBalancesByLot.set(balanceKey, {
        quantity: normalizeDecimal(row?.balanceQuantity),
        weightKg: normalizeDecimal(row?.balanceWeightKg),
      });

      summary.totalCount += 1;
      summary.openingQuantity = roundDecimal(
        Array.from(openingBalancesByLot.values()).reduce((sum, balance) => sum + balance.quantity, 0)
      );
      summary.openingWeightKg = roundDecimal(
        Array.from(openingBalancesByLot.values()).reduce((sum, balance) => sum + balance.weightKg, 0)
      );
      summary.inboundQuantity = roundDecimal(summary.inboundQuantity + normalizeDecimal(row?.inboundQuantity));
      summary.inboundWeightKg = roundDecimal(summary.inboundWeightKg + normalizeDecimal(row?.inboundWeightKg));
      summary.issueQuantity = roundDecimal(summary.issueQuantity + normalizeDecimal(row?.issueQuantity));
      summary.issueWeightKg = roundDecimal(summary.issueWeightKg + normalizeDecimal(row?.issueWeightKg));
      summary.returnQuantity = roundDecimal(summary.returnQuantity + normalizeDecimal(row?.returnQuantity));
      summary.returnWeightKg = roundDecimal(summary.returnWeightKg + normalizeDecimal(row?.returnWeightKg));
      summary.wasteQuantity = roundDecimal(summary.wasteQuantity + normalizeDecimal(row?.wasteQuantity));
      summary.wasteWeightKg = roundDecimal(summary.wasteWeightKg + normalizeDecimal(row?.wasteWeightKg));
      summary.actualQuantity = roundDecimal(summary.actualQuantity + normalizeDecimal(row?.actualQuantity));
      summary.actualWeightKg = roundDecimal(summary.actualWeightKg + normalizeDecimal(row?.actualWeightKg));
      summary.balanceQuantity = roundDecimal(
        Array.from(finalBalancesByLot.values()).reduce((sum, balance) => sum + balance.quantity, 0)
      );
      summary.balanceWeightKg = roundDecimal(
        Array.from(finalBalancesByLot.values()).reduce((sum, balance) => sum + balance.weightKg, 0)
      );

      return summary;
    },
    {
      totalCount: 0,
      openingQuantity: 0,
      openingWeightKg: 0,
      inboundQuantity: 0,
      inboundWeightKg: 0,
      issueQuantity: 0,
      issueWeightKg: 0,
      returnQuantity: 0,
      returnWeightKg: 0,
      wasteQuantity: 0,
      wasteWeightKg: 0,
      actualQuantity: 0,
      actualWeightKg: 0,
      balanceQuantity: 0,
      balanceWeightKg: 0,
    }
  );
}

export function buildCumulativeLotBalanceRows(rows) {
  const grouped = new Map();

  [...(Array.isArray(rows) ? rows : [])]
    .sort(sortAscendingMovementRows)
    .forEach((row) => {
      const productCode = normalizeUpperText(row?.productCode) || "-";
      const lotNo = normalizeText(row?.lotNo) || "-";
      const key = [productCode, lotNo].join("|");
      if (!grouped.has(key)) {
        grouped.set(key, {
          productCode,
          productName: normalizeText(row?.productName) || productCode,
          lotNo,
          openingQuantity: normalizeDecimal(row?.openingQuantity),
          openingWeightKg: normalizeDecimal(row?.openingWeightKg),
          inboundQuantity: 0,
          inboundWeightKg: 0,
          issueQuantity: 0,
          issueWeightKg: 0,
          returnQuantity: 0,
          returnWeightKg: 0,
          wasteQuantity: 0,
          wasteWeightKg: 0,
          actualQuantity: 0,
          actualWeightKg: 0,
          balanceQuantity: 0,
          balanceWeightKg: 0,
        });
      }

      const total = grouped.get(key);
      total.inboundQuantity = roundDecimal(total.inboundQuantity + normalizeDecimal(row?.inboundQuantity));
      total.inboundWeightKg = roundDecimal(total.inboundWeightKg + normalizeDecimal(row?.inboundWeightKg));
      total.issueQuantity = roundDecimal(total.issueQuantity + normalizeDecimal(row?.issueQuantity));
      total.issueWeightKg = roundDecimal(total.issueWeightKg + normalizeDecimal(row?.issueWeightKg));
      total.returnQuantity = roundDecimal(total.returnQuantity + normalizeDecimal(row?.returnQuantity));
      total.returnWeightKg = roundDecimal(total.returnWeightKg + normalizeDecimal(row?.returnWeightKg));
      total.wasteQuantity = roundDecimal(total.wasteQuantity + normalizeDecimal(row?.wasteQuantity));
      total.wasteWeightKg = roundDecimal(total.wasteWeightKg + normalizeDecimal(row?.wasteWeightKg));
      total.actualQuantity = roundDecimal(total.issueQuantity - total.returnQuantity + total.wasteQuantity);
      total.actualWeightKg = roundDecimal(total.issueWeightKg - total.returnWeightKg + total.wasteWeightKg);
      total.balanceQuantity = normalizeDecimal(row?.balanceQuantity);
      total.balanceWeightKg = normalizeDecimal(row?.balanceWeightKg);
    });

  return Array.from(grouped.values()).sort((left, right) => (
    left.productCode.localeCompare(right.productCode)
    || left.lotNo.localeCompare(right.lotNo)
  ));
}

export function buildProductionStockMovementRows(receiptRows, issueRows) {
  const grouped = new Map();

  const touchRow = (key, seed) => {
    if (!grouped.has(key)) {
      grouped.set(key, {
        issueDate: seed.issueDate,
        lotNo: seed.lotNo,
        productCode: seed.productCode,
        productName: seed.productName,
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 0,
        issueWeightKg: 0,
        returnQuantity: 0,
        returnWeightKg: 0,
        wasteQuantity: 0,
        wasteWeightKg: 0,
      });
    }

    return grouped.get(key);
  };

  (Array.isArray(receiptRows) ? receiptRows : []).forEach((row) => {
    const issueDate = normalizeText(row?.groupDate);
    const lotNo = normalizeText(row?.lotNo) || "-";
    const productCode = normalizeUpperText(row?.productCode) || "-";
    const productName = normalizeText(row?.productName) || "-";
    const key = [issueDate, lotNo, productCode].join("|");
    const groupedRow = touchRow(key, {
      issueDate,
      lotNo,
      productCode,
      productName,
    });

    groupedRow.inboundQuantity = roundDecimal(groupedRow.inboundQuantity + normalizeDecimal(row?.quantity));
    groupedRow.inboundWeightKg = roundDecimal(groupedRow.inboundWeightKg + normalizeDecimal(row?.totalNetWeightKg));
  });

  (Array.isArray(issueRows) ? issueRows : []).forEach((row) => {
    const issueDate = normalizeText(row?.issueDate);
    const lotNo = normalizeText(row?.lotNo) || "-";
    const productCode = normalizeUpperText(row?.productCode) || "-";
    const productName = normalizeText(row?.productName) || "-";
    const key = [issueDate, lotNo, productCode].join("|");
    const groupedRow = touchRow(key, {
      issueDate,
      lotNo,
      productCode,
      productName,
    });

    groupedRow.issueQuantity = roundDecimal(groupedRow.issueQuantity + normalizeDecimal(row?.quantity));
    groupedRow.issueWeightKg = roundDecimal(groupedRow.issueWeightKg + normalizeDecimal(row?.totalWeightKg));
  });

  return recalculateProductionStockMovementBalances(Array.from(grouped.values()));
}
