import "server-only";

export const packingUnitSettingKey = code => `production_packing.units.${code}`;

export async function readPackingUnitSetting(db, code) {
  const { data, error } = await db.from("system_settings").select("setting_value").eq("setting_key", packingUnitSettingKey(code)).maybeSingle();
  if (error) throw error;
  return data?.setting_value || null;
}
