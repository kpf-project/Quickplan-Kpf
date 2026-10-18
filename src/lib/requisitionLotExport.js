import "server-only";

import { ApiError } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import {
  baseQtyToConventionalTradeQty,
  conventionalPackQtyToBaseQty,
} from "@/lib/materialLotQuantity";
import {
  allocatePreferredPhysicalBaseQty,
  compareLotsByEncodedDate,
} from "@/lib/requisitionLotAllocation";
import { resolveRequisitionStorageLocation } from "@/lib/requisitionStorageLocation";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Number(Number(value || 0).toFixed(6));
}

function reservationLotKey(parentSkuCode, lotNo, warehouseCode) {
  return [normalizeCode(parentSkuCode), normalizeText(lotNo), normalizeCode(warehouseCode)].join("|");
}

function getTradePackSize(row) {
  const rawValue = row?.UTQ_QTY_2 ?? row?.UTQ_QTY ?? row?.UTQ_QTY_1;
  if (rawValue === undefined || rawValue === null || rawValue === "") return Number.NaN;
  return Number(rawValue);
}

function addTradeRowsToMap(map, rows) {
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const exactRow = row;
    const rowCode = normalizeCode(row?.GOODS_CODE);
    const parentSkuCode = normalizeCode(row?.SKU_CODE);
    const packSize = getTradePackSize(row);
    if (!rowCode || !parentSkuCode || !Number.isFinite(packSize) || packSize <= 0) return;
    map.set(rowCode, {
      parentSkuCode,
      tradeCode: rowCode,
      materialName: normalizeText(row.SKU_NAME) || normalizeText(row.GOODS_ALIAS) || rowCode,
      unitName: normalizeText(row.UTQ_NAME_2 || row.UTQ_NAME || row.UTQ_NAME_1),
      packSize,
      categoryCode: normalizeCode(exactRow.ICCAT_CODE),
    });
  });
}

async function fetchTradeCodeMetaMap(codes) {
  const uniqueCodes = Array.from(new Set(codes.map(normalizeCode).filter(Boolean)));
  const map = new Map();
  if (!uniqueCodes.length) return map;

  const exactParams = new URLSearchParams({
    goodsCodes: uniqueCodes.join(","),
    pageSize: "500",
    noCache: "1",
  });
  const exactResult = await fetchGatewayJson("/api/trade-codes", exactParams, "production");
  if (!exactResult.ok) {
    throw new ApiError(502, "ไม่สามารถตรวจสอบ Trade Code จาก ERP ได้", {
      tradeCodes: uniqueCodes,
      source: "gateway:/api/trade-codes",
    });
  }
  addTradeRowsToMap(map, exactResult.data?.data);

  const missingCode = uniqueCodes.find((code) => !map.has(code));
  if (missingCode) {
    throw new ApiError(422, `ไม่พบ Trade Code ${missingCode} หรือข้อมูลหน่วยไม่สมบูรณ์`, {
      tradeCode: missingCode,
      source: "gateway:/api/trade-codes",
    });
  }

  const parentCodes = Array.from(new Set(uniqueCodes.map((code) => map.get(code)?.parentSkuCode).filter(Boolean)));
  if (parentCodes.length > 0) {
    const parentParams = new URLSearchParams({
      skuCodes: parentCodes.join(","),
      pageSize: "500",
      noCache: "1",
    });
    const parentResult = await fetchGatewayJson("/api/trade-codes", parentParams, "production");
    if (!parentResult.ok) {
      throw new ApiError(502, "ไม่สามารถโหลดหน่วยทั้งหมดของวัตถุดิบจาก ERP ได้", {
        parentSkuCodes: parentCodes,
        source: "gateway:/api/trade-codes",
      });
    }
    addTradeRowsToMap(map, parentResult.data?.data);
  }

  return map;
}

