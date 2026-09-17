import { jsonError } from "@/lib/adminApi";
import { handlePermissions } from "@/features/auth/services/permissionsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await handlePermissions(request);
  } catch (error) {
    return jsonError(error);
  }
}
