function text(value) {
  return String(value || "").trim();
}

export function buildPlannedWipPreviewRows(lines = [], rooms = [], departmentId, dates = []) {
  const roomMap = new Map(rooms.filter((room) => room.requires_planning && room.is_active).map((room) => [text(room.id), room]));
  const rows = new Map();
  for (const line of lines) {
    const room = roomMap.get(text(line.sourceSectionDefId));
    const date = text(line.workDate);
    const qty = number(line.plannedQty);
    const skuCode = upper(line.skuCode);
    if (!room || text(line.departmentId) !== text(departmentId) || !dates.includes(date) || !skuCode || qty <= 0) continue;
    const unit = text(line.unit || line.planningUnit);
    const displayUnit = /^(batch|batches|set|sets)$/i.test(unit) ? "ชุด" : unit || "ไม่ระบุหน่วย";
    const key = JSON.stringify([text(room.id), skuCode, displayUnit]);
    if (!rows.has(key)) rows.set(key, { key, skuCode, skuName: text(line.skuName) || skuCode, sectionName: text(room.name), displayUnit, qtyByDate: {}, kgByDate: {}, totalQty: 0, totalKg: 0, weightIncomplete: false });
    const row = rows.get(key);
    row.qtyByDate[date] = round(number(row.qtyByDate[date]) + qty);
    row.totalQty = round(row.totalQty + qty);
    if (displayUnit === "ชุด") {
      const ratio = Number(line.kgPerBatch);
      if (Number.isFinite(ratio) && ratio > 0) {
        if (row.kgByDate[date] !== null) row.kgByDate[date] = number(row.kgByDate[date]) + qty * ratio;
        row.totalKg += qty * ratio;
      } else {
        row.kgByDate[date] = null;
        row.weightIncomplete = true;
      }
    }
  }
  return Array.from(rows.values()).sort((a, b) => a.sectionName.localeCompare(b.sectionName, "th") || a.skuCode.localeCompare(b.skuCode));
}

function upper(value) {
  return text(value).toUpperCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Number(number(value).toFixed(3));
}

export function resolveRequisitionPreviewCellQty({ line, column }) {
  if (!line || !column) return 0;
  if (column.isPlaceholder === true) {
    return number(line?.qtyByDate?.[column.dateValue]);
  }
  const hasPreviewColumnQuantities =
    line?.qtyByPreviewColumn
    && typeof line.qtyByPreviewColumn === "object";
  return hasPreviewColumnQuantities
    ? number(line.qtyByPreviewColumn?.[column.key])
    : number(line?.qtyByDate?.[column.dateValue]);
}

export function resolveRequisitionEditableDocumentKey(column, fallbackKey = "") {
  if (column?.exported === true) return "";
  const keys = [...new Set((column?.sourceDocumentKeys || []).map(text).filter(Boolean))];
  if (column?.isDailyRoomConsolidated && keys.length > 1) return "";
  return keys[0] || text(column?.sourceDocumentKey) || text(fallbackKey);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
}

function lineKey(line) {
  return `${upper(line?.materialGoodsCode || line?.materialSkuCode)}|${upper(line?.unit)}`;
}

