import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { hasPlanningManageAccess, loadDepartmentMembership } from "@/lib/claimPermissions";
import { loadProductsCacheMatches } from "@/lib/scheduleInboxProducts";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;

function normalizeDepartmentId(value) {
  return String(value || "").trim();
}

function looksLikeUuid(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePlanNo(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDateOnly(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

function normalizeTextToken(value) {
  return String(value || "").trim().toLowerCase();
}

async function loadScheduleViewScope(supabaseAdmin, request, permission) {
  const canManageGlobal = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  if (permission.isAdmin || canManageGlobal) {
    return {
      canManageGlobal: true,
      departmentIdSet: new Set(),
      ownerSkuSet: new Set(),
    };
  }

  const memberships = await loadDepartmentMembership(supabaseAdmin, permission.userId);
  const departmentIds = Array.from(
    new Set(
      memberships
        .map((row) => normalizeDepartmentId(row?.departmentId))
        .filter(Boolean)
    )
  );

  if (!departmentIds.length) {
    return {
      canManageGlobal: false,
      departmentIdSet: new Set(),
      ownerSkuSet: new Set(),
    };
  }

  const ownerResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code")
    .in("department_id", departmentIds)
    .eq("is_owner", true);
  if (ownerResult.error) {
    throw ownerResult.error;
  }

  const ownerSkuSet = new Set(
    (ownerResult.data ?? [])
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  );

  return {
    canManageGlobal: false,
    departmentIdSet: new Set(departmentIds),
    ownerSkuSet,
  };
}

function buildSectionColumnMetaMap(sectionDefs = []) {
  const map = new Map();
  (sectionDefs ?? []).forEach((section) => {
    const sectionId = String(section?.id || "").trim();
    if (!sectionId) return;
    const columns = (section?.production_schedule_column_defs ?? [])
      .map((col) => ({
        key: String(col?.key || "").trim(),
        label: String(col?.label || "").trim(),
        colType: String(col?.col_type || "").trim().toLowerCase(),
      }))
      .filter((col) => col.key);

    const skuKeys = columns
      .filter((col) => col.colType === "sku_picker")
      .map((col) => col.key);
    const numberKeys = columns
      .filter((col) => col.colType === "number")
      .map((col) => col.key);
    const timeKeys = columns
      .filter((col) => col.colType === "time")
      .map((col) => col.key);
    const shiftKeys = columns
      .filter((col) => col.colType === "shift")
      .map((col) => col.key);

    const findKeyByKeywords = (keys, keywords) => {
      const target = keys.find((key) => {
        const keyText = normalizeTextToken(key);
        return keywords.some((word) => keyText.includes(word));
      });
      return target || null;
    };

    const findByColumnKeywords = (keywords) => {
      const target = columns.find((col) => {
        const keyText = normalizeTextToken(col.key);
        const labelText = normalizeTextToken(col.label);
        return keywords.some((word) => keyText.includes(word) || labelText.includes(word));
      });
      return target?.key || null;
    };

    const qtyKey = findByColumnKeywords(["qty", "quantity", "จำนวน"]) || numberKeys[0] || null;
    const brandKey = findByColumnKeywords(["brand", "แบรนด์"]) || null;
    const unitKey = findByColumnKeywords(["unit", "uom", "หน่วย"]) || null;
    const noteKey = findByColumnKeywords(["note", "remark", "หมายเหตุ"]) || null;
    const staffKey = findByColumnKeywords(["staff", "manpower", "คน"]) || null;
    const machineKey = findByColumnKeywords(["machine", "เครื่อง"]) || null;
    const doughSetKey = findByColumnKeywords(["doughset", "dough_set", "batchset", "batch_set", "ชุดแป้ง"]) || null;
    const shiftKey = findByColumnKeywords(["shift", "กะ"]) || shiftKeys[0] || null;
    const timeKey =
      findByColumnKeywords(["time", "ช่วงเวลา", "เวลา"])
      || findKeyByKeywords(timeKeys, ["time", "เวลา"])
      || timeKeys[0]
      || null;

    map.set(sectionId, {
      sectionName: String(section?.name || "").trim() || null,
      skuKeys,
      numberKeys,
      timeKeys,
      shiftKeys,
      qtyKey,
      brandKey,
      unitKey,
      noteKey,
      staffKey,
      machineKey,
      doughSetKey,
      shiftKey,
      timeKey,
    });
  });
  return map;
}

function extractSkuTokensFromRow(rowData, skuKeys = []) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  const explicit = skuKeys
    .map((key) => String(data?.[key] || "").trim())
    .filter(Boolean);
  if (explicit.length > 0) {
    return explicit;
  }

  return Object.entries(data)
    .filter(([key]) => String(key || "").toLowerCase().includes("sku"))
    .map(([, value]) => String(value || "").trim())
    .filter(Boolean);
}

function buildSearchText(plan, rows = []) {
  const planChunks = [
    plan?.master_plan_no,
    plan?.week_start_date,
    plan?.period_end,
    plan?.status,
    plan?.production_departments?.code,
    plan?.production_departments?.name,
    plan?.notes,
  ];
  const rowChunks = rows.flatMap((row) => {
    const rowDataValues = row?.rowData && typeof row.rowData === "object"
      ? Object.values(row.rowData)
      : [];
    return [
      row?.dayKey,
      ...(row?.resolvedSkuCodes ?? []),
      ...(row?.resolvedSkuTokens ?? []),
      ...rowDataValues,
    ];
  });

  return [...planChunks, ...rowChunks]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.edit_own_dept",
      "plan.publish_master",
    ]);

    const supabaseAdmin = getSupabaseAdmin();
    const viewScope = await loadScheduleViewScope(supabaseAdmin, request, permission);

    if (
      !viewScope.canManageGlobal
      && viewScope.departmentIdSet.size === 0
      && viewScope.ownerSkuSet.size === 0
    ) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: {
          totalPlans: 0,
          canManageGlobal: false,
          scopeDepartmentCount: 0,
          scopeOwnerSkuCount: 0,
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const requestedDeptToken = normalizeDepartmentId(searchParams.get("deptId"));
    const requestedWeekStartDate = normalizeDateOnly(searchParams.get("weekStartDate"));
    const requestedPeriodEnd = normalizeDateOnly(searchParams.get("periodEnd"));
    // Range filters: dateFrom/dateTo filter on week_start_date range (inclusive)
    const requestedDateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
    const requestedDateTo = normalizeDateOnly(searchParams.get("dateTo"));
    const requestedPlanNo = normalizePlanNo(searchParams.get("masterPlanNo") || searchParams.get("planNo"));
    const queryText = String(searchParams.get("q") || "").trim().toLowerCase();
    const scopeParam = String(searchParams.get("scope") || "").trim().toLowerCase();
    const ownOnly = scopeParam === "own";
    const limit = clampLimit(searchParams.get("limit"));

    let requestedDeptId = null;
    if (requestedDeptToken) {
      if (looksLikeUuid(requestedDeptToken)) {
        requestedDeptId = requestedDeptToken;
      } else {
        const deptByCodeResult = await supabaseAdmin
          .from("production_departments")
          .select("id")
          .eq("code", requestedDeptToken.toUpperCase())
          .maybeSingle();
        if (deptByCodeResult.error) {
          return NextResponse.json({ error: deptByCodeResult.error.message }, { status: 500 });
        }
        requestedDeptId = String(deptByCodeResult.data?.id || "").trim() || null;
      }
    }

    if (!viewScope.canManageGlobal && requestedDeptId && !viewScope.departmentIdSet.has(requestedDeptId)) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: {
          totalPlans: 0,
          canManageGlobal: false,
          scopeDepartmentCount: viewScope.departmentIdSet.size,
          scopeOwnerSkuCount: viewScope.ownerSkuSet.size,
        },
      });
    }

    let plansQuery = supabaseAdmin
      .from("production_schedule_plans")
      .select(
        "id,dept_id,template_id,master_plan_no,week_start_date,period_end,status,notes,created_at,production_departments:dept_id(id,code,name)"
      )
      .eq("status", "published")
      .order("week_start_date", { ascending: false })
      .order("period_end", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (requestedDeptId) plansQuery = plansQuery.eq("dept_id", requestedDeptId);
    if (requestedWeekStartDate) plansQuery = plansQuery.eq("week_start_date", requestedWeekStartDate);
    if (requestedPeriodEnd) plansQuery = plansQuery.eq("period_end", requestedPeriodEnd);
    if (requestedDateFrom) plansQuery = plansQuery.gte("week_start_date", requestedDateFrom);
    if (requestedDateTo) plansQuery = plansQuery.lte("week_start_date", requestedDateTo);
    if (requestedPlanNo) plansQuery = plansQuery.eq("master_plan_no", requestedPlanNo);
    if (!viewScope.canManageGlobal && ownOnly && viewScope.departmentIdSet.size > 0) {
      plansQuery = plansQuery.in("dept_id", Array.from(viewScope.departmentIdSet));
    }

    const { data: plans, error: plansError } = await plansQuery;
    if (plansError) {
      return NextResponse.json({ error: plansError.message }, { status: 500 });
    }

    const planRows = plans ?? [];
    if (!planRows.length) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: {
          totalPlans: 0,
          canManageGlobal: viewScope.canManageGlobal,
          scopeDepartmentCount: viewScope.departmentIdSet.size,
          scopeOwnerSkuCount: viewScope.ownerSkuSet.size,
        },
      });
    }

    const planIds = planRows.map((plan) => String(plan.id)).filter(Boolean);
    const templateIds = Array.from(
      new Set(
        planRows
          .map((plan) => String(plan?.template_id || "").trim())
          .filter(Boolean)
      )
    );

    const [rowsResult, sectionDefsResult] = await Promise.all([
      supabaseAdmin
        .from("production_schedule_rows")
        .select("id,plan_id,section_def_id,day_key,display_order,row_data,sub_plan_id")
        .in("plan_id", planIds)
        .order("section_def_id", { ascending: true })
        .order("day_key", { ascending: true })
        .order("display_order", { ascending: true }),
      templateIds.length > 0
        ? supabaseAdmin
          .from("production_schedule_section_defs")
          .select("id,name,template_id,production_schedule_column_defs(key,label,col_type)")
          .in("template_id", templateIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (rowsResult.error) {
      return NextResponse.json({ error: rowsResult.error.message }, { status: 500 });
    }
    if (sectionDefsResult.error) {
      return NextResponse.json({ error: sectionDefsResult.error.message }, { status: 500 });
    }

    const sectionColumnMeta = buildSectionColumnMetaMap(sectionDefsResult.data ?? []);
    const allRows = rowsResult.data ?? [];

    const rawSkuTokens = new Set();
    allRows.forEach((row) => {
      const sectionId = String(row?.section_def_id || "").trim();
      const skuKeys = sectionColumnMeta.get(sectionId)?.skuKeys ?? [];
      const tokens = extractSkuTokensFromRow(row?.row_data, skuKeys);
      tokens.forEach((token) => rawSkuTokens.add(token));
    });

    const skuTokens = Array.from(rawSkuTokens);
    const upperSkuTokens = skuTokens.map((value) => normalizeSku(value)).filter(Boolean);

    const [skuByNameResult, skuByCodeResult] = await Promise.all([
      loadProductsCacheMatches(supabaseAdmin, {
        column: "sku_name",
        values: skuTokens,
      }),
      loadProductsCacheMatches(supabaseAdmin, {
        column: "sku_code",
        values: upperSkuTokens,
      }),
    ]);

    if (skuByNameResult.error) {
      return NextResponse.json({ error: skuByNameResult.error.message }, { status: 500 });
    }
    if (skuByCodeResult.error) {
      return NextResponse.json({ error: skuByCodeResult.error.message }, { status: 500 });
    }

    const skuCodeByName = new Map();
    const skuCodeByCode = new Map();
    [...(skuByNameResult.data ?? []), ...(skuByCodeResult.data ?? [])].forEach((row) => {
      const skuCode = normalizeSku(row?.sku_code);
      const skuName = String(row?.sku_name || "").trim();
      if (skuName && !skuCodeByName.has(skuName)) {
        skuCodeByName.set(skuName, skuCode);
      }
      if (skuCode) {
        skuCodeByCode.set(skuCode, skuCode);
      }
    });

    const rowsByPlan = new Map();
    allRows.forEach((row) => {
      const sectionId = String(row?.section_def_id || "").trim();
      const sectionMeta = sectionColumnMeta.get(sectionId) ?? {
        sectionName: null,
        skuKeys: [],
        numberKeys: [],
        timeKeys: [],
        shiftKeys: [],
        qtyKey: null,
        brandKey: null,
        unitKey: null,
        noteKey: null,
        staffKey: null,
        machineKey: null,
        doughSetKey: null,
        shiftKey: null,
        timeKey: null,
      };
      const skuKeys = sectionMeta.skuKeys ?? [];
      const tokens = extractSkuTokensFromRow(row?.row_data, skuKeys);
      const resolvedSkuCodes = Array.from(
        new Set(
          tokens
            .map((token) => {
              const normalizedCode = normalizeSku(token);
              if (skuCodeByCode.has(normalizedCode)) return normalizedCode;
              return skuCodeByName.get(String(token || "").trim()) || null;
            })
            .filter(Boolean)
        )
      );

      const planId = String(row?.plan_id || "").trim();
      if (!rowsByPlan.has(planId)) rowsByPlan.set(planId, []);
      rowsByPlan.get(planId).push({
        id: row?.id || null,
        sectionDefId: row?.section_def_id || null,
        sectionName: sectionMeta.sectionName || null,
        dayKey: row?.day_key || null,
        displayOrder: Number(row?.display_order || 0),
        rowData: row?.row_data || {},
        subPlanId: row?.sub_plan_id || null,
        resolvedSkuTokens: tokens,
        resolvedSkuCodes,
        detectedKeys: {
          skuKeys: sectionMeta.skuKeys ?? [],
          numberKeys: sectionMeta.numberKeys ?? [],
          timeKeys: sectionMeta.timeKeys ?? [],
          shiftKeys: sectionMeta.shiftKeys ?? [],
          qtyKey: sectionMeta.qtyKey ?? null,
          brandKey: sectionMeta.brandKey ?? null,
          unitKey: sectionMeta.unitKey ?? null,
          noteKey: sectionMeta.noteKey ?? null,
          staffKey: sectionMeta.staffKey ?? null,
          machineKey: sectionMeta.machineKey ?? null,
          doughSetKey: sectionMeta.doughSetKey ?? null,
          shiftKey: sectionMeta.shiftKey ?? null,
          timeKey: sectionMeta.timeKey ?? null,
        },
      });
    });

    const data = [];
    planRows.forEach((plan) => {
      const planId = String(plan?.id || "").trim();
      const deptId = normalizeDepartmentId(plan?.dept_id);
      const ownDepartmentPlan = viewScope.departmentIdSet.has(deptId);
      const allPlanRowsForPlan = rowsByPlan.get(planId) ?? [];

      let visibleRows = allPlanRowsForPlan;
      if (!viewScope.canManageGlobal) {
        if (!ownDepartmentPlan) {
          visibleRows = allPlanRowsForPlan.filter((row) =>
            row.resolvedSkuCodes.some((skuCode) => viewScope.ownerSkuSet.has(skuCode))
          );
        }
      }

      if (!viewScope.canManageGlobal && !ownDepartmentPlan && visibleRows.length === 0) {
        return;
      }

      if (queryText) {
        const searchText = buildSearchText(plan, visibleRows);
        if (!searchText.includes(queryText)) {
          return;
        }
      }

      data.push({
        id: plan?.id || null,
        deptId,
        templateId: plan?.template_id || null,
        masterPlanNo: plan?.master_plan_no || null,
        weekStartDate: plan?.week_start_date || null,
        periodEnd: plan?.period_end || plan?.week_start_date || null,
        status: plan?.status || "draft",
        notes: plan?.notes || null,
        createdAt: plan?.created_at || null,
        department: {
          id: plan?.production_departments?.id || deptId || null,
          code: plan?.production_departments?.code || null,
          name: plan?.production_departments?.name || null,
        },
        isOwnDepartmentPlan: ownDepartmentPlan,
        canEdit: Boolean(viewScope.canManageGlobal || ownDepartmentPlan),
        totalRows: allPlanRowsForPlan.length,
        visibleRows: visibleRows.length,
        rows: visibleRows,
      });
    });

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        totalPlans: data.length,
        canManageGlobal: viewScope.canManageGlobal,
        scopeDepartmentCount: viewScope.departmentIdSet.size,
        scopeOwnerSkuCount: viewScope.ownerSkuSet.size,
        filters: {
          deptId: requestedDeptToken || null,
          weekStartDate: requestedWeekStartDate || null,
          periodEnd: requestedPeriodEnd || null,
          dateFrom: requestedDateFrom || null,
          dateTo: requestedDateTo || null,
          masterPlanNo: requestedPlanNo || null,
          query: queryText || null,
          scope: ownOnly ? "own" : "all",
          limit,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
