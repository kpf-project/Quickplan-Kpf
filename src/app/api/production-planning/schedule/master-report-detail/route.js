import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  loadApprovedWipVersionMetaBySkus,
  loadGatewayProductMetaBySkus,
  loadProductsMetaBySkus,
  normalizeSku,
  roundQty,
} from "@/lib/wipPlanning";
import {
  loadMainPlanRowsForClaimDemand,
  loadSubplanRowsForClaimDemand,
} from "@/lib/materialClaimPool";
import {
  aggregateMaterialDemand,
  MATERIAL_DEMAND_SOURCES,
} from "@/lib/materialClaims";

export const dynamic = "force-dynamic";

function normalizeParam(value) {
  return String(value || "").trim() || null;
}

function normalizeDateOnly(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeMaterialKey(material = {}) {
  const goodsCode = normalizeCode(
    material?.goodsCode || material?.materialGoodsCode || material?.material_goods_code || material?.code
  );
  const skuCode = normalizeCode(material?.skuCode || material?.material_sku_code || material?.sku);
  return `${goodsCode || skuCode || "UNKNOWN"}::${skuCode || goodsCode || "UNKNOWN"}`;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUnitKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isBatchLikeUnit(value) {
  const normalized = normalizeUnitKey(value);
  return normalized === "batch" || normalized === "batches" || normalized === "ชุด" || normalized === "set";
}

async function loadBomVersionMetaByIds(supabaseAdmin, versionIds = []) {
  const ids = Array.from(
    new Set((versionIds || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!ids.length) return new Map();

  const result = await supabaseAdmin
    .from("production_bom_versions")
    .select("id,base_batch,base_output_boxes,wip_qty_input_mode")
    .in("id", ids);
  if (result.error) throw result.error;

  const map = new Map();
  (result.data ?? []).forEach((row) => {
    const id = String(row?.id || "").trim();
    if (!id) return;
    const baseBatch = toNumber(row?.base_batch, 0);
    const baseOutput = toNumber(row?.base_output_boxes, 0);
    map.set(id, {
      id,
      baseBatch,
      baseOutput,
      wipQtyInputMode: String(row?.wip_qty_input_mode || "").trim().toLowerCase(),
      unitsPerBatch: baseBatch > 0 && baseOutput > 0 ? baseOutput / baseBatch : 0,
    });
  });
  return map;
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
    ]);

    const searchParams = new URL(request.url).searchParams;
    const masterPlanNo = normalizeParam(searchParams.get("masterPlanNo") || searchParams.get("planNo"));

    if (!masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const [subPlansResult, subPlanRowsResult, mainClaimPlanRows, subClaimPlanRows] = await Promise.all([
      supabaseAdmin
        .from("production_sub_plans")
        .select("sub_plan_no,master_plan_no,department_id,status,confirmed_at,confirmed_by_name,note,created_at")
        .eq("master_plan_no", masterPlanNo)
        .order("confirmed_at", { ascending: false }),
      supabaseAdmin
        .from("production_plan_status")
        .select("plan_id,sub_plan_no,owner_department_id,sku_code,sku_name,planned_qty,unit,period_start,work_start_time,work_end_time,status,confirmed_at,bom_snapshot,bom_version_id,schedule_section_def_id,schedule_section_name")
        .eq("master_plan_no", masterPlanNo)
        .eq("plan_kind", "sub")
        .not("confirmed_at", "is", null)
        .order("period_start", { ascending: true })
        .order("sku_code", { ascending: true }),
      loadMainPlanRowsForClaimDemand(supabaseAdmin, { masterPlanNo }),
      loadSubplanRowsForClaimDemand(supabaseAdmin, { masterPlanNo }),
    ]);

    if (subPlansResult.error) throw subPlansResult.error;
    if (subPlanRowsResult.error) throw subPlanRowsResult.error;

    const subPlans = Array.isArray(subPlansResult.data) ? subPlansResult.data : [];
    const subPlanRows = Array.isArray(subPlanRowsResult.data) ? subPlanRowsResult.data : [];
    const taggedSubClaimPlanRows = (Array.isArray(subClaimPlanRows) ? subClaimPlanRows : []).map((row) => ({
      ...row,
      demand_source: MATERIAL_DEMAND_SOURCES.SUBPLAN_RAW,
    }));
    const materialDemandRows = aggregateMaterialDemand(
      [...(Array.isArray(mainClaimPlanRows) ? mainClaimPlanRows : []), ...taggedSubClaimPlanRows],
      { grain: "daily" }
    );
    const skuCodes = Array.from(
      new Set(subPlanRows.map((row) => normalizeSku(row?.sku_code)).filter(Boolean))
    );
    const materialSkuCodes = Array.from(
      new Set(
        materialDemandRows
          .map((row) => normalizeSku(row?.materialSkuCode || row?.materialGoodsCode))
          .filter(Boolean)
      )
    );
    const bomVersionIds = Array.from(
      new Set(subPlanRows.map((row) => String(row?.bom_version_id || "").trim()).filter(Boolean))
    );

    const [productMetaBySku, versionMetaBySku, gatewayProductMetaBySku, materialProductMetaBySku, versionMetaById] = await Promise.all([
      loadProductsMetaBySkus(supabaseAdmin, skuCodes),
      loadApprovedWipVersionMetaBySkus(supabaseAdmin, skuCodes),
      loadGatewayProductMetaBySkus(skuCodes),
      loadProductsMetaBySkus(supabaseAdmin, materialSkuCodes),
      loadBomVersionMetaByIds(supabaseAdmin, bomVersionIds),
    ]);

    const departmentIds = Array.from(
      new Set(
        [...subPlans, ...subPlanRows]
          .map((row) => String(row?.department_id || row?.owner_department_id || "").trim())
          .filter(Boolean)
      )
    );

    const departmentsResult = departmentIds.length
      ? await supabaseAdmin
        .from("production_departments")
        .select("id,code,name")
        .in("id", departmentIds)
      : { data: [], error: null };
    if (departmentsResult.error) throw departmentsResult.error;

    const departmentMap = new Map(
      (departmentsResult.data ?? []).map((department) => [
        String(department?.id || "").trim(),
        {
          code: String(department?.code || "").trim().toUpperCase() || null,
          name: String(department?.name || "").trim() || null,
        },
      ])
    );

    const dailyMap = new Map();
    let periodStart = null;
    let periodEnd = null;
    let latestConfirmedAt = null;

    subPlanRows.forEach((row) => {
      const workDate = normalizeDateOnly(row?.period_start || row?.confirmed_at);
      if (!workDate) return;
      const skuCode = normalizeSku(row?.sku_code);
      const planningQty = toNumber(row?.planned_qty, 0);
      const rawUnit = String(row?.unit || "").trim() || null;
      const productMeta = productMetaBySku.get(skuCode) || null;
      const versionMeta =
        versionMetaById.get(String(row?.bom_version_id || "").trim())
        || versionMetaBySku.get(skuCode)
        || null;
      const gatewayMeta = gatewayProductMetaBySku.get(skuCode) || null;
      const displayUnit = String(productMeta?.uom_name || gatewayMeta?.displayUnit || rawUnit || "").trim() || null;
      const unitsPerBatch = toNumber(versionMeta?.unitsPerBatch, 0) || toNumber(gatewayMeta?.qtyPerBatch, 0);
      const shouldDisplayInRealUnit =
        unitsPerBatch > 0 && (
          String(versionMeta?.wipQtyInputMode || "").trim().toLowerCase() === "batch"
          || isBatchLikeUnit(rawUnit)
        );
      const shouldConvertToDisplayUnit =
        shouldDisplayInRealUnit && Boolean(displayUnit);
      const displayQty = shouldConvertToDisplayUnit
        ? roundQty(planningQty * unitsPerBatch, 6)
        : planningQty;
      const batchQty = shouldDisplayInRealUnit ? planningQty : null;
      const departmentId = String(row?.owner_department_id || "").trim();
      const departmentMeta = departmentMap.get(departmentId) || { code: null, name: null };
      const sectionId = String(row?.schedule_section_def_id || "").trim() || null;
      const sectionName = String(row?.schedule_section_name || "").trim() || null;
      const current = dailyMap.get(workDate) || {
        date: workDate,
        departments: new Set(),
        subPlanItems: [],
        materialMap: new Map(),
      };

      if (departmentMeta.code) current.departments.add(departmentMeta.code);
      current.subPlanItems.push({
        planId: row?.plan_id || null,
        subPlanNo: String(row?.sub_plan_no || "").trim().toUpperCase() || null,
        departmentId,
        departmentCode: departmentMeta.code,
        departmentName: departmentMeta.name,
        sectionId,
        sectionName,
        skuCode,
        skuName: String(row?.sku_name || "").trim() || null,
        plannedQty: planningQty,
        batchQty,
        unit: rawUnit,
        displayQty,
        displayUnit,
        workStartTime: String(row?.work_start_time || "").trim() || null,
        workEndTime: String(row?.work_end_time || "").trim() || null,
        confirmedAt: row?.confirmed_at || null,
        status: String(row?.status || "").trim() || null,
      });

      if (!periodStart || workDate < periodStart) periodStart = workDate;
      if (!periodEnd || workDate > periodEnd) periodEnd = workDate;
      if (!latestConfirmedAt || String(row?.confirmed_at || "") > String(latestConfirmedAt || "")) {
        latestConfirmedAt = row?.confirmed_at || latestConfirmedAt;
      }

      dailyMap.set(workDate, current);
    });

    materialDemandRows.forEach((row) => {
      const workDate = normalizeDateOnly(row?.bucketDate);
      if (!workDate) return;
      const materialSkuCode = normalizeSku(row?.materialSkuCode || row?.materialGoodsCode);
      const materialMeta = materialProductMetaBySku.get(materialSkuCode) || null;
      if (String(materialMeta?.iccat_code || "").trim() === "03") {
        return;
      }
      const current = dailyMap.get(workDate) || {
        date: workDate,
        departments: new Set(),
        subPlanItems: [],
        materialMap: new Map(),
      };
      const materialKey = normalizeMaterialKey({
        goodsCode: row?.materialGoodsCode,
        skuCode: row?.materialSkuCode,
      });
      const materialCurrent = current.materialMap.get(materialKey) || {
        materialKey,
        goodsCode: normalizeCode(row?.materialGoodsCode),
        skuCode: normalizeCode(row?.materialSkuCode),
        name: String(row?.materialName || "").trim() || "-",
        unit: String(row?.unit || "").trim() || "-",
        requiredQty: 0,
        issueQty: 0,
        demandSources: new Set(),
      };
      materialCurrent.requiredQty += toNumber(row?.requiredQty, 0);
      materialCurrent.issueQty += toNumber(row?.issueQty, 0);
      if (row?.demandSource) materialCurrent.demandSources.add(String(row.demandSource).trim());
      current.materialMap.set(materialKey, materialCurrent);
      dailyMap.set(workDate, current);
      if (!periodStart || workDate < periodStart) periodStart = workDate;
      if (!periodEnd || workDate > periodEnd) periodEnd = workDate;
    });

    const normalizedSubPlans = subPlans.map((subPlan) => {
      const departmentId = String(subPlan?.department_id || "").trim();
      const departmentMeta = departmentMap.get(departmentId) || { code: null, name: null };
      if (!latestConfirmedAt || String(subPlan?.confirmed_at || "") > String(latestConfirmedAt || "")) {
        latestConfirmedAt = subPlan?.confirmed_at || latestConfirmedAt;
      }
      return {
        subPlanNo: String(subPlan?.sub_plan_no || "").trim().toUpperCase() || null,
        departmentId,
        departmentCode: departmentMeta.code,
        departmentName: departmentMeta.name,
        status: String(subPlan?.status || "").trim() || null,
        confirmedAt: subPlan?.confirmed_at || null,
        confirmedByName: String(subPlan?.confirmed_by_name || "").trim() || null,
        note: String(subPlan?.note || "").trim() || null,
      };
    });

    const dailyRows = Array.from(dailyMap.values())
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .map((row) => ({
        date: row.date,
        departments: Array.from(row.departments).sort((a, b) => a.localeCompare(b)),
        subPlanCount: row.subPlanItems.length,
        materialCount: row.materialMap.size,
        subPlanItems: row.subPlanItems
          .slice()
          .sort((a, b) => {
            const departmentCompare = String(a.departmentCode || "").localeCompare(String(b.departmentCode || ""));
            if (departmentCompare !== 0) return departmentCompare;
            const subPlanCompare = String(a.subPlanNo || "").localeCompare(String(b.subPlanNo || ""));
            if (subPlanCompare !== 0) return subPlanCompare;
            return String(a.skuCode || "").localeCompare(String(b.skuCode || ""));
          }),
        materialItems: Array.from(row.materialMap.values())
          .map((material) => ({
            ...material,
            demandSources: Array.from(material.demandSources || []),
          }))
          .sort((a, b) => String(a.goodsCode || a.skuCode || "").localeCompare(String(b.goodsCode || b.skuCode || ""))),
      }));

    return NextResponse.json({
      ok: true,
      data: {
        masterPlanNo,
        periodStart,
        periodEnd,
        latestConfirmedAt,
        departmentCount: departmentIds.length,
        subPlanCount: normalizedSubPlans.length,
        dayCount: dailyRows.length,
        subPlans: normalizedSubPlans,
        dailyRows,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