async function fetchLotsByParentCode(parentCodes) {
  const uniqueParentCodes = Array.from(new Set(parentCodes.map(normalizeCode).filter(Boolean)));
  const lotsByParentCode = new Map();
  if (!uniqueParentCodes.length) return lotsByParentCode;

  const params = new URLSearchParams({
    parentCodes: uniqueParentCodes.join(","),
    noCache: "1",
  });
  const result = await fetchGatewayJson("/api/raw-material-lots-by-parent", params, "production");
  if (!result.ok) {
    return lotsByParentCode;
  }

  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  rows.forEach((row) => {
    const parentCode = normalizeCode(row?.PARENT_SKU_CODE || row?.SKU_CODE);
    const warehouseCode = normalizeCode(row?.WL_CODE || row?.WAREHOUSE_CODE);
    const lotNo = normalizeText(row?.SKM_LOT_NO);
    const rawQty = toNumber(row?.QTY, 0);
    const stockPackSize = toNumber(row?.STOCK_PACK_SIZE ?? row?.UTQ_QTY, 1) || 1;
    const availableBaseQty = rawQty > 0
      ? conventionalPackQtyToBaseQty(rawQty, stockPackSize)
      : 0;
    if (!parentCode || !warehouseCode || availableBaseQty <= 0) return;

    const list = lotsByParentCode.get(parentCode) || [];
    list.push({
      lotNo,
      fifoDate: normalizeText(row?.FIFO_DATE),
      warehouseCode,
      stockPackSize,
      stockUnitName: normalizeText(row?.STOCK_UNIT_NAME),
      availableBaseQty,
    });
    lotsByParentCode.set(parentCode, list);
  });

  lotsByParentCode.forEach((lots) => {
    lots.sort(compareLotsByEncodedDate);
  });

  return lotsByParentCode;
}

function cloneExportRow(row, qtyKey, lotKey, locationKey, qty, lotNo, warehouseCode) {
  const nextRow = {
    ...row,
    [qtyKey]: roundQty(qty),
    [lotKey]: lotNo || "",
  };
  if (locationKey) nextRow[locationKey] = warehouseCode;
  return nextRow;
}

function findActualTradeMeta(tradeMetaMap, parentSkuCode, packSize) {
  const candidates = Array.from(tradeMetaMap.values()).filter((meta) => (
    meta.parentSkuCode === parentSkuCode
    && Math.abs(meta.packSize - packSize) < 1e-9
  ));
  return candidates.sort((left, right) => left.tradeCode.localeCompare(right.tradeCode))[0] || null;
}

function cloneLineRow(row, qty, lotNo, warehouseCode, actualTradeMeta = null, allocationMeta = null) {
  return {
    ...row,
    qty: roundQty(qty),
    sku_code: actualTradeMeta?.tradeCode || row?.sku_code,
    uom: actualTradeMeta?.unitName || row?.uom,
    lot_no: lotNo || null,
    warehouse_code: warehouseCode,
    meta: allocationMeta
      ? { ...(row?.meta || {}), fifoAllocation: allocationMeta }
      : row?.meta,
  };
}

function renumberLineSeq(lineRows) {
  const nextSeqByDocRef = new Map();
  return lineRows.map((row) => {
    const docRef = String(row?.doc_ref || "").trim();
    const nextSeq = (nextSeqByDocRef.get(docRef) || 0) + 1;
    nextSeqByDocRef.set(docRef, nextSeq);
    return {
      ...row,
      line_seq: nextSeq,
    };
  });
}

