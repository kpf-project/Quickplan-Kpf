import "server-only";

const BOM_APPROVAL_SETTING_KEY = "production_bom.require_approval";

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function isMissingSettingsTableError(error) {
  return error?.code === "42P01" || /system_settings/i.test(error?.message || "");
}

export async function getBomApprovalSettings(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("setting_key, setting_value, updated_at")
    .eq("setting_key", BOM_APPROVAL_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) {
      return {
        requireApproval: true,
        source: "default",
        updatedAt: null,
      };
    }
    throw error;
  }

  return {
    requireApproval: normalizeBoolean(data?.setting_value?.requireApproval, true),
    source: data ? "database" : "default",
    updatedAt: data?.updated_at || null,
  };
}

export async function setBomApprovalRequired(supabaseAdmin, requireApproval, actorId = null) {
  const payload = {
    setting_key: BOM_APPROVAL_SETTING_KEY,
    setting_value: { requireApproval: Boolean(requireApproval) },
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .upsert(payload, { onConflict: "setting_key" })
    .select("setting_key, setting_value, updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    requireApproval: normalizeBoolean(data?.setting_value?.requireApproval, true),
    source: "database",
    updatedAt: data?.updated_at || null,
  };
}
