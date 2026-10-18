import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  mapDeliveryPointRow,
  normalizeDeliveryPointInput,
} from "@/lib/productionDeliveryPoints";

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

async function loadDeliveryPoint(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("production_delivery_points")
    .select("id,code,name,description,sort_order,is_active,created_at,updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load delivery point");
  }
  return data || null;
}

async function findDuplicateDeliveryPoint({
  supabaseAdmin,
  code,
  name,
  excludeId,
}) {
  const { data, error } = await supabaseAdmin
    .from("production_delivery_points")
    .select("id,code,name")
    .is("deleted_at", null);

  if (error) {
    throw new Error("Failed to validate duplicate delivery point");
  }

  const targetCode = normalizedLower(code);
  const targetName = normalizedLower(name);
  const duplicateCode = (data ?? []).find((row) => {
    if (excludeId && row.id === excludeId) return false;
    return normalizedLower(row.code) === targetCode;
  });
  const duplicateName = (data ?? []).find((row) => {
    if (excludeId && row.id === excludeId) return false;
    return normalizedLower(row.name) === targetName;
  });

  return { duplicateCode, duplicateName };
}

export async function PUT(request, { params }) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-delivery-points-edit");
    const { id } = await params;
    const body = await readJson(request);
    const input = normalizeDeliveryPointInput(body);

    if (input.errors.length) {
      return Response.json({ error: "Invalid delivery point", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const existing = await loadDeliveryPoint(supabaseAdmin, id);
    if (!existing) {
      return Response.json({ error: "Delivery point not found" }, { status: 404 });
    }

    const { duplicateCode, duplicateName } = await findDuplicateDeliveryPoint({
      supabaseAdmin,
      code: input.code,
      name: input.name,
      excludeId: id,
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate delivery point code" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate delivery point name" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_delivery_points")
      .update({
        code: input.code,
        name: input.name,
        description: input.description,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id,code,name,description,sort_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to update delivery point" }, { status: 500 });
    }

    return Response.json({ data: mapDeliveryPointRow(data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-delivery-points-delete");
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const existing = await loadDeliveryPoint(supabaseAdmin, id);
    if (!existing) {
      return Response.json({ error: "Delivery point not found" }, { status: 404 });
    }

    const { error: workCenterError } = await supabaseAdmin
      .from("production_work_centers")
      .update({
        delivery_point_id: null,
        updated_by: userId,
      })
      .eq("delivery_point_id", id)
      .is("deleted_at", null);

    if (workCenterError) {
      return Response.json({ error: "Failed to clear work center delivery points" }, { status: 500 });
    }

    const { error } = await supabaseAdmin
      .from("production_delivery_points")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) {
      return Response.json({ error: "Failed to delete delivery point" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
