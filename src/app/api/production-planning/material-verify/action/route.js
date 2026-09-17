import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { sendPlanningPushNotification } from "@/lib/pushNotifications";
import { autoGenerateSubplanDraftsForMasterPlan } from "@/lib/autoSubplanDrafts";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

function isMissingMasterPublishColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("master_published_at") ||
    message.includes("master_published_by") ||
    message.includes("master_published_by_user_id") ||
    message.includes("master_plan_no")
  );
}

function isMissingPlanNoteColumn(error) {
  return String(error?.message || "").toLowerCase().includes("plan_note");
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
    const { userId } = await requirePermissionKeys(request, ["plan.verify_materials"]);
    const body = await readJson(request);
    
    const masterPlanNo = normalizeMasterPlanNo(body?.masterPlanNo);
    const action = String(body?.action || "").trim().toLowerCase();
    const reason = String(body?.reason || "").trim();
    const consolidated = Array.isArray(body?.consolidated) ? body.consolidated : [];

    if (!masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch user details for actor name
    const actorResult = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const actorName = actorResult?.data?.username || "system";
    const nowIso = new Date().toISOString();

    // Get current master plan record
    const { data: masterPlan, error: fetchError } = await supabaseAdmin
      .from("production_master_plans")
      .select("*")
      .eq("master_plan_no", masterPlanNo)
      .maybeSingle();

    if (fetchError || !masterPlan) {
      return NextResponse.json({ error: "Master plan not found in database." }, { status: 404 });
    }

    if (action === "request_verify") {
      // 1. Update master plan status to pending_verify
      const { error: updateError } = await supabaseAdmin
        .from("production_master_plans")
        .update({
          status: "pending_verify",
          reject_reason: null,
          updated_at: nowIso,
          updated_by: userId,
        })
        .eq("master_plan_no", masterPlanNo);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // 2. Save material snapshots to production_plan_material_verifications
      if (consolidated.length > 0) {
        await supabaseAdmin
          .from("production_plan_material_verifications")
          .delete()
          .eq("master_plan_no", masterPlanNo);

        const rowsToInsert = consolidated.map((row) => ({
          master_plan_no: masterPlanNo,
          material_code: row.materialCode,
          material_name: row.materialName,
          required_qty: row.requiredQty,
          stock_qty: row.stockQty,
          shortage_qty: row.shortageQty,
          status: row.status,
          verified_at: nowIso,
        }));

        const { error: insertError } = await supabaseAdmin
          .from("production_plan_material_verifications")
          .insert(rowsToInsert);

        if (insertError) {
          console.error("Failed to insert material verifications:", insertError);
        }
      }

      // 3. Send Push Notification to Warehouse Manager (subscribed to planning.material_check_requested)
      try {
        await sendPlanningPushNotification(supabaseAdmin, "planning.material_check_requested", {
          title: "คำขอตรวจสอบวัตถุดิบ",
          body: `กรุณาอนุมัติความเพียงพอของวัตถุดิบสำหรับแผนหลัก: ${masterPlanNo}`,
          url: `/production-line/planning/material-verify?masterPlanNo=${encodeURIComponent(masterPlanNo)}`,
          data: { masterPlanNo },
        });
      } catch (pushError) {
        console.error("Failed to send push notification:", pushError);
      }

      return NextResponse.json({ ok: true, status: "pending_verify" });

    } else if (action === "accept") {
      // 1. Fetch scheduled rows
      const byGroupResult = await supabaseAdmin
        .from("production_plan_status")
        .select("plan_id,period_start,period_end,sku_code,sku_name,formula_code,formula_name,bom_version_id,bom_snapshot")
        .eq("master_plan_no", masterPlanNo);
      
      if (byGroupResult.error) {
        return NextResponse.json({ error: byGroupResult.error.message }, { status: 500 });
      }

      const planRows = Array.isArray(byGroupResult.data) ? byGroupResult.data : [];
      if (!planRows.length) {
        return NextResponse.json({ error: "No scheduled items found to publish" }, { status: 400 });
      }

      const periodStarts = planRows.map((row) => String(row?.period_start || "").slice(0, 10)).filter(Boolean).sort();
      const periodEnds = planRows.map((row) => String(row?.period_end || row?.period_start || "").slice(0, 10)).filter(Boolean).sort();
      const periodStart = periodStarts[0] || masterPlan.period_start;
      const periodEnd = periodEnds[periodEnds.length - 1] || periodStart || masterPlan.period_end;

      // 2. Build Publish Snapshot
      let publishSnapshot;
      try {
        publishSnapshot = await buildPublishSnapshot({
          supabaseAdmin,
          rows: planRows,
          masterPlanNo,
          periodStart,
          periodEnd,
          publishedAt: nowIso,
          publishedBy: actorName,
          publishedByUserId: userId,
        });
      } catch (snapshotError) {
        const allowFallback = process.env.NODE_ENV !== "production";
        if (!allowFallback) {
          throw snapshotError;
        }
        publishSnapshot = {
          snapshot_meta: {
            masterPlanNo,
            periodStart,
            periodEnd,
            publishedAt: nowIso,
            publishedBy: actorName,
            publishedByUserId: userId,
            asOf: nowIso,
            totalFgSkus: Array.from(new Set(planRows.map((row) => normalizeSku(row?.sku_code)).filter(Boolean))).length,
            totalMaterialSkus: 0,
            totalPlanRows: planRows.length,
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

      // 3. Update Master Plan in Database
      const masterUpsertResult = await supabaseAdmin
        .from("production_master_plans")
        .upsert({
          master_plan_no: masterPlanNo,
          period_start: periodStart,
          period_end: periodEnd,
          status: "published",
          published_at: nowIso,
          published_by: userId,
          published_by_name: actorName,
          snapshot_frozen_at: nowIso,
          snapshot_frozen_by: userId,
          verified_at: nowIso,
          verified_by: userId,
          reject_reason: null,
          ...publishSnapshot,
          updated_by: userId,
          updated_at: nowIso,
        }, { onConflict: "master_plan_no" });

      if (masterUpsertResult.error) {
        return NextResponse.json({ error: masterUpsertResult.error.message }, { status: 500 });
      }

      // 4. Save History Snapshot
      const historyInsertResult = await supabaseAdmin
        .from("production_master_plan_snapshots")
        .insert({
          master_plan_no: masterPlanNo,
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
        return NextResponse.json({ error: historyInsertResult.error.message }, { status: 500 });
      }

      // 5. Update Status of Plan Rows in production_plan_status
      const planIds = planRows.map((row) => row.plan_id).filter(Boolean);
      const statusUpdatePayload = {
        master_published_at: nowIso,
        master_published_by: actorName,
        master_published_by_user_id: userId,
        master_plan_no: masterPlanNo,
        plan_group_id: masterPlanNo,
      };

      const statusUpdate = await supabaseAdmin
        .from("production_plan_status")
        .update(statusUpdatePayload)
        .in("plan_id", planIds);

      if (statusUpdate.error) {
        return NextResponse.json({ error: statusUpdate.error.message }, { status: 500 });
      }

      // 6. Auto-generate Subplan Drafts
      let autoDraftSummary = null;
      try {
        autoDraftSummary = await autoGenerateSubplanDraftsForMasterPlan({
          supabaseAdmin,
          request,
          masterPlanNo,
          actorUserId: userId,
          nowIso,
        });
      } catch (autoDraftError) {
        autoDraftSummary = {
          ok: false,
          error: String(autoDraftError?.message || autoDraftError),
        };
      }

      // 7. Send Notifications back to Planner
      const targetPlanners = Array.from(new Set([masterPlan.created_by, masterPlan.updated_by].filter(Boolean)));
      try {
        // Broadcast standard master published push notification
        await sendPlanningPushNotification(supabaseAdmin, "planning.master_published", {
          title: "เผยแพร่แผนหลักแล้ว",
          body: `แผน ${masterPlanNo} พร้อมให้แผนกดำเนินการต่อ`,
          url: `/production-line/planning/plan?masterPlanNo=${encodeURIComponent(masterPlanNo)}`,
          data: { masterPlanNo, periodStart, periodEnd },
        });

        // Send check accepted specific notification
        await sendPlanningPushNotification(supabaseAdmin, "planning.material_check_accepted", {
          title: "แผนหลักได้รับอนุมัติวัตถุดิบ",
          body: `แผนหลัก ${masterPlanNo} ได้รับการอนุมัติความเพียงพอวัตถุดิบจากคลังสินค้าแล้ว`,
          url: `/production-line/planning/schedule?masterPlanNo=${encodeURIComponent(masterPlanNo)}`,
          data: { masterPlanNo },
        }, { userIds: targetPlanners });

      } catch (pushError) {
        console.error("Failed to send push notifications:", pushError);
      }

      return NextResponse.json({
        ok: true,
        status: "published",
        autoDraftSubplans: autoDraftSummary,
      });

    } else if (action === "reject") {
      if (!reason) {
        return NextResponse.json({ error: "เหตุผลในการปฏิเสธแผนเป็นสิ่งจำเป็น (reason is required)" }, { status: 400 });
      }

      // 1. Update master plan status to rejected and store reason
      const { error: updateError } = await supabaseAdmin
        .from("production_master_plans")
        .update({
          status: "rejected",
          reject_reason: reason,
          verified_at: nowIso,
          verified_by: userId,
          updated_at: nowIso,
          updated_by: userId,
        })
        .eq("master_plan_no", masterPlanNo);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // 2. Send Notification back to Planners
      const targetPlanners = Array.from(new Set([masterPlan.created_by, masterPlan.updated_by].filter(Boolean)));
      try {
        await sendPlanningPushNotification(supabaseAdmin, "planning.material_check_rejected", {
          title: "แผนหลักถูกปฏิเสธวัตถุดิบ",
          body: `แผนหลัก ${masterPlanNo} ถูกปฏิเสธ: ${reason}`,
          url: `/production-line/planning/schedule?masterPlanNo=${encodeURIComponent(masterPlanNo)}`,
          data: { masterPlanNo, reason },
        }, { userIds: targetPlanners });
      } catch (pushError) {
        console.error("Failed to send reject notification:", pushError);
      }

      return NextResponse.json({ ok: true, status: "rejected" });

    } else {
      return NextResponse.json({ error: "Invalid action. Must be request_verify, accept, or reject." }, { status: 400 });
    }

  } catch (error) {
    return jsonError(error);
  }
}
