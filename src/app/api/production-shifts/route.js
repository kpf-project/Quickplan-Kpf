import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  inferCrossesMidnight,
  mapShiftRow,
  normalizeShiftCode,
  normalizeShiftName,
  normalizeShiftSortOrder,
  normalizeShiftTime,
} from "@/lib/productionShifts";

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeShiftInput(body = {}) {
  const code = normalizeShiftCode(body?.code);
  const name = normalizeShiftName(body?.name);
  const startTime = normalizeShiftTime(body?.startTime ?? body?.start_time);
  const endTime = normalizeShiftTime(body?.endTime ?? body?.end_time);
  const sortOrder = normalizeShiftSortOrder(body?.sortOrder ?? body?.sort_order, 0);
  const isActive = body?.isActive !== false && body?.is_active !== false;
  const explicitCrossesMidnight = body?.crossesMidnight ?? body?.crosses_midnight;
  const crossesMidnight =
    typeof explicitCrossesMidnight === "boolean"
      ? explicitCrossesMidnight
      : inferCrossesMidnight(startTime, endTime);

  const errors = [];
  if (!code) errors.push("Shift code is required");
  if (!name) errors.push("Shift name is required");
  if (!startTime) errors.push("Shift start time is required");
  if (!endTime) errors.push("Shift end time is required");

  return {
    code,
    name,
    startTime,
    endTime,
    crossesMidnight,
    sortOrder,
    isActive,
    errors,
  };
}

async function findDuplicateShift({
  supabaseAdmin,
  code,
  name,
  excludeId = null,
}) {
  const { data, error } = await supabaseAdmin
    .from("production_shifts")
    .select("id,code,name")
    .is("deleted_at", null);

  if (error) {
    throw new Error("Failed to validate duplicate shift");
  }

  const targetCode = normalizedLower(code);
  const targetName = normalizedLower(name);

  return {
    duplicateCode: (data ?? []).find((row) => {
      if (excludeId && row.id === excludeId) return false;
      return normalizedLower(row.code) === targetCode;
    }) || null,
    duplicateName: (data ?? []).find((row) => {
      if (excludeId && row.id === excludeId) return false;
      return normalizedLower(row.name) === targetName;
    }) || null,
  };
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-shifts-view");

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get("search") || "").trim().toLowerCase();
    const includeInactive = searchParams.get("includeInactive") === "true";

    let query = getSupabaseAdmin()
      .from("production_shifts")
      .select("id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active,created_at,updated_at")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "Failed to load production shifts" }, { status: 500 });
    }

    const rows = (data ?? [])
      .map(mapShiftRow)
      .filter((row) => {
        if (!search) return true;
        return (
          String(row.code || "").toLowerCase().includes(search)
          || String(row.name || "").toLowerCase().includes(search)
        );
      });

    return Response.json({ data: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-shifts-create");

    const input = normalizeShiftInput(await readJson(request));
    if (input.errors.length) {
      return Response.json({ error: "Invalid shift", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { duplicateCode, duplicateName } = await findDuplicateShift({
      supabaseAdmin,
      code: input.code,
      name: input.name,
    });

    if (duplicateCode) {
      return Response.json({ error: "Duplicate shift code" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate shift name" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_shifts")
      .insert({
        code: input.code,
        name: input.name,
        start_time: input.startTime,
        end_time: input.endTime,
        crosses_midnight: input.crossesMidnight,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        created_by: userId,
        updated_by: userId,
      })
      .select("id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to create production shift" }, { status: 500 });
    }

    return Response.json({ data: mapShiftRow(data) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
