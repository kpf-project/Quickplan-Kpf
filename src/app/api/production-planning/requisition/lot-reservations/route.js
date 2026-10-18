import { NextResponse } from "next/server";
import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
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
  return Number(number(value).toFixed(6));
}

function reservationLotKey(parentSkuCode, lotNo, warehouseCode) {
  return [text(parentSkuCode).toUpperCase(), text(lotNo), text(warehouseCode).toUpperCase()].join("|");
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);
    const body = await readJson(request);
    const masterPlanNo = text(body?.masterPlanNo).toUpperCase();
    if (!masterPlanNo) throw new ApiError(400, "masterPlanNo is required");

    const updates = Array.isArray(body?.updates) ? body.updates : [];
    const releaseKeys = Array.from(new Set([
      ...(Array.isArray(body?.releaseKeys) ? body.releaseKeys : []),
      ...updates.map((item) => item?.key),
    ].map(text).filter(Boolean)));
    const updateMap = new Map(updates.map((item) => [text(item?.key), item]));
    const requirements = (Array.isArray(body?.requirements) ? body.requirements : [])
      .map((item) => ({
        key: text(item?.key),
        documentKey: text(item?.documentKey),
        lineKey: text(item?.lineKey),
        dateValue: text(item?.dateValue).slice(0, 10),
        materialGoodsCode: text(item?.materialGoodsCode).toUpperCase(),
        materialName: text(item?.materialName),
        unit: text(item?.unit),
        qty: round(item?.qty),
        warehouseCode: text(item?.warehouseCode).toUpperCase(),
        departmentName: text(item?.departmentName),
        roomLabel: text(item?.roomLabel),
        productCode: text(item?.productCode),
        productName: text(item?.productName),
      }))
      .filter((item) => updateMap.has(item.key) && item.documentKey && item.lineKey && item.dateValue && item.materialGoodsCode && item.qty > 0);

    if (requirements.length !== updateMap.size) {
      throw new ApiError(400, "ข้อมูลรายการ LOT ไม่ครบ กรุณาโหลดหน้า Preview ใหม่");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: reservations, error: reservationsError } = await supabaseAdmin
      .from("production_requisition_lot_reservations")
      .select("reservation_key, parent_sku_code, lot_no, warehouse_code, reserved_base_qty")
      .eq("master_plan_no", masterPlanNo);
    if (reservationsError) throw reservationsError;

    const reservedBaseQtyByRequestKey = Object.fromEntries(requirements.map((item) => {
      const values = {};
      (reservations || [])
        .filter((row) => !releaseKeys.includes(text(row?.reservation_key)))
        .forEach((row) => {
          const key = reservationLotKey(row?.parent_sku_code, row?.lot_no, row?.warehouse_code);
          values[key] = round(number(values[key]) + number(row?.reserved_base_qty));
        });
      return [item.key, values];
    }));
    const allocationOverridesByKey = Object.fromEntries(requirements.map((item) => [
      item.key,
      Array.isArray(updateMap.get(item.key)?.allocations) ? updateMap.get(item.key).allocations : [],
    ]));
    const exportRows = requirements.map((item) => ({
      code: item.materialGoodsCode,
      qty: item.qty,
      lot: "",
      location: item.warehouseCode,
    }));
    const lineRows = requirements.map((item, index) => ({
      doc_ref: item.key,
      line_seq: index + 1,
      sku_code: item.materialGoodsCode,
      sku_name: item.materialName || item.materialGoodsCode,
      qty: item.qty,
      uom: item.unit || null,
      warehouse_code: item.warehouseCode || null,
      meta: { lotAllocationKey: item.key },
    }));
    const allocated = await allocateLotNumbersForExportRows({
      exportRows,
      lineRows,
      codeKey: "code",
      qtyKey: "qty",
      lotKey: "lot",
      locationKey: "location",
      reserveAcrossRows: false,
      allocationOverridesByKey,
      reservedBaseQtyByRequestKey,
    });

    const requirementByKey = new Map(requirements.map((item) => [item.key, item]));
    const rows = allocated.lineRows.map((line) => {
      const allocation = line?.meta?.fifoAllocation || {};
      const requirement = requirementByKey.get(text(allocation?.requestKey));
      if (!requirement || !line?.lot_no || number(allocation?.allocatedBaseQty) <= 0) return null;
      return {
        reservation_key: requirement.key,
        document_key: requirement.documentKey,
        line_key: requirement.lineKey,
        work_date: requirement.dateValue,
        department_name: requirement.departmentName || null,
        room_label: requirement.roomLabel || null,
        product_code: requirement.productCode || null,
        product_name: requirement.productName || null,
        material_goods_code: requirement.materialGoodsCode,
        material_name: requirement.materialName || null,
        unit_name: requirement.unit || null,
        parent_sku_code: allocation.parentSkuCode,
        trade_code: line.sku_code,
        lot_no: line.lot_no,
        warehouse_code: line.warehouse_code,
        reserved_qty: line.qty,
        reserved_base_qty: allocation.allocatedBaseQty,
      };
    }).filter(Boolean);
    const stockByLot = new Map();
    Object.values(allocated.lotOptionsByRequestKey || {}).flat().forEach((option) => {
      const key = reservationLotKey(option?.parentSkuCode, option?.lotNo, option?.warehouseCode);
      stockByLot.set(key, {
        parent_sku_code: option.parentSkuCode,
        lot_no: option.lotNo,
        warehouse_code: option.warehouseCode,
        available_base_qty: option.stockAvailableBaseQty,
      });
    });

    const { error: replaceError } = await supabaseAdmin.rpc("replace_requisition_lot_reservations", {
      p_master_plan_no: masterPlanNo,
      p_reservation_keys: releaseKeys,
      p_rows: rows,
      p_stock_by_lot: Array.from(stockByLot.values()),
      p_user_id: permission.userId || null,
    });
    if (replaceError) {
      throw new ApiError(409, replaceError.message || "ไม่สามารถบันทึกการจอง LOT ได้");
    }

    return NextResponse.json({ data: { reservationKeys: releaseKeys, count: rows.length } });
  } catch (error) {
    return jsonError(error);
  }
}
