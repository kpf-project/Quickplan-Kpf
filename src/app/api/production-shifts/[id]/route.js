import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
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

async function loadShift(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("production_shifts")
    .select("id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load shift");
  }
  return data || null;
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

export async function PUT(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const { id } = await params;
    const input = normalizeShiftInput(await readJson(request));

    if (input.errors.length) {
      return Response.json({ error: "Invalid shift", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const existing = await loadShift(supabaseAdmin, id);
    if (!existing) {
      return Response.json({ error: "Shift not found" }, { status: 404 });
    }

    const { duplicateCode, duplicateName } = await findDuplicateShift({
      supabaseAdmin,
      code: input.code,
      name: input.name,
      excludeId: id,
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate shift code" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate shift name" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_shifts")
      .update({
        code: input.code,
        name: input.name,
        start_time: input.startTime,
        end_time: input.endTime,
        crosses_midnight: input.crossesMidnight,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to update production shift" }, { status: 500 });
    }

    return Response.json({ data: mapShiftRow(data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const existing = await loadShift(supabaseAdmin, id);
    if (!existing) {
      return Response.json({ error: "Shift not found" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("production_shifts")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) {
      return Response.json({ error: "Failed to delete production shift" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
