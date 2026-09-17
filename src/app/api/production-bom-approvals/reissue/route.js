import crypto from "crypto";

import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, "");
}

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

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    await requirePermissionKeys(request, ["production-line-bom-manage"]);
    const body = await readJson(request);
    const tokenFromBody = normalizeToken(body?.token);
    const tokenIdFromBody = normalizeString(body?.token_id);
    const tokenId = tokenIdFromBody || tokenFromBody;

    if (!tokenId) {
      throw new ApiError(400, "token_id is required");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: approval, error: approvalError } = await supabaseAdmin
      .from("production_bom_approvals")
      .select("id,bom_id,version_id,status")
      .eq("token_id", tokenId)
      .maybeSingle();
    if (approvalError) {
      throw new ApiError(500, "Failed to load approval", approvalError.message);
    }
    if (!approval) {
      throw new ApiError(404, "Approval request not found");
    }
    if (approval.status !== "pending") {
      throw new ApiError(409, "Approval request is not pending");
    }

    const [bomResult, versionResult] = await Promise.all([
      supabaseAdmin
        .from("production_boms")
        .select("id,sku_code")
        .eq("id", approval.bom_id)
        .maybeSingle(),
      supabaseAdmin
        .from("production_bom_versions")
        .select("id,version_no,changes")
        .eq("id", approval.version_id)
        .maybeSingle(),
    ]);

    if (bomResult.error) {
      throw new ApiError(500, "Failed to load BOM data", bomResult.error.message);
    }
    if (versionResult.error) {
      throw new ApiError(500, "Failed to load BOM version", versionResult.error.message);
    }
    if (!bomResult.data || !versionResult.data) {
      throw new ApiError(404, "BOM information not found");
    }

    const newTokenId = crypto.randomUUID();

    const { error: updateError } = await supabaseAdmin
      .from("production_bom_approvals")
      .update({ token_id: newTokenId })
      .eq("id", approval.id);
    if (updateError) {
      throw new ApiError(500, "Failed to reissue approval token", updateError.message);
    }

    const origin = request.nextUrl?.origin || new URL(request.url).origin;
    const approveUrl = buildApprovalUrl(origin, "approve", newTokenId);
    const rejectUrl = buildApprovalUrl(origin, "reject", newTokenId);

    return Response.json({
      token: newTokenId,
      token_id: newTokenId,
      approve_url: approveUrl,
      reject_url: rejectUrl,
      bom_id: bomResult.data.id,
      version_id: versionResult.data.id,
      sku_code: bomResult.data.sku_code,
      version_no: versionResult.data.version_no,
      changes: Array.isArray(versionResult.data.changes)
        ? versionResult.data.changes
        : [],
    });
  } catch (error) {
    return jsonError(error);
  }
}
