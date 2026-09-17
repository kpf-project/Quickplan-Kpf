import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { getUserPermissions } from "@/lib/permissionsData";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

const normalizeSku = (value) => String(value || "").trim().toUpperCase();

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableLineHash(row) {
  return JSON.stringify({
    seq: toNumber(row?.TRD_SEQ ?? row?.line_seq, 0),
    sku: normalizeSku(row?.TRD_SH_CODE ?? row?.sku_code),
    qty: toNumber(row?.TRD_QTY ?? row?.qty, 0),
    lot: String(row?.TRD_LOT_NO ?? row?.lot_no ?? "").trim(),
    wl: String(row?.WL_CODE ?? row?.warehouse_code ?? "").trim(),
    uom: String(row?.TRD_UTQNAME ?? row?.uom ?? "").trim(),
    remark: String(row?.DI_REMARK ?? row?.remark ?? "").trim(),
  });
}

async function hasPlanningManageAccess(request, userId, isAdmin = false) {
  if (isAdmin) return true;
  const session = getSessionFromRequest(request, userId);
  if (session?.isAdmin) return true;
  if (Array.isArray(session?.permissions)) {
    return session.permissions.includes("production-line-planning-manage");
  }
  const permissionResult = await getUserPermissions(userId);
  return Boolean(
    permissionResult?.isAdmin
    || permissionResult?.permissions?.includes("production-line-planning-manage")
  );
}

async function loadEditableDepartmentIds(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role,production_departments(id,is_active,deleted_at)")
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? [])
    .filter((row) => row?.role === "editor" && row?.production_departments?.is_active && !row?.production_departments?.deleted_at)
    .map((row) => String(row?.department_id || "").trim())
    .filter(Boolean);
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
      "plan.view_all",
    ]);

    const body = await readJson(request);
    const docRef = normalizeParam(body?.docRef || body?.doc_ref || body?.ref);
    if (!docRef) {
      return NextResponse.json({ error: "docRef is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const exportResult = await supabaseAdmin
      .from("production_requisition_exports")
      .select("*")
      .eq("doc_ref", docRef)
      .maybeSingle();
    if (exportResult.error) {
      return NextResponse.json({ error: exportResult.error.message }, { status: 500 });
    }
    if (!exportResult.data) {
      return NextResponse.json({ error: "Export document not found in app database", details: { docRef } }, { status: 404 });
    }
    const exportDepartmentId = String(exportResult.data?.department_id || "").trim();
    const exportMasterPlanNo = normalizeMasterPlanNo(exportResult.data?.master_plan_no);
    if (!exportDepartmentId || !exportMasterPlanNo) {
      return NextResponse.json({
        error: "Export document is missing department_id or master_plan_no",
        details: { docRef },
      }, { status: 400 });
    }
    const canManageGlobal = await hasPlanningManageAccess(
      request,
      permission.userId,
      permission.isAdmin
    );
    if (!permission.isAdmin && !canManageGlobal) {
      const editableDepartmentIds = await loadEditableDepartmentIds(supabaseAdmin, permission.userId);
      if (!editableDepartmentIds.includes(exportDepartmentId)) {
        return NextResponse.json({
          error: "Department scope violation",
          details: {
            departmentId: exportDepartmentId,
            masterPlanNo: exportMasterPlanNo,
          },
        }, { status: 403 });
      }
    }

    const linesResult = await supabaseAdmin
      .from("production_requisition_export_lines")
      .select("*")
      .eq("doc_ref", docRef)
      .order("line_seq", { ascending: true });
    if (linesResult.error) {
      return NextResponse.json({ error: linesResult.error.message }, { status: 500 });
    }

    const appLines = Array.isArray(linesResult.data) ? linesResult.data : [];
    const appBySeq = new Map();
    appLines.forEach((line) => {
      const seq = toNumber(line?.line_seq, 0);
      if (!seq) return;
      appBySeq.set(seq, line);
    });

    const params = new URLSearchParams();
    params.set("ref", docRef);
    const erpResult = await fetchGatewayJson("/api/raw-material-requisitions-by-ref", params, "production");
    if (!erpResult.ok) {
      return NextResponse.json({ error: "Failed to fetch ERP requisition by ref", details: erpResult.error }, { status: 502 });
    }
    const erpLines = Array.isArray(erpResult.data?.data) ? erpResult.data.data : [];
    const erpBySeq = new Map();
    erpLines.forEach((line) => {
      const seq = toNumber(line?.TRD_SEQ, 0);
      if (!seq) return;
      erpBySeq.set(seq, line);
    });

    const changed = [];
    const missingInErp = [];
    const extraInErp = [];
    const matched = [];

    const allSeqs = Array.from(new Set([...appBySeq.keys(), ...erpBySeq.keys()])).sort((a, b) => a - b);
    allSeqs.forEach((seq) => {
      const appLine = appBySeq.get(seq) || null;
      const erpLine = erpBySeq.get(seq) || null;
      if (appLine && !erpLine) {
        missingInErp.push({ line_seq: seq, app: appLine });
        return;
      }
      if (!appLine && erpLine) {
        extraInErp.push({ line_seq: seq, erp: erpLine });
        return;
      }
      const appHash = stableLineHash(appLine);
      const erpHash = stableLineHash(erpLine);
      if (appHash !== erpHash) {
        changed.push({ line_seq: seq, app: appLine, erp: erpLine });
      } else {
        matched.push({ line_seq: seq });
      }
    });

    const nowIso = new Date().toISOString();
    const reconcileResult = {
      docRef,
      reconciledAt: nowIso,
      totals: {
        appLines: appLines.length,
        erpLines: erpLines.length,
        matched: matched.length,
        changed: changed.length,
        missingInErp: missingInErp.length,
        extraInErp: extraInErp.length,
      },
      sample: {
        changed: changed.slice(0, 25),
        missingInErp: missingInErp.slice(0, 25),
        extraInErp: extraInErp.slice(0, 25),
      },
    };

    const erpHash = JSON.stringify(erpLines.map(stableLineHash));
    const nextStatus = (changed.length || missingInErp.length || extraInErp.length)
      ? "erp_changed"
      : (exportResult.data.status === "draft" ? "exported" : exportResult.data.status);

    const updateResult = await supabaseAdmin
      .from("production_requisition_exports")
      .update({
        status: nextStatus,
        erp_last_synced_at: nowIso,
        erp_hash: erpHash,
        reconcile_result: reconcileResult,
        updated_by: permission.userId,
      })
      .eq("doc_ref", docRef)
      .select("doc_ref,status,erp_last_synced_at");
    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        docRef,
        status: nextStatus,
        reconcile: reconcileResult,
      },
    }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
