import { jsonError } from "@/lib/adminApi";
import {
  listPermissions,
  createPermission,
} from "@/features/admin/services/permissionsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await listPermissions(request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    return await createPermission(request);
  } catch (error) {
    return jsonError(error);
  }
}
