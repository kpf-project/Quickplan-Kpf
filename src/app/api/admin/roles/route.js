import { jsonError } from "@/lib/adminApi";
import { listRoles, createRole } from "@/features/admin/services/rolesService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await listRoles(request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    return await createRole(request);
  } catch (error) {
    return jsonError(error);
  }
}