export function mergeRequisitionDraftLines(sourceLines = [], draftLines = [], doc = null) {
  const sourceByKey = new Map(
    (Array.isArray(sourceLines) ? sourceLines : []).map((line) => [lineKey(line), line])
  );
  const draftByKey = new Map(
    (Array.isArray(draftLines) ? draftLines : []).map((line) => [lineKey(line), line])
  );

  const erpSyncedDates = new Set(
    Object.entries(doc?.exportedByDate || {}).filter(([, exported]) => exported === true).map(([date]) => date)
  );
  if (doc?.erpSyncByDate) {
    Object.entries(doc.erpSyncByDate).forEach(([dateValue, syncInfo]) => {
      if (syncInfo?.status && syncInfo.status !== "review") {
        erpSyncedDates.add(dateValue);
      }
    });
  }
  (Array.isArray(sourceLines) ? sourceLines : []).forEach((line) => {
    Object.entries(line?.erpLotsByDate || {}).forEach(([dateValue, rows]) => {
      if (Array.isArray(rows) && rows.length > 0) {
        erpSyncedDates.add(dateValue);
      }
    });
  });

  const hasDraft = Array.isArray(draftLines);
  const allKeys = new Set([...sourceByKey.keys(), ...draftByKey.keys()]);
  const result = [];

  allKeys.forEach((key) => {
    const source = sourceByKey.get(key);
    const draft = draftByKey.get(key);
    const reference = draft || source;
    const isDeletedInDraft = hasDraft && !draft;

    const allDates = new Set([
      ...Object.keys(source?.qtyByDate || {}),
      ...Object.keys(draft?.qtyByDate || {}),
    ]);

    const qtyByDate = {};
    allDates.forEach((dateValue) => {
      if (erpSyncedDates.has(dateValue)) {
        // ERP is the authoritative truth for synced dates
        const sourceQty = number(source?.qtyByDate?.[dateValue]);
        if (sourceQty > 0) {
          qtyByDate[dateValue] = round(sourceQty);
        }
      } else {
        // Unsynced dates retain draft edits
        if (isDeletedInDraft) {
          return;
        }
        const draftQty = draft?.qtyByDate?.[dateValue];
        const val = draftQty !== undefined
          ? number(draftQty)
          : (hasDraft ? 0 : number(source?.qtyByDate?.[dateValue]));
        if (val > 0) {
          qtyByDate[dateValue] = round(val);
        }
      }
    });

    const totalQty = round(Object.values(qtyByDate).reduce((sum, q) => sum + number(q), 0));
    const erpLotsByDate = source?.erpLotsByDate || {};
    const exportedLotsByDate = source?.exportedLotsByDate || draft?.exportedLotsByDate || {};
    const lotAllocationsByDate = draft?.lotAllocationsByDate || source?.lotAllocationsByDate || {};

    const hasErpLots = Object.values(erpLotsByDate).some((lots) => Array.isArray(lots) && lots.length > 0);
    const hasExportedLots = Object.values(exportedLotsByDate).some((lots) => Array.isArray(lots) && lots.length > 0);

    if (totalQty <= 0 && !hasErpLots && !hasExportedLots && !(draft?.isManual && !isDeletedInDraft && Object.keys(draft?.qtyByDate || {}).length === 0)) {
      return;
    }

    result.push({
      materialSkuCode: text(reference?.materialSkuCode),
      materialGoodsCode: text(reference?.materialGoodsCode || reference?.materialSkuCode),
      materialName: text(reference?.materialName),
      unit: text(reference?.unit),
      itemType: text(reference?.itemType || "RAW"),
      qtyByDate,
      totalQty,
      isManual: draft?.isManual === true || (source?.isManual === true && !isDeletedInDraft),
      lotAllocationsByDate,
      erpLotsByDate,
      exportedLotsByDate,
    });
  });

  return result.sort((a, b) =>
    text(a.materialGoodsCode).localeCompare(text(b.materialGoodsCode))
  );
}

export function upsertRequisitionSourceLineQty(lines = [], referenceLine, dateValue, nextQty) {
  const targetKey = lineKey(referenceLine);
  const normalizedDate = text(dateValue);
  const normalizedQty = round(nextQty);
  if (!targetKey || targetKey === "|" || !normalizedDate) {
    return Array.isArray(lines) ? lines : [];
  }

  const sourceLines = Array.isArray(lines) ? lines : [];
  const existingIndex = sourceLines.findIndex((line) => lineKey(line) === targetKey);
  if (existingIndex < 0 && normalizedQty <= 0) return sourceLines;

  const currentLine = existingIndex >= 0 ? sourceLines[existingIndex] : referenceLine;
  // A reference line may come from another requisition document and contain
  // quantities for that document's dates. When creating the line in the target
  // document, start empty so only the cell being edited is carried across.
  const qtyByDate = existingIndex >= 0
    ? { ...(currentLine?.qtyByDate || {}) }
    : {};
  if (normalizedQty > 0) {
    qtyByDate[normalizedDate] = normalizedQty;
  } else {
    delete qtyByDate[normalizedDate];
  }

  const updatedLine = {
    materialSkuCode: text(currentLine?.materialSkuCode),
    materialGoodsCode: text(currentLine?.materialGoodsCode || currentLine?.materialSkuCode),
    materialName: text(currentLine?.materialName),
    unit: text(currentLine?.unit),
    itemType: text(currentLine?.itemType),
    qtyByDate,
    totalQty: round(Object.values(qtyByDate).reduce((sum, qty) => sum + number(qty), 0)),
    isManual: currentLine?.isManual === true || existingIndex < 0,
    lotAllocationsByDate: { ...(currentLine?.lotAllocationsByDate || {}) },
  };

  if (existingIndex < 0) return [...sourceLines, updatedLine];
  return sourceLines.map((line, index) => (index === existingIndex ? updatedLine : line));
}

