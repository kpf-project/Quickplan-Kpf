function roundStock(value) {
  return Number(Number(value || 0).toFixed(3));
}

function createLotGroup(row) {
  return {
    lotNo: row.lotNo,
    productCode: row.productCode,
    productName: row.productName,
    openingQuantity: 0,
    openingWeightKg: 0,
    inboundQuantity: 0,
    inboundWeightKg: 0,
    issueQuantity: 0,
    issueWeightKg: 0,
    lastInboundDate: "",
    hasPeriodMovement: false,
  };
}

function isBeforePeriod(row, dateFrom) {
  return Boolean(dateFrom && row.issueDate && row.issueDate < dateFrom);
}

export function buildPrisonLotBalanceRows(inboundRows, issueRows, dateFrom) {
  const groups = new Map();

  const getGroup = (row) => {
    const key = [row.lotNo, row.productCode].join("|");
    if (!groups.has(key)) {
      groups.set(key, createLotGroup(row));
    }
    return groups.get(key);
  };

  inboundRows.forEach((row) => {
    const group = getGroup(row);
    if (isBeforePeriod(row, dateFrom)) {
      group.openingQuantity += row.quantity || 0;
      group.openingWeightKg += row.weightKg || 0;
    } else {
      group.inboundQuantity += row.quantity || 0;
      group.inboundWeightKg += row.weightKg || 0;
      group.hasPeriodMovement = true;
    }

    if (!group.lastInboundDate || row.issueDate > group.lastInboundDate) {
      group.lastInboundDate = row.issueDate;
    }
  });

  issueRows.forEach((row) => {
    const group = getGroup(row);
    if (isBeforePeriod(row, dateFrom)) {
      group.openingQuantity -= row.quantity || 0;
      group.openingWeightKg -= row.weightKg || 0;
    } else {
      group.issueQuantity += row.quantity || 0;
      group.issueWeightKg += row.weightKg || 0;
      group.hasPeriodMovement = true;
    }
  });

  return Array.from(groups.values())
    .map((row) => {
      const openingQuantity = roundStock(row.openingQuantity);
      const openingWeightKg = roundStock(row.openingWeightKg);
      const inboundQuantity = roundStock(row.inboundQuantity);
      const inboundWeightKg = roundStock(row.inboundWeightKg);
      const issueQuantity = roundStock(row.issueQuantity);
      const issueWeightKg = roundStock(row.issueWeightKg);

      return {
        lotNo: row.lotNo,
        productCode: row.productCode,
        productName: row.productName,
        openingQuantity,
        openingWeightKg,
        inboundQuantity,
        inboundWeightKg,
        issueQuantity,
        issueWeightKg,
        balanceQuantity: roundStock(openingQuantity + inboundQuantity - issueQuantity),
        balanceWeightKg: roundStock(openingWeightKg + inboundWeightKg - issueWeightKg),
        lastInboundDate: row.lastInboundDate,
        hasPeriodMovement: row.hasPeriodMovement,
      };
    })
    .filter((row) => (
      row.hasPeriodMovement
      || row.openingQuantity !== 0
      || row.openingWeightKg !== 0
    ))
    .map(({ hasPeriodMovement, ...row }) => row)
    .sort((left, right) => {
      if (left.lotNo !== right.lotNo) {
        return left.lotNo.localeCompare(right.lotNo);
      }
      return left.productCode.localeCompare(right.productCode);
    });
}
