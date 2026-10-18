export const scheduleScopeKey = (sectionId) => `production_schedule.import_scope.${sectionId}`;

export function isProductInImportScope(product, categoryIds) {
  return Array.isArray(categoryIds) && categoryIds.length > 0
    && Boolean(product?.subcategoryId) && categoryIds.includes(product.subcategoryId);
}

export async function loadScheduleImportScopes(db, sectionIds) {
  const scopes = new Map(sectionIds.map(id => [id, []]));
  if (!sectionIds.length) return scopes;
  const { data, error } = await db.from("system_settings")
    .select("setting_key,setting_value").in("setting_key", sectionIds.map(scheduleScopeKey));
  if (error) throw error;
  for (const id of sectionIds) {
    const value = data?.find(row => row.setting_key === scheduleScopeKey(id))?.setting_value;
    scopes.set(id, Array.isArray(value?.subcategoryIds) ? value.subcategoryIds : []);
  }
  return scopes;
}