function documentDates(doc) {
  const dates = new Set();
  Object.keys(doc?.workNamesByDate || {}).forEach((dateValue) => {
    if (text(dateValue)) dates.add(text(dateValue));
  });
  Object.keys(doc?.documentNoByDate || {}).forEach((dateValue) => {
    if (text(dateValue)) dates.add(text(dateValue));
  });
  Object.keys(doc?.exportedByDate || {}).forEach((dateValue) => {
    if (text(dateValue)) dates.add(text(dateValue));
  });
  (Array.isArray(doc?.lines) ? doc.lines : []).forEach((line) => {
    Object.keys(line?.qtyByDate || {}).forEach((dateValue) => {
      if (text(dateValue)) dates.add(text(dateValue));
    });
  });
  if (!dates.size && text(doc?.workDate)) dates.add(text(doc.workDate));
  return Array.from(dates).sort((left, right) => left.localeCompare(right));
}

function displayCompatibilityKey(doc) {
  const splitGroup = upper(doc?.dispatchMaterialGroup) || "MERGED";
  const consolidationMode = doc?.consolidateRequisitionPreviewByDate === true
    ? "DAILY_ROOM_TOTAL"
    : "BY_PRODUCT";
  const discriminator = text(doc?.parentSku)
    ? "FG"
    : `SECTION:${upper(doc?.workstreamCode) || "DEFAULT"}`;
  return [
    text(doc?.ownerDepartmentId || doc?.ownerDepartmentCode || doc?.ownerDepartmentName) || "UNASSIGNED_OWNER",
    text(doc?.roomId || doc?.roomCode || doc?.roomLabel) || "UNASSIGNED_ROOM",
    upper(doc?.shiftCode || doc?.shiftId) || "UNASSIGNED_SHIFT",
    discriminator,
    splitGroup,
    consolidationMode,
  ].join("|");
}

function previewProduct(doc, dateValue, columnIndex) {
  const names = Array.isArray(doc?.workNamesByDate?.[dateValue])
    ? doc.workNamesByDate[dateValue].map(text).filter(Boolean)
    : [];
  const rawProductCode = upper(doc?.parentSku || doc?.workstreamCode);
  const productCode = isUuid(rawProductCode) || rawProductCode === "CONSOLIDATED" ? "" : rawProductCode;
  const productName = text(doc?.parentSkuName) || names.join(" / ") || productCode || "-";
  const sourceDocumentKey = text(doc?.documentKey);
  return {
    key: `${sourceDocumentKey}::${dateValue}::${columnIndex}`,
    dateValue,
    sourceDocumentKey,
    productCode,
    productName,
    workNames: names,
    documentNo: text(doc?.documentNoByDate?.[dateValue]),
    exported: doc?.exportedByDate?.[dateValue] === true,
  };
}

