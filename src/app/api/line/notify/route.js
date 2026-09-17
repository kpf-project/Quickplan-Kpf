import crypto from "crypto";

import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import {
  buildApprovalFlexMessage,
  sendLineGroupMessage,
} from "@/lib/lineMessaging";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { assertBomApprovalPolicyReady } from "@/features/production-line/services/bomApprovalValidation";
import { getBomApprovalSettings } from "@/lib/bomApprovalSettings";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export const dynamic = "force-dynamic";

function buildApprovalUrl(origin, action, token) {
  const safeAction = action === "reject" ? "reject" : "approve";
  const liffId = process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  if (liffId) {
    const url = new URL(`https://liff.line.me/${liffId}`);
    url.searchParams.set("action", safeAction);
    url.searchParams.set("token", token);
    if (process.env.LINE_LIFF_DEBUG === "1") {
      url.searchParams.set("debug", "1");
    }
    return url.toString();
  }
  const url = new URL("/production-line/bom/approval/liff", origin);
  url.searchParams.set("action", safeAction);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildApprovalMessagePayload({
  origin,
  tokenId,
  skuCode,
  skuName,
  version,
  editorName,
  changes,
}) {
  const approveUrl = buildApprovalUrl(origin, "approve", tokenId);
  const rejectUrl = buildApprovalUrl(origin, "reject", tokenId);

  return buildApprovalFlexMessage({
    skuCode,
    skuName,
    versionNo: String(version.version_no || ""),
    editorName,
    changes: changes ?? version.changes,
    diff: version.diff,
    approveUrl,
    rejectUrl,
  });
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-bom-manage",
    ]);
    const body = await readJson(request);

    const skuCode = normalizeString(body.sku_code);
    const skuName = normalizeString(body.sku_name);
    const editorName = normalizeString(body.editor_name);

    if (!skuCode) {
      throw new ApiError(400, "sku_code is required");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const approvalSettings = await getBomApprovalSettings(supabaseAdmin);
    if (!approvalSettings.requireApproval) {
      throw new ApiError(409, "BOM approval mode is disabled");
    }

    const { data: bom, error: bomError } = await supabaseAdmin
      .from("production_boms")
      .select("id,sku_code,status")
      .eq("sku_code", skuCode)
      .maybeSingle();
    if (bomError) {
      throw new ApiError(500, "Failed to load bom", bomError.message);
    }
    if (!bom) {
      throw new ApiError(404, "BOM not found");
    }

    const { data: version, error: versionError } = await supabaseAdmin
      .from("production_bom_versions")
      .select("id,bom_id,version_no,status,base_batch,base_output_boxes,formula_code,formula_name,changes,diff")
      .eq("bom_id", bom.id)
      .is("deleted_at", null)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) {
      throw new ApiError(500, "Failed to load bom version", versionError.message);
    }
    if (!version) {
      throw new ApiError(400, "BOM version not found");
    }
    if (version.status === "rejected" && bom.status === "rejected") {
      throw new ApiError(409, "เวอร์ชันนี้ถูกปฏิเสธแล้ว (สร้างเวอร์ชันใหม่ก่อนขออนุมัติ)");
    }
    if ((version.version_no ?? 0) <= 1) {
      throw new ApiError(400, "First version does not require approval");
    }
    if (version.status === "approved" && bom.status === "approved") {
      throw new ApiError(409, "Approved version cannot be requested");
    }

    await assertBomApprovalPolicyReady({
      supabaseAdmin,
      bomId: bom.id,
      versionId: version.id,
      stage: "request",
      bomRow: bom,
      versionRow: version,
    });

    const { data: pendingApproval, error: pendingApprovalError } = await supabaseAdmin
      .from("production_bom_approvals")
      .select("id,token_id")
      .eq("version_id", version.id)
      .eq("status", "pending")
      .maybeSingle();
    if (pendingApprovalError) {
      throw new ApiError(500, "Failed to load pending approval", pendingApprovalError.message);
    }
    const origin = request.nextUrl?.origin || new URL(request.url).origin;
    if (pendingApproval) {
      const tokenId = pendingApproval.token_id || crypto.randomUUID();
      if (!pendingApproval.token_id) {
        const { error: tokenUpdateError } = await supabaseAdmin
          .from("production_bom_approvals")
          .update({ token_id: tokenId })
          .eq("id", pendingApproval.id);
        if (tokenUpdateError) {
          throw new ApiError(500, "Failed to refresh pending approval token", tokenUpdateError.message);
        }
      }

      await sendLineGroupMessage(
        buildApprovalMessagePayload({
          origin,
          tokenId,
          skuCode,
          skuName,
          version,
          editorName,
          changes: body.changes,
        })
      );

      return Response.json({ ok: true, resent: true, token_id: tokenId });
    }

    const tokenId = crypto.randomUUID();
    const previousBomStatus = bom.status;
    const previousVersionStatus = version.status;
    const { error: insertError } = await supabaseAdmin
      .from("production_bom_approvals")
      .insert({
        bom_id: bom.id,
        version_id: version.id,
        status: "pending",
        requested_by: userId,
        requested_at: new Date().toISOString(),
        token_id: tokenId,
      });
    if (insertError) {
      throw new ApiError(500, "Failed to create approval request", insertError.message);
    }

    const [bomUpdateResult, versionUpdateResult] = await Promise.all([
      supabaseAdmin
        .from("production_boms")
        .update({ status: "pending_review", updated_by: userId })
        .eq("id", bom.id),
      supabaseAdmin
        .from("production_bom_versions")
        .update({ status: "pending_review" })
        .eq("id", version.id),
    ]);
    if (bomUpdateResult.error) {
      throw new ApiError(
        500,
        "Failed to update bom status",
        bomUpdateResult.error.message
      );
    }
    if (versionUpdateResult.error) {
      throw new ApiError(
        500,
        "Failed to update bom version status",
        versionUpdateResult.error.message
      );
    }

    const flexMessage = buildApprovalMessagePayload({
      origin,
      tokenId,
      skuCode,
      skuName,
      version,
      editorName,
      changes: body.changes,
    });

    try {
      await sendLineGroupMessage(flexMessage);
    } catch (error) {
      await Promise.all([
        supabaseAdmin
          .from("production_boms")
          .update({ status: previousBomStatus })
          .eq("id", bom.id),
        supabaseAdmin
          .from("production_bom_versions")
          .update({ status: previousVersionStatus })
          .eq("id", version.id),
        supabaseAdmin
          .from("production_bom_approvals")
          .delete()
          .eq("token_id", tokenId),
      ]);
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
