import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { verifyApprovalToken } from "@/lib/approvalToken";
import {
  logApprovalAction,
  resolveApproverByCode,
} from "@/features/production-line/services/approverCodeService";
import {
  buildApprovalResultFlexMessage,
  sendLineGroupMessage,
} from "@/lib/lineMessaging";
import { assertBomApprovalPolicyReady } from "@/features/production-line/services/bomApprovalValidation";

const VALID_ACTIONS = new Set(["approve", "reject"]);

function normalizeAction(value) {
  if (typeof value !== "string") {
    return "";
  }
  const lowered = value.trim().toLowerCase();
  return VALID_ACTIONS.has(lowered) ? lowered : "";
}

function inspectApprovalToken(token) {
  const normalized = verifyApprovalToken(token);
  return {
    ok: Boolean(normalized),
    reason: normalized ? "token_id" : "missing_or_invalid",
    raw: token,
    normalized,
  };
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";
    const normalizedToken = verifyApprovalToken(token);
    if (!normalizedToken) {
      const debug = searchParams.get("debug") === "1";
      const payload = debug ? inspectApprovalToken(token) : undefined;
      throw new ApiError(
        400,
        "Invalid or missing approval token",
        payload
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: approval, error: approvalError } = await supabaseAdmin
      .from("production_bom_approvals")
      .select(
        "id,status,bom_id,version_id,requested_by,requested_at,decided_by,decided_at,reason,token_id"
      )
      .eq("token_id", normalizedToken)
      .maybeSingle();

    if (approvalError) {
      throw new ApiError(500, "Failed to load approval", approvalError.message);
    }
    if (!approval) {
      throw new ApiError(404, "Approval request not found");
    }

    const logsPromise = supabaseAdmin
      .from("production_bom_approval_logs")
      .select("id,action,approver_profile_id,approver_code,detail,created_at")
      .eq("approval_id", approval.id)
      .order("created_at", { ascending: false });

    const [bomResult, versionResult, logsResult] = await Promise.all([
      supabaseAdmin
        .from("production_boms")
        .select("id,sku_code,status")
        .eq("id", approval.bom_id)
        .maybeSingle(),
      supabaseAdmin
        .from("production_bom_versions")
        .select("id,version_no,status,changes,diff")
        .eq("id", approval.version_id)
        .maybeSingle(),
      logsPromise,
    ]);

    if (bomResult.error) {
      throw new ApiError(500, "Failed to load BOM", bomResult.error.message);
    }
    if (versionResult.error) {
      throw new ApiError(500, "Failed to load BOM version", versionResult.error.message);
    }
    if (!bomResult.data || !versionResult.data) {
      throw new ApiError(404, "BOM information not found");
    }

    if (logsResult.error) {
      throw new ApiError(500, "Failed to load approval logs", logsResult.error.message);
    }

    const userIds = [approval.requested_by, approval.decided_by].filter(Boolean);
    const profilesPromise = userIds.length
      ? supabaseAdmin
        .from("profiles")
        .select("id,username")
        .in("id", userIds)
      : Promise.resolve({ data: [], error: null });

    const productPromise = supabaseAdmin
      .from("products_cache")
      .select("sku_name")
      .eq("sku_code", bomResult.data.sku_code)
      .maybeSingle();

    const [productResult, profilesResult] = await Promise.all([
      productPromise,
      profilesPromise,
    ]);

    if (profilesResult.error) {
      throw new ApiError(500, "Failed to load users", profilesResult.error.message);
    }

    const userMap = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile.username])
    );

    return Response.json({
      token_id: approval.token_id,
      sku_code: bomResult.data.sku_code || "",
      sku_name: productResult?.data?.sku_name || "",
      version_no: versionResult.data.version_no,
      changes: Array.isArray(versionResult.data.changes) ? versionResult.data.changes : [],
      diff: versionResult.data.diff ?? { added: [], updated: [], removed: [] },
      approval: {
        status: approval.status,
        requested_at: approval.requested_at,
        decided_at: approval.decided_at,
        reason: approval.reason,
      },
      requested_by_name: userMap.get(approval.requested_by) || "",
      decided_by_name: userMap.get(approval.decided_by) || "",
      approval_logs: logsResult.data ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const token = body?.token || "";
    const action = normalizeAction(body?.action);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const approverCode = body?.approver_code || "";

    if (!token) {
      throw new ApiError(400, "token is required");
    }
    if (!action) {
      throw new ApiError(400, "action is required");
    }
    if (action === "reject" && !reason) {
      throw new ApiError(400, "reason is required");
    }
    if (!approverCode) {
      throw new ApiError(400, "approver_code is required");
    }

    const normalizedToken = verifyApprovalToken(token);
    if (!normalizedToken) {
      throw new ApiError(400, "Invalid or expired token");
    }

    const approver = await resolveApproverByCode(approverCode);
    if (!approver) {
      throw new ApiError(403, "Invalid approver code");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const approvalResult = await supabaseAdmin
      .from("production_bom_approvals")
      .select("id,status,bom_id,version_id")
      .eq("token_id", normalizedToken)
      .maybeSingle();

    if (approvalResult.error) {
      throw new ApiError(500, "Failed to load approval", approvalResult.error.message);
    }

    const approval = approvalResult.data;
    if (!approval) {
      throw new ApiError(404, "Approval request not found");
    }

    const [bomResult, versionResult] = await Promise.all([
      supabaseAdmin
        .from("production_boms")
        .select("id,sku_code,status")
        .eq("id", approval.bom_id)
        .maybeSingle(),
      supabaseAdmin
        .from("production_bom_versions")
        .select("id,status,version_no,base_batch,base_output_boxes,formula_code,formula_name,changes,diff")
        .eq("id", approval.version_id)
        .maybeSingle(),
    ]);

    if (bomResult.error) {
      throw new ApiError(500, "Failed to load BOM", bomResult.error.message);
    }
    if (versionResult.error) {
      throw new ApiError(500, "Failed to load BOM version", versionResult.error.message);
    }

    const bomRow = bomResult.data;
    if (!bomRow) {
      throw new ApiError(404, "BOM not found");
    }

    const versionRow = versionResult.data;
    if (!versionRow) {
      throw new ApiError(404, "BOM version not found");
    }

    const { data: productRow, error: productError } = await supabaseAdmin
      .from("products_cache")
      .select("sku_name")
      .eq("sku_code", bomRow.sku_code)
      .maybeSingle();
    if (productError) {
      throw new ApiError(500, "Failed to load product", productError.message);
    }

    if (approval.status !== "pending") {
      throw new ApiError(409, "รายการนี้ได้รับการดำเนินการแล้ว");
    }
    if (versionRow.status !== "pending_review") {
      throw new ApiError(409, "BOM version is not pending review");
    }
    if (action === "approve") {
      try {
        await assertBomApprovalPolicyReady({
          supabaseAdmin,
          bomId: approval.bom_id,
          versionId: approval.version_id,
          stage: "approve",
          bomRow,
          versionRow,
        });
      } catch (validationError) {
        console.error("[production-bom-approvals] approval validation failed", {
          token: normalizedToken,
          action,
          approvalId: approval.id,
          approvalStatus: approval.status,
          bomId: approval.bom_id,
          versionId: approval.version_id,
          bomStatus: bomRow.status,
          versionStatus: versionRow.status,
          versionNo: versionRow.version_no,
          skuCode: bomRow.sku_code,
          baseBatch: versionRow.base_batch,
          baseOutputBoxes: versionRow.base_output_boxes,
          details: validationError?.details ?? null,
        });
        throw validationError;
      }
    }

    const nextStatus = action === "approve" ? "approved" : "rejected";
    const timestamp = new Date().toISOString();

    const [approvalUpdateResult, bomUpdateResult, versionUpdateResult] = await Promise.all([
      supabaseAdmin
        .from("production_bom_approvals")
        .update({
          status: nextStatus,
          decided_by: approver.profileId,
          decided_at: timestamp,
          reason: action === "reject" ? reason : null,
        })
        .eq("id", approval.id)
        .select("status,requested_by,requested_at,decided_by,decided_at,reason")
        .maybeSingle(),
      supabaseAdmin
        .from("production_boms")
        .update({ status: nextStatus, updated_by: approver.profileId })
        .eq("id", approval.bom_id),
      supabaseAdmin
        .from("production_bom_versions")
        .update({ status: nextStatus })
        .eq("id", approval.version_id),
    ]);

    if (approvalUpdateResult.error) {
      throw new ApiError(
        500,
        "Failed to update approval",
        approvalUpdateResult.error.message
      );
    }
    if (bomUpdateResult.error) {
      throw new ApiError(500, "Failed to update BOM status", bomUpdateResult.error.message);
    }
    if (versionUpdateResult.error) {
      throw new ApiError(
        500,
        "Failed to update BOM version status",
        versionUpdateResult.error.message
      );
    }

    await logApprovalAction({
      approvalId: approval.id,
      action: nextStatus,
      approverProfileId: approver.profileId,
      approverCode: approver.normalizedCode,
      detail: action === "reject" ? { reason } : null,
    });

    try {
      await sendLineGroupMessage(
        buildApprovalResultFlexMessage({
          skuCode: bomRow.sku_code,
          skuName: productRow?.sku_name || "",
          versionNo: versionRow?.version_no?.toString() ?? "",
          status: nextStatus,
          approverName: approver.username,
          approverCode: approver.normalizedCode,
          reason: action === "reject" ? reason : "",
          changes: versionRow?.changes,
          diff: versionRow?.diff,
        })
      );
    } catch (lineError) {
      console.error("Failed to notify LINE about approval outcome", lineError);
    }

    return Response.json({
      approval: approvalUpdateResult.data,
      status: nextStatus,
      approver_name: approver.username,
      approver_code: approver.normalizedCode,
    });
  } catch (error) {
    console.error("[production-bom-approvals] request failed", {
      message: error?.message ?? "Unexpected error",
      status: error?.status ?? 500,
      details: error?.details ?? null,
    });
    return jsonError(error);
  }
}
