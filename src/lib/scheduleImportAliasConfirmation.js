import { createHash } from "node:crypto";

export function importAliasConfirmationKey(deptId, alias) {
  const identity = [deptId, alias.section_def_id, alias.product_column_key, alias.source_signature, alias.sku_code, alias.formula_code];
  return `production_schedule.confirmed_alias.${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

export async function confirmedImportAliases(db, deptId, aliases) {
  if (!aliases.length) return [];
  const confirmed = new Set();
  for (let start = 0; start < aliases.length; start += 100) {
    const keys = aliases.slice(start, start + 100).map(alias => importAliasConfirmationKey(deptId, alias));
    const { data, error } = await db.from("system_settings").select("setting_key")
      .in("setting_key", keys);
    if (error) throw error;
    (data ?? []).forEach(row => confirmed.add(row.setting_key));
  }
  return aliases.filter(alias => confirmed.has(importAliasConfirmationKey(deptId, alias)));
}
