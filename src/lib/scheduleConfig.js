import "server-only";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { attachDateLayouts } from "@/lib/scheduleDateLayout";

// ── Template loaders ───────────────────────────────────────────────────────────

/**
 * Load one template with its sections and columns in 2 parallel queries.
 * Returns null if not found.
 */
export async function loadTemplate(templateId) {
  const db = getSupabaseAdmin();
  const [tplRes, secRes] = await Promise.all([
    db.from("production_schedule_templates")
      .select("id,dept_id,name,is_active")
      .eq("id", templateId)
      .maybeSingle(),
    db.from("production_schedule_section_defs")
      .select(`
        id, name, display_order, color_theme,
        production_schedule_column_defs (
          id, key, label, col_type, display_order, width,
          highlight_color, group_label, group_order,
          auto_fill_field, is_required
        )
      `)
      .eq("template_id", templateId)
      .order("display_order")
      .order("display_order", { referencedTable: "production_schedule_column_defs" }),
  ]);

  if (tplRes.error || !tplRes.data) return null;
  return { ...tplRes.data, sections: await attachDateLayouts(db, secRes.data ?? []) };
}

/**
 * Load the active template for a department.
 * Returns null if no template is assigned.
 */
export async function loadTemplateByDept(deptId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("production_schedule_templates")
    .select("id")
    .eq("dept_id", deptId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return loadTemplate(data.id);
}

/**
 * List all templates (optionally filtered by dept).
 */
export async function listTemplates(deptId = null) {
  const db = getSupabaseAdmin();
  let q = db
    .from("production_schedule_templates")
    .select("id,dept_id,name,is_active,created_at,production_departments(id,name,code)")
    .order("created_at", { ascending: false });

  if (deptId) q = q.eq("dept_id", deptId);
  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

// ── Plan loaders ───────────────────────────────────────────────────────────────

/**
 * Load plan + all rows in 2 parallel queries.
 */
export async function loadPlanWithRows(planId) {
  const db = getSupabaseAdmin();
  const [planRes, rowsRes] = await Promise.all([
    db.from("production_schedule_plans")
      .select("id,dept_id,template_id,master_plan_no,week_start_date,period_end,status,notes")
      .eq("id", planId)
      .maybeSingle(),
    db.from("production_schedule_rows")
      .select("id,section_def_id,day_key,display_order,row_data,sub_plan_id")
      .eq("plan_id", planId)
      .order("section_def_id")
      .order("day_key")
      .order("display_order"),
  ]);

  return {
    plan: planRes.data ?? null,
    rows: rowsRes.data ?? [],
  };
}

/**
 * Find or return null for the plan matching dept + date range.
 */
export async function findPlan(deptId, weekStartDate, periodEnd) {
  const db = getSupabaseAdmin();
  let query = db
    .from("production_schedule_plans")
    .select("id")
    .eq("dept_id", deptId)
    .eq("week_start_date", weekStartDate);

  if (periodEnd) {
    query = query.eq("period_end", periodEnd);
  }

  const { data } = await query.maybeSingle();
  return data?.id ?? null;
}