function consolidatePreviewColumnsByDate(previewColumns, lines) {
  const columnsByDate = new Map();
  previewColumns.forEach((column) => {
    if (!columnsByDate.has(column.dateValue)) columnsByDate.set(column.dateValue, []);
    columnsByDate.get(column.dateValue).push(column);
  });

  const consolidatedColumns = Array.from(columnsByDate, ([dateValue, columns]) => {
    const productKeys = new Set(
      columns.map((column) => column.productCode || column.productName).filter(Boolean)
    );
    const documentNos = Array.from(
      new Set(columns.map((column) => text(column.documentNo)).filter(Boolean))
    );
    return {
      key: `DAILY_ROOM_TOTAL::${dateValue}`,
      dateValue,
      sourceDocumentKey: columns[0]?.sourceDocumentKey || "",
      sourceDocumentKeys: columns.map((column) => column.sourceDocumentKey).filter(Boolean),
      productCode: "",
      productName: productKeys.size > 1 ? `รวม ${productKeys.size} สินค้า` : (columns[0]?.productName || ""),
      workNames: Array.from(new Set(columns.flatMap((column) => column.workNames || []))),
      documentNo: documentNos.join(" / "),
      exported: columns.length > 0 && columns.every((column) => column.exported === true),
      isDailyRoomConsolidated: true,
    };
  });

  const consolidatedByDate = new Map(
    consolidatedColumns.map((column) => [column.dateValue, column])
  );
  lines.forEach((line) => {
    const sourceQuantities = { ...(line.qtyByPreviewColumn || {}) };
    line.sourceQtyByPreviewColumn = sourceQuantities;
    line.breakdownByPreviewColumn = {};
    line.qtyByPreviewColumn = {};

    columnsByDate.forEach((columns, dateValue) => {
      const targetColumn = consolidatedByDate.get(dateValue);
      const breakdown = columns
        .map((column) => ({
          sourceDocumentKey: column.sourceDocumentKey,
          productCode: column.productCode,
          productName: column.productName,
          qty: round(sourceQuantities[column.key]),
        }))
        .filter((item) => item.qty > 0);
      const totalFromBreakdown = round(
        breakdown.reduce((sum, item) => sum + item.qty, 0)
      );
      const lineDateQty = round(number(line?.qtyByDate?.[dateValue]));
      const finalQty = totalFromBreakdown > 0 ? totalFromBreakdown : lineDateQty;
      line.qtyByPreviewColumn[targetColumn.key] = finalQty;
      if (!breakdown.length && finalQty > 0) {
        line.breakdownByPreviewColumn[targetColumn.key] = [{
          sourceDocumentKey: targetColumn.sourceDocumentKey || "",
          productCode: targetColumn.productCode || "",
          productName: targetColumn.productName || targetColumn.workNames?.join(" / ") || "",
          qty: finalQty,
        }];
      } else {
        line.breakdownByPreviewColumn[targetColumn.key] = breakdown;
      }
    });
  });

  return consolidatedColumns;
}

