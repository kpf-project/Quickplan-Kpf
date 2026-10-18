export function planningSourceRevision(mainPlans = [], subplans = [], legacyMainPlans = []) {
  return [
    ...mainPlans.map((row) => `M:${row.id}:${row.published_revision || 0}`),
    ...subplans.map((row) => `S:${row.department_id}:${row.confirmed_revision || 0}`),
    ...legacyMainPlans.map((row) => `L:${row.master_plan_no}:${row.published_revision || 0}`),
  ].sort().join("|");
}

export function isRequisitionDraftStale(row, revision) {
  return Boolean(row && Object.keys(row.draft_payload || {}).length
    && row.source_revision !== revision);
}

export async function loadPlanningSourceRevision(supabase, masterPlanNo) {
  const [main, sub, legacy] = await Promise.all([
    supabase.from("production_schedule_plans").select("id,published_revision")
      .eq("master_plan_no", masterPlanNo).not("published_snapshot", "is", null),
    supabase.from("production_sub_plans").select("department_id,confirmed_revision")
      .eq("master_plan_no", masterPlanNo).not("confirmed_snapshot", "is", null),
    supabase.from("production_master_plans").select("master_plan_no,published_revision")
      .eq("master_plan_no", masterPlanNo).not("published_plan_rows", "is", null),
  ]);
  if (main.error) throw main.error;
  if (sub.error) throw sub.error;
  if (legacy.error) throw legacy.error;
  return planningSourceRevision(main.data || [], sub.data || [], legacy.data || []);
}