export async function allocateLotNumbersForExportRows({
  exportRows,
  lineRows,
  codeKey,
  qtyKey,
  lotKey,
  locationKey,
  allowPartialStock = false,
  reserveAcrossRows = true,
  allocationOverridesByKey = {},
  reservedBaseQtyByRequestKey = {},
  reservationDetailsByRequestKey = {},
}) {
  const rows = Array.isArray(exportRows) ? exportRows : [];
  const dbRows = Array.isArray(lineRows) ? lineRows : [];
  if (!rows.length) {
    return { exportRows: rows, lineRows: dbRows };
  }
  if (rows.length !== dbRows.length) {
    throw new ApiError(500, "จำนวนบรรทัด Excel และรายการใบเบิกไม่ตรงกัน จึงไม่สามารถจัด LOT ได้", {
      exportRowCount: rows.length,
      lineRowCount: dbRows.length,
    });
  }

  const materialCodes = rows.map((row) => row?.[codeKey]);
  const tradeMetaMap = await fetchTradeCodeMetaMap(materialCodes);
  const parentCodes = materialCodes.map((code) => {
    const meta = tradeMetaMap.get(normalizeCode(code));
    return meta.parentSkuCode;
  });
  const lotsByParentCode = await fetchLotsByParentCode(parentCodes);
  const remainingLotsByParentCode = new Map();

  // Allocate pack requests first so full packs are reserved before base-unit
  // requests can open them, but keep the final Excel rows in BOM order.
  const exportRowsByIndex = rows.map(() => []);
  const lineRowsByIndex = rows.map(() => []);
  const shortages = [];
  const lotOptionsByRequestKey = {};

  const processingIndexes = rows
    .map((row, index) => ({
      index,
      packSize: tradeMetaMap.get(normalizeCode(row?.[codeKey]))?.packSize || 1,
    }))
    .sort((left, right) => {
      const leftIsPack = left.packSize > 1 ? 1 : 0;
      const rightIsPack = right.packSize > 1 ? 1 : 0;
      if (leftIsPack !== rightIsPack) return rightIsPack - leftIsPack;
      return left.index - right.index;
    })
    .map((item) => item.index);

  processingIndexes.forEach((index) => {
    const row = rows[index];
    const lineRow = dbRows[index];
    const materialCode = normalizeCode(row?.[codeKey]);
    const tradeMeta = tradeMetaMap.get(materialCode);
    if (!tradeMeta) {
      throw new ApiError(422, `ไม่พบข้อมูล Trade Code ${materialCode} สำหรับจัด LOT`, {
        tradeCode: materialCode,
      });
    }
    const requiredTradeQty = toNumber(row?.[qtyKey], 0);
    const requestedWarehouseCode = locationKey ? normalizeCode(row?.[locationKey]) : "";
    const requiredWarehouseCode = tradeMeta.categoryCode
      ? resolveRequisitionStorageLocation({
          categoryCode: tradeMeta.categoryCode,
          materialSkuCode: tradeMeta.parentSkuCode,
          materialGoodsCode: materialCode,
        })
      : requestedWarehouseCode;
    const requiredBaseQty = requiredTradeQty > 0
      ? conventionalPackQtyToBaseQty(requiredTradeQty, tradeMeta.packSize)
      : 0;

    if (requiredBaseQty <= 0) {
      exportRowsByIndex[index].push(cloneExportRow(
        row,
        qtyKey,
        lotKey,
        locationKey,
        requiredTradeQty,
        "",
        requiredWarehouseCode
      ));
      lineRowsByIndex[index].push(cloneLineRow(
        lineRow,
        requiredTradeQty,
        "",
        requiredWarehouseCode
      ));
      return;
    }

    const parentCode = tradeMeta.parentSkuCode;
    const requestKey = normalizeText(lineRow?.meta?.lotAllocationKey) || String(index);
    if (!reserveAcrossRows || !remainingLotsByParentCode.has(parentCode)) {
      const sourceLots = lotsByParentCode.get(parentCode) || [];
      remainingLotsByParentCode.set(parentCode, sourceLots.map((lot) => ({
        ...lot,
        stockAvailableBaseQty: lot.availableBaseQty,
        reservedByOtherBaseQty: Math.min(
          lot.availableBaseQty,
          Math.max(0, toNumber(reservedBaseQtyByRequestKey?.[requestKey]?.[
            reservationLotKey(parentCode, lot.lotNo, lot.warehouseCode)
          ], 0))
        ),
        availableBaseQty: Math.max(0, lot.availableBaseQty - Math.max(0, toNumber(
          reservedBaseQtyByRequestKey?.[requestKey]?.[
            reservationLotKey(parentCode, lot.lotNo, lot.warehouseCode)
          ], 0
        ))),
        initialAvailableBaseQty: Math.max(0, lot.availableBaseQty - Math.max(0, toNumber(
          reservedBaseQtyByRequestKey?.[requestKey]?.[
            reservationLotKey(parentCode, lot.lotNo, lot.warehouseCode)
          ], 0
        ))),
      })));
    }

    const lots = (remainingLotsByParentCode.get(parentCode) || []).filter((lot) => (
      !requiredWarehouseCode || lot.warehouseCode === requiredWarehouseCode
    ));
    const sourcePriority = tradeMeta.packSize > 1
      ? ["pack", "base"]
      : ["base", "pack"];
    lotOptionsByRequestKey[requestKey] = lots.map((lot) => ({
      lotNo: lot.lotNo || "",
      fifoDate: lot.fifoDate || null,
      warehouseCode: lot.warehouseCode,
      parentSkuCode: parentCode,
      stockQty: roundQty(baseQtyToConventionalTradeQty(
        lot.stockAvailableBaseQty ?? lot.initialAvailableBaseQty,
        tradeMeta.packSize
      )),
      stockAvailableBaseQty: roundQty(lot.stockAvailableBaseQty ?? lot.initialAvailableBaseQty),
      reservedByOtherQty: roundQty(baseQtyToConventionalTradeQty(
        lot.reservedByOtherBaseQty || 0,
        tradeMeta.packSize
      )),
      reservedByOtherDetails: (reservationDetailsByRequestKey?.[requestKey]?.[
        reservationLotKey(parentCode, lot.lotNo, lot.warehouseCode)
      ] || []).map((detail) => ({
        ...detail,
        qty: roundQty(baseQtyToConventionalTradeQty(detail.reservedBaseQty, tradeMeta.packSize)),
      })),
      availableQty: roundQty(baseQtyToConventionalTradeQty(lot.availableBaseQty, tradeMeta.packSize)),
      reservedQty: roundQty(baseQtyToConventionalTradeQty(
        Math.max(0, lot.initialAvailableBaseQty - lot.availableBaseQty),
        tradeMeta.packSize
      )),
      availableBaseQty: roundQty(lot.availableBaseQty),
    }));

    const requestedOverrides = Array.isArray(allocationOverridesByKey?.[requestKey])
      ? allocationOverridesByKey[requestKey]
          .map((item) => ({
            lotNo: normalizeText(item?.lotNo),
            qty: roundQty(item?.qty),
          }))
          .filter((item) => item.qty > 0)
      : [];

    let allocationResult;
    if (requestedOverrides.length > 0) {
      const overrideTotal = roundQty(requestedOverrides.reduce((sum, item) => sum + item.qty, 0));
      if (overrideTotal - requiredTradeQty > 0.001 || (!allowPartialStock && requiredTradeQty - overrideTotal > 0.001)) {
        throw new ApiError(409, `ยอดจัดสรร LOT ของ ${materialCode} ไม่สอดคล้องกับจำนวนที่ต้องเบิก`, {
          requestKey,
          requiredQty: requiredTradeQty,
          allocatedQty: overrideTotal,
        });
      }

      const manualAllocations = [];
      let manualShortageBaseQty = roundQty(
        requiredBaseQty - conventionalPackQtyToBaseQty(overrideTotal, tradeMeta.packSize)
      );
      requestedOverrides.forEach((override) => {
        const overrideBaseQty = conventionalPackQtyToBaseQty(override.qty, tradeMeta.packSize);
        const lot = lots.find((candidate) => normalizeText(candidate?.lotNo) === override.lotNo);
        if (!lot) {
          if (allowPartialStock) {
            manualShortageBaseQty = roundQty(manualShortageBaseQty + overrideBaseQty);
            return;
          }
          throw new ApiError(409, `LOT ${override.lotNo || "ไม่ระบุ LOT"} ของ ${materialCode} ไม่มีสต็อกพร้อมใช้`, {
            requestKey,
            tradeCode: materialCode,
            lotNo: override.lotNo || null,
          });
        }
        const result = allocatePreferredPhysicalBaseQty(overrideBaseQty, [lot], sourcePriority);
        manualAllocations.push(...result.allocations);
        manualShortageBaseQty = roundQty(manualShortageBaseQty + result.unallocatedBaseQty);
      });
      if (manualShortageBaseQty > 0 && !allowPartialStock) {
        throw new ApiError(409, `สต็อก LOT ที่เลือกของ ${materialCode} ไม่เพียงพอ`, {
          requestKey,
          tradeCode: materialCode,
          shortageBaseQty: manualShortageBaseQty,
        });
      }
      allocationResult = { allocations: manualAllocations, unallocatedBaseQty: manualShortageBaseQty };
    } else {
      allocationResult = allocatePreferredPhysicalBaseQty(requiredBaseQty, lots, sourcePriority);
    }
    const { allocations, unallocatedBaseQty } = allocationResult;
    if (unallocatedBaseQty > 0) {
      const allocatedBaseQty = roundQty(requiredBaseQty - unallocatedBaseQty);
      const shortage = {
        docRef: String(lineRow?.doc_ref || "").trim() || null,
        tradeCode: materialCode,
        parentSkuCode: parentCode,
        warehouseCode: requiredWarehouseCode,
        requestedQty: requiredTradeQty,
        requestedUnit: tradeMeta.unitName,
        conversionFactor: tradeMeta.packSize,
        requiredBaseQty: roundQty(requiredBaseQty),
        allocatedBaseQty,
        shortageBaseQty: roundQty(unallocatedBaseQty),
      };
      if (!allowPartialStock) {
        throw new ApiError(409, `สต็อก ${materialCode} ไม่เพียงพอสำหรับจัด LOT ตาม FIFO`, shortage);
      }
      shortages.push(shortage);
    }
    allocations.forEach(({ lot, allocatedBaseQty, sourceKind }) => {
      const actualPackSize = sourceKind === "base" ? 1 : lot.stockPackSize;
      const actualTradeMeta = findActualTradeMeta(tradeMetaMap, parentCode, actualPackSize);
      if (!actualTradeMeta) {
        throw new ApiError(422, `ไม่พบ Trade Code หน่วยที่จ่ายจริงของ ${parentCode}`, {
          parentSkuCode: parentCode,
          requestedTradeCode: materialCode,
          actualPackSize,
          sourceKind,
        });
      }
      const allocatedTradeQty = baseQtyToConventionalTradeQty(allocatedBaseQty, actualPackSize);
      exportRowsByIndex[index].push(cloneExportRow(
        { ...row, [codeKey]: actualTradeMeta.tradeCode },
        qtyKey,
        lotKey,
        locationKey,
        allocatedTradeQty,
        lot.lotNo,
        requiredWarehouseCode
      ));
      lineRowsByIndex[index].push(cloneLineRow(
        lineRow,
        allocatedTradeQty,
        lot.lotNo,
        requiredWarehouseCode,
        actualTradeMeta,
        {
          parentSkuCode: parentCode,
          requestedTradeCode: materialCode,
          requestedTradeQty: requiredTradeQty,
          requestedUnit: tradeMeta.unitName,
          conversionFactor: tradeMeta.packSize,
          actualTradeCode: actualTradeMeta.tradeCode,
          actualTradeQty: roundQty(allocatedTradeQty),
          actualUnit: actualTradeMeta.unitName,
          actualConversionFactor: actualPackSize,
          stockSourceKind: sourceKind,
          requestedBaseQty: roundQty(requiredBaseQty),
          allocatedBaseQty: roundQty(allocatedBaseQty),
          lotNo: lot.lotNo || null,
          warehouseCode: requiredWarehouseCode,
          fifoDate: lot.fifoDate || null,
          requestKey,
        }
      ));
    });
  });

  const nextExportRows = exportRowsByIndex.flat();
  const nextLineRows = lineRowsByIndex.flat();

  return {
    exportRows: nextExportRows,
    lineRows: renumberLineSeq(nextLineRows),
    shortages,
    isPartialStock: shortages.length > 0,
    lotOptionsByRequestKey,
  };
}
