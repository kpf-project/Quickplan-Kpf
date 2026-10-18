import { NextResponse } from "next/server";
import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { baseQtyToConventionalTradeQty } from "@/lib/materialLotQuantity";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { allocateLotNumbersForExportRows } from "@/lib/requisitionLotExport";

export const dynamic = "force-dynamic";

function text(value) {
  return String(value || "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Number(number(value).toFixed(3));
}

function reservationLotKey(parentSkuCode, lotNo, warehouseCode) {
  return [text(parentSkuCode).toUpperCase(), text(lotNo), text(warehouseCode).toUpperCase()].join("|");
}

export async function POST(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const masterPlanNo = text(body?.masterPlanNo).toUpperCase();
    const requirements = Array.isArray(body?.requirements) ? body.requirements : [];
    if (requirements.length > 1500) {
      throw new ApiError(413, "มีรายการจัด LOT มากเกินไป");
    }

    const normalized = requirements
      .map((item) => ({
        key: text(item?.key),
        materialGoodsCode: text(item?.materialGoodsCode).toUpperCase(),
        materialName: text(item?.materialName),
        unit: text(item?.unit),
        qty: round(item?.qty),
        warehouseCode: text(item?.warehouseCode).toUpperCase(),
        documentKey: text(item?.documentKey),
        lineKey: text(item?.lineKey),
        dateValue: text(item?.dateValue),
        departmentName: text(item?.departmentName),
        roomLabel: text(item?.roomLabel),
        productCode: text(item?.productCode),
        productName: text(item?.productName),
        allocations: Array.isArray(item?.allocations) ? item.allocations : [],
      }))
      .filter((item) => item.key && item.materialGoodsCode && item.qty > 0);

    const reservationRows = masterPlanNo
      ? await getSupabaseAdmin()
          .from("production_requisition_lot_reservations")
          .select("reservation_key, parent_sku_code, lot_no, warehouse_code, reserved_base_qty, department_name, room_label, work_date, product_code, product_name")
          .eq("master_plan_no", masterPlanNo)
          .then(({ data, error }) => {
            if (error) throw error;
            return Array.isArray(data) ? data : [];
          })
      : [];

    const reservedBaseQtyByRequestKey = Object.fromEntries(normalized.map((item) => {
      const values = {};
      reservationRows
        .filter((row) => text(row?.reservation_key) !== item.key)
        .forEach((row) => {
          const key = reservationLotKey(row?.parent_sku_code, row?.lot_no, row?.warehouse_code);
          values[key] = round(number(values[key]) + number(row?.reserved_base_qty));
        });
      return [item.key, values];
    }));
    const reservationDetailsByRequestKey = Object.fromEntries(normalized.map((item) => {
      const values = {};
      reservationRows
        .filter((row) => text(row?.reservation_key) !== item.key)
        .forEach((row) => {
          const key = reservationLotKey(row?.parent_sku_code, row?.lot_no, row?.warehouse_code);
          const list = values[key] || [];
          list.push({
            departmentName: text(row?.department_name) || "-",
            roomLabel: text(row?.room_label) || "-",
            workDate: text(row?.work_date),
            productCode: text(row?.product_code),
            productName: text(row?.product_name) || "-",
            reservedBaseQty: number(row?.reserved_base_qty),
          });
          values[key] = list;
        });
      return [item.key, values];
    }));

    const exportRows = normalized.map((item) => ({
      code: item.materialGoodsCode,
      qty: item.qty,
      lot: "",
      location: item.warehouseCode,
    }));
    const lineRows = normalized.map((item, index) => ({
      doc_ref: item.key,
      line_seq: index + 1,
      sku_code: item.materialGoodsCode,
      sku_name: item.materialName || item.materialGoodsCode,
      qty: item.qty,
      uom: item.unit || null,
      warehouse_code: item.warehouseCode || null,
      meta: { lotAllocationKey: item.key },
    }));
    const allocationOverridesByKey = Object.fromEntries(
      normalized
        .filter((item) => item.allocations.length > 0)
        .map((item) => [item.key, item.allocations])
    );

    const allocated = await allocateLotNumbersForExportRows({
      exportRows,
      lineRows,
      codeKey: "code",
      qtyKey: "qty",
      lotKey: "lot",
      locationKey: "location",
      allowPartialStock: true,
      reserveAcrossRows: false,
      allocationOverridesByKey,
      reservedBaseQtyByRequestKey,
      reservationDetailsByRequestKey,
    });

    const result = Object.fromEntries(normalized.map((item) => [item.key, {
      requiredQty: item.qty,
      allocatedQty: 0,
      shortageQty: item.qty,
      complete: false,
      allocations: [],
      options: allocated.lotOptionsByRequestKey?.[item.key] || [],
    }]));

    allocated.lineRows.forEach((line) => {
      const meta = line?.meta?.fifoAllocation || {};
      const key = text(meta.requestKey || line?.doc_ref);
      const target = result[key];
      if (!target) return;
      const displayQty = round(baseQtyToConventionalTradeQty(
        meta.allocatedBaseQty,
        meta.conversionFactor || 1
      ));
      target.allocations.push({
        lotNo: text(line?.lot_no),
        qty: displayQty,
        tradeCode: text(line?.sku_code),
        unit: text(line?.uom),
        warehouseCode: text(line?.warehouse_code),
        fifoDate: meta.fifoDate || null,
      });
      target.allocatedQty = round(target.allocatedQty + displayQty);
    });

    Object.values(result).forEach((item) => {
      item.shortageQty = round(Math.max(0, item.requiredQty - item.allocatedQty));
      item.complete = item.shortageQty <= 0.001;
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
