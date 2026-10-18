import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";

export const dynamic = "force-dynamic";

// GET /api/production-planning/requisition/patterns?ownerDepartmentId=X
// Returns the most recent grouping pattern for a given owner department,
// derived from exported/ready requisition groups.
//
// Response shape:
// {
//   ok: true,
//   data: [
//     { groupName: "ใบเบิก A", materialGoodsCodes: ["MAT001", "MAT002"] },
//     { groupName: "ใบเบิก B", materialGoodsCodes: ["MAT003"] },
//   ]
// }
export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.claim_material",
      "plan.view_claim_all",
    ]);

    const { searchParams } = new URL(request.url);
    const ownerDepartmentId = normalizeParam(searchParams.get("ownerDepartmentId"));
    if (!ownerDepartmentId) {
      return NextResponse.json({ error: "ownerDepartmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch exported/ready groups that contain items owned by this department
    // Limit to the most recent 5 plans to keep the pattern fresh
    const groupsResult = await supabaseAdmin
      .from("production_requisition_group_batches")
      .select("id, group_name, created_at")
      .in("status", ["exported", "ready_to_export"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (groupsResult.error) {
      throw new Error(groupsResult.error.message);
    }

    const groups = Array.isArray(groupsResult.data) ? groupsResult.data : [];
    if (!groups.length) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const groupIds = groups.map((g) => String(g.id || "").trim()).filter(Boolean);

    // Fetch items for those groups, filtered by ownerDepartmentId
    const items = await fetchSupabaseRowsByChunks(
      groupIds,
      (chunk) => supabaseAdmin
        .from("production_requisition_group_items")
        .select("group_id, material_goods_code, material_sku_code, created_at")
        .in("group_id", chunk)
        .eq("owner_department_id", ownerDepartmentId)
    );

    if (!items.length) {
      return NextResponse.json({ ok: true, data: [] });
    }

    // Build groupId → groupName + createdAt map
    const groupMeta = new Map(
      groups.map((g) => [String(g.id || "").trim(), { name: g.group_name || "", createdAt: g.created_at }])
    );

    // For each material, find the most recent group it was assigned to
    // material_goods_code → { groupName, createdAt }
    const materialLatest = new Map();
    items.forEach((item) => {
      const matCode = String(item.material_goods_code || item.material_sku_code || "").trim().toUpperCase();
      if (!matCode) return;
      const gid = String(item.group_id || "").trim();
      const meta = groupMeta.get(gid);
      if (!meta?.name) return;

      const existing = materialLatest.get(matCode);
      const itemDate = item.created_at || meta.createdAt || "";
      if (!existing || itemDate > existing.createdAt) {
        materialLatest.set(matCode, { groupName: meta.name, createdAt: itemDate });
      }
    });

    // Group materials by groupName, preserving insertion order (most recent first)
    const groupNameOrder = [];
    const groupNameMaterials = new Map();
    materialLatest.forEach(({ groupName }, matCode) => {
      if (!groupNameMaterials.has(groupName)) {
        groupNameMaterials.set(groupName, []);
        groupNameOrder.push(groupName);
      }
      groupNameMaterials.get(groupName).push(matCode);
    });

    const data = groupNameOrder.map((groupName) => ({
      groupName,
      materialGoodsCodes: groupNameMaterials.get(groupName),
    }));

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
