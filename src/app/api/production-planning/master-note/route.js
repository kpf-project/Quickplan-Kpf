import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";

function normalizeDateInput(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function isMissingPlanNoteColumn(error) {
  return String(error?.message || "").toLowerCase().includes("plan_note");
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.publish_master",
    ]);

    const body = await readJson(request);
    const rawPlanNo = String(
      normalizeParam(body?.planNo || body?.masterPlanNo || body?.planGroupId) || ""
    ).trim().toUpperCase();
    const planNo = normalizeMasterPlanNo(rawPlanNo);
    if (!planNo) {
      return Response.json({ error: "planNo is required" }, { status: 400 });
    }

    const hasNoteField = Object.prototype.hasOwnProperty.call(body || {}, "note");
    if (!hasNoteField) {
      return Response.json({ error: "note is required" }, { status: 400 });
    }
    const normalizedNote = normalizeParam(body?.note);
    const boundedNote = normalizedNote ? String(normalizedNote).slice(0, 500) : null;

    const supabaseAdmin = getSupabaseAdmin();
    const [masterResult, rowsResult] = await Promise.all([
      supabaseAdmin
        .from("production_master_plans")
        .select("master_plan_no,period_start,period_end,status,created_by")
        .eq("master_plan_no", planNo)
        .maybeSingle(),
      supabaseAdmin
        .from("production_plan_status")
        .select("period_start,period_end")
        .eq("master_plan_no", planNo),
    ]);
    if (masterResult.error) {
      return Response.json({ error: masterResult.error.message }, { status: 500 });
    }
    if (rowsResult.error) {
      return Response.json({ error: rowsResult.error.message }, { status: 500 });
    }

    const existingMaster = masterResult.data || null;
    const planRows = Array.isArray(rowsResult.data) ? rowsResult.data : [];
    const periodStarts = planRows
      .map((row) => normalizeDateInput(row?.period_start))
      .filter(Boolean)
      .sort();
    const periodEnds = planRows
      .map((row) => normalizeDateInput(row?.period_end || row?.period_start))
      .filter(Boolean)
      .sort();

    const periodStart =
      normalizeDateInput(existingMaster?.period_start) || periodStarts[0] || null;
    const periodEnd =
      normalizeDateInput(existingMaster?.period_end) || periodEnds[periodEnds.length - 1] || periodStart;

    if (!periodStart || !periodEnd) {
      return Response.json({
        error: "Master plan period not found",
        details: { masterPlanNo: planNo },
      }, { status: 404 });
    }

    const upsertPayload = {
      master_plan_no: planNo,
      period_start: periodStart,
      period_end: periodEnd,
      status: String(existingMaster?.status || "draft"),
      note: boundedNote,
      updated_by: userId,
    };
    if (!existingMaster?.created_by) {
      upsertPayload.created_by = userId;
    }

    const upsertResult = await supabaseAdmin
      .from("production_master_plans")
      .upsert(upsertPayload, { onConflict: "master_plan_no" });
    if (upsertResult.error) {
      return Response.json({ error: upsertResult.error.message }, { status: 500 });
    }

    const byMasterResult = await supabaseAdmin
      .from("production_plan_status")
      .update({ plan_note: boundedNote })
      .eq("master_plan_no", planNo);
    if (byMasterResult.error && !isMissingPlanNoteColumn(byMasterResult.error)) {
      return Response.json({ error: byMasterResult.error.message }, { status: 500 });
    }
    if (!byMasterResult.error) {
      const byGroupResult = await supabaseAdmin
        .from("production_plan_status")
        .update({ plan_note: boundedNote })
        .eq("plan_group_id", planNo);
      if (byGroupResult.error && !isMissingPlanNoteColumn(byGroupResult.error)) {
        return Response.json({ error: byGroupResult.error.message }, { status: 500 });
      }
    }

    return Response.json({
      ok: true,
      data: {
        masterPlanNo: planNo,
        note: boundedNote,
      },
    }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