function mergeDocumentGroup(documents, compatibilityKey, groupIndex) {
  const first = documents[0];
  const sourceDocumentKeys = documents.map((doc) => doc.documentKey);
  const sourceDocumentKeyByDate = {};
  const productMap = new Map();
  const workNamesByDate = {};
  const documentNoByDate = {};
  const exportedByDate = {};
  const mergedLines = new Map();
  const previewColumns = [];

  documents.forEach((doc, documentIndex) => {
    const productCode = upper(doc?.parentSku);
    if (productCode) {
      productMap.set(productCode, text(doc?.parentSkuName) || productCode);
    }

    documentDates(doc).forEach((dateValue, dateIndex) => {
      sourceDocumentKeyByDate[dateValue] = doc.documentKey;
      previewColumns.push(previewProduct(doc, dateValue, `${documentIndex}-${dateIndex}`));
    });

    Object.entries(doc?.workNamesByDate || {}).forEach(([dateValue, names]) => {
      const target = new Set(workNamesByDate[dateValue] || []);
      (Array.isArray(names) ? names : []).forEach((name) => {
        if (text(name)) target.add(text(name));
      });
      workNamesByDate[dateValue] = Array.from(target);
    });

    Object.entries(doc?.documentNoByDate || {}).forEach(([dateValue, documentNo]) => {
      if (text(documentNo)) documentNoByDate[dateValue] = text(documentNo);
    });
    Object.entries(doc?.exportedByDate || {}).forEach(([dateValue, exported]) => {
      if (exported === true) exportedByDate[dateValue] = true;
    });

    (Array.isArray(doc?.lines) ? doc.lines : []).forEach((line) => {
      const key = lineKey(line);
      if (!mergedLines.has(key)) {
        mergedLines.set(key, {
          materialSkuCode: text(line?.materialSkuCode),
          materialGoodsCode: text(line?.materialGoodsCode || line?.materialSkuCode),
          materialName: text(line?.materialName),
          unit: text(line?.unit),
          itemType: text(line?.itemType),
          qtyByDate: {},
          qtyByPreviewColumn: {},
          totalQty: 0,
          isManual: line?.isManual === true,
          lotAllocationsByDate: {},
          erpLotsByDate: {},
          exportedLotsByDate: {},
        });
      }
      const target = mergedLines.get(key);
      ["lotAllocationsByDate", "erpLotsByDate", "exportedLotsByDate"].forEach((field) => {
        Object.entries(line?.[field] || {}).forEach(([dateValue, allocations]) => {
          target[field][dateValue] = [
            ...(target[field][dateValue] || []),
            ...(Array.isArray(allocations) ? allocations : []),
          ];
        });
      });
      Object.entries(line?.qtyByDate || {}).forEach(([dateValue, qty]) => {
        target.qtyByDate[dateValue] = round(number(target.qtyByDate[dateValue]) + number(qty));
        const column = previewColumns.find(
          (item) => item.sourceDocumentKey === doc.documentKey && item.dateValue === dateValue
        );
        if (column) target.qtyByPreviewColumn[column.key] = round(qty);
      });
      target.totalQty = round(Object.values(target.qtyByDate).reduce((sum, qty) => sum + number(qty), 0));
      if (line?.isManual === true) target.isManual = true;
    });
  });

  const products = Array.from(productMap, ([code, name]) => ({ code, name }));
  const dates = documents.flatMap(documentDates).sort((left, right) => left.localeCompare(right));
  previewColumns.sort((left, right) => {
    const dateCompare = left.dateValue.localeCompare(right.dateValue);
    if (dateCompare !== 0) return dateCompare;
    return left.productCode.localeCompare(right.productCode, "th");
  });

  const shouldConsolidateByDate = documents.every(
    (doc) => doc?.consolidateRequisitionPreviewByDate === true
  );
  const renderedPreviewColumns = shouldConsolidateByDate
    ? consolidatePreviewColumnsByDate(previewColumns, Array.from(mergedLines.values()))
    : previewColumns;

  return {
    ...first,
    documentKey: `PREVIEW|${compatibilityKey}|${groupIndex}`,
    parentSku: products.length === 1 ? products[0].code : null,
    parentSkuName: products.length === 1 ? products[0].name : null,
    previewProducts: products,
    previewProductCount: products.length || new Set(previewColumns.map((column) => column.productName)).size,
    previewColumns: renderedPreviewColumns,
    consolidateRequisitionPreviewByDate: shouldConsolidateByDate,
    sourceDocumentKeys,
    sourceDocumentKeyByDate,
    workDate: dates[0] || first.workDate,
    workNamesByDate,
    documentNoByDate,
    exportedByDate,
    lines: Array.from(mergedLines.values())
      .filter((line) => line.totalQty > 0 || line.isManual === true || Object.values(line.erpLotsByDate || {}).some((lots) => Array.isArray(lots) && lots.length > 0))
      .sort((left, right) =>
        text(left.materialGoodsCode).localeCompare(text(right.materialGoodsCode))
      ),
  };
}

export function buildRequisitionPreviewDocuments(documents = []) {
  const buckets = new Map();

  (Array.isArray(documents) ? documents : []).forEach((doc) => {
    const key = displayCompatibilityKey(doc);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(doc);
  });

  const result = [];
  buckets.forEach((bucket, compatibilityKey) => {
    const sortedDocuments = bucket
      .slice()
      .sort((left, right) => (documentDates(left)[0] || "").localeCompare(documentDates(right)[0] || ""));
    result.push(mergeDocumentGroup(sortedDocuments, compatibilityKey, 0));
  });

  return result.sort((left, right) => {
    const roomCompare = text(left.roomLabel || left.roomId).localeCompare(text(right.roomLabel || right.roomId), "th");
    if (roomCompare !== 0) return roomCompare;
    return (documentDates(left)[0] || "").localeCompare(documentDates(right)[0] || "");
  });
}
