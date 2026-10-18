function normalizeDecimal(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDestinationRoom(row) {
  if (row.issueType !== "KPF") return { code: "", name: "" };
  return {
    code: row.destinationRoomCode || "BISCUIT_PACKING",
    name: row.destinationRoomName || "ห้องบรรจุบิสกิต",
  };
}

export function buildProductionStockIssueSummaryRows(rows = []) {
  const groups = new Map();

  // Create virtual rows (split issues and returns if they occurred on different dates)
  const virtualRows = [];
  rows.forEach((row) => {
    const destinationRoom = getDestinationRoom(row);
    const issueStatus = row.documentStatus === "voided" || row.itemStatus === "voided"
      ? "voided"
      : "confirmed";
    // 1. Issue part
    virtualRows.push({
      issueStatus,
      date: row.issueDate,
      lotNo: row.lotNo,
      issueType: row.issueType,
      productCode: row.productCode,
      productName: row.productName,
      targetProductCode: row.targetProductCode || "",
      targetProductName: row.targetProductName || "",
      targetProductCategoryCode: row.targetProductCategoryCode || "",
      destinationRoomCode: destinationRoom.code,
      destinationRoomName: destinationRoom.name,
      quantity: normalizeDecimal(row.quantity),
      weightKg: normalizeDecimal(row.weightKg),
      returnQuantity: 0,
      returnWeightKg: 0,
      barcode: row.barcode,
      returnDate: null,
    });

    // 2. Return part
    if (normalizeDecimal(row.returnQuantity) > 0 || normalizeDecimal(row.returnWeightKg) > 0) {
      const returnDate = row.returnDate || row.issueDate;
      virtualRows.push({
        issueStatus,
        date: returnDate,
        lotNo: row.lotNo,
        issueType: row.issueType,
        productCode: row.productCode,
        productName: row.productName,
        targetProductCode: row.targetProductCode || "",
        targetProductName: row.targetProductName || "",
        targetProductCategoryCode: row.targetProductCategoryCode || "",
        destinationRoomCode: destinationRoom.code,
        destinationRoomName: destinationRoom.name,
        quantity: 0,
        weightKg: 0,
        returnQuantity: normalizeDecimal(row.returnQuantity),
        returnWeightKg: normalizeDecimal(row.returnWeightKg),
        barcode: row.barcode,
        returnDate: returnDate,
      });
    }
  });

  // Group by virtual row date
  virtualRows.forEach((vRow) => {
    const key = [
      vRow.date,
      vRow.lotNo,
      vRow.productCode,
      vRow.destinationRoomCode,
      vRow.issueType,
      vRow.issueStatus,
    ].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        issueStatus: vRow.issueStatus,
        issueDate: vRow.date,
        lotNo: vRow.lotNo,
        issueType: vRow.issueType,
        productCode: vRow.productCode,
        productName: vRow.productName,
        targetProductCode: vRow.targetProductCode,
        targetProductName: vRow.targetProductName,
        targetProductCategoryCode: vRow.targetProductCategoryCode,
        destinationRoomCode: vRow.destinationRoomCode,
        destinationRoomName: vRow.destinationRoomName,
        quantity: 0,
        totalWeightKg: 0,
        returnQuantity: 0,
        returnWeightKg: 0,
        barcodes: [],
        returnDates: [],
      });
    }

    const group = groups.get(key);
    group.quantity += vRow.quantity;
    group.totalWeightKg += vRow.weightKg;
    group.returnQuantity += vRow.returnQuantity;
    group.returnWeightKg += vRow.returnWeightKg;
    if (vRow.barcode && !group.barcodes.includes(vRow.barcode)) {
      group.barcodes.push(vRow.barcode);
    }
    if (vRow.returnDate && !group.returnDates.includes(vRow.returnDate)) {
      group.returnDates.push(vRow.returnDate);
    }
  });

  return Array.from(groups.values())
    .map((row) => ({
      ...row,
      quantity: Number(row.quantity.toFixed(3)),
      totalWeightKg: Number(row.totalWeightKg.toFixed(3)),
      returnQuantity: Number(row.returnQuantity.toFixed(3)),
      returnWeightKg: Number(row.returnWeightKg.toFixed(3)),
      actualQuantity: Number(Math.max(0, row.quantity - row.returnQuantity).toFixed(3)),
      actualWeightKg: Number(Math.max(0, row.totalWeightKg - row.returnWeightKg).toFixed(3)),
      returnDates: row.returnDates.sort(),
    }))
    .sort((left, right) => {
      if (left.issueDate !== right.issueDate) {
        return right.issueDate.localeCompare(left.issueDate);
      }
      if (left.lotNo !== right.lotNo) {
        return left.lotNo.localeCompare(right.lotNo);
      }
      if (left.productCode !== right.productCode) {
        return left.productCode.localeCompare(right.productCode);
      }
      return left.issueType.localeCompare(right.issueType);
    });
}

export function buildProductionStockIssueSummary(rows = [], { includeVoided = false } = {}) {
  return rows.filter((row) => includeVoided || row.issueStatus !== "voided").reduce(
    (summary, row) => ({
      totalCount: summary.totalCount + 1,
      totalQuantity: Number((summary.totalQuantity + normalizeDecimal(row.quantity)).toFixed(3)),
      totalWeightKg: Number((summary.totalWeightKg + normalizeDecimal(row.totalWeightKg)).toFixed(3)),
      totalReturnQuantity: Number((summary.totalReturnQuantity + normalizeDecimal(row.returnQuantity)).toFixed(3)),
      totalReturnWeightKg: Number((summary.totalReturnWeightKg + normalizeDecimal(row.returnWeightKg)).toFixed(3)),
      totalActualQuantity: Number((summary.totalActualQuantity + normalizeDecimal(row.actualQuantity)).toFixed(3)),
      totalActualWeightKg: Number((summary.totalActualWeightKg + normalizeDecimal(row.actualWeightKg)).toFixed(3)),
    }),
    {
      totalCount: 0,
      totalQuantity: 0,
      totalWeightKg: 0,
      totalReturnQuantity: 0,
      totalReturnWeightKg: 0,
      totalActualQuantity: 0,
      totalActualWeightKg: 0,
    }
  );
}
