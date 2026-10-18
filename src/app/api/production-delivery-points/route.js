import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  mapDeliveryPointRow,
  normalizeDeliveryPointInput,
  normalizeDeliveryPointQuery,
} from "@/lib/productionDeliveryPoints";

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

async function findDuplicateDeliveryPoint({
  supabaseAdmin,
  code,
  name,
  excludeId = null,
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

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-delivery-points-view");

    const { searchParams } = new URL(request.url);
    const filters = normalizeDeliveryPointQuery({
      search: searchParams.get("search"),
      includeInactive: searchParams.get("includeInactive"),
    });
    const searchLower = filters.search.toLowerCase();

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_delivery_points")
      .select("id,code,name,description,sort_order,is_active,created_at,updated_at")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!filters.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "Failed to load delivery points" }, { status: 500 });
    }

    const rows = (data ?? [])
      .map(mapDeliveryPointRow)
      .filter((row) => {
        if (!searchLower) return true;
        return (
          String(row.code || "").toLowerCase().includes(searchLower)
          || String(row.name || "").toLowerCase().includes(searchLower)
          || String(row.description || "").toLowerCase().includes(searchLower)
        );
      });

    return Response.json({ data: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-delivery-points-create");
    const body = await readJson(request);
    const input = normalizeDeliveryPointInput(body);

    if (input.errors.length) {
      return Response.json({ error: "Invalid delivery point", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { duplicateCode, duplicateName } = await findDuplicateDeliveryPoint({
      supabaseAdmin,
      code: input.code,
      name: input.name,
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate delivery point code" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate delivery point name" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_delivery_points")
      .insert({
        code: input.code,
        name: input.name,
        description: input.description,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        created_by: userId,
        updated_by: userId,
      })
      .select("id,code,name,description,sort_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to create delivery point" }, { status: 500 });
    }

    return Response.json({ data: mapDeliveryPointRow(data) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
