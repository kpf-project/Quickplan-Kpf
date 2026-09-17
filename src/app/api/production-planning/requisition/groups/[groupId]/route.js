import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadClaimScope } from "@/lib/claimPermissions";
import {
  listRequisitionGroupItems,
  REQUISITION_GROUP_STATUS,
  summarizeGroupItems,
} from "@/lib/requisitionGroups";

export const dynamic = "force-dynamic";

async function loadGroupWithItems(supabaseAdmin, groupId) {
  const groupResult = await supabaseAdmin
    .from("production_requisition_group_batches")
    .select("*")
    .eq("id", groupId)
    .maybeSingle();

  if (groupResult.error) {
    throw new Error(groupResult.error.message);
  }
  if (!groupResult.data) return null;

  const items = await listRequisitionGroupItems(supabaseAdmin, [groupId]);
  return {
    group: groupResult.data,
    items,
  };
}

function canAccessGroup(permission, scope, payload) {
  if (!payload?.group) return false;
  if (scope.canManageGlobal || permission.isAdmin) return true;
  if (String(payload.group.created_by || "").trim() === String(permission.userId || "").trim()) return true;
  const deptSet = new Set(scope.departmentIds || []);
  return payload.items.every((item) => deptSet.has(String(item?.owner_department_id || "").trim()));
}

export async function PATCH(request, { params }) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.claim_material",
      "plan.view_claim_all",
      "plan.consolidate_cross_qa",
      "admin-requisition",
    ]);
    const { groupId } = await params;
    const body = await readJson(request);
    const action = String(body?.action || "").trim().toLowerCase();

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadClaimScope({
      supabaseAdmin,
      request,
      permission,
      action: "view",
    });
    const payload = await loadGroupWithItems(supabaseAdmin, groupId);
    if (!payload?.group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (!canAccessGroup(permission, scope, payload)) {
      return NextResponse.json({ error: "Group scope violation" }, { status: 403 });
    }

    if (action === "confirm") {
      if (!payload.items.length) {
        return NextResponse.json({ error: "Cannot confirm an empty group" }, { status: 400 });
      }

      const invalidItem = payload.items.find((item) => !item.claim_department_id);
      if (invalidItem) {
        return NextResponse.json({ error: "All grouped rows must still have claim ownership" }, { status: 400 });
      }

      const updateResult = await supabaseAdmin
        .from("production_requisition_group_batches")
        .update({
          status: REQUISITION_GROUP_STATUS.ready,
          confirmed_by: permission.userId,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", groupId)
        .select("*")
        .single();

      if (updateResult.error) {
        return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        data: summarizeGroupItems(updateResult.data, payload.items),
      });
    }

    if (action === "reopen") {
      if (payload.group.status === REQUISITION_GROUP_STATUS.exported) {
        return NextResponse.json({ error: "Exported groups cannot be reopened" }, { status: 400 });
      }
      const updateResult = await supabaseAdmin
        .from("production_requisition_group_batches")
        .update({
          status: REQUISITION_GROUP_STATUS.draft,
          confirmed_by: null,
          confirmed_at: null,
        })
        .eq("id", groupId)
        .select("*")
        .single();

      if (updateResult.error) {
        return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        data: summarizeGroupItems(updateResult.data, payload.items),
      });
    }

    if (action === "delete") {
      if (payload.group.status === REQUISITION_GROUP_STATUS.exported) {
        return NextResponse.json({ error: "Exported groups cannot be deleted" }, { status: 400 });
      }
      const deleteResult = await supabaseAdmin
        .from("production_requisition_group_batches")
        .delete()
        .eq("id", groupId);

      if (deleteResult.error) {
        return NextResponse.json({ error: deleteResult.error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
