import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  mapSectionShiftRow,
  normalizeSectionShiftInput,
} from "@/lib/productionSectionShifts";

export async function PUT(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const { id } = await params;
    const input = normalizeSectionShiftInput(await readJson(request));
    if (input.errors.length) {
      return Response.json({ error: "Invalid section shift", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("production_section_shifts")
      .select("id")
      .eq("section_def_id", input.sectionDefId)
      .eq("shift_id", input.shiftId)
      .is("deleted_at", null)
      .neq("id", id)
      .maybeSingle();

    if (duplicateError) {
      return Response.json({ error: "Failed to validate duplicate section shift" }, { status: 500 });
    }
    if (duplicate) {
      return Response.json({ error: "Duplicate section shift" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_section_shifts")
      .update({
        section_def_id: input.sectionDefId,
        shift_id: input.shiftId,
        start_time: input.startTime,
        end_time: input.endTime,
        crosses_midnight: input.crossesMidnight,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select(`
        id,section_def_id,shift_id,start_time,end_time,crosses_midnight,sort_order,is_active,
        production_shifts!inner(id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active)
      `)
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to update section shift" }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Section shift not found" }, { status: 404 });
    }

    return Response.json({ data: mapSectionShiftRow(data) });
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
    const { error } = await supabaseAdmin
      .from("production_section_shifts")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) {
      return Response.json({ error: "Failed to delete section shift" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
