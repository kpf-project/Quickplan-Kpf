import { PRODUCTION_TASK_PERMISSIONS } from "./productionTaskPermissions.js";
import { DATA_TASK_PERMISSIONS } from "./dataTaskPermissions.js";

export const TASK_PERMISSIONS = Object.freeze({
  ...PRODUCTION_TASK_PERMISSIONS,
  ...DATA_TASK_PERMISSIONS,
  "production-cost-view": {
    label: "เปิดดูต้นทุนการผลิต",
    legacyKeys: ["production-line-attendance-view"],
  },
  "production-cost-write": {
    label: "บันทึกและแก้ไขต้นทุนการผลิต",
    legacyKeys: ["production-line-attendance-view"],
  },
});

export function taskPermissionKeys(key, enabled = false) {
  const permission = TASK_PERMISSIONS[key];
  if (!permission) throw new Error("Unknown task permission: " + key);
  return enabled ? [key] : [...permission.legacyKeys];
}
