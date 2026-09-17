import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { createHash } from "node:crypto";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { sendPlanningPushNotification } from "@/lib/pushNotifications";
import { autoGenerateSubplanDraftsForMasterPlan } from "@/lib/autoSubplanDrafts";
import { buildMasterPlanNo, normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";

function normalizePlanGroupId(value) {
  return normalizeMasterPlanNo(normalizeParam(value));
}

function isMissingMasterPublishColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("master_published_at")
    || message.includes("master_published_by")
    || message.includes("master_published_by_user_id")
    || message.includes("master_plan_no")
  );
}

function isMissingPlanNoteColumn(error) {
  return String(error?.message || "").toLowerCase().includes("plan_note");
}

function normalizeDateInput(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSnapshotChecksum(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
}

function parseSnapshotMaterials(bomSnapshot) {
  const root = Array.isArray(bomSnapshot) ? bomSnapshot[0] : null;
  const materials = Array.isArray(root?.materials)
    ? root.materials
    : Array.isArray(root?.items)
      ? root.items
      : [];
  return materials
    .map((mat) => ({
      skuCode: normalizeSku(mat?.skuCode || mat?.material_sku_code),
      goodsCode: normalizeSku(mat?.goodsCode || mat?.material_goods_code || mat?.skuCode || mat?.material_sku_code),
      requiredQty: toNumber(mat?.requiredQty, 0),
      issueQty: toNumber(mat?.issueQty, 0),
      unit: String(mat?.unit || "").trim() || "unit",
      name: String(mat?.name || mat?.skuName || "").trim(),
    }))
    .filter((row) => row.skuCode);
}

async function buildPublishSnapshot({
  supabaseAdmin,
  rows,
  masterPlanNo,
  periodStart,
  periodEnd,
  publishedAt,
  publishedBy,
  publishedByUserId,
}) {
  const fgSkus = Array.from(new Set((rows || []).map((row) => normalizeSku(row?.sku_code)).filter(Boolean)));
  const materialMap = new Map();
  const bomVersionRows = [];

  (rows || []).forEach((row) => {
    const materials = parseSnapshotMaterials(row?.bom_snapshot);
    if (materials.length) {
      materials.forEach((material) => {
        const materialKey = `${material.skuCode}|${material.goodsCode || material.skuCode}`;
        if (!materialMap.has(materialKey)) {
          materialMap.set(materialKey, {
            skuCode: material.skuCode,
            goodsCode: material.goodsCode || material.skuCode,
            name: material.name || material.skuCode,
            requiredQty: 0,
            issueQty: 0,
            unit: material.unit,
          });
        }
        const current = materialMap.get(materialKey);
        current.requiredQty += material.requiredQty;
        current.issueQty += material.issueQty;
      });
    }

    bomVersionRows.push({
      planId: row?.plan_id || null,
      skuCode: normalizeSku(row?.sku_code),
      skuName: row?.sku_name || null,
      formulaCode: row?.formula_code || null,
      formulaName: row?.formula_name || null,
      bomVersionId: row?.bom_version_id || null,
    });
  });

  const materialSkus = Array.from(materialMap.keys());
  const summaryBySkuParams = new URLSearchParams();
  if (materialSkus.length) {
    summaryBySkuParams.set("skus", materialSkus.join(","));
  }

  const [stockResult, openPoResult, internalOpenMoResult] = await Promise.all([
    materialSkus.length
      ? fetchGatewayJson("/api/raw-materials-summary-by-skus", summaryBySkuParams, "production")
      : Promise.resolve({ ok: true, data: { data: [] } }),
    materialSkus.length
      ? fetchGatewayJson("/api/open-po-eta-by-sku", summaryBySkuParams, "production")
      : Promise.resolve({ ok: true, data: { data: [] } }),
    supabaseAdmin
      .from("production_sub_plans")
      .select("sub_plan_no,department_id,status,updated_at,confirmed_at")
      .eq("master_plan_no", masterPlanNo)
      .in("status", ["draft", "in_progress", "partial", "backorder", "blocked"]),
  ]);
  if (!stockResult?.ok) {
    throw new Error("ไม่สามารถดึง stock snapshot ระหว่าง publish ได้");
  }
  if (!openPoResult?.ok) {
    throw new Error("ไม่สามารถดึง open PO snapshot ระหว่าง publish ได้");
  }
  if (internalOpenMoResult?.error) {
    throw new Error(internalOpenMoResult.error.message || "ไม่สามารถดึง open MO snapshot ระหว่าง publish ได้");
  }

  const stockRows = Array.isArray(stockResult?.data?.data) ? stockResult.data.data : [];
  const openPoRows = Array.isArray(openPoResult?.data?.data) ? openPoResult.data.data : [];
  const openMoRows = Array.isArray(internalOpenMoResult?.data) ? internalOpenMoResult.data : [];

  const stockSnapshot = stockRows.map((row) => {
    const skuCode = normalizeSku(row?.SKU_CODE);
    const onHandQty = toNumber(row?.QTY, 0);
    const issuedQty = 0;
    const availableQty = onHandQty;
    return {
      skuCode,
      skuName: row?.SKU_NAME || "",
      unit: row?.UTQ_NAME || row?.UTQ_NAME_1 || "",
      leadTime: row?.LEADTIME || row?.LEAD_TIME || null,
      onHandQty,
      issuedQty,
      availableQty,
      reorderPoint: toNumber(row?.MIN_STOCK ?? row?.MIN_QTY, 0),
      maxStock: toNumber(row?.MAX_STOCK ?? row?.MAX_QTY, 0),
    };
  });

  const snapshot = {
    snapshot_meta: {
      masterPlanNo,
      periodStart,
      periodEnd,
      publishedAt,
      publishedBy,
      publishedByUserId,
      asOf: publishedAt,
      totalFgSkus: fgSkus.length,
      totalMaterialSkus: materialSkus.length,
      totalPlanRows: Array.isArray(rows) ? rows.length : 0,
      source: {
        bom: "production_plan_status.bom_snapshot/formula metadata",
        stock: "gateway:/api/raw-materials-summary-by-skus",
        openPo: "gateway:/api/open-po-eta-by-sku",
        openMo: "public.production_sub_plans (internal open work queue)",
        leadTime: "gateway summary LEADTIME fields",
      },
    },
    snapshot_bom: bomVersionRows,
    snapshot_stock: stockSnapshot,
    snapshot_open_po: openPoRows,
    snapshot_open_mo: openMoRows,
    snapshot_lead_time: stockSnapshot.map((row) => ({
      skuCode: row.skuCode,
      leadTime: row.leadTime,
    })),
    snapshot_material_requirements: Array.from(materialMap.values()).map((row) => ({
      ...row,
      requiredQty: Number(row.requiredQty.toFixed(3)),
      issueQty: Number(row.issueQty.toFixed(3)),
    })),
  };
  snapshot.snapshot_meta.snapshotChecksum = buildSnapshotChecksum(snapshot);
  return snapshot;
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.publish_master",
    ]);

    const body = await readJson(request);
    const rawPlanNo = String(normalizeParam(body?.planGroupId) || "").trim().toUpperCase();
    const hasNoteField = Object.prototype.hasOwnProperty.call(body || {}, "note");
    const normalizedNote = normalizeParam(body?.note);
    const boundedNote = normalizedNote ? String(normalizedNote).slice(0, 500) : null;
    const requestedPlanNo = normalizePlanGroupId(rawPlanNo);
    if (!requestedPlanNo) {
      return Response.json({ error: "planGroupId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const actorResult = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const actorName = actorResult?.data?.username || null;
    const nowIso = new Date().toISOString();

    const byGroupResult = await supabaseAdmin
      .from("production_plan_status")
      .select("plan_id,period_start,period_end,sku_code,sku_name,formula_code,formula_name,bom_version_id,bom_snapshot")
      .eq("plan_group_id", rawPlanNo || requestedPlanNo);
    if (byGroupResult.error) {
      return Response.json({ error: byGroupResult.error.message }, { status: 500 });
    }

    let planRows = Array.isArray(byGroupResult.data) ? byGroupResult.data : [];
    if (!planRows.length) {
      const byRequestedGroupResult = await supabaseAdmin
        .from("production_plan_status")
        .select("plan_id,period_start,period_end,sku_code,sku_name,formula_code,formula_name,bom_version_id,bom_snapshot")
        .eq("plan_group_id", requestedPlanNo);
      if (byRequestedGroupResult.error) {
        return Response.json({ error: byRequestedGroupResult.error.message }, { status: 500 });
      }
      planRows = Array.isArray(byRequestedGroupResult.data) ? byRequestedGroupResult.data : [];
    }

    if (!planRows.length) {
      const byMasterResult = await supabaseAdmin
        .from("production_plan_status")
        .select("plan_id,period_start,period_end,sku_code,sku_name,formula_code,formula_name,bom_version_id,bom_snapshot")
        .eq("master_plan_no", requestedPlanNo);
      if (byMasterResult.error) {
        return Response.json({ error: byMasterResult.error.message }, { status: 500 });
      }
      planRows = Array.isArray(byMasterResult.data) ? byMasterResult.data : [];
    }

    if (!planRows.length) {
      return Response.json({ error: "Master plan not found for this Plan No" }, { status: 404 });
    }
    const periodStarts = (planRows ?? [])
      .map((row) => String(row?.period_start || "").slice(0, 10))
      .filter(Boolean)
      .sort();
    const periodEnds = (planRows ?? [])
      .map((row) => String(row?.period_end || row?.period_start || "").slice(0, 10))
      .filter(Boolean)
      .sort();
    const periodStart = periodStarts[0] || null;
    const periodEnd = periodEnds[periodEnds.length - 1] || periodStart;
    const canonicalPlanNo =
      normalizeMasterPlanNo(requestedPlanNo, periodStart, 1)
      || buildMasterPlanNo(periodStart, 1);
    if (!canonicalPlanNo) {
      return Response.json({ error: "Unable to resolve standard Plan No" }, { status: 400 });
    }

    let publishSnapshot;
    try {
      publishSnapshot = await buildPublishSnapshot({
        supabaseAdmin,
        rows: planRows,
        masterPlanNo: canonicalPlanNo,
        periodStart,
        periodEnd,
        publishedAt: nowIso,
        publishedBy: actorName,
        publishedByUserId: userId,
      });
    } catch (snapshotError) {
      // In dev/test we allow publish to proceed even when gateway snapshot calls fail,
      // so frontend UAT/TestSprite can validate RBAC + workbench flows deterministically.
      const allowFallback = process.env.NODE_ENV !== "production";
      if (!allowFallback) {
        throw snapshotError;
      }

      publishSnapshot = {
        snapshot_meta: {
          masterPlanNo: canonicalPlanNo,
          periodStart,
          periodEnd,
          publishedAt: nowIso,
          publishedBy: actorName,
          publishedByUserId: userId,
          asOf: nowIso,
          totalFgSkus: Array.from(new Set((planRows || []).map((row) => normalizeSku(row?.sku_code)).filter(Boolean))).length,
          totalMaterialSkus: 0,
          totalPlanRows: Array.isArray(planRows) ? planRows.length : 0,
          gatewaySnapshotFailed: true,
          gatewaySnapshotError: String(snapshotError?.message || snapshotError),
          source: {
            bom: "production_plan_status.bom_snapshot/formula metadata",
            stock: "fallback (gateway snapshot unavailable)",
            openPo: "fallback (gateway snapshot unavailable)",
            openMo: "fallback (gateway snapshot unavailable)",
            leadTime: "fallback (gateway snapshot unavailable)",
          },
        },
        snapshot_bom: [],
        snapshot_stock: [],
        snapshot_open_po: [],
        snapshot_open_mo: [],
        snapshot_lead_time: [],
        snapshot_material_requirements: [],
      };
      publishSnapshot.snapshot_meta.snapshotChecksum = buildSnapshotChecksum(publishSnapshot);
    }
    const snapshotChecksum = String(publishSnapshot?.snapshot_meta?.snapshotChecksum || "");
    if (!snapshotChecksum) {
      return Response.json({ error: "Snapshot checksum is required" }, { status: 500 });
    }
    const requiredArrays = [
      "snapshot_bom",
      "snapshot_stock",
      "snapshot_open_po",
      "snapshot_open_mo",
      "snapshot_lead_time",
      "snapshot_material_requirements",
    ];
    const missingFields = requiredArrays.filter((field) => !Array.isArray(publishSnapshot?.[field]));
    if (missingFields.length > 0 || !publishSnapshot?.snapshot_meta) {
      return Response.json({
        error: "Snapshot payload is incomplete",
        details: { missingFields },
      }, { status: 500 });
    }

    if (periodStart && periodEnd) {
      const masterUpsertResult = await supabaseAdmin
        .from("production_master_plans")
        .upsert({
          master_plan_no: canonicalPlanNo,
          period_start: periodStart,
          period_end: periodEnd,
          status: "published",
          published_at: nowIso,
          published_by: userId,
          published_by_name: actorName,
          snapshot_frozen_at: nowIso,
          snapshot_frozen_by: userId,
          ...(hasNoteField ? { note: boundedNote } : {}),
          ...publishSnapshot,
          updated_by: userId,
          created_by: userId,
        }, { onConflict: "master_plan_no" });
      if (masterUpsertResult.error) {
        return Response.json({ error: masterUpsertResult.error.message }, { status: 500 });
      }

      const historyInsertResult = await supabaseAdmin
        .from("production_master_plan_snapshots")
        .insert({
          master_plan_no: canonicalPlanNo,
          published_at: nowIso,
          published_by: userId,
          published_by_name: actorName,
          snapshot_checksum: snapshotChecksum,
          snapshot_meta: publishSnapshot.snapshot_meta,
          snapshot_bom: publishSnapshot.snapshot_bom,
          snapshot_stock: publishSnapshot.snapshot_stock,
          snapshot_open_po: publishSnapshot.snapshot_open_po,
          snapshot_open_mo: publishSnapshot.snapshot_open_mo,
          snapshot_lead_time: publishSnapshot.snapshot_lead_time,
          snapshot_material_requirements: publishSnapshot.snapshot_material_requirements,
        });
      if (historyInsertResult.error) {
        return Response.json({ error: historyInsertResult.error.message }, { status: 500 });
      }
    }

    const planIds = planRows.map((row) => row.plan_id).filter(Boolean);
    const statusUpdatePayload = {
      master_published_at: nowIso,
      master_published_by: actorName,
      master_published_by_user_id: userId,
      master_plan_no: canonicalPlanNo,
      plan_group_id: canonicalPlanNo,
      ...(hasNoteField ? { plan_note: boundedNote } : {}),
    };
    let statusUpdate = await supabaseAdmin
      .from("production_plan_status")
      .update(statusUpdatePayload)
      .in("plan_id", planIds)
      .select("plan_id");
    if (statusUpdate.error && hasNoteField && isMissingPlanNoteColumn(statusUpdate.error)) {
      statusUpdate = await supabaseAdmin
        .from("production_plan_status")
        .update({
          master_published_at: nowIso,
          master_published_by: actorName,
          master_published_by_user_id: userId,
          master_plan_no: canonicalPlanNo,
          plan_group_id: canonicalPlanNo,
        })
        .in("plan_id", planIds)
        .select("plan_id");
    }
    const { data, error } = statusUpdate;

    if (error) {
      if (isMissingMasterPublishColumns(error)) {
        return Response.json({
          error: "Database schema is missing master publish fields. Run latest migration first.",
        }, { status: 500 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    let autoDraftSummary = null;
    try {
      autoDraftSummary = await autoGenerateSubplanDraftsForMasterPlan({
        supabaseAdmin,
        request,
        masterPlanNo: canonicalPlanNo,
        actorUserId: userId,
        nowIso,
      });
    } catch (autoDraftError) {
      autoDraftSummary = {
        ok: false,
        error: String(autoDraftError?.message || autoDraftError),
      };
    }

    try {
      await sendPlanningPushNotification(supabaseAdmin, "planning.master_published", {
        title: "เผยแพร่แผนหลักแล้ว",
        body: `แผน ${canonicalPlanNo} พร้อมให้แผนกดำเนินการต่อ`,
        url: `/production-line/planning/plan?masterPlanNo=${encodeURIComponent(canonicalPlanNo)}`,
        data: {
          masterPlanNo: canonicalPlanNo,
          periodStart,
          periodEnd,
        },
      });
    } catch (pushError) {
      console.error("Failed to send master publish push notification", pushError);
    }

    return Response.json({
      ok: true,
      data: {
        planGroupId: canonicalPlanNo,
        publishedAt: nowIso,
        publishedBy: actorName,
        note: hasNoteField ? boundedNote : null,
        affectedCount: Array.isArray(data) ? data.length : 0,
        autoDraftSubplans: autoDraftSummary,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
