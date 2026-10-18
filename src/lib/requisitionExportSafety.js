export async function loadExistingRequisitionExportGroups(db, {
  masterPlanNo, selectedDate, dateFrom, dateTo,
  dailyDepartmentIds = [], weeklyDepartmentIds = [],
}) {
  const scopes = [];
  if (dailyDepartmentIds.length && selectedDate) {
    scopes.push({ grain: "daily", departments: dailyDepartmentIds, dates: { selectedDate } });
  }
  if (weeklyDepartmentIds.length && dateFrom && dateTo) {
    scopes.push({ grain: "weekly", departments: weeklyDepartmentIds, dates: { dateFrom, dateTo } });
  }
  const groups = [];
  for (const scope of scopes) {
    let query = db.from("production_requisition_group_batches")
      .select("id, document_no, export_batch_id, exported_at, metadata")
      .eq("master_plan_no", masterPlanNo)
      .eq("claim_grain", scope.grain)
      .in("metadata->>ownerDepartmentId", scope.departments);
    for (const [key, value] of Object.entries(scope.dates)) {
      query = query.eq(`metadata->>${key}`, value);
    }
    const { data, error } = await query.order("exported_at", { ascending: false });
    if (error) throw error;
    groups.push(...(data || []).map((row) => ({ ...row, claim_grain: scope.grain })));
  }
  return groups;
}

export function buildExistingDocumentNumberMap(groups, buildKey) {
  const result = new Map();
  for (const row of groups || []) {
    if (!row.document_no) continue;
    const metadata = row.metadata || {};
    if (metadata.externalHistoricalMapping === true) continue;
    const key = buildKey({
      grain: row.claim_grain,
      ownerDepartmentId: metadata.ownerDepartmentId,
      roomId: metadata.roomId || "UNASSIGNED_ROOM",
      shiftCode: metadata.shiftCode || metadata.shiftId || "UNASSIGNED_SHIFT",
      dispatchSplitMode: metadata.dispatchSplitMode,
      dispatchMaterialGroup: metadata.dispatchMaterialGroup,
      selectedDate: metadata.selectedDate,
      dateFrom: metadata.dateFrom,
      dateTo: metadata.dateTo,
      parentSku: metadata.parentSku,
      workstreamCode: metadata.workstreamCode,
      consolidateRequisitionPreviewByDate:
        metadata.consolidateRequisitionPreviewByDate === true,
    });
    if (!result.has(key)) result.set(key, row.document_no);
  }
  return result;
}
