import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listHrDepartments } from "@/features/hr/services/hrDepartmentsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listHrDepartments(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
