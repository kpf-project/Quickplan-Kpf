import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  buildSectionShiftGroups,
  mapSectionShiftRow,
  normalizeSectionShiftInput,
} from "@/lib/productionSectionShifts";
import { mapShiftRow } from "@/lib/productionShifts";

async function loadSectionCatalog(supabaseAdmin, { includeInactiveSections = false } = {}) {
  const [templatesResult, sectionsResult] = await Promise.all([
    supabaseAdmin
      .from("production_schedule_templates")
      .select("id,dept_id,is_active,production_departments(id,code,name)")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("production_schedule_section_defs")
      .select("id,template_id,name,display_order,color_theme")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (templatesResult.error) {
    throw new Error("Failed to load schedule templates");
  }
  if (sectionsResult.error) {
    throw new Error("Failed to load schedule sections");
  }

  const activeTemplateByDepartment = new Map();
  (templatesResult.data ?? []).forEach((template) => {
    const departmentId = String(template?.dept_id || "").trim();
    if (!departmentId || activeTemplateByDepartment.has(departmentId)) return;
    if (!includeInactiveSections && template?.is_active !== true) return;
    activeTemplateByDepartment.set(departmentId, template);
  });

  const templatesById = new Map();
  activeTemplateByDepartment.forEach((template) => {
    templatesById.set(String(template?.id || "").trim(), template);
  });

  return (sectionsResult.data ?? [])
    .map((section) => {
      const template = templatesById.get(String(section?.template_id || "").trim());
      const department = template?.production_departments || null;
      if (!template || !department) return null;
      return {
        id: section.id,
        name: String(section?.name || "").trim() || null,
        display_order: Number(section?.display_order ?? 0) || 0,
        color_theme: section?.color_theme || null,
        template_id: section?.template_id || null,
        department_id: department?.id || null,
        department_code: String(department?.code || "").trim().toUpperCase() || null,
        department_name: String(department?.name || "").trim() || null,
      };
    })
    .filter(Boolean);
}

async function loadSectionShiftAssignments(supabaseAdmin, { includeInactive = false } = {}) {
  let query = supabaseAdmin
    .from("production_section_shifts")
    .select(`
      id,section_def_id,shift_id,start_time,end_time,crosses_midnight,sort_order,is_active,
      production_shifts!inner(id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active)
    `)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("shift_id", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Failed to load section shift assignments");
  }
  return data ?? [];
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const includeInactiveSections = searchParams.get("includeInactiveSections") === "true";
    const sectionDefIdFilter = String(searchParams.get("sectionDefId") || "").trim();
    const departmentIdFilter = String(searchParams.get("departmentId") || "").trim();

    const supabaseAdmin = getSupabaseAdmin();
    const [sections, assignmentRows, masterShiftRows] = await Promise.all([
      loadSectionCatalog(supabaseAdmin, { includeInactiveSections }),
      loadSectionShiftAssignments(supabaseAdmin, { includeInactive }),
      supabaseAdmin
        .from("production_shifts")
        .select("id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (masterShiftRows.error) {
      return Response.json({ error: "Failed to load production shifts" }, { status: 500 });
    }

    const sectionSet = new Set(
      sections
        .filter((section) => {
          if (sectionDefIdFilter && String(section.id || "").trim() !== sectionDefIdFilter) return false;
          if (departmentIdFilter && String(section.department_id || "").trim() !== departmentIdFilter) return false;
          return true;
        })
        .map((section) => String(section.id || "").trim())
    );

    const filteredAssignments = assignmentRows
      .filter((row) => {
        const key = String(row?.section_def_id || "").trim();
        return !sectionSet.size || sectionSet.has(key);
      })
      .map((row) => mapSectionShiftRow(row));

    const filteredSections = sections.filter((section) => sectionSet.has(String(section.id || "").trim()) || (!sectionDefIdFilter && !departmentIdFilter));
    const groupedSections = buildSectionShiftGroups(filteredSections, filteredAssignments);

    return Response.json({
      data: filteredAssignments,
      sections: groupedSections,
      masterShifts: (masterShiftRows.data ?? []).map(mapShiftRow),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);

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
      .maybeSingle();

    if (duplicateError) {
      return Response.json({ error: "Failed to validate duplicate section shift" }, { status: 500 });
    }
    if (duplicate) {
      return Response.json({ error: "Duplicate section shift" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_section_shifts")
      .insert({
        section_def_id: input.sectionDefId,
        shift_id: input.shiftId,
        start_time: input.startTime,
        end_time: input.endTime,
        crosses_midnight: input.crossesMidnight,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        created_by: userId,
        updated_by: userId,
      })
      .select(`
        id,section_def_id,shift_id,start_time,end_time,crosses_midnight,sort_order,is_active,
        production_shifts!inner(id,code,name,start_time,end_time,crosses_midnight,sort_order,is_active)
      `)
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to create section shift" }, { status: 500 });
    }

    return Response.json({ data: mapSectionShiftRow(data) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
